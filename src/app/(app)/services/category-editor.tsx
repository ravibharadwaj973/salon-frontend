'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Pencil } from 'lucide-react';
import { apiDelete, apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { ServiceCategory } from '@/lib/types';

/**
 * ADDING A CATEGORY, WHICH UNTIL NOW COULD ONLY BE DONE BY THE SEED.
 *
 * The API has had create, rename and delete all along; there was simply no
 * way to reach any of them. A salon could put a service into a category and
 * never make one, which meant every salon lived with the six the seed happened
 * to choose — fine for a hair salon, wrong for a nail bar, and impossible to
 * correct.
 *
 * A category is not decoration. It groups the menu on the salon's own website,
 * it is what the gallery's sections are built from, and it is what the
 * suggestion engine reaches for when it has no pairing to go on. So this is
 * the same object those three features already read, edited in the one place
 * somebody would look for it.
 */
export function CategoryEditor({
  category,
  compact,
}: {
  category?: ServiceCategory;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: category?.name ?? '',
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.name.trim()) {
      setError('A name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sortOrder: form.sortOrder,
        ...(category ? { isActive: form.isActive } : {}),
      };

      if (category) await apiPatch(`services/categories/${category.id}`, payload);
      else await apiPost('services/categories', payload);

      toast.success(category ? 'Category updated' : 'Category added');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Removing one is refused while active services still sit in it, by the API
   * rather than by this form — and the message it sends back names the count,
   * which is more use than anything guessed here. All this has to do is show
   * it rather than swallow it.
   */
  async function remove() {
    if (!category) return;
    setError(null);
    setSaving(true);
    try {
      await apiDelete(`services/categories/${category.id}`);
      toast.success('Category removed');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-ink-subtle hover:bg-stone-100 hover:text-ink"
          aria-label={`Edit category ${category?.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <FolderPlus className="h-4 w-4" />
          New category
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={category ? `Edit ${category.name}` : 'New category'}
        description="Groups your menu here, on your website, and in the gallery."
        footer={
          <>
            {category ? (
              <Button variant="secondary" onClick={remove} disabled={saving}>
                Remove
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {category ? 'Save changes' : 'Add category'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <Field
            label="Name"
            required
            hint="What customers read on your website — “Hair”, “Nails”, “Bridal”."
          >
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}
          </Field>

          <Field label="Order" hint="Lower numbers come first. Ties fall back to the name.">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={999}
                value={form.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value))}
              />
            )}
          </Field>

          {category ? (
            <Checkbox
              label="Show this category"
              description="Hiding it takes the section off your website without touching the services in it."
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
          ) : null}
        </div>
      </Modal>
    </>
  );
}
