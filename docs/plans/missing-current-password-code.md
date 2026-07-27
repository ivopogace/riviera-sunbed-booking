# `MISSING_CURRENT_PASSWORD` — a stable code for the omitted current password

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both self-service password endpoints answer a **distinct, stable `MISSING_CURRENT_PASSWORD`**
when the caller omits the current password, so no API consumer is told its perfectly-good new password
is the wrong length (operator) or that a password it never sent is "incorrect" (customer).

**Architecture:** The single significant decision is **where the presence check lives**. It moves out of
`ChangePasswordRequest`'s compact constructor — where it threw `IllegalArgumentException` and was swallowed
by the global advice's one `INVALID_REQUEST` — and becomes a **typed outcome returned by the controller**
via `ApiProblem.response(...)`, next to the `INVALID_CURRENT_PASSWORD` / `BOOTSTRAP_CREDENTIAL_MANAGED` /
`ACCOUNT_NOT_ACTIVE` answers that endpoint already returns that way. No new `@ExceptionHandler`, no new
exception type: `riviera-java-conventions` §6 says an expected, caller-handled fault is a value, and §6b
keeps status mapping in the controller/advice — the record keeps the *shape* knowledge as a predicate
(`CustomerPasswords.isSupplied`), shared by both endpoints so the twins cannot drift.

**Persistence:** JDBC only (invariant #1). **No tables and no migration** — this slice changes only the
wire vocabulary of two edge controllers.

**Source of intent:** GitHub issue **#345** (deferred from the #342 review gate, which itself came out of
#326). Related but out of scope: **#118** (typed edge-validation exception).

**Skills consulted:**
- `riviera-sdlc` — drove the loop; its issue-intake grill gate surfaced the drift in §Open questions (resolved).
- `riviera-plan-doc` — this document's structure and the Execution-status anchor.
- `riviera-java-conventions` (+ `references/error-contract.md`) — **changed the design**: replaced the
  first-draft "new exception type mapped in `ApiErrorHandler`" with a controller-returned typed outcome
  built by `ApiProblem`, per §6 (typed outcomes for expected flows) and §6b (per-controller
  `@ExceptionHandler`s are forbidden; presence checks live at the edge, status mapping in the controller).
- `riviera-modulith` — confirmed the whole change is **root-package edge machinery** (`SecurityConfig`
  neighbourhood, RV-BE-11): no module, no `api/`/`spi/`/`events/` surface, no `allowedDependencies` edit,
  so `ModularityTests` is a regression check rather than a design constraint.
- `riviera-frontend` — placement: the new shared message constant belongs in `core/` (cross-cutting auth
  state), not in either `auth/` page; the two pages stay feature-local consumers.
- `angular-developer` + angular-cli MCP `get_best_practices` (workspace `frontend/`, v22) — confirmed the
  signal/`@Service`/inline-`switch` idioms already in these files are current; no API drift to correct.
- `playwright-cli` — the e2e is authored as a *render* of the new branch on the customer page (the operator
  page guards client-side, so its branch is unreachable from the UI); mocks keep mirroring the controller.
- `riviera-local-debug` — the scoped-test recipe used for every command in the phases below.
- `riviera-review-overlay` — at the review gate (RV-BE-11 edge placement, RV-FE-E2E suite choice, RV-STYLE-1).

**Branch:** `feature/missing-current-password-code` — created before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in, ACTIVE operator, when a password change arrives with an **empty or
  absent** `currentPassword` and a policy-valid `newPassword`, then the endpoint answers
  `400` with `code == "MISSING_CURRENT_PASSWORD"`, and **neither** the credential write **nor** the session
  revoke happens. *Pinned by:* `OperatorAccountControllerTest.reportsAnOmittedCurrentPasswordDistinctly`

- [ ] **AC-2:** Given the same operator, when **both** faults are present (blank `currentPassword` **and** a
  `newPassword` below the policy minimum), then the answer is `MISSING_CURRENT_PASSWORD` — the omitted field
  outranks the policy check, matching the order the page itself validates in.
  *Pinned by:* `OperatorAccountControllerTest.anOmittedCurrentPasswordOutranksTheNewPasswordPolicy`

- [ ] **AC-3 (regression):** Given a supplied, correct `currentPassword` and a `newPassword` below the
  policy, then the answer is still `400 INVALID_REQUEST` — the code this slice splits **keeps** its
  new-password meaning. *Pinned by:* `OperatorAccountControllerTest.rejectsWeakNewPassword` (existing)

- [ ] **AC-4:** Given a customer account that **has** a local password, when `POST /api/me/password` arrives
  with an empty or absent `currentPassword`, then the answer is `400 MISSING_CURRENT_PASSWORD` (previously
  `INVALID_CURRENT_PASSWORD`) and the stored credential is unchanged.
  *Pinned by:* `SetPasswordIT.existingPasswordAccountReportsAnOmittedCurrentPasswordDistinctly`

- [ ] **AC-5 (regression):** Given an **SSO-only** account (no stored credential), when the same request
  arrives with no `currentPassword`, then it still succeeds (`204`) and sets the first password — the F-1
  behaviour is untouched. *Pinned by:* `SetPasswordIT.ssoOnlyAccountSetsFirstPasswordThenCanLogin` (existing)

- [ ] **AC-6:** Given the backend answers `MISSING_CURRENT_PASSWORD`, when either Angular auth service maps
  it, then the result is a distinct `'missing-current'` variant carrying *"Enter your current password."* —
  never the 8–72 length message and never *"incorrect"*.
  *Pinned by:* `operator-auth.spec.ts` + `customer-auth.spec.ts` (`maps MISSING_CURRENT_PASSWORD …`)

- [ ] **AC-7:** Given a real render of the customer account page for an account that has a password, when the
  current-password field is left blank and the form submitted, then the page shows *"Enter your current
  password."* and nothing is rotated (the old password still signs in).
  *Pinned by:* `customer-password.e2e.ts` → *"a blank current password is reported as missing, not incorrect"*

## Non-goals

- **#118 (typed edge-validation exception).** The global `IllegalArgumentException → 400 INVALID_REQUEST`
  mapping stays exactly as it is. This slice removes *one* fault from that funnel; it does not narrow the
  funnel. (It does shrink #118's blast radius on these two DTOs — noted there, not fixed here.)
- **No new code for a blank `newPassword`.** It stays `INVALID_REQUEST`, because the message it produces
  ("Choose a password of 8–72 characters.") is *correct* for an empty password — there is no conflation.
- **No removal of the client-side guard** in `operator-password.ts`. Since #343 every attempt spends a
  rate-limit token, so pre-empting a round-trip is worth keeping; only its stale justifying comment changes.
- **No re-wording of the other password codes** (`INVALID_CURRENT_PASSWORD`, `ACCOUNT_NOT_ACTIVE`,
  `BOOTSTRAP_CREDENTIAL_MANAGED`) and no change to statuses, rate-limit budgets, or session revocation.
- **No `/api/auth/customer/reset-password` change** — a token redemption has no current password to omit.

## Behavior-parity ledger

> The slice re-labels two existing error branches rather than retiring a surface, so the ledger covers those
> branches only.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Operator: blank `currentPassword` → `IllegalArgumentException` from the record's compact constructor → `400 INVALID_REQUEST` | **changed** (the point of the slice) | Controller returns `400 MISSING_CURRENT_PASSWORD` via `ApiProblem`; the constructor keeps only its `newPassword` presence check |
| Operator: blank/absent `newPassword` → `400 INVALID_REQUEST` | preserved | Compact constructor still throws `IllegalArgumentException`; global advice unchanged |
| Operator: `newPassword` below policy → `400 INVALID_REQUEST` | preserved | `CustomerPasswords.validate` unchanged, still ahead of the credential read |
| Operator: policy check runs **before** the stored credential is read (#342 review finding) | preserved | Order is now `bootstrap-guard → missing-current → policy → credential read`; the new branch reads no credential, so "policy before credential" still holds |
| Operator: wrong `currentPassword` → `400 INVALID_CURRENT_PASSWORD`, no revoke, no write | preserved | Untouched branch |
| Customer: account **with** a password + blank/absent `currentPassword` → `400 INVALID_CURRENT_PASSWORD` | **changed** (maintainer decision, this session) | Now `400 MISSING_CURRENT_PASSWORD`; `INVALID_CURRENT_PASSWORD` keeps the *supplied-but-wrong* meaning only |
| Customer: SSO-only account + no `currentPassword` → `204`, first password set | preserved | The new branch is nested inside `existing.isPresent()`, so an SSO-only account never reaches it |
| Customer: `newPassword` below policy → `400 INVALID_REQUEST` | preserved | `CustomerPasswords.validate` unchanged, still before the account lookup |
| Both: ordered encode → revoke → write → rotate (#344) | preserved | The new branch returns before the encode; no effect ordering changes |
| FE operator page: blank current caught client-side, no request spent | preserved | Guard kept; only its comment is corrected |
| FE customer page: blank current on a password-holding account showed *"The current password is incorrect."* | **changed** | New `'missing-current'` case shows *"Enter your current password."* |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **A client not updated in this slice silently degrades**: `customer-auth.setPassword` maps every non-`INVALID_CURRENT_PASSWORD` 400 to `'invalid-password'`, so an un-updated FE would show the *length* message for the new code — the exact bug #345 reports, relocated | high if FE skipped | med | FE mapping ships in the **same** slice (Phase 2, AC-6); both services get a spec asserting the new code maps to `'missing-current'` | agent | open |
| R-2 | **Mock/controller drift** in `e2e/support/auth-mocks.ts` — #342's review already caught the mocked suite staying green through a real controller reordering | med | med | Phase 3 updates both mock routes in the same branch order as the controllers and keeps the existing "branch order mirrors the controller" comment accurate | agent | open |
| R-3 | **Relaxing the compact constructor weakens the record's invariant** — a `ChangePasswordRequest` can now hold a null `currentPassword`, so a future caller could skip the controller's check | low | med | Only one call site exists (the endpoint's own `@RequestBody`); the shared `CustomerPasswords.isSupplied` predicate is the single definition of "supplied" for both endpoints, and AC-1/AC-2 pin the behaviour | agent | open |
| R-4 | **Twin drift** — the operator and customer branches are deliberate mirrors and have drifted before (#344 wrote the ordering rationale on one and cross-referenced it from the other) | med | low | One shared predicate + one shared FE message constant + cross-referencing javadoc on both controllers | agent | open |
| R-5 | **Error-contract regression**: a hand-rolled body instead of `ApiProblem`, or a per-controller `@ExceptionHandler` | low | med | Both new branches use `ApiProblem.response`; `ErrorContractArchitectureTests` fails the build otherwise | agent | open |
| R-6 | **Simplifying `MyAccountController.currentPasswordMatches`** (its null guard becomes unreachable once the presence check runs first) could unguard a genuinely-null field if the branches are later reordered | low | med | The check stays *nested inside* `existing.isPresent()` directly above the match, so the guarantee is local and readable; AC-4 pins it | agent | open |
| R-7 | Adding a code to a **published contract** without recording it — the #97 vocabulary list is already stale (it predates `INVALID_CURRENT_PASSWORD`, `ACCOUNT_NOT_ACTIVE`, `BOOTSTRAP_CREDENTIAL_MANAGED`) | med | low | Phase 4 records the new code in this plan's FE↔BE contract section and appends the codes added since #97 to `docs/plans/error-contract-problemdetail.md`'s vocabulary list | agent | open |

## Open questions / Assumptions

*(none open — see Resolved)*

### Resolved

- **Open question (issue-intake grill): does #345's described defect actually exist on `/api/me/password`?**
  **No — the symptom differs.** `SetPasswordRequest`'s compact constructor only requires `newPassword`, and
  `JdbcCustomerAccounts.findByEmail` filters `password_hash IS NOT NULL`, so a blank `currentPassword` on an
  account that *has* a password falls through to `currentPasswordMatches` → `INVALID_CURRENT_PASSWORD`
  (*"The current password is incorrect."*), never `INVALID_REQUEST`. Applying the issue's "alike" therefore
  means **re-labelling an existing code** on that endpoint, not splitting `INVALID_REQUEST`. — *Resolved by
  the maintainer this session:* **fix both endpoints**; the small extra contract delta (the blank case moves
  out from under `INVALID_CURRENT_PASSWORD`) is accepted so the twins answer one code with one meaning.
- **Assumption: no consumer outside this repo switches on `INVALID_CURRENT_PASSWORD`.** The API is
  same-origin and served to this repo's SPA only (#110); the only two readers are
  `core/operator-auth.ts` and `core/customer-auth.ts`, both updated in Phase 2. — *Verified by grep at
  plan time.*
- **Open question: which branch wins when both faults are present?** The omitted current password.
  It preserves today's operator behaviour (the compact constructor ran before the method body), it matches
  the order `operator-password.ts` validates its own fields in, and it keeps "policy before credential read"
  intact because the new branch reads no credential. — Pinned by AC-2 so it can't silently flip.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` row, no booking, no beach map,
no cutoff arithmetic is read or written on either code path; the slice's entire effect is which error `code`
string an already-rejected request carries.

## Spring Modulith — modules, interfaces, events

**Modules touched: none.** Every changed Java file lives in the **root package** `ai.riviera.platform`, which
is not a module — login/session/credential machinery stays at the platform edge (RV-BE-11), pinned by
`OperatorAuthPlacementTests` / `CustomerAuthPlacementTests`.

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | *(none)* | — | — | Edge-only change: `OperatorAccountController`, `MyAccountController`, `CustomerPasswords`, all root-package |

**Cross-module named interfaces (`api/` ports):** none added or changed. The controllers keep calling the
existing `operator.api.OperatorAccounts` / `OperatorProvisioning` and `customer.api.CustomerAccounts` ports
with unchanged signatures.

**Domain events:** none. No event is published, consumed, moved, or renamed — no Flyway `event_type` rewrite.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide that an omitted current password is a distinct client fault, and name it on the wire | **root package (platform edge)** | `RESPONSIBILITIES.md` puts credential verification, session handling and HTTP error mapping at the edge; `operator`'s and `customer`'s Not-My-Job lists both reject encoding/verifying credentials and owning login machinery — they store an **opaque hash** only. No module gains or loses behaviour. |
| The shared "was a current password supplied?" predicate | **root package** (`CustomerPasswords`) | Already the shared edge helper both controllers call for `validate(...)`; keeping the predicate beside it is what stops the operator/customer twins drifting (R-4). |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money, ledger, Stripe call, or refund decision is touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/customer-auth.ts` | existing | `@Service` on `SessionAuth` | signals (unchanged) | — |
| FE-2 | `core/operator-auth.ts` | existing | `@Service` on `SessionAuth` | signals (unchanged) | — |
| FE-3 | `auth/set-password.ts` | existing | standalone component | `signal` error/notice | Signal Forms (unchanged) |
| FE-4 | `auth/operator-password.ts` | existing | standalone component | `signal` error/notice | Signal Forms (unchanged) |
| FE-5 | `e2e/support/auth-mocks.ts` | existing | Playwright route mock | — | — |

**Standards:** no template, styling, or reactivity change — the diff is a union-type member, two `switch`
arms, one shared message constant, and comment corrections. Existing standalone/`inject()`/`@if` idioms are
untouched; the angular-cli MCP best-practices guide (v22) confirmed nothing in these files is stale. No new
image, no `NgOptimizedImage` need. **`riviera-tailwind` not loaded — no class, token, or SCSS is touched**
(the messages render into the existing `[data-testid="setpw-error"]` / `oppw-error` elements).

## FE↔BE contract

- **New/changed endpoints:** none. Two endpoints gain one error code:
  - `POST /api/auth/operator/password` — `400 MISSING_CURRENT_PASSWORD` (**new**), taken *from* the set of
    cases that answered `INVALID_REQUEST`.
  - `POST /api/me/password` — `400 MISSING_CURRENT_PASSWORD` (**new**), taken *from* the set of cases that
    answered `INVALID_CURRENT_PASSWORD`.
- **Body shape unchanged:** the standard `ProblemDetail` —
  `{"type":"about:blank","title":"Bad Request","status":400,"detail":"Enter your current password.","code":"MISSING_CURRENT_PASSWORD","instance":"about:blank"}`,
  `Content-Type: application/problem+json`, built by `ApiProblem`.
- **`INVALID_CURRENT_PASSWORD` narrows** to "a current password was supplied and it was wrong".
  `INVALID_REQUEST` keeps every other malformed-body meaning.
- **Request DTOs are wire-compatible:** `currentPassword` was already an optional JSON field on
  `/api/me/password` and becomes tolerated-but-rejected on the operator one; no client has to change its body.
- **Client typing:** hand-written — both services read `code` through the existing typed
  `{ code?: string }` cast; each `Result` union gains a `'missing-current'` member. No `as any`.
- **Money/date on the wire:** unchanged (none in scope).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session, re-read it
> (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** Phase 0 step 1 — add the two failing tests to `OperatorAccountControllerTest`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend: operator endpoint answers `MISSING_CURRENT_PASSWORD` | | |
| 1 — Backend: the customer twin | | |
| 2 — Frontend: both auth services + both pages map the new code | | |
| 3 — e2e: mocks mirror the controllers + a real render of the new branch | | |
| 4 — Docs sweep + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/CustomerPasswords.java` — gains `isSupplied(String)`, the one
  definition of "a current password was supplied" for both endpoints.
- `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — compact constructor drops the
  `currentPassword` check; `changePassword` gains the `MISSING_CURRENT_PASSWORD` branch.
- `platform/src/main/java/ai/riviera/platform/MyAccountController.java` — `setPassword` nests the
  missing-vs-incorrect decision inside the `existing.isPresent()` branch.
- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — AC-1, AC-2.
- `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java` — AC-4.
- `frontend/src/app/core/customer-auth.ts` — `'missing-current'` result + `CURRENT_PASSWORD_REQUIRED_MESSAGE`.
- `frontend/src/app/core/operator-auth.ts` — `'missing-current'` result; aliases the shared message.
- `frontend/src/app/auth/set-password.ts` — the new `switch` arm.
- `frontend/src/app/auth/operator-password.ts` — corrected comment on the client-side guard.
- `frontend/src/app/core/customer-auth.spec.ts`, `core/operator-auth.spec.ts`, `auth/set-password.spec.ts` — AC-6.
- `frontend/e2e/support/auth-mocks.ts` — both password routes gain the branch, in controller order.
- `frontend/e2e/customer-password.e2e.ts` — AC-7.
- `docs/plans/error-contract-problemdetail.md` — vocabulary list catch-up (R-7).

---

## Phase 0 — Backend: the operator endpoint answers `MISSING_CURRENT_PASSWORD`

**Files:** Modify `platform/src/main/java/ai/riviera/platform/CustomerPasswords.java` ·
`platform/src/main/java/ai/riviera/platform/OperatorAccountController.java:71-78,109-134` ·
Test `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java`

- [ ] **Step 1: Write the failing tests**

```java
	/**
	 * AC-1 (#345): the omitted current password is its own fault, not a new-password policy violation. Until
	 * this slice the record's compact constructor threw {@link IllegalArgumentException} for it, and the global
	 * advice funnelled that into the same {@code INVALID_REQUEST} a weak new password produces — so a caller
	 * whose 20-character new password was fine was told to choose one of 8–72 characters.
	 */
	@Test
	void reportsAnOmittedCurrentPasswordDistinctly() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD))
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"newPassword": "%s"}""".formatted(NEW_PASSWORD)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"));

		mvc.perform(isolated(post(CHANGE_PASSWORD))
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("", NEW_PASSWORD)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	/**
	 * AC-2: with both fields wrong the missing one wins — the order the page validates in, and the order the
	 * compact constructor enforced before this slice. Pinned so a later reordering cannot silently revive the
	 * "your new password is the wrong length" answer for a caller who never filled the current-password field.
	 */
	@Test
	void anOmittedCurrentPasswordOutranksTheNewPasswordPolicy() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD))
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("", "short")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"));

		verify(provisioning, never()).setPassword(anyString(), anyString());
	}
```

- [ ] **Step 2: Run them, verify they fail** —
  `gradle test --tests "*OperatorAccountControllerTest*"` → FAIL: both expect
  `MISSING_CURRENT_PASSWORD` but the body is `INVALID_REQUEST`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation**

`CustomerPasswords.java` — the shared predicate:

```java
	/**
	 * Whether a current-password field was supplied at all. The test is <em>empty</em>, never blank: the policy
	 * forbids a stored password under 8 characters so {@code ""} can never be a real one, while leading and
	 * trailing spaces are significant and must survive (the S8 set-password review fix).
	 */
	static boolean isSupplied(String password) {
		return password != null && !password.isEmpty();
	}
```

`OperatorAccountController.java` — the record keeps only the new-password shape check:

```java
	/**
	 * Wire DTO for an operator password change. Only {@code newPassword} is enforced here: an absent or blank
	 * one is a malformed body ({@code 400 INVALID_REQUEST}), and its length message reads correctly for an
	 * empty value. A missing {@code currentPassword} is a <em>different</em> fault and is answered by
	 * {@link #changePassword} with its own code (#345) — throwing here would funnel both into one code and tell
	 * a caller with a perfectly good new password to choose a different length.
	 */
	record ChangePasswordRequest(String currentPassword, String newPassword) {
		ChangePasswordRequest {
			if (newPassword == null || newPassword.isEmpty()) {
				throw new IllegalArgumentException("newPassword is required");
			}
		}
	}
```

…and the branch, placed after the bootstrap guard and **before** the policy check:

```java
		if (!CustomerPasswords.isSupplied(request.currentPassword())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "MISSING_CURRENT_PASSWORD",
					"Enter your current password.");
		}
		CustomerPasswords.validate(request.newPassword());
```

Update the method javadoc's outcome list to name the new code, and keep the existing "a weak new password is
`400 INVALID_REQUEST`" line — it is still true for a supplied current password.

- [ ] **Step 4: Run them, verify they pass** —
  `gradle test --tests "*OperatorAccountControllerTest*"` → PASS (all 14, including the untouched
  `rejectsWeakNewPassword` = AC-3).

> Scope (end-of-phase regression): broaden to the edge's password/auth slice —
> `gradle test --tests "*OperatorAccountControllerTest*" --tests "*OperatorPasswordChangeIT*" --tests "*ApiErrorHandlerTest*" --tests "*ErrorContractArchitectureTests*"`.

- [ ] **Step 5: Generalization-audit pass** — search every edge surface that reads a `currentPassword`:
  `grep -rn "currentPassword" platform/src/main/java` → candidates: `OperatorAccountController` (this phase),
  `MyAccountController` (Phase 1 — the declared twin). Decision: fix both; record the row.

- [ ] **Step 6: Commit** — `git commit -m "feat(#345): give the omitted operator current password its own code"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Backend: the customer twin

**Files:** Modify `platform/src/main/java/ai/riviera/platform/MyAccountController.java:78-107` ·
Test `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java`

- [ ] **Step 1: Write the failing test** — beside the existing
  `existingPasswordAccountRequiresTheCorrectCurrentPassword`:

```java
	/**
	 * AC-4 (#345): an account that HAS a password and sends none is told the field is missing, not that what it
	 * sent was wrong — it sent nothing. The SSO-only account above proves the omission stays legal where there
	 * is no credential to prove, so the two branches can never collapse into one answer.
	 */
	@Test
	void existingPasswordAccountReportsAnOmittedCurrentPasswordDistinctly() throws Exception {
		String email = registerAccountWithPassword();

		mvc.perform(isolated(post(SET_PASSWORD)).session(signedInSession(email))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"newPassword": "%s"}""".formatted(NEW_PASSWORD)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"));

		assertCanStillSignIn(email, ORIGINAL_PASSWORD);
	}
```

> The helper names above are placeholders **for this plan only** — at implementation time reuse
> `SetPasswordIT`'s own existing fixtures (the ones
> `existingPasswordAccountRequiresTheCorrectCurrentPassword` already uses) rather than adding new ones.

- [ ] **Step 2: Run it, verify it fails** —
  `gradle test --tests "*SetPasswordIT*"` → FAIL: `code` is `INVALID_CURRENT_PASSWORD`.
  (Needs Docker; without a daemon the IT skips — then run it before pushing.)

- [ ] **Step 3: Minimal implementation** — nest the two current-password answers so an SSO-only account
  reaches neither:

```java
		Optional<CustomerAccountCredential> existing = accounts.findByEmail(authentication.getName());
		if (existing.isPresent()) {
			if (!CustomerPasswords.isSupplied(request.currentPassword())) {
				return ApiProblem.response(HttpStatus.BAD_REQUEST, "MISSING_CURRENT_PASSWORD",
						"Enter your current password.");
			}
			if (!currentPasswordMatches(request, existing.get())) {
				return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD",
						"The current password is incorrect.");
			}
		}
```

`currentPasswordMatches` then drops its now-unreachable null guard (R-6 — the guarantee moves three lines up,
where it is visible):

```java
	private boolean currentPasswordMatches(SetPasswordRequest request, CustomerAccountCredential credential) {
		return passwordEncoder.matches(request.currentPassword(), credential.passwordHash());
	}
```

Extend the class javadoc's set-password paragraph to name the missing-vs-incorrect split and point at
`OperatorAccountController` as the twin (mirroring how #344 cross-references the ordering rationale).

- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*SetPasswordIT*"` → PASS, including the
  untouched `ssoOnlyAccountSetsFirstPasswordThenCanLogin` (AC-5).

> Scope (end-of-phase regression):
> `gradle test --tests "*SetPasswordIT*" --tests "*MyAccountControllerTest*" --tests "*MeSurfaceRoleGateTest*" --tests "*ModularityTests*"`.

- [ ] **Step 5: Generalization-audit pass** — the Phase-0 search is now exhausted (both call sites fixed,
  one shared predicate). Record the closing row.

- [ ] **Step 6: Commit** — `git commit -m "feat(#345): report an omitted customer current password as missing, not incorrect"`

- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Frontend: both auth services and both pages map the new code

**Files:** Modify `frontend/src/app/core/customer-auth.ts` · `core/operator-auth.ts` ·
`auth/set-password.ts` · `auth/operator-password.ts` ·
Test `core/customer-auth.spec.ts` · `core/operator-auth.spec.ts` · `auth/set-password.spec.ts`

- [ ] **Step 1: Write the failing specs** (AC-6) — one per service, plus the page render:

```ts
  it('maps MISSING_CURRENT_PASSWORD to its own result, never the length message', async () => {
    const promise = auth.setPassword('brand-new-password');
    http
      .expectOne(`${ME_API}/password`)
      .flush({ code: 'MISSING_CURRENT_PASSWORD' }, { status: 400, statusText: 'Bad Request' });
    expect(await promise).toBe('missing-current');
  });
```

```ts
  it('maps MISSING_CURRENT_PASSWORD to its own result', async () => {
    const promise = auth.changePassword('', 'brand-new-password');
    httpMock
      .expectOne(`${AUTH_API}/operator/password`)
      .flush({ code: 'MISSING_CURRENT_PASSWORD' }, { status: 400, statusText: 'Bad Request' });
    expect(await promise).toBe('missing-current');
  });
```

```ts
  it('tells a password-holding account to fill in its current password', async () => {
    const auth = authStub({ setPassword: 'missing-current' });
    const fixture = await render(auth);
    fill(fixture, 'brandnewpass2', '');
    submit(fixture);
    await fixture.whenStable();
    expect(text(fixture, 'setpw-error')).toContain('Enter your current password.');
  });
```

- [ ] **Step 2: Run them, verify they fail** — `npm test` (Vitest, runs once) → FAIL:
  the services return `'invalid-password'` / `'error'`, and the page renders the length message.

- [ ] **Step 3: Minimal implementation**

`core/customer-auth.ts` — the shared message lands here, matching how `PASSWORD_LENGTH_MESSAGE` is already
sourced once and aliased by the operator module:

```ts
/**
 * Shown when a current password is required but was not supplied — distinct from "incorrect", which is what
 * both endpoints used to say (or imply) for an empty field. The backend names the case
 * `MISSING_CURRENT_PASSWORD` (#345); one constant so the tourist and operator pages cannot word it differently.
 */
export const CURRENT_PASSWORD_REQUIRED_MESSAGE = 'Enter your current password.';
```

…the union gains a member, and the 400 branch switches on the code:

```ts
export type SetPasswordResult =
  | 'set'
  | 'missing-current'
  | 'invalid-current'
  | 'invalid-password'
  | 'rate-limited'
  | 'error';
```

```ts
      if (error instanceof HttpErrorResponse && error.status === 400) {
        switch (problemCode(error)) {
          case 'MISSING_CURRENT_PASSWORD':
            return 'missing-current';
          case 'INVALID_CURRENT_PASSWORD':
            return 'invalid-current';
          default:
            return 'invalid-password';
        }
      }
```

`core/operator-auth.ts` — alias the shared constant (keeping the existing export name, so
`operator-password.ts`'s import is unchanged) and add the arm to both the union and the two mapping functions:

```ts
/** One wording for both principal types (#345); the server names the case `MISSING_CURRENT_PASSWORD`. */
export const OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE = CURRENT_PASSWORD_REQUIRED_MESSAGE;
```

```ts
    case 'MISSING_CURRENT_PASSWORD':
      return 'missing-current';
```

```ts
    case 'missing-current':
      return OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE;
```

`auth/set-password.ts` — the new arm, above `invalid-current`:

```ts
      case 'missing-current':
        this.error.set(CURRENT_PASSWORD_REQUIRED_MESSAGE);
        break;
```

`auth/operator-password.ts` — the guard **stays**; only its stale justification changes:

```ts
    // Kept even though the server now names this case: since #343 every attempt spends a rate-limit token,
    // so catching an empty field here saves one.
```

- [ ] **Step 4: Run them, verify they pass** — `npm test` → PASS; then `npm run lint` → clean.

> Scope: Vitest runs the whole (fast) unit suite in one pass; no narrowing needed.

- [ ] **Step 5: Generalization-audit pass** — `grep -rn "INVALID_CURRENT_PASSWORD" frontend/src` →
  candidates: the two services (both fixed) and their specs. Decision: complete; record the row.

- [ ] **Step 6: Commit** — `git commit -m "feat(#345): map MISSING_CURRENT_PASSWORD on both auth surfaces"`

- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — e2e: the mocks mirror the controllers, and the new branch gets a real render

**Files:** Modify `frontend/e2e/support/auth-mocks.ts:62-87,454-476` ·
Test `frontend/e2e/customer-password.e2e.ts`

- [ ] **Step 1: Write the failing spec** (AC-7) — the customer page is the one that can reach the branch
  through the UI (the operator page guards client-side), added after the wrong-current-password test:

```ts
test('a blank current password is reported as missing, not incorrect', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: OLD_PASSWORD,
    signedIn: true,
  });

  await page.goto('/');
  await gotoAccount(page);

  // The account HAS a password, so leaving the field blank is an omission — not a wrong guess.
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-error')).toContainText('Enter your current password.');
  await expect(page.getByTestId('setpw-notice')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'omitted current password');

  // And nothing rotated: the original password still signs in.
  await signOut(page);
  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- customer-password` → FAIL:
  the page renders *"The current password is incorrect."*

- [ ] **Step 3: Minimal implementation** — both mock routes gain the branch **in controller order**:

operator route (missing-current first, still ahead of the policy check, still after the env-managed guard):

```ts
    if (!body.currentPassword) {
      return route.fulfill(problem(400, 'Bad Request', 'MISSING_CURRENT_PASSWORD'));
    }
    // Policy BEFORE the credential check, and bytes not characters — both mirror the controller, which
    // calls CustomerPasswords.validate ahead of findByUsername and caps at bcrypt's 72-byte input limit.
    // Reversing either lets the mocked suite stay green through a real reordering (#342 review finding).
    const newPassword = body.newPassword ?? '';
    if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > 72) {
      return route.fulfill(problem(400, 'Bad Request', 'INVALID_REQUEST'));
    }
```

customer route (nested under "the account has a credential", exactly as the controller nests it):

```ts
    if (password !== undefined) {
      if (!body.currentPassword) {
        return route.fulfill(problem(400, 'Bad Request', 'MISSING_CURRENT_PASSWORD'));
      }
      if (body.currentPassword !== password) {
        return route.fulfill(problem(400, 'Bad Request', 'INVALID_CURRENT_PASSWORD'));
      }
    }
```

- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y -- customer-password` → PASS.

> Scope (end-of-phase regression): the credential specs together —
> `npm run test:e2e:a11y -- customer-password operator-password password-reset unified-auth`.
> (Windows: the mocked suite is `test:e2e:a11y`; `test:e2e` is the local-only real-backend suite.)

- [ ] **Step 5: Generalization-audit pass** — `grep -rn "INVALID_CURRENT_PASSWORD" frontend/e2e` →
  candidates: the two mock routes (both fixed). Decision: complete; record the row.

- [ ] **Step 6: Commit** — `git commit -m "test(#345): render the missing-current-password branch end to end"`

- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — Docs sweep + close-out

**Files:** Modify `docs/plans/error-contract-problemdetail.md` · this plan doc

- [ ] **Step 1** — Append the codes added since #97 to that plan's **Code vocabulary (stable)** list, with a
  one-line note that it is a living list: `INVALID_CREDENTIALS`, `UNAUTHENTICATED`,
  `INVALID_OR_EXPIRED_TOKEN`, `INVALID_CURRENT_PASSWORD`, **`MISSING_CURRENT_PASSWORD`**,
  `ACCOUNT_NOT_ACTIVE`, `BOOTSTRAP_CREDENTIAL_MANAGED`, `PAYLOAD_TOO_LARGE`, `NOT_MARKED` (R-7).
  Verify each against `grep -rn "ApiProblem.response\|ApiProblem.of" platform/src/main/java` before listing it.
- [ ] **Step 2** — Run `riviera-docs-freshness` over the branch range (merge close-out step 5); patch or
  flag anything the diff contradicts. `CLAUDE.md` needs no edit — it names no error codes.
- [ ] **Step 3** — Finalize the Execution status **in this PR's last commit**: stage pointer `DONE`, every
  phase ✅ with its commit, risk rows closed, `merged via PR #NN` (the number, never a squash SHA).
- [ ] **Step 4** — Commit — `git commit -m "docs(#345): record the new error code and close out the plan"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| | | | | | |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `gradle test --tests "*OperatorAccountControllerTest*"` → `reportsAnOmittedCurrentPasswordDistinctly` PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Same command → `anOmittedCurrentPasswordOutranksTheNewPasswordPolicy` PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Same command → `rejectsWeakNewPassword` still PASS (unmodified). Verified at commit `<sha>`.
- [ ] **AC-4:** Run `gradle test --tests "*SetPasswordIT*"` → `existingPasswordAccountReportsAnOmittedCurrentPasswordDistinctly` PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Same command → `ssoOnlyAccountSetsFirstPasswordThenCanLogin` still PASS (unmodified). Verified at commit `<sha>`.
- [ ] **AC-6:** Run `npm test` → the three new specs PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `npm run test:e2e:a11y -- customer-password` → the new test PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (`N/A` justified); no availability write path touched (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — not reached by this slice.
- [ ] **Modulith** section filled; edge-only, no cross-module import added; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** section filled (`N/A` justified) (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched; no code or password value reaches a log or a `detail` string (invariant #7).
- [ ] No schema change, so no Flyway migration — and none claimed (invariant #12).
- [ ] Error bodies come from `ApiProblem` only; no per-controller `@ExceptionHandler`
      (`ErrorContractArchitectureTests` green).
- [ ] **Frontend** standards met; no `as any` on the contract; both mapping functions exhaustive.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`, so no docs-only follow-up PR is needed.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`, not the overlay alone.
