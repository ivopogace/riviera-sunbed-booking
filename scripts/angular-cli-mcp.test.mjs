import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { resolveLauncher } from './angular-cli-mcp.mjs';

const ROOT = join('/repo');
const MODULES = join(ROOT, 'frontend', 'node_modules');
const CLI = join(MODULES, '@angular', 'cli', 'bin', 'ng.js');
const LOCKFILE = join(MODULES, '.package-lock.json');
const NODE = join('/usr', 'bin', 'node');

const present =
  (...paths) =>
  (path) =>
    paths.includes(path);

test('uses the repo-local CLI when the install is complete', () => {
  const { command, args, local } = resolveLauncher(ROOT, present(CLI, LOCKFILE), NODE);

  assert.equal(local, true);
  assert.equal(command, NODE);
  assert.deepEqual(args, [CLI, 'mcp']);
});

test('falls back to npx when node_modules is absent — the cold cloud VM case', () => {
  const { command, args, local } = resolveLauncher(ROOT, present(), NODE);

  assert.equal(local, false);
  assert.equal(command, 'npx');
  assert.deepEqual(args, ['-y', '@angular/cli@22', 'mcp']);
});

test('falls back to npx mid-install, when ng.js exists but the tree is not reified', () => {
  // The reproduced crash: ng.js unpacked, its MCP SDK dependency not yet, CLI exits 127.
  const { local, command } = resolveLauncher(ROOT, present(CLI), NODE);

  assert.equal(local, false);
  assert.equal(command, 'npx');
});

test('falls back to npx when the lockfile is present but the CLI is not', () => {
  const { local } = resolveLauncher(ROOT, present(LOCKFILE), NODE);

  assert.equal(local, false);
});

test('resolves paths under the given project root, not the working directory', () => {
  const other = join('/elsewhere');
  const seen = [];

  resolveLauncher(other, (path) => {
    seen.push(path);
    return false;
  }, NODE);

  assert.ok(seen.length > 0);
  assert.ok(seen.every((path) => path.startsWith(other)));
});
