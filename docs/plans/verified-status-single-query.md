# Collapse verifiedStatus into one query on /api/auth/me (#256) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/auth/me` (and the customer login response) resolves a customer
principal's `emailVerified` flag in **one** `customer_account` SELECT instead of two,
with byte-identical wire behavior.

**Architecture:** Replace the two-hop read (`CustomerAccountDirectory.accountFor(email)`
→ `CustomerAccountRecovery.isEmailVerified(accountId)`) with a single by-email read on
the port that already owns verification state: `CustomerAccountRecovery` gains
`Optional<Boolean> emailVerifiedFor(String email)` (empty ⇔ no account) and **loses**
`isEmailVerified(CustomerAccountId)`, whose only production caller was this exact flow —
replacing rather than adding avoids a redundant same-conversation surface (Cockburn's
"small number of ports"; `riviera-modulith`). The edge's in-memory role check stays in
`AuthController`; the module keeps normalizing the email (`Emails.normalize`) so the raw
principal name remains a valid argument (same contract as `CustomerAccountDirectory`).

**Persistence:** JDBC only (invariant #1). No schema change — one new read
(`SELECT email_verified FROM customer_account WHERE email = :email`, a point lookup on
the existing `customer_account.email` UNIQUE index) replaces two point lookups. **No
Flyway migration.**

**Source of intent:** GitHub issue #256 (deferred cleanup from the #113/S8 review gate,
PR #254).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the issue is live, not stale; caught that `CurrentCustomer` moved to `shared` since the
issue was written (#371), which pins the fix to `customer::api`, and that the by-id port
read goes dead after the fix, turning "add a query" into "replace a query") ·
`riviera-plan-doc` (this template — forced the parity ledger for the replaced port
method) · `tdd` (each phase red→green: port/adapter first, edge second) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (due at close-out over this slice's diff; expected clean —
RESPONSIBILITIES.md §customer names the recovery port's reads generically) ·
`riviera-modulith` (port-conversation rule → replace on `CustomerAccountRecovery`, not
a new port; api-surface change checked by `ModularityTests`) ·
`riviera-java-conventions` (`Optional<Boolean>` for absent on a query port — never
null; adapter SQL style matches surrounding single-line reads) · `postgres` (verified
the read is a point lookup on the existing UNIQUE index — no new index needed) ·
`riviera-local-debug` (cloud gradle recipe + scoped-test discipline).

**Branch:** `claude/sdlc-256-staleness-check-hfz0cl` (cloud session — the designated
remote branch stands in for `feature/verified-status-single-query` per the riviera-sdlc
remote addendum; branched from `main` @ `96601fa`).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a fresh (unverified) customer account, when the module is asked
  `emailVerifiedFor` with its email, then it answers `Optional.of(false)`; after the
  account's email is verified it answers `Optional.of(true)`. *Pinned by:*
  `CustomerAccountRecoveryIT` (re-pointed verified-state assertions).
- [x] **AC-2:** Given no customer account exists for an email, when asked
  `emailVerifiedFor`, then the answer is `Optional.empty()` (the edge renders it as
  `emailVerified: null`, exactly as the old two-hop path did). *Pinned by:*
  `CustomerAccountServiceTest` (unknown-email case).
- [x] **AC-3:** Given a differently-cased, space-padded form of a registered email, when
  asked `emailVerifiedFor("  Alice@EXAMPLE.com ")`, then the module normalizes before
  lookup and answers the account's state (the #390 G-4 lesson — byte-different input in
  the test, so dropping `Emails.normalize` fails). *Pinned by:*
  `CustomerAccountServiceTest` (normalization case).
- [x] **AC-4:** Given a signed-in customer session, when the SPA restores via
  `GET /api/auth/me`, then `emailVerified` reports `false` before and `true` after the
  verification link is redeemed — the end-to-end wire contract, unchanged. *Pinned by:*
  `EmailVerificationIT.registerSignsInSendsVerification_thenVerifyingFlipsMeVerified`
  (existing, must stay green).
- [x] **AC-5:** Given an operator session, when `GET /api/auth/me` answers, then
  `emailVerified` is `null` (non-customer) — the in-memory role check short-circuits
  before any customer lookup. *Pinned by:* existing auth/web-slice tests staying green.

## Non-goals

- No change to the wire shape of `PrincipalResponse` or any endpoint's status codes.
- No caching of the verified flag in the session — the read stays per-request.
- No touch of the verification/reset token flows, the resend endpoint, or the mailer.
- No frontend change (the contract is identical).

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces a published port method and rewires one edge helper:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `CustomerAccountRecovery.isEmailVerified(accountId)` → `true`/`false`; `false` for an unknown account | changed (key + shape) | `emailVerifiedFor(email)` → `Optional<Boolean>`; unknown → `empty`. Sole production caller (`AuthController.verifiedStatus` via edge `CustomerRecovery.isVerified`) mapped unknown→`null` before and still does — wire behavior identical. Module ITs re-pin via the new method. |
| `verifiedStatus`: non-customer principal → `null` (role check inside `CurrentCustomer.optional`) | preserved | in-memory role check stays in `AuthController` (reuses the same authority check), short-circuits to `null` before any DB call — same as before (the directory lookup was only reached for customer principals). |
| `verifiedStatus`: customer principal, no account row → `null` | preserved | `emailVerifiedFor` empty → `.orElse(null)`. |
| `verifiedStatus`: raw (un-normalized) principal name accepted | preserved | module normalizes (`Emails.normalize`) before lookup, same contract as `CustomerAccountDirectory.accountFor`. |
| Two SELECTs per `/api/auth/me` / login for a customer | changed (the point) | one point-lookup SELECT on the `email` UNIQUE index. |
| `AuthController` depends on `CurrentCustomer` | dropped | `verifiedStatus` was its only use in this controller; other controllers keep using the bean unchanged. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Semantics drift on the unknown-account case (`false` vs `null` on the wire) | low | med | parity ledger row + AC-2; the edge maps `empty→null` exactly as `orElse(null)` did | session | closed — pinned by `CustomerAccountServiceTest` + `AuthSessionIT` |
| R-2 | Dropping normalization silently works in tests that use already-canonical emails (#390 G-4) | low | med | AC-3 uses a byte-different cased/padded input | session | closed — pinned by `emailVerifiedForNormalizesTheEmail` |
| R-3 | Removing the by-id port method breaks an unseen consumer | low | low | grep'd `isEmailVerified`/`isVerified` across `src/main`: only `CustomerRecovery.isVerified` → `AuthController.verifiedStatus`; tests re-pointed in the same commit; compile + `ModularityTests` prove it | session | closed — full grep clean, structural net green |
| R-4 | Full-suite-only failure (shared-state beans; #122/#127 class) | low | low | slice adds no filter/limiter/scheduled bean — read-only query swap; verified by the PR's CI run | session | open |

## Open questions / Assumptions

### Resolved

- **Assumption:** the session principal name for a customer is always the normalized
  email (stored lower-cased/trimmed at registration), so normalization in the module is
  belt-and-braces, not load-bearing. — *Confirmed:* register normalizes at the edge
  (`AuthController.register`) before `establishSession`; the module-side normalize is
  kept anyway to preserve the documented port contract. (plan commit)
- **Open question:** replace vs add the by-id read on the port — *Resolved:* replace;
  its only production caller is the flow being fixed, and a second method answering the
  same question by a different key is redundant surface (`riviera-modulith` port rule).
  (plan commit)

## Availability & concurrency (invariant #2)

N/A — does not affect availability: read-only query consolidation on
`customer_account`; no booking, beach-map, or `availability` table involvement.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing | `CustomerAccount` | owns tourist identity + verification state; the read is an account-state fact |
| M-2 | (platform edge, not a module) | existing | — | `AuthController` + `CustomerRecovery` orchestrate; login/session machinery stays at the edge (RV-BE-11) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerAccountRecovery#emailVerifiedFor(String)` **replaces** `#isEmailVerified(CustomerAccountId)` | `Optional<Boolean>` | platform edge (`CustomerRecovery` → `AuthController`) |

**Domain events** — none touched; no event published or consumed by this slice.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| "is this email's account verified?" (one-shot read) | `customer` | §`customer` Job: owns the customer account incl. email-verification state (S8); not on any other module's Job list. The edge consumes via `customer::api` — login machinery stays edge-side per §customer Not-My-Job ("login machinery → the platform edge"). |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend-only (wire contract unchanged).

## FE↔BE contract

N/A — no contract change (`PrincipalResponse` shape, statuses, and nullability
identical).

## Execution status

**Stage pointer:** CI gate (phases 1–2 implemented, scoped tests green locally)

**Next action:** push, verify the PR's CI run is green, then mark ready-for-review and
run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR (#518) | ✅ | `68e11a8` |
| 1 — module: port/service/store/adapter swap (red→green) | ✅ | this commit |
| 2 — edge: `CustomerRecovery` + `AuthController` rewire (red→green) | ✅ | this commit |
| 3 — CI green → ready-for-review → review gate → sonar gate | ⏳ | |
| 4 — merge + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/java/ai/riviera/platform/customer/api/CustomerAccountRecovery.java`
  — swap `isEmailVerified(CustomerAccountId)` → `emailVerifiedFor(String)`.
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountStore.java`
  — same swap on the internal store port (`Optional<Boolean> emailVerifiedFor(String normalizedEmail)`).
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountService.java`
  — implement: normalize, delegate.
- `platform/src/main/java/ai/riviera/platform/customer/adapter/out/JdbcCustomerAccounts.java`
  — the one SELECT by email.
- `platform/src/main/java/ai/riviera/platform/CustomerRecovery.java` — edge helper:
  `isVerified(CustomerAccountId)` → `verifiedFor(String)`.
- `platform/src/main/java/ai/riviera/platform/AuthController.java` — `verifiedStatus`
  does the in-memory role check + one port call; drop the `CurrentCustomer` dependency.
- Tests: `CustomerAccountRecoveryIT`, `SsoAccountVerifiedIT`,
  `CustomerAccountServiceTest` (+ its fake store), `WebSliceStubs` — re-point to the
  new method; add the AC-2/AC-3 cases.

---

## Phase 1 — module: the by-email read (red→green)

**Files:** Modify the four `customer`-module files + `CustomerAccountServiceTest`,
`CustomerAccountRecoveryIT`, `SsoAccountVerifiedIT`.

- [ ] **Step 1:** Re-point `CustomerAccountServiceTest`'s verified tests to
  `emailVerifiedFor` + add AC-2 (unknown → empty) and AC-3 (normalization) cases → red
  (method missing).
- [ ] **Step 2:** Swap the port + store signatures, implement in service
  (`store.emailVerifiedFor(Emails.normalize(email))`) and adapter
  (`SELECT email_verified FROM customer_account WHERE email = :email` → `.optional()`).
- [ ] **Step 3:** Scoped run: `CustomerAccountServiceTest` green;
  `CustomerAccountRecoveryIT` + `SsoAccountVerifiedIT` re-pointed and green (if Docker
  is available in-session; otherwise they skip and CI proves them).
- [ ] **Step 4:** Structural net: `ModularityTests`, `JdbcOnlyArchitectureTests`,
  `PackageShapeArchitectureTests` green (api surface changed).

## Phase 2 — edge: one round trip on /api/auth/me (red→green)

**Files:** Modify `CustomerRecovery.java`, `AuthController.java`, `WebSliceStubs.java`.

- [ ] **Step 1:** Re-point `WebSliceStubs`' recovery stub; rewrite `verifiedStatus` to
  role-check + `recovery.verifiedFor(name)`; drop `currentCustomer` from
  `AuthController`.
- [ ] **Step 2:** Scoped run: the auth web-slice tests + `EmailVerificationIT` (AC-4).
- [ ] **Step 3:** Generalization audit: search for other edge call sites chaining
  `accountFor` into a second by-id read; log the outcome below.
- [ ] **Step 4:** Commit + push; check the push's CI run before the next stage.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | Phase 2 (the double-read fix) | other edge call sites chaining `accountFor` into a second by-id read | `grep -rn "currentCustomer" platform/src/main/java` | `MyAccountController` (x2), `MyErasureController`, `BookingController`, `MyBookingsController` | skip — each needs the `CustomerAccountId` itself (passed into module ports), not a second lookup by it; only `verifiedStatus` discarded the id. No other redundant chain. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-2/AC-3:** scoped gradle run on `CustomerAccountServiceTest` (12/12) +
  `CustomerAccountRecoveryIT` (5/5, skipped=0, real Postgres) → PASS.
- [x] **AC-4:** `EmailVerificationIT` → PASS (4/4, skipped=0, in-session Docker).
- [x] **AC-5:** `AuthSessionIT` (6/6) — operator `/me` now pins `emailVerified: null`;
  `CustomerLoginIT` (3/3), `SsoAccountVerifiedIT` (3/3) → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (read-only identity query).
- [ ] Pool + cutoff rules not in scope (invariants #3, #4).
- [ ] **Modulith** section filled; api-surface swap verified by `ModularityTests` (invariant #11).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy not in scope (invariant #10).
- [ ] Timezone not in scope (invariant #6) — no timestamp handling.
- [ ] Booking codes not in scope (invariant #7).
- [ ] No schema change → no Flyway migration (invariant #12).
- [ ] **Frontend** N/A — contract unchanged.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — cites `merged via PR #NN` once the PR exists.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 plus `riviera-review-overlay`.
