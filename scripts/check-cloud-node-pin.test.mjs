/**
 * Detector coverage for `check-cloud-node-pin.mjs` (issue #659).
 *
 * The pass cases are the cheap half; the ones that earn the guard are the fail-closed cases below —
 * a renamed marker or a reformatted block must report a problem, not a silent pass, because the
 * failure this guard exists to catch is precisely a mirror nobody noticed had stopped mirroring.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { check, END, START } from './check-cloud-node-pin.mjs';

/** A doc whose recorded script pins `version`, naming it three times as the real one does. */
const doc = (version) =>
  [
    '# The cloud environment',
    '',
    'Prose about the setup script.',
    '',
    START,
    '',
    '```bash',
    `nvm install ${version}`,
    `nvm alias default ${version}`,
    `NODE_BIN="$NVM_DIR/versions/node/v${version}/bin"`,
    '```',
    '',
    END,
    '',
  ].join('\n');

test('a doc recording the pinned version passes, counting every place it appears', () => {
  const { problems, pinned, matched } = check('26.0.0\n', doc('26.0.0'));

  assert.deepEqual(problems, []);
  assert.equal(pinned, '26.0.0');
  assert.equal(matched, 3);
});

test('a doc left behind by an .nvmrc bump fails, naming both versions', () => {
  const { problems } = check('27.1.0\n', doc('26.0.0'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /records Node 26\.0\.0 but \.nvmrc pins 27\.1\.0/);
  assert.match(problems[0], /Setup script field/);
});

/** `v26.0.0` is the same pin as `26.0.0`, so the report says it once rather than twice. */
test('a v-prefixed token is read as the same version and deduplicated in the report', () => {
  const { problems } = check('27.0.0\n', [START, 'NODE_BIN=".../v26.0.0/bin"', END].join('\n'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /records Node 26\.0\.0 /);
});

test('one stale token among current ones still fails, and the rest still count as matched', () => {
  const { problems, matched } = check('26.0.0\n', [START, 'a 26.0.0', 'b 26.0.0', 'c 27.0.0', END].join('\n'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /records Node 27\.0\.0 /);
  assert.equal(matched, 2);
});

/**
 * `matched` counts tokens, while the reported stale list is deduplicated — so the count cannot be
 * derived by subtracting one from the other. It reads as a passing number on a failing run, which is
 * the #641 defect class in miniature: a guard reporting a total it did not earn.
 */
test('a stale token repeated does not inflate the matched count', () => {
  const doubled = [START, 'a 26.0.0', 'b 27.0.0', 'c 27.0.0', END].join('\n');

  assert.equal(check('26.0.0\n', doubled).matched, 1);
});

/** Prose is not the field's content; only what sits between the markers gets pasted into it. */
test('a version mentioned in prose outside the markers is not scanned', () => {
  const withProse = `The engine range is ^22.22.3 || >=26.0.0.\n${doc('26.0.0')}`;

  assert.deepEqual(check('26.0.0\n', withProse).problems, []);
});

test('a doc whose markers were renamed away fails closed rather than verifying nothing', () => {
  const { problems, matched } = check('26.0.0\n', '# The cloud environment\n\n```bash\nnvm install 26.0.0\n```\n');

  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not delimit the recorded setup script/);
  assert.equal(matched, 0);
});

test('markers in the wrong order fail closed', () => {
  const { problems } = check('26.0.0\n', [END, 'nvm install 26.0.0', START].join('\n'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not delimit the recorded setup script/);
});

test('a delimited block holding no version at all fails closed', () => {
  const { problems } = check('26.0.0\n', [START, '```bash', 'nvm install node', '```', END].join('\n'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /records no Node version between its markers/);
});

test('an unreadable doc fails, and says the setup script has no reviewable copy', () => {
  const { problems } = check('26.0.0\n', null);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /could not be read — the cloud setup script has no reviewable copy/);
});

test('an unreadable .nvmrc fails alongside whatever the doc says', () => {
  const { problems } = check(null, doc('26.0.0'));

  assert.equal(problems.length, 2);
  assert.match(problems[0], /\.nvmrc could not be read/);
});

test('an .nvmrc holding something other than x.y.z fails', () => {
  const { problems } = check('lts/*\n', doc('26.0.0'));

  assert.match(problems[0], /holds "lts\/\*", not an x\.y\.z version/);
});
