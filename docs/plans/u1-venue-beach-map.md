# U1 — Venue + Beach-Map Read Model & Visual Map Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> routed via `riviera-sdd`. Backend phases pull `codebase-design` + `postgres`;
> the frontend phase pulls `angular-developer` + the angular-cli MCP. Steps use
> checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections.
> Invariant numbers refer to `CLAUDE.md`.

**Goal:** Seed one demo venue with a 4×6 beach map and expose a public read API
(`GET /api/venues/{venueId}`) that returns the venue and its sets (tier, pool, price
in integer minor units, grid coordinates, seed availability); the Angular app fetches
it and renders the visual beach map read-only, faithful to the U1 design contract.

**Architecture:** U1 is the **supply read side only**, owned entirely by the `venue`
module. The single most significant decision: **U1 does NOT build the authoritative
`availability(set_id, booking_date)` table** — that concurrency-critical table and its
claim strategy belong to U2 (issue #5) and must not be pre-empted here. Instead each
set carries a **seed-only `availability` flag (`FREE`/`TAKEN`)** on the `venue` read
model purely so the map renders the design's taken pattern; U2 replaces the read source
with the real availability table without changing the API shape.

**Persistence:** JDBC only (invariant #1). New Flyway migrations: `V2__venue_beach_map.sql`
(tables) and `V3__seed_miramar_demo.sql` (demo fixture). No JPA starter; no `@Entity`.
Primary keys are **`BIGINT GENERATED ALWAYS AS IDENTITY`** (per the `postgres` skill —
random UUIDv4 PKs are avoided for fragmentation/size/join cost; the unguessable credential
in this system is the booking code, invariant #7, not the venue/set id).

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`
(§4.1, §8, §10) and **GitHub issue #4**. Design contract: `docs/design/u1-beach-map/`
(on branch `claude/u1-issue-review-v2353h`).

**Skills consulted at plan time:** `riviera-sdd` (routing), `riviera-plan-doc` (this
template), **`postgres`** (table/index/PK design — informs Phase 0 DDL), **`codebase-design`**
(module seams — informs the leaner `venue` layout below), **`angular-developer`** +
**angular-cli MCP `get_best_practices`** (v22 FE standards + a11y — informs Phase 2).

**Branch:** SDD convention is `feature/u1-venue-beach-map`. **This environment mandates
work on `claude/general-conversation-ozsa32`**, so the plan doc and implementation land
there; commits reference `#4`.

---

## Acceptance criteria (testable)

> Each item is "Given X, when Y, then Z" and names a test class. Derived from issue #4.

- [ ] **AC-1:** Given the Flyway migrations have run, when the app starts, then a venue
  `Miramar Beach Club` exists with **24 set positions** across 4 rows × 6, containing
  **both** an `ONLINE`-pool and a `WALK_IN`-pool set. *Pinned by:* `VenueSeedMigrationIT.seedsMiramarVenueWithBothPools`
- [ ] **AC-2:** Given the seeded venue, when `GET /api/venues/{venueId}` is called, then
  it returns `200` with the venue (name, beach, rating, booking mode, from-price) and a
  list of 24 sets, each with `id, rowLabel, positionNo, tier, pool, price{minorUnits,currency}, gridX, gridY, availability`. *Pinned by:* `VenueReadControllerIT.returnsVenueWithSets`
- [ ] **AC-3:** Given the seeded venue, when the read API responds, then every monetary
  amount is an **integer `minorUnits` + ISO `currency`** (e.g. `4500`/`EUR`) and no
  field is a floating-point number. *Pinned by:* `VenueReadControllerIT.pricesAreIntegerMinorUnits`
- [ ] **AC-4:** Given an unknown venue id, when `GET /api/venues/{venueId}` is called,
  then it returns `404` (not `500`, not an empty `200`). *Pinned by:* `VenueReadControllerIT.unknownVenueReturns404`
- [ ] **AC-5:** Given the read endpoint, when an unauthenticated browser request hits it,
  then it is **permitted** (public tourist read) and not blocked by Spring Security.
  *Pinned by:* `VenueReadControllerIT.endpointIsPublic`
- [ ] **AC-6:** Given the read API payload, when the Angular `VenueMap` component renders,
  then it shows **24 positioned tiles** (4 rows × 6), the premium front row visually
  distinct, taken tiles styled as taken, per-set prices visible, and the availability
  line "18 of 24 sets free". *Pinned by:* `venue-map.component.spec.ts`
- [ ] **AC-7:** Given prices arrive as integer minor units, when the component displays
  them, then the rendered string is derived from minor units (e.g. `4500` → `€45`) with
  no floating-point money stored in component state. *Pinned by:* `venue-map.component.spec.ts`
- [ ] **AC-8 (a11y):** Given the rendered map, when assistive tech / an AXE audit inspects
  it, then each tile exposes a **text/ARIA accessible name** (e.g. "Set A1, front row,
  €45, taken") — state is **not** conveyed by colour alone — and contrast meets **WCAG AA**.
  *Pinned by:* `venue-map.component.spec.ts` (accessible-name assertions) + AXE check.
- [ ] **AC-9:** Given the change set, when CI runs, then backend `./gradlew build`,
  `ModularityTests.verify()`, frontend `build`/`test`/`lint` are all **green**.
  *Pinned by:* CI pipeline (issue #3).

## Non-goals

> What is explicitly OUT of scope — guards against "while I'm here…".

- **No authoritative availability table.** The `availability(set_id, booking_date)`
  source-of-truth, its `UNIQUE` constraint, and the concurrency-safe claim are **U2 /
  issue #5**. U1's `availability` flag is a seed-only placeholder on the read model.
- **No booking flow** — no set selection, no "Selected" tile state writes, no payment.
  That is U3+ (issues #6, #8). The map is strictly read-only.
- **No per-date availability.** The "Booking for {date}" control is display-only in U1;
  per-`(set, date)` state arrives with U2. The endpoint is date-agnostic.
- **No venue-list / browse-by-beach screen.** Issue #4 scopes U1 to a single venue's
  map render. A venues-by-beach list is a thin later addition, not built here.
- **No pool-based booking restriction enforcement.** All seeded sets render on the map;
  restricting bookings to `ONLINE`-pool sets is enforced in U3 (issue #6).
- **No beach-map editor / venue onboarding** (creating/editing the map) — that is
  **U7 / issue #7**. U1 only reads a seeded map.
- **No `BeachMap` aggregate table.** For U1's read model `set_position` references
  `venue` directly (one implicit map per venue); the editable `BeachMap` aggregate is
  introduced by U7.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | U1 accidentally builds an `availability` table and pre-empts U2's concurrency design | med | high | Seed flag named `availability` lives on `set_position` in the `venue` module; explicit Non-goal; reviewer checks no `availability` module code added | agent | open |
| R-2 | Money rendered/stored as a float, violating invariant #5 | med | high | `BIGINT price_minor` + `price_currency` in DB; `MoneyView(long minorUnits, String currency)` on the wire; FE divides by 100 only at display via `Intl.NumberFormat`; AC-3 + AC-7 pin it | agent | open |
| R-3 | Read endpoint blocked by Spring Security (everything is `authenticated()` today) | high | med | Permit `GET /api/venues/**` in `SecurityConfig`; AC-5 pins it | agent | open |
| R-4 | Module-boundary leak (controller imports `infrastructure`/another module's internals) | med | med | Controller depends only on `venue.api.VenueCatalog`; `ModularityTests.verify()` is the gate (invariant #11) | agent | open |
| R-5 | Seed demo data leaks into a real/prod environment | low | med | Seed migration is clearly named `V3__seed_miramar_demo.sql` and documented as a pre-launch demo fixture to be removed when U7 onboarding lands; flagged in Open Questions | agent | open |
| R-6 | Rating stored as a float (`4.8`) reintroduces floating point | low | low | Store `rating_tenths INTEGER` (e.g. `48`), render `/10`; no `NUMERIC`/`double` for rating | agent | open |
| R-7 | Angular 22 API drift (component/service decorators, `resource`/`httpResource`) vs older tutorials | med | low | `angular-cli get_best_practices` consulted: `@Service` confirmed for v22; do NOT set `standalone:true`/`OnPush` (defaults); use `[class]`/`[style]` not `ngClass`/`ngStyle` | agent | mitigated (consulted) |
| R-8 | Random UUIDv4 primary keys → index fragmentation, larger/slower joins (per `postgres` skill) | med | med | PKs are `BIGINT GENERATED ALWAYS AS IDENTITY`; `VenueId`/`SetId` wrap `long`. (uuidv7 considered and rejected — see Open Questions) | agent | mitigated (postgres skill) |
| R-9 | Map conveys state by **colour alone** (available/taken/premium) → fails WCAG AA | med | med | Each tile carries a text/ARIA accessible name + non-colour state cue; AXE check in CI; AC-8 pins it (per angular-developer a11y rules) | agent | open |

## Open questions / Assumptions

> **Work is NOT done while this has unresolved entries.**

- **Assumption:** Demo seed data via a Flyway migration (vs a test-only fixture) is
  acceptable pre-launch because there is no production tenant yet; it will be removed or
  superseded when U7 (venue onboarding) can create real venues. — *Owner:* Ivo · *Resolves by:* U7 / phase-review
- **Assumption:** The tourist map shows **all** seeded sets (both pools); the
  availability line counts free/total over all 24 (matches the design's "18 of 24").
  Booking restriction to `ONLINE`-pool sets is deferred to U3. — *Owner:* Ivo · *Resolves by:* U3
- **Assumption:** `beach` is stored as free text (`"Ksamil"`) and `region` as
  `"Albanian Riviera"`, matching the design sample, rather than a locked `Beach` enum;
  the Phase-1 beach enum (Palasë/Drymades/Dhërmi) is a U7 onboarding concern. — *Owner:* Ivo · *Resolves by:* U7
- **Assumption:** Ids are `BIGINT` identity (not UUID). `VenueId`/`SetId` wrap `long`.
  The seed venue is the first row (id `1`); the FE demo link points at `/venues/1`. This
  is a **cross-cutting** choice — invariant-#11 event payloads (`BookingId`/`SetId`/`VenueId`)
  inherit it across all future modules. — *Owner:* Ivo · *Resolves by:* phase 1 (flag if you
  want UUIDs instead)

### Resolved

- **PK type — UUIDv4 vs BIGINT vs uuidv7:** chose **`BIGINT GENERATED ALWAYS AS IDENTITY`**.
  Rationale (`postgres` skill): random UUIDv4 PKs fragment indexes and cost more on joins;
  `uuidv7()` would avoid that but needs PG 18 / an extension on the self-hosted Docker
  Postgres and buys non-enumerable ids we don't need (the venue catalogue is public; the
  unguessable credential is the booking code, invariant #7). — *Resolved at plan revision.*
- **Open question:** Should U1 add a route redirect (`/` → `/venues/{seedId}`) for the
  demo, or keep the health-tracer home page and add a link? — *Owner:* Ivo · *Resolves by:* phase 2 (default: keep home, add a "View demo venue" link)

## Availability & concurrency (invariant #2)

> The feature touches the beach map, so this section is filled (not `N/A`).

- **Write paths to `availability(set_id, booking_date)`:** **None.** U1 writes no
  availability row. It is read-only and does **not** create that table.
- **Uniqueness guarantee:** N/A for U1 — the `UNIQUE(set_id, booking_date)` constraint
  is introduced by U2 (issue #5). U1 adds only `UNIQUE(venue_id, row_label, position_no)`
  on `set_position` (one set per grid cell), which is a layout constraint, not the
  double-booking guard.
- **Concurrency strategy:** N/A — no claim, no lock, no writes in U1.
- **Pool rule (invariant #3):** Each `set_position` carries a `pool` flag
  (`ONLINE`/`WALK_IN`); the seed contains both. Enforcement that online bookings only
  target `ONLINE` sets is U3; U1 only surfaces the flag.
- **Cutoff rule (invariant #4):** `venue.booking_cutoff` is stored (default `18:00`,
  reasoned in `Europe/Tirane`) for later use; U1 does not evaluate it.
- **Seed-only availability:** `set_position.seed_availability ∈ {FREE, TAKEN}` exists
  solely to colour the read-only map. It is **not** the source of truth and U2 replaces
  the read source with the authoritative table.
- **Pinning test:** N/A — there is no concurrent reservation in U1. The concurrency IT
  is created by U2. (Recorded here so the absence is deliberate, not forgotten.)

## Spring Modulith — modules, interfaces, events

> Backend is in scope. Boundaries per invariant #11; `ModularityTests.verify()` is the gate.

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing (empty) | `Venue`, (implicit) beach map | Owns venue profiles, the beach map / set positions, pool assignment, pricing (per CLAUDE.md module table). U1 is purely venue read. |

No other module is touched. No domain events are published in U1 (no state changes).

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog#findVenueMap(VenueId): Optional<VenueMapView>` | `VenueMapView`, `SetView`, `MoneyView` (records) | `venue.infrastructure.in` (REST controller); later U3 `booking` for set/price lookup |

> **Seam discipline (`codebase-design`):** `VenueCatalog` is the one **real** seam here —
> a deep module: a small interface (`findVenueMap(VenueId)`) hides the SQL join, the
> from-price computation, and DTO assembly. By the *deletion test* it earns its keep
> (delete it and that complexity reappears in the controller and in U3's booking lookup).
> The earlier draft's separate `application.VenueCatalogService` + `application.out.VenueReadRepository`
> split is a **hypothetical seam** — only one adapter (JDBC) exists and tests use
> Testcontainers, not a fake ("one adapter ⇒ hypothetical seam; two ⇒ real"). So U1
> collapses it: `infrastructure.out.JdbcVenueCatalog` implements `api.VenueCatalog`
> directly. The `application` layer is introduced in U3 when real application logic
> (claim → book → confirm) needs a home.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | N/A — U1 publishes no events (read-only slice) |

**Proposed package layout (finalize with `codebase-design`; gate is `ModularityTests`):**

```
ai.riviera.platform.venue
├── api/
│   ├── VenueCatalog.java          // inbound + published query port (the one real seam)
│   ├── VenueMapView.java          // record (venue + List<SetView>)
│   ├── SetView.java               // record
│   └── MoneyView.java             // record (long minorUnits, String currency)
├── domain/
│   ├── VenueId.java               // record(long value)
│   ├── SetId.java                 // record(long value)
│   ├── Pool.java                  // enum ONLINE, WALK_IN
│   ├── SetTier.java               // enum PREMIUM, STANDARD
│   ├── BookingMode.java           // enum INSTANT, REQUEST
│   └── SeatAvailability.java      // enum FREE, TAKEN (seed-only placeholder)
└── infrastructure/
    ├── in/
    │   └── VenueReadController.java   // @RestController GET /api/venues/{venueId}
    └── out/
        └── JdbcVenueCatalog.java      // @Repository, JdbcClient; IMPLEMENTS api.VenueCatalog
                                       // (query + from-price + DTO assembly behind the seam)
```

> No `application` package in U1 — added in U3 (deferred per the seam note above). The
> controller depends only on `api.VenueCatalog`; the JDBC adapter is the bean wired in.
> `ModularityTests.verify()` is the boundary gate (invariant #11).

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` U1 moves no money. The only money concern is **storage &
wire format**: integer minor units + ISO currency (invariant #5), covered under R-2 and
AC-3/AC-7. No Stripe, no payout ledger, no refunds in this slice.

## Angular — frontend surfaces touched

> Frontend is in scope. Load `angular-developer`; run angular-cli MCP `get_best_practices`.

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.component.ts` (+ `.html`) | new | standalone component | Signals; `httpResource`/`resource()` for the read; `computed` for free-count & from-price | none (read-only) |
| FE-2 | `venue/venue.client.ts` | new | typed service (`@Service`, `inject(HttpClient)`) | returns typed `VenueMapView` | — |
| FE-3 | `venue/venue.model.ts` | new | TS interfaces mirroring the API DTOs (no `as any`) | — | — |
| FE-4 | `app.routes.ts` | modify | route `venues/:id` → lazy `VenueMap` | — | — |
| FE-5 | `index.html` / `styles.scss` | modify | wire Manrope + Instrument Serif (Google Fonts) + design tokens | — | — |

**Standards (from `angular-cli get_best_practices`, v22):**
- Standalone is the default — **do NOT** write `standalone: true`. OnPush is the default —
  **do NOT** set `changeDetection: OnPush` explicitly.
- `inject()` (not constructor DI); `@Service` decorator for the singleton client (confirmed
  preferred over `@Injectable({providedIn:'root'})` in v22).
- `input()`/`output()` functions; `computed()` for derived state (free-count, from-price);
  signals for state; native control flow `@if`/`@for`.
- **Use `[class.x]` / `[style.x]` bindings — NOT `ngClass`/`ngStyle`** (this drives the
  tile-state styling: `.set-tile`, `[class.premium]`, `[class.taken]`).
- Prefer inline templates for the small pieces (legend, availability bar); the map grid
  may use an external template. `NgOptimizedImage` for any static venue image.

**Accessibility (mandatory — AC-8):** must pass AXE and WCAG AA. State must **not** be
colour-only: each tile gets an accessible name (e.g. `aria-label="Set A1, front row, €45,
taken"`), taken tiles are `aria-disabled`, the premium/taken distinction has a non-colour
cue (icon/label/pattern), and teal-on-white / gold text meets AA contrast. Tile-state
styling per the design table (Available / Front-row premium / Taken / Selected), brand teal
`#0e7a89`, sand/sea gradients. Defer to the in-repo `angular-developer` skill for the full
subset; document any deviation.

## FE↔BE contract

> API shape changes — section filled.

- **New endpoint:** `GET /api/venues/{venueId}` → `200 VenueMapView` | `404`.
- **`VenueMapView`:**
  ```jsonc
  {
    "id": 1,                       // BIGINT identity (number, not UUID)
    "name": "Miramar Beach Club",
    "beach": "Ksamil",
    "region": "Albanian Riviera",
    "description": "…",
    "ratingTenths": 48,            // render /10 → 4.8 (no float stored)
    "reviewsCount": 326,
    "bookingMode": "INSTANT",
    "fromPrice": { "minorUnits": 2500, "currency": "EUR" },
    "sets": [
      {
        "id": 11,                  // BIGINT identity
        "rowLabel": "Front row · Sea view",
        "positionNo": 1,
        "tier": "PREMIUM",
        "pool": "ONLINE",
        "price": { "minorUnits": 4500, "currency": "EUR" },
        "gridX": 1, "gridY": 1,
        "availability": "TAKEN"     // FREE | TAKEN (seed-only in U1)
      }
      // … 24 total
    ]
  }
  ```
- **Client typing:** hand-written TS interfaces in `venue.model.ts`; the `VenueClient`
  service returns them strongly typed. **No `as any`.**
- **Money/date on the wire:** amounts as integer `minorUnits` + ISO `currency`; the FE
  divides by 100 only for display (`Intl.NumberFormat`). No booking date on the wire in U1.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Schema + demo seed (Flyway) | | |
| 1 — Venue read model + API + security | | |
| 2 — Angular beach-map component | | |
| 3 — Wiring, full-suite, AC verification | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit
window as each phase's code.

---

## File structure

**Backend (`platform/`)**

- `src/main/resources/db/migration/V2__venue_beach_map.sql` — `venue` + `set_position` tables (new)
- `src/main/resources/db/migration/V3__seed_miramar_demo.sql` — demo venue + 24 sets (new)
- `src/main/java/ai/riviera/platform/venue/api/{VenueCatalog,VenueMapView,SetView,MoneyView}.java` — port + view records (new)
- `src/main/java/ai/riviera/platform/venue/domain/{VenueId,SetId,Pool,SetTier,BookingMode,SeatAvailability}.java` — VOs/enums (new; ids wrap `long`)
- `src/main/java/ai/riviera/platform/venue/infrastructure/in/VenueReadController.java` — REST adapter (new)
- `src/main/java/ai/riviera/platform/venue/infrastructure/out/JdbcVenueCatalog.java` — JDBC adapter implementing `api.VenueCatalog` (new; no separate application layer in U1)
- `src/main/java/ai/riviera/platform/SecurityConfig.java` — permit `GET /api/venues/**` (modify)
- `src/test/java/ai/riviera/platform/venue/VenueSeedMigrationIT.java` — seed/migration test (new)
- `src/test/java/ai/riviera/platform/venue/VenueReadControllerIT.java` — read API IT (new)

**Frontend (`frontend/`)**

- `src/app/venue/venue.model.ts` — DTO interfaces (new)
- `src/app/venue/venue.client.ts` + `.spec.ts` — typed read service (new)
- `src/app/venue/venue-map.component.ts` + `.html` + `.spec.ts` — map component (new)
- `src/app/app.routes.ts` — add `venues/:id` route (modify)
- `src/index.html` — Google Fonts (Manrope, Instrument Serif) (modify)
- `src/styles.scss` — design tokens (modify)

---

## Phase 0 — Schema + demo seed (Flyway)

**Files:** Create `V2__venue_beach_map.sql`, `V3__seed_miramar_demo.sql`, `VenueSeedMigrationIT.java`

- [ ] **Step 1: Write the failing test** — a Testcontainers IT asserting Flyway applied and the seed loaded.

```java
package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueSeedMigrationIT {

    @Autowired JdbcTemplate jdbc;

    @Test
    void seedsMiramarVenueWithBothPools() {
        Integer venues = jdbc.queryForObject(
            "SELECT count(*) FROM venue WHERE name = 'Miramar Beach Club'", Integer.class);
        assertThat(venues).isEqualTo(1);

        Integer sets = jdbc.queryForObject(
            "SELECT count(*) FROM set_position sp JOIN venue v ON v.id = sp.venue_id "
          + "WHERE v.name = 'Miramar Beach Club'", Integer.class);
        assertThat(sets).isEqualTo(24);

        Integer pools = jdbc.queryForObject(
            "SELECT count(DISTINCT pool) FROM set_position", Integer.class);
        assertThat(pools).isEqualTo(2); // ONLINE and WALK_IN both present

        Integer taken = jdbc.queryForObject(
            "SELECT count(*) FROM set_position WHERE seed_availability = 'TAKEN'", Integer.class);
        assertThat(taken).isEqualTo(6); // 18 of 24 free, matching the design
    }
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueSeedMigrationIT*"` → FAIL (`relation "venue" does not exist`).

- [ ] **Step 3: Minimal implementation** — the two migrations.

```sql
-- V2__venue_beach_map.sql  (PKs: BIGINT identity per the postgres skill; no UUIDv4)
CREATE TABLE venue (
    id              BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            TEXT    NOT NULL,
    beach           TEXT    NOT NULL,
    region          TEXT    NOT NULL,
    description     TEXT,
    rating_tenths   INTEGER NOT NULL DEFAULT 0,   -- 4.8 stored as 48 (no float)
    reviews_count   INTEGER NOT NULL DEFAULT 0,
    booking_mode    TEXT    NOT NULL,             -- INSTANT | REQUEST
    commission_bps  INTEGER NOT NULL,             -- basis points, exact integer (invariant #5)
    payout_currency TEXT    NOT NULL,             -- ISO 4217
    booking_cutoff  TIME    NOT NULL DEFAULT '18:00',  -- Europe/Tirane local (invariant #4)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- TIMESTAMPTZ, never naked TIMESTAMP (invariant #6)
    CONSTRAINT venue_booking_mode_check CHECK (booking_mode IN ('INSTANT','REQUEST')),
    CONSTRAINT venue_rating_tenths_check CHECK (rating_tenths BETWEEN 0 AND 50)
);

CREATE TABLE set_position (
    id                BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id          BIGINT  NOT NULL REFERENCES venue(id),
    row_label         TEXT    NOT NULL,
    position_no       INTEGER NOT NULL,
    tier              TEXT    NOT NULL,           -- PREMIUM | STANDARD
    pool              TEXT    NOT NULL,           -- ONLINE | WALK_IN
    price_minor       BIGINT  NOT NULL,           -- integer minor units (invariant #5)
    price_currency    TEXT    NOT NULL,           -- ISO 4217
    grid_x            INTEGER NOT NULL,           -- column 1..6
    grid_y            INTEGER NOT NULL,           -- row 1..4
    seed_availability TEXT    NOT NULL DEFAULT 'FREE',  -- FREE | TAKEN (U1 seed-only; U2 owns the real table)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT set_position_tier_check  CHECK (tier IN ('PREMIUM','STANDARD')),
    CONSTRAINT set_position_pool_check  CHECK (pool IN ('ONLINE','WALK_IN')),
    CONSTRAINT set_position_avail_check CHECK (seed_availability IN ('FREE','TAKEN')),
    CONSTRAINT set_position_price_check CHECK (price_minor >= 0),
    CONSTRAINT set_position_cell_uniq   UNIQUE (venue_id, row_label, position_no)
);
CREATE INDEX set_position_venue_id_idx ON set_position (venue_id);  -- index the FK (PG won't)
```

```sql
-- V3__seed_miramar_demo.sql
-- Pre-launch DEMO fixture: Miramar Beach Club, Ksamil (from the U1 design contract).
-- 4 rows × 6 sets; front row PREMIUM/ONLINE, rows 2–3 STANDARD/ONLINE, row 4 WALK_IN.
-- 6 taken → 18 of 24 free. To be removed/superseded when U7 venue onboarding lands.
-- PK is identity, so we do NOT supply venue.id; child rows resolve venue_id by name.
INSERT INTO venue (name, beach, region, description, rating_tenths, reviews_count,
                   booking_mode, commission_bps, payout_currency, booking_cutoff)
VALUES ('Miramar Beach Club', 'Ksamil', 'Albanian Riviera',
        'Premium loungers on the Ksamil shoreline.',
        48, 326, 'INSTANT', 1500, 'EUR', '18:00');

-- 24 sets resolve their venue_id via a sub-select on the venue name (no hard-coded id).
-- Front €45 PREMIUM ONLINE; Row 2 €35, Row 3 €30 (STANDARD ONLINE); Row 4 €25 WALK_IN.
INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
                          price_minor, price_currency, grid_x, grid_y, seed_availability)
SELECT v.id, s.row_label, s.position_no, s.tier, s.pool,
       s.price_minor, 'EUR', s.position_no, s.grid_y, s.seed_availability
FROM   venue v
CROSS  JOIN (VALUES
  -- (row_label, position_no, tier, pool, price_minor, grid_y, seed_availability) … 24 rows
  ('Front row · Sea view', 1, 'PREMIUM', 'ONLINE', 4500, 1, 'TAKEN')
  -- … remaining 23 VALUES rows authored at build from the design's taken pattern
) AS s(row_label, position_no, tier, pool, price_minor, grid_y, seed_availability)
WHERE  v.name = 'Miramar Beach Club';
```

> The 24-row `VALUES` block is generated at build time from the design's taken pattern
> (Front `t a a t a a`, Row2 `a a t a a a`, Row3 `a t a a a t`, Row4 `a a a t a a`);
> prices 4500/3500/3000/2500 minor units, EUR; `grid_x = position_no`, `grid_y` = 1..4.
> Idempotency: V3 runs once (versioned). The seed venue is the first `venue` row → **id `1`**,
> which the FE demo link (`/venues/1`) targets.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueSeedMigrationIT*"` → PASS.

> Scope (end-of-phase regression): `./gradlew test --tests "ai.riviera.platform.venue.*"`.

- [ ] **Step 5: Generalization-audit pass** — n/a (first migration of this shape); record in the log.
- [ ] **Step 6: Commit** — `git commit -m "feat(venue): schema + demo seed for the beach map (#4)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Venue read model + API + security

**Files:** Create the `venue` `api`/`domain`/`application`/`infrastructure` classes; modify `SecurityConfig`; create `VenueReadControllerIT`.

- [ ] **Step 1: Write the failing test** — `@SpringBootTest` + Testcontainers + `MockMvc` against the seeded venue.

```java
package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class VenueReadControllerIT {

    private static final long MIRAMAR = 1L; // first seeded venue (identity PK)

    @Autowired MockMvc mvc;

    @Test
    void returnsVenueWithSets() throws Exception {
        mvc.perform(get("/api/venues/{id}", MIRAMAR))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.name").value("Miramar Beach Club"))
           .andExpect(jsonPath("$.bookingMode").value("INSTANT"))
           .andExpect(jsonPath("$.sets.length()").value(24));
    }

    @Test
    void pricesAreIntegerMinorUnits() throws Exception {
        mvc.perform(get("/api/venues/{id}", MIRAMAR))
           .andExpect(jsonPath("$.fromPrice.minorUnits").value(2500))
           .andExpect(jsonPath("$.fromPrice.currency").value("EUR"))
           .andExpect(jsonPath("$.sets[0].price.minorUnits").isNumber());
    }

    @Test
    void unknownVenueReturns404() throws Exception {
        mvc.perform(get("/api/venues/{id}", 999_999L))
           .andExpect(status().isNotFound());
    }

    @Test
    void endpointIsPublic() throws Exception { // no auth header → still 200, not 401
        mvc.perform(get("/api/venues/{id}", MIRAMAR)).andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueReadControllerIT*"` → FAIL (404/401 / no controller).

- [ ] **Step 3: Minimal implementation** — port, views, service, JDBC repo, controller, security.

```java
// venue/api/VenueCatalog.java
package ai.riviera.platform.venue.api;
import ai.riviera.platform.venue.domain.VenueId;
import java.util.Optional;
public interface VenueCatalog {            // the one real seam (deep module)
    Optional<VenueMapView> findVenueMap(VenueId id);
}
// venue/domain/VenueId.java  → record VenueId(long value) {}
```

```java
// venue/api/MoneyView.java
package ai.riviera.platform.venue.api;
public record MoneyView(long minorUnits, String currency) {}
```

```java
// venue/api/SetView.java
package ai.riviera.platform.venue.api;
public record SetView(String id, String rowLabel, int positionNo, String tier,
                      String pool, MoneyView price, int gridX, int gridY,
                      String availability) {}
```

```java
// venue/api/VenueMapView.java
package ai.riviera.platform.venue.api;
import java.util.List;
public record VenueMapView(String id, String name, String beach, String region,
                           String description, int ratingTenths, int reviewsCount,
                           String bookingMode, MoneyView fromPrice, List<SetView> sets) {}
```

```java
// venue/infrastructure/in/VenueReadController.java
package ai.riviera.platform.venue.infrastructure.in;
import ai.riviera.platform.venue.api.*;
import ai.riviera.platform.venue.domain.VenueId;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/venues")
class VenueReadController {
    private final VenueCatalog catalog;
    VenueReadController(VenueCatalog catalog) { this.catalog = catalog; }

    @GetMapping("/{venueId}")
    ResponseEntity<VenueMapView> getVenue(@PathVariable long venueId) {
        return catalog.findVenueMap(new VenueId(venueId))
                      .map(ResponseEntity::ok)
                      .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
```

```java
// SecurityConfig.java — permit the public read endpoint
.requestMatchers("/actuator/health/**").permitAll()
.requestMatchers(org.springframework.http.HttpMethod.GET, "/api/venues/**").permitAll()
.anyRequest().authenticated()
```

> `JdbcVenueCatalog` (`infrastructure.out`) implements `api.VenueCatalog` directly (no
> separate application service / out-port in U1 — see the seam note): one `JdbcClient`
> query loads the venue + its sets, computes `fromPrice = min(price_minor)`, and assembles
> the `VenueMapView`. All SQL explicit (invariant #1) — no JPA. Method bodies authored at
> build, no placeholders left.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueReadControllerIT*"` → PASS.

> Scope (end-of-phase regression): `./gradlew test --tests "ai.riviera.platform.venue.*"` **and** `./gradlew test --tests "*ModularityTests*"` (invariant #11 gate).

- [ ] **Step 5: Generalization-audit pass** — confirm no other module reaches into `venue` internals; record.
- [ ] **Step 6: Commit** — `git commit -m "feat(venue): public read API for the beach map (#4)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Angular beach-map component

**Files:** Create `venue.model.ts`, `venue.client.ts`(+spec), `venue-map.component.ts`(+html+spec); modify `app.routes.ts`, `index.html`, `styles.scss`.

> Load `angular-developer`; run angular-cli MCP `get_best_practices` and `list_projects` first.

- [ ] **Step 1: Write the failing component spec** — render from a fake `VenueMapView`.

```ts
// venue-map.component.spec.ts (shape — finalized via angular-developer)
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { VenueMap } from './venue-map.component';

const FIXTURE = /* 24-set VenueMapView with 6 TAKEN, fromPrice 2500/EUR */;

describe('VenueMap', () => {
  it('renders 24 tiles, premium row distinct, prices, and the free-count line', async () => {
    // configure TestBed with provideHttpClient + testing, render, flush FIXTURE,
    // expect 24 .set-tile, a .premium tile in row 1, 6 .taken tiles,
    // text '€45' derived from minorUnits, and '18 of 24 sets free'.
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- --watch=false --browsers=ChromeHeadless` → FAIL (no component).
- [ ] **Step 3: Minimal implementation** — standalone `VenueMap` (signals + `httpResource`/`resource()`), `VenueClient`, `venue.model.ts`; route `venues/:id`; fonts + tokens. Tile states per the design table; money via `Intl.NumberFormat` from minor units (no float in state).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- --watch=false --browsers=ChromeHeadless` → PASS; `npm run lint` clean.
- [ ] **Step 5: Generalization-audit pass** — record any reusable money/format helper.
- [ ] **Step 6: Commit** — `git commit -m "feat(frontend): render the U1 beach map (#4)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Wiring, full-suite, AC verification

**Files:** `app.routes.ts` (demo link/redirect per the resolved Open Question); any polish.

- [ ] **Step 1:** Resolve the home→venue Open Question (default: add a "View demo venue" link on home).
- [ ] **Step 2:** Run the **full** backend suite — `./gradlew build` (includes `ModularityTests`).
- [ ] **Step 3:** Run the **full** frontend gate — `npm run build && npm test -- --watch=false --browsers=ChromeHeadless && npm run lint`.
- [ ] **Step 4:** Walk the Acceptance-criteria verification table below; tick each with its commit SHA.
- [ ] **Step 5:** Run the Self-review checklist; fix or log any gap.
- [ ] **Step 6: Commit** — `git commit -m "chore(u1): wire demo route + AC verification (#4)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*VenueSeedMigrationIT*"` → PASS. Verified at `<sha>`.
- [ ] **AC-2:** `./gradlew test --tests "*VenueReadControllerIT*"` (`returnsVenueWithSets`) → PASS. `<sha>`.
- [ ] **AC-3:** `VenueReadControllerIT.pricesAreIntegerMinorUnits` → PASS. `<sha>`.
- [ ] **AC-4:** `VenueReadControllerIT.unknownVenueReturns404` → PASS. `<sha>`.
- [ ] **AC-5:** `VenueReadControllerIT.endpointIsPublic` → PASS. `<sha>`.
- [ ] **AC-6/AC-7:** `npm test` (`venue-map.component.spec.ts`) → PASS. `<sha>`.
- [ ] **AC-8 (a11y):** `npm test` accessible-name assertions + AXE check → PASS. `<sha>`.
- [ ] **AC-9:** CI pipeline green on the pushed branch. `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the shipped code (plan code-sketches are intentional).
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section honored: U1 creates **no** `availability` table; only seed flag (invariant #2 deferred to U2).
- [ ] Pool flag present in seed + DTO; cutoff stored not evaluated (invariants #3, #4).
- [ ] **Modulith** section: controller depends only on `venue.api`; `ModularityTests.verify()` green; no cross-module internal imports (invariant #11).
- [ ] **Payment/payout** N/A justified; money is integer minor units on the wire and in DB (invariant #5).
- [ ] Timezone: `booking_cutoff` stored as local `Europe/Tirane` time; no JVM-default reliance (invariant #6).
- [ ] Flyway migrations present; layout constraint (`UNIQUE(venue_id,row_label,position_no)`) tested (invariant #12).
- [ ] **Frontend** standards met (no explicit `standalone:true`/`OnPush`; `[class]`/`[style]` not `ngClass`/`ngStyle`; `@Service`/`inject()`/signals) or deviation documented; no `as any` on the contract.
- [ ] **Accessibility** (AC-8): tiles have accessible names, state not colour-only, AXE passes, WCAG AA contrast met.
- [ ] **PKs are `BIGINT` identity** (no random UUIDv4); FK columns indexed; `created_at TIMESTAMPTZ`; CHECK over ENUM (per `postgres` skill).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
