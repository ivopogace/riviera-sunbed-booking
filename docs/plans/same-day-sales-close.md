# Same-day sales close (per-venue, on the day itself) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tourist can pick **today** on the homepage, book and pay a set at an Instant Book
venue until that venue's **sales close** time on the service day itself (a new per-venue
`00:01`/`16:00`/`23:59` setting, default `16:00`, `Europe/Tirane`), and is refused
`422 BOOKING_CLOSED` at/after it — while the evening-before cutoff keeps only its
free-cancellation role and same-day Request-to-Book stays gated off until the deadlines slice.

**Architecture:** The single most significant decision is that **the sales window moves but its
owner does not**: `BookingCutoff` (booking's one civil-day authority, "one rule, three jobs")
gains `salesCloseAt(salesClose, date)` and re-implements `isBookable` on it, while the
evening-before arithmetic survives **only** as the cancellation boundary — renamed
`freeCancellationEndsAt` so no future reader mistakes it for the sales close (that mistake is
this slice's highest-stakes trap: redefining `closesAt` in place would silently stretch the FREE
cancellation window into the service day and move the pay-credentials fence with it). The new
per-venue time rides the existing `venue::api` seam (`SetBookingFacts` → `SetBookingInfo`), so
`booking` still never reads venue tables. Second decision, forced by the grill (see Risk R-2):
the two service-day-open pay fences (#576) would kill a same-day Instant booking — the abandoned
sweep's `booking_date` arm on its next 5-minute tick and the code-gated view's `clientSecret`
fence from birth — so both gain a **born-before-its-own-service-day** predicate: an
advance-born `AWAITING_PAYMENT` booking is still fenced at day-open exactly as #576 shipped it,
while a same-day-born one is governed by the 15-minute instant TTL it was born under. The
deadlines slice (#792) replaces this bridge with real pay-deadline persistence.

**Persistence:** JDBC only (invariant #1). One migration: `V44__venue_sales_close.sql` —
`venue.sales_close TIME NOT NULL DEFAULT '16:00'` + a three-value CHECK; the DEFAULT backfills
every existing venue to `16:00` (the maintainer-settled decision, epic #790 thread, 2026-08-26).
The abandoned sweep's SQL gains one predicate; no other schema change.

**Source of intent:** issue #791 (tracer bullet of epic #790); design spec
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` §13 (the committed
amendment).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
#576 service-day pay fences break same-day **Instant** bookings too, not just Request-to-Book,
pulling the two bridge fixes of Phase 4 into scope; confirmed V44 free on `main` and unclaimed by
any open PR — all 18 are Dependabot bumps; confirmed the flagged backfill decision settled to
`16:00` on the epic thread; no prior sibling slice to close-out-check) · `riviera-plan-doc`
(this template — the Availability section forced the sweep-arm analysis instead of trusting the
issue's "temporary gate" framing; the Behavior-parity ledger enumerates every job the retired
evening-before fence was doing) · `tdd` (each phase is red-green; the window arithmetic and both
bridge predicates are unit-pinned under a fixed `Clock` before any wiring) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(**due at merge close-out — not yet run** (plan stage); invariant #4's rewording, `CONTEXT.md`'s
Cutoff split, and `RESPONSIBILITIES.md` §`booking`/§`venue` are in-slice Phase 8 work, and the
close-out sweep re-checks them plus the stale-Javadoc census in the File structure section) ·
`grilling` (the intake interrogation itself — its factual questions were answered from code via
two Explore passes; the one product fork, the backfill default, was already settled by the
maintainer) · `postgres` (CHECK-over-ENUM for the three-value constraint, mirroring V43's
application-mirrors-CHECK shape; `TIME` matches the existing `booking_cutoff` precedent — the
schema's one other `TIME` column; DEFAULT-backfill per V22's argument; **declined** any new
index — no read path filters on `sales_close`) · `riviera-modulith` (the change stays inside
existing published surfaces: `SetBookingInfo` (vocabulary) grows a component carried by
`SetBookingFacts` (api), never `VenueCatalog` — `VenueApiRoleSplitTests` pins that; `booking`'s
`allowedDependencies` already grant `venue::api` + `venue::vocabulary`, so **no grant change**;
no new event, no new port) · `riviera-java-conventions` (`LocalTime` on the port not a string;
the refusal stays the typed `BookingOutcome.Rejected.BOOKING_CLOSED` — no exception, wire
contract §6b untouched; the `closesAt` → `freeCancellationEndsAt` rename keeps the name
truthful after the demotion; `SALES_CLOSE_*` named constants mirror the CHECK tokens per §6a) ·
`codebase-design` (the deletion test killed a would-be `SalesWindow` service — `BookingCutoff`
is already the deep seam and gains one projection; the venue side adds **no** application
service, the column rides the existing read paths) · `domain-modeling` (**Sales close** enters
the ubiquitous language; **Cutoff** is demoted to its cancellation role — CONTEXT.md entries in
Phase 8; **no new ADR**: the decision is committed as design-spec §13 and ADR-0005 is untouched)
· `riviera-stripe-payments` (confirmed zero `payment`/`payout` code in scope: the confirm path
stays deliberately unfenced, the sweep's `CancelPaymentPort` leg is untouched, accrual and
weather refund are date-agnostic — Phase 5 pins that instead of changing it) ·
`riviera-frontend` (every touched FE file stays in its stratum — the floor stays in
`shared/booking-date.ts`, copy in `shared/cutoff-note.ts`, refusal copy in
`booking/booking-dialog.ts`; **no new cross-feature edge** — RV-FE-8's frozen five stay five) ·
`riviera-tailwind` (checked post-plan: the copy-only edits change no styling, but the new
sentence must keep the clock-time an **NBSP-joined reviewable entity** — `4&nbsp;PM`, the
`6&nbsp;PM` / #734 F-7 precedent, with the spec's NBSP pin updated; `data-testid="cutoff-note"`,
the host classes, and the `clock-icon` glyph (+ its ICON-4 e2e size pin) stay; migrate-on-touch
cannot trigger — no SCSS remains in-tree; no new/resized controls, so the touch-target floor is
untouched) · `angular-developer` (signal-based `minDate` stays the pattern; no new form
machinery — the native `min` + clamp shape is kept, compliant with v22's "Signal Forms for
**new** forms" since none is added) · angular-cli MCP (`get_best_practices` on the v22
workspace + `search_documentation`: `linkedSignal` and `input.required` — the calendar's
existing mechanisms the floor change rides — confirmed current v22 APIs; the guide's "do not
assume globals like `new Date()` in templates" pins that the dialog's today-branch computes in
class code, never the template) · `playwright-cli` (the two new journeys go in the
CI-safe mocked suite with `page.route` + `page.clock.setFixedTime` per the
`availability-calendar.e2e.ts` precedent; suite placement per RV-FE-E2E).

**Branch:** `claude/sdlc-791-planning-s3p4ha` — the cloud session's designated remote branch
stands in for `feature/same-day-sales-close` (`riviera-sdlc` § Remote/cloud session addendum).
An implement session with a different designated branch records its substitution here.

---

## Acceptance criteria (testable)

> Written at the application boundary (inner hexagon) in domain terms; adapter-level pins named
> where the AC is about the wire or the UI.

- [ ] **AC-1 (migration + backfill):** Given a database migrated through V43 with existing venue
  rows, when V44 applies, then every existing venue reads `sales_close = 16:00` and a direct SQL
  write of any value outside `{00:01, 16:00, 23:59}` is rejected by
  `venue_sales_close_check`. *Pinned by:* `SalesCloseMigrationIT.backfillsExistingVenuesTo1600`,
  `SalesCloseMigrationIT.checkRejectsAnyOtherTime`.
- [ ] **AC-2 (venue surface, read-only):** Given a venue created via `POST /api/venues` with no
  sales-close field, when the owner reads `GET /api/venues/{id}/profile`, then the response
  carries `salesClose: "16:00"`; the PATCH request record carries **no** sales-close field and
  the full-replace PATCH leaves `sales_close` unchanged. *Pinned by:*
  `VenueAdminControllerIT.createDefaultsSalesCloseAndProfileReturnsIt`,
  `VenueAdminControllerIT.patchCannotReachSalesClose`.
- [ ] **AC-3 (the window rule):** Given a fixed clock, when `BookingCutoff.isBookable(salesClose, D)`
  is asked, then: at `D-1` 20:00 with close `16:00` it answers **true** (the retired
  evening-before fence, pinned explicitly); at `D` 15:59 true; at `D` 16:00 false
  (strictly-before, matching the old boundary convention); with close `00:01` any instant from
  `D` 00:01 answers false (the opt-out reproduces no-same-day); with close `23:59` `D` 23:58
  answers true; any past `D` false. *Pinned by:* `BookingCutoffTest.bookableTheEveningBefore`,
  `.sameDayBookableUntilSalesClose`, `.closedAtSalesClose`, `.optOutVenueSellsNothingOnTheDay`,
  `.lateCloseSellsToElevenFiftyNine`, `.closedForPastDate`.
- [ ] **AC-4 (same-day Instant reserve):** Given an Instant Book venue with close `16:00` and a
  fixed clock before it, when a tourist reserves an online-pool set for today, then the claim is
  made and the outcome is `AwaitingPayment` with a `clientSecret`; at/after the close the outcome
  is `Rejected(BOOKING_CLOSED)` and the wire shape is the existing
  `422 {"code":"BOOKING_CLOSED"}`. *Pinned by:*
  `CreateBookingServiceTest.sameDayInstantReserveBeforeClose`,
  `.sameDayInstantRejectedAtClose`, `BookingControllerIT.sameDayBookingSucceedsBeforeClose`,
  `BookingControllerIT.sameDayAfterCloseReturns422` (IT determinism strategy: Risk R-5).
- [ ] **AC-5 (Request temporary gate + advance cap):** Given a Request-to-Book venue, when a
  tourist requests **today**, then `Rejected(BOOKING_CLOSED)` regardless of the close time
  (the temporary gate, removed by #792); when they request a **future** date D — including at
  20:00 the evening before D — then the request is created with
  `expiresAt = min(now + expiry-window, D at the venue's sales close)`. *Pinned by:*
  `CreateBookingServiceTest.sameDayRequestStillClosed`,
  `.eveningBeforeRequestSucceedsWithDeadlineCappedAtSalesClose`.
- [ ] **AC-6 (sweep bridge):** Given a same-day-born `AWAITING_PAYMENT` booking younger than the
  TTL, when the abandoned sweep runs, then it is **not** expired (its claim is kept); given an
  advance-born `AWAITING_PAYMENT` booking whose service day has opened, then it **is** expired
  exactly as #576 shipped. *Pinned by:*
  `AbandonedBookingSweepIT.spareSameDayBornBookingWithinTtl`,
  `AbandonedBookingSweepIT.expiresAnAwaitingPaymentBookingOnceItsServiceDayHasOpened` (existing,
  updated fixture — see Phase 4).
- [ ] **AC-7 (view bridge):** Given a same-day-born `AWAITING_PAYMENT` booking, when the guest
  opens the code-gated view, then payment credentials are issued; given an advance-born one past
  its service-day open, then they are withheld (unchanged #576 behavior). *Pinned by:*
  `ViewBookingServiceTest.sameDayBornBookingKeepsItsCredentials`,
  `.advanceBornBookingLosesCredentialsAtDayOpen`.
- [ ] **AC-8 (cancellation untouched):** Given any booking, when its cancellation window is
  classified, then FREE runs until the venue's evening-before `booking_cutoff`, LATE until
  service-day open, CLOSED after — byte-for-byte the ADR-0005 (#566) behavior; the existing
  window tests stay green **unmodified** except for the method rename. *Pinned by:*
  `BookingCutoffTest.cancellationWindowSpansFreeThenLate`,
  `.cancellationWindowClosesWhenServiceDayStarts` (existing), `RefundPolicyTest` (untouched).
- [ ] **AC-9 (FE date floor + copy):** Given the frozen test clock, when the homepage, the venue
  map, and the availability calendar render, then **today** is the earliest selectable/bookable
  date, and the single-source cutoff note states the new rule with no "from tomorrow" and no
  "evening before". *Pinned by:* `booking-date.spec.ts` (`defaultBookingDate` = today),
  `home.spec.ts` (floor = today), `availability-calendar.spec.ts` (today selectable, yesterday
  not), `venue-map.spec.ts` (floor + carry clamp at today), `cutoff-note.spec.ts` (new sentence).
- [ ] **AC-10 (e2e):** Given the mocked suite with a fixed page clock before 16:00, when the
  tourist books today homepage → map → dialog → pay, then the journey completes to `CONFIRMED`;
  given a mocked `422 BOOKING_CLOSED`, when the tourist attempts today at a closed venue, then
  the dialog shows the today-refusal copy and stays recoverable; axe passes on both. *Pinned
  by:* `frontend/e2e/same-day-booking.e2e.ts` (both scenarios).
- [ ] **AC-11 (same-day lifecycle regression):** Given a confirmed same-day booking, when staff
  open the daily view for today and the live map, then it is listed and its set reads taken; the
  payout accrual and the admin weather refund reach it through the unchanged date-agnostic
  paths. *Pinned by:* `StaffBookingControllerIT.sameDayConfirmedBookingAppearsInTodaysList`
  (new case), `WeatherRefundServiceIT.reachesASameDayBooking` (new case); accrual: the existing
  date-agnostic `payout` listener tests stand as the pin (no change to re-pin).
- [ ] **AC-12 (docs):** Given the merged slice, then CLAUDE.md invariant #4 states the
  venue-controlled on-day sales close (number kept), CONTEXT.md defines **Sales close** and
  demotes **Cutoff** to its cancellation role, and `RESPONSIBILITIES.md` §`booking`/§`venue`
  describe the new rule. *Pinned by:* `riviera-docs-freshness` at close-out (procedural pin).

## Non-goals

- **Operator editability of `sales_close`** — read-only this slice; the PATCH contract and the
  console control (+ the "close today now" one-tap) are #794. That is why the field is absent
  from `UpdateVenueProfileRequest`/`VenueProfileCommand`, not defaulted there.
- **Same-day Request-to-Book** — deliberately still `BOOKING_CLOSED` (the temporary gate);
  reworking the pay-deadline fences onto a persisted deadline is #792, which removes the gate
  and replaces Phase 4's born-before-service-day bridge.
- **Discover/homepage open-for-today badging** (which venues are still selling) — #793; this
  slice ships no per-venue close time on any tourist-facing view, so no FE vocabulary change.
- **Non-refundable disclosure** (checkout + mails) — #795; the classification already lands
  same-day bookings in CLOSED, nothing to build here.
- **Cancellation policy of any kind** — ADR-0005 (#566 amendment) untouched; `RefundPolicy`,
  `CancellationPolicy`, `CancelBookingService` diffs must be empty (rename-only edits allowed).
- **Frontend display of the venue's sales close** anywhere (tourist or operator) — the FE learns
  nothing new from the API this slice; `VenueProfileResponse` grows a field the FE ignores.
- No per-day close schedule, no custom times (three fixed values), no changes to pools
  (invariant #3), claims (invariant #2), or payments (invariant #8).

## Behavior-parity ledger (retirement / replacement slices only)

> The retired surface is the **evening-before sales fence** — one boundary that was doing several
> jobs. Every job it did, and where each lands:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Reserve (Instant) refused `BOOKING_CLOSED` from 18:00 the evening before | **changed** | Refused from the venue's `sales_close` on D itself (`isBookable` on `salesCloseAt`); the 20:00-evening-before reserve now **succeeds** — pinned by `BookingCutoffTest.bookableTheEveningBefore` + `CreateBookingServiceTest` |
| Reserve (Request) refused `BOOKING_CLOSED` from the same instant | **changed** | Advance requests follow the same new window; **same-day** requests refused by an explicit mode-aware gate (temporary, #792 removes) — the *effective* behavior for same-day is preserved, for advance evenings it is opened |
| Request response deadline capped at the evening-before cutoff | **changed** | Capped at `salesCloseAt(salesClose, D)` — `min(now + expiry-window, D@close)` |
| Free-cancellation deadline at the evening-before cutoff (`booking_cutoff`) | **preserved** | Untouched: `cancellationWindow` keeps reading `booking_cutoff` via the renamed `freeCancellationEndsAt`; FREE/LATE boundary identical |
| Pay deadline announced as `min(accepted_at + pay-window, service-day open)` | **preserved** | Untouched this slice (`RequestWindows.payDeadline` + `serviceDayOpensAt`); correct because same-day requests cannot exist yet — #792 reworks |
| Abandoned sweep expires `AWAITING_PAYMENT` at service-day open (`booking_date` arm) | **changed (narrowed)** | Arm now applies only to bookings **born before their own service day** (`created_at < day-open(booking_date)`); a same-day-born booking is governed by the created-arm TTL instead — without this the sweep kills every same-day Instant booking within 5 minutes (R-2) |
| Code-gated view withholds `clientSecret` once the service day opens | **changed (narrowed)** | Same born-before predicate: advance-born still fenced, same-day-born keeps credentials (their governing deadline is the TTL) |
| "No hold can be written behind the cutoff" (relied on by `venue`'s narrowed layout-write probes and the staff mark's `DATE_IN_PAST`) | **preserved** | Still true with the new fence: nothing can create a hold for a *past* date — the probes ask about **today-or-later**, and same-day holds were always in their range; verified against `RESPONSIBILITIES.md` §`venue` (the `hasLiveHold` contract asks `>= today`) |
| Homepage/map/calendar floor = tomorrow | **changed** | Floor = today (`defaultBookingDate` returns today); clamps and carry-validation keep the same shape at the new floor |
| Cutoff-note sentence "Book any day from tomorrow — … 6 PM the evening before." | **changed** | New single-source sentence stating the on-day rule (Phase 6); `6 PM`/`from tomorrow` assertions updated in the one pinning spec + the e2e regex |
| Dialog refusal copy "Booking has closed for that date. Try a later day." | **changed** | Date-aware: today → "Online sales for today have closed at this venue. Try another venue or tomorrow."; other dates keep the existing sentence |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The FREE-window trap:** redefining `closesAt` in place would extend free cancellation into the service day and move the view's pay fence (its `serviceDayOpen` rides `CancellationWindow == CLOSED`); adjacent trap: `SetBookingInfo` carries two bare `LocalTime`s, so a swapped argument compiles | med | high | `closesAt` is renamed `freeCancellationEndsAt` (rename-only in Phase 2, both call sites) and left arithmetically identical; the sales close is a **new** method whose semantic switch lands atomically with its call site (Phase 3); a typed `SalesClose` wrapper considered and declined (Phase 3 note); AC-8 pins the windows unmodified; `RefundPolicyTest`/`CancelBookingService` must show empty diffs | impl session | open |
| R-2 | **Sweep kills same-day Instant bookings:** the `booking_date <= lastOpenedServiceDay` arm matches a same-day `AWAITING_PAYMENT` row immediately; sweep interval PT5M, checkout takes minutes — booking expired + PaymentIntent cancelled mid-payment | high (without fix) | high | Phase 4 born-before-service-day predicate in the sweep SQL; AC-6; grill finding recorded on issue #791 | impl session | open |
| R-3 | **View withholds `clientSecret` for same-day bookings** (`payWindowClosed` = CLOSED window = true from birth): primary journey survives (the 202 carries the secret) but the resume-payment path dead-ends | high (without fix) | med | Phase 4 same predicate in `ViewBookingService`; `BookingRecord` gains `createdAt`; AC-7 | impl session | open |
| R-4 | **Timezone/cutoff arithmetic** (invariants #4/#6): the new `salesCloseAt` must be Tirane-anchored; the sweep predicate puts `Europe/Tirane` into SQL for the first time (`booking_date::timestamp AT TIME ZONE 'Europe/Tirane'`) | med | high | Boundary unit tests under fixed clocks incl. DST-shoulder date (`BookingCutoffTest`); the SQL predicate is pinned by `AbandonedBookingSweepIT` against real Postgres; one-line comment ties the SQL zone literal to `BookingCutoff.TIRANE` | impl session | open |
| R-5 | **IT determinism for "same-day before/after close":** no IT currently overrides the `Clock` bean (only far-future dates + backdating exist), and a fixed-clock bean forks the shared Spring context | med | med | Boundary arithmetic proven in unit tests (fixed `Clock`); ITs use the **boundary venues** trick — `23:59` venue for the same-day success path, `00:01` venue for the after-close 422 — deterministic except within a minute of Tirane midnight (accepted residual, documented in the IT); no context fork | impl session | open |
| R-6 | **Flyway V44 collision** | low | med | V44 free on `main`, all open PRs are Dependabot (checked 2026-08-26); if a collision appears, the branch merging second renumbers | plan session | closed — verified at grill |
| R-7 | **Record-growth ripple:** `SetBookingInfo` + `BookingRecord` are records — every constructor call site (prod + fixtures) breaks at compile time | high | low | Compile-time visible by construction; sweep call sites in the same phase; no positional ambiguity (different types) | impl session | open |
| R-8 | **Existing sweep IT fixture goes stale:** `ServiceDayBackdate` moves `booking_date` into the past but leaves `created_at = now`, which the new predicate reads as "same-day-born" — the existing day-open sweep IT would silently stop matching | med | high | Phase 4 extends `ServiceDayBackdate` to backdate `created_at` below the moved date's day-open (honest fixture: a real advance booking is created before its date); the existing IT then passes unchanged | impl session | open |
| R-9 | **Copy pins scattered:** the sentence is pinned in `cutoff-note.spec.ts`, clause-checked in `home.spec.ts`/`venue-map.spec.ts`, regexed in `discovery-flow.e2e.ts`, and echoed in `admin-commissions.ts` + `terms-of-service.ts` | high | low | Phase 6 sweeps all sites in one commit; the clause checks (`'sales close'`) are kept clause-level so only the one full-sentence pin changes | impl session | open |
| R-10 | Per-venue authorization (invariant #13) | — | — | No new venue-scoped operation: profile read/PATCH keep their existing `assertOwns`-first services; reserve stays public-by-design. No change | — | closed — n/a |

## Open questions / Assumptions

- **Assumption:** the `booking_cutoff` column name stays (it is now the free-cancellation
  cutoff; renaming the column is churn with no behavior) — operator-facing *label* rewording is
  #794's UI concern. — *Owner:* impl session · *Resolves by:* Phase 8 (docs state it).
- **Assumption:** the homepage's default *selected* date becomes today (floor = default, the
  existing pattern `min == value` preserved at the new floor). The epic's story 2 asks for
  today to be selectable; opening on it is the natural default for "the tourist already on the
  riviera". — *Owner:* impl session · *Resolves by:* Phase 6 (revisit if review objects).
- **Assumption:** the after-close refusal needs no new error code — `BOOKING_CLOSED` + the
  request's date is enough for the FE to render today-specific copy (epic: "the refusal
  contract is unchanged"). — *Owner:* plan · *Resolves by:* AC-4/AC-10 as written.
- **Open question (deferred by design, not this slice's):** whether #792 persists the pay
  deadline on the booking row or keeps deriving it — noted here only so the Phase 4 bridge is
  not mistaken for the final shape. — *Owner:* #792 · *Resolves by:* issue #792.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** the online reserve claim
  (both modes) is the only one this slice touches — and only its *gate*, not its mechanics. The
  claim still happens synchronously inside the reserve transaction via
  `availability.api.AvailabilityClaim` **after** the sales-window check; staff tap-to-mark,
  cancellation release, request decline/expiry/withdraw release, and the weather-refund release
  are untouched.
- **Uniqueness guarantee:** unchanged — the `availability(set_id, booking_date)` unique
  constraint + atomic claim. Same-day rows are not special: the constraint never had a date
  qualifier.
- **Concurrency strategy:** unchanged (`INSERT … ON CONFLICT DO NOTHING` claim). The new
  same-day traffic *raises the live walk-in race* (staff marking vs. online claim on today) —
  that race is exactly what the claim row already arbitrates; whoever writes first holds the
  set, the loser gets `SET_TAKEN`/staff sees taken. Design-spec §13 re-frames this as
  venue-priced risk (Layers 1/3/4 carry the residual).
- **Pool rule (invariant #3):** untouched — `NOT_ONLINE_POOL` is checked before the window gate,
  order unchanged.
- **Cutoff rule (invariant #4, the section's core this slice):** a date D is bookable iff
  `now < D at the venue's sales_close` in `Europe/Tirane` (strictly-before at the boundary,
  matching the old convention). The evening-before fence is **deleted from the sales path** and
  survives only as the FREE/LATE cancellation boundary. The service-day-open second fence
  (#576) narrows to advance-born bookings (Phase 4) — for same-day-born ones the instant TTL
  (PT15M) is the abandonment bound, so a claim can never be held un-releasable: every
  `AWAITING_PAYMENT` row is reachable by exactly one sweep arm at all times (date-arm for
  advance-born past day-open, created-arm for never-accepted younger flows, accepted-arm for
  accepted requests). The sweep-interval sizing analysis of `scheduled-sweep-bounds.md` is
  unaffected (same arms, one narrowed).
- **Sweep release semantics:** unchanged — an expired booking still releases its claim and
  cancels its PaymentIntent; Phase 4 only narrows *which* rows the date arm selects.
- **Pinning tests:** the existing `ConcurrentReservationIT` (claim race, date-agnostic) stands;
  `AbandonedBookingSweepIT` pins the narrowed arm both ways (AC-6);
  `BookingControllerIT.sameDayBookingSucceedsBeforeClose` proves the claim path end-to-end on a
  same-day date.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` (row; no domain class today) | Owns venue settings — the sales-close time is venue configuration like `booking_cutoff`/`booking_mode` (Job: "venue profiles … pricing, booking mode") |
| M-2 | `booking` | existing | `Booking` | Owns "is booking open for date D" — the cutoff authority (Job: "Enforce … the same-day cutoff — both of the day's boundaries"); `availability` explicitly disclaims it |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#setBookingInfo`/`#setBookingInfos` (existing methods, richer record) | `venue.vocabulary.SetBookingInfo` gains `LocalTime salesClose` | `booking` (already granted `venue::api` + `venue::vocabulary` — **no `allowedDependencies` change**) |

Not `VenueCatalog` — that is the tourist-read port and `VenueApiRoleSplitTests` pins the split
(#94); the sales close is sibling-facing booking-facts vocabulary. No new port: same
conversation, same record, one more fact (Cockburn: a port is a purposeful conversation).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none new; none changed | | | | | `ModularityTests` (verify), five-event inventory in CLAUDE.md unchanged |

`BookingPaymentDue` keeps carrying the #576-capped deadline (unchanged this slice).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store the per-venue `sales_close` value; expose it on the owner profile read and on `SetBookingInfo` | `venue` | `venue` Job: venue profiles/settings (booking mode and `booking_cutoff` are the precedents); **not** `booking` (its Not-My-Job: "the venue map, pricing, or pool rules → `venue`" — settings live with the venue) |
| Decide whether date D is currently sellable (the sales-window rule) | `booking` | `booking` Job: "Enforce the cancellation policy and the same-day cutoff — both of the day's boundaries"; **not** `venue` (it stores the time, never computes with it — the same store-vs-decide split as commission: `venue` stores the rate, `payout` computes) and **not** `availability` (its Not-My-Job: bookability; it owns per-`(set,date)` *state*, epic: "deciding whether bookings are open for a date is `booking`'s job") |
| The same-day Request temporary gate | `booking` | Lives beside the mode branch in `ReserveSetService` — reserve-path policy, `booking`'s orchestration job |
| The narrowed service-day pay fences (sweep arm, view credentials) | `booking` | #576 placed both there; this slice only narrows their predicate — no ownership move |
| The FE date floor and copy | frontend `shared/` + feature folders | Placement per `riviera-frontend` (File structure below); display-only — the server stays authoritative for the window (the FE never computes the close) |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch — untouched.
- **Confirmation trigger:** signature-verified webhook — untouched, and **deliberately still
  unfenced**: a payment in flight at the sales close (or at midnight) still confirms; refusing
  would strand collected money (`RESPONSIBILITIES.md` §`booking`, unchanged posture).
- **Idempotency / money / webhooks:** no `payment` code in scope; amounts, keys, dedupe
  untouched.
- **Payout-ledger effect:** accrual on `BookingConfirmed`, reversal on refund — date-agnostic
  and untouched; AC-11 pins that a same-day booking flows through identically rather than
  changing anything.
- **Refund policy applied:** untouched (AC-8); a same-day booking is born in CLOSED — cancel
  refused, no refund — by the existing classification; the admin weather refund still reaches
  it (`WeatherRefundServiceIT.reachesASameDayBooking`, new case, existing code).
- **Pinning tests:** existing `RefundPolicyTest`, `WebhookIdempotencyIT`-class suite unchanged;
  the new case above.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/booking-date.ts` (`defaultBookingDate`) | existing | pure utility | — | — |
| FE-2 | `shared/cutoff-note.ts` | existing | attribute component, zero-API | — | — |
| FE-3 | `pages/home/home.ts` (+`.html`) | existing | standalone component | `minDate` construction constant + `selectedDate` signal (shape kept) | native `<input type="date" [min]>` + clamp (kept) |
| FE-4 | `venue/venue-map.ts` (+`.html`) | existing | standalone component | `minDate` signal re-derived per route reset (kept) | — |
| FE-5 | `venue/availability-calendar.ts` | existing | standalone component | `isBookable` floor via `input.required` minDate (kept) | — |
| FE-6 | `booking/booking-dialog.ts` | existing | standalone component | `errorMessage()` gains the today-aware `BOOKING_CLOSED` branch (pure date compare vs `todayBookingDate`) | — |
| FE-7 | `admin/admin-commissions.ts` | existing | copy-only edit | — | — |
| FE-8 | `pages/legal/terms-of-service.ts` | existing | copy-only edit | — | — |

**Standards:** no new components, no new signals machinery, no forms change — the slice keeps
every established shape and moves the floor/copy. Angular-cli MCP `get_best_practices` due at
the implement session's first FE edit. No styling change is planned (class lists untouched);
if any styling does surface, load `riviera-tailwind` then (routing-gate re-entry).

## FE↔BE contract

- **Changed endpoint (additive):** `GET /api/venues/{venueId}/profile` response gains
  `salesClose: "HH:mm"` (the `VenueProfileResponse.CUTOFF` formatter precedent). The FE
  deliberately does **not** consume it this slice (Non-goals); `operator-console.model.ts` is
  untouched — additive JSON is ignored by the TS model.
- **Unchanged contracts relied on:** `POST /api/bookings` refusal `422 {"code":"BOOKING_CLOSED"}`
  (same code, same status — the FE branches copy on its own selected date);
  `PATCH /api/venues/{venueId}` full-replace body — **no new field**, which is the epic's
  mid-epic-compatibility requirement.
- **Money/date on the wire:** untouched (ISO `LocalDate` booking dates, minor-unit amounts).

## Execution status

> **This section is the session-recovery anchor.** Update in the same commit window as the
> change it records, at every phase boundary and SDLC stage transition. Finalize before merge
> citing `merged via PR #NN`.

**Stage pointer:** plan committed — **stopped after plan by user instruction** (2026-08-26).
Implement has not started.

**Next action:** an implement session starts at Phase 0 — first load `riviera-local-debug`
(before any `./gradlew`/`npm`), re-run the Skill-routing gate per phase, open the draft PR at
the first phase commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V44 migration + migration IT | | |
| 1 — venue read surface (`SetBookingInfo`, profile read) | | |
| 2 — the window rule (`BookingCutoff`) | | |
| 3 — reserve paths (Instant gate, Request gate + cap) | | |
| 4 — same-day pay-fence bridges (sweep + view) | | |
| 5 — lifecycle regression pins | | |
| 6 — frontend floor + copy | | |
| 7 — mocked e2e | | |
| 8 — substrate docs + Javadoc sweep | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

> Every path the diff will touch. Run
> `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing (stage the
> plan doc first).

**Backend — new**
- `platform/src/main/resources/db/migration/V44__venue_sales_close.sql` — column + CHECK + backfill
- `platform/src/test/java/ai/riviera/platform/venue/SalesCloseMigrationIT.java` — AC-1

**Backend — modified**
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetBookingInfo.java` — `+ LocalTime salesClose`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — `SET_BOOKING_INFO_SELECT` + mapper
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — profile SELECT + `ProfileRow`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileView.java` — `+ salesClose`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — `+ salesClose "HH:mm"`
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/BookingCutoff.java` — `salesCloseAt`, `isBookable` rework, `closesAt` → `freeCancellationEndsAt`, class doc
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ReserveSetService.java` — gate on `salesClose`, Request same-day gate, deadline cap
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/BookingOutcome.java` — `BOOKING_CLOSED` Javadoc only
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/AbandonedBookingSweepService.java` — doc only (semantics comment)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — sweep date-arm predicate; `BookingRecord` SELECT gains `created_at`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingRecord.java` — `+ Instant createdAt`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — born-before predicate on the credentials fence
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/BookingCutoffTest.java` — AC-3/AC-8 cases
- `platform/src/test/java/ai/riviera/platform/booking/CreateBookingServiceTest.java` — AC-4/AC-5 cases *(path per its current package)*
- `platform/src/test/java/ai/riviera/platform/booking/BookingControllerIT.java` — AC-4 IT cases
- `platform/src/test/java/ai/riviera/platform/booking/AbandonedBookingSweepIT.java` — AC-6 cases
- `platform/src/test/java/ai/riviera/platform/booking/ServiceDayBackdate.java` — also backdate `created_at` (R-8)
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — AC-7 cases
- `platform/src/test/java/ai/riviera/platform/booking/StaffBookingControllerIT.java` — AC-11 case
- `platform/src/test/java/ai/riviera/platform/booking/WeatherRefundServiceIT.java` — AC-11 case *(path per its current package)*
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-2 cases
- every fixture constructing `SetBookingInfo`/`BookingRecord` (compile-driven; e.g. `RespondToRequestServiceTest`, `ViewBookingServiceTest` builders) — record growth (R-7)

**Frontend — modified**
- `frontend/src/app/shared/booking-date.ts` + `booking-date.spec.ts` — floor → today
- `frontend/src/app/shared/cutoff-note.ts` + `cutoff-note.spec.ts` — new sentence
- `frontend/src/app/shared/clock-icon.spec.ts` — fixture text only if it collides (expected: untouched)
- `frontend/src/app/pages/home/home.spec.ts` — floor assertions
- `frontend/src/app/venue/availability-calendar.ts` (doc comment) + `availability-calendar.spec.ts` — `MIN_DATE` → today, disabled-set cases
- `frontend/src/app/venue/venue-map.ts` (doc comments) + `venue-map.spec.ts` — floor/clamp cases
- `frontend/src/app/booking/booking-dialog.ts` + `booking-dialog.spec.ts` — today-aware `BOOKING_CLOSED` copy
- `frontend/src/app/admin/admin-commissions.ts` (+ its spec if it pins the explainer) — stale "from tomorrow" explainer
- `frontend/src/app/pages/legal/terms-of-service.ts` (+ spec if pinned) — sales-close sentence (cancellation sentence stays)
- `frontend/e2e/discovery-flow.e2e.ts` — cutoff-note regex + date-carry derivation at the new floor
- `frontend/e2e/booking-flow.e2e.ts` — only if the floor change shifts its date derivations

**Frontend — new**
- `frontend/e2e/same-day-booking.e2e.ts` — AC-10 (both scenarios + axe)

**Docs**
- `CLAUDE.md` — invariant #4 reworded (number kept); module-table `venue` row gains the sales-close mention
- `CONTEXT.md` — **Sales close** entry; **Cutoff** demoted to cancellation-only
- `RESPONSIBILITIES.md` — §`booking` (window rule, narrowed fences), §`venue` (new setting; the "no write path can create a hold behind the cutoff" sentence re-grounded on past-dates-only)
- `docs/plans/same-day-sales-close.md` — this plan (execution status upkeep)
- Javadoc sweep (Phase 8, same files as backend-modified where not already listed): `CancellationWindow`, `CancellationPolicy`, `RequestWindows`, `RespondToRequestService`, `SetBookingInfo`, V19/V22/V39 migration headers are **not** edited (historical documents) — only living Javadoc

---

## Phase 0 — V44 migration + migration IT

**Files:** Create `V44__venue_sales_close.sql`, `SalesCloseMigrationIT.java`

- [ ] **Step 1: Write the failing test** — `SalesCloseMigrationIT` (Testcontainers,
  `@EnabledIfDockerAvailable`): `backfillsExistingVenuesTo1600` reads the V3-seeded venue's
  `sales_close` expecting `16:00`; `checkRejectsAnyOtherTime` attempts
  `UPDATE venue SET sales_close = TIME '12:00'` expecting a constraint violation naming
  `venue_sales_close_check`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*SalesCloseMigrationIT*"`
  → FAIL (no column).
- [ ] **Step 3: Minimal implementation**

```sql
-- #791 (epic #790): per-venue sales close on the service day itself (design spec §13).
-- Online sales for date D now run until D at this venue-local time (Europe/Tirane, invariant #6);
-- three fixed choices only. No application write path exists this slice (read-only setting;
-- creates take the DEFAULT, PATCH excludes it), so the CHECK is the sole validator until the
-- operator-control slice adds the mirroring edge validation. DEFAULT backfills every existing
-- venue to 16:00 — the maintainer-settled epic decision: same-day sales on by default, 00:01
-- the per-venue opt-out. Safe on existing rows (same argument as V22's DEFAULT).
-- Verified by SalesCloseMigrationIT.
ALTER TABLE venue
    ADD COLUMN sales_close TIME NOT NULL DEFAULT '16:00',
    ADD CONSTRAINT venue_sales_close_check
        CHECK (sales_close IN (TIME '00:01', TIME '16:00', TIME '23:59'));
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — N/A (no bug fix; pattern follows V43).
- [ ] **Step 6: Commit** — `git commit -m "Add per-venue sales_close column, default 16:00 (#791)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — venue read surface

**Files:** Modify `SetBookingInfo.java`, `JdbcVenueCatalog.java`, `JdbcVenues.java`,
`VenueProfileView.java`, `VenueProfileResponse.java`; tests `VenueAdminControllerIT`,
`SetBookingInfoIT`-adjacent, compile-driven fixture updates.

- [ ] **Step 1: Failing tests** — `VenueAdminControllerIT.createDefaultsSalesCloseAndProfileReturnsIt`
  (create venue with the existing body → profile read asserts `salesClose == "16:00"`);
  `.patchCannotReachSalesClose` (full-replace PATCH with the existing body → re-read still
  `16:00`; and the PATCH DTO has no such field — compile-level guarantee, assert the response
  only). Extend the existing `SetBookingFacts` IT to assert `salesClose` on the returned record.
- [ ] **Step 2: Verify red** — `./gradlew test --tests "*VenueAdminControllerIT*"`.
- [ ] **Step 3: Minimal implementation** — `SetBookingInfo` gains `LocalTime salesClose` (after
  `bookingCutoff`); `SET_BOOKING_INFO_SELECT` adds `v.sales_close`; `mapSetBookingInfo` maps it;
  `JdbcVenues.findProfile` SELECT + `ProfileRow` + `VenueProfileView` + `VenueProfileResponse`
  (`CUTOFF`-formatter, field name `salesClose`). **No change** to `NewVenueCommand`,
  `CreateVenueRequest` (the DB DEFAULT stamps creates), `VenueProfileCommand`,
  `UpdateVenueProfileRequest`, or the `UPDATE … SET` clause — absence *is* the read-only
  contract (the `commissionBps` precedent). Fix record-growth compile breaks in fixtures.
- [ ] **Step 4: Verify green** — venue package: `./gradlew test --tests "ai.riviera.platform.venue.*"`.
- [ ] **Step 5: Generalization audit** — population: *constructors of `SetBookingInfo`*
  (mechanism: record growth) → enumerate `grep -rn "new SetBookingInfo(" platform/src` →
  fix all. Log below.
- [ ] **Step 6–7: Commit + status** — `"Expose venue sales close on profile read and SetBookingFacts (#791)"`.

## Phase 2 — the new boundary + the honest rename (`BookingCutoff`, additive only)

**Files:** Modify `BookingCutoff.java`, `BookingCutoffTest.java`, `CancellationPolicy.java` +
`ReserveSetService.java` (rename call sites only — semantics untouched).

> **Decomposition rule (structural-check finding):** this phase changes **no behavior**. It adds
> `salesCloseAt` and renames `closesAt` → `freeCancellationEndsAt` at **both** existing call
> sites (`cancellationWindow`, and `ReserveSetService`'s request-deadline cap — which keeps
> passing `bookingCutoff` and keeps its evening-before meaning until Phase 3). `isBookable` is
> **not** touched here: its semantic switch lands in Phase 3 atomically with the call site that
> starts passing `salesClose` — otherwise the Phase 2 commit either doesn't compile (deleted
> method still referenced) or ships a wrong, unpinned interim (bookable-until-18:00-on-D).
> Every commit compiles and means what its tests pin.

- [ ] **Step 1: Failing tests** — the `salesCloseAt` arithmetic cases via the existing
  `at(ZonedDateTime)` fixed-clock helper: the close instant for each of the three values on a
  fixed D, incl. a DST-shoulder date (R-4); rename-only edits to the cancellation-window tests.
- [ ] **Step 2: Verify red** — `./gradlew test --tests "*BookingCutoffTest*"`.
- [ ] **Step 3: Minimal implementation**

```java
	/** The instant online sales for {@code bookingDate} end: the venue's sales close on the day
	 *  itself, {@code Europe/Tirane} (invariant #4). */
	public Instant salesCloseAt(LocalTime salesClose, LocalDate bookingDate) {
		return bookingDate.atTime(salesClose).atZone(TIRANE).toInstant();
	}

	/** The instant free cancellation ends: the venue's evening-before cutoff (ADR-0005; no sales role). */
	public Instant freeCancellationEndsAt(LocalTime cutoff, LocalDate bookingDate) {
		return bookingDate.minusDays(1).atTime(cutoff).atZone(TIRANE).toInstant();
	}
```

  Class doc rewritten: the day now has **three** boundaries in one place — sales close (on D),
  free-cancellation end (evening before), service day open (midnight).
- [ ] **Step 4: Verify green** — `./gradlew test --tests "*BookingCutoffTest*" --tests "*RefundPolicyTest*"`;
  `RefundPolicyTest` must pass **unmodified** (AC-8).
- [ ] **Step 5: Generalization audit** — population: *callers of `closesAt`* (mechanism: the
  renamed method) → `grep -rn "closesAt(" platform/src` → must return zero after the rename;
  a leftover is a missed site. Log below.
- [ ] **Step 6–7: Commit + status** — `"Name the day's three boundaries in BookingCutoff (#791)"`.

## Phase 3 — the window switch + reserve paths

**Files:** Modify `BookingCutoff.java` (`isBookable` rework), `ReserveSetService.java`,
`BookingOutcome.java` (Javadoc), `BookingCutoffTest.java` (AC-3 window cases),
`CreateBookingServiceTest.java`, `BookingControllerIT.java`.

- [ ] **Step 0: `isBookable` switches semantics WITH its call site** (the Phase 2 blockquote):
  re-implement it on `salesCloseAt` and, in the same commit, make `ReserveSetService` pass
  `set.salesClose()`; the AC-3 `BookingCutoffTest` cases land here:

```java
	@Test
	void bookableTheEveningBefore() {
		// The retired evening-before fence: 20:00 on D-1 is now inside the window (#791).
		assertTrue(at(tirane(BOOKING_DATE.minusDays(1), 20, 0)).isBookable(SALES_CLOSE_1600, BOOKING_DATE));
	}

	@Test
	void closedAtSalesClose() {
		assertFalse(at(tirane(BOOKING_DATE, 16, 0)).isBookable(SALES_CLOSE_1600, BOOKING_DATE));
	}

	@Test
	void optOutVenueSellsNothingOnTheDay() {
		assertFalse(at(tirane(BOOKING_DATE, 0, 1)).isBookable(SALES_CLOSE_0001, BOOKING_DATE));
	}
```

  plus `sameDayBookableUntilSalesClose` (15:59 true), `lateCloseSellsToElevenFiftyNine`,
  `closedForPastDate`; the old `closedForSameDay` pin is replaced by these (Behavior-parity
  ledger). **Confusability note (structural check):** `SetBookingInfo` now carries two bare
  `LocalTime`s (`bookingCutoff`, `salesClose`) and `BookingCutoff` takes either — a swapped
  argument compiles. A typed `SalesClose` wrapper was **considered and declined** (`bookingCutoff`
  is already bare on the same record; wrapping one of two is worse, wrapping both is scope creep);
  the mitigation is the parameter names + the AC-3/AC-8 pins, which fail behaviorally on a swap.

```java
	/** Whether online booking for {@code bookingDate} is currently open (strictly before the close). */
	public boolean isBookable(LocalTime salesClose, LocalDate bookingDate) {
		return clock.instant().isBefore(salesCloseAt(salesClose, bookingDate));
	}
```

- [ ] **Step 1: Failing tests** — AC-4/AC-5 in `CreateBookingServiceTest` (fixed `Clock`,
  `new BookingCutoff(CLOCK)`, fixture `SetBookingInfo` with the wanted `salesClose`/`bookingMode`):
  same-day instant success before close / rejection at close; same-day request →
  `BOOKING_CLOSED`; evening-before request succeeds with
  `expiresAt = min(now + expiryWindow, salesCloseAt(salesClose, D))` asserted both ways (window
  shorter / close shorter). ITs per R-5's boundary-venue strategy: seed a `23:59` venue → today
  booking succeeds end-to-end (claim + AWAITING/CONFIRMED per profile); seed a `00:01` venue →
  today returns `422 BOOKING_CLOSED`; the existing `afterCutoffReturns422` (yesterday) stays
  green as the past-date pin.
- [ ] **Step 2: Verify red** — `./gradlew test --tests "*CreateBookingServiceTest*"`.
- [ ] **Step 3: Minimal implementation** — in `ReserveSetService.reserve`:

```java
		if (!cutoff.isBookable(set.salesClose(), command.bookingDate())) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.BOOKING_CLOSED);
		}
		...
		if (set.bookingMode() == BookingMode.REQUEST) {
			// Temporary gate (#791, removed by #792): the pay-deadline fences still assume no same-day.
			if (!command.bookingDate().isAfter(BookingCutoff.lastOpenedServiceDay(clock.instant()))) {
				return new ReserveOutcome.Rejected(BookingOutcome.Rejected.BOOKING_CLOSED);
			}
			Instant expiresAt = min(clock.instant().plus(requestWindows.expiryWindow()),
					cutoff.salesCloseAt(set.salesClose(), command.bookingDate()));
			...
		}
```

  `BOOKING_CLOSED` Javadoc reworded ("The sales window for that date has closed (invariant #4)").
- [ ] **Step 4: Verify green** — `./gradlew test --tests "ai.riviera.platform.booking.*"` scoped
  to the reserve/request classes, then `BookingControllerIT` (Docker).
- [ ] **Step 5: Generalization audit** — population: *every caller of
  `isBookable`/`bookingCutoff()` deciding sellability* (mechanism: reads the venue time to gate
  a sale) → `grep -rn "isBookable\|bookingCutoff()" platform/src/main` → expect the reserve gate
  (moved), `CancellationPolicy` (cancellation-only, stays on `bookingCutoff`) — confirm no third
  site sells anything off the old fence. Log below.
- [ ] **Step 6–7: Commit + status** — `"Gate reserve on the same-day sales close; keep same-day requests closed (#791)"`.

## Phase 4 — same-day pay-fence bridges

**Files:** Modify `JdbcBookings.java` (sweep SQL + `BookingRecord` SELECT), `BookingRecord.java`,
`ViewBookingService.java`, `ServiceDayBackdate.java`, `AbandonedBookingSweepIT.java`,
`ViewBookingServiceTest.java`.

- [ ] **Step 1: Failing tests** — AC-6: `spareSameDayBornBookingWithinTtl` seeds an
  `AWAITING_PAYMENT` booking dated today, created now → sweep leaves it and its claim;
  the existing day-open expiry IT keeps passing once `ServiceDayBackdate` also backdates
  `created_at` (R-8 — set it to well before the moved date's Tirane midnight). AC-7:
  `sameDayBornBookingKeepsItsCredentials` / `advanceBornBookingLosesCredentialsAtDayOpen` on
  `ViewBookingService` with fixture `BookingRecord`s differing only in `createdAt`.
- [ ] **Step 2: Verify red** — `./gradlew test --tests "*AbandonedBookingSweepIT*" --tests "*ViewBookingServiceTest*"`.
- [ ] **Step 3: Minimal implementation** — sweep date arm narrows to advance-born rows
  (zone literal mirrors `BookingCutoff.TIRANE` — R-4):

```sql
			  AND (   (booking_date <= :serviceDayOnOrBefore
			           AND created_at < (booking_date::timestamp AT TIME ZONE 'Europe/Tirane'))
			       OR (accepted_at IS NULL AND created_at < :createdBefore)
			       OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
```

  `BookingRecord` gains `Instant createdAt` (SELECT + mapper). The Java half of the predicate
  gets **one named home on `BookingCutoff`** (the civil-day authority — structural-check
  refinement, so the SQL arm's comment can point at a single definition rather than an inline
  expression):

```java
	/** Whether the booking was created before its own service day opened (the #576 fences apply
	 *  only to these; a same-day-born booking is governed by its TTL until #792). */
	public boolean bornBeforeServiceDay(Instant createdAt, LocalDate bookingDate) {
		return createdAt.isBefore(serviceDayOpensAt(bookingDate));
	}
```

  `ViewBookingService`:

```java
		boolean payWindowClosed = awaitingPayment && quote.serviceDayOpen()
				&& cutoff.bornBeforeServiceDay(b.createdAt(), b.bookingDate());
```

- [ ] **Step 4: Verify green** — the two test classes, then `BookingViewIT`.
- [ ] **Step 5: Generalization audit** — population: *every consumer of
  `serviceDayOpen`/`serviceDayHasOpened`/`lastOpenedServiceDay`* (mechanism: fences behavior at
  day-open) → `grep -rn "serviceDayOpen\|serviceDayHasOpened\|lastOpenedServiceDay" platform/src/main`
  → judge each for the same same-day-born blindspot (expected: the pay-deadline announce
  (#792's, requests only — gated), the cancel classification (correct: same-day = CLOSED is
  the *intended* policy), the no-show sweep (dates strictly before today — safe). Log below.
- [ ] **Step 6–7: Commit + status** — `"Spare same-day-born bookings from the day-open pay fences (#791)"`.

## Phase 5 — lifecycle regression pins

**Files:** Modify `StaffBookingControllerIT.java`, `WeatherRefundServiceIT.java`.

- [ ] **Step 1: Write the (expected-green) pins** — a confirmed today-dated booking appears in
  the staff daily list and takings; the weather refund for venue+today reaches it. These pin
  AC-11 without changing production code — a red here is a discovered defect, handled per
  `diagnosing-bugs`.
- [ ] **Step 2–4:** `./gradlew test --tests "*StaffBookingControllerIT*" --tests "*WeatherRefundServiceIT*"` → PASS.
- [ ] **Step 5:** Generalization audit — N/A unless a pin turns red (then: population = *every
  read that filters `booking_date`*, enumerate `grep -rn "booking_date" platform/src/main` and
  judge each for a hidden no-same-day assumption).
- [ ] **Step 6–7: Commit + status** — `"Pin same-day bookings through staff view and weather refund (#791)"`.

## Phase 6 — frontend floor + copy

**Files:** Modify FE files per File structure (FE-1…FE-8 + specs).

- [ ] **Step 1: Failing tests** — `booking-date.spec.ts`: `defaultBookingDate` returns **today**
  in Tirane (rewrite the four cases: same civil day incl. the 23:30-UTC shoulder);
  `home.spec.ts` floor assertions → today; `availability-calendar.spec.ts`: `MIN_DATE =
  '2026-06-15'` (the frozen clock's today), today selectable, yesterday disabled;
  `venue-map.spec.ts`: floor today, past-`?date=` clamps to today; `cutoff-note.spec.ts`: the
  new single sentence; `booking-dialog.spec.ts`: `BOOKING_CLOSED` on a today-dated attempt
  renders the today copy, on a future date the generic copy.
- [ ] **Step 2: Verify red** — `cd frontend && npm test`.
- [ ] **Step 3: Minimal implementation** — `defaultBookingDate` returns `todayBookingDate(now)`
  (TSDoc: "today in Europe/Tirane — sales for a day now close on the day itself, server
  authoritative"); cutoff-note sentence (proposed, final wording at implement with a11y read):
  *"Book any day, today included — each day’s online sales close at the venue’s chosen time
  that day (4&nbsp;PM at most venues)."* — the clock time stays an NBSP-joined entity per the
  `6&nbsp;PM` precedent (#734 F-7), and the spec's NBSP pin moves with it; `data-testid`, host
  classes, and the clock glyph unchanged; dialog `errorMessage()` gains the today branch
  (compare the dialog's date to `todayBookingDate(new Date())` — **in class code, never the
  template**, per the v22 guide's no-template-globals rule);
  `admin-commissions.ts` explainer + `terms-of-service.ts` sales sentence updated (free-cancel
  sentences untouched). Stale FE doc comments ("tomorrow", "invariant #4, display") updated in
  the same pass. **Floor-staleness note:** `home.ts` computes `minDate` once at construction
  (unlike `venue-map`, which re-derives per route reset) — with the floor at *today*, a page
  left open past Tirane midnight lets yesterday be picked client-side (the server still refuses
  `BOOKING_CLOSED`). Decide at implement: re-derive the floor in `onDateChange`/`reload`, or
  accept the residual and say so in the component doc — either way the #155 spec is updated to
  match. Re-run the angular-cli MCP `get_best_practices` before this phase's first edit
  (plan-time run recorded in *Skills consulted*).
- [ ] **Step 4: Verify green** — `npm test`, `npm run lint`, `npm run format:check`.
- [ ] **Step 5: Generalization audit** — population: *every FE site encoding the old floor or
  sentence* (mechanism: literal "tomorrow"/"evening before"/`defaultBookingDate` semantics) →
  `grep -rn "tomorrow\|evening before" frontend/src frontend/e2e` → fix or justify each hit.
  Log below.
- [ ] **Step 6–7: Commit + status** — `"Allow today as the earliest bookable date; state the on-day sales close (#791)"`.

## Phase 7 — mocked e2e

**Files:** Create `frontend/e2e/same-day-booking.e2e.ts`; modify `discovery-flow.e2e.ts`
(regex + date derivation), `booking-flow.e2e.ts` only if floor-derived dates shift.

- [ ] **Step 1: Author the two journeys** (CI-safe mocked suite; `page.route` mocks per
  `booking-flow.e2e.ts`; `page.clock.setFixedTime` before 16:00 Tirane per
  `availability-calendar.e2e.ts`): (a) today journey homepage → map → dialog → fake-Stripe pay →
  confirmed, asserting the homepage picker offers today; (b) refusal: `POST /api/bookings` mocked
  `422 BOOKING_CLOSED` → dialog alert shows the today copy, dialog recoverable. Both run
  `expectNoSeriousAxeViolations` after `settle(page)`.
- [ ] **Step 2–4:** `npm run test:e2e:a11y` (scoped with `--grep` first, then the suite) → PASS.
- [ ] **Step 5:** Generalization audit — N/A (new coverage, no fix).
- [ ] **Step 6–7: Commit + status** — `"Cover the today-booking journey and after-close refusal e2e (#791)"`.

## Phase 8 — substrate docs + Javadoc sweep

**Files:** `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, living Javadoc (list in File
structure), this plan doc (final execution status).

- [ ] **Step 1:** Reword invariant #4 (number kept): sales window per date runs from map publish
  to the venue's `sales_close` on D (`00:01`/`16:00`/`23:59`, default `16:00`, Europe/Tirane);
  the evening-before cutoff is cancellation-only; the day-open fence applies to advance-born
  `AWAITING_PAYMENT` bookings (same-day-born ride the TTL until #792); confirm path still
  unfenced. CONTEXT.md: add **Sales close**, demote **Cutoff**. RESPONSIBILITIES.md
  §`booking`/§`venue` per the File-structure notes.
- [ ] **Step 2:** Sweep the stale living Javadoc (grill census): `CancellationWindow`,
  `CancellationPolicy`, `RequestWindows`, `RespondToRequestService`, `SetBookingInfo`,
  `BookingOutcome`, FE doc comments not already touched in Phase 6.
- [ ] **Step 3:** Run `node scripts/check-plan-file-structure.mjs --diff origin/main`; run
  `riviera-docs-freshness` over the slice range at close-out and record its findings in
  *Skills consulted*.
- [ ] **Step 6–7: Commit + status** — `"Reword invariant #4 to the venue-controlled sales close (#791)"`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase (mechanism-not-resemblance, #641).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..8, 11:** `./gradlew build` (full suite green in CI) — per-AC pins listed above run
  scoped during phases. Verified at commit `<sha>`.
- [ ] **AC-9:** `cd frontend && npm test` → green incl. the renamed/updated specs.
- [ ] **AC-10:** `npm run test:e2e:a11y` → green incl. `same-day-booking.e2e.ts`.
- [ ] **AC-12:** `riviera-docs-freshness` run recorded; diff shows the three substrate docs.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4 — as reworded by this slice).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** untouched as planned; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side, unchanged (invariant #10, AC-8).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` reasoned (invariant #6) — incl. the one new SQL zone literal (R-4).
- [ ] Booking codes unguessable — untouched (invariant #7).
- [ ] Flyway migration present; the CHECK is created and tested by V44 (invariant #12).
- [ ] **Frontend** standards met; no `as any`; no new cross-feature edge (RV-FE-8).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — invocation ladder per `references/pr-gates.md` §1 + `riviera-review-overlay`.
