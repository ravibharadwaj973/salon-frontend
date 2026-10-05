import type { HairDensity, HairLength, HairTexture } from '../../hairstyles/types';

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
