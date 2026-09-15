import Link from 'next/link';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { Card } from '@/components/ui/display';
import { permissionLabel } from '@/lib/permissions';

/**
 * What someone sees when the server refuses a screen.
 *
 * Being refused is not an error. It is the system working: roles exist so that
 * the person on the desk cannot read the takings and the stylist cannot edit
 * everyone's pay. So this reads as a plain fact, with no stack trace, no
 * "something went wrong", and no suggestion to try again — trying again will
 * not help, and implying it might just wastes their time.
 *
 * It names the permission in the same words their manager sees when granting
 * it, so "ask for 'see bills'" is a conversation that can actually happen.
 * It deliberately does NOT say who has it — that is a question about other
 * people's access, and this page is not the place to enumerate it.
 */
export function PermissionGate({
  permission,
  /** What they were trying to reach, in the salon's own words. */
  what,
  backHref = '/',
  backLabel = 'Back to the dashboard',
}: {
  permission?: string;
  what?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const label = permission ? permissionLabel(permission) : null;

  return (
    <Card className="mx-auto max-w-lg">
      <div className="px-6 py-10 text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-stone-100">
          <ShieldOff className="h-5 w-5 text-ink-subtle" />
        </span>

        <h1 className="text-base font-semibold text-ink">You do not have permission for this</h1>

        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          {what ? `${what} ` : ''}
          {label
            ? `Your role does not include “${label}”.`
            : 'Your role does not include this screen.'}{' '}
          Ask the salon owner, or whoever manages your team, to turn it on for you.
        </p>

        {permission ? (
          <p className="mt-4 inline-block rounded-lg bg-stone-50 px-2.5 py-1 font-mono text-2xs text-ink-subtle">
            {permission}
          </p>
        ) : null}

        <div className="mt-7">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      </div>
    </Card>
  );
}
