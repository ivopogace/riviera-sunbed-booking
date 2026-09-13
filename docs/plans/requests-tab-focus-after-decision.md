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
close-out over `5bceef0..HEAD`>) · `riviera-frontend` (placement: all four legs are
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

- [ ] **AC-1 (settled — accept, queue not empty):** Given a two-card queue and the operator
  activates **Accept** on the first card, when the accept succeeds, then focus is on the
  `<li>` of the card that took its place (`request-row-12`), not `<body>` and not the notice.
  *Seam:* the rendered `app-requests-tab` + `POST /api/venues/1/booking-requests/11/accept` ·
  *Pinned by:* `RequestsTab (#176) › lands focus on the next card when an accept empties the pressed one`

- [ ] **AC-2 (settled — accept, queue empties):** Given a one-card queue and the operator
  activates **Accept**, when the accept succeeds, then focus is on `requests-notice`, which
  carries "asked to pay". *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › falls back to the notice when the accepted card was the last one`

- [ ] **AC-3 (open leg):** Given a queue card, when the operator activates **Decline**, then
  focus is on that card's `request-confirm-decline-11` button. *Seam:* the rendered tab
  (no HTTP) · *Pinned by:* `RequestsTab (#176) › moves focus onto the confirm button when the decline confirm opens`

- [ ] **AC-4 (back-out leg):** Given an open decline confirm, when the operator activates
  **Keep it**, then focus returns to that card's `request-decline-11` button. *Seam:* as AC-3
  · *Pinned by:* `RequestsTab (#176) › returns focus to the Decline trigger when the operator keeps the request`

- [ ] **AC-5 (in-flight — the confirm survives its own request):** Given an open decline
  confirm, when the operator activates **Confirm decline** and the request has not yet
  settled, then the confirm panel is still rendered, its confirm button carries
  `aria-disabled="true"`, and focus is still on it — not `<body>`. *Seam:* as AC-1
  (`…/11/decline`, unflushed) · *Pinned by:*
  `RequestsTab (#176) › keeps the decline confirm mounted and focused while the decline is in flight`

- [ ] **AC-6 (settled — decline):** Given the in-flight decline of AC-5 over a two-card queue,
  when it succeeds, then the confirm panel is gone, the card is gone, and focus is on the
  neighbouring card's `<li>`. *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › lands focus on the next card when a decline settles`

- [ ] **AC-7 (settled — lost sweep race):** Given an accept that 409s `REQUEST_EXPIRED`, when
  the card flips to the expired-race copy, then focus is on that card's
  `expired-race-11` output, which carries "just expired". *Seam:* as AC-1 ·
  *Pinned by:* `RequestsTab (#176) › parks focus on the expired-race copy when the sweep wins the race`

- [ ] **AC-8 (settled — dismiss):** Given a dismissible expired-race card that is the only
  card, when the operator activates **Dismiss**, then focus is on `requests-empty` ("All
  caught up") — the notice is deliberately not the fallback here because dismiss sets no
  notice text. *Seam:* as AC-7 · *Pinned by:*
  `RequestsTab (#176) › lands focus on the all-caught-up panel when the last expired card is dismissed`

- [ ] **AC-9 (settled — stale drop):** Given an accept that 409s `REQUEST_NOT_PENDING` over a
  two-card queue, when the card is dropped with the "already handled" notice, then focus is on
  the neighbouring card's `<li>`. *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › lands focus on the next card when a stale request is dropped`

- [ ] **AC-10 (no leg where nothing is destroyed):** Given an accept that fails with
  `PAYMENT_INIT_FAILED`, when the failure lands, then the card and its **Accept** button are
  still rendered and focus has NOT moved off that button. *Seam:* as AC-1 · *Pinned by:*
  `RequestsTab (#176) › leaves focus on the pressed button when a retryable failure destroys nothing`

- [ ] **AC-11 (venue switch out of an open confirm):** Given an open decline confirm, when the
  parent route's `:venueId` changes in place, then focus is on `requests-tab` rather than
  `<body>`. *Seam:* the parent route's `paramMap` + the rendered tab · *Pinned by:*
  `RequestsTab (#176) › moves focus to the tab when a venue switch tears down an open confirm`

- [ ] **AC-12 (real browser, all legs):** Given the mocked Requests tab in Chromium, when the
  operator walks open → back-out → accept → decline → dismiss, then
  `document.activeElement` is never `<body>` at any leg and axe reports no serious violation.
  *Seam:* `frontend/e2e/operator-requests.e2e.ts` against the `page.route` mocks ·
  *Pinned by:* `operator-requests.e2e.ts › keeps focus off body across every request decision (WCAG 2.4.3)`

- [ ] **AC-13 (no drift):** Given the existing Requests-tab unit, a11y, contrast and e2e
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
| R-1 | The landing id is computed from `requests()` *after* `removeCard` mutates it, so the "neighbour" is off by one | med | med | Compute `neighbourTestId()` before `removeCard()`; AC-1/AC-6/AC-9 assert the *specific* neighbour id (`request-row-12`), not merely "focus is not body", so an off-by-one fails | claude | open |
| R-2 | `reconcile()` fires right after the focus move and its response re-renders the queue, stealing focus back to `<body>` | med | high | `@for` tracks `row.bookingId`, so a reconcile that returns the same ids reuses the same DOM nodes and focus survives. AC-1 flushes the reconcile GET before asserting; AC-12 proves it in a real browser | claude | open |
| R-3 | The `<li>` / `<output>` / empty-panel landing spots get no focus ring — the `@layer base` rule is `button:focus-visible` only (`riviera-tailwind` rule 6), so a **sighted** keyboard operator sees no indicator of where focus went | high | low | Accepted, not mitigated with a new ring: every existing non-button landing spot in the tree behaves the same (`admin-review-{id}`, `admin-photo-slot-{slot}`, `payouts-tab`), and Tailwind's own docs define `focus-visible` as "focused using the keyboard" with no stated behaviour for programmatic focus on `tabindex="-1"`, so a ring built on it would be a browser-heuristic gamble. WCAG 2.4.7 governs keyboard-*reachable* controls; a `tabindex="-1"` waypoint is not one. Revisit as its own slice if the maintainer wants a ring convention for landing spots | claude | open (accepted) |
| R-4 | Not adopting `shared/confirm-panel.ts` leaves a second confirm idiom in the operator console | low | low | Deliberate — see Non-goals. The inline confirm keeps the card's own visual family and adopting the shared panel would be a restyle inside a WCAG bug fix | claude | open (accepted) |
| R-5 | Four new per-card `data-testid`s collide with, or shadow, the existing shared ones (`request-card`, `decline-confirm`, `expired-race`, `dismiss-expired`) that unit + e2e specs query | med | med | The new ids go on *different* elements (the `<li>`, the two buttons, the inner `<output>`), so every existing hook keeps its element and its meaning — `riviera-tailwind` rule 2's inert-marker rule. AC-13 is the whole existing suite passing unchanged | claude | open |
| R-6 | `focusMover()` resolves by `querySelector`, which takes the **first** match — a shared id would focus the wrong card | high | high | Every per-card target id is suffixed with `bookingId`. AC-1/AC-3/AC-4/AC-7 all assert against a card that is *not* first in the queue where the shape allows it | claude | open |
| R-7 | Moving focus at the same moment the polite live region updates makes a screen reader drop the outcome announcement that #1078 just repaired | low | med | The landing spot on the queue-empties leg **is** the notice, so its text is read as the focus target. On the neighbour-card leg the region is `aria-live="polite"`, which queues rather than interrupts. No regression to #1078's specs (AC-13) | claude | open |
| R-8 | jsdom is not evidence for a focus claim | low | med | RV-FE-9's rule is that a claim about a *destroyed* control may be pinned in jsdom (only a *disabled*-control claim needs Chromium). Every leg here is a destroyed control. AC-12 adds the Chromium leg anyway | claude | open |

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

**Stage pointer:** `plan`

**Next action:** Commit the plan doc, open the draft PR (CI fires on `pull_request` only),
then start phase 0.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — per-card test hooks + the two synchronous legs (open, back-out) | | |
| 1 — the settled legs (accept, decline, stale drop, race, dismiss) + the in-flight confirm move | | |
| 2 — the venue-switch leg | | |
| 3 — generalization pass + e2e in real Chromium + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/requests-tab-focus-after-decision.md` — this plan.
- `docs/plans/operator-live-region-placement.md` — **deleted** at close-out: #1078's plan, its
  PR #1081 merged at `5bceef0`, and `riviera-docs-freshness` § *Plan-doc retirement* retires a
  merged plan at the next close-out, which is this one.
- `frontend/src/app/operator/requests-tab.ts` — `focusMover()` + the six focus legs.
- `frontend/src/app/operator/requests-tab.html` — the four additive per-card `data-testid`s.
- `frontend/src/app/operator/requests-tab.spec.ts` — AC-1 … AC-11.
- `frontend/e2e/operator-requests.e2e.ts` — AC-12.

---

## Phase 0 — Per-card test hooks and the two synchronous legs

**Files:** Modify `frontend/src/app/operator/requests-tab.html` ·
Modify `frontend/src/app/operator/requests-tab.ts` ·
Test `frontend/src/app/operator/requests-tab.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-3 and AC-4.
- [ ] **Step 2: Run them, verify they fail** —
      `npm test -- requests-tab.spec` → FAIL (`document.activeElement` is `<body>`).
- [ ] **Step 3: Minimal implementation** — add `request-row-{id}`, `request-decline-{id}`,
      `request-confirm-decline-{id}`, `expired-race-{id}`; `focusMover()` on the component;
      the move in `onDecline` and `onCancelDecline`.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- requests-tab` → PASS (all four spec files).
- [ ] **Step 5: Generalization-audit pass** — deferred to phase 3, once the pattern is whole.
- [ ] **Step 6: Commit** — `git commit -m "Move focus across the decline confirm's two synchronous legs (#1082)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The settled legs

**Files:** Modify `frontend/src/app/operator/requests-tab.ts` ·
Test `frontend/src/app/operator/requests-tab.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- requests-tab.spec` → FAIL.
- [ ] **Step 3: Minimal implementation** — `neighbourTestId()`; move the `declineConfirm`
      teardown out of `decide()`'s prologue into each settle handler; the focus move in the
      success handler, the three `onDecisionError` branches that destroy something, and
      `onDismissExpired`.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- requests-tab` → PASS.
- [ ] **Step 5: Generalization-audit pass** — deferred to phase 3.
- [ ] **Step 6: Commit** — `git commit -m "Land focus on the neighbouring request card when a decision empties the pressed one (#1082)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The venue-switch leg

**Files:** Modify `frontend/src/app/operator/requests-tab.ts` ·
Test `frontend/src/app/operator/requests-tab.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-11.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- requests-tab.spec` → FAIL.
- [ ] **Step 3: Minimal implementation** — in `resetForVenue()`, before the signals are
      cleared, move focus to `requests-tab` when a decline confirm was open (the
      `payouts-tab.ts` `statementOpen()` shape).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- requests-tab` → PASS.
- [ ] **Step 5: Generalization-audit pass** — deferred to phase 3.
- [ ] **Step 6: Commit** — `git commit -m "Move focus off a decline confirm a venue switch tears down (#1082)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Generalization pass, real-browser proof, close-out

**Files:** Modify `frontend/e2e/operator-requests.e2e.ts` · Delete
`docs/plans/operator-live-region-placement.md` · Modify this plan

- [ ] **Step 1: Write the failing test** — AC-12, the five-leg walk.
- [ ] **Step 2: Run it, verify it fails** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- operator-requests` → FAIL.
- [ ] **Step 3: (no implementation — phases 0–2 already satisfy it; a green-on-first-run e2e
      is recorded as such rather than claimed as red-green.)**
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *a handler that removes the row /
      panel carrying the control that invoked it, in a component that imports no
      `focusMover()`*. Enumerate, judge each, record below.
- [ ] **Step 6: Commit** — `git commit -m "Pin the request-decision focus legs in Chromium (#1082)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 – AC-11, AC-13:** `npm test` → all green.
- [ ] **AC-12:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- operator-requests` → all green.

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
