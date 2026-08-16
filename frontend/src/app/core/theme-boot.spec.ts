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
 * scenario table — if either side's resolution order (stored → OS light → riviera) drifts, a row
 * disagrees and this file fails.
 */

interface Scenario {
  readonly name: string;
  /** The raw stored value, `null` for unset, or a storage whose reads throw (private mode). */
  readonly stored: string | null;
  readonly storageBlocked?: boolean;
  readonly prefersLight: boolean;
  readonly expected: 'riviera' | 'porcelain';
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'stored porcelain beats a dark OS',
    stored: 'porcelain',
    prefersLight: false,
    expected: 'porcelain',
  },
  {
    name: 'stored riviera beats a light OS',
    stored: 'riviera',
    prefersLight: true,
    expected: 'riviera',
  },
  {
    name: 'unknown stored value + light OS falls through to porcelain',
    stored: 'neon-zebra',
    prefersLight: true,
    expected: 'porcelain',
  },
  {
    name: 'unknown stored value + dark OS falls through to riviera',
    stored: 'neon-zebra',
    prefersLight: false,
    expected: 'riviera',
  },
  {
    name: 'no stored choice + light OS resolves porcelain',
    stored: null,
    prefersLight: true,
    expected: 'porcelain',
  },
  {
    name: 'no stored choice + dark OS resolves riviera',
    stored: null,
    prefersLight: false,
    expected: 'riviera',
  },
  {
    name: 'blocked storage + light OS degrades to porcelain',
    stored: null,
    storageBlocked: true,
    prefersLight: true,
    expected: 'porcelain',
  },
  {
    name: 'blocked storage + dark OS degrades to riviera',
    stored: null,
    storageBlocked: true,
    prefersLight: false,
    expected: 'riviera',
  },
];

function inlineSeedScript(): string {
  // import.meta.url is not a file URL under the builder's bundling; Vitest runs with cwd = frontend/.
  const indexHtml = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');
  const match = /<script>([\s\S]*?)<\/script>/.exec(indexHtml);
  if (!match) {
    throw new Error('src/index.html carries no inline pre-paint theme seed script (#675)');
  }
  return match[1];
}

function fakeLocalStorage(scenario: Scenario): Pick<Storage, 'getItem'> {
  return {
    getItem: (): string | null => {
      if (scenario.storageBlocked) {
        throw new Error('storage blocked (private mode)');
      }
      return scenario.stored;
    },
  };
}

function fakeMatchMedia(scenario: Scenario): (query: string) => { matches: boolean } {
  return (query: string) => ({
    matches: scenario.prefersLight && query.includes('prefers-color-scheme: light'),
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
