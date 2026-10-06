import { describe, expect, it } from 'vitest';
import {
  hexToLab,
  labToRgb,
  measureHair,
  recolourPixel,
  rgbToLab,
} from '../src/app/(app)/hair-studio/photo/recolour';
import { FRAGMENT_SHADER, MAX_STRIPS } from '../src/app/(app)/hair-studio/photo/shader';

/**
 * WHY THESE NUMBERS ARE HERE.
 *
 * The recolour exists twice: once in GLSL, where it runs, and once in TypeScript,
 * where it can be tested. Two copies of a formula drift unless something holds
 * them together, and a drifted shader does not throw — it renders a picture that
 * is slightly the wrong colour, which nobody notices until a salon prints one.
 *
 * The expected values below were computed independently, in Python, against the
 * reference portrait this feature was designed on. They are the anchor.
 */

const near = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('CIELAB, against values computed independently', () => {
  it('matches the reference conversions', () => {
    const cases: [string, [number, number, number]][] = [
      ['#000000', [0, 0, 0]],
      ['#ffffff', [100, 0, 0]],
      ['#3b2417', [16.7657, 9.2163, 13.1385]],
      ['#c68642', [61.1786, 18.0418, 45.5899]],
      ['#b4441f', [44.146, 43.6876, 44.1546]],
      ['#2f7a5a', [45.9891, -31.338, 10.7474]],
    ];
    for (const [hex, expected] of cases) {
      const lab = hexToLab(hex);
      near(lab[0], expected[0]);
      near(lab[1], expected[1]);
      near(lab[2], expected[2]);
    }
  });

  it('round-trips a colour back to the bytes it came from', () => {
    for (const hex of ['#3b2417', '#e8c88a', '#7a2f3a', '#1c1512']) {
      const back = labToRgb(hexToLab(hex)).map((c) => Math.round(c * 255));
      const want = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      expect(back).toEqual(want);
    }
  });

  /** A colour picker can hand over anything; NaN in a uniform renders black. */
  it('refuses to produce NaN from junk', () => {
    for (const bad of ['', 'caramel', '#12345', '#xyzxyz', 'rgb(1,2,3)']) {
      expect(hexToLab(bad).every(Number.isFinite)).toBe(true);
    }
  });
});

describe('the recolour itself', () => {
  const brown = hexToLab('#3b2417');
  const blonde = hexToLab('#e8c88a');

  /**
   * THE ONE PROPERTY THE WHOLE FEATURE RESTS ON.
   *
   * A photograph of hair is pigment plus structure. If two pixels that differed
   * in lightness come out the same, every strand, every shine and every shadow
   * between the curls has been flattened — and what is left is a wig.
   */
  it('keeps two different strands different', () => {
    const shadow = recolourPixel([18, 6, 9], 0.15, 0.5, 45, { base: blonde, lift: 1 });
    const shine = recolourPixel([48, 6, 9], 0.85, 0.5, 45, { base: blonde, lift: 1 });
    expect(shine[0] - shadow[0]).toBeGreaterThan(10);
  });

  it('can take dark hair light, which hue alone cannot', () => {
    const dark: [number, number, number] = [18, 9, 13];
    const lifted = recolourPixel(dark, 0.5, 0.5, 45, { base: blonde, lift: 1 });
    expect(lifted[0]).toBeGreaterThan(dark[0] + 30);
  });

  it('leaves the level alone at zero lift, and still changes the pigment', () => {
    const start: [number, number, number] = [30, 5, 8];
    const out = recolourPixel(start, 0.5, 0.5, 45, { base: blonde, lift: 0 });
    near(out[0], start[0], 0.001);
    expect(out[2]).toBeGreaterThan(start[2] + 5);
  });

  /**
   * A shine on hair is light off the cuticle — the colour of the LAMP, not of
   * the dye. Carrying full pigment into it leaves a bright coloured smear
   * exactly where a highlight belongs, which is the commonest way a recoloured
   * photo gives itself away.
   */
  it('desaturates the speculars instead of dyeing them', () => {
    const mid = recolourPixel([40, 4, 6], 0.5, 0.5, 45, { base: brown, lift: 0.6 });
    const spec = recolourPixel([40, 4, 6], 0.99, 0.5, 45, { base: brown, lift: 0.6 });
    expect(Math.abs(spec[2])).toBeLessThan(Math.abs(mid[2]));
  });

  it('puts highlights on the strands that already catch the light', () => {
    const opts = { base: brown, lift: 0.5, highlight: blonde, highlightAmount: 1 };
    const dull = recolourPixel([20, 5, 8], 0.2, 0.5, 45, opts);
    const lit = recolourPixel([44, 5, 8], 0.9, 0.5, 45, opts);
    expect(lit[0] - dull[0]).toBeGreaterThan(15);
  });

  it('darkens the roots and not the ends', () => {
    const opts = { base: blonde, lift: 1, root: hexToLab('#1c1512'), rootDepth: 0.4 };
    const root = recolourPixel([40, 5, 8], 0.5, 0.02, 45, opts);
    const end = recolourPixel([40, 5, 8], 0.5, 0.95, 45, opts);
    expect(end[0]).toBeGreaterThan(root[0] + 20);
  });

  it('paints balayage from a point down, never at the root', () => {
    const opts = { base: brown, lift: 0.5, ends: blonde, endsAmount: 1, endsStart: 0.6 };
    const top = recolourPixel([30, 5, 8], 0.5, 0.1, 45, opts);
    const bottom = recolourPixel([30, 5, 8], 0.5, 0.98, 45, opts);
    expect(bottom[0]).toBeGreaterThan(top[0] + 20);
  });

  it('never produces NaN anywhere in the parameter space', () => {
    for (const norm of [0, 0.3, 0.78, 1]) {
      for (const rel of [0, 0.5, 1]) {
        for (const lift of [0, 0.5, 1]) {
          const out = recolourPixel([25, 3, 7], norm, rel, 45, {
            base: blonde,
            lift,
            highlight: brown,
            highlightAmount: 1,
            root: brown,
            rootDepth: 1,
            ends: blonde,
            endsAmount: 1,
            endsStart: 0,
          });
          expect(out.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});

describe('measuring the hair', () => {
  /** A 32×32 picture: left half dark hair, right half background. */
  const build = (hairLum: number[]) => {
    const w = 32;
    const h = 32;
    const pixels = new Uint8ClampedArray(w * h * 4);
    const mask = new Uint8ClampedArray(w * h * 4);
    let k = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const hair = x < w / 2;
        const v = hair ? hairLum[k++ % hairLum.length]! : 240;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
        pixels[i + 3] = 255;
        mask[i] = mask[i + 1] = mask[i + 2] = hair ? 255 : 0;
        mask[i + 3] = 255;
      }
    }
    return { pixels, mask, w, h };
  };

  it('measures only inside the mask', () => {
    const { pixels, mask, w, h } = build([20, 40, 60]);
    const range = measureHair(pixels, mask, w, h);
    // The background is 240, far above anything in the hair; if it leaked in,
    // the span would be enormous.
    expect(range.span).toBeLessThan(60);
    expect(range.coverage).toBeGreaterThan(0);
  });

  /**
   * Percentiles rather than min and max, so one blown-out pixel of scalp shine
   * cannot set the top of the range and wash out everything below it.
   */
  it('is not moved by a single blown-out pixel', () => {
    const steady = measureHair(...(({ pixels, mask, w, h }) => [pixels, mask, w, h] as const)(build([30, 32, 34])));
    const spiked = build([30, 32, 34]);
    spiked.pixels[0] = spiked.pixels[1] = spiked.pixels[2] = 255;
    const withSpike = measureHair(spiked.pixels, spiked.mask, spiked.w, spiked.h);
    expect(Math.abs(withSpike.span - steady.span)).toBeLessThan(20);
  });

  it('gives a usable range when the mask is empty rather than dividing by zero', () => {
    const { pixels, w, h } = build([30]);
    const empty = new Uint8ClampedArray(w * h * 4);
    const range = measureHair(pixels, empty, w, h);
    expect(range.span).toBeGreaterThan(0);
    expect(range.coverage).toBe(0);
  });
});

describe('the shader and the reference stay in step', () => {
  /**
   * Not a substitute for rendering it — the shader is verified against this same
   * reference in a real browser — but these catch the two edits that silently
   * break the pair: a constant changed on one side only, and the strip array
   * growing past what the GLSL loop will read.
   */
  it('uses the same constants in both copies', () => {
    for (const constant of ['0.78', '0.75', '0.45', '1.4', '0.85', '1.3', '0.9']) {
      expect(FRAGMENT_SHADER).toContain(constant);
    }
  });

  it('bounds the sections to what the shader loop reads', () => {
    expect(FRAGMENT_SHADER).toContain(`i < ${MAX_STRIPS}`);
    expect(MAX_STRIPS).toBe(6);
  });

  it('multiplies by the mask last, so colour cannot escape onto the face', () => {
    expect(FRAGMENT_SHADER).toContain('mix(photo, result, m)');
  });
});
