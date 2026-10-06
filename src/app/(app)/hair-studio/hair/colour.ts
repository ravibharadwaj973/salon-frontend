import { STRIP_MAX_HALF_ANGLE, type DesignSpec, type Intensity } from './spec';

export type RGB = [number, number, number];

/**
 * WHERE THE COLOUR GOES.
 *
 * A colourist works in two directions at once: along the strand (root to tip —
 * ombre, balayage, a root shadow) and across the head (which strands get
 * touched at all — highlights, a money piece). This file is both, and it is
 * separate from the geometry because colour and cut are separate decisions in
 * the chair too.
 *
 * Everything here returns LINEAR values. Hex is sRGB, the renderer's vertex
 * colours are linear, and converting in the wrong place is how a dark brown
 * arrives on screen as milky beige.
 */

export function hexToLinear(hex: string): RGB {
  const clean = hex.replace('#', '');
  const int = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const srgb: RGB = [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  return srgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as RGB;
}

const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** How many strands a treatment touches, and how hard. */
const SHARE: Record<Intensity, number> = { SUBTLE: 0.12, MEDIUM: 0.26, STRONG: 0.46 };
const WEIGHT: Record<Intensity, number> = { SUBTLE: 0.55, MEDIUM: 0.78, STRONG: 1 };

/** Where along the strand painted colour starts. */
const PLACEMENT_START: Record<string, number> = { FULL: 0.05, MID: 0.35, ENDS: 0.62 };

export interface StrandIdentity {
  /** Independent per-strand randoms, so two treatments do not pick the same locks. */
  rHighlight: number;
  rLowlight: number;
  rBalayage: number;
  /** 1 at the front of the head, 0 at the back. */
  frontness: number;
  /**
   * Where this strand grows, as an azimuth. Needed only by hand-placed strips —
   * every other treatment here picks its locks at random or by frontness, and a
   * strip is the one that was pointed at.
   */
  phi: number;
}

/**
 * THE SHORTEST WAY ROUND THE HEAD.
 *
 * Azimuth wraps, so a section centred just past the back of the head at +3.10
 * radians has to reach strands at -3.10 — which are eleven degrees away, not
 * three hundred and fifty. Subtracting naively puts a hard seam down the back of
 * every strip that crosses it, and the seam only appears when somebody paints the
 * back of the head, which is the last place anybody looks.
 *
 * Exported for the test, because that is a bug nobody finds by eye.
 */
export function angleGap(a: number, b: number): number {
  const TAU = Math.PI * 2;
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

/**
 * Build the painter once per design, then call it per vertex.
 *
 * A closure rather than a big switch per vertex: the enabled/disabled decisions
 * and the hex parsing happen once, and the inner loop does arithmetic only.
 */
export function makePainter(spec: DesignSpec): (strand: StrandIdentity, s: number) => RGB {
  const config = spec.config;
  const base = hexToLinear(spec.baseColor);

  const ombre = config.ombre?.enabled
    ? {
        root: hexToLinear(config.ombre.rootColor),
        mid: config.ombre.midColor ? hexToLinear(config.ombre.midColor) : null,
        end: hexToLinear(config.ombre.endColor),
      }
    : null;

  const balayage = config.balayage?.enabled
    ? {
        color: hexToLinear(config.balayage.color),
        share: SHARE[config.balayage.intensity],
        weight: WEIGHT[config.balayage.intensity],
        start: PLACEMENT_START[config.balayage.placement] ?? 0.62,
      }
    : null;

  const highlights = config.highlights?.enabled
    ? {
        color: hexToLinear(config.highlights.color),
        share: SHARE[config.highlights.intensity],
        weight: WEIGHT[config.highlights.intensity],
      }
    : null;

  const lowlights = config.lowlights?.enabled
    ? {
        color: hexToLinear(config.lowlights.color),
        share: SHARE[config.lowlights.intensity],
        weight: WEIGHT[config.lowlights.intensity],
      }
    : null;

  const moneyPiece = config.moneyPiece?.enabled ? hexToLinear(config.moneyPiece.color) : null;
  const faceFraming = config.faceFraming?.enabled ? hexToLinear(config.faceFraming.color) : null;

  /*
   * Parsed once, like everything else here. A head of three thousand strands
   * times fifteen segments is forty-five thousand calls to the inner function,
   * and re-reading a hex string in there would be the slowest line in the engine.
   */
  const strips = (config.strips ?? []).map((strip) => ({
    color: hexToLinear(strip.color),
    phi: strip.phi,
    start: clamp01(strip.start),
    half: Math.max(0.02, (strip.width / 100) * STRIP_MAX_HALF_ANGLE),
    weight: clamp01(strip.brightness / 100),
    // A blend of zero is still softened a little: a colour change with a
    // perfectly hard edge down the side of a head reads as a printing error
    // rather than as hair, and no colourist can produce one anyway.
    soft: 0.15 + (strip.blend / 100) * 0.85,
  }));

  const rootShadow = config.rootShadow?.enabled
    ? {
        color: hexToLinear(config.rootShadow.color),
        depth: config.rootShadow.depth / 100,
        blend: config.rootShadow.blend / 100,
      }
    : null;

  return (strand, s) => {
    let colour: RGB = base;

    // Along the strand first: a gradient is the colour the hair IS.
    if (ombre) {
      colour = ombre.mid
        ? s < 0.5
          ? mix(ombre.root, ombre.mid, smoothstep(0.1, 0.5, s))
          : mix(ombre.mid, ombre.end, smoothstep(0.5, 0.95, s))
        : mix(ombre.root, ombre.end, smoothstep(0.25, 0.95, s));
    }

    // Then which locks were lifted. Painted from a point down, never at the root.
    if (balayage && strand.rBalayage < balayage.share) {
      colour = mix(colour, balayage.color, balayage.weight * smoothstep(balayage.start, 1, s));
    }
    if (highlights && strand.rHighlight < highlights.share) {
      // Woven through the whole length, but still lighter towards the ends,
      // because that is where the lightener sits longest.
      colour = mix(colour, highlights.color, highlights.weight * (0.55 + 0.45 * s));
    }
    if (lowlights && strand.rLowlight < lowlights.share) {
      colour = mix(colour, lowlights.color, lowlights.weight * 0.8);
    }

    // Then the pieces that are defined by WHERE they are rather than by chance.
    if (faceFraming && strand.frontness > 0.72) {
      colour = mix(colour, faceFraming, smoothstep(0.72, 0.95, strand.frontness) * 0.85);
    }
    if (moneyPiece && strand.frontness > 0.88) {
      colour = mix(colour, moneyPiece, smoothstep(0.88, 0.98, strand.frontness));
    }

    /*
     * HAND-PLACED SECTIONS GO ON AFTER THE TREATMENTS AND BEFORE THE ROOT SHADOW.
     *
     * After, because somebody who picks out a section by hand is painting over
     * whatever the base and the highlights did — that is what the gesture means.
     * Before the root shadow, for the same reason the highlights are: a shadow is
     * painted over finished colour to soften the regrowth line, and a strip that
     * lifted the very root would be the thing it exists to prevent.
     */
    for (const strip of strips) {
      const gap = angleGap(strand.phi, strip.phi);
      // Across the head: full strength in the core, fading over the soft edge.
      const across = 1 - smoothstep(strip.half, strip.half * (1 + strip.soft), gap);
      if (across <= 0) continue;
      // Along the strand: nothing above where it was painted, full below.
      const along = smoothstep(strip.start, Math.min(1, strip.start + 0.18), s);
      colour = mix(colour, strip.color, strip.weight * across * along);
    }

    /*
     * The root shadow goes on last because that is the order in the chair: it
     * is painted over finished colour to soften the regrowth line. Applying it
     * before the highlights would let a highlight lift the very root, which is
     * the thing a root shadow exists to prevent.
     */
    if (rootShadow) {
      const reach = Math.max(0.02, rootShadow.depth);
      const soft = reach * (0.25 + rootShadow.blend);
      colour = mix(colour, rootShadow.color, 1 - smoothstep(reach - soft, reach + soft, s));
    }

    return colour;
  };
}
