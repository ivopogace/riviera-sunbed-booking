import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import templateParser from '@angular-eslint/template-parser';
import { ESLint, RuleTester } from 'eslint';

import rule from './prefer-output-over-status-role.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: templateParser },
});

ruleTester.run('prefer-output-over-status-role', rule, {
  valid: [
    '<output class="sr-only" aria-live="polite">Loading…</output>',
    '<p role="alert">Something went wrong.</p>',
    '<p role="region" aria-label="Beach map">…</p>',
    '<p>No role at all.</p>',
    '<div [attr.role]="labelled() ? \'region\' : null">…</div>',
  ],
  invalid: [
    {
      code: '<p class="sr-only" role="status" aria-live="polite">{{ message() }}</p>',
      errors: [{ messageId: 'preferOutput', line: 1, column: 1 }],
    },
    {
      code: ['<section>', '  <p role="status">{{ notice() }}</p>', '</section>'].join('\n'),
      errors: [{ messageId: 'preferOutput', line: 2, column: 3 }],
    },
    {
      code: '<div [attr.role]="\'status\'">{{ notice() }}</div>',
      errors: [{ messageId: 'preferOutput', line: 1, column: 1 }],
    },
    {
      code: '<div [role]="\'status\'">{{ notice() }}</div>',
      errors: [{ messageId: 'preferOutput', line: 1, column: 1 }],
    },
  ],
});

/**
 * The exemption door, proved through the real ESLint API rather than `RuleTester`, which
 * registers a rule under a `rule-to-test/` name of its own and so cannot see the directive
 * spelling a component actually writes. Both wrapper regions the sweep left alone depend on this
 * working inside an inline template, so it is pinned rather than assumed.
 */
describe('the eslint-disable door', () => {
  const REGION = '<div role="status"><p>A wrapper that outlives its paragraph.</p></div>';

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.html'],
        languageOptions: { parser: templateParser },
        plugins: { riviera: { rules: { 'prefer-output-over-status-role': rule } } },
        rules: { 'riviera/prefer-output-over-status-role': 'error' },
      },
    ],
  });

  const lint = async (code) => {
    const [result] = await eslint.lintText(code, { filePath: 'probe.html' });
    return result.messages;
  };

  it('reports the region when nothing suppresses it', async () => {
    const messages = await lint(REGION);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, 'riviera/prefer-output-over-status-role');
  });

  it('stays silent above a multi-line open tag, the shape both exemptions use', async () => {
    const messages = await lint(
      [
        '<!-- eslint-disable-next-line riviera/prefer-output-over-status-role -->',
        '<div',
        '  role="status"',
        '  class="flex items-start gap-3"',
        '>',
        '  <p>Your account is awaiting approval.</p>',
        '</div>',
      ].join('\n'),
    );

    assert.deepEqual(messages, []);
  });

  it('stays silent behind a disable comment naming the rule', async () => {
    const messages = await lint(
      `<!-- eslint-disable-next-line riviera/prefer-output-over-status-role -->\n${REGION}`,
    );

    assert.deepEqual(messages, []);
  });
});
