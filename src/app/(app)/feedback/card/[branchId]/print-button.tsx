'use client';

/**
 * window.print() needs a client component, and that is the only reason this
 * file exists — the card itself, and the QR in it, stay server-rendered.
 */
export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-ink shadow-sm hover:bg-stone-50"
    >
      {children}
    </button>
  );
}
