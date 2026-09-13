'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StickyNote } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/display';
import { Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { dateTime } from '@/lib/format';

interface Note {
  id: string;
  note: string;
  createdAt: string;
}

export function CustomerNotes({ customerId, initialNote }: { customerId: string; initialNote: string | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: notes = [] } = useQuery({
    queryKey: ['customer-notes', customerId],
    queryFn: () => apiGet<Note[]>(`customers/${customerId}/notes`),
  });

  const addNote = useMutation({
    mutationFn: (note: string) => apiPost(`customers/${customerId}/notes`, { note }),
    onSuccess: async () => {
      setDraft('');
      toast.success('Note saved');
      await queryClient.invalidateQueries({ queryKey: ['customer-notes', customerId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader title="Notes" subtitle="Anything the team should know before the next visit" />
      <CardBody>
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Prefers a shorter fringe. Sensitive scalp — patch test before colour."
            rows={2}
            className="flex-1"
          />
          <Button
            onClick={() => addNote.mutate(draft.trim())}
            disabled={draft.trim().length === 0}
            loading={addNote.isPending}
            className="self-end"
          >
            Add
          </Button>
        </div>

        {initialNote ? (
          <p className="mt-4 rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-ink-muted">{initialNote}</p>
        ) : null}

        {notes.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {notes.map((note) => (
              <li key={note.id} className="border-l-2 border-brand-200 pl-3">
                <p className="text-sm leading-relaxed text-ink">{note.note}</p>
                <p className="mt-0.5 text-2xs text-ink-subtle">{dateTime(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : !initialNote ? (
          <EmptyState icon={StickyNote} title="No notes yet" className="py-8" />
        ) : null}
      </CardBody>
    </Card>
  );
}
