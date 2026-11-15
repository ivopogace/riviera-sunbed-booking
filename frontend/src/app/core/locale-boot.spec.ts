import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import { firstVisitLocale } from './locale';

/**
 * The drift pin for `index.html`'s first-visit locale seed: runs the REAL inline script against one
 * scenario table beside `core/locale.ts`'s `firstVisitLocale`, so a change to either side's order
 * (stored choice, then browser languages, then English) or to the storage key fails here (ADR-0030).
 */

interface Scenario {
  readonly name: string;
  readonly path: string;
  readonly stored: string | null;
  readonly storageBlocked?: boolean;
  /** The one-shot note `CustomerAuth.startSso` leaves in `sessionStorage`. */
  readonly ssoReturn?: string | null;
  readonly languages: readonly string[];
  /** Where the seed sends the browser, or `null` when it stays. */
  readonly redirect: string | null;
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'stored Albanian', path: '/', stored: 'sq', languages: ['en'], redirect: '/sq/' },
  {
    name: 'stored English beats an Italian browser',
    path: '/',
    stored: 'en',
    languages: ['it'],
    redirect: null,
  },
  {
    name: 'Italian browser, nothing stored',
    path: '/',
    stored: null,
    languages: ['it-IT', 'en'],
    redirect: '/it/',
  },
  {
    name: 'unknown stored value falls to the browser',
    path: '/',
    stored: 'fr',
    languages: ['sq-AL'],
    redirect: '/sq/',
  },
  {
    name: 'unsupported browser languages stay English',
    path: '/',
    stored: null,
    languages: ['de', 'pl'],
    redirect: null,
  },
  {
    name: 'blocked storage falls to the browser',
    path: '/',
    stored: null,
    storageBlocked: true,
    languages: ['it'],
    redirect: '/it/',
  },
  {
    name: 'an SSO return to Italian beats a stored English',
    path: '/',
    stored: 'en',
    ssoReturn: 'it',
    languages: ['en'],
    redirect: '/it/',
  },
  {
    name: 'an SSO return to English beats a stored Albanian',
    path: '/',
    stored: 'sq',
    ssoReturn: 'en',
    languages: ['sq'],
    redirect: null,
  },
  {
    name: 'a protocol-relative SSO note falls back to the stored choice',
    path: '/',
    stored: 'sq',
    ssoReturn: '//evil.example',
    languages: [],
    redirect: '/sq/',
  },
  {
    name: 'an absolute-URL SSO note falls back to English',
    path: '/',
    stored: null,
    ssoReturn: 'https://evil.example/',
    languages: ['de'],
    redirect: null,
  },
  {
    name: 'a path-shaped SSO note falls back to the browser',
    path: '/',
    stored: null,
    ssoReturn: 'it/../../evil',
    languages: ['it'],
    redirect: '/it/',
  },
  {
    name: 'a deep link is never redirected',
    path: '/venues/1',
    stored: 'sq',
    languages: ['sq'],
    redirect: null,
  },
];

/** The literal keys, so a key drift against `core/locale.ts` fails the pin. */
const SEED_STORAGE_KEY = 'riviera-locale';
const SEED_SSO_RETURN_KEY = 'riviera-sso-locale';

function localeSeedScript(): string {
  // Index slicing, not an HTML-tag regex (CodeQL js/bad-tag-filter); cwd is frontend/ under Vitest.
  const indexHtml = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');
  let from = 0;
  for (;;) {
    const open = indexHtml.indexOf('<script>', from);
    if (open === -1) {
      throw new Error('src/index.html carries no inline first-visit locale seed');
    }
    const close = indexHtml.indexOf('</script>', open);
    const body = indexHtml.slice(open + '<script>'.length, close);
    if (body.includes(SEED_STORAGE_KEY)) {
      return body;
    }
    from = close;
  }
}

interface SeedBrowser {
  readonly path: string;
  readonly stored: string | null;
  readonly storageBlocked?: boolean;
  readonly ssoReturn?: string | null;
  readonly languages: readonly string[];
  readonly search?: string;
  readonly hash?: string;
}

interface SeedRun {
  readonly redirect: string | null;
  /** The keys the seed removed from `sessionStorage`. */
  readonly consumed: readonly string[];
}

function redirectedBySeed(browser: SeedBrowser): string | null {
  return runSeed(browser).redirect;
}

function runSeed(browser: SeedBrowser): SeedRun {
  let redirect: string | null = null;
  const consumed: string[] = [];
  const context = createContext({
    sessionStorage: {
      getItem: (key: string) => {
        if (browser.storageBlocked) {
          throw new Error('storage blocked (private mode)');
        }
        return key === SEED_SSO_RETURN_KEY ? (browser.ssoReturn ?? null) : null;
      },
      removeItem: (key: string) => {
        if (browser.storageBlocked) {
          throw new Error('storage blocked (private mode)');
        }
        consumed.push(key);
      },
    },
    localStorage: {
      getItem: (key: string) => {
        if (browser.storageBlocked) {
          throw new Error('storage blocked (private mode)');
        }
        return key === SEED_STORAGE_KEY ? browser.stored : null;
      },
    },
    navigator: { languages: browser.languages },
    location: {
      pathname: browser.path,
      search: browser.search ?? '',
      hash: browser.hash ?? '',
      replace: (url: string) => {
        redirect = url;
      },
    },
  });
  runInContext(localeSeedScript(), context);
  return { redirect, consumed };
}

describe('first-visit locale seed vs firstVisitLocale (drift pin)', () => {
  for (const scenario of SCENARIOS) {
    it(`resolves identically on both sides: ${scenario.name}`, () => {
      expect(redirectedBySeed(scenario)).toBe(scenario.redirect);

      if (scenario.path === '/') {
        const stored = scenario.storageBlocked ? null : scenario.stored;
        const ssoReturn = scenario.storageBlocked ? null : (scenario.ssoReturn ?? null);
        const locale = firstVisitLocale(stored, scenario.languages, ssoReturn);
        expect(locale === 'en' ? null : `/${locale}/`).toBe(scenario.redirect);
      }
    });
  }

  it('keeps the query and fragment of the first load', () => {
    const redirect = redirectedBySeed({
      path: '/',
      stored: 'it',
      languages: [],
      search: '?venue=3',
      hash: '#map',
    });
    expect(redirect).toBe('/it/?venue=3#map');
  });

  it('consumes the SSO note on a load of /, whatever it named', () => {
    expect(runSeed({ path: '/', stored: null, ssoReturn: 'it', languages: [] }).consumed).toEqual([
      SEED_SSO_RETURN_KEY,
    ]);
    expect(
      runSeed({ path: '/', stored: null, ssoReturn: '//evil.example', languages: [] }).consumed,
    ).toEqual([SEED_SSO_RETURN_KEY]);
  });

  it('leaves the SSO note alone on a deep link', () => {
    expect(
      runSeed({ path: '/venues/1', stored: null, ssoReturn: 'it', languages: [] }).consumed,
    ).toEqual([]);
  });
});
