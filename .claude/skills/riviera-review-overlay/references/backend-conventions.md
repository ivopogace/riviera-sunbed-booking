# Riviera backend overlay items

Repo-specific backend bank items, layered onto the active review engine's generic backend
bank and walked after it. Item format: gate → follow-up → default severity. **Item IDs are
historical, not sequential — never renumber.** Invariant numbers reference `CLAUDE.md`.

## Always-run (when scope is BE or Full-stack)

### RV-BE-1. Availability single-source-of-truth & concurrency (invariant #2)
**Gate:** For any write to `availability(set_id, booking_date)`, is a set provably
holdable by at most one party per date, even under concurrent requests?
- [ ] no availability write
- [ ] DB unique constraint on `(set_id, booking_date)` present
- [ ] reservation uses `SELECT … FOR UPDATE` or atomic `INSERT … ON CONFLICT DO NOTHING`
- [ ] check-then-insert with no lock (race — violation)
- [ ] concurrent-reservation test present

**Follow-up:**
- The online-booking path and the staff tap-to-mark path write the same row through the
  same guarded write.
- A read-modify-write without a row lock or an atomic claim races. Require `FOR UPDATE` on
  the row, or an `INSERT … ON CONFLICT DO NOTHING` whose 0-row result means "already taken."
- The losing request returns a clean conflict (`409 SET_TAKEN`), not a 500.
- A test fires two reservations of the same `(set, date)` concurrently and asserts exactly one wins.
- Request-to-Book adds guarded write paths on the same row: a **pending hold** when the
  request is placed (blocks like a confirmed booking) and a **release** on each terminal leg
  — venue decline, expiry sweep, guest withdraw. The legs are separated by the row lock, not
  by predicate: only *accept* is deadline-disjoint from expire; decline and withdraw guard on
  `status` alone, so on an overdue row their `WHERE` clauses and expire's all match.

**Default severity:** **Blocker** for any unguarded availability write; Major for a
missing concurrency test on a guarded path.

---

### RV-BE-2. JDBC only — no JPA (invariant #1)
**Gate:** Does the change stay on Spring Data JDBC / `JdbcTemplate` with zero JPA?
- [ ] JDBC only
- [ ] `spring-boot-starter-data-jpa` added to the build (violation)
- [ ] `@Entity`/`@OneToMany`/`@ManyToOne`/`mappedBy`/`EntityManager` used (violation)
- [ ] `JpaRepository` extended (violation)

The structural half is machine-enforced — `JdbcOnlyArchitectureTests` probes the classpath
for JPA/Hibernate types; verify it is green. Spend eyes on a JPA dependency in the
build-file diff (a finding even if unused) and on mapping staying explicit (`RowMapper` /
aggregate mapping), not ORM-managed.

**Default severity:** **Blocker** for a JPA starter on the classpath or any `@Entity`;
Major for `JpaRepository`.

---

### RV-BE-3. Spring Modulith boundaries (invariant #11)
**Gate:** Does any file import another module's `application.*`, `adapter.*`, or
`domain.*` instead of going through its published surfaces or an event?
- [ ] no cross-module import outside the published surfaces (`api`/`spi`/`vocabulary`/`events`)
- [ ] cross-module import of `application.*` / `adapter.*` / `domain.*` (violation)
- [ ] new module without `package-info.java` `@ApplicationModule`

Illegal cross-module imports and the `allowedDependencies` grants are machine-enforced by
`ModularityTests` (`ApplicationModules.verify()`); verify it is green. Spend eyes on the
semantic calls: query vs event (sync answer → `api/` port; state-change reaction → domain
event) and the api-vs-spi direction (RV-BE-3b). Layout mechanics: `riviera-modulith`.

**Default severity:** **Blocker** for a cross-module non-`api/` import; Major for a
missing `@ApplicationModule`.

---

### RV-BE-3b. API vs SPI for cross-module ports (invariant #11)
**Gate:** Is each cross-module port in the correct named interface — inbound ports others
*call* in `api/`, a *driven* port another module *implements* in `spi/`?
- [ ] no new cross-module port
- [ ] inbound port (others call) in `api/`
- [ ] driven port implemented by ANOTHER module in `spi/` (`@NamedInterface("spi")`), not `api/`
- [ ] an `api/` interface that another module *implements* rather than calls (misfiled — belongs in `spi/`)
- [ ] `<provider>::spi` granted only to the implementor; call-only modules granted `<provider>::api` only
- [ ] a driven port implemented by the module's OWN adapters wrongly published instead of staying internal in `application/`

`api` = "call me"; `spi` = "implement me". Example: `venue.spi.SetAvailabilityLookup` is
implemented by `availability` (granted `venue::api` + `venue::spi`); `booking`, which only
calls venue, is granted `venue::api` only.

**Default severity:** Major for a driven cross-module port in `api/` (or `::spi` granted
too broadly); Minor for an internal driven port that leaked out of `application/`. Both are
`verify()`-legal, so the review is the only thing that catches them.

---

### RV-BE-3c. Published-surface placement — ports vs vocabulary vs events

*Check when the published surface or domain tagging changes.* A typed id / value record or
a published event must not be added to `api/`; events go in the events surface, vocabulary
in the vocabulary surface. A new **sibling-facing** method piled onto `VenueCatalog`
(instead of the role-named `SetBookingFacts`/`VenueRates` split) is a finding, default
**Major** — a further **tourist read** on `VenueCatalog` is not (the rule asserts
dependency direction, not a frozen method list; `VenueApiRoleSplitTests` states this).
`PublishedSurfacePlacementArchitectureTests` enforces api/spi = non-sealed interfaces only,
events = records only, vocabulary = no plain interfaces, cross-module listener params in
the owner's events surface — verify it passes and judge what it can't (is a new type
genuinely vocabulary?). An event class move must ship an `event_type` Flyway rewrite for
the Event Publication Registry (see V18).

---

### RV-BE-4. Domain events carry ids, not aggregates (invariant #11)
**Gate:** Do domain-event payloads carry technical ids only?
- [ ] no events
- [ ] payload is ids (`BookingId`, `SetId`, `VenueId`, `bookingDate`)
- [ ] payload embeds a full aggregate / foreign module type (violation)
- [ ] payload carries mutable business fields (email, name) as identity (smell)

**Follow-up:** `@TransactionalEventListener(phase = AFTER_COMMIT)` for async side effects
so a rolled-back transaction publishes nothing.

**Default severity:** Major for a non-id payload; Minor for an over-broad payload.

---

### RV-BE-5. Money is integer minor units (invariant #5)
**Gate:** Are all monetary amounts integer minor units with an explicit currency?
- [ ] money as `long`/`int` minor units + currency
- [ ] `double`/`float` amount (violation)
- [ ] `BigDecimal` of euros flowing through domain (smell — convert at the edge)
- [ ] commission/payout division without a written rounding rule

**Follow-up:** where commission introduces a division, the rounding rule is explicit and
tested (who absorbs the half-cent). Grep for `double`/`float`/`BigDecimal` near
price/amount/commission.

**Default severity:** Major for floating-point money; Minor for unstated rounding.

---

### RV-BE-6. Timezone: store UTC, reason in Europe/Tirane (invariant #6)
**Gate:** Is date/cutoff logic computed in `Europe/Tirane` with UTC storage, never the JVM
default zone?
- [ ] no time logic
- [ ] booking date is `LocalDate` in `Europe/Tirane`
- [ ] cutoff computed in `Europe/Tirane`
- [ ] `LocalDateTime.now()` / `new Date()` / JVM-default-zone arithmetic (violation)
- [ ] timestamp persisted as local time instead of UTC `Instant` (violation)

**Default severity:** Major for JVM-default-zone logic on cutoff/booking-date; Minor for
cosmetic local-time persistence.

---

### RV-BE-7. Stripe webhook is the source of truth + idempotent (invariant #8)
**Gate:** Is payment state driven by signature-verified webhooks, idempotently?
- [ ] no payment change
- [ ] booking confirmed on verified webhook
- [ ] booking confirmed from client redirect / client-reported success (violation)
- [ ] webhook signature not verified (violation)
- [ ] handler not idempotent on duplicate event delivery (violation)
- [ ] missing idempotency key on charge/refund creation

**Follow-up:** verify the signature on every webhook; dedupe on the Stripe event id (the
transition is a no-op if already applied — Stripe re-delivers); idempotency key on
charge/refund derived from `BookingId` + operation. Replay the same event twice in a test.

**Default severity:** **Blocker** for confirming off the client or an unverified webhook;
Major for a non-idempotent handler.

---

### RV-BE-8. Payout ledger is exactly-once and reversible (invariant #9)
**Gate:** Does each booking accrue to a venue's payout exactly once, with refunds reversing it?
- [ ] no payout change
- [ ] accrual on confirm, keyed so it can't double
- [ ] accrual not idempotent (double-pay risk — violation)
- [ ] refund does not reverse the accrual (over-pay — violation)
- [ ] commission rate read from a hardcoded constant instead of the venue setting

**Follow-up:** accrual is keyed by `BookingId` so a re-delivered confirmation can't accrue twice.

**Default severity:** **Blocker** for double-accrual or missing reversal; Major for
hardcoded commission.

---

### RV-BE-9. Per-venue authorization / BOLA (invariant #13)

Any diff touching a venue-scoped endpoint or service (`/api/venues/{venueId}/**`, the
payout ledger, staff bookings, beach-map edit, staff availability, weather refund) must
verify the authenticated operator owns the path `venueId` — in the **application service**,
via the `operator` module's `assertOwns` (pinned by `CrossVenueDenialIT`) — so no driving
adapter bypasses it. Verify any new venue-scoped surface calls it. Default **Blocker**
whenever a venue-scoped surface is touched. Platform-wide `/api/admin/**` is role-gated and
exempt; `AdminSurfaceRoleGateTest` discovers the mapped `/api/admin/**` endpoints and
fails unless each refuses both non-admin principal types, so a new admin endpoint needs its
`hasRole(ADMIN_ROLE)` matcher. The denial is uniform: `403 NOT_VENUE_OWNER` **before any
existence check**, even for a nonexistent venue — a 404 that leaks the existence of an
unowned venue is a finding.

---

### RV-BE-10. Error contract (`riviera-java-conventions` §6b)

A controller introducing a bespoke `{"error": …}` body or a per-controller
`@ExceptionHandler` instead of the centralized `@RestControllerAdvice` / `ProblemDetail`
contract is a finding. Default **Minor** (Major if it diverges the wire shape).

**Also check the `detail` string's voice**, which nothing machine-checks: it states the
**condition**, not the remedy. A `detail` written as user-facing copy — a remedy ("Reload
and try again"), a consequence ("…so it can't be removed"), UI navigation ("Switch to Edit
sets…") — duplicates wording the client owns and drifts. **No call site is exempt** — the
tree is already clean, so a `detail` in remedy voice is a fresh finding wherever it appears,
never inherited debt. Default **Minor**. Two traps when
a diff *fixes* one: shortening it into a restatement of the `code`, and shortening it into
something untrue of the broadest arm the code serves. Also:
- **A code emitted from more than one call site carries one string**, pinned on the pair
  (`CurrentPasswordDetailTwinTest` compares two live responses). A diff that changes one arm
  of `MISSING_CURRENT_PASSWORD`, `REQUEST_NOT_PENDING` or `STALE_WRITE` without the others
  is the finding.
- **A shortened string stays true of the broadest arm.** A withdrawn request reaches
  `REQUEST_NOT_PENDING`; the two `STALE_WRITE` set-writes share one `venue.set_version`
  token, so neither may name prices or layout. Check the guard, not the sentence.

Authority: `riviera-java-conventions` `references/error-contract.md`.

---

### RV-BE-11. Module responsibility placement (`RESPONSIBILITIES.md`)

*Check whenever the diff adds or moves behavior.* Each changed file's logic belongs to
**that** module per `RESPONSIBILITIES.md`: it serves the module's **Job** and is not on
its **Not My Job** list. If the plan doc carries a Module-ownership table (§4a), diff the
code against it.

The structural half is enforced by `ModularityTests` and the ArchUnit fitness functions —
if green, don't re-verify by eye. The semantic half — a *policy*, *decision*, or
*calculation* reimplemented in the wrong module with no illegal import — needs judgment.
Tells to scan for:
- **A calculation or policy in an "executor" module.** Refund-amount or
  cancellation-policy logic inside `payment` (it executes; `booking` decides).
  Commission/payout arithmetic inside `venue` or `booking` (`payout` computes; `venue`
  stores the rate). The highest-value tell; no rule catches it.
- **A new writer to another module's table** — code outside `availability` writing the
  `(set, date)` state. *(ArchUnit-catchable.)*
- **A forbidden cross-module reach** — `booking` importing the Stripe SDK or
  `payment.adapter`; any module reaching into another's `domain`/`internal`. *(ArchUnit-catchable.)*
- **An event payload carrying a foreign aggregate or business field** instead of ids (a
  `payout`/`availability` listener receiving tourist identity, a `Customer`, a full `Booking`).
- **A capability `RESPONSIBILITIES.md` assigns elsewhere** showing up in this module — e.g.
  `customer` growing a login/MFA subsystem (auth is an edge concern), or `operator` sitting
  in every request path instead of owning the mapping and answering the ownership question.

**Default severity:** **Major** (Blocker when the misplacement also breaks a Blocker
invariant — a non-`availability` writer to the set table is RV-BE-1; a missing ownership
check is RV-BE-9).

---

### RV-BE-12. Package-shape conformance (ADR-0007)

For any diff that adds or moves packages: verify `PackageShapeArchitectureTests` is green
(allowed top-level set, adapter split by direction not technology, named interfaces
top-level, no `application`/`domain` → `adapter.*` import) — don't hand-grep it. Spend eyes
on what it can't see:
- an `in`/`out` split *below* the application top level (internal ports live in
  `application/` next to their service);
- ghost packages / graduation — a thin (serviceless) module grown an empty `application/`
  or `domain/`; conversely a module that gained a service but kept the thin shape should
  graduate to full;
- the use-case-slicing call — only `booking` is sliced.

`vocabulary` and `events` are in the allowed set — flagging either is a false finding.
Default **Major** (Minor for a cosmetic mis-slice inside a module). Authority: ADR-0007 +
`riviera-modulith`.

---

### RV-BE-14. Booking codes are unguessable (invariant #7)
**Gate:** Are booking codes high-entropy and treated as bearer credentials?
- [ ] random ≥8-char (e.g. base32) code from a CSPRNG
- [ ] sequential / predictable id used as the code (violation)
- [ ] code logged in plaintext at info level (smell)

**Default severity:** Major for a predictable code; Minor for logging it.

---

### RV-BE-15. Pool and cutoff enforced server-side (invariants #3, #4)
**Gate:** Are the online-pool restriction and the sales-close cutoff enforced on the
server, not just hidden in the UI?
- [ ] online booking restricted to online-pool sets server-side
- [ ] pool only enforced in the frontend (violation)
- [ ] same-day booking rejected server-side at the cutoff
- [ ] cutoff only enforced in the UI (violation)

**Follow-up:** a crafted request must not be able to book a walk-in-pool set or a slot past
the cutoff. Cutoff time + zone come from config, never a literal.

**Default severity:** Major for UI-only enforcement of either rule.

---

### RV-BE-16. Refund policy computed server-side (invariant #10)
**Gate:** Is refund eligibility/amount decided on the server from the policy?
- [ ] refund decision server-side from booking state + policy
- [ ] client supplies the refund amount (violation)
- [ ] weather refund modeled as an explicit admin action
- [ ] policy thresholds hardcoded in two places (drift risk)

**Default severity:** Major for client-supplied refund amounts; Minor for duplicated thresholds.

---

### RV-BE-13. No injection: SQL, log, deserialization
**Gate:** Is untrusted input kept out of SQL string-building, log lines, and unsafe
deserialization?
- [ ] SQL uses bound params (`:name`), never string concatenation of input
- [ ] user-controlled text logged without neutralizing `\r\n` (log forging — violation)
- [ ] booking code / secret / PII logged in clear (violation — invariant #7)
- [ ] untrusted bytes deserialized without an allowlist (violation)

Trace any user-controlled string into SQL, into a log line, and into any deserializer.
Mechanics: `riviera-java-conventions` (rule 10) and `postgres`. Sonar flags all three.

**Default severity:** **Blocker** for SQL injection or a secret in logs; Major for
unsanitized untrusted text in logs or unguarded deserialization.

---

### RV-BE-18. Session lifecycle bracketing

*Check when the diff touches a credential change, an account-lifecycle transition, or
session machinery.* The ordering guarantees: (a) the principal's sessions are revoked at
the edge, synchronously (`PrincipalSessionRevoker`) — not via an event; (b) the revoke
**brackets** the state change — before it (keyed by a status-guarded pre-read:
`OperatorLifecycle#usernameInStatus`, `CustomerAccountRecovery#emailForResetToken`) AND
after — so a transient revoke failure is retry-recoverable; (c) a self-service password
change revokes the *other* sessions before the hash write and re-issues the surviving
session under a new id via `SessionIdentity#rotate` (carries attributes over, hard-DELETEs
the old row, creates a fresh one — pinned by `SessionIdentityTest`); (d) a rate-limit
budget guarding **authenticated** work refunds a request denied 401/403 before the work,
while login budgets still charge. Default **Blocker**. (Slices: the session-revocation slice,
#344, #359, PR #361, PR #363.)

---

## Deep (opt-in)

### RV-BE-17. Flyway migrations enforce the invariants (invariant #12)
**Gate:** Do schema changes go through versioned Flyway migrations, and do the constraints
that enforce invariants exist in SQL (not just app code)?
- [ ] no schema change
- [ ] versioned forward migration under `db/migration`
- [ ] schema changed via app code / hand-run DDL (violation)
- [ ] availability uniqueness exists only in app logic, not as a DB constraint (violation)
- [ ] migration not tested

**Default severity:** Blocker for the availability uniqueness missing at the DB level;
Major for unversioned schema change.
