# GDPR Right-to-Erasure (Slice 1 of #101 [D5]) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use `- [ ]` for tracking.

> **Riviera discipline baked in:** the Availability & concurrency, Spring-Modulith, and Payment & payout
> sections are first-class. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A data subject gets a working right-to-erasure — a signed-in customer erases their own account +
contact PII, and a platform admin erases a person's PII by email — by **scrubbing PII in place (tombstone)**
across the `customer` module's tables while the booking / payment / payout financial records are retained
unchanged (statutory-retention exception, invariant #9).

**Architecture:** The one significant decision is **erasure = scrub-in-place (tombstone), never hard-delete.**
`booking.customer_id` and `booking.account_id` are both `ON DELETE RESTRICT` (audit / statutory retention),
and the payout ledger holds no PII by design — so tombstoning `customer` + `customer_account` and deleting
the transient `customer_sso_identity` + `customer_account_token` child rows severs the personal link without
touching any retained financial row. All scrub logic lives in the **`customer`** module (it owns *both* PII
tables); two thin edge controllers (self-service `/api/me/erasure`, admin `/api/admin/erasure`) authenticate
and delegate to one published `customer::api` `AccountErasure` port. Session invalidation reuses the existing
`CustomerSessionRevoker`.

**Persistence:** JDBC only (invariant #1). **Flyway `V30`** adds a nullable `erased_at TIMESTAMPTZ` tombstone
marker to `customer` and `customer_account` (idempotency guard + audit anchor + backup re-erase anchor). The
scrub is `UPDATE`s that replace PII columns with deterministic non-PII tombstones plus targeted child
`DELETE`s — no schema-destructive DDL, no hard row deletes.

**Source of intent:** GitHub issue **#101** (`[D5] GDPR / legal + backups`, parent #93 item 8). This is
**Slice 1** (right-to-erasure) of the issue's agent-doable erasure/retention sub-work; Slice 2 (automated
retention job) and Slice 3 (checkout privacy/terms links) are separate. The legal texts, DPAs, sh.p.k.
registration, Paysera KYC, and the Hetzner backup/PITR + hosting cutover (the deferred ADR-0004 prod-hosting
epic) are **out of scope — human-gated / separate epic**.

**Skills consulted** (`riviera-sdlc` Skill-routing gate output):
- `riviera-plan-doc` — plan structure + the mandatory sections.
- `postgres` — `V30` adds a nullable `erased_at TIMESTAMPTZ` marker (not a new table for v1); scrub is
  in-place `UPDATE` + targeted child `DELETE` **because the `booking` FKs are RESTRICT** — a hard `DELETE`
  is impossible and a cascade would (wrongly) destroy retained financial rows; `TIMESTAMPTZ` per invariant #6.
- `riviera-modulith` — erasure lands in `customer` (full module); new published `customer.api.AccountErasure`
  port + `customer.vocabulary.EraseOutcome`; scrub methods added to the internal `CustomerAccountStore` SPI +
  guest-row store; edge controllers stay at the platform edge (root package) and call the port (no new
  cross-module dependency; **no** domain event — the caller needs the outcome synchronously and there is no
  subscriber, so an event would be speculative).
- `riviera-java-conventions` — `record` command/outcome, `enum EraseOutcome`, `JdbcClient` text-block scrub
  SQL with named params, package-private adapter, typed-outcome (not exception) for expected flows, RFC-7807
  `ProblemDetail` via `ApiProblem`/`ApiErrorHandler` (§6b), no PII/booking-code in logs (§10, invariant #7).
- `codebase-design` — `AccountErasure` is a deep port: two methods, the whole tombstone+cascade+revoke
  transaction hidden behind them; the scrub is one `@Transactional` unit.
- `domain-modeling` — new glossary terms (Erasure, Tombstone, Data subject, Statutory-retention exception) →
  `CONTEXT.md`; recommends a short **ADR-0010** (erasure = pseudonymize-in-place) — see Open questions.
- `riviera-frontend` — the self-service trigger belongs on the signed-in account page
  (`auth/set-password.ts`, route `account/password`, title "Your account"); the HTTP call goes on the
  existing `core/customer-auth.ts`; the e2e spec is the CI-safe mocked suite (`frontend/e2e/`).
- `angular-developer` — v22 standalone + signals + `inject()` + `@if` for a signal-driven inline confirm
  (no JS `confirm()` dialog).
- **Deferred to the FE implement phase (re-entry rule):** `playwright-cli` (author `erasure.e2e.ts`),
  `riviera-tailwind` (destructive-button styling from `--riv-*` tokens), angular-cli MCP
  (`get_best_practices` for the confirm affordance). Re-loaded before Phase 3 is authored.

**Branch:** `feature/gdpr-erasure` (created off `main`; **local session — a real branch**, not a cloud
remote stand-in).

---

## Acceptance criteria (testable)

> Written at the inner hexagon (domain terms), each naming a test class.

- [ ] **AC-1 (account scrub):** Given a signed-in customer account (email + password_hash, ≥1 confirmed
  booking, ≥1 SSO identity, ≥1 recovery token), when `AccountErasure.eraseAccount(accountId)` runs, then the
  `customer_account` row's `email` becomes a deterministic non-PII tombstone, `password_hash` becomes `NULL`,
  `erased_at` is set, its `customer_sso_identity` and `customer_account_token` rows are deleted, and the
  `booking` rows are unchanged (status, amounts, `account_id` still referencing the tombstoned account).
  *Pinned by:* `AccountErasureServiceTest.erasesAccountIdentityAndKeepsBookings` + `AccountErasureIT` (real
  Postgres, proves the RESTRICT FK is respected and the row survives).
- [ ] **AC-2 (guest-contact scrub by email):** Given the erased account's email also matches a guest
  `customer` row, when erasure runs, then that guest row's `email`/`full_name`/`phone` are tombstoned and
  `erased_at` set, with its `booking` rows retained. *Pinned by:* `AccountErasureServiceTest.scrubsGuestContactByEmail`.
- [ ] **AC-3 (sessions revoked):** Given a signed-in customer, when they self-erase via `POST /api/me/erasure`,
  then `CustomerSessionRevoker.revokeAll(email)` is invoked (all their server-side sessions die). *Pinned by:*
  `MeErasureControllerTest.revokesAllSessionsOnErase`.
- [ ] **AC-4 (admin guest erasure):** Given a guest customer (no account) identified by email, when a platform
  admin calls `POST /api/admin/erasure {email}`, then the guest row is tombstoned and bookings retained.
  *Pinned by:* `AdminErasureControllerTest.adminErasesGuestByEmail` + `AccountErasureServiceTest`.
- [ ] **AC-5 (authorization):** Given a non-CUSTOMER (operator) session, when it calls `POST /api/me/erasure`,
  then `403` (anonymous → `401`); and given a non-ADMIN principal (operator or customer), when it calls
  `POST /api/admin/erasure`, then `403`. *Pinned by:* `MeErasureControllerTest` + `AdminErasureControllerTest`
  (`@WebMvcTest` slices through the real `SecurityConfig` filter chain, Docker-free — the `MyVenuesControllerTest`
  pattern; replaces the planned `@SpringBootTest ErasureAuthorizationIT`, which would need Docker for no extra proof).
- [ ] **AC-6 (idempotent):** Given an already-erased subject (`erased_at` set), when erasure is requested
  again, then it returns `ALREADY_ERASED`, performs no second scrub, and leaves `erased_at` unchanged.
  *Pinned by:* `AccountErasureServiceTest.erasureIsIdempotent`.
- [ ] **AC-7 (invariant #9 — ledger auditability preserved):** Given an erased customer with a payout ledger
  entry and a payment row, when erasure runs, then the `payout_ledger_entry` and `payment` rows are byte-for-
  byte unchanged. *Pinned by:* `AccountErasureIT.leavesPayoutAndPaymentUntouched`.
- [ ] **AC-8 (error contract):** Given the admin endpoint called with a missing/blank `email`, then a
  `400` RFC-7807 `application/problem+json` with a stable `code`, built via `ApiProblem` — never an ad-hoc
  body, never leaking a booking code or PII. *Pinned by:* `AdminErasureControllerTest.rejectsBlankEmailWithProblemDetail`.
- [ ] **AC-9 (FE self-service):** Given a signed-in customer on the account page, when they click
  "Erase my account & data" then the explicit confirm, then the app calls `POST /api/me/erasure` and on
  success signs out and shows an inline erased confirmation (no navigation — simpler + testable without a
  home-page mock; the cleared session removes the account form); the confirm is keyboard-reachable and
  axe-clean. *Pinned by:* `set-password.spec.ts` (unit, 4 new) + `frontend/e2e/erasure.e2e.ts` (mocked,
  CI-safe, axe on both the danger-zone account page and the erased screen). A11y via the e2e axe (the
  `auth/` pages have no unit a11y spec — the email-verification pattern).

## Non-goals

- **The automated retention job (Slice 2)** — a scheduled scrub of guest contacts once their statutory-
  retention basis expires; needs a `booking::api` retention-basis (tax-record-age) read. Not here.
- **Hard-deleting** `booking` / `payment` / `payout_ledger_entry` rows — statutory retention + RESTRICT FKs;
  erasure never deletes or mutates them.
- **An admin *console UI* for guest erasure** — Slice 1 exposes the admin path as an **API only** (consistent
  with admin endpoints that predated their console tabs, e.g. weather-refund). A console screen is a follow-up.
- **Reaching guest `customer` rows whose email differs from the account email** via the `booking.customer_id`
  join — self-service scrubs guest rows by **email match** only; divergent-email guest rows are covered by the
  admin-by-email path (and, later, Slice 2). Recorded as an Assumption below.
- **Backup re-erasure automation** — documented as a manual runbook step (backup retention window +
  re-apply on restore using `erased_at`); no code in this slice.
- **Legal document content, the Paysera/Hetzner DPAs, sh.p.k. registration, Paysera KYC, and the Hetzner
  backup/PITR + one-origin hosting cutover** — human-gated / the deferred ADR-0004 prod-hosting epic. #101
  *references* them.
- **Privacy/terms checkout links (Slice 3, frontend).**

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. There is no existing erasure surface; the account page (`set-password.ts`)
gains a new section, it does not replace an existing one.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `POST /api/me/erasure` falls through to `.anyRequest().authenticated()` (only `GET /api/me/**` is CUSTOMER-matched today) → an operator session could hit a customer erasure path | med | high | Add an explicit `POST "/api/me/erasure"` `.hasRole("CUSTOMER")` matcher in `SecurityConfig`, above `.anyRequest()`; AC-5 IT proves the 403 | Ivo | open |
| R-2 | Accidental hard-`DELETE`/cascade destroys retained booking/payment/payout rows | low | high | Scrub-in-place only (`UPDATE` tombstone + child `DELETE` of sso/tokens); never `DELETE` the parent; `AccountErasureIT` asserts bookings + ledger survive (AC-1, AC-7) | Ivo | open |
| R-3 | Tombstone email collides with the `UNIQUE(email)` constraint | low | med | Deterministic per-id tombstone `erased+<id>@erased.invalid` — unique by construction; IT inserts two erasures and asserts no conflict | Ivo | open |
| R-4 | Erasure not idempotent → double-run error or re-scrub | low | med | Guard every scrub on `erased_at IS NULL`; return `ALREADY_ERASED`; AC-6 | Ivo | open |
| R-5 | Invariant #9 — erasure breaks payout-ledger auditability | low | high | `payout` holds no PII (RESPONSIBILITIES `Not My Job`); erasure touches only `customer`/`customer_account`/`sso`/`token`; AC-7 pins it | Ivo | open |
| R-6 | Erased account still authenticated (live session survives) | low | med | `CustomerSessionRevoker.revokeAll(email)` after the scrub commits; AC-3 | Ivo | open |
| R-7 | Module-boundary leak — scrub logic drifting into the edge or `booking` | low | med | All scrub SQL in `customer` adapters; edge controllers only authenticate + delegate to `customer::api`; RV-BE-11 re-checks the §4a table | Ivo | open |
| R-8 | Flyway `V30` collision | low | high | `V30` verified **free on `main`** (latest is `V29`) **and unclaimed by the only open PR** (#307, frontend `tar` bump, no SQL). Whoever merges second renumbers (no competing migration in flight) | Ivo | mitigated |
| R-9 | New endpoints return ad-hoc `{"error":…}` instead of RFC-7807 | low | med | Typed `EraseOutcome` → `ApiProblem` in the controller; the single `ApiErrorHandler` for throws; no per-controller `@ExceptionHandler` (`riviera-java-conventions` §6b); AC-8 | Ivo | open |
| R-10 | PII / booking code leaked into the erasure audit log | med | high | Log only `{subjectType, subjectId, actor, erased_at}` via the shipped #100 structured logger — never email/name/phone/booking code (invariant #7, §10) | Ivo | open |

## Open questions / Assumptions

- **Open question:** The statutory **retention window value** (how long a guest contact with no live basis is
  kept before auto-scrub) is legal/counsel input and belongs to **Slice 2**; Phase 4's runbook stub will
  reference it as `<counsel-TBD>` explicitly rather than inventing a number. — *Owner:* counsel · *Resolves
  by:* Slice 2.

### Resolved

- **Assumption (accepted 2026-07-24, go-ahead):** Self-service erasure scrubs guest `customer` rows matched by
  **`account.email`**; divergent-email guest rows are handled by the admin-by-email path (and Slice 2).
- **Assumption (accepted 2026-07-24, go-ahead):** The admin endpoint accepts a data-subject **email** and
  erases *any* account **and** guest row sharing it (one comprehensive by-email scrub).
- **Audit record (decided 2026-07-24):** `erased_at` marker + the #100 **structured audit log** (no PII);
  **no** dedicated `erasure_request` table in v1. Add one later only if counsel wants an in-DB register.
- **ADR-0010 (decided 2026-07-24):** **Yes** — write ADR-0010 (Erasure = pseudonymize-in-place under
  statutory retention) in Phase 4.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** Erasure never writes `set_availability`, never reserves/releases a
set, and never touches the beach map. `booking` rows are **read-only-retained** (not modified) — their
`(set, date)` claims are irrelevant to a PII scrub. No concurrency test on availability is applicable; the
only concurrency concern (double erasure) is handled by the `erased_at IS NULL` idempotency guard (AC-6), not
an availability lock.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing (full) | `Customer`, `CustomerAccount` | Owns tourist identity — *both* the guest `customer` contact and the `customer_account`; the erasure scrub is a mutation of its own PII tables |
| M-2 | root/edge (`ai.riviera.platform`) | existing (not a module) | — | The two controllers + the `SecurityConfig` matchers + session revoke are login/session/role machinery, which lives at the platform edge (RV-BE-11), not inside `customer` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `AccountErasure#eraseAccount(CustomerAccountId)` and `#eraseByEmail(String)` → `EraseOutcome` | `EraseOutcome` (`customer.vocabulary`), `CustomerAccountId` (existing) | the edge controllers `MyErasureController`, `AdminErasureController` |

Internal (unpublished) additions: scrub methods on the existing `CustomerAccountStore` SPI (`tombstoneAccount`,
`deleteSsoIdentities`, `deleteTokens`) and on the guest-row store behind `CustomerDirectory`
(`tombstoneGuestByEmail`); implemented by the existing `JdbcCustomerAccounts` / `JdbcCustomerDirectory`
adapters (or a dedicated package-private `JdbcAccountErasure`). Application service `AccountErasureService`
(`@Service`, `@Transactional`) implements the `api/` port. `allowedDependencies`: **none added** — `customer`
publishes; the edge controllers already depend on `customer::api` + `::vocabulary` (the `MyAccountController` /
`AdminOperatorController` pattern).

**Domain events (id-based payloads, invariant #11)**

N/A — no domain event. Erasure is a synchronous command whose `EraseOutcome` the caller acts on immediately
(HTTP status + session revoke), and there is **no subscriber** in Slice 1. A `CustomerErased` event would be
speculative; add it only when a real listener appears.

### Module ownership (§4a)

| Capability (what the slice adds) | Owner module | Justification |
|---|---|---|
| Scrub (tombstone) customer-account + guest-contact PII; delete SSO identities + recovery tokens | `customer` | `customer` **Job**: "Own tourist identity — the guest-checkout contact AND the customer account." The PII being scrubbed is exactly what it owns; on no other module's Not-My-Job list |
| Retain `booking` / `payment` / `payout` financial rows unchanged | their own modules | Erasure does **not** touch them. `payout` **Not My Job**: "the tourist's identity or contact → not sent to me" — which is *why* invariant #9 auditability is preserved |
| Authenticate the erasure request (current CUSTOMER / ADMIN role) | platform edge | RV-BE-11: login/session/role machinery lives at the edge, never inside `customer` (`CustomerAuthPlacementTests` stays green) |
| Revoke the erased subject's server-side sessions | platform edge | `CustomerSessionRevoker` is edge session machinery (already used by `AccountRecoveryController`) |

## Payment & payout (invariants #5, #8, #9, #10)

**No money moves** — but the invariant-#9 interaction is the crux and is *not* a blank N/A: erasure
**explicitly does not touch** `payment` or `payout_ledger_entry` rows. The payout ledger holds no PII by
design (venue-ids, booking-ids, money only), so scrubbing customer PII cannot affect its auditability or
exactly-once accrual. AC-7 pins that the `payout_ledger_entry` and `payment` rows are unchanged after erasure.
No Stripe call, no refund, no commission math in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/set-password.ts` (signed-in "Your account" page) | modify | standalone component | Signal-driven inline confirm (`confirming = signal(false)`) + a `busy` signal; no JS `confirm()` dialog | none (a button + inline confirm, not a form) |
| FE-2 | `core/customer-auth.ts` | modify | `@Service` (extends `SessionAuth`) | adds `eraseAccount()` → `POST /api/me/erasure`, then `signOut()` on success; the account page shows an inline erased confirmation (no navigation) | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs; the destructive
button + confirm reachable by keyboard and axe-clean; styled from `--riv-*` tokens (no palette literals),
with a `.contrast.spec.ts` only if a new translucent surface is introduced (it is not — reuse existing card
tokens). angular-cli MCP `get_best_practices` consulted at Phase 3.

## FE↔BE contract

- **New endpoints:**
  - `POST /api/me/erasure` — CUSTOMER-only, **no body**, `204 No Content` on success **and** on already-erased
    (idempotent). Authenticated via `CurrentCustomer.require(authentication)`.
  - `POST /api/admin/erasure` — ADMIN-only, body `{ "email": "<data-subject email>" }`, `204` on success/
    already-erased, `400` RFC-7807 on blank email. ADMIN role gate in `SecurityConfig`; exempt from per-venue
    authorization (invariant #13 admin exemption).
- **Client typing:** a hand-written typed `eraseAccount()` on `CustomerAuth`; no `as any`.
- **Money/date on the wire:** none.
- **Errors:** RFC-7807 `application/problem+json` with a stable `code`, via `ApiProblem` / the single
  `ApiErrorHandler`.

## Execution status

> Session-recovery anchor. Re-read this (plus the current `riviera-sdlc` reference file) after any compaction
> or in a fresh session before acting. Update in the same commit window as the change it records.

**Stage pointer:** `PR` — Phases 0–4 done (backend end-to-end + FE self-service + docs). Ready to open the
PR; then the mandatory Review gate → Sonar gate → merge close-out.

**Next action:** Merge latest `origin/main` into the branch, push, open the PR into `main`; then run the
Review gate (`riviera-review-overlay` + `/code-review`) and the Sonar gate before merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V30 migration + `customer` scrub service + `AccountErasure` port | ✅ | 648297b |
| 1 — self-service `POST /api/me/erasure` (edge) + CUSTOMER matcher + session revoke | ✅ | 75222b5 |
| 2 — admin `POST /api/admin/erasure` (edge) + ADMIN matcher | ✅ | c0deca1 |
| 3 — FE self-service trigger (account page + `CustomerAuth.eraseAccount`) + Vitest/Playwright | ✅ | this commit |
| 4 — docs: ADR-0010, `docs/runbooks/data-erasure.md`, CONTEXT.md glossary, docs-freshness pass | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate / Sonar-gate / red-CI finding; each fix re-enters at Implement.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | (none yet) | — |

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`)**
- `db/migration/V30__customer_erasure_marker.sql` — **create**: add `erased_at TIMESTAMPTZ` to `customer` and
  `customer_account`.
- `customer/api/AccountErasure.java` — **create**: the published port (`eraseAccount`, `eraseByEmail`).
- `customer/vocabulary/EraseOutcome.java` — **create**: `enum { ERASED, ALREADY_ERASED, NOT_FOUND }`.
- `customer/application/AccountErasureService.java` — **create**: `@Service @Transactional`, implements the port.
- `customer/application/CustomerAccountStore.java` — **modify**: add `tombstoneAccount`, `deleteSsoIdentities`,
  `deleteTokens`, `emailOf` (exists), `isErased`.
- `customer/adapter/out/JdbcCustomerAccounts.java` — **modify**: implement the new scrub SQL.
- `customer/adapter/out/JdbcCustomerDirectory.java` — **modify**: add `tombstoneGuestByEmail`.
- `MyErasureController.java` (root/edge) — **create**: `POST /api/me/erasure`.
- `AdminErasureController.java` (root/edge) — **create**: `POST /api/admin/erasure`.
- `SecurityConfig.java` — **modify**: add the CUSTOMER matcher for `POST /api/me/erasure` and the ADMIN
  matcher for `POST /api/admin/erasure`.

**Backend tests (`platform/src/test/java/ai/riviera/platform/`)**
- `customer/application/AccountErasureServiceTest.java` (unit), `customer/AccountErasureIT.java` (Testcontainers),
  `MeErasureControllerTest.java` + `AdminErasureControllerTest.java` (`@WebMvcTest` slices — authorization +
  happy path through the real filter chain, Docker-free). `WebSliceStubs.java` gains an inert `AccountErasure`
  bean (shared-slice contexts load every controller).

**Frontend (`frontend/src/app/`)**
- `auth/set-password.ts` (+ `set-password.spec.ts`, `set-password.a11y.spec.ts`) — **modify**.
- `core/customer-auth.ts` — **modify**.
- `frontend/e2e/erasure.e2e.ts` — **create** (CI-safe mocked, axe).

**Docs**
- `docs/adr/ADR-0010-erasure-pseudonymize-in-place.md`, `docs/runbooks/data-erasure.md` — **create**.
- `CONTEXT.md`, `RESPONSIBILITIES.md`, `CLAUDE.md` — **modify** (glossary + module note; docs-freshness step).

---

## Phase 0 — V30 migration + `customer` scrub service + `AccountErasure` port

**Files:** Create `V30__customer_erasure_marker.sql`, `customer/api/AccountErasure.java`,
`customer/vocabulary/EraseOutcome.java`, `customer/application/AccountErasureService.java` · Modify
`CustomerAccountStore.java`, `JdbcCustomerAccounts.java`, `JdbcCustomerDirectory.java` · Test
`AccountErasureServiceTest.java`, `AccountErasureIT.java`.

- [ ] **Step 1: Write the failing test** — `AccountErasureServiceTest` (fakes for the two stores) asserting
  AC-1/AC-2/AC-6 outcomes; `AccountErasureIT` (Testcontainers) asserting the real tombstone + RESTRICT-FK
  survival + AC-7 (payout/payment untouched).

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*AccountErasureServiceTest*"` → FAIL
  (type/class missing). *(Load `riviera-local-debug` before the session's first Gradle invocation.)*

- [ ] **Step 3: Minimal implementation**

The migration (`V30`):

```sql
-- V30: GDPR right-to-erasure tombstone marker (Slice 1 of #101).
-- Erasure = scrub-in-place, never hard-delete: booking.customer_id / booking.account_id are ON DELETE
-- RESTRICT (statutory/tax retention, invariant #9), so a customer/account row that has bookings cannot be
-- deleted. erased_at marks a tombstoned row (idempotency guard + audit anchor + backup re-erase-on-restore
-- anchor). Nullable; NULL = live, non-NULL = erased. No PII is added by this migration.
ALTER TABLE customer         ADD COLUMN erased_at TIMESTAMPTZ;
ALTER TABLE customer_account ADD COLUMN erased_at TIMESTAMPTZ;
```

The outcome + port:

```java
// customer/vocabulary/EraseOutcome.java
public enum EraseOutcome { ERASED, ALREADY_ERASED, NOT_FOUND }
```

```java
// customer/api/AccountErasure.java  — @NamedInterface("api"); ports only, plain interface
public interface AccountErasure {
    /** Self-service: erase the signed-in account (by id) and any guest contact sharing its email. */
    EraseOutcome eraseAccount(CustomerAccountId accountId);
    /** Admin / data-subject request: erase any account and guest contact sharing this email. */
    EraseOutcome eraseByEmail(String email);
}
```

The service (`@Service @Transactional`, package-private) resolves the email, guards on `erased_at IS NULL`,
then tombstones the account (`email → 'erased+<id>@erased.invalid'`, `password_hash → NULL`, `erased_at →
now`), deletes its `customer_sso_identity` + `customer_account_token` rows, and tombstones the guest
`customer` row(s) matched by email (`email → 'erased+<id>@erased.invalid'`, `full_name → 'ERASED'`,
`phone → 'ERASED'`, `erased_at → now`). Scrub SQL lives in the adapters as `JdbcClient` text blocks with named
params; the enum/tokens follow §6a (named constants, no magic literals).

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*AccountErasure*"` → PASS.

> End-of-phase regression: `./gradlew test --tests "*customer*" --tests "*ModularityTests*"
> --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"`
> (new published `api/` + `vocabulary/` types must satisfy the structural net; `CustomerAuthPlacementTests`
> stays green — no Spring Security type entered `customer`).

- [ ] **Step 5: Generalization-audit pass** — search for other PII write paths that a scrub should also cover
  (`Grep` the `customer` adapters for every table with an email/name/phone column). Record in the log.

- [ ] **Step 6: Commit** — `git commit -m "feat(customer): GDPR erasure scrub service + V30 tombstone marker (#101)"`

- [ ] **Step 7: Update plan-doc Execution status** in the same commit window.

---

## Phase 1 — self-service `POST /api/me/erasure` (edge) + CUSTOMER matcher + session revoke

**Files:** Create `MyErasureController.java` · Modify `SecurityConfig.java` · Test `MeErasureControllerTest.java`,
`ErasureAuthorizationIT.java`.

- [ ] **Step 1: Write the failing test** — `MeErasureControllerTest`: a CUSTOMER session POSTs `/api/me/erasure`
  → `AccountErasure.eraseAccount(currentAccountId)` invoked, `CustomerSessionRevoker.revokeAll(email)` invoked,
  `204` (AC-3). `ErasureAuthorizationIT`: an operator session → `403` (AC-5, R-1).
- [ ] **Step 2: verify it fails** — `./gradlew test --tests "*MeErasureControllerTest*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — `MyErasureController` (root/edge, alongside `MyAccountController`):
  resolve `CurrentCustomer.require(authentication)` → `CustomerAccountId`; call `accountErasure.eraseAccount(id)`;
  on non-`NOT_FOUND` call `sessionRevoker.revokeAll(email)`; return `204`. **Add the `SecurityConfig` matcher**
  `.requestMatchers(POST, "/api/me/erasure").hasRole("CUSTOMER")` **above** `.anyRequest().authenticated()`
  (closes R-1). Errors via `ApiProblem`.
- [ ] **Step 4: verify it passes** — `./gradlew test --tests "*MeErasureController*" --tests "*ErasureAuthorizationIT*"` → PASS.
- [ ] **Step 5: Generalization-audit** — confirm no other `POST /api/me/**` endpoint shares the R-1
  fall-through gap; if `MyAccountController`'s POSTs are also only `.authenticated()`, note it (out of scope
  but log the finding).
- [ ] **Step 6: Commit** — `feat(edge): self-service erasure endpoint + CUSTOMER matcher + session revoke (#101)`.
- [ ] **Step 7: Update Execution status.**

---

## Phase 2 — admin `POST /api/admin/erasure` (edge) + ADMIN matcher

**Files:** Create `AdminErasureController.java` · Modify `SecurityConfig.java` · Test `AdminErasureControllerTest.java`.

- [ ] **Step 1: Write the failing test** — `AdminErasureControllerTest`: ADMIN POSTs `{email}` →
  `AccountErasure.eraseByEmail(email)`, `204` (AC-4); blank email → `400` RFC-7807 (AC-8); non-ADMIN → `403`
  (AC-5, via `ErasureAuthorizationIT`).
- [ ] **Step 2: verify it fails.**
- [ ] **Step 3: Minimal implementation** — `AdminErasureController` (root/edge, alongside `AdminOperatorController`),
  `@RequestMapping("/api/admin")`, `POST /erasure`, body record `EraseRequest(String email)`; validate non-blank
  → else `ApiProblem` `400`; call `accountErasure.eraseByEmail(email)`; `204`. **Add the matcher**
  `.requestMatchers(POST, "/api/admin/erasure").hasRole("ADMIN")`. No `CurrentOperator`/venue check (admin
  exemption, invariant #13).
- [ ] **Step 4: verify it passes.**
- [ ] **Step 5: Generalization-audit** — none expected; log skip.
- [ ] **Step 6: Commit** — `feat(edge): admin data-subject erasure endpoint + ADMIN matcher (#101)`.
- [ ] **Step 7: Update Execution status.**

---

## Phase 3 — FE self-service trigger

> **Re-run the Skill-routing gate first (re-entry rule):** load `playwright-cli`, `riviera-tailwind`, and the
> angular-cli MCP (`get_best_practices`) before authoring this phase.

**Files:** Modify `auth/set-password.ts` (+ specs), `core/customer-auth.ts` · Create `frontend/e2e/erasure.e2e.ts`.

- [ ] **Step 1: Write the failing test** — `set-password.spec.ts`: clicking "Erase my account & data" then
  "Confirm" calls `CustomerAuth.eraseAccount()`; `erasure.e2e.ts` (mocked): confirm → `POST /api/me/erasure`
  (204) → signed out + at home; axe-clean; `set-password.a11y.spec.ts` for the confirm affordance (AC-9).
- [ ] **Step 2: verify it fails** — `npm test -- set-password` → FAIL.
- [ ] **Step 3: Minimal implementation** — `CustomerAuth.eraseAccount()`: `POST /api/me/erasure` (interceptor
  attaches session + CSRF), on `204` `signOut()` + `router.navigateByUrl('/')`. `set-password.ts`: a
  destructive "Danger zone" section — button toggles `confirming` signal; `@if (confirming())` shows a
  keyboard-reachable inline confirm/cancel; `busy` signal disables during the call; styled from `--riv-*`
  tokens.
- [ ] **Step 4: verify it passes** — `npm test -- set-password` and `npm run test:e2e` (mocked suite; on
  Windows use the a11y/mocked config per prior sessions) → PASS.
- [ ] **Step 5: Generalization-audit** — none.
- [ ] **Step 6: Commit** — `feat(frontend): self-service "erase my account" affordance (#101)`.
- [ ] **Step 7: Update Execution status.**

---

## Phase 4 — docs

**Files:** Create `docs/adr/ADR-0010-erasure-pseudonymize-in-place.md`, `docs/runbooks/data-erasure.md` ·
Modify `CONTEXT.md`, `RESPONSIBILITIES.md`, `CLAUDE.md`.

- [ ] **Step 1** — ADR-0010: erasure = pseudonymize-in-place under statutory retention (context: RESTRICT FKs +
  invariant #9; decision: tombstone + child-delete, no hard delete; consequences: backups re-erased on restore).
  *(Only if the Open-question ADR decision is "yes".)*
- [ ] **Step 2** — `docs/runbooks/data-erasure.md`: how to run a self-service vs admin erasure, what is
  scrubbed vs retained (and why), the **backup re-erase-on-restore** manual step (retention window
  `<counsel-TBD>`, re-apply `erased_at`), and the accountability log location (#100).
- [ ] **Step 3** — `CONTEXT.md` glossary: *Erasure*, *Tombstone / pseudonymize*, *Data subject*,
  *Statutory-retention exception*. `RESPONSIBILITIES.md`: note erasure under `customer` Job. `CLAUDE.md`:
  one line under `customer` module row.
- [ ] **Step 4** — run `riviera-docs-freshness` over the branch range (merge close-out step 5); then
  `graphify update .` (docs changed — the hook is code-only).
- [ ] **Step 5: Commit** — `docs(#101): ADR-0010 + erasure runbook + glossary`.
- [ ] **Step 6: Update Execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1..AC-8:** `./gradlew test --tests "*AccountErasure*" --tests "*Erasure*Controller*"
  --tests "*ErasureAuthorizationIT*"` → all green.
- [ ] **AC-9:** `npm test -- set-password` + `npm run test:e2e` (erasure spec) → green.
- [ ] Structural net green: `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"
  --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"
  --tests "*CustomerAuthPlacementTests*"`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (does not touch availability); no double-book surface (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; erasure in `customer`; edge controllers call only `customer::api`; no
  cross-module `application.*`/`adapter.*` imports; no speculative event (invariant #11).
- [ ] **Payment/payout**: N/A for money movement, but invariant #9 interaction pinned (AC-7 — ledger/payment untouched).
- [ ] Refund policy: N/A.
- [ ] Timezone: `erased_at` is `TIMESTAMPTZ` / UTC (invariant #6).
- [ ] Booking codes never logged; erasure log carries no PII (invariant #7, §10).
- [ ] Flyway `V30` present; the tombstone/idempotency behavior tested (invariant #12); number verified free.
- [ ] **Frontend** standards met; no `as any`; e2e in the CI-safe mocked suite; axe-clean.
- [ ] Execution status at HEAD matches reality; findings register current.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
