import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { PACKAGE, resolveArgs, resolveChromium } from './playwright-mcp.mjs';

const IMAGE_ROOT = '/opt/pw-browsers';
const IMAGE_CHROMIUM = join(IMAGE_ROOT, 'chromium');

const present =
  (...paths) =>
  (path) =>
    paths.includes(path);

test('pins an exact version rather than a dist-tag npx must resolve every spawn', () => {
  assert.ok(PACKAGE.startsWith('@playwright/mcp@'));
  assert.doesNotMatch(PACKAGE, /@(latest|next)$/);
});

test('uses the cloud image chromium when no browsers root is configured', () => {
  assert.equal(resolveChromium({}, present(IMAGE_CHROMIUM)), IMAGE_CHROMIUM);
});

test('honours PLAYWRIGHT_BROWSERS_PATH over the image default', () => {
  const root = join('/custom', 'browsers');
  const chromium = join(root, 'chromium');

  assert.equal(
    resolveChromium({ PLAYWRIGHT_BROWSERS_PATH: root }, present(chromium, IMAGE_CHROMIUM)),
    chromium,
  );
});

test('omits the path when nothing is there — the Windows dev machine case (#658)', () => {
  assert.equal(resolveChromium({}, present()), null);
});

test('treats PLAYWRIGHT_BROWSERS_PATH=0 as "bundled in the package", not a directory', () => {
  // `0` is Playwright's own sentinel; joining `chromium` onto it would name a path that never exists.
  assert.equal(resolveChromium({ PLAYWRIGHT_BROWSERS_PATH: '0' }, present(IMAGE_CHROMIUM)), null);
});

test('falls back to the image default when the variable is set but empty', () => {
  assert.equal(
    resolveChromium({ PLAYWRIGHT_BROWSERS_PATH: '' }, present(IMAGE_CHROMIUM)),
    IMAGE_CHROMIUM,
  );
});

test('passes --executable-path with the server flags when chromium resolves', () => {
  const args = resolveArgs({}, present(IMAGE_CHROMIUM));

  assert.deepEqual(args, [
    '-y',
    PACKAGE,
    '--headless',
    '--no-sandbox',
    '--isolated',
    '--executable-path',
    IMAGE_CHROMIUM,
  ]);
});

test('drops only the path flag when chromium is absent, keeping the server flags', () => {
  const args = resolveArgs({}, present());

  assert.deepEqual(args, ['-y', PACKAGE, '--headless', '--no-sandbox', '--isolated']);
  assert.ok(!args.includes('--executable-path'));
});

test('never emits a bare --executable-path with no value after it', () => {
  for (const exists of [present(IMAGE_CHROMIUM), present()]) {
    const args = resolveArgs({}, exists);
    const flag = args.indexOf('--executable-path');

    if (flag !== -1) assert.ok(args[flag + 1] && !args[flag + 1].startsWith('--'));
  }
});
