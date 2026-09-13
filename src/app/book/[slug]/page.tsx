import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, Phone } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';
import { BookingFlow } from './booking-flow';
import type { Service } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PublicSalon {
  salon: { id: string; name: string; slug: string; logoUrl: string | null; phone: string; email: string; city: string | null };
  branches: {
    id: string;
    name: string;
    addressLine: string | null;
    city: string | null;
    pincode: string | null;
    phone: string | null;
    openingHours: Record<string, { open: string; close: string }[]>;
    timezone: string;
  }[];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const data = await apiFetch<PublicSalon>(`/public/${(await params).slug}`, { noBranch: true });
    return {
      title: `Book at ${data.salon.name}`,
      description: `Book an appointment at ${data.salon.name}${data.salon.city ? ` in ${data.salon.city}` : ''}.`,
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: 'Book an appointment' };
  }
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let data: PublicSalon;
  try {
    data = await apiFetch<PublicSalon>(`/public/${slug}`, { noBranch: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const menu = await apiFetch<{ id: string; name: string; services: Service[] }[]>(`/public/${slug}/services`, {
    noBranch: true,
  }).catch(() => []);

  return (
    <main className="min-h-screen bg-canvas">
      {/* Header — the salon, not the software */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-5">
          {data.salon.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.salon.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              {data.salon.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">{data.salon.name}</h1>
            <p className="flex items-center gap-3 text-xs text-ink-muted">
              {data.salon.city ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {data.salon.city}
                </span>
              ) : null}
              <a href={`tel:${data.salon.phone}`} className="flex items-center gap-1 hover:text-ink">
                <Phone className="h-3 w-3" />
                {data.salon.phone}
              </a>
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <BookingFlow slug={slug} salonName={data.salon.name} branches={data.branches} menu={menu} />
      </div>

      <footer className="pb-10 text-center text-2xs text-ink-subtle">
        You pay at the salon — no payment is taken online.
      </footer>
    </main>
  );
}
