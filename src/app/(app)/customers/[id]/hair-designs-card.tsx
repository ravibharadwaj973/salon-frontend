import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/display';
import { date } from '@/lib/format';

/** The parts of a saved look this card shows. Mirrors the hair-studio module. */
export interface HairDesignSummary {
  id: string;
  name: string;
  hairstyleKey: string;
  texture: string;
  length: string;
  density: string;
  baseColor: string;
  isCurrent: boolean;
  notes: string | null;
  createdAt: string;
  catalog: { id: string; kind: string; name: string } | null;
  service: { id: string; name: string } | null;
  staff: { id: string; displayName: string } | null;
  appointment: { id: string; startAt: string; status: string } | null;
}

export interface HairDesignHistory {
  current: HairDesignSummary | null;
  designs: HairDesignSummary[];
}

const SENTENCE: Record<string, string> = {
  VERY_SHORT: 'very short',
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
  VERY_LONG: 'very long',
  STRAIGHT: 'straight',
  WAVY: 'wavy',
  CURLY: 'curly',
  COILY: 'coily',
  LOW: 'low',
  HIGH: 'high',
};

const say = (value: string) => SENTENCE[value] ?? value.toLowerCase().replace(/_/g, ' ');

/**
 * WHAT THIS CUSTOMER'S HAIR HAS BEEN.
 *
 * The thing a stylist actually asks at the chair — "what did we do last time?"
 * — answered with the design rather than with the invoice line, because
 * "Haircut + styling, ₹1,499" does not say it was a wavy medium butterfly cut
 * in dark brown.
 */
export function HairDesignsCard({ history }: { history: HairDesignHistory }) {
  const { current, designs } = history;
  const others = designs.filter((design) => design.id !== current?.id);

  if (designs.length === 0) {
    return (
      <Card>
        <CardHeader title="Hair designs" />
        <EmptyState
          icon={Sparkles}
          title="No looks saved yet"
          description="Designs saved in the studio appear here, so the next stylist can see exactly what was agreed last time."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Hair designs" subtitle={`${designs.length} saved`} />
      <CardBody className="space-y-3">
        {current ? <DesignRow design={current} /> : null}
        {others.map((design) => (
          <DesignRow key={design.id} design={design} />
        ))}
      </CardBody>
    </Card>
  );
}

function DesignRow({ design }: { design: HairDesignSummary }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-stone-200 p-3">
      {/*
        A swatch, not a photograph. It is the one piece of the design that reads
        at a glance, and it is honest about being a colour rather than a result.
        aria-hidden with the name spelled out beside it: a colour chip is not
        information a screen reader can use.
      */}
      <span
        className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-stone-300"
        style={{ backgroundColor: design.baseColor }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{design.name}</span>
          {design.isCurrent ? <Badge tone="brand">Wearing now</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          {design.catalog?.name ?? design.hairstyleKey.replace(/_/g, ' ')} &middot; {say(design.length)},{' '}
          {say(design.texture)} &middot; {design.baseColor.toUpperCase()}
        </p>
        <p className="mt-1 text-2xs text-ink-subtle">
          {date(design.createdAt)}
          {design.staff ? ` · ${design.staff.displayName}` : ''}
          {design.service ? ` · ${design.service.name}` : ''}
          {design.appointment ? ` · booked for ${date(design.appointment.startAt)}` : ''}
        </p>
        {design.notes ? <p className="mt-1.5 text-xs text-ink-muted">{design.notes}</p> : null}
      </div>
      <Link
        href={`/hair-studio?design=${design.id}`}
        className="shrink-0 rounded-md px-2 py-1 text-2xs font-medium text-brand-700 hover:bg-brand-50"
      >
        Open
      </Link>
    </div>
  );
}
