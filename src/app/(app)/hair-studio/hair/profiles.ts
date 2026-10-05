/**
 * WHAT MAKES A BOB A BOB.
 *
 * A haircut is a function from "where on the head does this hair grow" to "how
 * long is it left". That is the whole of it, and it is why twenty generators
 * cover a salon's menu rather than twenty thousand baked meshes: everything
 * else a customer changes — texture, colour, volume, density — is applied on
 * top of the same silhouette.
 *
 * Each profile is given:
 *   phi    azimuth of the root. 0 faces the mirror, +-PI is the back of the
 *          head, +PI/2 is the model's left.
 *   t      0 at the crown, 1 at the hairline.
 * and returns a multiplier on the design's overall length.
 *
 * `push` is the second half of a cut: where the hair is combed. A pompadour and
 * a slick back are nearly the same lengths and completely different haircuts.
 *
 * The men's profiles return far smaller numbers than the women's, and that is
 * the point rather than an inconsistency: a mid fade leaves three or four
 * centimetres on top. The first pass returned about 1.0 for them, which drew a
 * fade with a foot of hair on top that fell over the faded sides and hid them —
 * a comb-over, rendered convincingly.
 */

export interface Profile {
  /** Multiplier on the global length, by root position. */
  lengthAt: (phi: number, t: number) => number;
  /** A world-space comb direction blended into the strand's growth. */
  push?: { x: number; y: number; z: number; strength: number };
  /** How hard the hair is pressed against the skull. 1 is flat, 0 is loose. */
  cling?: number;
  /**
   * A fade on this cut is a hard step rather than a gradient — the point of an
   * undercut is that you can see the join.
   */
  disconnected?: boolean;
  /** Fraction of ends left blunt rather than tapered. */
  blunt?: number;
}

/** How much of the head faces the mirror: 1 at the front, 0 at the back. */
const frontness = (phi: number) => (Math.cos(phi) + 1) / 2;

/** 1 at the sides, 0 front and back. Used by anything that is "short at the sides". */
const sideness = (phi: number) => Math.abs(Math.sin(phi));

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export const PROFILES: Record<string, Profile> = {
  /*
   * One length all the way round, a shade longer at the front so the line falls
   * forward. That forward tilt is the difference between a bob and a bowl.
   */
  bob: {
    lengthAt: (phi, t) => 0.9 + 0.16 * frontness(phi) + 0.1 * t,
    blunt: 0.85,
    cling: 0.45,
  },

  lob: {
    lengthAt: (phi, t) => 0.95 + 0.12 * frontness(phi) + 0.12 * t,
    blunt: 0.7,
    cling: 0.4,
  },

  /*
   * Short everywhere, shortest at the nape and the sides, with length kept on
   * top to style forward.
   */
  pixie: {
    lengthAt: (phi, t) => 0.3 + 0.75 * (1 - t) * (0.5 + 0.5 * frontness(phi)),
    push: { x: 0, y: 0.25, z: 0.6, strength: 0.45 },
    cling: 0.7,
  },

  /*
   * THE BUTTERFLY. Two lengths in one cut: long underneath, short face-framing
   * layers at the front that flick back. A single length function cannot say
   * that, so the short wing is the front half near the hairline and the long
   * fall is everything else.
   */
  butterfly_cut: {
    lengthAt: (phi, t) => {
      const wing = frontness(phi) * clamp01((t - 0.35) / 0.5);
      return 1 - 0.55 * wing + 0.1 * (1 - t);
    },
    cling: 0.25,
  },

  /*
   * Classic layering: the nearer the crown, the shorter, so the lengths stack.
   */
  layered_cut: {
    lengthAt: (_phi, t) => 0.55 + 0.45 * t,
    cling: 0.3,
  },

  /* Short and shaggy on top, long and loose below. The layering is deliberate
     and visible rather than blended. */
  wolf_cut: {
    lengthAt: (phi, t) => (t < 0.45 ? 0.3 + 0.2 * t : 0.55 + 0.5 * t) + 0.05 * frontness(phi),
    cling: 0.2,
  },

  shag: {
    lengthAt: (phi, t) => 0.45 + 0.5 * t + 0.1 * frontness(phi),
    cling: 0.25,
  },

  /* One line, no interruption. The blunt edge is the whole point. */
  blunt_cut: {
    lengthAt: () => 1,
    blunt: 1,
    cling: 0.5,
  },

  long_loose: {
    lengthAt: (_phi, t) => 0.92 + 0.08 * t,
    blunt: 0.4,
    cling: 0.3,
  },

  // ----------------------------------------------------------------- men ---

  /*
   * Length on top, nothing at the sides. The fade control decides where the
   * line sits; this profile is what is left above it.
   */
  fade: {
    lengthAt: (phi, t) => (1 - t) * 0.3 * (1 - 0.35 * sideness(phi)) + 0.025,
    push: { x: 0, y: 0.4, z: 0.3, strength: 0.4 },
    cling: 0.65,
  },

  taper: {
    lengthAt: (phi, t) => (1 - 0.75 * t) * 0.28 * (1 - 0.2 * sideness(phi)) + 0.035,
    push: { x: 0, y: 0.25, z: 0.2, strength: 0.3 },
    cling: 0.7,
  },

  buzz_cut: {
    lengthAt: () => 0.06,
    cling: 0.95,
    blunt: 1,
  },

  crew_cut: {
    lengthAt: (phi, t) => 0.08 + 0.17 * (1 - t) * (0.6 + 0.4 * frontness(phi)),
    push: { x: 0, y: 0.5, z: 0.15, strength: 0.35 },
    cling: 0.8,
  },

  /* Short, with the top worn forward onto the forehead. */
  crop: {
    lengthAt: (phi, t) => 0.1 + 0.18 * (1 - t) + 0.09 * frontness(phi) * clamp01((t - 0.5) / 0.5),
    push: { x: 0, y: -0.1, z: 0.85, strength: 0.55 },
    cling: 0.6,
  },

  /* Swept up and back off the forehead, with the height at the front. */
  quiff: {
    lengthAt: (phi, t) => 0.08 + 0.3 * (1 - t) * (0.5 + 0.6 * frontness(phi)),
    push: { x: 0, y: 0.85, z: 0.35, strength: 0.7 },
    cling: 0.35,
  },

  /* The same sweep as a quiff, taken further and rolled back. */
  pompadour: {
    lengthAt: (phi, t) => 0.07 + 0.34 * (1 - t) * (0.45 + 0.75 * frontness(phi)),
    push: { x: 0, y: 1, z: -0.1, strength: 0.85 },
    cling: 0.25,
  },

  slick_back: {
    lengthAt: (_phi, t) => 0.1 + 0.22 * (1 - t),
    push: { x: 0, y: 0.1, z: -1, strength: 0.8 },
    cling: 0.85,
  },

  /* Long on top, short at the sides, and no blend between them. */
  undercut: {
    lengthAt: (phi, t) => (1 - t) * 0.34 * (1 - 0.25 * sideness(phi)) + 0.02,
    push: { x: 0, y: 0.2, z: -0.45, strength: 0.4 },
    cling: 0.5,
    disconnected: true,
  },

  side_part: {
    lengthAt: (phi, t) => 0.1 + 0.22 * (1 - t) * (0.7 + 0.3 * frontness(phi)),
    push: { x: 0, y: 0.1, z: -0.35, strength: 0.4 },
    cling: 0.75,
  },
};

/** Anything unrecognised falls back to loose hair rather than to nothing. */
export const FALLBACK_PROFILE: Profile = PROFILES.long_loose!;

export function profileFor(kind: string): Profile {
  return PROFILES[kind] ?? FALLBACK_PROFILE;
}
