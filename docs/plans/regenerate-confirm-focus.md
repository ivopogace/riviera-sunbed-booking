# Regenerate-confirm Focus Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the bulk-regenerate confirmation stranding keyboard/AT focus on `<body>` (WCAG
2.4.3) — the last of the operator console's three confirm-before-destroy surfaces that never moved
focus — and give the choreography one home instead of a sixth copy.

**Architecture:** Two decisions. (1) The focus treatment `set-editor.ts` and `admin-venue-photos.ts`
already carry is applied to `LayoutEditor`'s regenerate confirm: open → the confirm button, cancel →
Generate, confirm → Generate (which, unlike the per-set Remove, outlives its own action). (2) #604's
"a shared `confirm-panel` may be the honest fix" is answered **no for the panel, yes for the focus
move**: the three panels differ in content (the photo takedown embeds a reason field and is
per-slot), while the *choreography* was already duplicated **five times verbatim** as a private
`focusAfterRender`. So the extraction is `shared/focus-after-render.ts` — following
`shared/focus-trap.ts`, whose own TSDoc states the rule: a11y-critical logic lives in ONE place and
cannot drift between copies.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only; no table, migration or query touched.

**Source of intent:** GitHub issue #604, deferred from #600's Phase-2 generalization audit
(`docs/plans/per-set-beach-map-editing.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
duplication the issue names as "three near-identical implementations" is really five identical
`focusAfterRender` helpers, which moves the honest fix from a panel component to a focus helper) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger that made the *confirm* leg's
landing spot an explicit decision rather than a copy of set-editor's panel-parking) · `tdd` (each of
the three transitions driven from a failing spec; the shared helper's two specs written before the
five migrations) · `riviera-review-overlay` (review gate — see Execution status) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 0 patches — the `focusAfterRender`
mentions in `a3-admin-privacy-tab.md`, `a8-admin-commissions-tab.md`, `admin-suspend-audit-reason.md`
and `admin-photo-moderation.md` are historical records of what those slices shipped, the #607
"still a true historical statement" case; no substrate doc states the helper's address) ·
`riviera-frontend` (placement — the mover is pure, stateless and HTTP-free, so `shared/`; a helper
imported by both `operator/` and `admin/` in a feature folder would have been a new RV-FE-8 edge) ·
`angular-developer` + angular-cli MCP (v22 APIs — `inject()` in a field initializer over a
constructor, and the `afterNextRender` `earlyRead`/`write` split the extracted TSDoc now carries
once) · `playwright-cli` (the mocked-suite spec: keyboard `Enter` on the confirm, `toBeFocused()`
per transition) · `riviera-local-debug` (scoped Vitest `--include` runs; `PW_CHROMIUM_EXECUTABLE`
for the container's Chromium revision). `riviera-tailwind` **not** loaded — no class, token or
markup style changed; the templates are untouched.

**Branch:** `claude/issue-604-4mv4iq` — the cloud session's designated remote branch, standing in
for `bugfix/regenerate-confirm-focus` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue whose bulk grid already has cells, when the operator activates Generate,
  then the regenerate confirmation opens **and focus is on its confirm button** — pinned by
  `layout-editor.spec.ts` › *moves focus into the regenerate confirmation when it opens (WCAG 2.4.3)*.
- [x] **AC-2:** Given an open regenerate confirmation, when it is cancelled, then the confirmation is
  gone and focus is back on Generate — pinned by `layout-editor.spec.ts` › *returns focus to Generate
  when the regenerate confirmation is cancelled*.
- [x] **AC-3:** Given an open regenerate confirmation, when it is confirmed, then the layout is
  replaced and focus is back on Generate — pinned by `layout-editor.spec.ts` › *returns focus to
  Generate when the regenerate is confirmed*.
- [x] **AC-4:** Given a real browser and no pointer, when the confirmation is answered with `Enter`,
  then focus lands on Generate rather than `<body>` — pinned by `layout-editor.e2e.ts` › *the
  regenerate confirmation takes focus and hands it back on either answer (#604)*.
- [x] **AC-5:** Given a component asking for a target that never renders, when the mover runs, then it
  no-ops and leaves focus where it was — pinned by `focus-after-render.spec.ts` › *no-ops on a target
  that never renders, leaving focus where it was*.
- [x] **AC-6:** No component declares its own copy of the choreography — `grep -rn "private
  focusAfterRender" frontend/src` and `grep -rn "afterNextRender" frontend/src/app/admin
  frontend/src/app/operator` both return nothing.

## Non-goals

- **A shared `confirm-panel` component or directive** — considered per #604 and declined; see
  Architecture. The three panels' *markup* differs (reason field, per-slot keying, different copy and
  destructive-button styling); collapsing them would rewrite three templates and their specs to
  de-duplicate the one part that was genuinely identical and is now shared anyway.
- **Migrating the other `afterNextRender` sites** (`auth/*`, `booking/*`, `operator/operator-home.ts`,
  `operator/payout-statement.ts`, `shared/`-less one-offs). They focus a *first input* or a landmark,
  not a `data-testid`'d swap target, and share no body with the extracted mover.
- **Clearing `confirmRegen` when the Beach-map tab switches to per-set mode.** Leaving the bulk
  surface with the confirm still open re-shows it on the way back, unasked — a real (pre-existing)
  wart, but a behaviour change, not a focus one. Recorded below; deferred to **#611**.
- Any change to what regenerate *does*, to the layout write, or to the guards behind it.

## Behavior-parity ledger (retirement / replacement slices only)

Nothing is retired; the five `focusAfterRender` copies are replaced by one shared mover, so the
ledger covers that replacement.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `afterNextRender` with an `earlyRead` query + `write` focus, bound to the component's own injector | preserved | identical body in `hostFocusMover()`, which `inject()`s `ElementRef` + `Injector` at field-initializer time — same injector, same phases |
| No-op when the `data-testid` target is absent (`target?.focus()`) | preserved | same optional call; now pinned by `focus-after-render.spec.ts` (it never was before) |
| A11y rationale documented per copy (two of the five carried the `mixedReadWrite` argument, three did not) | changed | stated once in the shared TSDoc; the per-call TSDoc at each call site keeps only *why that transition moves focus* |
| `AdminAudit.retry()`'s inline (non-helper) variant with a literal selector | preserved | same call through the mover, `admin-audit-card` passed as the test id |

## Risk register

| # | Risk | Likelihood | Mitigation | Status |
|---|---|---|---|---|
| R-1 | Migrating five working a11y surfaces to a shared helper silently breaks one of them | med | The bodies are byte-identical, and each surface already has focus assertions (`admin-venue-photos.spec.ts`, `admin-privacy.spec.ts`, `admin-commissions.spec.ts`, `admin-operators.spec.ts`, `admin-audit.spec.ts`, `set-editor.spec.ts`) — all re-run unchanged | Closed — 166 admin + 524 operator/shared specs green |
| R-2 | `hostFocusMover()` called outside an injection context throws at construction | low | It is a field initializer in all six components (an injection context by construction); `inject()` fails loudly rather than silently no-op'ing if a future caller gets it wrong | Closed — accepted, documented in the TSDoc |
| R-3 | The confirm leg parks focus on a button that a *successful* regenerate destroys (the set-editor case, where Remove disappears with the selection) | low | Verified in the template: `layout-generate` is outside the `@if (confirmRegen())` block and survives both legs — the AC-3 spec asserts the element is focused *after* the replace | Closed |
| R-4 | Widening the diff to four admin components makes a WCAG fix hard to review | med | Each admin file is one import line + one field line minus a ~12-line method; no call site changed (the field keeps the name `focusAfterRender`), so the review reads as a rename-free extraction | Closed — disclosed here and in the PR body |

## Open questions / Assumptions

*None open.*

### Resolved

- **Panel component, or focus helper?** — #604 left it open ("worth considering"). Resolved at plan
  time from the code: the panels differ, the choreography did not, and it was duplicated five times,
  not twice. Extracted the choreography; declined the panel (Non-goals).
- **Where does focus land after a *confirmed* regenerate?** — `set-editor.ts`'s answer (park on the
  panel) does not transfer: its Remove button dies with the selection, while Generate outlives the
  replace. Focus returns to Generate on both legs, which is also what #604's Scope asked for.

## Availability & concurrency (invariant #2)

N/A — no `(set, date)` read or write, no claim path. The regenerate button edits an in-memory draft
grid; the only server write in this surface (`PUT …/beach-map`) is untouched, as are its guards.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file in the diff.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money, no Stripe, no ledger, no refund path in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/focus-after-render.ts` | new | injection-context factory returning `(testId) => void` | none (no signal, no state) | — |
| FE-2 | `operator/layout-editor.ts` | existing | standalone component | `confirmRegen` signal unchanged; three transitions now call the mover | — |
| FE-3 | `operator/set-editor.ts`, `admin/admin-venue-photos.ts`, `admin/admin-operators.ts`, `admin/admin-privacy.ts`, `admin/admin-commissions.ts`, `admin/admin-audit.ts` | existing | standalone components | unchanged — the private helper becomes the shared mover under the same field name | — |

**Standards:** `inject()` in a field initializer (not a constructor), no decorators, native control
flow untouched, no template change at all — the confirm block already carried
`role="alertdialog"`, its `aria-label` and both `data-testid`s. `ElementRef`/`Injector` injections
disappear from six components; nothing else in them referenced those fields.

## FE↔BE contract

N/A — no request, response or endpoint touched.

## Execution status

**Stage pointer:** `implement — phase 2 complete; PR not opened`

**Next action:** open the draft PR for `claude/issue-604-4mv4iq` (CI runs on the `pull_request` event
only, so the pushed branch has no CI until then), then run the Review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — extract `shared/focus-after-render.ts` + its specs | ✅ | this commit |
| 1 — move focus on all three regenerate transitions + three specs + the e2e leg | ✅ | this commit |
| 2 — migrate the five existing copies to the shared mover | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet — gates not run (no PR open) | — |

---

## File structure

- `frontend/src/app/shared/focus-after-render.ts` — the shared `hostFocusMover()` (new).
- `frontend/src/app/shared/focus-after-render.spec.ts` — its two specs: focuses a target that appears
  with the render, no-ops on one that never does (new).
- `frontend/src/app/operator/layout-editor.ts` — the three regenerate transitions move focus.
- `frontend/src/app/operator/layout-editor.spec.ts` — one spec per transition (AC-1…AC-3).
- `frontend/src/app/operator/set-editor.ts` — private helper → shared mover.
- `frontend/src/app/admin/admin-venue-photos.ts` — private helper → shared mover.
- `frontend/src/app/admin/admin-operators.ts` — private helper → shared mover.
- `frontend/src/app/admin/admin-privacy.ts` — private helper → shared mover (its `mixedReadWrite`
  TSDoc argument relocated into the shared file).
- `frontend/src/app/admin/admin-commissions.ts` — private helper → shared mover.
- `frontend/src/app/admin/admin-audit.ts` — the inline `afterNextRender` variant → shared mover.
- `frontend/e2e/layout-editor.e2e.ts` — the keyboard focus leg (AC-4) + the file's TSDoc.

---

## Phase 0 — Extract the mover

- [x] Write `focus-after-render.spec.ts` against a two-button test host (target appears with the
      render; target that never renders).
- [x] Implement `hostFocusMover()` with the `earlyRead`/`write` split and the relocated rationale.

## Phase 1 — Move focus on the regenerate confirm

- [x] Three failing specs in `layout-editor.spec.ts`, one per transition.
- [x] `onGenerate` → `layout-confirm-yes`; `cancelGenerate` / `confirmGenerate` → `layout-generate`.
- [x] Real-browser leg in `layout-editor.e2e.ts`, answering the confirm from the keyboard.

## Phase 2 — Retire the copies

- [x] Migrate all five `private focusAfterRender` helpers plus `AdminAudit`'s inline variant; the
      field keeps its name, so no call site changed.
- [x] Verify no `afterNextRender`, `ElementRef` or `Injector` reference is left orphaned in the six
      components.

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | Phase 0 (the issue's own "third copy" question) | the confirm-focus choreography | `grep -rn "private focusAfterRender(testId: string): void" frontend/src/app` then `grep -rn "afterNextRender" frontend/src --include=*.ts` | 5 verbatim private helpers (`set-editor`, `admin-venue-photos`, `admin-operators`, `admin-privacy`, `admin-commissions`) + 1 inline variant (`admin-audit`); 9 further `afterNextRender` sites of a different shape (focus a first input / a landmark) | Extracted + migrated all 6; left the 9 (Non-goals) — they share no body |
| 2026-08-10 | Phase 1 (the confirm leg's landing spot) | confirm-before-destroy surfaces whose confirmed action destroys the returning target | read the three templates' `@if` blocks | only `set-editor`'s Remove (already parks on `set-panel`) | No change needed; recorded as R-3 |

## Acceptance-criteria verification (final)

| AC | Verified by | Result |
|---|---|---|
| AC-1…AC-3 | `npx ng test --watch=false --include="src/app/operator/layout-editor.spec.ts"` | ✅ green |
| AC-4 | `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/layout-editor.e2e.ts` | ✅ 4 passed |
| AC-5 | `npx ng test --watch=false --include="src/app/shared/focus-after-render.spec.ts"` | ✅ green |
| AC-6 | both greps | ✅ zero hits |
| Regression | `--include="src/app/admin/**/*.spec.ts"` (19 files, 166 tests) and `--include="src/app/operator/**/*.spec.ts" --include="src/app/shared/**/*.spec.ts"` (74 files, 524 tests) | ✅ green |

## Self-review checklist (before merge / PR)

- [x] Every AC has a passing test named above.
- [x] Invariants re-checked: #2/#3/#4/#5/#6/#7/#8/#9/#10/#12 untouched (no server call, no money, no
      date arithmetic); #1/#11 N/A (no Java); #13 untouched (no authorization path).
- [x] `riviera-frontend` placement honoured — the mover is in `shared/`, imported by two feature
      folders, adding no cross-feature edge (RV-FE-8).
- [x] `npm run lint` clean; `node scripts/check-inline-comments.mjs --diff origin/main` clean;
      `node scripts/check-plan-file-structure.mjs --diff origin/main` clean.
- [x] Open Questions empty; the one deferral carries a follow-up issue (#611).
- [ ] Review gate — **not run**: no PR is open (the session's instructions withhold PR creation
      unless asked). Due at ready-for-review, together with the Sonar gate.
- [ ] Sonar gate — **not run**, same reason (Sonar analyzes PRs and `main` only).
- [ ] Close-out written in THIS PR — pending the PR.
