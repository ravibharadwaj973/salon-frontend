'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquareHeart } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

export interface FeedbackFormSettings {
  enabled: boolean;
  heading: string;
  prompt: string;
  phone: 'required' | 'optional' | 'off';
  showReviews: boolean;
}

/**
 * THE FEEDBACK SECTION ON THE SALON'S OWN WEBSITE.
 *
 * Every salon wants different wording and some want no form at all, so the
 * words live here rather than in the website's code — the owner changes them
 * on their phone between clients instead of asking a developer.
 *
 * Two things the card is explicit about, because getting either wrong is the
 * kind of mistake somebody only discovers from a customer:
 *
 *  - NOTHING IS PUBLISHED AUTOMATICALLY. "Show reviews" decides whether the
 *    section appears at all; each individual review still has to be published
 *    from the Feedback screen. A form that put a stranger's words on the
 *    salon's page the moment they pressed send would be a defacement tool with
 *    a rating attached.
 *  - THESE RATINGS ARE NOT IN THE SALON'S AVERAGE. They are unverified, and
 *    an average a competitor can move is not a measurement. Said here rather
 *    than left for somebody to notice that two numbers disagree.
 */
export function FeedbackFormCard({
  initial,
  canEdit,
  hasWebsite,
}: {
  initial: FeedbackFormSettings;
  canEdit: boolean;
  /** Whether a website address is set — without one there is nowhere to show. */
  hasWebsite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof FeedbackFormSettings>(key: K, value: FeedbackFormSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setBusy(true);
    try {
      await apiPatch('tenant', { settings: { feedbackForm: form } });
      setSaved(form);
      toast.success('Feedback section saved');
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
        title="Feedback on your website"
        subtitle="A form on your own site, in your words. Separate from the review request that goes out after a visit."
        action={
          <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!canEdit || !dirty} loading={busy} onClick={() => void submit()}>
            Save
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {!hasWebsite ? (
          <p className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
            Add your website address above first — there is nowhere to show this until you have.
          </p>
        ) : null}

        <Checkbox
          label="Let people leave feedback from my website"
          description="Off by default. While it is off, nobody can submit anything — including a competitor with a spare afternoon."
          checked={form.enabled}
          disabled={!canEdit}
          onChange={(event) => set('enabled', event.target.checked)}
        />

        <Field label="Heading" hint="What the section is called on your site">
          {({ id }) => (
            <Input
              id={id}
              value={form.heading}
              maxLength={80}
              disabled={!canEdit}
              placeholder="How did we do?"
              onChange={(event) => set('heading', event.target.value)}
            />
          )}
        </Field>

        <Field label="One line underneath" hint="Why somebody should bother">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={form.prompt}
              maxLength={240}
              disabled={!canEdit}
              placeholder="We read every one of these, and they go straight to the owner."
              onChange={(event) => set('prompt', event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Ask for a phone number"
          hint="A complaint from nobody is a complaint you cannot put right"
        >
          {({ id }) => (
            <Select
              id={id}
              value={form.phone}
              disabled={!canEdit}
              onChange={(event) => set('phone', event.target.value as FeedbackFormSettings['phone'])}
            >
              <option value="required">Yes, and require it</option>
              <option value="optional">Yes, but optional</option>
              <option value="off">Do not ask</option>
            </Select>
          )}
        </Field>

        <Checkbox
          label="Show approved reviews on my website"
          description="Only ones you publish yourself, one at a time, from the Feedback screen — and only the first name."
          checked={form.showReviews}
          disabled={!canEdit}
          onChange={(event) => set('showReviews', event.target.checked)}
        />

        <div className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
          <MessageSquareHeart className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Ratings left here are <span className="font-medium text-ink">not counted in your average</span>. Anyone
            with your web address can leave one, so mixing them in would make the number you judge yourself by
            something a stranger can move. They are listed separately on the Feedback screen.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
