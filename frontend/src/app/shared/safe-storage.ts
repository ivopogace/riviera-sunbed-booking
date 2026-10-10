/**
 * Guarded `localStorage` access, shared by the core singletons that persist to the browser
 * (`ThemeService`, `DeviceLocalBookings`), plus the `sessionStorage` twins for per-tab state
 * (`ChunkLoadRecovery`'s reload stamp). Every path degrades instead of throwing:
 * a blocked store (private mode), a quota-exceeded write, a corrupt/malformed value, or the
 * absence of the store entirely (SSR / the unit-test jsdom) resolves to a null read or a
 * no-op write, so callers fall back to session-only state and never see an exception.
 *
 * <p>This is the single home for the storage-safety try/catch, so it can't diverge between consumers.
 */

type Store = 'localStorage' | 'sessionStorage';

function readFrom(store: Store, key: string): string | null {
  try {
    return globalThis[store]?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeTo(store: Store, key: string, value: string): void {
  try {
    globalThis[store]?.setItem(key, value);
  } catch {
    // Storage unavailable (private mode / quota): caller keeps its in-memory state for this session.
  }
}

function readJsonFrom(store: Store, key: string): unknown {
  const raw = readFrom(store, key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonTo(store: Store, key: string, value: unknown): void {
  try {
    writeTo(store, key, JSON.stringify(value));
  } catch {
    // Non-serialisable value (e.g. a cycle): drop it, same session-only degrade as a blocked store.
  }
}

/** Read a raw string, or `null` when the key is unset or storage is unavailable/blocked. */
export function readStorage(key: string): string | null {
  return readFrom('localStorage', key);
}

/** Write a raw string; a blocked or quota-exceeded store is a silent no-op (session-only). */
export function writeStorage(key: string, value: string): void {
  writeTo('localStorage', key, value);
}

/**
 * Read and JSON-parse a value, returning `unknown` for the caller to validate. Yields `null` when
 * the key is unset, storage is blocked, or the stored text is not valid JSON — the caller cannot
 * tell a missing value from a corrupt one, and neither should change its fallback.
 */
export function readJson(key: string): unknown {
  return readJsonFrom('localStorage', key);
}

/** JSON-serialise and write a value; a blocked store or a non-serialisable value is a no-op. */
export function writeJson(key: string, value: unknown): void {
  writeJsonTo('localStorage', key, value);
}

/** {@link readJson} against the per-tab `sessionStorage`, with the same degrades. */
export function readSessionJson(key: string): unknown {
  return readJsonFrom('sessionStorage', key);
}

/** {@link writeJson} against the per-tab `sessionStorage`, with the same degrades. */
export function writeSessionJson(key: string, value: unknown): void {
  writeJsonTo('sessionStorage', key, value);
}
