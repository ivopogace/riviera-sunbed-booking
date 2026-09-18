---
name: riviera-java-conventions
description: >-
  Java idioms for platform/ (Java 25, Spring Boot 4): JDBC-only, records, no Lombok,
  constructor injection, typed outcomes, the error contract, comment rules. Load BEFORE
  writing or refactoring any Java — class, record, port, service, adapter, event, or test.
---

# Riviera Java conventions

Invariant numbers reference `CLAUDE.md`. Structure (which package, api/spi/vocabulary/events)
is `riviera-modulith`'s.

### 1. Persistence: JDBC only, no Lombok (#1)

- Never `jakarta.persistence.*`, `org.hibernate.*`, `JpaRepository`,
  `spring-boot-starter-data-jpa`. `JdbcOnlyArchitectureTests` probes the packages.
- `@Table`/`@Id` from `org.springframework.data.relational` / `.annotation` are Spring Data
  JDBC and permitted only on a genuine aggregate root (§1a); there is none in the tree.
- No Lombok. Records give immutability, accessors, equals/hashCode.
- SQL in text blocks next to the call; named params (`:id`), never concatenation.

### 1a. A Spring Data JDBC aggregate

Only when a cluster of rows is one consistency unit — loaded, mutated and saved together by
one writer under a spanning invariant — with the reason stated. Mapping from
`org.springframework.data.relational`, never `jakarta.persistence`; never in `domain/`
(`DomainPurityArchitectureTests` rejects `org.springframework` there).

### 2. Data shapes

Records for DTOs, views, event payloads, typed ids (`VenueId`, `SetId`, `MoneyView`). Typed
ids at module seams and in payloads; the wire DTO may use primitives. Validation in the
compact constructor only where an invariant exists.

### 3. Injection

Constructor injection into `final` fields; never field/setter `@Autowired`. Adapters are
package-private with package-private constructors; only the `api/` port is public.

### 4. Seams

A single implementation behind a port is fine; don't invent an application-service layer just
to have one (`codebase-design`).

### 5. Java 25

Sealed interfaces for closed hierarchies so `switch` is exhaustive without `default`;
pattern-matching `switch`/`instanceof` (`if (x instanceof SetView s)`), record deconstruction
and guarded patterns where they read better than a plain enum `switch`; text blocks;
`Optional<T>` from query ports (never `null`; not for fields or parameters); `var` for obvious
types; `.toList()`, method references, a plain `for` when a stream turns intricate; multi-row
aggregation in SQL.

### 6. Errors

Expected outcomes are values (`ClaimOutcome { CLAIMED, ALREADY_TAKEN, NOT_ONLINE_POOL,
NO_SUCH_SET }`), not exceptions — a lost race is normal flow. Never an empty `catch`; never
`catch (Exception)`/`Throwable`. `@Transactional`
(`org.springframework.transaction.annotation`) on the write method, kept small.

### 6a. Named literals

Meaning-carrying literals are `private static final` constants or enums
(`venue.vocabulary.Pool`, `BOOKED_ONLINE`/`STAFF_MARKED`). Tokens a DB `CHECK` also lists stay
in lockstep with the SQL.

### 6b. Error contract

Every API error is an RFC-7807 `ProblemDetail` with a stable `code`, built in exactly two
places: `ApiProblem` (controllers, when a typed-outcome `switch` rejects) and `ApiErrorHandler`
(the single `@RestControllerAdvice`). No per-controller `@ExceptionHandler`
(`ErrorContractArchitectureTests`). `detail` states the condition, never a remedy, and never
leaks a booking code (#7) or exception message. Mechanics: `references/error-contract.md`.

### 6c. Comments and prose (RV-STYLE-1)

Keep a line — inline comment, Javadoc/TSDoc, skill line — only if a fresh session reading it
would act differently. Drop provenance (`#NNN`, `PR N`), history (`used to`, `no longer`,
`previously`), diff narration (`this change`, `now`), restatement, praise. Keep the contract,
the invariant reference, the trap and its remedy, the command, an exemption's one-line why.
Load-bearing rationale relocates to `RESPONSIBILITIES.md` or an ADR with a one-line pointer.
**An inline comment is one line or none**; default to zero per method. **A touched doc
comment is re-read whole.** Guard: `scripts/check-inline-comments.mjs` (hook + CI; by hand
`--files <path…>` or `--diff origin/main`); its deliberate gaps are in
`references/inline-comment-guard.md`.

### 6d. Javadoc: the contract, not the changelog

No issue numbers, no decision history ("it began…", "widened by…", "deliberately not…").
Relocate load-bearing rationale (`Rationale: RESPONSIBILITIES.md §booking`); keep the one-line
warning at the point of use; keep invariant references. Budget: ~6 lines per type, ~3 per
member. The frontend twin: `frontend/.claude/CLAUDE.md`.

### 7. Money & time (#5, #6)

Integer minor units + ISO currency; UTC `Instant`, booking dates as `LocalDate` in
`Europe/Tirane`.

### 8. Concurrency

No hand-rolled thread pools; the DB constraint + `ON CONFLICT` is the concurrency primitive
(#2). Virtual threads are a deferred config decision; the scaling knob is the Hikari pool. In
tests, `ExecutorService` is `AutoCloseable`.

### 9. Tests

JUnit 5, plain `assertEquals`/`assertThrows`, matching the surrounding file. DB behaviour →
Testcontainers ITs; #2 gets a real concurrency test. Doubles only at true seams. Harness:
`riviera-modulith/references/testing.md`.

### 10. Logging

SLF4J parameterized. Never a booking code, secret or PII. Parameterized logging does not
sanitize `\r\n` — neutralize newlines in user-controlled text or use a structured appender.

## Red flags

| Thought | Reality |
|---|---|
| `@Entity` / `JpaRepository` / Lombok | JDBC + records (#1). |
| `public` JDBC adapter | Package-private; only the port is public. |
| Return `null` when not found | `Optional<T>`. |
| Throw when the set is taken | Return `ClaimOutcome`. |
| `catch (Exception)` | Catch the specific type. |
| `price * 0.1`, `'ONLINE'` | Named constant or enum. |
| A four-line comment | One line or none; change the code or move the contract to Javadoc. |
| `"user " + email + " booked"` in a log | Log forging; sanitize or structure. |
| `BigDecimal` euros, `LocalDateTime.now()` | Minor units (#5); UTC `Instant` in `Europe/Tirane` (#6). |
| Call another module's service | Its `api/` port or an event (#11). |
| A thread pool for the claim | The unique index is the primitive (#2). |
