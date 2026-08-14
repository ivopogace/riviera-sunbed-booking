import { afterEach, expect } from 'vitest';

import { FROZEN_INSTANT, freezeClock, type StampedGlobal } from './testing/freeze-clock';

/**
 * Global unit-test setup: the suite's clock is frozen at Monday 2026-06-15, midday
 * `Europe/Tirane`, before **every test file**, so no spec can depend on the machine's real
 * calendar. The `afterEach` below holds that posture inside a file, naming the test that breaks it.
 *
 * Registered in `vitest-base.config.ts`, **not** in `angular.json`'s `setupFiles`: the builder
 * pre-bundles its setup files as esbuild entry points, and an entry point is a re-export shim
 * whenever it is shared or coverage is on — which is what Vitest's per-file re-import would reach
 * instead of this body. `freeze-clock.spec.ts` fails if that ever changes. Mechanism, measurements
 * and the rejected alternative: `docs/adr/ADR-0014-vitest-per-file-setup-over-isolation.md`.
 */
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
