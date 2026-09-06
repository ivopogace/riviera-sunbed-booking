import test from 'node:test';
import assert from 'node:assert/strict';

import { strip } from './check-comment-only.mjs';

test('a trimmed Javadoc block leaves the code identical', () => {
  const before = [
    '/**',
    ' * Counter: refunds shed because the pool was saturated (#404). Sits beside REFUNDS_FAILED and',
    ' * means something different: failed is a refund the gateway refused, shed is one it was never',
    ' * asked for. Do not sum them.',
    ' */',
    'public static final String REFUNDS_SHED = "riviera.refunds.shed";',
  ].join('\n');
  const after = [
    '/** Counter: refunds shed by a saturated pool. Distinct from REFUNDS_FAILED — do not sum them. */',
    'public static final String REFUNDS_SHED = "riviera.refunds.shed";',
  ].join('\n');

  assert.equal(strip(before), strip(after));
  assert.equal(strip(after), 'public static final String REFUNDS_SHED = "riviera.refunds.shed";');
});

test('a changed string literal is NOT reported as comment-only', () => {
  const before = 'String metric = "riviera.refunds.shed"; // the shed counter';
  const after = 'String metric = "riviera.refunds.failed";';

  assert.notEqual(strip(before), strip(after));
});

test('a `//` inside a string literal is code, not a comment', () => {
  assert.equal(strip('String url = "https://example.com/a";'), 'String url = "https://example.com/a";');
});

test('a `/*` inside a string literal does not open a comment', () => {
  const src = ['String glob = "/*";', 'int kept = 1;'].join('\n');

  assert.equal(strip(src), ['String glob = "/*";', 'int kept = 1;'].join('\n'));
});

test('comment markers inside a Java text block are preserved', () => {
  const src = ['String sql = """', '    SELECT 1 -- not stripped', '    /* nor this */', '    """;'].join('\n');

  assert.equal(strip(src), ['String sql = """', 'SELECT 1 -- not stripped', '/* nor this */', '""";'].join('\n'));
});

test('whitespace and blank-line churn is normalized away', () => {
  assert.equal(strip('  int   a = 1;\n\n\n  int b = 2;'), 'int a = 1;\nint b = 2;');
});

test('deleting an entire comment block leaves nothing behind', () => {
  assert.equal(strip('/**\n * gone\n */\n'), '');
  assert.equal(strip('// gone\n'), '');
});

test('a trailing comment is removed without touching the code before it', () => {
  assert.equal(strip('int a = 1; // why'), 'int a = 1;');
});

test('a `/` inside a regex character class does not open a block comment', () => {
  const src = ['const re = /[/*]/;', 'const kept = 1;'].join('\n');

  assert.equal(strip(src), ['const re = /[/*]/;', 'const kept = 1;'].join('\n'));
});

test('an escaped slash in a regex does not end it early', () => {
  assert.equal(strip('const re = /a\\/\\*b/; const kept = 2;'), 'const re = /a\\/\\*b/; const kept = 2;');
});

test('a regex after `return` is a literal, not a division', () => {
  assert.equal(strip('return /[/]/.test(s); // why'), 'return /[/]/.test(s);');
});

test('division is still division, so a following line comment is still stripped', () => {
  assert.equal(strip('const half = total / 2; // halve it'), 'const half = total / 2;');
  assert.equal(strip('const r = (a + b) / c; // ratio'), 'const r = (a + b) / c;');
});

test('a `//` inside an unquoted CSS url() is code, not a comment', () => {
  const src = ['.a { background: url(http://example.com/a.png) no-repeat; }', '.b { color: red; }'].join('\n');

  assert.equal(strip(src), src);
});

test('a quoted CSS url() still round-trips through the string handler', () => {
  assert.equal(
    strip('.a { background: url("http://example.com/a.png"); }'),
    '.a { background: url("http://example.com/a.png"); }',
  );
});

test('a real change on an unquoted url() line is NOT reported as comment-only', () => {
  const before = '.a { background: url(http://example.com/a.png) no-repeat; }';
  const after = '.a { background: url(http://example.com/b.png) no-repeat; }';

  assert.notEqual(strip(before), strip(after));
});

const inlineTemplate = (...rows) =>
  ['@Component({', '  template: `', ...rows, '    <p>hi</p>', '  `,', '})', 'export class Probe {}'].join('\n');

test('an HTML comment inside an inline Angular template is a comment', () => {
  const before = inlineTemplate('    <!-- Above the @if on purpose: a live region must outlive its branch. -->');
  const twoLine = inlineTemplate('    <!-- Above the @if on purpose:', '         a live region must outlive its branch. -->');

  assert.equal(strip(before, '.ts'), strip(inlineTemplate(), '.ts'));
  assert.equal(strip(twoLine, '.ts'), strip(inlineTemplate(), '.ts'));
});

test('a changed element inside an inline Angular template is still a code change', () => {
  assert.notEqual(strip(inlineTemplate('    <p>one</p>'), '.ts'), strip(inlineTemplate('    <p>two</p>'), '.ts'));
});

test('an HTML comment inside any other template literal is code', () => {
  const fixture = (comment) => ['const fixture = `', `  ${comment}`, '  <p>hi</p>', '`;'].join('\n');

  assert.notEqual(strip(fixture('<!-- a -->'), '.ts'), strip(fixture('<!-- b -->'), '.ts'));
  assert.notEqual(strip(fixture('<!-- a -->'), '.ts'), strip(fixture(''), '.ts'));
});

/**
 * A comment ends the line the way the code after it sees it: `template:` at column zero after a
 * `//` line is still the key, not the tail of the word the comment interrupted.
 */
test('a comment before `template:` does not fuse it with the code before the comment', () => {
  const body = ['  <!-- gone -->', '  <p>hi</p>', '`;'];
  const afterLine = ['x = b// c', 'template: `', ...body].join('\n');
  const afterBlock = ['x = b/* c', '*/template: `', ...body].join('\n');
  const bare = ['x = b', 'template: `', '  <p>hi</p>', '`;'].join('\n');

  assert.equal(strip(afterLine, '.ts'), strip(bare, '.ts'));
  assert.equal(strip(afterBlock, '.ts'), strip(bare, '.ts'));
});

test('a `template:` key outside TypeScript keeps its HTML comment as string content', () => {
  const config = (comment) => ['const config = {', '  template: `', `    ${comment}`, '    <p>hi</p>', '  `,', '};'].join('\n');

  assert.notEqual(strip(config('<!-- a -->'), '.mjs'), strip(config('<!-- b -->'), '.mjs'));
  assert.notEqual(strip(config('<!-- a -->'), '.js'), strip(config(''), '.js'));
  assert.notEqual(strip(config('<!-- a -->')), strip(config('')));
});

test('a key that merely ends in `template` does not open an inline template', () => {
  const fixture = (comment) => ['const fixture = {', `  xtemplate: \`${comment}\`,`, '};'].join('\n');

  assert.notEqual(strip(fixture('<!-- a -->'), '.ts'), strip(fixture('<!-- b -->'), '.ts'));
});

test('an interpolation inside an inline template is code, even when it carries `<!--`', () => {
  assert.notEqual(
    strip(inlineTemplate('    <p>${label("<!-- old -->")}</p>'), '.ts'),
    strip(inlineTemplate('    <p>${label("<!-- new -->")}</p>'), '.ts'),
  );
  assert.equal(
    strip(inlineTemplate('    <p>${cond ? `a` : `b`}</p>', '    <!-- gone -->'), '.ts'),
    strip(inlineTemplate('    <p>${cond ? `a` : `b`}</p>'), '.ts'),
  );
});
