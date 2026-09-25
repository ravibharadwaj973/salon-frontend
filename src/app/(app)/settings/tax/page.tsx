import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, CardBody, EmptyState, PageHeader } from '@/components/ui/display';
import type { SessionUser } from '@/lib/types';
import { TaxIdentityCard, type TaxIdentity } from './tax-identity-card';
import { SeriesCard, type BranchPreview, type SeriesFormat } from './series-card';
import { InvoiceExportCard } from './export-card';

export const metadata: Metadata = { title: 'Tax & invoices' };
export const dynamic = 'force-dynamic';

/**
 * WHAT MAKES A BILL FROM THIS BUSINESS A VALID DOCUMENT.
 *
 * Owner only, and not out of caution. Everything on this page changes what every
 * future bill IS rather than how it looks: the registration decides whether the
 * salon may charge GST at all, the numbering decides whether its invoices
 * satisfy the rule they have to satisfy, and the export hands over the entire
 * book of account. A manager who can legitimately void one bill has no business
 * with any of the three.
 */

interface TaxSettings {
  identity: TaxIdentity;
  documentTitle: string;
  mayChargeTax: boolean;
  declaration: string | null;
  series: SeriesFormat;
  preview: BranchPreview[];
}

export default async function TaxSettingsPage() {
  const [user, settings] = await Promise.all([
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
    apiFetchSafe<TaxSettings>('/tax-settings'),
  ]);

  const isOwner = user?.role === 'OWNER';

  if (!isOwner) {
    return (
      <>
        <PageHeader title="Tax & invoices" />
        <Card>
          <EmptyState
            icon={Lock}
            title="Only the owner can change this"
            description="The registration and bill-number format decide whether every bill this salon issues is a valid document, so they are the owner's to set. Ask them if something here needs changing."
          />
        </Card>
      </>
    );
  }

  if (!settings) {
    return (
      <>
        <PageHeader title="Tax & invoices" />
        <Card>
          <EmptyState
            icon={Lock}
            title="Could not load these settings"
            description="Check that the API is running, then reload."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tax & invoices"
        description={`Bills are currently headed "${settings.documentTitle}"`}
        action={
          <Link href="/settings" className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" />
            Settings
          </Link>
        }
      />

      <div className="space-y-5">
        <TaxIdentityCard identity={settings.identity} canEdit />

        {/* The prescribed wording, shown where the choice that requires it was
            made, so an owner can see what their customers will read. */}
        {settings.declaration ? (
          <Card>
            <CardBody>
              <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">Printed on every bill</p>
              <p className="mt-1 text-sm italic text-ink">&ldquo;{settings.declaration}&rdquo;</p>
              <p className="mt-1.5 text-2xs leading-relaxed text-ink-subtle">
                The composition scheme requires this sentence, in these words, on every bill of supply. It is not
                editable for that reason.
              </p>
            </CardBody>
          </Card>
        ) : null}

        <SeriesCard series={settings.series} preview={settings.preview} canEdit />
        <InvoiceExportCard />
      </div>
    </>
  );
}
