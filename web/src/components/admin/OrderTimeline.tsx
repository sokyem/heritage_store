'use client';

/**
 * OrderTimeline — vertical activity history for a storefront order.
 *
 * Data comes from /api/admin/orders/storefront/[id] (the `timeline` field),
 * which composes entries from Order.createdAt, the Payment row, the linked
 * Shipment + ShipmentEvents, and cancellations. The UI is intentionally
 * read-only: it's an audit trail, not an editor.
 */

type TimelineKind =
  | 'placed' | 'paid' | 'refunded' | 'label_created' | 'picked_up'
  | 'in_transit' | 'out_for_delivery' | 'shipped' | 'delivered'
  | 'returned' | 'exception' | 'cancelled' | 'status';

export interface OrderTimelineEntry {
  at: string;
  kind: TimelineKind;
  title: string;
  description?: string | null;
  meta?: string | null;
}

const DOT_COLOR: Record<TimelineKind, string> = {
  placed: '#1B2A5B',
  paid: '#2D8E5A',
  refunded: '#8B7569',
  label_created: '#7B6B8E',
  picked_up: '#7B6B8E',
  in_transit: '#D4A574',
  out_for_delivery: '#D4A574',
  shipped: '#2D8E5A',
  delivered: '#2D8E5A',
  returned: '#C41E3A',
  exception: '#C41E3A',
  cancelled: '#C41E3A',
  status: '#A8A29E',
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function OrderTimeline({ entries }: { entries: OrderTimelineEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-xs text-[var(--aw-text-muted)] italic">
        No activity yet.
      </div>
    );
  }

  return (
    <ol className="relative pl-6">
      <span
        aria-hidden
        className="absolute left-[7px] top-1 bottom-1 w-px bg-[var(--aw-border)]"
      />
      {entries.map((e, i) => (
        <li key={i} className="relative pb-4 last:pb-0">
          <span
            aria-hidden
            className="absolute -left-[1px] top-[3px] block w-[15px] h-[15px] rounded-full border-2 border-white"
            style={{ backgroundColor: DOT_COLOR[e.kind] || '#A8A29E' }}
          />
          <div className="text-sm font-medium text-[var(--aw-text-strong)]">
            {e.title}
          </div>
          {e.description && (
            <div className="text-xs text-[var(--aw-text-muted)] mt-0.5">
              {e.description}
            </div>
          )}
          <div className="text-[11px] text-[var(--aw-text-muted)] mt-1 flex items-center gap-2">
            <time dateTime={e.at}>{formatWhen(e.at)}</time>
            {e.meta && <span>· {e.meta}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
