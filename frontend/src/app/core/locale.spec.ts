import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import {
  defineStorageGlobal,
  installFakeStorage,
  removeFakeStorage,
} from '../../testing/fake-storage';
import { buildLocale } from '../shared/display-locale';
import { firstVisitLocale, LocaleService, rememberSsoReturn } from './locale';
import { PageNavigation } from './page-navigation';

interface LocalizeGlobal {
  $localize: { locale?: string };
}

function compileAs(locale: string | undefined): void {
  (globalThis as unknown as LocalizeGlobal).$localize.locale = locale;
}

describe('LocaleService', () => {
  let store: Map<string, string>;
  let leaveTo: ReturnType<typeof vi.fn>;

  async function serviceAt(url: string): Promise<LocaleService> {
    leaveTo = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PageNavigation, useValue: { leaveTo, reload: vi.fn() } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    return TestBed.inject(LocaleService);
  }

  beforeEach(() => {
    store = installFakeStorage();
  });

  afterEach(() => {
    compileAs(undefined);
    removeFakeStorage();
  });

  it('reads the locale the build was compiled for, English when none', () => {
    expect(buildLocale()).toBe('en');
    compileAs('sq');
    expect(buildLocale()).toBe('sq');
    compileAs('de');
    expect(buildLocale()).toBe('en');
  });

  it('switches to Albanian on the same route and remembers the choice', async () => {
    const locales = await serviceAt('/venues/7?date=2026-06-20#map');

    locales.select('sq');

    expect(store.get('riviera-locale')).toBe('sq');
    expect(leaveTo).toHaveBeenCalledWith('/sq/venues/7?date=2026-06-20#map');
  });

  it('switches from Italian back to English at the root', async () => {
    compileAs('it');
    const locales = await serviceAt('/booking/ABC123');

    expect(locales.current.id).toBe('it');
    locales.select('en');

    expect(store.get('riviera-locale')).toBe('en');
    expect(leaveTo).toHaveBeenCalledWith('/booking/ABC123');
  });

  it('stores but does not reload when the language is the current one', async () => {
    compileAs('sq');
    const locales = await serviceAt('/');

    locales.select('sq');

    expect(store.get('riviera-locale')).toBe('sq');
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it('still switches when storage is blocked', async () => {
    defineStorageGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const locales = await serviceAt('/');

    locales.select('it');

    expect(leaveTo).toHaveBeenCalledWith('/it/');
  });
});

describe('firstVisitLocale', () => {
  it('prefers a stored choice over the browser languages', () => {
    expect(firstVisitLocale('en', ['sq-AL', 'it'])).toBe('en');
    expect(firstVisitLocale('it', ['sq'])).toBe('it');
  });

  it('takes the first supported browser language, by its primary subtag', () => {
    expect(firstVisitLocale(null, ['de-DE', 'it-IT', 'sq'])).toBe('it');
    expect(firstVisitLocale('klingon', ['SQ-al'])).toBe('sq');
  });

  it('falls back to English', () => {
    expect(firstVisitLocale(null, ['de', 'pl'])).toBe('en');
    expect(firstVisitLocale(null, [])).toBe('en');
  });

  it('lets an SSO return note outrank the stored choice, and only a locale id counts', () => {
    expect(firstVisitLocale('en', ['en'], 'it')).toBe('it');
    expect(firstVisitLocale('sq', ['sq'], 'en')).toBe('en');
    expect(firstVisitLocale('sq', [], '//evil.example')).toBe('sq');
  });
});

describe('rememberSsoReturn', () => {
  let session: Map<string, string>;

  beforeEach(() => {
    session = installFakeStorage('sessionStorage');
  });

  afterEach(() => {
    compileAs(undefined);
    removeFakeStorage('sessionStorage');
  });

  it('notes the running build so the round trip lands back in it', () => {
    compileAs('it');
    rememberSsoReturn();
    expect(session.get('riviera-sso-locale')).toBe('it');

    compileAs(undefined);
    rememberSsoReturn();
    expect(session.get('riviera-sso-locale')).toBe('en');
  });

  it('degrades to no note when storage is blocked', () => {
    defineStorageGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberSsoReturn()).not.toThrow();
  });
});
