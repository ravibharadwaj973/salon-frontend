import type { Metadata } from 'next';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/display';
import { TemplateEditor } from './template-editor';
import type { MessageTemplate, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Message templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const [{ data: templates }, user] = await Promise.all([
    apiFetchList<MessageTemplate>('/templates', { query: { pageSize: 100 } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('template.manage') ?? false;
  const utility = templates.filter((template) => template.category !== 'MARKETING');
  const marketing = templates.filter((template) => template.category === 'MARKETING');

  return (
    <>
      <PageHeader
        title="Message templates"
        description="What your customers actually read. Variables in {{braces}} are filled in at send time."
        action={canManage ? <TemplateEditor /> : null}
      />

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
                  <Badge tone={template.category === 'MARKETING' ? 'warning' : 'info'}>
                    {template.category.toLowerCase()}
                  </Badge>
                </div>
              </div>
              <Badge tone={template.approvalStatus === 'APPROVED' ? 'success' : 'neutral'}>
                {template.approvalStatus.toLowerCase()}
              </Badge>
            </div>

            <div className="flex-1 p-4">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{template.bodyText}</p>
            </div>

            {canManage ? (
              <div className="border-t border-stone-200 px-4 py-2.5">
                <TemplateEditor template={template} compact />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}
