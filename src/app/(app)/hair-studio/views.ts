/**
 * THE SIX ANGLES — AND WHY THEY LIVE IN A FILE OF THEIR OWN.
 *
 * The studio panel needs these names to label its buttons, and the viewport
 * needs them to point the camera. Declaring them in viewport.tsx and importing
 * them from the panel looked harmless and was not: a static import puts the
 * whole module in the graph, so three.js and @react-three/drei were pulled in
 * and evaluated on the SERVER, which is exactly what the `ssr: false` dynamic
 * import next to it exists to prevent. The dynamic import still split the
 * client bundle, so the build looked right and the server paid for it anyway.
 *
 * This file imports nothing. That is the point of it.
 *
 * The model faces +Z, so "left" is the model's left and the camera sits on +X
 * to see it — the way a stylist says it, not the way a viewer would.
 */
export const VIEWS = {
  FRONT: [0, -0.2, 7.6],
  FRONT_LEFT: [5.4, 0.1, 5.4],
  LEFT: [7.6, -0.2, 0],
  BACK: [0, 0.1, -7.6],
  RIGHT: [-7.6, -0.2, 0],
  FRONT_RIGHT: [-5.4, 0.1, 5.4],
} as const satisfies Record<string, readonly [number, number, number]>;

export type ViewName = keyof typeof VIEWS;

export const VIEW_LABELS: Record<ViewName, string> = {
  FRONT: 'Front',
  FRONT_LEFT: 'Front left',
  LEFT: 'Left',
  BACK: 'Back',
  RIGHT: 'Right',
  FRONT_RIGHT: 'Front right',
};
