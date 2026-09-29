# Admin venue day refund (slice 2/2 of #1272) Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A platform admin looks a guest's bookings up by email in the admin console, picks a booking
and a day, and refunds that day for reason `VENUE` through slice 1's use case, audited, at any venue.

**Architecture:** One use case, a second gate (ADR-0027 decision 1): `RefundVenueDay` gains an admin
entry on the **booking id** with no ownership assert, the edge's ADMIN role gate and `AdminAuditFilter`
being the whole authorization and record. The lookup is a new `booking` driving port answering ids,
venue, span and per-day state from the guest's canonical email (`customer::api`), never a code (#7).
Nothing in the money path changes.

**Source of intent:** #1276 (parent #1272, ADR-0027 decision 1; slice 1 = #1275 / PR #1277).

**Branch:** `claude/sdlc-1276-ano1x9` (the cloud session's designated branch).

## Acceptance criteria

- [ ] **AC-1:** Given a confirmed 5-day stay at a venue the admin does not own, when the admin refunds
  day 3 by booking id, then the outcome, the `VENUE` + released + actor stamps, the freed claim and
  `BookingDayRefunded` are slice 1's, with the admin's operator id as the actor and no ownership read.
  *Seam:* `RefundVenueDay#refundDayAsAdmin` · *Pinned by:* `VenueDayRefundServiceTest.anAdminRefundsADayWithoutOwnership`,
  `VenueDayRefundServiceIT.anAdminRefundsAStaysDayAtAVenueTheyDoNotOwn`
- [ ] **AC-2:** Given the admin endpoints are mapped, when the role-gate sweep runs, then both are
  discovered and refuse a plain operator and a customer with `403`, with no anchor added by hand;
  anonymous is `401` and a plain operator `403` on the real chain. *Seam:* `POST /api/admin/bookings/**`
  · *Pinned by:* `AdminSurfaceRoleGateTest` (discovery), `AdminDayRefundControllerIT.aPlainOperatorIsForbiddenAndAnonymousUnauthorized`
- [ ] **AC-3:** Given an admin refunds a day with an `X-Audit-Reason`, when the call completes, then exactly
  one `admin_audit_record` row holds actor, `POST`, the path with the booking id and date, the status and
  the sanitized grounds, and neither the path nor the body carries the booking code. *Seam:* the audit
  log over the admin route · *Pinned by:* `AdminDayRefundControllerIT.everyCallLeavesOneAuditRowNamingTheIdNeverTheCode`
- [ ] **AC-4:** Given a guest with bookings, when the admin looks the address up, then each booking is
  answered as id, venue name, span, status and per-day state (`OPEN` / `ATTENDED` / `REFUNDED` /
  `RELEASED`), never a code; an unknown address and a known one with no bookings answer the same empty
  list. *Seam:* `GuestDayRefundLookup#forEmail` · *Pinned by:* `GuestDayRefundLookupServiceTest`,
  `AdminDayRefundControllerIT.theLookupAnswersIdsVenueSpanAndDayStateNeverCodes`
- [ ] **AC-5:** Given an attended day, an already refunded day, and a booking that did not happen, when
  the admin refunds, then the answers are `DAY_ATTENDED`, `DAY_ALREADY_REFUNDED` and
  `BOOKING_NOT_FOUND`, exactly as slice 1's. *Seam:* the admin route · *Pinned by:*
  `AdminDayRefundControllerIT.refusalsAreSliceOnes`
- [ ] **AC-6:** Given the Refunds tab, when the admin looks a guest up, picks an eligible day and confirms
  with optional grounds, then the day-refund call carries the grounds header and the outcome is shown;
  Vitest covers lookup, day choice, two-step confirm and every outcome; mocked Playwright covers the flow.
  *Seam:* `AdminDayRefund` component + `AdminDayRefundService` · *Pinned by:* `admin-day-refund.spec.ts`,
  `admin-day-refund.e2e.ts`
- [ ] **AC-7:** `RESPONSIBILITIES.md` § *Platform edge* and § `booking` name the admin action and lookup;
  the structural net is green.

## Non-goals

- Refunding an attended day; grounds shown to the guest; a whole-date closure; changing the weather refund.
- A new admin console tab: the action joins the Refunds tab beside the outbox lever.

## Risks

- **R-1 (#7):** the audited path must never carry the code → the action is keyed on the booking id and
  the date; the lookup body carries the email, never in a URL; pinned by AC-3.
- **R-2 (#13 exemption):** an admin acting without ownership must be ADMIN-gated at the edge → explicit
  `hasRole(ADMIN)` matchers; the discovery sweep fails a missing one (AC-2).
- **R-3 (#2, #10):** the money and release legs are slice 1's, reached through the same private methods;
  the only new read is `Bookings#findRefundableById`, the same row shape, so idempotency and the lost-race
  classification are unchanged (`VenueDayRefundServiceIT`).
- **R-4 (non-enumeration):** the lookup must not be an address oracle → `CustomerLookup#findByEmail`
  then by id, empty for unknown and known-without-bookings alike (AC-4).

## Open questions

### Resolved

- Where in the console? → the Refunds tab (`/admin/refunds`), a card under the outbox lever; the tab's
  hint gains it. ← confirm?
- Endpoint shape → `POST /api/admin/bookings/lookup` `{email}`; `POST /api/admin/bookings/{id}/days/{date}/refund`,
  the date in the path so the audit row names the day. ← confirm?
- Grounds → the console's `ConfirmWithReason` panel; the reason rides `X-Audit-Reason` as the Privacy tab's does.
- Next Flyway: none needed (no schema change); `V72` stays free.

## Availability & concurrency

- **Write paths to `set_availability`:** slice 1's `availability.release(set, day)` in the day leg, unchanged.
- **Concurrency:** unchanged — the guarded `UPDATE … RETURNING` on `booking_day` under the booking row lock.
- **Pinning test:** `VenueDayRefundServiceIT` (slice 1's cases still green; AC-1 adds the admin entry).

## Modulith

- `booking.application.refund.RefundVenueDay#refundDayAsAdmin(OperatorId, BookingId, LocalDate)` — internal
  port, same outcome type; consumer: `adapter/in/AdminDayRefundController`.
- `booking.application.refund.GuestDayRefundLookup` (driving) + `GuestBookingDays` (driven, in
  `application/refund`, implemented by `adapter/out/JdbcGuestBookingDays`); `GuestDayRefundLookupService`
  composes `customer::api.CustomerLookup#findByEmail` and `venue::api.SetBookingFacts#setBookingInfos`.
  Owner check: the lookup is `booking`'s (its own rows and day stamps); the address stops at `customer::api`.
- `Bookings#findRefundableById(long, LocalDate)`: the by-code read's twin for the admin path.
- Root: two `SecurityConfig` matchers; `EndpointProbes` learns the `date` path variable.

## Payment & payout

Unchanged: the same `BookingDayRefunded`/`BookingCancelled` events, the same refund port keys, the same
`DAY_REVERSAL` with reason `VENUE` (slice 1's tests stand).

## FE↔BE contract

- `POST /api/admin/bookings/lookup` `{email}` → `{bookings:[{bookingId, venueName, firstDate, lastDate,
  status, refundable, days:[{date, state}]}]}`.
- `POST /api/admin/bookings/{bookingId}/days/{date}/refund` (+ optional `X-Audit-Reason`) → slice 1's
  `{kind, serviceDate, refundMinor, currency, released}`; errors: `DAY_ATTENDED`, `DAY_ALREADY_REFUNDED`
  (409), `BOOKING_NOT_FOUND` (404), RFC-7807.

## Phases

- **Phase 0 — admin entry on the use case:** red `VenueDayRefundServiceTest.anAdminRefundsADayWithoutOwnership`,
  then `VenueDayRefundServiceIT` against Postgres.
- **Phase 1 — the lookup port and service:** red `GuestDayRefundLookupServiceTest`, then the JDBC adapter
  under `AdminDayRefundControllerIT` (lookup case).
- **Phase 2 — the admin controller and gate:** matchers, `EndpointProbes`, `AdminDayRefundControllerIT`
  (gate, audit, refusals), `AdminSurfaceRoleGateTest` green.
- **Phase 3 — console:** model, service, `AdminDayRefund` card on the Refunds tab, Vitest + a11y spec.
- **Phase 4 — mocked Playwright** `admin-day-refund.e2e.ts`.
- **Phase 5 — docs:** `RESPONSIBILITIES.md`, `CONTEXT.md` if a term is new; delete this plan.

## Execution status

**Stage pointer:** `review`

**Next action:** delete this plan; ready for review; /code-review + Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — admin entry | ✅ | d59656d |
| 1 — lookup | ✅ | d59656d |
| 2 — controller + gate | ✅ | 2e526de |
| 3 — console | ✅ | a55c911 |
| 4 — e2e | ✅ | (this commit) |
| 5 — docs | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
