# One live-region idiom (`<output>`) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every live region in `frontend/src` that can be an `<output>` is one, the two that
cannot each say why at the site, and a lint rule that reads inline `.ts` templates makes a new
`role="status"` impossible to land unnoticed.

**Architecture:** The residue is an analyzer gap, so the fix is an analyzer, not a sweep alone.
Sonar's web scanner reads `.html` only; a local flat-config ESLint rule reads inline templates
too, because `angular.processInlineTemplates` extracts them into virtual `.html` files that the
config's `**/*.html` block already covers — verified end to end before this plan was written.
A custom rule beats a `scripts/check-*.mjs` guard here: the template AST is already parsed, the
line numbers already map back to the `.ts` file, and `<!-- eslint-disable-next-line -->` gives
the two real exceptions a door that forces a written reason instead of a tacit allowance.

**Persistence:** N/A — frontend-only, no table, no migration.

**Source of intent:** GitHub issue #1042

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's population list omits `auth/`, `booking/`, `venue/` and `operator/`, and that two of the
28 grep hits are doc comments, not markup) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger that separates the 24 conversions from the 2 exemptions) · `tdd` (the
ESLint rule is written against a failing `RuleTester` suite before it is wired) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(ran at close-out over the PR range — the `load-announcer` class doc is the repo's reference
description of this pattern and is rewritten here) · `riviera-frontend` (placement: the rule is
lint tooling, so it sits at `frontend/eslint-rules/`, outside the `app/` taxonomy) ·
`riviera-tailwind` (`<output>` is `display: inline` and Preflight does not blockify it — every
visible region gains an explicit `block`, which is inert on the `<p>` call sites that share the
same class constant) · `angular-developer` + angular-cli MCP (`get_best_practices` for the v22
posture; `search_documentation` confirmed Angular prescribes no element, only a live region) ·
`playwright-cli` (the accessible role is computed, so only a real browser can prove it survived —
`toHaveRole` and a computed-`display` assertion in the CI-run mocked suite) · `riviera-local-debug`
(scoped Vitest runs; the clone was unshallowed before any history claim)

**Branch:** `claude/sdlc-1042-ayzj1k` — the cloud session's designated remote branch stands in
for `feature/output-live-region-idiom`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a template containing `role="status"` as a static attribute or as a literal binding, when ESLint runs, then the rule reports it once at that attribute and names `<output>`. *Seam:* the rule module's `create()` visitor, observed through ESLint's `RuleTester` · *Pinned by:* `prefer-output-over-status-role.test.mjs` › the four `invalid` cases
- [x] **AC-2:** Given a template using `<output>`, or another role, or `role="status"` on an element behind `<!-- eslint-disable-next-line -->`, when ESLint runs, then nothing is reported. *Seam:* the rule module's valid cases through `RuleTester`, and the directive through the real `ESLint` API, which is the only harness that sees the name a component actually writes · *Pinned by:* `prefer-output-over-status-role.test.mjs` › the `valid` cases and `the eslint-disable door`
- [x] **AC-3:** Given the whole frontend tree with the rule wired into `eslint.config.js`, when `npm run lint` runs, then it passes — proving all 24 conversions landed and the 3 remaining `role="status"` sites each carry a disable comment. *Seam:* the `npm run lint` script over `frontend/src` · *Pinned by:* the CI frontend job's lint step
- [x] **AC-4:** Given the command palette's empty-state region in a real browser, when no entry matches, then it still computes the accessible role `status` and paints as a block box. *Seam:* the rendered page, observed through Playwright role and computed-style locators · *Pinned by:* `admin-console-tabs.e2e.ts` › the existing `Meta+k` palette test
- [x] **AC-5:** Given the customer set-password notice after a successful save, when it renders, then it computes the accessible role `status`. *Seam:* the rendered page through `toHaveRole` · *Pinned by:* `customer-password.e2e.ts`
- [x] **AC-6:** Given a component whose live region became an `<output>`, when its unit spec asserts the region's identity, then it asserts the element is an `OUTPUT` rather than reading a `role` attribute that no longer exists. *Seam:* each component's rendered DOM through its existing spec · *Pinned by:* `load-announcer.spec.ts`, `console-palette.spec.ts`, `challenge-widget.a11y.spec.ts`, `operator-password.spec.ts`, `operator-password.a11y.spec.ts`, `booking-pay.a11y.spec.ts`, `admin-mail-outbox.a11y.spec.ts`, `admin-mail-delivery.a11y.spec.ts`, `admin-refund-outbox.a11y.spec.ts`

## Non-goals

- Widening the rule beyond `role="status"`. `role="alert"` has no native element and stays.
- Removing the explicit `aria-live="polite"` that most of these regions carry. `<output>`'s
  implicit role already implies it, but dropping it is a separate behavioural question about
  assistive-technology support, not this slice's.
- Converting the two wrapper regions. Both are decided exemptions, recorded below.
- Retro-fitting `<output>` onto `role="status"` in the retired-artboard design docs.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Region exposes the accessible role `status` | preserved | `<output>`'s implicit ARIA role is `status` (HTML-AAM); pinned in a real browser by AC-4/AC-5, since jsdom computes no roles |
| Region is announced politely on mutation | preserved | the explicit `aria-live="polite"` is kept wherever it exists today; `role=status` implies it besides |
| Visible region paints as a block box | preserved | `<output>` is `display: inline` and Tailwind Preflight blockifies only replaced/media elements, so every visible region gains `block`; AC-4 measures it |
| `min-h-*` / `mt-*` / `mb-*` / `mx-*` apply to the region | preserved | same `block` addition — these are no-ops on an inline box |
| `empty:hidden` hides the settled-result regions in `booking-view` | preserved | `:empty` adds specificity and Tailwind emits variants after base utilities, so `empty:hidden` still beats the new `block` |
| `data-testid` hooks used by unit specs and both e2e suites | preserved | every `data-testid` is carried over unchanged |
| `tabindex="-1"` focus parking on the notices that take focus | preserved | attribute carried over; `operator-daily.e2e.ts` already asserts the focused notice |
| Region is a `<p>` for specs asserting `getAttribute('role')` | changed | those assertions now assert `tagName === 'OUTPUT'`; the attribute is gone because the role is implicit |
| `booking-dialog`'s terms region wraps a `<p appCancellationTermsNote>` | preserved, exempt | `<output>` permits phrasing content only, and the wrapper must outlive its child to announce at all |
| `pending-approval-banner` is a `role="status"` `<div>` | preserved, exempt | persistent account state, not the result of a user action — `<output>`'s own case does not cover it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `<output>` is `display: inline`, so a converted visible region silently loses its margins, `min-height` and block box | high | med | add `block` to every visible region's class set; `block` is inert on the `<p>` siblings sharing the same `cls.*` constant, so no call site drifts; AC-4 measures the computed value in a browser | claude | closed in phase 1 |
| R-2 | A spec asserting `getAttribute('role') === 'status'` passes today and fails silently-differently after the swap | high | low | AC-6 enumerates all nine and converts them to a `tagName` assertion in the same phase as the markup | claude | closed in phase 1 — `toBe('OUTPUT')` was already the tree's idiom, and `load-announcer.spec.ts` held a contradicting `toBe('P')` that the suite caught |
| R-3 | `withheld-email-notice.spec.ts` asserts the ABSENCE of a live region by selector; an `<output>` would slip past it | med | med | widen that selector to include `output` in the same phase | claude | closed in phase 1 |
| R-4 | The rule fires on spec fixtures too (`processInlineTemplates` covers `*.spec.ts`), so `cancellation-terms-note.a11y.spec.ts`'s `<div role="status">` fixture breaks the lint | high | low | that fixture mirrors the exempt `booking-dialog` shape, so it takes the same disable comment; phase 1 runs the full lint to find any other fixture | claude | closed in phase 1 — that was the only fixture |
| R-5 | An `eslint-disable` naming a rule that is not yet registered is reported as an unused directive, so phases that split the sweep from the wiring go red | med | med | the disable comments and the wiring land in phases 1 and 2 respectively, and phase 1 ends by running the full lint; if a warning appears, the wiring moves into phase 1 | claude | fired — it is a hard error, not a warning, so the wiring moved into phase 1 as planned |
| R-6 | `scripts/check-inline-comments.mjs` fails the build on an issue number in an added or touched comment | med | low | no exemption comment or doc rewrite cites `#1042`; each states the mechanism instead | claude | closed in phase 1 — also forced dropping a stale `#828` from the one touched doc comment, and shortening a two-line config comment |
| R-7 | Adding `frontend/eslint-rules/` outside the Prettier scope leaves the tree's newest directory unformatted | med | low | extend `format`/`format:check` to cover it and update the `CLAUDE.md` command block in the same phase | claude | closed in phase 2 — the CI step carries its own scope, so it was widened too, and lint-staged gained the directory |

## Open questions / Assumptions

*(none — both of the issue's questions were settled before planning; see Resolved)*

### Resolved

- **Is `<output>` right for all of them?** No. It is right for the 24 phrasing-content regions
  that report the result of an action or an async load. It is wrong for
  `pending-approval-banner` (persistent account state, not a result) and impossible for
  `booking-dialog`'s terms region (`<output>` permits phrasing content only, its child is a
  `<p>` component pinned to that tag by `riviera-tailwind` rule 1, and the wrapper has to
  outlive that child or the terms are never announced). Both keep `role="status"` behind a
  disable comment naming the reason. Decided with the maintainer at plan time.
- **Should enforcement be a `scripts/check-*.mjs` guard?** No — a local ESLint rule. Verified
  before planning that template rules reach inline `.ts` templates with correct line mapping,
  that a local flat-config plugin works the same way, and that a template
  `<!-- eslint-disable-next-line -->` suppresses it. Prettier cannot express this; Angular ships
  no equivalent rule. Decided with the maintainer at plan time.
- **Should `load-announcer`'s class doc change?** Yes — it is the repo's reference description
  of the live-region shape and other components are pointed at it. Phase 3 rewrites the
  "one persistent `sr-only` paragraph" sentence.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No booking, beach-map or `set_availability` code is in
scope; the diff is Angular templates, their specs, and lint tooling.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `booking-pay.ts` is touched for its two live regions only; no amount,
refund, PaymentIntent or ledger path is read or changed.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/load-announcer.ts`, `shared/challenge-widget.ts`, `shared/console-palette.ts` | existing | standalone components | unchanged signals | none |
| FE-2 | `admin/admin-{reviews,commissions,venue-changes,venue-photos,refund-outbox,operators,mail-outbox,mail-delivery}.ts` | existing | standalone components | unchanged signals | none |
| FE-3 | `auth/{operator-password,forgot-password,set-password,reset-password,verify-email}.ts` | existing | standalone components | unchanged signals | unchanged |
| FE-4 | `booking/booking-view.ts`, `booking/booking-pay.ts`, `venue/venue-reviews.ts` | existing | standalone components | unchanged signals | none |
| FE-5 | `booking/booking-dialog.ts`, `operator/pending-approval-banner.ts` | existing | standalone components | unchanged | none |

**Standards:** no component API changes — the diff is template markup, one class-constant
addition per file, and comments. Standalone components, signal inputs, `@if`/`@switch` control
flow all stay exactly as they are.

## FE↔BE contract

N/A — no contract change. No HTTP shape, DTO or endpoint is touched.

## Execution status

**Stage pointer:** `PR #1075 — ready for review, awaiting the review and Sonar gates`

**Next action:** Run the review gate per `riviera-sdlc` `references/pr-gates.md` §1, then check the
push's CI run and clear the Sonar new-issue list.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the ESLint rule, test-first, unwired | ✅ | (this commit) |
| 1 — the sweep: 24 conversions, 3 exemptions, 9 spec assertions, rule wired | ✅ | (this commit) |
| 2 — the rule's tooling: npm script, CI step, format scope, CLAUDE.md | ✅ | (this commit) |
| 3 — e2e proof in a real browser + the reference doc | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate | `frontend/eslint-rules/` sits outside `sonar.sources`, repeating the gap PR #963 closed for `scripts/` — gate machinery whose defects make a gate report clean rather than fail a build | fixed — the directory joins `sonar.sources` and the frontend job now emits its lcov into the same cached artifact |
| F-2 | review gate | The rule module's doc comment ran to ~20 lines of motivation and history, over the §6d budget and into RV-STYLE-1's drop list | fixed — trimmed to what changes a reader's action |
| F-3 | review gate | A rule test was titled "the shape both exemptions use", but only the pending-approval banner has a multi-line open tag; the booking dialog's is one line | fixed — retitled to the property the test actually pins |
| F-4 | review gate | Five auth live regions are born holding their text inside the branch that mounts them (RV-FE-10), so the outcome may never be announced | deferred → follow-up issue. Pre-existing placement, unchanged by this slice, and out of its stated scope. The reviewer's sixth site, `erase-done`, is not a defect: `set-password.ts` focuses it explicitly, pinned by its spec |

---

## File structure

- `docs/plans/output-live-region-idiom.md` — this plan
- `frontend/eslint-rules/prefer-output-over-status-role.js` — the rule module
- `frontend/eslint-rules/prefer-output-over-status-role.test.mjs` — its RuleTester suite
- `frontend/eslint.config.js` — registers the local plugin on the `**/*.html` block
- `frontend/package.json` — the rule-test script; Prettier scope gains `eslint-rules`
- `.github/workflows/ci.yml` — runs the rule suite in the frontend job, with coverage for Sonar
- `sonar-project.properties` — the rules directory joins `sonar.sources`, its lcov joins the report paths
- `CLAUDE.md` — the frontend command block gains the rule suite and the widened format scope
- `frontend/src/app/shared/load-announcer.ts|.spec.ts` — region + its identity assertion + the reference class doc
- `frontend/src/app/shared/challenge-widget.ts` — region
- `frontend/src/app/shared/challenge-widget.a11y.spec.ts` — identity assertion
- `frontend/src/app/shared/console-palette.ts|.spec.ts` — region, `block` on the empty class, two assertions
- `frontend/src/app/admin/admin-reviews.ts` — region
- `frontend/src/app/admin/admin-commissions.ts` — region
- `frontend/src/app/admin/admin-venue-changes.ts` — region
- `frontend/src/app/admin/admin-venue-photos.ts` — region
- `frontend/src/app/admin/admin-operators.ts` — region
- `frontend/src/app/admin/admin-refund-outbox.ts|.a11y.spec.ts` — region + identity assertion
- `frontend/src/app/admin/admin-mail-outbox.ts|.a11y.spec.ts` — region + identity assertion
- `frontend/src/app/admin/admin-mail-delivery.ts|.a11y.spec.ts` — region + identity assertion
- `frontend/src/app/auth/operator-password.ts|.spec.ts` — region + identity assertion
- `frontend/src/app/auth/operator-password.a11y.spec.ts` — identity assertion + its doc line
- `frontend/src/app/auth/forgot-password.ts` — region
- `frontend/src/app/auth/reset-password.ts` — region
- `frontend/src/app/auth/set-password.ts` — two regions
- `frontend/src/app/auth/verify-email.ts` — two regions
- `frontend/src/app/booking/booking-view.ts` — three regions + `block` on the result class
- `frontend/src/app/booking/booking-pay.ts` — two regions
- `frontend/src/app/booking/booking-pay.a11y.spec.ts` — identity assertion
- `frontend/src/app/booking/booking-dialog.ts` — exemption comment
- `frontend/src/app/booking/cancellation-terms-note.a11y.spec.ts` — exemption comment on the fixture
- `frontend/src/app/booking/withheld-email-notice.spec.ts` — absence selector widened to `output`
- `frontend/src/app/operator/pending-approval-banner.ts` — exemption comment + its class doc
- `frontend/src/app/operator/requests-tab.a11y.spec.ts` — stale doc line (already an `<output>`)
- `frontend/src/app/venue/venue-reviews.ts` — region
- `frontend/e2e/admin-console-tabs.e2e.ts` — computed-display proof on the palette region
- `frontend/e2e/customer-password.e2e.ts` — accessible-role proof on the auth notice

---

## Phase 0 — The ESLint rule, test-first, unwired

**Files:** Create `frontend/eslint-rules/prefer-output-over-status-role.js` · Test `frontend/eslint-rules/prefer-output-over-status-role.test.mjs`

- [x] **Step 1: Write the failing test** — RuleTester over `@angular-eslint/template-parser`, with the invalid cases of AC-1 and the valid cases of AC-2.
- [x] **Step 2: Run it, verify it fails** — `cd frontend && node --test "eslint-rules/*.test.mjs"` → FAIL, cannot find the rule module.
- [x] **Step 3: Minimal implementation** — visit `Element > TextAttribute[name="role"]` and the bound forms; report when the value is `status`; no fixer.
- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — population is every live region in the tree; enumerated in phase 1.
- [x] **Step 6: Commit** — `git commit -m "Add a lint rule preferring <output> over role=\"status\" (#1042)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The sweep

**Files:** Modify the 19 component files, 3 exemption sites, 10 spec files (see File structure).

- [x] **Step 1:** Convert each of the 24 regions to `<output>`, dropping `role="status"`, keeping `aria-live`, `tabindex`, `data-testid` and every class.
- [x] **Step 2:** Add `block` to the class set of every visible region (`console-palette`'s `empty`, the eight admin notices, the five auth `intro`/`notice` constants, `booking-view`'s `result`, `booking-pay`'s processing line). Leave the `sr-only` regions alone.
- [x] **Step 3:** Add the exemption comment at `booking-dialog.ts`, `pending-approval-banner.ts` and `cancellation-terms-note.a11y.spec.ts`'s fixture — each naming the mechanism, never the issue number.
- [x] **Step 4:** Update the nine `getAttribute('role')` assertions to assert `tagName`, and widen `withheld-email-notice.spec.ts`'s absence selector to include `output`.
- [x] **Step 5: Register the rule** in `eslint.config.js`. Moved here from phase 2: an `eslint-disable` naming an unregistered rule is a hard ESLint error, not a warning, so the disable comments and the wiring cannot be split across commits.
- [x] **Step 6: Verify it bites** — reintroduce one `role="status"` in an inline template by hand → `npx eslint` FAILS at that line; revert → clean.
- [x] **Step 7: Run the specs** — `npm test` → 3164 pass; `npm run lint`, `npm run format:check`, and the three diff-scoped hygiene guards → PASS.
- [x] **Step 8: Generalization-audit pass.**
- [x] **Step 9: Commit** and update the execution status.

---

## Phase 2 — The rule's tooling

**Files:** Modify `frontend/eslint.config.js` · `frontend/package.json` · `.github/workflows/ci.yml` · `CLAUDE.md`

> Registering the rule moved into phase 1 (risk R-5). What is left here is the tooling that keeps
> the rule's own suite running and the new directory formatted.

- [x] **Step 1:** Add the `test:eslint-rules` npm script and widen `format`/`format:check` to cover `eslint-rules`.
- [x] **Step 2:** Add the CI step to the frontend job — the rule suite needs `node_modules`, so it cannot live with the `scripts/*.test.mjs` guards in the hygiene job.
- [x] **Step 3:** Update the `CLAUDE.md` frontend command block for both.
- [x] **Step 4: Commit** and update the execution status.

---

## Phase 3 — Real-browser proof and the reference doc

**Files:** Modify `frontend/e2e/admin-console-tabs.e2e.ts` · `frontend/e2e/customer-password.e2e.ts` · `frontend/src/app/shared/load-announcer.ts` · `frontend/src/app/operator/requests-tab.a11y.spec.ts`

- [x] **Step 1:** Assert the palette's empty-state region computes `display: block` beside the existing `getByRole('status')` assertion; assert `toHaveRole('status')` on the set-password notice.
- [x] **Step 2: Run the mocked suite** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` scoped to the two specs → PASS.
- [x] **Step 3:** Rewrite `load-announcer`'s class doc so the shape it describes is the shape it renders, and fix `requests-tab.a11y.spec.ts`'s doc line, which describes an `<output>` as `role="status"`.
- [x] **Step 4: Commit** and finalize the execution status in this commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-12 | phase 3 | Prose that describes a live region by the role it writes — the doc half of the same split, which a markup grep does not reach | `grep -rn 'role="status"' frontend/src docs --include=*.ts --include=*.md` | 3 doc sites over converted or already-converted regions, 3 over the exemptions | rewrote the 3 stale ones, including the reference class doc other components are pointed at; the exemption docs were already accurate |
| 2026-09-12 | phase 1 | Every element declaring the ARIA `status` role in an Angular template, `.html` and inline `.ts` alike — the mechanism the analyzer gap hides, not "components that look like announcers" | `grep -rn 'role="status"' frontend/src/app --include=*.ts --include=*.html` | 28 hits: 24 markup regions, 2 markup exemptions, 2 doc comments describing the exemptions | converted the 24; the 2 exemptions keep the role behind a disable comment; a spec-fixture site the same grep missed (it excludes nothing) was found by running the wired lint |
| 2026-09-12 | phase 1 | Specs reading the region's identity — any assertion on `role` or `tagName` over a converted element, which the swap silently changes | `grep -rn "role=.status\|getByRole('status')\|'status'" frontend/src --include=*.spec.ts` | 19 hits: 9 role assertions to convert, 1 absence selector to widen, 1 contradicting `toBe('P')`, the rest describing exempt or unrelated regions | all converted; `toBe('OUTPUT')` turned out to be the tree's existing idiom |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2:** Run `cd frontend && node --test "eslint-rules/*.test.mjs"` → all pass.
- [x] **AC-3:** Run `cd frontend && npm run lint` → passes with the rule wired.
- [x] **AC-4 / AC-5:** Run the two mocked e2e specs → pass.
- [x] **AC-6:** Run `cd frontend && npm test` → passes.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit.**
- [ ] **The review gate ran in full.**
