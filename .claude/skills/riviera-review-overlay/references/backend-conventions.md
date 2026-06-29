# Riviera backend overlay items

Repo-specific backend bank items. Loaded by `riviera-review-overlay` and walked
**after** the generic backend bank in `~/.claude/skills/review-question-banks/backend.md`.

Item format mirrors the generic banks: gate → follow-up → default severity → skill
framing. Invariant numbers reference `CLAUDE.md`.

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
  **pending hold** when the request is placed, and a **release** on venue
  decline/timeout. A pending hold blocks other reservations of that `(set, date)`
  exactly like a confirmed booking; decline/expiry frees it. Treat both as
  first-class write paths subject to the same single-winner guarantee.

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

**Follow-up:**
- Persistence is `JdbcTemplate` and/or Spring Data JDBC aggregates only.
- A JPA dependency entering the build is itself a finding even if unused — it
  invites the next person to reach for it.
- Mapping is explicit (`RowMapper` / aggregate mapping), not ORM-managed.

**Default severity:** **Blocker** for a JPA starter on the classpath or any
`@Entity`; Major for `JpaRepository`.
**Skill framing:**
- Pre-impl: "Confirm the persistence approach is JDBC. No JPA starter, no entities."
- Peer-review: "Grep the build files for `data-jpa`; grep the diff for `@Entity`,
  `mappedBy`, `EntityManager`. Any hit is a finding."

---

### RV-BE-3. Spring Modulith boundaries (invariant #11)
**Gate:** Does any file import another module's `application.*`, `infrastructure.*`,
or `domain.*` instead of going through its `api/` port or an event?
- [ ] no cross-module non-`api/` import  [ ] cross-module import of `application.*` (violation)  [ ] cross-module import of `infrastructure.*` (violation)  [ ] cross-module import of another module's `domain.*` (violation)  [ ] new module without `package-info.java` `@ApplicationModule`

**Follow-up:**
- Need a synchronous answer from another module → call its `api/` query port.
- Need to react to a state change in another module → subscribe to its domain event.
- Module layout: `ai.riviera.platform.<module>.{api, application.in, application.out,
  domain, infrastructure.in, infrastructure.out}`.
- New module → top-level `package-info.java` with `@ApplicationModule`; cross-module
  types live in `api/`.

**Default severity:** **Blocker** for a cross-module non-`api/` import; Major for a
missing `@ApplicationModule`.
**Skill framing:**
- Pre-impl: "Map cross-module dependencies — each is which `api/` port or which
  event?"
- Peer-review: "Grep the diff for `import ai.riviera.platform.<other>.application` /
  `.infrastructure` / `.domain`. Flag each."

---

### RV-BE-3b. API vs SPI for cross-module ports (invariant #11)
**Gate:** Is each cross-module port in the correct named interface — inbound ports
others *call* in `api/`, and a *driven* port another module *implements* in `spi/`?
- [ ] no new cross-module port  [ ] inbound port (others call) in `api/`  [ ] driven port implemented by ANOTHER module in `spi/` (`@NamedInterface("spi")`), not `api/`  [ ] an `api/` interface that another module *implements* rather than calls (misfiled — belongs in `spi/`)  [ ] `<provider>::spi` granted only to the implementor; call-only modules granted `<provider>::api` only  [ ] a driven port implemented by the module's OWN infra wrongly published instead of staying in `application.out`

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
leaked out of `application.out`. This is `verify()`-legal either way, so the review gate
is the only thing that catches it — api-vs-spi is semantic, not mechanically detectable.
**Skill framing:**
- Pre-impl: "For each new cross-module interface: does the other module CALL it (→ `api`)
  or IMPLEMENT it (→ `spi`)? Who needs which named interface granted?"
- Peer-review: "Find new `@NamedInterface` types and cross-module `implements`. Is any
  `api/` interface implemented by another module? Move it to `spi/`. Are `spi` grants
  limited to the implementor?"
- Deeper mechanics: `riviera-modulith` (the *`api` vs `spi`* section).

---

### RV-BE-4. Domain events carry ids, not aggregates (invariant #11)
**Gate:** Do domain-event payloads carry technical ids only?
- [ ] no events  [ ] payload is ids (`BookingId`, `SetId`, `VenueId`, `bookingDate`)  [ ] payload embeds a full aggregate / foreign module type (violation)  [ ] payload carries mutable business fields (email, name) as identity (smell)

**Follow-up:**
- State-changing collaboration → event; query → direct `api/` call.
- Subscribers re-load what they need via the publishing module's `api/` port using
  the id; they don't get a serialized aggregate.
- `@TransactionalEventListener(phase = AFTER_COMMIT)` for async side effects so a
  rolled-back transaction publishes nothing.

**Default severity:** Major for a non-id payload; Minor for an over-broad payload.
**Skill framing:**
- Peer-review: "For each new event: payload fields — all ids? Any aggregate or
  mutable business field embedded?"

---

### RV-BE-5. Money is integer minor units (invariant #5)
**Gate:** Are all monetary amounts integer minor units with an explicit currency?
- [ ] money as `long`/`int` minor units + currency  [ ] `double`/`float` amount (violation)  [ ] `BigDecimal` of euros flowing through domain (smell — convert at the edge)  [ ] commission/payout division without a written rounding rule

**Follow-up:**
- Store and compute in minor units (cents). Convert only at the Stripe boundary and
  the display boundary.
- Where commission introduces a division, the rounding rule is explicit and tested
  (who absorbs the half-cent).

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
- The evening-before cutoff (invariant #4) is a wall-clock time in `Europe/Tirane`;
  compute it there, then compare against `Instant.now()`.
- Persist instants as UTC; render in the user's zone at the edge.

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
  twice.
- Refund/cancellation posts a reversing entry.
- Net owed = Σ(amount − commission) over the period; commission rate is per-venue.

**Default severity:** **Blocker** for double-accrual or missing reversal; Major for
hardcoded commission.
**Skill framing:**
- Peer-review: "Confirm the accrual is idempotent per booking and that a refund
  reverses it. Trace where commission rate comes from."

---

### RV-BE-9. Booking codes are unguessable (invariant #7)
**Gate:** Are booking codes high-entropy and treated as bearer credentials?
- [ ] random ≥8-char (e.g. base32) code  [ ] sequential / predictable id used as the code (violation)  [ ] code logged in plaintext at info level (smell)

**Follow-up:**
- Generate from a CSPRNG; avoid ambiguous chars if staff read it aloud.
- Staff verify by code on arrival, so a guessable code = someone else's sunbed.

**Default severity:** Major for a predictable code; Minor for logging it.
**Skill framing:**
- Peer-review: "How is the booking code generated? Random or derived from an id?"

---

### RV-BE-10. Pool and cutoff enforced server-side (invariants #3, #4)
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

### RV-BE-11. Refund policy computed server-side (invariant #10)
**Gate:** Is refund eligibility/amount decided on the server from the policy?
- [ ] refund decision server-side from booking state + policy  [ ] client supplies the refund amount (violation)  [ ] weather refund modeled as an explicit admin action  [ ] policy thresholds hardcoded in two places (drift risk)

**Follow-up:**
- Free until cutoff → full; after → non-refundable/partial; weather → admin-triggered
  full refund (v1).
- One source for the cutoff/threshold values; reuse it for both the booking-close
  and the refund decision.

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

## Deep (opt-in)

### RV-BE-12. Flyway migrations enforce the invariants (invariant #12)
**Gate:** Do schema changes go through versioned Flyway migrations, and do the
constraints that enforce invariants exist in SQL (not just app code)?
- [ ] no schema change  [ ] versioned forward migration under `db/migration`  [ ] schema changed via app code / hand-run DDL (violation)  [ ] availability uniqueness exists only in app logic, not as a DB constraint (violation)  [ ] migration not tested

**Follow-up:**
- The `(set_id, booking_date)` uniqueness (invariant #2) is a real DB constraint
  created by a migration and covered by a test — app-level checks alone race.
- Forward-only versioned scripts; naming follows existing migrations.

**Default severity:** Blocker for the availability uniqueness missing at the DB
level; Major for unversioned schema change.
**Skill framing:**
- Peer-review: "Is there a migration? Does the DB enforce the availability
  uniqueness, or only the service layer?"

---

### RV-BE-13. No injection: SQL, log, deserialization
**Gate:** Is untrusted input kept out of SQL string-building, log lines, and
unsafe deserialization?
- [ ] SQL uses bound params (`:name`), never string concatenation of input  [ ] user-controlled text logged without neutralizing `\r\n` (log forging — violation)  [ ] booking code / secret / PII logged in clear (violation — invariant #7)  [ ] untrusted bytes deserialized without an allowlist (violation)

**Follow-up:**
- SQL: `JdbcClient`/`JdbcTemplate` named parameters only; a concatenated user value
  in SQL is a Blocker (invariant #1's explicit-SQL still binds params).
- Logs: parameterized logging does **not** sanitize the value — strip/escape `\r\n`
  in untrusted strings (email, free-text, headers) or use a structured (JSON)
  appender. Logging an id/enum is fine; raw free-text is the risk.
- Deserialization: don't deserialize untrusted input; if unavoidable, allowlist the
  permitted types. (Sonar rules flag all three.)

**Default severity:** **Blocker** for SQL injection or a secret in logs; Major for
unsanitized untrusted text in logs or unguarded deserialization.
**Skill framing:**
- Peer-review: "Trace any user-controlled string into SQL, into a log line, and into
  any deserializer. Bound param? Newlines neutralized? Type allowlist?"
- Deeper conventions: `riviera-java-conventions` (rule 10 logging) and the
  `postgres` skill (parameterized SQL).
