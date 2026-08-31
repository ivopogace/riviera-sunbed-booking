import { TestBed } from '@angular/core/testing';

import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
import { THEME_OPTIONS, ThemeService } from './theme';

/** jsdom has no matchMedia; install a minimal fake reporting the given dark-preference. */
function fakeMatchMedia(prefersDark: boolean): void {
  (globalThis as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (
    query: string,
  ) => ({ matches: prefersDark && query.includes('prefers-color-scheme: dark') });
}

function removeMatchMedia(): void {
  delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
}

/**
 * A matchMedia fake with change-event support, for the #675 OS-follow cases. Returns a trigger
 * that fires the captured `change` listener as if the OS dark preference flipped to `matches`.
 */
function fakeMatchMediaWithEvents(prefersDark: boolean): (matches: boolean) => void {
  let onChange: ((event: { matches: boolean }) => void) | undefined;
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: prefersDark && query.includes('prefers-color-scheme: dark'),
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      onChange = listener;
    },
  });
  return (matches: boolean) => onChange?.({ matches });
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
    removeFakeStorage();
  });

  it('offers the three themes as data (porcelain the light default, riviera + dark the dark pair)', () => {
    expect(THEME_OPTIONS.map((o) => o.id)).toEqual(['porcelain', 'riviera', 'dark']);
    expect(THEME_OPTIONS.find((o) => o.id === 'porcelain')?.light).toBe(true);
    expect(THEME_OPTIONS.find((o) => o.id === 'riviera')?.light).toBe(false);
    expect(THEME_OPTIONS.find((o) => o.id === 'dark')?.light).toBe(false);
  });

  it('defaults to porcelain with no stored choice and no OS dark preference (AC-1)', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
  });

  it('defaults to the dark theme when the OS prefers a dark scheme (AC-1)', () => {
    fakeMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('dark');
  });

  it('prefers the stored choice over the OS preference (AC-2)', () => {
    fakeMatchMedia(true);
    store.set('riviera-theme', 'porcelain');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('porcelain');
  });

  it('riviera is reachable only as a stored/selected choice, never an OS resolution', () => {
    fakeMatchMedia(true);
    store.set('riviera-theme', 'riviera');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('select() switches the document theme and persists it for the next visit (AC-2)', () => {
    const service = TestBed.inject(ThemeService);

    service.select('riviera');

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
    expect(store.get('riviera-theme')).toBe('riviera');
  });

  it('falls back to the default when the stored value is not a known theme', () => {
    store.set('riviera-theme', 'neon-zebra');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('porcelain');
  });

  it('follows a mid-session OS scheme flip when no choice is stored (#675)', () => {
    const flipOsDark = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('porcelain');

    flipOsDark(true);
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('dark');

    flipOsDark(false);
    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
  });

  it('ignores an OS scheme flip when a choice was stored before boot (#675)', () => {
    store.set('riviera-theme', 'riviera');
    const flipOsDark = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);

    flipOsDark(true);

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('keeps an explicit in-session choice over an OS flip even with storage blocked (#680 review)', () => {
    removeFakeStorage(); // no storage at all — the private-mode "session-only theming" degrade
    const flipOsDark = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);
    service.select('riviera');

    flipOsDark(true);

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('ignores an OS scheme flip after select() persisted a choice (#675)', () => {
    const flipOsDark = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);
    service.select('riviera');

    flipOsDark(true);

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });
});
