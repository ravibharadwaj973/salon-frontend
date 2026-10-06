/**
 * CHANGE THE COLOUR, KEEP THE HAIR.
 *
 * ── What this replaces, and why ───────────────────────────────────────────
 *
 * The studio used to draw a mannequin: a few thousand procedural ribbons on a
 * styling head. It was honest about what it was and it answered "what shape am I
 * asking for" — but nobody has ever walked out of a salon holding a picture of a
 * mannequin, and "what will this look like" is the question customers actually
 * ask. So the object on screen is now a photograph.
 *
 * ── The economics, which decide the whole design ──────────────────────────
 *
 * The photograph costs an image-model call. Everything after it must not.
 *
 *   Five cuts × eight colours × five highlight styles × four intensities
 *   = 800 combinations.
 *
 * At roughly a penny a generation that is a bill you cannot run on a tablet in a
 * salon, with a second of waiting between every click and a slightly different
 * face each time. So the model is asked for the hair ONCE, a person cuts it out
 * of the picture once, and from then on every colour, highlight, balayage, root
 * shadow and hand-painted section is this shader: instant, free, and the same
 * person in all 800 of them.
 *
 * ── Why CIELAB ───────────────────────────────────────────────────────────
 *
 * A photograph of hair is two things at once. The PIGMENT is a colour. The
 * STRUCTURE — every strand, the shine along a curl, the shadow between two locks
 * — is luminance. Replace the pigment and keep the structure and it is the same
 * hair in a different colour; replace the pixels and it is a wig.
 *
 * In LAB those two things are separate axes: L is structure, a and b are pigment.
 * In RGB and in HSV they are smeared together, which is exactly why recoloured
 * hair in most apps looks like a flat sticker laid over a head.
 *
 * Every formula below was written in Python first and looked at — seven colours
 * and six treatments rendered over a real portrait — before being transcribed
 * here. `recolour.ts` holds the same maths in TypeScript so a test can pin it.
 */

/** Shared by the shader and the CPU reference, so the two cannot drift apart. */
export const LAB_GLSL = /* glsl */ `
const mat3 RGB_TO_XYZ = mat3(
  0.4124564, 0.2126729, 0.0193339,
  0.3575761, 0.7151522, 0.1191920,
  0.1804375, 0.0721750, 0.9503041
);
const mat3 XYZ_TO_RGB = mat3(
   3.2404542, -0.9692660,  0.0556434,
  -1.5371385,  1.8760108, -0.2040259,
  -0.4985314,  0.0415560,  1.0572252
);
const vec3 WHITE = vec3(0.95047, 1.0, 1.08883);

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float labF(float t) {
  const float d = 6.0 / 29.0;
  return t > d * d * d ? pow(t, 1.0 / 3.0) : t / (3.0 * d * d) + 4.0 / 29.0;
}
float labFinv(float t) {
  const float d = 6.0 / 29.0;
  return t > d ? t * t * t : 3.0 * d * d * (t - 4.0 / 29.0);
}
vec3 rgbToLab(vec3 rgb) {
  vec3 xyz = (RGB_TO_XYZ * srgbToLinear(rgb)) / WHITE;
  float fx = labF(xyz.x), fy = labF(xyz.y), fz = labF(xyz.z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}
vec3 labToRgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = fy + lab.y / 500.0;
  float fz = fy - lab.z / 200.0;
  vec3 xyz = vec3(labFinv(fx), labFinv(fy), labFinv(fz)) * WHITE;
  return linearToSrgb(XYZ_TO_RGB * xyz);
}
`;

export const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  // The texture's origin is bottom-left and the image's is top-left, so the V
  // axis is flipped here rather than by uploading the image upside down — which
  // would quietly put the root shadow on the ends.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** How many hand-painted sections the shader will carry. See the note below. */
export const MAX_STRIPS = 6;

export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uPhoto;
uniform sampler2D uMask;

/** Normalised hair luminance range, measured once on the CPU. See uLo/uSpan. */
uniform float uLo;
uniform float uSpan;
/** Top and bottom of the hair in the frame, for anything measured down a strand. */
uniform float uTop;
uniform float uBottom;

uniform vec3  uBase;        // target pigment, in Lab
uniform float uLift;        // 0 keep the original level, 1 go fully to the target

uniform vec3  uHighlight;   // Lab
uniform float uHighlightAmount;
uniform float uHighlightFace;   // 1 = face-framing only, 0 = all over

uniform vec3  uRoot;        // Lab
uniform float uRootDepth;

uniform vec3  uEnds;        // Lab — balayage / ombre, painted from a point down
uniform float uEndsAmount;
uniform float uEndsStart;

uniform int   uStripCount;
uniform vec2  uStripPos[${MAX_STRIPS}];
uniform vec3  uStripColor[${MAX_STRIPS}];
uniform vec3  uStripShape[${MAX_STRIPS}];  // width, softness, strength

${LAB_GLSL}

void main() {
  vec3 photo = texture2D(uPhoto, vUv).rgb;
  float m = texture2D(uMask, vUv).r;

  if (m <= 0.002) {
    gl_FragColor = vec4(photo, 1.0);
    return;
  }

  vec3 lab = rgbToLab(photo);
  float L = lab.x;

  /*
   * WHERE THIS PIXEL SITS IN THIS HAIR'S OWN RANGE.
   *
   * Measured on the hair rather than on an absolute scale, because a photograph
   * of black hair and one of blonde have nothing in common numerically — a fixed
   * curve would flatten one of them. 0 is the shadow between locks, 1 is the
   * shine along the top of a curl.
   */
  float norm = clamp((L - uLo) / max(uSpan, 0.001), 0.0, 1.0);

  // The target's level, with the original's contrast kept around it. This is
  // what makes black-to-blonde possible at all: hue alone cannot lift a level.
  float targetL = uBase.x + (norm - 0.5) * uSpan * 0.9;
  float outL = mix(L, targetL, uLift);

  /*
   * A shine on hair is light bouncing off the cuticle — it is the colour of the
   * LAMP, not of the dye. Carrying full pigment into it produces a bright
   * coloured smear exactly where a highlight belongs, which is the single most
   * common way a recoloured photograph gives itself away.
   */
  float spec = clamp((norm - 0.78) / 0.22, 0.0, 1.0);
  float chroma = 1.0 - 0.75 * spec;
  float pigment = clamp(uLift + 0.5, 0.0, 1.0);
  float outA = mix(lab.y, uBase.y * chroma, pigment);
  float outB = mix(lab.z, uBase.z * chroma, pigment);

  float rel = clamp((vUv.y - uTop) / max(uBottom - uTop, 0.001), 0.0, 1.0);

  // Balayage and ombre: painted from a point down the strand, never at the root.
  if (uEndsAmount > 0.0) {
    float k = smoothstep(uEndsStart, min(1.0, uEndsStart + 0.35), rel) * uEndsAmount;
    outL = mix(outL, uEnds.x, k * 0.9);
    outA = mix(outA, uEnds.y, k);
    outB = mix(outB, uEnds.z, k);
  }

  /*
   * HIGHLIGHTS FOLLOW THE STRANDS THAT ALREADY CATCH THE LIGHT.
   *
   * Not a shortcut — it is where a colourist puts them, and it is the reason this
   * reads as hand-painted rather than as a stripe drawn over a photograph.
   */
  if (uHighlightAmount > 0.0) {
    float pick = pow(clamp((norm - 0.45) / 0.4, 0.0, 1.0), 1.4);
    float edge = clamp((abs(vUv.x - 0.5) * 2.0 - 0.25) / 0.45, 0.0, 1.0);
    pick *= mix(1.0, edge, uHighlightFace);
    float k = pick * uHighlightAmount;
    outL = mix(outL, uHighlight.x, k * 0.85);
    outA = mix(outA, uHighlight.y, k);
    outB = mix(outB, uHighlight.z, k);
  }

  // The root shadow goes on after the lot, because that is the order in the
  // chair: it is painted over finished colour to soften the regrowth line.
  if (uRootDepth > 0.0) {
    float k = pow(clamp(1.0 - rel / max(uRootDepth, 0.001), 0.0, 1.0), 1.3);
    outL = mix(outL, uRoot.x, k * 0.9);
    outA = mix(outA, uRoot.y, k);
    outB = mix(outB, uRoot.z, k);
  }

  /*
   * HAND-PAINTED SECTIONS.
   *
   * A fixed-length loop with a uniform count, because WebGL1 will not index a
   * uniform array by a variable in every driver and will not loop on one at all.
   * Six is already more sections than anyone foils by hand.
   *
   * Each is a soft ellipse in the picture's own coordinates — wider than it is
   * tall, because a painted section runs DOWN the hair — and it is multiplied by
   * the mask like everything else, so colour cannot escape onto the face however
   * carelessly it is placed.
   */
  for (int i = 0; i < ${MAX_STRIPS}; i++) {
    if (i >= uStripCount) break;
    vec2 d = vUv - uStripPos[i];
    float w = max(uStripShape[i].x, 0.01);
    float r = length(vec2(d.x / w, d.y / (w * 2.2)));
    float k = (1.0 - smoothstep(1.0, 1.0 + max(uStripShape[i].y, 0.05), r)) * uStripShape[i].z;
    if (k > 0.0) {
      // Still only from where it was painted downwards.
      k *= smoothstep(-0.08, 0.08, vUv.y - uStripPos[i].y + 0.08);
      outL = mix(outL, uStripColor[i].x, k * 0.85);
      outA = mix(outA, uStripColor[i].y, k);
      outB = mix(outB, uStripColor[i].z, k);
    }
  }

  vec3 result = labToRgb(vec3(outL, outA, outB));
  gl_FragColor = vec4(mix(photo, result, m), 1.0);
}
`;
