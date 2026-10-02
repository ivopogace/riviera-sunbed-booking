# ADR-0001: Persistence is JDBC only — no JPA/Hibernate

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

The availability table is the concurrency-critical heart of the product: every
channel (online booking, staff walk-in mark) writes the same `(set, date)` row, and
a double-sold set is the failure that destroys trust. We need write-precise SQL with
explicit row locking, and we want to avoid ORM surprises (lazy loading, cascades,
snapshot/flush semantics) on the one table the whole business depends on.

## Decision

Persist via **Spring Data JDBC / `JdbcTemplate` only**. `spring-boot-starter-data-jpa`
must never be on the classpath. No `@Entity`, `@OneToMany`, `@ManyToOne`, `mappedBy`,
or `EntityManager`. Schema changes go through Flyway forward migrations. (Invariant #1.)

*Amended 2026-10-01 (#1342):* adapters are hand-written `JdbcClient` (and `JdbcTemplate`) SQL.
The Spring Data JDBC starter is on the classpath, but Spring Data repositories are not used and
nothing in `src/main/java` imports `org.springframework.data.*`; that ban is prose today
(`RESPONSIBILITIES.md` § *Invariants, long form*), its build check tracked in #1337.

*Amended 2026-10-02 (#1391):* the "prose today" clause above is spent: `JdbcOnlyArchitectureTests`'
`noProductionClassNamesASpringDataType` fails the build on any production class depending on
`org.springframework.data`, proven against the `ai.riviera.springdatafixture` tree. The same test's
Hibernate probe names Boot 4's `org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration`
(in `spring-boot-hibernate`, which the JPA starter brings); the Boot 3 name under
`spring-boot-autoconfigure` is absent from Boot 4's jars, and `theHibernateProbeNamesTheRunningBootMajor`
fails a Boot major upgrade until the probe is re-verified against that major's jar.

## Consequences

- Full control over the reservation transaction (`SELECT … FOR UPDATE` /
  `INSERT … ON CONFLICT`) and the unique constraint that enforces invariant #2.
- More hand-written SQL and mapping code; no free dirty-checking or lazy graphs.
- A build that resolves the JPA starter is itself a review blocker.

## Alternatives considered

- **JPA/Hibernate** — the Spring Boot default. Rejected: ORM concurrency/caching
  semantics obscure exactly the row-level control the availability invariant needs.
