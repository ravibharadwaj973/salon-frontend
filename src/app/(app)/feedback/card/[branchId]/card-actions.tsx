'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, MessageCircle, Printer, Share2 } from 'lucide-react';

/**
 * THE CARD IS NOT ONLY A THING TO PRINT.
 *
 * A printed card reaches the person standing at the counter. The same link
 * reaches everyone else — pasted into a WhatsApp reply, put in an Instagram
 * bio, sent to the stylist who asks customers herself. The QR and the link are
 * the same thing pointing at the same page; only the delivery differs, so all
 * of it belongs on one screen rather than making somebody retype a URL off a
 * printout.
 *
 * Everything here is a link out or a clipboard write. Nothing posts anywhere,
 * and nothing needs a third-party share SDK.
 */
export function CardActions({
  url,
  salonName,
  branchName,
  pngDataUrl,
}: {
  url: string;
  salonName: string;
  branchName: string;
  /** Generated on the server, so the download works with no canvas in the browser. */
  pngDataUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  /**
   * navigator.share exists on phones and almost nowhere else, and asking for
   * it during render would make the server and the browser disagree about what
   * the page contains. So it is checked after mount and the button simply is
   * not there on a desktop — better than one that does nothing when pressed.
   */
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && !!navigator.share), []);

  /**
   * What the salon is actually sending. Written as the salon, short enough to
   * read in a notification, and it says what it costs — "thirty seconds" is
   * the thing that makes somebody tap rather than close it.
   */
  const message = `How was your visit to ${salonName}? If you have thirty seconds, we would love to know — it really does help us. ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses the clipboard is not worth an error dialog —
      // the URL is printed on the card below, in full, to be read off.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-ink shadow-sm hover:bg-stone-50"
      >
        <Printer className="h-4 w-4" />
        Print
      </button>

      {/* wa.me with no number: WhatsApp opens on the contact picker, so the
          salon chooses who gets it — a customer, or the staff group. */}
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
      >
        <MessageCircle className="h-4 w-4" />
        Send on WhatsApp
      </a>

      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-ink shadow-sm hover:bg-stone-50"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>

      {/* The image, for a poster, a printer's email, or an Instagram story.
          PNG rather than the SVG on screen, because that is the format every
          design tool and print shop will accept without a question. */}
      <a
        href={pngDataUrl}
        download={`${salonName}-${branchName}-review-qr.png`.replace(/[^a-zA-Z0-9.-]+/g, '-')}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-ink shadow-sm hover:bg-stone-50"
      >
        <Download className="h-4 w-4" />
        Download QR
      </a>

      {canShare ? (
        <button
          type="button"
          onClick={() => void navigator.share({ title: salonName, text: message, url }).catch(() => {})}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-ink shadow-sm hover:bg-stone-50"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      ) : null}
    </div>
  );
}
