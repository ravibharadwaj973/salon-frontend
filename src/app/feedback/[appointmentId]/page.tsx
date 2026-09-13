import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { FeedbackForm } from './feedback-form';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'How was your visit?' };

interface FeedbackContext {
  salonName: string;
  logoUrl: string | null;
  branchName: string;
  customerName: string;
  visitDate: string;
  services: string[];
  staffName: string | null;
  alreadySubmitted: boolean;
}

export default async function PublicFeedbackPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;

  let context: FeedbackContext;
  try {
    context = await apiFetch<FeedbackContext>(`/public/feedback/${appointmentId}`, { noBranch: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {context.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={context.logoUrl} alt="" className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover" />
          ) : (
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
              {context.salonName.slice(0, 1)}
            </span>
          )}
          <h1 className="text-lg font-semibold tracking-tight text-ink">{context.salonName}</h1>
          <p className="mt-1 text-xs text-ink-muted">
            {context.branchName} · {date(context.visitDate)}
          </p>
        </div>

        <FeedbackForm
          appointmentId={appointmentId}
          customerName={context.customerName}
          services={context.services}
          staffName={context.staffName}
          alreadySubmitted={context.alreadySubmitted}
        />
      </div>
    </main>
  );
}
