'use client';

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  skippedRows: {
    row: number;
    /** Line number in the file as a spreadsheet shows it, header counted. */
    line: number;
    name: string;
    phone: string;
    email: string;
    reason: string;
  }[];
  /** Columns in the file that no field matched — their values were not stored. */
  ignoredColumns?: string[];
}

const SAMPLE = `firstName,lastName,phone,email,gender,dob,tags,notes
Priya,Sharma,9876543210,priya@example.com,F,1994-08-12,bridal,Prefers Riya
Rahul,Verma,9876543211,,M,,,`;

export function ImportForm() {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function downloadFailed() {
    if (!result?.skippedRows.length) return;
    const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csvOut = [
      'line,firstName,phone,email,reason',
      ...result.skippedRows.map((row) =>
        [row.line, escape(row.name), escape(row.phone), escape(row.email), escape(row.reason)].join(','),
      ),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csvOut], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `not-imported-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    if (!csv.trim()) {
      toast.error('Paste some CSV or choose a file first');
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost<ImportResult>('customers/import', { csv, source: 'CSV_IMPORT' });
      setResult(response);
      toast.success(`${response.imported} customers imported`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Paste or upload a CSV" subtitle="A header row is required" />
        <CardBody className="space-y-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-ink-muted hover:border-brand-300 hover:bg-brand-50/40">
            <Upload className="h-4 w-4" />
            {fileName ?? 'Choose a .csv file'}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
          </label>

          <Textarea
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={10}
            placeholder={SAMPLE}
            className="font-mono text-xs"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCsv(SAMPLE)}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Use a sample row
            </button>
            <Button onClick={submit} loading={loading}>
              Import customers
            </Button>
          </div>

          {result ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                {result.imported} imported, {result.skipped} skipped of {result.total} rows
              </p>
              <Link href="/customers" className="mt-3 inline-block text-xs font-medium text-emerald-900 underline">
                See your customers
              </Link>
            </div>
          ) : null}

          {result?.ignoredColumns?.length ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                {result.ignoredColumns.length === 1 ? 'One column was' : `${result.ignoredColumns.length} columns were`}{' '}
                not recognised
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                Nothing in {result.ignoredColumns.length === 1 ? 'it' : 'them'} was saved. Rename the column to one of
                the names on the right and import again — duplicates are skipped, so re-importing the same file is safe.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {result.ignoredColumns.map((column) => (
                  <li key={column}>
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-2xs text-amber-900">
                      {column}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result && result.skippedRows.length > 0 ? (
            <div className="rounded-lg border border-stone-300 bg-white">
              <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {result.skipped} {result.skipped === 1 ? 'row was' : 'rows were'} not imported
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Line numbers match your file as a spreadsheet shows it. Fix these and import again — the
                    {' '}{result.imported} already added will be skipped as duplicates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadFailed}
                  className="shrink-0 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-stone-50"
                >
                  <Download className="mr-1 inline h-3 w-3" />
                  Download these rows
                </button>
              </div>

              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-stone-50 text-2xs uppercase tracking-wide text-ink-subtle">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Line</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Phone</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="px-4 py-2 font-semibold">Why it was not imported</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {result.skippedRows.map((row) => (
                      <tr key={row.row} className="align-top">
                        <td className="tnum px-4 py-2 font-medium text-ink">{row.line}</td>
                        <td className="px-3 py-2 text-ink">{row.name || <span className="text-ink-subtle">—</span>}</td>
                        <td className="tnum px-3 py-2 text-ink">
                          {row.phone || <span className="text-ink-subtle">—</span>}
                        </td>
                        <td className="px-3 py-2 text-ink-muted">
                          {row.email || <span className="text-ink-subtle">—</span>}
                        </td>
                        <td className="px-4 py-2 text-ink-muted">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Column names" subtitle="Case and spacing are ignored" />
        <CardBody>
          <ul className="space-y-2 text-xs">
            {[
              ['firstName / name / customerName', 'Required'],
              ['lastName / surname', 'Optional — split from name if absent'],
              ['phone / mobile / contact', 'Required, 10 digits'],
              ['email / emailId / emailAddress', 'Optional'],
              ['gender / sex', 'M / F / anything'],
              ['dob / birthday / dateOfBirth', 'YYYY-MM-DD or DD/MM/YYYY'],
              ['tags / labels', 'Separated by ; or |'],
              ['notes / remarks / comments', 'Optional'],
            ].map(([column, note]) => (
              <li key={column} className="flex items-start justify-between gap-3">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-2xs text-ink">{column}</code>
                <span className="text-right text-ink-muted">{note}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
            <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Imported customers are not opted in to marketing. Ask for consent before sending offers — the system will
            refuse marketing messages to anyone who has not opted in.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
