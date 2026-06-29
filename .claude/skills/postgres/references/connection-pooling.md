# Connection Pooling & Limits

> **Project tie-in.** The backend uses **HikariCP** (the Spring Boot default) in front of
> **self-hosted** Postgres. The pool size — not the thread count — is the app's real
> concurrency ceiling for database work; this is the reference behind the virtual-threads
> decision. Adapted (MIT) from Supabase agent-skills; pooler-product specifics
> (Supavisor / PgBouncer modes) are excluded — for v1 we pool **in-process** with Hikari.

## Why pool at all

Each Postgres backend connection is a server process costing ~1–3 MB RAM. Opening one per
request collapses under load (500 concurrent users → hundreds of backends → memory
exhaustion). A pool keeps a small set of warm connections and shares them, so many concurrent
requests run over a handful of real connections.

## The pool is your concurrency ceiling — read this before reaching for virtual threads

With **blocking JDBC**, every DB call holds a pool connection for its whole duration. If the
pool has 10 connections, at most **10 DB statements run at once** no matter how many threads
(platform *or* virtual) you spawn — extra callers just queue for a connection. Therefore:

- Raising thread count / enabling `spring.threads.virtual.enabled` **without** raising the
  pool only moves the wait from the thread pool to the connection pool — it adds **no** DB
  throughput, and can mask backpressure.
- Size the pool deliberately and **measure** before assuming threads are the bottleneck.

## Sizing the Hikari pool

HikariCP's own guidance (consistent with the classic formula):

```
maximum-pool-size ≈ (core_count × 2) + effective_spindle_count
```

For a small SSD-backed instance that's ~**10** — and that is HikariCP's default, a fine start
for v1. **Bigger is usually worse**: an oversized pool causes context-switch and lock
contention *on the database*, not more throughput. Set it explicitly
(`spring.datasource.hikari.maximum-pool-size`) rather than guessing large.

## Server-side limits (self-hosted Postgres)

- `max_connections` must comfortably exceed (Σ all app instances' pool sizes) + admin
  headroom. Theoretical ceiling ≈ `RAM_MB / ~5 MB per connection − reserved`, but **100–200 is
  plenty** for v1 — prefer a *small pool* over a *large `max_connections`*.
- `work_mem` is per-operation, not per-connection-total: keep `work_mem × max_connections`
  well under ~25% of RAM to avoid OOM under concurrency.

## Observe

```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

Watch `idle in transaction` — that is the "don't hold a connection across a network call"
smell (a transaction left open around a Stripe/HTTP round-trip; see
`concurrency-and-locking.md` §1). It pins pool connections and starves everyone else.

## Future: an external pooler

If we ever outgrow per-instance Hikari pools (many app instances × small pools collectively
exhausting `max_connections`), put an external **transaction-mode** pooler (PgBouncer) in
front of Postgres. Not needed for v1 — recorded so the option is on the table. Note:
transaction-mode pooling disables server-side prepared statements / session state, which the
JDBC driver must be configured for.

---

## Attribution

Adapted (MIT) from supabase/agent-skills (`skills/supabase-postgres-best-practices`):
`conn-pooling`, `conn-limits`, `conn-idle-timeout`. Reframed for this project's in-process
HikariCP + self-hosted Postgres stack; pooler-product (Supavisor/PgBouncer) specifics excluded.
See `LICENSE`.
