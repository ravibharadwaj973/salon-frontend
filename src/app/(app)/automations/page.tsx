import { PermissionGate } from '@/components/permission-gate';
import type { Metadata } from 'next';
import { apiFetchAllowed } from '@/lib/api';
import { PageHeader } from '@/components/ui/display';
import { AutomationList } from './automation-list';
import type { Automation } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Automations' };

export default async function AutomationsPage() {
  const automations = await apiFetchAllowed<Automation[]>('/messaging/automations');

  if (!automations) {
    return <PermissionGate permission="journey.manage" what="Automations are restricted." />;
  }

  return (
    <>
      <PageHeader
        title="Automations"
        description="Messages that go out on their own. You decide when each one fires — and you can switch any of them off."
      />
      <AutomationList automations={automations} />
    </>
  );
}
