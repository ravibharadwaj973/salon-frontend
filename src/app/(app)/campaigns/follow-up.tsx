'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Info, Send, Users } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { count } from '@/lib/format';
import type { Campaign } from '@/lib/types';

interface AudienceRow {
  audience: string;
  label: string;
  meaning: string;
  suggestion: string;
  followUpSensible: boolean;
  count: number;
}

/**
 * FOLLOW UP WITH PART OF A CAMPAIGN'S AUDIENCE.
 *
 * The thing this replaces is exporting a list and guessing. After a send, "the
 * thousand people I messaged" is the least useful way to think about them:
 * whoever tapped the button and did not book is hesitating, whoever the message
 * never reached has a wrong number, and sending both the same nudge annoys one
 * and wastes a message on the other.
 *
 * The group is a RULE, not a list — resolved again when the follow-up actually
 * sends. So somebody who books on Friday is gone from "read but has not booked"
 * by Monday without anything having to remember to remove them. The panel says
 * so, because a count that changes between reading it and sending looks like a
 * bug unless you know why.
 */
export function FollowUpPanel({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<AudienceRow[] | null>(null);
  const [chosen, setChosen] = useState<AudienceRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<AudienceRow[]>(`campaigns/${campaign.id}/audiences`)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  if (!rows) {
    return (
      <Card>
        <CardHeader title="What everyone did" />
        <CardBody>
          <p className="text-xs text-ink-muted">Working out who did what…</p>
        </CardBody>
      </Card>
    );
  }

  const anyone = rows.some((r) => r.count > 0);

  return (
    <>
      <Card>
        <CardHeader
          title="What everyone did"
          subtitle="Each person appears once, in the furthest stage they reached"
        />
        <CardBody className="space-y-2">
          {!anyone ? (
            <p className="text-xs text-ink-muted">Nobody has been messaged by this campaign yet.</p>
          ) : (
            rows.map((row) =>
              /**
               * An empty group is one line, not a paragraph.
               *
               * Every group carried three lines of advice whether or not
               * anybody was in it, so a campaign with four people in one group
               * showed six explanations of what to do about nobody. Advice is
               * worth reading when there is somebody to act on; otherwise it is
               * the thing you scroll past to reach the number, and scrolling
               * past is a habit that outlives the empty groups.
               */
              row.count === 0 ? (
                <div
                  key={row.audience}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5"
                >
                  <span className="text-2xs text-ink-subtle">{row.label}</span>
                  <span className="tnum text-2xs text-ink-subtle">0</span>
                </div>
              ) : (
                <div
                  key={row.audience}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-stone-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Users className="h-3.5 w-3.5 text-ink-subtle" />
                      {row.label}
                      <span className="tnum text-ink-muted">{count(row.count)}</span>
                    </p>
                    <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">{row.meaning}</p>
                    <p className="mt-1 text-2xs leading-relaxed text-ink-subtle">{row.suggestion}</p>
                  </div>

                  {row.followUpSensible ? (
                    <Button size="sm" variant="secondary" onClick={() => setChosen(row)}>
                      <Send className="h-3.5 w-3.5" />
                      Follow up
                    </Button>
                  ) : (
                    // Named rather than an absent button, so it reads as a
                    // decision somebody made rather than a broken feature.
                    <span className="flex items-center gap-1 text-2xs text-ink-subtle">
                      <Ban className="h-3 w-3" />
                      not a follow-up
                    </span>
                  )}
                </div>
              ),
            )
          )}

          <p className="flex items-start gap-1.5 pt-1 text-2xs leading-relaxed text-ink-subtle">
            <Info className="mt-px h-3 w-3 shrink-0" />
            These groups are worked out fresh each time, including when a follow-up sends. Anybody who books in the
            meantime drops out of &ldquo;has not booked&rdquo; on their own — so a follow-up never reaches somebody who
            has already said yes.
          </p>
        </CardBody>
      </Card>

      {chosen ? (
        <FollowUpModal
          campaign={campaign}
          audience={chosen}
          onClose={() => setChosen(null)}
          onDone={(id) => {
            setChosen(null);
            toast.success('Follow-up saved as a draft');
            router.push(`/campaigns/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

function FollowUpModal({
  campaign,
  audience,
  onClose,
  onDone,
}: {
  campaign: Campaign;
  audience: AudienceRow;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; channel: string; category: string }[]>([]);
  const [form, setForm] = useState({
    name: `${campaign.name} — follow-up`,
    templateId: '',
    waitDays: 3,
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ data: typeof templates }>(`templates?pageSize=100`)
      .then((result) => {
        const list = (result as unknown as { data?: typeof templates }).data ?? (result as unknown as typeof templates);
        if (!cancelled) setTemplates(list.filter((t) => t.channel === campaign.channel));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [campaign.channel]);

  async function create() {
    if (!form.templateId) {
      toast.error('Pick a message to send.');
      return;
    }
    setBusy(true);
    try {
      const sendAt = new Date();
      sendAt.setDate(sendAt.getDate() + form.waitDays);

      const created = await apiPost<{ id: string }>('campaigns', {
        name: form.name.trim(),
        channel: campaign.channel,
        templateId: form.templateId,
        followUpOfId: campaign.id,
        followUpAudience: audience.audience,
        objective: campaign.objective ?? 'OTHER',
        attributionWindowDays: campaign.attributionWindowDays,
        costPerMessage: Number(campaign.costPerMessage ?? 0),
        // Saved as a draft with a date on it rather than launched here. A
        // follow-up that sends the instant it is created gives nobody time to
        // read what it says.
        scheduledAt: form.waitDays > 0 ? sendAt.toISOString() : undefined,
      });
      onDone(created.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Follow up with ${audience.label.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} loading={busy}>
            Create the follow-up
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-brand-50/60 p-3 text-xs leading-relaxed text-brand-900">
          <strong className="font-semibold">{count(audience.count)}</strong> people are in this group right now.{' '}
          {audience.suggestion}
        </p>

        <Field label="Name">
          {({ id }) => (
            <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          )}
        </Field>

        <Field label="Message" required>
          {({ id }) => (
            <Select
              id={id}
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.category.toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Send" hint="counted from today">
          {({ id }) => (
            <Select
              id={id}
              value={String(form.waitDays)}
              onChange={(e) => setForm({ ...form, waitDays: Number(e.target.value) })}
            >
              <option value="0">Leave as a draft — I will send it</option>
              <option value="2">In 2 days</option>
              <option value="3">In 3 days</option>
              <option value="5">In 5 days</option>
              <option value="7">In a week</option>
              <option value="14">In a fortnight</option>
            </Select>
          )}
        </Field>

        <p className="text-2xs leading-relaxed text-ink-subtle">
          The group is worked out again when this sends, not now. If {count(audience.count)} becomes fewer by then, it
          is because those people booked — which is the point of waiting.
        </p>
      </div>
    </Modal>
  );
}
