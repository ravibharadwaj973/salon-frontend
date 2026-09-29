import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { FeedbackForm } from '../../[appointmentId]/feedback-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'How was your visit?',
  // A card on a counter is scanned, never searched for, and the id in the URL
  // belongs to one salon's branch. Nothing here should end up in an index.
  robots: { index: false, follow: false },
};

interface QrContext {
  salonName: string;
  logoUrl: string | null;
  branchName: string;
  services: { id: string; name: string; category: string | null }[];
}

/**
 * THE PAGE BEHIND THE CARD ON THE COUNTER.
 *
 * The other two feedback links know the visit — who came, what they had, when
 * — because the salon sent them. This one knows only which branch the card was
 * printed for, so it asks the one question the others never have to: what did
 * you have today?
 *
 * It exists for the customer the other two cannot reach. Plenty of people pay
 * cash, leave no number, and walk out; they are exactly as able to leave a
 * Google review as anyone else, and this catches them while they are still
 * standing in the salon, which is when they are most likely to.
 *
 * Everything after that first question is the same screen as a booked visit —
 * the same component, so the two cannot drift apart.
 */
export default async function QrFeedbackPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;

  let context: QrContext;
  try {
    context = await apiFetch<QrContext>(`/public/feedback/qr/${branchId}`, { noBranch: true });
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
          <h1 className="text-lg font-semibold text-ink">{context.salonName}</h1>
          <p className="text-xs text-ink-muted">{context.branchName}</p>
        </div>

        <FeedbackForm
          /* No visit id: the post goes to the branch route, and the Google tap
             is recorded against the feedback's own id once it exists. */
          appointmentId=""
          submitPath={`public/feedback/qr/${branchId}`}
          pickServices
          customerName="there"
          services={context.services}
          staffName={null}
          alreadySubmitted={false}
        />

        <p className="mt-6 text-center text-2xs leading-relaxed text-ink-subtle">
          Your rating goes to {context.salonName}. Nothing is posted anywhere public unless you choose to.
        </p>
      </div>
    </main>
  );
}
