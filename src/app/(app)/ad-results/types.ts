/** Mirrors SourceResult in the backend's marketing-source.service. */
export interface SourceResult {
  id: string;
  name: string;
  code: string;
  channel: string;
  kind: string;
  isActive: boolean;
  spend: number;
  dailyBudget: number | null;
  clicks: number;
  /** Conversations opened by somebody who arrived from this promotion. */
  conversations: number;
  bookings: number;
  billed: number;
  revenue: number;
  /**
   * Null -- not zero -- when nothing was spent. The backend is deliberate about
   * this and every screen has to stay deliberate about it too: rendering a null
   * as 0 would make the promotion nobody paid for the cheapest one on the page.
   */
  costPerBooking: number | null;
  returnOnSpend: number | null;
}

/** A row from GET /marketing-sources, which adds the shareable link. */
export interface Source {
  id: string;
  name: string;
  code: string;
  channel: string;
  kind: string;
  spend: string | number;
  dailyBudget: string | number | null;
  startedOn: string | null;
  endedOn: string | null;
  branchId: string | null;
  notes: string | null;
  isActive: boolean;
  link: string;
}

export const CHANNELS = ['INSTAGRAM', 'MESSENGER', 'WHATSAPP', 'EMAIL', 'SMS', 'IN_APP'] as const;
export const KINDS = ['BOOSTED_POST', 'AD', 'ORGANIC_POST', 'QR', 'OTHER'] as const;

export const CHANNEL_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  IN_APP: 'In app',
};

export const KIND_LABELS: Record<string, string> = {
  BOOSTED_POST: 'Boosted post',
  AD: 'Ad',
  ORGANIC_POST: 'Ordinary post',
  QR: 'QR code',
  OTHER: 'Other',
};
