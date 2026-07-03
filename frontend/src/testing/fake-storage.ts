/**
 * The unit-test environment (Vitest + jsdom via `@angular/build:unit-test`) has no `localStorage`
 * global, so any service that persists through `globalThis.localStorage` (`ThemeService`,
 * `DeviceLocalBookings`) needs a fake to exercise persistence. This installs a Map-backed one on
 * `globalThis`; real browser persistence is pinned by e2e, not here.
 *
 * Call {@link installFakeStorage} in `beforeEach` (it returns the backing Map for seeding/asserting)
 * and {@link removeFakeStorage} in `afterEach` so the global doesn't leak between suites.
 */
export function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  return store;
}

export function removeFakeStorage(): void {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
}
