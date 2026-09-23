'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import type { TemplateButton } from '@/lib/types';

/**
 * The buttons under a WhatsApp message.
 *
 * Three kinds, and they behave differently enough to be worth naming plainly:
 * a link opens a page, a call dials, and a quick reply sends its own label back
 * as a message — which lands in the inbox as a customer reply, so "Confirm" and
 * "Reschedule" become answers the salon can act on rather than a conversation
 * somebody has to have.
 *
 * The awkward one is a link that changes per customer. Meta does not store a
 * whole address in a variable: it keeps a fixed base and appends one value at
 * the very end. So the address here stops at the last slash and the value —
 * {{invoice_token}} — fills the rest. Getting this wrong produces a link with
 * the origin in it twice, which Meta accepts and which opens nothing, so the
 * form asks for the two halves separately rather than letting anyone paste a
 * whole URL and hope.
 */
const LIMITS = { URL: 2, PHONE_NUMBER: 1, QUICK_REPLY: 3 };

/** Values a button's suffix can be filled from. Tokens, never whole links. */
const SUFFIX_VARIABLES = ['invoice_token'];

export function ButtonEditor({
  buttons,
  onChange,
}: {
  buttons: TemplateButton[];
  onChange: (next: TemplateButton[]) => void;
}) {
  const count = (type: TemplateButton['type']) => buttons.filter((b) => b.type === type).length;

  const add = (type: TemplateButton['type']) => {
    if (type === 'URL') onChange([...buttons, { type, text: '', url: 'https://parlon.jharavi.in/', variable: null }]);
    else if (type === 'PHONE_NUMBER') onChange([...buttons, { type, text: '', phone: '' }]);
    else onChange([...buttons, { type, text: '' }]);
  };

  const update = (index: number, patch: Partial<TemplateButton>) =>
    onChange(buttons.map((b, i) => (i === index ? ({ ...b, ...patch } as TemplateButton) : b)));

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink">Buttons</p>
          <p className="text-2xs text-ink-muted">
            Optional. A quick reply comes back as a message from the customer; a link opens a page.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" disabled={count('URL') >= LIMITS.URL} onClick={() => add('URL')}>
            <Plus className="h-3.5 w-3.5" /> Link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={count('QUICK_REPLY') >= LIMITS.QUICK_REPLY}
            onClick={() => add('QUICK_REPLY')}
          >
            <Plus className="h-3.5 w-3.5" /> Quick reply
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={count('PHONE_NUMBER') >= LIMITS.PHONE_NUMBER}
            onClick={() => add('PHONE_NUMBER')}
          >
            <Plus className="h-3.5 w-3.5" /> Call
          </Button>
        </div>
      </div>

      {buttons.length === 0 ? (
        <p className="text-2xs text-ink-subtle">
          No buttons. The message will be plain text — which is fine, and is what every template here does today.
        </p>
      ) : null}

      {buttons.map((button, index) => (
        <div key={index} className="space-y-2 rounded-md bg-stone-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">
              {button.type === 'URL' ? 'Link' : button.type === 'PHONE_NUMBER' ? 'Call' : 'Quick reply'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(buttons.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Field label="Label" hint="What the customer taps — 25 characters at most">
            {({ id }) => (
              <Input
                id={id}
                value={button.text}
                maxLength={25}
                onChange={(e) => update(index, { text: e.target.value })}
                placeholder={button.type === 'URL' ? 'View bill' : button.type === 'PHONE_NUMBER' ? 'Call us' : 'Confirm'}
              />
            )}
          </Field>

          {button.type === 'URL' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Address" hint={button.variable ? 'Must end with / — the value is added after it' : 'The page this opens'}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={button.url}
                    onChange={(e) => update(index, { url: e.target.value })}
                    className="font-mono text-xs"
                  />
                )}
              </Field>
              <Field label="Then add" hint="Leave as “nothing” for a link that is the same for everyone">
                {({ id }) => (
                  <Select
                    id={id}
                    value={button.variable ?? ''}
                    onChange={(e) => update(index, { variable: e.target.value || null })}
                  >
                    <option value="">nothing — same link for everyone</option>
                    {SUFFIX_VARIABLES.map((name) => (
                      <option key={name} value={name}>
                        {`{{${name}}}`}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {button.variable ? (
                <p className="sm:col-span-2 font-mono text-2xs text-ink-muted">
                  {button.url}
                  <span className="rounded bg-brand-100 px-1 text-brand-800">{`{{${button.variable}}}`}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {button.type === 'PHONE_NUMBER' ? (
            <Field label="Number" hint="With the country code">
              {({ id }) => (
                <Input
                  id={id}
                  value={button.phone}
                  onChange={(e) => update(index, { phone: e.target.value })}
                  placeholder="+91 92209 99209"
                  className="font-mono text-xs"
                />
              )}
            </Field>
          ) : null}

          {button.type === 'QUICK_REPLY' ? (
            <p className="text-2xs text-ink-muted">
              Tapping this sends “{button.text || 'the label'}” back as a message from the customer, and opens the
              24-hour window in which you can reply in your own words.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
