import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { colorFor, initials, signedPercent } from '@/lib/format';

// ------------------------------------------------------------------ card ---

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-xl border border-stone-200 bg-white shadow-card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

// ----------------------------------------------------------------- badge ---

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  BOOKED: 'info',
  CONFIRMED: 'brand',
  CHECKED_IN: 'warning',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  ISSUED: 'info',
  DRAFT: 'neutral',
  VOID: 'neutral',
  REFUNDED: 'danger',
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  EXHAUSTED: 'neutral',
  RUNNING: 'brand',
  SCHEDULED: 'info',
  PAUSED: 'warning',
  NEW: 'info',
  CONTACTED: 'info',
  INTERESTED: 'brand',
  APPOINTMENT_BOOKED: 'brand',
  VISITED: 'success',
  CONVERTED: 'success',
  LOST: 'danger',
  BRONZE: 'neutral',
  SILVER: 'info',
  GOLD: 'warning',
  VIP: 'brand',
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

// ---------------------------------------------------------------- avatar ---

export function Avatar({
  name,
  src,
  id,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  id?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = { xs: 'h-6 w-6 text-2xs', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' }[size];
  const background = id ? colorFor(id) : '#B03A6B';

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ''} className={cn('rounded-full object-cover', dims, className)} />;
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', dims, className)}
      style={{ backgroundColor: background }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// ------------------------------------------------------------ stat tiles ---

export function StatTile({
  label,
  value,
  change,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: React.ReactNode;
  change?: number | null;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'negative';
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p
        className={cn(
          'tnum mt-1.5 text-2xl font-semibold tracking-tight',
          tone === 'positive' && 'text-emerald-700',
          tone === 'negative' && 'text-rose-700',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {change !== undefined && change !== null ? <DeltaPill value={change} /> : null}
        {hint ? <span className="text-ink-subtle">{hint}</span> : null}
      </div>
    </>
  );

  const className = 'block rounded-xl border border-stone-200 bg-white p-4 shadow-card';

  return href ? (
    <Link href={href} className={cn(className, 'transition-colors hover:border-brand-300')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function DeltaPill({ value, suffix = 'vs prev' }: { value: number; suffix?: string }) {
  const flat = Math.abs(value) < 0.05;
  const positive = value > 0;
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        flat ? 'text-ink-subtle' : positive ? 'text-emerald-600' : 'text-rose-600',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {flat ? '0%' : signedPercent(value, 1)}
      <span className="font-normal text-ink-subtle">{suffix}</span>
    </span>
  );
}

// ------------------------------------------------------------- states -----

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon ? (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-stone-100">
          <Icon className="h-5 w-5 text-ink-subtle" />
        </span>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-stone-200', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600', className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
