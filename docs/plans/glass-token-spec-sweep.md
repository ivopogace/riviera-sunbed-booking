# Glass-token contrast-spec sweep (#465) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No contrast spec declares (or inlines) a local copy of a card-glass/soft-ink
value that `frontend/src/testing/glass-tokens.ts` exports; `npm test` stays green with
unchanged computed values.

**Architecture:** Pure test-side refactor. `glass-tokens.ts` already exports
`RIVIERA_CARD_GLASS`, `PORCELAIN_CARD_GLASS`, `CARD_INK_SOFT_ALPHA` (promoted in PR #464,
finding F-9); this slice points every spec that hand-copies those values at the exports
and deletes the local copies, restoring the file's "ONE test-side mirror" charter for the
card-glass family. No production code, no thresholds, no computed values change.

**Persistence:** N/A — frontend test files only (invariant #1 untouched).

**Source of intent:** GitHub issue #465 (deferred from PR #464 review finding F-9,
register in `docs/plans/checkout-legal-links.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill
widened the sweep from the issue's 4 named specs to **17** carrying copies) ·
`riviera-plan-doc` (this template — proportional short form for a mechanical slice) ·
`tdd` (green-to-green refactor: full Vitest run before and after must both pass with
identical spec counts) · `riviera-review-overlay` (review gate — after PR ready) ·
`riviera-docs-freshness` (N/A — test-internal refactor; no substrate doc states which
specs import the tokens) · `riviera-frontend` (spec files stay colocated with their
components; `src/testing/` is the shared test-fixture home) · `angular-developer` +
angular-cli MCP (`list_projects` + `get_best_practices` — confirms Vitest/jsdom, v22;
no component code touched) · `playwright-cli` (N/A — no user-facing behaviour change,
unit contrast specs only, no e2e surface).

**Branch:** `claude/angular-mcp-integration-yp8qr2` (cloud session — the designated
remote branch stands in for `bugfix/glass-token-spec-sweep` per the riviera-sdlc
remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the sweep is complete, when grepping `frontend/src` for
  `alpha: 0.78`/`alpha: 0.55` card-glass literals and local `CARD_INK_SOFT_ALPHA`/
  `INK_SOFT_ALPHA` declarations outside `glass-tokens.ts`, then no contrast spec
  declares a local constant (or object literal) duplicating an exported card-glass/
  soft-ink value. *Pinned by:* grep sweep recorded in AC verification (a structural
  fact; no runtime test can see source-level duplication).
- [ ] **AC-2:** Given the refactor, when `npm test` runs, then all suites pass with the
  same test count as before the change (pure refactor — no threshold or computed value
  changes). *Pinned by:* the full Vitest run before/after.
- [ ] **AC-3:** Given the operator specs' porcelain-only shape, when they assert, then
  they use the imported `PORCELAIN_CARD_GLASS` and `CARD_INK_SOFT_ALPHA` (the inline
  `0.78` soft-ink argument was a hand-copy too — the issue names it for
  `daily-view-tab`/`requests-tab`). *Pinned by:* same grep sweep + green run.

## Non-goals

- Promoting the `--riv-card-ink-faint` alpha (`0.72`, copied in 6+ operator specs) into
  `glass-tokens.ts` — it is **not** currently exported, so it is outside this issue's AC
  ("constants that `glass-tokens.ts` exports"); recorded as a follow-up candidate in the
  PR description rather than widening a pure-refactor slice.
- Touching `booking-dialog`'s `DIALOG_GLASS` (0.82) / `find-booking`'s `PANEL_GLASS`
  (0.82) — deliberately different surfaces, not copies of an export (only their soft-ink
  alpha copies migrate).
- Rewording `it()` description strings that cite token values — prose, not constants.
- Any change to `styles.scss`, components, thresholds, or computed contrast values.

## Behavior-parity ledger

N/A — test-side refactor; no user-facing surface retired or replaced. Parity is AC-2:
identical test count, all green, values unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A "copy" is actually a deliberately different value (e.g. the 0.82 modal panels) and blind replacement changes what a spec proves | low | med | Grill pass classified all 19 candidate files; 0.82 panels + field alphas + 0.72 faint left untouched | session | closed — test count and results identical before/after (126 files / 979 tests) |
| R-2 | Removing constants strands an unused import (`WHITE`) and fails lint | med | low | Usage-checked per file up front; `npm run lint` before commit | session | closed — lint clean at phase-0 commit |

## Open questions / Assumptions

- **Assumption:** inline `0.78` soft-ink arguments in operator specs count as the
  hand-copies the issue targets (it explicitly lists `daily-view-tab`/`requests-tab`,
  whose only soft-ink copy is inline). — *Owner:* session · *Resolves by:* review gate.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; no backend, no booking flow, test files only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

No components touched. Files are Vitest contrast specs only (17, listed under File
structure); the shared fixture `src/testing/glass-tokens.ts` is unchanged (already
exports everything needed).

**Standards:** N/A — no component/template/service code in the diff.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** PR — draft open, awaiting CI on the phase-0 push

**Next action:** check the push's CI run; if green, mark ready for review and run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — import swap across 17 specs + green run | ✅ | see PR #TBD (single commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

All modifications; nothing created:

- `frontend/src/app/auth/auth-page.contrast.spec.ts` — full triple → imports
- `frontend/src/app/booking/booking-pay.contrast.spec.ts` — full triple → imports
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — full triple → imports
- `frontend/src/app/booking/booking-confirmation.contrast.spec.ts` — full triple → imports
- `frontend/src/app/booking/request-confirmation.contrast.spec.ts` — full triple → imports
- `frontend/src/app/booking/my-bookings.contrast.spec.ts` — full triple → imports
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — soft-ink alpha → import
- `frontend/src/app/booking/find-booking.contrast.spec.ts` — local `INK_SOFT_ALPHA` → imported `CARD_INK_SOFT_ALPHA`
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — full triple → imports
- `frontend/src/app/pages/home/home.contrast.spec.ts` — full triple → imports
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — local `CARD_GLASS` → `PORCELAIN_CARD_GLASS`; inline 0.78 → `CARD_INK_SOFT_ALPHA`
- `frontend/src/app/operator/requests-tab.contrast.spec.ts` — same
- `frontend/src/app/operator/pricing-tab.contrast.spec.ts` — same
- `frontend/src/app/operator/venue-tab.contrast.spec.ts` — same
- `frontend/src/app/operator/payouts-tab.contrast.spec.ts` — same
- `frontend/src/app/operator/console-stats-strip.contrast.spec.ts` — same
- `frontend/src/app/operator/layout-editor.contrast.spec.ts` — same
- `docs/plans/glass-token-spec-sweep.md` — this plan

---

## Phase 0 — Import swap + green run

**Files:** the 17 specs above.

- [ ] **Step 1: Baseline** — `npm test` green before touching anything (records the
  spec count the refactor must preserve).
- [ ] **Step 2: Apply the swap** per File structure (delete local constants, extend the
  existing `glass-tokens` import, drop `WHITE` where it becomes unused).
- [ ] **Step 3: Verify** — `npm run lint` + `npm test` → same count, all green.
- [ ] **Step 4: Grep sweep (AC-1/AC-3)** — no residual copies.
- [ ] **Step 5: Commit** — `test: point contrast specs at glass-tokens exports (#465)`.
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-31 | intake grill | local copies of exported glass tokens | `grep -n '0.78\|0.55\|CARD_GLASS\|INK_SOFT' frontend/src` | 17 specs (vs 4 in the issue) | fix all 17; 0.72 faint + 0.82 panels deliberately excluded (Non-goals) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-3:** grep sweep → no local card-glass/soft-ink copies outside `glass-tokens.ts`.
- [ ] **AC-2:** `npm test` → all green, same count as baseline.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying check.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Backend invariants (#1–#12): untouched — frontend test files only.
- [ ] **Frontend** standards met — no component code changed; no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
