import Link from 'next/link';
import { cn } from '@/lib/cn';
import { count } from '@/lib/format';

/**
 * Tables are the workhorse of this app, so they are plain semantic markup with
 * a horizontal scroll container — never a virtualised grid the browser's find
 * cannot reach.
 */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto">
      <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-stone-200 bg-stone-50/60">{children}</thead>;
}

export function TH({
  children,
  align = 'left',
  className,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-stone-100">{children}</tbody>;
}

export function TR({
  children,
  href,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  return (
    <tr className={cn('transition-colors', href ? 'cursor-pointer hover:bg-brand-50/40' : 'hover:bg-stone-50/70', className)}>
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = 'left',
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'px-4 py-3 align-middle text-ink',
        align === 'right' && 'text-right tnum',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** A cell whose whole area navigates — keeps rows keyboard reachable. */
export function LinkCell({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('block font-medium text-ink hover:text-brand-700', className)}>
      {children}
    </Link>
  );
}

export function TableFooterNote({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-stone-200 px-4 py-2.5 text-xs text-ink-muted">{children}</div>;
}

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams = {},
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'page') params.set(key, value);
    }
    params.set('page', String(target));
    return `${basePath}?${params.toString()}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3 text-xs text-ink-muted">
      <span className="tnum">
        {count(from)}–{count(to)} of {count(total)}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 font-medium text-ink hover:bg-stone-50">
            Previous
          </Link>
        ) : (
          <span className="rounded-md border border-stone-200 px-2.5 py-1 text-ink-subtle">Previous</span>
        )}
        <span className="px-2 tnum">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 font-medium text-ink hover:bg-stone-50">
            Next
          </Link>
        ) : (
          <span className="rounded-md border border-stone-200 px-2.5 py-1 text-ink-subtle">Next</span>
        )}
      </div>
    </div>
  );
}
