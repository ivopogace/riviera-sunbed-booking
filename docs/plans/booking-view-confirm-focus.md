# Tourist confirm-panel focus return Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the tourist booking view's two confirm-before-destroy surfaces — cancel a
booking and withdraw a pending request — the return leg they never had, so no transition
leaves keyboard or AT focus stranded on `<body>` (WCAG 2.4.3).

**Architecture:** The single most significant decision is that this is **not** a third shared
confirm component. #604 already extracted the genuinely uniform piece — `shared/focus-after-render`'s
`focusMover()` — and the two families it found split on *markup*, not on focus behaviour. The
tourist surfaces are a third markup family (tourist inks, the module-local `cls.*` recipe map, one
prompt on a card and one on a banner) but the **same** focus behaviour, so booking-view adopts the
existing helper in both directions and keeps its own markup. Where the trigger survives the
transition, focus returns to it; where the action destroys it, focus parks on the live result
region that the same tick populates.

**Persistence:** N/A — frontend-only, no backend or schema change.

**Source of intent:** GitHub issue #614 (deferred from #604's generalization audit, recorded in
`docs/plans/shared-confirm-panel.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught three
drifts in the issue text: the cancel trigger is `start-cancel` not `cancel-booking`; the withdraw
**error** leg does *not* replace the prompt, so its gap is a different one; and the busy-`[disabled]`
blur means focus is already on `<body>` before any prompt is destroyed) · `riviera-plan-doc` (this
template — the behavior-parity ledger is what forced enumerating the `afterRenderEffect` blocks
being replaced rather than calling the swap "equivalent") · `tdd` (each transition's spec is
written and proven RED before its return leg exists) · `riviera-review-overlay` (review gate —
RV-FE-E2E consulted at plan time for spec placement; full run due at ready-for-review) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD`, **0 findings** — the rename grep for the
deleted `#confirmBtn`/`afterRenderEffect` idiom hit only the vendored `angular-developer` reference,
which documents a live Angular API rather than a riviera fact; the counting sweep found no substrate
statement counting the focus helper's adopters at all, and its "the two…"/"of the two" hits were every
one about another subject — booking lifecycle, mail counters, published surfaces) · `riviera-frontend` (placement: no new file and no new cross-feature
import — the helper already lives in `shared/`, which `booking/` may import; RV-FE-8's frozen
five-edge table is untouched) · `angular-developer` + angular-cli MCP (`search_documentation` on
`afterNextRender` confirmed the helper's `earlyRead`→`write` phase split is the documented shape
for a read-then-focus, which is why the imperative helper replaces the `afterRenderEffect` pair
rather than sitting beside it) · `playwright-cli` (the real-browser half — jsdom does not implement
unfocus-on-disable, so the busy-blur legs are only observable in Chromium; see R-1) ·
`riviera-local-debug` (Windows dev machine: `npm test`, `npm run test:e2e:a11y` for the mocked suite) ·
`riviera-tailwind` (**loaded at the review-fix round, not at plan time** — F-6 added a
`focus-visible:outline-*` recipe to `CLS.result`, which is the slice's only Tailwind; the skill's
token rule is why the ring reuses `--riv-accent-ink` rather than a literal, matching the six other
`focus-visible` recipes already in this file)

> The plan originally recorded `riviera-tailwind` as **not triggered**, on the grounds that the two
> landmarks gain a bare `tabindex="-1"` and no class changes. That was true of the slice as planned
> and stopped being true when F-6 landed a focus ring — the routing gate is re-run per fix, so the
> skill was loaded **before** that edit and this line updated with it (RV-PROC-1).

**Branch:** `bugfix/booking-view-confirm-focus` — created before phase 0.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the cancel confirmation open, when the guest activates **Keep booking**,
  then the prompt closes and focus returns to the **Cancel booking** trigger it replaced.
  *Pinned by:* `booking-view.spec.ts` › `returns focus to the cancel trigger when the guest keeps the booking`
- [x] **AC-2:** Given the withdraw confirmation open, when the guest activates **Keep request**,
  then the prompt closes and focus returns to the **Withdraw request** trigger it replaced.
  *Pinned by:* `booking-view.spec.ts` › `returns focus to the withdraw trigger when the guest keeps the request`
- [x] **AC-3:** Given the cancel confirmation open, when the cancellation succeeds, then the whole
  cancel section is gone and focus lands on the live result region stating the outcome.
  *Pinned by:* `booking-view.spec.ts` › `parks focus on the result when a cancellation completes`
- [x] **AC-4:** Given the withdraw confirmation open, when the withdrawal succeeds, then the
  withdraw affordance is gone and focus lands on the live result region stating the outcome.
  *Pinned by:* `booking-view.spec.ts` › `parks focus on the result when a withdrawal completes`
- [x] **AC-5:** Given the cancel confirmation open, when the server refuses because the service day
  has begun, then the cancel affordance is withdrawn and focus lands on the result region carrying
  the explanation — not on `<body>`.
  *Pinned by:* `booking-view.spec.ts` › `parks focus on the result when the cancel window has closed`
- [x] **AC-6:** Given the withdraw confirmation open, when the withdrawal fails, then the prompt
  closes, the booking is **re-read**, and focus lands on the result region carrying the explanation —
  never on a retry button the server has already refused.
  *Pinned by:* `booking-view.spec.ts` › `parks focus on the result when a withdrawal fails, and re-reads`
  **and** `e2e/request-to-book.e2e.ts` › `a failed withdrawal parks focus on the outcome and re-reads the booking`
- [x] **AC-7:** Given either surface, when the guest opens its confirmation, then focus still moves
  onto the destructive confirm button exactly as before the helper swap.
  *Pinned by:* the **existing, unmodified** `booking-view.spec.ts` ›
  `moves focus to the destructive confirm button when the cancel prompt appears` and its withdraw twin
- [x] **AC-8:** Given a real browser, when the cancel flow is driven open → keep → open → confirm,
  then focus lands on the confirm button, back on the trigger, and finally on the result region,
  and axe reports no serious violations.
  *Pinned by:* `e2e/my-bookings.e2e.ts` › `the cancel confirmation moves focus in and back out (WCAG 2.4.3)`
- [x] **AC-9:** Given a real browser, when the withdraw flow is driven open → keep → open → confirm,
  then focus lands on the confirm button, back on the trigger, and finally on the result region.
  *Pinned by:* `e2e/request-to-book.e2e.ts` › `the withdraw confirmation moves focus in and back out (WCAG 2.4.3)`

## Non-goals

- **No third shared confirm component.** The reusable piece is the focus transition, and it is
  already shared (`shared/focus-after-render`). A tourist-themed `ConfirmPanel` variant would have
  to carry `cls.btnDanger`/`cls.btnOutline`/`cls.confirmQ`/`cls.confirmQOnBanner` **and** two prompt
  inks (on-card vs on-banner) as flags — the same "variant axis imposes drift" argument that made
  #604 ship two components rather than one.
- **No re-styling and no copy change.** Every class string, ink, and sentence stays as shipped.
- **Not switching the busy state from `[disabled]` to `aria-disabled`, and therefore not closing
  the in-flight focus window.** While a cancel or withdrawal is in flight, the browser blurs the
  disabled confirm button and focus sits on `<body>` until the response lands — where this slice
  then places it deliberately. The review confirmed that window twice (F-5); it is pre-existing on
  `main`, applies to every busy button in the view, and the coherent fix is the `aria-disabled`
  posture change. **Deferred to #616**, and stated here rather than left implied: this slice makes
  every *settled* transition land somewhere, not every instant of the interaction.
- **No testid renames.** Every existing hook is preserved so no unit or e2e spec is rewritten.
- **No focus trap.** These are inline confirmations, not modals; `shared/focus-trap.ts` stays with
  the real modals (booking dialog, find-booking).
- **Not re-auditing the six surfaces #604 unified**, nor `auth/set-password.ts`, which #604's audit
  already verified focuses both ways.

## Behavior-parity ledger

> The slice replaces booking-view's two `afterRenderEffect` + `viewChild` focus-in blocks with the
> shared helper. "Equivalent" is a claim, so every behavior of the old blocks is verdicted here.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| Opening the cancel prompt focuses `confirm-cancel` | preserved | `startCancel()` calls `focusAfterRender('confirm-cancel')`; the existing focus spec is left **unmodified** as the parity net |
| Opening the withdraw prompt focuses `confirm-withdraw` | preserved | `startWithdraw()` calls `focusAfterRender('confirm-withdraw')`; same unmodified parity spec |
| Focus-in is found via a `#confirmBtn` / `#withdrawConfirmBtn` template ref | **changed (deliberate)** | found via `[data-testid]` inside the component host, like the six surfaces #604 unified. Both refs and both `viewChild()` fields are deleted; the `data-testid`s they sat beside already existed and are unchanged |
| Focus-in re-asserts on every render while `confirming()` is true (`afterRenderEffect` re-runs on dep change) | **changed (deliberate)** | fires once per open transition. The only dep was the flag itself, which changes exactly on open and close, so the observable behavior is the same — and a *re-assert* would be wrong anyway once the busy `[disabled]` legitimately moves focus off |
| Route-param change resets `confirming` / `confirmingWithdraw` to false and moves no focus | preserved | the reset stays in the `paramMap` subscription; no focus call is added there |
| `keepBooking()` / `keepRequest()` close the prompt and touch nothing else | preserved (extended) | bodies unchanged apart from the added return leg |
| `confirmCancel()` success sets `cancellation`, closes the prompt, refreshes | preserved (extended) | body unchanged apart from the added return leg |
| `confirmCancel()` error distinguishes `CANCELLATION_WINDOW_CLOSED` from a generic failure and re-reads | preserved (extended) | body unchanged apart from the added return leg |
| `confirmWithdraw()` success sets `withdrawn`, closes the prompt, refreshes | preserved (extended) | body unchanged apart from the added return leg |
| `confirmWithdraw()` error leaves the prompt **open** and retryable, and does **not** re-read | **changed → fixed (review F-1)** | it now closes the prompt, calls `load(true)` and lands on the result, exactly like the cancel twin. The original plan preserved this row; the review showed preserving it was the bug — a 409 on withdraw means the venue already answered, so the "retry" this slice was about to park focus on could only ever 409 again while the stale *Waiting for the venue* banner stayed on screen |
| `cancel-result` / `withdraw-result` are `role="status" aria-live="polite"` and `empty:hidden` | preserved | both keep every attribute and class; they gain `tabindex="-1"` only |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **jsdom does not implement unfocus-on-disable.** A real browser blurs the confirm button the instant `[disabled]="cancelling()"` goes true, so focus is on `<body>` for the whole in-flight request; jsdom leaves it where it was. A unit spec for a failure leg can therefore pass **without** the fix — a false green | high | high | Every new spec is proven RED on pre-fix code before its leg is written; any leg jsdom cannot show red is pinned in the Chromium e2e instead, never claimed on the unit spec alone | Ivo | **closed** — the mitigation was initially *claimed* rather than done: the plan said the busy-blur legs were pinned by AC-9, but AC-9 drives a **successful** withdrawal. The review caught the overclaim (F-2) and it is now actually true: `a failed withdrawal parks focus on the outcome and re-reads the booking` drives the failing leg in Chromium. F-1 also removed the artificial `blur()` the unit spec needed, because the leg now destroys its prompt like its three siblings |
| R-2 | The chosen landing spot is `role="status" aria-live="polite"`, so a screen reader may announce the outcome twice — once as a live update, once as the newly focused element | med | low | Accepted deliberately (decision below): a mild duplicate beats a hard 2.4.3 failure, and the alternative landmark races the async reload (R-4). The `<p>` gains no accessible name of its own, so what is read is the same sentence, not a second unrelated label | Ivo | **closed — accepted.** Re-raised independently by the review and re-affirmed. The inverse hazard turned out to matter more: `auth/operator-password.ts:38` documents that a live region entering the tree *with* its text is often **not** announced at all, and these regions are `empty:hidden` — so parking focus on them is what guarantees the outcome is read, not merely a tolerable duplicate |
| R-3 | Deleting the two `viewChild` refs could regress focus-**in**, which currently has passing specs | med | med | The two existing focus-in specs are left **unmodified** and re-run as the parity net (AC-7); the `#confirmBtn` / `#withdrawConfirmBtn` template refs are deleted in the same commit so a stale ref cannot linger | Ivo | **closed** — both specs green and untouched through the whole slice, including the fix round |
| R-4 | A completed cancel/withdrawal calls `load(true)`; the focus move fires on the **next render**, which lands before that GET resolves. Aiming at anything the reload produces (the `CANCELLED` / `WITHDRAWN` banner) would race it, and the helper no-ops on a missing target — stranding focus silently | med | high | Both completed legs aim at the result `<p>`, populated **synchronously** by the same signal write that closed the prompt. Explicitly rejected: the status banner (see the resolved decision below) | Ivo | **closed** — and vindicated by F-1: making the withdraw-failure leg re-read too would have been unsafe against any target the reload owns, which is why that leg lands on the result region rather than on `withdraw-request` |
| R-5 | The result `<p>`s are `empty:hidden`, so a focus move that arrived while one was empty would silently no-op | low | med | Every focus move to them is on a leg that sets its own populating signal (`cancellation`, `cancelWindowClosed`, `cancelFailed`, `withdrawn`) in the same tick; each is asserted by its own spec rather than assumed | Ivo | **closed** — all five legs assert the landing node by identity, so an empty-region no-op cannot pass |
| R-6 | The cancel **error** leg calls `load(true)`, which can flip `cancellable` to false and unmount the trigger — so a return leg aimed at `start-cancel` would work or not depending on a race | med | med | The error leg aims at the result region too, not the trigger. Pinned by AC-5, which drives exactly the closed-window path the existing spec already proves withdraws the affordance | Ivo | **closed** — AC-5 green |
| R-7 | *(raised by the review, F-4)* The two **open-the-prompt** legs aim at a confirm button that lives inside `@if (b.cancellable …)`, so an in-flight `load(true)` from a prior failed attempt could unmount the target between the click and the render, leaving the helper to no-op | low | med | **Accepted as a residual, not fixed here** — and deferred to **#616** rather than papered over. The honest fix is a fallback landing spot inside `focusMover()` itself, which would change behaviour for all **seven** adopters and belongs with the other helper-wide work, not in a tourist-surface bugfix. Requires a second cancel attempt racing an unresolved refresh | Ivo | **deferred → #616** |

## Open questions / Assumptions

None outstanding.

### Resolved

- **Open question:** is the honest fix a third shared confirm surface, or a local return leg?
  — **Resolved 2026-08-10 at plan time by Ivo.** A local return leg, built on the **existing**
  `shared/focus-after-render` helper — and the adoption goes **both directions**, replacing the two
  `afterRenderEffect` + `viewChild` focus-in blocks so booking-view carries one focus idiom rather
  than two. This makes booking-view the seventh and last adopter of the helper, closing the pattern
  #604 opened.
- **Open question:** where does focus land when the action completes and the trigger dies with it?
  — **Resolved 2026-08-10 at plan time by Ivo.** The live result region (`cancel-result` /
  `withdraw-result`), which gains `tabindex="-1"`. Rejected: the `CANCELLED`/`WITHDRAWN` status
  banner (richer, and not a live region, but it only exists after the async `load(true)` resolves —
  R-4), and the card `<h1>` (always present, but discards the outcome the guest needs).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice adds, removes and reorders **no request**: the
cancel `POST` and the withdraw `POST` fire from the same handlers on the same conditions, and the
post-action `load(true)` refresh is untouched. The server remains the sole author of the
cancellation tier and refund amount (invariant #10); nothing here computes money or availability.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The refund sentences rendered beside the focused result region are
server-computed values already on the wire; this slice neither reads nor recomputes them.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` | existing | standalone component, inline template | drops 2 `viewChild` + 2 `afterRenderEffect`; adds `focusMover()` and six return legs | unchanged |
| FE-2 | `booking/booking-view.spec.ts` | existing | Vitest/jsdom spec | six new focus specs; the two existing focus-in specs left unmodified | — |
| FE-3 | `e2e/my-bookings.e2e.ts` | existing | Playwright (mocked suite) | the cancel flow's real-browser focus assertions | — |
| FE-4 | `e2e/request-to-book.e2e.ts` | existing | Playwright (mocked suite) | the withdraw flow's real-browser focus assertions | — |

**Standards:** standalone components, `inject()`, `@if`/`@switch`, signal APIs, no
`ChangeDetectionStrategy.OnPush` (default in v22), no `standalone: true` (default), host bindings in
the `host` object. No deviation.

## FE↔BE contract

N/A — no contract change. No request URL, method, body or header is added, removed or reshaped.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `merge — all gates cleared, close-out written`

**Next action:** Merge PR #617. Post-merge items are GitHub-only: confirm #614 closed by the
`Closes` line, and #616 already carries the two deferred findings (F-4/R-7 and F-5).

PR: **#617** (opened as a draft at the first phase commit, per `riviera-sdlc` rule 3 — CI fires on
the `pull_request` event only). **Merged via PR #617.**

**Gates:** CI green (backend, frontend, repo hygiene ×2, CodeQL) · review gate **run in full** —
`/code-review` at high effort via ladder rung 1 (24 agents, 10 findings) **plus a re-review of the
fix diff** (23 agents, 8 findings — which caught the first round's fix being half-done) · Sonar green **with its reported list actually pulled**: 0 issues, 0 new bugs
/ vulnerabilities / code smells, 0 duplicated blocks, new-code coverage **100.0%** (`measures`
non-empty at `new_lines: 35` and the check-run `success`, so not a false-clean read) ·
docs-freshness ran over `origin/main...HEAD`, 0 findings.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Adopt the shared helper + the two keep return legs | ✅ | `1df3bb2` |
| 1 — The completed-action legs + the `tabindex="-1"` landmarks | ✅ | `3ba7784` |
| 2 — Real-browser e2e coverage + full verification | ✅ | `21321cb` |
| 3 — Review-gate fixes (F-1, F-2, F-3, F-6, F-7, F-8) | ✅ | `9dd02a6` |
| 4 — Re-review fixes (F-10 … F-15) | ✅ | `627b161` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

> The review ran `/code-review` at **high** effort (rung 1 of the invocation ladder succeeded —
> a 24-agent fan-out) with `riviera-review-overlay` layered on: 13 candidates verified, merged to **10**.
> The fix diff was then **re-reviewed** at the same effort (23 agents) per `pr-gates.md` §1 step 3 —
> and that second pass is what justified the rule: it found F-1's fix **half-done**, plus a spec that
> asserted nothing about the behaviour it was named for. 16 candidates, **8** after merging.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (CONFIRMED, + 2 PLAUSIBLE on the same root cause) | **The slice's own bug.** `confirmWithdraw()`'s error leg parked focus on `confirm-withdraw` but — alone among the four settle legs — never re-read. A 409 means the venue already answered, so the slice deliberately placed a keyboard guest on a permanently dead retry beside a stale *Waiting for the venue* banner. Two verifiers separately added that the failure text likely goes **unannounced**, since it is the one leg whose focus moves *away* from the `empty:hidden` live region it just populated | fixed-in-`9dd02a6` — the leg now closes the prompt, `load(true)`s, and lands on `withdraw-result`, exactly mirroring the cancel twin. Verified RED first |
| F-2 | review (CONFIRMED) | **The plan doc overclaimed.** R-1 said legs jsdom cannot show red are pinned in Chromium, and AC-6 leaned on that — but no e2e drove a *failing* withdrawal, so the one leg with that justification was backed only by a jsdom spec with a hand-written `blur()` | fixed-in-`9dd02a6` — added the Chromium test; F-1 independently removed the need for the `blur()` |
| F-3 | review (CONFIRMED, cleanup) | The two back-out buttons carry no `data-testid`, forcing five call sites across three files to select them by visible copy | fixed-in-`9dd02a6` — `keep-booking` / `keep-request` added; all five sites converted |
| F-4 | review (PLAUSIBLE) | The two open-the-prompt legs aim at a target a concurrent refresh can unmount | **deferred → #616** as risk R-7; the honest fix is a fallback inside `focusMover()`, which changes behaviour for all seven adopters |
| F-5 | review (CONFIRMED, ×2 verifiers) | The in-flight `[disabled]` window blurs focus to `<body>` for the whole request, and no interim park was considered | **deferred → #616.** Pre-existing on `main`, present on every busy button in the view, and the coherent fix is an `[disabled]`→`aria-disabled` posture change — folding it in would bury the #614 fix, the same reasoning that produced #614 from #604 |
| F-6 | review (PLAUSIBLE, cleanup) | Focus parks on a paragraph with no focus styling, so a sighted keyboard guest sees nothing | fixed-in-`9dd02a6` — `focus-visible` ring on `CLS.result`, using the same token as the view's six other rings. **Pulled `riviera-tailwind` into the routing gate**; loaded before the edit and recorded in *Skills consulted* |
| F-7 | review (CONFIRMED, cleanup) | The new `keepButton()` spec helper left the identical hand-rolled lookup it replaced in place further down the file | fixed-in-`9dd02a6` — F-3's test ids made the helper unnecessary; deleted, all three sites now query by id |
| F-8 | review (CONFIRMED, cleanup) | 6-line TSDoc on `startCancel()` over the nested `CLAUDE.md`'s ~3-line member budget, stating whole-slice policy on the member least related to it — the same finding #604 took as its F-4 | fixed-in-`9dd02a6` — trimmed to a two-line pointer at this doc |
| F-10 | **re-review** (CONFIRMED, 4 finders independently) | **F-1's fix was half-done.** It copied `confirmCancel()`'s focus-and-re-read *mechanics* but not its **problem-code discrimination**, so a terminal 409 rendered "We couldn't withdraw the request. Please try again." on top of the freshly re-read `DECLINED` banner — and the new e2e **pinned that contradiction as expected**. On a dropped-200 the page said "Request withdrawn. The spot is free" and "we couldn't withdraw" at once | fixed-in-`627b161` — a `withdrawNotPending` signal set from `REQUEST_NOT_PENDING` (the code `BookingController.withdraw` actually emits), with its own terminal sentence; the exact twin of `cancelWindowClosed`. Verified RED |
| F-11 | re-review (CONFIRMED) | Neither `startWithdraw()` nor `keepRequest()` cleared `withdrawFailed`, so — now that the error leg closes the prompt — arming or abandoning a *new* attempt left the previous attempt's error on screen and in the live region | fixed-in-`627b161` — one `clearWithdrawResult()` called from all three entry points. Verified RED |
| F-12 | re-review (CONFIRMED) | The rewritten AC-6 spec was titled "…and re-reads" but asserted **nothing** about the re-read: deleting `load(true)` left the suite green | fixed-in-`627b161` — the stub now records every `getByCode`, and the spec asserts both calls |
| F-13 | re-review (CONFIRMED) | The `getByTestId` conversion (F-3) deleted the **only** coverage that the two destructive-dialog escape buttons carry the accessible names "Keep booking"/"Keep request" — axe's `button-name` fires on an *empty* name, not a wrong one | fixed-in-`627b161` — both back-out specs now assert the visible label as well as using the hook |
| F-14 | re-review (CONFIRMED) | The new failing-withdrawal e2e omitted the `expectNoSeriousAxeViolations` every sibling state test in that file makes — leaving the one state this slice introduces unaudited | fixed-in-`627b161` |
| F-15 | re-review (PLAUSIBLE) | The e2e mock fulfilled the 409 with `NOT_WITHDRAWABLE`, a code the backend never emits | fixed-in-`627b161` — `REQUEST_NOT_PENDING`, verified against `BookingController.withdraw` |
| F-16 | re-review (PLAUSIBLE) | On a **transient** failure the result region sits *after* the retry in DOM order, so the guest tabs away from the control they want | **accepted.** The alternative is aiming the transient leg at `withdraw-request` — which is exactly the dead-retry hazard F-1 fixed, since the client cannot always tell transient from terminal. Landing on the outcome and requiring one Shift+Tab is the safer default |
| F-17 | re-review (PLAUSIBLE) | The new focus-visible ring has no test | **accepted** — a `:focus-visible` variant needs real keyboard-vs-pointer heuristics to assert honestly; the repo's other six rings in this file are likewise untested |
| F-9 | review (PLAUSIBLE) | `tabindex="-1"` on a polite live region can double-announce | **accepted** — R-2, Ivo's plan-time decision, re-affirmed. The opposite hazard (an `empty:hidden` region entering the tree with its text is often not announced at all) makes the focus park the thing that *guarantees* delivery |

---

## File structure

- `docs/plans/booking-view-confirm-focus.md` — this plan
- `frontend/src/app/booking/booking-view.ts` — adopt `focusMover()` both directions; add the six
  return legs; add `tabindex="-1"` to the two result regions
- `frontend/src/app/booking/booking-view.spec.ts` — the six focus specs
- `frontend/e2e/my-bookings.e2e.ts` — the cancel flow's real-browser focus + axe assertions
- `frontend/e2e/request-to-book.e2e.ts` — the withdraw flow's real-browser focus assertions

---

## Phase 0 — Adopt the shared helper + the two keep return legs

**Files:** Modify `frontend/src/app/booking/booking-view.ts` · Test
`frontend/src/app/booking/booking-view.spec.ts`

- [x] **Step 1: Write the failing specs** — AC-1 and AC-2: open each prompt, activate its Keep
      button (found by text, as the existing back-out specs do — neither Keep button has a testid),
      assert `document.activeElement` is the trigger.
- [x] **Step 2: Run them, verify they fail** — `ng test --include="src/app/booking/booking-view.spec.ts"`
      → `2 failed | 49 passed`, both on `expected <body> to be <button>`.
- [x] **Step 3: Implement** — add `private readonly focusAfterRender = focusMover();` as a field
      initializer, delete both `viewChild` fields, both `afterRenderEffect` blocks and both
      template refs, and call the helper from `startCancel`/`startWithdraw` (focus-in, parity) and
      `keepBooking`/`keepRequest` (the new return legs).
- [x] **Step 4: Run them, verify they pass** — `51 passed`, including the two **unmodified**
      focus-in specs (AC-7).
- [x] **Step 5: Generalization-audit pass** — 3 sibling gaps found in three other feature areas;
      filed as **#616** rather than widened. See the audit log.
- [x] **Step 6: Commit** — `git commit -m "Return focus to the tourist confirm triggers (#614)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The completed-action legs + the landmarks

**Files:** Modify `frontend/src/app/booking/booking-view.ts` · Test
`frontend/src/app/booking/booking-view.spec.ts`

- [x] **Step 1: Write the failing specs** — AC-3/AC-4 (the success twins), then AC-5, then AC-6.
- [x] **Step 2: Run each, verify it fails** — success twins `2 failed | 51 passed`; AC-5
      `1 failed | 53 passed`; AC-6 `1 failed | 54 passed`. **The R-1 gate fired on AC-6**, exactly
      where predicted: the withdraw-failure leg keeps its prompt open, so the only thing that
      strands focus there is the `[disabled]` blur, which jsdom does not implement. The spec models
      it with an explicit `blur()` — named in a comment as standing in for the browser — which is
      what lets it fail; the real behaviour is pinned in Chromium by AC-9.
- [x] **Step 3: Implement** — `tabindex="-1"` on both result `<p>`s; `focusAfterRender('cancel-result')`
      on `confirmCancel`'s success **and** error legs; `focusAfterRender('withdraw-result')` on
      `confirmWithdraw`'s success leg; `focusAfterRender('confirm-withdraw')` on its error leg.
- [x] **Step 4: Run them, verify they pass** — `71 passed` across `booking-view*.spec.ts`.
- [x] **Step 5: Generalization-audit pass** — the landmark idiom already ships in
      `auth/operator-password.ts`; the one real gap is inside #616. See the audit log.
- [x] **Step 6: Commit** — `git commit -m "Park focus on the outcome when a cancel or withdrawal completes (#614)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Real-browser e2e coverage + full verification

**Files:** Modify `frontend/e2e/my-bookings.e2e.ts`, `frontend/e2e/request-to-book.e2e.ts`

- [x] **Step 1: Write the failing e2e** — AC-8 and AC-9, driving open → keep → open → confirm and
      asserting `toBeFocused()` at each step. This is the half that can actually observe the
      busy-`[disabled]` blur (R-1).
- [x] **Step 2: Run it, verify it fails/passes appropriately** — `13 passed` on the two files. Then
      **verified RED against pre-fix code**, which is what R-1 actually rests on: with
      `booking-view.ts` checked out from `origin/main`, both fail on
      `expect(locator).toBeFocused() … Received: inactive`. Written after the fix, they would
      otherwise have been unproven regression pins.
- [x] **Step 3: Axe** — `expectNoSeriousAxeViolations` after the completed cancel, behind `settle(page)`.
- [x] **Step 4: Full verification** — `ng lint` clean · `npm test` **1335 passed (155 files)** ·
      `npm run build` succeeds · `npm run test:e2e:a11y` **167 passed (5.4m)**.
- [x] **Step 5: Reconcile the File-structure section** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean (exit 0);
      `check-inline-comments.mjs` clean on all four touched files.
- [x] **Step 6: Commit** — `git commit -m "Cover the tourist confirm focus transitions end to end (#614)"`
- [x] **Step 7: Update plan-doc execution status**; mark ready for review.

---

## Phase 3 — Review-gate fixes

**Files:** Modify `frontend/src/app/booking/booking-view.ts`, `booking-view.spec.ts`,
`frontend/e2e/request-to-book.e2e.ts`, `frontend/e2e/my-bookings.e2e.ts`

- [x] **Step 1: Re-run the routing gate for what the fixes touch** — F-6's focus ring is Tailwind,
      an area the plan had declared untriggered, so `riviera-tailwind` was loaded **before** the
      edit and *Skills consulted* updated (RV-PROC-1).
- [x] **Step 2: Fix F-1 test-first** — reshape the AC-6 spec to the new contract, prove it RED on
      the pre-fix error leg (`1 failed | 54 passed`), then re-read + land on the result.
- [x] **Step 3: Fix F-2** — the Chromium test for a *failing* withdrawal, which is what R-1 had
      claimed and not delivered.
- [x] **Step 4: Fix F-3, F-6, F-7, F-8** — test ids on both Keep buttons (which made F-7's helper
      unnecessary rather than merely deduplicated), the focus ring, the trimmed TSDoc.
- [x] **Step 5: Generalization-audit pass** on F-1's pattern — see the log.
- [x] **Step 6: Full verification** — `ng lint` clean · `npm test` **1335 passed** ·
      `npm run test:e2e:a11y` **168 passed** · both hygiene guards clean over the whole diff.
- [x] **Step 7: Propagate the deferred findings** — F-4/R-7 and F-5 written onto **#616** with
      their reasoning (close-out step 3), not left in the review transcript.
- [x] **Step 8: Commit + update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 3 — fixing F-1 (a failure leg that left a dead retry live) | every other settle leg whose **failure cause is itself evidence the server moved on**, and which therefore must re-read rather than re-offer | read each `catch` / `error:` leg in `booking-view.ts`, `set-editor.ts`, `admin-venue-photos.ts`, `admin-operators.ts` and ask whether the failure implies changed server state | 2 in `booking-view` (cancel — already re-read; withdraw — the F-1 bug) | **Both now correct; nothing else qualifies.** The distinguishing test is not "does the leg re-read" but "does *this* failure mean the state moved on". `admin-venue-photos`' takedown `catch` deliberately does not re-read and is right not to — its message is "Nothing was changed", so the local slots are still accurate. `admin-operators.act()` already reconciles unconditionally (the O6 #176 lesson). No new issue filed |
| 2026-08-10 | Phase 1 — making a live result region a focus landmark | other surfaces whose completed action destroys the trigger, leaving an outcome region nothing can land on | `grep -rn "role=\"status\"\|role=\"alert\"" src/app --include=*.ts --include=*.html -A2` cross-read against `tabindex` | `auth/operator-password.ts` already does exactly this (`tabindex="-1"` on `oppw-notice` **and** `oppw-error`); every other hit is a form whose trigger *survives*, except `set-password`'s `erase-done` | **No change needed, and the choice is not novel** — `operator-password` is the shipped precedent this slice follows rather than invents. The one real gap, `set-password`'s terminal erased state, is already inside **#616** |
| 2026-08-10 | Phase 0 — adopting the shared helper in the last confirm surface | every remaining confirm-before-destroy surface, re-checked transition by transition rather than trusting #604's audit row | `grep -rn "afterRenderEffect\|afterNextRender" src/app --include=*.ts` + `grep -rn "confirming\|confirmRemove\|confirmRegen\|confirmingId" src/app --include=*.ts` then reading each hit's handlers | 3 open gaps: `auth/set-password.ts`'s erase confirm (**all three** transitions, and no focus specs at all), `admin-venue-photos`' takedown **failure** path, `admin-operators`' completed-action leg | **Filed as #616, not widened here** — three other feature areas, matching #604's own reason for spawning #614. The material find is that **#604's audit cleared `set-password` in error**: what it read as "focuses in and out" is the page-mount leg focusing the first `<input>`, not the confirm surface, which moves focus nowhere in any direction |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-7:** `ng test --include="src/app/booking/booking-view*.spec.ts"` → **71 passed**,
      every new spec verified RED first (`2 failed`, `2 failed`, `1 failed`, `1 failed` in turn).
      AC-7's two focus-in specs are **unmodified** by this slice — that is the parity evidence, not
      an assertion of it.
- [x] **AC-8/AC-9:** `npx playwright test --config playwright.a11y.config.ts my-bookings request-to-book`
      → **13 passed**; both new tests verified RED against `origin/main`'s `booking-view.ts`
      (`Received: inactive`).
- [x] **AC-6 (re-verified after F-1 reshaped it):** the unit spec proven RED again on the
      pre-fix error leg (`1 failed | 54 passed`), and the new Chromium test
      `a failed withdrawal parks focus on the outcome and re-reads the booking` covers the leg
      R-1 said jsdom cannot show.
- [x] **Post-fix full verification:** `ng lint` clean · `npm test` **1335 passed (155 files)** ·
      `npm run test:e2e:a11y` **168 passed (5.9m)** · both repo-hygiene guards clean.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled (justified N/A); invariant #2 untouched.
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section filled (N/A, frontend-only); no new cross-feature FE import (RV-FE-8).
- [x] **Payment/payout** section filled (N/A).
- [x] Refund policy enforced server-side (invariant #10) — unchanged; no client-side computation added.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A.
- [x] **Frontend** standards met; no `as any`; every `data-testid` preserved.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder plus
      `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
