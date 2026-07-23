/**
 * Guarded `localStorage` access, shared by the core singletons that persist to the browser
 * (`ThemeService`, `DeviceLocalBookings` — issue #163). Every path degrades instead of throwing:
 * a blocked store (private mode), a quota-exceeded write, a corrupt/malformed value, or the
 * absence of `localStorage` entirely (SSR / the unit-test jsdom) resolves to a null read or a
 * no-op write, so callers fall back to session-only state and never see an exception.
 *
 * <p>This is the single home for the storage-safety try/catch — before #163 the same guard was
 * hand-rolled in each consumer and could silently diverge.
 */

/** Read a raw string, or `null` when the key is unset or storage is unavailable/blocked. */
export function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Write a raw string; a blocked or quota-exceeded store is a silent no-op (session-only). */
export function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable (private mode / quota): caller keeps its in-memory state for this session.
  }
}

/**
 * Read and JSON-parse a value, returning `unknown` for the caller to validate. Yields `null` when
 * the key is unset, storage is blocked, or the stored text is not valid JSON — the caller cannot
 * tell a missing value from a corrupt one, and neither should change its fallback.
 */
export function readJson(key: string): unknown {
  const raw = readStorage(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** JSON-serialise and write a value; a blocked store or a non-serialisable value is a no-op. */
export function writeJson(key: string, value: unknown): void {
  try {
    writeStorage(key, JSON.stringify(value));
  } catch {
    // Non-serialisable value (e.g. a cycle): drop it, same session-only degrade as a blocked store.
  }
}
