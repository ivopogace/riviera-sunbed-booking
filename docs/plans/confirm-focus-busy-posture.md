# Confirm-surface focus return + the busy-button posture Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining transition in the recurring stranded-focus class (WCAG 2.4.3) —
the three confirm surfaces #616 names, plus the two cross-cutting causes behind them: a busy
control that blurs to `<body>` the instant it is `[disabled]`, and a `focusMover()` target that a
concurrent render can unmount out from under the move.

**Architecture:** The single most significant decision is that item 4 — swapping the busy posture
from `[disabled]` to `aria-disabled` — is carried by **one shared attribute directive**
(`shared/busy-action.ts`), not by ~50 hand-edited bindings. `riviera-tailwind` rule 1 (share at the
directive layer, never `@apply`) already makes a directive the repo's sharing primitive, and six
`shared/*` directives are the precedent. The directive carries the **ARIA posture only** — it must
not carry the styling, because the sites' dim values genuinely differ (`opacity-50` / `-60` / `-65`)
and folding them into one host class would be exactly the visual drift `riviera-tailwind`'s hard
rule forbids. Each site therefore keeps its own utility with the variant prefix swapped
(`disabled:opacity-65` → `aria-disabled:opacity-65`), which is a rename, not a restyle.

**Persistence:** N/A — frontend-only, no backend or schema change.

**Source of intent:** GitHub issue #616 (items 1–3 from #614's Phase-0 generalization audit; items
4–5 deferred onto it by #614's review gate, recorded as F-5 and F-4/R-7 in
`docs/plans/booking-view-confirm-focus.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — it caught the one
fact that resizes the whole slice: item 4 reads as "the busy buttons in booking-view", but the
failure class is *any control disabled by an in-flight flag its own activation set*, which is **~50
of the 57 `[disabled]` bindings across 25 files**, not four. It also caught that item 1's third
transition is not independently fixable — `set-password`'s erase failure leaves its panel open, so
the *only* thing stranding focus there is item 4's blur, which is why the two cannot be split) ·
`riviera-plan-doc` (this template — the behavior-parity ledger is what forced enumerating what
`[disabled]` does that `aria-disabled` does not, and that is where the form-submit regression R-3
came from rather than from review) · `tdd` (every transition's spec is written and proven RED
before its return leg exists; the busy-window legs are proven RED in Chromium, never on jsdom —
R-1) · `riviera-review-overlay` (review gate — RV-FE-E2E consulted at plan time for spec placement;
full run due at ready-for-review) · `riviera-docs-freshness` (**due at close-out** over
`origin/main...HEAD` — the counting sweep matters unusually much here: this slice makes
`focus-after-render`'s contract change for **all seven** adopters and adds the app's **first**
`aria-disabled` usage, so any substrate sentence describing the helper as a no-op-on-missing-target,
or the busy posture as `[disabled]`, goes stale outside the diff) · `riviera-frontend` (placement:
the new directive is a pure, stateless presentational primitive → `shared/`, beside the six
existing `shared/*` directives; no new cross-feature import, so RV-FE-8's frozen five-edge table is
untouched) · `angular-developer` + angular-cli MCP (`get_best_practices` → host bindings live in
the `host` object, never `@HostListener`, which is the directive's whole shape;
`search_documentation` on `afterNextRender` re-confirmed the `earlyRead`→`write` phase split the
fallback chain has to stay inside) · `riviera-tailwind` (the no-drift hard rule is what rejected
the first design — a directive carrying `aria-disabled:opacity-60` for everyone — after the grep
showed three different opacity values in use) · `playwright-cli` (the real-browser half: jsdom does
not implement unfocus-on-disable, so every item-4 acceptance criterion is Chromium-only) ·
`riviera-local-debug` (Windows dev machine: `npm test`, `npm run test:e2e:a11y` for the mocked suite)

**Branch:** `bugfix/confirm-focus-busy-posture` — created before phase 0. (Local session, so the
literal `bugfix/<slug>` name applies; no cloud-branch substitution.)

---

## Acceptance criteria (testable)

> Written at the component boundary — the frontend's inner hexagon is the component's observable
> behaviour (what focus lands on, what the DOM announces), not the Angular API used to get there.

### `auth/set-password.ts` — the erase-account confirm (issue item 1)

- [x] **AC-1:** Given the erase confirmation closed, when the customer activates **Erase my account
  & data**, then the confirmation opens and focus moves onto its destructive **Yes, erase
  everything** button. *Pinned by:* `set-password.spec.ts` › `moves focus to the erase confirm button when the prompt appears`
- [x] **AC-2:** Given the erase confirmation open, when the customer activates **Cancel**, then the
  prompt closes and focus returns to the **Erase my account & data** trigger it replaced.
  *Pinned by:* `set-password.spec.ts` › `returns focus to the erase trigger when the customer backs out`
- [x] **AC-3:** Given the erase confirmation open, when the erasure succeeds, then the whole account
  panel is replaced by the terminal erased state and focus lands on it. *Pinned by:*
  `set-password.spec.ts` › `parks focus on the erased notice when the erasure completes`
- [x] **AC-4:** Given the erase confirmation open, when the erasure **fails**, then focus is still
  on the confirm button it started on — never `<body>` — for the whole in-flight window and after
  the failure. *Pinned by:* `e2e/erasure.e2e.ts` › `a failed erasure never strands focus while the request is in flight`
  (Chromium only — R-1.)

### `admin/admin-venue-photos.ts` — the takedown failure leg (issue item 2)

- [x] **AC-5:** Given a takedown confirmation open, when the takedown **fails**, then the
  confirmation closes, the notice carries the failure, and focus lands on that notice rather than
  `<body>`. *Pinned by:* `admin-venue-photos.spec.ts` › `parks focus on the notice when a takedown fails`
- [x] **AC-6:** Given a takedown in flight, when it fails **after** the moderator has switched to
  another venue, then focus is moved nowhere and no notice is written — the existing
  still-viewing guard governs the focus leg too. *Pinned by:*
  `admin-venue-photos.spec.ts` › `moves no focus when a failed takedown settles under another venue`

### `admin/admin-operators.ts` — the completed-action leg on all four row actions (issue item 3)

- [x] **AC-7:** Given a pending operator, when the admin **approves** it and the queue reconciles,
  then a status notice states the outcome and focus lands on it — the approved row having been
  reconciled away. *Pinned by:* `admin-operators.spec.ts` › `parks focus on the notice when an approval settles`
- [x] **AC-8:** Given a pending operator, when the admin **rejects** it, then the same holds.
  *Pinned by:* `admin-operators.spec.ts` › `parks focus on the notice when a rejection settles`
- [x] **AC-9:** Given the suspend confirmation open on an account, when the suspension settles, then
  the confirmation is gone, the notice states the outcome, and focus lands on it. *Pinned by:*
  `admin-operators.spec.ts` › `parks focus on the notice when a suspension settles`
- [x] **AC-10:** Given a suspended account, when the admin **reinstates** it, then the same holds.
  *Pinned by:* `admin-operators.spec.ts` › `parks focus on the notice when a reinstatement settles`

### The busy posture (issue item 4)

- [x] **AC-11:** Given a control the customer has just activated, when its in-flight flag goes true,
  then the control is announced as disabled (`aria-disabled="true"`) and **keeps focus** for the
  whole request. *Pinned by:* `busy-action.spec.ts` › `marks the control disabled to assistive tech without taking it out of the document`
  **and**, for the real unfocus-on-disable behaviour jsdom cannot show, `e2e/erasure.e2e.ts` ›
  `a failed erasure never strands focus while the request is in flight` (AC-4's twin — same test, both claims).
- [x] **AC-12:** Given a busy control, when it is activated again, then no second write is issued —
  the re-entrancy guard, not the `disabled` attribute, is what makes it inert. *Pinned by:*
  `set-password.spec.ts` › `issues no second erase while one is in flight` and the sweep's
  per-surface guard specs listed in Phase 5.
- [x] **AC-13:** Given any swept control, when it is busy, then it renders **identically** to the
  `[disabled]` state it replaced — same opacity, same cursor. *Pinned by:*
  `e2e/operator-set-editing.e2e.ts` › `a busy action dims exactly as the disabled state did`
  (computed-style assertion, per `riviera-tailwind`'s no-drift rule — a class-list assertion cannot
  see this).

### `shared/focus-after-render.ts` — the unmount fallback (issue item 5)

- [x] **AC-14:** Given a focus move whose primary target is unmounted before the render commits,
  when a fallback test id was named, then focus lands on the fallback. *Pinned by:*
  `focus-after-render.spec.ts` › `falls back to the named landmark when the primary target is gone`
- [x] **AC-15:** Given the same, when **both** targets are gone, then focus lands on the component
  host rather than `<body>`. *Pinned by:* `focus-after-render.spec.ts` › `falls back to the host when nothing named survives`
- [x] **AC-16:** Given a live primary target, when the move runs, then it focuses that target and
  nothing else — the seven existing adopters' behaviour is unchanged. *Pinned by:* the
  **existing, unmodified** `focus-after-render.spec.ts` cases plus every adopter's existing focus spec.

## Non-goals

- **No shared confirm component for `set-password`.** Its erase panel is a third markup family
  (tourist `auth.scss` inks, full-width stacked buttons, no reason field); `ConfirmPanel` and
  `ConfirmWithReason` both exist because #604 found that a variant axis imposes drift. Same
  argument, third time.
- **No mechanical pin for the pattern.** The issue's closing line ("worth pinning the pattern
  mechanically afterwards — this is the seventh, eighth and ninth instance") is right, and an
  ESLint rule banning `[disabled]="<busy flag>"` in favour of `[appBusy]` is the natural follow-up.
  It is deliberately **not** in this slice: the rule can only be written once the sweep has
  established what the compliant form looks like, and #618 is concurrently reshaping the
  repo-hygiene script layer this would land in. **Follow-up issue to be filed at close-out.**
- **Not converting the four non-busy `[disabled]` bindings.** `set-editor.html`'s `cell.disabled` /
  `!canAddRow()` / `!canAddCol()` and `daily-view-tab.html`'s `isPending(set)` express *validity or
  state*, not an in-flight write the user's own activation started. Focus is never on them when
  they flip, so `[disabled]` is correct there and `aria-disabled` would be a regression — a
  genuinely unavailable control **should** leave the tab order.
- **No re-styling.** Every opacity, cursor and ink stays byte-identical; only the variant prefix
  changes. AC-13 is the proof, not the claim.
- **No focus trap.** These remain inline confirmations, not modals; `shared/focus-trap.ts` stays
  with the real modals.
- **No testid renames**, so no existing unit or e2e spec is rewritten except where it asserts the
  old `disabled` posture (the 24 assertions in 9 spec files enumerated in Phase 5).

## Behavior-parity ledger

> The slice replaces the busy posture on ~50 controls and changes `focusMover()`'s contract for all
> seven adopters. "Equivalent" is a claim, so every behavior being replaced is verdicted here.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| A busy control is not clickable (browser refuses events on a `disabled` element) | **changed → guarded** | `aria-disabled` does **not** block activation. Inertness moves to an explicit re-entrancy guard in each handler (`if (this.erasing()) return;`), which most handlers already carry. AC-12 pins it per surface; R-3 is the regression this row exists to surface |
| A busy control is skipped in the tab order | **changed (deliberate)** | it stays tabbable and announces `aria-disabled="true"`. This is the point of the slice: leaving the tab order is what strands focus. Cost: a brief extra tab stop during the request (R-5, accepted) |
| A busy control is announced as unavailable | preserved | `disabled` → `aria-disabled="true"`; both map to the same AT state |
| A busy control renders dimmed with `not-allowed` cursor | preserved | same utility, `disabled:` → `aria-disabled:` prefix, per-site value untouched. Pinned by AC-13's computed-style diff, not by the class list |
| A busy **submit** button prevents form submission via Enter in a sibling field | **changed → guarded** | `aria-disabled` does not; the form's own submit handler guard does. Verified per form in Phase 5 — this is R-3, the sharpest regression in the sweep, because a double-submit is a worse bug than the stranded focus being fixed |
| `focusMover()` no-ops when its target matches nothing | **changed (deliberate)** | it now tries the optional fallback id, then the component host. The helper's TSDoc calls the no-op deliberate ("a caller may aim at an element a later state removes"), so this row is a **contract change**, not a bug fix — Phase 0 audits all seven adopters for one that relied on the silence (R-8) |
| `focusMover()` looks its target up in `earlyRead`, focuses in `write` | preserved | the fallback chain resolves entirely inside the same `earlyRead`, so the phase split the Angular docs prescribe is unchanged |
| `admin-venue-photos` takedown success parks focus on the slot card | preserved | untouched; the failure leg is what gains a leg |
| `admin-venue-photos` applies an outcome only while its own venue is on screen | preserved (extended) | the guard now governs the focus move too, not just the notice — AC-6 |
| `admin-operators.act()` reconciles both lists from the server after every action | preserved | untouched (the O6 #176 lesson); the notice and focus leg are added around it |
| `admin-operators` announces nothing when an action settles | **dropped → fixed** | it had no live region at all. Four outcome sentences land in a new `role="status"` notice, which is also the focus landmark — the `admin-venue-photos` / `operator-password` precedent |
| `set-password`'s constructor focuses the page's first `<input>` on mount | preserved | untouched. This is the leg #604's audit mistook for the confirm surface's; it is orthogonal and stays |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **jsdom does not implement unfocus-on-disable.** Every item-4 claim can pass on a unit spec *without* the fix — a false green. Inherited from #614 R-1, where it fired exactly as predicted | high | high | Item-4 ACs (AC-4, AC-11, AC-13) are pinned in **Chromium only**. No unit spec is allowed to stand as the sole evidence for a busy-window claim, and none models the blur with a hand-written `blur()` | Ivo | **closed** — every item-4 claim is pinned in Chromium (`erasure.e2e.ts`, `operator-set-editing.e2e.ts`), and both new erasure tests were verified RED against `origin/main`'s `set-password.ts` (`unexpected value "inactive"`). No unit spec stands as sole evidence for a busy-window claim, and none models the blur by hand |
| R-2 | **Host-listener ordering is unspecified.** If the directive is to block activation structurally it must `stopImmediatePropagation()` *before* the element's own template `(click)`, and the relative registration order of a directive host listener and a template listener on the same element is an Ivy implementation detail, not a documented contract | med | med | **Do not build on it.** The plan of record is the issue's own prescription — directive carries the attribute, guard lives in the handler. Phase 1 runs a spike test that pins the actual order; the directive gains structural blocking **only if** the spike proves it | Ivo | **closed — and the spike overturned its own first answer.** The probe showed the directive host listener *does* run first (`['directive','template']`), but the blocking test then failed anyway: Ivy **coalesces same-element same-event listeners into one native listener** and walks its own internal chain, which `stopImmediatePropagation()` cannot break. Host-binding blocking is therefore impossible, not merely fragile. The directive instead registers a **native capture-phase listener in its constructor**, which does block (pinned by `blocks the control own handler while busy`). The probe was deleted rather than shipped: it pinned an ordering the code no longer depends on, and a green test for a false lead is worse than none |
| R-3 | **`aria-disabled` does not prevent form submission.** A submit button that was `[disabled]="submitting()"` also blocked Enter-in-a-text-field; after the swap only the handler guard does. A missed guard is a **double-submit** — a worse bug than the stranded focus being fixed, and one that can charge a card twice on `booking-pay` | med | high | **Narrowed by R-2's outcome, not eliminated.** The directive now consumes the activating click, which covers pointer clicks *and* Enter/Space on the control itself (a button reports both as a click). What it cannot see is a form submitted by Enter from a **text field**, which never reaches the button — so the guard duty survives exactly for `<form>` submit handlers, a much smaller set than "every swept control". Phase 5 step 1 audits those forms specifically; `booking-pay.ts` and `booking-dialog.ts` are done first and separately because they are the money path | Ivo | **closed — the audit came back clean.** Read all 12 form submit handlers before touching a binding. Nine carry an explicit `if (busy()) return;`. Two (`booking-dialog`, `venue-create-card`) route through Signal Forms' `submit()`, which opens `if (untracked(node.submitState.submitting)) return false;` — read in `@angular/forms` source, not assumed. The twelfth (`admin-privacy.review`) performs no write. The money path's half is pinned by `posts one booking when the guest submits twice before the first settles` |
| R-4 | **Visual drift across the variant swap.** Three different dim values are in use (`opacity-50`, `-60`, `-65`) plus inconsistent `cursor-not-allowed`; a directive-carried style, or a careless find-and-replace, silently restyles ~10 controls | med | med | The directive carries **no** styling (the architecture decision above). The swap is prefix-only, per site. Proven by AC-13's **computed-style** assertion in Chromium — `riviera-tailwind`'s hard rule says a class-list diff cannot see this | Ivo | **closed** — the directive carries no styling, so each site kept its own value; proven by AC-13's computed-style assertion in Chromium: the busy save reads `opacity: 0.5`, byte-identical to the `disabled:opacity-50` it replaced, and returns to `1` once the write settles |
| R-5 | Busy controls stay in the tab order, so a keyboard user meets an inert-but-focusable control during the in-flight window | high | low | **Accepted deliberately** — it is the mechanism, not a side effect. `aria-disabled="true"` is what tells AT the control is unavailable, and WAI-ARIA prefers exactly this trade where removing focus would strand it. The window is one request long | Ivo | **closed — accepted as designed.** It is the mechanism, not a side effect; `aria-disabled="true"` is what tells AT the control is unavailable. Narrowed in practice: text inputs and validity-driven bindings kept `[disabled]`, so the extra tab stop is only ever the busy action itself |
| R-6 | 24 existing unit assertions across 9 spec files assert `.disabled`; they will pass-then-fail misleadingly (a swept control's `.disabled` is simply `false`, so an inverted assertion could stay green while asserting nothing) | high | med | Each is converted to assert `aria-disabled` **in the same commit as its surface's swap**, never in a batch, and each converted spec is proven RED against the pre-swap component. 0 e2e assertions to convert (verified) | Ivo | **closed** — six specs across six files, each converted with its own surface's swap. Every one kept its behavioural assertion untouched and swapped only the posture claim, so none was weakened to pass; the four in 5c were seen failing first |
| R-7 | The sweep touches 25 files across four feature folders — a large diff whose mechanical bulk can hide the behavioural changes from review | med | med | Phases 2–4 (behavioural, three surfaces) and Phase 5 (mechanical sweep) are separate commits with separate ACs, so review can read them apart. Phase 5's own diff is prefix-swaps + guard assertions and nothing else | Ivo | **closed** — phases 2–4 (behavioural) and 5a/5b/5c (mechanical) are six separate commits with separate ACs, so the sweep's bulk cannot hide the behavioural work from review |
| R-8 | **The `focusMover()` host fallback is a contract change for seven live adopters.** Its TSDoc documents the no-op as deliberate; a caller that aims at an element a later state legitimately removes will now focus the component host instead of staying put | med | med | Phase 0 audits all seven call sites and records the verdict per site in the generalization log before the fallback ships. Any site that genuinely wants the silence gets it — the host fallback is reached only after the optional fallback id, and a caller can be given an explicit opt-out if the audit finds one that needs it | Ivo | **closed** — the 24-call-site audit (generalization log, row 1) found none relying on the silence, and all seven adopters' suites passed unmodified (174). It also widened the fix: a named fallback is usually a `<p>`/`<span>`, so the helper makes whatever it lands on focusable, not only the host |
| R-9 | `set-password` has **no focus specs at all** today, so AC-1..AC-3 have no parity net — a regression in the page-mount focus leg (which #604 mistook for the confirm surface) would go unnoticed | med | low | Phase 2 step 1 writes a characterization spec for the **existing** page-mount leg *first*, before touching anything, and leaves it unmodified thereafter as the parity net — the role AC-7 played in #614 | Ivo | **closed** — `focuses the first field when the page mounts` was written first, passed before any change, and is untouched since. It is the leg #604's audit mistook for the confirm surface |

## Open questions / Assumptions

- **Assumption:** the four `admin-operators` outcome sentences may be authored here rather than
  needing product sign-off, since they are operational status text on an admin-only surface with no
  existing copy to match. — *Owner:* Ivo · *Resolves by:* Phase 4 (flagged for review at the PR).

### Resolved

- **Open question:** items 1–3 only, or the two cross-cutting posture changes too?
  — **Resolved 2026-08-11 at plan time by Ivo:** all five items in one slice, after the grill
  reported item 4's true size (~50 bindings / 25 files). The scoped alternative — item 4 applied to
  the confirm surfaces only — was offered and explicitly rejected, so the app is left with one busy
  posture rather than two.
- **Open question:** where does focus land for `admin-operators`' four settled row actions, on a
  page with no live region at all? — **Resolved 2026-08-11 at plan time by Ivo:** a new
  `role="status"` notice carrying the outcome, with `tabindex="-1"`, following the shipped
  `admin-venue-photos` / `operator-password` precedent. Rejected: parking on the surviving row
  (behaves differently per action, and still announces nothing) and on the section heading (uniform
  but discards the outcome).
- **Open question:** what should `focusMover()` do when its target is unmounted between the click
  and the render? — **Resolved 2026-08-11 at plan time by Ivo:** an optional fallback test id the
  caller names, with the component host as the last resort. Rejected: fallback id alone (a caller
  that names nothing still strands focus silently) and host-only (no caller edits, but a generic
  landing spot and a silent behaviour change for every adopter at once).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice adds, removes and reorders **no request**: every
swept control fires the same handler on the same condition it did before, and the only new
client-side gate is a re-entrancy guard that can *suppress* a duplicate write, never issue one.
Invariant #2's write paths are untouched, and nothing here computes money or availability.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic in scope, but **two swept controls sit on the money path** and are called
out here rather than left implicit: `booking/booking-pay.ts`'s pay button (`[disabled]="paying()"`)
and `booking/booking-dialog.ts`'s submit (`[disabled]="submitting()"`). After the swap, only their
handler guards prevent a double activation, so R-3 treats them as the highest-stakes sites in the
sweep and Phase 5 does them first, in their own commit, with an explicit double-activation spec
each. No amount, currency, refund or ledger behaviour changes; invariant #8 is untouched (the
server and the webhook remain the source of truth for payment state regardless of what the button
does).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/busy-action.ts` | **new** | attribute directive `[appBusy]` | `input()`; host attribute binding only | — |
| FE-2 | `shared/focus-after-render.ts` | existing | helper factory | adds the fallback chain inside `earlyRead` | — |
| FE-3 | `auth/set-password.ts` | existing | standalone component, inline template | adds `focusMover()` + three return legs + `tabindex="-1"` on `erase-done` | unchanged (Signal Forms) |
| FE-4 | `admin/admin-venue-photos.ts` | existing | standalone component, inline template | one return leg on the failure path, inside the still-viewing guard | — |
| FE-5 | `admin/admin-operators.ts` | existing | standalone component, inline template | new `role="status"` notice signal + four return legs | — |
| FE-6 | the busy sweep — 23 further files | existing | components + external templates | binding + variant-prefix swap; handler guards asserted | unchanged |
| FE-7 | `e2e/erasure.e2e.ts`, `e2e/admin-venue-photos.e2e.ts`, `e2e/admin-operator-suspension.e2e.ts`, `e2e/operator-set-editing.e2e.ts` | existing | Playwright (mocked suite) | the real-browser focus + computed-style assertions | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal APIs, host bindings in the
`host` object (never `@HostListener` — angular-cli MCP `get_best_practices`), no
`ChangeDetectionStrategy.OnPush` (default in v22), no `standalone: true` (default). No deviation.

## FE↔BE contract

N/A — no contract change. No request URL, method, body or header is added, removed or reshaped.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `review gate — fixes applied, re-review due`

**Next action:** Confirm CI green on the fix pushes, then pull the Sonar issue list (not just the gate) per `pr-gates.md` §2.
characterization spec for the existing page-mount focus leg.

PR: draft opened at the Phase 0 commit, per `riviera-sdlc` rule 3 (CI fires on the
`pull_request` event only).

**Gates:** CI green on the pre-review push (backend, frontend, repo hygiene ×2, CodeQL) · review gate
**run in full** — `/code-review` at high effort via ladder rung 1 (5 reviewers), `riviera-review-overlay`
layered on: **5 findings, all fixed**, two of them functional bugs this slice introduced · the fix diff
then **re-reviewed** per `pr-gates.md` §1 step 3: **4 more findings, all fixed**, including that F-4's
fix shipped with no regression coverage. **Still outstanding: CI on the fix pushes, and the Sonar gate
with its reported issue list actually pulled.**

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `focusMover()` fallback + the seven-adopter audit | ✅ | `7e11e7b` |
| 1 — The `BusyAction` directive + the ordering spike | ✅ | `bb73467` |
| 2 — `set-password`'s three erase transitions | ✅ | `455c24c` |
| 3 — `admin-venue-photos`' takedown failure leg | ✅ | `409dd1c` |
| 4 — `admin-operators`' notice region + four settled legs | ✅ | `1baa6e6` |
| 5 — The busy sweep (money path first, then the rest) | ✅ | `f30a683` (5a) · `2b58f90` (5b) · `fd9890f` (5c) |
| 6 — Real-browser e2e + full verification | ✅ | `c185990d` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (frontend, e2e) | **A layout regression from this slice.** The new `admin-ops-notice` reserved `min-h-[1.5rem]` even while empty, pushing the console home's first content heading below the 360px fold — `admin-console-stats.e2e.ts` › `the console home's first content heading survives the strip at 360px` measured 758 against a 740 budget. Local runs missed it because the full mocked suite last ran before the notice landed | fixed-in-`617a68b5` — `min-h-[1.5rem]` → `empty:hidden`, the idiom booking-view's result regions already use. The region stays in the DOM (a live region that enters the tree *with* its text is often not announced — `auth/operator-password.ts:38`), it simply occupies no space until it says something, and the parked focus is what guarantees delivery |
| F-4 | review (CONFIRMED, 4 of 5 reviewers independently) | **The slice's own bug, and the audit that should have caught it said otherwise.** `pricing-tab.html`'s price `<input>` was swept to `[appBusy]`, so a reprice in flight left the field announcing `aria-disabled` while staying fully typable — the operator could type a new price and have it silently discarded by `onPriceChange`'s guard. The Phase-5 audit log claims "three inputs were reverted"; there were **four**. PR #228 had made that `[disabled]` a deliberate review finding, and the file's own TSDoc still said "the row inputs are disabled while it runs" | fixed-in-`58816b9f` — reverted to `[disabled]="saving()"` with its `disabled:opacity-60`, and the now-unused `BusyAction` import dropped. The audit log row is corrected to four |
| F-5 | review (CONFIRMED) | **A false success announcement.** `act()`'s `finally` set `${outcome} ${who}.` unconditionally, so a failed approve/reject/suspend/reinstate announced "Suspended alice." into the live region and parked focus on it — the one surface where the admin has no other signal. Its two sibling confirm surfaces both branch on the outcome; this one dropped that | fixed-in-`58816b9f` — a `settled` flag picks the sentence, with "That didn't go through. <name> is unchanged." on the failure leg. Verified RED first |
| F-6 | review (CONFIRMED, 2 reviewers) | **The Phase-0 stale-comment audit undercounted 1 as 4.** `admin-commissions.ts:454` carried the same "Disabling Save blurred it to `<body>`" claim as the `admin-privacy.ts` one that audit did find, and both files' **spec docblocks** repeated it | fixed-in-`58816b9f` — all three remaining instances corrected. The re-run sweep (`grep` for disable/blur claims in comments) is recorded as a new audit-log row; the `pricing-tab` comments it also surfaced are true again after F-4's revert |
| F-7 | review (CONFIRMED) | TSDoc over the nested `CLAUDE.md` budget (~6 lines a type, ~3 a member) on `BusyAction`, `focusMover()` and `act()`, with load-bearing rationale inline instead of pointed at the plan — the same finding PR #612's review made | fixed-in-`58816b9f` — all three trimmed to a pointer. `BusyAction`'s now leads with **"For buttons only"**, which is the constraint F-4 was the cost of not stating |
| F-8 | review (CONFIRMED) | An issue number in TSDoc (`focus-after-render.spec.ts`), which the nested `CLAUDE.md` forbids — `git blame` holds provenance | fixed-in-`58816b9f` |
| F-9 | **re-review** (CONFIRMED) | **F-4's fix shipped with no regression coverage.** The reviewer reinstated the exact bug in the working tree and the whole suite stayed green — no unit or e2e spec asserted the price input's posture at all, so nothing would catch it being swept again | fixed-in-`0f9afd35` — the existing serialization spec now asserts `input('B').disabled` **and** the absence of `aria-disabled`. Proven by reinstating the bug: the spec goes RED, then green on revert |
| F-10 | re-review (CONFIRMED) | The new failure copy said "`<name>` is unchanged", which is wrong in the exact race its neighbouring comment names: on a 409 the row *was* already decided, so the reconciled list rendered right below would contradict the notice | fixed-in-`0f9afd35` — "That didn't go through. The list below is up to date.", true whatever the cause |
| F-11 | re-review (CONFIRMED) | F-7's TSDoc trim was a partial pass against its own target — `BusyAction` was still ~13 lines and `focusMover()` ~12 against the ~6-line budget | fixed-in-`0f9afd35` — both now inside it, with the "for buttons only" constraint kept because F-4 is what its absence cost |
| F-12 | re-review (CONFIRMED, doc) | This Gates line called Sonar both green and outstanding in one paragraph — ambiguous in the section that is explicitly the session-recovery anchor | fixed-in-`0f9afd35` |
| F-2 | CI (repo hygiene) | RV-STYLE-1: the two-line inline comment on the directive's native listener | fixed-in-`3416b430` — moved into the TSDoc, which is exempt and is where load-bearing rationale belongs |
| F-3 | CI (frontend, format) | #618's diff-scoped Prettier gate merged to `main` mid-slice, so this branch's own hunks had to satisfy it | fixed-in-`f1e93570` — merged `main`, then `npm run format:check -- --fix`, which rewrites only the reported hunks so each file's pre-existing drift stays out of the diff |

---

## File structure

- `docs/plans/confirm-focus-busy-posture.md` — this plan
- `frontend/src/app/shared/focus-after-render.ts` — the optional fallback id + host last resort
- `frontend/src/app/shared/focus-after-render.spec.ts` — AC-14..AC-16
- `frontend/src/app/shared/busy-action.ts` — the new `[appBusy]` directive
- `frontend/src/app/shared/busy-action.spec.ts` — AC-11's unit half + the R-2 ordering spike
- `frontend/src/app/auth/set-password.ts` — three erase transitions + the `erase-done` landmark
- `frontend/src/app/auth/set-password.spec.ts` — AC-1..AC-3, AC-12, and R-9's parity net
- `frontend/src/app/admin/admin-venue-photos.ts` — the failure-leg focus move
- `frontend/src/app/admin/admin-venue-photos.spec.ts` — AC-5, AC-6
- `frontend/src/app/admin/admin-operators.ts` — the `role="status"` notice + four settled legs
- `frontend/src/app/admin/admin-operators.spec.ts` — AC-7..AC-10
- `frontend/src/app/admin/admin-operators.a11y.spec.ts` — axe over the new notice region
The Phase 5 sweep — the `[disabled]`→`[appBusy]` binding swap, the `disabled:`→`aria-disabled:`
variant rename, and the directive wiring. Grouped as the phase committed them:

- `frontend/src/app/booking/booking-pay.ts`, `frontend/src/app/booking/booking-dialog.ts` — 5a, the
  money path; `booking-dialog.spec.ts` adds the double-submit pin
- `frontend/src/app/auth/auth-page.ts`, `frontend/src/app/auth/forgot-password.ts`,
  `frontend/src/app/auth/reset-password.ts`, `frontend/src/app/auth/operator-password.ts`,
  `frontend/src/app/booking/find-booking.ts`, `frontend/src/app/booking/booking-view.ts`,
  `frontend/src/app/operator/venue-create-card.ts`, `.html`,
  `frontend/src/app/operator/venue-tab.ts`, `.html` — 5b, the remaining forms
- `frontend/src/app/shared/confirm-with-reason.ts`, `frontend/src/app/admin/admin-commissions.ts`,
  `frontend/src/app/admin/admin-mail-delivery.ts`, `frontend/src/app/admin/admin-mail-outbox.ts`,
  `frontend/src/app/admin/admin-privacy.ts`, `frontend/src/app/admin/admin-refund-outbox.ts`,
  `frontend/src/app/operator/daily-view-tab.ts`, `.html`,
  `frontend/src/app/operator/layout-editor.ts`, `.html`,
  `frontend/src/app/operator/payouts-tab.ts`, `.html`,
  `frontend/src/app/operator/pricing-tab.ts`, `.html`,
  `frontend/src/app/operator/requests-tab.ts`, `.html`,
  `frontend/src/app/operator/set-editor.ts`, `.html`,
  `frontend/src/app/operator/stale-write-banner.ts` — 5c, the admin and operator actions
- `frontend/src/app/booking/find-booking.spec.ts`,
  `frontend/src/app/operator/venue-create-card.spec.ts`,
  `frontend/src/app/admin/admin-commissions.spec.ts`,
  `frontend/src/app/admin/admin-privacy.spec.ts`,
  `frontend/src/app/operator/stale-write-banner.spec.ts`,
  `frontend/src/app/shared/confirm-with-reason.spec.ts` — the six specs that asserted the old
  posture (R-6), each converted with its own surface's swap
- `frontend/src/app/operator/pricing-tab.spec.ts` — the regression pin the review gate's F-9 added:
  the price input is genuinely `disabled` during a save, not merely announced as such
- `frontend/e2e/erasure.e2e.ts` — AC-4 / AC-11's Chromium half
- `frontend/e2e/admin-venue-photos.e2e.ts` — the takedown failure leg in a real browser
- `frontend/e2e/admin-operator-suspension.e2e.ts` — the settled-action leg in a real browser
- `frontend/e2e/operator-set-editing.e2e.ts` — AC-13's computed-style no-drift proof

> Reconcile this section with `node scripts/check-plan-file-structure.mjs --diff origin/main`
> before pushing — the glob entry above is deliberate (the guard accepts globs so a mechanical
> sweep is one honest entry), but it must still cover every path the diff actually touches.

---

## Phase 0 — `focusMover()` fallback + the seven-adopter audit

**Files:** Modify `frontend/src/app/shared/focus-after-render.ts` · Test
`frontend/src/app/shared/focus-after-render.spec.ts`

- [x] **Step 1: Audit the seven adopters BEFORE writing code** (R-8). For each existing
      `focusAfterRender(...)` call site, record whether a silent no-op is load-bearing. Write the
      verdicts into the Generalization-audit log — this is the evidence the contract change is safe,
      and it must exist before the contract changes. → **24 call sites, 7 components, none relies on
      the silence.** Corrected the plan's adopter list (see the log's first row).
- [x] **Step 2: Write the failing specs** — AC-14 (primary gone, fallback named, fallback focused)
      and AC-15 (both gone, host focused). Both drive a host whose primary target is removed between
      the call and the render.
- [x] **Step 3: Run them, verify they fail** — `npx ng test --include="src/app/shared/focus-after-render.spec.ts"`
      → RED at the type level (`TS2554: Expected 1 arguments, but got 2`), the honest red for a
      signature change.
- [x] **Step 4: Implement** — a second optional `fallbackTestId` parameter; resolve
      primary → fallback → host inside `earlyRead` (the phase split stays intact), and make the
      landing element focusable in `write` if it is not already, so no adopter has to add the
      attribute to its template. **Widened from the plan** — the guard is
      `target.tabIndex < 0 && !target.hasAttribute('tabindex')`, which covers a named `<p>`/`<span>`
      landmark and not only the host; a `<button>` reports `tabIndex === 0` and is left alone.
- [x] **Step 5: Run them, verify they pass**, including the **unmodified** existing cases (AC-16).
      → 8 passed. One pre-existing case was **deliberately rewritten**, not preserved: `is a no-op
      when nothing carries the test id` asserted the contract this phase replaces, so it now asserts
      not-throwing and the fallback cases assert where focus lands.
- [x] **Step 6: Run every adopter's focus specs** — `booking-view`, `admin-operators`,
      `admin-venue-photos`, `admin-commissions`, `admin-privacy`, `layout-editor`, `set-editor` —
      as the parity net for the contract change. → **174 passed, all unmodified.**
- [x] **Step 7: Wire booking-view's deferred R-7** — `startCancel()` / `startWithdraw()` name
      `booking-status` as the fallback, closing #614's F-4 at its origin. It is a `<span>`, which is
      what forced step 4's widening.
- [x] **Step 8: Commit** — `git commit -m "Give focusMover a fallback when its target is unmounted (#616)"`
- [ ] **Step 9: Open the draft PR** (`riviera-sdlc` rule 3 — CI fires on the `pull_request` event
      only) and **update plan-doc execution status** in the same commit window.

---

## Phase 1 — The `BusyAction` directive + the ordering spike

**Files:** Create `frontend/src/app/shared/busy-action.ts`, `frontend/src/app/shared/busy-action.spec.ts`

- [x] **Step 1: Write the R-2 spike test first** — a host with both a template `(click)` and a
      directive host `(click)` that calls `stopImmediatePropagation()`, asserting which runs first.
      The result decides the directive's shape; record it in the plan before implementing.
      → **The spike answered twice, and the second answer overturned the first.** See R-2.
- [x] **Step 2: Write the failing specs** — AC-11's unit half: `aria-disabled="true"` while busy,
      attribute absent (not `"false"`) while idle, and the element still `document.activeElement`
      after the flag flips (the part jsdom *can* show — that the attribute alone does not blur).
- [x] **Step 3: Run them, verify they fail.** → RED on the missing module, then RED again on
      `blocks the control own handler while busy` (`runs()` was 1) once the host-binding version
      existed — which is what exposed Ivy's listener coalescing.
- [x] **Step 4: Implement** the directive: `selector: '[appBusy]'`, `input()` named `appBusy`, host
      `'[attr.aria-disabled]': 'appBusy() || null'`. No styling (R-4). Structural click-blocking via
      a **native capture-phase listener**, since step 1 proved a host binding cannot do it.
- [x] **Step 5: Run them, verify they pass.** → 7 passed.
- [x] **Step 6: Generalization-audit pass** — record the spike verdict and the decision.
- [x] **Step 7: Commit** — `git commit -m "Add the busy-action posture directive (#616)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — `set-password`'s three erase transitions

**Files:** Modify `frontend/src/app/auth/set-password.ts` · Test `frontend/src/app/auth/set-password.spec.ts`

- [ ] **Step 1: Write R-9's characterization spec first** — the existing page-mount leg focuses the
      first `<input>`. It must be green **before** any change and stay unmodified thereafter.
- [ ] **Step 2: Write the failing specs** — AC-1, AC-2, AC-3, AC-12.
- [ ] **Step 3: Run them, verify they fail.**
- [ ] **Step 4: Implement** — `focusMover()`; move the two inline `confirming.set(...)` template
      handlers into named methods carrying their focus legs (`askToErase` / `keepAccount`, mirroring
      `admin-venue-photos`' `askToRemove` / `keepIt`); `tabindex="-1"` on `erase-done`; the `erasing`
      re-entrancy guard asserted; `[disabled]="erasing()"` → `[appBusy]="erasing()"` with the
      `disabled:opacity-60` prefix swapped.
- [ ] **Step 5: Run them, verify they pass**, page-mount spec included.
- [ ] **Step 6: Generalization-audit pass.**
- [ ] **Step 7: Commit** — `git commit -m "Move focus with the erase-account confirmation (#616)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — `admin-venue-photos`' takedown failure leg

**Files:** Modify `frontend/src/app/admin/admin-venue-photos.ts` · Test
`frontend/src/app/admin/admin-venue-photos.spec.ts`

- [ ] **Step 1: Write the failing specs** — AC-5 and AC-6 (the still-viewing guard governs the focus
      move, not just the notice).
- [ ] **Step 2: Run them, verify they fail.**
- [ ] **Step 3: Implement** — `tabindex="-1"` on `admin-photos-notice`; the `catch` leg's focus move
      **inside** `reportOnlyIfStillViewing`; `[appBusy]` swap on the Remove trigger.
- [ ] **Step 4: Run them, verify they pass**, the success-leg specs included as the parity net.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Park focus on the notice when a takedown fails (#616)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — `admin-operators`' notice region + four settled legs

**Files:** Modify `frontend/src/app/admin/admin-operators.ts` · Test
`frontend/src/app/admin/admin-operators.spec.ts`, `frontend/src/app/admin/admin-operators.a11y.spec.ts`

- [ ] **Step 1: Write the failing specs** — AC-7..AC-10, one per row action.
- [ ] **Step 2: Run them, verify they fail.**
- [ ] **Step 3: Implement** — a `notice` signal and a `role="status" aria-live="polite"
      tabindex="-1"` region mirroring `admin-photos-notice`; `act()` takes the outcome sentence and
      parks focus on the notice after the reconcile; the four `[appBusy]` swaps; delete the deferred
      TSDoc sentence in `askToSuspend` now that the third transition exists.
- [ ] **Step 4: Run them, verify they pass**, plus axe over the new region.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Announce and land focus when an operator decision settles (#616)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — The busy sweep

> Money path first, in its own commit (R-3 / the Payment section), then the rest. Each file's
> `.disabled` spec assertions are converted **with** its swap, never in a batch (R-6).

**Files:** Modify, in this order —
**5a (money path):** `booking/booking-pay.ts`, `booking/booking-dialog.ts` + specs.
**5b (remaining forms):** `auth/auth-page.ts`, `auth/forgot-password.ts`, `auth/reset-password.ts`,
`auth/operator-password.ts`, `booking/find-booking.ts`, `booking/booking-view.ts`,
`operator/venue-create-card.html`, `operator/venue-tab.html` + specs.
**5c (admin + operator actions):** `shared/confirm-with-reason.ts`, `admin/admin-commissions.ts`,
`admin/admin-mail-delivery.ts`, `admin/admin-mail-outbox.ts`, `admin/admin-privacy.ts`,
`admin/admin-refund-outbox.ts`, `operator/daily-view-tab.html`, `operator/layout-editor.html`,
`operator/payouts-tab.html`, `operator/pricing-tab.html`, `operator/requests-tab.html`,
`operator/set-editor.html`, `operator/set-editor.ts`, `operator/stale-write-banner.ts` + specs.

- [ ] **Step 1: Audit every handler's re-entrancy guard BEFORE any binding changes** (R-3). Read
      each swept control's handler; list which already guard and which do not. A missing guard is
      written test-first as a double-activation spec, proven RED, then fixed — that is the real work
      of this phase, not the prefix swap.
- [ ] **Step 2: Swap 5a**, convert its `.disabled` assertions, prove each RED first, commit
      separately — `git commit -m "Keep focus on the busy payment controls (#616)"`
- [ ] **Step 3: Swap 5b and 5c** the same way, one commit per group.
- [ ] **Step 4: Confirm the four non-busy bindings are untouched** (`cell.disabled`, `!canAddRow()`,
      `!canAddCol()`, `isPending(set)`) — a Non-goal, so it gets a check, not a change.
- [ ] **Step 5: Generalization-audit pass** — the guard audit's findings are exactly the
      generalization question this phase exists to answer; record the table.
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 6 — Real-browser e2e + full verification

**Files:** Modify `frontend/e2e/erasure.e2e.ts`, `frontend/e2e/admin-venue-photos.e2e.ts`,
`frontend/e2e/admin-operator-suspension.e2e.ts`, `frontend/e2e/operator-set-editing.e2e.ts`

- [ ] **Step 1: Write the failing e2e** — AC-4/AC-11 (focus survives the in-flight window) and
      AC-13 (computed-style parity). This is the half that can actually observe the blur (R-1).
- [ ] **Step 2: Verify each RED against pre-fix code** — check the touched components out from
      `origin/main` and confirm the failure, exactly as #614's Phase 2 step 2 did. Written after the
      fix, they would be unproven regression pins.
- [ ] **Step 3: Axe** — `expectNoSeriousAxeViolations` after each new state, per the sibling tests
      in each file.
- [ ] **Step 4: Full verification** — `npm run lint` · `npm test` · `npm run build` ·
      `npm run test:e2e:a11y`.
- [ ] **Step 5: Reconcile the File-structure section** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main` → must exit 0;
      `node scripts/check-inline-comments.mjs --files <touched>` clean. If #618 has merged by now,
      also run its prettier diff-gate.
- [ ] **Step 6: Commit** — `git commit -m "Cover the busy-window focus behaviour end to end (#616)"`
- [ ] **Step 7: Update plan-doc execution status**; mark the PR ready for review.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Review round — fixing F-6 (a stale comment the Phase-0 audit undercounted) | every code comment still asserting that a control is **disabled** or that disabling **blurs** it, now that ~46 of those controls are `aria-disabled` | `grep -rn -i "blurred\|blurs\|disabl" src/app --include=*.ts --include=*.html` filtered to comment lines | 4 stale (`admin-privacy.ts`, `admin-commissions.ts`, and **both** files' spec docblocks); 4 true-again (`pricing-tab` ×3, `admin-commissions.spec` precedent line); ~8 still fair, where "disables" reads correctly in the ARIA sense | **All 4 stale ones fixed; the rest deliberately left.** The Phase-0 audit found 1 because it searched the *adopters of `focusMover()`*, not the adopters of the busy posture — the wrong population, since the swap is what makes these claims false. The 4 true-again ones are the tell that F-4's revert was the right call rather than a retreat: `pricing-tab`'s comments only became false because the input was swept, and reverting it restored them |
| 2026-08-11 | Phase 5 step 1 — the R-3 form-submit guard audit | every `<form>` whose submit can be triggered by Enter from a text field, asked whether its handler guards re-entry once `aria-disabled` stops the button blocking implicit submission | `grep -rn "(submit)=\|(ngSubmit)=" src/app --include=*.ts --include=*.html`, then read each handler | 12 forms | **All 12 already guarded; no fix needed, and the risk is retired rather than mitigated.** Nine carry an explicit `if (busy()) return;`. Two go through Signal Forms' `submit()`, which opens `if (untracked(node.submitState.submitting)) return false;` — read in `@angular/forms` source rather than assumed, because the public TSDoc does not state it. The twelfth (`admin-privacy.review`) only advances a stage. The generalization worth recording is the **inverse** one: the audit is what showed the swap is unsafe for `<input>`, where `aria-disabled` does not stop typing — three inputs were reverted to `[disabled]`, since focus is on the clicked button and never on them. **Corrected at the review gate: there were four** — `pricing-tab`'s price input was missed here and swept, which the review caught as F-4 |
| 2026-08-11 | Phase 5 — sweeping `[disabled]`→`[appBusy]` | every remaining `[disabled]` binding, asked whether it expresses an **in-flight write the user's own activation started** (the failure class) or **validity/state** (not it) | `grep -rn '\[disabled\]=' src/app --include=*.ts --include=*.html` | 57 total; 46 swapped, 11 deliberately kept | **The exclusions are the finding.** `isPending(set)`, `cell.disabled`, `!canAddRow()`, `!canAddCol()` and two `form().invalid()` express *unavailability*, not busyness — focus is never on them when they flip, and `aria-disabled` would be a regression there because a genuinely unavailable control **should** leave the tab order. Four bindings mixed both (`busy() \|\| dirty()`, `saving() \|\| !hasLayout()`, two `invalid() \|\| saving()`); each was **split** so both halves keep the posture they need, rather than swapped wholesale |
| 2026-08-11 | Phase 0 — changing `focusMover()`'s missing-target contract (R-8) | every live call site, asked whether a **silent no-op is load-bearing** there — i.e. does any caller mean "move focus only if X exists, else leave it alone" | `grep -rn "focusAfterRender(\`\|focusAfterRender('" src/app --include=*.ts \| grep -v spec` | **24 call sites across 7 components** — `admin-commissions` (4), `admin-privacy` (5), `booking-view` (8), `admin-venue-photos` (2), `layout-editor` (2), `set-editor` (2), `admin-operators` (1) | **None relies on the silence; the contract change is safe.** Every one of the 24 is a deliberate "focus lands here" leg fired *because* the element focus was on is being destroyed — so the pre-change alternative was never "focus stays somewhere useful", it was `<body>`. Parity proven by running all seven adopters' suites unmodified (174 passed). Two corrections to the plan's assumptions came out of it: (1) the adopter list is those **7 components**, not `confirm-panel`/`confirm-with-reason` — those focus their own confirm button via their own `afterNextRender` and are not `focusMover()` callers; (2) a named fallback is usually a `<p>`/`<span>` landmark, so the helper had to be extended to make **whatever it lands on** focusable, not just the host — otherwise naming a landmark that forgot `tabindex="-1"` silently reintroduces the exact no-op being fixed |
| 2026-08-11 | Phase 0 — reading every adopter for the audit above | pre-existing **hand-rolled workarounds** for the `[disabled]` busy blur (item 4), which would go stale or become wrong once the posture changes | read each adopter's settle legs while auditing | 1 — `admin-privacy.ts:344`, whose comment reads *"Disabling Erase blurred it to `<body>`; re-enabling does not bring focus back (WCAG 2.4.3)"* and whose `catch` re-focuses `admin-privacy-confirm` purely to undo that blur | **Recorded, fixed in Phase 5.** It is independent evidence that item 4's blur is real and already costing local workarounds — a **tenth** instance of the class, which #616 had not counted. After the `aria-disabled` swap focus never leaves that button, so the re-focus becomes a harmless self-focus and its comment becomes false; both are corrected with that file's swap rather than here, so the sweep owns its own cleanup |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-3, AC-12:** `npx ng test --include="src/app/auth/set-password.spec.ts"` → **18 passed**;
      AC-1..AC-3 verified RED first (`3 failed | 15 passed`). AC-12 passed before the swap too — the
      `erasing()` guard already existed, which is the point of asserting it rather than assuming it.
- [x] **AC-4, AC-11 (Chromium half):** `npx playwright test --config playwright.a11y.config.ts erasure`
      → **4 passed**; both new tests **verified RED against `origin/main`'s `set-password.ts`**
      (`toBeFocused` … `unexpected value "inactive"`). The erasure response is held open so the
      assertion lands mid-request, which is the window that used to sit on `<body>`.
- [x] **AC-5, AC-6:** `npx ng test --include="src/app/admin/admin-venue-photos.spec.ts"` → **18 passed**;
      AC-5 verified RED first. AC-6 passed before the fix (nothing moved focus at all), so it was
      **mutation-checked**: relocating the focus call outside `reportOnlyIfStillViewing` turns it RED.
- [x] **AC-7..AC-10:** `npx ng test --include="src/app/admin/admin-operators*.spec.ts"` → **32 passed**,
      all four verified RED first; plus the Chromium leg
      `a settled suspension announces the outcome and lands focus on it`.
- [x] **AC-11 (unit half):** `npx ng test --include="src/app/shared/busy-action.spec.ts"` → **7 passed**.
- [x] **AC-13:** `npx playwright test --config playwright.a11y.config.ts operator-set-editing` →
      **6 passed**; the busy save measures `opacity: 0.5` via `getComputedStyle`, byte-identical to
      the `disabled:opacity-50` it replaced, and `1` once settled.
- [x] **AC-14..AC-16:** `npx ng test --include="src/app/shared/focus-after-render.spec.ts"` →
      **8 passed**, RED first at the type level. One pre-existing case was deliberately rewritten
      (it asserted the no-op contract this slice replaces); the rest are unmodified, and all seven
      adopters' suites passed unmodified (**174**).
- [x] **Full verification:** `npx ng lint` clean · `npm test` **1362 passed (156 files)** ·
      `npm run build` succeeds · `npm run test:e2e:a11y` **173 passed (5.5m)** · both repo-hygiene
      guards clean over the whole diff (`check-plan-file-structure --diff origin/main` exit 0,
      `check-inline-comments` exit 0).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (N/A, frontend-only); no new cross-feature FE import (RV-FE-8).
- [ ] **Payment/payout** section filled — the two money-path controls in the sweep are named, and
      each ships a double-activation spec (R-3).
- [ ] Refund policy enforced server-side (invariant #10) — unchanged; no client-side computation added.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met; no `as any`; every `data-testid` preserved.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder plus
      `riviera-review-overlay`, not the overlay alone.
- [ ] The mechanical-pin follow-up issue is filed (Non-goals).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
