'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { apiPut, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import type { ConsentStatus } from '@/lib/types';

/**
 * RECORDING WHAT THE CUSTOMER ACTUALLY SAID.
 *
 * The edit form deliberately leaves consent out and points here, because
 * consent is not a field like a phone number — it is a record of something a
 * person said, and it is the thing a salon has to be able to stand behind when
 * a customer complains or a provider asks.
 *
 * So this is not a set of checkboxes that quietly default to yes. Each channel
 * has three explicit states and the middle one, "not asked", is the honest
 * starting point for most of a salon's book. Opting somebody in is a
 * deliberate act with a sentence attached saying what it means, because
 * "we ticked the box for them" is the complaint that gets a WhatsApp number
 * blocked and an email domain into the spam folder.
 *
 * Opting *out* is always allowed and never argued with — if somebody says
 * stop, that is the end of it.
 */

type Channel = 'whatsappConsent' | 'smsConsent' | 'emailConsent';

const CHANNELS: { key: Channel; label: string; icon: React.ComponentType<{ className?: string }>; note: string }[] = [
  {
    key: 'whatsappConsent',
    label: 'WhatsApp',
    icon: MessageCircle,
    note: 'Offers and campaigns on WhatsApp. Reminders and bills go either way.',
  },
  {
    key: 'smsConsent',
    label: 'SMS',
    icon: Phone,
    note: 'Promotional SMS. Transactional messages are unaffected.',
  },
  {
    key: 'emailConsent',
    label: 'Email',
    icon: Mail,
    note: 'Newsletters and offers by email. Invoices and confirmations go either way.',
  },
];

const OPTIONS: { value: ConsentStatus; label: string; hint: string }[] = [
  { value: 'OPTED_IN', label: 'Opted in', hint: 'They said yes to marketing on this channel' },
  { value: 'UNKNOWN', label: 'Not asked', hint: 'Nobody has asked them yet' },
  { value: 'OPTED_OUT', label: 'Opted out', hint: 'They asked not to be marketed to' },
];

export function ConsentEditor({
  customerId,
  current,
}: {
  customerId: string;
  current: { whatsappConsent: ConsentStatus; smsConsent: ConsentStatus; emailConsent: ConsentStatus };
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(current);

  // Only what changed is sent, so an untouched channel keeps its history.
  const changed = CHANNELS.filter(({ key }) => form[key] !== current[key]);

  async function save() {
    if (changed.length === 0) {
      setOpen(false);
      return;
    }

    setSaving(true);
    try {
      await apiPut(
        `customers/${customerId}/consent`,
        Object.fromEntries(changed.map(({ key }) => [key, form[key]])),
      );
      toast.success(
        changed.length === 1
          ? `${changed[0]!.label} consent updated`
          : `Consent updated on ${changed.length} channels`,
      );
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setForm(current);
          setOpen(true);
        }}
        className="text-2xs font-medium text-brand-700 hover:underline"
      >
        Change
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Marketing consent"
        description="What this customer has agreed to. Reminders, confirmations and bills are unaffected — they go to anyone who has not opted out."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={changed.length === 0}>
              {changed.length === 0 ? 'Nothing changed' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {CHANNELS.map(({ key, label, icon: Icon, note }) => (
            <div key={key} className="rounded-lg border border-stone-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-ink-subtle" />
                <span className="text-sm font-medium text-ink">{label}</span>
                {form[key] !== current[key] ? (
                  <Badge tone="warning">unsaved</Badge>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    title={option.hint}
                    onClick={() => setForm((f) => ({ ...f, [key]: option.value }))}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset ${
                      form[key] === option.value
                        ? option.value === 'OPTED_IN'
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                          : option.value === 'OPTED_OUT'
                            ? 'bg-rose-50 text-rose-800 ring-rose-300'
                            : 'bg-stone-100 text-stone-700 ring-stone-300'
                        : 'bg-white text-ink-muted ring-stone-200 hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <p className="mt-1.5 text-2xs leading-relaxed text-ink-subtle">{note}</p>
            </div>
          ))}

          {/* Not a legal disclaimer for its own sake: somebody standing at the
              desk about to tick "opted in" for a customer who never said so is
              the exact moment this needs saying. */}
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-2xs leading-relaxed text-amber-900">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Only mark someone opted in if they actually agreed — at the desk, on a form, or in a reply. Marketing to
            people who never said yes is what gets a WhatsApp number blocked and an email domain marked as spam, and it
            affects every salon sending from the same domain.
          </p>
        </div>
      </Modal>
    </>
  );
}
