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
  readonly languages: readonly string[];
  readonly search?: string;
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
    languages: ['fr', 'pl'],
    redirect: null,
  },
  {
    name: 'German browser, nothing stored',
    path: '/',
    stored: null,
    languages: ['de-AT', 'en'],
    redirect: '/de/',
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
    name: 'an SSO return to / stays in English over a stored Albanian',
    path: '/',
    search: '?sso=signed-in',
    stored: 'sq',
    languages: ['sq'],
    redirect: null,
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
  readonly languages: readonly string[];
  readonly search?: string;
  readonly hash?: string;
}

interface SeedRun {
  readonly redirect: string | null;
  /** The URL the seed rewrote in place (`history.replaceState`), or `null`. */
  readonly replaced: string | null;
  /** Every `sessionStorage` call the seed made: an SSO return lands under its subpath server-side (#1804). */
  readonly sessionCalls: readonly string[];
}

function redirectedBySeed(browser: SeedBrowser): string | null {
  return runSeed(browser).redirect;
}

function runSeed(browser: SeedBrowser): SeedRun {
  let redirect: string | null = null;
  let replaced: string | null = null;
  const sessionCalls: string[] = [];
  const context = createContext({
    sessionStorage: new Proxy(
      {},
      {
        get: (_target, name) => (key: string) => {
          sessionCalls.push(`${String(name)}(${key})`);
          return null;
        },
      },
    ),
    localStorage: {
      getItem: (key: string) => {
        if (browser.storageBlocked) {
          throw new Error('storage blocked (private mode)');
        }
        return key === SEED_STORAGE_KEY ? browser.stored : null;
      },
    },
    URLSearchParams,
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => {
        replaced = url;
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
  return { redirect, replaced, sessionCalls };
}

describe('first-visit locale seed vs firstVisitLocale (drift pin)', () => {
  for (const scenario of SCENARIOS) {
    it(`resolves identically on both sides: ${scenario.name}`, () => {
      expect(redirectedBySeed(scenario)).toBe(scenario.redirect);

      if (scenario.path === '/' && !scenario.search) {
        const stored = scenario.storageBlocked ? null : scenario.stored;
        const locale = firstVisitLocale(stored, scenario.languages);
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

  it('strips the SSO return marker in place and keeps the rest of the URL', () => {
    const run = (path: string, search: string) =>
      runSeed({ path, search, hash: '#map', stored: 'sq', languages: [] });
    expect(run('/', '?sso=signed-in')).toMatchObject({ redirect: null, replaced: '/#map' });
    expect(run('/it/', '?venue=3&sso=signed-in').replaced).toBe('/it/?venue=3#map');
    expect(run('/account/sign-in', '?audience=operator&sso=failed').replaced).toBeNull();
  });

  it('never reads or writes sessionStorage', () => {
    expect(runSeed({ path: '/', stored: null, languages: ['it'] }).sessionCalls).toEqual([]);
    expect(runSeed({ path: '/venues/1', stored: null, languages: [] }).sessionCalls).toEqual([]);
  });
});
