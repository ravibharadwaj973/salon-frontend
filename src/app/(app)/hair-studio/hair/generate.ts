import type { FaceShape } from '../catalogue-types';
import { makePainter, type StrandIdentity } from './colour';
import { headRadius, hairlinePolar } from './head-shape';
import { profileFor } from './profiles';
import {
  DENSITY_STRANDS,
  LENGTH_UNITS,
  MAX_STRANDS,
  SEGMENTS,
  type Bangs,
  type DesignSpec,
  type Layers,
  type Parting,
} from './spec';

/**
 * HAIR, GROWN RATHER THAN LOADED.
 *
 * Each strand is a card: a thin ribbon lofted along a curve that starts at the
 * scalp, is combed by the cut, and then falls. Every parameter a customer
 * touches changes the curve, so a texture and a length and a fade are one mesh
 * built in about fifteen milliseconds rather than one of thousands of files
 * somebody has to sculpt.
 *
 * Pure arithmetic on purpose: no three.js in here, so the shape of a haircut
 * can be asserted in a test without a browser.
 */

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smoothstep = (e0: number, e1: number, x: number) => {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Deterministic noise from an integer, so a strand looks the same every frame. */
function hash(n: number, salt: number): number {
  let x = Math.imul(n ^ salt, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

export interface Root {
  /** Unit direction from the head's centre. */
  x: number;
  y: number;
  z: number;
  /** Azimuth; 0 faces the mirror. */
  phi: number;
  /** 0 at the crown, 1 at the hairline. */
  t: number;
  frontness: number;
  r0: number;
  r1: number;
  r2: number;
  r3: number;
}

/**
 * WHY THE ROOTS ARE SAMPLED ONCE, SHUFFLED, AND THEN SLICED.
 *
 * A density is a prefix of this pool, so the prefix has to cover the whole
 * scalp on its own. A Fibonacci spiral spreads points evenly but walks the
 * sphere from pole to pole, so taking the first N of one gives a cap of hair on
 * the crown and a bald back — which is exactly what the first version of this
 * did, and what the test for a fade caught.
 *
 * So: lay out the full spiral, keep the scalp, then put it in a deterministic
 * shuffled order. Any prefix is now a uniform sample of the whole head, and
 * raising the density fills in between the strands already there rather than
 * reshuffling the lot. A density slider that re-randomises every strand reads
 * as static rather than as thicker hair.
 */
let ROOT_POOL: Root[] | null = null;

export function rootPool(): Root[] {
  if (ROOT_POOL) return ROOT_POOL;

  const scalp: Root[] = [];
  // Over-sampled because only the scalp survives the filter.
  const candidates = MAX_STRANDS * 3;

  for (let i = 0; i < candidates; i += 1) {
    const y = 1 - (i / (candidates - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = GOLDEN * i;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const phi = Math.atan2(x, z);
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const max = hairlinePolar(phi);
    if (theta > max) continue;

    scalp.push({
      x,
      y,
      z,
      phi,
      t: clamp01(theta / max),
      frontness: (Math.cos(phi) + 1) / 2,
      r0: hash(i, 0x9e37),
      r1: hash(i, 0x85eb),
      r2: hash(i, 0xc2b2),
      r3: hash(i, 0x27d4),
    });
  }

  // Sorted by a hash rather than shuffled in place: a sort is stable across
  // engines, and `Math.random` would give a different head on every reload.
  scalp.sort((a, b) => a.r0 - b.r0);

  ROOT_POOL = scalp.slice(0, MAX_STRANDS);
  return ROOT_POOL;
}

const LAYER_AMOUNT: Record<Layers, number> = { NONE: 0, LIGHT: 0.18, MEDIUM: 0.33, HEAVY: 0.5 };

/** Where the fade reaches, in head radii above centre, and how soft the join is. */
const FADE_LINE: Record<string, number> = { LOW: -0.34, MID: -0.08, HIGH: 0.16 };

/**
 * Coily hair at the same cut length hangs far shorter than straight hair does.
 * Ignoring this is the single most recognisable way a hair renderer looks wrong
 * to anybody with textured hair.
 */
const SHRINK: Record<string, number> = { STRAIGHT: 1, WAVY: 0.93, CURLY: 0.8, COILY: 0.62 };

const WAVE: Record<string, { amp: number; freq: number }> = {
  // Not zero: perfectly straight hair reads as drawn plastic.
  STRAIGHT: { amp: 0.005, freq: 1.5 },
  WAVY: { amp: 0.032, freq: 4 },
  CURLY: { amp: 0.045, freq: 9 },
  COILY: { amp: 0.034, freq: 18 },
};

/*
 * Lengths measured to where the fringe lands on the face: a straight fringe
 * stops at the eyebrow, not at the nose. The first pass cut every one of these
 * about 40% too long, which only showed up once the head was on screen.
 */
const BANGS: Record<Bangs, { reach: number; length: number; spread: number } | null> = {
  NONE: null,
  CURTAIN: { reach: 0.8, length: 0.56, spread: 0.55 },
  STRAIGHT: { reach: 0.86, length: 0.34, spread: 0 },
  SIDE: { reach: 0.8, length: 0.44, spread: -0.7 },
  WISPY: { reach: 0.86, length: 0.33, spread: 0.15 },
  MICRO: { reach: 0.89, length: 0.21, spread: 0 },
};

/** Where the part sits, as an x offset. */
const PART_X: Record<Parting, number | null> = {
  CENTER: 0,
  LEFT: -0.3,
  RIGHT: 0.3,
  DEEP_SIDE: 0.5,
  // No part: hair falls radially away from the crown, which is what it does
  // when nobody has combed it.
  NATURAL: null,
};

export interface HairGeometry {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /**
   * WHICH WAY THE STRAND RUNS, per vertex (xyz + handedness).
   *
   * This is what turns hair from felt into hair. A specular highlight on hair
   * is ANISOTROPIC: it stretches into a band running across the strands rather
   * than pooling into a round dot, because each strand is a cylinder and
   * reflects along its length. The renderer cannot work that out from position
   * and normal alone -- it has to be told the strand direction, and this is it.
   */
  tangents: Float32Array;
  indices: Uint32Array;
  strandCount: number;
  vertexCount: number;
}

export interface GenerateOptions {
  face?: FaceShape;
  /** Lets a style's capabilities switch controls off without editing the spec. */
  allowFade?: boolean;
  allowBangs?: boolean;
  allowLayers?: boolean;
  allowParting?: boolean;
}

/** Length of one strand, before texture shrink. This is the haircut itself. */
export function strandLength(spec: DesignSpec, root: Root, options: GenerateOptions = {}): number {
  const profile = profileFor(spec.kind);
  const config = spec.config;
  const base = LENGTH_UNITS[spec.length];

  const bangSpec = options.allowBangs === false ? null : BANGS[config.bangs];
  const isBang = Boolean(bangSpec) && root.frontness > bangSpec!.reach && root.t > 0.68;
  if (bangSpec && isBang) {
    // A fringe is cut to the face, not to the body of the hair, so it ignores
    // both the profile and the length slider.
    const wisp = config.bangs === 'WISPY' ? 0.65 + 0.5 * root.r2 : 1;
    return bangSpec.length * wisp;
  }

  let length = base * Math.max(0.02, profile.lengthAt(root.phi, root.t));

  if (options.allowLayers !== false) {
    const amount = LAYER_AMOUNT[config.layers];
    if (amount > 0) {
      // Layering is shorter nearer the crown; the jitter is what makes it read
      // as cut rather than as a smooth shell.
      length *= 1 - amount * (1 - root.t);
      length *= 1 - amount * 0.45 * root.r1;
    }
    const framing = (config.faceFramingLayers ?? 0) / 100;
    if (framing > 0) {
      length *= 1 - framing * 0.45 * smoothstep(0.58, 1, root.frontness);
    }
  }

  if (options.allowFade !== false && config.fade) {
    const profileShape = profileFor(spec.kind);
    const line = FADE_LINE[config.fade.type] ?? 0.06;
    const blend = profileShape.disconnected ? 0.015 : 0.3;
    // Clipper guards: zero is skin, three is roughly a centimetre.
    const guard = 0.012 + config.fade.guard * 0.026;
    const top = 0.4 + (config.fade.topLength / 100) * 1.2;
    const faded = lerp(guard, length * top, smoothstep(line, line + blend, root.y));

    /*
     * A fade is cut round the sides and the back and stops at the temples. It
     * does not cross the forehead — nobody clippers a front hairline down to
     * skin — but the forehead roots sit at about y = 0.5, which a HIGH fade's
     * line reaches. Without this shield a high fade quietly ate the fringe,
     * which the test for bangs is what noticed.
     */
    const front = smoothstep(0.62, 0.95, root.frontness);
    length = lerp(faded, length * top, front);
  }

  return length;
}

export function generateHair(spec: DesignSpec, options: GenerateOptions = {}): HairGeometry {
  const face = options.face ?? 'OVAL';
  const profile = profileFor(spec.kind);
  const config = spec.config;
  const paint = makePainter(spec);

  const pool = rootPool();
  const wanted = DENSITY_STRANDS[spec.density];
  const strands = Math.min(wanted, pool.length);

  const wave = WAVE[spec.texture] ?? WAVE.STRAIGHT!;
  const shrink = SHRINK[spec.texture] ?? 1;
  const cling = profile.cling ?? 0.4;
  const blunt = profile.blunt ?? 0.2;

  // Volume is pressed into the silhouette by inflating the skull the hair is
  // kept outside of, which is what backcombing physically does.
  const loft = (spec.volume / 100) * 0.17;

  const partX = options.allowParting === false ? null : PART_X[config.parting];
  const bangSpec = options.allowBangs === false ? null : BANGS[config.bangs];

  const perStrand = SEGMENTS + 1;
  const vertexCount = strands * perStrand * 2;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(strands * SEGMENTS * 6);

  // Thinner cards when there are more of them, so coverage stays even. The
  // first pass used 0.021 and the result read as thatch: a hair card wide
  // enough to see individually stops looking like hair.
  const halfWidth = 0.0125 * Math.sqrt(2600 / strands);

  let v = 0;
  let f = 0;

  for (let i = 0; i < strands; i += 1) {
    const root = pool[i]!;
    const length = strandLength(spec, root, options) * shrink;
    const isBang = Boolean(bangSpec) && root.frontness > bangSpec!.reach && root.t > 0.68;

    const r = headRadius(root.x, root.y, root.z, face);
    let px = root.x * r;
    let py = root.y * r;
    let pz = root.z * r;

    // ------------------------------------------------ the comb direction ---
    let cx = 0;
    let cy = -1;
    let cz = 0;

    if (partX !== null) {
      // Away from the parting line, hardest at the crown where the part is.
      const side = root.x < partX ? -1 : 1;
      const near = 1 - clamp01(Math.abs(root.x - partX) / 0.55);
      cx += side * (0.35 + 0.5 * near) * (1 - root.t);
    } else {
      cx += root.x * 0.5 * (1 - root.t);
      cz += root.z * 0.5 * (1 - root.t);
    }

    if (profile.push) {
      const k = profile.push.strength * (1 - 0.65 * root.t);
      cx += profile.push.x * k;
      cy += profile.push.y * k;
      cz += profile.push.z * k;
    }

    if (isBang && bangSpec) {
      // A fringe goes forward over the forehead; a curtain also splits sideways.
      cx += bangSpec.spread * (root.x >= 0 ? 1 : -1);
      cy -= 0.5;
      cz += 1.1;
    }

    // Project the comb onto the scalp so the strand leaves the head flat
    // against it rather than shooting out of it.
    const dotN = cx * root.x + cy * root.y + cz * root.z;
    let dx = cx - root.x * dotN;
    let dy = cy - root.y * dotN;
    let dz = cz - root.z * dotN;
    let dl = Math.hypot(dx, dy, dz);
    if (dl < 1e-4) {
      // Dead on the crown, where there is no downhill. Hair falls along the
      // part, which is exactly what a crown does.
      dx = partX !== null ? (root.x >= partX ? 1 : -1) : 1;
      dy = 0;
      dz = 0;
      dl = 1;
    }
    dx /= dl;
    dy /= dl;
    dz /= dl;

    const d0x = dx;
    const d0y = dy;
    const d0z = dz;

    const step = length / SEGMENTS;
    /*
     * Neighbouring strands share most of their phase, because hair falls in
     * LOCKS. Giving each strand an independent phase was the single biggest
     * reason the first render looked like straw: every strand waved its own
     * way and they crossed each other into a thatch.
     */
    const phase = root.phi * 2.6 + root.t * 1.7 + root.r0 * 0.9;
    const waveAmp = wave.amp * (0.7 + 0.3 * Math.min(2, length)) * (0.85 + 0.3 * root.r3);

    const identity: StrandIdentity = {
      rHighlight: root.r0,
      rLowlight: root.r1,
      rBalayage: root.r2,
      frontness: root.frontness,
    };

    const base = v;

    for (let seg = 0; seg <= SEGMENTS; seg += 1) {
      const s = seg / SEGMENTS;

      if (seg > 0) {
        // Comb direction gives way to gravity as the strand leaves the head.
        // `cling` is how hard the cut holds it down: a buzz cut never lets go,
        // a loose long cut does almost immediately.
        const fall = smoothstep(0, 0.5, s) * (1 - cling * 0.55);
        let tx = lerp(d0x, 0, fall);
        let ty = lerp(d0y, -1, fall);
        let tz = lerp(d0z, 0, fall);
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;

        dx = lerp(dx, tx, 0.55);
        dy = lerp(dy, ty, 0.55);
        dz = lerp(dz, tz, 0.55);
        const l2 = Math.hypot(dx, dy, dz) || 1;
        dx /= l2;
        dy /= l2;
        dz /= l2;

        px += dx * step;
        py += dy * step;
        pz += dz * step;

        // Keep it outside the skull, inflated by the volume setting.
        const pl = Math.hypot(px, py, pz);
        if (pl > 1e-5) {
          const margin = loft * smoothstep(0, 0.35, s);
          const need = headRadius(px / pl, py / pl, pz / pl, face) + 0.012 + margin;
          if (pl < need) {
            const k = need / pl;
            px *= k;
            py *= k;
            pz *= k;
          }
        }

        /*
         * The shoulders. Long hair that passes through them looks broken in a
         * way no amount of shading hides, and a plane is enough: nobody is
         * inspecting the drape, they are looking at the length.
         */
        if (py < -1.52 && Math.abs(px) < 0.95 && Math.abs(pz) < 0.42) {
          py = -1.52 + 0.02 * root.r2;
          pz += 0.012;
        }
      }

      // Outward from the head, used both for shading and to lay the card flat.
      const ol = Math.hypot(px, py, pz) || 1;
      const ox = px / ol;
      const oy = py / ol;
      const oz = pz / ol;

      // Texture: a helix in the strand's own frame, growing in from the root
      // because hair is straightest where it leaves the scalp.
      let wx = 0;
      let wy = 0;
      let wz = 0;
      if (seg > 0) {
        const a = waveAmp * smoothstep(0, 0.2, s);
        let sx = dy * oz - dz * oy;
        let sy = dz * ox - dx * oz;
        let sz = dx * oy - dy * ox;
        const sl = Math.hypot(sx, sy, sz) || 1;
        sx /= sl;
        sy /= sl;
        sz /= sl;
        const ux = dy * sz - dz * sy;
        const uy = dz * sx - dx * sz;
        const uz = dx * sy - dy * sx;
        const angle = wave.freq * s * TAU + phase;
        const ca = Math.cos(angle) * a;
        const sa = Math.sin(angle) * a * 0.7;
        wx = sx * ca + ux * sa;
        wy = sy * ca + uy * sa;
        wz = sz * ca + uz * sa;
      }

      // The card's width direction: across the strand, flat to the scalp.
      let bx = dy * oz - dz * oy;
      let by = dz * ox - dx * oz;
      let bz = dx * oy - dy * ox;
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl;
      by /= bl;
      bz /= bl;

      /*
       * Blunt cuts hold their width to the very end; everything else tapers.
       * Clipper-length hair gets widened instead: at a few millimetres a
       * tapering card is sub-pixel, and a faded side rendered as BALD rather
       * than as stubble, which is a different haircut.
       */
      const stubble = length < 0.12 ? 1.9 : 1;
      // Tapered to 45% rather than to 25%: a lock of hair does not end in a
      // needle, and needles are what made the ends read as straw.
      const w = halfWidth * stubble * (1 - (1 - blunt) * 0.55 * s);

      const cx0 = px + wx;
      const cy0 = py + wy;
      const cz0 = pz + wz;

      const [cr, cg, cb] = paint(identity, s);

      for (const sign of [-1, 1] as const) {
        positions[v * 3] = cx0 + bx * w * sign;
        positions[v * 3 + 1] = cy0 + by * w * sign;
        positions[v * 3 + 2] = cz0 + bz * w * sign;
        normals[v * 3] = ox;
        normals[v * 3 + 1] = oy;
        normals[v * 3 + 2] = oz;
        // Along the strand, which is where the highlight has to run.
        tangents[v * 4] = dx;
        tangents[v * 4 + 1] = dy;
        tangents[v * 4 + 2] = dz;
        tangents[v * 4 + 3] = 1;
        colors[v * 3] = cr;
        colors[v * 3 + 1] = cg;
        colors[v * 3 + 2] = cb;
        v += 1;
      }
    }

    for (let seg = 0; seg < SEGMENTS; seg += 1) {
      const a = base + seg * 2;
      indices[f] = a;
      indices[f + 1] = a + 1;
      indices[f + 2] = a + 2;
      indices[f + 3] = a + 1;
      indices[f + 4] = a + 3;
      indices[f + 5] = a + 2;
      f += 6;
    }
  }

  return { positions, normals, colors, tangents, indices, strandCount: strands, vertexCount };
}
