import { describe, expect, it } from 'vitest';
import { generateHair, rootPool, strandLength, type Root } from '../src/app/(app)/hair-studio/hair/generate';
import { hairlinePolar, headRadius, pointToScalp } from '../src/app/(app)/hair-studio/hair/head-shape';
import { angleGap, makePainter } from '../src/app/(app)/hair-studio/hair/colour';
import { DEFAULT_CONFIG, SEGMENTS, type DesignSpec } from '../src/app/(app)/hair-studio/hair/spec';

/**
 * A HAIRCUT, ASSERTED.
 *
 * The engine is pure arithmetic precisely so these can exist: a fade that does
 * not shorten the sides, or a coily texture that hangs as long as straight
 * hair, is wrong in a way nobody can see in a screenshot of a single angle but
 * anybody notices in the chair.
 */

const spec = (over: Partial<DesignSpec> = {}): DesignSpec => ({
  kind: 'long_loose',
  texture: 'STRAIGHT',
  length: 'MEDIUM',
  density: 'MEDIUM',
  volume: 50,
  baseColor: '#3B2417',
  config: { ...DEFAULT_CONFIG },
  ...over,
});

const pool = rootPool();
const at = (predicate: (root: Root) => boolean) => pool.filter(predicate);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

describe('where hair is allowed to grow', () => {
  it('puts every root on the scalp and none on the face', () => {
    for (const root of pool) {
      const theta = Math.acos(Math.max(-1, Math.min(1, root.y)));
      expect(theta).toBeLessThanOrEqual(hairlinePolar(root.phi) + 1e-9);
      expect(Math.hypot(root.x, root.y, root.z)).toBeCloseTo(1, 6);
    }
  });

  it('reaches further down at the nape than at the forehead', () => {
    // Otherwise the hairline sits level all the way round, which is the single
    // most obvious tell that a head was drawn by someone who did not look at one.
    const front = Math.min(...at((r) => r.frontness > 0.95).map((r) => r.y));
    const back = Math.min(...at((r) => r.frontness < 0.05).map((r) => r.y));
    expect(back).toBeLessThan(front);
  });

  it('hands back the same pool every time, so a slider does not reshuffle the head', () => {
    expect(rootPool()).toBe(pool);
  });
});

describe('the cut', () => {
  it('gets longer as the length setting does', () => {
    const sample = at((r) => r.frontness < 0.3).slice(0, 80);
    const short = mean(sample.map((r) => strandLength(spec({ length: 'SHORT' }), r)));
    const long = mean(sample.map((r) => strandLength(spec({ length: 'LONG' }), r)));
    expect(long).toBeGreaterThan(short * 2);
  });

  it('layers the crown shorter than the hairline, and only when asked', () => {
    const crown = at((r) => r.t < 0.2);
    const edge = at((r) => r.t > 0.85);
    const flat = spec({ kind: 'layered_cut' });
    const layered = spec({ kind: 'layered_cut', config: { ...DEFAULT_CONFIG, layers: 'HEAVY' } });

    const ratio = (s: DesignSpec) =>
      mean(crown.map((r) => strandLength(s, r))) / mean(edge.map((r) => strandLength(s, r)));

    expect(ratio(layered)).toBeLessThan(ratio(flat));
  });

  it('leaves a blunt cut one length all the way round', () => {
    const blunt = spec({ kind: 'blunt_cut' });
    const lengths = pool.slice(0, 400).map((r) => strandLength(blunt, r));
    const spread = Math.max(...lengths) - Math.min(...lengths);
    expect(spread).toBeLessThan(1e-6);
  });
});

describe('a fade takes the sides and leaves the top', () => {
  const faded = spec({
    kind: 'fade',
    length: 'SHORT',
    config: { ...DEFAULT_CONFIG, fade: { type: 'MID', guard: 1, topLength: 60 } },
  });

  it('cuts the nape to clipper length', () => {
    const low = at((r) => r.y < -0.2);
    expect(low.length).toBeGreaterThan(10);
    for (const root of low) expect(strandLength(faded, root)).toBeLessThan(0.07);
  });

  it('leaves the top alone', () => {
    /*
     * A ratio, not a number of head radii. The first version of this asserted
     * an absolute length, which quietly encoded the men's cuts being roughly
     * four times too long — so when that was corrected, a passing test turned
     * red for the right change. What a fade means is that the top is many
     * times the sides, whatever the cut's overall length.
     */
    const top = at((r) => r.y > 0.75);
    const nape = at((r) => r.y < -0.3);
    expect(mean(top.map((r) => strandLength(faded, r)))).toBeGreaterThan(
      mean(nape.map((r) => strandLength(faded, r))) * 4,
    );
  });

  it('takes a higher fade further up the head', () => {
    const atTemple = at((r) => r.y > 0.1 && r.y < 0.25);
    const low = spec({ kind: 'fade', config: { ...DEFAULT_CONFIG, fade: { type: 'LOW', guard: 1, topLength: 60 } } });
    const high = spec({ kind: 'fade', config: { ...DEFAULT_CONFIG, fade: { type: 'HIGH', guard: 1, topLength: 60 } } });
    expect(mean(atTemple.map((r) => strandLength(high, r)))).toBeLessThan(
      mean(atTemple.map((r) => strandLength(low, r))),
    );
  });

  it('stops at the temples instead of crossing the forehead', () => {
    /*
     * A high fade's line reaches the height of the front hairline, so without
     * a shield at the front it clippers the fringe off. Nobody fades a
     * forehead; the fade follows the hairline round and stops.
     */
    const high = spec({
      kind: 'fade',
      length: 'SHORT',
      config: { ...DEFAULT_CONFIG, fade: { type: 'HIGH', guard: 0, topLength: 80 } },
    });
    const forehead = at((r) => r.frontness > 0.95 && r.t > 0.8);
    const temple = at((r) => r.frontness > 0.25 && r.frontness < 0.5 && r.y > 0 && r.y < 0.25);

    expect(forehead.length).toBeGreaterThan(3);
    expect(temple.length).toBeGreaterThan(3);
    expect(mean(forehead.map((r) => strandLength(high, r)))).toBeGreaterThan(
      mean(temple.map((r) => strandLength(high, r))) * 3,
    );
  });

  it('leaves more hair behind on a bigger guard', () => {
    const nape = at((r) => r.y < -0.3);
    const skin = spec({ kind: 'fade', config: { ...DEFAULT_CONFIG, fade: { type: 'MID', guard: 0, topLength: 60 } } });
    const three = spec({ kind: 'fade', config: { ...DEFAULT_CONFIG, fade: { type: 'MID', guard: 3, topLength: 60 } } });
    expect(mean(nape.map((r) => strandLength(three, r)))).toBeGreaterThan(
      mean(nape.map((r) => strandLength(skin, r))),
    );
  });
});

describe('a fringe is cut to the face, not to the length slider', () => {
  const front = at((r) => r.frontness > 0.9 && r.t > 0.75);

  it('shortens the front hairline and nothing else', () => {
    const plain = spec({ length: 'LONG' });
    const fringed = spec({ length: 'LONG', config: { ...DEFAULT_CONFIG, bangs: 'STRAIGHT' } });

    expect(front.length).toBeGreaterThan(5);
    for (const root of front) {
      expect(strandLength(fringed, root)).toBeLessThan(strandLength(plain, root));
    }

    const back = at((r) => r.frontness < 0.2);
    for (const root of back.slice(0, 40)) {
      expect(strandLength(fringed, root)).toBeCloseTo(strandLength(plain, root), 6);
    }
  });

  it('cuts micro bangs shorter than curtain bangs', () => {
    const micro = spec({ config: { ...DEFAULT_CONFIG, bangs: 'MICRO' } });
    const curtain = spec({ config: { ...DEFAULT_CONFIG, bangs: 'CURTAIN' } });
    const centre = at((r) => r.frontness > 0.93 && r.t > 0.8);
    expect(mean(centre.map((r) => strandLength(micro, r)))).toBeLessThan(
      mean(centre.map((r) => strandLength(curtain, r))),
    );
  });
});

describe('the style capabilities are honoured by the engine, not only by the form', () => {
  /**
   * The API refuses a design the salon's style does not allow, and the engine
   * is the second half of that promise: a config carried over from a style that
   * did allow bangs must not quietly draw them on one that does not.
   */
  const withEverything = spec({
    length: 'LONG',
    config: {
      ...DEFAULT_CONFIG,
      bangs: 'STRAIGHT',
      layers: 'HEAVY',
      fade: { type: 'HIGH', guard: 0, topLength: 50 },
    },
  });

  it('ignores bangs when the style does not take them', () => {
    const front = at((r) => r.frontness > 0.92 && r.t > 0.8)[0]!;
    const plain = spec({ length: 'LONG' });
    // Only bangs switched off on both sides, so the fringe is the one thing
    // under test rather than the layers coming along for the ride.
    expect(
      strandLength(withEverything, front, { allowBangs: false, allowLayers: false, allowFade: false }),
    ).toBeCloseTo(
      strandLength(plain, front, { allowBangs: false, allowLayers: false }),
      6,
    );
  });

  it('ignores a fade when the style does not take one', () => {
    const nape = at((r) => r.y < -0.3)[0]!;
    expect(strandLength(withEverything, nape, { allowFade: false, allowLayers: false })).toBeGreaterThan(0.5);
  });
});

describe('texture', () => {
  it('hangs coily hair far shorter than straight hair at the same cut', () => {
    // The most recognisable way a hair renderer looks wrong to anybody with
    // textured hair: shrinkage is not a detail, it is most of the look.
    const reach = (texture: DesignSpec['texture']) => {
      const mesh = generateHair(spec({ texture, length: 'LONG', density: 'LOW' }));
      let lowest = Infinity;
      for (let i = 1; i < mesh.positions.length; i += 3) lowest = Math.min(lowest, mesh.positions[i]!);
      return lowest;
    };
    expect(reach('COILY')).toBeGreaterThan(reach('STRAIGHT') + 0.3);
  });
});

describe('the mesh it hands to the renderer', () => {
  const mesh = generateHair(spec({ density: 'LOW' }));

  it('is the size it says it is', () => {
    expect(mesh.vertexCount).toBe(mesh.strandCount * (SEGMENTS + 1) * 2);
    expect(mesh.positions).toHaveLength(mesh.vertexCount * 3);
    expect(mesh.colors).toHaveLength(mesh.vertexCount * 3);
    expect(mesh.indices).toHaveLength(mesh.strandCount * SEGMENTS * 6);
  });

  it('has no NaN in it', () => {
    // One NaN turns an entire draw call invisible and reports nothing, which is
    // a bad afternoon to debug from a screenshot.
    for (let i = 0; i < mesh.positions.length; i += 1) expect(Number.isFinite(mesh.positions[i]!)).toBe(true);
    for (let i = 0; i < mesh.colors.length; i += 1) expect(Number.isFinite(mesh.colors[i]!)).toBe(true);
  });

  it('indexes only vertices that exist', () => {
    for (let i = 0; i < mesh.indices.length; i += 1) expect(mesh.indices[i]!).toBeLessThan(mesh.vertexCount);
  });

  it('keeps the hair outside the skull', () => {
    // Strands that sink into the head are the difference between hair and a
    // bruise. The tolerance is the card's own half-width.
    let worst = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      const l = Math.hypot(x, y, z);
      if (l < 1e-6) continue;
      const surface = headRadius(x / l, y / l, z / l);
      worst = Math.max(worst, surface - l);
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('draws the same thing twice', () => {
    const again = generateHair(spec({ density: 'LOW' }));
    expect(again.positions).toEqual(mesh.positions);
  });
});

describe('colour along a strand', () => {
  const strand = { rHighlight: 0.9, rLowlight: 0.9, rBalayage: 0.9, frontness: 0.1, phi: 0 };

  it('leaves the base colour alone when nothing is applied', () => {
    const paint = makePainter(spec());
    expect(paint(strand, 0)).toEqual(paint(strand, 1));
  });

  it('runs an ombre from root to tip', () => {
    const paint = makePainter(
      spec({
        baseColor: '#1C1917',
        config: { ...DEFAULT_CONFIG, ombre: { enabled: true, rootColor: '#1C1917', endColor: '#E8C9A0' } },
      }),
    );
    expect(paint(strand, 1)[0]).toBeGreaterThan(paint(strand, 0)[0] + 0.3);
  });

  it('darkens only the root under a root shadow', () => {
    const paint = makePainter(
      spec({
        baseColor: '#C58B55',
        config: {
          ...DEFAULT_CONFIG,
          rootShadow: { enabled: true, color: '#1C1917', depth: 25, blend: 30 },
        },
      }),
    );
    expect(paint(strand, 0)[0]).toBeLessThan(paint(strand, 0.9)[0]);
  });

  it('touches only the locks a highlight was painted on', () => {
    const paint = makePainter(
      spec({
        baseColor: '#3B2417',
        config: { ...DEFAULT_CONFIG, highlights: { enabled: true, color: '#E8C9A0', intensity: 'SUBTLE' } },
      }),
    );
    const lifted = paint({ ...strand, rHighlight: 0.01 }, 0.8);
    const left = paint({ ...strand, rHighlight: 0.99 }, 0.8);
    expect(lifted[0]).toBeGreaterThan(left[0]);
  });

  it('keeps a money piece at the front of the head', () => {
    const paint = makePainter(
      spec({ baseColor: '#3B2417', config: { ...DEFAULT_CONFIG, moneyPiece: { enabled: true, color: '#E8C9A0' } } }),
    );
    expect(paint({ ...strand, frontness: 0.99 }, 0.5)[0]).toBeGreaterThan(
      paint({ ...strand, frontness: 0.2 }, 0.5)[0],
    );
  });
});

describe('hand-placed sections', () => {
  const at = (phi: number) => ({ rHighlight: 0.9, rLowlight: 0.9, rBalayage: 0.9, frontness: 0.1, phi });

  const painted = (phi: number, over = {}) =>
    makePainter(
      spec({
        baseColor: '#2E211C',
        config: {
          ...DEFAULT_CONFIG,
          strips: [
            { id: 's1', color: '#F2E2C4', phi, start: 0.2, width: 50, brightness: 100, blend: 20, ...over },
          ],
        },
      }),
    );

  it('colours the section that was pointed at', () => {
    const paint = painted(0);
    expect(paint(at(0), 1)[0]).toBeGreaterThan(paint(at(0), 0)[0] + 0.1);
  });

  it('leaves the other side of the head alone', () => {
    const paint = painted(0);
    const base = makePainter(spec({ baseColor: '#2E211C', config: DEFAULT_CONFIG }));
    expect(paint(at(Math.PI), 1)).toEqual(base(at(Math.PI), 1));
  });

  /**
   * Azimuth wraps. A section centred just past the back of the head at +3.10
   * radians has to reach strands at -3.10, which are eleven degrees away and not
   * three hundred and fifty — and the seam a naive subtraction leaves only shows
   * up on the back of the head, which is the last place anybody looks.
   */
  it('reaches across the wrap at the back of the head', () => {
    const paint = painted(3.10);
    const near = paint(at(-3.10), 1)[0];
    const base = makePainter(spec({ baseColor: '#2E211C', config: DEFAULT_CONFIG }))(at(-3.10), 1)[0];
    expect(near).toBeGreaterThan(base + 0.05);
  });

  it('starts where it was painted and not at the root', () => {
    const paint = painted(0, { start: 0.6 });
    expect(paint(at(0), 0.2)[0]).toBeLessThan(paint(at(0), 0.95)[0]);
  });

  it('is wider when the width is', () => {
    const edge = 0.3;
    const narrow = painted(0, { width: 20 })(at(edge), 1)[0];
    const wide = painted(0, { width: 90 })(at(edge), 1)[0];
    expect(wide).toBeGreaterThan(narrow);
  });

  it('is weaker when the brightness is', () => {
    expect(painted(0, { brightness: 30 })(at(0), 1)[0]).toBeLessThan(painted(0, { brightness: 100 })(at(0), 1)[0]);
  });

  /**
   * A colour change with a perfectly hard edge down the side of a head reads as a
   * printing error rather than as hair, and no colourist can produce one anyway.
   */
  it('never leaves a perfectly hard edge, even at blend zero', () => {
    const paint = painted(0, { width: 50, blend: 0 });
    const half = 0.5 * 0.36;
    expect(paint(at(half * 1.05), 1)[0]).toBeGreaterThan(paint(at(half * 1.3), 1)[0]);
  });

  it('stacks two sections without either cancelling the other', () => {
    const paint = makePainter(
      spec({
        baseColor: '#2E211C',
        config: {
          ...DEFAULT_CONFIG,
          strips: [
            { id: 'a', color: '#F2E2C4', phi: -0.8, start: 0.2, width: 40, brightness: 100, blend: 20 },
            { id: 'b', color: '#F2E2C4', phi: 0.8, start: 0.2, width: 40, brightness: 100, blend: 20 },
          ],
        },
      }),
    );
    const base = makePainter(spec({ baseColor: '#2E211C', config: DEFAULT_CONFIG }));
    expect(paint(at(-0.8), 1)[0]).toBeGreaterThan(base(at(-0.8), 1)[0] + 0.1);
    expect(paint(at(0.8), 1)[0]).toBeGreaterThan(base(at(0.8), 1)[0] + 0.1);
  });
});

describe('angleGap', () => {
  it('measures the short way round', () => {
    expect(angleGap(0, 0)).toBeCloseTo(0);
    expect(angleGap(0.5, -0.5)).toBeCloseTo(1);
    expect(angleGap(3.1, -3.1)).toBeCloseTo(Math.PI * 2 - 6.2, 5);
    expect(angleGap(-3.1, 3.1)).toBeCloseTo(Math.PI * 2 - 6.2, 5);
  });

  it('never exceeds half a turn', () => {
    for (let a = -7; a <= 7; a += 0.37) {
      for (let b = -7; b <= 7; b += 0.53) {
        expect(angleGap(a, b)).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});

describe('pointToScalp — turning a tap into a place on the head', () => {
  /**
   * The one piece of the painting interaction a test can reach. The click-versus-
   * drag threshold and the raycast live in the component and need a browser; this
   * is the arithmetic, and it is where a sign error would quietly put every
   * section on the wrong side of the head.
   */
  it('reads the front of the head as phi zero', () => {
    expect(pointToScalp(0, 0.2, 1).phi).toBeCloseTo(0, 5);
  });

  it('puts the two sides on opposite signs', () => {
    expect(pointToScalp(1, 0.2, 0).phi).toBeGreaterThan(0);
    expect(pointToScalp(-1, 0.2, 0).phi).toBeLessThan(0);
  });

  it('reads the crown as the top of the scalp and the hairline as the bottom', () => {
    expect(pointToScalp(0, 1, 0).t).toBeCloseTo(0, 3);
    expect(pointToScalp(0, -1, 0).t).toBe(1);
  });

  /**
   * Distance from the centre must not matter: a tap landing on a lock standing
   * clear of the head has to name the same section as one landing on the scalp
   * beneath it, or painting long hair would place colour somewhere else entirely.
   */
  it('ignores how far the point is from the head', () => {
    const near = pointToScalp(0.3, 0.5, 0.8);
    const far = pointToScalp(3, 5, 8);
    expect(far.phi).toBeCloseTo(near.phi, 6);
    expect(far.t).toBeCloseTo(near.t, 6);
  });

  it('stays inside nought to one everywhere, including below the chin', () => {
    for (let x = -1; x <= 1; x += 0.21) {
      for (let y = -1; y <= 1; y += 0.17) {
        for (let z = -1; z <= 1; z += 0.23) {
          if (x === 0 && y === 0 && z === 0) continue;
          const { t, phi } = pointToScalp(x, y, z);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(1);
          expect(Number.isFinite(phi)).toBe(true);
        }
      }
    }
  });

  it('does not divide by zero at the origin', () => {
    expect(Number.isFinite(pointToScalp(0, 0, 0).t)).toBe(true);
  });
});
