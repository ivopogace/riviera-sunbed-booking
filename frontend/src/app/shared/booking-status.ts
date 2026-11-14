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
 * Presentation metadata per booking lifecycle status: the chip `label`, its CSS-modifier `chip`,
 * and whether the amount reads `Paid` (money has moved) or `Amount` (still open / no charge). The
 * single source of truth, shared by the booking detail view and the device-local "My bookings".
 * Keyed by the exhaustive {@link BookingStatus} union, so a new status fails the build until it has
 * a row; {@link metaFor} still tolerates an unknown status at runtime (FE ahead of backend).
 */
export interface StatusMeta {
  readonly label: string;
  readonly chip: string;
  readonly amount: 'Paid' | 'Amount';
}

export const STATUS_META: Record<BookingStatus, StatusMeta> = {
  CONFIRMED: {
    label: $localize`:Booking status chip:Confirmed`,
    chip: 'chip--confirmed',
    amount: 'Paid',
  },
  PENDING_REQUEST: {
    label: $localize`:Booking status chip:Pending request`,
    chip: 'chip--pending',
    amount: 'Amount',
  },
  AWAITING_PAYMENT: {
    label: $localize`:Booking status chip:Awaiting payment`,
    chip: 'chip--awaiting',
    amount: 'Amount',
  },
  DECLINED: {
    label: $localize`:Booking status chip:Declined`,
    chip: 'chip--declined',
    amount: 'Amount',
  },
  EXPIRED: {
    label: $localize`:Booking status chip:Expired`,
    chip: 'chip--expired',
    amount: 'Amount',
  },
  CANCELLED: {
    label: $localize`:Booking status chip:Cancelled`,
    chip: 'chip--cancelled',
    amount: 'Paid',
  },
  COMPLETED: {
    label: $localize`:Booking status chip:Completed`,
    chip: 'chip--completed',
    amount: 'Paid',
  },
  NO_SHOW: {
    label: $localize`:Booking status chip:No-show`,
    chip: 'chip--no-show',
    amount: 'Paid',
  },
  // Never 'Paid': a withdrawn request was never charged.
  WITHDRAWN: {
    label: $localize`:Booking status chip:Withdrawn`,
    chip: 'chip--withdrawn',
    amount: 'Amount',
  },
};

/**
 * The chip of a `CONFIRMED` or `NO_SHOW` booking whose every day was refunded on its own (ADR-0026 §7):
 * money came back, so it wears the cancelled chip's proven fill under its own label.
 */
export const REFUNDED_META: StatusMeta = {
  label: $localize`:Booking status chip:Refunded`,
  chip: 'chip--cancelled',
  amount: 'Paid',
};

/** Whether a booking reads as refunded away: held or missed, with nothing left (ADR-0026 §7); the one rule every surface asks. */
export function readsAsRefunded(status: string, nothingLeft: boolean): boolean {
  return nothingLeft && (status === 'CONFIRMED' || status === 'NO_SHOW');
}

/**
 * The money figure's label: `Paid` once money moved, else `Amount`. A `CANCELLED` caller passes the refund fact
 * (`null` = never charged, which status alone can't tell from a charged one); `nothingLeft` reads as {@link metaFor}'s.
 */
export function amountLabelFor(
  status: string,
  refundedAmount: { readonly minorUnits: number } | null | undefined,
  nothingLeft: boolean,
): StatusMeta['amount'] {
  if (status === 'CANCELLED' && refundedAmount === null) {
    return 'Amount';
  }
  return metaFor(status, nothingLeft).amount;
}

/** The money row's label in the build's language, for the {@link StatusMeta} `amount` key. */
export function amountLabelText(amount: StatusMeta['amount']): string {
  return amount === 'Paid'
    ? $localize`:Label of the booking's price once money has moved:Paid`
    : $localize`:Label of the booking's price while unpaid or never charged:Amount`;
}

/** Humanize a raw status token ("NO_SHOW" → "No show") — the graceful fallback for FE/BE skew. */
export function humanizeStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');
}

/**
 * Presentation metadata for a status; a `CONFIRMED`/`NO_SHOW` one with `nothingLeft` is {@link REFUNDED_META}.
 * Tolerant of a status this build doesn't know (a backend state shipped before the FE is redeployed): rather
 * than throw, a humanized label, a neutral chip and the conservative `Amount` label (never claim money moved).
 */
export function metaFor(status: string, nothingLeft = false): StatusMeta {
  if (readsAsRefunded(status, nothingLeft)) {
    return REFUNDED_META;
  }
  return (
    STATUS_META[status as BookingStatus] ?? {
      label: humanizeStatus(status),
      chip: 'chip--expired',
      amount: 'Amount',
    }
  );
}

/** Why a request ended `DECLINED` (mirrors the backend `DeclineReason`): the venue's no, a set gone
 *  when accept tried to claim it, or an overlapping request accepted instead. */
export type DeclineReason = 'VENUE' | 'SET_UNAVAILABLE' | 'ANOTHER_GUEST';
