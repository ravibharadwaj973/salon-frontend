/**
 * THE SAME MATHS AS THE SHADER, ON THE CPU.
 *
 * Not a second implementation for its own sake. GLSL has no test harness that is
 * worth the trouble — a wrong constant in a fragment shader shows up as a picture
 * that is slightly the wrong colour, which nobody notices until a salon prints
 * one — so the formulas live here as well, where a test can pin them to values
 * computed independently.
 *
 * It also earns its keep at runtime: the renderer has to measure the hair's own
 * luminance range before the shader can normalise against it, and that is a pass
 * over the pixels that has to happen somewhere.
 */

export type Lab = [number, number, number];
export type RGB = [number, number, number];

// sRGB ↔ CIELAB. Written out rather than pulled from a library: it is twenty
// lines, it has to match the shader character for character, and a dependency
// that disagreed with the GPU by a rounding step would be invisible.
const RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
const WHITE: RGB = [0.95047, 1.0, 1.08883];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};

const D = 6 / 29;
const labF = (t: number) => (t > D * D * D ? Math.cbrt(t) : t / (3 * D * D) + 4 / 29);
const labFinv = (t: number) => (t > D ? t * t * t : 3 * D * D * (t - 4 / 29));

export function rgbToLab(rgb: RGB): Lab {
  const lin = rgb.map(srgbToLinear) as RGB;
  const xyz = RGB_TO_XYZ.map((row, i) => (row[0]! * lin[0] + row[1]! * lin[1] + row[2]! * lin[2]) / WHITE[i]!);
  const [fx, fy, fz] = xyz.map(labF) as RGB;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(lab: Lab): RGB {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;
  const xyz = [labFinv(fx), labFinv(fy), labFinv(fz)].map((v, i) => v * WHITE[i]!);
  return XYZ_TO_RGB.map((row) => linearToSrgb(row[0]! * xyz[0]! + row[1]! * xyz[1]! + row[2]! * xyz[2]!)) as RGB;
}

/** A hex colour as the shader wants it. Invalid input is black, never NaN. */
export function hexToLab(hex: string): Lab {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];
  const int = Number.parseInt(clean, 16);
  return rgbToLab([((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]);
}

export interface HairRange {
  /** The 4th percentile of hair luminance — the shadow between the locks. */
  lo: number;
  /** The span up to the 96th, which the shader normalises against. */
  span: number;
  /** Where the hair starts and ends down the frame, 0-1, for root and ends. */
  top: number;
  bottom: number;
  /** How much of the picture is hair. Zero means the mask is unusable. */
  coverage: number;
}

/**
 * MEASURE THE HAIR BEFORE RECOLOURING IT.
 *
 * Everything the shader does is relative to this hair rather than to an absolute
 * scale, because a photograph of black hair and one of blonde have nothing in
 * common numerically — the same curve flatters one and destroys the other. The
 * percentiles rather than min and max, because one blown-out pixel of scalp
 * shine would otherwise set the top of the range and wash out everything below.
 *
 * Runs once when a style is opened, not on every slider move.
 */
export function measureHair(
  pixels: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): HairRange {
  const lums: number[] = [];
  let top = 1;
  let bottom = 0;
  let inside = 0;

  /*
   * A STRIDE THAT SCALES, rather than a fixed one.
   *
   * Sampling every fourth pixel pins a percentile far more tightly than it needs
   * to be on a megapixel portrait, and the full pass was the one thing here slow
   * enough to be felt when flicking between styles. But a fixed stride of four
   * takes a small picture below the sample floor and silently falls back to a
   * default range — caught by a test on a tiny fixture, and it would have shown
   * up in production as a thumbnail that recoloured differently from the picture
   * it was a thumbnail of.
   *
   * So the stride targets roughly 256 samples across, whatever the size.
   */
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 256));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      if (mask[i]! < 128) continue;
      inside += 1;
      const r = pixels[i]! / 255;
      const g = pixels[i + 1]! / 255;
      const b = pixels[i + 2]! / 255;
      lums.push(rgbToLab([r, g, b])[0]);
      const v = y / height;
      if (v < top) top = v;
      if (v > bottom) bottom = v;
    }
  }

  if (lums.length < 16) return { lo: 0, span: 100, top: 0, bottom: 1, coverage: 0 };

  lums.sort((a, b) => a - b);
  const at = (p: number) => lums[Math.min(lums.length - 1, Math.floor(p * lums.length))]!;
  const lo = at(0.04);
  const hi = at(0.96);

  return {
    lo,
    span: Math.max(hi - lo, 1),
    top,
    bottom: Math.max(bottom, top + 0.01),
    coverage: inside / Math.max(1, Math.ceil(width / stride) * Math.ceil(height / stride)),
  };
}

export interface RecolourInput {
  base: Lab;
  lift: number;
  /** -1 fine, 0 as photographed, 1 thick. See the note in recolourPixel. */
  density?: number;
  /** -1 matte, 0 as photographed, 1 glossy. */
  shine?: number;
  /** 0 ashy, 1 as chosen, 2 vivid. */
  intensity?: number;
  highlight?: Lab;
  highlightAmount?: number;
  /** 1 = face-framing only, 0 = all over. */
  highlightFace?: number;
  root?: Lab;
  rootDepth?: number;
  ends?: Lab;
  endsAmount?: number;
  endsStart?: number;
}

/**
 * One pixel, exactly as the shader does it.
 *
 * `norm` is where this pixel sits in the hair's own luminance range and `rel` is
 * how far down the hair it is — both computed by the caller, both matching the
 * shader's uniforms. Kept in step with FRAGMENT_SHADER by the tests, which is
 * the only thing that keeps two copies of a formula honest.
 */
export function recolourPixel(lab: Lab, norm: number, rel: number, span: number, input: RecolourInput): Lab {
  const { base, lift } = input;

  const targetL = base[0] + (norm - 0.5) * span * 0.9;
  let outL = lab[0] + (targetL - lab[0]) * lift;

  const spec = Math.min(1, Math.max(0, (norm - 0.78) / 0.22));
  const chroma = 1 - 0.75 * spec;
  const pigment = Math.min(1, Math.max(0, lift + 0.5));
  let outA = lab[1] + (base[1] * chroma - lab[1]) * pigment;
  let outB = lab[2] + (base[2] * chroma - lab[2]) * pigment;

  const smoothstep = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1)));
    return t * t * (3 - 2 * t);
  };

  if (input.ends && (input.endsAmount ?? 0) > 0) {
    const start = input.endsStart ?? 0.5;
    const k = smoothstep(start, Math.min(1, start + 0.35), rel) * input.endsAmount!;
    outL += (input.ends[0] - outL) * k * 0.9;
    outA += (input.ends[1] - outA) * k;
    outB += (input.ends[2] - outB) * k;
  }

  if (input.highlight && (input.highlightAmount ?? 0) > 0) {
    const pick = Math.min(1, Math.max(0, (norm - 0.45) / 0.4)) ** 1.4;
    const k = pick * input.highlightAmount!;
    outL += (input.highlight[0] - outL) * k * 0.85;
    outA += (input.highlight[1] - outA) * k;
    outB += (input.highlight[2] - outB) * k;
  }

  if (input.root && (input.rootDepth ?? 0) > 0) {
    const k = Math.min(1, Math.max(0, 1 - rel / Math.max(input.rootDepth!, 0.001))) ** 1.3;
    outL += (input.root[0] - outL) * k * 0.9;
    outA += (input.root[1] - outA) * k;
    outB += (input.root[2] - outB) * k;
  }

  /**
   * THE THREE THAT APPLY TO ANY HAIRSTYLE.
   *
   * None of them knows which haircut it is looking at, because none of them is a
   * property of a cut — they are properties of hair. That is the whole reason
   * they belong in the shader and not in the catalogue: a salon adding its
   * thirty-fourth style gets them for nothing.
   *
   * DENSITY is honest about what it is. A photograph holds no information for a
   * strand that was never shot, so nothing here adds hair. What makes hair look
   * thin is seeing THROUGH it, so the control deepens the shadows between the
   * locks — which reads as thickness far more strongly than anything done to the
   * strands — and the renderer grows the silhouette to match.
   *
   * SHINE is a narrow band at the top of the range. Narrow on purpose: widening
   * it makes hair look wet rather than healthy, which is a different hairstyle.
   *
   * INTENSITY is the ash-to-warm axis, and it is one multiply around the neutral
   * axis of Lab — which is exactly what "ashy" means and why doing this in RGB
   * would have needed a lookup table.
   */
  const density = input.density ?? 0;
  if (density !== 0) {
    const gap = Math.min(1, Math.max(0, 1 - norm / 0.5)) ** 1.5;
    outL -= gap * density * 14;
  }

  const shine = input.shine ?? 0;
  if (shine !== 0) {
    const band = Math.min(1, Math.max(0, (norm - 0.6) / 0.4)) ** 1.6;
    outL += band * shine * 20;
  }

  const intensity = input.intensity ?? 1;
  if (intensity !== 1) {
    outA *= intensity;
    outB *= intensity;
  }

  return [outL, outA, outB];
}
