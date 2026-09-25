'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { apiGet, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, FormRow, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { count, dayjs } from '@/lib/format';

interface AuditRow {
  series: string;
  branch: string;
  count: number;
  first: number | null;
  last: number | null;
  missing: number[];
  truncated: boolean;
}

/**
 * EVERY BILL, IN ORDER, AS A FILE FOR THE ACCOUNTANT.
 *
 * Two things sit here rather than one, because handing over a file and finding
 * out afterwards that it has holes in it is the wrong order. The gap check runs
 * on screen first, so whatever is odd about the numbering is something the
 * salon discovers rather than their accountant or an officer.
 */
export function InvoiceExportCard() {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);

  const thisFy = (() => {
    const now = dayjs();
    const start = now.month() + 1 >= 4 ? now.year() : now.year() - 1;
    return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
  })();

  const [range, setRange] = useState({ financialYear: thisFy, from: '', to: '' });

  const query = new URLSearchParams(
    Object.entries({
      ...(range.financialYear ? { financialYear: range.financialYear } : {}),
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
    }),
  ).toString();

  async function check() {
    setChecking(true);
    try {
      setAudit(await apiGet<AuditRow[]>(`invoices/series-audit?${query}`));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }

  const years = (() => {
    const now = dayjs();
    const startYear = now.month() + 1 >= 4 ? now.year() : now.year() - 1;
    return Array.from({ length: 6 }, (_, i) => {
      const y = startYear - i;
      return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
    });
  })();

  return (
    <Card>
      <CardHeader
        title="Export bills"
        subtitle="Every bill in the order it was issued, for your accountant or your GST return"
      />
      <CardBody className="space-y-4">
        <FormRow>
          <Field label="Financial year">
            {({ id }) => (
              <Select
                id={id}
                value={range.financialYear}
                onChange={(e) => setRange({ ...range, financialYear: e.target.value })}
              >
                <option value="">Every year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Or a date range" hint="Optional">
            {({ id }) => (
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  type="date"
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                />
                <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
              </div>
            )}
          </Field>
        </FormRow>

        <div className="flex flex-wrap items-center gap-2">
          {/* A real link rather than a fetch: the browser handles the download,
              so a year of bills never has to sit in a JavaScript string first. */}
          {/* The same proxy path the customer export uses. */}
          <a
            href={`/api/proxy/invoices/export${query ? `?${query}` : ''}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </a>
          <Button variant="secondary" onClick={check} disabled={checking}>
            {checking ? 'Checking…' : 'Check the numbering first'}
          </Button>
        </div>

        <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
          <FileSpreadsheet className="mt-px h-3.5 w-3.5 shrink-0" />
          Sorted by bill number rather than by date, so each series reads as the continuous run it is meant to be.
          Cancelled bills are included and marked VOID — a cancelled number is not a number that may go missing, and a
          gap is a question somebody will ask.
        </p>

        {audit ? (
          <div className="space-y-2">
            {audit.length === 0 ? (
              <p className="text-xs text-ink-muted">No bills in this period.</p>
            ) : (
              audit.map((row) => (
                <div key={row.series} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-mono text-xs font-medium text-ink">{row.series}</p>
                    <p className="text-2xs text-ink-subtle">
                      {row.branch} · {count(row.count)} bills · {row.first} to {row.last}
                    </p>
                  </div>

                  {row.missing.length === 0 ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      No gaps — every number from {row.first} to {row.last} is accounted for.
                    </p>
                  ) : (
                    <p className="mt-1.5 flex items-start gap-1.5 text-2xs leading-relaxed text-amber-800">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>
                        {count(row.missing.length)}
                        {row.truncated ? '+' : ''} missing:{' '}
                        <span className="font-mono">{row.missing.slice(0, 24).join(', ')}</span>
                        {row.missing.length > 24 ? ' …' : ''}. A gap is usually a bill deleted before it was settled, but
                        it is worth knowing which ones before anybody asks.
                      </span>
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
