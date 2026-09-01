# Console confirm-panel parity Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `daily-view-tab`'s close-sales confirm and `payouts-tab`'s weather-refund confirm
render through `shared/confirm-panel` (`role="alertdialog"` + accessible name), the
untokenised `bg-[#9a6410]` literal becomes a registered token, and the surviving `16px`
radius question is resolved one way, with no behavior dropped.

**Architecture:** The single significant decision is widening `ConfirmPanel` itself rather
than writing a third confirm component: both panels are the operator family's exact shape
(amber `alertdialog`, boolean state, no reason field) once two small gaps close — a
`headline` input for the bold lead sentence both panels' copy carries (the component's
`message` is plain-text-only by design, R-1 of `docs/plans/shared-confirm-panel.md`, so the
inline `<strong>`/`<em>` markup cannot come along verbatim), and a `busy` input neither
existing consumer needed because both are synchronous local mutations — these two are
network writes that must not double-submit mid-flight. `#9a6410` joins the existing
`--riv-solid-fill-*` family (#854) as a third tone (`warn`) rather than a new family: same
shape (a solid button/badge fill under fixed white ink), same proof shape, and role beats
value per that family's own precedent.

**Persistence:** N/A — frontend-only, no backend or schema change.

**Source of intent:** GitHub issue #881 (follow-up to #879/PR #880).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the issue's own motivation is half stale: both panels already call the shared `focusMover()`
helper for all three focus legs, added by an unrelated slice, `f3a9e48` (#795/#803), months
after #604 shipped it — so the real remaining gap is the ARIA semantics (`alertdialog` +
accessible name) and the markup/token duplication, not a focus strand; also caught that
`ConfirmPanel` cannot carry either panel's rich-text copy or busy state as-is) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger, which is where the
message-ink change, the button-geometry unification and the dropped `<em>` emphasis got
recorded instead of shipping silently) · `tdd` (each phase writes the component/token spec
red before the change) · `riviera-review-overlay` (review gate — RV-FE-9 focus-transition
item and RV-FE-E2E spec-placement consulted at plan time; full run due at ready-for-review)
· `riviera-docs-freshness` (due at merge close-out; not yet run) · `riviera-frontend`
(placement: no new file needed outside `shared/`, no new cross-feature edge) ·
`riviera-tailwind` (the `--riv-solid-fill-*` family is the right home for `#9a6410` — grouped
by FORM per the family's own doc comment; no `@apply`; radius resolves by adopting the
component's, not layering another) · `angular-developer` + angular-cli MCP (v22
`input()`/`output()` signal APIs; no deviation) · `playwright-cli` (RV-FE-E2E needs
role/accessible-name coverage in the mocked suite, not just a unit spec) ·
`riviera-local-debug` (cloud session: scoped `npm test -- confirm-panel daily-view-tab
payouts-tab solid-fill-tokens`, `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run
test:e2e:a11y`)

**Branch:** `claude/sdlc-881-hwfez2` (the session's designated remote branch stands in for
`bugfix/console-confirm-panel-parity` — cloud-session substitution per `riviera-sdlc`'s
remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the Daily view tab's close-sales trigger and the Payouts tab's weather
  trigger, when either is activated, then the confirmation renders as `<app-confirm-panel>`
  with `role="alertdialog"` and a non-empty accessible name naming the action (not a plain
  `<div>`). *Seam:* `ConfirmPanel`'s host contract (`label`/`panelTestId` inputs) · *Pinned
  by:* `daily-view-tab.spec.ts` › `'exposes the close-sales confirm as an alertdialog with an
  accessible name'`, `payouts-tab.spec.ts` › `'exposes the weather confirm as an alertdialog
  with an accessible name'`, `e2e/operator-daily.e2e.ts`, `e2e/operator-payouts.e2e.ts`
- [ ] **AC-2:** Given either confirm panel, when it opens, is cancelled, or is confirmed,
  then keyboard focus moves onto the confirm button on open and back to the trigger on
  cancel (already true today via `focusMover()`; this AC re-pins it against the new
  `<app-confirm-panel>` markup so the refactor cannot silently regress it). *Seam:*
  `ConfirmPanel`'s own `afterNextRender` focus-in + the caller's `focusMover()` focus-out ·
  *Pinned by:* the existing `daily-view-tab.spec.ts` › `'moves focus to the confirm button…'`
  / `'returns focus to the trigger…'` and `operator-daily.e2e.ts` /
  `operator-payouts.e2e.ts`'s existing `toBeFocused()` assertions, kept green
- [ ] **AC-3:** Given either panel's confirm action in flight (`closeSalesBusy()` /
  `refunding()`), when the operator would tap Confirm or Cancel again, then both controls
  reject the click (no double-submit, no premature dismissal) exactly as before the
  refactor. *Seam:* `ConfirmPanel`'s new `busy` input → `appBusy` on both buttons · *Pinned
  by:* `confirm-panel.spec.ts` › `'blocks confirm and cancel while busy'`
- [ ] **AC-4:** Given the two panels' confirm buttons, when rendered, then neither paints
  `bg-[#9a6410]` as a literal — both consume `bg-riv-solid-fill-warn`, a registered
  theme-invariant token whose white-ink pairing clears WCAG AA. *Seam:* the
  `--riv-solid-fill-*` token family · *Pinned by:*
  `shared/solid-fill-tokens.contrast.spec.ts` (extended), `e2e/solid-fill-token-skin.e2e.ts`
  (extended)
- [ ] **AC-5:** Given the merge, then `docs/design/colour-literal-token-audit.md` records
  `#9a6410` as a closed class-T family. *Seam:* the ledger file itself · *Pinned by:* review
  reading (prose, no test) + `riviera-docs-freshness` at close-out

## Non-goals

- **The amber palette itself** (`--riv-warn-{edge,fill,ink}`) — settled by #879/#880; this
  slice consumes it unchanged.
- **A fourth ConfirmTone for anything else.** `warn` is scoped to this pair; no other confirm
  surface adopts it here.
- **Re-litigating whether these two actions should stay two-step confirms, or restyling
  their surrounding cards.**
- **`admin-privacy`/the admin `ConfirmWithReason` pair.** Untouched — different family,
  different plan (`docs/plans/shared-confirm-panel.md`).
- **Chasing every geometry pixel.** The behavior-parity ledger below states which
  differences are adopted (the component's) vs which survive; it does not add a size/radius
  input to keep every old pixel.

## Behavior-parity ledger

> `daily-view-tab`'s close-sales confirm and `payouts-tab`'s weather confirm are being
> re-expressed through `shared/confirm-panel`. Every behavior of each old surface is
> enumerated and verdicted below.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| Both: no `role`, no accessible name on the confirm block | **changed (deliberate a11y fix)** | `ConfirmPanel`'s host carries `role="alertdialog"` + `[attr.aria-label]="label()"`, matching the existing `layout-editor`/`set-editor` consumers |
| Both: focus moves onto the confirm button on open, back to the trigger on cancel, onto the outcome notice on settle | preserved | Already implemented via `focusMover()` (added by `f3a9e48`, unrelated to this slice); open-leg focus now comes from `ConfirmPanel`'s own `afterNextRender` instead of a redundant manual call, which is removed |
| Both: confirm **and** cancel reject a tap while the write is in flight (`[appBusy]` on both) | preserved | `ConfirmPanel` gains a `busy` input applied to both buttons — `ConfirmWithReason`'s "cancel always enabled" convention is **not** copied here, since it would silently loosen this pair's existing double-submit guard |
| Both: message paragraph ink is `--riv-card-ink` (the tab's plain dark ink) | **changed (deliberate)** | `ConfirmPanel`'s message paragraph is hard-coded `text-riv-warn-ink` (no ink override input, by the component's own no-projected-content design) — unifies onto the same warm ink every other `ConfirmPanel` message already carries. AA re-proven: `--riv-warn-ink`/`--riv-warn-fill` is the pairing #879 measured at 6.86:1 |
| Both: panel radius `rounded-[16px]`; confirm/cancel radius `rounded-[12px]`; panel padding `px-4 py-3.5` | **changed (deliberate)** — **dropped in favor of the component's** | `ConfirmPanel`'s host is `rounded-[12px] px-3 py-2.5` (unchanged since #612); adding a radius/padding input to a two-consumer difference would be the "directive carries no radius" trap in reverse — the component owns its own box. Resolves the issue's own AC: the geometry difference does not survive as two values |
| Both: confirm/cancel button padding `px-[18px] py-2.5`, text `13.5px` | **changed (deliberate)** | Unified onto `ConfirmPanel`'s existing `px-4 py-1.5`, `12.5px` — the same unification `docs/plans/shared-confirm-panel.md` already did once for `layout-editor`/`set-editor`; both stay ≥44px via `appTouchTarget`, not the padding |
| Daily: `<strong>Close today's online sales?</strong>` lead sentence, plain body | preserved | `headline` input renders the identical sentence in `<strong>`; body text unchanged |
| Payouts: `<strong>Weather refund for {date}?</strong>` lead, plain body with `<em>every</em>` mid-sentence | **changed (deliberate)** | `headline` carries the bold lead unchanged; the `<em>every</em>` emphasis is dropped — `ConfirmPanel`'s `message` is plain-interpolated text by design (R-1, no projected content), and mid-sentence emphasis is not worth a second slot on a shared component for one caller |
| `#9a6410` confirm-button fill, literal | **changed (deliberate)** | `bg-riv-solid-fill-warn`, a new theme-invariant member of the `--riv-solid-fill-*` family, same value |
| Both: cancel button has no busy-dimming class | **changed (deliberate)** | `ConfirmPanel`'s cancel button gains `aria-disabled:opacity-60`, matching its own confirm button and the old markup's dimming on both actions |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Widening `ConfirmPanel`'s `busy` input the way `ConfirmWithReason` does it (confirm-only) would silently drop the existing "cancel also disabled while busy" behavior on both consumers | med | med | `busy` applies `[appBusy]` to **both** buttons in `ConfirmPanel`; `ConfirmWithReason` is untouched, so the two components keep their own established semantics. Behavior-parity ledger row records the choice | Ivo | open — pinned by AC-3's spec |
| R-2 | Adding a `headline` input could tempt a future caller to pass arbitrary markup through it, reopening the projected-content question R-1 of `shared-confirm-panel.md` already closed | low | low | `headline` stays `input<string>()`, interpolated exactly like `message` — no `innerHTML`, no `<ng-content>`. TSDoc states it is plain text | Ivo | open |
| R-3 | Moving the message ink from `--riv-card-ink` to `--riv-warn-ink` could fail AA over the panel's own fill if #879's measurement doesn't transfer | low | high | `--riv-warn-ink`/`--riv-warn-fill` is the exact pairing #879 proved at 6.86:1 in `shared/warn-token-skin.contrast.spec.ts` — no new measurement needed, just confirmed unchanged | Ivo | closed — pairing pre-proven, no new literal introduced |
| R-4 | `bg-[#9a6410]` might still linger in a third site this slice doesn't grep for, leaving `solid-fill-tokens.contrast.spec.ts`'s "no component paints the family as a literal" sweep to catch it late | low | low | `FILL_ROLES` sweep is tree-wide (`componentSources()` over all of `src/app`), not scoped to the two touched files — it is the generalization check for this exact population | Ivo | open — closed by Phase 2's Step 5 |

## Open questions / Assumptions

- **Assumption:** the issue's focus-management framing ("neither hand-rolled panel does
  either") is stale — both already call `focusMover()` for all three legs, added by
  `f3a9e48` (#795/#803), well after the issue's premise. Confirmed by reading
  `daily-view-tab.ts`/`payouts-tab.ts` and their existing green focus specs in both the unit
  and e2e suites. The remaining, real gap is the ARIA role/name and the markup/token
  duplication. — *Owner:* Ivo · *Resolves by:* recorded here at plan time; AC-1/AC-2 reflect
  the corrected scope.
- **Assumption:** dropping the `<em>every</em>` mid-sentence emphasis (payouts) is an
  acceptable minor visual change rather than something that needs its own component slot. —
  *Owner:* Ivo · *Resolves by:* Phase 1, recorded in the ledger above.

Resolved entries move under a `### Resolved` sub-heading with the outcome + SHA.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Neither confirm fronts a `(set, date)` write; the
close-sales action writes the venue's standing `sales_close` profile field (unchanged by
this slice, invariant #4's own concern), and the weather refund is a payout/booking-module
server decision this slice only triggers (unchanged).

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic changes. The weather-refund trigger's request/response shape is
untouched; this slice only changes how its confirmation renders and what fires the same
`onConfirmWeather()`/`onCancelWeather()` handlers.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/confirm-panel.ts` | existing | standalone component | adds `headline` + `busy` `input()`s | — |
| FE-2 | `shared/confirm-panel.spec.ts` | existing | unit spec | new cases for headline, warn tone, busy | — |
| FE-3 | `operator/daily-view-tab.ts` + `.html` | existing | standalone component | adopts `<app-confirm-panel>`; drops the redundant open-leg `focusAfterRender` call | unchanged |
| FE-4 | `operator/payouts-tab.ts` + `.html` | existing | standalone component | same adoption | unchanged |
| FE-5 | `operator/daily-view-tab.contrast.spec.ts`, `operator/payouts-tab.contrast.spec.ts` | existing | contrast specs | reference the new `SOLID_FILL_WARN` token constant instead of the `#9a6410` literal | — |
| FE-6 | `testing/glass-tokens.ts` | existing | test fixture | adds `SOLID_FILL_WARN` | — |
| FE-7 | `shared/solid-fill-tokens.contrast.spec.ts` | existing | contrast spec | extends the family to three members | — |
| FE-8 | `tailwind.css` | existing | token registry | adds `--riv-solid-fill-warn` + its `@theme inline` row, in the existing `--riv-solid-fill-*` doc comment | — |
| FE-9 | `e2e/solid-fill-token-skin.e2e.ts` | existing | mocked e2e | extends `REGISTRY`/`UTILITIES`, asserts the weather button paints from the token | — |
| FE-10 | `e2e/operator-daily.e2e.ts`, `e2e/operator-payouts.e2e.ts` | existing | mocked e2e | new `role="alertdialog"` + accessible-name assertions | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, no `ChangeDetectionStrategy.OnPush` (default), no `standalone: true` (default), host
bindings in the `host` object. No deviation.

## FE↔BE contract

N/A — no contract change. No request URL, method, body, or header changes; both handlers
(`onConfirmCloseSales`, `onConfirmWeather`) are untouched.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `implement (phase 2)`

**Next action:** Adopt `<app-confirm-panel>` in `payouts-tab`, drop the `<em>every</em>`
emphasis per the ledger, and update `payouts-tab.contrast.spec.ts` to reference
`SOLID_FILL_WARN` instead of the `#9a6410` literal (Phase 2, Step 3).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `shared/confirm-panel`: `headline` + `busy` + `warn` tone | ✅ | (pending commit) |
| 1 — Adopt in `daily-view-tab` | ✅ | (pending commit) |
| 2 — Adopt in `payouts-tab` + retire the `#9a6410` literal (token family) | ⏳ | |
| 3 — e2e coverage (ARIA + token no-drift) + full verification | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/console-confirm-panel-parity.md` — this plan
- `frontend/src/app/shared/confirm-panel.ts` — `headline` + `busy` inputs, `warn` tone
- `frontend/src/app/shared/confirm-panel.spec.ts` — new cases for the above
- `frontend/src/app/operator/daily-view-tab.ts` — adopt `<app-confirm-panel>`, drop the
  redundant open-leg focus call
- `frontend/src/app/operator/daily-view-tab.html` — confirm block → `<app-confirm-panel>`
- `frontend/src/app/operator/daily-view-tab.spec.ts` — the new alertdialog/accessible-name case
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — reference `SOLID_FILL_WARN`
- `frontend/src/app/operator/payouts-tab.ts` — same adoption
- `frontend/src/app/operator/payouts-tab.html` — confirm block → `<app-confirm-panel>`
- `frontend/src/app/operator/payouts-tab.spec.ts` — the new alertdialog/accessible-name case
- `frontend/src/app/operator/payouts-tab.contrast.spec.ts` — reference `SOLID_FILL_WARN`
- `frontend/src/testing/glass-tokens.ts` — `SOLID_FILL_WARN`
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — third family member
- `frontend/src/tailwind.css` — `--riv-solid-fill-warn` + `@theme inline` row
- `frontend/e2e/solid-fill-token-skin.e2e.ts` — registry/utility extension + assertion
- `frontend/e2e/operator-daily.e2e.ts` — alertdialog role + accessible-name assertions
- `frontend/e2e/operator-payouts.e2e.ts` — alertdialog role + accessible-name assertions
- `docs/design/colour-literal-token-audit.md` — close the `#9a6410` class-T row

---

## Phase 0 — `shared/confirm-panel`: `headline` + `busy` + `warn` tone

**Files:** Modify `frontend/src/app/shared/confirm-panel.ts` · Test
`frontend/src/app/shared/confirm-panel.spec.ts`

- [ ] **Step 1: Write the failing specs** — a `headline` case (renders `<strong>` before the
      message), a `warn` tone case (button paints `bg-riv-solid-fill-warn`), and a `busy`
      case (both buttons carry `aria-disabled` and reject a click).

```ts
it('renders an optional bold headline before the message', () => {
  fixture.componentInstance.headline.set('Close today’s online sales?');
  fixture.detectChanges();
  const panel = byId('panel');
  expect(panel.querySelector('strong')!.textContent).toBe('Close today’s online sales?');
});

it('carries the warn ink on request', () => {
  fixture.componentInstance.tone.set('warn');
  fixture.detectChanges();
  expect(byId('yes').className).toContain('bg-riv-solid-fill-warn');
});

it('blocks confirm and cancel while busy', () => {
  fixture.componentInstance.busy.set(true);
  fixture.detectChanges();
  byId('yes').click();
  byId('no').click();
  expect(fixture.componentInstance.confirmed).toBe(0);
  expect(fixture.componentInstance.cancelled).toBe(0);
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- confirm-panel` → FAIL (no `headline`/
      `busy` input, no `warn` tone).
- [ ] **Step 3: Implement** — add `readonly headline = input<string>();`, `readonly busy =
      input(false);`, extend `ConfirmTone` to `'destructive' | 'primary' | 'warn'` and
      `CONFIRM_BUTTON` with a `warn` entry (`bg-riv-solid-fill-warn`), render `@if
      (headline(); as h) { <strong>{{ h }}</strong> }` before `{{ message() }}`, bind
      `[appBusy]="busy()"` on both buttons, import `BusyAction`.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- confirm-panel` → PASS.
- [ ] **Step 5: Generalization-audit pass** — grep every `ConfirmPanel` consumer
      (`grep -rln "app-confirm-panel" frontend/src/app`) to confirm `layout-editor` and
      `set-editor` are unaffected (no `headline`/`busy` binding, default `false`/`undefined`).
- [ ] **Step 6: Commit** — `git commit -m "Add headline, busy and a warn tone to shared/confirm-panel (#881)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Adopt in `daily-view-tab`

**Files:** Modify `frontend/src/app/operator/daily-view-tab.ts|.html|.spec.ts`

- [ ] **Step 1: Write the failing spec** — `'exposes the close-sales confirm as an
      alertdialog with an accessible name'`.

```ts
it('exposes the close-sales confirm as an alertdialog with an accessible name', () => {
  render();
  byId('daily-close-sales').click();
  fixture.detectChanges();
  const panel = byId('daily-close-sales-confirm-panel');
  expect(panel.getAttribute('role')).toBe('alertdialog');
  expect(panel.getAttribute('aria-label')).toBe('Close today’s online sales?');
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- daily-view-tab` → FAIL (no `role`
      attribute on the plain `<div>`).
- [ ] **Step 3: Implement** — replace the confirm `<div>` with `<app-confirm-panel>`
      (`label`/`headline` = the bold lead, `message` = the remaining copy, `tone="warn"`,
      `[busy]="closeSalesBusy()"`, the three existing `data-testid`s preserved), import
      `ConfirmPanel` into the component's `imports`, and remove the now-redundant
      `this.focusAfterRender('daily-close-sales-confirm')` call from `onCloseSales()` (the
      component focuses its own confirm button on creation).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- daily-view-tab` → PASS; re-run the
      existing focus specs (`'moves focus to the confirm button…'`,
      `'returns focus to the trigger…'`) to confirm they stay green unmodified.
- [ ] **Step 5: Generalization-audit pass** — confirm no other operator surface still
      hand-rolls this exact amber-card shape (`grep -rn "border-riv-warn-edge" frontend/src/app/operator`).
- [ ] **Step 6: Commit** — `git commit -m "Adopt shared/confirm-panel for the close-sales confirm (#881)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Adopt in `payouts-tab` + retire the `#9a6410` literal

**Files:** Modify `frontend/src/app/operator/payouts-tab.ts|.html|.spec.ts`,
`payouts-tab.contrast.spec.ts`, `daily-view-tab.contrast.spec.ts`,
`frontend/src/testing/glass-tokens.ts`, `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts`,
`frontend/src/tailwind.css`

- [ ] **Step 1: Write the failing spec** — the payouts mirror of Phase 1's Step 1, plus a
      `solid-fill-tokens.contrast.spec.ts` case for the new `warn` member.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- payouts-tab solid-fill-tokens` →
      FAIL (no `--riv-solid-fill-warn` declared yet).
- [ ] **Step 3: Implement** — declare `--riv-solid-fill-warn: #9a6410;` + its `@theme
      inline` row in `tailwind.css` (in the existing `--riv-solid-fill-*` doc comment, noting
      the third member and issue #881), add `SOLID_FILL_WARN` to `glass-tokens.ts`, extend
      `solid-fill-tokens.contrast.spec.ts`'s `FAMILY`/`FILL_ROLES`/AA loop, adopt
      `<app-confirm-panel>` in `payouts-tab.html` (dropping the `<em>every</em>` per the
      ledger), remove the redundant open-leg `focusAfterRender` call from
      `onWeatherRefund()`, and update both contrast specs to import `SOLID_FILL_WARN`
      instead of the `'#9a6410'` string literal.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- payouts-tab daily-view-tab solid-fill-tokens confirm-panel` → PASS.
- [ ] **Step 5: Generalization-audit pass** — `grep -rn "9a6410" frontend/src frontend/e2e docs` to
      confirm no literal survives outside this plan's own prose and the (updated) contrast-spec
      comments.
- [ ] **Step 6: Commit** — `git commit -m "Adopt shared/confirm-panel for the weather-refund confirm; retire the #9a6410 literal (#881)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — e2e coverage + full verification

**Files:** Modify `frontend/e2e/operator-daily.e2e.ts`, `frontend/e2e/operator-payouts.e2e.ts`,
`frontend/e2e/solid-fill-token-skin.e2e.ts`, `docs/design/colour-literal-token-audit.md`

- [ ] **Step 1: Write the failing e2e** — add `role`/accessible-name assertions to both
      existing confirm-flow tests, and extend `solid-fill-token-skin.e2e.ts`'s `REGISTRY`/
      `UTILITIES` plus one assertion that the weather-confirm button now paints
      `rgb(154, 100, 16)` via the token.
- [ ] **Step 2: Run it, verify it fails/passes appropriately** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- operator-daily operator-payouts solid-fill-token-skin`.
- [ ] **Step 3: Full verification** — `npm run lint`, `npm run format:check`, `npm test`,
      `npm run build`, the e2e command above.
- [ ] **Step 4: Update the ledger** — `docs/design/colour-literal-token-audit.md`'s
      `#9a6410` row: mark done, citing this plan + issue #881.
- [ ] **Step 5: Reconcile the File-structure section** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 6: Commit** — `git commit -m "Cover the confirm-panel adoption end to end; close the #9a6410 ledger row (#881)"`
- [ ] **Step 7: Update plan-doc execution status**; mark ready for review.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- daily-view-tab payouts-tab` + the e2e role/name assertions.
- [ ] **AC-2:** the existing focus specs, unmodified, still green.
- [ ] **AC-3:** `npm test -- confirm-panel` → the busy case.
- [ ] **AC-4:** `npm test -- solid-fill-tokens` + `solid-fill-token-skin.e2e.ts`.
- [ ] **AC-5:** the ledger row, read at close-out.

If any AC isn't verified by a passing test, write the test or admit it's not done.

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
