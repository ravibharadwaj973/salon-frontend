/** Mirrors the hair-studio module's enums and rows. */
export type HairTexture = 'STRAIGHT' | 'WAVY' | 'CURLY' | 'COILY';
export type HairLength = 'VERY_SHORT' | 'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG';
export type HairDensity = 'LOW' | 'MEDIUM' | 'HIGH';
export type FaceShape = 'OVAL' | 'ROUND' | 'SQUARE' | 'OBLONG' | 'HEART' | 'DIAMOND';
export type HairMaintenance = 'LOW' | 'MEDIUM' | 'HIGH';
export type HairGender = 'MALE' | 'FEMALE' | 'UNISEX';
/** What the PICTURE shows, not what the hair can be recoloured to in the studio. */
export type HairColorFamily = 'BLACK' | 'BROWN' | 'BLONDE' | 'RED' | 'GREY' | 'FASHION';
/** Who it is shown on. Coarse on purpose — see the note in the schema. */
export type SkinTone = 'FAIR' | 'LIGHT' | 'MEDIUM' | 'OLIVE' | 'DEEP';

/**
 * A generator the studio can draw.
 *
 * Fetched rather than hard-coded here. The backend owns which kinds exist, so a
 * style this app cannot render never appears in the picker in the first place —
 * which beats letting somebody save one and discovering it draws a bald head.
 */
export interface HairstyleKind {
  key: string;
  label: string;
  gender: HairGender;
  category: string;
  textures: HairTexture[];
  lengths: HairLength[];
  densities: HairDensity[];
  faceShapes: FaceShape[];
  supportsBangs: boolean;
  supportsLayers: boolean;
  supportsParting: boolean;
  supportsFade: boolean;
  maintenance: HairMaintenance;
  variants: string[];
}

export interface KindsResponse {
  kinds: HairstyleKind[];
  options: {
    textures: HairTexture[];
    lengths: HairLength[];
    densities: HairDensity[];
    faceShapes: FaceShape[];
    maintenance: HairMaintenance[];
    intensities: string[];
    bangs: string[];
    layers: string[];
    partings: string[];
    fadeTypes: string[];
    balayagePlacements: string[];
    colorFamilies: HairColorFamily[];
    skinTones: SkinTone[];
  };
}

export interface Hairstyle {
  id: string;
  kind: string;
  name: string;
  category: string | null;
  gender: HairGender;
  description: string | null;
  supportedTextures: HairTexture[];
  supportedLengths: HairLength[];
  supportedDensities: HairDensity[];
  recommendedFaceShapes: FaceShape[];
  supportsBangs: boolean;
  supportsLayers: boolean;
  supportsParting: boolean;
  supportsFade: boolean;
  maintenance: HairMaintenance;
  serviceId: string | null;
  previewUrl: string | null;
  /**
   * Derived server-side from previewUrl, never stored.
   *
   * A second column holding the same fact drifts from the first — a picture
   * replaced without its thumbnail updated shows last month's haircut beside this
   * month's name, and nothing errors. Null when there is no picture, and equal to
   * previewUrl when that picture is not one we host.
   */
  thumbnailUrl: string | null;
  /**
   * The hair, cut out of previewUrl: white where the hair is, black elsewhere.
   *
   * Null means the style has a photograph nobody has masked yet, so it can be
   * shown but not recoloured — which the studio says in words rather than by
   * offering controls that do nothing.
   */
  maskUrl: string | null;
  colorFamily: HairColorFamily | null;
  skinTone: SkinTone | null;
  /** True when the salon uploaded the picture rather than generating it. */
  photoIsUploaded: boolean;
  /**
   * How many saved looks in THIS salon use this style.
   *
   * What makes a "most chosen" tab a fact rather than a label. Optional because
   * only the list endpoint counts it; a single style fetched on its own does not.
   */
  timesChosen?: number;
  branchId: string | null;
  isActive: boolean;
  sortOrder: number;
  service: { id: string; name: string; price: string | number; durationMin: number } | null;
}

export const TEXTURE_LABELS: Record<HairTexture, string> = {
  STRAIGHT: 'Straight',
  WAVY: 'Wavy',
  CURLY: 'Curly',
  COILY: 'Coily',
};

export const LENGTH_LABELS: Record<HairLength, string> = {
  VERY_SHORT: 'Very short',
  SHORT: 'Short',
  MEDIUM: 'Medium',
  LONG: 'Long',
  VERY_LONG: 'Very long',
};

export const DENSITY_LABELS: Record<HairDensity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const FACE_SHAPE_LABELS: Record<FaceShape, string> = {
  OVAL: 'Oval',
  ROUND: 'Round',
  SQUARE: 'Square',
  OBLONG: 'Oblong',
  HEART: 'Heart',
  DIAMOND: 'Diamond',
};

export const MAINTENANCE_LABELS: Record<HairMaintenance, string> = {
  LOW: 'Low upkeep',
  MEDIUM: 'Medium upkeep',
  HIGH: 'High upkeep',
};

export const COLOR_FAMILY_LABELS: Record<HairColorFamily, string> = {
  BLACK: 'Black',
  BROWN: 'Brown',
  BLONDE: 'Blonde',
  RED: 'Red',
  GREY: 'Grey',
  FASHION: 'Fashion',
};

/**
 * Described by complexion, never by any word about race or origin. The look-book
 * needs to be browsable by who is in the picture; it does not need, and must not
 * carry, a claim about who somebody is.
 */
export const SKIN_TONE_LABELS: Record<SkinTone, string> = {
  FAIR: 'Fair',
  LIGHT: 'Light',
  MEDIUM: 'Medium',
  OLIVE: 'Olive',
  DEEP: 'Deep',
};

export const GENDER_LABELS: Record<HairGender, string> = {
  FEMALE: 'Women',
  MALE: 'Men',
  UNISEX: 'Anyone',
};
