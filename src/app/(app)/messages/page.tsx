import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { apiFetchListAllowed } from '@/lib/api';
import { PermissionGate } from '@/components/permission-gate';
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui/display';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { fromNow, phone as formatPhone } from '@/lib/format';
import type { MessageLogEntry } from '@/lib/types';

export const metadata: Metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

/**
 * Every message the salon has sent, and what became of it.
 *
 * This page exists because "Sent" on the send screen is not true yet — it
 * means the message was queued. The worker picks it up a moment later and the
 * provider may still refuse it: an unapproved template, an expired token, a
 * number WhatsApp will not deliver to. Until this page existed there was
 * nowhere to find that out, so a message that never arrived looked identical
 * to one that did.
 *
 * The failure reason is shown in full rather than behind a click. Somebody
 * standing at the desk wondering why a customer never got their reminder
 * should not have to go looking.
 */

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'QUEUED', label: 'Waiting' },
  { key: 'SENT', label: 'Sent' },
  { key: 'DELIVERED', label: 'Delivered' },
] as const;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; channel?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const status = params.status ?? '';

  const result = await apiFetchListAllowed<MessageLogEntry>('/messages', {
    query: { page, pageSize: 25, status: status || undefined, channel: params.channel || undefined },
  });

  if (!result) {
    return <PermissionGate permission="campaign.view" what="The message log is restricted." />;
  }

  const { data: messages, meta } = result;
  const failed = messages.filter((m) => m.status === 'FAILED').length;

  return (
    <>
      <PageHeader
        title="Messages"
        description="What was sent, what arrived, and what did not — with the reason."
      />

      <div className="mb-5 flex w-fit rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
        {FILTERS.map((item) => (
          <Link
            key={item.key || 'all'}
            href={item.key ? `/messages?status=${item.key}` : '/messages'}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              status === item.key ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title={`${meta?.total ?? messages.length} messages`}
          subtitle={
            failed > 0
              ? `${failed} on this page did not go out — the reason is in the last column`
              : 'Newest first'
          }
        />

        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nothing sent yet"
            description="Messages appear here the moment they are queued, whether or not they reach the customer."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>To</TH>
                  <TH>Channel</TH>
                  <TH>Template</TH>
                  <TH>Status</TH>
                  <TH>When</TH>
                  <TH>What happened</TH>
                </TR>
              </THead>
              <TBody>
                {messages.map((message) => (
                  <TR key={message.id}>
                    <TD>
                      {message.customer ? (
                        <Link
                          href={`/customers/${message.customer.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {message.customer.firstName} {message.customer.lastName ?? ''}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                      <div className="tnum text-2xs text-ink-subtle">{formatPhone(message.toAddress)}</div>
                    </TD>

                    <TD className="text-xs text-ink-muted">{message.channel}</TD>

                    <TD className="text-xs text-ink-muted">
                      {message.template?.name ?? <span className="text-ink-subtle">Free text</span>}
                    </TD>

                    <TD>
                      <StatusBadge status={message.status} />
                    </TD>

                    <TD className="text-xs text-ink-muted">{fromNow(message.sentAt ?? message.queuedAt)}</TD>

                    {/* The column that makes this page worth having. */}
                    <TD className="max-w-md text-xs leading-relaxed">
                      {message.status === 'FAILED' ? (
                        <span className="text-rose-700">{message.errorMessage ?? message.errorCode}</span>
                      ) : message.status === 'QUEUED' ? (
                        <span className="text-ink-subtle">
                          Waiting for the sender. If it stays here, the background worker is not running.
                        </span>
                      ) : message.deliveredAt ? (
                        <span className="text-emerald-700">Delivered</span>
                      ) : message.sentAt ? (
                        <span className="text-ink-subtle">
                          Accepted by the provider. No delivery confirmation yet.
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            {meta ? (
              <Pagination
                page={meta.page}
                pageSize={meta.pageSize}
                total={meta.total}
                basePath="/messages"
                searchParams={{ status: status || undefined }}
              />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
