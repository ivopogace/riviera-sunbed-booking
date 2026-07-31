# Card-ink-faint token promotion + sweep (#468) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session-recovery anchor:** re-read the **Execution status** section below before
> acting after any context compaction or in a fresh session.

**Goal:** `frontend/src/testing/glass-tokens.ts` exports `CARD_INK_FAINT_ALPHA` (`0.72`,
the `--riv-card-ink-faint` alpha) and no contrast spec carries a hand-copy of it — a
faint-ink retune in `styles.scss` becomes a one-line test-side edit instead of nine.

**Architecture:** Pure test-side refactor, the two-step of #464 (promote) + #465 (sweep)
collapsed into one slice — the same shape #465 used for the card-glass family, applied to
its last un-promoted sibling. `glass-tokens.ts` is the project's **ONE test-side mirror**
of the `styles.scss` glass tokens (charter extracted at the #135 review); the faint-ink
alpha is the only `--riv-card-*` value the file has never exported, so it stayed
hand-copied. No production code, no thresholds, no computed values change.

**Persistence:** N/A — frontend test files only (invariant #1 untouched).

**Source of intent:** GitHub issue #468 (deferred from PR #467 / issue #465's sweep;
recorded there under Non-goals).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill
widened the sweep from the issue's **8** named specs to **9**: `home.contrast.spec.ts`
carries a local `CARD_INK_FAINT_ALPHA` the issue's enumeration missed) ·
`riviera-plan-doc` (this template — proportional short form for a mechanical slice) ·
`tdd` (green-to-green refactor: a full Vitest run before and after must pass with
identical file/test counts) · `riviera-frontend` (placement: specs stay colocated with
their components; `src/testing/` is the shared test-fixture home — confirms the promotion
target is the right file and no folder moves) · `angular-developer` + angular-cli MCP
(`list_projects` → Angular **22**, Vitest, `styleLanguage: scss`; `get_best_practices`
→ no component/template/service code in the diff, so no v22 standard applies;
`search_documentation "unit testing"` → angular.dev/guide/testing, confirms the
builder-owned unit-test setup this repo already uses — no config change needed) ·
`riviera-local-debug` (frontend recipe: `npm run lint` + `npm test`; no Gradle in scope) ·
`riviera-review-overlay` (review gate — after PR ready) · `riviera-docs-freshness`
(merge close-out) · `playwright-cli` (**N/A** — no user-facing behaviour change, unit
contrast specs only, no `frontend/e2e/` surface) · `postgres` / `riviera-modulith` /
`riviera-java-conventions` / `riviera-stripe-payments` (**N/A** — no DB, no backend,
no money).

**Branch:** `claude/angular-mcp-search-document-1f4b4z` (cloud session — the designated
remote branch stands in for `bugfix/card-ink-faint-token-promotion` per the riviera-sdlc
remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the promotion, when `glass-tokens.ts` is read, then it exports
  `CARD_INK_FAINT_ALPHA = 0.72` beside `CARD_INK_SOFT_ALPHA`, with a TSDoc naming the
  `--riv-card-ink-faint` token it mirrors. *Pinned by:* the export compiling as an import
  in nine specs (a missing/renamed export fails `npm test` at type-check).
- [ ] **AC-2:** Given the sweep, when grepping `frontend/src` for local
  `CARD_INK_FAINT_ALPHA` declarations and bare `0.72` arguments in the faint-ink
  position, then zero hits remain outside `glass-tokens.ts`. *Pinned by:* the grep sweep
  recorded under AC verification (a structural fact; no runtime test can see
  source-level duplication).
- [ ] **AC-3:** Given the refactor, when `npm test` runs, then every suite passes with the
  same file and test counts as the pre-change baseline — no threshold and no computed
  contrast value changes. *Pinned by:* the full Vitest run before/after.
- [ ] **AC-4:** Given the two `0.72` literals that are **not** this token, when the sweep
  is applied, then they remain inline and unchanged: `home.contrast.spec.ts`'s
  `heroScrim` (`home.scss`'s `rgba(8,38,52,0.72)`) and `glass-tokens.ts`'s
  `RIVIERA_HEADER_GLASS` (`--riv-header-glass`). *Pinned by:* diff review + AC-3's
  unchanged results (a wrong substitution would move a computed ratio).

## Non-goals

- Promoting `FIELD_BORDER_ALPHA` (`0.55`, copied in **5** specs) or `FIELD_FILL_ALPHA`
  into `glass-tokens.ts` — same drift class, **different token family**, and outside this
  issue's AC ("the `--riv-card-ink-faint` alpha"). `FIELD_FILL_ALPHA` additionally carries
  a **deliberate fork** (`venue-map` uses `0.9` for its near-opaque date field, not
  `0.55`), so it needs the per-site classification a follow-up slice can give it — exactly
  the R-1 risk this slice's Non-goals exist to avoid. Recorded in the Generalization-audit
  log; a follow-up issue is filed at merge close-out. (Mirrors how #465 deferred *this*
  token to #468 rather than widening a pure-refactor slice.)
- Touching the single-use local alphas (`BACK_FILL_ALPHA`, `BANNER_TINT_ALPHA`,
  `CHIP_TEAL_ALPHA`, `CARD_TRACK_ALPHA`) or the deliberately-different `0.82` panel
  glasses (`booking-dialog`'s `DIALOG_GLASS`, `find-booking`'s `PANEL_GLASS`) — one
  call site each, or not copies of an export.
- Rewording `it()` description strings and header docblocks that cite `0.72` as prose —
  they document the token's value for a human reader; they are not constants. (Same
  non-goal #465 held.)
- Any change to `styles.scss`, components, thresholds, or computed contrast values.

## Behavior-parity ledger

N/A — test-side refactor; no user-facing surface retired or replaced. Parity is AC-3:
identical file/test counts, all green, computed values unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A `0.72` is a coincidental collision, not the faint ink, and blind replacement silently changes what a spec proves | med | med | Every `0.72` in `frontend/` classified before editing (grep + read of each site); the two non-token hits are pinned as AC-4 | session | closed — both collisions left inline (AC-4 verified); test counts and results identical before/after |
| R-2 | Deleting a local constant strands an unused import or leaves an unused local, failing `npm run lint` | low | low | The four local-const specs already import from `glass-tokens`; usage-checked per file, `npm run lint` before commit | session | closed — `npm run lint` clean at the phase-0 commit; `venue-map`'s orphaned section-header comment reattached to the constants that remain |
| R-3 | The issue's site list is incomplete, so the sweep leaves a copy behind and the charter stays broken | med | low | Intake grill re-derived the list from source (9, not 8); AC-2's grep sweep is the check, not the issue text | session | closed — `home.contrast.spec.ts` found and added to scope at intake |

## Open questions / Assumptions

### Resolved

- **Assumption:** bare `0.72` arguments in the five operator specs are hand-copies the
  issue targets, equivalent to the four named local constants — **confirmed** at intake:
  each sits in the `inkAlpha` position of `expectAaOverStops(CARD_INK, …,
  PORCELAIN_CARD_GLASS, PORCELAIN_STOPS)` under an `it()` title naming
  `--riv-card-ink-faint`. This is the same widening #465 confirmed at its review gate for
  the inline `0.78` soft-ink arguments.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; no backend, no booking flow, test files only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only; no backend Java in the diff.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

No components, templates, services, or routes touched. The diff is nine Vitest contrast
specs plus the shared fixture `src/testing/glass-tokens.ts` (the `src/testing/` shared
test-fixture home per `riviera-frontend`; specs stay colocated with their components).

**Standards:** N/A — no component/template/service code in the diff, so the v22 component
standards (signals, `input()`/`output()`, native control flow, no `@HostBinding`) have no
surface here. TypeScript standard that does apply: no `any`; the export is an inferred
`number` literal-typed const, matching `CARD_INK_SOFT_ALPHA` beside it.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** PR — draft open, awaiting the Review + Sonar gates

**Next action:** mark the PR ready for review, then run `/code-review` + `riviera-review-overlay`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — promote `CARD_INK_FAINT_ALPHA` + swap 9 specs + green run | ✅ | phase-0 commit on `claude/angular-mcp-search-document-1f4b4z` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

All modifications; nothing created (besides this plan):

**Promotion (1):**

- `frontend/src/testing/glass-tokens.ts` — add `export const CARD_INK_FAINT_ALPHA = 0.72`
  with its TSDoc, beside `CARD_INK_SOFT_ALPHA`.

**Sweep — local constant deleted, import extended (4):**

- `frontend/src/app/pages/home/home.contrast.spec.ts` *(not in the issue's list — added at intake)*
- `frontend/src/app/booking/booking-pay.contrast.spec.ts`
- `frontend/src/app/venue/venue-map.contrast.spec.ts`
- `frontend/src/app/auth/auth-page.contrast.spec.ts` — two use sites (the AA-over-stops
  row and the option-card blurb `composite(...)`)

**Sweep — bare `0.72` argument → imported constant (5):**

- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts`
- `frontend/src/app/operator/requests-tab.contrast.spec.ts`
- `frontend/src/app/operator/payouts-tab.contrast.spec.ts`
- `frontend/src/app/operator/console-stats-strip.contrast.spec.ts`
- `frontend/src/app/operator/layout-editor.contrast.spec.ts`

**Untouched by design (AC-4):** `home.contrast.spec.ts`'s `heroScrim` `0.72`;
`glass-tokens.ts`'s `RIVIERA_HEADER_GLASS` `0.72`.

- `docs/plans/card-ink-faint-token-promotion.md` — this plan.

---

## Phase 0 — Promote + sweep + green run

**Files:** the ten above.

- [x] **Step 1: Baseline** — `npm test` green before touching anything (126 files / 979
  tests — the counts the refactor must preserve).
- [x] **Step 2: Promote** — export `CARD_INK_FAINT_ALPHA` from `glass-tokens.ts`.
- [x] **Step 3: Apply the swap** per File structure (extend each `glass-tokens` import,
  delete the four local constants, replace the five bare arguments).
- [x] **Step 4: Verify** — `npm run lint` clean; `npm test` → 126 / 979, all green.
- [x] **Step 5: Grep sweep (AC-2/AC-4)** — no residual copies; both non-token `0.72`s intact.
- [x] **Step 6: Commit + push + open the draft PR** (CI fires on `pull_request` only).
- [x] **Step 7: Update this plan's Execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-31 | intake grill | hand-copies of the faint-ink alpha | `grep -rn 'CARD_INK_FAINT\|card-ink-faint\|0\.72' frontend` | **9** specs (vs 8 in the issue) + 2 non-token `0.72`s | fix all 9; the 2 collisions pinned as AC-4 |
| 2026-07-31 | intake grill | any remaining hand-copied `styles.scss` token constant in contrast specs | `grep -rn '^const [A-Z_]*ALPHA = \|^const [A-Z_]*GLASS: Glass = ' --include='*.contrast.spec.ts'` | `FIELD_BORDER_ALPHA` ×5 (all `0.55`); `FIELD_FILL_ALPHA` ×5 (**4× `0.55`, 1× `0.9`** — `venue-map`'s near-opaque date field is a deliberate fork); 4 single-use locals; 2 `0.82` panel glasses | out of scope (Non-goals) — different token family, and the fork needs per-site classification; **follow-up issue filed at merge close-out** |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `glass-tokens.ts:32` exports `CARD_INK_FAINT_ALPHA = 0.72` with its
      `--riv-card-ink-faint` TSDoc, beside `CARD_INK_SOFT_ALPHA`; imported by all nine specs
      (type-checked by the green run).
- [x] **AC-2:** grep sweep → zero `const CARD_INK_FAINT_ALPHA` declarations and zero
      `CARD_INK, 0.72` arguments outside `glass-tokens.ts`. The five surviving `0.72`
      occurrences in specs are `it()` title prose (explicit Non-goal).
- [x] **AC-3:** `npm test` → **126 files / 979 tests**, identical to the pre-change
      baseline; `npm run lint` clean.
- [x] **AC-4:** both non-token literals unchanged — `home.contrast.spec.ts:88`
      (`heroScrim`) and `glass-tokens.ts:23` (`RIVIERA_HEADER_GLASS`); neither appears in
      the diff.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying check.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Backend invariants (#1–#13): untouched — frontend test files only.
- [ ] **Frontend** standards met — no component code changed; no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state cites the merging PR.
- [ ] **The review gate ran in full** — the `/code-review` fan-out *plus* `riviera-review-overlay`.
