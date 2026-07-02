---
name: riviera-java-conventions
description: The Java language-level conventions for riviera-sunbed-booking backend code (Java 25, Spring Boot 4, Spring Modulith). Load BEFORE writing or refactoring any Java — a class, record, port, service, JDBC adapter, event, or test. It encodes the idioms that push Claude off its Spring-tutorial defaults - JDBC-only with NO JPA/Hibernate and NO Lombok, records for DTOs/value-objects/ids, constructor injection with package-private adapters, typed-outcome over exceptions, and Java 25 features (sealed types, pattern matching, text-block SQL, virtual-threads posture). Pairs with codebase-design (seam shape) and postgres (SQL); the numbered invariants live in CLAUDE.md and are checked by riviera-review-overlay.
---

# Riviera Java conventions

**Announce at start:** "Loaded riviera-java-conventions — applying the project's
JDBC-only / records-first / no-Lombok Java idioms."

## Why this skill exists

Spring Boot and Java tutorials overwhelmingly assume **JPA/Hibernate entities**,
**Lombok**, **field injection**, and mutable POJOs with getters/setters. This project is
deliberately the opposite — JDBC-only, records-first, hexagonal Spring Modulith on **Java
25**. Without this skill loaded, generated Java drifts toward `@Entity`, `@Data`,
`@Autowired` fields, and anaemic mutable classes — every one of which is wrong here and
gets caught at the review gate. This skill is **preventive**: it states the idioms up front
so the first draft is already in-house style.

It does **not** restate the numbered cross-cutting invariants (those live in `CLAUDE.md`
and are enforced by `riviera-review-overlay`). It covers the **language-level** "how we
write Java," referencing invariants by number where they bite.

## The rules

### 1. Persistence: JDBC only — no JPA, no Hibernate, no Lombok (invariant #1)

- **Never any JPA/Hibernate type:** `jakarta.persistence.*` — `@Entity`,
  `jakarta.persistence.@Table`, `jakarta.persistence.@Id`, `@OneToMany`/`@ManyToOne`,
  `EntityManager` — `org.hibernate.*`, `JpaRepository`, or `spring-boot-starter-data-jpa`.
  Persistence is `JdbcClient` / `JdbcTemplate` with **explicit SQL**.
- **`@Table`/`@Id` are package-sensitive — disambiguate, don't blanket-ban.** The
  `jakarta.persistence` ones are JPA → forbidden. But
  `org.springframework.data.relational.core.mapping.@Table` and
  `org.springframework.data.annotation.@Id` are **Spring Data JDBC** mapping annotations,
  which invariant #1 explicitly permits — use them **only** on a genuine Spring Data JDBC
  aggregate root that earns it (otherwise prefer `JdbcClient` + explicit SQL, the repo's
  default). `JdbcOnlyArchitectureTests` enforces this precisely: it probes
  `jakarta.persistence.*`/`org.hibernate.*`, not the annotation simple-name.
- **No Lombok.** No `@Data`/`@Getter`/`@Builder`/`@RequiredArgsConstructor`. Records give
  you immutability + accessors + equals/hashCode with zero magic; for the rare mutable
  holder, write the constructor by hand. Lombok is not a dependency and must not become one.
- SQL lives in **Java text blocks** (`"""…"""`) right next to the call, as in
  `JdbcVenueCatalog` / `JdbcAvailabilityClaim`. Bind with named params (`:id`), never string
  concatenation.

### 1a. If a Spring Data JDBC aggregate earns it — model it correctly

The repo's default is `JdbcClient` + explicit SQL. Reach for a Spring Data JDBC **aggregate**
only when a cluster of rows is genuinely one consistency unit (loaded, mutated, and saved
together). When you do, follow these rules — they keep the aggregate aligned with the
Modulith boundaries (invariant #11), and several are the persistence-level form of decisions
we already made:

- **The aggregate is the consistency + transaction boundary.** One repository
  (`CrudRepository`/`ListCrudRepository`) **per aggregate root only** — never a repository for
  an entity that lives *inside* an aggregate. Save the root; it persists its children.
- **Cross-aggregate references are by id, never by object.** A `Booking` holds a
  `SetId`/`CustomerId`, not a `Set`/`Customer` instance — the same rule invariant #11 puts on
  event payloads, and exactly why `SetId` lives in `venue.api`.
- **No cascade between aggregates.** Saving one aggregate must never save another — aggregates
  are autonomous. A cross-aggregate effect happens via a **domain event** or a second explicit
  `save`, not a persistence cascade. (This is the storage-level shape of the event spine:
  `BookingConfirmed` → availability marks the set **and** payout accrues, as two independent
  writes — not one cascading save.)
- **Inside an aggregate, references go root → child only, and unidirectional.** No child→root
  back-reference, no bidirectional object graphs; the child row carries the root's FK in the DB.
- **Model M:N join tables explicitly** as their own type (e.g. a `ProductCategory` row).
  Spring Data JDBC has no JPA-style hidden join table — and explicit is what we want anyway.
- **`save` is explicit.** There is no JPA dirty-checking / autoflush: a load-then-mutate with
  no `save` persists nothing. Write the `save`.
- **Mind the imports** (the classic footgun): `org.springframework.data.annotation.@Id` and
  `org.springframework.data.relational.core.mapping.@Table`/`@Column`/`@MappedCollection` —
  never the `jakarta.persistence` annotations of the same simple name (see rule 1).

*(Distilled from a JPA→Spring Data JDBC migration write-up — we have no JPA to migrate, but
these are the right way to use Spring Data JDBC from the start.)*

### 2. Data shapes: records for DTOs, value objects, and ids

- DTOs / API views / event payloads / typed ids are **`record`s** (`VenueId`, `SetId`,
  `VenueMapView`, `SetView`, `MoneyView`). Small, immutable, transparent.
- Typed ids over raw `long`/`String` at module seams and in event payloads (invariant #11) —
  `record SetId(long value) {}`. The wire DTO may still use primitives; the port uses the
  typed id.
- Put validation in the **compact canonical constructor** when an id/value has an invariant
  (e.g. non-negative). Don't add it speculatively — only when something real depends on it.

### 3. Dependency injection: constructor-only, package-private adapters

- **Constructor injection into `final` fields.** Never `@Autowired` on a field or setter.
- Adapters are **package-private classes with package-private constructors** (see
  `JdbcVenueCatalog`, `JdbcAvailabilityClaim` — both `class … implements`, not `public`).
  Only the `api/` port is public. This keeps the Modulith seam honest: callers depend on the
  interface, not the implementation.
- One constructor; no `@Autowired` needed when there's a single constructor.

### 4. Module seams: expose `api/`, hide `infrastructure.*` (invariant #11)

- Public surface = the module's `api/` package only (ports + record types + ids), exposed as
  a Spring Modulith `@NamedInterface("api")` when another module must depend on it.
- Everything in `application.*` / `infrastructure.*` / `domain` is package-private or
  internal. Cross-module collaboration is the other module's `api/` port (queries / sync
  commands) **or** a domain event with an id-based payload (state changes) — never an import
  of another module's internals.
- A single implementation behind a port is fine (a hypothetical seam) — don't invent an
  extra application-service layer just to have one (see `codebase-design`).

### 5. Java 25 language features — use them

- **Records** (above). **Sealed interfaces** for closed hierarchies (a fixed set of
  outcomes/states/commands) so `switch` is exhaustive without a `default`.
- **Pattern-matching `switch`** and `instanceof` patterns over cast-ladders — bind in the
  pattern (`if (x instanceof SetView s)`, never test-then-cast). Prefer an exhaustive `switch`
  expression on a sealed type or enum.
- **Record deconstruction patterns** (`case Refund(var amount, var reason) -> …`, nested
  patterns for layered records) and **guarded patterns** (`case Booking b when
  b.isCancellable() -> …`) when matching over a sealed result/event hierarchy — they pay off
  as the domain events / refund decisions land (U5/U6/U10). Don't force them where a plain
  enum `switch` (e.g. over `ClaimOutcome`) is already clearer.
- **Text blocks** for SQL and multi-line strings.
- `Optional<T>` for "absent" on query ports (e.g. `VenueCatalog#findVenueMap`,
  `poolOf`) — **never return `null`** from a port. Don't use `Optional` for fields or
  parameters.
- `var` for obvious local types; spell the type out when it aids reading.
- **Streams & lambdas — modern idioms, used judiciously.** Prefer **`.toList()`** (Java 16+)
  over the stale `.collect(Collectors.toList())`, and **method references** (`SetView::price`)
  over trivial lambdas (`s -> s.price()`); `.sorted()` for natural order. Reach for a stream
  for a transform / filter / aggregate (as `JdbcVenueCatalog`'s from-price `min` does) — but
  if a chain turns intricate or needs side effects, a plain `for` loop is clearer; don't force
  it. (Multi-row SQL aggregation usually belongs in the query, not a stream over rows.)

### 6. Errors: typed outcomes for expected flows, exceptions for the exceptional

- Model **expected, caller-handled** results as a value — an `enum` or sealed result
  (`ClaimOutcome { CLAIMED, ALREADY_TAKEN, NOT_ONLINE_POOL, NO_SUCH_SET }`), not an
  exception. A lost claim race is normal flow, not a stack trace.
- Reserve exceptions for genuinely exceptional conditions. **Never swallow** — no empty
  `catch`. Let Spring map truly-unexpected failures.
- **Catch specific exception types, never a bare `catch (Exception)` / `Throwable`.** A
  generic catch masks programming bugs (a `NullPointerException`, a wrong cast) as if they
  were handled, defeats targeted recovery, and hides the real cause. Catch the narrowest type
  you can act on; rethrow as a meaningful exception if you must translate.
- Keep transactions small and explicit: `@Transactional` on the write method
  (`org.springframework.transaction.annotation.Transactional`), one short unit of work.

### 6a. Name your literals — no magic numbers/strings

- Replace meaning-carrying literals with a `private static final` constant or an `enum`. We
  already do this: `ONLINE_POOL` in `JdbcAvailabilityClaim`, the `BOOKED_ONLINE` / `WALK_IN`
  state tokens, the commission/price factors. A repeated or domain-significant literal that
  isn't named is a silent-typo bug waiting to happen.
- Status/pool/state tokens that the DB `CHECK` constraints also list are the highest-value
  case — keep the Java constant and the SQL token in lockstep.

### 6b. Request validation & error contract (one contract, shipped by #97)

Every API error is an **RFC-7807 `ProblemDetail`** (`application/problem+json`) carrying a
stable machine-readable **`code`** extension. The shape is built in exactly two places:

- **`ApiProblem`** (root package) — the one factory for the wire shape. Controllers use it
  when an exhaustive typed-outcome `switch` rejects (typed outcomes are returned, not thrown
  — §6 — so an advice never sees them). `detail` must be safe for any caller: never a booking
  code (invariant #7), an exception message, or another internal echo.
- **`ApiErrorHandler`** (root package) — the **single** `@RestControllerAdvice` for
  everything thrown: `IllegalArgumentException` → `400 INVALID_REQUEST`,
  `DataIntegrityViolationException` → `409 CONFLICT` (the constraint-race backstop,
  invariant #12), `NotVenueOwnerException`/`AccessDeniedException` → `403` (invariant #13);
  it extends `ResponseEntityExceptionHandler` so framework errors carry the same shape.
  **Per-controller `@ExceptionHandler`s are forbidden** — machine-locked by
  `ErrorContractArchitectureTests`. (`RateLimitFilter` mirrors the shape by hand: it rejects
  before MVC dispatch.)
- **Where validation lives.** Presence/shape/format checks belong at the edge (the DTO's
  `toCommand()`), domain invariants in the value object's canonical constructor (`Money`,
  ids) and the application service. Keep HTTP-status mapping out of the domain — the
  controller/advice maps a typed outcome or exception to a status.
- **Status mapping, centrally defined:** availability/uniqueness conflicts → `409`;
  not-bookable/cutoff → `422`; unknown id → `404`; malformed body → `400`; ownership → `403`;
  rate limit → `429`. Framework-raised errors carry a **derived stable code**: `400` →
  `INVALID_REQUEST`, otherwise the HTTP status name (`METHOD_NOT_ALLOWED`,
  `UNSUPPORTED_MEDIA_TYPE`, …) — pinned by `ApiErrorHandlerTest`.
- **`instance` is redacted by construction.** Spring auto-fills a null ProblemDetail
  `instance` with the raw request URI — on `/api/bookings/{code}` paths that is the bearer
  credential (invariant #7). `ApiProblem` pins every body to `about:blank` (the advice
  re-applies it to framework-built bodies); a controller may override with a known-safe URI
  (`BookingController` uses its collection path).

> **Decision settled at #97's plan stage:** **centralized-explicit validation** — hand-rolled
> checks in `toCommand()` throwing `IllegalArgumentException`, mapped once by the advice.
> `spring-boot-starter-validation`/`@Valid` was deliberately **not** adopted (three DTOs whose
> checks are parse/cross-field logic; annotations would split validation across two
> mechanisms; explicit code in records is the house idiom). Reversible in one dependency line
> if the DTO count ever makes annotations pay — rationale in
> `docs/plans/error-contract-problemdetail.md`.

### 7. Money & time (invariants #5, #6 — details in CLAUDE.md)

- Money is `long`/`int` **minor units** + an ISO currency string. Never `double`/`float`/
  `BigDecimal`-as-currency, never `NUMERIC` columns for amounts.
- `java.time` only: store UTC `Instant`; a booking *date* is a `LocalDate` (civil day,
  reasoned in `Europe/Tirane`). Never the JVM default zone, never `java.util.Date`/`Calendar`.

### 8. Concurrency & virtual threads

- Don't hand-roll thread pools in application code. The concurrency guarantees come from the
  DB (unique constraint + `INSERT … ON CONFLICT`), not from Java locks (invariant #2).
- Virtual threads are a deliberate, deferred config decision (see the discussion in
  `docs/` / PRs) — the real scaling knob is the Hikari pool. Don't flip
  `spring.threads.virtual.enabled` casually.
- In tests, `ExecutorService` is `AutoCloseable` (Java 19+) — use try-with-resources.

### 9. Tests

- JUnit 5, plain `assertEquals`/`assertThrows` (the repo's current style) — match the
  surrounding test's assertion library, don't introduce a new one.
- DB behaviour → **Testcontainers** integration tests (`@SpringBootTest` +
  `@Import(TestcontainersConfiguration.class)` + `@EnabledIfDockerAvailable`), against real
  Postgres. The highest-stakes invariant (#2) gets a real concurrency test, not a mock.
- Don't mock what you can test for real cheaply; reserve test doubles for true seams.

### 10. Logging & secrets

- SLF4J with parameterized logging (`log.info("claimed set {}", id)`), never string
  concatenation.
- **Never log a booking code in clear** (invariant #7) or any secret/PII.
- **Guard against log injection.** Parameterized logging stops *format* abuse but does **not**
  sanitize the value — a user-controlled string (email, free-text name, header) can carry
  `\r\n` and forge fake log lines or break log parsers (CRLF / log forging). When logging
  untrusted input, neutralize newlines (e.g. replace `\r\n`/`\n`) or rely on a structured
  (JSON) appender that encodes field values. Logging an `id`/enum is safe; logging raw
  free-text is the risk.

## Red flags

| Thought | Reality |
|---|---|
| "I'll add an `@Entity` / a `JpaRepository`." | JDBC only (invariant #1). Use `JdbcClient` + a record + explicit SQL. |
| "Lombok `@Data`/`@Builder` saves boilerplate." | No Lombok. A `record` already gives you all of it. |
| "Field `@Autowired` is shorter." | Constructor injection into `final` fields, always. |
| "Make the JDBC adapter `public`." | Package-private; only the `api/` port is public (Modulith seam). |
| "Return `null` when not found." | Return `Optional<T>` from query ports. |
| "Throw an exception when the set is taken." | Return a typed `ClaimOutcome`; a lost race is expected flow. |
| "Wrap it in `catch (Exception)` to be safe." | Catch the specific type; a bare catch masks NPEs/programming bugs. |
| "`price * 0.1` / hard-code `'ONLINE'`." | Name it: a constant or enum (e.g. `ONLINE_POOL`); no magic literals. |
| "`.collect(Collectors.toList())`." | Stale — use `.toList()` (Java 16+); method refs over trivial lambdas. |
| "`if (x instanceof T) { T t = (T) x; … }`." | Bind in the pattern: `if (x instanceof T t)` — test + extract in one. |
| "`log.info("user " + email + " booked")` — it's parameterized-ish." | Untrusted text can carry `\r\n` (log forging). Sanitize newlines or use a structured appender. |
| "Store the amount as a `BigDecimal` euro." | Integer minor units + currency (invariant #5). |
| "`new Date()` / `LocalDateTime.now()` for the cutoff." | UTC `Instant`; reason in `Europe/Tirane` (invariant #6). |
| "Call the other module's service class directly." | Via its `api/` port or a domain event only (invariant #11). |
| "Spin up a thread pool to parallelise the claim." | The DB unique index is the concurrency primitive (invariant #2). |

## When NOT to use

- Frontend work (that's `angular-developer`).
- Non-Java files (SQL migrations → `postgres`; plans → `riviera-plan-doc`).

## Integration

- **`codebase-design`** — decides the *shape* of the seam (deep module, where the interface
  goes); this skill decides the *Java* that fills it.
- **`postgres`** — the SQL/schema craft behind the `JdbcClient` calls.
- **`riviera-review-overlay`** — checks these idioms at the review gate (JDBC-only,
  boundaries, money/time, booking-code security).
- **`CLAUDE.md`** — the numbered invariants this skill references; that file is canonical.

## Provenance

Project-authored (no third-party code vendored). Informed by the *generic, non-JPA* parts of
reputable community Java skills (e.g. Kousen's Spring Boot skill, the `java-architect`
skill) — their JPA/Lombok defaults were deliberately **excluded** because they contradict
invariant #1.
