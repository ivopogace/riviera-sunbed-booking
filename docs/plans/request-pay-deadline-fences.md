# Request-to-Book and pay-deadline fences follow the on-day sales window — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist can request a set for **today** at a Request-to-Book venue before its
sales close, the venue accepts, the payment-due mail names a workable deadline, and the
tourist pays and confirms on the service day itself — because the pay fences now bound on
**the pay deadline having passed** (`min(accepted + pay-window, end of service day D)`)
instead of "the service day has opened", and the #791 temporary Instant-only gate is gone.

**Architecture:** The single most significant decision is **replacing the day-open fence
family with a day-end boundary** while keeping deadlines **derived, never stored**:
`BookingCutoff` gains `serviceDayEndsAt(D)` (= `serviceDayOpensAt(D+1)`), the sweep's
`booking_date` arm becomes a plain "service day has ended" predicate (which makes the
advance-born narrowing — `bornBeforeServiceDay` and its SQL mirror — deletable, since "day
ended" is never true from birth), and the code-gated view computes the same
`min(accepted_at + pay-window, end of day)` deadline the payment-due mail announces.
Ordering is load-bearing: the pay fences move **first**, the response-deadline cap moves to
the sales close and the temporary gate is removed **last** — the reverse order recreates
#791's review finding F-1 (an accept inside D minting an unpayable booking).
Two structure decisions ride along: **`BookingCutoff` relocates from `application/cancel/`
to the `application/` root** (after this slice it serves reserve, request, view, refund
*and* cancel — the module-wide day-boundary authority belongs beside `Bookings` and
`BookingCodeGenerator`, not under one use-case slice; done at Phase 0's refactor leg so
every later phase imports its final home), and **the sweep's SQL re-derivation of the pay
deadline is an accepted, pinned mirror** — a set-based query cannot call `RequestWindows`,
so the mail ≡ sweep identity tests (AC-2) plus the day-arm boundary IT are the contract
that keeps the two derivations from diverging.

**Persistence:** JDBC only (invariant #1). **No Flyway migration** — `request_expires_at`
and `accepted_at` already exist (V19); the pay deadline stays derived. Changed SQL only:
the abandoned-sweep candidate `WHERE` (arm 1 → "day ended", advance-born mirror dropped)
and the code-gated view read (`accepted_at` joins the SELECT list). `V45` stays free.

**Source of intent:** issue #792 (epic #790, design spec
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` §13 — its L310–312
state this slice's rule verbatim). Predecessor: #791 (`docs/plans/same-day-sales-close.md`),
whose close-out note on #790 names the bridge this slice replaces.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
#791's review **deliberately** parked the request accept-deadline cap at service-day open,
not the sales close the epic states (F-1: a sales-close cap while the #576 fences stood
minted unpayable bookings); this slice must move cap and fences together, fences first) ·
`riviera-plan-doc` (this template — forced the ordering constraint into the risk register
and the behavior-parity ledger over the #791 bridge) · `tdd` (each phase red-green at the
smallest seam: `BookingCutoffTest` → `RequestWindowsTest` → sweep/view ITs) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(due at phase 6 close-out over the slice range — `RESPONSIBILITIES.md` §`booking`,
`CLAUDE.md` invariant #4, and the #791-era Javadocs are known-stale targets) ·
`riviera-modulith` (all changes stay inside `booking`; no published-surface change — `payBy`
keeps its field, only its value moves; `venue::api` grant already carries `salesClose`;
the `BookingCutoff` move is intra-module — `application/*` is non-published either way, so
`PackageShapeArchitectureTests`/`verify()` are indifferent to it) ·
`riviera-java-conventions` (derived-not-stored deadlines as plain methods; §6d Javadoc —
the retired day-open rationale is *relocated* to `RESPONSIBILITIES.md`, not restated;
one-line inline comments) · `postgres` (sweep predicate redesign: the day-ended arm reuses
the existing status+date shape, no new index; `TIMESTAMPTZ` comparisons bound as instants,
Tirane day arithmetic done in Java, not per-row SQL `AT TIME ZONE`) · `codebase-design`
(pay-deadline arithmetic stays in `RequestWindows`, day boundaries in `BookingCutoff` — the
view composes the two rather than growing a third authority; surfaced the two structure
debts this plan now pays/pins: `BookingCutoff`'s misleading `cancel/` address → relocated to
the `application/` root, and the sweep's SQL deadline mirror → accepted with its identity
pinned rather than hidden) · `grilling` (issue intake —
AC drift reconciled, see Open questions) · `riviera-frontend` (FE surface is one in-place
copy edit in `booking/booking-view.ts` + its spec + one mocked-e2e arm; no new files, no
placement question) · `riviera-tailwind` (verified: **no styling delta** — the touched
panel keeps its `cls` bindings; no SCSS exists in-tree, migrate-on-touch moot) ·
`angular-developer` + angular-cli MCP (`get_best_practices` + `search_documentation` v22 —
control-flow `@if`/`@else if` and DOM-query spec approach in the touched template confirmed
against angular.dev; copy edit introduces no new API) · `playwright-cli` (**due at phase 6**
before authoring the e2e arm — noted here so the gate isn't silently skipped).

**Branch:** designated cloud-session branch **`claude/sdlc-792-plan-review-hdgdje`** stands
in for `feature/request-pay-deadline-fences` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

> Written at the application boundary — the inner hexagon — in domain terms.

- [x] **AC-1:** Given a Request-to-Book set on date D at a venue with sales close C, when a
  request is created at time T, then the stored response deadline is
  `min(T + expiry-window, D at C Europe/Tirane)` — uncapped two days out, capped at D's
  sales close for a near-term request. *Pinned by:*
  `CreateBookingServiceTest.requestDeadlineCappedAtSalesClose` (adapting
  `eveningBeforeRequestSucceedsWithDeadlineCappedAtServiceDayOpen`) and the existing
  `requestDeadlineUncappedTwoDaysOut`.
- [x] **AC-2:** Given an accepted request, when `BookingPaymentDue` is announced, then
  `payBy = min(accepted_at + pay-window, end of service day D)` — and the mailed deadline
  and the sweep's cutoff remain **pinned identical**. *Pinned by:*
  `RequestWindowsTest` (the existing mail-deadline ≡ sweep-cutoff identity cases, re-aimed
  at the day-end cap).
- [x] **AC-3:** Given a same-day accepted `AWAITING_PAYMENT` booking whose pay deadline has
  not passed, when the abandoned sweep runs, then it is **not** expired; once
  `min(accepted_at + pay-window, end of day D)` has passed, it is expired and its claim
  released. *Pinned by:* `AbandonedBookingSweepIT.sameDayAcceptedBookingSurvivesTheSweep`
  (new) and `expiresAnAwaitingPaymentBookingOnceItsServiceDayHasEnded` (adapted from
  `…HasOpened`).
- [x] **AC-4:** Given an `AWAITING_PAYMENT` booking (same-day **and** advance alike), when
  the code-gated view is read, then payment credentials are issued while the pay deadline
  hasn't passed and withheld after. *Pinned by:*
  `ViewBookingServiceTest.issuesCredentialsUntilThePayDeadline`,
  `withholdsCredentialsOnceThePayDeadlineHasPassed`,
  `acceptedAdvanceBookingKeepsCredentialsIntoItsServiceDay` (the old day-open withhold is
  now wrong by design), plus `BookingViewIT.reportsPayWindowClosedOnceThePayDeadlinePassed`.
- [x] **AC-5:** Given a Request-to-Book venue before its sales close **on the service day
  itself**, when a tourist requests, the venue accepts, and payment succeeds, then the
  booking reaches `CONFIRMED` — the #791 temporary gate is gone. *Pinned by:*
  `CreateBookingServiceTest.sameDayRequestSucceedsBeforeSalesClose` (replacing
  `sameDayRequestStillClosed`) and `SameDayRequestLifecycleIT` (request → accept → pay →
  `CONFIRMED`, boundary-venue trick: `23:59` close).
- [x] **AC-6:** Given an `AWAITING_PAYMENT` booking whose pay deadline **has passed**, when
  payment confirmation arrives, then the booking still transitions to `CONFIRMED` — the
  confirm path stays unfenced (settled posture, do not "fix"). *Pinned by:*
  `JdbcBookingsTransitionIT.confirmSucceedsAfterThePayDeadlineHasPassed` (new
  characterization test — the posture was previously prose-only).
- [x] **AC-7:** `RESPONSIBILITIES.md` §`booking` (L272–285 region) and `CLAUDE.md`
  invariant #4 no longer state the `min(accepted_at + pay-window, service-day open)` rule
  or the sweep's advance-born `booking_date` arm; they state the day-end rule. *Pinned by:*
  review + `riviera-docs-freshness` sweep at phase 6 (no test class — docs).

## Non-goals

- **The non-refundable disclosure** (payment-due mail stating "non-refundable once paid",
  checkout terms) — epic slice **#795** (also owns correcting `same-day-booking.e2e.ts`'s
  `AWAITING_DETAIL` mock).
- **Discover open/closed badges for today** — #793; **operator sales-close control /
  kill switch** — #794.
- Any cancellation-policy change: `freeCancellationEndsAt` and the FREE/LATE/CLOSED
  windows are untouched. (`RefundQuote.serviceDayOpen()` turned out to have no caller
  left once the view fence moved to the pay deadline — the accessor is retired with the
  other day-open members rather than kept as dead code.)
- Storing the pay deadline in the schema (stays derived; no migration).
- Any payment-module change: PaymentIntent creation timing, refunds, webhooks untouched.
- Rewording `V19`'s stale migration comment — applied migrations are checksum-immutable
  historical documents (the V39 precedent); `RESPONSIBILITIES.md` supersedes it in prose.

## Behavior-parity ledger (the #791 bridge this slice replaces)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Request response deadline capped at `serviceDayOpensAt(D)` (#791 F-1 bridge) | **changed** | Capped at `salesCloseAt(venue close, D)` — safe only because the pay fences move to day-end in the same slice, **before** this cap moves (phase order) |
| Same-day reserve at a Request venue refused `BOOKING_CLOSED` (temporary gate) | **dropped (by design)** | The gate exists only to protect the old fences; removed with them (AC-5). The sales-close refusal itself (`isBookable`) is untouched |
| Pay deadline announced as `min(accepted_at + pay-window, service-day open)` | **changed** | `min(accepted_at + pay-window, serviceDayEndsAt(D))`; mail ≡ sweep identity preserved (AC-2) |
| Sweep arm 1: advance-born rows reaped once their service day **opened** | **changed** | Any `AWAITING_PAYMENT` row reaped once its service day **ended** (`booking_date <= lastEndedServiceDay`); the advance-born narrowing is deleted — "day ended" is never true from birth, so same-day rows are no longer a special case |
| Sweep arms 2/3: TTL for never-accepted rows, `accepted_at + pay-window` for accepted | **preserved** | Unchanged SQL arms; together with the day-end arm they implement exactly "pay deadline passed" for accepted rows |
| View withholds `clientSecret` for advance-born rows once the day opened; same-day-born keep credentials | **changed** | One rule for both: withhold once the pay deadline passed (accepted rows: `min(accepted+window, day end)`; never-accepted rows: day end — TTL stays a sweep-only backstop, exactly as it is today for same-day rows) |
| `payWindowClosed` wire field + FE panel | **preserved** (copy changed) | Field name/type unchanged; panel copy re-worded — "…has already started" is false under the new trigger (see FE section) |
| Confirm path unfenced | **preserved** | Untouched; newly **pinned** by AC-6's characterization test |
| Pending requests created before deploy | **preserved** | Their stored `request_expires_at` (day-open-capped) is honored as written; the new cap applies to new requests only — no backfill |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Ordering:** moving the response cap to sales close (or removing the gate) while the day-open fences stand recreates #791 F-1 — accepts inside D mint bookings the mail dooms, the view starves, the sweep kills | high (if reordered) | high | Phase order is normative: fences (phases 0–3) before cap+gate (phases 4–5); each phase green before the next | impl session | resolved — phase order held: fences (0–3) landed and went green before the cap (4) and the gate removal (5) |
| R-2 | Sweep's day-end arm releases `(set, date)` claims into a **past** date | med | low | Pre-existing accepted behavior (the old `booking_date <= today` arm already swept past dates after downtime); a past date is never claimable — reserve rejects it and the staff mark answers `DATE_IN_PAST` — so invariant #2 holds; the availability calendar reports the freed past day (cosmetic, reads availability not bookability) | impl session | resolved (accepted) — pre-existing sweep behavior; a past date is unclaimable, invariant #2 holds |
| R-3 | View reads `accepted_at` — a missed SELECT column / mapper slot silently treats accepted rows as never-accepted (deadline too generous vs the mailed one) | med | med | `BookingViewIT` + `ViewBookingServiceTest` advance-accepted cases assert the withhold at `accepted+window` before day end | impl session | resolved — `BookingViewIT.reportsPayWindowClosedOnceThePayDeadlinePassed` + the advance-accepted unit cases pin the `accepted_at` wiring |
| R-4 | IT determinism near Tirane midnight / sales close | med | med | #791 R-5's **boundary-venue trick** (`23:59` venue for same-day success, `00:01` for refusal) + backdating fixtures (`ServiceDayBackdate` for `created_at`; add an `accepted_at` backdater beside it); boundary arithmetic proven in fixed-`Clock` unit tests | impl session | resolved — 23:59 boundary-venue `SameDayRequestLifecycleIT` + fixed-`Clock` unit cases; no wall-clock dependence in units |
| R-5 | A venue accepting minutes before a `23:59` close leaves a near-zero pay window (deadline = day end) | low | low | Accepted product residual — spec §13: "never past the end of the service day"; confirm stays unfenced, so a payment in flight still lands; noted, not engineered around | plan | accepted |
| R-6 | Timezone arithmetic at the day-end boundary (DST) | low | med | `serviceDayEndsAt(D)` delegates to the existing `serviceDayOpensAt(D+1)` (zone-rule-safe `ZonedDateTime` path already unit-tested); new unit cases pin `23:59:59` vs `00:00:00` membership | impl session | resolved — `serviceDayEndsAtHandlesTheDstShoulder` + delegation to `serviceDayOpensAt(D+1)` |
| R-7 | Deleting `bornBeforeServiceDay`/`serviceDayHasOpened`/`lastOpenedServiceDay` breaks a caller the grep missed (`out/` gitignore trap) | low | med | Negative confirmed via `git ls-files` sweep at plan time (call-site inventory in File structure); `ModularityTests` + compile break loudly either way | plan | resolved — call-site inventory held; `git ls-files` adapter sweep negative-confirmed post-delete; compile + structural net green |
| R-8 | The mail ≡ sweep identity silently diverges (mail says day end, sweep re-derives it in SQL — the accepted mirror) | low | high | `RequestWindowsTest` identity cases re-aimed at the day-end cap (AC-2) + the day-arm boundary IT (the SQL twin of `serviceDayHasEnded`); both sides bind their day bound from the same `BookingCutoff` members; the SQL carries a one-line pointer to `RequestWindows.payDeadline` | impl session | resolved — identity cases re-aimed (AC-2), day-arm boundary IT green, SQL carries the one-line mirror pointer |
| R-9 | The `BookingCutoff` relocation breaks a caller or the `cancellationWindow` visibility widening leaks structure | low | low | Mechanical `git mv` + import updates across the five injecting services and the test; the compile and the structural net (`ModularityTests`/`PackageShapeArchitectureTests`) catch any miss; `application/*` is non-published, so the public widening exports nothing | impl session | resolved — mechanical move; `ModularityTests`/`PackageShapeArchitectureTests` green; `cancellationWindow` widening exports nothing |

## Open questions / Assumptions

- **Assumption (drift, reconciled — RESOLVED at phase 4):** issue #792's AC-1 matches the
  epic; the *code* deliberately differed (#791 review F-1 parked the accept cap at day-open
  as a bridge — epic #790 comment, 2026-08-28). The bridge lifted in order: fences first
  (phases 0–3), then the cap (phase 4) and the gate (phase 5).
- **Assumption:** for a **never-accepted** `AWAITING_PAYMENT` booking the pay deadline is
  the **end of its service day** (TTL stays a sweep-only backstop, not a view fence) —
  continuous with today's pinned posture (`sameDayBornBookingKeepsItsCredentials`) and the
  issue's `min(accepted + pay-window, end of day)` formula, which defines the accepted
  case only. — RESOLVED at phase 3: `neverAcceptedBookingKeepsCredentialsUntilDayEnd` +
  `withholdsCredentialsOnceTheServiceDayHasEnded` make it explicit.
- **Assumption:** pre-deploy pending requests keep their stored (day-open-capped)
  `request_expires_at`; forward-only behavior change, no backfill. — RESOLVED: accepted at
  plan time; no backfill shipped.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged set — online claim at
  reserve/request, release on cancel/decline/expiry/withdraw, staff tap-to-mark, admin
  weather refund. This slice changes **when** the abandoned-sweep release fires (pay
  deadline passed instead of day opened), never **how** (same per-row expire + release +
  event loop).
- **Uniqueness guarantee:** untouched — `availability(set_id, booking_date)` unique
  constraint.
- **Concurrency strategy:** untouched — atomic `INSERT … ON CONFLICT` claim before money;
  the sweep keeps its row-lock loop.
- **Pool rule (invariant #3):** untouched — online booking targets online-pool sets only.
- **Cutoff rule (invariant #4):** creation stays gated by `BookingCutoff.isBookable`
  (venue's sales close on D, `Europe/Tirane`) — #791's rule, unchanged here. What moves:
  the **request response deadline** caps at that same sales close, and the **pay fences**
  bound at day end. A same-day claim can now be held by a pending/accepted request until
  its deadline — deliberate (the venue accepted it); release timing is R-2.
- **Pinning tests:** existing `ConcurrentReservationIT` / `ConcurrentRequestTerminationIT`
  stay green (no claim-path change); `AbandonedBookingSweepIT` pins the new release timing.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the request lifecycle, the day's boundaries (`BookingCutoff`), the sweeps, and the code-gated view — every change is intra-module |

**Cross-module named interfaces (`api/` ports)** — none added or changed.
`venue.vocabulary.SetBookingInfo.salesClose()` already reaches `booking` via the existing
`SetBookingFacts` port and grant (#791); no `allowedDependencies` change.

**Domain events** — none added; `booking.events.BookingPaymentDue` keeps its exact record
shape (`payBy` field) — only the computed value changes. No Event Publication Registry
`event_type` rewrite needed.

### Module ownership (§4a)

All in `booking`, no boundary change — the deadline arithmetic (`RequestWindows`), the day
boundaries (`BookingCutoff`), the sweep, and the view are already `booking`'s Job ("own all
three of the day's boundaries on `BookingCutoff`"); `venue` keeps storing the sales-close
*setting* (its Job), `availability` keeps holding state only (its Not-My-Job: "deciding
whether bookings are even open for a date → `booking`").

**Intra-module structure (the perfection pass):**

- **`BookingCutoff` moves to `booking/application/` (root)** — Phase 0. After this slice it
  serves five of the six use-case sub-packages; its `cancel/` address is a historical
  accident that misleads readers about its role. The root already hosts the module-shared
  pieces (`Bookings`, `BookingCodeGenerator`), so the move follows the established shape.
  Consequence: `cancellationWindow` widens from package-private to public
  (`CancellationPolicy` in `cancel/` calls it) — no published surface is created,
  `application/*` stays non-exported, and every other member is public already.
- **The `view → request` edge (`ViewBookingService` injecting `RequestWindows`) is
  precedented, not new debt** — the refund sweep already injects `RequestWindows`, and the
  view already injects `BookingCutoff`; the alternative (a third copy of the deadline
  arithmetic) is the worse structure.
- **The sweep's SQL deadline mirror is accepted and pinned, never silent:** the day-end
  arm and the `accepted_at` arm together re-derive `min(accepted + pay-window, day end)`
  in SQL because a set-based candidate query cannot call `RequestWindows`. The contract
  holding the two derivations together is (a) the mail ≡ sweep identity tests in
  `RequestWindowsTest` (AC-2), (b) the day-arm boundary IT (dated-yesterday reaped /
  dated-today spared — the SQL twin of `serviceDayHasEnded`), and (c) both sides binding
  their day bound from the same `BookingCutoff` members. A one-line comment above the SQL
  names `RequestWindows.payDeadline` as the rule being mirrored.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** — untouched.
- **Confirmation trigger:** signature-verified webhook → `PaymentConfirmed` →
  `confirmFromPayment`, guarded by **status only** — untouched, and newly pinned by AC-6.
- **Idempotency / money / payout-ledger / refunds:** untouched (no `payment`/`payout` file
  in the diff). The slice moves *when credentials are offered and when an unpaid booking is
  reaped*, never how money moves. Amounts stay integer minor units EUR on `payBy`'s
  sibling fields.
- **Pinning tests:** existing `JdbcBookingsTransitionIT` idempotency cases +
  `confirmSucceedsAfterThePayDeadlineHasPassed` (new).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` (pay-window-closed panel, ~L184–191) | existing | standalone component, inline template | none (copy only) | none |
| FE-2 | `booking/booking-view.spec.ts` | existing | Vitest spec | — | — |
| FE-3 | `e2e/request-to-book.e2e.ts` | existing | mocked Playwright spec | — | — |

**Standards:** v22 posture confirmed via angular-cli MCP `get_best_practices` +
`search_documentation` (control flow, component testing). Copy-only change — the `@else if
(b.payWindowClosed)` branch keeps its structure and `cls` class bindings (**no Tailwind
delta**; no SCSS in-tree, migrate-on-touch moot). New copy drops the "has already started"
premise: e.g. *"The payment deadline for this booking has passed, so it can no longer be
paid and stays unconfirmed. If you completed a payment in the last few minutes, reload this
page — it may still be confirming."* The e2e arm drives the mocked request flow on a
same-day date (venue accepts before close) and asserts the pay CTA renders — proving the FE
offers today for Request venues with no client-side gate (it never had one; the arm pins
that stays true).

## FE↔BE contract

- **No shape change.** `payWindowClosed: boolean` keeps name/type — its meaning broadens to
  "pay deadline passed"; `requestExpiresAt` values are now sales-close-capped —
  `formatDeadline` is value-agnostic. `BookingPaymentDue.payBy` (mail-side) likewise
  value-only.
- **Client typing:** untouched hand-written typed models (`booking.model.ts:135`).
- **Money/date on the wire:** unchanged (minor units + ISO dates).

## Execution status

> Session-recovery anchor — update in the same commit window as the change it records.

**Stage pointer:** **DONE — merged via PR #800** (merge close-out, this commit is the PR's
last). The review gate ran in full: `/code-review` (5-agent fan-out +
`riviera-review-overlay`) over `origin/main...a9b83ea8` on 2026-08-28, review comment on
PR #800, three findings fixed (register below). Two sessions fixed them concurrently: the
review session (red-first, re-entered at Implement with
`riviera-java-conventions`/`riviera-modulith`/`riviera-local-debug` re-loaded) and the
implement session (52c6ae7); F-1 converged, and on F-2/F-3 the reconciling merge keeps the
review session's **sweep-parity** resolution over 52c6ae7's accept-the-residual disposition
— rationale in the F-2 row; the fix surface was re-walked against the overlay's boundary
items. CI green and the Sonar quality gate + issue list cleared on the final head before
merge (recorded in the PR's Gates checkboxes).

**Next action:** none in-repo — post-merge GitHub edits only (epic #790 note, issue #792
closure check). Skill-routing gate ran per phase:
backend rows + `riviera-local-debug` (phases 0–5), `postgres` (phase 2),
`riviera-frontend`/`riviera-tailwind`/`angular-developer`+MCP (phase 3), `playwright-cli`
+ `riviera-docs-freshness` (phase 6). (Phase-1+2 push 30bf39f went hygiene-red — plan-doc
File structure omissions — fixed in the phase-3 push 3a45da7. Full-suite e2e note: one
unrelated spec, `operator-venue.e2e.ts` stale-tab 409, failed once under the 291-spec
parallel local run and passes in isolation — outside this diff; CI arbitrates.)

**Docs-freshness run (phase 6, `origin/main..HEAD`):** two findings, both patched —
`CONTEXT.md` pending-request entry still said the pay window capped at the service day's
*opening* (→ end of day), and `BookingCutoffTest`'s class Javadoc still counted "the
day's three boundaries" (→ four, incl. `serviceDayEndsAt`). Verified clean: CLAUDE.md
invariant #10 + ADR-0005 (cancellation stays day-open-fenced — a different fence),
`docs/design/` + spec §13 (no stale pay-fence copy), no surviving references to the
retired members or the `cancel/` address outside deliberate history.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — BookingCutoff day-end boundary + relocation to `application/` root | ✅ | Add the service-day-end boundary and re-home BookingCutoff (#792) |
| 1 — Pay deadline caps at day end (mail ≡ sweep identity) | ✅ | Cap the pay deadline at the end of the service day (#792) |
| 2 — Sweep: day-ended arm | ✅ | Sweep abandoned bookings once the pay deadline has passed (#792) |
| 3 — View fences on the pay deadline (+ FE copy) | ✅ | Gate the booking view's payment credentials on the pay deadline (#792) |
| 4 — Response deadline caps at sales close | ✅ | Cap the request response deadline at the sales close (#792) |
| 5 — Remove the #791 gate; lifecycle + confirm-unfenced pins; retire dead members | ✅ | Open same-day Request-to-Book: remove the temporary gate (#792) |
| 6 — e2e arm + docs freshness + close-out | ✅ | Follow the on-day sales window in docs and e2e (#792) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` + overlay, confidence 100) | `RequestProperties.java:77` boot-guard exception message still says the deadline caps at "the booked day's opening" — this slice moved the cap to the sales close and updated the class Javadoc, so the runtime message contradicts both. The exact lockstep site #791's F-3 audit named. | fixed — both sessions converged on the same message fix (52c6ae7 + the review-fix commit, merged); pinned by `RequestPropertiesTest.acceptsTheWholeWindowRangeButNotBeyondIt` asserting "sales close" |
| F-2 | review (three agents convergent, confidence 75 — below the PR-comment bar, real) | `ViewBookingService.java:102–103` — the strict `isAfter(payDeadline)` disagrees with the sweep's **inclusive** day-end arm at exactly `now == serviceDayEndsAt(D)`: sweep reaps (and releases the claim) while the view still issues credentials; the "exactly as the sweep spares it" comment holds only for the accepted/raw-window arm (`accepted_at < :acceptedBefore`, genuinely strict). | fixed — the view now mirrors the sweep **by construction**: `payWindowClosed = serviceDayHasEnded(date) OR acceptedAt < acceptedBefore(now)`, the exact two members the sweep binds, so day end is inclusive on both sides and the raw-window instant payable on both; the mailed `payBy` value is untouched. **Supersedes 52c6ae7's accept-the-residual disposition** (comment-only fix arguing the mailed instant must stay payable): that kept the one combination the finding flagged — credentials issued at an instant the sweep may cancel the booking and release its claim — and its own rationale conceded the sweep's midnight edge is inclusive, so the coherent promise is the pair's shared semantics |
| F-3 | review (companion to F-2, confidence 75) | No test pins the day-end-capped exact-instant parity (AC-2/R-8 discipline): `withholdsCredentialsOnceTheServiceDayHasEnded` uses a date two days gone; the sweep ITs stay clear of the boundary. Add the boundary case alongside F-2's fix. | fixed — `ViewBookingServiceTest.withholdsCredentialsAtTheExactEndOfServiceDay` + `dayEndCapClosesAnAcceptedBookingAtThatSameInstant` (red-first) pin withhold-at-day-end; 52c6ae7's opposite pin (`stillIssuesCredentialsAtTheExactDayEndInstant`) removed in the merge as it asserted the superseded behavior |

---

## File structure

- `docs/plans/request-pay-deadline-fences.md` — this plan.
- `platform/src/main/java/ai/riviera/platform/booking/application/BookingCutoff.java` — **moved here from `application/cancel/`** (Phase 0 refactor leg; `cancellationWindow` widens to public for `CancellationPolicy`); add `serviceDayEndsAt`, `serviceDayHasEnded`, static `lastEndedServiceDay`; delete `serviceDayHasOpened`, `bornBeforeServiceDay`, static `lastOpenedServiceDay` (call-site inventory verified: only the gate, the view, and the sweep binding — all rewired in this slice); Javadoc loses the "#576/until #792" bridge prose (§6d: relocated to RESPONSIBILITIES.md).
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancellationPolicy.java` — import update for the moved `BookingCutoff`; the quote's `serviceDayOpen()` accessor retired (caller-less once the view fence moved to the pay deadline).
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RequestWindows.java` — `payDeadline` cap parameter renamed to `serviceDayEndsAt`; Javadoc re-aimed.
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RespondToRequestService.java` — `announcePaymentDue` passes `cutoff.serviceDayEndsAt(...)`.
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/AbandonedBookingSweepService.java` — binds `BookingCutoff.lastEndedServiceDay(now)`; class Javadoc's third arm re-aimed at "day ended".
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/ExpireAbandonedBookings.java` — port Javadoc's third-arm paragraph re-aimed at "day ended".
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — `findExpirableAwaitingPayment` cap parameter renamed `serviceDayEndedOnOrBefore`; Javadoc re-aimed.
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ReserveSetService.java` — expiry cap → `salesCloseAt`, computed from the same single clock reading as the sales-close fence (`BookingCutoff.isBookable` gained an explicit-instant overload for it); temporary gate block deleted.
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — pay-deadline predicate (injects `RequestWindows` + `Clock`).
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingRecord.java` — gains `acceptedAt`.
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — `payWindowClosed` Javadoc re-aimed at the pay deadline (phase-3 audit).
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — sweep `WHERE` arm 1 → `booking_date <= :serviceDayEndedOnOrBefore` (advance-born mirror dropped); `findByCode` SELECT + mapper gain `accepted_at`.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RequestProperties.java` — Javadoc: expiry-window ceiling rationale now cites the sales-close cap.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/AbandonedPaymentProperties.java` — `MAX_TTL` Javadoc: the day-end arm is the universal backstop now.
- `platform/src/test/java/ai/riviera/platform/booking/application/BookingCutoffTest.java` — **moved with its class**; day-end members' unit cases; retired members' cases deleted.
- `platform/src/test/java/ai/riviera/platform/booking/application/request/RespondToRequestServiceTest.java` — import update for the moved `BookingCutoff` + the announce-cap change's expectations (Phase 1). (The move's full referencer set was enumerated at plan time with `git grep -l "BookingCutoff" platform/src` — 14 files, every one already an entry in this section; no import-only stragglers exist.)
- `platform/src/test/java/ai/riviera/platform/booking/application/request/RequestWindowsTest.java` — identity cases re-aimed (AC-2).
- `platform/src/test/java/ai/riviera/platform/booking/application/refund/AbandonedBookingSweepServiceTest.java` — binding case re-aimed (`bindsTheServiceDayArmToTheTiraneCivilDate` → day-ended).
- `platform/src/test/java/ai/riviera/platform/booking/AbandonedBookingSweepIT.java` — AC-3 cases (adapt + new same-day-accepted survival).
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — AC-4 cases (adapt the day-open trio to pay-deadline semantics).
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewIT.java` — HTTP-level AC-4 pins.
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — AC-1 + AC-5 unit pins (`sameDayRequestStillClosed` replaced).
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingsTransitionIT.java` — AC-6 characterization + existing accept-clock case kept green.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RequestPropertiesTest.java` — cap prose in assertions updated.
- `platform/src/test/java/ai/riviera/platform/booking/SameDayRequestLifecycleIT.java` — AC-5 end-to-end IT (new; boundary-venue trick).
- `platform/src/test/java/ai/riviera/platform/booking/ServiceDayBackdate.java` — doc updated; sibling `accepted_at` backdater added if the ITs need it (same file or beside it).
- `platform/src/test/java/ai/riviera/platform/booking/application/request/WithdrawRequestServiceTest.java` — `BookingRecord` fixture gains the `acceptedAt` slot.
- `frontend/src/app/booking/booking-view.ts` — panel copy (FE-1).
- `frontend/src/app/booking/booking.model.ts` — `payWindowClosed` TSDoc re-aimed at the pay deadline (phase-3 audit; type shape unchanged).
- `frontend/src/app/booking/booking-view.spec.ts` — copy assertion (FE-2).
- `frontend/e2e/request-to-book.e2e.ts` — same-day arm (FE-3).
- `RESPONSIBILITIES.md` — §`booking` L272–285 region rewritten to the day-end rule (AC-7).
- `CLAUDE.md` — invariant #4 pay-fence sentence rewritten (AC-7).
- `CONTEXT.md` — pending-request glossary entry's pay-window sentence re-aimed at the day's end (docs-freshness finding).

---

## Phase 0 — BookingCutoff day-end boundary (+ relocation to the application root)

**Files:** Move `…/application/cancel/BookingCutoff.java` → `…/application/BookingCutoff.java` (with `BookingCutoffTest`) · Modify the 12 referencing files (imports; inventory in File structure) · Test `…/application/BookingCutoffTest.java`

- [x] **Step 1: Write the failing tests** (fixed `Clock`, `Europe/Tirane` — match the
  existing `BookingCutoffTest` fixtures):

```java
@Test
void serviceDayEndsAtIsTheNextTiraneMidnight() {
    assertEquals(Instant.parse("2026-07-02T22:00:00Z"), // 2026-07-03 00:00 Tirane (CEST)
            cutoff.serviceDayEndsAt(LocalDate.of(2026, 7, 2)));
}

@Test
void serviceDayHasEndedOnlyAfterItsLastInstant() {
    // clock fixed at 2026-07-02T21:59:59Z == 23:59:59 Tirane on July 2
    assertFalse(cutoffAt("2026-07-02T21:59:59Z").serviceDayHasEnded(LocalDate.of(2026, 7, 2)));
    assertTrue(cutoffAt("2026-07-02T22:00:00Z").serviceDayHasEnded(LocalDate.of(2026, 7, 2)));
}

@Test
void lastEndedServiceDayIsYesterdayInTirane() {
    assertEquals(LocalDate.of(2026, 7, 1),
            BookingCutoff.lastEndedServiceDay(Instant.parse("2026-07-02T10:00:00Z")));
}
```

- [x] **Step 2: Run, verify red** — `./gradlew test --tests "*BookingCutoffTest*"` → FAIL
  (methods missing). Load `riviera-local-debug` first if this is the session's first build.

- [x] **Step 3: Minimal implementation** (delegating so zone rules live once):

```java
/** The instant service day {@code bookingDate} ends: the next day's Tirane midnight. */
public Instant serviceDayEndsAt(LocalDate bookingDate) {
    return serviceDayOpensAt(bookingDate.plusDays(1));
}

/** Whether service day {@code bookingDate} is over ({@code Europe/Tirane}). */
public boolean serviceDayHasEnded(LocalDate bookingDate) {
    return !clock.instant().isBefore(serviceDayEndsAt(bookingDate));
}

/** The most recent service day already ended at {@code now} — the sweep's day-arm bound. */
public static LocalDate lastEndedServiceDay(Instant now) {
    return now.atZone(TIRANE).toLocalDate().minusDays(1);
}
```

- [x] **Step 4: Run, verify green** — same command → PASS. (Retired members are deleted in
  phase 5, once their callers are gone — not here, or phases 1–4 won't compile.)
- [x] **Step 5: Refactor — relocate the day-boundary authority.** `git mv` `BookingCutoff`
  (and `BookingCutoffTest`) from `application/cancel/` to `application/`, beside `Bookings`
  and `BookingCodeGenerator`; widen `cancellationWindow` to public (its `CancellationPolicy`
  caller now sits in a sibling package; `application/*` stays non-exported, so nothing is
  published); update the imports across the referencer inventory (File structure). Verify:
  `./gradlew test --tests "*BookingCutoffTest*" --tests "*CancellationPolicy*"` then the
  structural net (`*ModularityTests*`, `*PackageShapeArchitectureTests*`) → PASS.
- [x] **Step 6: Generalization audit** — population: *module-shared classes still addressed
  under a single use-case sub-package* → `git ls-files 'platform/src/main/java/ai/riviera/platform/booking/application/*/*.java' | xargs grep -l "import ai.riviera.platform.booking.application\."` (cross-sub-package imports) →
  judge each: today's known edges are `BookingCutoff` (moved here), `RequestWindows`
  (stays in `request/` — the pay *window* is request vocabulary; view/sweep consuming it is
  the precedented edge, not an addressing error). Record the outcome below.
- [x] **Step 7: Commit** — `Add the service-day-end boundary and re-home BookingCutoff (#792)`
- [x] **Step 8: Update plan-doc execution status.**

---

## Phase 1 — Pay deadline caps at the end of the service day

**Files:** Modify `RequestWindows.java`, `RespondToRequestService.java:181–182` · Test `RequestWindowsTest.java`

- [x] **Step 1: Re-aim the identity tests** (the mail-deadline ≡ sweep-cutoff cases at
  `RequestWindowsTest`): the cap argument becomes the day **end**; a same-day accept with
  `pay-window` crossing midnight pins `payBy == serviceDayEndsAt(D)`, an early-day accept
  pins `payBy == acceptedAt + payWindow` (now legal **inside** D).
- [x] **Step 2: Run red** — `./gradlew test --tests "*RequestWindowsTest*"` → FAIL.
- [x] **Step 3: Implement** — rename `payDeadline`'s cap parameter to `serviceDayEndsAt`
  (Javadoc: *"never past the end of the service day"*, spec §13); in
  `RespondToRequestService.announcePaymentDue` pass
  `cutoff.serviceDayEndsAt(accepted.bookingDate())`.
- [x] **Step 4: Run green**; end-of-phase regression
  `./gradlew test --tests "ai.riviera.platform.booking.application.request.*"`.
- [x] **Step 5: Generalization audit** — population: *every call site passing a cap into
  `payDeadline` or documenting it* → `grep -rn "payDeadline\|serviceDayOpensAt" platform/src/main/java platform/src/test/java` →
  fix every remaining day-open mention on the pay path (view + sweep are later phases —
  record them as known-pending here).
- [x] **Step 6: Commit** — `Cap the pay deadline at the end of the service day (#792)`
- [x] **Step 7: Update execution status.**

---

## Phase 2 — Sweep: the day-ended arm

**Files:** Modify `JdbcBookings.java:561–587`, `AbandonedBookingSweepService.java:66–70` · Test `AbandonedBookingSweepServiceTest.java`, `AbandonedBookingSweepIT.java`

- [x] **Step 1: Failing tests.** Unit: `bindsTheDayArmToTheLastEndedTiraneServiceDay`
  (expects `BookingCutoff.lastEndedServiceDay(now)` as the third argument). IT (new):

```java
@Test
void sameDayAcceptedBookingSurvivesTheSweep() {
    // accepted moments ago for TODAY (23:59-close venue): pay deadline not passed
    var id = acceptedAwaitingPayment(todayTirane());
    sweep.expireOverdue();
    assertEquals("AWAITING_PAYMENT", statusOf(id));
}
```

  and adapt `expiresAnAwaitingPaymentBookingOnceItsServiceDayHasOpened` →
  `…OnceItsServiceDayHasEnded` (booking dated **yesterday** via the backdater is reaped;
  dated today is not).
- [x] **Step 2: Run red** — `./gradlew test --tests "*AbandonedBookingSweep*"` → FAIL.
- [x] **Step 3: Implement.** SQL arm 1 becomes (advance-born mirror deleted):

```sql
AND (   booking_date <= :serviceDayEndedOnOrBefore
     OR (accepted_at IS NULL AND created_at < :createdBefore)
     OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
```

  Service binds `BookingCutoff.lastEndedServiceDay(now)`. A one-line comment above the
  `WHERE` names the mirrored rule (`-- SQL mirror of RequestWindows#payDeadline; identity
  pinned by RequestWindowsTest`), so the duplication is visible at the site, not just in
  this plan. (`postgres`: same status+date shape as before — the existing candidate
  scan/index serves it; the Tirane day arithmetic stays in Java, bound as a `LocalDate`,
  no per-row `AT TIME ZONE` left.)
- [x] **Step 4: Run green**; regression `./gradlew test --tests "*JdbcBookings*"`.
- [x] **Step 5: Generalization audit** — population: *every SQL predicate mirroring
  `bornBeforeServiceDay` / Tirane midnight* → `git ls-files '*adapter/out/*.java' | xargs grep -ln "AT TIME ZONE"` →
  confirm the sweep was the only mirror (expected: yes).
- [x] **Step 6: Commit** — `Sweep abandoned bookings once the pay deadline has passed (#792)`
- [x] **Step 7: Update execution status.**

---

## Phase 3 — View fences on the pay deadline (+ FE copy)

**Files:** Modify `ViewBookingService.java:89–97`, `BookingRecord.java`, `JdbcBookings.java` (`findByCode` SELECT + mapper), `frontend/src/app/booking/booking-view.ts`, `booking-view.spec.ts` · Test `ViewBookingServiceTest.java`, `BookingViewIT.java`

- [x] **Step 1: Failing tests** — adapt the day-open trio and add the accepted cases
  (AC-4): `issuesCredentialsUntilThePayDeadline`,
  `withholdsCredentialsOncePayDeadlinePassed` (accepted + window elapsed, day still
  running), `acceptedAdvanceBookingKeepsCredentialsIntoItsServiceDay` (the old
  day-open withhold must NOT fire), `neverAcceptedBookingKeepsCredentialsUntilDayEnd`,
  `withholdsCredentialsOnceTheServiceDayHasEnded`.
- [x] **Step 2: Run red** — `./gradlew test --tests "*ViewBookingServiceTest*"` → FAIL.
- [x] **Step 3: Implement:**

```java
boolean awaitingPayment = b.status() == BookingStatus.AWAITING_PAYMENT;
Instant payDeadline = b.acceptedAt() != null
        ? windows.payDeadline(b.acceptedAt(), cutoff.serviceDayEndsAt(b.bookingDate()))
        : cutoff.serviceDayEndsAt(b.bookingDate());
boolean payWindowClosed = awaitingPayment && !clock.instant().isBefore(payDeadline);
```

  `BookingRecord` gains `acceptedAt` (nullable `Instant`); `findByCode` SELECT + mapper
  gain `accepted_at` (R-3). `quote.serviceDayOpen()` stays cancel-only. FE: re-word the
  `payWindowClosed` panel copy (drop "has already started"); update the spec's text
  assertion. No class/styling change.
- [x] **Step 4: Run green** — `./gradlew test --tests "*ViewBooking*" --tests "*BookingViewIT*"`;
  `cd frontend && npm test -- booking-view`.
- [x] **Step 5: Generalization audit** — population: *every consumer of
  `payWindowClosed`* → `git grep -n "payWindowClosed"` (backend DTOs, FE model/template/
  specs/e2e fixtures) → verify none encodes the day-open premise beyond the copy fixed here.
- [x] **Step 6: Commit** — `Gate the booking view's payment credentials on the pay deadline (#792)`
- [x] **Step 7: Update execution status.**

---

## Phase 4 — Response deadline caps at the sales close

**Files:** Modify `ReserveSetService.java:113–122`, `RequestProperties.java` (Javadoc) · Test `CreateBookingServiceTest.java`, `RequestPropertiesTest.java`

- [x] **Step 1: Failing tests** — adapt
  `eveningBeforeRequestSucceedsWithDeadlineCappedAtServiceDayOpen` →
  `requestDeadlineCappedAtSalesClose` (deadline = D at the venue's close, not D 00:00);
  keep `requestDeadlineUncappedTwoDaysOut` green.
- [x] **Step 2: Run red** — `./gradlew test --tests "*CreateBookingServiceTest*"` → FAIL.
- [x] **Step 3: Implement** — the cap becomes
  `cutoff.salesCloseAt(set.salesClose(), command.bookingDate())`; the inline comment about
  the day-open bridge goes; `RequestProperties`/`RequestPropertiesTest` prose follows.
- [x] **Step 4: Run green**; regression `./gradlew test --tests "ai.riviera.platform.booking.application.reserve.*"`.
- [x] **Step 5: Generalization audit** — population: *every site stating the accept-cap
  bound* (the #791 F-1/F-3 audit's own population, re-run) →
  `grep -rn "serviceDayOpensAt\|day-open\|day open" platform/src/main/java platform/src/test/java` →
  every remaining hit must be cancel-window or day-end-delegation prose, none the accept cap.
- [x] **Step 6: Commit** — `Cap the request response deadline at the sales close (#792)`
- [x] **Step 7: Update execution status.**

---

## Phase 5 — Remove the #791 gate; pin the lifecycle and the unfenced confirm

**Files:** Modify `ReserveSetService.java:98–102` (delete gate), `BookingCutoff.java` (delete retired members), `BookingCutoffTest.java`, `ServiceDayBackdate.java` · Create `SameDayRequestLifecycleIT.java` · Test `CreateBookingServiceTest.java`, `JdbcBookingsTransitionIT.java`

- [x] **Step 1: Failing tests** — `sameDayRequestSucceedsBeforeSalesClose` (replaces
  `sameDayRequestStillClosed`); `SameDayRequestLifecycleIT` (23:59-close venue: request
  today → accept → stub/webhook pay → `CONFIRMED`);
  `JdbcBookingsTransitionIT.confirmSucceedsAfterThePayDeadlineHasPassed` (backdated
  `accepted_at` + past `booking_date` — confirm still moves the row; AC-6, settled
  posture).
- [x] **Step 2: Run red** — the unit test fails on the gate's `BOOKING_CLOSED`.
- [x] **Step 3: Implement** — delete the gate block; delete `serviceDayHasOpened`,
  `bornBeforeServiceDay`, `lastOpenedServiceDay` + their unit cases (all callers now gone;
  R-7 inventory); update `ServiceDayBackdate`'s doc (its mechanism now serves the day-end
  arm) and add the `accepted_at` backdater the ITs need.
- [x] **Step 4: Run green** — `./gradlew test --tests "*CreateBookingServiceTest*"
  --tests "*SameDayRequestLifecycleIT*" --tests "*JdbcBookingsTransitionIT*"`, then the
  structural net: `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`.
- [x] **Step 5: Generalization audit** — population: *every `#791`/“temporary gate”/
  `#792` marker in main+test Java* → `git grep -n "#791\|#792\|temporary gate" platform/src frontend/src frontend/e2e` →
  each hit either dies in this slice or is deliberate history (plan docs).
- [x] **Step 6: Commit** — `Open same-day Request-to-Book: remove the temporary gate (#792)`
- [x] **Step 7: Update execution status.**

---

## Phase 6 — e2e arm, docs freshness, close-out

**Files:** Modify `frontend/e2e/request-to-book.e2e.ts`, `RESPONSIBILITIES.md`, `CLAUDE.md`, this plan doc.

- [x] **Step 1:** Load `playwright-cli` (routing gate), then extend the mocked
  request-to-book spec with a same-day arm (today's date, accept mocked before close, pay
  CTA renders; axe via `expectNoSeriousAxeViolations`). Suite placement (CI-safe mocked) —
  RV-FE-E2E's call, matching the #791 precedent.
- [x] **Step 2:** `cd frontend && npm run lint && npm run format:check && npm run test:e2e:a11y` → PASS.
- [x] **Step 3:** Docs (AC-7): rewrite `RESPONSIBILITIES.md` §`booking` L272–285 region —
  the pay fence is now *"the guest's deadline is `min(accepted_at + pay-window, end of the
  service day)`; the abandoned sweep and the code-gated view fence on the pay deadline
  having passed; a never-accepted booking's deadline is the day's end, its TTL the sweep's
  earlier backstop"* — and keep the confirm-unfenced block, now citing AC-6's pin;
  reword `CLAUDE.md` invariant #4's pay-fence sentence (number keeps, never renumber).
  Run `riviera-docs-freshness` over the slice range (the counting sweep: "three sweep
  arms", "#576 fences", `bornBeforeServiceDay` mentions).
- [x] **Step 4:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged first) + `node scripts/check-inline-comments.mjs --diff origin/main` → PASS.
- [x] **Step 5 (implement half):** Execution status finalized; origin/main verified
  already merged (branch up to date at `04e2303`). **Ready-for-review + the Review and
  Sonar gates are deliberately NOT run here** — the planning session owns them (session
  instruction); stage pointer says so.
- [x] **Step 6: Commit** — `Follow the on-day sales window in docs and e2e (#792)`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-28 | Review-fix F-2 (view/sweep boundary-strictness parity) | every production site comparing *now* against a pay-deadline or day-boundary bound | `grep -rn "acceptedBefore\|serviceDayHasEnded\|lastEndedServiceDay" platform/src/main/java` (+ `request_expires_at` guards) | sweep SQL + `AbandonedBookingSweepService` binding (authoritative); `ViewBookingService` (fixed — now binds the same two members); the `request_expires_at` pair (accept guard `> now` vs expiry sweep `<= now`) | View rebuilt on `serviceDayHasEnded` + `acceptedBefore` so parity is by construction; `request_expires_at` pair already consistent (at the stored instant: not acceptable AND expirable — no gap), left unchanged |
| 2026-08-28 | Phase 5 (gate removal) | Every `#791`/`#792`/"temporary gate" marker in main+test code | `git grep -n "#791\|#792\|temporary gate" platform/src frontend/src frontend/e2e` | Gate block + retired members (deleted), `requestDeadlineUncappedTwoDaysOut`'s stale day-open comment (fixed); every other hit is deliberate history (#791 sales-close features that survive) or a live #792 marker | Retired-member callers: none left (`git ls-files` adapter sweep negative-confirmed, R-7) |
| 2026-08-28 | Phase 4 (accept cap) | Every site stating the accept-cap bound (re-run of #791's F-1/F-3 audit population) | `grep -rn "serviceDayOpensAt\|day-open\|day open" platform/src/main/java platform/src/test/java` | `ReserveSetService` cap + comment (fixed), `RequestProperties`(+Test) prose (fixed), `BookingCutoff` class/`serviceDayOpensAt` Javadoc still claiming the pay-fence role (fixed this phase); the rest is cancel-window prose, day-end delegation, or the phase-5 retirees | No accept-cap statement names day-open any more |
| 2026-08-28 | Phase 3 (view fence) | Every consumer of `payWindowClosed` (backend DTOs, FE model/template/specs/e2e fixtures) | `git grep -n "payWindowClosed"` | `BookingDetail` Javadoc + `booking.model.ts` TSDoc (day-open prose — rewritten), `request-to-book.e2e.ts` test title (day-open premise — renamed), panel copy + spec (fixed this phase); remaining hits are premise-free fixtures/pass-throughs | All day-open premises on the wire flag removed |
| 2026-08-28 | Phase 2 (sweep day-end arm) | Every SQL predicate mirroring `bornBeforeServiceDay` / Tirane midnight in a driven adapter | `git ls-files '*adapter/out/*.java' \| xargs grep -ln "AT TIME ZONE"` | none (the sweep's deleted `AT TIME ZONE` arm was the only mirror) | Confirmed sole mirror; the surviving day-end arm binds a Java-computed `LocalDate` |
| 2026-08-28 | Phase 1 (pay-deadline cap) | Every call site passing a cap into `payDeadline` or documenting it | `grep -rn "payDeadline\|serviceDayOpensAt" platform/src/main/java platform/src/test/java` | `RespondToRequestService` (fixed this phase), `RequestWindows`(+Test) (re-aimed), `ExpireAbandonedBookings` Javadoc (phase 2), `ReserveSetService:118` + `RequestProperties`(+Test) prose (phase 4), `BookingCutoff` cancel/day-end-delegation/`bornBeforeServiceDay` uses (legit or phase 5) | Known-pending sites recorded; none outside planned phases |
| 2026-08-28 | Phase 0 (BookingCutoff re-home) | Module-shared classes still addressed under a single use-case sub-package — enumerated as cross-sub-package `application.*` imports | `git ls-files 'platform/src/main/java/ai/riviera/platform/booking/application/*/*.java' \| xargs grep -l "import ai.riviera.platform.booking.application\."` | Root-homed shared classes (`Bookings`, `BookingCodeGenerator`, now `BookingCutoff`) + 5 cross-slice edges: `cancel.CancellationPolicy`(+`RefundQuote`)/`cancel.CancelledBooking`, `request.RequestWindows`, `refund.ReleaseAbandonedBooking`, `reserve.ConfirmBooking`, `view.BookingRecord` | No further moves: each remaining edge's class is addressed at its vocabulary owner (the refund rule is cancel's, the pay window request's, the record the view's shape) and consumed cross-slice by design — the mechanism that made `BookingCutoff`'s address wrong (a module-wide authority under one slice) matches no other site |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `./gradlew test --tests "*CreateBookingServiceTest*"` → deadline-cap cases PASS. Verified at commits `a3b2c87` (cap) + `2d43b94` (same-day case).
- [x] **AC-2:** `./gradlew test --tests "*RequestWindowsTest*"` → identity cases PASS. Verified at commit `fdd37de`.
- [x] **AC-3:** `./gradlew test --tests "*AbandonedBookingSweep*"` → PASS (ITs ran against real Postgres, not skipped). Verified at commit `30bf39f`.
- [x] **AC-4:** `./gradlew test --tests "*ViewBooking*"` → PASS incl. `BookingViewIT`. Verified at commit `3a45da7`.
- [x] **AC-5:** `./gradlew test --tests "*SameDayRequestLifecycleIT*"` → PASS. Verified at commit `2d43b94`.
- [x] **AC-6:** `./gradlew test --tests "*JdbcBookingsTransitionIT*"` → confirm-after-deadline PASS. Verified at commit `2d43b94`.
- [x] **AC-7:** docs diff reviewed + `riviera-docs-freshness` run recorded (Execution status). Verified at the phase-6 commit.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section holds; no claim-path change; sweep-timing ITs present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section holds; no cross-module `application.*`/`adapter.*` imports; `BookingPaymentDue` payload unchanged (invariant #11).
- [x] **Payment/payout** untouched as declared; confirm path unfenced and now pinned (invariants #5, #8, #9, #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for the day boundary (invariant #6); DST-safe via `serviceDayOpensAt(D+1)` delegation.
- [x] Booking codes untouched (invariant #7).
- [x] No schema change → no migration (invariant #12 trivially holds); `V45` still free at merge.
- [x] **Frontend** copy-only change verified drift-free (spec assertion updated; no styling delta).
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #800`.
- [x] **The review gate ran in full** per the invocation ladder + `riviera-review-overlay`
      (5-agent `/code-review` fan-out + overlay bank walk; findings fixed and reconciled).
