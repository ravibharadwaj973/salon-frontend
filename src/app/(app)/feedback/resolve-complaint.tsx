'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';

export function ResolveComplaint({ feedbackId }: { feedbackId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await apiPost(`feedback/${feedbackId}/resolve`, { note: note.trim() });
      toast.success('Marked resolved');
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Resolve
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Resolve this complaint"
        description="Say what you did about it. A low rating left unanswered tends to become a public review."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving} disabled={note.trim().length < 3}>
              Mark resolved
            </Button>
          </>
        }
      >
        <Field label="What was done" required>
          {({ id }) => (
            <Textarea
              id={id}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Called the customer, apologised for the wait, offered a complimentary head massage on the next visit."
              autoFocus
            />
          )}
        </Field>
      </Modal>
    </>
  );
}
