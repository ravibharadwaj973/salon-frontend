import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { apiFetch, apiFetchList, apiFetchSafe } from '@/lib/api';
import { PermissionGate } from '@/components/permission-gate';
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui/display';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { count, date, fromNow, money, phone as formatPhone } from '@/lib/format';
import type { Money, Segment } from '@/lib/types';
import { PickMembers, RemoveMember } from './pick-members';

export const dynamic = 'force-dynamic';

/**
 * WHO IS ACTUALLY IN THIS SEGMENT.
 *
 * A segment is a rule, and until now the only thing it showed was a number.
 * A number is either believed or not; the names are what make somebody press
 * send — and what exposes a rule that is subtly wrong. An off-by-one on days
 * or a tag that matches more than it looks like it should is invisible in
 * "2,412" and obvious the moment you read the list.
 *
 * Each row shows what the rule was probably about — visits, spend, when they
 * were last in — next to whether they can be reached at all, so "is this the
 * right group?" and "will they get it?" are answered on one screen.
 */

type ChannelKey = 'WHATSAPP' | 'SMS' | 'EMAIL';
type Reach = Record<ChannelKey, { reachable: number; noAddress: number; noConsent: number }>;

interface Member {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  tier: string;
  totalVisits: number;
  totalSpent: Money;
  lastVisitAt: string | null;
  whatsappConsent: string;
  smsConsent: string;
  emailConsent: string;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const segment = await apiFetch<Segment>(`/segments/${(await params).id}`);
    return { title: segment.name };
  } catch {
    return { title: 'Segment' };
  }
}

/** Marketing needs a positive opt-in; this mirrors the server's own test. */
function reachableOn(member: Member, channel: ChannelKey): boolean {
  const address = channel === 'EMAIL' ? member.email?.trim() : member.phone?.trim();
  if (!address) return false;
  const consent =
    channel === 'EMAIL' ? member.emailConsent : channel === 'SMS' ? member.smsConsent : member.whatsappConsent;
  return consent === 'OPTED_IN';
}

/** One row's answer to "can we message this person?", in three letters. */
function ReachMarks({ member }: { member: Member }) {
  const marks: [ChannelKey, string][] = [
    ['WHATSAPP', 'WA'],
    ['SMS', 'SMS'],
    ['EMAIL', 'Email'],
  ];

  return (
    <span className="flex flex-wrap gap-1">
      {marks.map(([channel, label]) => {
        const ok = reachableOn(member, channel);
        const why = !(channel === 'EMAIL' ? member.email?.trim() : member.phone?.trim())
          ? 'no address on file'
          : 'not opted in';
        return (
          <span
            key={channel}
            title={ok ? `Reachable on ${label}` : `Not reachable on ${label} — ${why}`}
            className={`rounded px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${
              ok
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-stone-100 text-stone-400 ring-stone-200 line-through'
            }`}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

export default async function SegmentMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const page = Number((await searchParams).page ?? 1);

  const [segment, members, reach] = await Promise.all([
    apiFetchSafe<Segment>(`/segments/${id}`),
    apiFetchList<Member>(`/segments/${id}/members`, { query: { page, pageSize: 50 } }).catch(() => null),
    // Never blocks the page: the list is the point, the tiles are context.
    apiFetchSafe<Reach>(`/segments/${id}/reach`, { query: { category: 'MARKETING' } }),
  ]);

  if (!members) {
    return <PermissionGate permission="customer.view" what="The people in a segment are restricted." />;
  }

  const { data: rows, meta } = members;

  /**
   * A rule and a hand-picked list are different things on this screen.
   *
   * On a rule, the list is a RESULT: nobody can add to it, because the next
   * run would undo them. On a hand-picked list, the list IS the segment, so
   * this is where it is built.
   */
  const handPicked = segment ? !segment.isDynamic : false;

  return (
    <>
      <Link
        href="/segments"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All segments
      </Link>

      <PageHeader
        title={segment?.name ?? 'Segment'}
        description={
          segment?.description ??
          'Everyone the rules below match, recounted from the customer book every time this page loads.'
        }
        action={
          <Link
            href={`/campaigns?segmentId=${id}`}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Send a campaign
          </Link>
        }
      />

      {/* The rules, in the same shape the card shows, so somebody arriving
          from a campaign can see what they are looking at. */}
      {segment?.rules?.conditions?.length ? (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {segment.rules.conditions.map((condition, index) => (
            <li key={index} className="rounded bg-stone-100 px-2 py-1 font-mono text-2xs text-ink-muted">
              {condition.field} {condition.op} {String(condition.value ?? '')}
            </li>
          ))}
        </ul>
      ) : null}

      {reach ? (
        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          {(['WHATSAPP', 'SMS', 'EMAIL'] as const).map((channel) => {
            const row = reach[channel];
            const label = channel === 'WHATSAPP' ? 'WhatsApp' : channel === 'SMS' ? 'SMS' : 'Email';
            return (
              <Card key={channel} className="px-4 py-3">
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">Reachable on {label}</p>
                <p className="tnum mt-0.5 text-lg font-semibold text-ink">{count(row.reachable)}</p>
                <p className="mt-0.5 text-2xs leading-snug text-ink-muted">
                  {row.noAddress > 0
                    ? `${count(row.noAddress)} without ${channel === 'EMAIL' ? 'an email' : 'a number'}`
                    : null}
                  {row.noAddress > 0 && row.noConsent > 0 ? ' · ' : null}
                  {row.noConsent > 0 ? `${count(row.noConsent)} not opted in` : null}
                  {row.noAddress === 0 && row.noConsent === 0 ? 'everyone in the segment' : null}
                </p>
              </Card>
            );
          })}
        </div>
      ) : null}

      {handPicked ? <PickMembers segmentId={id} memberIds={rows.map((member) => member.id)} /> : null}

      <Card>
        <CardHeader
          title={`${count(meta?.total ?? rows.length)} ${rows.length === 1 ? 'person' : 'people'}`}
          subtitle={
            handPicked
              ? 'Chosen by hand. Nobody joins or leaves this list on their own.'
              : 'Biggest spenders first. A segment is a live rule, so this list changes as customers do.'
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={handPicked ? 'Nobody in this list yet' : 'Nobody matches these rules'}
            description={
              handPicked
                ? 'Search above and add the people you want. Nothing is added on its own — that is the point of a list like this.'
                : 'Try loosening a number — or switch the segment to matching any rule instead of all of them.'
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Contact</TH>
                  <TH>Can be reached</TH>
                  <TH align="right">Visits</TH>
                  <TH align="right">Spent</TH>
                  <TH>Last in</TH>
                  {handPicked ? <TH align="right">Remove</TH> : null}
                </TR>
              </THead>
              <TBody>
                {rows.map((member) => (
                  <TR key={member.id}>
                    <TD>
                      <Link
                        href={`/customers/${member.id}`}
                        className="font-medium text-ink hover:text-brand-700 hover:underline"
                      >
                        {member.firstName} {member.lastName ?? ''}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {member.code ? <span className="text-2xs text-ink-subtle">{member.code}</span> : null}
                        <StatusBadge status={member.tier} />
                      </div>
                    </TD>

                    <TD className="text-xs text-ink-muted">
                      <div className="tnum">{formatPhone(member.phone)}</div>
                      {member.email ? (
                        <div className="text-2xs text-ink-subtle">{member.email}</div>
                      ) : (
                        <div className="text-2xs text-ink-subtle">no email</div>
                      )}
                    </TD>

                    <TD>
                      <ReachMarks member={member} />
                    </TD>

                    <TD align="right" className="tnum text-xs text-ink-muted">
                      {member.totalVisits}
                    </TD>

                    <TD align="right" className="tnum text-xs font-medium text-ink">
                      {money(member.totalSpent)}
                    </TD>

                    <TD className="text-xs text-ink-muted">
                      {member.lastVisitAt ? (
                        <>
                          <div>{date(member.lastVisitAt)}</div>
                          <div className="text-2xs text-ink-subtle">{fromNow(member.lastVisitAt)}</div>
                        </>
                      ) : (
                        <Badge tone="neutral">never</Badge>
                      )}
                    </TD>
                    {handPicked ? (
                      <TD align="right">
                        <RemoveMember
                          segmentId={id}
                          customerId={member.id}
                          name={`${member.firstName} ${member.lastName ?? ''}`.trim()}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>

            {meta ? (
              <Pagination
                page={meta.page}
                pageSize={meta.pageSize}
                total={meta.total}
                basePath={`/segments/${id}`}
              />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
