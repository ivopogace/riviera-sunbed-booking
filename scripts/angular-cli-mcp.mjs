/**
 * Launcher for the `angular-cli` MCP server declared in `.mcp.json`.
 *
 * Prefers the repo-local CLI (`frontend/node_modules/@angular/cli/bin/ng.js`) and falls back to
 * `npx -y @angular/cli@22`. The local path is what fixes #656: `npx` re-resolves the `@22` range
 * against registry.npmjs.org on every spawn, and at session start that round-trip loses the race
 * against Claude Code's connect budget — a miss is not retried, so the server is gone for the
 * whole session. Spawning the binary already on disk takes ~0.8s and needs no network.
 *
 * The fallback carries the cloud case, where it is the ONLY path that works. Cloud sessions
 * install frontend deps from the `cloud-session-setup.sh` SessionStart hook, which by definition
 * runs after Claude Code launches — so at MCP-spawn time on a cold VM `node_modules` does not
 * exist yet. Without the fallback a fresh cloud session would fail deterministically, which is
 * worse than the bug this fixes.
 *
 * Readiness is judged by npm's hidden lockfile, not by `ng.js` alone: npm writes
 * `node_modules/.package-lock.json` only once the tree is fully reified, so a concurrent install
 * that has already unpacked `ng.js` but not its dependencies is correctly read as not-ready. That
 * exact half-installed state otherwise crashes the CLI on a missing MCP SDK, and crashing is
 * strictly worse than taking npx.
 *
 * The project root comes from `CLAUDE_PROJECT_DIR`, which Claude Code sets in the spawned
 * server's environment precisely so paths need not depend on the working directory. It is absent
 * from Claude Code's own environment, so `${VAR}` expansion inside `.mcp.json` cannot see it —
 * it has to be read here, at runtime.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NPX_ARGS = ['-y', '@angular/cli@22', 'mcp'];

/**
 * Decide how to start the server. Pure — `exists` is injected so the decision is testable without
 * a filesystem, and `execPath` so the expected command is not the test runner's own binary.
 */
export function resolveLauncher(projectDir, exists = existsSync, execPath = process.execPath) {
  const modules = join(projectDir, 'frontend', 'node_modules');
  const cli = join(modules, '@angular', 'cli', 'bin', 'ng.js');
  const installed = exists(cli) && exists(join(modules, '.package-lock.json'));
  return installed
    ? { command: execPath, args: [cli, 'mcp'], local: true }
    : { command: 'npx', args: NPX_ARGS, local: false };
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const { command, args, local } = resolveLauncher(projectDir);

  if (!local) {
    console.error(`angular-cli-mcp: no complete install under ${projectDir} — using npx (#656).`);
  }

  // npx is a .cmd shim on Windows, which spawn cannot exec without a shell.
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: !local && process.platform === 'win32',
  });

  // Claude Code kills this launcher by pid; without forwarding, the real server outlives it.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    console.error(`angular-cli-mcp: failed to start ${command}: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

// Run directly only, so tests can import the resolver; pathToFileURL because no Windows path matches a `file://` template.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
