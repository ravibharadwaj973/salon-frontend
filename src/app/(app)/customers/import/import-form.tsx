'use client';

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  skippedRows: { row: number; phone: string; reason: string }[];
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
              {result.skippedRows.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-emerald-800">Why were rows skipped?</summary>
                  <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-xs text-emerald-800">
                    {result.skippedRows.map((row) => (
                      <li key={`${row.row}-${row.phone}`}>
                        Row {row.row}: {row.reason} {row.phone ? `(${row.phone})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <Link href="/customers" className="mt-3 inline-block text-xs font-medium text-emerald-900 underline">
                See your customers
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Column names" subtitle="Case and spacing are ignored" />
        <CardBody>
          <ul className="space-y-2 text-xs">
            {[
              ['firstName / name', 'Required'],
              ['lastName', 'Optional — split from name if absent'],
              ['phone / mobile / contact', 'Required, 10 digits'],
              ['email', 'Optional'],
              ['gender', 'M / F / anything'],
              ['dob / birthday', 'YYYY-MM-DD or DD/MM/YYYY'],
              ['tags', 'Separated by ; or |'],
              ['notes / remarks', 'Optional'],
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
