import { Badge } from '@/components/ui/display';
import type { TemplateApprovalStatus, TemplateCategory } from '@/lib/types';

/**
 * Meta's verdict, said plainly.
 *
 * The old badge had two outcomes — approved, or the raw enum in lowercase — so
 * "rejected", "paused" and "never submitted" all read as equally mild. They are
 * not: one is temporary, one needs a new template, and one means nothing has
 * ever been sent for review.
 */
const META: Record<TemplateApprovalStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; help: string }> = {
  APPROVED: { label: 'Approved', tone: 'success', help: 'Meta approved this. It can be sent to customers.' },
  PENDING: { label: 'In review', tone: 'warning', help: 'With Meta now. Usually minutes to a few hours.' },
  DRAFT: {
    label: 'Not submitted',
    tone: 'neutral',
    help: 'Meta has never seen this. WhatsApp will not deliver it until it is approved.',
  },
  REJECTED: { label: 'Rejected', tone: 'danger', help: 'Meta refused it. A rejected template cannot be renamed — write a new one.' },
  PAUSED: {
    label: 'Paused by Meta',
    tone: 'danger',
    help: 'Too many customers reported messages like this one. It will not send until Meta lifts the pause.',
  },
  DISABLED: { label: 'Disabled by Meta', tone: 'danger', help: 'This template cannot be used again.' },
};

export function MetaStatusBadge({ status, channel }: { status: TemplateApprovalStatus; channel: string }) {
  // Only WhatsApp templates are reviewed. Showing "Not submitted" on an email
  // template invents a problem that does not exist.
  if (channel !== 'WHATSAPP') return null;
  const meta = META[status] ?? META.DRAFT;
  // The explanation is rendered on the card itself rather than hidden in a
  // tooltip — a hover hint is invisible on the phone the salon owner is using.
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function metaHelp(status: TemplateApprovalStatus): string {
  return (META[status] ?? META.DRAFT).help;
}

/**
 * The category, and who decided it.
 *
 * Meta re-reads the wording at review and files a template under the category
 * its CONTENT belongs to, ignoring the one submitted: a review request or a
 * "book your next session" sent up as utility comes back marketing. That is
 * not cosmetic — marketing templates only reach customers who opted in to
 * marketing, and they cost more per conversation.
 *
 * So the badge shows Meta's answer, and when it differs from what was asked
 * for it says so, rather than quietly replacing the salon's choice with
 * another word and leaving them to wonder when it changed.
 */
export function CategoryBadge({
  category,
  requestedCategory,
  channel,
}: {
  category: TemplateCategory;
  requestedCategory?: TemplateCategory | null;
  channel: string;
}) {
  const overruled = channel === 'WHATSAPP' && requestedCategory != null && requestedCategory !== category;

  return (
    <Badge tone={category === 'MARKETING' ? 'warning' : 'info'}>
      {category.toLowerCase()}
      {overruled ? ' · by Meta' : ''}
    </Badge>
  );
}

/** The sentence under the card, when Meta disagreed. Null when it did not. */
export function categoryNote({
  category,
  requestedCategory,
  channel,
}: {
  category: TemplateCategory;
  requestedCategory?: TemplateCategory | null;
  channel: string;
}): string | null {
  if (channel !== 'WHATSAPP' || requestedCategory == null || requestedCategory === category) return null;

  const base =
    `Submitted as ${requestedCategory.toLowerCase()}; Meta filed it as ${category.toLowerCase()}. ` +
    'Meta judges the category by the wording, not by what was submitted.';

  return category === 'MARKETING'
    ? `${base} It now only goes to customers who opted in to marketing, and costs more per conversation.`
    : base;
}
