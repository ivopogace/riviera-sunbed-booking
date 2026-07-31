# Riviera backend overlay items

Repo-specific backend bank items. Loaded by `riviera-review-overlay` and layered
onto whatever generic backend bank the active review engine runs (today: the
`code-review` plugin) — walked after it.

Item format mirrors the generic banks: gate → follow-up → default severity → skill
framing; items moved in from the overlay SKILL.md body (RV-BE-3c, RV-BE-9..12) and
RV-BE-18 keep the compact prose form (statement → default severity → authority). Item IDs are
historical, not sequential — see the note at RV-BE-9. Invariant numbers reference
`CLAUDE.md`.

## Always-run (when scope is BE or Full-stack)

### RV-BE-1. Availability single-source-of-truth & concurrency (invariant #2)
**Gate:** For any write to `availability(set_id, booking_date)`, is a set provably
holdable by at most one party per date, even under concurrent requests?
- [ ] no availability write  [ ] DB unique constraint on `(set_id, booking_date)` present  [ ] reservation uses `SELECT … FOR UPDATE` or atomic `INSERT … ON CONFLICT DO NOTHING`  [ ] check-then-insert with no lock (race — violation)  [ ] concurrent-reservation test present

**Follow-up:**
- The online-booking path and the staff tap-to-mark path write the **same** row.
  Both must go through the same guarded write.
- A read-modify-write without a row lock or an atomic claim races: two requests
  both read "free," both insert. Require `FOR UPDATE` on the set/availability row,
  or an `INSERT … ON CONFLICT DO NOTHING` whose 0-row result means "already taken."
- The losing request returns a clean conflict (`409 SET_TAKEN`), not a 500.
- There must be a test that fires two reservations of the same `(set, date)`
  concurrently and asserts exactly one wins.
- **Request-to-Book** adds two more guarded write paths on the same row: a
  **pending hold** when the request is placed, and a **release** on any of its three
  terminal legs — venue decline, expiry sweep, or the guest's own withdraw (#123). A
  pending hold blocks other reservations of that `(set, date)` exactly like a confirmed
  booking; each terminal leg frees it. Treat both as first-class write paths subject to
  the same single-winner guarantee.
  **Note the legs are separated by the row lock, not by predicate:** only *accept* is
  deadline-disjoint from expire — decline and withdraw guard on `status` alone, so on an
  overdue row their `WHERE` clauses and expire's all match.

**Default severity:** **Blocker** for any unguarded availability write; Major for a
missing concurrency test on a guarded path.
**Skill framing:**
- Pre-impl: "List every write path to the availability row. For each: which lock /
  atomic claim guarantees single-winner? Which test proves it?"
- Peer-review: "Trace the reservation SQL. Is there a unique constraint AND a lock
  or `ON CONFLICT`? Is there a concurrent test? If not, this is the double-booking
  bug."

---

### RV-BE-2. JDBC only — no JPA (invariant #1)
**Gate:** Does the change stay on Spring Data JDBC / `JdbcTemplate` with zero JPA?
- [ ] JDBC only  [ ] `spring-boot-starter-data-jpa` added to the build (violation)  [ ] `@Entity`/`@OneToMany`/`@ManyToOne`/`mappedBy`/`EntityManager` used (violation)  [ ] `JpaRepository` extended (violation)

**Split by what's checkable.** The structural half is machine-enforced —
`JdbcOnlyArchitectureTests` probes the classpath for JPA/Hibernate types; verify it
is green rather than hand-grepping the diff. Spend eyes on what it can't see: a JPA
dependency in the **build-file diff** (a finding even if unused — it invites the
next person to reach for it) and mapping staying explicit (`RowMapper` / aggregate
mapping), not ORM-managed.

**Default severity:** **Blocker** for a JPA starter on the classpath or any
`@Entity`; Major for `JpaRepository`.
**Skill framing:**
- Pre-impl: "Confirm the persistence approach is JDBC. No JPA starter, no entities."
- Peer-review: "Is `JdbcOnlyArchitectureTests` green? Then read the build-file diff —
  any `data-jpa`/Hibernate dependency is a finding on its own."

---

### RV-BE-3. Spring Modulith boundaries (invariant #11)
**Gate:** Does any file import another module's `application.*`, `adapter.*`,
or `domain.*` instead of going through its published surfaces or an event?
- [ ] no cross-module import outside the published surfaces (`api`/`spi`/`vocabulary`/`events`)  [ ] cross-module import of `application.*` (violation)  [ ] cross-module import of `adapter.*` (violation)  [ ] cross-module import of another module's `domain.*` (violation)  [ ] new module without `package-info.java` `@ApplicationModule`

**Split by what's checkable.** Illegal cross-module imports and the
`allowedDependencies` grants are machine-enforced by `ModularityTests`
(`ApplicationModules.verify()`) — verify it is green rather than hand-grepping
imports. Spend eyes on the semantic calls it can't make: query vs event (sync
answer → `api/` port; state-change reaction → domain event) and the api-vs-spi
direction judgment, which is RV-BE-3b. Layout mechanics: invariant #11 +
`riviera-modulith`.

**Default severity:** **Blocker** for a cross-module non-`api/` import; Major for a
missing `@ApplicationModule`.
**Skill framing:**
- Pre-impl: "Map cross-module dependencies — each is which `api/` port or which
  event?"
- Peer-review: "Is `ModularityTests` green? Then judge the seams it can't: right
  collaboration kind (port vs event), right surface (RV-BE-3b)."

---

### RV-BE-3b. API vs SPI for cross-module ports (invariant #11)
**Gate:** Is each cross-module port in the correct named interface — inbound ports
others *call* in `api/`, and a *driven* port another module *implements* in `spi/`?
- [ ] no new cross-module port  [ ] inbound port (others call) in `api/`  [ ] driven port implemented by ANOTHER module in `spi/` (`@NamedInterface("spi")`), not `api/`  [ ] an `api/` interface that another module *implements* rather than calls (misfiled — belongs in `spi/`)  [ ] `<provider>::spi` granted only to the implementor; call-only modules granted `<provider>::api` only  [ ] a driven port implemented by the module's OWN adapters wrongly published instead of staying internal in `application/`

**Follow-up:**
- Default is `api/` (inbound). Promote a driven port to a named interface **only** when
  its adapter lives in a *different* module (cross-module dependency inversion done to
  avoid a cycle); then it goes in `spi/`, never `api/`.
- Tell them apart by direction: `api` = "call me"; `spi` = "implement me." A
  `@NamedInterface("api")` type that a sibling module `implements` (not calls) is
  misfiled — move it to `spi`.
- Least privilege: grant `<provider>::spi` only to the implementing module; caller-only
  modules get `<provider>::api`. Example: `venue.spi.SetAvailabilityLookup` is
  implemented by `availability` (granted `venue::api` + `venue::spi`); `booking`, which
  only calls venue, is granted `venue::api` only.

**Default severity:** Major for a driven cross-module port sitting in `api/` (or
`::spi` granted too broadly); Minor for a publishable-but-internal driven port that
leaked out of `application/`. This is `verify()`-legal either way, so the review gate
is the only thing that catches it — api-vs-spi is semantic, not mechanically detectable.
**Skill framing:**
- Pre-impl: "For each new cross-module interface: does the other module CALL it (→ `api`)
  or IMPLEMENT it (→ `spi`)? Who needs which named interface granted?"
- Peer-review: "Find new `@NamedInterface` types and cross-module `implements`. Is any
  `api/` interface implemented by another module? Move it to `spi/`. Are `spi` grants
  limited to the implementor?"
- Deeper mechanics: `riviera-modulith` (the *`api` vs `spi`* section).

---

### RV-BE-3c. Published-surface placement — ports vs vocabulary vs events (#95)

*Check when the published surface or domain tagging changes.* Complements RV-BE-3b
(api/spi). A typed id / value record or a published event must not be added to a
ports `api/` surface; events belong in the events named interface, vocabulary in
the vocabulary surface. A new method piled onto the `VenueCatalog` god-port
(instead of the role-named `SetBookingFacts`/`VenueRates` split) is a finding.
Default **Major**. This is enforced by `PublishedSurfacePlacementArchitectureTests`
(landed with issue #95: api/spi = non-sealed interfaces only, events = records
only, vocabulary = no plain interfaces, cross-module listener params in the owner's
events surface) — verify that rule passes and judge the cases it can't (is a new
type genuinely vocabulary?). An event class move must ship an `event_type` Flyway
rewrite (Event Publication Registry) — see V18.

---

### RV-BE-4. Domain events carry ids, not aggregates (invariant #11)
**Gate:** Do domain-event payloads carry technical ids only?
- [ ] no events  [ ] payload is ids (`BookingId`, `SetId`, `VenueId`, `bookingDate`)  [ ] payload embeds a full aggregate / foreign module type (violation)  [ ] payload carries mutable business fields (email, name) as identity (smell)

**Follow-up:**
- `@TransactionalEventListener(phase = AFTER_COMMIT)` for async side effects so a
  rolled-back transaction publishes nothing. (Payload rules: invariant #11.)

**Default severity:** Major for a non-id payload; Minor for an over-broad payload.
**Skill framing:**
- Peer-review: "For each new event: payload fields — all ids? Any aggregate or
  mutable business field embedded?"

---

### RV-BE-5. Money is integer minor units (invariant #5)
**Gate:** Are all monetary amounts integer minor units with an explicit currency?
- [ ] money as `long`/`int` minor units + currency  [ ] `double`/`float` amount (violation)  [ ] `BigDecimal` of euros flowing through domain (smell — convert at the edge)  [ ] commission/payout division without a written rounding rule

**Follow-up:**
- Where commission introduces a division, the rounding rule is explicit and tested
  (who absorbs the half-cent). (Mechanics: invariant #5.)

**Default severity:** Major for floating-point money; Minor for unstated rounding.
**Skill framing:**
- Peer-review: "Grep for `double`/`float`/`BigDecimal` near price/amount/commission.
  Each one: minor-units integer instead? Rounding rule defined?"

---

### RV-BE-6. Timezone: store UTC, reason in Europe/Tirane (invariant #6)
**Gate:** Is date/cutoff logic computed in `Europe/Tirane` with UTC storage, never
the JVM default zone?
- [ ] no time logic  [ ] booking date is `LocalDate` in `Europe/Tirane`  [ ] cutoff computed in `Europe/Tirane`  [ ] `LocalDateTime.now()` / `new Date()` / JVM-default-zone arithmetic (violation)  [ ] timestamp persisted as local time instead of UTC `Instant` (violation)

**Follow-up:**
- Mechanics of the cutoff computation and UTC persistence: invariants #4 and #6.

**Default severity:** Major for JVM-default-zone logic on cutoff/booking-date; Minor
for cosmetic local-time persistence.
**Skill framing:**
- Peer-review: "Find date/cutoff math. Is the zone explicit (`Europe/Tirane`)? Is
  storage UTC? Any `LocalDateTime.now()` without a zone?"

---

### RV-BE-7. Stripe webhook is the source of truth + idempotent (invariant #8)
**Gate:** Is payment state driven by signature-verified webhooks, idempotently?
- [ ] no payment change  [ ] booking confirmed on verified webhook  [ ] booking confirmed from client redirect / client-reported success (violation)  [ ] webhook signature not verified (violation)  [ ] handler not idempotent on duplicate event delivery (violation)  [ ] missing idempotency key on charge/refund creation

**Follow-up:**
- Verify the Stripe signature on every webhook before acting.
- Dedupe on the Stripe event id; the state transition is a no-op if already applied
  (Stripe re-delivers).
- Idempotency key on charge/refund derived from `BookingId` + operation.

**Default severity:** **Blocker** for confirming off the client or an unverified
webhook; Major for a non-idempotent handler.
**Skill framing:**
- Peer-review: "Where does a booking become CONFIRMED? Webhook or redirect? Is the
  signature verified? Replay the same event twice in a test — does state stay
  correct?"

---

### RV-BE-8. Payout ledger is exactly-once and reversible (invariant #9)
**Gate:** Does each booking accrue to a venue's payout exactly once, with refunds
reversing it?
- [ ] no payout change  [ ] accrual on confirm, keyed so it can't double  [ ] accrual not idempotent (double-pay risk — violation)  [ ] refund does not reverse the accrual (over-pay — violation)  [ ] commission rate read from a hardcoded constant instead of the venue setting

**Follow-up:**
- Accrual is keyed by `BookingId` so a re-delivered confirmation event can't accrue
  twice. (Ledger arithmetic and reversal rules: invariant #9.)

**Default severity:** **Blocker** for double-accrual or missing reversal; Major for
hardcoded commission.
**Skill framing:**
- Peer-review: "Confirm the accrual is idempotent per booking and that a refund
  reverses it. Trace where commission rate comes from."

---

> **Item IDs are historical, not sequential** — an item keeps the ID it entered the
> bank with. RV-BE-9..12 below moved here from the overlay SKILL.md body with their
> IDs intact; the file's earlier, unrelated 9..12 were renumbered to RV-BE-14..17.
> Do not renumber.

### RV-BE-9. Per-venue authorization / BOLA (invariant #13)

Any diff that touches a **venue-scoped** endpoint or service
(`/api/venues/{venueId}/**`, the payout ledger, staff bookings, beach-map edit,
staff availability, weather refund) must verify the **authenticated operator owns
the path `venueId`** — and that the check sits in the **application service**, not
the controller alone. The check is the `operator` module's `assertOwns` consulted
from the application service (shipped #73/#74, pinned by `CrossVenueDenialIT`) —
verify any **new** venue-scoped surface calls it too, and that no driving adapter
bypasses it. A shared role is necessary but not sufficient (OWASP API #1, BOLA) —
default **Blocker** whenever a venue-scoped surface is touched. Platform-wide
`/api/admin/**` is role-gated and exempt. (Authority: invariant #13.) Since #115 the
denial is uniform: `403 NOT_VENUE_OWNER` **before any existence check**, even for a
nonexistent venue — a 404 that leaks the existence of an unowned venue is a finding.

---

### RV-BE-10. Error contract (`riviera-java-conventions` §6b)

A controller introducing a bespoke `{"error": …}` body or a per-controller
`@ExceptionHandler` instead of the centralized `@RestControllerAdvice` /
`ProblemDetail` contract is a finding once the contract is in place. Default
**Minor** (Major if it diverges the wire shape clients depend on). (Authority:
`riviera-java-conventions` §6b.)

---

### RV-BE-11. Module responsibility placement (`RESPONSIBILITIES.md`)

*Check whenever the diff adds or moves behavior.* The backstop for a boundary that
slipped past the plan gate — including a plan that *said* one owner and code that
landed in another. Check that each changed file's logic belongs to **that** module
per `RESPONSIBILITIES.md`: it serves the module's **Job** and is **not** on the
module's **Not My Job** list. If the plan doc carries a Module-ownership table
(plan-doc §4a), diff the code against it: *the plan claimed `booking` owns this
refund math — did it land in `booking`, or in `payment`?*

**This item is split by what's checkable.** The **structural** half is enforced by
the always-on ArchUnit/`ModularityTests` fitness functions (below) — if those are
green, don't re-verify by eye. The **semantic** half — a *policy*, *decision*, or
*calculation* reimplemented in the wrong module with no illegal import — is
**not** machine-catchable and is the reason this item needs human judgment.

**Observable tells of a slip (the symptoms to scan the diff for):**
- **A calculation or policy in an "executor" module.** Refund-amount or
  cancellation-policy logic appearing inside `payment` (it *executes*; `booking`
  *decides*). Commission/payout arithmetic inside `venue` or `booking` (`payout`
  computes; `venue` only stores the *rate*). This is the highest-value tell and the
  one no rule catches.
- **A new writer to another module's table.** Any code outside `availability`
  writing the `(set, date)` state (invariant #2 / `availability` is the sole
  writer). *(ArchUnit-catchable.)*
- **A forbidden cross-module reach.** `booking` importing the Stripe SDK or
  `payment.adapter`; any module reaching into another's `domain`/`internal`
  instead of its `api/`. *(ArchUnit-catchable.)*
- **An event payload carrying a foreign aggregate or business field** instead of ids
  — the Need-To-Know boundary (a `payout`/`availability` listener receiving tourist
  identity, a `Customer`, or a full `Booking`). *(Partly ArchUnit-catchable.)*
- **A capability that RESPONSIBILITIES.md assigns elsewhere** showing up in this
  module at all — e.g. `customer` growing a login/MFA subsystem (auth is a
  platform/edge concern, not tourist-identity domain), or `operator` sitting in every
  request path instead of owning the mapping and answering the ownership question.

**Default severity:** **Major** (Blocker when the misplacement also breaks a Blocker
invariant — a non-`availability` writer to the set table is RV-BE-1; a missing
ownership check is RV-BE-9). Authority: `RESPONSIBILITIES.md` (Job / Not-My-Job per
module).

---

### RV-BE-12. Package-shape conformance (ADR-0007)

Check any diff that adds or moves packages against the two-template layout.
**Findings:**
- **a `.in`/`.out` split at the *application* layer** (`application/in`, `application/out`)
  — that split was removed; internal ports live in `application/` next to their service,
  and direction lives at the adapter layer.
- **`api`/`spi` nested under `application`** (or anywhere non-top-level) — the published
  surface must stay top-level and exposed, or Modulith hides it.
- **the adapter layer spelled by technology instead of direction** — `adapter/rest`,
  `adapter/jdbc`, `adapter/event` at the top level instead of `adapter/in` + `adapter/out`
  (technology, if needed, is a *sub*-package: `adapter/in/rest`).
- **a package outside the allowed top-level set** `{api, spi, application, domain, adapter}`
  (thin module: `{api, adapter}` only) — e.g. a lingering `infrastructure/`.
- **an adapter dependency pointing inward's opposite** — `application`/`domain` importing
  `adapter.*` (the hexagon runs adapter → application/domain, never back).
- **a thin (serviceless) module grown an empty `application/` or `domain/`** — ghost
  packages; a thin module is `api/` + `adapter/out/`. Conversely, a module that *gained*
  a service but kept the thin shape should **graduate** to full.

Structural half → `PackageShapeArchitectureTests` (always-on); the **thin-vs-full
judgment** and the "is this the right use-case slice" call → review. Default **Major**
(Minor for a cosmetic mis-slice inside a module). Authority: `ADR-0007` +
`riviera-modulith`.

---

### RV-BE-14. Booking codes are unguessable (invariant #7)
**Gate:** Are booking codes high-entropy and treated as bearer credentials?
- [ ] random ≥8-char (e.g. base32) code  [ ] sequential / predictable id used as the code (violation)  [ ] code logged in plaintext at info level (smell)

**Follow-up:**
- Generate from a CSPRNG; avoid ambiguous chars if staff read it aloud. (Why it
  matters: invariant #7.)

**Default severity:** Major for a predictable code; Minor for logging it.
**Skill framing:**
- Peer-review: "How is the booking code generated? Random or derived from an id?"

---

### RV-BE-15. Pool and cutoff enforced server-side (invariants #3, #4)
**Gate:** Are the online-pool restriction and the no-same-day cutoff enforced on the
server, not just hidden in the UI?
- [ ] online booking restricted to online-pool sets server-side  [ ] pool only enforced in the frontend (violation)  [ ] same-day booking rejected server-side at the cutoff  [ ] cutoff only enforced in the UI (violation)

**Follow-up:**
- A crafted request must not be able to book a walk-in-pool set or a same-day slot.
- Cutoff time + zone come from config (default 18:00 `Europe/Tirane`).

**Default severity:** Major for UI-only enforcement of either rule.
**Skill framing:**
- Peer-review: "Can a direct API call book a walk-in-pool set or a same-day date?
  Where is the server-side guard?"

---

### RV-BE-16. Refund policy computed server-side (invariant #10)
**Gate:** Is refund eligibility/amount decided on the server from the policy?
- [ ] refund decision server-side from booking state + policy  [ ] client supplies the refund amount (violation)  [ ] weather refund modeled as an explicit admin action  [ ] policy thresholds hardcoded in two places (drift risk)

**Follow-up:**
- One source for the cutoff/threshold values; reuse it for both the booking-close
  and the refund decision. (The policy itself: invariant #10.)

**Default severity:** Major for client-supplied refund amounts; Minor for duplicated
thresholds.
**Skill framing:**
- Pre-impl: "List the refund triggers (cutoff, post-cutoff, weather). For each:
  where is eligibility + amount computed, and from which single source of the
  threshold values?"
- Peer-review: "Trace the refund path. Does the server compute eligibility and
  amount from booking state + policy, or does the client supply the amount? Is the
  weather refund an explicit admin action?"

---

### RV-BE-13. No injection: SQL, log, deserialization
**Gate:** Is untrusted input kept out of SQL string-building, log lines, and
unsafe deserialization?
- [ ] SQL uses bound params (`:name`), never string concatenation of input  [ ] user-controlled text logged without neutralizing `\r\n` (log forging — violation)  [ ] booking code / secret / PII logged in clear (violation — invariant #7)  [ ] untrusted bytes deserialized without an allowlist (violation)

**Default severity:** **Blocker** for SQL injection or a secret in logs; Major for
unsanitized untrusted text in logs or unguarded deserialization.
**Skill framing:**
- Peer-review: "Trace any user-controlled string into SQL, into a log line, and into
  any deserializer. Bound param? Newlines neutralized? Type allowlist?"
- Mechanics (canonical, not restated here): `riviera-java-conventions` (rule 10
  logging) and the `postgres` skill (parameterized SQL). Sonar rules flag all three.

---

### RV-BE-18. Session lifecycle bracketing

*Check when the diff touches a credential change, an account-lifecycle transition,
or session machinery.* The shipped ordering guarantees must hold: (a) the
principal's sessions are revoked **at the edge, synchronously**
(`PrincipalSessionRevoker`) — deliberately not an event (#128); (b) the revoke
**brackets** the state change — before it (keyed by a pre-read:
`OperatorLifecycle#activeUsername`, `CustomerAccountRecovery#emailForResetToken`)
AND after — so a transient revoke failure is retry-recoverable (#357); (c) a
self-service password change revokes the *other* sessions before the hash write and
re-issues the surviving session under a new id via `SessionIdentity#rotate` (#344;
post-#359 rotate carries the attributes over, hard-DELETEs the old row, and creates
a fresh one — pinned by `SessionIdentityTest`); (d) a rate-limit budget guarding
**authenticated** work refunds a request denied 401/403 before the work, while
login budgets still charge (#343). Default **Blocker**. (Authority: the CLAUDE.md
`operator` module note; plan docs `session-revocation.md`,
`session-revoke-ordering-remaining-surfaces.md`,
`password-change-atomicity-session-rotation.md`, `session-rotation-lost-update.md`,
`credential-change-rate-limit-keying.md`.)

---

## Deep (opt-in)

### RV-BE-17. Flyway migrations enforce the invariants (invariant #12)
**Gate:** Do schema changes go through versioned Flyway migrations, and do the
constraints that enforce invariants exist in SQL (not just app code)?
- [ ] no schema change  [ ] versioned forward migration under `db/migration`  [ ] schema changed via app code / hand-run DDL (violation)  [ ] availability uniqueness exists only in app logic, not as a DB constraint (violation)  [ ] migration not tested

**Follow-up:**
- Forward-only versioned scripts; naming follows existing migrations. (Why the
  constraint must be in SQL: invariants #2 and #12.)

**Default severity:** Blocker for the availability uniqueness missing at the DB
level; Major for unversioned schema change.
**Skill framing:**
- Peer-review: "Is there a migration? Does the DB enforce the availability
  uniqueness, or only the service layer?"
