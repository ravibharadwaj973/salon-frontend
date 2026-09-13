import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/display';
import { LibraryBrowser } from './library-browser';
import type { LibraryBrowse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Message library' };

export default async function TemplateLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ occasion?: string; channel?: string; q?: string }>;
}) {
  const sp = await searchParams;

  const library = await apiFetch<LibraryBrowse>('/messaging/library', {
    query: { occasion: sp.occasion, channel: sp.channel, q: sp.q },
  });

  return (
    <>
      <Link href="/templates" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        My templates
      </Link>

      <PageHeader
        title="Message library"
        description="Ready-written messages you can add and then change to sound like your salon. Nothing here sends on its own."
      />

      <LibraryBrowser
        library={library}
        active={{ occasion: sp.occasion ?? '', channel: sp.channel ?? '', q: sp.q ?? '' }}
      />
    </>
  );
}
