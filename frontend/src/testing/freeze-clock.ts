import { vi } from 'vitest';

/**
 * Monday 2026-06-15, midday `Europe/Tirane` — the instant the unit-test clock is frozen at.
 *
 * Midday Tirane is deliberate: the local civil date agrees across every plausible developer
 * timezone (UTC-9 … UTC+13), so even a spec formatting without an explicit zone stays stable.
 */
export const FROZEN_INSTANT = '2026-06-15T12:00:00+02:00';

/** `globalThis` carrying the stamp `src/test-setup.ts` writes on each of its runs. */
export type StampedGlobal = typeof globalThis & { __rivieraSetupFile?: string };

/**
 * Freezes `Date` at {@link FROZEN_INSTANT} — the posture every test file starts from, installed by
 * `src/test-setup.ts` before each one.
 *
 * Only `Date` is faked, so real timers (`setTimeout`, intervals, rAF) and Angular's `fakeAsync`
 * zone are untouched. A spec that needs **full** fake timers calls `vi.useFakeTimers()` and
 * restores with this function, never with `vi.useRealTimers()`: that unfakes `Date` too and hands
 * the machine's real calendar to every test after it in the file.
 *
 * This module is imported by both the setup entry and by specs, so esbuild hoists it into a chunk
 * that is evaluated **once per worker process**. It must therefore stay stateless — no memo, no
 * counter, no cached `Date` — or that state outlives the file that created it.
 */
export function freezeClock(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FROZEN_INSTANT));
}
