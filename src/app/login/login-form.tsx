'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

interface LoginError {
  code: string;
  message: string;
  details?: { tenants?: { slug: string; name: string }[] };
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState<LoginError | null>(null);
  const [loading, setLoading] = useState(false);

  // The API asks for a salon only when one email belongs to several of them.
  const needsTenant = error?.code === 'CONFLICT';
  const tenantOptions = error?.details?.tenants ?? [];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantSlug: tenantSlug || undefined }),
      });

      const payload = (await response.json()) as { error?: LoginError };

      if (!response.ok) {
        setError(payload.error ?? { code: 'LOGIN_FAILED', message: 'Could not sign you in' });
        setLoading(false);
        return;
      }

      // A full page load, not router.replace(). Signing in sets an httpOnly
      // cookie on the server, and every route renders differently once it
      // exists — including the middleware that decides whether you may be
      // here at all. A client-side navigation races the router's own refresh
      // of /login and loses: the cookie is set, but you are handed the sign-in
      // page again and it looks like nothing happened.
      window.location.replace(next);
    } catch {
      setError({ code: 'NETWORK', message: 'Cannot reach the server. Check your connection.' });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error.message}</span>
        </div>
      ) : null}

      <Field label="Email">
        {({ id }) => (
          <Input
            id={id}
            type="email"
            autoComplete="username"
            required
            placeholder="you@yoursalon.in"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(error) && !needsTenant}
          />
        )}
      </Field>

      <Field label="Password">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(error) && !needsTenant}
          />
        )}
      </Field>

      {needsTenant ? (
        <Field label="Salon" hint="This email works at more than one salon">
          {({ id }) => (
            <select
              id={id}
              className="h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm"
              value={tenantSlug}
              onChange={(event) => setTenantSlug(event.target.value)}
              required
            >
              <option value="">Choose a salon…</option>
              {tenantOptions.map((tenant) => (
                <option key={tenant.slug} value={tenant.slug}>
                  {tenant.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Sign in
      </Button>

      <p className="text-center text-xs text-ink-subtle">
        Forgotten your password? Ask your salon owner to reset it.
      </p>
    </form>
  );
}
