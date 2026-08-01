import { Service, signal } from '@angular/core';

import { readJson, writeJson } from '../shared/safe-storage';

const STORAGE_KEY = 'riviera.bookings.v1';

/**
 * Device-local registry of the guest's booking codes (issue #139, epic #133). A guest has no
 * account, so a booking's unguessable bearer code (invariant #7) is the only key to it — this
 * service is the on-device memory of which codes belong to this browser. Since S3 (#114) it is no
 * longer the *only* source the "My bookings" list draws on: a signed-in customer's account-linked
 * bookings come from `GET /api/me/bookings`. It stays authoritative for guest bookings, which are
 * never back-linked to an account by email (design D-6, a permanent non-goal).
 *
 * <p>It stores <strong>only the codes</strong>, never a display snapshot: the "My bookings" list
 * re-fetches the truth per code from `GET /api/bookings/{code}`, so there is nothing to go stale
 * and nothing but the low-sensitivity bearer code is persisted. Codes are treated as secrets —
 * this service never logs them. Newest-first order: a freshly remembered code leads the list.
 *
 * <p>Storage access goes through the shared {@link readJson}/{@link writeJson} guard (issue #163),
 * so a blocked (`private mode`, quota) or malformed `localStorage` degrades to session-only memory,
 * never an error.
 */
@Service()
export class DeviceLocalBookings {
  private readonly current = signal<readonly string[]>(load());

  /** The remembered booking codes, newest first, as a read-only signal. */
  readonly codes = this.current.asReadonly();

  /**
   * Remember a booking code (called on every successful create — confirmed, awaiting-payment, or
   * requested). Idempotent: a code seen again moves to the front rather than duplicating. A missing
   * code (empty / null / undefined — e.g. an empty create body) is ignored, never thrown on.
   */
  remember(code: string | null | undefined): void {
    if (!code) {
      return;
    }
    this.current.update((codes) => [code, ...codes.filter((c) => c !== code)]);
    persist(this.current());
  }

  /**
   * Explicitly forget a code — for a user-initiated removal. Nothing calls this today: the list
   * does **not** call it on a `404` (the code is the guest's only key, invariant #7, and a 404 can
   * be transient, so the list hides the row but keeps the code — a recovered booking reappears on
   * the next load), and the signed-in merge (#114) never evicts a device code either. The same
   * reasoning is why this list is deliberately left uncapped and unpruned (#164).
   */
  forget(code: string): void {
    this.current.update((codes) => codes.filter((c) => c !== code));
    persist(this.current());
  }
}

/** Read the persisted codes, tolerating a blocked or hand-corrupted store (→ empty, never throw). */
function load(): readonly string[] {
  const parsed = readJson(STORAGE_KEY);
  return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
}

function persist(codes: readonly string[]): void {
  writeJson(STORAGE_KEY, codes);
}
