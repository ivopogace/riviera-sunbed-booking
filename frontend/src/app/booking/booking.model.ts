import { BookingStatus } from '../shared/booking-status';
import { MoneyView } from '../shared/money';

// Re-exported from its canonical home in shared/ (which owns the exhaustive STATUS_META keyed by it).
export type { BookingStatus } from '../shared/booking-status';

/**
 * Typed view of the booking-create API (`POST /api/bookings`). Mirrors the backend
 * `CreateBookingRequest` / `BookingConfirmationView` exactly — money travels as integer minor
 * units + currency (invariant #5); the booking date as an ISO `LocalDate` string. No `any`.
 */
export interface BookingContact {
  readonly email: string;
  readonly fullName: string;
  readonly phone: string;
}

export interface CreateBookingRequest {
  readonly setId: number;
  readonly bookingDate: string; // ISO YYYY-MM-DD
  readonly contact: BookingContact;
}

export interface BookingConfirmation {
  readonly code: string;
  readonly status: string;
  readonly venueId: number;
  readonly venueName: string;
  readonly setId: number;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  /** The confirmation email was suppressed, so this code is the guest's only record. */
  readonly emailWithheld: boolean;
}

/**
 * Typed view of the `202 AWAITING_PAYMENT` response (`POST /api/bookings` under the `stripe`
 * profile). Mirrors the backend `AwaitingPaymentView`: the same summary as
 * {@link BookingConfirmation} plus the Stripe `clientSecret` the browser uses to complete the
 * card with Stripe.js and the `paymentIntentId` for reference. Confirmation itself arrives via
 * the signature-verified webhook (invariant #8) — never this response — so the client must poll
 * `GET /api/bookings/{code}` for `CONFIRMED` rather than trust the Stripe.js result.
 */
export interface AwaitingPayment extends PaymentHandoff {
  readonly status: string; // 'AWAITING_PAYMENT'
  readonly venueId: number;
  readonly setId: number;
}

/**
 * The minimum the payment page needs to mount the Stripe Payment Element and render the booking
 * summary. Primed by the 202 `AWAITING_PAYMENT` booking-create ({@link AwaitingPayment} is a
 * superset) or rebuilt from a fetched {@link BookingDetail} when an accepted request's guest
 * clicks "Pay now".
 */
export interface PaymentHandoff {
  readonly code: string;
  readonly venueName: string;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  readonly clientSecret: string;
  readonly paymentIntentId: string;
}

/**
 * Typed view of the `202 PENDING_REQUEST` response (`POST /api/bookings` on a REQUEST-mode
 * venue). No `clientSecret` — nothing is charged until the venue accepts; the guest
 * keeps the code and checks `GET /api/bookings/{code}` for the venue's decision before
 * `requestExpiresAt` (an ISO-8601 UTC instant).
 */
export interface RequestedBooking {
  readonly code: string;
  readonly status: string; // 'PENDING_REQUEST'
  readonly venueId: number;
  readonly venueName: string;
  readonly setId: number;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  readonly requestExpiresAt: string;
}

/**
 * The result of creating a booking, discriminated on the HTTP status AND body the backend
 * returned: `201` (stub/Instant — already `CONFIRMED`) vs `202` with `AWAITING_PAYMENT` (stripe —
 * the card must still be collected) vs `202` with `PENDING_REQUEST` (REQUEST-mode venue — the
 * venue must accept first). One Angular build serves all backends, so the channel is
 * chosen at runtime from the response, not at build time.
 */
export type CreateBookingResult =
  | { readonly kind: 'confirmed'; readonly confirmation: BookingConfirmation }
  | { readonly kind: 'awaiting'; readonly awaiting: AwaitingPayment }
  | { readonly kind: 'requested'; readonly requested: RequestedBooking };

/**
 * Typed view of the booking-view API (`GET /api/bookings/{code}`). Mirrors the backend
 * `BookingDetailView`: money as integer minor units + currency (invariant #5), date as ISO
 * `LocalDate`. The cancellation terms are computed server-side (invariant #10) — the client only
 * displays them. `refundedAmount` is set only once the booking is `CANCELLED`.
 */
export interface BookingDetail {
  readonly code: string;
  readonly status: BookingStatus;
  readonly venueId: number;
  readonly venueName: string;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  readonly cancellable: boolean;
  /** The guest may retract this still-open request — separate from `cancellable`. */
  readonly withdrawable: boolean;
  readonly beforeCutoff: boolean;
  readonly refundIfCancelledNow: MoneyView;
  readonly refundedAmount: MoneyView | null;
  /**
   * The refund is decided but the gateway has not accepted it yet — say it is being processed,
   * never that it is on its way. `false` when the gateway accepted it, and always `false` when
   * nothing was ever collected (the panel then keeps its usual copy).
   */
  readonly refundOutstanding: boolean;
  /** The venue's response deadline while the request is open; null otherwise. */
  readonly requestExpiresAt: string | null;
  /** Open-intent credentials, present only while `AWAITING_PAYMENT` with an open PaymentIntent. */
  readonly payment: BookingPayment | null;
  /**
   * The pay deadline (`min(accepted_at + pay-window, end of service day)`) has passed, so no
   * payment may be taken any more and `payment` is null. Server-computed: the deadline arithmetic
   * is the server's, in Europe/Tirane.
   */
  readonly payWindowClosed: boolean;
  /**
   * The confirmation email was suppressed. Only ever `true` for a `CONFIRMED` booking — the
   * backend does not even ask the question before payment, so this can't be read as an oracle.
   */
  readonly emailWithheld: boolean;
  /**
   * Which cancellation this booking went through; null while live, and null for a cancellation
   * that never charged. Server-owned: `refundedAmount` alone cannot tell a venue's weather refund
   * from the guest's own cancellation, and only one of those is news to the guest.
   */
  readonly cancelReason: CancelReason | null;
  /**
   * The cancellation-window phase in force when this booking was created. `CLOSED` marks a
   * non-refundable last-minute booking; the view keys its no-cancel copy on it.
   */
  readonly cancellationWindowAtBirth: CancellationWindow;
}

/** The cancellation-window phases, mirroring the backend `booking.vocabulary.CancellationWindow`. */
export type CancellationWindow = 'FREE' | 'LATE' | 'CLOSED';

/** The open PaymentIntent of an `AWAITING_PAYMENT` booking (the "Pay now" resume path). */
export interface BookingPayment {
  readonly clientSecret: string;
  readonly paymentIntentId: string;
}

/**
 * Typed view of one row from `GET /api/me/bookings` — the signed-in "my bookings" list.
 * Mirrors the backend `MyBookingView`: a **subset** of {@link BookingDetail} (the refund *terms* +
 * payment credentials are loaded only on the code-gated detail view; `refundedAmount` is the one
 * refund fact the list carries, because without it a row cannot tell a cancellation that took money
 * from one that never did). Money as integer
 * minor units (invariant #5); date as ISO `LocalDate`; `requestExpiresAt` null for instant bookings.
 * `BookingDetail` is structurally a superset, so both feed the shared list-row builder.
 */
export interface MyBookingSummary {
  readonly code: string;
  readonly status: BookingStatus;
  readonly venueId: number;
  readonly venueName: string;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  readonly requestExpiresAt: string | null;
  /**
   * The refund actually issued, or null when none was — including for a cancellation that never
   * charged. Carried on the summary, unlike the rest of the refund terms, because without it a row
   * cannot tell a swept booking from a refunded one and would label both "Paid".
   */
  readonly refundedAmount: MoneyView | null;
}

/**
 * Why a booking was cancelled, mirroring the backend `RefundReason` (and the V14 `cancel_reason`
 * CHECK tokens). Only a cancellation that took a refund decision carries one, so it is `null` for a
 * booking released without ever being charged — the abandoned-payment sweep and the
 * `payment_intent.canceled` webhook both leave it unset. `CONFLICT` is reserved and unused in v1.
 */
export type CancelReason = 'POLICY' | 'WEATHER' | 'CONFLICT';

/** The refund tier returned with a cancellation (mirrors the backend `CancelOutcome.Tier`). */
export type RefundTier = 'FULL' | 'PARTIAL' | 'NONE';

/**
 * Typed view of the cancel response (`POST /api/bookings/{code}/cancel`). Mirrors the backend
 * `CancellationView`: the new status, the server-computed refund, and the tier for the copy.
 */
export interface Cancellation {
  readonly code: string;
  readonly status: string;
  readonly refund: MoneyView;
  readonly tier: RefundTier;
}

/**
 * The `POST /api/bookings/{code}/withdraw` 200 body, mirroring the backend `WithdrawalView`.
 * Deliberately narrower than {@link Cancellation}: a withdrawn request was never charged, so there
 * is no refund amount and no tier to report — only the new terminal status.
 */
export interface Withdrawal {
  readonly code: string;
  readonly status: string;
}

/** Server rejection codes mapped from the HTTP error body, plus a transport fallback. */
export type BookingErrorCode =
  | 'SET_TAKEN'
  | 'SET_NOT_BOOKABLE_ONLINE'
  | 'BOOKING_CLOSED'
  | 'NO_SUCH_SET'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';
