import { Service, signal } from '@angular/core';

import { readJson, writeJson } from '../shared/safe-storage';

const STORAGE_KEY = 'riviera.bookings.v1';

/**
 * Device-local registry of the guest's booking codes: a guest has no account, so the bearer code
 * (invariant #7, never logged) is the only key to a booking. Stores only codes, never a snapshot —
 * "My bookings" re-fetches each from `GET /api/bookings/{code}`. Authoritative for guest bookings,
 * never back-linked to an account (D-6); signed-in ones come from `GET /api/me/bookings`.
 * Newest first. Storage goes through {@link readJson}/{@link writeJson}, so a blocked or malformed
 * `localStorage` degrades to session-only memory, never an error.
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
   * Forget a code (user-initiated removal only; no caller today). Never on a `404` or in the
   * signed-in merge: the code is the guest's only key (#7) and a 404 can be transient, so the list
   * hides the row but keeps the code — which is also why the list is uncapped and unpruned.
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
