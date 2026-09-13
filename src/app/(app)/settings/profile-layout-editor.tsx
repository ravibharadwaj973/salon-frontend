'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, RotateCcw } from 'lucide-react';
import { apiPut, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';
import { ROLE_LABEL } from '@/lib/permissions';
import type { PageLayout, UserRole } from '@/lib/types';

/**
 * Which role sees which part of a sectioned page (a customer's, a staff
 * member's). The owner is not a column:
 * they always see everything. A cell is locked when that role lacks the
 * permission behind the section — the API would not serve the data, so
 * ticking the box would promise something the page cannot show.
 */

const ROLES: UserRole[] = ['ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STYLIST', 'ACCOUNTANT'];

type Matrix = Record<string, Set<UserRole>>;

export function ProfileLayoutEditor({ layout }: { layout: PageLayout }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const initial = useMemo<Matrix>(() => {
    const m = {} as Matrix;
    for (const section of layout.sections) m[section.key] = new Set(section.roles);
    return m;
  }, [layout]);

  const [matrix, setMatrix] = useState<Matrix>(initial);
  const [dirty, setDirty] = useState(false);

  function toggle(key: string, role: UserRole) {
    setMatrix((current) => {
      const next = { ...current, [key]: new Set(current[key]) };
      if (next[key].has(role)) next[key].delete(role);
      else next[key].add(role);
      return next;
    });
    setDirty(true);
  }

  function setRow(key: string, on: boolean, eligible: UserRole[]) {
    setMatrix((current) => ({
      ...current,
      [key]: new Set(on ? ['OWNER', ...ROLES.filter((r) => eligible.includes(r))] : ['OWNER']),
    }));
    setDirty(true);
  }

  function resetToDefaults() {
    setMatrix(initial);
    setDirty(false);
  }

  async function save() {
    setSaving(true);
    try {
      const sections = Object.fromEntries(
        Object.entries(matrix).map(([key, roles]) => [key, [...roles]]),
      );
      await apiPut(`layouts/${layout.page}`, { sections });
      toast.success('Saved — it applies the next time each person opens a customer');
      setDirty(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={layout.title}
        subtitle={`${layout.description} You always see everything; a locked cell means that role's permissions do not include the data anyway.`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetToDefaults} disabled={!dirty}>
              <RotateCcw className="h-3.5 w-3.5" />
              Undo changes
            </Button>
            <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
              Save
            </Button>
          </div>
        }
      />
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-5 py-2.5 text-left font-medium">Section</th>
              {ROLES.map((role) => (
                <th key={role} className="px-2 py-2.5 text-center font-medium">
                  {ROLE_LABEL[role] ?? role}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">Row</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {layout.sections.map((section) => {
              const roles = matrix[section.key];
              return (
                <tr key={section.key}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{section.label}</p>
                    <p className="text-xs text-ink-muted">{section.description}</p>
                  </td>
                  {ROLES.map((role) => {
                    const allowed = section.eligibleRoles.includes(role);
                    const on = roles.has(role);
                    return (
                      <td key={role} className="px-2 py-3 text-center">
                        {allowed ? (
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(section.key, role)}
                            aria-label={`${section.label} visible to ${ROLE_LABEL[role] ?? role}`}
                            className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
                          />
                        ) : (
                          <span title={`${ROLE_LABEL[role] ?? role} does not have ${section.permission}`}>
                            <Lock className="mx-auto h-3.5 w-3.5 text-stone-300" aria-hidden />
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right text-2xs">
                    <button type="button" onClick={() => setRow(section.key, true, section.eligibleRoles)} className="text-brand-700 hover:underline">
                      all
                    </button>
                    <span className="mx-1 text-ink-subtle">·</span>
                    <button type="button" onClick={() => setRow(section.key, false, section.eligibleRoles)} className="text-ink-muted hover:underline">
                      none
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
