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

## Consequences

- Full control over the reservation transaction (`SELECT … FOR UPDATE` /
  `INSERT … ON CONFLICT`) and the unique constraint that enforces invariant #2.
- More hand-written SQL and mapping code; no free dirty-checking or lazy graphs.
- A build that resolves the JPA starter is itself a review blocker.

## Alternatives considered

- **JPA/Hibernate** — the Spring Boot default. Rejected: ORM concurrency/caching
  semantics obscure exactly the row-level control the availability invariant needs.
