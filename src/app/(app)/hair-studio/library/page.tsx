import type { Metadata } from 'next';
import Link from 'next/link';
import { Scissors } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import type { Hairstyle, KindsResponse } from '../catalogue-types';
import { AssetStudio } from './asset-studio';
import { NewStyleButton } from './new-style';
import { InstallStarter } from '../install-starter';

export const metadata: Metadata = { title: 'Hair asset studio' };
export const dynamic = 'force-dynamic';

/**
 * THE MENU BEHIND THE STUDIO.
 *
 * The point of this screen is that every style the salon sells has a FACE. A
 * look-book of names is a price list; a look-book of photographs is what a
 * customer scrolls through while deciding to spend money, and the difference in a
 * salon is not subtle.
 *
 * ── Where those photographs come from ─────────────────────────────────────
 *
 * The salon's own camera. This is a library of the work this salon has actually
 * done, built up one cut at a time, and it costs nothing — so there is no cap on
 * it and no key to configure. A drawn stand-in is available for a tile nobody has
 * photographed yet, folded away inside each style, and capped server-side to a
 * quarter of the day.
 *
 * The other three quarters are reserved for the consultation screen, where the
 * image model earns its keep: this cut, on this customer's own photograph, while
 * she is deciding. That is the question a shader cannot answer and a drawn
 * stranger does not address — and it is why the budget is pointed there rather
 * than at filling in menu tiles.
 *
 * Either way a picture is paid for ONCE and kept. Never per customer, never per
 * page view: every colour, highlight and painted section in the studio is a
 * shader over the stored photograph, drawn in the browser, free however many
 * times it changes.
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
        description="The styles your salon offers, and a photograph of your own work for each one"
        action={
          <>
            <Link
              href="/hair-studio"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
            >
              Open the studio
            </Link>
            {/*
              In the header rather than buried in the empty state. A salon's menu
              is never finished: the one in ten styles it actually sells that the
              standard list does not cover is exactly the one it wants to add, and
              there was no way to do it at all.
            */}
            <NewStyleButton kinds={kinds?.kinds ?? []} />
          </>
        }
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title="No styles on the menu yet"
            description="Add the standard menu to start from the usual thirty-odd, or add your own one at a time. Either way, rename, reprice or remove whatever does not suit your salon, then photograph each one as you do it."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <InstallStarter />
                <NewStyleButton kinds={kinds?.kinds ?? []} />
              </div>
            }
          />
        </Card>
      ) : (
        <AssetStudio styles={list} kinds={kinds?.kinds ?? []} options={kinds?.options ?? null} />
      )}
    </>
  );
}
