# Beach-Map Row Names Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator can give each beach-map row a name of their own (≤ 40 characters)
in the layout editor; the name is stored as `set_position.row_label`, reaches the tourist
map's price rail via the existing #702 rule, and renders untruncated in booking views and
confirmation mail — while an untouched row keeps its grid letter and today's fallbacks.

**Architecture:** No new module surface — `row_label` already exists end-to-end
(`set_position.row_label` → `SetView.rowLabel` → #702's `rowPriceLabel`), so the slice is
an editing surface (per-row name inputs in the bulk layout editor, defaulting to the grid
letter) plus a length bound enforced twice: in `SetCommand`'s compact constructor (→
`400 INVALID_REQUEST` via `InvalidApiRequestException.parsing`, §6b) and as a `CHECK`
constraint in the database (invariant #12). The most significant decision: the name
**replaces** the stored label (grid letter remains the default and the tourist-map
fallback recognizer), rather than being a second stored field.

**Persistence:** JDBC only (invariant #1). One migration: `V43` adds
`CHECK (char_length(row_label) <= 40)` on `set_position`. No new columns or tables.

**Source of intent:** GitHub issue #723 (surfaced by the #702 grill, PR #722).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
`LAYOUT_IN_USE`/`SET_IN_USE` reachability limit, the mail `Row %s` prefix doubling, the
pricing-tab label-as-identity coupling, and the set-editor grid-letter split) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger that surfaced
"bulk save destroys descriptive labels today") · `tdd` (each phase red-first, scoped
test commands below) · `riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (**ran** pre-merge over `origin/main...HEAD`: 1 finding —
`row-price-label.ts`'s "what the operator layout editor writes for every venue created
in-product" doc, patched in this PR; counting sweep clean; the
`beach-map-price-rail-meaning.md:45` hit is a historical plan record, left as-is) · `postgres` (V12-idiom `CHECK` migration, constraint
naming `set_position_row_label_check`, `char_length` semantics) · `riviera-modulith`
(validation stays package-private in `venue.application`; mail rendering in
`notification.adapter/out`; no new ports/events/grants) · `riviera-java-conventions`
(named `MAX_ROW_LABEL_LENGTH` constant in lockstep with the CHECK §6a; overload on
`VenueFieldValidation.requireText`; §6b error contract — no controller change needed) ·
`riviera-frontend` (all FE files stay in `operator/`; no new cross-feature edges; e2e in
the mocked suite) · `angular-developer` + angular-cli MCP (signals + `computed()`,
native control flow, no `ngClass`; a11y-labelled inputs) · `riviera-tailwind` (utilities
only, `[appTouchTarget]` on the new inputs, `text-[14px]` idiom, no new SCSS) ·
`playwright-cli` (mocked-suite spec authoring; PUT-body assertion pattern already used by
`layout-editor.e2e.ts`) · `riviera-local-debug` (cloud gradle recipe — daemon on JDK 21,
scoped test classes only, `PW_CHROMIUM_EXECUTABLE` for the mocked e2e; added after review
finding F-2)

**Branch:** `claude/sdlc-723-g3r3rc` — the session's designated remote branch, standing
in for `feature/beach-map-row-names` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a layout write containing a set whose `rowLabel` exceeds 40
  characters (code points), when the request is parsed into `SetCommand`, then it is
  rejected with `IllegalArgumentException` → `400 INVALID_REQUEST` at the edge.
  *Pinned by:* `SetCommandTest.rejectsARowLabelOverTheLengthBound` and
  `BeachMapReplaceIT.overlongRowLabelIs400` (placed with the replace helpers, not
  `VenueAdminControllerIT` as first planned).
- [x] **AC-2:** Given a 40-character `rowLabel` (Unicode, containing `·`), when the
  layout is replaced, then the label round-trips unchanged to the venue map read
  (`SetView.rowLabel`). *Pinned by:* `SetCommandTest.acceptsARowLabelAtTheLengthBound` +
  `BeachMapReplaceIT.descriptiveRowLabelRoundTrips`.
- [x] **AC-3:** Given a direct SQL `INSERT` bypassing the application with
  `char_length(row_label) > 40`, then the database rejects it via
  `set_position_row_label_check`. *Pinned by:*
  `BeachMapLayoutMigrationIT.rejectsAnOverlongRowLabel`.
- [x] **AC-4:** Given a generated grid in the bulk editor, when the operator names row 1
  "Under the pines" and saves, then the PUT body carries `rowLabel: "Under the pines"`
  for that row's sets and the untouched rows keep their grid letters. *Pinned by:*
  `layout-editor.spec.ts` ("saves the operator's row name…") + e2e
  `layout-editor.e2e.ts` ("names a row and the save carries it").
- [x] **AC-5:** Given a venue loaded with descriptive labels (e.g. the V3 seed shapes),
  when the operator repaints and saves without touching names, then every label
  round-trips unchanged (no silent reset to grid letters). *Pinned by:*
  `layout-editor.spec.ts` ("preserves loaded row labels on save").
- [x] **AC-6:** Given two rows given the same trimmed name, when the operator tries to
  save, then the save is blocked client-side with row-name copy (the server's
  `DUPLICATE_POSITION` refusal stays the race-safe backstop). *Pinned by:*
  `layout-editor.spec.ts` ("blocks saving duplicate row names").
- [x] **AC-7:** Given named rows, when the operator regenerates the grid (confirmed
  destructive action), then row names reset to the grid-letter defaults. *Pinned by:*
  `layout-editor.spec.ts` ("regenerate resets row names").
- [x] **AC-8:** Given a venue whose row already carries a custom name, when a set is
  added at that grid row in per-set mode, then the new set inherits the row's existing
  label instead of a bare grid letter. *Pinned by:* `set-editor.spec.ts`
  ("a new set inherits its row's label").
- [x] **AC-9:** Given confirmation-mail facts with `rowLabel` "Front row · Sea view",
  when the confirmation mail renders, then the body reads
  `Spot: Front row · Sea view, position 3` — no doubled "Row" prefix. *Pinned by:*
  `SmtpMailerIT` (updated body assertion).

## Non-goals

- **Renaming rows on a venue that has sold.** The bulk replace answers
  `LAYOUT_IN_USE` for any venue with a booking ever recorded, and `editSet` counts a
  label change as a reposition (`SetPlacement.disturbedBy`) → `SET_IN_USE` on a claimed
  set — both by design (`RESPONSIBILITIES.md` §`venue`). A dedicated display-only
  row-rename operation (the `repriceRow` analogue) is a follow-up issue, filed at
  close-out; this slice covers the issue's actual target: venues authoring their layout.
- No second stored field for the name — the label **is** the name; the grid letter stays
  the derived default (issue #723's "worth deciding" #2, resolved).
- No tourist-map changes — `row-price-label.ts` (#702) already prefers the venue's words.
- No pricing-tab rename surface (it keys rows by label; it re-reads after layout saves).
- No backend trimming/normalization of labels (FE sends trimmed; backend semantics
  unchanged beyond the length bound).
- No change to `RowPriceCommand` unless the generalization audit says otherwise — its
  `rowLabel` is a lookup key for an existing row; an overlong key simply matches nothing.

## Behavior-parity ledger

The slice replaces the bulk editor's label-writing behavior:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Bulk save writes `gridRowLabel(y)` for every set — a load→save round-trip **rewrites descriptive labels to bare letters** (e.g. the V3 seed's "Front row · Sea view" → "A") | changed (deliberately) | `seedFrom` seeds a per-row name from the loaded sets; `toRequest` uses it — descriptive labels now survive a repaint (AC-5). The old behavior was silent data loss, not a contract. |
| A row's per-cell a11y label reads `Row A position 3, …` | preserved | the editor's cell labels keep the grid letter (positional identity aids grid navigation); only the saved `rowLabel` changes |
| Regenerate resets prices to tier defaults after confirmation | preserved + extended | the same confirmed-destructive reset now also clears row names (AC-7) |
| Per-set add derives `rowLabel` from the grid letter | changed | inherits an existing sibling's label at the same `gridY`, else the grid letter (AC-8) |
| Confirmation mail renders `Spot: Row A, position 3` | changed | `Spot: A, position 3` — the literal `Row ` prefix is dropped so descriptive labels don't double (AC-9) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Flyway `V43` collision with in-flight work | low | high | Grill verified: highest on `main` is `V42`; only dependabot PRs open. If a collision appears, this branch renumbers (merges second). | session | closed |
| R-2 | `CHECK` fails on existing rows | low | high | Longest existing label is the V3 seed's 20-char "Front row · Sea view" < 40; `BeachMapLayoutMigrationIT` migrates the real chain against the seed. | session | closed |
| R-3 | Java length check disagrees with PG `char_length` (UTF-16 vs code points) | med | med | Validate with `codePointCount` (== `char_length` semantics); FE `maxlength` counts UTF-16 units (equal or stricter — never lets through what the server rejects for BMP text; astral-plane over-strictness accepted). | session | closed |
| R-4 | Duplicate row names → confusing server `DUPLICATE_POSITION` ("two sets overlap") | med | low | Client-side duplicate guard with row-name copy (AC-6); server refusal stays the backstop. | session | closed |
| R-5 | Mail template change breaks `SmtpMailerIT` / resend path silently | low | med | The IT pins the exact line; update the assertion in the same TDD step; resend shares `SmtpMailer`. | session | closed |
| R-6 | Pricing tab keys rows by label (URL path `rows/{rowLabel}/price`) — renames change row identity | low | med | Renames only land through the bulk replace; the console re-reads the map after save; the reprice URL is already encoded (`operator-console.service.ts:156`) and the seed's `·`-labels already exercise it. No code change; verified in e2e. | session | closed |
| R-7 | BOLA (invariant #13) | — | high | No new endpoint; `replaceLayout` already runs `VenueOwnership.assertOwns` in the application service (pinned by `CrossVenueDenialIT`). Unchanged. | session | closed |
| R-8 | Error contract drift (§6b) | low | med | The bound throws `IllegalArgumentException` inside `SetCommand`, already wrapped by `InvalidApiRequestException.parsing` → `400 INVALID_REQUEST`; no controller or handler change. | session | closed |

## Open questions / Assumptions

- **Assumption:** 40 characters (code points) is the label bound — grounded in the rail
  chip's 92/128 px truncating cap (#702), the one-line mail rendering, and the longest
  real label to date (20 chars). A later relax is a cheap forward migration; a tighten is
  not — 40 errs generous. — *Owner:* session · *Resolves by:* phase 1 (constant + CHECK).
### Resolved

- **40-character bound** — held; shipped as `MAX_ROW_LABEL_LENGTH` + the V43 CHECK
  (`586b9ce`).
- **Mail `Row ` prefix drop** — shipped (`0a24ed6`), recorded as findings-register F-5 and
  flagged for the maintainer in the PR Scope notes; reversal is a one-line template edit
  if the maintainer prefers the old copy for bare letters.
- **Mid-season renames out of scope** — held; follow-up issue filed at close-out (see the
  issue referenced from PR #725's close-out comment).

## Availability & concurrency (invariant #2)

The slice touches the beach map but **no availability write path**:

- **Write paths to `availability(set_id, booking_date)`:** none touched. The layout
  replace's existing guards are unchanged: `LAYOUT_IN_USE` (venue-wide, any booking ever
  + any live hold) and the `set_version` optimistic token (`STALE_WRITE`) still gate the
  only write this slice extends, and the row-name data rides inside the same single PUT.
- **Uniqueness guarantee:** unchanged — `set_position_cell_uniq (venue_id, row_label,
  position_no)` + `set_position_grid_uniq (venue_id, grid_x, grid_y)` (V2/V12). Named
  rows make the first constraint reachable via duplicate names; `LayoutCommand
  .duplicateWithin()` already pre-checks and returns `DUPLICATE_POSITION` precisely.
- **Concurrency strategy:** unchanged (`set_version` compare-and-set on replace).
- **Pool rule (invariant #3):** untouched — pool assignment logic unchanged.
- **Cutoff rule (invariant #4):** not in scope — no booking-time behavior changes.
- **Pinning test:** existing `BeachMapReplaceConcurrencyIT` (unchanged) — this slice
  adds no concurrent write path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | owns set positions incl. `row_label` and the layout write surface |
| M-2 | `notification` | existing | (none) | owns transactional-mail rendering (`SmtpMailer`) |

**Cross-module named interfaces (`api/` ports):** none added or changed. `rowLabel`
already crosses via `venue.api.SetBookingFacts` → `SetBookingInfo.rowLabel()` and
`venue.vocabulary.SetView`; both shapes are untouched.

**Domain events:** none added or changed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Row-label length bound (edge validation) | `venue` | `venue` Job: "beach map / layout, set positions"; validation sits in `SetCommand`/`VenueFieldValidation` (`venue.application`, package-private) exactly where every other set-field invariant lives; not another module's Not-My-Job conflict |
| Row-label length bound (DB CHECK, V43) | `venue` (schema) | the V2/V12 `set_position` constraint lineage; invariant #12 |
| Mail spot-line rendering | `notification` | `notification` Job: transactional mail; rendering detail of `SmtpMailer` (adapter/out), consuming the same `BookingConfirmationMail` facts — no contract change |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (Set prices ride the same PUT but are untouched;
`priceByCoord` preservation is existing behavior.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` + `.html` | existing | standalone component | new `rowNames` signal alongside `priceByCoord`; `computed()` for duplicate detection | native inputs bound to signals (matches the editor's existing idiom — gen inputs are plain `input` + signal) |
| FE-2 | `operator/set-editor.ts` | existing | standalone component | `placementAt` consults loaded sets for a sibling label | — |
| FE-3 | `operator/layout-editor.spec.ts`, `set-editor.spec.ts`, `layout-editor.a11y.spec.ts` | existing | Vitest specs | — | — |
| FE-4 | `frontend/e2e/layout-editor.e2e.ts` | existing | mocked-suite Playwright spec | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals; row-name inputs carry
per-row `aria-label`s ("Row A name"), `[appTouchTarget]`, `maxlength="40"`, Tailwind
utilities only (no new SCSS). Editor cell a11y labels keep the grid letter.

**UI shape:** a "Row names" list rendered with the grid in bulk mode (one labelled input
per row, the grid letter as its visual prefix), because the shared canvas's row rail is
`aria-hidden` presentation shared with tourist surfaces — the editor owns its own input
column instead of mutating the shared rail.

## FE↔BE contract

- **New/changed endpoints:** none — `PUT /api/venues/{venueId}/beach-map` keeps its
  shape; `rowLabel` (already `string`) gains a server-enforced 40-code-point bound and
  the client enforces `maxlength` + non-blank fallback to the grid letter before send.
- **Client typing:** existing hand-written `operator-console.model.ts` types, unchanged.
- **Money/date on the wire:** unchanged (prices ride as before).

## Execution status

> **This section is the session-recovery anchor.** Re-read it plus the current stage's
> `riviera-sdlc` reference file after any compaction, before acting.

**Stage pointer:** DONE — merged via PR #725

**Next action:** none — close-out complete (post-merge GitHub-only items: follow-up issue
for mid-season renames, filed at close-out).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | `d8bf530`, PR #725 (draft) |
| 1 — backend length bound (V43 + `SetCommand` + tests) | ✅ | `586b9ce` |
| 2 — mail spot line (`SmtpMailer`) | ✅ | `0a24ed6` |
| 3 — layout-editor row names (FE state + UI + specs) | ✅ | `df4a60d` |
| 4 — set-editor inheritance + e2e | ✅ | `7464f87` (+ docs-freshness `4c9063e`) |
| 5 — gates (CI, review, Sonar) + merge close-out | ✅ | review-fix commit; merged via PR #725 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` fan-out) | three new Javadoc/TSDoc blocks carried issue numbers (§6d; PR #719 precedent) | fixed — review-fix commit |
| F-2 | review (RV-PROC-1) | *Skills consulted* omitted `riviera-local-debug` despite local builds in a cloud session | fixed — review-fix commit |
| F-3 | review | `duplicateRowName` doc overstated the server refusal (real reason: map + pricing tab group rows by label) | fixed — review-fix commit |
| F-4 | review | `seedFrom` normalizes a label-inconsistent row (external writers only) to its leftmost set's label on the next bulk save | accepted — whole-layout replace semantics; the pre-slice behavior reset every label to a bare letter |
| F-5 | review | mail spot line reads `Spot: A, position 3` for unnamed rows (was `Row A`) | deliberate (AC-9); flagged for maintainer judgment in the PR Scope notes |

---

## File structure

- `docs/plans/beach-map-row-names.md` — this plan.
- `platform/src/main/resources/db/migration/V43__set_position_row_label_length.sql` — the CHECK.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueFieldValidation.java` — `requireText(value, field, maxLength)` overload + `MAX_ROW_LABEL_LENGTH`.
- `platform/src/main/java/ai/riviera/platform/venue/application/SetCommand.java` — call the bounded overload.
- `platform/src/test/java/ai/riviera/platform/venue/application/SetCommandTest.java` — new unit test (bound + at-bound acceptance).
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — `overlongRowLabelIs400` + descriptive-label round-trip.
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — descriptive-label round-trip assert (if not covered in the controller IT).
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapLayoutMigrationIT.java` — pin the V43 CHECK.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — drop the literal `Row ` prefix.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SmtpMailerIT.java` — updated body assertion (descriptive label case).
- `frontend/src/app/operator/layout-editor.ts` — `rowNames` state, seed/reset/save wiring, duplicate guard.
- `frontend/src/app/operator/layout-editor.html` — the row-name inputs.
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-4/5/6/7 unit specs.
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — axe over the editor with the new inputs.
- `frontend/src/app/operator/set-editor.ts` — sibling-label inheritance in `placementAt`.
- `frontend/src/app/operator/set-editor.spec.ts` — AC-8.
- `frontend/e2e/layout-editor.e2e.ts` — row-name save + duplicate-guard e2e.
- `frontend/src/app/venue/row-price-label.ts` — docs-freshness patch: the "every venue created in-product" doc line, now the letters are only the unnamed default.

---

## Phase 1 — Backend length bound

**Files:** Create `V43__set_position_row_label_length.sql`, `SetCommandTest.java` ·
Modify `VenueFieldValidation.java`, `SetCommand.java`, `VenueAdminControllerIT.java`,
`BeachMapReplaceIT.java`, `BeachMapLayoutMigrationIT.java`

- [x] **Step 1: Red** — `SetCommandTest`: a 41-code-point label throws; a 40-code-point
  Unicode label (with `·`) is accepted; blank still throws.
  Run: `./gradlew test --tests "*SetCommandTest*"` → FAIL (class doesn't exist / bound not enforced).
- [x] **Step 2: Green** — `VenueFieldValidation.requireText(String, String, int)` using
  `codePointCount`; `MAX_ROW_LABEL_LENGTH = 40`; `SetCommand` calls it. → PASS.
- [x] **Step 3: Red** — IT cases: `overlongRowLabelIs400` (modelled on `blankNameIs400`),
  migration IT `rowLabelLengthCheckRejectsOverlongLabel`, replace round-trip of a
  40-char descriptive label. Write V43. Run the three ITs (Docker needed; skip cleanly
  without). → PASS.
- [x] **Step 4: Regression** — `./gradlew test --tests "*venue*"` (module scope) + the
  structural net if any file moved (none expected).
- [x] **Step 5: Generalization audit** — population: "every write path that persists
  `row_label`" — enumerate `grep -rn "rowLabel\|row_label" platform/src/main/java --include=*.java -l`;
  judge `RowPriceCommand` (lookup key — decide and record) and `JdbcVenues` insert/update
  sites (all funnel through `SetCommand` — confirm). Append to the log.
- [x] **Step 6: Commit** — `Bound beach-map row labels at 40 characters (#723)`.
- [x] **Step 7: Update Execution status** in the same commit window.

## Phase 2 — Mail spot line

**Files:** Modify `SmtpMailer.java`, `SmtpMailerIT.java`

- [x] **Step 1: Red** — `SmtpMailerIT`: confirmation with `rowLabel` "Front row · Sea
  view" must render `Spot: Front row · Sea view, position 3` (no `Row Front row`).
  Run: `./gradlew test --tests "*SmtpMailerIT*"` → FAIL.
- [x] **Step 2: Green** — drop the literal `Row ` from the text block. → PASS.
- [x] **Step 3: Generalization audit** — population: "every mail body rendering
  `rowLabel`" — enumerate `grep -n "rowLabel" platform/src/main/java/ai/riviera/platform/notification -r`;
  cancellation/payment-due carry no spot by design — confirm and record.
- [x] **Step 4: Commit** — `Render the spot line from the row label alone (#723)` +
  Execution status.

## Phase 3 — Layout-editor row names

**Files:** Modify `layout-editor.ts`, `layout-editor.html`, `layout-editor.spec.ts`,
`layout-editor.a11y.spec.ts`

- [x] **Step 1: Red** — unit specs for AC-4 (named row saves), AC-5 (loaded labels
  survive an untouched save), AC-6 (duplicate names block save with copy), AC-7
  (regenerate resets names). Run: `npm test -- layout-editor` → FAIL.
- [x] **Step 2: Green** — `rowNames` signal seeded in `seedFrom` (first set per `gridY`),
  cleared in `generateNow`/`resetForVenue`, consumed in `toRequest`
  (`trim() || gridRowLabel(y)`); duplicate-name `computed()` gating `onSave` with its
  own message; inputs in the template (aria-label, `maxlength="40"`,
  `[appTouchTarget]`, Tailwind utilities). → PASS + a11y spec green.
- [x] **Step 3: Lint/format** — `npm run lint && npm run format:check`.
- [x] **Step 4: Commit** — `Let operators name beach-map rows in the layout editor (#723)` +
  Execution status.

## Phase 4 — Set-editor inheritance + e2e

**Files:** Modify `set-editor.ts`, `set-editor.spec.ts`, `frontend/e2e/layout-editor.e2e.ts`

- [x] **Step 1: Red** — `set-editor.spec.ts`: adding a set at a `gridY` whose loaded
  sets carry "Under the pines" uses that label; an empty row falls back to the grid
  letter. → FAIL.
- [x] **Step 2: Green** — thread the loaded sets into the placement derivation. → PASS.
- [x] **Step 3: e2e** — extend `layout-editor.e2e.ts`: name a row, save, assert the PUT
  body labels; duplicate names surface the guard message. Run
  `npm run test:e2e:a11y -- layout-editor` (mocked suite). → PASS.
- [x] **Step 4: Generalization audit** — population: "every FE site that derives a
  rowLabel to send" — enumerate `grep -rn "gridRowLabel" frontend/src`; judge each
  (editor `toRequest`, set-editor `placementAt`, display-only uses). Record.
- [x] **Step 5: Commit** — `Per-set adds inherit the row's name (#723)` + Execution status.

## Phase 5 — Gates + close-out

- [x] CI green on the PR head; mark ready for review (merge latest `origin/main` first,
  with the routing gate for whatever the integration touches).
- [x] Review gate (`/code-review` ladder + `riviera-review-overlay`); findings re-enter
  at Implement.
- [x] Sonar gate: pull the new-issue + duplication list from the API; clear it.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc staged).
- [x] Merge close-out per `references/pr-gates.md` §3, incl. `riviera-docs-freshness`
  over the merged range, filing the mid-season-rename follow-up issue, and finalizing
  this doc (`merged via PR #NN`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-20 | phase 1 (length bound) | every backend site handling `rowLabel`/`row_label` | `grep -rln "rowLabel\|row_label" platform/src/main/java --include="*.java"` + same over `src/main/resources` | 31 Java files + 4 migrations | Only write funnel is `SetCommand` (bulk replace, per-set add/edit all construct it) — bounded there. `RowPriceCommand`'s label is a lookup key, never persisted: an overlong key matches no row → typed `NO_SUCH_ROW`; no bound added. All other sites read/display. Migrations: V3 seed max 20 chars < 40, verified by `BeachMapLayoutMigrationIT`. |
| 2026-08-20 | phase 2 (mail spot line) | every mail renderer of `rowLabel` | `grep -rn "Row \|rowLabel" platform/src/main/java/ai/riviera/platform/notification/` + `grep -rln "sendBookingConfirmation" platform/src/main/java` | `SmtpMailer` (renders), `MockMailer` (no body), cancellation/payment-due mails (no spot, by documented design), facts/listener/resend (carry, don't render) | `SmtpMailer` fixed; nothing else renders a spot line. |
| 2026-08-20 | phase 4 (FE label derivation) | every FE site deriving a `rowLabel` it *sends* | `grep -rn "gridRowLabel" frontend/src --include="*.ts"` | `layout-editor.toRequest` (fixed, phase 3), `set-editor placementAt` (fixed, phase 4); remaining hits are display/a11y rail codes and cell labels — deliberately positional (editor navigation), unchanged | both senders fixed; display sites unchanged by design. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..3:** `gradle test --tests "*SetCommandTest*" --tests "*BeachMapReplaceIT*" --tests "*BeachMapLayoutMigrationIT*"` → PASS locally (Testcontainers) at `586b9ce`; full suite green in PR CI at `4c9063e`.
- [x] **AC-4..7:** `npm test` (Vitest, all 1520) → PASS at `df4a60d`/`7464f87`; mocked e2e `layout-editor` suite 6/6 → PASS at `7464f87`.
- [x] **AC-8:** `npm test` (set-editor specs) → PASS at `7464f87`.
- [x] **AC-9:** `gradle test --tests "*SmtpMailerIT*"` → PASS at `0a24ed6`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section filled; no availability write path touched (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [x] **Payment/payout** N/A holds — no money semantics changed.
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6).
- [x] Booking codes untouched (invariant #7).
- [x] Flyway migration present + CHECK tested (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] **Close-out written in THIS PR** (`merged via PR #NN`).
- [x] **The review gate ran in full** per the invocation ladder.
