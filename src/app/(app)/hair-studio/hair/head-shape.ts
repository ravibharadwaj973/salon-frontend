import type { FaceShape } from '../../hairstyles/types';

/**
 * THE SKULL, AS ONE FUNCTION.
 *
 * Both the head mesh and the hair roots are built from this, which is the only
 * reason they agree. Two separate descriptions of the same skull drift by a
 * millimetre and the hair grows out of thin air above the ear.
 *
 * Deliberately a mannequin, not a person. A featureless head is honest about
 * what this is — a salon's styling head — and it sidesteps the uncanny valley a
 * half-modelled face falls straight into. The nose is the one feature kept,
 * because without it nobody can tell the front of a bald head from the back.
 *
 * Model space: +Y up, +Z towards the mirror, one unit from centre to crown.
 */

interface Shape {
  /** Half-width at the temples. */
  width: number;
  /** Front-to-back depth. */
  depth: number;
  /** Crown height. */
  height: number;
  /** How much the face narrows below the ears. 0 is a slab, 1 is a point. */
  jaw: number;
  /** Extra width at the cheekbones. */
  cheek: number;
}

const SHAPES: Record<FaceShape, Shape> = {
  OVAL: { width: 0.76, depth: 0.93, height: 1, jaw: 0.3, cheek: 0 },
  ROUND: { width: 0.82, depth: 0.9, height: 0.94, jaw: 0.14, cheek: 0.03 },
  SQUARE: { width: 0.8, depth: 0.92, height: 0.97, jaw: 0.06, cheek: 0 },
  OBLONG: { width: 0.71, depth: 0.93, height: 1.12, jaw: 0.26, cheek: 0 },
  HEART: { width: 0.79, depth: 0.93, height: 1.01, jaw: 0.52, cheek: 0 },
  DIAMOND: { width: 0.72, depth: 0.93, height: 1.03, jaw: 0.46, cheek: 0.07 },
};

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * How far the skull reaches in a given direction.
 *
 * `dir` must be a unit vector. Returns the radius along it, so the surface
 * point is dir * headRadius(dir).
 */
export function headRadius(x: number, y: number, z: number, face: FaceShape = 'OVAL'): number {
  const shape = SHAPES[face] ?? SHAPES.OVAL;

  // Below the ears the face narrows to the chin; above them it does not. The
  // taper is eased rather than squared, because squared drew a wedge.
  const below = clamp01(-y / 0.95);
  // Capped: let the taper run all the way and the jaw closes to a cone, which
  // is a wedge of cheese rather than a chin.
  const eased = Math.min(0.74, below * below * (3 - 2 * below));
  const width = shape.width * (1 - shape.jaw * eased) + shape.cheek * clamp01(1 - Math.abs(y + 0.1) / 0.4);
  const depth = shape.depth * (1 - 0.08 * eased);

  // The occiput: the skull is not a ball, it carries a shelf at the back.
  const occiput = 0.07 * clamp01(-z) * clamp01((y + 0.35) / 0.9);

  const ex = x / width;
  const ey = y / shape.height;
  const ez = z / (depth + occiput);
  const base = 1 / Math.sqrt(ex * ex + ey * ey + ez * ez);

  /*
   * The face is flatter than an ellipsoid, or the forehead bulges like a bulb.
   * Kept gentle: at 0.055 it dished the face into a hollow that read as a hood
   * rather than as a brow.
   */
  const facing = clamp01(z) * clamp01((y + 0.55) / 1.2);
  return base * (1 - 0.022 * facing * facing);
}

/**
 * The nose, added to the mesh only.
 *
 * Kept out of headRadius because hair must not grow on it, and because a root
 * sampler that saw a bump here would scatter strands down the bridge.
 */
export function noseBulge(x: number, y: number, z: number): number {
  if (z <= 0.45 || y > 0.12 || y < -0.42) return 0;
  // Small, and short. The first pass ran a tall wide ridge down the whole face
  // and the head came out with a muzzle.
  const alongBridge = Math.exp(-(((y + 0.14) / 0.2) ** 2));
  const acrossBridge = Math.exp(-((x / 0.062) ** 2));
  const forward = clamp01((z - 0.45) / 0.55);
  return 0.055 * acrossBridge * forward * alongBridge;
}

/**
 * Where the scalp stops: highest at the forehead, lowest at the nape.
 *
 * The curve matters more than it sounds. A linear blend put the side hairline
 * at about y = +0.05 — above the ear — which left a fade nothing to fade: the
 * sides had no hair-bearing skin to take down, so a mid fade rendered as a
 * bowl cut sitting on a bald head. Real hair runs down past the ear to the
 * sideburn, so the sides have to fall away from the front much faster than
 * halfway.
 */
export function hairlinePolar(phi: number): number {
  const frontness = (Math.cos(phi) + 1) / 2;
  return 2.05 - 1.0 * Math.pow(frontness, 1.6);
}
