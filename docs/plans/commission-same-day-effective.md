# Commission rate changes effective for today's reporting Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin commission-rate change schedules the new rate from **today** (`Europe/Tirane`),
not tomorrow — so from the moment of change, the takings strip for today reports at the same rate
same-day accruals apply, closing the #791-born ledger/takings divergence for the current service
date; past service dates still never reprice.

**Architecture:** The maintainer-settled policy (this session, 2026-08-28) is **schedule from
today** — the smallest of the three options issue #798 enumerates. `VenueCommissionService`'s
effective date moves from `today+1` to `today` (Tirane): after any change,
`VenueRates#commissionBpsOn(venue, today)` answers the same value as the live
`VenueRates#commissionBps`, so the rate accruals use and the rate the takings strip reports can no
longer disagree for today. The residual divergence — bookings **accrued before** the change
(this morning's, or advance bookings for today) keep their old-rate ledger entries while the strip
splits the whole day at the new rate — is exactly the per-booking-at-accrual vs one-rate-per-day
approximation `VenueRates#commissionBpsOn` and `DailyTakingsService` already document and
`admin-commissions.spec.ts` already pins ("not a copy of the ledger"). No schedule-granularity
change (the day is not split by time), no port change, no new module surface.

**Persistence:** JDBC only (invariant #1). **No migration** — `venue_commission_rate` (V39)
already keys on `(venue, effective_from)` and `CommissionRateStore#schedule` is idempotent per
date; only the date the service computes changes.

**Source of intent:** issue #798 (opened at #791's review close-out; policy decision settled by
the maintainer in this session via AskUserQuestion: *schedule from today*).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the issue
matches today's code exactly, no drift; all 18 open PRs are Dependabot, no overlap, no Flyway
contention — and none needed; surfaced the one product fork and escalated it, settled: schedule
from today) · `riviera-plan-doc` (this template — forced the parity ledger over the retired
"tomorrow" surface: enumerated every pin of the old behavior — 2 unit tests, 2 ITs, 1 FE spec pin,
FE copy in 4 places, 2 substrate docs) · `tdd` (unit test red first: the `Scheduled` expectation
moves to today, then the service; ITs follow) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (run at Phase 3 over `origin/main...HEAD`: sweep
"tomorrow"/"next service date" statements in CONTEXT.md, RESPONSIBILITIES.md §`venue`, and living
Javadoc/TSDoc) · `riviera-modulith` (change stays inside `venue.application`; `VenueRates` is an
existing `api/` port whose Javadoc is updated, signature untouched — no grant, event, or surface
change) · `riviera-java-conventions` (§6d governs the Javadoc rewrite: the retired evening-before
safety argument is decision history — the contract statement stays, the archaeology moves to
RESPONSIBILITIES.md §`venue`; clock injection stays, `LocalDate.ofInstant(clock.instant(), TIRANE)`)
· `riviera-stripe-payments` (confirmed accrual/refund/ledger mechanics untouched: the accrual
still reads the live rate at decision time — invariant #9's exactly-once and forward-only both
hold structurally; only the reporting schedule's start date moves) · `riviera-frontend` +
`riviera-tailwind` + `angular-developer` (loaded before Phase 2: copy-only edits inside the
existing `admin/admin-commissions.ts`, no structural, styling, or reactivity change) ·
`playwright-cli` (consulted for whether e2e changes: the mocked suite pins no "tomorrow" copy —
`admin-commissions.e2e.ts` exercises flows, not the explainer prose; the unit spec owns the copy
pins, so **no e2e change**) · `riviera-local-debug` (loaded before the session's first `./gradlew`;
scoped-test discipline below) · `postgres` (**N/A — no migration, no SQL change**; stated per the
routing table rather than silently absent).

**Branch:** `claude/sdlc-798-5ps4gs` — the session's designated remote branch stands in for
`bugfix/commission-same-day-effective` per the `riviera-sdlc` cloud addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue at 1500 bps, when the admin sets 2000 bps at midday, then the live
  rate is 2000 **and** the same rate is scheduled effective **today** (`Europe/Tirane`), so past
  service dates keep their rate via the pinned floor. *Pinned by:*
  `VenueCommissionServiceTest.writeUpdatesTheLiveRateAndSchedulesItFromToday`
- [ ] **AC-2:** Given a change at 22:30 UTC (already the next civil day in Tirane), when the
  schedule row is written, then its effective date is **Tirane's** today, not UTC's (invariant #6).
  *Pinned by:* `VenueCommissionServiceTest.todayIsReckonedInTiraneNotUtc`
- [ ] **AC-3:** Given a ledger accrual recorded at the old rate for a past service date, when the
  admin raises the rate, then that date's takings still split at the **old** rate and the ledger
  entry is byte-identical (invariant #9 — unchanged behavior, re-pinned against the new policy).
  *Pinned by:* `VenueCommissionForwardOnlyIT.aRateChangeDoesNotResplitPastServiceDatesNorTouchTheLedger`
- [ ] **AC-4:** Given the admin raises the rate, when the operator reads takings for **today**,
  then `commissionBps` is the **new** rate — the same rate a same-day accrual applies from that
  moment. *Pinned by:* `VenueCommissionForwardOnlyIT.theNewRateGovernsTheCurrentServiceDateOnward`
  (was `…FromTomorrowOnward`) + `AdminVenueCommissionIT.adminChangesAVenuesRateForwardOnly`
  (schedule-row date assertion moves to today).
- [ ] **AC-5:** Given the admin console explainer, when rendered, then it states reporting for
  **today** follows the change (and keeps the pinned claims: past service dates never re-price,
  the strip is not a copy of the ledger, `Europe/Tirane`, live rate). *Pinned by:*
  `admin-commissions.spec.ts` "states the narrow guarantee…" (the `'tomorrow'` pin becomes a
  today-claim pin).

## Non-goals

- **No time-of-day schedule granularity** — the day is not split at the change instant; the
  schedule stays one rate per `(venue, effective_from)` civil date. (The issue's option "splitting
  the day"; rejected with the maintainer's choice.)
- **No takings/ledger blending** — `DailyTakingsService` keeps one rate per day and never reads
  the ledger (the issue's second option; rejected).
- **No repricing of past service dates, no ledger writes** — invariant #9's constraints stay
  structural (floor pin + forward-only schedule untouched).
- **No API/wire change** — `AdminVenueCommissionsResponse` and the takings DTO carry no effective
  date today and gain none.
- **No change to accrual mechanics** — `BookingConfirmedPayoutListener` still reads the live rate
  at decision time.

## Behavior-parity ledger (retirement / replacement slices only)

The retired surface is the **"effective from tomorrow" policy** and every place that pinned or
stated it:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Live rate moves immediately; next accrual applies it | preserved | untouched — `updateLiveRate` + `commissionBps` |
| Superseded rate pinned to epoch floor before the live write | preserved | untouched — `ensureFloorRate` first, order-pinned by `thePreviousRateIsPinnedBeforeTheLiveColumnMoves` |
| Schedule row written `today+1` (Tirane) | **changed** | written **today** (Tirane) — the policy this slice implements |
| Past service dates' takings never reprice | preserved | floor pin covers every date < effective date; re-pinned by AC-3 |
| Today's takings report old rate until midnight | **dropped (deliberate)** | today reports the new rate from the change — the fix itself; the mismatch it removes could strand same-day accruals (#791) |
| Two same-day admin writes collapse to one row, last wins | preserved | `schedule` idempotent per `(venue, effective_from)` — unchanged, now exercised on today's row |
| Unknown venue schedules nothing (404, no orphan row) | preserved | order unchanged: schedule only after `updateLiveRate` proves existence |
| Tirane-not-UTC civil-date reckoning | preserved | same clock injection; test renamed `todayIsReckonedInTiraneNotUtc`, still pins the 22:30 UTC boundary |
| FE explainer: "Reporting moves from tomorrow" (+ section heading, notice string, TSDoc) | **changed** | copy states reporting for today follows the change; divergence sentence ("not a copy of the ledger") stays |
| Backend Javadoc safety argument (evening-before close) | **dropped (mandated)** | the issue's explicit ask — premise false since #791; contract Javadoc restated on the new policy, rationale to RESPONSIBILITIES.md §`venue` (§6d) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Timezone slip: effective date computed in UTC, not Tirane — wrong by a day for ~2h each evening (invariant #6) | low | high | keep `LocalDate.ofInstant(clock.instant(), TIRANE)`; AC-2 pins the 22:30 UTC boundary case | impl session | open |
| R-2 | A test reckoning "today" in the JVM default zone disagrees with the service near midnight (the `VenueCommissionForwardOnlyIT` header documents this exact trap) | low | med | ITs already use `LocalDate.now(TIRANE)`; keep that idiom in every edited assertion | impl session | open |
| R-3 | Repricing leak: some read treats "today's figure may change mid-day" as a broken guarantee | low | med | grill swept all `commissionBpsOn` consumers — only `DailyTakingsService`; its documented guarantee is "a **past** date's figure never changes", which still holds | plan session | closed — verified at grill |
| R-4 | FE spec pins break silently in CI only | low | low | Phase 2 runs the admin spec scoped locally before push | impl session | open |
| R-5 | Flyway collision | — | — | no migration in scope | — | closed — n/a |
| R-6 | Per-venue authorization (invariant #13) | — | — | no venue-scoped surface changes; admin write stays role-gated (`/api/admin/**` exemption), takings read keeps `assertOwns` — both untouched | — | closed — n/a |

## Open questions / Assumptions

### Resolved

- **Policy fork (the issue's Scope):** schedule from today vs blend takings vs accept+document —
  **settled by the maintainer via AskUserQuestion (2026-08-28): schedule from today.**
- **Assumption:** "today's figure may change mid-day" is acceptable — verified: today's gross
  already grows live; the documented immutability guarantee covers past dates only
  (`VenueRates#commissionBpsOn` Javadoc, FE spec pin). Confirmed as part of the policy choice.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no write path to `availability(set_id, booking_date)` is in
scope; the slice changes which civil date a commission-schedule row carries and prose/copy.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | owns the effective-dated commission-rate schedule (CLAUDE.md module table; RESPONSIBILITIES.md §`venue`) — the effective-date policy is the schedule's own rule |
| M-2 | `payout` | existing (tests + Javadoc only) | `PayoutLedgerEntry` | its `VenueCommissionForwardOnlyIT` pins the reporting behavior; `DailyTakingsService` Javadoc restates the divergence contract — no code-behavior change |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueRates#commissionBpsOn` — **Javadoc-only update** (signature, semantics of past dates unchanged; today's answer now tracks the live rate after a change) | — | `payout` |

**Domain events** — none touched (no event carries a rate, by design).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The schedule's effective-date policy (today, not tomorrow) | `venue` | `venue` Job: "the commission rate over time" (RESPONSIBILITIES.md §`venue`: forward-only by construction — that paragraph is updated, not moved); **not** `payout` (its Not-My-Job: "setting the commission rate, or recording which dates a past rate applied to → `venue`") — `payout` keeps the arithmetic, unchanged |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch — untouched.
- **Confirmation trigger / idempotency:** untouched (no webhook or accrual code in scope).
- **Money:** integer minor units, EUR — no new arithmetic, no new division/rounding site.
- **Payout-ledger effect:** none — no accrual/reversal change; AC-3 re-proves the ledger is
  untouched by a rate change.
- **Refund policy:** untouched (`lateCancelRefundBps` not in scope).
- **Pinning tests:** `VenueCommissionForwardOnlyIT` (both directions of the boundary).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-commissions.ts` | existing | copy-only edit (TSDoc + explainer + save notice) | — | — |
| FE-2 | `admin/admin-commissions.spec.ts` | existing | pin update ("tomorrow" → today-claim) | — | — |

**Standards:** no component/signal/form/styling change; copy stays inside the existing template
strings. No e2e change (the mocked suite pins flows, not this prose — placement per RV-FE-E2E).

## FE↔BE contract

N/A — no contract change (no endpoint, DTO, or wire shape touched).

## Execution status

**Stage pointer:** implement (phase 2)

**Next action:** Phase 2 — load FE skills, move the `admin-commissions.spec.ts` `'tomorrow'` pin to
the today-claim (red), then reword the `admin-commissions.ts` copy (green).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | beab9c3; draft PR #799 |
| 1 — Backend: effective date → today (unit + ITs + Javadoc) | ✅ | this commit |
| 2 — Frontend: explainer copy + spec pin | | |
| 3 — Substrate docs + docs-freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/commission-same-day-effective.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionService.java` — `nextServiceDate()` → today (renamed `currentServiceDate()`); Javadoc rewritten off the evening-before premise
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueCommissionServiceTest.java` — schedule expectations to today; class + test Javadoc/names updated
- `platform/src/test/java/ai/riviera/platform/venue/AdminVenueCommissionIT.java` — schedule-row assertion to today; assertion message updated
- `platform/src/test/java/ai/riviera/platform/payout/VenueCommissionForwardOnlyIT.java` — tomorrow test becomes the today test (rename + date); class Javadoc line on "tomorrow" updated
- `platform/src/main/java/ai/riviera/platform/venue/api/VenueRates.java` — `commissionBpsOn` Javadoc: today's answer tracks a same-day change; past-date guarantee restated unchanged
- `platform/src/main/java/ai/riviera/platform/payout/application/DailyTakingsService.java` — Javadoc: divergence contract restated on the new policy
- `frontend/src/app/admin/admin-commissions.ts` — TSDoc + explainer sections + save notice: reporting follows from today
- `frontend/src/app/admin/admin-commissions.spec.ts` — the `'tomorrow'` pin becomes the today-claim pin
- `RESPONSIBILITIES.md` — §`venue` rate-schedule paragraph: "from tomorrow" → "from the current service date", + the relocated rationale (why today is safe post-#791)
- `CONTEXT.md` — **Rate schedule** entry: "from the next service date" → "from the current service date"

---

## Phase 1 — Backend: effective date → today

**Files:** Modify `VenueCommissionServiceTest.java`, `VenueCommissionService.java`,
`AdminVenueCommissionIT.java`, `VenueCommissionForwardOnlyIT.java`, `VenueRates.java`,
`DailyTakingsService.java`

- [ ] **Step 1: Red** — `writeUpdatesTheLiveRateAndSchedulesItFromToday` expects
  `LocalDate.of(2026, 8, 6)` under `MIDDAY` (2026-08-05T12:00Z = Aug 5 Tirane → **today = Aug 5**);
  `todayIsReckonedInTiraneNotUtc` expects `2026-08-06` under `LATE_UTC_EVENING` (22:30 UTC Aug 5 =
  00:30 Aug 6 Tirane). Run
  `./gradlew test --tests "*VenueCommissionServiceTest*"` → FAIL (service still schedules +1).
- [ ] **Step 2: Green** — `VenueCommissionService`: `nextServiceDate()` →
  `currentServiceDate()` returning `LocalDate.ofInstant(clock.instant(), TIRANE)`; Javadoc
  rewritten (three-writes contract kept; evening-before paragraph replaced by the today rationale,
  history to RESPONSIBILITIES.md). Same command → PASS.
- [ ] **Step 3: ITs** — `AdminVenueCommissionIT`: expected date `LocalDate.now(TIRANE)`;
  message re-grounded. `VenueCommissionForwardOnlyIT`: rename
  `theNewRateGovernsServiceDatesFromTomorrowOnward` → `theNewRateGovernsTheCurrentServiceDateOnward`,
  query `date=today` (Tirane); header Javadoc updated. Run scoped (Docker-dependent — skip cleanly
  locally if no daemon; CI owns them).
- [ ] **Step 4: Javadoc sweep** — `VenueRates#commissionBpsOn` + `DailyTakingsService` restated.
- [ ] **Step 5: Scoped green** — `./gradlew test --tests "ai.riviera.platform.venue.*"` (+ payout
  takings tests: `--tests "*DailyTakingsServiceTest*"`).
- [ ] **Step 6: Commit** — `Schedule commission changes from today, not tomorrow (#798)`; open the
  draft PR; update Execution status.

## Phase 2 — Frontend: explainer copy + spec pin

- [ ] **Step 1: Red** — spec: replace the `'tomorrow'` pin with the today-claim (e.g.
  `toContain('today')` + keep the surviving pins); run scoped Vitest → FAIL.
- [ ] **Step 2: Green** — `admin-commissions.ts`: TSDoc, the two explainer blocks, the save
  notice → reporting-follows-today copy. Scoped Vitest + `npm run lint` + `npm run format:check`.
- [ ] **Step 3: Commit** — update Execution status.

## Phase 3 — Substrate docs + close-out

- [ ] **Step 1:** RESPONSIBILITIES.md §`venue` + CONTEXT.md **Rate schedule** entry.
- [ ] **Step 2:** `riviera-docs-freshness` over `origin/main...HEAD` (incl. the counting sweep).
- [ ] **Step 3:** `node scripts/check-plan-file-structure.mjs --diff origin/main` + hygiene guards.
- [ ] **Step 4:** Merge latest `origin/main`, mark PR ready, run the Review + Sonar gates
  (`references/pr-gates.md`), finalize Execution status in the PR's last commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-28 | Phase 1 (effective-date policy change) | every backend statement/pin of the "tomorrow" effective date — enumerated by the word, not by file resemblance | `grep -rni "tomorrow" platform/src/{main,test}/java` | 5 commission sites (service Javadoc, unit test ×2, `AdminVenueCommissionIT` message, `VenueCommissionForwardOnlyIT` test + header) — all fixed in Phase 1; remaining hits are booking-date fixtures and the request pay-window, whose "tomorrow"s are service dates, not the schedule policy | fixed all in-population; rest out of population |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-2:** `./gradlew test --tests "*VenueCommissionServiceTest*"` → PASS. Verified at ``.
- [ ] **AC-3/AC-4:** CI run of `VenueCommissionForwardOnlyIT` + `AdminVenueCommissionIT` green. Verified at ``.
- [ ] **AC-5:** scoped Vitest `admin-commissions.spec.ts` → PASS. Verified at ``.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (invariant #2 untouched).
- [ ] Pool + cutoff rules honored (invariants #3, #4 — untouched).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [ ] **Payment/payout** section filled; ledger exactly-once untouched (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: effective date in `Europe/Tirane` off the injected clock (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no migration (invariant #12 n/a).
- [ ] **Frontend** copy-only; no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder + `riviera-review-overlay`.
