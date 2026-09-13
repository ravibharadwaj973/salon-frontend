'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { apiDelete, apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Modal, useToast } from '@/components/ui/overlay';
import { PERMISSION_GROUPS, ROLE_LABEL } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

/**
 * One person's permissions: what their role gives them, plus anything the
 * owner has granted or taken away by name. The role stays the role — an
 * override is the exception written next to it, and it shows as such.
 */

interface UserDetail {
  id: string;
  name: string;
  role: UserRole;
  permissions: string[];
  overrides: { permission: string; allow: boolean }[];
}

interface RoleRow {
  role: UserRole;
  permissions: string[];
}

type Override = 'default' | 'allow' | 'deny';

export function UserPermissionsButton({ userId, name, role }: { userId: string; name: string; role: UserRole }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={role === 'OWNER'} title={role === 'OWNER' ? 'The owner has every permission' : undefined}>
        <KeyRound className="h-3.5 w-3.5" />
        Permissions
      </Button>
      {open ? <PermissionsModal userId={userId} name={name} role={role} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PermissionsModal({ userId, name, role, onClose }: { userId: string; name: string; role: UserRole; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['user', userId], queryFn: () => apiGet<UserDetail>(`users/${userId}`) });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => apiGet<RoleRow[]>('users/roles'), staleTime: 300_000 });

  const roleDefault = useMemo(() => new Set(roles?.find((r) => r.role === role)?.permissions ?? []), [roles, role]);
  const overrides = useMemo(() => new Map((user?.overrides ?? []).map((o) => [o.permission, o.allow])), [user]);
  const effective = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const set = useMutation({
    mutationFn: async ({ permission, value }: { permission: string; value: Override }) => {
      if (value === 'default') await apiDelete(`users/${userId}/permissions/${permission}`);
      else await apiPost(`users/${userId}/permissions`, { permission, allow: value === 'allow' });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user', userId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Anything the API knows that the catalogue does not, so nothing is invisible.
  const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
  const extras = [...new Set([...roleDefault, ...effective, ...overrides.keys()])].filter((k) => !known.has(k));
  const groups = extras.length ? [...PERMISSION_GROUPS, { title: 'Other', items: extras.map((key) => ({ key, label: key })) }] : PERMISSION_GROUPS;

  const overrideCount = overrides.size;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${name}'s permissions`}
      description={`${ROLE_LABEL[role] ?? role} by role${overrideCount ? ` · ${overrideCount} exception${overrideCount === 1 ? '' : 's'}` : ''}. Changes apply on their next request.`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {!user || !roles ? (
        <p className="py-6 text-center text-xs text-ink-subtle">Loading…</p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{group.title}</h3>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {group.items.map((item) => {
                  const byRole = roleDefault.has(item.key);
                  const override = overrides.get(item.key);
                  const value: Override = override === undefined ? 'default' : override ? 'allow' : 'deny';
                  const has = effective.has(item.key);
                  return (
                    <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className={`text-sm ${has ? 'text-ink' : 'text-ink-muted'}`}>
                          {item.label}
                          {value !== 'default' ? (
                            <span className={`ml-1.5 rounded px-1 py-px text-2xs font-medium ${value === 'allow' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {value === 'allow' ? 'granted' : 'taken away'}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-2xs text-ink-subtle">
                          {byRole ? 'Included in the role' : 'Not in the role'}
                          {'note' in item && item.note ? ` · ${item.note}` : ''}
                        </p>
                      </div>
                      <select
                        value={value}
                        onChange={(event) => set.mutate({ permission: item.key, value: event.target.value as Override })}
                        disabled={set.isPending}
                        aria-label={`${item.label} for ${name}`}
                        className="h-8 shrink-0 rounded-lg border border-stone-300 bg-white px-2 text-xs text-ink"
                      >
                        <option value="default">{byRole ? 'Yes (role)' : 'No (role)'}</option>
                        <option value="allow">Yes — grant</option>
                        <option value="deny">No — take away</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
