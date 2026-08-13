/**
 * Launcher for the `playwright` MCP server declared in `.mcp.json`.
 *
 * Spawns `npx -y @playwright/mcp@<pinned>`, fixing two things `.mcp.json` could not express (#658).
 *
 * **The version is pinned here, not `@latest`.** `npx` must consult registry.npmjs.org to resolve
 * a dist-tag on every spawn, inside Claude Code's connect budget, with no retry on a miss — the
 * same failure #656 hit for `@angular/cli`. An exact version is servable from a warm npx cache, and
 * it stops the server drifting silently between sessions. The cost is that nothing bumps it for
 * us: Dependabot watches `/frontend`, `/platform` and the workflows, and sees no constant in a
 * `.mjs`. Bump `PACKAGE` by hand when the server needs to move.
 *
 * **`--executable-path` is now conditional.** It was committed as the literal Linux path
 * `/opt/pw-browsers/chromium`, which resolves only inside the Claude Code cloud image; on the
 * Windows dev machine sharing this config it cannot. The flag is load-bearing where it does
 * resolve — `@playwright/mcp` pins its own `playwright-core`, whose expected chromium revision
 * need not match the image's installed build, and the explicit path overrides that lookup. So it
 * is passed when the binary is really there and omitted otherwise, which lets Playwright fall back
 * to its own browser resolution on a machine that installed browsers the normal way.
 *
 * Unlike #656 there is no repo-local binary to prefer. `frontend/package.json` pins
 * `@playwright/test`, but `@playwright/mcp` is a different package that pins an *alpha*
 * `playwright-core` — adding it as a frontend devDependency would put a second, pre-release
 * playwright-core in the tree every CI `npm ci` installs and never uses. npx is the whole story.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACKAGE = '@playwright/mcp@0.0.79';

const SERVER_ARGS = ['--headless', '--no-sandbox', '--isolated'];
const DEFAULT_BROWSERS_ROOT = '/opt/pw-browsers';

/**
 * Locates the chromium Playwright should drive, or null to let it resolve its own.
 *
 * Pure — `env` and `exists` are injected so the decision is testable off this machine.
 *
 * @returns {string | null} the executable path to pass, or null to omit the flag
 */
export function resolveChromium(env, exists = existsSync) {
  const root = env.PLAYWRIGHT_BROWSERS_PATH;

  // Playwright reads `0` as "browsers live inside the package"; there is no root to join onto.
  if (root === '0') return null;

  const chromium = join(root || DEFAULT_BROWSERS_ROOT, 'chromium');
  return exists(chromium) ? chromium : null;
}

/** Builds the full npx argument list, with `--executable-path` only where it resolves. */
export function resolveArgs(env, exists = existsSync) {
  const chromium = resolveChromium(env, exists);
  const args = ['-y', PACKAGE, ...SERVER_ARGS];
  return chromium ? [...args, '--executable-path', chromium] : args;
}

function main() {
  const args = resolveArgs(process.env);

  if (!args.includes('--executable-path')) {
    console.error(
      'playwright-mcp: no chromium at the browsers root — letting Playwright resolve its own (#658).',
    );
  }

  // npx is a .cmd shim on Windows, which spawn cannot exec without a shell.
  const child = spawn('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });

  // Claude Code kills this launcher by pid; without forwarding, the real server outlives it.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    console.error(`playwright-mcp: failed to start npx: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

// Run directly only, so tests can import the resolvers; pathToFileURL because no Windows path matches a `file://` template.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
