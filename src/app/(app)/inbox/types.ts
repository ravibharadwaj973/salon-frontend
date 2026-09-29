/** What a reply box is allowed to be, right now, for one customer. */
export interface ReplyWindow {
  /** False once 24 hours have passed since the customer last wrote. */
  open: boolean;
  shape: 'FREE_FORM' | 'TEMPLATE';
  minutesLeft: number;
}

export type Speaker = 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM';

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
