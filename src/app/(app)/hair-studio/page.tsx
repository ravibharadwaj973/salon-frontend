import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import { fullName } from '@/lib/format';
import type { CustomerProfile } from '@/lib/types';
import type { Hairstyle } from './catalogue-types';
import { Studio, type InitialDesign } from './studio';
import { InstallStarter } from './install-starter';

export const metadata: Metadata = { title: 'Hair studio' };
export const dynamic = 'force-dynamic';

/**
 * DESIGN THE HAIRCUT BEFORE IT IS CUT.
 *
 * The hair is generated from the design rather than loaded from a file, so
 * every combination of cut, texture, length, density, volume and colour is one
 * mesh built in the browser. The alternative — a sculpted asset per
 * combination — is tens of thousands of files and a 3D artist between the salon
 * and every new style.
 *
 * It draws a styling head, not a photograph of the customer. Worth saying out
 * loud to whoever demonstrates this: it answers "what shape am I asking for",
 * which is the question that goes wrong in the chair, and not "what will I look
 * like", which no renderer honestly answers.
 */
export default async function HairStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; design?: string }>;
}) {
  const params = await searchParams;

  const [styles, customer, design] = await Promise.all([
    apiFetchSafe<Hairstyle[]>('/hair-studio/hairstyles', { query: { activeOnly: 'true' } }),
    params.customer ? apiFetchSafe<CustomerProfile>(`/customers/${params.customer}`) : Promise.resolve(null),
    params.design ? apiFetchSafe<InitialDesign>(`/hair-studio/designs/${params.design}`) : Promise.resolve(null),
  ]);

  const list = styles ?? [];

  return (
    <>
      <PageHeader
        title="Hair studio"
        description={
          customer ? `Designing with ${fullName(customer)}` : 'Design a look, then save it or book it'
        }
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="The studio has nothing to draw yet"
            description="It works from the cuts your salon offers. Add the standard menu and they appear here — rename, reprice or remove whatever does not suit your salon."
            /*
             * The button rather than a link to the old Hairstyles screen.
             * Removing that screen must not strand the studio: a salon that
             * opens this and finds no way forward does not come back, and the
             * admin asset studio that replaces it does not exist yet.
             */
            action={<InstallStarter />}
          />
        </Card>
      ) : (
        <Studio
          styles={list}
          customer={customer ? { id: customer.id, name: fullName(customer) } : null}
          initialDesign={design}
        />
      )}
    </>
  );
}
