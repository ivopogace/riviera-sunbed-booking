# Package-Structure Migration Runbook (ADR-0007)

> Drives the restructure from the seven-package convention to the two-template layout. **One module
> per PR, no behavior change.** The two architecture tests are the safety net and the proof at each
> step. Order is smallest-first so the ritual is proven on trivial modules before `booking`.

---

## The safety net (why this is low-risk)

Spring Modulith boundaries are declared on **`api`/`spi` named interfaces**, and `allowedDependencies`
references **modules and their named interfaces** (`venue::api`, `venue::spi`) — **never internal
package names** like `application.in` or `infrastructure.out`. So collapsing/renaming internal
packages is **invisible to the cross-module graph**. Every PR must keep green:

- `ModularityTests` (`ApplicationModules.verify()`) — proves no boundary broke.
- `JdbcOnlyArchitectureTests` — proves no JPA crept in.
- the module's own unit + `@ApplicationModuleTest` + Testcontainers ITs — proves no behavior changed.

If all three stay green, the restructure is correct. If `ModularityTests` goes red, a boundary was
actually crossed — stop and fix the move, don't weaken the test.

**Do NOT combine** this migration with the `api`→ports/vocabulary/events split (improvement-plan B2)
or any logic change. Pure move-class PRs only. Mixing them destroys the "green = safe" guarantee.

---

## The generic per-module PR (full template)

1. **Branch:** `refactor/pkg-<module>` off the feature branch. Title: `restructure <module> to ADR-0007 layout (no behavior change)`.
2. **`infrastructure/in` → `adapter/in`** — move controllers, `@ApplicationModuleListener`s, request/response DTOs, scheduling config. (IDE move-class / move-package; keep classes package-private.)
3. **`infrastructure/out` → `adapter/out`** — move `JdbcClient` repositories, gateways, code generators.
4. **Fold `application/in` + `application/out` → `application/`** — move the internal driving/use-case port interfaces, command/result records, and outbound driven-port interfaces up to sit beside their services. Delete the now-empty `in`/`out` packages.
5. **`domain/` unchanged.** **`api/` and `spi/` unchanged** — they stay top-level and exposed; their `@NamedInterface` `package-info.java` files do not move.
6. **Update imports** (IDE handles most). **Do not touch** `allowedDependencies` — the grants reference `::api`/`::spi`, which didn't move.
7. **Run the three-test net.** All green → PR. Any red → fix the move.
8. **Review** with `riviera-review-overlay` — **RV-BE-12** confirms the new shape; not-yet-migrated siblings are exempt.
9. **Merge.** Next module.

**Thin module (only `customer`):** steps 2–4 collapse to a single move — `infrastructure/out → adapter/out` (the direct JDBC adapter). There is no `application/`/`domain/` to fold; there must not be one after, either.

---

## The order and the specific moves

Current folders per module are shown so each PR's scope is concrete. (`◦` = folder exists today.)

### 1. `customer` — THIN (validates the ritual; ~1 move)
Today: `◦ api  ◦ infrastructure/out`. No service, no domain.
- `infrastructure/out` → **`adapter/out`** (`JdbcCustomerDirectory`, implements the `api` port directly).
- After: `api/` + `adapter/out/`. **No `application/`, no `domain/`.**
- *Settle here:* `adapter/out/` (recommended, uniform) vs `internal/` (Modulith-idiomatic). Pick once; it sets the thin-template convention.

### 2. `availability` — FULL, small
Today: `◦ api  ◦ application  ◦ application/in  ◦ infrastructure/in  ◦ infrastructure/out`. No domain, no `spi`.
- Fold `application/in` → `application/`.
- `infrastructure/in` → `adapter/in` (the claim-facing controller, if any).
- `infrastructure/out` → `adapter/out` (`JdbcAvailabilityClaim`, `JdbcSetAvailabilityLookup`).
- Keep `api/` (`AvailabilityClaim`). **No `spi`** (it *implements* `venue::spi`, doesn't own one). Confirm its `allowedDependencies = { venue::api, venue::spi }` still resolve untouched.

### 3. `payout` — FULL, pure subscriber
Today: `◦ application  ◦ application/in  ◦ application/out  ◦ domain  ◦ infrastructure/in  ◦ infrastructure/out`. **No `api`, no `spi`.**
- Fold `application/in` + `application/out` → `application/`.
- `infrastructure/in` → `adapter/in` (the `@ApplicationModuleListener`s consuming `BookingConfirmed`/`BookingCancelled`, plus any report controller).
- `infrastructure/out` → `adapter/out` (the ledger JDBC repos).
- `domain/` stays (5 types). **Add no `api/`** — it only consumes. Confirm `allowedDependencies = { booking::api, venue::api }` untouched.

### 4. `venue` — FULL, owns the `spi` inversion (highest care)
Today: `◦ api  ◦ spi  ◦ application  ◦ application/in  ◦ application/out  ◦ infrastructure/in  ◦ infrastructure/out`. No domain yet.
- Fold `application/in` + `application/out` → `application/`.
- `infrastructure/in` → `adapter/in`; `infrastructure/out` → `adapter/out`.
- **Verify `spi/SetAvailabilityLookup` stays in `venue/spi`** (top-level, `@NamedInterface("spi")`) and that `JdbcVenueCatalog` (now in `adapter/out`) still calls it. This is the one live cross-module inversion — the `ModularityTests` green here specifically proves the `venue ↔ availability` edge survived.

### 5. `payment` — FULL, most driven adapters
Today: `◦ api  ◦ application  ◦ application/out  ◦ domain  ◦ infrastructure/in  ◦ infrastructure/out`. No `application/in`, no `spi`.
- Fold `application/out` → `application/`.
- `infrastructure/in` → `adapter/in` (webhook controller, the Stripe webhook endpoint).
- `infrastructure/out` → `adapter/out` (**all four**: the real Stripe gateway, the stub/test gateway, and the two JDBC repos).
- Keep `api/` (`CheckoutPort`, `Money`) + `domain/` (the status enum).

### 6. `booking` — FULL, sliced (LAST, once the pattern is proven)
Today: `◦ api  ◦ application  ◦ application/in  ◦ application/out  ◦ domain  ◦ infrastructure/in  ◦ infrastructure/out`.
- Fold `application/in` + `application/out` → `application/` **and slice** into:
  - `application/reserve/` — `CreateBooking(+Command,+Outcome)`, `ReserveSetService`, `ConfirmBooking`, `ClaimReleaseService`, `ReserveOutcome`, `NewBooking`.
  - `application/cancel/` — `CancelBooking(+Outcome)`, `CancelBookingService`, `CancellationPolicy`, `BookingCutoff`.
  - `application/refund/` — `RefundForWeather`, `WeatherRefundService`, `AbandonedBookingSweepService`, `ExpireAbandonedBookings`, `ReleaseAbandonedBooking`.
  - `application/view/` — `ViewBooking`, `ViewBookingService`, `DailyBooking`, `ListDailyBookings`.
  - `Bookings` (outbound port) + `BookingCodeGenerator` stay at `application/` root, shared by slices.
- `infrastructure/in` → `adapter/in` (`BookingController`, `StaffBookingController`, `AdminWeatherRefundController`, `AbandonedBookingScheduler`, **`PaymentEventListener`, `BookingRefundListener`** — both are *driving* adapters, both go here — plus DTOs).
- `infrastructure/out` → `adapter/out` (`JdbcBookings`, `SecureRandomBookingCodeGenerator`).
- Keep `api/` (events + ids, consumed by `payout`/`payment`) + `domain/` (`BookingStatus`, `RefundPolicy`, flat).

### (parallel) `operator` — built NEW in the target shape (not a migration)
Part of **A1** (the launch blocker), not this migration. Build it directly full: `api/` (the `assertOwns` / `ownerOf` port) + `application/` + `domain/` + `adapter/in` + `adapter/out`. It is the greenfield reference the migrated modules converge on — so ideally land A1's `operator` *first* or early, and mirror its shape in the migrations.

---

## After the last module lands

Enable the **package-shape ArchUnit rule (improvement-plan Workstream C5)** — allowed top-level set,
adapter-direction-not-technology, `api`/`spi` top-level, hexagon direction. Not before: enforcing the
shape mid-migration just fights a rule while modules are still moving. From then on RV-BE-12's
structural half is machine-checked; the thin-vs-full and slicing judgment stays review-only.

## Gotchas

- **`allowedDependencies` never changes** in a migration PR. If you find yourself editing it, you've
  crossed a boundary or the move is wrong — stop.
- **`@NamedInterface` `package-info.java` for `api`/`spi` does not move** — those packages stay put;
  only the internals below reshuffle.
- **Package-private stays package-private.** The encapsulation that makes adapters/services hidden is
  load-bearing; a move that flips something to `public` to compile is a smell, not a fix.
- **One module, one PR, no logic.** The moment a PR also changes behavior or does the api-split (B2),
  "green tests = safe move" stops being true.
- **Not-yet-migrated modules are fine.** During the migration the codebase is mixed; RV-BE-12 only
  fires on *new* packages added in the old shape, not on modules awaiting their turn.
