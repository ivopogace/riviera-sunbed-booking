# Guest withdraws a pending booking request (issue #123) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A guest holding a `PENDING_REQUEST` booking can retract it from the code-gated
`/booking/:code` view, releasing the `(set, date)` soft-hold immediately instead of blocking every
other buyer until the venue answers or the deadline passes.

**Architecture:** A **third terminal leg on `RequestReleaseService`** (beside decline and expire),
not a widening of `CancelBookingService`. Routing a withdraw through cancel would publish
`BookingCancelled` — three subscribers, one of which (`notification`'s #374 cancellation-mail
listener) would mail the guest a cancellation/refund record for a request they just retracted
themselves. The withdraw publishes **no event**: nothing accrued (no `BookingConfirmed`), nothing
was collected (payment-request-on-accept means no PaymentIntent exists pre-accept), and #124's
rescope states a withdraw wants no notification. The terminal state is a **new `WITHDRAWN`
status**, not a reused `CANCELLED` — decline and expire each got their own label for the same
reason, and "cancelled" must keep meaning "a confirmed booking was cancelled" in the booking table
and in the guest's own chip.

**Persistence:** JDBC only (invariant #1). Touches `booking` only — **V37** widens
`booking_status_check` with `WITHDRAWN`. No new column (`WITHDRAWN` stamps status alone, exactly as
`DECLINED`/`EXPIRED` do — there is no `declined_at`/`expired_at`, and there is no `withdrawn_at`).
No `availability` schema change; the hold release reuses `availability.api.AvailabilityClaim#release`.

**Source of intent:** issue #123 (deferred review finding from #98 / PR #122; review record in
`docs/plans/request-to-book.md`), plus its 2026-07-31 starter brief. Sibling scope note: #124
(decline + expiry notices) explicitly excludes the withdraw.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the starter
brief against `main`, and surfaced the three edge registrations the issue never mentions:
`SecurityConfig` CSRF-ignore, `SecurityConfig` permitAll, `RateLimitFilter.targetOf`) ·
`riviera-plan-doc` (this template — forced the Module-ownership table, which is what pinned the
withdraw to `booking` rather than a cancel widening) · `tdd` (each phase red-first; the enum/CHECK
lockstep IT is the built-in red for phase 0) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (due at merge close-out over this PR's range — the
slice adds the 9th `BookingStatus`, which is a counting-sweep trigger: every doc saying "the two
request terminals" or enumerating the lifecycle goes stale outside the diff) · `postgres`
(TEXT+CHECK widening over a native enum, forward-only `DROP`/`ADD CONSTRAINT`, and confirmed no new
index — the withdraw keys on the existing `UNIQUE(code)`) · `riviera-modulith` (the leg belongs in
`booking/application/request/` behind a new `WithdrawRequest` port; **no** `api/`/`events/` surface
change, so no `allowedDependencies` edit and no EPR `event_type` rewrite) · `riviera-frontend`
(`booking-status.ts` in `shared/` is the canonical union home; the control belongs in the existing
`booking/` feature folder, no new folder). Loading at implement time (recorded here in advance;
will be re-announced then): `riviera-java-conventions` + `riviera-local-debug` (first backend
phase), `codebase-design` (the port-vs-leg seam), `angular-developer` + `riviera-tailwind` +
`playwright-cli` (FE phases).

> **Toolset note (cloud session):** no angular-cli MCP server is connected this session, so the
> routing table's "angular-cli MCP" cell cannot be satisfied. The in-repo `angular-developer` skill
> and `frontend/.claude/CLAUDE.md` are authoritative here and are what the FE phases use; this is
> recorded rather than silently half-done (SDLC remote addendum, toolset drift).

**Branch:** `claude/sdlc-123-issue-review-e447br` — the cloud session's designated remote branch,
standing in for `feature/withdraw-pending-request` per the SDLC remote addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a booking in `PENDING_REQUEST`, when `WithdrawRequest.withdraw(code)` runs,
  then the outcome is `Withdrawn`, the booking is `WITHDRAWN`, and the `(set, date)` availability
  row is released — in one transaction, so the booking is never `WITHDRAWN` with its set still held
  (invariant #2). *Pinned by:* `WithdrawRequestServiceTest.withdrawsAndReleasesTheHold`,
  `ConcurrentRequestTerminationIT.withdrawnSetIsImmediatelyRebookable`.

- [ ] **AC-2:** Given a booking that is **not** `PENDING_REQUEST` (confirmed, awaiting payment,
  already declined/expired/withdrawn), when withdraw runs, then the outcome is
  `Rejected.NOT_PENDING`, **no** availability release happens, and the stored status is unchanged.
  *Pinned by:* `WithdrawRequestServiceTest.rejectsANonPendingBooking`.

- [ ] **AC-3:** Given an unknown code, when withdraw runs, then the outcome is
  `Rejected.NO_SUCH_BOOKING` and nothing is written. *Pinned by:*
  `WithdrawRequestServiceTest.rejectsAnUnknownCode`.

- [ ] **AC-4:** Given a pending request, when a withdraw and the expiry sweep (or a venue decline)
  act on it concurrently, then **exactly one** of them transitions the row and releases the hold —
  the loser is a 0-row no-op with no second release. *Pinned by:*
  `ConcurrentRequestTerminationIT.withdrawAndExpiryReleaseExactlyOnce`.

- [ ] **AC-5:** Given a pending request past its deadline but not yet swept, when the guest
  withdraws, then it still succeeds — the withdraw is **not** deadline-guarded, matching decline
  (same release, different terminal label). *Pinned by:*
  `ConcurrentRequestTerminationIT.withdrawsAnOverdueButUnsweptRequest` — an IT, not the unit test:
  the absence of a deadline predicate is a property of the SQL, which a mocked `Bookings` cannot
  show.

- [ ] **AC-6:** Given `POST /api/bookings/{code}/withdraw`, then it is reachable anonymously (the
  code is the bearer credential, invariant #7), maps `Withdrawn`→`200`, `NO_SUCH_BOOKING`→`404`,
  `NOT_PENDING`→`409` as RFC-7807 `ProblemDetail`, and **the booking code never appears in any
  error body or log**. *Pinned by:* `WithdrawRequestIT.mapsEveryOutcomeToItsStatus`,
  `WithdrawRequestIT.codeNeverLeaksIntoTheProblemBody`.

- [ ] **AC-7:** Given the withdraw path, then `RateLimitFilter` classifies it as a **code-keyed**
  booking endpoint — it spends both the per-IP and the per-code budget, exactly like cancel — so it
  cannot become an unthrottled booking-code guessing oracle. *Pinned by:*
  `RateLimitFilterTest.withdrawSpendsThePerCodeBudget`.

- [ ] **AC-8:** Given the `BookingStatus` enum, then every value is accepted by the
  `booking_status_check` constraint — i.e. `WITHDRAWN` ships with V37 and the enum/schema stay in
  lockstep (invariant #12). *Pinned by:* `BookingMigrationIT.everyEnumStatusAccepted` (existing;
  iterates `BookingStatus.values()`, so it goes red the moment the enum gains a value the CHECK
  lacks).

- [ ] **AC-9:** Given a `PENDING_REQUEST` booking, when `GET /api/bookings/{code}` is read, then the
  detail reports `withdrawable: true`; for every other status it is `false`, and the existing
  `cancellable` flag is **unchanged** (still `status == CONFIRMED`). *Pinned by:*
  `ViewBookingServiceTest.pendingRequestIsWithdrawableButNotCancellable`.

- [ ] **AC-10:** Given the `/booking/:code` view of a `PENDING_REQUEST` booking, then a
  `[data-testid="withdraw-request"]` control renders in the pending panel, asks for confirmation
  before acting, and on success flips the chip to `Withdrawn` without a reload; the panel renders
  **no** withdraw control for any other status. *Pinned by:*
  `booking-view.spec.ts` (the flipped `PENDING_REQUEST` case + the new withdraw-flow cases).

- [ ] **AC-11:** Given the shared status vocabulary, then `WITHDRAWN` has a `STATUS_META` row
  (`Withdrawn` / `chip--withdrawn` / `Amount` — never `Paid`, no money moved) and its chip ink meets
  WCAG AA on its solid fill. *Pinned by:* `booking-status.spec.ts`,
  `booking-status.contrast.spec.ts`.

- [ ] **AC-12:** Given the mocked CI-safe e2e suite, then a guest can open a pending request, click
  Withdraw, confirm, and see the withdrawn state — with no serious axe violations. *Pinned by:*
  `frontend/e2e/request-to-book.e2e.ts` (withdraw case).

- [ ] **AC-13:** Given an operator whose queue still shows a request the guest has withdrawn, when
  the operator accepts or declines it, then the API answers `409 REQUEST_NOT_PENDING` and the
  console shows its existing "already handled" copy — no new operator-side code. *Pinned by:*
  `WithdrawRequestIT.acceptAfterWithdrawIsNotPending`.

## Non-goals

- **No notification of any kind.** Not to the guest (they performed the action) and not to the venue
  (user decision, 2026-07-31; the stale-queue path in AC-13 is the whole answer). No new listener,
  no fourth registry-borne booking mail.
- **No `BookingCancelled` publication**, therefore no payout reversal and no refund attempt — there
  is nothing to reverse (accrual happens on `BookingConfirmed`) and nothing to refund.
- **No withdraw control on the "My bookings" list.** Its rows already link to `/booking/:code`,
  where the control lives; a second entry point is duplicated state for no gain.
- **No withdraw for `AWAITING_PAYMENT`** (an accepted request the guest no longer wants). That is a
  different decision — the venue has already committed — and the abandoned-payment sweep already
  releases it. Out of scope; not silently folded in.
- **No orphan-PaymentIntent reconciliation.** Pre-existing and already noted in #98's review record
  (see R-6).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. The one existing surface touched is the `booking-view.ts`
pending panel, which today renders an **empty slot with a comment** naming this issue; filling a
reserved slot is not a retirement.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Withdraw transitions the booking but the hold is not released (or is released twice) — a set held by a terminal booking, or a set freed while still held (invariant #2) | med | **high** | Reuse the `RequestReleaseService` shape verbatim: one `@Transactional` bean, a guarded `UPDATE … RETURNING set_id, booking_date`, release only on a returned row. `RETURNING` makes a lost race a 0-row no-op → released exactly once. AC-1, AC-4 | claude | open |
| R-2 | New endpoint missing from `SecurityConfig` — the #98 review's finding #1 was exactly this | med | med | Fails **closed** (`anyRequest().authenticated()` → 401), so the risk is a broken feature, not an exposure. Both the CSRF-ignore list and the permitAll matcher are edited in the same phase as the controller, pinned by an anonymous-caller IT | claude | open |
| R-3 | New endpoint missing from `RateLimitFilter.targetOf` → an **unthrottled** booking-code guessing oracle (the #342 percent-encoding lesson: an unmatched path spends no token and still reaches the controller) | med | **high** | Add `WITHDRAW_TEMPLATE` beside `CANCEL_TEMPLATE`; it joins the existing per-code bucket map (same dimension as view/cancel — same secret being guessed). AC-7 | claude | open |
| R-4 | Widening `cancellable` to cover withdraw — `ViewBookingService` carries an explicit comment warning against exactly this ("letting a future 'the guest may withdraw an open request' change to the cancellation policy silently widen this one is exactly the accident worth spending a method on") | low | med | A **separate** `withdrawable` field with its own predicate; `cancellable` untouched. AC-9 | claude | open |
| R-5 | Flyway `V37` collides with a parallel slice | low | med | Verified at plan time: `V36` is the max on `main`, and no open PR carries a migration (the 11 open PRs are 1 docs PR + 10 dependabot bumps). If a migration lands first, **whoever merges second renumbers** | claude | open |
| R-6 | A request reverted to `PENDING_REQUEST` after a failed PaymentIntent issuance may have a residual intent at Stripe; withdrawing it means no accept retry ever re-adopts that intent | low | low | **Accepted, pre-existing, inert** — an unregistered intent has no `payment` row, and webhooks correlate via that table, so it can never confirm a booking (invariant #8). Already tracked as #98's deferred "orphan-PI reconciliation note"; not new scope here | claude | open |
| R-7 | FE deployed before BE (or vice versa) renders an unknown `WITHDRAWN` status badly | low | low | `metaFor` already falls back to `humanizeStatus` + a neutral chip + the conservative `Amount` label — `WITHDRAWN` degrades to "Withdrawn", so skew is benign in both directions | claude | open |

## Open questions / Assumptions

- **Assumption:** the withdraw is **not** deadline-guarded (an overdue-but-unswept request may still
  be withdrawn), mirroring decline's documented leniency rather than expire's `<= now` guard —
  *Owner:* claude · *Resolves by:* phase 1 (AC-5 encodes it).

### Resolved

- **Open question:** terminal status — reuse `CANCELLED` (as the issue body proposed) or add
  `WITHDRAWN`? — *Resolved (user, 2026-07-31): add `WITHDRAWN`.* Symmetric with `DECLINED`/`EXPIRED`,
  and keeps `CANCELLED` meaning "a confirmed booking was cancelled". Costs V37 + the enum + one FE
  label/chip/contrast row.
- **Open question:** notify the venue that a pending request vanished? — *Resolved (user,
  2026-07-31): no.* The existing `REQUEST_NOT_PENDING` stale-queue mapping is sufficient; AC-13 pins
  it rather than adding code.
- **Open question:** reuse `CancelBookingService` or add a leg to `RequestReleaseService`? —
  *Resolved from the code (issue starter brief, re-verified this session):* the leg. Cancel would
  publish `BookingCancelled` to three subscribers, one of which mails the guest.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** online instant booking (claim), staff
  tap-to-mark (claim), Request-to-Book pending hold (claim), cancellation release, abandoned-payment
  sweep release, request **decline** release, request **expiry** release, admin weather-refund
  release — **and, new in this slice, the request withdraw release.**
- **Uniqueness guarantee:** unchanged — the `UNIQUE(set_id, booking_date)` row is the single source
  of truth; this slice only ever **releases**, never claims, so it cannot create a double-sell. The
  failure mode it *can* create is the opposite one (releasing a hold that is still owned), which is
  what the guard below prevents.
- **Concurrency strategy:** a single guarded statement —
  `UPDATE booking SET status = 'WITHDRAWN' WHERE code = :code AND status = 'PENDING_REQUEST'
  RETURNING set_id, booking_date` — inside the existing `@Transactional RequestReleaseService`, with
  `availability.release(...)` called **only** on a returned row, in the same transaction. The guard
  is on `status`, exactly like decline's; against expire's `request_expires_at <= now` guard the two
  are not disjoint by predicate (both can match an overdue row) but they are made disjoint by the
  **row lock** the first `UPDATE` takes: the loser re-evaluates its `WHERE` after the winner commits,
  matches 0 rows, returns empty, and releases nothing. That is the same exactly-once argument
  decline and the sweep already rely on.
- **Pool rule (invariant #3):** untouched — no set is claimed here.
- **Cutoff rule (invariant #4):** untouched — releasing a hold before the cutoff simply returns the
  set to the pool for the remaining booking window; releasing after it leaves the set unbookable
  online anyway, which is correct.
- **Pinning test:** `ConcurrentRequestTerminationIT.withdrawAndExpiryReleaseExactlyOnce` — two
  terminal legs racing the same pending row; exactly one transitions and exactly one release lands.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the booking lifecycle and its terminal transitions — `WITHDRAWN` is a lifecycle state beside `DECLINED`/`EXPIRED` |
| M-2 | `availability` | existing | `SetAvailability` | The only writer of `availability(set_id, booking_date)`; consulted via its `api/` port, unchanged |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability.api` | `AvailabilityClaim#release(SetId, LocalDate)` | — | `booking` (existing grant, existing call site pattern) |

**No new published surface.** `WithdrawRequest`/`WithdrawOutcome` are **module-internal** (in
`booking/application/request/`, called only by `booking`'s own `adapter/in` controller), so there is
no `api/` addition, no `allowedDependencies` edit, and no `ModularityTests` grant change.

**Domain events (id-based payloads, invariant #11)**

**None — deliberately.** No event is published by this slice; see Architecture and Non-goals. That
also means **no Flyway `event_type` rewrite** for the Event Publication Registry (nothing moved or
renamed).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The `PENDING_REQUEST → WITHDRAWN` transition + its guard | `booking` | `booking` Job: owns booking lifecycle and the request accept/decline/expiry terminal legs. Not on any other module's Job list |
| Deciding a withdraw is permitted (status predicate, deadline leniency) | `booking` | `booking` Job: lifecycle policy. Explicitly **not** `availability`, whose Not-My-Job is knowing *why* a set is held — it records **that** it is held |
| Releasing the `(set, date)` hold | `availability` | `availability` Job: sole writer of that row. `booking` only **asks**, via `AvailabilityClaim#release` |
| The `withdrawable` read-model flag | `booking` | Same module as `cancellable`; a projection of `booking`'s own lifecycle policy onto the code-gated view |
| Anonymous reachability + throttling of the new path | root (composition root) | `SecurityConfig`/`RateLimitFilter` are platform-edge concerns (RV-BE-11) — the module never sees them |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves.** Payment-request-on-accept means a `PENDING_REQUEST` booking has **no**
PaymentIntent, so there is nothing to refund and no `refund_minor` to stamp; nothing accrued to the
payout ledger either (accrual is driven by `BookingConfirmed`, which never fired). This is *why* the
slice can skip `BookingCancelled` entirely rather than publishing it with `refundMinor = 0`. The one
payment-adjacent residual — a stray intent from a failed accept that was later withdrawn — is R-6:
pre-existing, inert, out of scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/booking-status.ts` | existing | vocabulary module | — | — |
| FE-2 | `shared/_glass.scss` (`status-chip` mixin) | existing | style mixin | — | — |
| FE-3 | `booking/booking.model.ts` | existing | types | — | — |
| FE-4 | `booking/booking.service.ts` | existing | `@Service` | signals | — |
| FE-5 | `booking/booking-view.ts` | existing | standalone component | signals (`withdrawing`, `confirmingWithdraw`, `withdrawn`) | — (button + confirm step, no form) |

**Standards:** standalone components, `inject()`, `@if`/`@switch`, `input()`/`output()` signal APIs,
no `ngClass`/`ngStyle`, host bindings in the `host` object. The withdraw control mirrors the existing
**cancel confirm-step pattern** in the same component (start → confirm/keep → acting → result
announced via the existing `role="status" aria-live="polite"` region) rather than inventing a second
interaction idiom.

## FE↔BE contract

- **New endpoint:** `POST /api/bookings/{code}/withdraw` — no request body (the code in the path is
  the bearer credential and the only authorization). `200` → `{ code, status: "WITHDRAWN" }`;
  `404 NO_SUCH_BOOKING`; `409 REQUEST_NOT_PENDING`. Errors are RFC-7807 `ProblemDetail` via
  `ApiProblem`, with `instance` overridden to the collection path so the code never leaks.
- **Changed response:** `GET /api/bookings/{code}` gains `withdrawable: boolean` beside the existing
  `cancellable`.
- **Changed vocabulary:** `BookingStatus` gains `WITHDRAWN` on both sides.
- **Client typing:** hand-written typed service (`booking.service.ts` + `booking.model.ts`), no
  `as any`.
- **Money/date on the wire:** unchanged — this endpoint carries neither.

## Execution status

**Stage pointer:** `implement — phase 3 (the withdrawable read-model flag)`

**Next action:** Write `ViewBookingServiceTest.pendingRequestIsWithdrawableButNotCancellable` red,
then add the separate `withdrawable` predicate (never a widening of `cancellable` — R-4).

**Draft PR:** #476 (opened on the plan commit so every push is CI-gated).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `WITHDRAWN` status + V37 migration | ✅ | see below |
| 1 — the withdraw leg (port, service, persistence) | ✅ | see below |
| 2 — HTTP edge + security + rate limit | ✅ | see below |
| 3 — `withdrawable` read-model flag | | |
| 4 — FE status vocabulary + chip | | |
| 5 — FE withdraw control | | |
| 6 — e2e + docs close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend — create**

- `platform/src/main/resources/db/migration/V37__booking_withdrawn_status.sql` — widen
  `booking_status_check`.
- `platform/src/main/java/ai/riviera/platform/booking/application/request/WithdrawRequest.java` —
  the inbound port.
- `platform/src/main/java/ai/riviera/platform/booking/application/request/WithdrawOutcome.java` —
  the sealed outcome.
- `platform/src/main/java/ai/riviera/platform/booking/application/request/WithdrawRequestService.java`
  — the use case (package-private `@Service`).
- `platform/src/test/java/ai/riviera/platform/booking/application/request/WithdrawRequestServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/WithdrawRequestIT.java`
- `platform/src/test/java/ai/riviera/platform/booking/ConcurrentRequestTerminationIT.java`

**Backend — modify**

- `booking/domain/BookingStatus.java` — add `WITHDRAWN` + doc the leg.
- `booking/application/Bookings.java` — add `withdrawPendingRequest(String code)`.
- `booking/adapter/out/JdbcBookings.java` — the guarded `UPDATE … RETURNING`.
- `booking/application/request/RequestReleaseService.java` — the third leg.
- `booking/application/view/BookingDetail.java` + `ViewBookingService.java` — `withdrawable`.
- `booking/adapter/in/BookingDetailView.java` — carry `withdrawable`.
- `booking/adapter/in/BookingController.java` — the withdraw endpoint + `WithdrawnView`.
- `SecurityConfig.java` — CSRF-ignore + permitAll for the withdraw path.
- `RateLimitFilter.java` — `WITHDRAW_TEMPLATE` in `targetOf`.

**Frontend — modify**

- `shared/booking-status.ts` — the `WITHDRAWN` union member + `STATUS_META` row.
- `shared/_glass.scss` — `.chip--withdrawn { color: #5c5470; background: #eeecf4; … }`.
- `shared/booking-status.spec.ts`, `shared/booking-status.contrast.spec.ts` — the new rows.
- `booking/booking.model.ts` — `withdrawable` on `BookingDetail`.
- `booking/booking.service.ts` — `withdraw(code)`.
- `booking/booking-view.ts` — fill the reserved slot with the control.
- `booking/my-bookings.ts` + `my-bookings.spec.ts` — the `subLineOf` sub-label row (found by the phase-0 generalization audit, not in the original plan).
- `booking/booking-view.spec.ts` — **flip** the `toBeNull()` assertions at the pending case; add the
  withdraw-flow cases.
- `booking/booking-view.contrast.spec.ts` — the withdrawn panel.
- `frontend/e2e/request-to-book.e2e.ts` — the withdraw case.

**Docs**

- `CONTEXT.md` — glossary entry for *Withdraw*.
- `CLAUDE.md` / `RESPONSIBILITIES.md` — the `booking` row's terminal-leg list (docs-freshness
  counting sweep: this is the 9th `BookingStatus` and the 3rd request terminal).

---

## Phase 0 — `WITHDRAWN` status + V37 migration

**Files:** Create `V37__booking_withdrawn_status.sql` · Modify `booking/domain/BookingStatus.java` ·
Test `BookingMigrationIT` (existing)

- [ ] **Step 1: Write the failing test** — already written. `BookingMigrationIT.everyEnumStatusAccepted`
  iterates `BookingStatus.values()` and asserts the CHECK accepts each. Adding the enum value alone
  makes it red; no new test is needed and none should be invented.

- [ ] **Step 2: Add the enum value, run it, verify it fails** —
  `./gradlew test --tests "*BookingMigrationIT*"` → FAIL:
  `CHECK must accept enum value WITHDRAWN (enum/schema lockstep, invariant #12).`
  *(Requires Docker; without a daemon this IT skips cleanly — then the red is proven in CI on the
  first push. Do not substitute a tautological unit test asserting the enum contains the value.)*

- [ ] **Step 3: Minimal implementation** — V37:

```sql
-- Issue #123: a guest may retract their own pending request. It terminates as WITHDRAWN — its own
-- label beside DECLINED (venue said no) and EXPIRED (nobody answered), so the booking table keeps
-- CANCELLED meaning "a confirmed booking was cancelled". Forward-only; TEXT + CHECK, not a native
-- enum (JDBC-only stack, invariant #1). No new column: WITHDRAWN stamps status alone, exactly as
-- DECLINED/EXPIRED do. Kept in lockstep with BookingStatus by BookingMigrationIT.
ALTER TABLE booking DROP CONSTRAINT booking_status_check;
ALTER TABLE booking ADD CONSTRAINT booking_status_check CHECK (status IN
    ('PENDING_REQUEST', 'AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW',
     'DECLINED', 'EXPIRED', 'WITHDRAWN'));
```

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*BookingMigrationIT*"` → PASS.

- [ ] **Step 5: Generalization-audit pass** — search for every place the status set is enumerated
  (`grep -rn "NO_SHOW" platform/src frontend/src docs`), so the FE union and any doc list are known
  now rather than discovered at review. Record the sites; fix the FE ones in phase 4.

- [ ] **Step 6: Commit** — `git commit -m "Add the WITHDRAWN booking terminal + V37 (#123)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

> **Push + open the draft PR immediately after this commit** — CI fires on `pull_request` only, so
> the branch gets no CI at all until the draft exists (SDLC rule 3 / #417).

---

## Phase 1 — The withdraw leg (port, service, persistence)

**Files:** Create `WithdrawRequest.java`, `WithdrawOutcome.java`, `WithdrawRequestService.java`,
`WithdrawRequestServiceTest.java`, `ConcurrentRequestTerminationIT.java` · Modify `Bookings.java`,
`JdbcBookings.java`, `RequestReleaseService.java`

- [ ] **Step 1: Write the failing test**

```java
@Test
void withdrawsAndReleasesTheHold() {
    bookings.givenPending("ABCD234567", SET_7, JULY_1);

    WithdrawOutcome outcome = service.withdraw("ABCD234567");

    assertThat(outcome).isInstanceOf(WithdrawOutcome.Withdrawn.class);
    assertThat(bookings.statusOf("ABCD234567")).isEqualTo(BookingStatus.WITHDRAWN);
    assertThat(availability.released()).containsExactly(new Release(SET_7, JULY_1));
}

@Test
void rejectsANonPendingBooking() {
    bookings.givenConfirmed("ABCD234567", SET_7, JULY_1);

    assertThat(service.withdraw("ABCD234567")).isEqualTo(WithdrawOutcome.Rejected.NOT_PENDING);
    assertThat(availability.released()).isEmpty();
}

@Test
void rejectsAnUnknownCode() {
    assertThat(service.withdraw("NOSUCH0000")).isEqualTo(WithdrawOutcome.Rejected.NO_SUCH_BOOKING);
    assertThat(availability.released()).isEmpty();
}

@Test
void withdrawsAnOverdueButUnsweptRequest() {
    bookings.givenPending("ABCD234567", SET_7, JULY_1, /* expiresAt */ YESTERDAY);

    assertThat(service.withdraw("ABCD234567")).isInstanceOf(WithdrawOutcome.Withdrawn.class);
}
```

- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*WithdrawRequestServiceTest*"` → FAIL (does not compile: no such type).

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation**

```java
/** The closed set of outcomes of {@link WithdrawRequest#withdraw}. */
public sealed interface WithdrawOutcome {

    /** The request is terminally {@code WITHDRAWN} and the {@code (set, date)} hold released. */
    record Withdrawn() implements WithdrawOutcome {
    }

    enum Rejected implements WithdrawOutcome {
        /** No booking has that code. */
        NO_SUCH_BOOKING,
        /** The booking exists but is not {@code PENDING_REQUEST} (already decided/paid/terminal). */
        NOT_PENDING
    }
}
```

The `Bookings` port gains one method, guarded and code-keyed (no read-then-write, so nothing to race):

```java
/**
 * Withdraw a pending request at the guest's own request (issue #123): the guarded
 * {@code PENDING_REQUEST → WITHDRAWN} transition, keyed on the booking {@code code} (the bearer
 * credential, invariant #7 — knowing it authorizes the act), {@code RETURNING} the {@link ClaimRef}
 * iff it transitioned so the caller releases the soft-hold exactly once (invariant #2). Like
 * {@link #declinePending} and unlike {@link #expirePendingRequest} it is deliberately NOT
 * deadline-guarded: an overdue-but-unswept request may still be withdrawn — the same release, a
 * different terminal label.
 */
Optional<ClaimRef> withdrawPendingRequest(String code);
```

and `RequestReleaseService` gains the third leg beside decline/expire:

```java
@Transactional
public boolean withdraw(String code) {
    return bookings.withdrawPendingRequest(code)
            .map(claim -> {
                availability.release(claim.setId(), claim.bookingDate());
                return true;
            })
            .orElse(false);
}
```

with `WithdrawRequestService` classifying a miss the way `RespondToRequestService` does — the
transition first, the read only to explain a 0-row result.

- [ ] **Step 4: Run it, verify it passes** —
  `./gradlew test --tests "*WithdrawRequestServiceTest*"` → PASS, then
  `./gradlew test --tests "*ConcurrentRequestTerminationIT*"` → PASS (AC-4).

> Scope (end-of-phase regression): broaden to `--tests "*booking*"`.

- [ ] **Step 5: Generalization-audit pass** — the three request terminal legs now share one shape;
  confirm no leg drifted (`RequestReleaseService` should read as three near-identical methods).

- [ ] **Step 6: Commit** — `git commit -m "Add the guest withdraw leg to RequestReleaseService (#123)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — HTTP edge + security + rate limit

**Files:** Modify `BookingController.java`, `SecurityConfig.java`, `RateLimitFilter.java` · Test
`WithdrawRequestIT.java`, `RateLimitFilterTest.java`

- [ ] **Step 1: Write the failing test** — the edge ITs, including the two that exist because this
  slice adds a *path*, not just a handler:

```java
@Test
void withdrawIsReachableAnonymously() throws Exception {
    mvc.perform(post("/api/bookings/{code}/withdraw", pendingCode))
            .andExpect(status().isOk());
}

@Test
void codeNeverLeaksIntoTheProblemBody() throws Exception {
    mvc.perform(post("/api/bookings/{code}/withdraw", "UNKNOWN123"))
            .andExpect(status().isNotFound())
            .andExpect(content().string(not(containsString("UNKNOWN123"))));
}

@Test
void acceptAfterWithdrawIsNotPending() throws Exception {
    withdraw(pendingCode);
    mvc.perform(post("/api/venues/{v}/requests/{id}/accept", venueId, bookingId).with(operator()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"));
}
```

plus, in `RateLimitFilterTest`, the one that keeps the path from being an unthrottled oracle (R-3):

```java
@Test
void withdrawSpendsThePerCodeBudget() {
    exhaustPerCodeBudget("/api/bookings/ABCD234567/withdraw");

    assertThat(statusOf(post("/api/bookings/ABCD234567/withdraw")))
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
}
```

- [ ] **Step 2: Run them, verify they fail** —
  `./gradlew test --tests "*WithdrawRequestIT*" --tests "*RateLimitFilterTest*"` → FAIL
  (`404` from no mapping / no throttling).

- [ ] **Step 3: Minimal implementation** — three registrations, all in this phase so none is
  forgotten:
  1. `BookingController.withdraw(@PathVariable String code)` — exhaustive `switch` over
     `WithdrawOutcome` → `200` / `404 NO_SUCH_BOOKING` / `409 REQUEST_NOT_PENDING`, reusing the
     private `error(...)` helper that pins `instance` to the collection path.
  2. `SecurityConfig` — add `"/api/bookings/*/withdraw"` to `csrf().ignoringRequestMatchers(...)`
     **and** a `.requestMatchers(HttpMethod.POST, "/api/bookings/*/withdraw").permitAll()`, beside
     cancel and with the same rationale comment.
  3. `RateLimitFilter` — `WITHDRAW_TEMPLATE = "/api/bookings/{code}/withdraw"` matched in the POST
     branch of `targetOf`, returning the extracted code (so it draws the per-code bucket, same
     dimension as view/cancel — the same secret is being guessed).

- [ ] **Step 4: Run them, verify they pass** — the two classes above, then
  `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`
  (the structural net, after any backend structure change).

- [ ] **Step 5: Generalization-audit pass** — search `grep -n "cancel" SecurityConfig.java RateLimitFilter.java`
  for every place the cancel path is enumerated; confirm withdraw now appears in **each** of them
  and nowhere else is missing.

- [ ] **Step 6: Commit** — `git commit -m "Expose POST /api/bookings/{code}/withdraw at the edge (#123)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — The `withdrawable` read-model flag

**Files:** Modify `BookingDetail.java`, `ViewBookingService.java`, `BookingDetailView.java` · Test
`ViewBookingServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
@Test
void pendingRequestIsWithdrawableButNotCancellable() {
    BookingDetail detail = view.byCode(PENDING_CODE).orElseThrow();

    assertThat(detail.withdrawable()).isTrue();
    assertThat(detail.cancellable()).isFalse();
}

@Test
void confirmedIsCancellableButNotWithdrawable() {
    BookingDetail detail = view.byCode(CONFIRMED_CODE).orElseThrow();

    assertThat(detail.withdrawable()).isFalse();
    assertThat(detail.cancellable()).isTrue();
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ViewBookingServiceTest*"` →
  FAIL (no such accessor).

- [ ] **Step 3: Minimal implementation** — a **separate** predicate, never a widening of
  `cancellable` (R-4, and the standing comment in this very class):
  `boolean withdrawable = b.status() == BookingStatus.PENDING_REQUEST;`

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*ViewBooking*"` → PASS.

- [ ] **Step 5: Generalization-audit pass** — N/A (no bug fixed, no new pattern; the pattern is the
  existing `cancellable` one).

- [ ] **Step 6: Commit** — `git commit -m "Report withdrawable on the code-gated booking view (#123)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — FE status vocabulary + chip

**Files:** Modify `shared/booking-status.ts`, `shared/_glass.scss` · Test
`shared/booking-status.spec.ts`, `shared/booking-status.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — add the rows to both existing tables:

```ts
// booking-status.spec.ts — the STATUS_META table case
['WITHDRAWN', 'Withdrawn', 'chip--withdrawn', 'Amount'],

// booking-status.contrast.spec.ts — the CHIPS table
['WITHDRAWN', '#5c5470', '#eeecf4'],
```

- [ ] **Step 2: Run them, verify they fail** — `npm test -- booking-status` → FAIL (no `WITHDRAWN`
  key; the `Record<BookingStatus, StatusMeta>` type also fails the build until the row exists, which
  is the intended compile-time guard).

- [ ] **Step 3: Minimal implementation** — the union member, the `STATUS_META` row
  (`amount: 'Amount'` — **never** `'Paid'`; no money moved), and the chip in the `status-chip`
  mixin: `.chip--withdrawn { color: #5c5470; background: #eeecf4; border: 1px solid #dcd8e6; }`
  (ink-on-fill contrast 6.07:1, above the 4.5 AA minimum, and visually distinct from both `expired`
  slate and `declined` terracotta).

- [ ] **Step 4: Run them, verify they pass** — `npm test -- booking-status` → PASS;
  `npm run test:a11y` → PASS.

- [ ] **Step 5: Generalization-audit pass** — the phase-0 audit listed every status enumeration;
  confirm each FE site is now covered (`STATUS_META`, the spec's exhaustive list, the contrast
  table, and `booking-view.spec.ts`'s chip table).

- [ ] **Step 6: Commit** — `git commit -m "Add the Withdrawn status chip to the shared vocabulary (#123)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — FE withdraw control

**Files:** Modify `booking/booking.model.ts`, `booking/booking.service.ts`, `booking/booking-view.ts`
· Test `booking/booking-view.spec.ts`, `booking/booking-view.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — **flip** the reserved-slot assertions and add the flow:

```ts
// booking-view.spec.ts — the PENDING_REQUEST case: was toBeNull(), now present.
expect(host.querySelector('[data-testid="withdraw-request"]')).not.toBeNull();

it('withdraws a pending request after confirmation and flips the chip', async () => {
  const fixture = await render(stubService({ detail: { ...DETAIL, status: 'PENDING_REQUEST',
    cancellable: false, withdrawable: true, requestExpiresAt: '2026-11-30T16:00:00Z' } }));
  const host = fixture.nativeElement as HTMLElement;

  click(host, '[data-testid="withdraw-request"]');
  click(host, '[data-testid="confirm-withdraw"]');
  await fixture.whenStable();

  expect(withdrawCalls).toEqual(['ABCD234567']);
  expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim())
    .toBe('Withdrawn');
  await expectNoAxeViolations(host);
});
```

- [ ] **Step 2: Run them, verify they fail** — `npm test -- booking-view` → FAIL (no control).

- [ ] **Step 3: Minimal implementation** — replace the reserved-slot comment in the
  `@case ('PENDING_REQUEST')` panel with the control, mirroring the cancel confirm-step idiom
  already in this component (start → confirm/keep → acting label → result announced through the
  existing `role="status" aria-live="polite"` region). `withdrawable` gates it, not a raw status
  check in the template, so the server owns the rule.

- [ ] **Step 4: Run them, verify they pass** — `npm test -- booking-view` → PASS;
  `npm run lint` → clean.

- [ ] **Step 5: Generalization-audit pass** — the component now has two confirm-step flows (cancel,
  withdraw); check whether they should share a helper or stay separate, and record the decision
  rather than leaving it implicit.

- [ ] **Step 6: Commit** — `git commit -m "Let a guest withdraw a pending request from the booking view (#123)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 6 — e2e + docs close-out

**Files:** Modify `frontend/e2e/request-to-book.e2e.ts`, `CONTEXT.md`, `CLAUDE.md`,
`RESPONSIBILITIES.md`

- [ ] **Step 1: Write the failing test** — a mocked-suite case (CI-safe suite; `page.route` for the
  view + withdraw calls, `expectNoSeriousAxeViolations` from `e2e/support/axe.ts`) driving
  open → Withdraw → confirm → withdrawn state.

- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- request-to-book` → FAIL.

- [ ] **Step 3: Minimal implementation** — none beyond phase 5; the spec should pass once wired.
  If it does not, the gap is real behavior, not test scaffolding.

- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y` → PASS.

- [ ] **Step 5: Generalization-audit pass** — run `riviera-docs-freshness` over the PR range. The
  counting-sweep trigger is explicit here: this slice makes the **9th** `BookingStatus` and the
  **3rd** request terminal leg, so any doc phrasing them as "the two terminal legs" or listing the
  lifecycle is stale *outside* the diff.

- [ ] **Step 6: Commit** — `git commit -m "Cover the withdraw flow e2e and refresh the substrate docs (#123)"`

- [ ] **Step 7: Finalize plan-doc execution status** — stage pointer DONE, every phase row ✅,
  Open Questions empty, risk rows closed, `merged via PR #NN` (the PR number, never a merge SHA).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-31 | phase 2 — a 4th public booking endpoint | every site enumerating the cancel path or counting the booking endpoints | `grep -rn "/cancel" platform/src` | Registrations: `SecurityConfig` (CSRF-ignore + permitAll), `RateLimitFilter.targetOf`, **`EndpointRoleGateCoverageTest.DECLARED_REACHABLE`** — a fourth registration the plan's risk register never named, caught by the test failing rather than by the grep. Prose that counts: `RateLimitFilter` javadoc ("three public endpoints"), `RateLimitProperties` `@param` ("the two code-keyed endpoints"), `application.properties` §rate-limit, `SecurityConfig` CSRF comment, `CsrfProtectionIT` javadoc | All updated. Added `CsrfProtectionIT.guestWithdrawStaysTokenless` beside the cancel pin, and `RateLimitFilterTest.withdrawAndViewShareOneCodeBudget` to pin that the three code-keyed paths share **one** budget per code |
| 2026-07-31 | phase 0 — a 9th `BookingStatus` | every site that enumerates the status set | `grep -rn "NO_SHOW"` (BE + migrations) and `grep -rn "NO_SHOW\|DECLINED\|EXPIRED"` (FE + docs) | BE: `BookingStatus.java`, `V5`, `V19` (all handled by V37). FE: `shared/booking-status.ts` (union + `STATUS_META`), `shared/booking-status.spec.ts`, `shared/booking-status.contrast.spec.ts`, `shared/_glass.scss`, `booking/booking-view.spec.ts` (chip table), **`booking/my-bookings.ts` `subLineOf` switch** + `my-bookings.spec.ts`. Docs: `docs/architecture/domain-model.md` | `my-bookings.ts` was **not** in the plan's file list — the audit found it. Added to phase 4; the rest were already planned. Docs handled in phase 6 |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1, AC-2, AC-3, AC-5:** `./gradlew test --tests "*WithdrawRequestServiceTest*"` → PASS.
- [ ] **AC-1 (integration), AC-6, AC-13:** `./gradlew test --tests "*WithdrawRequestIT*"` → PASS.
- [ ] **AC-4:** `./gradlew test --tests "*ConcurrentRequestTerminationIT*"` → PASS.
- [ ] **AC-7:** `./gradlew test --tests "*RateLimitFilterTest*"` → PASS.
- [ ] **AC-8:** `./gradlew test --tests "*BookingMigrationIT*"` → PASS.
- [ ] **AC-9:** `./gradlew test --tests "*ViewBookingServiceTest*"` → PASS.
- [ ] **AC-10:** `npm test -- booking-view` → PASS.
- [ ] **AC-11:** `npm test -- booking-status && npm run test:a11y` → PASS.
- [ ] **AC-12:** `npm run test:e2e:a11y` → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new events (invariant #11).
- [ ] **Payment/payout** section filled (N/A justified — no PaymentIntent exists pre-accept).
- [ ] Refund policy untouched (invariant #10) — no refund path added.
- [ ] Timezone: unchanged; no new date arithmetic (invariant #6).
- [ ] Booking codes unguessable and never logged or echoed in a problem body (invariant #7).
- [ ] Flyway migration present (V37) + constraint test (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
