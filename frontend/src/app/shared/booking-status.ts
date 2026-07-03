/**
 * Presentation metadata per booking lifecycle status (the issue #98 union; design v3 `STATUS_META`):
 * the chip `label`, its CSS-modifier `chip`, and whether the amount row reads `Paid` (money has
 * moved) or `Amount` (still open / no charge). The single source of truth for all three, shared by
 * the booking detail view (#138) and the device-local "My bookings" list (#139) — extracted here
 * when the list became the 2nd chip consumer (rule of three).
 *
 * <p>String-keyed and self-contained: it deliberately does **not** import the `BookingStatus`
 * domain type from the `booking` feature (`shared/` imports nothing app-internal — the FE
 * boundary rule). Exhaustiveness over the 8-status union is guarded by `booking-status.spec.ts`,
 * and {@link metaFor} tolerates a status this build doesn't yet know.
 */
export interface StatusMeta {
  readonly label: string;
  readonly chip: string;
  readonly amount: 'Paid' | 'Amount';
}

export const STATUS_META: Record<string, StatusMeta> = {
  CONFIRMED: { label: 'Confirmed', chip: 'chip--confirmed', amount: 'Paid' },
  PENDING_REQUEST: { label: 'Pending request', chip: 'chip--pending', amount: 'Amount' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', chip: 'chip--awaiting', amount: 'Amount' },
  DECLINED: { label: 'Declined', chip: 'chip--declined', amount: 'Amount' },
  EXPIRED: { label: 'Expired', chip: 'chip--expired', amount: 'Amount' },
  CANCELLED: { label: 'Cancelled', chip: 'chip--cancelled', amount: 'Paid' },
  COMPLETED: { label: 'Completed', chip: 'chip--completed', amount: 'Paid' },
  NO_SHOW: { label: 'No-show', chip: 'chip--no-show', amount: 'Paid' },
};

/** Humanize a raw status token ("NO_SHOW" → "No show") — the graceful fallback for FE/BE skew. */
export function humanizeStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');
}

/**
 * Presentation metadata for a status, tolerant of a status this build doesn't know (a new backend
 * lifecycle state shipped before the FE is redeployed): rather than throw, fall back to a humanized
 * label, a neutral chip, and the conservative `Amount` label (never claim money moved).
 */
export function metaFor(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: humanizeStatus(status),
      chip: 'chip--expired',
      amount: 'Amount',
    }
  );
}
