import type { Metadata } from 'next';
import { Scissors } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table, TableFooterNote } from '@/components/ui/table';
import { money } from '@/lib/format';
import type { Service, SessionUser } from '@/lib/types';
import { HairstyleEditor } from './hairstyle-editor';
import { InstallStarter } from './install-starter';
import {
  DENSITY_LABELS,
  GENDER_LABELS,
  LENGTH_LABELS,
  MAINTENANCE_LABELS,
  TEXTURE_LABELS,
  type Hairstyle,
  type KindsResponse,
} from './types';

export const metadata: Metadata = { title: 'Hairstyles' };
export const dynamic = 'force-dynamic';

/**
 * THE SALON'S HAIRSTYLE MENU.
 *
 * Separate from Services on purpose, and the distinction is the whole design:
 * a service is what the customer PAYS for, a style is what they ASK for.
 * "Haircut + styling" is one service and twenty styles, and conflating them
 * would mean either twenty services on the bill or one style in the studio.
 *
 * What a style says here is a promise the chair has to keep, so the editor only
 * offers the controls the cut can actually take.
 */
export default async function HairstylesPage() {
  const [styles, kinds, { data: services }, user] = await Promise.all([
    apiFetchSafe<Hairstyle[]>('/hair-studio/hairstyles'),
    apiFetchSafe<KindsResponse>('/hair-studio/kinds'),
    apiFetchList<Service>('/services', { query: { pageSize: 200, sortBy: 'name', sortDir: 'asc' } }).catch(() => ({
      data: [] as Service[],
      meta: null,
    })),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('service.manage') ?? false;
  const rows = styles ?? [];
  const kindList = kinds?.kinds ?? [];
  const serviceOptions = services.map((service) => ({ id: service.id, name: service.name }));

  const unlinked = rows.filter((row) => !row.service).length;

  /** A list says "everything", which is what the API means by an empty one. */
  const summarise = <T extends string>(selected: T[], labels: Record<T, string>, all: number) =>
    selected.length === 0 || selected.length === all ? 'Any' : selected.map((item) => labels[item]).join(', ');

  return (
    <>
      <PageHeader
        title="Hairstyles"
        description={`${rows.length} ${rows.length === 1 ? 'style' : 'styles'} in the studio`}
        action={
          canManage && kindList.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {rows.length > 0 ? <InstallStarter label="Top up the standard menu" /> : null}
              <HairstyleEditor kinds={kindList} services={serviceOptions} />
            </div>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title="No styles yet"
            description="These are the cuts a customer can choose and customise in the design studio. Start from the standard menu and rename, reprice or remove whatever does not suit your salon."
            action={canManage ? <InstallStarter /> : undefined}
          />
        </Card>
      ) : (
        <Card>
          <Table className="min-w-[920px]">
            <THead>
              <TR>
                <TH>Style</TH>
                <TH>For</TH>
                <TH>Texture</TH>
                <TH>Length</TH>
                <TH>Density</TH>
                <TH>Can change</TH>
                <TH>Upkeep</TH>
                <TH>Service</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((style) => {
                const changeable = [
                  style.supportsBangs ? 'Bangs' : null,
                  style.supportsLayers ? 'Layers' : null,
                  style.supportsParting ? 'Parting' : null,
                  style.supportsFade ? 'Fade' : null,
                ].filter(Boolean);

                return (
                  <TR key={style.id} className={style.isActive ? undefined : 'opacity-60'}>
                    <TD>
                      <div className="font-medium text-ink">{style.name}</div>
                      <div className="mt-0.5 text-2xs text-ink-subtle">
                        {style.category ?? 'Uncategorised'}
                        {!style.isActive ? <span className="ml-1.5"><Badge tone="neutral">Not offered</Badge></span> : null}
                      </div>
                    </TD>
                    <TD className="text-xs text-ink-muted">{GENDER_LABELS[style.gender]}</TD>
                    <TD className="text-xs text-ink-muted">{summarise(style.supportedTextures, TEXTURE_LABELS, 4)}</TD>
                    <TD className="text-xs text-ink-muted">{summarise(style.supportedLengths, LENGTH_LABELS, 5)}</TD>
                    <TD className="text-xs text-ink-muted">{summarise(style.supportedDensities, DENSITY_LABELS, 3)}</TD>
                    <TD className="text-xs text-ink-muted">{changeable.length > 0 ? changeable.join(', ') : '—'}</TD>
                    <TD className="text-xs text-ink-muted">{MAINTENANCE_LABELS[style.maintenance]}</TD>
                    <TD>
                      {style.service ? (
                        <div className="text-xs">
                          <div className="text-ink">{style.service.name}</div>
                          <div className="tnum text-2xs text-ink-subtle">
                            {money(style.service.price)} · {style.service.durationMin} min
                          </div>
                        </div>
                      ) : (
                        // Not a cosmetic gap: without a service there is nothing
                        // for "Book this look" to put in the diary.
                        <Badge tone="warning" title="A customer cannot book this look until a service is attached">
                          Not bookable
                        </Badge>
                      )}
                    </TD>
                    <TD align="right">
                      {canManage ? (
                        <HairstyleEditor kinds={kindList} services={serviceOptions} style={style} as="icon" />
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>

          {unlinked > 0 ? (
            <TableFooterNote>
              {unlinked === 1 ? 'One style has' : `${unlinked} styles have`} no service attached, so a customer can design
              the look but cannot book it. Attach one and the booking button starts working.
            </TableFooterNote>
          ) : null}
        </Card>
      )}
    </>
  );
}
