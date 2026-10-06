import type { HairDensity, HairLength, HairTexture } from '../catalogue-types';

export type Bangs = 'NONE' | 'CURTAIN' | 'STRAIGHT' | 'SIDE' | 'WISPY' | 'MICRO';
export type Layers = 'NONE' | 'LIGHT' | 'MEDIUM' | 'HEAVY';
export type Parting = 'CENTER' | 'LEFT' | 'RIGHT' | 'DEEP_SIDE' | 'NATURAL';
export type FadeType = 'LOW' | 'MID' | 'HIGH';
export type Intensity = 'SUBTLE' | 'MEDIUM' | 'STRONG';
export type BalayagePlacement = 'MID' | 'ENDS' | 'FULL';

export interface Tint {
  enabled: boolean;
  color: string;
  intensity: Intensity;
}

/**
 * A SECTION OF HAIR THE COLOURIST PICKED OUT BY HAND.
 *
 * Everything else in this config is a TREATMENT — highlights, balayage, a money
 * piece — and every treatment decides for itself which locks it touches, either
 * at random or by a rule about the front of the head. A strip is the opposite:
 * somebody pointed at the head and said "this bit".
 *
 * That is why it carries an angle rather than an intensity. `phi` is where on the
 * head it sits, taken from the point on the model that was clicked, and it is the
 * one piece of colour here that cannot be expressed as a preset.
 */
export interface HighlightStrip {
  id: string;
  color: string;
  /** Azimuth of the section's centre, radians. 0 faces the mirror. */
  phi: number;
  /**
   * Where along the strand the colour starts — 0 at the root, 1 at the tip.
   *
   * Taken from how far DOWN the head the person clicked, which is how the
   * control stays a single gesture: click near the crown and the section is
   * coloured from the roots, click near the ends and only the tips are painted.
   * That is also how it is done in the chair.
   */
  start: number;
  /** How wide the section is, 0-100. */
  width: number;
  /** How far the colour replaces the base, 0-100. */
  brightness: number;
  /** How softly the edges fade into the hair around them, 0-100. */
  blend: number;
}

export interface DesignConfig {
  highlights?: Tint;
  lowlights?: Tint;
  balayage?: Tint & { placement: BalayagePlacement };
  ombre?: { enabled: boolean; rootColor: string; midColor?: string; endColor: string };
  moneyPiece?: { enabled: boolean; color: string };
  faceFraming?: { enabled: boolean; color: string };
  rootShadow?: { enabled: boolean; color: string; depth: number; blend: number };
  bangs: Bangs;
  layers: Layers;
  faceFramingLayers?: number;
  parting: Parting;
  fade?: { type: FadeType; guard: 0 | 0.5 | 1 | 2 | 3; topLength: number };
  /** Hand-placed sections. See HighlightStrip. */
  strips?: HighlightStrip[];
}

/**
 * EVERYTHING THE ENGINE NEEDS TO DRAW ONE LOOK.
 *
 * The same shape the API stores, so a saved design is redrawn by passing the
 * row straight back in. Nothing here is a 3D asset reference: `kind` picks a
 * shape profile and the rest are numbers, which is what makes the combinations
 * free. Baking a mesh per combination would be tens of thousands of files.
 */
export interface DesignSpec {
  kind: string;
  texture: HairTexture;
  length: HairLength;
  density: HairDensity;
  /** 0-100. */
  volume: number;
  baseColor: string;
  config: DesignConfig;
}

/**
 * The widest a single section may be, in radians of the head.
 *
 * About forty degrees at 100. Wider than that stops being a section and becomes
 * "half the head is a different colour", which is a base colour change and has
 * its own control. Shared between the painter and the UI so a slider at 50 means
 * the same thing in both.
 */
export const STRIP_MAX_HALF_ANGLE = 0.36;

export const DEFAULT_CONFIG: DesignConfig = {
  bangs: 'NONE',
  layers: 'NONE',
  parting: 'NATURAL',
};

/**
 * Length in head radii, measured from the root.
 *
 * The head is one unit across the crown, so these are read as: very short is
 * clipper work, short reaches the jaw, medium the collarbone, long the
 * mid-back. The profile then scales them per style.
 */
export const LENGTH_UNITS: Record<HairLength, number> = {
  VERY_SHORT: 0.18,
  SHORT: 0.95,
  MEDIUM: 1.9,
  LONG: 3.0,
  VERY_LONG: 4.0,
};

/**
 * How many strands get drawn.
 *
 * Nothing like a real head, which has around a hundred thousand. These are hair
 * CARDS — flat ribbons each standing for a lock — which is how every real-time
 * hair system works, because a hundred thousand tubes is not a thing a browser
 * draws at sixty frames a second.
 */
export const DENSITY_STRANDS: Record<HairDensity, number> = {
  LOW: 1700,
  MEDIUM: 2600,
  HIGH: 3800,
};

/** Segments along each strand. Enough to curve, few enough to regenerate live. */
export const SEGMENTS = 14;

/** The pool roots are drawn from; a density is a prefix of it. See sampleRoots. */
export const MAX_STRANDS = 3800;
