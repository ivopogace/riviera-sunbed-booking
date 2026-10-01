import { describe, expect, it } from 'vitest';

import { FROZEN_INSTANT, type StampedGlobal } from './freeze-clock';

/**
 * The second sentinel for ADR-0014 §3: `freeze-clock.spec.ts` alone passes when it happens to be the
 * first file in its worker even if setup ran only once. Two sentinels cannot both be first in one worker.
 */
describe('the frozen suite clock, second sentinel', () => {
  it('was installed by a setup run belonging to this very file', () => {
    expect((globalThis as StampedGlobal).__rivieraSetupFile).toBe(expect.getState().testPath);
  });

  it('starts the test file at the documented instant', () => {
    expect(Date.now()).toBe(Date.parse(FROZEN_INSTANT));
  });
});
