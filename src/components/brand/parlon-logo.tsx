/**
 * The Parlon mark, in two forms.
 *
 * Inline SVG rather than an <img>: it renders on exactly the pixel grid it is
 * given, needs no network round trip, and cannot arrive late. Both forms are
 * drawn on the same 512 grid as the icon files, so this and the favicon are
 * literally the same drawing.
 *
 *   <ParlonLogo />  the orange tile with the mark knocked out in white —
 *                   for light surfaces, where the tile carries the brand.
 *   <ParlonMark />  the mark alone in currentColor, no tile — for orange or
 *                   dark surfaces, where a second coloured tile would fight
 *                   with the one it is sitting on.
 */

export function ParlonLogo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Parlon">
      <rect width="512" height="512" rx="115" fill="#EA580C" />
      <Mark stroke="#FFFFFF" fill="#FFFFFF" />
    </svg>
  );
}

export function ParlonMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Parlon">
      <Mark stroke="currentColor" fill="currentColor" />
    </svg>
  );
}

/** The three strokes: the blade, the leaf, and the handle ring. */
function Mark({ stroke, fill }: { stroke: string; fill: string }) {
  return (
    <>
      <path d="M 102 102 L 378 421" stroke={stroke} strokeWidth="50" strokeLinecap="round" fill="none" />
      <path d="M 433 94 C 425.0 190.2, 373.7 247.9, 279 267 C 293.0 176.1, 344.3 118.4, 433 94 Z" fill={fill} />
      <circle cx="163" cy="336" r="50" stroke={stroke} strokeWidth="34" fill="none" />
    </>
  );
}
