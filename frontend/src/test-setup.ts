import { expect } from 'vitest';

import { FROZEN_INSTANT, freezeClock } from './testing/freeze-clock';

/**
 * Global unit-test setup (wired via the `test` target's `setupFiles` in `angular.json`):
 * **the suite's clock is frozen** at Monday 2026-06-15, midday Europe/Tirane, before every
 * test file — so no spec can ever depend on the machine's real calendar.
 *
 * Why: a spec once hardcoded `'2026-08-01'` as a "different" date for a date-change
 * interaction; the day the real calendar reached it, the value equalled "today", the change
 * never fired, and CI went red repo-wide for exactly one day. Freezing `Date` makes "today"
 * deterministic forever: literals can never drift into collision, and a date-dependent test
 * fails on the day it is written or never.
 *
 * **Nothing may import this file** — `eslint.config.js` enforces that, and the freeze depends
 * on it. Vitest re-imports every setup file before every test file, but
 * `@angular/build:unit-test` pre-bundles setup files with esbuild: the moment a second entry
 * point imports this module, esbuild hoists its body into a shared chunk and leaves a
 * re-export shim behind. Vitest then re-imports a shim whose chunk is already evaluated, the
 * freeze runs once per **worker process** instead of once per file, and whatever the previous
 * file left on the global clock is what the next one inherits (#663). Helpers a spec needs
 * live in `src/testing/` instead.
 *
 * The check below is the tripwire for that: a file handed an unfrozen clock fails loudly and
 * names the file that left it that way, rather than failing somewhere else half the day.
 */
const worker = globalThis as typeof globalThis & { __rivieraClockOrigin?: string };
const predecessor = worker.__rivieraClockOrigin;
const frozen = Date.parse(FROZEN_INSTANT);
const inherited = Date.now();

worker.__rivieraClockOrigin = expect.getState().testPath ?? '(unknown file)';
freezeClock();

if (predecessor !== undefined && inherited !== frozen) {
  throw new Error(
    `Unit-test clock leak: ${predecessor} left the shared clock at ` +
      `${new Date(inherited).toISOString()} instead of the frozen ` +
      `${new Date(frozen).toISOString()}. A spec that opts into full fake timers restores with ` +
      `freezeClock() from src/testing/freeze-clock, never with vi.useRealTimers(). ` +
      `This file is the messenger, not the cause.`,
  );
}
