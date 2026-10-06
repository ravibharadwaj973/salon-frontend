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
   * THE SEVEN AXES. Null everywhere means "not described yet", which is normal and
   * not an error: a salon puts a style on the menu long before it decides how to
   * describe it on seven axes, and a half-filled catalogue beats an empty one.
   */
  cutFamily: string | null;
  fringe: string | null;
  finish: string | null;
  baseColorKey: string | null;
  colorTechnique: string | null;
  colorPlacement: string | null;
  desiredLooks: string[];
  occasions: string[];
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

/* ════════════════════════════════════════════════════════════════════════════
 * THE SEVEN AXES A LOOK IS MADE OF.
 *
 * Mirrors `look-dimensions.ts` on the server, which owns the values AND the rules
 * between them — notably which placements a technique admits, which this file
 * also carries because a UI that offers an illegal pair and lets the API refuse
 * it is a UI that teaches people not to trust it.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const CUT_FAMILY_LABELS: Record<string, string> = {
  BOB: 'Bob',
  LOB: 'Lob',
  LAYERS: 'Layers',
  BUTTERFLY: 'Butterfly',
  U_CUT: 'U-cut',
  V_CUT: 'V-cut',
  WOLF: 'Wolf cut',
  PIXIE: 'Pixie',
  SHAG: 'Shag',
  BLUNT: 'Blunt',
  ONE_LENGTH: 'One length',
  FADE: 'Fade',
  TAPER: 'Taper',
  UNDERCUT: 'Undercut',
  CROP: 'Crop',
  QUIFF: 'Quiff',
  POMPADOUR: 'Pompadour',
  BUZZ: 'Buzz cut',
};

export const FRINGE_LABELS: Record<string, string> = {
  NONE: 'No fringe',
  CURTAIN: 'Curtain',
  BOTTLENECK: 'Bottleneck',
  FULL: 'Full fringe',
  SIDE_SWEPT: 'Side-swept',
  WISPY: 'Wispy',
  MICRO: 'Micro',
};

/**
 * HOW THE HAIR IS WORN — not the customer's own texture.
 *
 * Those were one word for a long time and it is the collision most worth keeping
 * apart: `supportedTextures` is whose hair the cut works on, this is what the
 * finished head looks like, and the distance between them is a service with a
 * price.
 */
export const FINISH_LABELS: Record<string, string> = {
  SLEEK: 'Sleek',
  STRAIGHT: 'Straight',
  BLOWOUT: 'Blowout',
  SOFT_WAVES: 'Soft waves',
  BEACH_WAVES: 'Beach waves',
  CURLS: 'Curls',
  DEFINED_CURLS: 'Defined curls',
  TEXTURED: 'Textured',
};

export const BASE_COLOR_LABELS: Record<string, string> = {
  BLACK: 'Black',
  SOFT_BLACK: 'Soft black',
  ESPRESSO: 'Espresso',
  DARK_BROWN: 'Dark brown',
  CHOCOLATE: 'Chocolate brown',
  CHESTNUT: 'Chestnut',
  CARAMEL: 'Caramel',
  COPPER: 'Copper',
  BURGUNDY: 'Burgundy',
  DARK_BLONDE: 'Dark blonde',
  BLONDE: 'Blonde',
  LIGHT_BLONDE: 'Light blonde',
  PLATINUM: 'Platinum',
  GREY: 'Grey / silver',
  FASHION: 'Fashion shade',
};

export const TECHNIQUE_LABELS: Record<string, string> = {
  GLOBAL: 'Global colour',
  ROOT: 'Root colour',
  HIGHLIGHTS: 'Highlights',
  LOWLIGHTS: 'Lowlights',
  BABYLIGHTS: 'Babylights',
  BALAYAGE: 'Balayage',
  OMBRE: 'Ombré',
  COLOR_MELT: 'Colour melt',
};

export const PLACEMENT_LABELS: Record<string, string> = {
  FULL: 'All over',
  ROOTS: 'Roots',
  CROWN: 'Crown',
  FACE_FRAMING: 'Face framing',
  MONEY_PIECE: 'Money piece',
  MIDS_TO_ENDS: 'Mid-lengths to ends',
  ENDS: 'Ends',
  UNDERLAYER: 'Underlayer',
  HIDDEN: 'Hidden',
  PANELS: 'Panels',
};

/**
 * TECHNIQUE × PLACEMENT IS NOT A GRID — about half the cross-product names
 * nothing a colourist could do.
 *
 * Duplicated from the server on purpose. The alternative is a placement dropdown
 * showing all ten and an API that refuses six of them, which is how a
 * professional tool loses the professionals using it in the first five minutes.
 */
export const PLACEMENTS_FOR_TECHNIQUE: Record<string, string[]> = {
  GLOBAL: ['FULL'],
  ROOT: ['ROOTS'],
  HIGHLIGHTS: ['FULL', 'CROWN', 'FACE_FRAMING', 'MONEY_PIECE', 'UNDERLAYER', 'HIDDEN', 'PANELS'],
  LOWLIGHTS: ['FULL', 'CROWN', 'UNDERLAYER', 'PANELS'],
  BABYLIGHTS: ['FULL', 'CROWN', 'FACE_FRAMING', 'MONEY_PIECE'],
  BALAYAGE: ['MIDS_TO_ENDS', 'ENDS', 'FACE_FRAMING', 'FULL', 'PANELS'],
  OMBRE: ['ENDS', 'MIDS_TO_ENDS'],
  COLOR_MELT: ['FULL', 'MIDS_TO_ENDS'],
};

export const DESIRED_LOOK_LABELS: Record<string, string> = {
  NATURAL: 'Natural',
  MODERN: 'Modern',
  BOLD: 'Bold',
  ELEGANT: 'Elegant',
  TRENDY: 'Trendy',
  PROFESSIONAL: 'Professional',
  EDGY: 'Edgy',
};

export const OCCASION_LABELS: Record<string, string> = {
  EVERYDAY: 'Everyday',
  OFFICE: 'Office',
  PARTY: 'Party',
  WEDDING: 'Wedding',
  BRIDAL: 'Bridal',
  VACATION: 'Vacation',
  PHOTOSHOOT: 'Photoshoot',
};

/* ════════════════════════════════════════════════════════════════════════════
 * THE ANGLES — a property of the PICTURE, not of the look.
 *
 * The same cut photographed from four sides is one look, one price, one booking.
 * Filing poses among the seven axes would multiply the library by five and mean
 * nothing.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type HairPose = 'FRONT' | 'THREE_QUARTER' | 'SIDE' | 'BACK' | 'TOP';

export const POSE_LABELS: Record<HairPose, string> = {
  FRONT: 'Front',
  THREE_QUARTER: 'Three-quarter',
  SIDE: 'Side',
  BACK: 'Back',
  TOP: 'Top',
};

/** What each angle is actually for, shown where somebody is deciding to shoot it. */
export const POSE_WHY: Record<HairPose, string> = {
  FRONT: 'What she sees in a mirror. The look-book thumbnail, and what the studio recolours.',
  THREE_QUARTER: 'Shows the cut as a shape. One picture, the most information.',
  SIDE: 'Length, layers and the line at the jaw — where a bob is right or wrong.',
  BACK: 'The graduation, the V or U, the fade. What she cannot see on herself.',
  TOP: 'The crown and the parting. Mostly for density and thinning work.',
};

export interface HairstylePhoto {
  id: string;
  pose: HairPose;
  imageUrl: string;
  maskUrl: string | null;
  isUploaded: boolean;
  consentAt: string | null;
}

/** `GET /hairstyles/:id/photos` — the angles it has, and the ones it still owes. */
export interface PhotoChecklist {
  wanted: HairPose[];
  extra: HairPose[];
  missing: HairPose[];
  photos: HairstylePhoto[];
}
