/**
 * The words a salon owner uses for a trigger, rather than the enum.
 *
 * Shared between the list and the detail page on purpose: they were about to
 * be two copies, and two copies of a label table drift — the list would say
 * "When a customer goes quiet" and the detail page NO_VISIT_DAYS, for the same
 * automation, and the owner would reasonably wonder whether they were looking
 * at the same thing.
 */
export const TRIGGER_LABEL: Record<string, string> = {
  APPOINTMENT_BOOKED: 'When an appointment is booked',
  APPOINTMENT_REMINDER: 'Before an appointment, as a reminder',
  APPOINTMENT_COMPLETED: 'After a visit is completed',
  APPOINTMENT_CANCELLED: 'When an appointment is cancelled',
  FIRST_VISIT: 'After a customer’s first visit',
  INVOICE_PAID: 'When a bill is paid',
  NO_VISIT_DAYS: 'When a customer goes quiet',
  MEMBERSHIP_EXPIRING: 'Before a membership expires',
  PACKAGE_EXPIRING: 'Before a package expires',
  BIRTHDAY: 'On a birthday',
  ANNIVERSARY: 'On an anniversary',
  LEAD_CREATED: 'When a new enquiry arrives',
  REVIEW_REQUEST: 'After feedback is left',
  MANUAL: 'Only when someone starts it by hand',
};

export const ACTION_LABEL: Record<string, string> = {
  SEND_MESSAGE: 'Send message',
  ADD_TAG: 'Add tag',
  REMOVE_TAG: 'Remove tag',
  ADD_LOYALTY_POINTS: 'Award points',
  CREATE_TASK: 'Create a task',
  ADD_TO_SEGMENT: 'Add to segment',
  WAIT: 'Wait',
  EXIT_IF_BOOKED: 'Stop if they book',
};

export function triggerLabel(trigger: string): string {
  return TRIGGER_LABEL[trigger] ?? trigger.replace(/_/g, ' ').toLowerCase();
}
