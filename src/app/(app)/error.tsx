'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

/**
 * The last line of defence for any screen in the app.
 *
 * Nothing routine should reach here — a refusal renders <PermissionGate />, a
 * missing record calls notFound() — so arriving here means something genuinely
 * broke. What matters is that a receptionist with a customer in front of them
 * sees a sentence and a button, not a stack trace and a file path.
 *
 * Next deliberately strips server-component error messages before they reach
 * the browser, leaving only a digest. That is a good thing — those messages can
 * carry query fragments and internal hostnames — so this does not try to
 * explain what happened. It shows the digest, which is the one thing that lets
 * someone find the matching line in the server log.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The browser console still gets the whole thing in development.
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <div className="px-6 py-10 text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </span>

        <h1 className="text-base font-semibold text-ink">This screen did not load</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          Something went wrong at our end. Nothing you were doing has been lost — try again, and if it keeps happening
          carry on at the desk and tell us.
        </p>

        <div className="mt-7 flex items-center justify-center gap-3">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Link href="/" className="text-sm font-medium text-ink-muted hover:text-ink">
            Back to the dashboard
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 font-mono text-2xs text-ink-subtle">Reference {error.digest}</p>
        ) : null}
      </div>
    </Card>
  );
}
