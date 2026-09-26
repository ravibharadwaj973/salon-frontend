'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Globe } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

/**
 * THE SALON'S OWN WEBSITE, AND THE THREE THINGS IT UNLOCKS.
 *
 * This is not a contact detail. Setting it turns on:
 *
 *   1. {{website_link}} and {{gallery_link}} in messages. Until it is set,
 *      any template using them will not send at all — which is the right
 *      behaviour, and stated below so it is not a mystery.
 *   2. The arrival token on tracked links pointing at this address. Links to
 *      anywhere else never carry one.
 *   3. The "Opened the website" stage in campaign results, which is otherwise
 *      missing from the funnel entirely.
 *
 * Said plainly on the card, because a field whose effects are invisible is a
 * field that stays empty.
 */
export function WebsiteCard({ initial, canEdit }: { initial: string | null; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);

  const dirty = value.trim() !== saved;

  async function submit() {
    setBusy(true);
    try {
      await apiPatch('tenant', { websiteUrl: value.trim() });
      setSaved(value.trim());
      toast.success(value.trim() ? 'Website saved' : 'Website removed');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your website"
        subtitle="Where customers go when a message points them at your own site."
      />
      <CardBody className="space-y-3">
        <Field label="Address" hint="Include https://">
          {({ id }) => (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Globe
                  className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                    saved ? 'text-brand-500' : 'text-stone-300'
                  }`}
                />
                <Input
                  id={id}
                  type="url"
                  inputMode="url"
                  value={value}
                  placeholder="https://yoursalon.in"
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
                  title="Open your website"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <Button
                size="sm"
                variant={dirty ? 'primary' : 'secondary'}
                disabled={!canEdit || !dirty}
                loading={busy}
                onClick={() => void submit()}
              >
                {dirty ? 'Save' : <Check className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </Field>

        <div className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
          <p className="mb-1 font-medium text-ink">What this switches on</p>
          Messages can use <span className="font-mono">{'{{website_link}}'}</span> and{' '}
          <span className="font-mono">{'{{gallery_link}}'}</span>. Links in your messages that point here start
          carrying a code, so campaign results can show who opened your site afterwards — and links to anywhere else
          never carry one.
          {!saved ? (
            <p className="mt-1.5 text-ink">
              Until this is filled in, a template using those two will not send rather than send a sentence ending
              in nothing.
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
