# Admin-editable venue-change fee Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The venue-change fee becomes a stored platform setting an admin reads and writes
under `/api/admin/**`, charged by the payout listener from the row instead of the property,
with a change applying only to cancellations after the write.

**Architecture:** One `platform_setting` row behind one `payout` port
(`VenueChangeFeeSetting`), read at charge time rather than injected as an immutable bean —
that single change is what makes the amount editable, and every other file follows from it.
The property stays as the seed and the row-missing fallback, so a fresh database and a
hand-emptied table both answer the same 500. The setting is deliberately **not**
effective-dated (see *Open questions → Resolved*, and the ADR-0021 amendment this slice ships).

**Persistence:** JDBC only (invariant #1). New table `platform_setting` (Flyway `V55`), owned
and solely written by `payout`. No existing table changes; `payout_ledger_entry` is read-only
here.

**Source of intent:** GitHub issue #1037 (epic #1027, user story 31); ADR-0021 §5/§7.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
ADR-0021 §7 obliges this slice to an effective-dated schedule, which forced the
`AskUserQuestion` that settled the design) · `riviera-plan-doc` (this template — forced the
seam-per-AC line and the behavior-parity ledger for the retired property path) · `tdd` (each
phase red-green at the seams named below) · `riviera-review-overlay` (review gate — runs at
ready-for-review) · `riviera-docs-freshness` (**ran** at close-out over
`origin/main..HEAD`, findings recorded in the register) · `postgres` (`TEXT` + `CHECK` over a
native enum for `setting_key`, `BIGINT` minor units, `TIMESTAMPTZ`) · `riviera-modulith` (the
setting is an internal `application/` port implemented by `adapter/out`, not a published
surface — no module but `payout` reads it) · `riviera-java-conventions` (records for the
DTOs, `InvalidApiRequestException.parsing` at the conversion boundary, the named bound
constant instead of a magic number) · `riviera-stripe-payments` (the fee stays a non-negative
magnitude whose direction lives in the `FEE` entry type) · `codebase-design` (collapsed the
hypothetical `VenueChangeFeeService` — the controller talks to the port directly) ·
`riviera-frontend` (the editor joins the existing Venue changes tab rather than claiming a
new route) · `angular-developer` + angular-cli MCP (v22 `get_best_practices`: Signal Forms
for new forms, `@Service`, no explicit `standalone`/`OnPush`) · `riviera-tailwind` (the card
reuses `appCardGlass` and the console's token set, no new colours) · `playwright-cli` (the
mocked CI-safe suite gets the edit-the-fee spec) · `riviera-local-debug` (loaded before the
first `./gradlew`; scoped `--tests` runs only).

**Branch:** `claude/payout-venue-change-fee-setting-46g1i3` — the cloud session's designated
remote branch stands in for `feature/venue-change-fee-setting`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a stored fee of 500 EUR, when a `BookingCancelled` with
  `reason == VENUE_CHANGE` and a positive refund is handled, then the listener charges a `FEE`
  of exactly the stored amount, read at charge time. *Seam:*
  `payout.application.VenueChangeFeeSetting#current()` · *Pinned by:*
  `BookingCancelledPayoutListenerTest.chargesTheStoredFee`
- [ ] **AC-2:** Given no `platform_setting` row for the fee, when `current()` is read, then it
  answers the seed property amount (500 EUR) rather than failing. *Seam:*
  `payout.application.VenueChangeFeeSetting#current()` · *Pinned by:*
  `JdbcVenueChangeFeeSettingIT.fallsBackToTheSeedWhenTheRowIsMissing`
- [ ] **AC-3:** Given a posted `FEE` ledger row of 500, when the setting is changed to 700,
  then the posted row still reads 500 and the next charge reads 700. *Seam:*
  `payout.application.VenueChangeFeeSetting` + `payout.application.PayoutLedger` · *Pinned by:*
  `JdbcVenueChangeFeeSettingIT.aChangeNeverRepricesAPostedFee`
- [ ] **AC-4:** Given an authenticated platform ADMIN, when `PUT /api/admin/venue-change-fee`
  carries `{"amountMinor": 700}` and an `X-Audit-Reason`, then the response is `200` with the
  new amount and exactly one admin-audit row records the write with that reason. *Seam:*
  `PUT /api/admin/venue-change-fee` · *Pinned by:*
  `AdminVenueChangeFeeControllerIT.writesTheFeeAndLeavesAnAuditRow`
- [ ] **AC-5:** Given an authenticated OPERATOR who is not an admin, when the same `PUT` is
  sent, then the response is `403` and the stored amount is unchanged. *Seam:*
  `PUT /api/admin/venue-change-fee` · *Pinned by:*
  `AdminVenueChangeFeeControllerIT.refusesANonAdmin`
- [ ] **AC-6:** Given an admin, when the `PUT` carries a negative amount, a missing amount, or
  one above the stored bound, then the response is `400 INVALID_REQUEST` and the stored amount
  is unchanged. *Seam:* `PUT /api/admin/venue-change-fee` · *Pinned by:*
  `AdminVenueChangeFeeControllerIT.rejectsAnOutOfRangeAmount`
- [ ] **AC-7:** Given an admin, when `GET /api/admin/venue-change-fee` is read, then it answers
  the stored amount, its ISO currency and when it last changed. *Seam:*
  `GET /api/admin/venue-change-fee` · *Pinned by:*
  `AdminVenueChangeFeeControllerIT.readsTheStoredFee`
- [ ] **AC-8:** Given the Venue changes tab rendered with a fee of €5, when the admin types
  `7`, arms the change and confirms, then one `PUT` carries `700` and the card renders €7 from
  the response without re-fetching the report. *Seam:* the `AdminVenueChanges` component's
  rendered DOM over `HttpTestingController` · *Pinned by:*
  `admin-venue-changes.spec.ts` › `writes the fee and splices the response`
- [ ] **AC-9:** Given the fee editor, when the admin submits an empty, negative or
  above-bound amount, then a field error is shown and no request is sent. *Seam:* the
  `AdminVenueChanges` component's rendered DOM over `HttpTestingController` · *Pinned by:*
  `admin-venue-changes.spec.ts` › `refuses an out-of-range amount without calling the API`
- [ ] **AC-10:** Given the Venue changes tab with the fee card, when axe runs over it in both
  themes, then there are no violations and every token pair meets the contrast floor. *Seam:*
  the rendered tab · *Pinned by:* `admin-venue-changes.a11y.spec.ts`,
  `admin-venue-changes.contrast.spec.ts`
- [ ] **AC-11:** Given the mocked admin console, when an admin edits the fee end to end, then
  the request carries the new amount and the page renders it. *Seam:* the `/admin/venue-changes`
  route against mocked HTTP · *Pinned by:* `frontend/e2e/admin-venue-change-fee.spec.ts`

## Non-goals

- **No generic settings framework.** One table, one CHECK-constrained key, one port method
  pair. A second setting is a deliberate change to all three, not a registration.
- **No effective-dated fee schedule.** Settled below; ADR-0021 §7 is amended by this slice
  rather than satisfied by it.
- **No per-venue or tiered fee.** The fee stays flat and platform-wide (ADR-0021 §5).
- **No new admin tab.** The editor joins the existing Venue changes tab.
- **No change to which refunds earn a fee** (ADR-0021 §3/§4) and none to the ledger's shape.
- **No retroactive repricing** of posted `FEE` rows, and no backfill.

## Behavior-parity ledger

> The slice replaces the property-as-source-of-truth path from #1036.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| The fee amount comes from `riviera.payout.venue-change-fee-minor` | changed | The row is authoritative; the property is the seed and the row-missing fallback (issue #1037 asks for exactly this) |
| `VenueChangeFeeAmount` bean injected once into the listener | changed | The listener holds `VenueChangeFeeSetting` and reads `current()` inside the `VENUE_CHANGE` branch, so a write between two cancellations is seen |
| `PayoutVenueChangeFeeRate#perRefund()` answers the injected bean | changed | Answers `current()`, so the remodel preview quotes the stored amount |
| A negative property fails at startup | preserved | `VenueChangeFeeProperties`' compact constructor is untouched; `VenueChangeFeeAmount` keeps its own non-negative guard and gains the upper bound |
| The commit receipt snapshots the quoted fee onto `remodel_receipt_outcome.fee_minor` | preserved | Untouched — the receipt still reads back what the operator confirmed |
| Fee exempt from `payout_net_check`, idempotent per `UNIQUE (booking_id, entry_type)` | preserved | `V54` is untouched; no ledger migration here |
| The zero-refund and deferred-reversal positions of the fee charge in the listener | preserved | The branch keeps both positions; only the amount's source moves |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A write between a remodel commit and the async listener draining charges an amount the receipt did not quote | low | med | Accepted and documented: migration header, listener Javadoc, `RESPONSIBILITIES.md` §`payout`, ADR-0021 amendment. Closing it needs `cancelledAt` on a registry-persisted event; out of scope by decision | Ivo | open → documented in phase 4 |
| R-2 | `V55` collides with a migration claimed by an in-flight PR | low | high | Checked at plan time: `V54` is the newest on `main` and `list_pull_requests` returns no open PR. Re-check before phase 0; if taken, this slice renumbers | Ivo | open |
| R-3 | The listener reads the setting on every cancellation, adding a query to the money path | med | low | Single-row primary-key lookup on a table with one row; the listener already does two ledger queries in the same transaction | Ivo | open |
| R-4 | Two admins write the fee concurrently and one silently wins | low | low | Accepted: last write wins on a single-row `UPDATE`, and the audit trail records both. No optimistic token — the setting is one number changed rarely | Ivo | open |
| R-5 | A `FEE` charged from the fallback (row missing) is indistinguishable from one charged from the row | low | low | The migration seeds the row, so the fallback is only reachable by hand-deleting it; the adapter logs at WARN when it falls back | Ivo | open |
| R-6 | The new DTOs drift from the error contract | low | med | `InvalidApiRequestException.parsing` at the conversion boundary yields `400 INVALID_REQUEST`; no per-controller `@ExceptionHandler` (`ErrorContractArchitectureTests`) | Ivo | open |
| R-7 | Adding a write to a read-only report tab breaks its existing specs | med | low | The report's own specs are untouched by construction — the fee card is a sibling above the list; `.a11y`/`.contrast` pairs re-run | Ivo | open |

## Open questions / Assumptions

- **Assumption:** `V55` is free. *Owner:* Ivo · *Resolves by:* phase 0 (re-check `main` + open PRs).

### Resolved

- **Open question:** ADR-0021 §7 says #1037 "owes the rate an effective-dated schedule of its
  own". Does this slice ship one? — **Resolved by the user (2026-09-10, `AskUserQuestion`):
  no.** An effective-dated table alone cannot close the divergence window it was meant to
  close: `BookingCancelled` carries no timestamp, so the async listener would still resolve
  the rate "as of now" no matter how many rows the schedule held. Closing it properly needs
  `cancelledAt` added to a registry-persisted event payload, which is a larger change than the
  fee is worth. This slice therefore ships one current-value row, guarantees only that posted
  `FEE` rows never reprice, and **amends ADR-0021 §7** to record the finding so the next reader
  does not re-derive it.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice writes one `platform_setting` row and reads
`payout_ledger_entry`; no `set_availability` row is read or written, no booking is created or
cancelled by this code, and the beach map is untouched. The one concurrency question the slice
does raise (two admins writing the fee at once) is R-4 and is deliberately last-write-wins.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payout` | existing | `platform_setting` (new, sole writer) | `payout` already decides the fee amount (ADR-0021 §6) and posts the `FEE` entry; the stored amount is that decision made durable |

**Cross-module named interfaces (`api/` ports)**

No new published surface. `booking.spi.VenueChangeFeeRate` is unchanged in shape — only
`payout`'s implementation of it changes, from an injected bean to a port read.

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.spi` (existing, unchanged) | `VenueChangeFeeRate#perRefund()` | `booking.vocabulary.VenueChangeFee` | the remodel preview, via `RemodelClaims` |

**Internal port (not published — `payout.application`)**

| # | Port | Implemented by | Methods |
|---|---|---|---|
| IP-1 | `payout.application.VenueChangeFeeSetting` | `payout.adapter.out.JdbcVenueChangeFeeSetting` | `VenueChangeFeeAmount current()`, `StoredVenueChangeFee change(long minorUnits)` |

**Domain events**

None added or changed. `BookingCancelled` keeps its payload exactly (widening it was the
rejected half of the resolved open question above).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store the platform's venue-change fee | `payout` | `payout` Job: owns the ledger and what the platform owes a venue (invariant #9); ADR-0021 §6 already makes `payout` the module that "decides the amount". Not `venue` — its Not-My-Job covers platform-wide commercial terms; it owns the *per-venue* commission schedule, not a platform-wide fee |
| Read the fee at charge time | `payout` | Same module that posts the `FEE` entry; no boundary crossed |
| Expose the admin read/write surface | `payout` | Module-owned admin surface, like `AdminPayoutBatchController` and `AdminVenueChangeRefundsController`; role-gated under `/api/admin/**`, so invariant #13's venue-scoping exemption applies |
| Record who changed it and why | `audit` (unchanged) | The edge's `AdminAuditFilter` audits every mutating `/api/admin/**` request by construction — no instrumentation in this slice |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** unchanged — no payment state is read or written here.
- **Idempotency:** unchanged. The `FEE` row stays exactly-once per booking via
  `UNIQUE (booking_id, entry_type)`; a redelivered `BookingCancelled` that arrives after a fee
  change writes nothing, so the redelivery cannot reprice.
- **Money:** integer minor units + explicit ISO currency, stored as `BIGINT` + `CHAR(3)`
  (invariant #5). No float anywhere; the console parses euros to minor units through the
  existing `eurosToMinorUnits`.
- **Payout-ledger effect:** none directly. The ledger's arithmetic, entry types and CHECKs are
  untouched; only the amount a future `FEE` carries can now change.
- **Direction:** the stored amount is a non-negative magnitude; it deducts because its entry
  type is `FEE`, never because of a sign. Guarded by the table CHECK, the
  `VenueChangeFeeAmount` constructor, and the request DTO.
- **Refund policy applied:** unchanged (ADR-0005 / invariant #10).
- **Pinning tests:** `BookingCancelledPayoutListenerTest`, `JdbcVenueChangeFeeSettingIT`,
  `AdminVenueChangeFeeControllerIT`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-venue-changes.ts` | existing | standalone component | signals + `computed` | Signal Forms (`@angular/forms/signals`) for the fee editor |
| FE-2 | `admin/admin-venue-changes.service.ts` | existing | `@Service` | plain `HttpClient` read + write | — |
| FE-3 | `admin/admin.model.ts` | existing | wire types | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. The editor uses Signal Forms per the angular-cli MCP's v22 best-practices guide ("prefer
Signal Forms for new forms"), matching `admin-privacy.ts` and `operator/set-editor.ts`; the
sibling `admin-commissions.ts` predates that idiom and is deliberately left alone. The write is
a plain `HttpClient.put`, not `httpResource` — the guide's own tip is to avoid `httpResource`
for mutations. No new images, so `NgOptimizedImage` does not apply.

**Where it lives:** the fee card is a sibling above the report list on the existing Venue
changes tab, not a new route. That tab already reports what the fee has charged each venue, so
the lever and its consequences read on one page — and the console gains no tab for a single
number. Rejected: a new `Fees` tab in the Money group, which would split the two apart.

## FE↔BE contract

- **New endpoints:**
  - `GET /api/admin/venue-change-fee` → `200 {"amountMinor": 500, "currency": "EUR", "updatedAt": "2026-09-10T09:00:00Z"}`
  - `PUT /api/admin/venue-change-fee` with `{"amountMinor": 700}` → `200` with the same shape;
    `400 INVALID_REQUEST` out of range; `403` non-admin; `401` anonymous. Carries the optional
    `X-Audit-Reason` header the edge fence records.
- **Client typing:** a hand-written typed method on the existing `AdminVenueChangesService`,
  returning a `VenueChangeFeeView` declared in `admin.model.ts`. No `as any`.
- **Money/date on the wire:** amount as integer minor units + ISO currency; `updatedAt` as an
  ISO instant (invariant #6), rendered through the console's existing `admin-moment.ts`.

## Execution status

**Stage pointer:** `plan — awaiting approval`

**Next action:** get the plan approved, then start phase 0 by re-checking that `V55` is still
free on `main` and unclaimed by open PRs.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Table, port, JDBC adapter | | |
| 1 — Listener and rate read through the port | | |
| 2 — Admin read/write endpoint | | |
| 3 — Admin console fee card | | |
| 4 — e2e, docs, ADR-0021 amendment, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/resources/db/migration/V55__platform_setting.sql` — the table, its CHECKs and the seeded fee row
- `platform/src/main/java/ai/riviera/platform/payout/application/VenueChangeFeeSetting.java` — the internal port: read the current fee, change it
- `platform/src/main/java/ai/riviera/platform/payout/application/StoredVenueChangeFee.java` — the amount plus when it last changed
- `platform/src/main/java/ai/riviera/platform/payout/application/VenueChangeFeeAmount.java` — gains the upper bound mirroring the table CHECK
- `platform/src/main/java/ai/riviera/platform/payout/adapter/out/JdbcVenueChangeFeeSetting.java` — the `JdbcClient` implementation with the seed fallback
- `platform/src/main/java/ai/riviera/platform/payout/adapter/out/PayoutVenueChangeFeeRate.java` — answers the spi from the port instead of a bean
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/BookingCancelledPayoutListener.java` — reads the fee at charge time
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/AdminVenueChangeFeeController.java` — the role-gated read/write surface
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/VenueChangeFeeView.java` — the response DTO
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/SetVenueChangeFeeRequest.java` — the request DTO and its conversion guard
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/PayoutFeeConfig.java` — the property bean becomes the seed
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/VenueChangeFeeProperties.java` — Javadoc: seed and fallback, not the source of truth
- `platform/src/main/resources/application.properties` — the commented property line describes the seed
- `platform/src/test/java/ai/riviera/platform/payout/adapter/out/JdbcVenueChangeFeeSettingIT.java` — read, write, fallback, no-reprice, CHECK rejections
- `platform/src/test/java/ai/riviera/platform/payout/adapter/in/AdminVenueChangeFeeControllerIT.java` — the HTTP seam: read, write, role gate, audit row, validation
- `platform/src/test/java/ai/riviera/platform/payout/adapter/in/BookingCancelledPayoutListenerTest.java` — charges the stored amount
- `platform/src/test/java/ai/riviera/platform/payout/adapter/in/VenueChangeFeePropertiesTest.java` — the seed's guards, including the new bound
- `frontend/src/app/admin/admin-venue-changes.ts` — the fee card and its confirm-in-place editor
- `frontend/src/app/admin/admin-venue-changes.service.ts` — the fee read and write
- `frontend/src/app/admin/admin-venue-changes.service.spec.ts` — the two new calls
- `frontend/src/app/admin/admin-venue-changes.spec.ts` — render, edit, splice, validation
- `frontend/src/app/admin/admin-venue-changes.a11y.spec.ts` — axe over the tab with the card
- `frontend/src/app/admin/admin-venue-changes.contrast.spec.ts` — the card's token pairs
- `frontend/src/app/admin/admin.model.ts` — `VenueChangeFeeView`
- `frontend/src/app/app.routes.ts` — the tab's sign-in copy now names the fee
- `frontend/e2e/admin-venue-change-fee.spec.ts` — the mocked end-to-end edit
- `CLAUDE.md` — `platform_setting` on `payout`'s owned-tables row
- `CONTEXT.md` — the "Platform setting" glossary entry
- `RESPONSIBILITIES.md` — §`payout` names the settings read and the divergence window
- `docs/adr/ADR-0021-venue-change-fee-as-a-ledger-entry-type.md` — §5 and §7 amended
- `docs/plans/venue-change-fee.md` — deleted: #1036's plan doc retires at this close-out
- `docs/plans/venue-change-fee-setting.md` — this plan

---

## Phase 0 — Table, port, JDBC adapter

**Files:** Create `V55__platform_setting.sql`, `VenueChangeFeeSetting.java`,
`StoredVenueChangeFee.java`, `JdbcVenueChangeFeeSetting.java`,
`JdbcVenueChangeFeeSettingIT.java` · Modify `VenueChangeFeeAmount.java`

- [ ] **Step 0: Re-check the Flyway number** — `ls platform/src/main/resources/db/migration | sort -V | tail -3` on latest `main`, and re-run the open-PR check. `V55` free → proceed; taken → renumber this plan first.

- [ ] **Step 1: Write the failing test**

```java
@Test
void fallsBackToTheSeedWhenTheRowIsMissing() {
    jdbc.sql("DELETE FROM platform_setting WHERE setting_key = 'VENUE_CHANGE_FEE'").update();

    VenueChangeFeeAmount fee = setting.current();

    assertEquals(500L, fee.minorUnits());
    assertEquals("EUR", fee.currency());
}

@Test
void aChangeNeverRepricesAPostedFee() {
    ledger.charge(PayoutLedgerEntry.fee(new VenueId(venueId), bookingId, 500L, "EUR"));

    setting.change(700L);

    assertEquals(500L, postedFeeMinor(bookingId));
    assertEquals(700L, setting.current().minorUnits());
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*JdbcVenueChangeFeeSettingIT*"` → FAIL, `platform_setting` does not exist

- [ ] **Step 3: Minimal implementation**

```sql
-- V55__platform_setting.sql
CREATE TABLE platform_setting (
    setting_key  TEXT        NOT NULL PRIMARY KEY,
    amount_minor BIGINT      NOT NULL,
    currency     CHAR(3)     NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    CONSTRAINT platform_setting_key_check
        CHECK (setting_key IN ('VENUE_CHANGE_FEE')),
    CONSTRAINT platform_setting_amount_check
        CHECK (amount_minor >= 0 AND amount_minor <= 100000),
    CONSTRAINT platform_setting_currency_check
        CHECK (currency ~ '^[A-Z]{3}$')
);

INSERT INTO platform_setting (setting_key, amount_minor, currency, updated_at)
VALUES ('VENUE_CHANGE_FEE', 500, 'EUR', now());
```

```java
public interface VenueChangeFeeSetting {

	VenueChangeFeeAmount current();

	StoredVenueChangeFee change(long minorUnits);
}
```

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*JdbcVenueChangeFeeSettingIT*"` → PASS

- [ ] **Step 5: Generalization-audit pass**

- [ ] **Step 6: Commit** — `git commit -m "Store the venue-change fee as a platform setting (#1037)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Listener and rate read through the port

**Files:** Modify `BookingCancelledPayoutListener.java`, `PayoutVenueChangeFeeRate.java`,
`PayoutFeeConfig.java`, `VenueChangeFeeProperties.java`,
`BookingCancelledPayoutListenerTest.java`

- [ ] **Step 1: Write the failing test**

```java
@Test
void chargesTheStoredFee() {
    setting.set(new VenueChangeFeeAmount(700L, "EUR"));

    listener.on(cancelled(RefundReason.VENUE_CHANGE, 2000L));

    assertEquals(700L, ledger.lastFee().netMinor());
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*BookingCancelledPayoutListenerTest*"` → FAIL, the constructor still takes `VenueChangeFeeAmount`

- [ ] **Step 3: Minimal implementation** — the listener holds `VenueChangeFeeSetting` and reads `current()` inside the `VENUE_CHANGE` branch, leaving both load-bearing positions of the charge untouched; `PayoutVenueChangeFeeRate#perRefund()` reads the same port.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*payout*"` → PASS

- [ ] **Step 5: Generalization-audit pass** — population: every consumer of the retired `VenueChangeFeeAmount` bean.

- [ ] **Step 6: Commit** — `git commit -m "Charge the stored venue-change fee (#1037)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Admin read/write endpoint

**Files:** Create `AdminVenueChangeFeeController.java`, `VenueChangeFeeView.java`,
`SetVenueChangeFeeRequest.java`, `AdminVenueChangeFeeControllerIT.java`

- [ ] **Step 1: Write the failing test** — the IT covering AC-4 through AC-7: read, write plus its audit row, `403` for an operator, `400` for a negative, missing and above-bound amount.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*AdminVenueChangeFeeControllerIT*"` → FAIL, `404` (no such route)

- [ ] **Step 3: Minimal implementation** — a `@RestController` at `/api/admin/venue-change-fee` depending only on `VenueChangeFeeSetting`, converting the request through `InvalidApiRequestException.parsing`. No audit instrumentation: the edge fence covers it.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*AdminVenueChangeFeeControllerIT*"` then `--tests "*payout*"` → PASS

- [ ] **Step 5: Generalization-audit pass**

- [ ] **Step 6: Commit** — `git commit -m "Add the admin venue-change-fee endpoint (#1037)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Admin console fee card

**Files:** Modify `admin-venue-changes.ts|.service.ts|.spec.ts|.service.spec.ts|.a11y.spec.ts|.contrast.spec.ts`, `admin.model.ts`, `app.routes.ts`

- [ ] **Step 1: Write the failing test** — the specs covering AC-8 through AC-10.

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/admin/admin-venue-changes.spec.ts` → FAIL, no fee card

- [ ] **Step 3: Minimal implementation** — the card above the report: current amount, a Signal Forms euros field, the console's arm-then-confirm shape naming what changes and when it takes effect, optional grounds riding `X-Audit-Reason`, and the response spliced in.

- [ ] **Step 4: Run it, verify it passes** — the three admin-venue-changes specs, then `npm run lint && npm run format:check` → PASS

- [ ] **Step 5: Generalization-audit pass**

- [ ] **Step 6: Commit** — `git commit -m "Let an admin edit the venue-change fee (#1037)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — e2e, docs, ADR-0021 amendment, close-out

**Files:** Create `frontend/e2e/admin-venue-change-fee.spec.ts` · Modify `CLAUDE.md`,
`CONTEXT.md`, `RESPONSIBILITIES.md`, `ADR-0021…md` · Delete `docs/plans/venue-change-fee.md`

- [ ] **Step 1: Write the failing test** — the mocked Playwright spec for AC-11.

- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- admin-venue-change-fee` → FAIL

- [ ] **Step 3: Minimal implementation** — route mocks for the two endpoints plus the report.

- [ ] **Step 4: Run it, verify it passes** — same command → PASS

- [ ] **Step 5: Docs** — `CLAUDE.md` payout row gains `platform_setting`; `CONTEXT.md` gains
      *Platform setting*; `RESPONSIBILITIES.md` §`payout` names the settings read, the sole-writer
      claim and the divergence window; ADR-0021 §5 records that the amount is now a stored
      setting seeded by the property, and §7 is amended with why a schedule alone cannot close
      the window. Then `riviera-docs-freshness` over `origin/main..HEAD`.

- [ ] **Step 6: Commit** — `git commit -m "Document the venue-change fee setting (#1037)"`, the last code-touching commit carrying the finalized Execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*BookingCancelledPayoutListenerTest*"` → PASS.
- [ ] **AC-2/3:** `./gradlew test --tests "*JdbcVenueChangeFeeSettingIT*"` → PASS.
- [ ] **AC-4/5/6/7:** `./gradlew test --tests "*AdminVenueChangeFeeControllerIT*"` → PASS.
- [ ] **AC-8/9/10:** `npx vitest run src/app/admin/admin-venue-changes` → PASS.
- [ ] **AC-11:** `npm run test:e2e:a11y -- admin-venue-change-fee` → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the invocation ladder plus `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
