# Riviera backend overlay items

Gate → follow-up → default severity. Ids are not sequential — never renumber. Invariant
numbers: `CLAUDE.md`.

### RV-BE-1. Availability single source of truth (#2) — **Blocker**
Any write to `set_availability(set_id, booking_date)`: unique constraint present; the reservation
uses `SELECT … FOR UPDATE` or `INSERT … ON CONFLICT DO NOTHING` (0 rows = taken); no
check-then-insert; loser gets `409 SET_TAKEN`, not a 500; a concurrent-reservation test exists
(Major if missing). Online booking and staff tap-to-mark share the same guarded write.
Request-to-Book adds a pending hold on place and a release on decline / expiry sweep / guest
withdraw; those legs are separated by the row lock, not by predicate (decline and withdraw
guard on `status` alone).

### RV-BE-2. JDBC only (#1) — **Blocker**
No `spring-boot-starter-data-jpa` (a finding even if unused), no `@Entity`/`EntityManager`/
`JpaRepository` (Major). `JdbcOnlyArchitectureTests` probes the classpath; eyes go to the
build-file diff and to mapping staying explicit.

### RV-BE-3. Modulith boundaries (#11) — **Blocker**
No cross-module import of `application.*`/`adapter.*`/`domain.*`; new module has
`package-info.java` `@ApplicationModule` (Major). `ModularityTests` enforces the imports; eyes
go to query-vs-event (sync answer → `api/` port; state change → event) and RV-BE-3b.

### RV-BE-3b. API vs SPI — Major
Others *call* it → `api/`; another module *implements* it → `spi/` (`@NamedInterface("spi")`),
granted only to the implementor; the module's own adapter implements it → internal in
`application/` (Minor if published). Example: `venue.spi.SetAvailabilityLookup` implemented by
`availability` (granted `venue::api` + `venue::vocabulary` + `venue::spi`); `payout`, which only
calls venue, gets `venue::api` + `::vocabulary`. Both misfilings are `verify()`-legal — review is
the only catch.

### RV-BE-3c. Published-surface placement — Major
Ids/value records → `vocabulary/`, events → `events/`, ports only in `api/`/`spi/`
(`PublishedSurfacePlacementArchitectureTests`). A new sibling-facing method on `VenueCatalog`
instead of `SetBookingFacts`/`VenueRates` is a finding; a further tourist read is not. An event
class move ships an `event_type` Flyway rewrite (see `V18`).

### RV-BE-4. Events carry ids (#11) — Major
Payload = typed ids + immutable value facts; no aggregate or foreign module type; mutable
business fields as identity is a smell (Minor). Async side effects use
`@TransactionalEventListener(AFTER_COMMIT)`.

### RV-BE-5. Money is integer minor units (#5) — Major
`long`/`int` + currency; no `double`/`float`; `BigDecimal` euros in the domain is a smell;
any commission/payout division has a written, tested rounding rule (Minor if unstated).

### RV-BE-6. Timezone (#6) — Major
Booking date `LocalDate` in `Europe/Tirane`, cutoff computed there; no `LocalDateTime.now()`
/ JVM-default-zone arithmetic; timestamps stored as UTC `Instant` (Minor if cosmetic).

### RV-BE-7. Webhook is truth + idempotent (#8) — **Blocker**
Confirm only on a signature-verified webhook; dedupe on Stripe event id (no-op when already
applied); idempotency key on charge/refund from `BookingId` + operation; a test replays the
same event twice. Non-idempotent handler: Major.

### RV-BE-8. Payout ledger exactly-once (#9) — **Blocker**
Accrual keyed by `BookingId` so redelivery can't double; refund reverses; commission read from
the venue setting, never a constant (Major).

### RV-BE-9. Per-venue authorization / BOLA (#13) — **Blocker**
Any venue-scoped surface (`/api/venues/{venueId}/**`, payout ledger, staff bookings, beach-map
edit, staff availability, weather refund) calls `operator`'s `assertOwns` in the
**application service** (pinned by `CrossVenueDenialIT`). Denial is `403 NOT_VENUE_OWNER`
**before any existence check** — a 404 for an unowned venue leaks existence. `/api/admin/**`
is role-gated; `AdminSurfaceRoleGateTest` fails unless every mapped admin endpoint refuses
both non-admin principal types, so a new one needs its `hasRole(ADMIN_ROLE)` matcher.

### RV-BE-10. Error contract (`riviera-java-conventions` §6b) — Minor (Major if the wire shape diverges)
No bespoke `{"error": …}` body, no per-controller `@ExceptionHandler`. `detail` states the
**condition**, never a remedy, consequence or UI navigation; no call site is exempt. A code
emitted from several call sites carries one string (`MISSING_CURRENT_PASSWORD`,
`REQUEST_NOT_PENDING`, `STALE_WRITE`; `CurrentPasswordDetailTwinTest` pins one pair) that
stays true of the broadest arm. Authority: `riviera-java-conventions/references/error-contract.md`.

### RV-BE-11. Responsibility placement (`RESPONSIBILITIES.md`) — Major
Whenever behaviour is added or moved: each file's logic serves its module's **Job** and is not on
its **Not My Job** list; diff the plan's Module-ownership table against the code. The tells no rule
catches: refund/cancellation policy in `payment` (executor; `booking` decides); commission/payout
arithmetic in `venue` or `booking` (`payout` computes); `customer` growing login machinery beyond
the Spring Security imports `CustomerAuthPlacementTests` bans (edge concern); `operator` sitting in
every request path. Blocker when the misplacement also breaks a Blocker invariant.

### RV-BE-12. Package shape (ADR-0007) — Major
On any package add/move, `PackageShapeArchitectureTests` must be green (it rejects an
`application/in|out` split); eyes go to a serviceless module with an empty `application/` or
`domain/` (or a module with a service still in the thin shape), and use-case slicing outside
`booking`. `vocabulary` and `events` are allowed — flagging them is a false finding.

### RV-BE-19. Rule-layer placement (ADR-0018) — Major
On any new/changed choice, calculation or lifecycle statement. `DomainPurityArchitectureTests`
enforces the structural half but passes a `Clock`-backed statement in `domain/` — that is this
item's catch (fix: `application/`, not threading the instant through). A choice or calculation
inlined in a service with **two or more callers** needs a named holder; **one caller does
not** (flagging it is a false finding). A Java statement of a set invariant (counting rows to
decide a write) where a unique/exclusion constraint is the enforcement is a finding; a Java
mirror of a DB bound or vocabulary (`Stars` ↔ `review_stars_check`) is not. Blocker when the
Java invariant stands in for a constraint enforcing #2, #7 or #9.

### RV-BE-14. Booking codes (#7) — Major
≥ 8-char CSPRNG base32 code; never a sequential id; not logged in clear (Minor).

### RV-BE-15. Pool and cutoff server-side (#3, #4) — Major
Online-pool restriction and the sales-close cutoff rejected on the server, not only in the UI;
the cutoff from the venue's `sales_close` through `BookingCutoff`, the zone the named
`Europe/Tirane` constant — never a literal time or the JVM default.

### RV-BE-16. Refund policy server-side (#10) — Major
Refund eligibility/amount from booking state + policy; client never supplies the amount; weather
refund is an explicit action by the venue's operator (owner-asserted, RV-BE-9); thresholds not
duplicated (Minor).

### RV-BE-13. No injection — **Blocker**
SQL via bound params only; user-controlled text logged only with `\r\n` neutralized (Major);
no booking code / secret / PII in logs; no untrusted deserialization without an allowlist.

### RV-BE-18. Session lifecycle bracketing — **Blocker**
On any credential change, account-lifecycle transition or session machinery: sessions are
revoked at the edge, synchronously (`PrincipalSessionRevoker`), not via an event; the revoke
**brackets** the state change (before, keyed by a status-guarded pre-read such as
`OperatorLifecycle#usernameInStatus` / `CustomerAccountRecovery#emailForResetToken`, AND after);
a self-service password change revokes the *other* sessions before the hash write and rotates
the surviving session id via `SessionIdentity#rotate` (`SessionIdentityTest`); a rate-limit
budget on authenticated work refunds a 401/403-denied request, login budgets still charge.

### RV-BE-17. Flyway enforces the invariants (#12) — Blocker for availability uniqueness missing in SQL, Major otherwise
Versioned forward migration under `db/migration`; invariant-enforcing constraints exist in SQL,
not only in app code; migration tested.
