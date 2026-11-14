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
 *
 * <p>Leaving full fake timers first runs the frame due next. jsdom drives its animation frames and
 * focus fixup from one `setInterval` it starts on demand and keeps a handle to until it goes idle;
 * a `focus()` under full fake timers starts that interval as a fake one, and dropping the fakes
 * with it pending leaves jsdom holding a handle that never fires, so no `requestAnimationFrame`
 * in that window ever runs again — every later file in the worker, under `isolate: false`. Only
 * full fakes register timers, so the Date-only posture (and the real one before setup) skips it.
 */
export function freezeClock(): void {
  if (vi.isFakeTimers() && vi.getTimerCount() > 0) {
    vi.advanceTimersToNextFrame();
  }
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FROZEN_INSTANT));
}
