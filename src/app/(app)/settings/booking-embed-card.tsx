'use client';

import { useState } from 'react';
import { Check, Code2, Copy, ExternalLink, Globe, Link2, QrCode } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { cn } from '@/lib/cn';

/**
 * PUTTING BOOKING ON THE SALON'S OWN WEBSITE.
 *
 * Most salons already have a site — a one-pager a cousin built, a Wix page, an
 * Instagram link-in-bio. They do not want a second website from us; they want
 * the "Book now" button on the one they have to work.
 *
 * So this card gives them three ways in, in order of how much help they need:
 * a link to paste anywhere, a button that opens booking over their own page,
 * and the booking flow embedded in the page itself. Every one of them writes
 * into the same diary the front desk is looking at.
 *
 * The snippets are shown as text to copy rather than downloaded as a file,
 * because the person doing this is usually forwarding it to whoever looks after
 * the website — and a WhatsApp message with two lines in it travels further
 * than an attachment.
 */
export function BookingEmbedCard({
  salonName,
  bookingUrl,
  embedSrc,
}: {
  salonName: string;
  bookingUrl: string;
  embedSrc: string;
}) {
  const scriptTag = `<script src="${embedSrc}" defer></script>`;

  const buttonSnippet = `${scriptTag}

<!-- Put this wherever you want a "Book now" button -->
<a href="${bookingUrl}" data-parlon-book data-ref="website">Book now</a>`;

  const inlineSnippet = `${scriptTag}

<!-- Booking appears inside the page, here -->
<div id="parlon-booking" data-ref="website"></div>`;

  return (
    <Card>
      <CardHeader
        title="Booking on your own website"
        subtitle="Wherever a customer books, the appointment lands in this diary"
      />
      <CardBody className="space-y-5">
        <Snippet
          icon={Link2}
          title="1. Just the link"
          blurb="Paste it into your Instagram bio, a WhatsApp status, a Google Business profile, or behind any button on your site. Nothing to install."
          value={bookingUrl}
          action={
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              Open it
              <ExternalLink className="h-3 w-3" />
            </a>
          }
        />

        <Snippet
          icon={Globe}
          title="2. A button on your site"
          blurb="Booking opens over your own page — the customer never leaves your website. Works on Wix, WordPress, Squarespace, Shopify or hand-written HTML."
          value={buttonSnippet}
          multiline
        />

        <Snippet
          icon={Code2}
          title="3. Booking inside the page"
          blurb="For a proper “Book an appointment” page of your own. The frame grows to fit each step, so there is no scrollbar inside a scrollbar."
          value={inlineSnippet}
          multiline
        />

        <div className="rounded-xl bg-stone-50 p-4">
          <p className="text-xs font-medium text-ink">What your web person should know</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-muted">
            <li>
              <code className="font-mono text-[11px] text-ink">data-ref</code> is a label of your choosing — use
              &ldquo;website&rdquo;, &ldquo;insta&rdquo;, &ldquo;offers-page&rdquo;. It shows on the appointment, so you
              can tell which one actually brings people in.
            </li>
            <li>
              <code className="font-mono text-[11px] text-ink">data-branch</code> and{' '}
              <code className="font-mono text-[11px] text-ink">data-service</code> start the customer on a particular
              shop or service, for a page about one of them.
            </li>
            <li>
              When a booking is made the page fires a <code className="font-mono text-[11px] text-ink">parlon:booked</code>{' '}
              event, if they want to hook up their own analytics.
            </li>
            <li>No card is ever asked for and no payment is taken — {salonName} is paid at the counter, as always.</li>
          </ul>
        </div>

        <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
          <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The same link works as a QR code on the counter or a mirror — any free QR generator will turn it into one.
        </p>
      </CardBody>
    </Card>
  );
}

function Snippet({
  icon: Icon,
  title,
  blurb,
  value,
  multiline,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  value: string;
  multiline?: boolean;
  action?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some embedded browsers; the text is on screen
      // and selectable, so there is nothing to recover from.
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-ink-subtle" />
        <p className="text-sm font-medium text-ink">{title}</p>
        <button
          type="button"
          onClick={copy}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
            copied ? 'text-emerald-700' : 'text-ink-muted hover:bg-stone-100 hover:text-ink',
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{blurb}</p>

      <pre
        className={cn(
          'mt-2 overflow-x-auto rounded-lg bg-stone-900 p-3 font-mono text-[11px] leading-relaxed text-stone-100',
          !multiline && 'whitespace-pre-wrap break-all',
        )}
      >
        {value}
      </pre>

      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}
