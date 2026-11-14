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
    name: 'a deep link is never redirected',
    path: '/venues/1',
    stored: 'sq',
    languages: ['sq'],
    redirect: null,
  },
];

/** The literal key, so a key drift against `core/locale.ts` fails the pin. */
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

function redirectedBySeed(browser: SeedBrowser): string | null {
  let redirect: string | null = null;
  const context = createContext({
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
  return redirect;
}

describe('first-visit locale seed vs firstVisitLocale (drift pin)', () => {
  for (const scenario of SCENARIOS) {
    it(`resolves identically on both sides: ${scenario.name}`, () => {
      expect(redirectedBySeed(scenario)).toBe(scenario.redirect);

      if (scenario.path === '/') {
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
});
