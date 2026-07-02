import { TestBed } from '@angular/core/testing';

import { THEME_OPTIONS, ThemeService } from './theme';

/** jsdom has no matchMedia; install a minimal fake reporting the given light-preference. */
function fakeMatchMedia(prefersLight: boolean): void {
  (globalThis as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (
    query: string,
  ) => ({ matches: prefersLight && query.includes('prefers-color-scheme: light') });
}

function removeMatchMedia(): void {
  delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
}

/** The test env has no localStorage global; install a Map-backed fake (real persistence is e2e-pinned). */
function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  return store;
}

describe('ThemeService (Liquid Glass foundation, issue #134)', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installFakeStorage();
    document.documentElement.removeAttribute('data-riv-theme');
    removeMatchMedia();
  });

  afterEach(() => {
    removeMatchMedia();
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it('offers the two launch themes as data (riviera default-dark, porcelain light)', () => {
    expect(THEME_OPTIONS.map((o) => o.id)).toEqual(['riviera', 'porcelain']);
    expect(THEME_OPTIONS.find((o) => o.id === 'porcelain')?.light).toBe(true);
  });

  it('defaults to riviera with no stored choice and no OS light preference (AC-1)', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('defaults to porcelain when the OS prefers a light scheme (AC-1)', () => {
    fakeMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
  });

  it('prefers the stored choice over the OS preference (AC-2)', () => {
    fakeMatchMedia(true);
    store.set('riviera-theme', 'riviera');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('riviera');
  });

  it('select() switches the document theme and persists it for the next visit (AC-2)', () => {
    const service = TestBed.inject(ThemeService);

    service.select('porcelain');

    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
    expect(store.get('riviera-theme')).toBe('porcelain');
  });

  it('falls back to the default when the stored value is not a known theme', () => {
    store.set('riviera-theme', 'neon-zebra');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('riviera');
  });
});
