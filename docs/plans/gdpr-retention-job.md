# GDPR Retention Job (Slice 2 of #101 [D5]) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use `- [ ]` for tracking.

> **Riviera discipline baked in:** the Availability & concurrency, Spring-Modulith, and Payment & payout
> sections are first-class. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Guest-contact PII whose statutory-retention basis has **expired** is scrubbed automatically by a
scheduled sweep — reusing Slice 1's tombstone scrub — while every booking / payment / payout financial
record stays untouched (invariant #9). The retention **period is configuration**, not a hardcoded legal
number, and the job ships **disabled** so nothing is erased until ops enables it with a counsel-set window.

**Architecture:** The one significant decision is the **direction of the cross-module read**. The retention
basis is booking recency, which `booking` owns — but `booking` already depends on `customer::api` +
`customer::vocabulary`, so a `customer → booking::api` call would close a **Modulith cycle** and fail
`ApplicationModules.verify()`. The fix is the repo's established dependency inversion: `customer` declares
the driven port **`customer.spi.GuestBookingHistory`** and **`booking` implements it** in `adapter/out`
(exactly the shape of `venue.spi.BookingPresence` ← `booking.adapter.out.JdbcBookingPresence`, #172).
Compile-time edge stays `booking → customer` (acyclic); the runtime call goes `customer → booking`.
`booking` answers a **fact** (which of these guests still has a booking on/after date D); `customer` owns the
**policy** (the window) and the **scrub** — matching `RESPONSIBILITIES.md` (`booking` Not-My-Job: "storing
guest contact details → `customer`").

**Persistence:** JDBC only (invariant #1). **No Flyway migration** — the scrub SQL, the `erased_at` tombstone
marker (V30) and the serving index (`booking_customer_id_idx`, V5) all already exist; the slice adds only
`SELECT`/`UPDATE` statements to existing adapters. (V31 is verified free if one becomes necessary — see R-10.)

**Source of intent:** GitHub issue **#101** (`[D5] GDPR / legal + backups`, parent #93 item 8), **Slice 2**
of its agent-doable erasure/retention sub-work. Slice 1 (right-to-erasure) shipped as PR #316 / `bad4697` —
plan doc `docs/plans/gdpr-erasure.md`, decision record `docs/adr/ADR-0010-erasure-pseudonymize-in-place.md`.
Slice 3 (checkout privacy/terms links), the legal texts, the Paysera/Hetzner DPAs and the backup/PITR
hosting cutover remain **out of scope — human-gated / separate epic**.

**Skills consulted** (`riviera-sdlc` Skill-routing gate output):
- `riviera-sdlc` — issue-intake grill gate; caught that #101 was **closed** by Slice 1's close-out despite its
  own comment saying it stays open (reopened before planning), and that #307 is the only in-flight PR (no SQL).
- `riviera-plan-doc` — plan structure + the mandatory sections.
- `riviera-modulith` — **the load-bearing correction**: the retention-basis read is a cross-module *driven*
  port, so it lives in `customer/spi` (`@NamedInterface("spi")`) implemented by `booking`, **never** in
  `booking/api` (which cycles). Also: the sweep's own driving port stays **internal** in
  `customer/application` (only its own `adapter/in` scheduler calls it), and `customer` gains its first
  `adapter/in` — allowed by the ADR-0007 full template (it graduated thin → full at #111).
- `riviera-java-conventions` — `record` config properties + plain application-layer value (the
  `RequestProperties → RequestWindows` pattern), package-private `@Service`/adapter, `JdbcClient` text-block
  SQL with named params, `Optional`/typed returns, SLF4J parameterized logging with **no PII** (§10,
  invariant #7), one-line-or-no inline comments (§6c). Also caught the type trap in R-4: the window must be
  a `java.time.Period` (`P10Y`), **not** a `Duration` — ISO-8601 durations have no year/month unit.
- `postgres` — **no migration needed**: the booking-recency probe is served by the existing
  `booking_customer_id_idx` (V5:52); the candidate scan on `customer` is a bounded (`LIMIT`) scan of a small
  v1 table. A partial index on `customer (updated_at) WHERE erased_at IS NULL` is deliberately **deferred**
  until the table justifies it (documented in Open questions, not silently skipped).
- `codebase-design` — the candidate read + the by-id scrub go onto the **existing** `AccountErasureStore`
  port, whose stated intent is already "a single port spanning every PII-bearing `customer` table, so what
  erasure touches lives in exactly one adapter". A second retention-only port next to it would be a shallow
  seam with one adapter and no variation.
- `domain-modeling` — new glossary terms (*Retention basis*, *Retention window*, *Retention sweep*) →
  `CONTEXT.md`. **No new ADR**: the tombstone-vs-delete decision is already ADR-0010, and the spi inversion
  is neither surprising nor hard to reverse (it is ADR-0007's documented pattern, third instance) — it fails
  all three of `domain-modeling`'s ADR tests.

**Branch:** `feature/gdpr-retention-job` (created off `main` at `bad4697`; **local session — a real branch**).

---

## Acceptance criteria (testable)

> Written at the inner hexagon (domain terms), each naming a test class.

- [x] **AC-1 (expired basis → scrubbed):** Given a live guest `customer` row older than the retention window
  whose most recent booking is **before** the retention cutoff, when `ExpireGuestContacts.sweep()` runs, then
  that row's `email` becomes a deterministic non-PII tombstone, `full_name`/`phone` become `'ERASED'`, and
  `erased_at` is set. *Pinned by:* `ExpireGuestContactsServiceTest.scrubsGuestWhoseRetentionBasisExpired` +
  `GuestContactRetentionIT.scrubsExpiredGuestContactAndLeavesBookingPaymentAndPayoutUntouched` (real Postgres).
- [x] **AC-2 (live basis → retained):** Given a guest whose most recent booking is **on or after** the
  retention cutoff, when the sweep runs, then the row is untouched (`erased_at` still `NULL`, PII intact) —
  including a booking exactly **on** the cutoff date (boundary is inclusive-retain). *Pinned by:*
  `ExpireGuestContactsServiceTest.retainsGuestWithBookingOnTheCutoffDate` +
  `GuestContactRetentionIT.retainsGuestWhoseBookingIsStillInsideTheWindow`.
- [x] **AC-3 (invariant #9 — financial records untouched):** Given an expired guest with a `CONFIRMED`
  booking, a `payment` row and a `payout_ledger_entry`, when the sweep scrubs the contact, then all three
  rows are byte-for-byte unchanged and the `booking.customer_id` FK still resolves to the tombstoned row.
  *Pinned by:* `GuestContactRetentionIT.scrubsExpiredGuestContactAndLeavesBookingPaymentAndPayoutUntouched` —
  AC-1 and AC-3 are one test: the scrub and the survival of the financial rows are the same transaction.
- [x] **AC-4 (account-linked contacts are never swept):** Given a guest `customer` row whose email matches a
  **live** (`erased_at IS NULL`) `customer_account`, when the sweep runs, then that row is not a candidate and
  is untouched — the job never erases a signed-up customer's contact. *Pinned by:*
  `GuestContactRetentionIT.skipsGuestContactClaimedByALiveAccount`.
- [x] **AC-5 (idempotent):** Given an already-tombstoned guest row (`erased_at` set), when the sweep runs
  again, then it is not re-scrubbed, `erased_at` is unchanged, and the run reports 0 scrubbed. *Pinned by:*
  `ExpireGuestContactsServiceTest.sweepIsIdempotent` + `GuestContactRetentionIT.doesNotRescrubTombstonedRows`.
- [x] **AC-6 (bounded batch):** Given more expired candidates than the configured batch size, when one sweep
  runs, then at most `batchSize` rows are scrubbed and the run reports that count (the rest are picked up on
  the next run). *Pinned by:* `ExpireGuestContactsServiceTest.scrubsAtMostOneBatchPerRun`.
- [ ] **AC-7 (disabled by default):** Given the default configuration (`customer.retention.enabled` unset),
  when the application context starts, then **no** retention scheduler bean exists — nothing can sweep until
  ops opts in. *Pinned by:* `GuestContactRetentionSchedulerConfigTest` (`@SpringBootTest` slice asserting the
  bean is absent by default and present with `customer.retention.enabled=true`).
- [x] **AC-8 (window is configuration, reasoned in `Europe/Tirane`):** Given a fixed `Clock` and
  `customer.retention.window=P2Y`, when the sweep computes its cutoff, then the cutoff is *today in
  `Europe/Tirane`* minus 2 years — never the JVM default zone, never a hardcoded period (invariant #6).
  *Pinned by:* `ExpireGuestContactsServiceTest.derivesCutoffFromConfiguredWindowInTiraneZone`.
- [x] **AC-9 (boundaries stay acyclic):** Given the new cross-module read, when the structural net runs, then
  `customer`'s `allowedDependencies` is still `{}`, `booking` declares `customer::spi`, and no cycle exists.
  *Pinned by:* `ModularityTests.verifiesModularStructure` + `PackageShapeArchitectureTests` +
  `PublishedSurfacePlacementArchitectureTests`.

## Non-goals

- **Sweeping `customer_account` rows / dormant accounts.** Confirmed guests-only (2026-07-25). Scrubbing an
  account is de-facto account deletion, which needs advance notice by email — and the mailer is still mocked
  (`SmtpMailer` throws; real SMTP deferred to **#255**), so notice cannot be sent. Revisit after #255.
- **Any new HTTP endpoint** — no admin "run sweep now" surface. It would re-arm the two full-suite traps
  (`WebSliceStubs` bean, `PayoutModuleTest` `@MockitoBean`) for no Slice-2 value; ops enables the schedule.
- **Choosing the retention-period *value*.** Counsel's call; the slice ships the mechanism, a documented
  knob, and a deliberately-inert default.
- **A Flyway migration** — see Persistence. Including an `erasure_reason` column to distinguish
  request-erasure from retention-erasure: the #100 structured log carries the reason and the runbook's
  re-erase-on-restore replay keys on `erased_at`, so the column earns nothing.
- **Hard-deleting anything** — ADR-0010 stands: tombstone in place, never delete (booking FKs are
  `ON DELETE RESTRICT`; the payout ledger must stay auditable, invariant #9).
- **Back-filling / retro-scrubbing historic rows on deploy** — the sweep reaches them on its own cadence
  once enabled.
- **#317** (explicit CUSTOMER matcher for the other `POST /api/me/**` endpoints) — separate pre-existing
  follow-up, untouched here.
- **Slice 3 (checkout privacy/terms links), the legal texts, DPAs, sh.p.k. registration, Paysera KYC, and
  the Hetzner backup/PITR + hosting cutover** — human-gated / the deferred ADR-0004 epic.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. No existing surface is retired: Slice 1's `/api/me/erasure` and
`/api/admin/erasure` are untouched, and the sweep adds a background path alongside them.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Modulith **cycle**: the natural `customer → booking::api` read closes a 2-cycle (`booking` already declares `customer::api` + `customer::vocabulary`), failing `ApplicationModules.verify()` | high (if planned naively) | high | Invert it: port in `customer/spi`, implemented by `booking/adapter/out`; grant `customer::spi` to `booking` only. `customer` keeps `allowedDependencies = {}`. AC-9 pins it | Ivo | **resolved** (Phase 0) — structural net green, `customer` still `{}` |
| R-2 | **Over-erasure** — scrubbing a contact still within its retention basis; irreversible (tombstone, no undo) | med | high | Ships `enabled=false`; window is counsel-set config; three independent gates (row age **and** no booking on/after cutoff **and** no live account with that email); inclusive-retain boundary (AC-2); bounded batch; `GuestContactRetentionIT` | Ivo | open |
| R-3 | The `@Scheduled` sweep fires during the default-profile test suite and perturbs timing windows (the #98/#122 full-suite lesson) — `@EnableScheduling` is **already global** via `BookingRequestConfig` (not profile-gated), so a new `@Scheduled` runs in every profile | med | med | `@ConditionalOnProperty("customer.retention.enabled")` on the scheduler → the bean does not exist in any default-profile test; plus `initial-delay` default `PT5M`. AC-7 | Ivo | open |
| R-4 | `Duration` cannot parse a year/month window (`P10Y` fails; ISO-8601 durations have no year unit) → a silent binding failure or a wrong window | med | high | The window is a **`java.time.Period`**, bound from an ISO string; the sweep-interval/initial-delay stay `Duration`. Pinned by AC-8's fixed-clock test | Ivo | open |
| R-5 | Candidate scan degrades as `customer` grows (no index on `erased_at`/`updated_at`) | low | low | `LIMIT :batchSize` + `ORDER BY id` bounds every run; v1 table is small. Partial index deferred, recorded in Open questions (not silently dropped) | Ivo | open |
| R-6 | The window value itself is a **legal** determination the code must not invent | high | high | Ship the mechanism + an inert default (`P10Y`, longer than any plausible statutory period) **and** `enabled=false`; runbook says "set per counsel". Deferred to counsel, tracked in Open questions | counsel | open |
| R-7 | A new **edge** dependency re-arms the full-suite-only traps (`PayoutModuleTest` `@MockitoBean` set, `WebSliceStubs`) — the class that reddened Slice 1's first CI run | low | med | Non-goal: no controller, no edge bean. The only new cross-module edge is `booking → customer::spi`, and `PayoutModuleTest` is the repo's only `@ApplicationModuleTest`, bootstrapping neither module's adapters. Re-check before the PR | Ivo | open |
| R-8 | A returning tourist whose contact was scrubbed is no longer recognised at checkout | low | low | Accepted + documented: `JdbcCustomerDirectory.findOrCreate` is `INSERT … ON CONFLICT (email)`, so a scrubbed row's email no longer matches and a **fresh** guest row is created — checkout is unaffected. Recorded as an Assumption | Ivo | open |
| R-9 | Staff daily view / old booking detail shows `ERASED` for a swept guest | low | low | Accepted — identical to Slice 1's erasure behavior, and by construction only for bookings older than the retention window. No code change | Ivo | open |
| R-10 | Flyway collision if a migration turns out to be needed after all | low | high | Plan is **zero migrations**. `V31` verified free on `main` (latest is `V30`) and unclaimed by the only open PR (**#307**, frontend `tar` bump, no SQL); whoever merges second renumbers | Ivo | mitigated |
| R-11 | Boundary leak — retention **policy** (the window) drifting into `booking`, or scrub SQL leaving `customer` | low | med | `booking` answers a pure fact (`withBookingOnOrAfter`), holds no window and no `Period`; all scrub SQL stays in `customer/adapter/out`. §4a table + RV-BE-11 re-check | Ivo | open |

## Open questions / Assumptions

- **Open question:** the **retention-period value** (`customer.retention.window`) and the decision to enable
  the job in prod are legal/ops input, not code. The slice ships `enabled=false` + an inert `P10Y` default and
  documents both in `docs/runbooks/data-erasure.md`. — *Owner:* counsel · *Resolves by:* outside this slice
  (the runbook line replaces Slice 1's `<counsel-TBD>` marker with "configurable, set per counsel").
- **Open question:** whether `customer` warrants a partial index `(updated_at) WHERE erased_at IS NULL` for
  the candidate scan. Deferred — the bounded `LIMIT` makes it a non-issue at v1 volume; revisit (with a
  migration) if the sweep ever shows up in slow-query logs. — *Owner:* Ivo · *Resolves by:* post-launch.
- **Assumption (confirmed 2026-07-25):** the sweep targets **guest `customer` rows only**; `customer_account`
  rows are never touched by it.
- **Assumption (confirmed 2026-07-25):** the job ships **disabled** (`customer.retention.enabled=false`).
- **Assumption:** a guest row with **no bookings at all** is swept once its own row age exceeds the window —
  there is no retention basis to protect it. Intentional, and it is the abandoned-checkout cleanup case.
- **Assumption:** **any** booking status (including `CANCELLED`/`EXPIRED`/`NO_SHOW`) counts as a retention
  basis — each still produced a financial/audit record. Mirrors `BookingPresence`'s "any booking row, any
  status" precedent.
- **Assumption:** the basis date is `booking.booking_date` (the day of service), not `created_at` — it is the
  later of the two for advance bookings, so it retains **longer** (the conservative choice).
- **Assumption (R-8):** a scrubbed guest simply gets a fresh `customer` row on their next checkout.

### Resolved

- **Cross-module seam (decided 2026-07-25):** `customer.spi.GuestBookingHistory` implemented by `booking`
  (**not** a `booking::api` port — that cycles). Batch shape `Set<CustomerId> withBookingOnOrAfter(
  Collection<CustomerId>, LocalDate)`, so one sweep batch is one round-trip and the window stays in `customer`.
- **Issue tracking (decided 2026-07-25):** #101 **reopened** (Slice 1's close-out closed it despite its own
  comment saying it stays open); Slice 2 hangs off #101 directly, no new issue.
- **No migration (decided 2026-07-25):** confirmed against V5/V30 — the marker, the tombstone SQL and the
  serving index already exist.
- **No new ADR (decided 2026-07-25):** ADR-0010 already records erasure = pseudonymize-in-place; the spi
  inversion is ADR-0007's documented pattern (third instance after `SetAvailabilityLookup` and
  `BookingPresence`).

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The sweep never writes `set_availability`, never claims or releases a
set, and never touches the beach map or the booking lifecycle. It **reads** `booking.booking_date` (a
retention fact) and **writes** only `customer` PII columns; `(set, date)` claims are irrelevant to a PII
scrub, and no booking row is mutated (invariant #9 / ADR-0010).

The only concurrency concern is **two sweeps overlapping** (a second instance, or a manual run alongside the
schedule). It is handled the same way the existing sweeps handle it — no distributed lock, by design
(improvement-plan D1/D3, single-instance posture): `fixedDelay` means a run never overlaps itself on one
instance, and every scrub is a guarded `UPDATE … WHERE id = :id AND erased_at IS NULL`, so at most one runner
can transition a given row and a double-run is a no-op (AC-5). Overlap with a **Slice-1 erasure** of the same
row is equally safe — whichever lands first sets `erased_at`; the other updates 0 rows.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing (full) | `Customer` | Owns tourist identity + (since #101 Slice 1) the right-to-erasure scrub of its own PII tables. The retention **window**, the candidate selection and the scrub are all mutations/policy over data it owns |
| M-2 | `booking` | existing (full) | `Booking` | Sole owner/reader of the `booking` table — so the "does this guest still have a recent booking?" **fact** is answered here, and only here |

**Cross-module named interfaces**

| # | Module surface | Port | Public types | Consumers / implementor |
|---|---|---|---|---|
| NI-1 | `customer.spi` (**new** `@NamedInterface("spi")`) | `GuestBookingHistory#withBookingOnOrAfter(Collection<CustomerId>, LocalDate) → Set<CustomerId>` | `CustomerId` (existing, `customer.vocabulary`) | **Implemented by** `booking` (`adapter/out/JdbcGuestBookingHistory`); **called by** `customer`'s own `ExpireGuestContactsService` |

Grant change: **`booking`'s** `allowedDependencies` gains `"customer::spi"` (it already has `customer::api`
+ `customer::vocabulary`). **`customer`'s** stays `{}` — it declares the port, it does not depend on booking.
Least-privilege holds: no other module is granted `customer::spi`.

Internal (unpublished) additions, all inside `customer`: two methods on the existing `AccountErasureStore`
port (`expiredGuestCandidates`, `eraseGuestById`) implemented by the existing `JdbcAccountErasure` adapter;
the driving port `ExpireGuestContacts` + package-private `ExpireGuestContactsService` in `application/`; the
plain value `RetentionWindow` in `application/`; and `customer`'s first **`adapter/in`** (scheduler + config
+ properties) — the ADR-0007 full template allows it, and `customer` graduated thin → full at #111.

**Domain events (id-based payloads, invariant #11)**

N/A — no domain event. The sweep is a self-contained background command with no subscriber; a
`GuestContactErased` event would be speculative (Slice 1 made the same call for the same reason). Add one
only when a real listener appears.

### Module ownership (§4a)

| Capability (what the slice adds) | Owner module | Justification |
|---|---|---|
| The retention **window** (policy) + deciding which contacts have no live basis | `customer` | `customer` **Job**: owns tourist identity and, since Slice 1, "right-to-erasure … scrub-in-place of the account + guest-contact PII". Retention is the same PII-lifecycle concern over the same rows. On no other module's Not-My-Job list |
| Scrubbing (tombstoning) the guest contact row | `customer` | Same Job line; the SQL already lives in `customer/adapter/out/JdbcAccountErasure` |
| The **fact** "does this guest have a booking on/after date D" | `booking` | `booking` **Job**: owns bookings and their lifecycle — it is the only reader of the `booking` table. Explicitly **not** the window or the scrub: `booking` **Not My Job** — "Storing guest contact details → `customer`" |
| Running the sweep on a schedule | `customer` (`adapter/in`) | A driving adapter for `customer`'s own use case — the `AbandonedBookingScheduler` / `RequestSweepScheduler` precedent, each living in its own module's `adapter/in`. Not the platform edge: this is not login/session/role machinery (RV-BE-11) |
| Retaining `booking` / `payment` / `payout` rows unchanged | their own modules | The sweep never touches them. `payout` **Not My Job**: "the tourist's identity or contact → not sent to me" — which is why invariant #9's auditability is unaffected |

## Payment & payout (invariants #5, #8, #9, #10)

**No money moves** — no Stripe call, no refund, no commission math, no ledger write. The invariant-#9
interaction is the crux and is not a blank N/A: the sweep **explicitly does not touch** `payment` or
`payout_ledger_entry` rows, and does not modify `booking` rows either (only the `customer` row a booking's
`customer_id` FK points at). The payout ledger holds no PII by design (venue-ids, booking-ids, money), so
scrubbing contact PII cannot affect its exactly-once accrual or auditability. **AC-3** pins that all three
row kinds are byte-for-byte unchanged after a sweep, and that the `RESTRICT` FK still resolves.

## Angular — frontend surfaces touched

**N/A — backend-only.** The sweep is a background job with no user-facing surface; the Slice-1 self-service
"Danger zone" on the account page is unchanged.

## FE↔BE contract

**N/A — no contract change.** No endpoint is added, changed, or removed (see Non-goals: no admin trigger).

## Execution status

> Session-recovery anchor. Re-read this (plus the current `riviera-sdlc` reference file) after any compaction
> or in a fresh session before acting. Update in the same commit window as the change it records.

**Stage pointer:** `implement — Phases 0–1 done, Phase 2 next`

**Next action:** Start **Phase 2** — write the failing `GuestContactRetentionSchedulerConfigTest` (AC-7:
no scheduler bean by default, present with `customer.retention.enabled=true`), then
`GuestContactRetentionScheduler` + the documented `customer.retention.*` block in `application.properties`.

**Deviations from the authored plan** (both decided during Phase 1, 2026-07-25):

1. **`CustomerRetentionProperties` + `CustomerRetentionConfig` moved Phase 2 → Phase 1.** The plan put them
   in Phase 2, but `ExpireGuestContactsService` is an unconditional `@Service` that requires a
   `RetentionWindow` bean — so at the Phase-1 boundary *every* `@SpringBootTest` in the repo failed to start
   with `NoSuchBeanDefinitionException` (observed, not theorised). Resequencing keeps each phase boundary
   green. **No design change**: same files, same packages, same ownership table; Phase 2 is now the scheduler
   + properties block + AC-7 only. The config is deliberately **unconditional** — only the scheduler that
   *fires* the sweep is gated, which is what makes the job inert rather than uninstantiable.
2. **AC-8's fixed instant strengthened** from the plan's `09:00Z` to **`2026-07-25T22:30:00Z`**. At 09:00Z the
   UTC and `Europe/Tirane` dates coincide, so the assertion would have passed even if the sweep reasoned in
   UTC or the JVM default zone — it would not actually have pinned invariant #6. At 22:30Z Tirane is already
   the 26th, so the expected cutoff (2024-07-26) is reachable *only* via the Tirane zone.

*Environment note (2026-07-25):* this is a **local Windows machine**, not a cloud session — `./gradlew` works
normally and Docker 29.4.3 is running, so the Testcontainers ITs **actually execute** (verified `skipped="0"`,
not silently skipped). Scoped-test discipline still applies; CI still owns the full suite.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `customer/spi` port + `booking` adapter + grant (the acyclic seam) | ✅ | `50e132e` |
| 1 — retention window + candidate read + by-id scrub + `ExpireGuestContacts` service | ✅ | `<phase-1>` |
| 2 — scheduler + documented defaults (ships disabled; properties+config landed in Phase 1) | | |
| 3 — docs: runbook `<counsel-TBD>` → configurable, glossary, RESPONSIBILITIES/CLAUDE.md, freshness | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate / Sonar-gate / red-CI finding; each fix re-enters at Implement.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`)**
- `customer/spi/package-info.java` — **create**: `@NamedInterface("spi")` + why the inversion exists.
- `customer/spi/GuestBookingHistory.java` — **create**: the driven port (one method).
- `booking/adapter/out/JdbcGuestBookingHistory.java` — **create**: package-private `JdbcClient` implementor.
- `booking/package-info.java` — **modify**: `allowedDependencies` += `"customer::spi"`.
- `customer/application/AccountErasureStore.java` — **modify**: add `expiredGuestCandidates(Instant, int)`
  and `eraseGuestById(CustomerId)`.
- `customer/adapter/out/JdbcAccountErasure.java` — **modify**: implement both (candidate `SELECT`, by-id
  tombstone `UPDATE`).
- `customer/application/RetentionWindow.java` — **create**: plain value `(Period window, int batchSize)`.
- `customer/application/ExpireGuestContacts.java` — **create**: internal driving port, `int sweep()`.
- `customer/application/ExpireGuestContactsService.java` — **create**: package-private `@Service`.
- `customer/adapter/in/CustomerRetentionProperties.java` — **create**: `@ConfigurationProperties("customer.retention")`.
- `customer/adapter/in/CustomerRetentionConfig.java` — **create**: binds the properties, exposes `RetentionWindow`.
- `customer/adapter/in/GuestContactRetentionScheduler.java` — **create**: `@ConditionalOnProperty` + `@Scheduled`.
- `../resources/application.properties` — **modify**: documented `customer.retention.*` block.

**Backend tests (`platform/src/test/java/ai/riviera/platform/`)**
- `customer/application/ExpireGuestContactsServiceTest.java` — **create**: unit, fake store + fake history +
  fixed `Clock` (AC-1, AC-2, AC-5, AC-6, AC-8).
- `customer/GuestContactRetentionIT.java` — **create**: Testcontainers end-to-end sweep against real Postgres
  (AC-1, AC-3, AC-4, AC-5) — also exercises `JdbcGuestBookingHistory`'s SQL through the real seam.
- `customer/GuestContactRetentionSchedulerConfigTest.java` — **create**: bean present/absent by property (AC-7).

**Docs**
- `docs/runbooks/data-erasure.md` — **modify**: replace the `<counsel-TBD>` marker; add a "Automated
  retention sweep" section (what it scrubs, the three gates, the knobs, how to enable).
- `CONTEXT.md` — **modify**: *Retention basis*, *Retention window*, *Retention sweep*.
- `RESPONSIBILITIES.md` — **modify**: one line under `customer` Job; one under `booking` (answers the
  retention-basis fact via `customer::spi`).
- `CLAUDE.md` — **modify**: `customer` + `booking` module-table rows.
- `docs/plans/gdpr-retention-job.md` — **modify**: Execution status at every phase boundary.

---

## Phase 0 — `customer/spi` port + `booking` adapter + grant (the acyclic seam)

**Files:** Create `customer/spi/package-info.java`, `customer/spi/GuestBookingHistory.java`,
`booking/adapter/out/JdbcGuestBookingHistory.java` · Modify `booking/package-info.java` · Test
`customer/GuestContactRetentionIT.java` (first assertion only).

- [x] **Step 1: Write the failing test** — in `GuestContactRetentionIT`, a first test that inserts two guests
  (one with a 2029 booking, one with a 2020 booking) and asserts the injected `GuestBookingHistory` returns
  only the recent guest for a 2026 cutoff:

```java
@Test
void reportsOnlyGuestsWithABookingOnOrAfterTheCutoff() {
    CustomerId recent = insertGuestWithBooking("recent@example.com", LocalDate.of(2029, 9, 1));
    CustomerId stale = insertGuestWithBooking("stale@example.com", LocalDate.of(2020, 9, 1));

    Set<CustomerId> live = history.withBookingOnOrAfter(List.of(recent, stale), LocalDate.of(2026, 1, 1));

    assertThat(live).containsExactly(recent);
}
```

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*GuestContactRetentionIT*"` → FAIL
  (`GuestBookingHistory` does not exist). *(Load `riviera-local-debug` before the session's first Gradle
  invocation.)* — **red confirmed**: `compileTestJava` failed, "package `ai.riviera.platform.customer.spi`
  does not exist".

- [x] **Step 3: Minimal implementation**

```java
// customer/spi/package-info.java
/**
 * <strong>Driven (service-provider) surface</strong> of the {@code customer} module (invariant #11) —
 * interfaces customer <em>needs another module to implement</em>, as opposed to {@code customer.api},
 * which holds the inbound ports other modules <em>call</em>.
 *
 * <p>Holds {@link GuestBookingHistory}, implemented by the {@code booking} module so the retention sweep
 * (#101 Slice 2) can ask "does this guest still have a recent booking?" without customer depending on
 * booking — which would cycle, since {@code booking} already depends on {@code customer::api}. Same shape
 * as {@code venue.spi.BookingPresence}. Grant {@code customer::spi} only to the implementing module.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.customer.spi;
```

```java
// customer/spi/GuestBookingHistory.java
public interface GuestBookingHistory {

    /**
     * Of these guests, which still have at least one booking dated on or after {@code cutoff}? Any status
     * counts (incl. terminal) — a cancelled or no-show booking still produced a financial record, so it is
     * still a retention basis. The window that produced {@code cutoff} belongs to {@code customer}; this
     * port answers only the fact. An empty {@code guests} yields an empty result without touching the DB.
     */
    Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff);
}
```

```java
// booking/adapter/out/JdbcGuestBookingHistory.java
@Repository
class JdbcGuestBookingHistory implements GuestBookingHistory {

    private final JdbcClient jdbc;

    JdbcGuestBookingHistory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff) {
        if (guests.isEmpty()) {
            return Set.of(); // an empty IN (...) list is invalid SQL
        }
        return Set.copyOf(jdbc.sql("""
                SELECT DISTINCT customer_id FROM booking
                WHERE customer_id IN (:guests) AND booking_date >= :cutoff
                """)
                .param("guests", guests.stream().map(CustomerId::value).toList())
                .param("cutoff", cutoff)
                .query((rs, n) -> new CustomerId(rs.getLong("customer_id")))
                .list());
    }
}
```

Then `booking/package-info.java`: append `"customer::spi"` to `allowedDependencies`, with a one-line comment
naming the inversion (mirroring the existing `venue::spi` comment).

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*GuestContactRetentionIT*"` → PASS
  (`tests="1" skipped="0" failures="0"` — Docker present, so the IT genuinely ran against real Postgres).
  End-of-phase structural net green: `ModularityTests` 1/1, `PackageShapeArchitectureTests` 4/4,
  `PublishedSurfacePlacementArchitectureTests` 10/10, `JdbcOnlyArchitectureTests` 2/2 — **AC-9 met**.

> End-of-phase regression: `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"
> --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*"` — the new
> `spi` surface must satisfy the structural net and the graph must stay acyclic (AC-9).

- [x] **Step 5: Generalization-audit pass** — `Grep` for other modules reaching for booking facts they can't
  legally call (`rg "booking\.(api|application)" platform/src/main/java --glob '!**/booking/**'`); confirm the
  only cross-module booking reads are the sanctioned `booking::api` `DailyTakings` and `venue.spi.BookingPresence`.
  Record in the log.

- [x] **Step 6: Commit** — `git commit -m "feat(customer): GuestBookingHistory spi port implemented by booking (#101)"`

- [x] **Step 7: Update plan-doc Execution status** in the same commit window.

---

## Phase 1 — retention window + candidate read + by-id scrub + `ExpireGuestContacts`

**Files:** Create `customer/application/RetentionWindow.java`, `ExpireGuestContacts.java`,
`ExpireGuestContactsService.java` · Modify `customer/application/AccountErasureStore.java`,
`customer/adapter/out/JdbcAccountErasure.java` · Test
`customer/application/ExpireGuestContactsServiceTest.java`, `customer/GuestContactRetentionIT.java`.

- [x] **Step 1: Write the failing test** — `ExpireGuestContactsServiceTest` against a hand fake of
  `AccountErasureStore` + `GuestBookingHistory` and a fixed `Clock` (the `AccountErasureServiceTest` pattern),
  covering AC-1, AC-2, AC-5, AC-6, AC-8:

```java
class ExpireGuestContactsServiceTest {

    private static final Clock FIXED =
            Clock.fixed(Instant.parse("2026-07-25T09:00:00Z"), ZoneOffset.UTC);

    private final FakeRetentionStore store = new FakeRetentionStore();
    private final FakeGuestBookingHistory history = new FakeGuestBookingHistory();
    private final ExpireGuestContactsService service =
            new ExpireGuestContactsService(store, history, new RetentionWindow(Period.ofYears(2), 500), FIXED);

    @Test
    void scrubsGuestWhoseRetentionBasisExpired() {
        CustomerId stale = store.liveGuest();
        history.lastBooking(stale, LocalDate.of(2021, 8, 1));

        assertThat(service.sweep()).isEqualTo(1);
        assertThat(store.erased(stale)).isTrue();
    }

    @Test
    void retainsGuestWithBookingOnTheCutoffDate() {
        CustomerId onBoundary = store.liveGuest();
        history.lastBooking(onBoundary, LocalDate.of(2024, 7, 25)); // exactly today − 2 years

        assertThat(service.sweep()).isZero();
        assertThat(store.erased(onBoundary)).isFalse();
    }

    @Test
    void derivesCutoffFromConfiguredWindowInTiraneZone() {
        store.liveGuest();
        service.sweep();

        assertThat(history.lastCutoff()).isEqualTo(LocalDate.of(2024, 7, 25));
    }
}
```

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ExpireGuestContactsServiceTest*"` →
  FAIL (types missing).

- [x] **Step 3: Minimal implementation**

```java
// customer/application/RetentionWindow.java — the application-layer value; no configuration type inside.
public record RetentionWindow(Period window, int batchSize) {
}
```

```java
// customer/application/ExpireGuestContacts.java — internal driving port (only customer's own adapter/in calls it).
public interface ExpireGuestContacts {

    /** Scrub up to one batch of guest contacts whose retention basis has expired; returns how many. */
    int sweep();
}
```

```java
// customer/application/ExpireGuestContactsService.java
@Service
class ExpireGuestContactsService implements ExpireGuestContacts {

    private static final Logger log = LoggerFactory.getLogger(ExpireGuestContactsService.class);
    private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

    private final AccountErasureStore store;
    private final GuestBookingHistory history;
    private final RetentionWindow retention;
    private final Clock clock;

    ExpireGuestContactsService(AccountErasureStore store, GuestBookingHistory history,
            RetentionWindow retention, Clock clock) {
        this.store = store;
        this.history = history;
        this.retention = retention;
        this.clock = clock;
    }

    @Override
    public int sweep() {
        LocalDate cutoff = LocalDate.now(clock.withZone(TIRANE)).minus(retention.window());
        List<CustomerId> candidates =
                store.expiredGuestCandidates(cutoff.atStartOfDay(TIRANE).toInstant(), retention.batchSize());
        if (candidates.isEmpty()) {
            return 0;
        }
        Set<CustomerId> stillInBasis = history.withBookingOnOrAfter(candidates, cutoff);
        int scrubbed = 0;
        for (CustomerId candidate : candidates) {
            if (!stillInBasis.contains(candidate) && store.eraseGuestById(candidate)) {
                scrubbed++;
            }
        }
        if (scrubbed > 0) {
            log.info("retention sweep scrubbed {} expired guest contact(s) with cutoff {}", scrubbed, cutoff);
        }
        return scrubbed;
    }
}
```

`AccountErasureStore` gains the two methods (candidate read + by-id scrub); `JdbcAccountErasure` implements
them. The candidate query applies the two `customer`-owned gates — row age and "no live account claims this
email" — leaving only the booking-recency gate to the spi port:

```sql
SELECT c.id FROM customer c
WHERE c.erased_at IS NULL
  AND c.updated_at < :olderThan
  AND NOT EXISTS (SELECT 1 FROM customer_account a
                  WHERE a.email = c.email AND a.erased_at IS NULL)
ORDER BY c.id
LIMIT :limit
```

```sql
UPDATE customer
SET email = 'erased+' || id || '@erased.invalid', full_name = 'ERASED', phone = 'ERASED',
    erased_at = NOW(), updated_at = NOW()
WHERE id = :id AND erased_at IS NULL
```

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*ExpireGuestContacts*"
  --tests "*GuestContactRetentionIT*"` → PASS — 12 tests, `skipped="0"`: `ExpireGuestContactsServiceTest` 7/7 and `GuestContactRetentionIT` 5/5 against real Postgres (the IT adds AC-3's "financial rows untouched" and AC-4's
  live-account skip).

> End-of-phase regression: `./gradlew test --tests "*customer*" --tests "*Customer*" --tests "*ModularityTests*"` —
> **green: 21 classes, 65 tests, 0 failures, 0 skipped.**

- [x] **Step 5: Generalization-audit pass** — the tombstone literals now appear in two `UPDATE`s in
  `JdbcAccountErasure`. Search `rg "erased\+" platform/src/main` → if both sites drift, extract the
  placeholder expression to a named constant (§6a). Record the decision in the log.

- [x] **Step 6: Commit** — `git commit -m "feat(customer): retention sweep for expired guest contacts (#101)"`

- [x] **Step 7: Update plan-doc Execution status** in the same commit window.

---

## Phase 2 — scheduler + config properties (ships disabled)

**Files:** Create `customer/adapter/in/CustomerRetentionProperties.java`, `CustomerRetentionConfig.java`,
`GuestContactRetentionScheduler.java` · Modify `application.properties` · Test
`customer/GuestContactRetentionSchedulerConfigTest.java`.

- [ ] **Step 1: Write the failing test** — `GuestContactRetentionSchedulerConfigTest` (AC-7): with default
  properties the context contains **no** `GuestContactRetentionScheduler` bean; with
  `customer.retention.enabled=true` it does.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*GuestContactRetentionSchedulerConfigTest*"`
  → FAIL.

- [ ] **Step 3: Minimal implementation**

```java
// customer/adapter/in/CustomerRetentionProperties.java
@ConfigurationProperties("customer.retention")
public record CustomerRetentionProperties(Period window, Integer batchSize) {

    private static final Period DEFAULT_WINDOW = Period.ofYears(10);
    private static final int DEFAULT_BATCH_SIZE = 500;

    public CustomerRetentionProperties {
        window = window == null ? DEFAULT_WINDOW : window;
        batchSize = batchSize == null ? DEFAULT_BATCH_SIZE : batchSize;
    }
}
```

`enabled`, `sweep-interval` and `initial-delay` are deliberately **not** in the record — they have no
programmatic reader (`@ConditionalOnProperty` and the `@Scheduled` placeholders consume them), matching
`AbandonedPaymentProperties`' documented rule.

```java
// customer/adapter/in/CustomerRetentionConfig.java
@Configuration
@EnableScheduling
@EnableConfigurationProperties(CustomerRetentionProperties.class)
class CustomerRetentionConfig {

    @Bean
    RetentionWindow retentionWindow(CustomerRetentionProperties properties) {
        return new RetentionWindow(properties.window(), properties.batchSize());
    }
}
```

```java
// customer/adapter/in/GuestContactRetentionScheduler.java
@Component
@ConditionalOnProperty(name = "customer.retention.enabled", havingValue = "true")
class GuestContactRetentionScheduler {

    private final ExpireGuestContacts expireGuestContacts;

    GuestContactRetentionScheduler(ExpireGuestContacts expireGuestContacts) {
        this.expireGuestContacts = expireGuestContacts;
    }

    @Scheduled(fixedDelayString = "${customer.retention.sweep-interval:PT6H}",
            initialDelayString = "${customer.retention.initial-delay:PT5M}")
    void sweep() {
        expireGuestContacts.sweep();
    }
}
```

The `@ConditionalOnProperty` is doing double duty: it is the ops safety switch **and** it keeps the bean out
of every default-profile test context (R-3 — `@EnableScheduling` is already global via `BookingRequestConfig`).

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*GuestContactRetention*"` → PASS.

> End-of-phase regression: `./gradlew test --tests "*customer*" --tests "*booking*" --tests "*ModularityTests*"`
> — the booking sweeps' timing windows must be unaffected.

- [ ] **Step 5: Generalization-audit pass** — confirm no other `@Scheduled` component relies on a foreign
  module's `@EnableScheduling` (`rg "@Scheduled|@EnableScheduling" platform/src/main/java`); note that
  `RequestSweepScheduler` does exactly that today and log it as an observation (out of scope, no change).

- [ ] **Step 6: Commit** — `git commit -m "feat(customer): retention sweep scheduler, disabled by default (#101)"`

- [ ] **Step 7: Update plan-doc Execution status** in the same commit window.

---

## Phase 3 — docs

**Files:** Modify `docs/runbooks/data-erasure.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, `CLAUDE.md`.

- [ ] **Step 1** — `docs/runbooks/data-erasure.md`: add an **"Automated retention sweep"** section (what it
  scrubs, the three gates, the knobs, how ops enables it) and replace the `<counsel-TBD …>` marker at line 66
  with the shipped reality: the app-side window is `customer.retention.window`, **configurable and set per
  counsel**, with the job disabled until then.
- [ ] **Step 2** — `CONTEXT.md` glossary: *Retention basis* (the fact that keeps a contact lawfully held —
  here, a booking on/after the cutoff), *Retention window* (the configured period), *Retention sweep* (the
  scheduled scrub of contacts with no live basis). No implementation detail in `CONTEXT.md`.
- [ ] **Step 3** — `RESPONSIBILITIES.md`: one line under `customer` **Job** (owns the retention window +
  sweep) and one under `booking` (answers the retention-basis fact via `customer::spi`, owns neither the
  window nor the scrub). `CLAUDE.md`: update the `customer` and `booking` module-table rows.
- [ ] **Step 4** — run `riviera-docs-freshness` over the branch range; also fix the stale
  `PackageShapeArchitectureTests` javadoc that still lists `customer` as a **thin** module (it graduated at
  #111 — non-failing, but it is now doubly wrong once `spi` + `adapter/in` land). Then `graphify update .`
  (docs changed — the post-commit hook is code-only).
- [ ] **Step 5: Commit** — `git commit -m "docs(#101): retention-sweep runbook + glossary + module notes"`
- [ ] **Step 6: Update plan-doc Execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-25 | Phase 1 — 2nd guest-tombstone `UPDATE` | the tombstone placeholder expression duplicated across the erasure and retention scrubs | `rg "erased\+" platform/src/main` | 3 — 1 javadoc, the guest `SET` clause, the account `SET` clause | **Extracted** the guest `SET` clause to `JdbcAccountErasure.GUEST_TOMBSTONE`, shared by `eraseGuestByEmail` (by email) and `eraseGuestById` (by id) so request-erasure and retention-erasure cannot drift on what "erased" means; only the `WHERE` differs. The **account** tombstone stays separate — different table, different columns (`password_hash` vs `full_name`/`phone`); merging it would be false sharing |
| 2026-07-25 | Phase 0 — new cross-module `spi` inversion | other modules reaching for `booking` internals instead of a published surface | `rg "ai\.riviera\.platform\.booking\.(api\|application\|domain\|adapter)" platform/src/main/java --glob '!**/booking/**'` | 1 — `payout/application/DailyTakingsService.java` → `booking.api.DailyTakings` | **No action.** The single hit is the sanctioned `booking::api` port (#171); no `application.*`/`adapter.*`/`domain` import exists. The spi inversion is now its 3rd instance (`SetAvailabilityLookup`, `BookingPresence`, `GuestBookingHistory`) — the pattern is consistent, nothing to generalize |

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1, AC-2, AC-5, AC-6, AC-8:** `./gradlew test --tests "*ExpireGuestContactsServiceTest*"` → green.
- [ ] **AC-1, AC-3, AC-4, AC-5:** `./gradlew test --tests "*GuestContactRetentionIT*"` → green (Docker
  present; the IT skips cleanly without a daemon, so CI is the authority).
- [ ] **AC-7:** `./gradlew test --tests "*GuestContactRetentionSchedulerConfigTest*"` → green.
- [ ] **AC-9:** `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"
  --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*"` → green.
- [ ] Regression: `./gradlew test --tests "*customer*" --tests "*booking*"` → green (the booking sweeps'
  timing windows unaffected).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1); all new persistence is `JdbcClient` + explicit SQL.
- [ ] **Availability** section justified N/A (never writes `set_availability`); no double-book surface (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; the retention-basis read is a `customer::spi` **driven** port implemented
  by `booking` (never a `booking::api` call — that cycles); `customer` keeps `allowedDependencies = {}`; no
  cross-module `application.*`/`adapter.*` imports; no speculative event (invariant #11).
- [ ] **Payment/payout**: N/A for money movement, but invariant #9 pinned by AC-3 (ledger/payment/booking untouched).
- [ ] Refund policy: N/A.
- [ ] Timezone: the cutoff is a `LocalDate` reasoned in `Europe/Tirane` from the injected UTC `Clock`;
  `erased_at` stays `TIMESTAMPTZ` (invariant #6).
- [ ] Booking codes never logged; the sweep log carries counts + the cutoff date only — no email, name, phone
  or booking code (invariant #7, `riviera-java-conventions` §10).
- [ ] **No Flyway migration** shipped, and the reason is stated (marker + index already exist, invariant #12);
  if one became necessary, `V31` was verified free and unclaimed.
- [ ] **Frontend**: N/A — backend-only; no endpoint, so no FE↔BE contract change.
- [ ] `PayoutModuleTest` / `WebSliceStubs` re-checked before the PR (R-7) — no new edge bean was introduced.
- [ ] Execution status at HEAD matches reality; findings register current.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an owner + issue).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
