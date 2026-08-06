import test from 'node:test';
import assert from 'node:assert/strict';

import { findViolations, parseAddedLines } from './check-inline-comments.mjs';

const JAVA = 'platform/src/main/java/ai/riviera/platform/SecurityConfig.java';

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

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, JAVA);
  assert.equal(violations[0].line, 4);
  assert.equal(violations[0].endLine, 5);
});

const SCSS = 'frontend/src/styles.scss';

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

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].endLine, 3);
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
  assert.deepEqual(javadoc, []);

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

  assert.deepEqual(violations, []);
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
  assert.deepEqual(findViolations({ path: JAVA, lines: java, added: allAdded(java) }), []);

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

test('maps each hunk to the line numbers it adds', () => {
  const diff = [
    'diff --git a/platform/src/main/java/ai/riviera/platform/SecurityConfig.java b/platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
    'index f44244c..eaa5661 100644',
    '--- a/platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
    '+++ b/platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
    '@@ -419,2 +419,3 @@ class SecurityConfig {',
    '-\t\t// Venue commission rates (A7 #348) — ADMIN only; rationale on the constants.',
    '+\t\t// Venue commission rates (A7 #348) — ADMIN only; the platform sets the commercial',
    '+\t\t// term, not the venue (rationale on the constants).',
    '+\t\t.requestMatchers(HttpMethod.GET, ADMIN_VENUE_COMMISSIONS_PATH).hasRole(ADMIN_ROLE)',
    'diff --git a/frontend/src/styles.scss b/frontend/src/styles.scss',
    '--- a/frontend/src/styles.scss',
    '+++ b/frontend/src/styles.scss',
    '@@ -55,0 +56,1 @@',
    '+  --riv-chip-glass: rgba(255, 255, 255, 0.85);',
  ].join('\n');

  const added = parseAddedLines(diff);

  assert.deepEqual([...added.get('platform/src/main/java/ai/riviera/platform/SecurityConfig.java')], [419, 420, 421]);
  assert.deepEqual([...added.get('frontend/src/styles.scss')], [56]);
});

test('skips a deleted file and keeps a renamed one', () => {
  const diff = [
    'diff --git a/frontend/src/app/venue-admin/venue-admin.ts b/frontend/src/app/venue-admin/venue-admin.ts',
    '--- a/frontend/src/app/venue-admin/venue-admin.ts',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-const a = 1;',
    '-const b = 2;',
    'diff --git a/scripts/old-name.mjs b/scripts/new-name.mjs',
    '--- a/scripts/old-name.mjs',
    '+++ b/scripts/new-name.mjs',
    '@@ -3,0 +4,1 @@',
    '+// a fresh one-liner',
  ].join('\n');

  const added = parseAddedLines(diff);

  assert.equal(added.has('frontend/src/app/venue-admin/venue-admin.ts'), false);
  assert.deepEqual([...added.get('scripts/new-name.mjs')], [4]);
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
