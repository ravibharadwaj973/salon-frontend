'use client';

import { Component, type ReactNode } from 'react';

/**
 * KEEPS A DEAD CANVAS FROM TAKING THE WHOLE SCREEN WITH IT.
 *
 * ── What actually happens without this ────────────────────────────────────
 *
 * The viewport had an `onError` prop on three's Canvas and a friendly paragraph
 * behind it, and the paragraph was unreachable. Driving the real page in a
 * browser with WebGL turned off, the result was not a sentence about hardware
 * acceleration — it was the app's global error boundary, with the entire Hair
 * studio replaced by "Try again". The controls, the colour picker, Save look and
 * Book it all went with it, and the comment next to that dead code cheerfully
 * claimed everything else in Parlon worked without WebGL.
 *
 * Three.js throws "Error creating WebGL context" from inside its constructor,
 * during render. A prop cannot catch that. Only an error boundary can, and only
 * one placed INSIDE the layout — a boundary around the page would still lose the
 * panel.
 *
 * This is not a hypothetical browser. WebGL is off by default on a surprising
 * number of locked-down Windows machines, it is the first thing a managed-device
 * policy disables, and a salon reception PC is exactly that kind of machine. The
 * studio degrading to "you cannot see the 3D preview" is a bad afternoon; the
 * whole screen dying is a salon that concludes the product is broken.
 *
 * ── Why a class component ─────────────────────────────────────────────────
 *
 * Because React has no hook for this. componentDidCatch is the only API that
 * catches a render-time throw from a child, which is why this one file is the
 * only class component in the app.
 */
export class CanvasBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    /*
     * Logged rather than reported: this is almost always a browser setting rather
     * than a defect, and a salon's console is where somebody looking into it will
     * start. Kept to one line so a canvas failing on every mount cannot fill the
     * log.
     */
    // eslint-disable-next-line no-console
    console.warn('[hair-studio] the 3D viewport could not start:', error.message);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
