import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/display';
import { MessagingSetupForm } from './messaging-setup';
import type { MessagingSetup } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Messaging setup' };

export default async function MessagingSetupPage() {
  const setup = await apiFetch<MessagingSetup>('/messaging/setup');

  return (
    <>
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Settings
      </Link>

      <PageHeader
        title="Messaging setup"
        description="Messages go out from your own WhatsApp number, your own SMS sender name and your own email address — not ours."
      />

      <MessagingSetupForm setup={setup} />
    </>
  );
}
