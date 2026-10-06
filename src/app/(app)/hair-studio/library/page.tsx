import type { Metadata } from 'next';
import Link from 'next/link';
import { Scissors } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import type { Hairstyle, KindsResponse } from '../catalogue-types';
import { AssetStudio } from './asset-studio';
import { InstallStarter } from '../install-starter';

export const metadata: Metadata = { title: 'Hair asset studio' };
export const dynamic = 'force-dynamic';

/**
 * THE MENU BEHIND THE STUDIO.
 *
 * This is the screen that replaces the old Hairstyles editor, and it has a
 * different job from the one it replaces. That screen was about drawing: pick a
 * generator, tick what it supports, save. Most of that still happens here, but it
 * is no longer the point.
 *
 * The point is that every style the salon sells has a FACE. A look-book of names
 * is a price list; a look-book of photographs is what a customer scrolls through
 * while deciding to spend money, and the difference in a salon is not subtle.
 *
 * Those photographs are drawn once, here, and kept — never per customer and never
 * per page view. That is the whole economic shape of the feature: fifty changes
 * in the 3D configurator cost nothing because the configurator draws in the
 * browser, and an image model is asked for a picture only when a person decides
 * they want one.
 */
export default async function HairLibraryPage() {
  const [styles, kinds] = await Promise.all([
    apiFetchSafe<Hairstyle[]>('/hair-studio/hairstyles'),
    apiFetchSafe<KindsResponse>('/hair-studio/kinds'),
  ]);

  const list = styles ?? [];

  return (
    <>
      <PageHeader
        title="Hair asset studio"
        description="The styles your salon offers, and the picture each one shows"
        action={
          <Link
            href="/hair-studio"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Open the studio
          </Link>
        }
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title="No styles on the menu yet"
            description="Add the standard menu and every style appears here — rename, reprice or remove whatever does not suit your salon, then give each one a picture."
            action={<InstallStarter />}
          />
        </Card>
      ) : (
        <AssetStudio styles={list} kinds={kinds?.kinds ?? []} options={kinds?.options ?? null} />
      )}
    </>
  );
}
