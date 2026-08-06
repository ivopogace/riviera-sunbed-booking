import test from 'node:test';
import assert from 'node:assert/strict';

import { findViolations } from './check-inline-comments.mjs';

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
