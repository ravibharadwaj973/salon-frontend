'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, Lock, LogOut, Menu, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { visibleNav } from './nav';
import { Avatar } from '@/components/ui/display';
import { ROLE_LABEL } from '@/lib/permissions';
import type { SessionUser } from '@/lib/types';

export function AppShell({
  user,
  activeBranchId,
  unreadAlerts,
  children,
}: {
  user: SessionUser;
  activeBranchId: string | null;
  unreadAlerts: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const groups = visibleNav(user.permissions, user.features ?? []);
  const activeBranch = user.branches.find((branch) => branch.id === activeBranchId) ?? user.branches[0] ?? null;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  async function switchBranch(branchId: string) {
    setSwitching(true);
    await fetch('/api/auth/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId }),
    });
    setMenuOpen(false);
    setSwitching(false);
    router.refresh();
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Hard navigation, for the same reason as signing in: the cookie changed
    // on the server, and a client-side navigation would leave cached pages
    // rendered as though the user were still signed in.
    window.location.replace('/login');
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-stone-200 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
          S
        </span>
        <span className="truncate text-sm font-semibold tracking-tight text-ink">{user.tenant.name}</span>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-ink-muted hover:bg-stone-100 hover:text-ink',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-ink-subtle')} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar name={user.name} src={user.avatarUrl} id={user.id} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{user.name}</p>
            <p className="truncate text-2xs text-ink-subtle">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md p-1.5 text-ink-subtle hover:bg-stone-100 hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-stone-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative h-full w-64 border-r border-stone-200 bg-white">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-ink-subtle hover:bg-stone-100"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded-md p-2 text-ink-muted hover:bg-stone-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Branch switcher — the app always works "in" one branch. */}
          {user.branches.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm hover:bg-stone-50"
                disabled={switching}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {activeBranch?.name ?? 'All branches'}
                <ChevronDown className="h-3.5 w-3.5 text-ink-subtle" />
              </button>

              {menuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-stone-200 bg-white p-1 shadow-pop">
                    {user.branches.map((branch) => (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => switchBranch(branch.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-stone-100',
                          branch.id === activeBranch?.id && 'bg-brand-50 font-medium text-brand-700',
                        )}
                      >
                        {branch.name}
                        <span className="text-2xs text-ink-subtle">{branch.code}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <form action="/customers" className="ml-auto hidden w-full max-w-xs items-center sm:flex">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
              <input
                type="search"
                name="q"
                placeholder="Search customers…"
                className="h-8 w-full rounded-lg border border-stone-300 bg-white pl-8 pr-3 text-xs shadow-sm placeholder:text-ink-subtle"
              />
            </div>
          </form>

          <Link
            href="/?panel=alerts"
            className="relative ml-auto rounded-md p-2 text-ink-muted hover:bg-stone-100 sm:ml-0"
            aria-label={`Alerts${unreadAlerts ? ` (${unreadAlerts} unread)` : ''}`}
          >
            <Bell className="h-4 w-4" />
            {unreadAlerts > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                {unreadAlerts > 9 ? '9+' : unreadAlerts}
              </span>
            ) : null}
          </Link>
        </header>

        {user.readOnly ? (
          /*
           * Said once, at the top, on every screen — because the alternative is
           * a receptionist filling in a whole bill and meeting a 403 on save.
           */
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-900">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium">This account is switched off.</span>{' '}
                {user.readOnlyReason ??
                  'Nothing new can be saved. Everything already here is still yours to read and export.'}
              </span>
            </p>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
