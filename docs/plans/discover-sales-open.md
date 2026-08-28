# Discover per-venue open/closed sales state for today — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The tourist venue browse for a selected date carries, per venue, whether online
sales for that date are open *right now* — computed by `booking`'s one sales-window rule —
so Discover badges venues whose sales for today have closed and a closed venue's map shows
a closed state instead of a bookable grid.

**Architecture:** The single significant decision is the cross-module read shape. `booking`
already depends on `venue::api`/`::vocabulary` (`SetBookingFacts` carries `salesClose` to
the reserve path), so the browse read in `venue` can never call a `booking` port — that
edge would cycle the module graph. Instead `venue` declares a third **driven port in
`venue.spi`** — `SalesWindow.isOpen(salesClose, bookingDate, now)` — and `booking`
implements it with a thin adapter delegating to `BookingCutoff.isBookable(...)`, exactly
the shape of the existing `venue.spi.SetAvailabilityLookup` (implemented by
`availability`, #44) and `venue.spi.BookingPresence` (implemented by `booking`). The
compile edge stays `booking → venue`; the runtime call goes `venue → booking`; the rule
has one home. `booking`'s `allowedDependencies` already lists `venue::spi`, so **no grant
changes at all**. The verdict rides the existing tourist read DTOs as an additive
`salesOpen: boolean` — no new endpoint, no second HTTP call, and AC-1 of the issue holds
literally.

**Persistence:** JDBC only (invariant #1). **No migration** — `venue.sales_close` exists
(V44, NOT NULL, CHECK `00:01/16:00/23:59`); this slice only adds the column to the two
tourist-read SELECTs in `JdbcVenueCatalog`. No new index: neither read filters or sorts on
`sales_close` (the same-day plan doc's declined-index reasoning still applies).

**Source of intent:** issue #793 (epic #790, design spec §13 in
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
#791/#792 merged with epic ticks recorded, only dependabot PRs in flight, no Flyway claim
needed) · `riviera-plan-doc` (this template — forced the staleness decision and the
module-ownership table below) · `tdd` (each phase red-green at the smallest seam) ·
`riviera-review-overlay` (review gate — due at ready-for-review; RV-BE-3b/RV-BE-11 are the
items this design was shaped against) · `riviera-docs-freshness` (N/A at plan time — due
at close-out over the slice's merge range; phase 5 pre-lists its known targets) ·
`grilling` (intake grill — surfaced the cycle constraint that makes the port shape the
whole slice) · `riviera-modulith` + `references/boundaries.md` (the `spi` inversion
precedent #44/`BookingPresence`; settled port placement and the no-grant-change fact) ·
`codebase-design` (port depth: return the *verdict*, never a close instant for the caller
to compare — keeps the comparison, i.e. the rule's boundary semantics, in `booking`) ·
`domain-modeling` (glossary check: **Sales close** is already canonical in `CONTEXT.md`;
no new term, no ADR — the decision is neither hard-to-reverse nor surprising given #44) ·
`riviera-java-conventions` (records-first: additive record component appended last;
package-private adapter; no magic literals) · `postgres` N/A — no migration, no schema
change · `riviera-frontend` (placement: badge in `pages/home`, closed state in
`venue/venue-map`, type on `shared/venue-views.ts` whose editor of record is the venue
feature; no new cross-feature edge) · `riviera-tailwind` (chip family + inert marker
classes; reuse the one semantic-chip fill so `chip-fills.ts`/contrast specs/e2e hexes stay
untouched) · `angular-developer` + angular-cli MCP `get_best_practices` v22 +
`search_documentation` (signals/`computed()` for the card view-model, native `@if`, no
`ngClass`; doc checks recorded in the phase notes) · `playwright-cli` (mocked-suite spec
shape: `page.route` + `page.clock.setFixedTime`, extending the #797 files).

**Branch:** `claude/sdlc-793-implement-1d1ojx` — the implement session's designated remote
branch, restarted from `claude/sdlc-793-planning-w3bg4k` (the plan-only session's branch)
so the plan doc rides in the PR; stands in for `feature/discover-sales-open` (riviera-sdlc
cloud addendum; recorded per the Branch-line rule).

---

## Acceptance criteria (testable)

> Written at the application boundary (the ports and views), not the HTTP or Angular
> layer; adapter-level assertions live in the named ITs/specs.

- [ ] **AC-1:** Given venue A (`sales_close 16:00`) and venue B (`sales_close 23:59`) both
  visible, when `VenueCatalog.listVenues(filter, today)` is evaluated at 17:00
  `Europe/Tirane`, then A's `VenueSummaryView.salesOpen()` is `false` and B's is `true`.
  *Pinned by:* `VenueListControllerIT.listCarriesPerVenueSalesOpenForToday`
- [ ] **AC-2:** Given the same fixture, when `listVenues` is evaluated for **tomorrow**,
  then every venue's `salesOpen()` is `true` (future dates are open everywhere — no
  special-casing, the rule alone produces it). *Pinned by:*
  `VenueListControllerIT.futureDatesAreOpenAtEveryVenue`
- [ ] **AC-3:** Given venue A after its close, when `VenueCatalog.findVenueMap(A, today)`
  is evaluated, then `VenueMapView.salesOpen()` is `false`; for tomorrow it is `true`.
  *Pinned by:* `VenueReadControllerIT.mapCarriesSalesOpenForSelectedDate`
- [ ] **AC-4:** Given any `(salesClose, date, now)`, when `venue.spi.SalesWindow.isOpen`
  is asked, then the answer equals `BookingCutoff.isBookable(salesClose, date, now)` —
  including the boundary: at exactly `D at sales_close` the answer is `false`
  (strictly-before, the reserve path's convention). *Pinned by:*
  `BookingCutoffSalesWindowTest.delegatesToTheCutoffAuthority` (+ `closedAtTheExactCloseInstant`)
- [ ] **AC-5:** Given a Discover card for a venue with `salesOpen: false`, when the list
  renders, then the card shows the "Sales closed for today" chip AND the card's
  `aria-label` carries the closed state (the card body is `aria-hidden`); a venue with
  `salesOpen: true` shows no chip. *Pinned by:* `home.spec.ts` ("badges a venue whose
  online sales for today have closed") + `home.a11y.spec.ts` (axe over the closed fixture)
- [ ] **AC-6:** Given the venue map loaded with `salesOpen: false`, when it renders, then
  the closed state (`data-testid="map-sales-closed"`) is visible, no set tile is
  selectable (the booking dialog cannot be opened), and picking tomorrow from the date
  picker refetches and restores the normal bookable map. *Pinned by:*
  `venue-map.spec.ts` ("sales-closed map disables set selection and recovers on a date change")
- [ ] **AC-7:** Given a deep link `/venues/{id}?date=<today>` to a closed venue, when the
  page loads, then the closed state shows instead of a bookable map, and changing the date
  to tomorrow recovers — mocked end-to-end with axe coverage. *Pinned by:*
  `same-day-booking.e2e.ts` ("deep link to a closed venue's map shows the closed state, and
  tomorrow recovers")
- [ ] **AC-8:** Given the browse for today at 17:00 with one closed and one open venue,
  when the tourist browses and opens the closed venue, then the badge is visible on the
  closed card only and the map path shows the closed state — mocked end-to-end, axe-clean.
  *Pinned by:* `same-day-booking.e2e.ts` ("browse today after a venue's close shows the
  badge and the closed-map path")

## Non-goals

- **No operator control of `sales_close`** — read-only until #794 (the PATCH contract must
  not change mid-epic). **No non-refundable disclosure copy** — #795.
- **No hiding, filtering, or re-sorting** of closed venues — badge only; a closed venue
  stays discoverable and navigable (the issue's "no dead-end" is a state, not removal).
- **No badging of availability-calendar days** — the calendar deliberately reports
  *availability, not bookability* (`RESPONSIBILITIES.md` §`venue`); wiring the sales
  window into it would contradict a stated contract.
- **No polling / live refresh** of the open state (see the staleness decision, R-4).
- **No new error code, no new endpoint, no PATCH change** — the flag rides the two
  existing tourist reads; `BOOKING_CLOSED` (422) remains the reserve-path backstop.
- **No new chip fill or negative-variant styling** — the closed chip reuses the
  semantic-chip family as-is (Open question OQ-1 records the review-time check).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — additive behavior; no surface is retired or replaced. (The map's closed state is a
new branch beside `map-not-found`/`map-empty`; the bookable map for open venues/dates is
byte-identical.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A second source of truth: `venue` (or the FE) re-deriving `now < D@sales_close` instead of consulting `booking`'s rule — the exact review finding `RESPONSIBILITIES.md` warns about | med | high | the `venue.spi.SalesWindow` port returns the **verdict** (boolean), never a close instant to compare; no time arithmetic lands in `venue` or the FE; AC-4 pins delegation incl. the boundary case | session | open |
| R-2 | Module cycle `venue → booking` (booking already depends on `venue::api`) | low | high | `spi` inversion (compile edge stays `booking → venue`); `booking` already granted `venue::spi`; `ModularityTests` run in phase 0 | session | open |
| R-3 | Appending a record component to the published `VenueSummaryView`/`VenueMapView` breaks positional constructors across tests/fixtures | high | low | append `salesOpen` **last** in both records; compile-driven sweep of construction sites in the same phase; structural net re-run | session | open |
| R-4 | Badge staleness: a page held open across a venue's close (or a mid-day #794 flip, later) keeps showing "open" | med | low | **accepted residual**, same class as `Home.minDate`'s documented midnight residual: the verdict is server-computed per fetch, refreshed on every date/filter change and navigation; the reserve path stays authoritative and the dialog's today-aware `BOOKING_CLOSED` copy (#797) is the backstop | session | open |
| R-5 | a11y: the Discover card body is `aria-hidden="true"`, so a visual-only badge is invisible to AT | high | med | fold the closed state into `Home.toCard`'s `ariaLabel`; `home.a11y.spec.ts` + the e2e axe pass cover it | session | open |
| R-6 | Per-row clock reads: N `clock.instant()` calls while mapping the list could disagree mid-list | low | low | capture **one** `Instant now` per catalogue call and reuse it for every row (the `ReserveSetService` one-instant discipline) | session | open |
| R-7 | e2e timezone drift: fixed-clock instants vs `Europe/Tirane` (+02:00 in season) off-by-an-hour | med | med | reuse `same-day-booking.e2e.ts`'s existing `TODAY`/`BEFORE_CLOSE` constants; add `AFTER_CLOSE = 2026-08-30T15:00:00Z` (= 17:00 Tirane) beside them | session | open |
| R-8 | Error contract (§6b): none — no new request DTO, no new error response; additive response fields only | low | low | FE types updated in `shared/venue-views.ts`, no `as any` | session | open |

Flyway: no version claimed — no migration in this slice (checked against `main` at V44 and
the open-PR set, which is dependabot-only).

## Open questions / Assumptions

- **Assumption (OQ-1):** reusing the single semantic-chip fill (badge presence alone
  distinguishes closed from open) satisfies AC "visibly distinguishes"; no negative-color
  variant is needed. If review or the maintainer disagrees, the variant lands with its
  `chip-fills.ts` + contrast-spec + e2e-hex triple updated together
  (`riviera-tailwind`). — *Owner:* session · *Resolves by:* phase 2 / review gate
- **Assumption (OQ-2):** a **past-date** deep link to the map (reachable only by URL
  editing; the picker floors at today) rendering the closed state is correct behavior —
  the rule's verdict is honestly `false` and the date picker offers recovery. — *Owner:*
  session · *Resolves by:* phase 3
- **Deviation (D-1, phase 1):** AC-1/AC-3's prescribed fixture (venue pair 16:00/23:59
  evaluated at a mocked 17:00 clock) is realized instead with the repo's established
  boundary-venue trick — the ITs deliberately never mock the `Clock` bean (#791/#792
  precedent): a `00:01` opt-out venue is deterministically closed for today and a `23:59`
  venue open, guarded by a near-midnight `Assumption`. The same per-venue open/closed
  contrast is pinned; the exact 16:00 boundary arithmetic stays pinned by
  `BookingCutoffSalesWindowTest` (AC-4). — *Owner:* session · *Status:* resolved (convention
  over new harness)
- **Assumption (OQ-3):** the closed-map state disables set *selection* while still
  rendering the grid and its availability (the issue asks for "no bookable set selection",
  not a hidden map). — *Owner:* session · *Resolves by:* phase 3

## Availability & concurrency (invariant #2)

This slice is **read-only**: it adds a projection to the tourist catalogue reads and
touches no reserve, claim, or release path.

- **Write paths to `availability(set_id, booking_date)`:** none in scope. The online
  claim, staff tap-to-mark, cancellation/decline/expiry/withdraw releases, and the weather
  refund are all untouched.
- **Uniqueness guarantee / concurrency strategy / pool rule (invariants #2, #3):**
  untouched — no code in those paths changes.
- **Cutoff rule (invariant #4) — the section's core:** the browse verdict is computed by
  the *same* `BookingCutoff.isBookable(salesClose, bookingDate, now)` the reserve path
  enforces, reached through `venue.spi.SalesWindow` — one rule, one home, no re-derivation
  (AC-4 pins the delegation and the strictly-before boundary). A `false` verdict on the
  browse is display; the reserve path keeps enforcing independently, so a stale "open"
  badge can never create a booking past the close.
- **Pinning tests:** `BookingCutoffSalesWindowTest` (boundary), `VenueListControllerIT` /
  `VenueReadControllerIT` (projection), existing `ConcurrentReservationIT` untouched and
  still green.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | Owns the tourist catalogue reads and the `sales_close` datum; declares the driven port and projects the verdict onto its views |
| M-2 | `booking` | existing | `Booking` | Owns the sales-window rule (`BookingCutoff`, unexported); implements the driven port |

**Cross-module named interfaces (`api/` + `spi/` ports)**

| # | Module.surface | Port | Public types | Consumers / implementor |
|---|---|---|---|---|
| NI-1 | `venue.spi` (**new port, existing surface**) | `SalesWindow#isOpen(LocalTime salesClose, LocalDate bookingDate, Instant now)` | JDK types only | implemented by `booking` (`adapter/out`); called by `venue`'s `JdbcVenueCatalog` — sits beside `SetAvailabilityLookup` (#44) and `BookingPresence` |

No `allowedDependencies` change anywhere: `booking` already lists `venue::spi` (it
implements `BookingPresence`); `venue` calls its own `spi`. `VenueApiRoleSplitTests` is
unaffected (no new `VenueCatalog` consumer). Not a `booking::api` port granted to `venue`
— that edge would cycle (`booking → venue` is the granted direction); not a root/edge
composition — the edge is scoped to login/session machinery (RV-BE-11) and
`VenueApiRoleSplitTests` forbids handing `VenueCatalog` outward.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none new; none changed | | | | | `ModularityTests` (verify); the five-event inventory in CLAUDE.md unchanged |

**Doc checks (plan-time, recorded — fetched directly from `docs.spring.io`):** the Spring
Modulith fundamentals chapter's own worked example for named-interface grants is
`@ApplicationModule(allowedDependencies = "order :: spi")` — *"code in inventory would be
allowed to depend on SomeSpiInterface and other code residing in the order.spi interface,
but not on OrderManagement"* — exactly the `venue::spi` shape this plan reuses (the
verbatim grant already in `booking/package-info.java` on `main`; the docs render the
syntax with spaces, whitespace-insensitively). The verification chapter states
`ApplicationModules.verify()` enforces *"No cycles on the application module level — the
dependencies between modules have to form a directed acyclic graph"*, *"Efferent module
access via API packages only — all references to types that reside in application module
internal packages are rejected"*, and that with `allowedDependencies` configured,
*"dependencies to other application modules are rejected"* — the documented ground for
this plan's central constraint (`venue` may never call a `booking` port; the `spi`
inversion is the sanctioned escape, phase 0 runs the test). The Spring Framework JDBC
core chapter confirms `JdbcClient` as the **unified client API** (*"As of 6.1, the named
parameter statements of NamedParameterJdbcTemplate and the positional parameter
statements of a regular JdbcTemplate are available through a unified client API with a
fluent interaction model"*) — so the `JdbcVenueCatalog` change (adding `sales_close` to
two SELECTs with named-param binding) stays on the current documented API, not a legacy
one. Sources: Spring Modulith reference `fundamentals.html` + `verification.html`, Spring
Framework reference `data-access/jdbc/core.html`.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store `sales_close`; select it in the catalogue reads; carry the verdict on the tourist views | `venue` | `venue` Job: venue profiles/settings + the catalogue reads (the #693 fence precedent puts read-side composition in its adapter); it stores the time, never computes with it |
| Decide "are online sales for date D open now" | `booking` | `booking` Job: "own all of the day's boundaries on `BookingCutoff`"; `availability` Not-My-Job explicitly assigns this rule to `booking`; **not** `venue` (store-vs-decide split, same as commission: `venue` stores the rate, `payout` computes) |
| The FE badge and closed-map state | frontend `pages/home` + `venue/` + `shared/` | Display of a server-computed fact; the FE never computes the close (`cutoff-note` precedent: "the server enforces the real cutoff") |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves, no Stripe surface, no ledger effect; the
`BOOKING_CLOSED` refusal contract this slice leans on is unchanged.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/venue-views.ts` (`VenueSummary`, `VenueMapView` gain `salesOpen: boolean`) | existing | published API-view vocabulary | — | — |
| FE-2 | `pages/home/home.ts` + `.html` (card badge + `ariaLabel`) | existing | standalone component | `VenueCard` built in the existing `venuesView` `computed()` — template stays method-free | — |
| FE-3 | `venue/venue-map.ts` + `.html` (closed state + tile gate) | existing | standalone component | `salesClosed` as `computed()` off the loaded map; tile `bookable` gains `&& map.salesOpen`; existing per-date refetch is the recovery path | — |
| FE-4 | `pages/home/home.spec.ts`, `home.a11y.spec.ts`, `venue/venue-map.spec.ts`, `venue-map.a11y.spec.ts` | existing | Vitest/jsdom specs | — | — |

**Standards:** v22 posture per the angular-cli MCP — signals + `computed()` for derived
state, native `@if` (no `ngClass`/`ngStyle`; conditional *presence*, not class
switching), no new components or forms machinery, zoneless-safe (pure signal reads in
templates). No deviation planned.

**Doc checks (plan-time, recorded):** angular.dev v22 index confirms `computed()` as the
derived-state API (guide/signals; tutorials/signals/2) and native `@if` control flow
(essentials/templates) — both current, not deprecated; the a11y guide
(best-practices/a11y) confirms static ARIA attributes written as plain HTML attributes and
`[attr.aria-label]` bindings, and its "augment native elements via attribute selectors"
guidance is the pattern the card/chip already follow. Tailwind v4 docs
(adding-custom-styles) confirm arbitrary values `top-[14px]`/`right-[14px]` as documented
syntax ("theme tokens first, arbitrary to break out" — matching this repo's deliberate
`text-[14px]` convention, `riviera-tailwind` rule 5). One nuance carried into phase 3: a
`role="status"` region announces *changes*; content already present at initial render may
not be read — acceptable, since the banner's `aria-label`-independent text serves the
initial load and the status role targets the date-change transition.

## FE↔BE contract

- **Changed endpoints (additive):** `GET /api/venues?date=` items and
  `GET /api/venues/{venueId}?date=` gain `salesOpen: boolean` — always present, computed
  for the *selected* date at request time. Future dates are `true` by the rule (no
  client-side special-casing). No request-shape change.
- **Client typing:** hand-written types in `shared/venue-views.ts` gain the field; no
  `as any`.
- **Money/date on the wire:** untouched (ISO `LocalDate` dates; no money in scope).

## Execution status

> Session-recovery anchor. Update in the same commit window as the change it records.

**Stage pointer:** implement — phases 0–4 done (backend port + projection, badge, map
closed state, mocked e2e journeys; full mocked suite green).

**Next action:** phase 5 — RESPONSIBILITIES.md updates, plan-doc close-out, merge latest
origin/main, CI green, stop for external review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `venue.spi.SalesWindow` + booking implementor | ✅ | "Add venue.spi.SalesWindow implemented by booking (#793)" |
| 1 — catalogue projection (`salesOpen` on both views) | ✅ | "Carry per-venue salesOpen on the tourist catalogue reads (#793)" |
| 2 — Discover badge + aria | ✅ | "Badge closed-for-today venues on Discover (#793)" |
| 3 — map closed state + recovery | ✅ | "Show a sales-closed state on the tourist map (#793)" |
| 4 — mocked e2e + a11y | ✅ | "e2e: badge + closed-map journeys for same-day sales close (#793)" |
| 5 — substrate docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

- `docs/plans/discover-sales-open.md` — this plan.
- `platform/src/main/java/ai/riviera/platform/venue/spi/SalesWindow.java` — the new driven port.
- `platform/src/main/java/ai/riviera/platform/venue/spi/package-info.java` — Javadoc port list 2→3.
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueSummaryView.java` — `salesOpen` appended.
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — `salesOpen` appended.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — `sales_close` in both SELECTs; one-instant verdict per request via the port.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/BookingCutoffSalesWindow.java` — the implementor.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/BookingCutoffSalesWindowTest.java` — AC-4.
- `platform/src/test/java/ai/riviera/platform/venue/VenueListControllerIT.java` — AC-1/AC-2.
- `platform/src/test/java/ai/riviera/platform/venue/VenueReadControllerIT.java` — AC-3.
- `platform/src/test/java/ai/riviera/platform/**/*.java` — record-constructor sweep for the two widened views (compile-driven; exact set found in phase 1).
- `frontend/src/app/shared/venue-views.ts` — `salesOpen` on both types.
- `frontend/src/app/pages/home/home.ts` · `.html` — `VenueCard.salesClosed` + chip + `ariaLabel`.
- `frontend/src/app/pages/home/home.spec.ts` · `home.a11y.spec.ts` — AC-5.
- `frontend/src/app/venue/venue-map.ts` · `.html` — closed state, tile gate, recovery.
- `frontend/src/app/venue/venue-map.spec.ts` · `venue-map.a11y.spec.ts` — AC-6.
- `frontend/e2e/same-day-booking.e2e.ts` — AC-7/AC-8 (after-close journeys).
- `frontend/e2e/discovery-flow.e2e.ts` — future-date no-badge pin (mock fixtures gain `salesOpen`).
- `RESPONSIBILITIES.md` — §`venue` (third spi port bullet) + §`booking` (rule consumer note).

---

## Phase 0 — `venue.spi.SalesWindow` + the booking implementor

**Files:** Create `venue/spi/SalesWindow.java`, `booking/adapter/out/BookingCutoffSalesWindow.java`,
`booking/adapter/out/BookingCutoffSalesWindowTest.java` · Modify `venue/spi/package-info.java`

- [x] **Step 1: Write the failing test**

```java
package ai.riviera.platform.booking.adapter.out;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ai.riviera.platform.booking.application.BookingCutoff;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class BookingCutoffSalesWindowTest {

    private final BookingCutoffSalesWindow window =
            new BookingCutoffSalesWindow(new BookingCutoff(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC)));

    private static final LocalDate DATE = LocalDate.of(2026, 8, 30);
    private static final LocalTime FOUR_PM = LocalTime.of(16, 0);
    private static final Instant BEFORE_CLOSE = Instant.parse("2026-08-30T13:59:00Z");
    private static final Instant AT_CLOSE = Instant.parse("2026-08-30T14:00:00Z");

    @Test
    void delegatesToTheCutoffAuthority() {
        assertTrue(window.isOpen(FOUR_PM, DATE, BEFORE_CLOSE));
        assertFalse(window.isOpen(FOUR_PM, DATE, AT_CLOSE));
        assertTrue(window.isOpen(FOUR_PM, DATE.plusDays(1), AT_CLOSE));
    }

    @Test
    void closedAtTheExactCloseInstant() {
        assertFalse(window.isOpen(FOUR_PM, DATE, AT_CLOSE));
    }
}
```

(2026-08-30 is CEST, `Europe/Tirane` = UTC+02:00 → 16:00 local = 14:00Z.)

- [x] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*BookingCutoffSalesWindowTest*"` → FAIL (class does not exist)

- [x] **Step 3: Minimal implementation**

```java
package ai.riviera.platform.venue.spi;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Driven port: is a venue's online sales window for {@code bookingDate} open at {@code now}?
 * Venue supplies its stored sales-close and one request-scoped instant; the implementor owns
 * the rule and its boundary semantics (invariant #4). Rationale: RESPONSIBILITIES.md §booking.
 */
public interface SalesWindow {
    boolean isOpen(LocalTime salesClose, LocalDate bookingDate, Instant now);
}
```

```java
package ai.riviera.platform.booking.adapter.out;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.venue.spi.SalesWindow;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import org.springframework.stereotype.Component;

@Component
class BookingCutoffSalesWindow implements SalesWindow {

    private final BookingCutoff cutoff;

    BookingCutoffSalesWindow(BookingCutoff cutoff) {
        this.cutoff = cutoff;
    }

    @Override
    public boolean isOpen(LocalTime salesClose, LocalDate bookingDate, Instant now) {
        return cutoff.isBookable(salesClose, bookingDate, now);
    }
}
```

Update `venue/spi/package-info.java`'s Javadoc so the port inventory names all three.

- [x] **Step 4: Run it, verify it passes** —
  `./gradlew test --tests "*BookingCutoffSalesWindowTest*"` → PASS

> End-of-phase regression: `./gradlew test --tests "*ModularityTests*" --tests
> "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` — the
> structural net, mandatory after any backend structure change.

- [x] **Step 5: Generalization-audit pass** — N/A (no bug fix; the pattern is the
  established #44 shape, not a new one)

- [x] **Step 6: Commit** — `git commit -m "Add venue.spi.SalesWindow implemented by booking (#793)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window. Open the
  draft PR now (first phase commit exists — CI needs the `pull_request` event).

---

## Phase 1 — catalogue projection: `salesOpen` on both tourist views

**Files:** Modify `venue/vocabulary/VenueSummaryView.java`, `VenueMapView.java`,
`venue/adapter/out/JdbcVenueCatalog.java` · Test `venue/VenueListControllerIT.java`,
`venue/VenueReadControllerIT.java` (+ compile-driven record-ctor sweep)

- [x] **Step 1: Write the failing tests** — in `VenueListControllerIT` (following its
  existing fixture style; the mocked-clock harness is the one the reserve ITs use):

```java
@Test
void listCarriesPerVenueSalesOpenForToday() {
    // venue A sales_close 16:00, venue B 23:59; clock fixed at 17:00 Europe/Tirane today
    // GET /api/venues?date=<today> → A.salesOpen == false, B.salesOpen == true
}

@Test
void futureDatesAreOpenAtEveryVenue() {
    // same fixture, date=<tomorrow> → every item salesOpen == true
}
```

  and in `VenueReadControllerIT`:

```java
@Test
void mapCarriesSalesOpenForSelectedDate() {
    // GET /api/venues/{A}?date=<today> at 17:00 Tirane → salesOpen == false
    // GET /api/venues/{A}?date=<tomorrow>              → salesOpen == true
}
```

- [x] **Step 2: Run, verify FAIL** —
  `./gradlew test --tests "*VenueListControllerIT*" --tests "*VenueReadControllerIT*"`
  → FAIL (no `salesOpen` in the JSON)

- [x] **Step 3: Minimal implementation**
  - Append `boolean salesOpen` as the **last** component of `VenueSummaryView` and
    `VenueMapView` (positional-ctor churn minimized; sweep the compile errors).
  - `JdbcVenueCatalog`: add `sales_close` to the `listVenues` and `findVenueMap` venue
    SELECTs; inject `SalesWindow` and `Clock` (constructor, final fields); capture
    `Instant now = clock.instant()` **once per call** and compute
    `salesWindow.isOpen(row.salesClose(), date, now)` per row (R-6). The #693 visibility
    fence and the `SetAvailabilityLookup` overlay are untouched and stay in their current
    order.

- [x] **Step 4: Run, verify PASS** — same targeted commands, then the venue-module
  regression: `./gradlew test --tests "*VenueCatalogVisibilityIT*" --tests "*Venue*IT*"`
  (Testcontainers; skips cleanly without Docker — CI is the backstop).

- [x] **Step 5: Generalization-audit pass** — population: *call sites constructing the two
  widened records* → enumerate `grep -rn "new VenueSummaryView\|new VenueMapView" platform/src`
  → fix all (compile errors make the sweep total). Append to the log below.

- [x] **Step 6: Commit** — `git commit -m "Carry per-venue salesOpen on the tourist catalogue reads (#793)"`

- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Discover badge + aria

**Files:** Modify `shared/venue-views.ts`, `pages/home/home.ts`, `pages/home/home.html` ·
Test `pages/home/home.spec.ts`, `pages/home/home.a11y.spec.ts`

- [x] **Step 1: Write the failing specs** — `home.spec.ts`: with a fixture of one
  `salesOpen: false` and one `salesOpen: true` venue, assert the closed card renders the
  `sales-closed-chip` marker with the copy "Sales closed for today", the open card renders
  none, and the closed card's `aria-label` contains the closed state.
  `home.a11y.spec.ts`: extend the flushed fixture with a closed venue; `expectNoAxeViolations`.

- [x] **Step 2: Run, verify FAIL** — `npm test -- --run home.spec` → FAIL

- [x] **Step 3: Minimal implementation**
  - `shared/venue-views.ts`: `salesOpen: boolean` on `VenueSummary` (and `VenueMapView`
    for phase 3).
  - `home.ts`: `VenueCard` gains `salesClosed: boolean` (from `!venue.salesOpen`, inside
    the existing `venuesView` `computed()`); `toCard`'s `ariaLabel` gains
    `", online sales for today have closed"` when closed.
  - `home.html`, inside the card beside the existing mode chip (which sits top-left):

```html
@if (card.salesClosed) {
  <span appSemanticChip class="sales-closed-chip absolute top-[14px] right-[14px]">
    Sales closed for today
  </span>
}
```

  Same `appSemanticChip` fill as the mode chip (a platform claim about how booking will
  go); `sales-closed-chip` is the inert marker class specs query (`riviera-tailwind` rule
  2). Non-interactive — no touch-target declaration due.

- [x] **Step 4: Run, verify PASS** — `npm test -- --run home.spec` then
  `npm run test:a11y`; `npm run lint && npm run format:check`.

- [x] **Step 5: Generalization-audit pass** — N/A (no bug fix; chip pattern reused, not invented)

- [x] **Step 6: Commit** — `git commit -m "Badge closed-for-today venues on Discover (#793)"`

- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — map closed state + recovery

**Files:** Modify `venue/venue-map.ts`, `venue/venue-map.html` · Test
`venue/venue-map.spec.ts`, `venue/venue-map.a11y.spec.ts`

- [x] **Step 1: Write the failing specs** — `venue-map.spec.ts`: with the map response
  stubbed `salesOpen: false`, assert `data-testid="map-sales-closed"` is rendered, no set
  tile is selectable (clicking a FREE online-pool tile does not open the booking dialog),
  and after a date change to tomorrow with a `salesOpen: true` response the closed state
  is gone and tiles select normally (the non-latching pin). `venue-map.a11y.spec.ts`:
  closed fixture, `expectNoAxeViolations`.

- [x] **Step 2: Run, verify FAIL** — `npm test -- --run venue-map` → FAIL

- [x] **Step 3: Minimal implementation**
  - `venue-map.ts`: `salesClosed = computed(() => this.map()?.salesOpen === false)`; the
    tile-bookability derivation gains `&& map.salesOpen` beside the existing
    `availability === 'FREE' && pool === 'ONLINE'` test.
  - `venue-map.html`: a closed banner rendered above the canvas when `salesClosed()` —
    `role="status"`, `data-testid="map-sales-closed"`, copy keyed on the selected date
    (mirroring the #797 dialog split): today →
    "Online sales for today have closed at this venue. Pick another day — every venue is
    open for future dates."; any other (past-URL) date → "Online sales for that date have
    closed at this venue. Pick a later day." The banner is **date-dependent**, so it
    points back at the existing date picker (`map-date` stays enabled) — the mirror of
    `map-empty`'s date-independent "send them onward" guidance. The grid stays rendered
    (OQ-3); no navigation is removed, so deep-link recovery is the existing per-date
    refetch (no new plumbing).

- [x] **Step 4: Run, verify PASS** — `npm test -- --run venue-map` then
  `npm run test:a11y`; `npm run lint && npm run format:check`.

- [x] **Step 5: Generalization-audit pass** — population: *renderers of tile bookability*
  → enumerate `grep -rn "availability === 'FREE'" frontend/src` → verify every site
  honors the sales gate or is out of scope (staff/live map is walk-in, deliberately
  ungated — sales close fences *online* sales only, invariant #4). Append to the log.

- [x] **Step 6: Commit** — `git commit -m "Show a sales-closed state on the tourist map (#793)"`

- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — mocked e2e + a11y

**Files:** Modify `frontend/e2e/same-day-booking.e2e.ts`, `frontend/e2e/discovery-flow.e2e.ts`

- [x] **Step 1: Write the failing e2e** — in `same-day-booking.e2e.ts`, beside the
  existing `TODAY`/`BEFORE_CLOSE` constants, add
  `const AFTER_CLOSE = new Date('2026-08-30T15:00:00Z');` (= 17:00 `Europe/Tirane`) and:
  - **AC-8:** fixed clock at `AFTER_CLOSE`; `/api/venues` mock with a `salesOpen: false`
    16:00 venue and a `salesOpen: true` 23:59 venue → the badge shows on the closed card
    only; click through → map mock `salesOpen: false` → `map-sales-closed` visible;
    `expectNoSeriousAxeViolations` on both surfaces.
  - **AC-7:** direct `page.goto('/venues/1?date=' + TODAY)` with the closed map mock →
    closed state (not a bookable grid); change the date to tomorrow (map mock
    `salesOpen: true` for that date) → normal map. Axe pass on the closed state.
  - In `discovery-flow.e2e.ts`: extend the `VENUES`/`VENUE_MAP` fixtures with
    `salesOpen: true` and pin **no badge on a future date** (AC-2's UI half).

- [x] **Step 2: Run, verify FAIL** — `npm run test:e2e:a11y -- same-day-booking` → FAIL

- [x] **Step 3: Implementation** — fixtures only (the app code shipped in phases 1–3);
  align mock shapes with the widened views.

- [x] **Step 4: Run, verify PASS** — `npm run test:e2e:a11y` (the CI-safe suite in full).

- [x] **Step 5: Generalization-audit pass** — population: *e2e fixtures mocking
  `/api/venues` responses* → enumerate `grep -rln "api\\/venues" frontend/e2e` → add
  `salesOpen` where a spec's mock now misses a required field. Append to the log.

- [x] **Step 6: Commit** — `git commit -m "e2e: badge + closed-map journeys for same-day sales close (#793)"`

- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — substrate docs + close-out

**Files:** Modify `RESPONSIBILITIES.md`, `docs/plans/discover-sales-open.md`

- [ ] `RESPONSIBILITIES.md` §`venue`: a third spi bullet beside
  `SetAvailabilityLookup`/`BookingPresence` (the sales-window verdict consulted by the
  catalogue reads); §`booking`: note the rule now also answers the browse via
  `venue.spi.SalesWindow` — same authority, second consumer.
- [ ] Counting-sweep targets (`riviera-docs-freshness` at merge close-out): the
  `venue/spi/package-info.java` two-port sentence (done in phase 0), any "two SPI ports"
  phrasing, `venue/package-info.java`'s "the one module that owns a cross-module
  dependency inversion" (still true — venue remains the sole owner; the *count* inside it
  grows), CLAUDE.md's `venue` module row (no change expected — it doesn't enumerate spi
  ports), `CONTEXT.md` (no change — **Sales close** already canonical).
- [ ] Run `node scripts/check-plan-file-structure.mjs --diff origin/main` with the plan
  doc staged; reconcile.
- [ ] Finalize Execution status (stage pointer DONE, `merged via PR #NN`, findings
  resolved, Open Questions empty or issue-linked) **in the PR's own last commit**.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-28 | phase 4 (e2e fixtures for the widened views) | e2e fixtures mocking `/api/venues` responses | `grep -rln "api\\/venues" frontend/e2e` | 15 files | tourist-surface fixtures asserting the badge/closed state carry `salesOpen` (same-day-booking, discovery-flow); every other mock omits it legitimately — the FE closes only on an explicit `false`, so an omitting mock renders the unchanged open surface (the typed-optional contract); real-backend suite gets the field from the real API |
| 2026-08-28 | phase 3 (tile sales gate) | renderers of tile bookability | `grep -rn "availability === 'FREE'" frontend/src` | 3 | `venue-map.toTile` gated; `venue-map.freeCount` + operator `console-stats-strip` are free-count displays, not selection — the staff/walk-in surface is deliberately ungated (invariant #4 fences online sales only) |
| 2026-08-28 | phase 1 (widened `VenueSummaryView`/`VenueMapView`) | call sites constructing the two widened records | `grep -rn "new VenueSummaryView\|new VenueMapView" platform/src` | 2 (both in `JdbcVenueCatalog`) | both pass the verdict; compile sweep clean, no other constructors |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-2:** `./gradlew test --tests "*VenueListControllerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** `./gradlew test --tests "*VenueReadControllerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** `./gradlew test --tests "*BookingCutoffSalesWindowTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** `npm test -- --run home.spec` + `npm run test:a11y` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** `npm test -- --run venue-map` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7/AC-8:** `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (read-only slice; concurrency paths untouched, invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — one rule, consulted, never re-derived.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event changes (invariant #11).
- [ ] **Payment/payout** N/A upheld — no payment code in the diff.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: verdict computed from one UTC `Instant` against `Europe/Tirane` wall-clock (invariant #6), only inside `booking`.
- [ ] Booking codes untouched (invariant #7).
- [ ] No Flyway migration needed and none added (invariant #12).
- [ ] **Frontend** standards met (v22 posture, signals, native control flow); no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state citing `merged via PR #NN`; no docs-only follow-up.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
