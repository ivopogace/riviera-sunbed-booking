export type FakeStore = 'localStorage' | 'sessionStorage';

/**
 * The unit-test environment (Vitest + jsdom via `@angular/build:unit-test`) has no `localStorage`
 * or `sessionStorage` global, so any service that persists through them (`ThemeService`,
 * `DeviceLocalBookings`, `ChunkLoadRecovery`) needs a fake to exercise persistence. This installs
 * a Map-backed one on `globalThis`; real browser persistence is pinned by e2e, not here.
 *
 * Call {@link installFakeStorage} in `beforeEach` (it returns the backing Map for seeding/asserting)
 * and {@link removeFakeStorage} in `afterEach` so the global doesn't leak between suites.
 */
export function installFakeStorage(which: FakeStore = 'localStorage'): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<FakeStore, unknown>)[which] = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  return store;
}

export function removeFakeStorage(which: FakeStore = 'localStorage'): void {
  delete (globalThis as unknown as Partial<Record<FakeStore, unknown>>)[which];
}
