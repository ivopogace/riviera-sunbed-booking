# Concurrency & Locking

> **Project tie-in.** Invariant #2 (a set is held by at most one party per `(set, date)`) is
> fundamentally a concurrency problem, and the booking/payment flows add more. This is the
> reference for the locking and claim techniques behind them. JDBC-only stack: these run via
> `JdbcClient`/`JdbcTemplate` with explicit SQL. Attribution at the bottom.

## 1. Keep transactions short — never hold a lock across a network call

The cardinal rule for a payment app. Do external I/O (a Stripe charge/refund, any HTTP call)
**outside** the transaction; the DB transaction is a short, final state write. A lock held
across a 2–5 s API call blocks every contending request for that whole window.

```sql
-- ANTIPATTERN: lock held for the entire API round-trip
begin;
  select * from booking where id = :id for update;
  -- application calls the payment API here (seconds) ...
  update booking set status = 'CONFIRMED' where id = :id;
commit;
```

```sql
-- CORRECT: charge first (idempotency key, invariant #8), THEN a millisecond txn
-- application: gateway.charge(..., idempotencyKey)  // outside any txn
begin;
  update booking
     set status = 'CONFIRMED', payment_id = :pid
   where id = :id and status = 'AWAITING_PAYMENT';   -- guarded, idempotent
commit;
```

Guard runaway statements per-transaction: `SET LOCAL statement_timeout = '5s';`. This pairs
with invariant #8 (the gateway/webhook is the source of truth) — the DB write is tiny and
idempotent, never the place we wait on Stripe.

## 2. The claim — atomic `INSERT … ON CONFLICT` (the invariant-#2 mechanism)

A claimed `(set, date)` is the **existence** of a row; the `UNIQUE(set_id, booking_date)`
index is the arbiter. No `SELECT … FOR UPDATE` is needed because the row's *creation* is the
claim (see `JdbcAvailabilityClaim`).

```sql
insert into set_availability (set_id, booking_date, state)
values (:setId, :date, 'BOOKED_ONLINE')
on conflict (set_id, booking_date) do nothing;   -- rows-affected: 1 = won, 0 = lost
```

Use `SELECT … FOR UPDATE` instead when you must **lock an existing row** to mutate it under
contention (e.g. transitioning a row's state). For claiming a not-yet-existing slot,
`ON CONFLICT` is simpler and lock-order-free.

## 3. `FOR UPDATE SKIP LOCKED` — worker queues / outbox

When multiple workers pull from a table (future use here: payout-batch jobs, a domain-event
outbox, refund/retry queues), plain `FOR UPDATE` serializes them — each worker waits for the
previous. `SKIP LOCKED` lets each worker grab the next *unlocked* row, so they run in
parallel without ever double-claiming a job (documented ~10× worker throughput).

```sql
update job
   set status = 'processing', worker_id = :w, started_at = now()
 where id = (
        select id from job
         where status = 'pending'
         order by created_at
         limit 1
         for update skip locked)
returning *;
```

Claim + state change in one atomic statement — no window for two workers to take the same row.

## 4. Advisory locks — application-level coordination, no dummy lock table

For "only one runner at a time across all instances" tasks (e.g. the weekly BKT payout
report, a scheduled reconciliation), don't invent a `resource_locks` table. Use advisory
locks — purpose-built, no row overhead:

```sql
-- non-blocking: true => you hold it, false => another instance is running, skip
select pg_try_advisory_lock(hashtext('weekly-payout-report'));
-- ... do the work ...
select pg_advisory_unlock(hashtext('weekly-payout-report'));
```

Transaction-scoped variant auto-releases on commit/rollback (can't leak a lock):

```sql
begin;
  select pg_advisory_xact_lock(hashtext('daily-reconciliation'));
  -- ... work ...
commit;
```

Prefer `pg_try_advisory_lock` for scheduled jobs so a second instance skips instead of
queueing.

## 5. Prevent deadlocks — consistent lock order, or one atomic statement

Deadlocks arise when two transactions take locks in **different orders** (A: row1→row2; B:
row2→row1) and wait on each other forever.

- **Order locks deterministically:** `SELECT … FOR UPDATE … ORDER BY id` so every transaction
  acquires the same rows in the same sequence.
- **Or collapse multiple updates into one statement** (e.g. a `CASE` update over several ids)
  so the engine takes all locks atomically.
- **Observe:** enable `log_lock_waits`, tune `deadlock_timeout`; deadlock counts surface in
  `pg_stat_database`.

Our single-row `INSERT … ON CONFLICT` claim has **no** deadlock surface. The rule bites when a
slice writes **multiple** rows in one transaction (e.g. releasing several sets, a batch payout
posting) — order those writes by a stable key.

---

## Attribution

Adapted (MIT) from Supabase's `agent-skills` — `skills/supabase-postgres-best-practices`
(`lock-short-transactions`, the on-conflict claim, `lock-skip-locked`, `lock-advisory`,
`lock-deadlock-prevention`). Reframed for this project's JDBC-only stack and invariants #2/#8.
See `LICENSE` for the full notice.
