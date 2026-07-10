import { Service, signal } from '@angular/core';

/**
 * The single source of truth for the operator console's live **pending-request count** — the number
 * the shell renders as the Requests-tab badge (issue #176). The shell seeds it on sign-in (and clears
 * it on sign-out); the Requests tab keeps it current after every load and every accept/decline/dismiss.
 * Both read one signal, so the badge never drifts from the queue the operator is working.
 *
 * <p>A deliberately minimal signal store (one writable count, exposed read-only). It lives in
 * `operator/` — not `core/` — because both consumers are the *same* feature (the shell + the tab), so
 * this is intra-feature shared state, not a cross-cutting singleton (`riviera-frontend`).
 */
@Service()
export class PendingRequestsStore {
  private readonly _count = signal(0);

  /** The live pending-request count (0 when none, unknown, or signed out). */
  readonly count = this._count.asReadonly();

  /** Set the count from an authoritative read (the shell's seed, or the tab's queue length). */
  set(count: number): void {
    this._count.set(count);
  }

  /** Clear the count — on sign-out, so a stale badge never survives a session. */
  reset(): void {
    this._count.set(0);
  }
}
