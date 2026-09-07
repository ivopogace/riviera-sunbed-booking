import test from 'node:test';
import assert from 'node:assert/strict';

import { findViolations } from './check-inline-comments.mjs';

const JAVA = 'platform/src/main/java/ai/riviera/platform/SecurityConfig.java';

/** The one-line rule's own findings; the fixtures below also carry issue numbers, a separate rule. */
const multiline = (violations) => violations.filter((v) => v.rule === 'multiline');

/**
 * The block PR #521 shortened to one line and PR #522 re-broke days later, verbatim from
 * commit 7d89c0b (fixed in d4b034d). Issue #529 names it as the guard's first proof case.
 */
const SECURITY_CONFIG_HUNK = [
  '\t\t\t\t\t\t// Venue-photo moderation (#504 takedown, #511 read) — ADMIN only; any venue, owned or not.',
  '\t\t\t\t\t\t.requestMatchers(HttpMethod.GET, ADMIN_VENUE_PHOTOS_PATH).hasRole(ADMIN_ROLE)',
  '\t\t\t\t\t\t.requestMatchers(HttpMethod.DELETE, ADMIN_VENUE_PHOTO_PATH).hasRole(ADMIN_ROLE)',
  '\t\t\t\t\t\t// Venue commission rates (A7 #348) — ADMIN only; the platform sets the commercial',
  '\t\t\t\t\t\t// term, not the venue (rationale on the constants).',
  '\t\t\t\t\t\t.requestMatchers(HttpMethod.GET, ADMIN_VENUE_COMMISSIONS_PATH).hasRole(ADMIN_ROLE)',
];

test('flags the SecurityConfig two-line matcher block (#522)', () => {
  const violations = findViolations({
    path: JAVA,
    lines: SECURITY_CONFIG_HUNK,
    added: new Set([4, 5, 6]),
  });

  assert.equal(multiline(violations).length, 1);
  assert.equal(violations[0].path, JAVA);
  assert.equal(violations[0].line, 4);
  assert.equal(violations[0].endLine, 5);
});

const SCSS = 'frontend/src/app/pages/home/home.scss';

test('flags a two-line block comment in SCSS', () => {
  const violations = findViolations({
    path: SCSS,
    lines: [
      ':root {',
      '  /* 0.85 (design: 0.7): the chip backs the accent ink over ANY cover photo since #142,',
      '     so the worst case is a pure-white photo rather than the gradient light stop. */',
      '  --riv-chip-glass: rgba(255, 255, 255, 0.85);',
      '}',
    ],
    added: new Set([2, 3, 4]),
  });

  assert.equal(multiline(violations).length, 1);
  assert.equal(multiline(violations)[0].line, 2);
  assert.equal(multiline(violations)[0].endLine, 3);
});

test('exempts Javadoc and TSDoc doc comments', () => {
  const javadoc = findViolations({
    path: JAVA,
    lines: [
      'class SecurityConfig {',
      '\t/**',
      '\t * The platform-admin commission surface (A7, epic #348) — the venues-with-commission',
      '\t * list and the rate write. Same ADMIN gate and the same {@code /api/admin/**} exemption',
      '\t * from invariant #13 as the photo moderation paths above, and for the same reason: an',
      '\t * admin does not <em>own</em> a rate, so object-level authorization has nothing to check.',
      '\t */',
      '\tprivate static final String ADMIN_VENUE_COMMISSIONS_PATH = "/api/admin/venues";',
      '}',
    ],
    added: new Set([2, 3, 4, 5, 6, 7, 8]),
  });
  assert.deepEqual(multiline(javadoc), []);

  const tsdoc = findViolations({
    path: 'frontend/src/app/operator/commissions-tab.ts',
    lines: [
      'export class CommissionsTab {',
      '  /**',
      '   * Splices the rate write response back into the list this component holds.',
      '   * The PUT answers the same object shape as a list element, so one type covers both.',
      '   */',
      '  apply(rate: VenueCommission): void {}',
      '}',
    ],
    added: new Set([2, 3, 4, 5, 6]),
  });
  assert.deepEqual(tsdoc, []);
});

test('exempts a block comment standing before any code as the file header', () => {
  const violations = findViolations({
    path: SCSS,
    lines: [
      '/*',
      ' * Liquid Glass design tokens (issue #134, design: the v2 tourist export, superseded',
      ' * in-repo by docs/design/riviera-sunbeds-liquid-glass-v3.dc.html).',
      ' */',
      ':root {',
      '  --riv-header-border: rgba(255, 255, 255, 0.22);',
      '}',
    ],
    added: new Set([1, 2, 3, 4, 5, 6, 7]),
  });

  assert.deepEqual(multiline(violations), []);
});

test('passes one-line comments', () => {
  const allAdded = (lines) => new Set(lines.map((_, i) => i + 1));

  const java = [
    '\t\t\t\t\t\t// Venue-photo moderation (#504 takedown, #511 read) — ADMIN only.',
    '\t\t\t\t\t\t.requestMatchers(HttpMethod.GET, ADMIN_VENUE_PHOTOS_PATH).hasRole(ADMIN_ROLE)',
    '\t\t\t\t\t\t// The admin audit trail (#507) — same ADMIN gate.',
    '\t\t\t\t\t\t.requestMatchers(HttpMethod.GET, ADMIN_AUDIT_PATH).hasRole(ADMIN_ROLE)',
    '\t\t\t\t\t\tint bps = 250; // basis points, not percent',
  ];
  assert.deepEqual(multiline(findViolations({ path: JAVA, lines: java, added: allAdded(java) })), []);

  const scss = ['  /* 0.66 (design: 0.5): AA on the porcelain header glass. */', '  --riv-ink: #0c2a33;'];
  assert.deepEqual(findViolations({ path: SCSS, lines: scss, added: allAdded(scss) }), []);

  const html = ['<!-- The availability bar is decorative and text-free. -->', '<div class="bar"></div>'];
  assert.deepEqual(
    findViolations({ path: 'frontend/src/app/venue/venue-page.html', lines: html, added: allAdded(html) }),
    [],
  );
});

test('flags a multi-line HTML comment in a template', () => {
  const lines = [
    '<section>',
    '  <!-- The scrim sits in the lower tenth of the photo so white ink clears AA',
    '       over any cover photo. -->',
    '  <img [ngSrc]="cover" />',
    '</section>',
  ];

  const violations = findViolations({
    path: 'frontend/src/app/venue/venue-page.html',
    lines,
    added: new Set([2, 3]),
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].endLine, 3);
});

test('does not treat comment markers inside string literals as comments', () => {
  const lines = [
    'class MockSsoGateway {',
    '\tprivate static final String IDP = "https://idp.example.com/authorize";',
    '\tprivate static final String CALLBACK = "https://riviera.example/api/auth/sso/callback";',
    '\tprivate static final String GLOB = "/**/*.java";',
    '\tprivate static final String SQL = """',
    '\t\t\tSELECT commission_bps FROM venue_commission_rate -- the effective-dated schedule',
    '\t\t\tWHERE venue_id = ? // still inside the text block',
    '\t\t\t""";',
    '}',
  ];

  const violations = findViolations({
    path: JAVA,
    lines,
    added: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]),
  });

  assert.deepEqual(violations, []);
});

test('reports nothing when a diff adds no lines', () => {
  const violations = findViolations({
    path: JAVA,
    lines: SECURITY_CONFIG_HUNK,
    added: new Set(),
  });

  assert.deepEqual(violations, []);
});

test('ignores files whose comment syntax is out of scope', () => {
  const sql = [
    '-- The rate schedule (A7 #348). Forward-only: a change pins the rate it supersedes',
    '-- at the epoch floor, so no past service date re-prices (invariant #9).',
    'CREATE TABLE venue_commission_rate (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY);',
  ];
  assert.deepEqual(
    findViolations({ path: 'platform/src/main/resources/db/migration/V39__x.sql', lines: sql, added: new Set([1, 2, 3]) }),
    [],
  );

  const yaml = ['# Normalize frontend lcov paths to repo root so coverage maps', '# under the single Sonar project.', 'run: ./normalize.sh'];
  assert.deepEqual(
    findViolations({ path: '.github/workflows/ci.yml', lines: yaml, added: new Set([1, 2, 3]) }),
    [],
  );
});

test('does not blame a pre-existing block for one newly added one-liner', () => {
  const lines = [
    '// preexisting line1 of an old, established block',
    '// preexisting line2',
    '// preexisting line3',
    '// NEW: a fresh, perfectly one-line comment about the call below',
    'doSomething();',
  ];

  const violations = findViolations({ path: 'frontend/src/app/x.ts', lines, added: new Set([4]) });

  assert.deepEqual(violations, []);
});

test('does not flag a pre-existing block comment whose opening line the diff never wrote', () => {
  const lines = [
    ':root {',
    '  /* The scrim reaches alpha 0.68 at its three-quarter stop: the location overlay',
    '     needs that backing for white ink to clear AA over ANY cover photo. */',
    '  --riv-photo-scrim: rgba(6, 26, 33, 0.68);',
    '}',
  ];

  const violations = findViolations({ path: SCSS, lines, added: new Set([3]) });

  assert.deepEqual(violations, []);
});

test('treats a multi-line template literal as string content, not comments', () => {
  const lines = [
    'const sql = `select 1',
    '// not a comment, just template literal content',
    '// still template literal content',
    'from dual`;',
  ];

  const violations = findViolations({
    path: 'frontend/src/app/x.ts',
    lines,
    added: new Set([1, 2, 3, 4]),
  });

  assert.deepEqual(violations, []);
});

test('keeps a Java text block open across an escaped triple quote', () => {
  const lines = [
    'String s = """',
    '    a literal has \\""" inside it, and the block is still open',
    '    // this line is still text-block content, not a comment',
    '    // and so is this one',
    '    """;',
  ];

  const violations = findViolations({ path: JAVA, lines, added: new Set([1, 2, 3, 4, 5]) });

  assert.deepEqual(violations, []);
});

/**
 * A backtick that OPENS a template literal as the last character of its line was read as one that
 * closed it: the scan started past the backtick, ran off the end and returned `line.length`, and the
 * character before that index was the opening backtick itself. The scanner's template state then
 * inverted for the rest of the file — the literal's body read as code and the code after it read as
 * a literal, hiding every comment there. `skipTemplate` answers with a `closed` flag for this reason.
 *
 * <p>Not a corner: `template: \`` on its own line is how 44 components under `frontend/src/app` are
 * written, so this is a false clean over a large part of the tree the guard gates. Found by the
 * CLI harness on its first day.
 */
test('a template literal opened at end of line does not invert the scanner (#619)', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    <p>Pricing</p>',
    '  `,',
    '})',
    'export class PricingTab {',
    '  rate = 1; /* the commission, in basis points —',
    '     set per venue */',
    '}',
  ];

  const violations = findViolations({ path: 'frontend/src/app/x.ts', lines, added: new Set([7, 8]) });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 7);
  assert.equal(violations[0].endLine, 8);
});

test('an empty template literal at end of line is still closed', () => {
  const lines = [
    'const empty = ``;',
    'const rate = 1; /* the commission, in basis points —',
    '   set per venue */',
  ];

  const violations = findViolations({ path: 'frontend/src/app/x.ts', lines, added: new Set([2, 3]) });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
});

/** A Javadoc block whose last prose line cites an issue number; lines 2–6 are the block. */
const JAVADOC_WITH_PROVENANCE = [
  'class CommissionRates {',
  '\t/**',
  '\t * The platform-admin commission surface: the venues-with-commission list and the',
  '\t * rate write. Same ADMIN gate as the photo moderation paths, and for the same reason: an',
  '\t * admin does not own a rate, so object-level authorization has nothing to check (#348).',
  '\t */',
  '\tprivate static final String ADMIN_VENUE_COMMISSIONS_PATH = "/api/admin/venues";',
  '}',
];

test('judges a touched Javadoc block whole: a provenance tell on a line the diff never wrote', () => {
  const violations = findViolations({
    path: JAVA,
    lines: JAVADOC_WITH_PROVENANCE,
    added: new Set([3]),
  });

  assert.deepEqual(
    violations.map(({ line, endLine, rule }) => ({ line, endLine, rule })),
    [{ line: 5, endLine: 5, rule: 'provenance' }],
  );
});

test('never reads an untouched doc comment', () => {
  const violations = findViolations({
    path: JAVA,
    lines: JAVADOC_WITH_PROVENANCE,
    added: new Set([7]),
  });

  assert.deepEqual(violations, []);
});

test('flags a provenance tell in an added skill line, not inside a fence or a code span', () => {
  const lines = [
    '# Riviera local debug',
    '',
    'The guards fetch their base themselves since #952, so `--diff origin/main` is correct as typed.',
    '',
    '```css',
    'background: #333;',
    '```',
    '',
    'A colour token is written as `#333` in a span.',
  ];
  const violations = findViolations({
    path: '.claude/skills/riviera-local-debug/SKILL.md',
    lines,
    added: new Set(lines.map((_, i) => i + 1)),
  });

  assert.deepEqual(
    violations.map(({ line, rule }) => ({ line, rule })),
    [{ line: 3, rule: 'provenance' }],
  );
});

test('markdown outside SKILL.md and references/ is out of scope', () => {
  const lines = ['- issue #134: "Dark theme option"'];
  const added = new Set([1]);

  assert.deepEqual(findViolations({ path: '.claude/skills/triage/OUT-OF-SCOPE.md', lines, added }), []);
  assert.deepEqual(findViolations({ path: 'docs/adr/0001-record-architecture-decisions.md', lines, added }), []);
  assert.notDeepEqual(
    findViolations({ path: '.claude/skills/riviera-modulith/references/events.md', lines, added }),
    [],
  );
});

test('a design artboard is out of scope, so its as-built pointer may cite the issue; its support scripts are not', () => {
  const lines = ['<!-- as-built diverges — see #1003: the phone hamburger is a bottom tab bar now -->'];
  const added = new Set([1]);

  assert.deepEqual(
    findViolations({ path: 'docs/design/riviera-sunbeds-liquid-glass-v3.dc.html', lines, added }),
    [],
  );
  assert.notDeepEqual(findViolations({ path: 'frontend/src/app/app.html', lines, added }), []);
  const script = ['// see #1003'];
  assert.notDeepEqual(findViolations({ path: 'docs/design/support.js', lines: script, added }), []);
});

test('reports history phrasing under its own rule, so the CLI can advise rather than gate', () => {
  const lines = [
    '/**',
    ' * Resolves the base by fetching it. It no longer trusts a session-old tracking ref.',
    ' */',
    'export function resolveBase(ref) {}',
  ];
  const violations = findViolations({
    path: 'scripts/git-diff.mjs',
    lines,
    added: new Set([2]),
  });

  assert.deepEqual(
    violations.map(({ line, rule }) => ({ line, rule })),
    [{ line: 2, rule: 'history' }],
  );
});

test('never reads the code after a block comment closes on the same line', () => {
  const violations = findViolations({
    path: JAVA,
    lines: ['  /* note */ String s = "issue 342 filed";', '/** opens', ' * closes */ String t = "see PR #521";'],
    added: new Set([1, 2, 3]),
  });

  assert.deepEqual(violations, []);
});

test('a bare issue number counts only in a citing position, so a colour is left to review', () => {
  const at = (path, line) =>
    findViolations({ path, lines: [line], added: new Set([1]) }).map((v) => v.rule);

  assert.deepEqual(at(SCSS, '// border color: #123 for emphasis'), []);
  assert.deepEqual(at(JAVA, '/** Falls back to #123 opacity when unset. */'), []);
  assert.deepEqual(at(JAVA, '// the admin gate (#348), same as the photo paths'), ['provenance']);
  assert.deepEqual(at(JAVA, '// the #413/#420 failure, paid for once'), ['provenance']);
  assert.deepEqual(at(JAVA, '/** Rate write, epic #348. */'), ['provenance']);
  assert.deepEqual(at('frontend/src/app/x.ts', '// issue 529 names it as the first proof case'), ['provenance']);
});

test('a comment opener is not a citing slash, and a generic word is not a citing word', () => {
  const at = (line) =>
    findViolations({ path: JAVA, lines: [line], added: new Set([1]) }).map((v) => v.rule);

  assert.deepEqual(at('// the #123 emphasis colour'), []);
  assert.deepEqual(at('// returns the #404 error and the #500 fallback'), []);
  assert.deepEqual(at('/** Mirrors the #401 vs #403 split. */'), []);
  assert.deepEqual(at('// fixed by #618, see #619'), ['provenance']);
  assert.deepEqual(at('// the #413/#420 failure, paid for once'), ['provenance']);
  assert.deepEqual(at('// closed in #952 with a shared resolver'), ['provenance']);
});

/** The issue's own probe: an inline Angular template whose HTML comment breaks both gating rules. */
const INLINE_TEMPLATE = [
  '@Component({',
  "  selector: 'app-probe',",
  '  template: `',
  '    <!-- A deliberately multi-line HTML comment inside an Angular inline template',
  '         that also carries provenance (#923) to see whether the guard scans it. -->',
  '    <p>hi</p>',
  '  `,',
  '})',
  'export class Probe {}',
];

test('flags a multi-line HTML comment inside an inline Angular template', () => {
  const violations = findViolations({
    path: 'frontend/src/app/probe.ts',
    lines: INLINE_TEMPLATE,
    added: new Set(INLINE_TEMPLATE.map((_, i) => i + 1)),
  });

  assert.deepEqual(
    multiline(violations).map(({ line, endLine }) => ({ line, endLine })),
    [{ line: 4, endLine: 5 }],
  );
});

test("reports provenance inside an inline Angular template's HTML comment", () => {
  const violations = findViolations({
    path: 'frontend/src/app/probe.ts',
    lines: INLINE_TEMPLATE,
    added: new Set([5]),
  });

  assert.deepEqual(
    violations.map(({ line, rule }) => ({ line, rule })),
    [{ line: 5, rule: 'provenance' }],
  );
});

test('a template literal that is not an inline template keeps its HTML comment as string content', () => {
  const lines = [
    'const fixture = `',
    '  <!-- a two-line HTML comment in a spec fixture',
    '       is test data, not a comment -->',
    '`;',
  ];

  const violations = findViolations({
    path: 'frontend/src/app/probe.spec.ts',
    lines,
    added: new Set([1, 2, 3, 4]),
  });

  assert.deepEqual(violations, []);
});

test('the code after an inline template closes is still scanned', () => {
  const lines = [
    ...INLINE_TEMPLATE.slice(0, 8),
    'export class Probe {',
    '  rate = 1; /* the commission, in basis points —',
    '     set per venue */',
    '}',
  ];

  const violations = findViolations({ path: 'frontend/src/app/probe.ts', lines, added: new Set([10, 11]) });

  assert.deepEqual(
    violations.map(({ line, endLine, rule }) => ({ line, endLine, rule })),
    [{ line: 10, endLine: 11, rule: 'multiline' }],
  );
});

test('a bare issue number opening the comment is a citing position', () => {
  const at = (path, line) =>
    findViolations({ path, lines: [line], added: new Set([1]) }).map((v) => v.rule);

  assert.deepEqual(at(JAVA, "// #923's widget pushed Review past a phone's height."), ['provenance']);
  assert.deepEqual(at(SCSS, '// #123 is the emphasis colour'), ['provenance'], 'a colour opening a comment is the accepted cost');
  assert.deepEqual(at(JAVA, '/** #795 AC-8: a same-day booking reports its CLOSED birth window. */'), ['provenance']);
  assert.deepEqual(at('frontend/src/app/x.ts', '  <!-- #741: the announcer must outlive the branch it describes. -->'), []);
  assert.deepEqual(at('frontend/src/app/x.html', '  <!-- #741: the announcer must outlive the branch it describes. -->'), ['provenance']);
  assert.deepEqual(at(JAVA, '// returns the #404 error and the #500 fallback'), []);
  assert.deepEqual(at(SCSS, '// border color: #123 for emphasis'), []);
  assert.deepEqual(at(JAVA, '// #12 is two digits, not an issue'), []);
  assert.deepEqual(at(JAVA, '// #12345 is five digits, not an issue'), []);
});

test('a doc-comment line that opens with an issue number is provenance', () => {
  const lines = [
    'class Sweep {',
    '\t/**',
    '\t * Sweeps the abandoned bookings.',
    '\t * #373 handed the sweep the whole record, so its cutoff and the mailed deadline share one source.',
    '\t */',
    '\tvoid sweep() {}',
    '}',
  ];

  const violations = findViolations({ path: JAVA, lines, added: new Set([3]) });

  assert.deepEqual(
    violations.map(({ line, rule }) => ({ line, rule })),
    [{ line: 4, rule: 'provenance' }],
  );
});

test('an interpolation inside an inline template is code, not markup', () => {
  const component = (...rows) => [
    '@Component({',
    '  template: `',
    ...rows,
    '  `,',
    '})',
    'export class Probe {}',
  ];
  const at = (lines) =>
    findViolations({ path: 'frontend/src/app/probe.ts', lines, added: new Set(lines.map((_, i) => i + 1)) })
      .map(({ line, rule }) => ({ line, rule }));

  assert.deepEqual(at(component('    <p>${label("<!-- see #923 -->")}</p>')), []);
  assert.deepEqual(
    at(component('    <p>${cond ? `a` : `b`}</p>', '    <!-- the live region must outlive its branch (#741) -->')),
    [{ line: 4, rule: 'provenance' }],
  );
});

test('an inline template whose backtick opens on the line after `template:` is still one', () => {
  const lines = [
    '@Component({',
    '  template:',
    '    `',
    '    <!-- A two-line HTML comment,',
    '         carrying provenance (#923). -->',
    '    <p>hi</p>',
    '  `,',
    '})',
  ];

  const violations = findViolations({ path: 'frontend/src/app/probe.ts', lines, added: new Set([4, 5]) });

  assert.deepEqual(
    violations.map(({ line, endLine, rule }) => ({ line, endLine, rule })),
    [{ line: 4, endLine: 5, rule: 'multiline' }, { line: 5, endLine: 5, rule: 'provenance' }],
  );
});
