---
name: riviera-java-conventions
description: >-
  Java idioms for platform/ (Java 25, Spring Boot 4): JDBC-only, typed ids and outcomes, the
  error contract, comment and Javadoc rules, logging. Load BEFORE writing or refactoring any
  Java — class, record, port, service, adapter, event, or test.
---

# Riviera Java conventions

Invariant numbers reference `CLAUDE.md`. Structure (which package, api/spi/vocabulary/events)
is `riviera-modulith`'s. Section numbers are cited from source — never renumber.

### 1. Persistence: JDBC only (#1)

`JdbcOnlyArchitectureTests` probes the packages. SQL in text blocks next to the call; named
params (`:id`), never concatenation. Adapters are package-private with package-private
constructors; only the `api/` port is public.

### 1a. A Spring Data JDBC aggregate

`@Table`/`@Id` from `org.springframework.data.relational` only on a genuine aggregate root;
there is none in the tree. One is warranted only when a cluster of rows is one consistency
unit — loaded, mutated and saved together by one writer under a spanning invariant — with the
reason stated. Never `jakarta.persistence`; never in `domain/` (`DomainPurityArchitectureTests`
rejects `org.springframework` there).

### 2. Data shapes

Records for DTOs, views, event payloads, typed ids (`VenueId`, `SetId`, `MoneyView`). Typed
ids at module seams and in payloads; the wire DTO may use primitives. Validation in the
compact constructor only where an invariant exists. Query ports return `Optional<T>`, never
`null`.

### 4. Seams

A single implementation behind a port is fine; don't invent an application-service layer just
to have one (`codebase-design`).

### 6. Errors

Expected outcomes are values (`ClaimOutcome`), not exceptions — a lost race is normal flow.
Never an empty `catch`; never `catch (Exception)`/`Throwable`. `@Transactional`
(`org.springframework.transaction.annotation`) on the write method, kept small.

### 6a. Named literals

Meaning-carrying literals are `private static final` constants or enums
(`venue.vocabulary.Pool`). Tokens a DB `CHECK` also lists stay in lockstep with the SQL.

### 6b. Error contract

Every API error is an RFC-7807 `ProblemDetail` with a stable `code`, built in exactly two
places: `ApiProblem` (controllers, when a typed-outcome `switch` rejects) and `ApiErrorHandler`
(the single `@RestControllerAdvice`); the filter-chain rejections (`RateLimitFilter`,
`SecurityProblemResponses`) mirror it by hand. No per-controller `@ExceptionHandler`
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
warning at the point of use; keep invariant references. Budget: 6 text lines per type (a file
or package header counts as one), 3 per member. Every doc comment the diff touches gates on it,
judged whole. `scripts/check-doc-budget.mjs` holds the tree at 0 lines over budget, so any growth
fails CI. The rationale a pointer sends to `RESPONSIBILITIES.md` keeps a budget there too: 8
lines per bullet or paragraph, gated and ratcheted the same way. Why the change was
made goes in the PR description, not the Javadoc. The frontend twin: `frontend/.claude/CLAUDE.md`.

### 8. Concurrency

The claim's concurrency primitive is the DB constraint + `ON CONFLICT` (#2). Virtual threads
are a deferred config decision; the scaling knob is the Hikari pool.

### 9. Tests

Plain `assertEquals`/`assertThrows`, matching the surrounding file. DB behaviour →
Testcontainers ITs; #2 gets a real concurrency test. Doubles only at true seams. Harness:
`riviera-modulith/references/testing.md`.

### 10. Logging

SLF4J parameterized. Never a booking code, secret or PII. Parameterized logging does not
sanitize `\r\n` — neutralize newlines in user-controlled text or use a structured appender.
