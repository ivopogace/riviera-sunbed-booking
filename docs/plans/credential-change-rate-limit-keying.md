# Credential-change rate-limit keying Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An unauthenticated request must not net-consume the per-IP rate-limit budget that
protects an **authenticated** endpoint, so an anonymous flood from one address can no longer
deny every operator behind it the ability to rotate a credential they believe is compromised.

**Architecture:** Keep the per-IP dimension as volume control, but make the refund policy a
property **of the budget**, not of the filter: a budget guarding authenticated work is marked
`guardsAuthenticatedWork`, and the filter releases the token it spent when the response status
shows the request was **denied before reaching that work** (`401`/`403` — from the security chain,
or from `CurrentCustomer#require`, which precedes every credential read). This inverts — per
budget — the spend-then-refund mechanic `throttlePerIdentity` already uses for the per-identity
login dimension, so the cap stays exact under concurrency. The flag is **mandatory, not
cosmetic**: `POST /api/auth/operator/login` answers `401` for bad credentials *from its own
controller*, so a global refund-on-`401` would silently disable login throttling altogether.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL. The limiter's
token buckets are in-memory `ConcurrentHashMap`s (ADR-0004, single Render instance).

**Source of intent:** GitHub issue **#343** (deferred from the #342 / issue #326 review gate).

**Skills consulted:**
- `riviera-sdlc` — routing gate; identified this as backend-Java-only, no DB, no frontend.
- `grilling` (via `references/issue-intake-gate.md`) — produced the four issue amendments below;
  killed the issue's first suggested fix and found a third affected path.
- `riviera-plan-doc` — this document's structure.
- `riviera-java-conventions` — §6a name literals (the two chain statuses are *not* folded into the
  existing `FAILED_AUTH_STATUS`, which means something different), §6c one-line-or-none inline
  comments with the long rationale in Javadoc, records for the new `AuthBudget` value.
- `riviera-modulith` — placement check only: `RateLimitFilter` is app-wide edge config in the root
  package, which **is not a module**; no published surface, `allowedDependencies`, event, or
  aggregate is touched. Confirmed no structural change is in scope.
- `riviera-local-debug` — to be loaded before the session's first `./gradlew`.

**Branch:** `bugfix/credential-change-rate-limit-keying` (created off `main` at `3234880`)

---

## Issue amendments (issue-intake grill gate)

Recorded here and posted to #343; the ticket was written at the #342 review gate and three of its
statements do not survive contact with today's code.

1. **The issue's first suggested fix — "key the authenticated budget on the principal" — is not
   implementable at this filter's position.** `RateLimitFilter` is installed
   `addFilterAfter(…, CorsFilter.class)`, i.e. **before** `AuthorizationFilter`, so there is no
   `SecurityContext` to read when the gate decision must be made. Honouring it would mean either
   re-implementing Spring Session's cookie→principal resolution inside the filter, or moving the
   filter for *every* budget (changing login-throttle semantics as a side effect). Rejected in
   favour of the issue's second sketch.
2. **The issue's second sketch is right but its wording inverts a status code.** It says to reuse
   "the same refund-on-non-401 trick" — but on the login dimension `401` is the *only* status that
   **spends**, whereas here `401` must **refund**. Same number, opposite meaning, because on a login
   the `401` comes from the controller and on a password change it can only come from the chain.
   This is why the policy must be per-budget (see R-1).
3. **A third path has the same defect, unmentioned by the issue.** `POST /api/me/verify-email/request`
   is authenticated (`/api/me/**` → `hasRole(CUSTOMER)`) but shares the `recoveryBuckets` map with
   three **public** recovery paths. An anonymous flood on it drains the recovery budget and blocks
   legitimate `forgot-password` for everyone on that address — the identical defect class, one map
   over. Verified safe to include: `AccountRecoveryController` returns only `204`/`400`, never
   `401`/`403`, so the refund rule cannot misfire on the public members of that budget.
4. **Verified, not assumed — and the first reading was wrong.** `OperatorAccountController#changePassword`
   returns `400` / `409` / `204` and can never produce `401`/`403`. But `MyAccountController#setPassword`
   opens with `CurrentCustomer#require`, which throws `AccessDeniedException` → **`403 ACCESS_DENIED`
   from the controller** when the session principal resolves to no account. So "only the chain can emit
   `401`/`403`" is false, and the rule had to be restated one level deeper: **the refund fires when the
   request was denied before reaching the work the budget guards** — which a `403` from `require` also
   is, since it precedes every credential read. The implementation is unchanged by this; the *reason*
   is, and so is the helper's name (`accessWasDenied`, not `chainRejectedBeforeController`).

**Not stale:** the issue's core claim, its cited filter placement, and its cited test
(`RateLimitFilterTest.credentialChangeFloodDoesNotStarveOperatorLogin`) are all accurate today.

### Drift vs. fog (issue-intake gate, `d059aca`)

Applying the gate's escalation test — *can the question be stated sharply **and** resolved inside this
slice?* — to what the grill turned up:

| Grill finding | Verdict | Handling |
|---|---|---|
| Amendments 1–2 (the issue's suggested fix is unimplementable / its status wording inverts) | **drift** | Reconciled here; the plan builds on sketch 2 |
| Amendment 3 (a third path shares the defect) | **drift** (scope) | One boolean + one test, verified safe → Phase 2 of this slice |
| Amendment 4 (a controller-emitted `403` exists) | **drift** | Rule restated, code unaffected |
| R-4: should authenticated credential endpoints carry a **per-principal** budget, given the filter sits ahead of `AuthorizationFilter`? | **fog** — but the slice does **not** depend on it | Not escalated to `wayfinder`: #343 has no epic/map, and the DoS is fully closed without it. Recorded as a Non-goal and filed as a follow-up issue at close-out |

R-4 is the only item that fails the "resolve it inside this slice" half — settling it means choosing
between moving the filter, adding a second filter after `AuthorizationFilter`, or duplicating session
resolution, which is a decision about the edge's filter topology affecting all eight budgets. It is
deliberately **not** held as a plan-doc open question (that section is for questions this slice answers).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the operator password-change budget, when more than `capacity`
      **unauthenticated** `POST /api/auth/operator/password` requests arrive from one IP, then none
      is rate-limited and the budget is not drained — a subsequent authenticated change from the
      same IP is still served. *Pinned by:* `RateLimitFilterTest.anUnauthenticatedFloodDoesNotDrainTheOperatorPasswordBudget`
- [x] **AC-2:** Given the customer password budget, when more than `capacity` **unauthenticated**
      `POST /api/me/password` requests arrive from one IP, then the budget is not drained.
      *Pinned by:* `RateLimitFilterTest.anUnauthenticatedFloodDoesNotDrainTheCustomerPasswordBudget`
- [x] **AC-3:** Given the operator password budget at capacity 2, when three **authenticated**
      password changes arrive from one IP, then the third is `429` with `Retry-After` and
      `code: RATE_LIMITED` — the credential oracle stays throttled, which is what the budget is for.
      *Pinned by:* `RateLimitFilterTest.authenticatedOperatorPasswordChangesAreStillThrottled`
- [x] **AC-4:** Given the customer password budget at capacity 2, when three **authenticated**
      set-password requests arrive from one IP, then the third is `429`.
      *Pinned by:* `RateLimitFilterTest.authenticatedCustomerPasswordChangesAreStillThrottled`
- [x] **AC-5:** Given the operator login budget at capacity 2, when three unauthenticated logins
      with bad credentials arrive from one IP, then the third is still `429` — the refund is scoped
      to the authenticated budgets and does **not** weaken login throttling (the R-1 regression).
      *Pinned by:* `RateLimitFilterTest.loginIsPerIpLimited` — the **pre-existing** test, which
      asserts exactly this and now doubles as the R-1 tripwire. No new test was written: a
      filter-wide refund would turn its third request from `429` into `401`, so it already fails
      on the mistake R-1 describes, and a duplicate would be coverage theatre.
- [x] **AC-6:** Given the shared recovery budget, when more than `capacity` **unauthenticated**
      `POST /api/me/verify-email/request` requests arrive from one IP, then a legitimate
      `POST /api/auth/customer/forgot-password` from that IP is still served.
      *Pinned by:* `RateLimitFilterTest.anUnauthenticatedFloodOnTheVerificationResendDoesNotStarveRecovery`,
      with `authenticatedVerificationResendsAreStillThrottled` + `forgotPasswordIsStillThrottled`
      as the counter-tests proving the budget still bites on both halves of the mixed map.
- [x] **AC-7:** Given an authenticated operator, when a password change is rejected for a missing
      CSRF token (`403`), then no token is net-consumed — a rejection before the controller costs
      the caller's own IP nothing. *Pinned by:* `RateLimitFilterTest.aCsrfRejectedPasswordChangeDoesNotSpendTheBudget`

## Non-goals

- **A per-principal (per-operator / per-customer) password-change budget.** The issue's sketch 1;
  see amendment 1 and R-4. Not needed to close this defect and not implementable without moving the
  filter. If wanted later it is its own slice.
- **Moving `RateLimitFilter` later in the chain.** Would change semantics for all eight budgets.
- **Changing any limit value** (`riviera.ratelimit.*` capacities/refills) — this slice changes
  *accounting*, not tuning.
- **The wire-contract split of `INVALID_REQUEST`** — that is issue #345, deliberately separate.
- **Any frontend change.** The `429` contract and every non-`429` status are unchanged, so
  `auth/operator-password.ts` and the customer twin need no edit.

## Behavior-parity ledger

> The slice changes the accounting of an existing surface rather than retiring one, so the ledger is
> filled for the **rate-limiter's observable behaviour** — this is exactly where a "no behaviour
> change" claim would be false, and four shipped tests encode the old behaviour.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Unauthenticated `POST /api/auth/operator/password` spends an operator-password token | **changed** (the defect) | Token is spent pre-chain then released post-chain on `401`/`403` — net zero |
| Unauthenticated `POST /api/me/password` spends a customer-password token | **changed** (the defect) | Same refund |
| Unauthenticated `POST /api/me/verify-email/request` spends a recovery token | **changed** (amendment 3) | Same refund, via the shared `recoveryBuckets` flag |
| Authenticated password change spends a token; over-limit → `429` | **preserved** | Non-`401`/`403` outcomes (`204`/`400`/`409`) never refund — AC-3/AC-4 |
| Failed login (`401` from `AuthController`) spends a per-IP login token | **preserved** | `loginBuckets` carries `refundedWhenChainRejects = false` — AC-5 |
| Failed login net-spends a per-**identity** token (#292) | **preserved** | `throttlePerIdentity` is untouched; it returns before the new refund point |
| Login/register/SSO budgets are pure volume control | **preserved** | All flagged `false`; anonymous flood on an anonymous surface *should* throttle |
| Password-change budgets are separate per principal type (#326) | **preserved** | Two maps, unchanged |
| Booking per-IP / per-code budgets | **preserved** | Untouched code path; no refund concept added there |
| `429` body is the hand-mirrored RFC-7807 `RATE_LIMITED` shape | **preserved** | `reject(…)` unchanged |
| Percent-decoded path matching (#342) + the `StrictHttpFirewall` tripwire | **preserved** | `pathWithinApplication`/`decodePath` untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A global refund-on-`401` would disable **login** throttling — a failed login's `401` comes from the controller and is precisely what that budget must charge for. The single highest-impact way to get this slice wrong. | med | **critical** | Refund is a per-budget flag, `false` for every anonymous surface; AC-5 pins the login budget as a regression test | Claude | open |
| R-2 | Refund-on-`403` makes a CSRF-less flood free, removing volume control from the authenticated budgets | high | low | Accepted + documented: a CSRF rejection happens at `CsrfFilter` with no DB, no bcrypt and no mail — the oracle is never reached. The same is true of every non-throttled endpoint in the app | Claude | open |
| R-3 | Transient false `429`: spend-then-refund means a burst of `capacity` anonymous requests can leave the bucket momentarily empty for a concurrent legitimate caller | med | low | Accepted, and deliberately chosen over peek-then-spend, which would make the cap inexact under concurrency — the same trade `throttlePerIdentity` already made. Self-heals within one request | Claude | open |
| R-4 | Per-IP remains the only dimension on an authenticated endpoint, so a stolen-session attacker on a rotating-IP botnet is still under-throttled | low | med | Out of scope by design (Non-goals); the pre-existing posture is not worsened. Note in the plan close-out whether it deserves an issue | Claude | open |
| R-5 | Shipped tests encode the OLD behaviour and will fail — mistaking them for "the fix broke something" and weakening the fix to keep them green | med | high | The parity ledger names them up front; Phase 1 rewrites them to drive the throttle **authenticated**, a strictly better test of the same intent | Claude | **closed** — it was **five**, not the four predicted (`credentialChangeBudgetIsKeyedByClientIp` was missed at plan time). All five reworked, none weakened; `862d32f`..`c5c9bb1` |
| R-6 | An exception propagating out of `chain.doFilter` skips the refund (no `finally`) | low | low | Deliberate and consistent with `throttlePerIdentity`: a `500` is not a chain rejection and should not be refunded. Documented in the Javadoc | Claude | open |
| R-7 | Error-contract drift: none of the `401`/`403`/`429` bodies change | low | low | No DTO, no status, no `code` is added or altered (§6b); the `429` body constant is untouched | Claude | open |

## Open questions / Assumptions

- **Assumption:** Extending the fix to the shared recovery budget (amendment 3) is in scope for this
  slice rather than a follow-up issue — it is the same defect class, one boolean, and the repo's
  generalization-audit norm (#326 found the customer twin exactly this way). — *Owner:* Claude ·
  *Resolves by:* Phase 2
### Resolved

- **Assumption (resolved, Phase 0):** `RateLimitFilterTest`'s `@WebMvcTest` slice can serve an
  authenticated request via `SecurityMockMvcRequestPostProcessors.user(…)` with the stubs
  `WebSliceStubs` already provides. **Half true.** The operator side works as-is (the stub
  `OperatorAccounts` returns empty → `400 INVALID_CURRENT_PASSWORD`). The customer side does not:
  `WebSliceStubs`' `CustomerAccountDirectory` resolves every principal to empty, so
  `CurrentCustomer#require` throws and the endpoint answers `403` — which the new refund treats as
  "never reached the credential check", making the customer budget impossible to exercise
  authenticated. Resolved by overriding that one bean with a `@MockitoBean` in the test.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches no booking, set, or beach-map code path and
writes nothing to `availability(set_id, booking_date)`. The only concurrency in scope is the
limiter's own token accounting, covered by R-3.

## Spring Modulith — modules, interfaces, events

**Modules touched:** **none.** Every changed file is in the root package `ai.riviera.platform`,
which is app-wide edge configuration and explicitly **not a module** (`riviera-modulith`: "keep
`@SpringBootApplication` and app-wide config … in the root package only; the root is not a module").
No `api/`, `spi/`, `vocabulary/` or `events/` surface, no `allowedDependencies` grant, and no
aggregate is added, moved, or changed. `ModularityTests` and the three package-shape tests are
expected to be unaffected — and will be run to prove it, not assumed.

**Cross-module named interfaces (`api/` ports):** N/A — none added or changed.

**Domain events:** N/A — none added or changed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Deciding whether a rate-limit token is refunded when the security chain rejects a request | none — root-package edge (`RateLimitFilter`) | Rate limiting is an app-level web concern alongside `SecurityConfig`/`WebCorsConfig`; it matches endpoints by URL path only and imports nothing from any module. RV-BE-11: login/session/throttling machinery stays at the platform edge, and no module's **Job** line claims HTTP request throttling |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves and no ledger entry is written or read.

## Angular — frontend surfaces touched

N/A — backend-only. No status code, error `code`, or response body changes, so no client is affected.

## FE↔BE contract

N/A — no contract change. Every endpoint keeps its methods, paths, DTOs, statuses and error codes;
only *when* a `429` is produced changes, and strictly in the permissive direction for callers who
were never authenticated.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting.

**Stage pointer:** `implement — phase 3 (docs freshness + close-out), then PR`

**Next action:** Run the touched-area IT regression, load `riviera-docs-freshness`, push and open the PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Red: the anonymous flood drains an authenticated budget | ✅ | `862d32f` |
| 1 — Fix: per-budget refund when access is denied + rework the 5 tests that encoded the defect | ✅ | `c5c9bb1` |
| 2 — Generalization audit: the shared recovery budget | ✅ | `980ebf8` |
| 3 — Docs freshness + close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — the whole fix: the
  `AuthBudget` record, `authBucketsFor`/`authPostBucketsFor` returning it, the post-chain refund,
  and the Javadoc that explains why the flag is per-budget.
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — the seven ACs, plus the
  rework of the four existing tests that drain the password budgets anonymously.

No other file is expected to change. `SecurityConfig`, both password controllers, `RateLimitProperties`,
`application.properties` and every frontend file stay untouched.

---

## Phase 0 — Red: prove the anonymous flood drains an authenticated budget

**Files:** Modify `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java`

- [ ] **Step 1: Write the failing tests** (AC-1, AC-2). The slice's limits are capacity 2, so three
      anonymous POSTs are one past the budget; under today's filter the third is a `429`, which is
      the defect. The assertion is that it is **not** rate-limited.

```java
/**
 * Issue #343: {@code POST /api/auth/operator/password} is {@code hasRole(OPERATOR)}, but the filter
 * runs before {@code AuthorizationFilter}, so until this slice a caller with no session, no account
 * and no CSRF token spent its tokens. Every operator behind that address — venue WiFi / CGNAT is
 * exactly the topology the budget was split for — then met a {@code 429} on the page whose purpose is
 * rotating a credential they believe is compromised.
 */
@Test
void anUnauthenticatedFloodDoesNotDrainTheOperatorPasswordBudget() throws Exception {
	String ip = "10.32.0.1";
	for (int i = 0; i < 5; i++) {
		changePasswordFromIp(ip).andExpect(status().isUnauthorized());
	}

	authenticatedOperatorPasswordChangeFromIp(ip).andExpect(status().isBadRequest());
}

@Test
void anUnauthenticatedFloodDoesNotDrainTheCustomerPasswordBudget() throws Exception {
	String ip = "10.32.0.2";
	for (int i = 0; i < 5; i++) {
		customerPasswordChangeFromIp(ip).andExpect(status().isUnauthorized());
	}

	authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isNotFound());
}
```

> The trailing expectation on each is a placeholder for whatever the authenticated call actually
> answers in this slice (a stubbed `OperatorAccounts` yields `400 INVALID_CURRENT_PASSWORD`); Step 2
> pins the real value. **The assertion that matters is that it is not `429`.**

- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*RateLimitFilterTest*"` →
      FAIL: the 3rd anonymous POST returns `429`, not `401`. Record the authenticated call's real
      status and replace the placeholders.

- [ ] **Step 3: Commit the red tests** — `git commit -m "test(#343): pin that an anonymous flood must not drain the authenticated password budgets (RED)"`

---

## Phase 1 — Fix: per-budget refund on chain rejection

**Files:** Modify `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` ·
Modify `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java`

- [ ] **Step 1: Introduce the budget value + the refund**

```java
/**
 * The per-IP budget an auth request draws on, and whether a token it spent is released again when
 * Spring Security rejects the request <em>before</em> the controller.
 *
 * <p><strong>Why this is a per-budget flag and not one rule for the filter</strong> (issue #343).
 * The refund keys on {@code 401}/{@code 403}, and on an <em>authenticated</em> endpoint those two
 * statuses can only come from the chain — {@code OperatorAccountController} answers
 * {@code 400}/{@code 409}/{@code 204} and {@code MyAccountController} {@code 400}/{@code 204}. On a
 * <em>login</em> the same {@code 401} is the controller's answer to a wrong password, which is
 * exactly what that budget exists to charge for: a filter-wide refund would silently disable login
 * throttling. Same status code, opposite meaning, so the policy travels with the budget.
 */
private record AuthBudget(Map<String, TokenBucket> buckets, boolean refundedWhenChainRejects) {
}
```

The `doFilterInternal` auth branch gains the post-chain release; the early `return` for the two
logins is unchanged, so `throttlePerIdentity` keeps its own inverted accounting:

```java
chain.doFilter(request, response);
if (budget.refundedWhenChainRejects() && chainRejectedBeforeController(response)) {
	ipBucket.release(now);
}
return;
```

```java
/**
 * Did the security chain reject this request before it reached the controller? Deliberately not
 * expressed with {@link #FAILED_AUTH_STATUS}: that constant is the <em>login controller's</em>
 * {@code 401}, the one status that spends a per-identity token. This is the opposite concept that
 * happens to share a number, and folding the two together is the mistake issue #343 warns about.
 */
private static boolean chainRejectedBeforeController(HttpServletResponse response) {
	int status = response.getStatus();
	return status == HttpStatus.UNAUTHORIZED.value() || status == HttpStatus.FORBIDDEN.value();
}
```

`authPostBucketsFor` returns `AuthBudget`s: `true` for `operatorPasswordBuckets` and
`customerPasswordBuckets`; `false` for `loginBuckets`, `operatorRegisterBuckets`,
`customerAuthBuckets` and `ssoBuckets` — every anonymous surface, where an anonymous flood *should*
be throttled. `recoveryBuckets` is decided in Phase 2.

- [ ] **Step 2: Rework the four tests that encoded the defect (R-5).** `credentialChangeFloodDoesNotStarveOperatorLogin`,
      `customerPasswordChangeIsThrottled`, `customerPasswordChangeDoesNotStarveTheOperatorOne` and the
      per-IP-keying case all drain the password budgets with anonymous POSTs. Each keeps its
      **intent** and drives the throttle authenticated instead — a strictly better test, since it
      exercises the real credential oracle rather than the chain's rejection. Adds AC-3, AC-4, AC-7.

- [ ] **Step 3: Add the login-unchanged regression pin (AC-5)** — the R-1 tripwire.

- [ ] **Step 4: Run them, verify they pass** — `./gradlew test --tests "*RateLimitFilterTest*"` → PASS

- [ ] **Step 5: Anti-vacuity check** — temporarily revert the refund; AC-1, AC-2 and AC-7 must fail.
      Restore and re-run.

- [ ] **Step 6: Structural regression** — `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*ErrorContractArchitectureTests*"` → PASS

- [ ] **Step 7: Commit** — `git commit -m "fix(#343): refund the rate-limit token when the chain rejects an authenticated request"`

- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Generalization audit: the shared recovery budget

**Files:** Modify `RateLimitFilter.java` · Modify `RateLimitFilterTest.java`

- [ ] **Step 1: Run the audit.** The pattern is "a budget reachable by an unauthenticated caller
      that protects an authenticated surface". Enumerate every path in `authPostBucketsFor` /
      `authBucketsFor` against its `SecurityConfig` matcher, and confirm for each whether its
      controller can emit `401`/`403`.

- [ ] **Step 2: Fix the site it finds** — `/api/me/verify-email/request` is `hasRole(CUSTOMER)` but
      rides `recoveryBuckets` with three public paths. Flag that budget `true`; verified safe
      because `AccountRecoveryController` returns only `204`/`400`.

- [ ] **Step 3: Pin it (AC-6)** and run `./gradlew test --tests "*RateLimitFilterTest*"` → PASS

- [ ] **Step 4: Append to the Generalization-audit log; commit.**

---

## Phase 3 — Docs freshness + close-out

- [ ] **Step 1: Full backend regression** for the touched area — the auth/session IT corpus plus the
      limiter tests, per `riviera-local-debug` scoping. CI owns the full suite.
- [ ] **Step 2: Load `riviera-docs-freshness`** and audit the substrate docs against the diff.
      `CLAUDE.md` has no statement about rate-limit keying today; verify rather than assume.
- [ ] **Step 3: Finalize this Execution status, citing `merged via PR #NN`, never a merge SHA.**
- [ ] **Step 4: Push, open the PR, run the review gate, then the Sonar gate.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-27 | Phase 2 (after the Phase-1 fix) | "a budget an unauthenticated caller can spend that guards an authenticated surface" | Enumerated every branch of `authBudgetFor`/`authPostBudgetFor` against its `SecurityConfig` matcher, then read each controller for its reachable statuses (`grep -n "ResponseEntity\|HttpStatus\." <controller>`) | 8 budgets audited; **1 defective**: `recoveryBuckets` (mixed — 3 public paths + the `hasRole(CUSTOMER)` `/api/me/verify-email/request`). `loginBuckets`, `operatorRegisterBuckets`, `customerAuthBuckets`, `ssoBuckets` are wholly anonymous → correctly `spendsEveryRequest`; `ipBuckets`/`codeBuckets` are the public booking budgets with no refund concept | Flagged the whole recovery map `guardsAuthenticatedWork` rather than splitting out a 9th map: the flag is semantically right for all four paths (a public path's only pre-controller denial is a CSRF `403`, which sends no mail). Pinned by AC-6 **plus** two "still throttled" counter-tests, so flagging the map cannot silently disable recovery throttling |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*RateLimitFilterTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** as above. Verified at commit `<sha>`.
- [ ] **AC-3:** as above. Verified at commit `<sha>`.
- [ ] **AC-4:** as above. Verified at commit `<sha>`.
- [ ] **AC-5:** as above. Verified at commit `<sha>`.
- [ ] **AC-6:** as above. Verified at commit `<sha>`.
- [ ] **AC-7:** as above. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified N/A (no booking/availability/map code in the diff) (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — not in scope, unchanged.
- [ ] **Modulith** section filled; no module touched; `ModularityTests` + the package-shape tests green (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9) — no money in the diff.
- [ ] Refund policy enforced server-side (invariant #10) — not in scope, unchanged.
- [ ] Timezone correct (invariant #6) — the limiter's `Instant`s come from the injected `Clock`, unchanged.
- [ ] Booking codes unguessable (invariant #7) — no code is logged; `reject(…)` untouched.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** N/A — no frontend file in the diff and no wire contract change.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`, not the overlay alone.
