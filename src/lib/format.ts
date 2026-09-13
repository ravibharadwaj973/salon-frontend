import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { Money } from './types';

dayjs.extend(relativeTime);

export { dayjs };

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export function num(value: Money | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return typeof value === 'number' ? value : Number(value);
}

/** ₹1,23,457 — whole rupees, which is how salon owners read money. */
export function money(value: Money | null | undefined): string {
  return inr.format(num(value));
}

/** ₹1,23,456.78 — used on invoices, where paise matter. */
export function moneyExact(value: Money | null | undefined): string {
  return inrPrecise.format(num(value));
}

/** ₹1.2L — for tiles where space is tight. */
export function moneyCompact(value: Money | null | undefined): string {
  return `₹${compact.format(num(value))}`;
}

export function count(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN').format(value ?? 0);
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function signedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function date(value: string | Date | null | undefined, format = 'DD MMM YYYY'): string {
  if (!value) return '—';
  return dayjs(value).format(format);
}

export function time(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('h:mm A');
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD MMM, h:mm A');
}

export function fromNow(value: string | Date | null | undefined): string {
  if (!value) return 'never';
  return dayjs(value).fromNow();
}

export function dayKey(value: string | Date = new Date()): string {
  return dayjs(value).format('YYYY-MM-DD');
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function fullName(person: { firstName: string; lastName?: string | null } | null | undefined): string {
  if (!person) return 'Walk-in';
  return `${person.firstName} ${person.lastName ?? ''}`.trim();
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function phone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return value;
}

/** Deterministic pastel for an id, so a stylist keeps the same colour everywhere. */
export function colorFor(id: string): string {
  const palette = ['#DE4680', '#7C5CD6', '#2F9E8F', '#D97706', '#3B82F6', '#DB2777', '#0EA5E9', '#65A30D'];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return palette[hash % palette.length]!;
}

export function pluralise(n: number, singular: string, plural?: string): string {
  return `${count(n)} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}
