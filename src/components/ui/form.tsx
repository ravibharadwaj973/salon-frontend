'use client';

import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink placeholder:text-ink-subtle shadow-sm transition-colors focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-ink-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(control, 'h-9', invalid && 'border-rose-400 focus:border-rose-500', className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, 'py-2 leading-relaxed', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ children, htmlFor, hint, required }: { children: React.ReactNode; htmlFor?: string; hint?: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-ink">
        {children}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {hint ? <span className="text-2xs text-ink-subtle">{hint}</span> : null}
    </label>
  );
}

/** Label + control + error message, wired together for screen readers. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id} hint={hint} required={required}>
          {label}
        </Label>
      ) : null}
      {children({ id })}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm text-ink">{label}</span>
        {description ? <span className="block text-xs text-ink-muted">{description}</span> : null}
      </label>
    </div>
  );
}

export function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-4">{children}</div>;
}
