import { Check, Eye, MousePointerClick, Reply, TriangleAlert } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { count, fromNow, percent } from '@/lib/format';

/**
 * WHAT THIS SALON HAS BEEN DOING TO THIS PERSON.
 *
 * The overall report says what the salon does. This says what it did to them,
 * and it exists to end two specific misreadings that cost customers:
 *
 *   "They never respond, push harder."  — sometimes the last four messages
 *   failed, and nobody was told. Pushing harder sends more into the same hole.
 *
 *   "They are one of our best, keep them warm."  — eleven messages in a month
 *   with nothing opened is not warmth, it is the reason they will leave, and
 *   the number is invisible unless something counts it.
 *
 * So the two figures it leads with are how much they are being messaged and
 * how much of it they actually open — not a total, which flatters everybody.
 */

interface Funnel {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
  skipped: number;
  deliveryRate: number | null;
  readRate: number | null;
}

export interface CustomerMessaging {
  overall: Funnel;
  combinedCapability: { read: boolean; note: string | null };
  messagesPerMonth: number;
  firstContactedAt: string | null;
  recent: {
    id: string;
    channel: string;
    status: string;
    purposeLabel: string;
    templateName: string | null;
    errorMessage: string | null;
    queuedAt: string;
    readAt: string | null;
    clickedAt: string | null;
    repliedAt: string | null;
    campaign: { id: string; name: string } | null;
  }[];
}

const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'Email', IN_APP: 'In app' };

/** The furthest this message got, in one word, with an icon so it is never colour alone. */
function outcomeOf(m: CustomerMessaging['recent'][number]) {
  if (m.repliedAt) return { label: 'Replied', tone: 'success' as const, Icon: Reply };
  if (m.clickedAt) return { label: 'Clicked', tone: 'success' as const, Icon: MousePointerClick };
  if (m.readAt) return { label: 'Opened', tone: 'success' as const, Icon: Eye };
  if (m.status === 'DELIVERED') return { label: 'Delivered', tone: 'neutral' as const, Icon: Check };
  if (m.status === 'SENT' || m.status === 'QUEUED' || m.status === 'DELAYED') {
    return { label: 'Sent', tone: 'neutral' as const, Icon: Check };
  }
  if (m.status === 'SKIPPED') return { label: 'Not sent', tone: 'warning' as const, Icon: TriangleAlert };
  return { label: m.status === 'BOUNCED' ? 'Bounced' : 'Failed', tone: 'danger' as const, Icon: TriangleAlert };
}

export function MessagingCard({ data }: { data: CustomerMessaging }) {
  const { overall } = data;

  if (overall.total === 0) {
    return (
      <Card>
        <CardHeader title="Messages & engagement" />
        <CardBody>
          <p className="text-xs text-ink-muted">Nothing has been sent to this customer yet.</p>
        </CardBody>
      </Card>
    );
  }

  const undelivered = overall.bounced + overall.failed;

  return (
    <Card>
      <CardHeader
        title="Messages & engagement"
        subtitle={`${count(overall.total)} in the last 12 months`}
      />
      <CardBody className="space-y-3">
        <dl className="grid grid-cols-3 gap-2">
          {[
            {
              label: 'A month',
              value: data.messagesPerMonth.toFixed(1),
              // The number that tells you when to stop.
              hint: data.messagesPerMonth >= 4 ? 'heavy' : null,
            },
            {
              label: 'Delivered',
              value: percent(overall.deliveryRate),
              hint: undelivered > 0 ? `${count(undelivered)} did not arrive` : null,
            },
            {
              label: 'Opens',
              value: data.combinedCapability.read ? percent(overall.readRate) : '—',
              hint: data.combinedCapability.read ? null : 'mixed channels',
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-stone-50 px-2.5 py-2">
              <dt className="text-2xs text-ink-subtle">{stat.label}</dt>
              <dd className="tnum mt-0.5 text-sm font-semibold text-ink">{stat.value}</dd>
              {stat.hint ? <p className="mt-0.5 text-2xs text-ink-subtle">{stat.hint}</p> : null}
            </div>
          ))}
        </dl>

        {/* Said plainly, because it is the one thing on this card somebody
            should act on before sending anything else. */}
        {undelivered > 0 && overall.read === 0 ? (
          <p className="rounded-lg bg-amber-50 p-2.5 text-2xs leading-relaxed text-amber-800">
            Nothing has reached this customer and nothing has been opened. Check the number and email above before
            sending anything else — silence here is usually a wrong digit, not disinterest.
          </p>
        ) : null}

        <ol className="divide-y divide-stone-100">
          {data.recent.map((m) => {
            const outcome = outcomeOf(m);
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {m.campaign?.name ?? m.templateName ?? m.purposeLabel}
                  </p>
                  <p className="mt-0.5 text-2xs text-ink-subtle">
                    {m.purposeLabel} · {CHANNEL_LABEL[m.channel] ?? m.channel} · {fromNow(m.queuedAt)}
                  </p>
                  {m.errorMessage && outcome.tone !== 'success' ? (
                    <p className="mt-0.5 text-2xs leading-snug text-ink-subtle">{m.errorMessage}</p>
                  ) : null}
                </div>
                <Badge tone={outcome.tone}>
                  <outcome.Icon className="h-3 w-3" aria-hidden />
                  {outcome.label}
                </Badge>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
