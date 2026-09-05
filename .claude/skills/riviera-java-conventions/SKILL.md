---
name: riviera-java-conventions
description: >-
  Java idioms for platform/ (Java 25, Spring Boot 4): JDBC-only, records, no Lombok,
  constructor injection, typed outcomes, the error contract, comment rules. Load BEFORE
  writing or refactoring any Java — class, record, port, service, adapter, event, or test.
---

# Riviera Java conventions

Language-level "how we write Java": JDBC-only, records-first, no Lombok, hexagonal Spring
Modulith on Java 25. The numbered invariants stay in `CLAUDE.md`; this skill references
them by number where they bite.

## The rules

### 1. Persistence: JDBC only — no JPA, no Hibernate, no Lombok (invariant #1)

- **Never any JPA/Hibernate type:** `jakarta.persistence.*` (`@Entity`, that package's
  `@Table`/`@Id`, `@OneToMany`/`@ManyToOne`, `EntityManager`), `org.hibernate.*`,
  `JpaRepository`, `spring-boot-starter-data-jpa`. Persistence is `JdbcClient` /
  `JdbcTemplate` with explicit SQL.
- **`@Table`/`@Id` are package-sensitive:** `jakarta.persistence` = JPA = forbidden;
  `org.springframework.data.relational.core.mapping.@Table` /
  `org.springframework.data.annotation.@Id` = Spring Data JDBC = permitted, but only on a
  genuine aggregate root (§1a) — and there is none in the tree today, so an annotated type
  would be the first. `JdbcOnlyArchitectureTests` probes the packages.
- **No Lombok.** No `@Data`/`@Getter`/`@Builder`/`@RequiredArgsConstructor`. Records give
  immutability + accessors + equals/hashCode; for the rare mutable holder, write the
  constructor by hand.
- SQL lives in Java text blocks (`"""…"""`) next to the call, as in `JdbcVenueCatalog` /
  `JdbcAvailabilityClaim`. Bind with named params (`:id`), never string concatenation.

### 1a. If a Spring Data JDBC aggregate earns it

Reach for an aggregate only when a cluster of rows is genuinely one consistency unit —
loaded, mutated and saved together, by one writer, under an invariant spanning them. Nothing
in the tree is that, so an annotated type would be the first and owes a stated reason, not a
preference. Two constraints if one ever earns it: the mapping is
`org.springframework.data.relational`, never `jakarta.persistence` (the `@Table`/`@Id` simple
names collide), and it may **not** live in `domain/` — ADR-0018 §4 holds that package
framework-free and `DomainPurityArchitectureTests` rejects any `org.springframework` import
there.

### 2. Data shapes: records for DTOs, value objects, and ids

- DTOs / API views / event payloads / typed ids are `record`s (`VenueId`, `SetId`,
  `VenueMapView`, `SetView`, `MoneyView`).
- Typed ids over raw `long`/`String` at module seams and in event payloads (invariant #11)
  — `record SetId(long value) {}`. The wire DTO may use primitives; the port uses the typed id.
- Validation goes in the compact canonical constructor when an id/value has an invariant
  (e.g. non-negative); don't add it speculatively.

### 3. Dependency injection: constructor-only, package-private adapters

- Constructor injection into `final` fields. Never `@Autowired` on a field or setter. One
  constructor; no `@Autowired` needed.
- Adapters are package-private classes with package-private constructors
  (`JdbcVenueCatalog`, `JdbcAvailabilityClaim`). Only the `api/` port is public.

### 4. Module seams (invariant #11) — structure is `riviera-modulith`'s call

Which package a class belongs in, the api/vocabulary/events/spi split, the ADR-0007
two-template shape, and how modules collaborate are `riviera-modulith`'s — load it before
creating or moving any class. A single implementation behind a port is fine (a hypothetical
seam); don't invent an extra application-service layer just to have one (`codebase-design`).

### 5. Java 25 language features — use them

- **Sealed interfaces** for closed hierarchies (a fixed set of outcomes/states/commands) so
  `switch` is exhaustive without a `default`.
- **Pattern-matching `switch`** and `instanceof` patterns over cast-ladders — bind in the
  pattern (`if (x instanceof SetView s)`). Prefer an exhaustive `switch` expression on a
  sealed type or enum.
- **Record deconstruction patterns** (`case Refund(var amount, var reason) -> …`) and
  **guarded patterns** (`case Booking b when b.isCancellable() -> …`) when matching over a
  sealed result/event hierarchy. Don't force them where a plain enum `switch` (e.g. over
  `ClaimOutcome`) is clearer.
- **Text blocks** for SQL and multi-line strings.
- `Optional<T>` for "absent" on query ports (`VenueCatalog#findVenueMap`, `poolForClaim`)
  — never return `null` from a port. Don't use `Optional` for fields or parameters.
- `var` for obvious local types; spell the type out when it aids reading.
- Streams: `.toList()` over `.collect(Collectors.toList())`; method references
  (`SetView::price`) over trivial lambdas; `.sorted()` for natural order. A stream for a
  transform / filter / aggregate; a plain `for` loop when a chain turns intricate or needs
  side effects. Multi-row SQL aggregation usually belongs in the query.

### 6. Errors: typed outcomes for expected flows, exceptions for the exceptional

- Model expected, caller-handled results as a value — an `enum` or sealed result
  (`ClaimOutcome { CLAIMED, ALREADY_TAKEN, NOT_ONLINE_POOL, NO_SUCH_SET }`), not an
  exception. A lost claim race is normal flow.
- Reserve exceptions for genuinely exceptional conditions. Never swallow — no empty `catch`.
- Catch specific exception types, never a bare `catch (Exception)` / `Throwable` — a generic
  catch masks programming bugs. Rethrow as a meaningful exception if you must translate.
- Keep transactions small and explicit: `@Transactional`
  (`org.springframework.transaction.annotation.Transactional`) on the write method.

### 6a. Name your literals — no magic numbers/strings

Replace meaning-carrying literals with a `private static final` constant or an `enum`
(`ONLINE_POOL` in `JdbcAvailabilityClaim`, the `BOOKED_ONLINE` / `WALK_IN` state tokens,
the commission/price factors). Status/pool/state tokens that the DB `CHECK` constraints
also list are the highest-value case — keep the Java constant and the SQL token in lockstep.

### 6b. Request validation & error contract

Every API error is an RFC-7807 `ProblemDetail` (`application/problem+json`) with a stable
machine-readable `code` extension, built in exactly two places: `ApiProblem` (the one
factory for the wire shape — controllers use it when a typed-outcome `switch` rejects) and
`ApiErrorHandler` (the single `@RestControllerAdvice` for everything thrown).
Per-controller `@ExceptionHandler`s are forbidden (`ErrorContractArchitectureTests`). Never
leak internals into `detail` (no booking code — invariant #7 — no exception message), and
`detail` states the condition, not the remedy (user-facing wording is the client's, keyed on
`code`). Mechanics, the status map, and the no-`@Valid` decision: `references/error-contract.md`.

### 6c. Comments and prose: keep it only if a fresh session would act on it (RV-STYLE-1)

One test for every line of prose a diff adds or touches — in a `riviera-*` skill or its
`references/`, a Javadoc/TSDoc, an inline comment: **keep it only if a fresh session reading
it would act differently. Otherwise drop it.** The next reader has no "before" to compare
against, so text written for the author's own session costs context and changes nothing.

- **Drop:** provenance (`#NNN`, `PR N`, `since #`); history (`used to`, `no longer`,
  `previously`, `before this change`, `the alternative would have been`); narration of the
  diff (`this change`, `now`); restating the code; motivation and praise of the mechanism.
- **Keep:** the contract, the invariant reference (`invariant #2`), the trap and its remedy,
  the command, an exemption and its one-line why. Load-bearing rationale relocates to
  `RESPONSIBILITIES.md` or an ADR with a one-line pointer (§6d).
- **An inline comment is one line, or none.** If it needs two, the comment is doing work the
  code should do: name the constant, extract the method, sharpen the signature — then delete
  it. Default to zero per method; reach for one only when the *why* is unavailable from the
  code (a race, an ordering constraint, an invariant reference, a deliberate deviation).
- **A touched doc comment is re-read whole.** Editing one line of an old Javadoc puts the
  whole block under the test — clean it, or leave it untouched.

The guard: `scripts/check-inline-comments.mjs` runs from a `PostToolUse` hook on every
`Write`/`Edit` and again in CI over the PR diff. It fails on a multi-line inline comment the
diff added and on a provenance tell in an added skill line, an added inline comment, or
anywhere in a touched doc comment; it advises on history phrasing, which is contract language often enough to leave to
review. By hand: `node scripts/check-inline-comments.mjs --files <path…>` or
`--diff origin/main`. Its scope is deliberately bounded — `references/inline-comment-guard.md`
before "fixing" any gap. The guard is a floor: it cannot see a line that says nothing.

### 6d. Javadoc: the contract, not the changelog

Javadoc answers what a caller must know — what this is, what it guarantees, what would
surprise someone using it. Not how it came to be; §6c's test decides line by line.

- **No issue numbers.** Provenance is `git blame`'s job and the tracker's.
- **No decision history.** "It began…", "widened by…", "used to…", "the alternative would
  have…", "deliberately not…", "reversed at…" is ADR and `RESPONSIBILITIES.md` material.
- **Relocate, don't delete, when the rationale is load-bearing.** Move it to the module's
  `RESPONSIBILITIES.md` section (or an ADR) and leave a one-line pointer:
  `Rationale: RESPONSIBILITIES.md §booking`.
- **Keep the warning, drop the essay.** Operational guidance a reader needs at the point of
  use stays, in one sentence (`do not sum them`).
- **Invariant references stay** (`invariant #2`, `invariant #11`).

Budget as a smell test: roughly 6 lines on a type, 3 on a member. Over budget → ask whether
the excess is contract (keep) or archaeology (relocate). The §6c guard enforces the
issue-number line on a touched block; the rest is a review item. The frontend twin lives in
`frontend/.claude/CLAUDE.md`.

### 7. Money & time (invariants #5, #6)

Money is integer minor units + ISO currency; time is UTC `Instant`, with booking dates as
`LocalDate` reasoned in `Europe/Tirane`. Stripe-boundary currency handling belongs to
`riviera-stripe-payments`.

### 8. Concurrency & virtual threads

- Don't hand-roll thread pools in application code. The concurrency guarantees come from
  the DB (unique constraint + `INSERT … ON CONFLICT`), not Java locks (invariant #2).
- Virtual threads are a deliberate, deferred config decision
  (#395) — the real scaling knob is the Hikari pool.
  Don't flip `spring.threads.virtual.enabled` casually.
- In tests, `ExecutorService` is `AutoCloseable` — use try-with-resources.

### 9. Tests

- JUnit 5, plain `assertEquals`/`assertThrows` — match the surrounding test's assertion
  library, don't introduce a new one.
- DB behaviour → Testcontainers integration tests against real Postgres; invariant #2 gets
  a real concurrency test, not a mock. Harness annotations + the Modulith test DSL:
  `riviera-modulith/references/testing.md`.
- Don't mock what you can test for real cheaply; reserve test doubles for true seams.

### 10. Logging & secrets

- SLF4J with parameterized logging (`log.info("claimed set {}", id)`), never concatenation.
- Never log a booking code in clear (invariant #7) or any secret/PII.
- Guard against log injection: parameterized logging does not sanitize the value — a
  user-controlled string (email, free-text name, header) can carry `\r\n` and forge log
  lines. When logging untrusted input, neutralize newlines or rely on a structured (JSON)
  appender that encodes field values. Logging an `id`/enum is safe; raw free-text is the risk.

## Red flags

| Thought | Reality |
|---|---|
| "I'll add an `@Entity` / a `JpaRepository`." | JDBC only (invariant #1). `JdbcClient` + a record + explicit SQL. |
| "Lombok `@Data`/`@Builder` saves boilerplate." | No Lombok. A `record` already gives you all of it. |
| "Field `@Autowired` is shorter." | Constructor injection into `final` fields, always. |
| "Make the JDBC adapter `public`." | Package-private; only the `api/` port is public. |
| "Return `null` when not found." | Return `Optional<T>` from query ports. |
| "Throw an exception when the set is taken." | Return a typed `ClaimOutcome`; a lost race is expected flow. |
| "Wrap it in `catch (Exception)` to be safe." | Catch the specific type; a bare catch masks NPEs/programming bugs. |
| "`price * 0.1` / hard-code `'ONLINE'`." | Name it: a constant or enum (`ONLINE_POOL`). |
| "`.collect(Collectors.toList())`." | `.toList()`; method refs over trivial lambdas. |
| "`if (x instanceof T) { T t = (T) x; … }`." | Bind in the pattern: `if (x instanceof T t)`. |
| "This needs a four-line comment to explain properly." | One line or none (§6c). If it won't fit, change the code — or move the contract to the Javadoc. |
| "`log.info("user " + email + " booked")`." | Untrusted text can carry `\r\n` (log forging). Sanitize newlines or use a structured appender. |
| "Store the amount as a `BigDecimal` euro." | Integer minor units + currency (invariant #5). |
| "`new Date()` / `LocalDateTime.now()` for the cutoff." | UTC `Instant`; reason in `Europe/Tirane` (invariant #6). |
| "Call the other module's service class directly." | Via its `api/` port or a domain event only (invariant #11). |
| "Spin up a thread pool to parallelise the claim." | The DB unique index is the concurrency primitive (invariant #2). |

## When NOT to use

- Frontend work (`angular-developer`); non-Java files (SQL migrations → `postgres`; plans →
  `riviera-plan-doc`).

## References

- `references/error-contract.md` — `ApiProblem`/`ApiErrorHandler` mechanics, the status
  map, `ErrorContractArchitectureTests`, and the validation decision behind §6b.
- `references/inline-comment-guard.md` — the §6c guard's three rules, scope, exemptions, and the
  deliberate false negative.
- `riviera-modulith/references/persistence-jdbc.md` — the `JdbcClient` adapter pattern
  behind §1, and where persistence sits in the hexagon.
- `riviera-modulith/references/testing.md` — the Modulith/Testcontainers harness behind §9.
