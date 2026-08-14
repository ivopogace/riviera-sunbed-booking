import { describe, expect, it, vi } from 'vitest';

import { FROZEN_INSTANT, freezeClock } from './freeze-clock';

describe('the frozen suite clock', () => {
  it('starts the test file at the documented instant', () => {
    expect(Date.now()).toBe(Date.parse(FROZEN_INSTANT));
    expect(new Date().toISOString()).toBe('2026-06-15T10:00:00.000Z');
  });

  it('is restored by freezeClock() after a spec opts into full fake timers', () => {
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(36_000_000);
      expect(Date.now()).not.toBe(Date.parse(FROZEN_INSTANT));
    } finally {
      freezeClock();
    }

    expect(Date.now()).toBe(Date.parse(FROZEN_INSTANT));
  });

  it('leaves real timers running, so only Date is faked', async () => {
    const ticked = await new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 1));

    expect(ticked).toBe(true);
  });
});
