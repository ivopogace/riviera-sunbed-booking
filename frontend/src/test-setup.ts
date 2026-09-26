/**
 * Global unit-test setup: freezes the clock at Monday 2026-06-15 midday `Europe/Tirane` before
 * every test file, so no spec depends on the machine's calendar; the `afterEach` below fails a test
 * that leaves it drifted, naming it.
 *
 * Register it in `vitest-base.config.ts`, never `angular.json`'s `setupFiles`: the builder's shim
 * would be re-imported per file instead of this body. `freeze-clock.spec.ts` fails if that changes.
 * Mechanism and measurements: ADR-0014.
 */
import { afterEach, expect } from 'vitest';

import { FROZEN_INSTANT, freezeClock, type StampedGlobal } from './testing/freeze-clock';

const frozen = Date.parse(FROZEN_INSTANT);

(globalThis as StampedGlobal).__rivieraSetupFile = expect.getState().testPath;
freezeClock();

afterEach(() => {
  const drift = Date.now() - frozen;
  freezeClock();

  if (drift !== 0) {
    throw new Error(
      `This test left the clock ${drift} ms off the frozen instant. A spec that opts into full ` +
        `fake timers restores with freezeClock() from src/testing/freeze-clock, never with ` +
        `vi.useRealTimers().`,
    );
  }
});
