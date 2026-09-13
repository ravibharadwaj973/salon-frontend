'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { apiGet } from '@/lib/client';
import { Avatar } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { fromNow, fullName, money, phone as formatPhone } from '@/lib/format';
import type { CustomerMatch } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';

/**
 * "Have they been here before?"
 *
 * A receptionist typing a phone number into a *new* customer form is the
 * moment a duplicate is born — the same person, twice, with visit history split
 * between them and a birthday offer sent to one and not the other. The API
 * refuses a duplicate phone, but a refusal after the whole form is filled in
 * is the wrong moment. This asks the question while the number is being typed.
 *
 * It looks up on phone, email or name once there is enough to go on, and
 * hands back whichever row the user picks so the caller can decide what
 * "use them" means in that screen.
 */

/** Enough to be worth asking: four digits of a phone, or three characters of anything else. */
export function worthLookingUp(raw: string): boolean {
  const text = raw.trim();
  const digits = text.replace(/\D/g, '');
  return digits.length >= 4 || text.length >= 3;
}

export function useCustomerLookup(raw: string, options: { enabled?: boolean } = {}) {
  const query = useDebounced(raw.trim());
  const enabled = (options.enabled ?? true) && worthLookingUp(query);

  const result = useQuery({
    queryKey: ['customer-lookup', query],
    queryFn: () => apiGet<CustomerMatch[]>('customers/lookup', { query: { q: query } }),
    enabled,
    staleTime: 30_000,
  });

  return {
    matches: enabled ? (result.data ?? []) : [],
    exact: enabled ? (result.data ?? []).find((m) => m.exact) ?? null : null,
    searching: enabled && result.isFetching,
    active: enabled,
  };
}

/** What an exact match matched on, judged from what was typed. */
export function matchedOn(query: string): 'number' | 'email' {
  const text = query.trim();
  const digits = text.replace(/\D/g, '');
  return digits.length >= 4 && digits.length >= text.replace(/[\s+()-]/g, '').length ? 'number' : 'email';
}

export function CustomerMatchRow({
  match,
  onPick,
  action = 'Use',
  exactLabel = 'same number',
}: {
  match: CustomerMatch;
  onPick: (match: CustomerMatch) => void;
  action?: string;
  exactLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(match)}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-amber-100/60',
        match.exact && 'bg-amber-50',
      )}
    >
      <Avatar name={fullName(match)} id={match.id} size="xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">
          {fullName(match)}
          {match.exact ? (
            <span className="ml-1.5 rounded bg-amber-200 px-1 py-px text-2xs font-medium text-amber-900">
              {exactLabel}
            </span>
          ) : null}
        </span>
        <span className="tnum block truncate text-xs text-ink-muted">
          {formatPhone(match.phone)}
          {match.email ? ` · ${match.email}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block text-2xs text-ink-muted">
          {match.totalVisits} {match.totalVisits === 1 ? 'visit' : 'visits'}
          {Number(match.totalSpent) > 0 ? ` · ${money(match.totalSpent)}` : ''}
        </span>
        <span className="block text-2xs text-ink-subtle">
          {match.lastVisitAt ? `last ${fromNow(match.lastVisitAt)}` : `added ${fromNow(match.createdAt)}`}
        </span>
      </span>
      <span className="ml-1 shrink-0 text-xs font-medium text-brand-700">{action}</span>
    </button>
  );
}

/**
 * The panel that appears under a phone/email field. Renders nothing until
 * there is something to say, so it costs the form no space when the person
 * really is new.
 */
export function ExistingCustomerHint({
  query,
  onPick,
  action,
  enabled = true,
  className,
}: {
  query: string;
  onPick: (match: CustomerMatch) => void;
  action?: string;
  enabled?: boolean;
  className?: string;
}) {
  const { matches, exact, searching, active } = useCustomerLookup(query, { enabled });

  if (!active || (!searching && matches.length === 0)) return null;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-amber-200 bg-white', className)}>
      <div className="flex items-center gap-1.5 border-b border-amber-100 bg-amber-50 px-3 py-1.5">
        <History className="h-3.5 w-3.5 text-amber-700" />
        <p className="text-xs font-medium text-amber-900">
          {searching && matches.length === 0
            ? 'Checking…'
            : exact
              ? 'This is already a customer — open them instead'
              : 'Already in your book? Click a name to open them'}
        </p>
      </div>
      <div className="max-h-52 divide-y divide-stone-100 overflow-y-auto">
        {matches.map((match) => (
          <CustomerMatchRow
            key={match.id}
            match={match}
            onPick={onPick}
            action={action}
            exactLabel={`same ${matchedOn(query)}`}
          />
        ))}
      </div>
    </div>
  );
}
