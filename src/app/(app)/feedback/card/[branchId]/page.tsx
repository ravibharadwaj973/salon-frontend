import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';
import { apiFetch, apiFetchList } from '@/lib/api';
import { CardActions } from './card-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review card' };

interface Branch {
  id: string;
  name: string;
}
interface Tenant {
  name: string;
}

/**
 * THE CARD THAT GOES BY THE TILL.
 *
 * ── Why the QR is drawn on the server ─────────────────────────────────────
 *
 * As an SVG, in the page's own HTML, with no client JavaScript. Three reasons,
 * and the third is the one that matters: it prints at whatever size the paper
 * is rather than at whatever size a canvas was rasterised to; it cannot be
 * half-rendered when somebody hits Print a second after the page opens; and
 * this is a thing a salon prints ONCE and sticks to a counter for a year, so
 * a blurry code is not a cosmetic problem, it is a code that does not scan.
 *
 * Error correction is left at M. Higher levels survive a scuffed print but
 * make the pattern denser, and a denser code at counter distance in salon
 * lighting is the worse trade — this card lives indoors under a lamp.
 */
export default async function ReviewCardPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;

  const [branches, tenant] = await Promise.all([
    apiFetchList<Branch>('/branches', { query: { pageSize: 50 } }).catch(() => null),
    apiFetch<Tenant>('/tenants/me').catch(() => null),
  ]);

  const branch = branches?.data.find((row) => row.id === branchId);
  if (!branch) notFound();

  /**
   * Absolute, because this URL is about to be printed on paper and carried
   * out of the building. A relative one would resolve against nothing.
   */
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jharavi.in';
  const url = `${base.replace(/\/$/, '')}/feedback/qr/${branch.id}`;

  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 340,
      errorCorrectionLevel: 'M',
      color: { dark: '#1c1917', light: '#ffffff' },
    }),
    /**
     * A second copy as PNG, for downloading.
     *
     * The SVG on screen is what prints; this is what gets dropped into a
     * poster, emailed to a print shop or put in an Instagram story, and PNG is
     * the format all three accept without a question. Generated at 1024px
     * because a QR downloaded at screen size and then blown up to A4 is a
     * code that no longer scans — the one failure a salon would not think to
     * check before printing two hundred of them.
     */
    QRCode.toDataURL(url, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1c1917', light: '#ffffff' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Everything outside the card itself is hidden when printing. */}
      <div className="mb-5 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href="/feedback" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          Back to feedback
        </Link>
        <CardActions
          url={url}
          salonName={tenant?.name ?? 'Our salon'}
          branchName={branch.name}
          pngDataUrl={pngDataUrl}
        />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center shadow-card print:border-0 print:shadow-none">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-subtle">
          {tenant?.name ?? 'Our salon'}
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-ink">How did we do today?</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          Point your camera at the code. It takes about thirty seconds, and it genuinely helps us.
        </p>

        {/* The code itself. Inlined SVG so it prints at the paper's resolution
            rather than the screen's. */}
        <div
          className="mx-auto mt-7 w-[340px] max-w-full"
          aria-label="Scan to leave feedback"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="mt-6 text-sm font-medium text-ink">{branch.name}</p>
        {/* Printed under the code so somebody whose camera will not scan can
            still type it. A card that only works for people with a working
            scanner is a card that quietly excludes the older half of the book. */}
        <p className="mt-1 break-all text-2xs text-ink-subtle">{url}</p>
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-ink-muted print:hidden">
        One card per branch — this one files everything under <strong>{branch.name}</strong>. Print it, and put
        it where somebody waits: the till, the mirror station, the back of the door.
      </p>
    </div>
  );
}
