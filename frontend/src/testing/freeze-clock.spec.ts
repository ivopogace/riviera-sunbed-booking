import { describe, expect, it, vi } from 'vitest';

import { FROZEN_INSTANT, freezeClock, type StampedGlobal } from './freeze-clock';

describe('the frozen suite clock', () => {
  it('was installed by a setup run belonging to this very file', () => {
    expect((globalThis as StampedGlobal).__rivieraSetupFile).toBe(expect.getState().testPath);
  });

  it('starts the test file at the documented instant', () => {
    expect(Date.now()).toBe(Date.parse(FROZEN_INSTANT));
    expect(new Date().toISOString()).toBe('2026-06-15T10:00:00.000Z');
  });

  it('fakes Date alone, leaving real timers to run', () => {
    const pending = setTimeout(() => undefined, 1_000);
    try {
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      clearTimeout(pending);
    }
  });

  it('is restored by freezeClock() after a spec opts into full fake timers', () => {
    vi.useFakeTimers();
    try {
      const pending = setTimeout(() => undefined, 1_000);
      expect(vi.getTimerCount()).toBe(1);
      clearTimeout(pending);

      vi.advanceTimersByTime(36_000_000);
      expect(Date.now()).not.toBe(Date.parse(FROZEN_INSTANT));
    } finally {
      freezeClock();
    }

    expect(Date.now()).toBe(Date.parse(FROZEN_INSTANT));
    expect(vi.getTimerCount()).toBe(0);
  });
});
