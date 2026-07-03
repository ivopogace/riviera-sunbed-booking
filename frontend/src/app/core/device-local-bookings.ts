import { Service, signal } from '@angular/core';

const STORAGE_KEY = 'riviera.bookings.v1';

/**
 * Device-local registry of the guest's booking codes (issue #139, epic #133). A guest has no
 * account yet (#114 unshipped), so a booking's unguessable bearer code (invariant #7) is the only
 * key to it — this service is the on-device memory of which codes belong to this browser.
 *
 * <p>It stores <strong>only the codes</strong>, never a display snapshot: the "My bookings" list
 * re-fetches the truth per code from `GET /api/bookings/{code}`, so there is nothing to go stale
 * and nothing but the low-sensitivity bearer code is persisted. Codes are treated as secrets —
 * this service never logs them. Newest-first order: a freshly remembered code leads the list.
 *
 * <p>Storage access is guarded exactly like {@link ThemeService}: a blocked (`private mode`,
 * quota) or malformed `localStorage` degrades to session-only memory, never an error.
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
   * Explicitly forget a code — for a future account-merge (#114) or a user-initiated removal. The
   * list does **not** call this on a `404`: the code is the guest's only key (invariant #7) and a
   * 404 can be transient, so the list hides the row but keeps the code (a recovered booking
   * reappears on the next load).
   */
  forget(code: string): void {
    this.current.update((codes) => codes.filter((c) => c !== code));
    persist(this.current());
  }
}

/** Read the persisted codes, tolerating a blocked or hand-corrupted store (→ empty, never throw). */
function load(): readonly string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function persist(codes: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    // Storage unavailable (private mode / quota): the in-memory signal still serves this session.
  }
}
