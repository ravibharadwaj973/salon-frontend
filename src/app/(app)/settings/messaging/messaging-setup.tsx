'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Circle, Mail, MessageSquare, Send, Smartphone } from 'lucide-react';
import { apiPost, apiPut, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { CheckWhatsApp } from './check-whatsapp';
import type { ChannelDelivery, MessagingSetup, SetupStatus } from '@/lib/types';

/**
 * Four states, not two.
 *
 * "Connected" used to mean only "this salon's own row is filled in", which left
 * a server sending through the platform's account reading as Not connected —
 * and the Send test button greyed out beside it. And a simulated channel read
 * as Connected, which is the more expensive half of the mistake: it is the one
 * that ends with somebody trusting a delivery that never happened.
 */
function Status({ status, delivery }: { status: SetupStatus; delivery: ChannelDelivery }) {
  if (delivery.simulated) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-4 w-4" />
        Simulated — nothing is delivered
      </span>
    );
  }

  if (delivery.live) {
    const own = status === 'CONNECTED' && delivery.source === 'tenant';
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        {own ? 'Connected' : 'Sending through the platform account'}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
      <Circle className="h-4 w-4" />
      Not connected
    </span>
  );
}

/** What is stopping this channel, for whoever has to go and fix it. */
function MissingNote({ delivery }: { delivery: ChannelDelivery }) {
  if (delivery.live || !delivery.missing) return null;
  return (
    <p className="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-2xs leading-relaxed text-amber-900">
      Nothing can be sent on this channel yet. What is missing: {delivery.missing}.
    </p>
  );
}

export function MessagingSetupForm({ setup }: { setup: MessagingSetup }) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');

  const [wa, setWa] = useState({
    phoneNumberId: setup.whatsapp.phoneNumberId ?? '',
    businessId: setup.whatsapp.businessId ?? '',
    displayNumber: setup.whatsapp.displayNumber ?? '',
    accessToken: '',
  });
  const [sms, setSms] = useState({
    senderId: setup.sms.senderId ?? '',
    dltEntityId: setup.sms.dltEntityId ?? '',
    apiKey: '',
  });
  const [email, setEmail] = useState({
    fromName: setup.email.fromName ?? '',
    fromAddress: setup.email.fromAddress ?? '',
    replyTo: setup.email.replyTo ?? '',
    apiKey: '',
  });

  async function save(channel: 'whatsapp' | 'sms' | 'email', payload: Record<string, string>) {
    setBusy(channel);
    try {
      await apiPut('messaging/setup', { [channel]: payload });
      toast.success('Saved');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function test(channel: 'WHATSAPP' | 'SMS' | 'EMAIL') {
    if (!testTo.trim()) {
      toast.error('Enter your own number or email first, so the test goes to you');
      return;
    }
    setBusy(`test-${channel}`);
    try {
      const result = await apiPost<{ ok: boolean; errorMessage?: string; note?: string; simulated?: boolean }>(
        'messaging/setup/test',
        { channel, to: testTo.trim() },
      );
      if (!result.ok) {
        // Meta's own wording, verbatim. It names the actual problem — an
        // expired token, a number not on the test list, a template that is
        // not approved — and paraphrasing it into "sending failed" throws
        // away the only thing that tells you which.
        toast.error(result.errorMessage ?? 'The provider rejected it');
      } else if (result.simulated) {
        toast.error(result.note ?? 'Nothing was actually sent — this channel is simulated.');
      } else {
        toast.success(result.note ?? 'Test message sent — check your phone');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="Send test messages to" hint="Your own number or email" className="min-w-[220px] flex-1">
            {({ id }) => (
              <Input
                id={id}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="9876543210 or you@salon.in"
              />
            )}
          </Field>
          <p className="flex-1 text-2xs text-ink-muted">
            Always send yourself a test before switching an automation on. A broken setup is silent — messages are
            recorded but never delivered.
          </p>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------- WhatsApp */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-ink-subtle" />
              WhatsApp
            </span>
          }
          subtitle="Your own WhatsApp Business number, so customers see your salon's name"
          action={<Status status={setup.whatsapp.status} delivery={setup.whatsapp.delivery} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number ID" hint="From Meta Business Manager">
            {({ id }) => (
              <Input
                id={id}
                value={wa.phoneNumberId}
                onChange={(e) => setWa((w) => ({ ...w, phoneNumberId: e.target.value }))}
                className="font-mono text-xs"
              />
            )}
          </Field>

          <Field label="WhatsApp Business Account ID" hint="Optional">
            {({ id }) => (
              <Input
                id={id}
                value={wa.businessId}
                onChange={(e) => setWa((w) => ({ ...w, businessId: e.target.value }))}
                className="font-mono text-xs"
              />
            )}
          </Field>

          <Field label="Display number" hint="What customers will see">
            {({ id }) => (
              <Input
                id={id}
                value={wa.displayNumber}
                onChange={(e) => setWa((w) => ({ ...w, displayNumber: e.target.value }))}
                placeholder="+91 98765 43210"
              />
            )}
          </Field>

          <Field
            label="Access token"
            hint={setup.whatsapp.accessToken ? `Saved: ${setup.whatsapp.accessToken}` : 'Permanent token from Meta'}
          >
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={wa.accessToken}
                onChange={(e) => setWa((w) => ({ ...w, accessToken: e.target.value }))}
                placeholder={setup.whatsapp.accessToken ? 'Leave blank to keep the saved one' : ''}
                autoComplete="off"
              />
            )}
          </Field>

          <p className="sm:col-span-2 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
            The number must be one that is not already in use on the normal WhatsApp or WhatsApp Business app. Meta
            also has to approve each template before it can be sent to customers — installing a message here saves it
            as a draft until then.
          </p>

          <MissingNote delivery={setup.whatsapp.delivery} />

          <CheckWhatsApp />

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              loading={busy === 'test-WHATSAPP'}
              onClick={() => test('WHATSAPP')}
              disabled={!setup.whatsapp.delivery.live}
            >
              <Send className="h-4 w-4" />
              Send test
            </Button>
            <Button loading={busy === 'whatsapp'} onClick={() => save('whatsapp', wa)}>
              Save WhatsApp
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------------------------- SMS */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-ink-subtle" />
              SMS
            </span>
          }
          subtitle="For customers who are not on WhatsApp"
          action={<Status status={setup.sms.status} delivery={setup.sms.delivery} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Sender ID" hint="Six letters, e.g. GLWSTD">
            {({ id }) => (
              <Input
                id={id}
                value={sms.senderId}
                onChange={(e) => setSms((s) => ({ ...s, senderId: e.target.value.toUpperCase() }))}
                maxLength={6}
                className="font-mono text-xs uppercase"
              />
            )}
          </Field>

          <Field label="DLT entity ID" hint="From the operator DLT portal">
            {({ id }) => (
              <Input
                id={id}
                value={sms.dltEntityId}
                onChange={(e) => setSms((s) => ({ ...s, dltEntityId: e.target.value }))}
                className="font-mono text-xs"
              />
            )}
          </Field>

          <Field
            label="MSG91 auth key"
            hint={setup.sms.apiKey ? `Saved: ${setup.sms.apiKey}` : 'From your MSG91 account'}
            className="sm:col-span-2"
          >
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={sms.apiKey}
                onChange={(e) => setSms((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder={setup.sms.apiKey ? 'Leave blank to keep the saved one' : ''}
                autoComplete="off"
              />
            )}
          </Field>

          <p className="sm:col-span-2 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
            Indian operators will not deliver SMS unless both your sender name and the exact message wording are
            registered on the DLT portal first. Registration takes a day or two and the sender ID costs a one-time
            fee — worth starting before you need it.
          </p>

          <MissingNote delivery={setup.sms.delivery} />

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              loading={busy === 'test-SMS'}
              onClick={() => test('SMS')}
              disabled={!setup.sms.delivery.live}
            >
              <Send className="h-4 w-4" />
              Send test
            </Button>
            <Button loading={busy === 'sms'} onClick={() => save('sms', sms)}>
              Save SMS
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------- email */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-ink-subtle" />
              Email
            </span>
          }
          subtitle="Mostly for GST invoices and corporate customers"
          action={<Status status={setup.email.status} delivery={setup.email.delivery} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="From name">
            {({ id }) => (
              <Input
                id={id}
                value={email.fromName}
                onChange={(e) => setEmail((m) => ({ ...m, fromName: e.target.value }))}
                placeholder="Your salon's name"
              />
            )}
          </Field>

          <Field label="From address" hint="Must be on a domain you have verified">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={email.fromAddress}
                onChange={(e) => setEmail((m) => ({ ...m, fromAddress: e.target.value }))}
                placeholder="hello@yoursalon.in"
              />
            )}
          </Field>

          <Field label="Reply-to" hint="Optional">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={email.replyTo}
                onChange={(e) => setEmail((m) => ({ ...m, replyTo: e.target.value }))}
              />
            )}
          </Field>

          <Field label="API key" hint={setup.email.apiKey ? `Saved: ${setup.email.apiKey}` : 'From your email provider'}>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={email.apiKey}
                onChange={(e) => setEmail((m) => ({ ...m, apiKey: e.target.value }))}
                placeholder={setup.email.apiKey ? 'Leave blank to keep the saved one' : ''}
                autoComplete="off"
              />
            )}
          </Field>

          <MissingNote delivery={setup.email.delivery} />

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              loading={busy === 'test-EMAIL'}
              onClick={() => test('EMAIL')}
              disabled={!setup.email.delivery.live}
            >
              <Send className="h-4 w-4" />
              Send test
            </Button>
            <Button loading={busy === 'email'} onClick={() => save('email', email)}>
              Save email
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
