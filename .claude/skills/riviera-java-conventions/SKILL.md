---
name: riviera-java-conventions
description: The Java language-level conventions for riviera-sunbed-booking backend code (Java 25, Spring Boot 4, Spring Modulith). Load BEFORE writing or refactoring any Java — a class, record, port, service, JDBC adapter, event, or test. It encodes the idioms that push Claude off its Spring-tutorial defaults: JDBC-only with NO JPA/Hibernate and NO Lombok, records for DTOs/value-objects/ids, constructor injection with package-private adapters, typed-outcome over exceptions, and Java 25 features (sealed types, pattern matching, text-block SQL, virtual-threads posture). Pairs with codebase-design (seam shape) and postgres (SQL); the numbered invariants live in CLAUDE.md and are checked by riviera-review-overlay.
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
- **Pattern-matching `switch`** and `instanceof` patterns over cast-ladders. Prefer an
  exhaustive `switch` expression on a sealed type or enum.
- **Text blocks** for SQL and multi-line strings.
- `Optional<T>` for "absent" on query ports (e.g. `VenueCatalog#findVenueMap`,
  `poolOf`) — **never return `null`** from a port. Don't use `Optional` for fields or
  parameters.
- `var` for obvious local types; spell the type out when it aids reading.

### 6. Errors: typed outcomes for expected flows, exceptions for the exceptional

- Model **expected, caller-handled** results as a value — an `enum` or sealed result
  (`ClaimOutcome { CLAIMED, ALREADY_TAKEN, NOT_ONLINE_POOL, NO_SUCH_SET }`), not an
  exception. A lost claim race is normal flow, not a stack trace.
- Reserve exceptions for genuinely exceptional conditions. **Never swallow** — no empty
  `catch`. Let Spring map truly-unexpected failures.
- Keep transactions small and explicit: `@Transactional` on the write method
  (`org.springframework.transaction.annotation.Transactional`), one short unit of work.

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

## Red flags

| Thought | Reality |
|---|---|
| "I'll add an `@Entity` / a `JpaRepository`." | JDBC only (invariant #1). Use `JdbcClient` + a record + explicit SQL. |
| "Lombok `@Data`/`@Builder` saves boilerplate." | No Lombok. A `record` already gives you all of it. |
| "Field `@Autowired` is shorter." | Constructor injection into `final` fields, always. |
| "Make the JDBC adapter `public`." | Package-private; only the `api/` port is public (Modulith seam). |
| "Return `null` when not found." | Return `Optional<T>` from query ports. |
| "Throw an exception when the set is taken." | Return a typed `ClaimOutcome`; a lost race is expected flow. |
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
