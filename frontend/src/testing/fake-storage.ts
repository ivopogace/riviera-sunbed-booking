export type FakeStore = 'localStorage' | 'sessionStorage';

/**
 * Any service that persists through `localStorage` or `sessionStorage` (`ThemeService`,
 * `DeviceLocalBookings`, `ChunkLoadRecovery`) needs a fake to exercise persistence. This installs
 * a Map-backed one on `globalThis`; real browser persistence is pinned by e2e, not here.
 *
 * Call {@link installFakeStorage} in `beforeEach` (it returns the backing Map for seeding/asserting)
 * and {@link removeFakeStorage} in `afterEach` so the global doesn't leak between suites.
 */
export function installFakeStorage(which: FakeStore = 'localStorage'): Map<string, string> {
  const store = new Map<string, string>();
  defineStorageGlobal(which, {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
  return store;
}

/**
 * Defines the global, never assigns it: Vitest 5 forwards a global write to jsdom's `Window`, whose
 * storage properties are getter-only, so `globalThis.localStorage = …` throws.
 */
export function defineStorageGlobal(which: FakeStore, value: unknown): void {
  Object.defineProperty(globalThis, which, { value, writable: true, configurable: true });
}

export function removeFakeStorage(which: FakeStore = 'localStorage'): void {
  delete (globalThis as unknown as Partial<Record<FakeStore, unknown>>)[which];
}
