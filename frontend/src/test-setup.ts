import { vi } from 'vitest';

/**
 * Global unit-test setup (wired via the `test` target's `setupFiles` in `angular.json`):
 * **the suite's clock is frozen** at a fixed instant — Monday 2026-06-15, midday in
 * Europe/Tirane — so no spec can ever depend on the machine's real calendar.
 *
 * Why: a spec once hardcoded `'2026-08-01'` as a "different" date for a date-change
 * interaction; the day the real calendar reached it, the value equalled "today", the change
 * never fired, and CI went red repo-wide for exactly one day (PR #480). Freezing `Date`
 * makes "today" deterministic forever: literals can never drift into collision, and a
 * date-dependent test fails on the day it is written or never.
 *
 * Only `Date` is faked — real timers (`setTimeout`, intervals, rAF) are untouched, so
 * async/debounce behavior and Angular's own `fakeAsync` zone are unaffected. A spec that
 * genuinely needs the real clock can opt out with `vi.useRealTimers()`.
 *
 * Midday Tirane is deliberate: the local civil date agrees across every plausible developer
 * timezone (UTC-9 … UTC+13), so even a spec formatting without an explicit zone stays stable.
 */
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-06-15T12:00:00+02:00'));
