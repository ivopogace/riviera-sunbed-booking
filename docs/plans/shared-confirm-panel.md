# Shared confirm panels + focus helper Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bulk-regenerate confirmation the deliberate focus management the other
confirm surfaces already have (WCAG 2.4.3), and land it as two shared components plus one
shared focus helper rather than a sixth copy-paste.

**Architecture:** The single most significant decision is that the repo's confirm surfaces are
**two families, not one** — the operator pair (amber `alertdialog` card, boolean state, no reason
field, 12.5px) and the admin pair (bare block inside an existing row card, reason input, keyed
state, 14px). They share only the two-button shape, so they get **two components**
(`shared/confirm-panel`, `shared/confirm-with-reason`) instead of one component with a `variant`
axis, which would have imposed visual + ARIA drift on shipped admin surfaces. The genuinely
uniform thing — the byte-identical `focusAfterRender` helper, duplicated **five** times — becomes
one `shared/` function adopted by all six call sites.

**Persistence:** N/A — frontend-only, no backend or schema change.

**Source of intent:** GitHub issue #604 (deferred from #600's generalization audit, recorded in
`docs/plans/per-set-beach-map-editing.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
duplicated helper is **five** copies not three, and that the "near-identical" panels are two
families, which reshaped the whole slice) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger, which is where the deliberate `min-h-11` and `role="alertdialog"` gains
got recorded instead of shipping silently) · `tdd` (each phase writes the focus/ARIA spec red
before the component exists) · `riviera-review-overlay` (review gate — RV-FE-E2E consulted at
plan time for spec placement; full run due at ready-for-review) · `riviera-docs-freshness`
(N/A — no substrate doc states anything about confirm-panel internals; re-checked at close-out) ·
`riviera-frontend` (placement: both components are pure presentational primitives with no HTTP and
no app state, so `shared/` is their address; confirmed no new cross-feature edge) ·
`riviera-tailwind` (share at the component layer, never `@apply`; retain every `data-testid` as an
inert test hook; the no-drift rule is what turned the host-element question into R-2) ·
`angular-developer` + angular-cli MCP (v22 APIs — `input()`/`output()`/`model()`; the
`search_documentation` hit on content projection carried the decisive caveat, see R-1) ·
`playwright-cli` (RV-FE-E2E requires e2e for the changed flow, not just a unit spec — Phase 3) ·
`riviera-local-debug` (Windows dev machine: `npm test`, `npm run test:e2e:a11y` for the mocked suite)

**Branch:** `feature/shared-confirm-panel` — created before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the bulk beach-map tab showing an existing grid, when the operator activates
  **Generate**, then the regenerate confirmation opens and keyboard focus moves onto its confirm
  button. *Pinned by:* `layout-editor.spec.ts` › `moves focus with the regenerate confirmation (WCAG 2.4.3)`
- [ ] **AC-2:** Given the open regenerate confirmation, when the operator **cancels**, then the grid
  is unchanged and focus returns to the Generate button. *Pinned by:* same spec
- [ ] **AC-3:** Given the open regenerate confirmation, when the operator **confirms**, then the grid
  is replaced and focus returns to the Generate button (which survives the regenerate).
  *Pinned by:* same spec
- [ ] **AC-4:** Given any of the four confirm surfaces with its confirmation open, then the
  confirmation exposes `role="alertdialog"` with a non-empty accessible name.
  *Pinned by:* `confirm-panel.spec.ts` › `is an alertdialog with an accessible name`,
  `confirm-with-reason.spec.ts` › `is an alertdialog with an accessible name`
- [ ] **AC-5:** Given the admin photo takedown and the operator suspend flow, when driven through
  ask → type a reason → confirm/cancel, then every `data-testid`, request payload, header and
  outcome is byte-identical to before the extraction. *Pinned by:* the **existing, unmodified**
  `admin-venue-photos.spec.ts`, `admin-operators.spec.ts`, `set-editor.spec.ts`
- [ ] **AC-6:** Given a seeded venue in a real browser, when the operator opens the regenerate
  confirmation, then focus lands on the confirm button and axe reports no serious violations.
  *Pinned by:* `e2e/layout-editor.e2e.ts` › `regenerating over an existing grid confirms first and moves focus (+ axe)`
- [ ] **AC-7:** Given the six former `focusAfterRender` call sites, when any focus transition runs,
  then it behaves exactly as before via the one shared helper. *Pinned by:*
  `focus-after-render.spec.ts` + the existing focus specs on `set-editor`, `admin-venue-photos`,
  `admin-privacy`, `admin-commissions`, `admin-operators`

## Non-goals

- **`admin-privacy` does not adopt either component.** It is a three-stage machine
  (form → review → confirm → done) with a red-tinted card, `aria-labelledby` + a heading rather
  than `aria-label`, and it focuses the **panel** rather than a button. It adopts the focus helper
  only.
- **No re-styling.** Colours, type scale, spacing and copy stay as shipped on all four surfaces;
  the only deliberate visual change is the `min-h-11` touch target noted in the ledger.
- **Not fixing #605** (44px touch targets across the other six console tabs) — the `min-h-11` here
  falls out of unifying the operator pair on set-editor's existing markup, nothing more.
- **No testid renames.** Every existing hook is preserved so no unit or e2e spec is rewritten to
  match a refactor (`riviera-tailwind` rule 2).
- **No focus trap.** These are inline confirmations, not modals; `shared/focus-trap.ts` stays with
  the real modals (booking dialog, find-booking).

## Behavior-parity ledger

> Four shipped surfaces are being re-expressed through shared components. Every behavior of each
> old surface is enumerated and verdicted below.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| `layout-editor`: Generate over an existing grid opens a confirm instead of replacing | preserved | `onGenerate()` unchanged; `@if (confirmRegen())` now renders `<app-confirm-panel>` |
| `layout-editor`: confirm replaces the grid, clears `savedNotice`/`errorCode` | preserved | `confirmGenerate()` body unchanged |
| `layout-editor`: cancel closes the confirm, touches nothing | preserved | `cancelGenerate()` body unchanged |
| `layout-editor`: **focus after any of the three transitions** | **changed → fixed** | this is #604: focus moves to the confirm button on open, back to `layout-generate` on cancel and on confirm |
| `layout-editor`: confirm/cancel buttons are `px-3 py-1.5`, no min height | **changed (deliberate)** | unified on set-editor's `min-h-11 px-4` — a larger tap target, same inks, so the contrast specs are untouched. Recorded rather than silent |
| `layout-editor`: confirm button `bg-[#0a5f74]` (teal), set-editor `bg-[#a3160e]` (red) | preserved | `tone` input (`'primary' \| 'destructive'`) keeps each surface's ink exactly |
| `layout-editor` / `set-editor`: `role="alertdialog"` + `aria-label` | preserved | moved onto the component host, same values |
| `set-editor`: remove confirm opens, cancels, and parks focus on `set-panel` after a completed removal | preserved | `askRemove()`/`cancelRemove()`/`onRemove()` bodies unchanged apart from the helper import |
| `admin-venue-photos`: reason input feeds the `X-Audit-Reason` header; cleared on ask and on keep | preserved | `reason` becomes a `model()` two-way binding; the component's own signal and the header build are unchanged |
| `admin-venue-photos`: confirm disabled while `busy()` | preserved | `busy` input threaded through |
| `admin-venue-photos` / `admin-operators`: confirm block has **no** `role` and **no** accessible name | **changed (deliberate a11y fix)** | both now expose `role="alertdialog"` + `aria-label`, matching the operator pair. Chosen explicitly when scoping this slice |
| `admin-operators`: confirm disabled while `actingId() !== undefined`; cancel always enabled | preserved | `busy` input carries `actingId() !== undefined` |
| `admin-operators`: confirm block is a `w-full` flex item in a `flex flex-wrap` row | preserved | component host carries `block w-full` so it is the flex item the old `<div>` was (R-2) |
| All four: every `data-testid` on panel, prompt, reason, confirm and cancel | preserved | passed in as explicit inputs rather than derived, so no hook changes |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A projected-content design would silently break: Angular **always instantiates DOM for `<ng-content>` even when the placeholder is hidden**, and warns against `<ng-content>` under `@if` — a projected reason input would be created eagerly and keep state across opens | med | high | Neither component uses `<ng-content>`: the reason field is **built in** behind a `model()`, and each consumer keeps its `@if` **outside** the component, so the instance is created and destroyed with the confirmation. Surfaced by the angular-cli MCP `search_documentation` hit on content projection | Ivo | open |
| R-2 | The component host is a **new DOM node in the flow** — inline by default — which can change layout: `admin-operators`' confirm is a `w-full` **flex item**, `admin-venue-photos`' is a block whose first child carries `mt-3` | med | med | Host gets `class: 'block w-full'` so it is blockified and fills the flex line exactly as the old `<div class="w-full">` did; the operator pair's host takes the old wrapper's `mt-3` | Ivo | open |
| R-3 | Visual drift on four shipped surfaces that class-list review cannot see | med | med | Class strings are moved **verbatim**; the pure-maths contrast specs already pin `#7a4a08`/`#fff4e0`, white/`#a3160e`, white/`#0a5f74` and are left untouched; Phase 3 diffs **computed styles** in the mocked e2e suite per `riviera-tailwind`, rather than eyeballing | Ivo | open |
| R-4 | Focus-in and focus-out have **different owners** — the panel can focus its own button on open, but on close it is already destroyed, so it cannot focus the caller's button | high | med | Documented split: the component owns focus-**in** via `viewChild` + `afterNextRender`; the consumer owns focus-**out** via the shared helper. Stated in both components' TSDoc so a later reader does not "fix" it | Ivo | open |
| R-5 | Adopting the helper in `admin-commissions` / `admin-privacy` touches surfaces #604 never mentioned | low | med | Those two adopt the **helper only** — a mechanical import swap with no markup change; their existing focus specs are the regression net | Ivo | open |
| R-6 | `model()` for the reason field changes how two admin components hold that state | low | med | Both already hold a plain `reason` signal + an `onReasonTyped` handler; the `model()` replaces exactly that pair, and the existing specs assert the resulting header/payload | Ivo | open |

## Open questions / Assumptions

- **Assumption:** unifying the operator pair's buttons on `min-h-11 px-4` is desirable rather than
  drift, because it is the larger touch target and matches the direction of #605. — *Owner:* Ivo ·
  *Resolves by:* Phase 1 (recorded in the ledger; reversible with a `size` input if rejected)

### Resolved

- **Open question:** should one component cover all four surfaces? — **Resolved 2026-08-10 at plan
  time.** No: reading `admin-operators` and `admin-venue-photos` in full showed the four split 2+2
  on container, ARIA, reason field, state shape and type scale. Ivo chose two components, one per
  family, plus the shared helper — which fixes the admin pair's missing `alertdialog` role without
  imposing the operator pair's amber card on it.
- **Open question:** does `admin-privacy` adopt a component too? — **Resolved:** no, it is a stage
  machine that focuses the panel rather than a button (see Non-goals). Helper only.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice changes focus management and component placement on
four confirm surfaces; it adds, removes and reorders no request. The one confirmation that fronts a
map write (`layout-editor`'s regenerate) still only mutates the **local, unsaved** grid draft — the
`PUT …/beach-map` behind it is untouched, still owner-asserted and still
`expectedVersion`-conditional.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/focus-after-render.ts` | new | injection-context helper function | none (wraps `afterNextRender`) | — |
| FE-2 | `shared/confirm-panel.ts` | new | standalone component, inline template | `input()` × 6, `output()` × 2, `viewChild` for focus-in | — |
| FE-3 | `shared/confirm-with-reason.ts` | new | standalone component, inline template | `input()` × 8, `model()` for the reason, `output()` × 2 | plain `model()` binding, no Signal Forms (single optional text field) |
| FE-4 | `operator/layout-editor.ts` + `.html` | existing | standalone component | adopts FE-1 + FE-2; **gains the three focus transitions (#604)** | unchanged |
| FE-5 | `operator/set-editor.ts` + `.html` | existing | standalone component | adopts FE-1 + FE-2, behavior-preserving | unchanged |
| FE-6 | `admin/admin-venue-photos.ts` | existing | standalone component | adopts FE-1 + FE-3, `reason` becomes a `model()` binding | unchanged |
| FE-7 | `admin/admin-operators.ts` | existing | standalone component | adopts FE-1 + FE-3, `suspendReason` becomes a `model()` binding | unchanged |
| FE-8 | `admin/admin-commissions.ts`, `admin/admin-privacy.ts` | existing | standalone components | adopt FE-1 only (helper dedup) | unchanged |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()`
signal APIs, no `ChangeDetectionStrategy.OnPush` (default in v22), no `standalone: true` (default),
host bindings in the `host` object. No deviation.

## FE↔BE contract

N/A — no contract change. No request URL, method, body or header is added, removed or reshaped;
`X-Audit-Reason` is built exactly as before from the same reason string.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `implement (phase 1)`

**Next action:** Write `confirm-panel.spec.ts` and the `layout-editor.spec.ts` focus spec red, then
build `shared/confirm-panel` and adopt it in `set-editor` (parity) and `layout-editor` (the #604 fix).

Draft PR: **#612**.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Shared focus helper + adopt in the 5 existing call sites | ✅ | `1442b1a` (plan), Phase-0 commit below |
| 1 — `shared/confirm-panel` + operator pair (**the #604 fix**) | ⏳ | |
| 2 — `shared/confirm-with-reason` + admin pair | | |
| 3 — e2e coverage, computed-style no-drift check, full verification | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/shared-confirm-panel.md` — this plan
- `frontend/src/app/shared/focus-after-render.ts` — the one `afterNextRender` → `[data-testid]`
  focus helper, replacing five byte-identical private copies
- `frontend/src/app/shared/focus-after-render.spec.ts` — helper unit spec
- `frontend/src/app/shared/confirm-panel.ts` — the operator family's amber `alertdialog` confirm
- `frontend/src/app/shared/confirm-panel.spec.ts` — ARIA, focus-in, and output wiring
- `frontend/src/app/shared/confirm-with-reason.ts` — the admin family's reason-collecting confirm
- `frontend/src/app/shared/confirm-with-reason.spec.ts` — ARIA, focus-in, reason `model()`, outputs
- `frontend/src/app/operator/layout-editor.ts` — adopt both; add the three #604 focus transitions
- `frontend/src/app/operator/layout-editor.html` — confirm block → `<app-confirm-panel>`
- `frontend/src/app/operator/layout-editor.spec.ts` — the #604 focus spec
- `frontend/src/app/operator/set-editor.ts` — adopt both, behavior-preserving
- `frontend/src/app/operator/set-editor.html` — confirm block → `<app-confirm-panel>`
- `frontend/src/app/admin/admin-venue-photos.ts` — adopt helper + `confirm-with-reason`
- `frontend/src/app/admin/admin-operators.ts` — adopt helper + `confirm-with-reason`
- `frontend/src/app/admin/admin-commissions.ts` — adopt the helper only
- `frontend/src/app/admin/admin-privacy.ts` — adopt the helper only
- `frontend/e2e/layout-editor.e2e.ts` — the regenerate-confirm focus + axe test, and the
  computed-style no-drift assertions

---

## Phase 0 — Shared focus helper

**Files:** Create `frontend/src/app/shared/focus-after-render.ts` · Test
`frontend/src/app/shared/focus-after-render.spec.ts` · Modify `admin-commissions.ts`,
`admin-operators.ts`, `admin-privacy.ts`, `admin-venue-photos.ts`, `set-editor.ts`

- [ ] **Step 1: Write the failing spec** — a host component whose button is focused by the helper.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- focus-after-render` → FAIL (module missing).
- [ ] **Step 3: Implement** `focusMover()`, a factory called in an injection context that captures
      `ElementRef` + `Injector` once and returns `(testId: string) => void` — mirroring the
      established `parentVenueId(this.route)` field-initializer idiom.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- focus-after-render` → PASS.
- [ ] **Step 5: Adopt in all five existing call sites**, deleting each private copy; run the five
      owning specs.
- [ ] **Step 6: Generalization-audit pass** — re-grep for any remaining private focus helper.
- [ ] **Step 7: Commit** — `git commit -m "Extract the shared focus-after-render helper (#604)"`
- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `shared/confirm-panel` + the operator pair (the #604 fix)

**Files:** Create `frontend/src/app/shared/confirm-panel.ts` + `.spec.ts` · Modify
`operator/set-editor.ts|.html`, `operator/layout-editor.ts|.html`, `operator/layout-editor.spec.ts`

- [ ] **Step 1: Write the failing specs** — `confirm-panel.spec.ts` (alertdialog + accessible name,
      focus-in on open, `confirmed`/`cancelled` outputs), then the #604 spec in
      `layout-editor.spec.ts` mirroring set-editor's `moves focus with the remove confirmation`.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- confirm-panel layout-editor` → FAIL.
- [ ] **Step 3: Implement** the component (inputs: `label`, `message`, `confirmLabel`, `tone`,
      `panelTestId`, `confirmTestId`, `cancelTestId`; outputs: `confirmed`, `cancelled`; host
      `role="alertdialog"` + `[attr.aria-label]` + `class="block"`), then adopt in `set-editor`
      (behavior-preserving) and `layout-editor` (adding the three focus transitions).
- [ ] **Step 4: Run them, verify they pass** — `npm test -- confirm-panel set-editor layout-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass** — confirm no other operator surface has a bare confirm.
- [ ] **Step 6: Commit** — `git commit -m "Move focus with the bulk regenerate confirmation (#604)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — `shared/confirm-with-reason` + the admin pair

**Files:** Create `frontend/src/app/shared/confirm-with-reason.ts` + `.spec.ts` · Modify
`admin/admin-venue-photos.ts`, `admin/admin-operators.ts`

- [ ] **Step 1: Write the failing spec** — alertdialog + accessible name, focus-in, reason `model()`
      round-trip, `busy` disabling confirm but not cancel.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- confirm-with-reason` → FAIL.
- [ ] **Step 3: Implement** and adopt in both admin components, leaving their existing specs
      **unmodified** — those specs are the parity net (AC-5).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- confirm-with-reason admin-venue-photos admin-operators` → PASS.
- [ ] **Step 5: Generalization-audit pass** — re-check `admin-privacy` against the new component and
      record why it stays out.
- [ ] **Step 6: Commit** — `git commit -m "Share the admin confirm-with-reason panel (#604)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — e2e coverage + no-drift verification

**Files:** Modify `frontend/e2e/layout-editor.e2e.ts`

- [ ] **Step 1: Write the failing e2e** — seed the mocked venue map with sets so the editor opens
      with a grid, activate Generate, assert the confirmation is focused, then assert axe is clean.
      (The file's existing header comment says the confirm flow is "pinned by the unit spec" —
      RV-FE-E2E requires coverage for the changed flow, so that gap closes here.)
- [ ] **Step 2: Run it, verify it fails/passes appropriately** — `npm run test:e2e:a11y -- layout-editor`.
- [ ] **Step 3: Computed-style no-drift check** — assert the confirm/cancel buttons' resolved
      `background-color`, `color`, `border` and `min-height` in the real browser, per
      `riviera-tailwind` (class lists cannot show drift).
- [ ] **Step 4: Full verification** — `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e:a11y`.
- [ ] **Step 5: Reconcile the File-structure section** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 6: Commit** — `git commit -m "Cover the regenerate confirm focus end to end (#604)"`
- [ ] **Step 7: Update plan-doc execution status**; mark ready for review.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | Phase 0 — extracting the focus helper | any other private `afterNextRender` → `[data-testid]` focus helper | `grep -rn "private focusAfterRender\|refocusAfterRender" src/app/ --include=*.ts` then `grep -rln "afterNextRender" src/app/ --include=*.ts` | 5 byte-identical copies (all adopted); `auth-page.ts#refocusAfterRender` + 11 other `afterNextRender` users | Fixed all 5. **Skipped `auth-page.ts`** — it focuses a `viewChild` (`firstField()`), not a `[data-testid]` lookup, so it is a different helper wearing a similar name; forcing it through the shared one would mean giving its input a test id purely to be found by string |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/3:** `npm test -- layout-editor` → the focus spec passes.
- [ ] **AC-4:** `npm test -- confirm-panel confirm-with-reason` → both ARIA specs pass.
- [ ] **AC-5:** `npm test -- admin-venue-photos admin-operators set-editor` → green with the specs
      unmodified by this slice.
- [ ] **AC-6:** `npm run test:e2e:a11y -- layout-editor` → focus + axe pass.
- [ ] **AC-7:** `npm test -- focus-after-render admin-privacy admin-commissions` → green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (N/A, frontend-only); no new cross-feature FE import (RV-FE-8).
- [ ] **Payment/payout** section filled (N/A).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met; no `as any`; every `data-testid` preserved.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder plus
      `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
