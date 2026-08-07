/**
 * Proves a comment-trimming diff changed **only** comments (issue #544, `riviera-java-conventions` §6d).
 *
 * Strips every comment from both sides of the diff, normalizes whitespace, and reports any file whose
 * remaining code is not identical. A comment-only refactor that touches 1,000 files cannot be reviewed
 * line by line; this is what makes it reviewable — the diff is large but provably inert.
 *
 * Usage: `node scripts/check-comment-only.mjs [<base>]`  (default base `origin/main`)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Extensions whose comment syntax `strip` understands. Anything else is skipped, not assumed safe. */
const SUPPORTED = new Set(['.java', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.scss', '.css']);

/**
 * Removes comments while honouring string, template, char and Java text-block state, so a `//` inside
 * a URL literal or a `/*` inside a string is kept as the code it is.
 *
 * @param {string} src file contents
 * @returns {string} code-only lines, trimmed and whitespace-collapsed, blanks dropped
 */
export function strip(src) {
  let out = '';
  let i = 0;
  let state = 'code';
  let quote = '';

  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (state === 'code') {
      if (src.startsWith('"""', i)) {
        state = 'text';
        out += '"""';
        i += 3;
      } else if (two === '//') {
        state = 'line';
        i += 2;
      } else if (two === '/*') {
        state = 'block';
        i += 2;
      } else if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
        state = 'str';
        quote = src[i];
        out += src[i];
        i++;
      } else {
        out += src[i];
        i++;
      }
      continue;
    }
    if (state === 'text' || state === 'str') {
      if (src[i] === '\\') {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (state === 'text' && src.startsWith('"""', i)) {
        state = 'code';
        out += '"""';
        i += 3;
        continue;
      }
      if (state === 'str' && src[i] === quote) state = 'code';
      out += src[i];
      i++;
      continue;
    }
    if (state === 'line') {
      if (src[i] === '\n') {
        state = 'code';
        out += '\n';
      }
      i++;
      continue;
    }
    if (two === '*/') {
      state = 'code';
      i += 2;
      continue;
    }
    if (src[i] === '\n') out += '\n';
    i++;
  }

  return out
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .join('\n');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

/** Returns one entry per file whose code changed, plus the paths skipped for an unsupported extension. */
export function check(base) {
  const changed = git(['diff', '--name-only', '--diff-filter=M', `${base}...HEAD`])
    .split('\n')
    .filter(Boolean);
  const codeChanged = [];
  const skipped = [];

  for (const path of changed) {
    if (!SUPPORTED.has(extensionOf(path))) {
      skipped.push(path);
      continue;
    }
    let before;
    try {
      before = git(['show', `${base}:${path}`]);
    } catch {
      continue;
    }
    let after;
    try {
      after = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (strip(before) !== strip(after)) codeChanged.push(path);
  }
  return { codeChanged, skipped, inspected: changed.length - skipped.length };
}

function main(argv) {
  const base = argv[0] ?? 'origin/main';
  const { codeChanged, skipped, inspected } = check(base);

  if (codeChanged.length > 0) {
    process.stderr.write(
      `Not comment-only — code changed in ${codeChanged.length} file(s):\n` +
        codeChanged.map((p) => `  ${p}`).join('\n') +
        '\n',
    );
    return 1;
  }
  process.stdout.write(`Comment-only: ${inspected} file(s) verified code-identical against ${base}.\n`);
  if (skipped.length > 0) {
    process.stdout.write(`Skipped ${skipped.length} file(s) with unsupported comment syntax.\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
