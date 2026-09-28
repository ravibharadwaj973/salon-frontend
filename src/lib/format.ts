import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Money } from './types';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

/**
 * THE SALON'S CLOCK — NOT THE SERVER'S, AND NOT THE VIEWER'S.
 *
 * ── The bug this fixes ────────────────────────────────────────────────────
 *
 * `dayjs(value).format('h:mm A')` formats in whatever timezone the RUNTIME is
 * in. Half these pages are server components, and the container's clock is
 * UTC, so a bill taken at 9:30pm in Lucknow was listed as 4:00 PM. The same
 * page rendered on the client would have said 9:30 PM. One invoice, two
 * times, depending on which side of the render it came from — and the wrong
 * one is the one printed on the bill list a salon reconciles the till against.
 *
 * ── Why a fixed zone rather than the viewer's ─────────────────────────────
 *
 * Using the browser's timezone would have fixed the symptom and left a worse
 * bug: an owner checking takings from Dubai would see every appointment shift
 * by an hour and a half, and "today" would start at a different moment for
 * them than for the front desk. A salon's day is a fact about the shop. It
 * does not move because somebody is travelling.
 *
 * Build-time for now, because this app is one-country by construction — INR,
 * GST, financial years starting in April. When it is not, this reads the
 * tenant's own timezone instead and everything else here stays as it is.
 */
export const SALON_TZ = process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Kolkata';

/** Date-only, with no instant in it: "2026-09-28", a birthday, a holiday. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One instant, read on the salon's clock.
 *
 * A date-only string is anchored IN the zone rather than converted into it.
 * Converting means parsing it as midnight wherever the reader happens to be
 * and then shifting — which lands on the previous day for anybody east of
 * India, and turns a holiday on the 28th into the 27th.
 */
function inZone(value: string | Date): dayjs.Dayjs {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return dayjs.tz(value, SALON_TZ);
  return dayjs(value).tz(SALON_TZ);
}

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
  return inZone(value).format(format);
}

export function time(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return inZone(value).format('h:mm A');
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return inZone(value).format('DD MMM, h:mm A');
}

/**
 * "3 hours ago" needs no zone — it is a gap between two instants, and a gap is
 * the same length everywhere. Left on plain dayjs deliberately.
 */
export function fromNow(value: string | Date | null | undefined): string {
  if (!value) return 'never';
  return dayjs(value).fromNow();
}

/**
 * Which day something belongs to, on the salon's clock.
 *
 * This one matters more than it looks: it decides what "today" means. On UTC
 * every bill taken after 5:30pm IST fell into the next day, so an evening's
 * takings landed on tomorrow's total and the day a salon closes up never
 * matched the day the app was totalling.
 */
export function dayKey(value: string | Date = new Date()): string {
  return inZone(value).format('YYYY-MM-DD');
}

/**
 * TODAY, AND THE RANGES MEASURED BACK FROM IT — ON THE SALON'S CLOCK.
 *
 * These exist so that no page computes a date from `dayjs()` directly. Every
 * one of them used to, which meant "today" was the server's UTC today: a
 * report opened at 11pm in Lucknow defaulted to the range ending YESTERDAY,
 * and for five and a half hours every evening the takings page quietly
 * disagreed with the till.
 *
 * The month boundary is the same story once a month, and worse, because
 * "this month" on the 1st of October at 2am IST is September in UTC.
 */
export function today(): string {
  return dayKey();
}

export function monthStart(): string {
  return dayjs().tz(SALON_TZ).startOf('month').format('YYYY-MM-DD');
}

export function daysAgo(days: number): string {
  return dayjs().tz(SALON_TZ).subtract(days, 'day').format('YYYY-MM-DD');
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
