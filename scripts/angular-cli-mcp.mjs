#!/usr/bin/env node
/**
 * Launcher for the `angular-cli` MCP server declared in `.mcp.json`.
 *
 * Prefers the repo-local CLI (`frontend/node_modules/@angular/cli/bin/ng.js`) and falls back to
 * `npx -y @angular/cli@22`. The local path is what fixes #656: `npx` re-resolves the `@22` range
 * against registry.npmjs.org on every spawn, and at session start that round-trip loses the race
 * against Claude Code's 30s connect budget — a miss is not retried, so the server is gone for the
 * whole session. Spawning the binary already on disk takes ~0.8s and needs no network.
 *
 * The fallback is not decoration. `node_modules` is NOT guaranteed to exist when MCP servers
 * spawn: cloud sessions start from a fresh clone, the setup script (`web-setup.sh`) runs only
 * when no cached environment exists, and the SessionStart hook that installs deps
 * (`cloud-session-setup.sh`) runs *after* Claude Code launches. Without the fallback a cold cloud
 * VM would fail deterministically — worse than the bug being fixed.
 *
 * The project root comes from `CLAUDE_PROJECT_DIR`, which Claude Code sets in the spawned
 * server's environment precisely so paths need not depend on the working directory. It is absent
 * from Claude Code's own environment, so `${VAR}` expansion inside `.mcp.json` cannot see it —
 * it has to be read here, at runtime.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const localCli = join(projectDir, 'frontend', 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const useLocal = existsSync(localCli);

const command = useLocal ? process.execPath : 'npx';
const args = useLocal ? [localCli, 'mcp'] : ['-y', '@angular/cli@22', 'mcp'];

if (!useLocal) {
  console.error(`angular-cli-mcp: ${localCli} not found — falling back to npx (slower; see #656).`);
}

// npx is a .cmd shim on Windows, which spawn cannot exec without a shell.
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: !useLocal && process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(`angular-cli-mcp: failed to start ${command}: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
