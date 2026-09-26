# Discovery stay verdict (multi-day stays 8/12) Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** On the discovery page a tourist picks a range of days and every venue card and pin says,
in the one request the page already makes, whether that venue has one set free for every day of
it, or cannot host it and why (longest single-set run, or the venue's maximum stay).

**Architecture:** A new closed Spring Modulith read-model module `itinerary` (design D7/D11,
improvement-plan trigger B4) takes over `GET /api/venues`: it calls `venue::api` for the
visibility-fenced list and the online sets per venue, `availability::api` for the taken days per
set over the span, and a pure `domain/` rule turns that grid into one verdict per venue. It
publishes nothing yet (no sibling calls it); slice 10 adds the per-venue itinerary search beside
it. On the frontend the venue page's range calendar is promoted to `shared/` with a count-loader
input so the discovery page can open it venue-less.

**Persistence:** JDBC only (invariant #1). No table, no migration. Reads `set_availability`
through a new `availability::api` port only; `active_set_position` through `venue::api` only.

**Source of intent:** GitHub issue #1206 (epic #1096); `docs/architecture/multi-day-stays.md`
§ D7, D10, D11.

**Skills consulted:** `riviera-sdlc` (intake gate: both blockers merged via PRs #1216 and #1220;
no feature PR open, `docs/plans/` empty, next Flyway `V65` unneeded; four forks put to the owner —
module name `itinerary`, the module's own controller serves `GET /api/venues`, verdict math is a
pure domain rule over taken days, the calendar is promoted to `shared/`) · `riviera-plan-doc`
(forced the parity ledger for the moved mapping, the seam per AC, the cost-measurement phase) ·
`tdd` (one seam per phase: domain rule → application service → HTTP → UI) ·
`riviera-review-overlay` (runs at ready-for-review) · `riviera-docs-freshness` (runs at
close-out over the merge range) · `grilling` (surfaced the 62-day technical ceiling, the dusk-not-fade
contrast rule, the venue page's `See other beaches` links carrying `date` only) ·
`riviera-local-debug` (unshallowed the clone, scoped test commands, JDK at `/opt/jdk-25`) ·
`riviera-modulith` (closed full module, no published surface, `allowedDependencies` least
privilege, `venue::spi` stays granted to `availability` alone so the read gets a new
`availability::api` port) · `riviera-java-conventions` (records, `Optional`, package-private
adapters, Javadoc budget) · `codebase-design` (one batch venue port instead of N per-venue calls;
the verdict rule is the module's deep interface) · `postgres` (the range read stays one
`BETWEEN` on `set_availability_uniq`; the cost IT records `EXPLAIN (ANALYZE, BUFFERS)`) ·
`riviera-frontend` (calendar promotion to `shared/` with a loader input instead of a new
cross-feature edge; `pages/home → venue.service` is the one allowed edge) · `riviera-tailwind`
(hollow pin = the inverse token pair, state also carried by shape per ICON-8; dusk stays
`saturate-0`, never opacity; `border-dotted`/`order-*` verified on tailwindcss.com) ·
`angular-developer` + angular-cli MCP (`linkedSignal`, `toSignal`, `model()`, `httpResource`
looked up for v22; `httpResource` rejected because the repo's rule keeps page reads on
`HttpClient` with owned loading/error state) · `playwright-cli` (the mocked e2e suite).

**Branch:** `claude/tailwind-angular-frontend-g9ph8h` (the cloud session's designated branch,
standing in for `feature/discovery-stay-verdict`; exists before phase 0).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the new `itinerary` module with `allowedDependencies = {venue::api,
  venue::vocabulary, availability::api, shared}`, when the structural net runs, then
  `ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`,
  `DomainPurityArchitectureTests`, `JdbcOnlyArchitectureTests` and
  `RetiredSetExclusionArchitectureTests` all pass. *Seam:* `ApplicationModules.verify()` ·
  *Pinned by:* `ModularityTests.verifiesModularStructure` (and the five siblings).
- [ ] **AC-2:** Given a 4-day span and three visible venues on real map and availability rows —
  A with two online sets free every day and one taken on day 2, B with every online set taken on
  some day and one set free days 1–3, C with `max_stay_days = 2` and a set free every day — when the
  coast verdict is read, then A is `SAME_SET` with `sameSetCount = 2`, B is `CANNOT_HOST` with
  `longestRunDays = 3`, C is `CANNOT_HOST` with `maxStayDays = 2` and `longestRunDays = 4`; a
  walk-in-pool set never counts. *Seam:* `itinerary.application.StayVerdicts.forCoast(venueIds,
  span)` · *Pinned by:* `StayVerdictsIT.sameSetCannotHostAndTooLongVerdicts`.
- [ ] **AC-3:** Given 40 visible venues × 60 online sets × a 14-day span at ~70 % per-day occupancy
  (≈ 23,500 `set_availability` rows), when the coast verdict is read five times after one warm-up,
  then each read completes under 2 s (a never-flaking bound) and the median wall time, the row count
  and the `EXPLAIN (ANALYZE, BUFFERS)` of the range read are printed and copied into this plan's
  *Cost measurement* section before merge. *Seam:* `StayVerdicts.forCoast` +
  `availability.api.SetAvailabilityFacts.takenDaysBetween` · *Pinned by:*
  `CoastVerdictCostIT.peakShapeCoastReadIsMeasured`.
- [ ] **AC-4:** Given `GET /api/venues?date=D&lastDate=D+3`, when the list is served, then every
  entry carries `stay: {verdict, sameSetCount, longestRunDays, maxStayDays}` matching AC-2, the
  entries keep every field the single-day list has, and `lastDate` before `date` or a span over 62
  days is `400`. *Seam:* HTTP `GET /api/venues` · *Pinned by:*
  `DiscoveryListControllerIT.rangeListCarriesAVerdictPerVenue`, `.invertedRangeIs400`.
- [ ] **AC-5:** Given `GET /api/venues?date=D` (no `lastDate`), when the list is served, then no
  entry has a `stay` key and `VenueListControllerIT` passes unchanged as the parity oracle. *Seam:*
  HTTP `GET /api/venues` · *Pinned by:* `DiscoveryListControllerIT.oneDayListIsUnchanged` +
  `VenueListControllerIT` (untouched).
- [ ] **AC-6:** Given the discovery page, when the day rail is opened, then its last chip reads
  "Several days…" and pressing it opens the range calendar; choosing a first and last day closes it,
  shows the range on the day chip and requests `/api/venues?date&lastDate`. *Seam:* `DiscoverHead`
  inputs/outputs + `Home` template · *Pinned by:* `discover-head.spec.ts` ("offers Several days as
  the rail's last chip"), `home.spec.ts` ("requests the coast for the chosen range").
- [ ] **AC-7:** Given a range response, when cards, rows and pins render, then a `SAME_SET` venue
  reads "Same set all 4 days · 2 sets", a `CANNOT_HOST` venue reads "Can't host 4 days · up to 3 in
  a row" (or "Stays of up to 2 days here" when the maximum is the reason), wears the dusk skin and
  sorts after every hosting venue of its beach group; a `CANNOT_HOST` pin is hollow; every fact
  rides the accessible name. *Seam:* `VenueCard` view model, `groupByBeach`, `VenuePinLayer` ·
  *Pinned by:* `home.spec.ts` ("a venue that can't host sinks in its beach group"),
  `venue-card` mapping specs, `venue-pin-layer.spec.ts` ("a can't-host pin is hollow"),
  `venue-pin-layer.contrast.spec.ts` (hollow ink over fill ≥ 4.5:1 in all three themes).
- [ ] **AC-8:** Given a chosen range, when a card, a row or a pin's preview opens the venue, then
  the venue page receives `?date&lastDate` and shows the same stay; the venue page's "See other
  beaches" links carry `lastDate` back; a range arriving in `?lastDate` seeds the discovery page.
  *Seam:* router query params · *Pinned by:* `home.spec.ts` ("carries the range into the venue
  link"), `venue-map.spec.ts` ("other-beaches links keep the stay"), mocked e2e
  `discovery-stay.e2e.ts`.
- [ ] **AC-9:** Given a single day is chosen, when the discovery page renders, then the request
  has no `lastDate`, the cards show the sets-free line exactly as today and nothing is re-ordered.
  *Seam:* HTTP mock + DOM · *Pinned by:* `discovery-flow.e2e.ts` (untouched) and
  `discovery-stay.e2e.ts` ("a single day is today's page").
- [ ] **AC-10:** Given the calendar promoted to `shared/` with a `loadCounts` input, when the venue
  page opens it, then every day still carries its count, tint and bar from
  `GET /api/venues/{id}/availability-calendar`; when the discovery page opens it with no loader,
  then no request fires, every day from today is selectable up to the 62-day ceiling and the
  "how busy" copy is absent. *Seam:* `AvailabilityCalendar` inputs · *Pinned by:*
  `shared/availability-calendar.spec.ts` (moved, plus "renders without a loader"),
  `availability-calendar.e2e.ts` (untouched).

## Non-goals

- The "fits with N moves" tier and the per-venue itinerary search (slice 10, #1208); the
  `riviera.itinerary.max-switches` property arrives with it.
- Writing the chosen range into the discovery URL on every pick (today a day pick does not touch
  the URL either; parity kept). The URL is read, and carried into links.
- A coast-wide "season's end": the discovery calendar's ceiling is the 62-day technical span
  (`StaySpan.MAX_DAYS`); per-venue maxima show on the verdict, not in the picker.
- Request-to-Book venues: the verdict is computed for them too (a pending request for a stay is
  slice 5's, #1203); nothing here branches on booking mode.
- Collapsing the `venue::spi` inversion (B4's long form). This slice adds one narrow
  `availability::api` read port and leaves the spi as is.

## Behavior-parity ledger (retirement / replacement slices only)

The `GET /api/venues` mapping moves from `venue/adapter/in/VenueReadController` to
`itinerary/adapter/in/DiscoveryListController`. The other three mappings stay in `venue`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `beach`/`region` filters, both optional | preserved | Same params, same `VenueFilter.of` |
| `date` optional, defaults to today in Europe/Tirane off the injected `Clock` (#6) | preserved | Same code, same `Clock` |
| Malformed `date` → 400 via `ApiErrorHandler` | preserved | Same `@DateTimeFormat(ISO.DATE)` binding |
| Always 200, empty array on no match | preserved | Delegates to `VenueCatalog.listVenues` |
| Ordering: open venues first, rating desc, name asc | preserved | The list is `VenueCatalog`'s; verdicts are attached without re-sorting |
| Visibility fence (hidden operator's venue absent) | preserved | The fence is inside `VenueCatalog.listVenues`; `SetBookingFacts` is only asked about ids that list returned |
| Public (no session) | preserved | `EndpointRoleGateCoverageTest` lists the same path; `SecurityConfig` rule unchanged |
| Single-day JSON shape | preserved | `stay` is `@JsonInclude(NON_NULL)`; absent without `lastDate` (AC-5) |
| `VenueListControllerIT` | preserved, untouched | Runs against the moved mapping as the oracle |
| Range (`lastDate`) | new | `StaySpan.of` → 400 on inverted or > 62 days, same as the map read |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Coast read at peak (N × S × D rows) is too slow or too wide for one page request | Med | High | AC-3 measures at 40 × 60 × 14 before merge; documented fallback is a gaps-and-islands aggregate in `availability`'s adapter returning per-set longest run + free-all-days (rows ≤ N × S). Threshold to switch: median > 150 ms in the IT | me | closed — median 29 ms at 23,557 rows (see *Cost measurement*); the fallback is not needed |
| R-2 | Cycle: `venue` must not depend on `itinerary` | Low | High | `itinerary` calls `venue::api`; nothing in `venue` imports `itinerary`; `ModularityTests` fails a cycle | me | open |
| R-3 | `venue::spi` grant leaks to the new module | Low | High | The new read is `availability.api.SetAvailabilityFacts`; `itinerary` never lists `venue::spi` | me | open |
| R-4 | `ResponsibilitiesArchitectureTests` rule 1: `set_availability` named outside `availability` | Low | High | `itinerary` has no SQL at all; its adapter is a controller only | me | open |
| R-5 | Jackson `@JsonUnwrapped` on a record component may not flatten the summary | Med | Low | Spike in phase 1c; fallback is an explicit `DiscoveryVenueView` record mirroring `VenueSummaryView`'s 17 fields with a static `of(summary, verdict)` | me | closed — `booking/adapter/in/AwaitingPaymentView` already unwraps a record component on the wire |
| R-6 | Calendar promotion breaks the venue page (focus, counts, ceiling) | Med | Med | `git mv`, the 729-line spec moves with it and stays green; `availability-calendar.e2e.ts` untouched | me | open |
| R-7 | Contrast: a hollow pin over map imagery | Med | Med | Hollow = inverse token pair (`--riv-solid-btn-fill` ring + ink on the pin's own fill), never transparent; `venue-pin-layer.contrast.spec.ts` measures both variants per theme | me | open |
| R-8 | Fading can't-host cards drops the name under 3:1 (`venue-row.ts` rule) | High if faded | Med | The issue's "faded" is rendered as the existing dusk skin (`saturate-0`) plus the verdict line; no opacity on text | me | open |
| R-9 | Timezone: the span's days are Europe/Tirane civil days (#6) | Low | Med | `StaySpan` is `LocalDate`s; the default first day is `todayInTirane()` off the UTC `Clock`, as before | me | open |
| R-10 | BOLA (#13) | None | — | Public tourist read; no venue-scoped write; nothing owner-asserted is exposed (`SetBookingFacts` answers ids only; hold type never leaves `availability`) | me | n/a |
| R-11 | Sonar duplication between the moved `listVenues` and its new home | Low | Low | The mapping is deleted from `VenueReadController`, not copied | me | closed in phase 1c |
| R-12 | Error contract: a new 400 detail | Low | Low | Reuses `InvalidApiRequestException.parsing(StaySpan.of)` exactly as the map read does; no new code | me | open |
| R-13 | `VenueApiRoleSplitTests` forbids any class outside `venue` from depending on `VenueCatalog`, which the itinerary controller must call for the fenced list | Certain | Med | The rule's intent is "no sibling-facing method regrows on the tourist port"; the read model is the tourist-read composer B4 names, so the test admits `itinerary..` as a second consumer and its Javadoc says why. Stated in the PR | me | open |

## Open questions / Assumptions

- **Assumption:** a venue closed for the season, or with sales closed on the first day, still gets a
  verdict off its rows; the card keeps its closed badge above the verdict and the sink key is
  `closedForSeason || verdict === CANNOT_HOST` so a closed venue never floats above an open can't-host
  one ← confirm? — *Owner:* owner · *Resolves by:* review.
- **Assumption:** the discovery calendar shows D10's "Stays of any length this season." with no
  venue maximum (the 62-day bound is technical, not a rule to state) ← confirm? — *Owner:* owner ·
  *Resolves by:* review.
- **Assumption:** a crowd pin (several venues at one place) is hollow only when every member can't
  host, mirroring the dusk rule ← confirm? — *Owner:* owner · *Resolves by:* review.
- **Assumption:** the day chip shows the range as `formatStay(first, last)` and the rail's
  "Several days…" chip is lit (`aria-current`) while a range is chosen — *Owner:* me · *Resolves by:*
  phase 2c.

### Resolved

- Module name → `itinerary` (owner, 2026-09-26, intake gate).
- `GET /api/venues` served by the new module's own controller (owner, 2026-09-26).
- Verdict math is a pure `domain/` rule over `takenDaysBetween`; SQL aggregate is the R-1 fallback
  (owner, 2026-09-26).
- Calendar promoted to `shared/` with a `loadCounts` input (owner, 2026-09-26).

## Availability & concurrency (invariant #2)

- **Write paths to `set_availability(set_id, booking_date)`:** none. This slice reads only.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` (V4), untouched.
- **Concurrency strategy:** the verdict is a snapshot, never a hold: the list says "one set free
  every day" and the reserve path (slice 4) still claims each `(set, date)` with the existing
  all-or-nothing claim. A verdict that goes stale between list and reserve resolves at the claim,
  as the single-day free count already does.
- **Pool rule (#3):** only `Pool.ONLINE` sets count toward `sameSetCount` and `longestRunDays`;
  walk-in sets are ignored by the domain rule (AC-2's walk-in set).
- **Cutoff rule (#4):** unchanged; `salesOpen` on the summary is the first day's verdict from
  `venue.spi.SalesWindow` as today. The verdict never overrides it: a sales-closed venue keeps its
  chip.
- **Pinning test:** `StayVerdictsIT` (read side); the claim's own `ConcurrentReservationIT` /
  range claim IT from #1202 stay the write-side pins.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `itinerary` | new (closed, full: `domain/`, `application/`, `adapter/in`) | none | D7/B4: the composed dated browse read depending on `venue::api` + `availability::api`; keeps the search out of `booking` (past three B3 clauses) and out of `venue` (which cannot see availability except through its spi) |
| M-2 | `availability` | existing | `set_availability` | Gains a published read port: the taken days per set over a span, the same fact its spi already answers for `venue` |
| M-3 | `venue` | existing | — | `SetBookingFacts` gains one batch read (online sets + maximum stay per venue); `VenueReadController` loses the list mapping |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability.api` | `SetAvailabilityFacts.takenDaysBetween(Collection<SetId>, LocalDate from, LocalDate to) → Map<SetId, List<LocalDate>>` | `venue.vocabulary.SetId`, JDK | `itinerary` |
| NI-2 | `venue.api` | `SetBookingFacts.stayFactsOf(Collection<VenueId>) → Map<VenueId, VenueStayFacts>` | `venue.vocabulary.VenueStayFacts(List<SetId> onlineSets, Integer maxStayDays)` | `itinerary` |
| NI-3 | `venue.api` | `VenueCatalog.listVenues(VenueFilter, LocalDate)` (existing) | `VenueSummaryView` | `itinerary` (was `venue`'s own controller) |

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | none | — | — | — | — | — |

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| Which venues can host a stay, and why not | `itinerary` | New: a composed dated read over two modules' facts (B4). `venue`'s Not-My-Job sends "why a set is taken and whether a date still sells" to `booking`; `availability`'s sends layout to `venue`; neither can compose both. `booking`'s job is bookings, not browsing. |
| Taken days per set over a span | `availability` | Its Job line: the single source of truth per `(set, date)`, answered as raw rows; the verdict (a rule) is not its. |
| Online sets and maximum stay per venue, in batch | `venue` | Its Job line: the beach map, pools, the maximum stay. Sibling-facing → `SetBookingFacts`, not `VenueCatalog` (`VenueApiRoleSplitTests`). |
| The discovery list HTTP read | `itinerary` (`adapter/in`) | B4 wording: the query module "owns the composed browse/map views"; `venue` keeps the per-venue reads. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Prices on the list stay per day (`fromPrice`), unchanged.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/availability-calendar.ts|.html` (from `venue/`) | moved | modal component | `loadCounts` input (`CountsLoader \| null`), `venueId` removed; signals unchanged | none |
| FE-2 | `shared/day-availability.ts`, `shared/stay-rule.ts` (from `venue/`) | moved | pure helpers | — | — |
| FE-3 | `pages/home/discover-head.ts` | existing | component | new `stayPressed` output; `lastDate` input; the day chip word shows the range | — |
| FE-4 | `pages/home/home.ts|.html` | existing | page | `selectedLastDate` signal seeded from `?lastDate`; `pickerOpen` signal; calendar rendered at page level; request carries `lastDate` | — |
| FE-5 | `pages/home/venue-card.ts` | existing | view model | `stay`, `canHost`, `verdictLabel`; `ariaLabel` carries the verdict | — |
| FE-6 | `pages/home/venue-row.html`, the sheet card template in `home.html` | existing | templates | verdict line replaces the sets-free line when a range is chosen; dusk on can't-host; links carry `lastDate` | — |
| FE-7 | `pages/home/place-groups.ts` | existing | pure | stable hosts-first partition inside each group when a range is active | — |
| FE-8 | `pages/home/venue-pin-layer.ts|.html` | existing | component | `data-cant-host` attribute; hollow skin variant for lone pins and all-can't-host crowds | — |
| FE-9 | `venue/venue.service.ts` | existing | service | `listVenues(filter, date, lastDate = date)` | — |
| FE-10 | `shared/venue-views.ts` | existing | types | `StayVerdictView`, `VenueSummary.stay?` | — |
| FE-11 | `venue/venue-map.html|.ts` | existing | page | calendar rebinding (`loadCounts`); "See other beaches" links carry `lastDate` | — |
| FE-12 | `e2e/discovery-stay.e2e.ts` | new | mocked Playwright | — | — |

## FE↔BE contract

- **New/changed endpoints:** `GET /api/venues?beach&region&date&lastDate` → `List<DiscoveryVenueView>`
  = every `VenueSummaryView` field plus `stay` (absent without `lastDate`):
  `{ "verdict": "SAME_SET" | "CANNOT_HOST", "sameSetCount": int, "longestRunDays": int,
  "maxStayDays": int | null }`. `lastDate < date` or a span over 62 days → `400`
  (`InvalidApiRequestException`, same code path as the map read).
- **Client typing:** hand-typed `StayVerdictView` in `shared/venue-views.ts`, optional on
  `VenueSummary`; never `as any`.
- **Money/date on the wire:** unchanged (`fromPrice` minor units + currency; ISO `LocalDate`).

## Execution status

**Stage pointer:** `implement (phase 2a)`

**Next action:** promote the calendar to `shared/` with a `loadCounts` input (red: "renders without a loader").

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + branch | ✅ | |
| 1a — `itinerary/domain` stay-fit rule | ✅ | phase 1a commit |
| 1b — ports + `StayVerdicts` service + module + structural net | ✅ | phase 1b commit |
| 1c — `DiscoveryListController` takes over `GET /api/venues` | ✅ | phase 1c commit |
| 1d — cost measurement | ✅ | phase 1d commit |
| 2a — calendar promoted to `shared/` | | |
| 2b — service param + wire types + card mapping | | |
| 2c — "Several days…" chip, page calendar, `?lastDate`, links | | |
| 2d — verdict line, dusk, ordering | | |
| 2e — hollow pins + contrast spec | | |
| 2f — mocked e2e | | |
| 3 — substrate docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|

### Cost measurement (AC-3)

`CoastVerdictCostIT.peakShapeCoastReadIsMeasured`, Testcontainers Postgres in the cloud sandbox,
2026-09-26, through `StayVerdicts.forCoast` (both port reads plus the domain rule):

| Shape | `set_availability` rows in the span | Wall time, 5 runs after a warm-up | Median |
|---|---|---|---|
| 40 venues × 60 online sets × 14 days at 70 % occupancy | 23,557 | 41, 37, 29, 25, 29 ms | **29 ms** |

Range read plan (`EXPLAIN (ANALYZE, BUFFERS)`): `Index Only Scan using set_availability_uniq`,
`Index Cond: set_id = ANY(…2,400 ids…) AND booking_date BETWEEN`, 23,557 rows, execution 5.0 ms,
planning 2.2 ms. `Heap Fetches: 23557` only because the rows were inserted moments before and the
visibility map was not yet set; in service they are `0` as for every other read on this index.
The 150 ms switch threshold in R-1 is not approached, so the SQL-aggregate fallback stays unbuilt.

---

## File structure

- `docs/plans/discovery-stay-verdict.md` — this plan
- `platform/src/main/java/ai/riviera/platform/itinerary/package-info.java` — `@ApplicationModule`, least-privilege grants
- `platform/src/main/java/ai/riviera/platform/itinerary/domain/StayFit.java` — pure rule: per-set fit and the venue verdict off taken days
- `platform/src/main/java/ai/riviera/platform/itinerary/domain/StayVerdict.java` — the verdict value (`Fit`, counts)
- `platform/src/main/java/ai/riviera/platform/itinerary/application/StayVerdicts.java` — `@Service`: list ids → venue facts → taken days → verdicts
- `platform/src/main/java/ai/riviera/platform/itinerary/adapter/in/DiscoveryListController.java` — `GET /api/venues`
- `platform/src/main/java/ai/riviera/platform/itinerary/adapter/in/DiscoveryVenueView.java` — summary + `stay` wire record
- `platform/src/main/java/ai/riviera/platform/itinerary/adapter/in/StayVerdictView.java` — wire record
- `platform/src/main/java/ai/riviera/platform/availability/api/SetAvailabilityFacts.java` — new read port
- `platform/src/main/java/ai/riviera/platform/availability/api/package-info.java` — surface Javadoc names both ports
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — implements the new port too
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java` — `stayFactsOf`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueStayFacts.java` — batch value
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcSetBookingFacts.java` — batch query (or wherever `SetBookingFacts` is implemented)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReadController.java` — list mapping removed
- `platform/src/test/java/ai/riviera/platform/itinerary/domain/StayFitTest.java`
- `platform/src/test/java/ai/riviera/platform/itinerary/application/StayVerdictsIT.java`
- `platform/src/test/java/ai/riviera/platform/itinerary/application/CoastVerdictCostIT.java`
- `platform/src/test/java/ai/riviera/platform/itinerary/DiscoveryListControllerIT.java`
- `platform/src/test/java/ai/riviera/platform/venue/IsolationBeaches.java` — beaches reserved for the new ITs, if the census needs extending
- `frontend/src/app/shared/availability-calendar.{ts,html,spec.ts,contrast.spec.ts}` — moved from `venue/`
- `frontend/src/app/shared/day-availability.{ts,spec.ts}` — moved
- `frontend/src/app/shared/stay-rule.{ts,spec.ts}` — moved
- `frontend/src/app/shared/venue-views.ts` — `StayVerdictView`, `VenueSummary.stay`
- `frontend/src/app/shared/booking-date-label.ts` — `formatStay` reuse only (no change expected)
- `frontend/src/app/venue/venue.service.{ts,spec.ts}` — `lastDate` param
- `frontend/src/app/venue/venue-map.{ts,html,spec.ts}` — calendar rebinding, links carry `lastDate`
- `frontend/src/app/venue/partly-free-sheet.ts` — import path only if it used `stay-runs`/`stay-rule` (verify)
- `frontend/src/app/pages/home/discover-head.{ts,spec.ts}` — "Several days…" chip, `stayPressed`, range word
- `frontend/src/app/pages/home/home.{ts,html,spec.ts}` — range state, calendar, request, links, verdict line
- `frontend/src/app/pages/home/venue-card.ts` — verdict fields
- `frontend/src/app/pages/home/venue-row.{html,spec.ts}` — verdict line, dusk, link
- `frontend/src/app/pages/home/place-groups.{ts,spec.ts}` — hosts-first partition
- `frontend/src/app/pages/home/venue-pin-layer.{ts,html,spec.ts,contrast.spec.ts}` — hollow variant
- `frontend/e2e/discovery-stay.e2e.ts` — new mocked spec
- `frontend/e2e/support/tourist.mocks.ts` — a range-aware venue mock helper if the shared mock needs it
- `CLAUDE.md` — module table row for `itinerary`
- `RESPONSIBILITIES.md` — § `itinerary`; `availability` and `venue` port lists
- `CONTEXT.md` — glossary: *Stay verdict*
- `docs/architecture/multi-day-stays.md` — status line: D11 landed

---

## Phase 1a — `itinerary/domain` stay-fit rule

**Files:** Create `itinerary/domain/StayFit.java`, `itinerary/domain/StayVerdict.java` · Test `itinerary/domain/StayFitTest.java`

- [ ] **Step 1: Write the failing test** — given `days = 4` and taken days per set: set 1 none, set 2 `[d2]`, set 3 `[d1,d2,d3,d4]`, set 4 `[d4]` → verdict `SAME_SET`, `sameSetCount = 1`, `longestRunDays = 4`; given set 2 and set 4 only → `CANNOT_HOST`, `longestRunDays = 3`; given `maxStayDays = 2` with set 1 free → `CANNOT_HOST`, `maxStayDays = 2`, `longestRunDays = 4`; given no online sets → `CANNOT_HOST`, `longestRunDays = 0`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew --console=plain test --tests "*StayFitTest*"` → compilation failure.
- [ ] **Step 3: Minimal implementation** — `StayFit.verdict(StaySpan span, List<SetId> onlineSets, Map<SetId, List<LocalDate>> takenDays, Integer maxStayDays)`; longest free run computed as the widest gap between consecutive taken days including the span's edges.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — n/a (new code).
- [ ] **Step 6: Commit** — `Add the itinerary module's stay-fit rule (#1206)`.
- [ ] **Step 7: Update Execution status.**

## Phase 1b — ports, service, module, structural net

**Files:** Create `itinerary/package-info.java`, `itinerary/application/StayVerdicts.java`, `availability/api/SetAvailabilityFacts.java`, `venue/vocabulary/VenueStayFacts.java` · Modify `availability/adapter/out/JdbcSetAvailabilityLookup.java`, `availability/api/package-info.java`, `venue/api/SetBookingFacts.java`, its JDBC adapter · Test `StayVerdictsIT`

- [ ] **Step 1: Write the failing test** — AC-2's fixture on Testcontainers (three venues, isolation beach, online + walk-in sets, `set_availability` rows), `StayVerdicts.forCoast(ids, span)` asserts the three verdicts.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew --console=plain test --tests "*StayVerdictsIT*"` → no bean / compile failure.
- [ ] **Step 3: Minimal implementation** — port + batch query (`active_set_position WHERE venue_id IN (:ids) AND pool = 'ONLINE'` plus `venue.max_stay_days`), the service composing the three reads, the module declaration.
- [ ] **Step 4: Run it, verify it passes** — the IT, then the structural net command from `CLAUDE.md` § Commands, then `*VenueApiRoleSplitTests*`, `*ResponsibilitiesArchitectureTests*`, `*CompositionRootDisciplineTests*`.
- [ ] **Step 5: Generalization-audit pass** — population: every `@ApplicationModuleTest` that bootstraps `availability` or `venue` (`grep -rl '@ApplicationModuleTest' platform/src/test/java`); a new bean in an existing module needs no stub, verify by running one of each.
- [ ] **Step 6: Commit** — `Add the itinerary module and its coast stay verdicts over venue and availability ports (#1206)`.
- [ ] **Step 7: Update Execution status.**

## Phase 1c — `DiscoveryListController` takes over `GET /api/venues`

**Files:** Create `itinerary/adapter/in/DiscoveryListController.java`, `DiscoveryVenueView.java`, `StayVerdictView.java` · Modify `venue/adapter/in/VenueReadController.java` (delete `listVenues`) · Test `itinerary/DiscoveryListControllerIT.java`

- [ ] **Step 1: Write the failing test** — `GET /api/venues?date&lastDate` asserts `$[?(@.id==A)].stay.verdict == SAME_SET` etc.; `?date` alone asserts `stay` absent; inverted range 400.
- [ ] **Step 2: Run it, verify it fails** — `--tests "*DiscoveryListControllerIT*"`.
- [ ] **Step 3: Minimal implementation** — move the mapping; `lastDate` → `StaySpan.of` under `InvalidApiRequestException.parsing`; single day → `stay = null`.
- [ ] **Step 4: Run it, verify it passes** — plus `--tests "*VenueListControllerIT*"` unchanged, `--tests "*EndpointRoleGateCoverageTest*"`, `--tests "*ErrorContractArchitectureTests*"`.
- [ ] **Step 5: Generalization-audit pass** — population: every test naming `VenueReadController` for the list (`grep -rn "listVenues" platform/src/test`).
- [ ] **Step 6: Commit** — `Serve the discovery list from the itinerary module with a stay verdict per venue (#1206)`.
- [ ] **Step 7: Update Execution status.**

## Phase 1d — cost measurement

**Files:** Test `itinerary/application/CoastVerdictCostIT.java`

- [ ] **Step 1: Write the test** — seeds AC-3's shape, warms up once, times five reads, prints median, row count and `EXPLAIN (ANALYZE, BUFFERS)` of the range read, asserts < 2 s.
- [ ] **Step 2: Run it** — `--tests "*CoastVerdictCostIT*"` (Docker), copy the numbers into *Cost measurement*.
- [ ] **Step 3: Decide R-1** — under the threshold: close R-1; over: implement the SQL-aggregate fallback in a re-entered phase 1b.
- [ ] **Step 4: Commit** — `Measure the coast verdict read at a peak shape (#1206)`.

## Phase 2a — calendar promoted to `shared/`

**Files:** `git mv` `venue/availability-calendar.*`, `venue/day-availability.*`, `venue/stay-rule.*` → `shared/` · Modify `shared/availability-calendar.ts` (`loadCounts` input, no `VenueService`), `venue/venue-map.ts|.html`, import paths in `venue/` · Test the moved spec + one new case

- [ ] **Step 1: Write the failing test** — "renders without a loader: no request, every day from the floor selectable, no busy copy".
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/availability-calendar.spec.ts`.
- [ ] **Step 3: Minimal implementation** — `readonly loadCounts = input<CountsLoader | null>(null)`; `fetchMonth` short-circuits to `countsLoading=false` without a loader; venue-map passes `(from, to) => this.venues.availabilityCalendar(id, from, to)`.
- [ ] **Step 4: Run it, verify it passes** — the moved spec, `venue-map.spec.ts`, `npm run lint`, `npm run format:check`.
- [ ] **Step 5: Generalization-audit pass** — `grep -rn "availability-calendar\|day-availability\|stay-rule" frontend/src frontend/e2e` for every import and test id.
- [ ] **Step 6: Commit** — `Promote the availability calendar to shared with a count loader input (#1206)`.

## Phase 2b — service param, wire types, card mapping

- [ ] `venue.service.spec.ts`: "sends lastDate only for a stay" red → `listVenues(filter, date, lastDate = date)`.
- [ ] `home.spec.ts`: "maps a stay verdict onto the card" red → `VenueCard.stay/canHost/verdictLabel`, `ariaLabel` wording per AC-7.
- [ ] Commit — `Type the stay verdict on the discovery list and map it onto the card (#1206)`.

## Phase 2c — "Several days…" chip, page calendar, `?lastDate`, links

- [ ] `discover-head.spec.ts`: last chip "Several days…" emits `stayPressed`; the day word shows the range.
- [ ] `home.spec.ts`: `?lastDate` seeds the range; picking a range requests `date&lastDate`; card/row links carry `lastDate`; a single day carries `date` only.
- [ ] `venue-map.spec.ts`: "See other beaches" links keep `lastDate`.
- [ ] Commit — `Let the discovery page pick a stay and carry it into the venue page (#1206)`.

## Phase 2d — verdict line, dusk, ordering

- [ ] `home.spec.ts` / `venue-row.spec.ts`: the verdict line replaces the sets-free line for a range; a can't-host card wears `saturate-0`; `place-groups.spec.ts`: hosts first inside a group, stable, single day untouched.
- [ ] Commit — `Show each venue's stay verdict and sink the ones that can't host (#1206)`.

## Phase 2e — hollow pins + contrast spec

- [ ] `venue-pin-layer.spec.ts`: `data-cant-host` on a lone pin and on an all-can't-host crowd; `venue-pin-layer.contrast.spec.ts`: hollow ink over fill per theme.
- [ ] Commit — `Carry the stay verdict on the map pins by shape (#1206)`.

## Phase 2f — mocked e2e

- [ ] `e2e/discovery-stay.e2e.ts`: AC-6..AC-9 end to end with `page.route` mocks, axe on the range page, `toHaveCSS` on the hollow pin's border.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts e2e/discovery-stay.e2e.ts e2e/discovery-flow.e2e.ts e2e/availability-calendar.e2e.ts e2e/range-booking.e2e.ts`.
- [ ] Commit — `Cover the discovery stay verdict in the mocked e2e suite (#1206)`.

## Phase 3 — substrate docs + close-out

- [ ] `CLAUDE.md` module row, `RESPONSIBILITIES.md` § `itinerary` + port lists, `CONTEXT.md` *Stay verdict*, design-doc status line; `node scripts/check-plan-file-structure.mjs --diff origin/main`; the six `scripts/check-*.mjs` guards.
- [ ] Commit — `Record the itinerary module in the substrate docs (#1206)`.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-26 | `SetBookingFacts` gained `stayFactsOf` | every test double implementing the port | `grep -rln "implements SetBookingFacts\|new SetBookingFacts()" platform/src/test` (compile also lists them) | `WebSliceStubs`, `CreateBookingServiceTest.FakeCatalog`, `retirefixture…FixtureSetFacts` | each answers `Map.of()`; no `@ApplicationModuleTest` needs a stub, the adapters only grew |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5:** scoped Gradle runs listed per phase. Verified at commit `<sha>`.
- [ ] **AC-6..AC-10:** `npm test`, `npm run lint`, `npm run format:check`, the mocked e2e files above. Verified at commit `<sha>`.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + sales close honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
