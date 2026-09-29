/** What a reply box is allowed to be, right now, for one customer. */
export interface ReplyWindow {
  /** False once 24 hours have passed since the customer last wrote. */
  open: boolean;
  shape: 'FREE_FORM' | 'TEMPLATE';
  minutesLeft: number;
}

/**
 * EVENT is not a speaker. It is the assistant having DONE something — read the
 * diary, booked, been handed over — and nothing was sent to anybody, so it must
 * never be drawn as a message the customer could have seen.
 */
export type Speaker = 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM' | 'EVENT';

export type EventKind =
  | 'AVAILABILITY_CHECKED'
  | 'SLOT_OFFERED'
  | 'APPOINTMENT_BOOKED'
  | 'BOOKING_FAILED'
  | 'BRANCH_ASKED'
  | 'BRANCH_SWITCHED'
  | 'HANDED_OVER'
  | 'TAKEN_OVER'
  | 'ASSISTANT_RESUMED';

export interface ConversationSummary {
  id: string;
  mode: 'AI' | 'HUMAN';
  status: string;
  customerId: string | null;
  name: string;
  address: string;
  /** Nobody on the book has this number. They are still worth answering. */
  stranger: boolean;
  assignedTo: string | null;
  needsAttention: boolean;
  lastMessageAt: string | null;
  lastCustomerMessageAt: string | null;
  preview: string;
  previewFrom: Speaker | null;
  window: ReplyWindow;
}

export interface ThreadTurn {
  id: string;
  from: Speaker;
  body: string;
  at: string;
  /** Outbound only: QUEUED, SENT, DELIVERED, READ, FAILED. */
  status?: string;
  error?: string | null;
  messageType?: string;
  eventKind?: EventKind;
  detail?: unknown;
}

export interface ConversationDetail {
  id: string;
  mode: 'AI' | 'HUMAN';
  status: string;
  name: string;
  address: string;
  customerId: string | null;
  stranger: boolean;
  assignedTo: string | null;
  needsAttention: boolean;
  window: ReplyWindow;
  turns: ThreadTurn[];
}
