# Venue pricing: EUR only, price > 0 — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** every venue write that carries a set price refuses a currency other than `EUR` and a
`priceMinor` ≤ 0 with `400 INVALID_REQUEST`, and `set_position` refuses both at the database.

**Architecture:** the set-price rule has two callers that must agree — the application commands
(`SetCommand`, `RowPriceCommand`, `SetBatchCommand`) and the published `vocabulary.LayoutCell`
`remodel` builds — so it gets one named holder in `venue.vocabulary` (ADR-0018 §1), mirrored by
V76's CHECKs. The payout currency (`NewVenueCommand`) keeps its own any-ISO-4217 check.

**Source of intent:** issue #1294 (owner decision + agent brief, 2026-10-02).

**Branch:** `bugfix/1294-venue-pricing-eur-positive`

## Acceptance criteria

- [ ] **AC-1:** Given a set price in `ALL`, or of `0` minor units, when a `SetCommand`,
  `RowPriceCommand`, `SetBatchCommand` or `LayoutCell` is built, then it throws
  `IllegalArgumentException` (→ 400); `EUR` with `1` is accepted. *Seam:* the record constructors ·
  *Pinned by:* `SetCommandTest`, `RowPriceCommandTest`, `SetBatchCommandTest`, `LayoutCellTest`.
- [ ] **AC-2:** Given an owner, when they add a set or reprice a row with `ALL` or `0`, then the
  endpoint answers `400` problem+json `INVALID_REQUEST` and nothing is written. *Seam:*
  `POST /api/venues/{id}/sets`, `PUT /api/venues/{id}/rows/{row}/price` · *Pinned by:*
  `VenueAdminControllerIT`, `VenueRepriceIT`.
- [ ] **AC-3:** Given V76, when a `set_position` row is inserted or updated with `price_minor = 0` or
  `price_currency = 'ALL'`, then a CHECK constraint refuses it. *Seam:* the table · *Pinned by:*
  `SetPositionPriceMigrationIT`.
- [ ] **AC-4:** `NewVenueCommand` still accepts a non-EUR payout currency. *Pinned by:*
  `NewVenueCommandTest`.

## Non-goals

Multi-currency pricing or a venue price-currency column; the payout currency; free sets or
zero-total bookings; operator UI changes (a 400 already surfaces; the UI defaults to EUR).

## Risks

- **R-1:** an existing production row at `0` or non-EUR → V76 adds both CHECKs validated (no
  `NOT VALID`), so the migration fails loudly and rewrites nothing; the PR says so. The V3 seed is
  EUR with positive prices.
- **R-2:** lock — `ADD CONSTRAINT … CHECK` takes `ACCESS EXCLUSIVE` and scans; `set_position` is a
  few hundred rows, so the scan is negligible.
- **R-3:** test fixtures inserting a 0 or non-EUR set → swept: every `INSERT INTO set_position`
  in `src/test` is EUR with a positive price.
- **R-4:** `PlanItineraryService.price`'s mixed-currency guard stays as an unreachable
  `IllegalStateException`; no input reaches it once every price is EUR.

## Open questions

### Resolved

- EUR only? Zero legitimate? — owner, 2026-10-02: EUR only; a price is > 0.
- Flyway version — V76, the only migration in wave A.

## Phases

- **Phase 0 — command rule:** red `SetCommandTest`/`RowPriceCommandTest`/`SetBatchCommandTest`/
  `LayoutCellTest` for `ALL` and `0`, then the vocabulary holder.
- **Phase 1 — endpoints:** red `VenueAdminControllerIT`/`VenueRepriceIT` 400s (green from phase 0).
- **Phase 2 — V76:** red `SetPositionPriceMigrationIT`, then the migration.
- **Phase 3 — docs:** RESPONSIBILITIES.md §venue pricing rule.

## Execution status

- [x] Phase 0 (local run pending: Maven Central 429)
- [x] Phase 1 (local run pending: Maven Central 429)
- [x] Phase 2 (local run pending: Maven Central 429)
- [x] Phase 3 (local run pending: Maven Central 429)
