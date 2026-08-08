import { Service, signal } from '@angular/core';

/**
 * The single source of truth for the operator console's live **pending-request count** — the number
 * the shell renders as the Requests-tab badge. The shell seeds it on sign-in (and clears
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
  /** True once an authoritative (Requests-tab) update has landed — the shell seed then yields to it. */
  private live = false;

  /** The live pending-request count (0 when none, unknown, or signed out). */
  readonly count = this._count.asReadonly();

  /**
   * Authoritative live count from the Requests tab (its queue length after load / every action). Takes
   * over from the shell's seed and wins any later seed — the tab is the source of truth while active.
   */
  set(count: number): void {
    this.live = true;
    this._count.set(count);
  }

  /**
   * Best-effort initial seed from the shell (its `pendingRequestCount` read). Ignored once the tab has
   * taken authority, so a slow seed resolving AFTER the operator has already accepted/declined can't
   * clobber the tab's decremented count back up.
   */
  seed(count: number): void {
    if (!this.live) {
      this._count.set(count);
    }
  }

  /** Clear the count and authority — on console (re)mount and sign-out, so no stale/leaked count survives. */
  reset(): void {
    this.live = false;
    this._count.set(0);
  }
}
