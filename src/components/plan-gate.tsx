import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/display';

/**
 * What a salon sees when it opens a screen its plan does not include.
 *
 * The nav already hides these links, so arriving here means a bookmark, a typed
 * URL, or a link someone shared. It should read as a plain fact about the plan,
 * not as an error — and it should say what the feature actually does, because
 * the person reading it has never seen the screen behind it.
 */
export function PlanGate({
  title,
  what,
  children,
  planName,
}: {
  title: string;
  /** One sentence: what this screen would let them do. */
  what: string;
  /** The specific things they would get. */
  children?: React.ReactNode;
  planName?: string | null;
}) {
  return (
    <Card className="mx-auto max-w-xl">
      <div className="px-6 py-10 text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-stone-100">
          <Lock className="h-5 w-5 text-ink-subtle" />
        </span>
        <h1 className="text-base font-semibold text-ink">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{what}</p>

        {children ? <div className="mx-auto mt-5 max-w-sm text-left">{children}</div> : null}

        <p className="mt-6 text-xs text-ink-subtle">
          {planName ? `You are on ${planName}. ` : ''}Moving to Grow turns this on.
        </p>
        <Link
          href="/usage"
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          See your plan
        </Link>
      </div>
    </Card>
  );
}

/** The bullet list inside a PlanGate. */
export function PlanGateList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
          {item}
        </li>
      ))}
    </ul>
  );
}
