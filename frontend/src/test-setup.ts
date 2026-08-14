import { vi } from 'vitest';

/**
 * Global unit-test setup (wired via the `test` target's `setupFiles` in `angular.json`):
 * **the suite's clock is frozen** at a fixed instant — Monday 2026-06-15, midday in
 * Europe/Tirane — so no spec can ever depend on the machine's real calendar.
 *
 * Why: a spec once hardcoded `'2026-08-01'` as a "different" date for a date-change
 * interaction; the day the real calendar reached it, the value equalled "today", the change
 * never fired, and CI went red repo-wide for exactly one day. Freezing `Date`
 * makes "today" deterministic forever: literals can never drift into collision, and a
 * date-dependent test fails on the day it is written or never.
 *
 * Only `Date` is faked — real timers (`setTimeout`, intervals, rAF) are untouched, so
 * async/debounce behavior and Angular's own `fakeAsync` zone are unaffected.
 *
 * Midday Tirane is deliberate: the local civil date agrees across every plausible developer
 * timezone (UTC-9 … UTC+13), so even a spec formatting without an explicit zone stays stable.
 *
 * **A spec that needs full fake timers restores this posture with `freezeClock()`, never with
 * `vi.useRealTimers()`.** `useRealTimers` unfakes `Date` too, and `setupFiles` runs once per file
 * while a worker environment is reused across files — so a spec that ended on real timers handed
 * the *next* file the machine's real calendar, and every spec downstream silently stopped being
 * deterministic. That is what this file exists to prevent, and it made
 * `console-stats-strip.spec.ts` fail for exactly the reason the anecdote above describes: its
 * `+12h` date-change assertion holds against the real clock only between 09:59 and 21:59 UTC, so
 * CI went red on every run in the other half of the day (#662).
 */
export function freezeClock(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00+02:00'));
}

freezeClock();
