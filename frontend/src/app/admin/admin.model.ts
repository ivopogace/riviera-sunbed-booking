/**
 * A pending operator registration as the admin approval surface reports it (S6 #115) — mirrors the
 * backend `AdminOperatorController.PendingOperatorResponse`. `registeredAt` is an ISO instant string,
 * display-only.
 */
export interface PendingOperatorView {
  readonly id: number;
  readonly username: string;
  readonly contactEmail: string;
  readonly registeredAt: string;
}

/**
 * A decided operator account — active or suspended — as the admin surface reports it (#128); mirrors
 * the backend `AdminOperatorController.OperatorAccountResponse`. `contactEmail` is null for a
 * directly-provisioned account (the bootstrap admin); `admin` marks a platform admin. Suspended
 * accounts stay in this list so suspension is reversible from the console.
 */
export interface OperatorAccountView {
  readonly id: number;
  readonly username: string;
  readonly contactEmail: string | null;
  readonly admin: boolean;
  readonly suspended: boolean;
}

/**
 * What the Event Publication Registry still owes the notification module (#405); mirrors the backend
 * `AdminMailOutboxController.MailOutboxStatusResponse`. `outstanding` counts publications, not
 * recipients — the console never sees an address or an arrival code (invariant #7).
 * `cooldownRemainingSeconds` is 0 when a resubmission would be accepted now.
 */
export interface MailOutboxStatusView {
  readonly outstanding: number;
  readonly cooldownRemainingSeconds: number;
}

/**
 * The result of pressing Resubmit; mirrors `AdminMailOutboxController.MailResubmissionResponse`.
 * Both refusals are `200` with `resubmitted: 0` — an admin acts on them, so they are outcomes rather
 * than errors, and each carries the window until the next attempt is accepted.
 */
export interface MailResubmissionResultView {
  readonly outcome: 'RESUBMITTED' | 'ALREADY_RUNNING' | 'COOLING_DOWN';
  readonly resubmitted: number;
  readonly cooldownRemainingSeconds: number;
}

/**
 * One recorded booking-confirmation mail attempt (#380); mirrors
 * `AdminMailDeliveryController.MailAttemptResponse`. `outcome` is what actually happened, which the
 * Event Publication Registry cannot tell you — it completes a publication for a withheld send exactly
 * as it does for a delivered one. `attemptedAt` is an ISO instant, rendered in Europe/Tirane.
 */
export interface MailAttemptView {
  readonly source: 'AUTOMATIC' | 'ADMIN_RESEND';
  readonly outcome: 'SENT' | 'WITHHELD_SUPPRESSED' | 'TRANSPORT_FAILED' | 'ABANDONED_MISSING_FACTS';
  readonly attemptedAt: string;
}

/**
 * One booking in the mail-delivery view (#380); mirrors
 * `AdminMailDeliveryController.MailDeliveryBookingResponse`. `everConfirmed` is what makes an empty
 * `attempts` list readable: false means no confirmation was ever due, true means the platform has no
 * record of one (it predates the log, or the record was lost). No arrival code is ever returned
 * (invariant #7).
 */
export interface MailDeliveryBookingView {
  readonly bookingId: number;
  readonly venueName: string;
  readonly bookingDate: string;
  readonly everConfirmed: boolean;
  readonly attempts: readonly MailAttemptView[];
}

/** The lookup result; empty for an unknown address and for a known one with no bookings alike. */
export interface MailDeliveryLookupView {
  readonly bookings: readonly MailDeliveryBookingView[];
}

/**
 * The result of pressing Resend; mirrors `AdminMailDeliveryController.MailResendResponse`. Every value
 * is a `200` — both refusals included, because an admin needs to know which one to know what to do next.
 */
export interface MailResendResultView {
  readonly outcome:
    | 'SENT'
    | 'WITHHELD_SUPPRESSED'
    | 'TRANSPORT_FAILED'
    | 'NO_SUCH_BOOKING'
    | 'NOT_CONFIRMED'
    | 'MISSING_FACTS';
}
