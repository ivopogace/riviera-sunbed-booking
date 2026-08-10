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
- **`@Table`/`@Id` are package-sensitive — disambiguate, don't blanket-ban:**
  `jakarta.persistence` = JPA = forbidden; `org.springframework.data.relational.core.mapping.@Table`
  / `org.springframework.data.annotation.@Id` = Spring Data JDBC = permitted, but only on a genuine
  aggregate root (§1a). `JdbcOnlyArchitectureTests` probes the packages, not annotation simple-names.
- **No Lombok.** No `@Data`/`@Getter`/`@Builder`/`@RequiredArgsConstructor`. Records give
  you immutability + accessors + equals/hashCode with zero magic; for the rare mutable
  holder, write the constructor by hand. Lombok is not a dependency and must not become one.
- SQL lives in **Java text blocks** (`"""…"""`) right next to the call, as in
  `JdbcVenueCatalog` / `JdbcAvailabilityClaim`. Bind with named params (`:id`), never string
  concatenation.

### 1a. If a Spring Data JDBC aggregate earns it

Reach for an aggregate **only** when a cluster of rows is genuinely one consistency unit (loaded,
mutated, and saved together); the repo default stays `JdbcClient` + explicit SQL. The canonical
aggregate rules (one repository per root, id-only cross-aggregate references, no cascade between
aggregates, root→child-only navigation, explicit M:N join types, explicit `save`, the
jakarta-imports footgun) live in **`riviera-modulith/references/persistence-jdbc.md`** — read them
before modeling one.

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

### 4. Module seams (invariant #11) — structure is `riviera-modulith`'s call

- Cross-module collaboration is the other module's **published surface** — its `api/` port
  (queries / sync commands) or its `events/` records (state changes, id-based payloads) —
  never an import of another module's `application.*` / `adapter.*` / `domain`. Which
  package a class belongs in, the api/vocabulary/events/spi split, and the ADR-0007
  two-template shape are owned by **`riviera-modulith`** — load it before creating or
  moving any class.
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
  `poolForClaim`) — **never return `null`** from a port. Don't use `Optional` for fields or
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

Every API error is an **RFC-7807 `ProblemDetail`** (`application/problem+json`) with a stable
machine-readable **`code`** extension, built in exactly two places: **`ApiProblem`** (the one
factory for the wire shape — controllers use it when a typed-outcome `switch` rejects) and
**`ApiErrorHandler`** (the **single** `@RestControllerAdvice` for everything thrown).
**Per-controller `@ExceptionHandler`s are forbidden** — `ErrorContractArchitectureTests` enforces.
Never leak internals into `detail`: no booking code (invariant #7), no exception message. Full
mechanics, the status map, and the #97 no-`@Valid` decision: `references/error-contract.md`.

### 6c. Comments: one line, or none (authoring side of RV-STYLE-1)

Write the comment you would keep after review, not the one you would have to trim.

- **An inline comment must fit on one line.** If it needs two, the comment is doing work the code
  should do: name the constant, extract the method, or sharpen the signature — then delete it.
- **Default to zero inline comments in a method.** Reach for one only when the *why* is genuinely
  unavailable from the code: a race, an ordering constraint, a spec/invariant reference, a
  deliberate deviation. "What the next line does" is never worth a line.
- **Javadoc is exempt from the one-line rule, not from every rule.** It is the repo's documented
  surface (every `api/` port depends on it), so the explanation belongs *there* rather than scattered
  through a method body — but "exempt" once read as "unbounded", and §6d is the bound it was missing.

The review bank enforces this as **RV-STYLE-1** — but a rule that only fires at review means the
prose gets written and then deleted. This section exists so the first draft is already right.

**A guard now enforces it at authoring time** (#529): `scripts/check-inline-comments.mjs` runs
from a `PostToolUse` hook on every `Write`/`Edit`, so a multi-line inline comment comes back as
feedback on the edit that wrote it; CI re-runs it over the PR diff. Run it by hand with
`node scripts/check-inline-comments.mjs --files <path…>`, or over a whole branch with
`--diff origin/main`. Three things about its scope, so nobody "fixes" a deliberate gap:

- **Diff-scoped, always.** It only judges lines a diff *added*. The existing tree carries many
  pre-existing multi-line inline comments that read as established convention in their own files;
  a repo-wide gate would go red on day one and get switched off. Don't reflow untouched comments.
- **Four languages, by comment syntax:** `.java`, `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`, `.scss`/`.css`,
  `.html`. **Not** `#` files (shell, YAML, `.properties`) — every one of those in this repo carries
  multi-line `#` header prose as its documented convention — and **not** SQL `--`, which #522's
  finding F-6 declined by precedent, citing `V9__payout_ledger.sql`.
- **Two exemptions beyond the doc-comment carve-out:** a block comment standing before any code is
  the file's header (`styles.scss` opens with one), and only whole-line comments merge into a
  block, so a trailing comment never pairs with the next line's.
- **One deliberate false negative — do not "fix" it.** A violation must be something the diff
  *wrote*: it groups only **added** comment lines, and flags a block comment only when the diff
  wrote its **opening** line. So appending a second line to a comment that was already there
  reads as a one-line addition and passes. The alternative — grouping every adjacent comment line
  and then asking whether any was added — flags a whole pre-existing block because you parked one
  compliant one-liner beneath it, quoting text you never wrote. `SecurityConfig` alone carries 25
  such blocks. That false positive is how the gate gets switched off; the false negative just
  leaves the case to review, which is what RV-STYLE-1 is still for. (Found at this slice's own
  review gate, after the guard shipped with the bug it exists to prevent.)

The guard is a floor, not the rule: it cannot see a one-line comment that says nothing, and the
rule's "default to zero inline comments" half is still yours. RV-STYLE-1 remains the review item.

### 6d. Javadoc: the contract, not the changelog

§6c pushes prose *out* of method bodies and into Javadoc, and for four years said nothing about
what happens once it lands there. It accumulated: 42% of `platform/src/main` was comment lines,
11,269 of them Javadoc, and only 53 of 1,280 blocks carried a `@param`/`@return`/`@throws`. The
overwhelming majority was **decision archaeology** — issue numbers, what the code used to be, which
alternative was rejected — restated at every call site. This section is the missing half of §6c.

**Javadoc answers what a caller must know.** What this is, what it guarantees, and what would
surprise someone using it. Not how it came to be.

- **No issue numbers.** `#404`, `#442`, "(issue #100, D4)" — provenance is `git blame`'s job and the
  tracker's. An issue number in Javadoc points at a conversation the reader cannot see, cannot
  search from their editor, and does not need in order to call the method correctly.
- **No decision history.** "It began…", "widened by…", "used to…", "the alternative would have…",
  "deliberately not…", "reversed at…". This is ADR and `RESPONSIBILITIES.md` material.
- **Relocate, don't delete, when the rationale is load-bearing.** Move it to the module's
  `RESPONSIBILITIES.md` section (or an ADR when the decision is hard-to-reverse), and leave a
  one-line pointer: `Rationale: RESPONSIBILITIES.md §booking`. The repo already states this
  principle for the mail metrics — *"stated once in `RESPONSIBILITIES.md` § notification, not
  duplicated here"* — §6d is that rule applied to Javadoc.
- **Keep the warning, drop the essay.** Operational guidance a reader needs *at the point of use*
  stays, in one sentence. `do not sum them` earns its line; three paragraphs on why the counter
  needed a name of its own do not.
- **Invariant references stay** — `invariant #2`, `invariant #11`. They are short, load-bearing,
  and resolve inside the repo against a numbered list in `CLAUDE.md`.

**Budget, as a smell test rather than a gate:** roughly **6 lines on a type, 3 on a member**. Over
budget is the signal to ask whether the excess is contract (keep, and the budget is advisory) or
archaeology (relocate). A 40-line constant doc is never contract.

Nothing machine-enforces this — there is no Checkstyle Javadoc rule and no eslint-jsdoc, by
choice: a line budget would push authors to write six useless lines as readily as it stops them
writing sixty. It is a review item, and the frontend twin lives in `frontend/.claude/CLAUDE.md`.

### 7. Money & time (invariants #5, #6 — canonical in CLAUDE.md)

Money is integer **minor units** + ISO currency (invariant #5); time is UTC `Instant`, with booking
dates as `LocalDate` reasoned in `Europe/Tirane` (invariant #6). Stripe-boundary currency handling
belongs to `riviera-stripe-payments`.

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
- DB behaviour → **Testcontainers** integration tests against real Postgres; the
  highest-stakes invariant (#2) gets a real concurrency test, not a mock. Harness annotations
  + the Modulith test DSL: `riviera-modulith/references/testing.md`.
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
| "This needs a four-line comment to explain properly." | One line or none (§6c). If it won't fit, change the code — or move the prose to the Javadoc, which is exempt. |
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

## References

- **`references/error-contract.md`** — `ApiProblem`/`ApiErrorHandler` mechanics, the status map,
  `ErrorContractArchitectureTests`, and the #97 validation decision behind §6b.
- **`riviera-modulith/references/persistence-jdbc.md`** — the canonical Spring Data JDBC
  aggregate rules behind §1a, and the `JdbcClient` adapter pattern behind §1.
- **`riviera-modulith/references/testing.md`** — the Modulith/Testcontainers test harness behind §9.

## Provenance

Project-authored; informed by the *generic, non-JPA* parts of reputable community Java skills —
their JPA/Lombok defaults were deliberately **excluded** (they contradict invariant #1).
