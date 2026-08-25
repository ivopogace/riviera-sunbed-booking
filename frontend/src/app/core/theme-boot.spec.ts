import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme';

/**
 * The drift pin for the pre-paint theme seed (#675). `index.html` carries a tiny inline script
 * that seeds `data-riv-theme` before first paint; `core/theme.ts` resolves the same value at
 * bootstrap. No shared constant is reachable from `index.html`, so this spec executes the REAL
 * inline script (extracted from `src/index.html`) and boots the REAL `ThemeService` against one
 * scenario table — if either side's resolution order (stored → OS dark → porcelain) drifts, a row
 * disagrees and this file fails.
 */

interface Scenario {
  readonly name: string;
  /** The raw stored value, `null` for unset, or a storage whose reads throw (private mode). */
  readonly stored: string | null;
  readonly storageBlocked?: boolean;
  readonly prefersDark: boolean;
  readonly expected: 'riviera' | 'porcelain' | 'dark';
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'stored porcelain beats a dark OS',
    stored: 'porcelain',
    prefersDark: true,
    expected: 'porcelain',
  },
  {
    name: 'stored riviera beats a light OS',
    stored: 'riviera',
    prefersDark: false,
    expected: 'riviera',
  },
  {
    name: 'stored dark beats a light OS',
    stored: 'dark',
    prefersDark: false,
    expected: 'dark',
  },
  {
    name: 'unknown stored value + light OS falls through to porcelain',
    stored: 'neon-zebra',
    prefersDark: false,
    expected: 'porcelain',
  },
  {
    name: 'unknown stored value + dark OS falls through to the dark theme',
    stored: 'neon-zebra',
    prefersDark: true,
    expected: 'dark',
  },
  {
    name: 'no stored choice + light OS resolves porcelain',
    stored: null,
    prefersDark: false,
    expected: 'porcelain',
  },
  {
    name: 'no stored choice + dark OS resolves the dark theme',
    stored: null,
    prefersDark: true,
    expected: 'dark',
  },
  {
    name: 'blocked storage + light OS degrades to porcelain',
    stored: null,
    storageBlocked: true,
    prefersDark: false,
    expected: 'porcelain',
  },
  {
    name: 'blocked storage + dark OS degrades to the dark theme',
    stored: null,
    storageBlocked: true,
    prefersDark: true,
    expected: 'dark',
  },
];

function inlineSeedScript(): string {
  // import.meta.url is not a file URL under the builder's bundling; Vitest runs with cwd = frontend/.
  const indexHtml = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');
  // Index slicing, not an HTML-tag regex: this extracts our own literal tag (CodeQL js/bad-tag-filter).
  const open = indexHtml.indexOf('<script>');
  const close = indexHtml.indexOf('</script>', open);
  if (open === -1 || close === -1) {
    throw new Error('src/index.html carries no inline pre-paint theme seed script (#675)');
  }
  return indexHtml.slice(open + '<script>'.length, close);
}

/** The seed's literal storage key — key-sensitive so a key drift vs `STORAGE_KEY` fails the pin. */
const SEED_STORAGE_KEY = 'riviera-theme';

function fakeLocalStorage(scenario: Scenario): Pick<Storage, 'getItem'> {
  return {
    getItem: (key: string): string | null => {
      if (scenario.storageBlocked) {
        throw new Error('storage blocked (private mode)');
      }
      return key === SEED_STORAGE_KEY ? scenario.stored : null;
    },
  };
}

function fakeMatchMedia(scenario: Scenario): (query: string) => { matches: boolean } {
  return (query: string) => ({
    matches: scenario.prefersDark && query.includes('prefers-color-scheme: dark'),
  });
}

/** Run the real inline script against the scenario's browser stubs; return what it seeded. */
function seededByInlineScript(scenario: Scenario): string | undefined {
  const dataset: Record<string, string> = {};
  const context = createContext({
    localStorage: fakeLocalStorage(scenario),
    matchMedia: fakeMatchMedia(scenario),
    document: { documentElement: { dataset } },
  });
  runInContext(inlineSeedScript(), context);
  return dataset['rivTheme'];
}

interface MutableGlobal {
  localStorage?: unknown;
  matchMedia?: unknown;
}

describe('pre-paint theme seed vs ThemeService (drift pin, #675)', () => {
  afterEach(() => {
    delete (globalThis as MutableGlobal).localStorage;
    delete (globalThis as MutableGlobal).matchMedia;
    document.documentElement.removeAttribute('data-riv-theme');
  });

  for (const scenario of SCENARIOS) {
    it(`resolves identically on both sides: ${scenario.name}`, () => {
      expect(seededByInlineScript(scenario)).toBe(scenario.expected);

      (globalThis as MutableGlobal).localStorage = fakeLocalStorage(scenario);
      (globalThis as MutableGlobal).matchMedia = fakeMatchMedia(scenario);
      expect(TestBed.inject(ThemeService).theme()).toBe(scenario.expected);
    });
  }
});
