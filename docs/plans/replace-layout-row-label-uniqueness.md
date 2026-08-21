# Replace-layout row-label uniqueness (#728) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `replaceLayout` refuses a submitted layout in which one `rowLabel` appears
under two distinct `gridY` values — the one-label-one-physical-row rule `renameRow`
already enforces as `ROW_NAME_TAKEN` — so the rule is server-enforced, not
browser-suggested (#728).

**Architecture:** The check is a third intra-batch pass on the already-parsed
`LayoutCommand`, but as its own method (`splitsRowLabel()`) rather than a widened
`duplicateWithin()`: that method's return type is `Venues.Conflict`, the DB-conflict
vocabulary shared with the single-set path and `JdbcVenues.findConflict`, where a split
label can never arise (no DB constraint can see it — the reason the browser was the only
guard). The rejection is a new `ReplaceRejection.ROW_NAME_TAKEN` constant (→ 409),
reusing the rename path's token for the same domain rule.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched —
application-level validation only; the issue records why no DB backstop exists (a
`UNIQUE` cannot express "one `row_label` per `grid_y` group").

**Source of intent:** GitHub issue #728.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the issue matches today's code, no in-flight overlap, no Flyway number needed) ·
`riviera-plan-doc` (this template — forced the false-positive AC and the parity ledger
N/A call) · `tdd` (unit red-green first, then the HTTP-level pinning IT) ·
`riviera-review-overlay` (review gate — at ready-for-review) · `riviera-docs-freshness`
(due at close-out: `RESPONSIBILITIES.md` §`venue` says the rule is a rename-only refusal)
· `riviera-modulith` (all inside `venue.application`/`adapter/in` — no published-surface
or boundary change; `ReplaceRejection` is module-internal) · `riviera-java-conventions`
(typed-outcome rejection, no exception; §6b `ApiProblem` 409 with stable `code`; §6c/6d
comment discipline) · `riviera-local-debug` (scoped Gradle runs in the cloud sandbox).

**Branch:** `claude/sdlc-728-1oorrt` — the session's designated remote branch, standing
in for `bugfix/replace-layout-row-label-uniqueness` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a layout command carrying `rowLabel` "A" on grid row 1 (positions
  2 and 3) and `rowLabel` "A" on grid row 2 (position 1) — no `(rowLabel, positionNo)`
  or `(gridX, gridY)` pair colliding — when `replaceLayout` runs, then the outcome is
  `Rejected(ROW_NAME_TAKEN)` and nothing is deleted, inserted, or version-bumped.
  *Pinned by:* `VenueAdminServiceTest.rejectsALayoutSharingOneLabelAcrossTwoGridRows`
- [x] **AC-2:** Given the same shape submitted as a real `PUT /api/venues/{v}/beach-map`
  by the owning operator, when the request is processed, then the response is
  `409` with problem `code` `ROW_NAME_TAKEN` and the venue's stored layout is unchanged.
  *Pinned by:* `BeachMapReplaceIT.rejectsRowLabelSharedByTwoGridRows`
- [x] **AC-3:** Given a layout that has BOTH a duplicate `(rowLabel, positionNo)` pair
  and a split label, when `replaceLayout` runs, then `DUPLICATE_POSITION` is reported —
  the existing pass order (positions, cells, then labels) is preserved.
  *Pinned by:* `VenueAdminServiceTest.duplicatePositionOutranksTheSplitLabel`
- [x] **AC-4:** Given a layout whose one row "A" carries non-dense position numbers
  (2 and 3 only, gap at 1) on a single grid row, when `replaceLayout` runs, then the
  replace succeeds — same-row repetition of a label is never a false positive.
  *Pinned by:* `VenueAdminServiceTest.acceptsOneLabelSpanningManyPositionsOnOneGridRow`

## Non-goals

- No frontend change. The layout editor's `duplicateRowName` signal already blocks the
  state before save (`layout-editor.ts:543`), so the new 409 is unreachable from the UI;
  its comment "the server would refuse it anyway" simply becomes true. `LayoutErrorCode`
  deliberately does not learn the new code — an unknown code falls to the honest generic
  fallback, and only a non-browser client can reach it.
- No DB constraint. The issue records why: "one `row_label` per `grid_y` group" is not
  expressible as a simple `UNIQUE`; the application check is the enforcement point,
  matching the rename path (which is likewise application-enforced).
- No check for the converse (two labels sharing one `gridY`): a distinct pre-existing
  question about what a "row" is, not this defect, and the FE cannot produce it either.
- No change to the rename path (#723/#726) — it is already correct.

## Behavior-parity ledger

N/A — no surface retired or replaced; one write path gains a refusal for a state that
was always invalid (every label-grouping read surface already merges such rows wrongly).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | False positive: a legitimate layout (one label, many positions, one grid row — dense or gapped) gets refused, breaking every editor save | low | high | AC-4 unit test + the existing `BeachMapReplaceIT`/`VenueAdminServiceTest` green suites, which all use per-row labels | session | closed — `1a08817` |
| R-2 | The new enum constant breaks an exhaustive `switch` elsewhere | low | low | Compiler-enforced; grep shows the only `ReplaceRejection` switch is `VenueAdminController.error(...)` — the new 409 case lands with the constant | session | closed — `1a08817` |
| R-3 | Check ordering drift: rejecting on the label before the position/cell passes changes reported codes for layouts with multiple defects | low | low | AC-3 pins the order (positions → cells → labels, mirroring `duplicateWithin`'s documented priority) | session | closed — `1a08817` |

## Open questions / Assumptions

### Resolved

- **Assumption:** reusing the token `ROW_NAME_TAKEN` (rather than minting e.g.
  `ROW_NAME_SPLIT`) is right for the replace path — same domain rule, same 409 family,
  and any future FE mapping reuses the rename copy. — *Resolved:* yes, in `1a08817`;
  `SetRejection`'s constant stays rename-only and each enum documents its own
  manifestation.
- **Assumption:** `gridY` is the row identity within a submitted batch (the FE derives
  one label per grid row). — *Resolved:* confirmed against `LayoutEditor.toRequest()`
  and the grid semantics of `set_position` (V2/V12); pinned by AC-4 in `1a08817`.

## Availability & concurrency (invariant #2)

The slice touches the beach map's bulk write path, but only its **pre-validation**: the
new check runs on the parsed command before the optimistic-lock read, the set-row locks,
and the claim probe, exactly like `duplicateWithin()` today. No write path to
`availability(set_id, booking_date)` changes; the reject-unless-unclaimed probe, the
`set_version` token discipline, and the lock ordering (venue row before set rows) are
untouched. `BeachMapReplaceConcurrencyIT` continues to pin the race behavior. A refused
split-label layout returns before any lock beyond ownership is taken, so it cannot hold
or strand a claim.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `BeachMap` | The beach-map layout and its write validation are `venue`'s Job (`RESPONSIBILITIES.md` §`venue`); the rename twin of this rule already lives in `VenueAdminService` |

**Cross-module named interfaces (`api/` ports):** none touched — `LayoutCommand`,
`ReplaceRejection`, `VenueAdminService` are `venue.application` internals;
`VenueAdminController` is `venue.adapter/in`. No published surface changes.

**Domain events:** none — the replace path publishes nothing.

### Module ownership (§4a)

All in `venue`, no boundary change: intra-batch layout validation joins the existing
`duplicateWithin()` checks beside the rename path's identical rule; no other module
claims layout-write validation (invariant #13's ownership check stays first, via
`operator`'s existing port).

## Payment & payout

N/A — no payment in scope; prices pass through the layout write unchanged.

## Angular — frontend surfaces touched

N/A — backend-only (see Non-goals: the client-side guard already prevents the state;
the unknown-code fallback message is the accepted behavior for non-browser clients).

## FE↔BE contract

- **Changed endpoint:** `PUT /api/venues/{venueId}/beach-map` gains one rejection:
  `409` `application/problem+json` with `code: "ROW_NAME_TAKEN"` when one submitted
  `rowLabel` spans two distinct `gridY` values. No request-shape change.
- **Client typing:** unchanged by choice — `LayoutErrorCode` keeps its current union;
  the FE guard makes the code unreachable from the browser (Non-goals).

## Execution status

**Stage pointer:** PR — merge latest `origin/main`, mark ready for review, then the
review + Sonar gates (`references/pr-gates.md`).

**Next action:** confirm CI green on the phase-2 push, mark PR #730 ready for review,
run `/code-review` + `riviera-review-overlay`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc committed | ✅ | `69f1bae` |
| 1 — Unit red-green: `LayoutCommand.splitsRowLabel()` + `ReplaceRejection.ROW_NAME_TAKEN` + service check + controller 409 | ✅ | `1a08817` |
| 2 — HTTP pinning IT + javadoc/docs sweep | ✅ | see PR #730 (phase-2 commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/replace-layout-row-label-uniqueness.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutCommand.java` — `splitsRowLabel()` + record javadoc
- `platform/src/main/java/ai/riviera/platform/venue/application/ReplaceRejection.java` — new `ROW_NAME_TAKEN` constant + status-map javadoc
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — the check in `replaceLayout`
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — `replaceLayout` javadoc gains the rule
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — 409 case for the new constant
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-1, AC-3, AC-4
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — AC-2
- `RESPONSIBILITIES.md` — §`venue`: the rule is no longer a rename-only refusal

---

## Phase 1 — Unit red-green (AC-1, AC-3, AC-4)

**Files:** Modify `LayoutCommand.java`, `ReplaceRejection.java`, `VenueAdminService.java`,
`VenueAdminController.java` · Test `VenueAdminServiceTest.java`

- [x] **Step 1: Write the failing AC-1 test** — the issue's exact reproducer shape
  (gap-cell position numbering), against the service's public port.
- [x] **Step 2: Run it, verify it fails** — red: `ClassCastException` (outcome was
  `Replaced`, not `Rejected`) at the AC-1 assertion.
- [x] **Step 3: Minimal implementation** — `splitsRowLabel()` on `LayoutCommand`
  (first label seen under two distinct `gridY` values), checked in
  `VenueAdminService.replaceLayout` after `duplicateWithin()`, returning the new
  `ReplaceRejection.ROW_NAME_TAKEN`; `VenueAdminController.error(ReplaceRejection)`
  gains the 409 case (compiler-forced).
- [x] **Step 4: AC-3 + AC-4 red-green, then package regression** — green:
  `VenueAdminServiceTest` (64 tests), the structural net, and
  `ai.riviera.platform.venue.application.*`.
- [x] **Step 5: Generalization-audit pass** — see log (`addSet`/`editSet` surfaced for
  triage, not widened into this slice).
- [x] **Step 6: Commit** — `1a08817`.
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — HTTP pinning IT + docs sweep (AC-2)

**Files:** Test `BeachMapReplaceIT.java` · Modify `EditBeachMap.java` (javadoc),
`RESPONSIBILITIES.md`

- [x] **Step 1: Write the AC-2 IT** — owner PUTs the reproducer layout → 409
  `ROW_NAME_TAKEN`, stored layout unchanged.
- [x] **Step 2: Run** — green against the session dockerd: 16 tests, 0 failures,
  0 skipped (`rejectsRowLabelSharedByTwoGridRows` ran for real).
- [x] **Step 3: Docs** — `EditBeachMap#replaceLayout` javadoc names the refusal;
  `RESPONSIBILITIES.md` §`venue` records the replace-path enforcement (and the
  still-unchecked `addSet`/`editSet` paths, surfaced on #728).
- [x] **Step 4: Commit + execution status; run**
  `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | Phase 1 (`1a08817`) | Every write path that persists or mutates `row_label` — each could mint or merge a label identity | `git grep -n "INSERT INTO set_position\|UPDATE set_position" -- 'platform/src/main/java/*.java'` → `JdbcVenues` `INSERT_SET_SQL` (addSet + insertSets/replace), `updateSet`, `renameRow` (reprice writes no label) | 4 application paths: `addSet`, `editSet`, `renameRow`, `replaceLayout` | `renameRow` already enforces; `replaceLayout` fixed here. `addSet`/`editSet` share the API-level hole (a single set placed with an existing label on a DIFFERENT `gridY` merges rows the same way) — but same-label-same-row placement is the legitimate common case, the FE set editor can't produce the cross-row join, and the refusal needs its own label→gridY read; surfaced on #728 at close-out for maintainer triage rather than silently widening this slice. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-3/AC-4:** `gradle test --tests "*VenueAdminServiceTest*"` → green
  (64 tests, 3 new). Verified at `1a08817`.
- [x] **AC-2:** `gradle test --tests "*BeachMapReplaceIT*"` → green against real Postgres
  (16 tests, 0 skipped). Verified at the phase-2 commit.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; no concurrency behavior changed, existing ITs pin it (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module imports added; no events touched (invariant #11).
- [ ] **Payment/payout** N/A; prices flow through unchanged (invariant #5 untouched).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no Flyway migration (invariant #12 honored by absence).
- [ ] **Frontend** untouched by design (Non-goals).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here,
      citing `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
