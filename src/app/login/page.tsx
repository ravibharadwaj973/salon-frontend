import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ParlonLogo, ParlonMark } from '@/components/brand/parlon-logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen">
      {/* Left: the pitch, not a feature list. */}
      <section className="relative hidden w-1/2 flex-col justify-between bg-brand-700 p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <ParlonMark className="h-5 w-5 text-white" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Parlon</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Run the entire salon, and bring customers back automatically.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Appointments, billing and stock in one place — and a retention engine that notices when someone stops
            coming, long before you would.
          </p>

          <ol className="mt-8 space-y-2.5 text-sm text-brand-100">
            {[
              'Customer books — confirmation goes out',
              'They visit — bill and invoice on WhatsApp',
              'Review request, loyalty points added',
              '30 days later — rebooking reminder',
              'No response — win-back offer',
              'Customer returns. Revenue recorded.',
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xs font-semibold">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <p className="text-2xs text-brand-200">© {new Date().getFullYear()} Parlon</p>
      </section>

      {/* Right: the form */}
      <section className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <ParlonLogo className="h-9 w-9" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink-muted">Use the login your salon gave you.</p>

          <Suspense fallback={<div className="mt-6 h-64" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
