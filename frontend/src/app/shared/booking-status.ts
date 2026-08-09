/**
 * Every lifecycle status the booking API can report, including the Request-to-Book states and
 * `WITHDRAWN`, the guest's own retraction of a pending request. This is the **canonical home** of
 * the union — a pure, presentational vocabulary type shared across features — so the exhaustive
 * {@link STATUS_META} map below is compile-checked against it; `booking/booking.model.ts`
 * re-exports it for booking-domain code, so `shared/` still imports nothing app-internal (the FE
 * boundary rule holds).
 */
export type BookingStatus =
  | 'CONFIRMED'
  | 'AWAITING_PAYMENT'
  | 'PENDING_REQUEST'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'WITHDRAWN';

/**
 * Presentation metadata per booking lifecycle status (design v3 `STATUS_META`): the chip `label`,
 * its CSS-modifier `chip`, and whether the amount reads `Paid` (money has moved) or `Amount` (still
 * open / no charge). The single source of truth for all three, shared by the booking detail view
 * and the device-local "My bookings" list — extracted here when the list became the
 * 2nd chip consumer (rule of three). Keyed by the exhaustive {@link BookingStatus} union, so a new
 * status fails the build until it has a row here; {@link metaFor} still tolerates an unknown status
 * at runtime (FE deployed before a new backend state).
 */
export interface StatusMeta {
  readonly label: string;
  readonly chip: string;
  readonly amount: 'Paid' | 'Amount';
}

export const STATUS_META: Record<BookingStatus, StatusMeta> = {
  CONFIRMED: { label: 'Confirmed', chip: 'chip--confirmed', amount: 'Paid' },
  PENDING_REQUEST: { label: 'Pending request', chip: 'chip--pending', amount: 'Amount' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', chip: 'chip--awaiting', amount: 'Amount' },
  DECLINED: { label: 'Declined', chip: 'chip--declined', amount: 'Amount' },
  EXPIRED: { label: 'Expired', chip: 'chip--expired', amount: 'Amount' },
  CANCELLED: { label: 'Cancelled', chip: 'chip--cancelled', amount: 'Paid' },
  COMPLETED: { label: 'Completed', chip: 'chip--completed', amount: 'Paid' },
  NO_SHOW: { label: 'No-show', chip: 'chip--no-show', amount: 'Paid' },
  // Never 'Paid': a withdrawn request was never charged.
  WITHDRAWN: { label: 'Withdrawn', chip: 'chip--withdrawn', amount: 'Amount' },
};

/**
 * The label for the money figure: `Paid` once money has actually moved, `Amount` while the
 * request/payment is still open — or when a cancellation never took any.
 *
 * `STATUS_META` maps `CANCELLED` to `Paid` because status alone cannot tell the two cancellations
 * apart; a booking released by the abandoned-payment sweep was never charged, and labelling its
 * figure `Paid` states the opposite. Callers that hold the refund fact pass it, so the detail view
 * and the list answer identically — `undefined` keeps the status-only reading for callers that
 * genuinely have no such fact.
 */
export function amountLabelFor(
  status: string,
  refundedAmount?: { readonly minorUnits: number } | null,
): StatusMeta['amount'] {
  if (status === 'CANCELLED' && refundedAmount === null) {
    return 'Amount';
  }
  return metaFor(status).amount;
}

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
    STATUS_META[status as BookingStatus] ?? {
      label: humanizeStatus(status),
      chip: 'chip--expired',
      amount: 'Amount',
    }
  );
}
