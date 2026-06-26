---
name: postgres
description: PostgreSQL table/schema design, indexing, and query best practices. Load for any Flyway migration or table-design work in this repo (especially the availability, booking, venue-map, and payout-ledger tables).
license: MIT
metadata:
  author: planetscale
  source: https://github.com/planetscale/database-skills (skills/postgres)
  vendored: "trimmed — generic-Postgres subset; PlanetScale-product references removed"
  version: "1.0.0"
---

# Postgres

Generic PostgreSQL craft for designing and evolving tables. Vendored (MIT) from
PlanetScale's database-skills, trimmed to the provider-agnostic subset — see
`LICENSE` for attribution.

> **Project note (riviera-sunbed-booking):** hosting is decided — local dev runs
> **self-hosted Postgres via Docker**, schema changes go through **Flyway** forward
> migrations only (invariant #12), and access is **JDBC / `JdbcTemplate`**, never
> JPA (invariant #1). Ignore any hosted-provider advice. This skill supplies the
> generic table/index craft; the project-specific rules — the availability
> `UNIQUE(set_id, booking_date)` constraint + `SELECT … FOR UPDATE` /
> `INSERT … ON CONFLICT` claim (invariant #2) — live in `CLAUDE.md` and are enforced
> by `riviera-review-overlay`. Pair this skill with `riviera-plan-doc` at plan time.

## Generic Postgres

| Topic                  | Reference                                              | Use for                                                   |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Schema Design          | [references/schema-design.md](references/schema-design.md)           | Tables, primary keys, data types, foreign keys            |
| Indexing               | [references/indexing.md](references/indexing.md)                     | Index types, composite indexes, performance               |
| Index Optimization     | [references/index-optimization.md](references/index-optimization.md) | Unused/duplicate index queries, index audit               |
| Partitioning           | [references/partitioning.md](references/partitioning.md)             | Large tables, time-series, data retention                 |
| Query Patterns         | [references/query-patterns.md](references/query-patterns.md)         | SQL anti-patterns, JOINs, pagination, batch queries       |
| Optimization Checklist | [references/optimization-checklist.md](references/optimization-checklist.md) | Pre-optimization audit, cleanup, readiness checks  |
| MVCC and VACUUM        | [references/mvcc-vacuum.md](references/mvcc-vacuum.md)               | Dead tuples, long transactions, xid wraparound prevention |
| MVCC Transactions      | [references/mvcc-transactions.md](references/mvcc-transactions.md)   | Isolation levels, serialization errors, locking semantics |

## Operations and Architecture (reference for later)

| Topic                  | Reference                                                       | Use for                                                      |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Process Architecture   | [references/process-architecture.md](references/process-architecture.md)     | Multi-process model, connection handling, aux processes      |
| Memory Architecture    | [references/memory-management-ops.md](references/memory-management-ops.md)   | Shared/private memory layout, OS page cache, OOM prevention  |
| WAL and Checkpoints    | [references/wal-operations.md](references/wal-operations.md)                 | WAL internals, checkpoint tuning, durability, crash recovery |
| Replication            | [references/replication.md](references/replication.md)                       | Streaming replication, slots, sync commit, failover          |
| Storage Layout         | [references/storage-layout.md](references/storage-layout.md)                | PGDATA structure, TOAST, fillfactor, tablespaces             |
| Monitoring             | [references/monitoring.md](references/monitoring.md)                         | pg_stat views, logging, pg_stat_statements, host metrics     |
| Backup and Recovery    | [references/backup-recovery.md](references/backup-recovery.md)              | pg_dump, pg_basebackup, PITR, WAL archiving                  |

## How it fits our schema decisions

The schema-design guidance aligns with choices already locked here — keep it in mind:

- **`TIMESTAMPTZ`, never `TIMESTAMP`** — matches invariant #6 (store UTC instants).
- **`CHECK (col IN (…))` over native `ENUM`** — ideal for the JDBC-only stack; store
  status/state columns (`booking_status`, `availability_state`, `pool`, …) as `TEXT`
  + a `CHECK`, not a Postgres enum type.
- **Money is `BIGINT` minor units** (invariant #5) — never `NUMERIC`/float for amounts.
- **Index every foreign-key column** (Postgres does not auto-create these).
- Be deliberate with `ON DELETE CASCADE` — the **payout ledger is append-only and
  auditable** (invariant #9); prefer reversal rows over cascading deletes there.
