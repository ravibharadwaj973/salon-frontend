'use client';

import { useQuery } from '@tanstack/react-query';
import { Input, Select } from '@/components/ui/form';
import { apiGet, apiList } from '@/lib/client';
import type { Service, ServiceCategory, Staff } from '@/lib/types';

/**
 * The right control for the field, decided by the catalogue the API serves.
 *
 * This is the whole point of the rewrite. Before, every value was a text box —
 * which meant "Has had service" asked a salon owner to type a service id, a
 * thing they have never seen and cannot find. A rule you cannot fill in
 * correctly is a rule nobody uses.
 */
export type FieldInput =
  | 'number'
  | 'money'
  | 'days'
  | 'month'
  | 'boolean'
  | 'tier'
  | 'gender'
  | 'source'
  | 'channel'
  | 'service'
  | 'category'
  | 'staff'
  | 'branch'
  | 'tag'
  | 'text'
  | 'lifecycle';

export interface FieldDefinition {
  key: string;
  label: string;
  group: string;
  input: FieldInput;
  ops: string[];
  help?: string;
  placeholder?: string;
  postFilter?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'VIP'];
const GENDERS = ['FEMALE', 'MALE', 'OTHER'];
const SOURCES = ['WALK_IN', 'INSTAGRAM', 'REFERRAL', 'GOOGLE', 'WHATSAPP', 'WEBSITE', 'PHONE', 'OTHER'];
const CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'];

export function ConditionValue({
  field,
  value,
  onChange,
  branches,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
  branches: { id: string; name: string }[];
}) {
  // Catalogue lookups are only fetched when a rule actually needs them, and
  // shared across every condition by the query cache.
  const needsServices = field.input === 'service';
  const needsCategories = field.input === 'category';
  const needsStaff = field.input === 'staff';

  const { data: services } = useQuery({
    queryKey: ['segment-services'],
    queryFn: () => apiList<Service>('services', { query: { pageSize: 200, isActive: 'true' } }),
    enabled: needsServices,
  });
  const { data: categories } = useQuery({
    // This endpoint answers with a bare array rather than a paged envelope.
    queryKey: ['segment-categories'],
    queryFn: () => apiGet<ServiceCategory[]>('services/categories'),
    enabled: needsCategories,
  });
  const { data: staff } = useQuery({
    queryKey: ['segment-staff'],
    queryFn: () => apiList<Staff>('staff', { query: { pageSize: 200, isActive: 'true' } }),
    enabled: needsStaff,
  });

  const picker = (options: { value: string; label: string }[], empty: string) => (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );

  switch (field.input) {
    case 'boolean':
      return picker(
        [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ],
        'Choose…',
      );

    case 'month':
      return picker(
        MONTHS.map((label, index) => ({ value: String(index + 1), label })),
        'Pick a month…',
      );

    /**
     * Where a customer sits against their OWN visit cycle. Labelled the way an
     * owner would say it out loud, and ordered the way a customer travels
     * through it, so the list itself explains the idea.
     */
    case 'lifecycle':
      return picker(
        [
          { value: 'NEW', label: 'New — one visit, recently' },
          { value: 'ONE_TIME', label: 'One-time — came once, never back' },
          { value: 'ACTIVE', label: 'Active — inside their usual gap' },
          { value: 'DUE_SOON', label: 'Due soon — approaching their gap' },
          { value: 'DUE', label: 'Due — at their usual gap now' },
          { value: 'OVERDUE', label: 'Overdue — a little past it' },
          { value: 'AT_RISK', label: 'At risk — well past it' },
          { value: 'LAPSED', label: 'Lapsed — more than twice their gap' },
          { value: 'DORMANT', label: 'Dormant — over a year' },
          { value: 'NEVER_VISITED', label: 'Never visited' },
        ],
        'Any stage',
      );

    case 'tier':
      return picker(
        TIERS.map((tier) => ({ value: tier, label: `${tier[0]}${tier.slice(1).toLowerCase()}` })),
        'Any tier',
      );

    case 'gender':
      return picker(
        GENDERS.map((g) => ({ value: g, label: `${g[0]}${g.slice(1).toLowerCase()}` })),
        'Any',
      );

    case 'source':
      return picker(
        SOURCES.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase() })),
        'Any source',
      );

    case 'channel':
      return picker(
        CHANNELS.map((c) => ({ value: c, label: c === 'WHATSAPP' ? 'WhatsApp' : c === 'SMS' ? 'SMS' : 'Email' })),
        'Pick a channel…',
      );

    case 'service':
      return picker(
        (services?.data ?? []).map((service) => ({ value: service.id, label: service.name })),
        services ? 'Pick a service…' : 'Loading services…',
      );

    case 'category':
      return picker(
        (categories ?? []).map((category) => ({ value: category.id, label: category.name })),
        categories ? 'Pick a category…' : 'Loading categories…',
      );

    case 'staff':
      return picker(
        (staff?.data ?? []).map((member) => ({ value: member.id, label: member.displayName })),
        staff ? 'Pick a person…' : 'Loading staff…',
      );

    case 'branch':
      return picker(
        branches.map((branch) => ({ value: branch.id, label: branch.name })),
        'Pick a branch…',
      );

    case 'days':
    case 'number':
      return (
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="tnum"
        />
      );

    case 'money':
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">₹</span>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={value}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className="tnum pl-6"
          />
        </div>
      );

    default:
      return (
        <Input
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
