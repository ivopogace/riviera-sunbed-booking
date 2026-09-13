# Requests-Tab Focus After a Decision Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every transition in `operator/requests-tab` that destroys the control the operator
just pressed — accept, decline, the decline confirm's open and back-out legs, the
expired-race dismiss, and a venue switch out of an open confirm — lands focus on a named
element instead of `<body>` (WCAG 2.4.3), and the queue-processing operator keeps their
place in a long queue.

**Architecture:** The settled leg lands on the **neighbouring card** (the row that takes the
removed one's place, else the row above), not on the notice at the top of the tab — Angular's
own a11y guidance is that the landing spot "should put users in a position to immediately move
into the main content", and this is a working queue an operator walks down. The notice is the
fallback for the leg that empties the queue, which is exactly `focusMover()`'s two-argument
form. Landing on the row's `<li>` rather than its **Accept** button is deliberate: Accept is a
one-click, no-confirm money action and a stray Enter would fire it.

**Persistence:** N/A — frontend-only, no table or migration in scope (invariant #1 untouched).

**Source of intent:** GitHub issue #1082 (split out of #1078's review of PR #1081 —
that slice repaired announcement timing (RV-FE-10); this one is focus management (RV-FE-9)).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
decline path tears its confirm panel down in `decide()`'s *prologue*, before the request is
even sent, so the strand the issue describes actually opens one step **earlier** than it says;
also caught that #1078's merged plan doc is still in `docs/plans/` awaiting its retirement) ·
`riviera-plan-doc` (this template — forced the per-leg table below, which is what surfaced the
`Dismiss` and venue-switch legs the issue does not mention) · `tdd` (each leg red first in
jsdom, then mutation-checked by deleting the `focusAfterRender` call and watching only that
leg go red) · `riviera-review-overlay` (RV-FE-9's six-item checklist **is** the acceptance
criteria here; runs again at the review gate) · `riviera-docs-freshness` (<pending — runs at
close-out over `5bceef0..HEAD`>) · `riviera-local-debug` (loaded before the session's
first `npm`; its cloud-session recipes are what this slice actually ran — `git fetch --unshallow`
before any history or `--diff origin/main` claim, and `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`
for the mocked Playwright suite) · `riviera-frontend` (placement: the legs are
component-local, no new `shared/` primitive — `focus-after-render.ts` already is the
primitive; the e2e goes in the CI-safe mocked suite) · `riviera-tailwind` (rule 6 — the
`@layer base` ring reaches `button:focus-visible` only, so the `<li>` landing spot paints no
ring; recorded as an accepted cost below rather than a new ring pattern, and no SCSS is left
in the tree so migrate-on-touch is moot) · `angular-developer` + angular-cli MCP
(`get_best_practices` for the v22 posture; `search_documentation` confirmed
`afterNextRender`'s documented `earlyRead → write` ordering is exactly what `focusMover()`
already does, so the fix reuses it rather than hand-rolling a `.focus()`; angular.dev
`best-practices/a11y` — "avoid situations where focus returns to the `body` element" and "the
focused element should put users in a position to immediately move into the main content" —
is what settled the next-card-over-notice call) · Tailwind CSS v4 docs
(`outline-width`, `hover-focus-and-other-states`: the `focus-visible` variant is documented
as "focused using the keyboard" with **no** stated behaviour for programmatically focused
`tabindex="-1"` elements, so the plan does not lean on `:focus-visible` firing on the landing
spot — see R-3) · `playwright-cli` (the mocked-suite focus legs, `toBeFocused()` per leg).

**Branch:** `claude/tailwindcss-angular-docs-3w2n34` — the session's designated remote branch
stands in for `bugfix/requests-tab-focus-after-decision`.

---

## Acceptance criteria (testable)

> Frontend ACs name the seam they observe through: the rendered tab plus the mocked
> `/api/venues/1/booking-requests` endpoints, never the private signal.

- [x] **AC-1 (settled — accept, queue not empty):** Given a two-card queue and the operator
  activates **Accept** on the first card, when the accept succeeds, then focus is on the
  `<li>` of the card that took its place (`request-row-12`), not `<body>` and not the notice.
  *Seam:* the rendered `app-requests-tab` + `POST /api/venues/1/booking-requests/11/accept` ·
  *Pinned by:* `RequestsTab (#176) › lands focus on the next card when an accept empties the pressed one`

- [x] **AC-2 (settled — accept, queue empties):** Given a one-card queue and the operator
  activates **Accept**, when the accept succeeds, then focus is on `requests-notice`, which
  carries "asked to pay". *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › falls back to the notice when the accepted card was the last one`

- [x] **AC-3 (open leg):** Given a queue card, when the operator activates **Decline**, then
  focus is on that card's `request-confirm-decline-11` button. *Seam:* the rendered tab
  (no HTTP) · *Pinned by:* `RequestsTab (#176) › moves focus onto the confirm button when the decline confirm opens`

- [x] **AC-4 (back-out leg):** Given an open decline confirm, when the operator activates
  **Keep it**, then focus returns to that card's `request-decline-11` button. *Seam:* as AC-3
  · *Pinned by:* `RequestsTab (#176) › returns focus to the Decline trigger when the operator keeps the request`

- [x] **AC-5 (in-flight — the confirm survives its own request):** Given an open decline
  confirm, when the operator activates **Confirm decline** and the request has not yet
  settled, then the confirm panel is still rendered, its confirm button carries
  `aria-disabled="true"`, and focus is still on it — not `<body>`. *Seam:* as AC-1
  (`…/11/decline`, unflushed) · *Pinned by:*
  `RequestsTab (#176) › keeps the decline confirm mounted and focused while the decline is in flight`

- [x] **AC-6 (settled — decline):** Given the in-flight decline of AC-5 over a two-card queue,
  when it succeeds, then the confirm panel is gone, the card is gone, and focus is on the
  neighbouring card's `<li>`. *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › lands focus on the next card when a decline settles`

- [x] **AC-7 (settled — lost sweep race):** Given an accept that 409s `REQUEST_EXPIRED`, when
  the card flips to the expired-race copy, then focus is on that card's
  `expired-race-11` output, which carries "just expired". *Seam:* as AC-1 ·
  *Pinned by:* `RequestsTab (#176) › parks focus on the expired-race copy when the sweep wins the race`

- [x] **AC-8 (settled — dismiss):** Given a dismissible expired-race card that is the only
  card, when the operator activates **Dismiss**, then focus is on `requests-empty` ("All
  caught up") — the notice is deliberately not the fallback here because dismiss sets no
  notice text. *Seam:* as AC-7 · *Pinned by:*
  `RequestsTab (#176) › lands focus on the all-caught-up panel when the last expired card is dismissed`

- [x] **AC-9 (settled — stale drop):** Given an accept that 409s `REQUEST_NOT_PENDING` over a
  two-card queue, when the card is dropped with the "already handled" notice, then focus is on
  the neighbouring card's `<li>`. *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › lands focus on the next card when a stale request is dropped`

- [x] **AC-10 (no leg where nothing is destroyed):** Given an accept that fails with
  `PAYMENT_INIT_FAILED`, when the failure lands, then the card and its **Accept** button are
  still rendered and focus has NOT moved off that button. *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › leaves focus on the pressed button when a retryable failure destroys nothing`

- [x] **AC-11 (venue switch out of an open confirm):** Given an open decline confirm, when the
  parent route's `:venueId` changes in place, then focus is on `requests-tab` rather than
  `<body>`. *Seam:* the parent route's `paramMap` + the rendered tab · *Pinned by:*
  `RequestsTab (#176) › moves focus to the tab when a venue switch tears down an open confirm`

- [x] **AC-12 (real browser, all legs):** Given the mocked Requests tab in Chromium, when the
  operator walks open → back-out → accept → decline → dismiss, then
  `document.activeElement` is never `<body>` at any leg and axe reports no serious violation.
  *Seam:* `frontend/e2e/operator-requests.e2e.ts` against the `page.route` mocks ·
  *Pinned by:* `operator-requests.e2e.ts › keeps focus off body across every request decision (WCAG 2.4.3)`

- [x] **AC-13 (no drift):** Given the existing Requests-tab unit, a11y, contrast and e2e
  specs, when the change lands, then all of them still pass unchanged — the four new
  per-card `data-testid`s are additive and no existing test hook is renamed.
  *Seam:* the existing spec files · *Pinned by:* the suite itself (`npm test`, `npm run test:e2e:a11y -- operator-requests`)

## Non-goals

- **No change to the decision lifecycle.** Accept still only moves the guest into the pay
  window; CONFIRMED still comes solely from the signature-verified Stripe webhook
  (invariant #8). No request-expiry, deadline or pay-window behaviour is touched.
- **No visual redesign.** No colour, spacing, radius or copy changes. The four new
  `data-testid` attributes and the `tabindex="-1"` that `focusMover()` sets at runtime are
  the entire DOM delta.
- **Not migrating the inline decline confirm to `shared/confirm-panel.ts`.** That component
  would give the open leg for free, but it is a different visual family (amber `alertdialog`,
  smaller buttons) and adopting it here is a restyle, not a focus fix. Considered and
  rejected; recorded in the risk register as R-4.
- **No new focus-ring pattern** for the non-`<button>` landing spots (see R-3).
- **No sweep of other components.** The generalization pass (phase 3) enumerates the
  population and tickets anything outside this component rather than fixing it here.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice replaces no surface, but it *does* change one existing behaviour, so that row is
> ledgered rather than left to the diff.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `decide()` closes the decline confirm in its prologue, before the HTTP call is sent | **changed** | The teardown moves into the settle handlers, matching `payouts-tab.ts`'s `onConfirmWeather`. Mid-flight the operator now sees the confirm panel with a busy **Confirm decline** instead of the card snapping back to Accept/Decline. This is what makes the existing `[appBusy]` binding on that button meaningful, and it removes the strand window entirely (AC-5). Maintainer-approved at plan time. |
| `decide()` sets `notice` then `removeCard` then `reconcile()` on success | preserved | Unchanged order; the focus move is inserted between `removeCard` and `reconcile()`, and the landing id is computed *before* `removeCard` mutates the queue |
| A default (retryable) failure keeps the card and re-enables the buttons | preserved, and now explicitly leg-free | Nothing is destroyed, so nothing moves (AC-10). The confirm panel also stays open on this path so the operator can retry in place |
| The 401 path sets the expiry notice and calls `operator.sessionLost()` | preserved + one addition | Also parks focus on the notice, as `payouts-tab` does on its own 401 leg |
| Every `epoch` staleness guard around a superseded decision | preserved | The focus moves sit *inside* the existing guards, so a superseded response moves nothing (RV-FE-9 bullet 4) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The landing id is computed from `requests()` *after* `removeCard` mutates it, so the "neighbour" is off by one | med | med | Compute `landingAfterRemoving()` before `removeCard()`; AC-1/AC-6/AC-9 assert the *specific* neighbour id (`request-row-12`), not merely "focus is not body", so an off-by-one fails | claude | closed — mutant B in phase 1 |
| R-2 | `reconcile()` fires right after the focus move and its response re-renders the queue, stealing focus back to `<body>` | med | high | `@for` tracks `row.bookingId`, so a reconcile that returns the same ids reuses the same DOM nodes and focus survives. AC-1 flushes the reconcile GET before asserting; AC-12 proves it in a real browser | claude | closed — AC-12 green in Chromium (phase 3) |
| R-3 | The `<li>` / `<output>` / empty-panel landing spots get no focus ring — the `@layer base` rule is `button:focus-visible` only (`riviera-tailwind` rule 6), so a **sighted** keyboard operator sees no indicator of where focus went | high | low | Accepted, not mitigated with a new ring: every existing non-button landing spot in the tree behaves the same (`admin-review-{id}`, `admin-photo-slot-{slot}`, `payouts-tab`), and Tailwind's own docs define `focus-visible` as "focused using the keyboard" with no stated behaviour for programmatic focus on `tabindex="-1"`, so a ring built on it would be a browser-heuristic gamble. WCAG 2.4.7 governs keyboard-*reachable* controls; a `tabindex="-1"` waypoint is not one. Revisit as its own slice if the maintainer wants a ring convention for landing spots | claude | open (accepted) |
| R-4 | Not adopting `shared/confirm-panel.ts` leaves a second confirm idiom in the operator console | low | low | Deliberate — see Non-goals. The inline confirm keeps the card's own visual family and adopting the shared panel would be a restyle inside a WCAG bug fix | claude | open (accepted) |
| R-5 | Four new per-card `data-testid`s collide with, or shadow, the existing shared ones (`request-card`, `decline-confirm`, `expired-race`, `dismiss-expired`) that unit + e2e specs query | med | med | The new ids go on *different* elements (the `<li>`, the two buttons, the inner `<output>`), so every existing hook keeps its element and its meaning — `riviera-tailwind` rule 2's inert-marker rule. AC-13 is the whole existing suite passing unchanged | claude | closed — all 6 pre-existing e2e + 23 pre-existing unit tests green, unchanged |
| R-6 | `focusMover()` resolves by `querySelector`, which takes the **first** match — a shared id would focus the wrong card | high | high | Every per-card target id is suffixed with `bookingId`. AC-3/AC-4 act on the *second* card, and AC-1/AC-6/AC-9 land on `request-row-12` while `request-row-11` is the one pressed | claude | closed — phase 0 + 1 |
| R-7 | Moving focus at the same moment the polite live region updates makes a screen reader drop the outcome announcement that #1078 just repaired | low | med | The landing spot on the queue-empties leg **is** the notice, so its text is read as the focus target. On the neighbour-card leg the region is `aria-live="polite"`, which queues rather than interrupts. No regression to #1078's specs (AC-13) | claude | closed — #1078's own spec (`announces the decision through a region that predates it`) still green |
| R-8 | jsdom is not evidence for a focus claim | low | med | RV-FE-9's rule is that a claim about a *destroyed* control may be pinned in jsdom (only a *disabled*-control claim needs Chromium). Every leg here is a destroyed control. AC-12 adds the Chromium leg anyway | claude | closed — AC-12 green, and mutant F turns it red |

## Open questions / Assumptions

- **Assumption:** an operator processes the queue in place, so keeping their position beats
  landing on the outcome text. *Owner:* maintainer · *Resolves by:* resolved at plan time.

### Resolved

- **Where does the settled leg land?** — the issue offered notice / next card / queue
  container. Answered by the maintainer at plan time via `AskUserQuestion`: **next card,
  notice as fallback**, and explicitly the row rather than its Accept button. Backed by
  angular.dev `best-practices/a11y`.
- **Should the decline confirm survive its own in-flight request?** — Answered by the
  maintainer at plan time via `AskUserQuestion`: **yes, close on settle**, matching
  `payouts-tab.ts`. Ledgered above.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice moves keyboard focus after a decision the
server has already made; it writes nothing, and it does not touch the accept/decline request
bodies, the pay window, the expiry sweep or `set_availability`. The reconcile that follows a
decision is unchanged and remains read-only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Accept continues to only move the guest into the pay window and
never self-confirms (invariant #8); no money, refund, commission or ledger path is touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/requests-tab.ts` | existing | standalone component | signals; adds `focusMover()` from `shared/focus-after-render.ts` | none |
| FE-2 | `operator/requests-tab.html` | existing | template | four additive per-card `data-testid`s | none |

**Standards:** standalone component, `inject()`, `@if`/`@for`, signals — all already in place
and unchanged. `focusMover()`'s `afterNextRender({ earlyRead, write })` split is the shape
angular.dev documents for reading the DOM before writing to it; no new render hook is added.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or error code is touched.

## Execution status

**Stage pointer:** `review gate — findings resolved, awaiting CI`

**Next action:** Confirm CI green on this head, then the Sonar gate
(`riviera-sdlc` `references/pr-gates.md` §2 — pull the issue list, not just pass/fail), then merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — per-card test hooks + the two synchronous legs (open, back-out) | ✅ | `71c425f` (plan), this commit |
| 1 — the settled legs (accept, decline, stale drop, race, dismiss) + the in-flight confirm move | ✅ | this commit |
| 2 — the venue-switch leg | ✅ | this commit |
| 3 — generalization pass + e2e in real Chromium | ✅ | `e426a04` |
| 4 — review-gate findings (F-1 … F-5) | ✅ | `2be2e22d`, this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI — `Repo hygiene (diff-scoped)`, `check-inline-comments.mjs` | RV-STYLE-1, 11 hits across 4 files: seven multi-line inline comments (the rule is one line or not written) and two carrying `(#1082)` provenance. Root cause worth recording — the guard is also a local `PostToolUse` hook, but this session wrote every file through Python heredocs in Bash rather than Edit/Write, so the hook never fired and the first signal was CI. Running it by hand is the fix on that path | fixed: the load-bearing rationale moved into TSDoc (doc comments are exempt from the one-line rule, not from the provenance rule), the rest shortened to one line, provenance dropped. Two review agents found the same thing independently, one noting PR #1081 carried an identical finding on this very file |
| F-2 | review (shallow bug scan) | A **server-driven** read that drops the row focus is sitting in strands it on `<body>` — the same WCAG 2.4.3 defect this slice exists to fix, reached through `fetchQueue` (the 60s poll, or any post-action reconcile) instead of a decision. Partly pre-existing, but this slice's own change widens the window: the decline confirm now stays mounted, and focused, for the whole in-flight request. My phase-3 generalization sweep missed it because I framed the mechanism as "removes the row carrying the control that **invoked** it" — which excludes a removal nobody here invoked | fixed: `landingIfFocusLeaves()` on every `fetchQueue` success — it reads the focused row, and when the fresh queue drops it, lands on the nearest surviving row, else the empty state. Pinned by `moves focus again when a re-read drops the row focus is sitting in`; mutant G (leg removed) reddens it |
| F-3 | review (git-history agent + comment agent, independently) | **Correctness, not just focus.** Keeping the confirm open through the request left **Keep it** live, with no `[appBusy]` — unlike `ConfirmPanel`, whose Cancel is bound busy precisely because "neither action is safe mid-write". An operator who backed out mid-flight got the panel dismissed and the request declined anyway, and was told so. Introduced by this slice's own F-in-flight change; `check-focus-posture.mjs` cannot see a *missing* `[appBusy]`, so nothing would have caught it | fixed: `[appBusy]="isDeciding(row.bookingId)"` + `aria-disabled:opacity-60` on **Keep it**, matching its two sibling buttons and `ConfirmPanel`'s contract. Pinned by `locks “Keep it” once the decline it would back out of is already in flight`; mutant H reddens it |
| F-4 | review (CLAUDE.md adherence) | RV-PROC-1: `riviera-local-debug` was loaded and its cloud-session recipes were what the slice actually ran, but it was missing from **Skills consulted** | fixed: recorded, naming the two recipes used |
| F-5 | review (CLAUDE.md adherence) | The plan asserted `docs/plans/operator-live-region-placement.md` was deleted and marked phase 3 ✅, but no commit deleted it — the state store claimed a step the diff did not carry | fixed: the file is deleted in this commit, and the retirement is no longer deferred to a step after the phase that claimed it |

---

## File structure

- `docs/plans/requests-tab-focus-after-decision.md` — this plan.
- `docs/plans/operator-live-region-placement.md` — **deleted**: #1078's plan, its PR #1081 merged
  at `5bceef0`, and `riviera-docs-freshness` § *Plan-doc retirement* retires a merged plan at the
  next close-out, which is this one.
- `frontend/src/app/operator/requests-tab.ts` — `focusMover()` + the six focus legs.
- `frontend/src/app/operator/requests-tab.html` — the four additive per-card `data-testid`s.
- `frontend/src/app/operator/requests-tab.spec.ts` — AC-1 … AC-11.
- `frontend/e2e/operator-requests.e2e.ts` — AC-12.

---

## Phase 0 — Per-card test hooks and the two synchronous legs

**Files:** Modify `frontend/src/app/operator/requests-tab.html` ·
Modify `frontend/src/app/operator/requests-tab.ts` ·
Test `frontend/src/app/operator/requests-tab.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-3 and AC-4.
- [x] **Step 2: Run them, verify they fail** —
      `npm test -- --include src/app/operator/requests-tab.spec.ts` → FAIL, 2 of 23
      (`byId('request-decline-12')` is null — the per-card hook does not exist yet).
- [x] **Step 3: Minimal implementation** — added `request-row-{id}`, `request-decline-{id}`,
      `request-confirm-decline-{id}`, `expired-race-{id}`; `focusMover()` on the component;
      the move in `onDecline` and `onCancelDecline`.
- [x] **Step 4: Run them, verify they pass** — `npm test -- --include "src/app/operator/requests-tab*.spec.ts"`
      → 3 files, 47 tests, green. Mutation-checked: with both `focusAfterRender` calls removed,
      exactly those two tests go red and the other 21 stay green.
- [x] **Step 5: Generalization-audit pass** — deferred to phase 3, once the pattern is whole.
- [x] **Step 6: Commit** — `git commit -m "Move focus across the decline confirm's two synchronous legs (#1082)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The settled legs

**Files:** Modify `frontend/src/app/operator/requests-tab.ts` ·
Test `frontend/src/app/operator/requests-tab.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10.
- [x] **Step 2: Run them, verify they fail** —
      `npm test -- --include src/app/operator/requests-tab.spec.ts` → 7 of 31 red
      (`document.activeElement` is `<body>`). AC-10 asserts that focus does *not* move and is
      therefore green by construction before the change — recorded as such rather than claimed
      as red-green; it is a regression guard against a later over-eager leg. Mutant **D** — adding
      `focusAfterRender(NOTICE)` to the retryable-failure branch — was run and turns exactly AC-10
      red, so the guard is real rather than vacuous.
- [x] **Step 3: Minimal implementation** — `landingAfterRemoving()`; the `declineConfirm`
      teardown moved out of `decide()`'s prologue into each settle handler; the focus move in the
      success handler, the three `onDecisionError` branches that destroy something, and
      `onDismissExpired`.
- [x] **Step 4: Run them, verify they pass** —
      `npm test -- --include "src/app/operator/requests-tab*.spec.ts"` → 3 files, 55 tests, green.
      Three mutants, each caught: **A** all settled-leg `focusAfterRender` calls removed → the 6
      settled tests red; **B** the landing spot computed *after* `removeCard` (risk R-1's
      off-by-one) → the 2 neighbour tests red; **C** the confirm teardown put back in `decide()`'s
      prologue → AC-5 red.
- [x] **Step 5: Generalization-audit pass** — deferred to phase 3.
- [x] **Step 6: Commit** — `git commit -m "Land focus on the neighbouring request card when a decision empties the pressed one (#1082)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The venue-switch leg

**Files:** Modify `frontend/src/app/operator/requests-tab.ts` ·
Test `frontend/src/app/operator/requests-tab.spec.ts`

- [x] **Step 1: Write the failing test** — AC-11.
- [x] **Step 2: Run it, verify it fails** —
      `npm test -- --include src/app/operator/requests-tab.spec.ts` → 1 of 32 red.
- [x] **Step 3: Minimal implementation** — in `resetForVenue()`, before the signals are
      cleared, move focus to `requests-tab` when a decline confirm was open (the
      `payouts-tab.ts` `statementOpen()` shape).
- [x] **Step 4: Run it, verify it passes** —
      `npm test -- --include "src/app/operator/requests-tab*.spec.ts"` → 3 files, 56 tests, green.
      Mutant **E** (the `focusAfterRender(TAB)` call removed) turns exactly AC-11 red.
- [x] **Step 5: Generalization-audit pass** — deferred to phase 3.
- [x] **Step 6: Commit** — `git commit -m "Move focus off a decline confirm a venue switch tears down (#1082)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Generalization pass, real-browser proof, close-out

**Files:** Modify `frontend/e2e/operator-requests.e2e.ts` · Modify this plan

- [x] **Step 1: Write the failing test** — AC-12, split into two specs (the four-leg decision
      walk, and the lost-race + dismiss pair).
- [x] **Step 2: Run it, verify it fails** — **it did not**: phases 0–2 already satisfy it, so both
      specs passed on their first run. Recorded as such rather than claimed as red-green. They were
      instead proved non-vacuous by mutation: with the four settled/open `focusAfterRender` calls
      removed (mutant **F**), both go red on `expect(locator).toBeFocused()`.
- [x] **Step 3: (no implementation needed — see step 2.)**
- [x] **Step 4: Run it, verify it passes** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- operator-requests`
      → 8 passed (25.8s). This is also what closes R-2 and R-8: jsdom cannot show that the
      post-decision reconcile leaves focus alone, and Chromium does.
- [x] **Step 5: Generalization-audit pass** — two shapes swept, both closed. See the log below.
- [x] **Step 6: Commit** — `git commit -m "Pin the request-decision focus legs in Chromium (#1082)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-13 | phase 3 | **Shape 1 — a handler that removes the row carrying the control that invoked it.** Enumerated by mechanism: every component signal typed as a list, then those with a remove/dismiss/delete/discard/withdraw/drop handler, then each checked for a `focusMover()` import. A first, narrower net (`.filter(` inside `update(`) found only 4 and was widened rather than trusted, because `removeCard`-by-reassignment would have escaped it | `grep -rln 'signal<readonly .*\[\]>\|signal<.*\[\]>' src/app --include=*.ts \| grep -v '\.spec\.ts'` then the remove-verb + `focus-after-render` filter | 17 list-holding components → 5 with a removal handler: `admin-venue-photos`, `my-bookings`, `daily-view-tab`, `layout-editor`, `requests-tab`. All five already import `focusMover()`. The one hit without it, `core/device-local-bookings.ts`, is a `@Service` with no template | None — the population is closed by this slice. `requests-tab` was the last member missing the primitive |
| 2026-09-13 | phase 3 | **Shape 2 — a branch teardown that unmounts the focused control** (confirm surfaces, focus-trapped modals). Enumerated by the repo's own tree-wide audit rather than a hand-rolled grep, which is what `--all` exists for | `node scripts/check-focus-posture.mjs --all` | `BUSY-1: 0  BUSY-2: 0  FOCUS-1: 0` — no standing site in the tree | None |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 – AC-11, AC-13:** `npm test` → 257 files, 3202 tests, all green. This slice adds 11 unit
  specs (2 in phase 0, 8 in phase 1, 1 in phase 2) and changes no existing one.
- [x] **AC-12:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- operator-requests`
  → 8 passed. Verified at commit `<this commit>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled (N/A, frontend-only).
- [ ] **Payment/payout** section filled (N/A); invariant #8 untouched — accept still never self-confirms.
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7) — the queue stays code-less.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met; no `as any`; `scripts/check-focus-posture.mjs` output read, not just its exit code.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
