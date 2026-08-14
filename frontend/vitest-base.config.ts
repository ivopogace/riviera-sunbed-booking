import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration the `@angular/build:unit-test` builder merges into its own
 * (`runnerConfig: true` in `angular.json`).
 *
 * `src/test-setup.ts` is registered here rather than in the builder's `setupFiles` so that Vitest
 * resolves it directly instead of pre-bundling it as an esbuild entry point. Entry points are
 * re-export shims — always so when coverage is enabled, which is the mode CI runs — and Vitest's
 * per-file setup invalidation only reaches the shim, so the body behind it would run once per
 * worker process instead of once per test file. Details:
 * `docs/adr/ADR-0014-vitest-per-file-setup-over-isolation.md`.
 */
export default defineConfig({
  test: {
    setupFiles: ['./src/test-setup.ts'],
  },
});
