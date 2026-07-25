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
