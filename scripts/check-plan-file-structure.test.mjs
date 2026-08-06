import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findOmissions } from './check-plan-file-structure.mjs';

const SECTION = `# A plan

## File structure

- \`src/a.ts\` — the thing
- \`src/b.ts\` — the other thing

## Phase 0 — something

- \`src/never-listed-here.ts\` — outside the section, so not a listing
`;

const doc = (text, path = 'docs/plans/p.md') => ({ path, text });
const paths = (omissions) => omissions.map((o) => o.path);

/** A section body, wrapped in the heading the parser looks for. */
const withHeading = (body) => `## File structure\n\n${body}\n`;

test('reports exactly the paths the section omits', () => {
  const omissions = findOmissions({
    docs: [doc(SECTION)],
    changed: ['docs/plans/p.md', 'src/a.ts', 'src/b.ts', 'src/c.ts'],
  });
  assert.deepEqual(paths(omissions), ['src/c.ts']);
});

test('a complete section passes', () => {
  const omissions = findOmissions({
    docs: [doc(SECTION)],
    changed: ['docs/plans/p.md', 'src/a.ts', 'src/b.ts'],
  });
  assert.deepEqual(omissions, []);
});

test('a slice with no plan doc passes cleanly', () => {
  const omissions = findOmissions({ docs: [], changed: ['src/a.ts', 'README.md'] });
  assert.deepEqual(omissions, []);
});

test('only the File structure section counts as a listing', () => {
  const omissions = findOmissions({
    docs: [doc(SECTION)],
    changed: ['src/a.ts', 'src/b.ts', 'src/never-listed-here.ts'],
  });
  assert.deepEqual(paths(omissions), ['src/never-listed-here.ts']);
});

test('the plan doc and lockfiles are exempt', () => {
  const omissions = findOmissions({
    docs: [doc(withHeading('- `src/a.ts`'))],
    changed: ['docs/plans/p.md', 'frontend/package-lock.json', 'src/a.ts'],
  });
  assert.deepEqual(omissions, []);
});

test('a missing section reports the paths, not the section', () => {
  const sectionless = doc('# A plan\n\n## Phase 0\n\nno file structure here\n');

  const docOnly = findOmissions({ docs: [sectionless], changed: ['docs/plans/p.md'] });
  assert.deepEqual(docOnly, []);

  const withWork = findOmissions({ docs: [sectionless], changed: ['src/a.ts'] });
  assert.deepEqual(paths(withWork), ['src/a.ts']);
  assert.match(withWork[0].reason, /no "## File structure" section/);
});

test('several plan docs in one diff contribute a union of listings', () => {
  const omissions = findOmissions({
    docs: [
      doc(withHeading('- `src/a.ts`'), 'docs/plans/one.md'),
      doc(withHeading('- `src/b.ts`'), 'docs/plans/two.md'),
    ],
    changed: ['docs/plans/one.md', 'docs/plans/two.md', 'src/a.ts', 'src/b.ts'],
  });
  assert.deepEqual(omissions, []);
});

/**
 * The five path idioms below are not invented — each is lifted from a merged plan doc, because a
 * parser that only understands one-path-per-bullet reports files the author *did* list. That is
 * the false positive that gets a gate switched off (issue #529's lesson, inherited here): before
 * these were taught, the naive matcher reported 8 of PR #464's paths, all 8 of them listed.
 */
test('idiom: a repo-relative suffix names a file under a longer path (PR #522)', () => {
  const omissions = findOmissions({
    docs: [doc(withHeading('- `payout/application/DailyTakingsServiceTest.java` — the fake'))],
    changed: [
      'platform/src/test/java/ai/riviera/platform/payout/application/DailyTakingsServiceTest.java',
    ],
  });
  assert.deepEqual(omissions, []);
});

test('idiom: a bare extension is a sibling of the path before it (PR #464)', () => {
  const line =
    '- `frontend/src/app/pages/legal/privacy-policy.ts`/`.html` (+`.spec.ts`, `.a11y.spec.ts`) — page';
  const omissions = findOmissions({
    docs: [doc(withHeading(line))],
    changed: [
      'frontend/src/app/pages/legal/privacy-policy.ts',
      'frontend/src/app/pages/legal/privacy-policy.html',
      'frontend/src/app/pages/legal/privacy-policy.spec.ts',
      'frontend/src/app/pages/legal/privacy-policy.a11y.spec.ts',
    ],
  });
  assert.deepEqual(omissions, []);
});

test('idiom: a brace set expands, globs included (PR #505)', () => {
  const line = '- `frontend/e2e/{unified-auth,operator-sign-in,admin-*}.e2e.ts` — entry repoints';
  const omissions = findOmissions({
    docs: [doc(withHeading(line))],
    changed: [
      'frontend/e2e/unified-auth.e2e.ts',
      'frontend/e2e/operator-sign-in.e2e.ts',
      'frontend/e2e/admin-mail-outbox.e2e.ts',
      'frontend/e2e/admin-refund-outbox.e2e.ts',
    ],
  });
  assert.deepEqual(omissions, []);
});

test('idiom: pipe alternation lists siblings inside one span (PR #505)', () => {
  const line = '- `frontend/src/app/operator/venue-create-card.ts|.html` — the create form';
  const omissions = findOmissions({
    docs: [doc(withHeading(line))],
    changed: [
      'frontend/src/app/operator/venue-create-card.ts',
      'frontend/src/app/operator/venue-create-card.html',
    ],
  });
  assert.deepEqual(omissions, []);
});

test('idiom: `**` crosses directories, a single `*` does not (PR #478)', () => {
  const line = '- `frontend/src/app/**/*.contrast.spec.ts` — the composited-contrast sweep';
  const omissions = findOmissions({
    docs: [doc(withHeading(line))],
    changed: [
      'frontend/src/app/booking/find-booking.contrast.spec.ts',
      'frontend/src/app/auth/auth-page.contrast.spec.ts',
      'frontend/src/app/app.contrast.spec.ts',
    ],
  });
  assert.deepEqual(omissions, []);

  const singleStar = findOmissions({
    docs: [doc(withHeading('- `frontend/src/app/*.contrast.spec.ts`'))],
    changed: ['frontend/src/app/booking/find-booking.contrast.spec.ts'],
  });
  assert.deepEqual(paths(singleStar), ['frontend/src/app/booking/find-booking.contrast.spec.ts']);
});

test('idiom: a directory covers what it contains (PR #505)', () => {
  const line = '- `frontend/src/app/venue-admin/` — deleted (editor + 3 specs + scss)';
  const omissions = findOmissions({
    docs: [doc(withHeading(line))],
    changed: [
      'frontend/src/app/venue-admin/venue-editor.ts',
      'frontend/src/app/venue-admin/venue-editor.scss',
      'frontend/src/app/venue-admin/venue-editor.spec.ts',
    ],
  });
  assert.deepEqual(omissions, []);
});

test('a backticked span that is not a path is not a listing', () => {
  const body = [
    '- `platform/src/main/java/ai/riviera/platform/venue/api/VenueRates.java` — add',
    '  `commissionBpsOn`; the `@Service` bean and `GET /api/admin/venues` stay as they were',
  ].join('\n');
  const omissions = findOmissions({
    docs: [doc(withHeading(body))],
    changed: ['platform/src/main/java/ai/riviera/platform/venue/api/VenueRates.java', 'src/x.ts'],
  });
  assert.deepEqual(paths(omissions), ['src/x.ts']);
});

/**
 * PR #522's File-structure section, verbatim from commit 377599a — the state it MERGED in, after
 * its own review gate. Issue #533 names it as one of five consecutive undercounts, and it is still
 * short by two: `CONTEXT.md` (the docs sweep listed its two siblings but not it) and
 * `CommissionRateCommand.java` (a whole application type).
 */
const PR_522_SECTION = `## File structure

**Created**

- \`platform/src/main/resources/db/migration/V39__venue_commission_rate_schedule.sql\` — the
  effective-dated schedule table. Deliberately **empty at migration** — it is a change log, and the
  write is what keeps the read total (see F-1).
- \`platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionAdministration.java\` —
  the ownership-free admin port (list + write), named for the posture its methods share.
- \`platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionService.java\` —
  package-private \`@Service\` implementing it; owns the forward-only rule and the transaction.
- \`platform/src/main/java/ai/riviera/platform/venue/application/CommissionRateStore.java\` — the
  driven port for the schedule write, the live-rate write and the platform-wide list.
- \`platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionView.java\` — the
  per-venue commission read model.
- \`platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionController.java\` —
  \`GET /api/admin/venues\`, \`PUT /api/admin/venues/{venueId}/commission\`.
- \`platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionsResponse.java\` —
  the list wire shape.
- \`platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetCommissionRequest.java\` — the
  write's request DTO.
- \`platform/src/test/java/ai/riviera/platform/venue/application/VenueCommissionServiceTest.java\`
- \`platform/src/test/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionControllerTest.java\`
- \`platform/src/test/java/ai/riviera/platform/venue/AdminVenueCommissionIT.java\`
- \`platform/src/test/java/ai/riviera/platform/venue/VenueCommissionScheduleMigrationIT.java\`
- \`platform/src/test/java/ai/riviera/platform/venue/JdbcVenueCommissionScheduleIT.java\`
- \`platform/src/test/java/ai/riviera/platform/payout/VenueCommissionForwardOnlyIT.java\`

**Modified**

- \`platform/src/main/java/ai/riviera/platform/venue/api/VenueRates.java\` — add
  \`commissionBpsOn\`; qualify the "read at decision time" sentence (it stays true of accrual and
  becomes explicit about the per-service-date read).
- \`platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java\` — implement
  \`commissionBpsOn\`.
- \`platform/src/main/java/ai/riviera/platform/venue/application/Venues.java\` — \`insertVenue\`'s
  \`findProfile\` Javadoc points at the admin write for the rate; \`insertVenue\` is untouched, signature
  **and** behavior.
- \`platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java\` — implements
  \`CommissionRateStore\` too (\`ensureFloorRate\`/\`updateLiveRate\`/\`schedule\`); \`insertVenue\` unchanged.
- \`platform/src/main/java/ai/riviera/platform/payout/application/DailyTakingsService.java\` — read the
  service-date rate; Javadoc says why.
- \`platform/src/main/java/ai/riviera/platform/SecurityConfig.java\` — two matcher constants + rules.
- \`platform/src/test/java/ai/riviera/platform/WebSliceStubs.java\`,
  \`payout/application/DailyTakingsServiceTest.java\` — the \`VenueRates\` fakes gain the new method.
- \`CLAUDE.md\` (venue module row), \`RESPONSIBILITIES.md\` (§\`venue\`, §\`payout\`),
  \`platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java\` +
  \`venue/application/VenueProfileView.java\` (the "display-only" note now has an admin counterpart
  to point at) — the docs sweep, phase 4.

---`;

/** The 28 paths commit 377599a changed. */
const PR_522_PATHS = [
  'CLAUDE.md',
  'CONTEXT.md',
  'RESPONSIBILITIES.md',
  'docs/plans/a7-commission-rate-backend.md',
  'platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
  'platform/src/main/java/ai/riviera/platform/payout/application/DailyTakingsService.java',
  'platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionController.java',
  'platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionsResponse.java',
  'platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetCommissionRequest.java',
  'platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java',
  'platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java',
  'platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java',
  'platform/src/main/java/ai/riviera/platform/venue/api/VenueRates.java',
  'platform/src/main/java/ai/riviera/platform/venue/application/CommissionRateCommand.java',
  'platform/src/main/java/ai/riviera/platform/venue/application/CommissionRateStore.java',
  'platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionAdministration.java',
  'platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionService.java',
  'platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionView.java',
  'platform/src/main/java/ai/riviera/platform/venue/application/Venues.java',
  'platform/src/main/resources/db/migration/V39__venue_commission_rate_schedule.sql',
  'platform/src/test/java/ai/riviera/platform/WebSliceStubs.java',
  'platform/src/test/java/ai/riviera/platform/payout/VenueCommissionForwardOnlyIT.java',
  'platform/src/test/java/ai/riviera/platform/payout/application/DailyTakingsServiceTest.java',
  'platform/src/test/java/ai/riviera/platform/venue/AdminVenueCommissionIT.java',
  'platform/src/test/java/ai/riviera/platform/venue/JdbcVenueCommissionScheduleIT.java',
  'platform/src/test/java/ai/riviera/platform/venue/VenueCommissionScheduleMigrationIT.java',
  'platform/src/test/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionControllerTest.java',
  'platform/src/test/java/ai/riviera/platform/venue/application/VenueCommissionServiceTest.java',
];

test('real case: PR #522 undercounts by two', () => {
  const omissions = findOmissions({
    docs: [{ path: 'docs/plans/a7-commission-rate-backend.md', text: PR_522_SECTION }],
    changed: PR_522_PATHS,
  });
  assert.deepEqual(paths(omissions), [
    'CONTEXT.md',
    'platform/src/main/java/ai/riviera/platform/venue/application/CommissionRateCommand.java',
  ]);
});

/**
 * PR #526's File-structure section, verbatim from commit a02c199 — the last of the five slices
 * #533 names, and the one where the streak broke: as merged it lists all eleven paths.
 */
const PR_526_SECTION = `## File structure

> **Every path in the diff, including the one-line ones.** Listing only the interesting files is a
> finding raised on #438, #522 (F-5), Q1/#524 (F-3) and A8/#525 (finding 4) — four consecutive
> slices — and the paths that fall out are always the same shape: a registry entry, a comment-only
> freshness fix, and the plan doc itself. \`git diff origin/main...HEAD --stat\` is the check.

**New (5)**

- \`docs/plans/a3-admin-privacy-tab.md\` — this plan
- \`frontend/src/app/admin/admin-privacy.service.ts\` — the one call, grounds sanitization, error narrowing
- \`frontend/src/app/admin/admin-privacy.ts\` — the three-stage panel + the aside
- \`frontend/src/app/admin/admin-privacy.spec.ts\` — behaviour + the five focus guards
- \`frontend/src/app/admin/admin-privacy.a11y.spec.ts\` — axe at each stage
- \`frontend/e2e/admin-privacy.e2e.ts\` — real render at 360px, wire assertions, the focus bug jsdom can't show

**Modified (5)**

- \`frontend/src/app/admin/admin-console-tabs.ts\` — Privacy inserted at slot 7, + three TSDoc counts
- \`frontend/src/app/app.routes.ts\` — the lazy \`/admin/privacy\` route
- \`frontend/src/app/app.spec.ts\` — one line: \`admin/privacy\` joins the \`OPERATOR_SURFACE_PATHS\`
  registry, without which the legacy-surface assertion fails (F-3)
- \`frontend/src/app/admin/admin-console-tabs.spec.ts\` — **comment only**, zero assertion changes (F-2)
- \`frontend/e2e/admin-console-tabs.e2e.ts\` — **comment only**, zero assertion changes (F-1)

---`;

/** The 11 paths commit a02c199 changed. */
const PR_526_PATHS = [
  'docs/plans/a3-admin-privacy-tab.md',
  'frontend/e2e/admin-console-tabs.e2e.ts',
  'frontend/e2e/admin-privacy.e2e.ts',
  'frontend/src/app/admin/admin-console-tabs.spec.ts',
  'frontend/src/app/admin/admin-console-tabs.ts',
  'frontend/src/app/admin/admin-privacy.a11y.spec.ts',
  'frontend/src/app/admin/admin-privacy.service.ts',
  'frontend/src/app/admin/admin-privacy.spec.ts',
  'frontend/src/app/admin/admin-privacy.ts',
  'frontend/src/app/app.routes.ts',
  'frontend/src/app/app.spec.ts',
];

const PR_526_DOC = 'docs/plans/a3-admin-privacy-tab.md';

test('a complete section passes — PR #526 as merged', () => {
  const omissions = findOmissions({
    docs: [{ path: PR_526_DOC, text: PR_526_SECTION }],
    changed: PR_526_PATHS,
  });
  assert.deepEqual(omissions, []);
});

/** Drops the bullet that opens with `` - `path` ``, and the indented lines that continue it. */
function withoutBullet(section, path) {
  const lines = section.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`- \`${path}\``));
  assert.notEqual(start, -1, `no bullet for ${path}`);

  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

test('real case: PR #526 before its review fixed the section', () => {
  const beforeReview = [
    'frontend/src/app/app.spec.ts',
    'frontend/src/app/admin/admin-console-tabs.spec.ts',
    'frontend/e2e/admin-console-tabs.e2e.ts',
  ].reduce(withoutBullet, PR_526_SECTION);

  const omissions = findOmissions({
    docs: [{ path: PR_526_DOC, text: beforeReview }],
    changed: PR_526_PATHS,
  });
  assert.deepEqual(paths(omissions), [
    'frontend/e2e/admin-console-tabs.e2e.ts',
    'frontend/src/app/admin/admin-console-tabs.spec.ts',
    'frontend/src/app/app.spec.ts',
  ]);
});
