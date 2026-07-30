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
