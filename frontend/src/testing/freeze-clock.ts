import { vi } from 'vitest';

/**
 * Monday 2026-06-15, midday `Europe/Tirane` — the instant the unit-test clock is frozen at.
 *
 * Midday Tirane is deliberate: the local civil date agrees across every plausible developer
 * timezone (UTC-9 … UTC+13), so even a spec formatting without an explicit zone stays stable.
 */
export const FROZEN_INSTANT = '2026-06-15T12:00:00+02:00';

/**
 * Freezes `Date` at {@link FROZEN_INSTANT} — the posture every test file starts from, installed by
 * `src/test-setup.ts` before each one.
 *
 * Only `Date` is faked, so real timers (`setTimeout`, intervals, rAF) and Angular's `fakeAsync`
 * zone are untouched. A spec that needs **full** fake timers calls `vi.useFakeTimers()` and
 * restores with this function, never with `vi.useRealTimers()`: that unfakes `Date` too and hands
 * the machine's real calendar to every test after it in the file.
 */
export function freezeClock(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FROZEN_INSTANT));
}
