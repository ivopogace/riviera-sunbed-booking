import { TestBed } from '@angular/core/testing';

import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
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

/**
 * A matchMedia fake with change-event support, for the #675 OS-follow cases. Returns a trigger
 * that fires the captured `change` listener as if the OS light preference flipped to `matches`.
 */
function fakeMatchMediaWithEvents(prefersLight: boolean): (matches: boolean) => void {
  let onChange: ((event: { matches: boolean }) => void) | undefined;
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: prefersLight && query.includes('prefers-color-scheme: light'),
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

  it('follows a mid-session OS scheme flip when no choice is stored (#675)', () => {
    const flipOsLight = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('riviera');

    flipOsLight(true);
    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');

    flipOsLight(false);
    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('ignores an OS scheme flip when a choice was stored before boot (#675)', () => {
    store.set('riviera-theme', 'riviera');
    const flipOsLight = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);

    flipOsLight(true);

    expect(service.theme()).toBe('riviera');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('keeps an explicit in-session choice over an OS flip even with storage blocked (#680 review)', () => {
    removeFakeStorage(); // no storage at all — the private-mode "session-only theming" degrade
    const flipOsLight = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);
    service.select('porcelain');

    flipOsLight(false);

    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
  });

  it('ignores an OS scheme flip after select() persisted a choice (#675)', () => {
    const flipOsLight = fakeMatchMediaWithEvents(false);
    const service = TestBed.inject(ThemeService);
    service.select('porcelain');

    flipOsLight(false);

    expect(service.theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
  });
});
