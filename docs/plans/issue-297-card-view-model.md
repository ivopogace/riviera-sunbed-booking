# Home / venue-map card `computed()` view-model refactor — Implementation Plan

**Goal:** Replace the parameterized pure-method calls the home venue card and the
venue-map header make from their templates (`rating(v)`, `isRated(v)`, `freePercent(v)`,
`cardLabel(v)`, `bookingModeLabel(...)`, `cardAmenities(v)`, `toWater(v)`, …) with a
`computed()` view-model that memoizes the derivation off the source signal, so the
template iterates ready-made fields instead of re-deriving on every change-detection tick.
Pure refactor — **zero behaviour, visual, a11y, or copy change**.

**Architecture:** The derivation moves from per-item template method calls into a
`computed()` on the component. Home gets a `venuesView` array computed off `venues()` (and
`selectedDate()`, which the aria-label folds in); venue-map gets a single `venueView`
computed off `venue()`. The shared pure helpers (`shared/rating.ts`, `shared/amenities.ts`,
`shared/money.ts`, `shared/booking-date-label.ts`) **stay pure and signal-free** — the
`computed()` lives in the component and *calls* them (the #154 layering: signals model
reactive state at the component layer; `shared/` stays stateless).

**Persistence:** N/A — frontend-only; no backend, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #297 (follow-up from #154 / PR #296).

**Skills consulted:** `riviera-frontend` (both files stay in place — `pages/home/`,
`venue/`; no folder move, `shared/` helpers stay pure per the import-direction rule),
`angular-developer` + angular-cli `get_best_practices` (`computed()` view-model is the
canonical derived-state idiom; keep templates logic-free), `riviera-plan-doc` (this doc),
`riviera-local-debug` (scoped `npm test`/`lint`/`build` recipe). `postgres` /
`riviera-modulith` / `riviera-stripe-payments` — **N/A**, no DB/backend/money in scope.
`riviera-tailwind` — **N/A**, no class edits (bindings only re-point to VM fields; every
Tailwind class stays byte-identical). `playwright-cli` — **N/A for new specs**: a
no-behaviour-change refactor ships no new e2e; the existing `discovery-flow.e2e.ts`,
`discover-photos.e2e.ts`, and `venue-map-pan.e2e.ts` are the parity harness and must stay
green (RV-FE-E2E: existing coverage suffices for a pure refactor).

**Branch:** cloud session — the designated remote branch `claude/sdlc-297-r4i4nu` stands in
for `feature/<slug>` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (home behaviour parity):** Given the existing `home.spec.ts` fixture (two
  venues + unrated + zero-sets cases), when the home page renders, then every existing
  assertion passes unchanged — card count, name/location/rating/price/availability text,
  the "New" state + aria "no reviews yet", the ≤3 catalogue-ordered amenity chips + to-water
  chip folded into the aria-label, the `round(free/total*100)%` fill, and the full
  accessible name. Pinned by `home.spec.ts` (unmodified).
- [ ] **AC-2 (venue-map behaviour parity):** Given the existing `venue-map.spec.ts` fixture,
  when the map renders, then rating/reviews, "New" pill (aria "No reviews yet"), full
  catalogue-ordered amenity row + to-water chip, description, mode chip, and per-row prices
  all render identically. Pinned by `venue-map.spec.ts` (unmodified).
- [ ] **AC-3 (no template method-call derivations):** Given the refactored `home.html` and
  `venue-map.html`, when grepped, then no per-item parameterized derivation method is called
  from the template (`rating(`, `isRated(`, `freePercent(`, `cardLabel(`,
  `bookingModeLabel(`, `cardAmenities(`, `headerAmenities(`, `toWater(`); the template reads
  `card.*` / `v.*` VM fields. (`money(row.price)` for per-row set prices legitimately stays —
  it is not a per-venue card derivation.)
- [ ] **AC-4 (helpers stay pure):** Given `shared/rating.ts` and the other pure helpers, when
  diffed, then they are unchanged and signal-free.
- [ ] **AC-5 (no drift):** Given the a11y + contrast specs, when run, then
  `home.a11y.spec.ts`, `home.contrast.spec.ts`, `venue-map.a11y.spec.ts`,
  `venue-map.contrast.spec.ts` pass unchanged; `npm run lint` and `npm run build` are clean.

## Availability & concurrency

N/A — no booking, availability, or beach-map *write* path is touched. This is a read-only
tourist display refactor; availability truth stays server-side (invariant #2), unchanged.

## Spring Modulith modules / interfaces / events

N/A — no backend Java in scope.

## Payment & payout

N/A — no money movement; money rendering stays via the pure `formatMoney` helper
(invariant #5), unchanged.

## Behaviour-parity ledger (old surface → new)

The "old surface" is the two templates' per-item method-call derivation. Each behaviour is
**preserved** — the VM computes the identical string/number via the same pure helpers:

| Behaviour (home) | Old | New | Status |
|---|---|---|---|
| Card aria-label (full accessible name) | `cardLabel(venue)` | `card.ariaLabel` | preserved (same concatenation) |
| Rating display / rated gate | `rating(v)` / `isRated(v)` | `card.rating` / `card.isRated` | preserved |
| Mode chip | `bookingModeLabel(v.bookingMode)` | `card.modeLabel` | preserved |
| ≤3 amenities (catalogue order) + labels | `cardAmenities(v)` + `amenityText(c)` | `card.amenities` (`{code,label}[]`) | preserved |
| To-water chip | `toWater(v)` | `card.water` | preserved |
| Availability bar fill | `freePercent(v)` | `card.freePercent` | preserved |
| From-price / "No sets yet" | `money(from)` | `card.priceLabel` (`null` ⇒ "No sets yet") | preserved |
| Cover photo / gradient fallback | `venue.coverPhoto` | `card.coverPhoto` | preserved |

| Behaviour (venue-map header) | Old | New | Status |
|---|---|---|---|
| Mode chip / rating / rated gate / reviews | `bookingModeLabel`/`rating`/`isRated` | `v.modeLabel`/`v.rating`/`v.isRated`/`v.reviewsCount` | preserved |
| From-price | `money(from)` | `v.priceLabel` | preserved |
| Full amenity row + to-water | `headerAmenities`+`amenityText` / `toWater` | `v.amenities` / `v.water` | preserved |
| Name/beach/region/description/coverPhoto/bookingMode (dialog) | raw `v.*` | carried on the VM | preserved |
| Per-row set price / grid / free-count | `money(row.price)`, `rows()`, `freeCount()` | **unchanged** (not header derivations) | preserved |

Nothing is changed or dropped.

## Phases

- [ ] **Phase 1 — home:** add `VenueCard` VM interface + `venuesView` computed + private
  `toCard` mapper; re-point `home.html` `@for` to iterate the VM; delete the now-unused
  template-only methods (`money`, `rating`, `isRated`, `bookingModeLabel`, `freePercent`,
  `cardAmenities`, `amenityText`, `toWater`, `cardLabel`). Run `home*.spec.ts` + lint.
- [ ] **Phase 2 — venue-map:** add `venueView` computed off `venue()` + re-point the header
  `@if (venue(); as v)` gate to it; delete the now-unused header methods (`rating`,
  `isRated`, `bookingModeLabel`, `headerAmenities`, `amenityText`, `toWater`). Keep `money`
  (per-row/tile prices), `rows`, `freeCount`, `totalCount`, `mapCols`. Run `venue-map*.spec.ts` + lint.
- [ ] **Phase 3 — verify:** full frontend `npm test` + `npm run lint` + `npm run build`; CI gate.

## Risk register

- **R-1 aria-label byte drift** (the `cardLabel` concatenation is asserted by substring in
  specs, but a stray space would be a real a11y regression) → reproduce the exact template
  literal in `toCard` and rely on the unmodified `home.spec.ts` accessible-name assertions.
  Mitigated.
- **R-2 gate-signal semantics change** (switching the venue-map `@if` from `venue()` to
  `venueView()`) → `venueView()` is `undefined` iff `venue()` is `undefined`, so the
  loading/failed/loaded branch selection is identical. Low.
- **R-3 lost CD memoization benefit not actually realized** if the VM still reads a signal
  per item — keep `selectedDate()`/`dateLabel()` read **once** per computed evaluation, not
  per mapped item. Addressed in `toCard` signature (dateLabel passed in).

## Open questions / assumptions

- **A-1:** No new unit spec is required — the existing specs already assert the rendered
  output the refactor must preserve, which is exactly the behaviour-parity check the issue
  asks for. (If review disagrees, a `venuesView`-shape spec is a one-file add.)

## Execution status

- **Stage:** Implemented + pushed; **CI green**; **Review gate passed (no findings)**. Awaiting
  user decision on opening a PR (which triggers the Sonar gate + Merge close-out).
- **Next action:** Open a PR into `main` iff the user asks — that runs the SonarCloud gate and
  enables merge. Not opening one unprompted (task said implement/commit/push).
- **CI:** run on commit `323623e` — success (backend build+test, frontend lint/test/build **incl.
  the mocked e2e suite that could not boot locally**, CodeQL).
- **Review gate:** `riviera-review-overlay` walked (FE scope) + independent adversarial parity
  review — CONFIRMED byte-parity on the home aria-label, gate-signal equivalence
  (`venueView()` undefined ⇔ `venue()` undefined), full VM field coverage, no leftover template
  derivations, amenity cap/order + edge cases (total 0 → 0%, null price → "No sets yet") preserved.
  Zero class/style drift (RV-FE-7). No findings.
- **Phases:** P1 home ✅ · P2 venue-map ✅ · P3 verify ✅ (local + CI).
- **Local verification:** `npm run lint` clean; scoped `ng test` — 6 files / 111 specs green
  (`home.spec`, `home.a11y`, `home.contrast`, `venue-map.spec`, `venue-map.a11y`,
  `venue-map.contrast`); `npm run build` clean (pre-existing SCSS-budget warnings only, untouched
  files). e2e (`discovery-flow`, `discover-photos`, `venue-map-pan`, `booking-flow`) deferred to
  CI — the local Playwright webServer boots the backend via the proxy-blocked Gradle wrapper.
- **Findings register:** (empty).
