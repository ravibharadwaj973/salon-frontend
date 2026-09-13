import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Thank you' };

interface GoogleHop {
  googleReviewUrl: string | null;
  recorded: boolean;
}

/**
 * The hop the "leave us a review" message links to, rather than linking
 * straight to Google. It costs one redirect and buys the salon the only
 * number that matters here: how many of the people asked actually went.
 *
 * If the salon has not set a link yet, there is nowhere to send them, so they
 * land on the ordinary feedback page instead of a dead end.
 */
export default async function GoogleReviewHop({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;

  let target: string | null = null;
  try {
    const result = await apiFetch<GoogleHop>(`/public/feedback/${appointmentId}/google`, {
      method: 'POST',
      body: {},
      noBranch: true,
    });
    target = result.googleReviewUrl;
  } catch {
    target = null;
  }

  redirect(target ?? `/feedback/${appointmentId}`);
}
