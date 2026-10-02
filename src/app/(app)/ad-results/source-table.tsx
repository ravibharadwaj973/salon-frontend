'use client';

import { useState } from 'react';
import { Check, Copy, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table, TableFooterNote } from '@/components/ui/table';
import { count, money, percent } from '@/lib/format';
import { useToast } from '@/components/ui/overlay';
import { SourceEditor } from './source-editor';
import { CHANNEL_LABELS, KIND_LABELS, type Source, type SourceResult } from './types';

/** An em dash, not a zero. See the note on costPerBooking in ./types. */
const NOTHING = '—';

function CopyLink({ link }: { link: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /*
       * Clipboard access needs a secure context and a permission the browser
       * can refuse. Failing silently would leave the salon tapping a button
       * that does nothing, so fall back to showing them the link to copy by
       * hand -- the link is the only way clicks get recorded at all.
       */
      toast.error(`Copy it by hand: ${link}`);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={link}
      aria-label={copied ? 'Link copied' : `Copy the link for this promotion`}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2 py-1 text-2xs font-medium text-ink-muted hover:text-ink"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

/**
 * The table IS the chart's accessible twin -- every figure plotted above is a
 * column here, so identity is never carried by colour alone -- and it is also
 * where the numbers the chart deliberately leaves out live: the funnel from a
 * tap to a bill, and the two ratios.
 */
export function SourceTable({ results, sources }: { results: SourceResult[]; sources: Source[] }) {
  const byId = new Map(sources.map((source) => [source.id, source]));

  const rows = [...results].sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);

  const totals = rows.reduce(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      clicks: sum.clicks + row.clicks,
      conversations: sum.conversations + row.conversations,
      bookings: sum.bookings + row.bookings,
      revenue: sum.revenue + row.revenue,
    }),
    { spend: 0, clicks: 0, conversations: 0, bookings: 0, revenue: 0 },
  );

  const unpaid = rows.filter((row) => row.spend === 0).length;

  return (
    <>
      <Table className="min-w-[860px]">
        <THead>
          <TR>
            <TH>Promotion</TH>
            <TH>Link</TH>
            <TH align="right">Spent</TH>
            <TH align="right">Taps</TH>
            <TH align="right">DMs</TH>
            <TH align="right">Booked</TH>
            <TH align="right">Billed</TH>
            <TH align="right">Cost / booking</TH>
            <TH align="right">Back per &#8377;1</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const source = byId.get(row.id);
            return (
              <TR key={row.id}>
                <TD>
                  <div className="font-medium text-ink">{row.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-subtle">
                    <span>{CHANNEL_LABELS[row.channel] ?? row.channel}</span>
                    <span aria-hidden>&middot;</span>
                    <span>{KIND_LABELS[row.kind] ?? row.kind}</span>
                    {!row.isActive ? <Badge tone="neutral">Stopped</Badge> : null}
                  </div>
                </TD>
                <TD>{source ? <CopyLink link={source.link} /> : <span className="text-2xs text-ink-subtle">{NOTHING}</span>}</TD>
                <TD align="right">{row.spend > 0 ? money(row.spend) : NOTHING}</TD>
                <TD align="right">{count(row.clicks)}</TD>
                <TD align="right">{count(row.conversations)}</TD>
                <TD align="right">
                  <div>{count(row.bookings)}</div>
                  {/* Of the taps, how many became an appointment. Omitted rather
                      than shown as 0% when nobody tapped -- a promotion whose
                      bookings all arrived by DM has no tap-to-booking rate. */}
                  {row.clicks > 0 ? (
                    <div className="text-2xs font-normal text-ink-subtle">
                      {percent((row.bookings / row.clicks) * 100, 0)} of taps
                    </div>
                  ) : null}
                </TD>
                <TD align="right">
                  <div>{row.revenue > 0 ? money(row.revenue) : NOTHING}</div>
                  {row.bookings > 0 ? (
                    <div className="text-2xs font-normal text-ink-subtle">
                      {count(row.billed)} of {count(row.bookings)} billed
                    </div>
                  ) : null}
                </TD>
                <TD align="right">
                  {row.costPerBooking !== null ? (
                    money(row.costPerBooking)
                  ) : (
                    <span title="Nothing was spent on this one, so it has no cost per booking">{NOTHING}</span>
                  )}
                </TD>
                <TD align="right">
                  {row.returnOnSpend !== null ? (
                    <span className={row.returnOnSpend >= 1 ? 'font-medium text-emerald-700' : 'text-ink'}>
                      {money(row.returnOnSpend)}
                    </span>
                  ) : (
                    <span title="Nothing was spent on this one, so there is nothing to divide">{NOTHING}</span>
                  )}
                </TD>
                <TD align="right">
                  {source ? (
                    <SourceEditor
                      source={source}
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          aria-label={`Edit ${row.name}`}
                          className="rounded-md p-1.5 text-ink-subtle hover:bg-stone-100 hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    />
                  ) : null}
                </TD>
              </TR>
            );
          })}

          {rows.length > 1 ? (
            <TR className="bg-stone-50/60">
              <TD className="font-medium text-ink">All promotions</TD>
              <TD />
              <TD align="right" className="font-medium">
                {totals.spend > 0 ? money(totals.spend) : NOTHING}
              </TD>
              <TD align="right" className="font-medium">
                {count(totals.clicks)}
              </TD>
              <TD align="right" className="font-medium">
                {count(totals.conversations)}
              </TD>
              <TD align="right" className="font-medium">
                {count(totals.bookings)}
              </TD>
              <TD align="right" className="font-medium">
                {totals.revenue > 0 ? money(totals.revenue) : NOTHING}
              </TD>
              <TD align="right" className="font-medium">
                {totals.spend > 0 && totals.bookings > 0 ? money(totals.spend / totals.bookings) : NOTHING}
              </TD>
              <TD align="right" className="font-medium">
                {totals.spend > 0 ? money(totals.revenue / totals.spend) : NOTHING}
              </TD>
              <TD />
            </TR>
          ) : null}
        </TBody>
      </Table>

      {unpaid > 0 ? (
        <TableFooterNote>
          {unpaid === 1 ? 'One promotion has' : `${count(unpaid)} promotions have`} no spend recorded, so they have no
          cost per booking. That is right for an ordinary post &mdash; and worth fixing if you did pay for it.
        </TableFooterNote>
      ) : null}
    </>
  );
}
