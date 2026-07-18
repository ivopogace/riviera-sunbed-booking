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
