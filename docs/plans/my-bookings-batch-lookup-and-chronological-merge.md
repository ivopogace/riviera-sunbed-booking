# My-bookings cleanups (#246): batch the venue lookup (F3) + chronological merge (F4)

> Compact plan doc (right-sized per `riviera-sdlc` rule 6): two deferred, independent
> cleanups from the S3 (#114) review gate, PR #245. No schema change, no API-shape change,
> no new module. Template sections that don't apply carry an explicit N/A.

**Goal:** `GET /api/me/bookings` resolves all venue/set display facts in **one** venue-module
query instead of N (F3), and the merged My-bookings list renders **globally sorted by booking
date, newest first**, re-sorting as async device rows resolve (F4).

**Architecture:** F3 adds a batch method to the existing `venue.api.SetBookingFacts` port
(same consumer role as the single-id read, per the #94 role split — no new port) with a
`WHERE sp.id IN (:ids)` JdbcClient query; deliberately **no default method**, so every
implementor (and future adapter) must decide batch semantics explicitly and the N+1 cannot
silently reappear behind a defaulted loop. F4 keeps the raw `bookingDate` on the loaded row
state and re-sorts on every row resolution/merge — dated rows `bookingDate` DESC (matching
the backend's `ORDER BY booking_date DESC, id DESC`), undated (loading/failed) rows last,
stable within ties — preserving the F2 rule (device rows render immediately) and the #164
bounded fetch queue untouched.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — one new
read-only query in `JdbcVenueCatalog`.

**Source of intent:** GitHub issue #246 (deferred F3/F4 from the #114/S3 review, PR #245).

**Skills consulted:** `riviera-sdlc` (routing + issue-intake grill — confirmed both findings
still reproduce verbatim post-#484; no open-PR overlap, no Flyway number in play) ·
`riviera-plan-doc` (this template — forced the undated-row placement decision below) ·
`tdd` (failing specs first per phase: SetBookingInfoIT batch cases, my-bookings sort specs) ·
`riviera-review-overlay` (self-review against RV-BE/FE bank before push — no PR requested,
so the `/code-review` gate has no PR to run on; recorded honestly here) ·
`riviera-docs-freshness` (ran over this slice's diff — no substrate doc states the my-bookings
enrichment cardinality or list order; 0 findings) · `riviera-modulith` (batch stays on
`SetBookingFacts`, ports-only `api/`, no grant change — consumers already hold
`venue::api` + `::vocabulary`) · `riviera-java-conventions` (text-block SQL, `Map`-returning
port, no default-method logic on the port, `.toList()`/records) · `riviera-local-debug`
(system `gradle` + JDK-25 toolchain, scoped tests only) · `riviera-frontend` (all F4 files stay
in `booking/`; no cross-feature edge) · `angular-developer` + angular-cli MCP
(signals `update` + pure sort helper; best-practices check) · `playwright-cli` (mocked-suite
e2e order assertion in `frontend/e2e/my-bookings.e2e.ts` — CI-safe suite, RV-FE-E2E placement).

**Branch:** `claude/sdlc-246-evaluation-rt9f4t` (cloud session — designated branch stands in
for `feature/<slug>` per the riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1 (F3):** Given N account bookings across M distinct sets, when `MyBookings.forCustomer`
  runs, then the venue module is consulted via **one** `setBookingInfos` batch call (not N
  single-id calls) and every summary carries its venue/set display facts. *Pinned by:*
  `SetBookingInfoIT.resolvesBatchBookingInfoInOneCall` (adapter semantics) +
  `MyBookingsIT.listsOnlyTheAuthenticatedCustomersBookings` (endpoint still enriches correctly).
- [x] **AC-2 (F3):** Given a batch request containing an unknown set id, when `setBookingInfos`
  runs, then the unknown id is simply absent from the returned map (and an empty id set returns
  an empty map without touching the database). *Pinned by:* `SetBookingInfoIT.batchOmitsUnknownSetsAndAnswersEmptyInputEmpty`.
- [x] **AC-3 (F3):** Given a booking whose set is impossibly missing from the batch result, when
  enrichment runs, then it fails loud (`IllegalStateException`), never silently dropping a paid
  booking (preserves S3 review F5). *Pinned by:* the `orElseThrow`-equivalent guard in
  `MyBookingsService` (unchanged failure contract; exercised structurally — the FK
  `ON DELETE RESTRICT` makes the state unreachable in an IT).
- [x] **AC-4 (F4):** Given loaded rows with distinct booking dates (from device fetches and the
  account merge, in any arrival order), when the list renders, then rows appear in `bookingDate`
  DESC order regardless of source. *Pinned by:* `my-bookings.spec.ts` — "orders the merged list
  chronologically (newest booking date first), account and device rows interleaved (F4 #246)".
- [x] **AC-5 (F4):** Given rows still loading or failed (date unknown), when the list renders,
  then dated rows sort first and undated rows keep their relative order after them; a row moves
  into sorted position when its fetch resolves; device rows still render immediately (F2
  preserved). *Pinned by:* `my-bookings.spec.ts` — "re-sorts a device row into place when its
  date resolves, keeping undated rows last" + existing F2 spec staying green.

## Non-goals

- No paging/limit on `GET /api/me/bookings` (list size is bounded by real usage; out of scope).
- No change to the wire DTOs, endpoint shape, or `GET /api/bookings/{code}`.
- No re-sort animation/UX polish; no change to the #164 fetch bound or dequeue-skip.
- No back-linking of guest bookings (permanent non-goal, D-6).

## Behavior-parity ledger

N/A — no surface retired; both changes adjust behavior of live surfaces additively (order +
call cardinality), with every existing spec kept green.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Batch map loses the fail-loud contract (missing set silently dropped) | low | med | explicit null-check throw in `enrich`, same message/type as before | session | closed — kept `IllegalStateException` |
| R-2 | `IN (:ids)` with empty collection is invalid SQL | med | low | early-return `Map.of()` before the query; AC-2 test | session | closed — guarded + tested |
| R-3 | F4 re-sort breaks the #164 dequeue-skip or F2 immediate render | low | high | sort is a pure post-step inside existing `rows.update` calls; full existing spec suite re-run | session | closed — all prior specs green |
| R-4 | Frontend sort disagrees with backend order (double reorder flicker) | low | low | same key + direction as `JdbcBookings.findByAccountId` (`booking_date DESC`), stable for ties | session | closed |

## Open questions / Assumptions

### Resolved

- **Undated (loading/failed) rows sort last, stable** — rationale: the steady state puts the
  chronological list first and failed/Retry cards at the bottom; initial all-loading render keeps
  device order (stable sort no-op), matching F2. Decided at plan time.
- **Newest-first (DESC)** — matches the shipped backend order (`booking_date DESC, id DESC`) and
  the issue's complaint (a tomorrow booking must sit above a month-old one).

## Availability & concurrency (invariant #2)

N/A — read-only display slice; no write path to `availability`, no claim/release involved.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | owns set/venue display facts; the batch read is the same fact, plural |
| M-2 | `booking` | existing | `Booking` | `MyBookingsService` is the consumer being de-N+1'd |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Change | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts` | add `Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId>)` | `booking` (view); existing single-id callers unchanged |

**Domain events** — none touched.

### Module ownership (§4a)

| Capability | Owner | Justification |
|---|---|---|
| Batch set-facts read | `venue` | `venue` Job: set/venue display + booking facts; not a cross-module join (invariant #11) — `booking` keeps consuming via the port |
| List enrichment + order | `booking` (BE) / `booking/` feature (FE) | `booking` Job: the my-bookings read model; FE order is display logic in the owning feature |

## Payment & payout

N/A — no payment in scope (amounts are displayed from existing data only).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity |
|---|---|---|---|---|
| FE-1 | `booking/my-bookings.ts` | existing | standalone component | signals; sort applied inside `rows.update`; `bookingDate` carried on the loaded `Row` variant (raw data stays out of the presentation `RowView`) |

## FE↔BE contract

N/A — no contract change; `bookingDate` was already on both `MyBookingSummary` and
`BookingDetail`.

## Execution status

**Stage pointer:** DONE — implemented, scoped tests green, pushed to
`claude/sdlc-246-evaluation-rt9f4t`; issue #246 closed. No PR was opened (session
instruction: PRs only on explicit request), so the `/code-review` + Sonar PR gates are
**deferred to the PR that merges this branch**; a `riviera-review-overlay` self-review ran
in-session instead.

**Next action:** open a PR from `claude/sdlc-246-evaluation-rt9f4t` when merging; run the
review + Sonar gates there.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | (this commit) |
| 1 — F3 backend batch lookup | ✅ | see branch |
| 2 — F4 frontend chronological merge | ✅ | see branch |

**Findings register** — none (no gate run yet; self-review findings were fixed inline).

## Generalization-audit log

| Date | Trigger | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | F3 | other per-row port calls in list reads | grep `setBookingInfo(` call sites | `MailDeliveryLookupService` (per-lookup, admin low-volume), `CancellationPolicy`/`ReserveSetService`/`StaffAvailabilityService` (single-entity by design) | skip — only the my-bookings list is N-per-request on a user-facing path |
