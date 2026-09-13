'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Star } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

interface BranchLink {
  id: string;
  name: string;
  city: string | null;
  googleReviewUrl: string | null;
}

/**
 * Where a happy customer gets sent.
 *
 * One link per branch, because each shop has its own Google listing and a
 * review left on the wrong one is wasted. The salon-wide link below is the
 * fallback for branches that have not been given their own.
 *
 * Only a customer who rated 4 or 5 ever sees this link. An unhappy one gets the
 * private form instead — sending them here is how a salon buys itself a public
 * one-star review.
 */
export function GoogleReviewCard({
  branches,
  tenantFallback,
  canEdit,
  canEditFallback,
}: {
  branches: BranchLink[];
  tenantFallback: string | null;
  /** branch.manage — per-shop links. */
  canEdit: boolean;
  /** tenant.manage — the salon-wide fallback lives on the salon record. */
  canEditFallback: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Google review link"
        subtitle="Customers who rate you 4 or 5 stars are offered this link. Everyone else goes to the private feedback form."
      />
      <CardBody className="space-y-4">
        {!canEdit && !canEditFallback ? (
          <p className="rounded-lg bg-stone-50 p-2.5 text-xs text-ink-muted">
            Only the owner, or someone who can manage branches, can change these links.
          </p>
        ) : null}

        {branches.map((branch) => (
          <LinkRow
            key={branch.id}
            label={branch.name}
            sub={branch.city ?? undefined}
            initial={branch.googleReviewUrl}
            placeholder={tenantFallback ? 'Using the salon-wide link' : 'https://g.page/r/…/review'}
            canEdit={canEdit}
            save={(value) => apiPatch(`branches/${branch.id}`, { googleReviewUrl: value })}
          />
        ))}

        <LinkRow
          label="Salon-wide link"
          sub="Used by any branch without its own"
          initial={tenantFallback}
          placeholder="https://g.page/r/…/review"
          canEdit={canEditFallback}
          save={(value) => apiPatch('tenant', { settings: { googleReviewUrl: value } })}
        />

        <div className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
          <p className="mb-1 font-medium text-ink">Where to find it</p>
          Google Business Profile &rarr; <span className="text-ink">Read reviews</span> &rarr;{' '}
          <span className="text-ink">Get more reviews</span>, then copy the short link. It looks like{' '}
          <span className="font-mono">https://g.page/r/CxxxxxxxxxxxxEBM/review</span>.{' '}
          <a
            href="https://support.google.com/business/answer/7035772"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
          >
            Google&rsquo;s instructions <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardBody>
    </Card>
  );
}

function LinkRow({
  label,
  sub,
  initial,
  placeholder,
  canEdit,
  save,
}: {
  label: string;
  sub?: string;
  initial: string | null;
  placeholder: string;
  canEdit: boolean;
  save: (value: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);

  const dirty = value.trim() !== saved;

  async function submit() {
    setBusy(true);
    try {
      await save(value.trim());
      setSaved(value.trim());
      toast.success(value.trim() ? `${label}: review link saved` : `${label}: review link removed`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} hint={sub}>
      {({ id }) => (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Star
              className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                saved ? 'text-brand-500' : 'text-stone-300'
              }`}
            />
            <Input
              id={id}
              type="url"
              inputMode="url"
              value={value}
              placeholder={placeholder}
              disabled={!canEdit || busy}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && dirty) void submit();
              }}
              className="pl-8"
            />
          </div>
          {saved && !dirty ? (
            <a
              href={saved}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 text-ink-muted hover:bg-stone-50"
              title="Open the link and check it goes to your review box"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!canEdit || !dirty} loading={busy} onClick={() => void submit()}>
            {dirty ? 'Save' : <Check className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </Field>
  );
}
