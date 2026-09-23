import type { Metadata } from 'next';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/display';
import { TemplateEditor } from './template-editor';
import { RestoreDefaults } from './restore-defaults';
import { SyncFromMeta } from './sync-from-meta';
import { SubmitToMeta } from './submit-to-meta';
import { MetaStatusBadge, metaHelp, CategoryBadge, categoryNote } from './meta-status';
import type { MessageTemplate, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Message templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const [{ data: templates }, user] = await Promise.all([
    apiFetchList<MessageTemplate>('/templates', { query: { pageSize: 100 } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('template.manage') ?? false;

  /**
   * A channel with no templates is the one that makes the send screen look
   * broken — the picker is simply empty there. Surfaced as a named gap with a
   * one-click fix, rather than leaving somebody to wonder whether templates
   * are a WhatsApp-only feature.
   */
  const emptyChannels = (['WHATSAPP', 'EMAIL', 'SMS'] as const).filter(
    (channel) => !templates.some((template) => template.channel === channel),
  );
  /**
   * WhatsApp templates Meta will not deliver. Named on the page rather than
   * left to be discovered one silent campaign at a time.
   */
  const unapproved = templates.filter(
    (template) => template.channel === 'WHATSAPP' && template.approvalStatus !== 'APPROVED',
  );
  const utility = templates.filter((template) => template.category !== 'MARKETING');
  const marketing = templates.filter((template) => template.category === 'MARKETING');

  return (
    <>
      <PageHeader
        title="Message templates"
        description="What your customers actually read. Variables in {{braces}} are filled in at send time."
        action={
          canManage ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {emptyChannels.length > 0 ? <RestoreDefaults label="Add starters" /> : null}
              <SyncFromMeta />
              <TemplateEditor />
            </div>
          ) : null
        }
      />

      {emptyChannels.length > 0 && canManage ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          You have no{' '}
          <strong className="font-semibold">
            {emptyChannels
              .map((c) => (c === 'WHATSAPP' ? 'WhatsApp' : c === 'SMS' ? 'SMS' : 'email'))
              .join(' or ')}
          </strong>{' '}
          templates, so the template picker is empty on{' '}
          {emptyChannels.length === 1 ? 'that tab' : 'those tabs'} when you send a message. “Add starters” fills the
          gaps with ready-written ones and leaves everything you already have untouched.
        </div>
      ) : null}

      {unapproved.length > 0 && canManage ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          <strong className="font-semibold">
            {unapproved.length} WhatsApp template{unapproved.length === 1 ? ' is' : 's are'} not approved by Meta
          </strong>{' '}
          — {unapproved.map((t) => t.name).join(', ')}. WhatsApp only delivers templates Meta has approved, so any
          automation or campaign using one of these sends nothing. Submit each for review, or press “Sync with Meta” if
          you already created them in Business Manager.
        </div>
      ) : null}

      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-xs leading-relaxed text-sky-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong className="font-semibold">Utility</strong> templates (confirmations, reminders, invoices) reach anyone
          who has not opted out. <strong className="font-semibold">Marketing</strong> templates need an explicit opt-in
          and, on WhatsApp, prior approval from the provider — that is why each one carries an approval status.
        </p>
      </div>

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No templates yet"
            description="New salons start with fifteen ready-written templates covering the whole customer journey."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <TemplateGroup title="Transactional" subtitle="Confirmations, reminders, invoices" templates={utility} canManage={canManage} />
          <TemplateGroup title="Marketing" subtitle="Offers and win-backs — opt-in required" templates={marketing} canManage={canManage} />
        </div>
      )}
    </>
  );
}

function TemplateGroup({
  title,
  subtitle,
  templates,
  canManage,
}: {
  title: string;
  subtitle: string;
  templates: MessageTemplate[];
  canManage: boolean;
}) {
  if (templates.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-xs text-ink-muted">{subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-medium text-ink">{template.name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge>{template.channel.toLowerCase()}</Badge>
                  <CategoryBadge
                    category={template.category}
                    requestedCategory={template.requestedCategory}
                    channel={template.channel}
                  />
                </div>
              </div>
              <MetaStatusBadge status={template.approvalStatus} channel={template.channel} />
            </div>

            <div className="flex-1 p-4">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{template.bodyText}</p>

              {template.channel === 'WHATSAPP' && template.approvalStatus !== 'APPROVED' ? (
                <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">{metaHelp(template.approvalStatus)}</p>
              ) : null}

              {/* Meta moved this template to another category. Said here
                  because the consequence — who it may now be sent to — is
                  invisible otherwise. */}
              {categoryNote(template) ? (
                <p className="mt-2 rounded-md bg-amber-50 p-2 text-2xs leading-relaxed text-amber-900">
                  {categoryNote(template)}
                </p>
              ) : null}

              {/* Meta's own sentence. It names the thing to change; a summary
                  of it does not. */}
              {template.rejectedReason ? (
                <p className="mt-2 rounded-md bg-rose-50 p-2 text-2xs leading-relaxed text-rose-900">
                  <strong className="font-semibold">Meta’s reason:</strong> {template.rejectedReason}
                </p>
              ) : null}
            </div>

            {canManage ? (
              <div className="border-t border-stone-200 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <TemplateEditor template={template} compact />
                  <SubmitToMeta template={template} />
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}
