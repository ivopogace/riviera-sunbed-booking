import { TestBed } from '@angular/core/testing';

import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
import { CONSOLE_THEME_OPTIONS, ConsoleTheme } from './console-theme';

/**
 * The console's own theme choice — porcelain or dark, the operator's, remembered on the device.
 * What these specs pin: the two options and their order, the porcelain default, that a stored
 * choice is honoured and a corrupt one ignored, that `select` persists, and above all that the
 * service never writes the document's `data-riv-theme` — that attribute is the tourist
 * `ThemeService`'s alone; the console pins its own on the app shell's host.
 */
describe('ConsoleTheme (the console’s porcelain-or-dark choice, #1010)', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installFakeStorage();
    document.documentElement.setAttribute('data-riv-theme', 'riviera');
  });

  afterEach(() => {
    removeFakeStorage();
    document.documentElement.removeAttribute('data-riv-theme');
  });

  it('offers exactly the two console themes, porcelain first', () => {
    expect(CONSOLE_THEME_OPTIONS.map((option) => option.id)).toEqual(['porcelain', 'dark']);
    expect(CONSOLE_THEME_OPTIONS.map((option) => option.name)).toEqual(['Porcelain', 'Dark']);
  });

  it('defaults to porcelain, remembers a stored choice, and never touches the document attribute', () => {
    expect(TestBed.inject(ConsoleTheme).theme()).toBe('porcelain');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('boots on the stored choice', () => {
    store.set('riviera-console-theme', 'dark');

    expect(TestBed.inject(ConsoleTheme).theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('ignores a stored value that is not a console theme — the tourist riviera included', () => {
    store.set('riviera-console-theme', 'riviera');

    expect(TestBed.inject(ConsoleTheme).theme()).toBe('porcelain');
  });

  it('select() flips the signal and persists the choice, and only the choice', () => {
    const service = TestBed.inject(ConsoleTheme);

    service.select('dark');

    expect(service.theme()).toBe('dark');
    expect(store.get('riviera-console-theme')).toBe('dark');
    expect(store.has('riviera-theme')).toBe(false);
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');

    service.select('porcelain');

    expect(service.theme()).toBe('porcelain');
    expect(store.get('riviera-console-theme')).toBe('porcelain');
  });
});
