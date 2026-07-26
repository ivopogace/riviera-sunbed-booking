# Session-rotation lost update — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SessionIdentity.rotate` authoritative, so a concurrent request holding the
pre-rotation session can no longer write the old `SESSION_ID` back over the rotated one —
closing both the #344 password-change rotation and the login-time session-fixation defence.

**Architecture:** The single significant decision is **where** the fix goes: not in the Spring
Session repository (the issue's first suggestion — ruled out below), but in `rotate` itself,
which stops using `changeSessionId()`'s *deferred* save and instead **carries the session's
attributes over, `invalidate()`s the old session — an immediate `DELETE` — and creates a fresh
one**. A concurrent request's later `UPDATE … WHERE PRIMARY_ID = <old>` then affects **0 rows**
instead of resurrecting a dead cookie. Both call sites (`OperatorAccountController` /
`MyAccountController` and `SessionAuthentication.establish`) funnel through this one helper, so
one fix covers both.

**Persistence:** JDBC only (invariant #1). **No migration.** The `SPRING_SESSION*` tables (V20,
vendored verbatim from the library) are unchanged; the fix uses only the servlet `HttpSession`
API. Latest migration on `main` is `V30`; nothing here claims `V31`.

**Source of intent:** GitHub issue **#359**, as amended by the SDLC issue-intake grill
([comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/359#issuecomment-5085404876)).
Prior art: `docs/plans/password-change-atomicity-session-rotation.md` (#344), which introduced the
rotation this slice makes durable.

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake grill gate — the grill is what
surfaced the login-path instance the issue omits); `riviera-plan-doc` (this doc);
`riviera-java-conventions` (§6c one-line-or-none comments — the long *why* goes in the `rotate`
Javadoc, not inline; §9 "don't mock what you can test for real cheaply" — the guarantee is pinned
by Testcontainers ITs, not by the `MockHttpSession` unit test, which models neither the deferred
save nor the DELETE); `riviera-modulith` (confirmed this is **root-package edge machinery** —
`SessionIdentity` sits beside `SecurityConfig`, the root is not a module, so no module boundary,
`api/`/`spi/` surface or `allowedDependencies` grant is touched); `riviera-local-debug` (scoped
test recipe — loaded before the first `./gradlew` of the implement stage). `postgres` **not**
loaded: no migration, no schema, no project-authored SQL in the diff. `riviera-frontend` /
`angular-developer` / `playwright-cli` **not** loaded: no file under `frontend/` changes and the
fix is invisible to the SPA (a browser applies the replacement `Set-Cookie` exactly as it does
today). `riviera-stripe-payments` **not** loaded: no money moves.

**Branch:** `bugfix/session-rotation-lost-update` (created before phase 0)

---

## Acceptance criteria (testable)

- [ ] **AC-1 (the defect):** Given an operator session that a concurrent request has already
      loaded, when that operator changes their password and the concurrent request's deferred
      save lands afterwards, then the pre-change cookie value does **not** authenticate and the
      re-issued cookie **does**. *Pinned by:*
      `OperatorPasswordChangeIT.aConcurrentSaveOnTheOldSessionCannotResurrectItsId`
- [ ] **AC-2 (the login instance the issue omits):** Given a session that a concurrent request
      has already loaded, when a login arrives on that session and the concurrent request's
      deferred save lands after the fixation rotation, then the pre-login cookie value does
      **not** authenticate and the post-login one **does**. *Pinned by:*
      `AuthSessionIT.aConcurrentSaveOnThePreLoginSessionCannotResurrectItsId`
- [ ] **AC-3 (the customer twin):** As AC-1, for `POST /api/me/password`. *Pinned by:*
      `SetPasswordIT.aConcurrentSaveOnTheOldSessionCannotResurrectItsId`
- [ ] **AC-4 (the parity that silently breaks security if lost):** Given a rotated session, when
      the principal's sessions are revoked by name, then the rotated session is found and
      deleted — i.e. the rotation preserved the `SPRING_SECURITY_CONTEXT` attribute the
      `PRINCIPAL_NAME` index is derived from. *Pinned by:*
      `OperatorPasswordChangeIT.theRotatedSessionStaysReachableByPrincipalName`
- [ ] **AC-5 (no regression):** The three existing rotation guarantees still hold — the calling
      session survives under a new id, every other session is revoked, and a rejected change
      rotates nothing. *Pinned by (unchanged):*
      `OperatorPasswordChangeIT.theSurvivingSessionIsRotatedSoTheOldCookieValueDies`,
      `.theChangeRevokesEveryOtherSessionButKeepsTheCallingOne`,
      `.aWrongCurrentPasswordRotatesNothingAndRevokesNothing`, `AuthSessionIT.sessionIdRotatesOnLogin`
- [ ] **AC-6 (the guard survives the rewrite):** Given a request with no session, when `rotate`
      runs, then it is a no-op and does not create one. *Pinned by:*
      `SessionIdentityTest.rotateIsANoOpWithNoSession`

## Non-goals

- **No `SessionRepositoryCustomizer` / custom `UPDATE` SQL.** Ruled out on evidence, not taste —
  see the Resolved open question below.
- **No change to the #344 / #357 effect ordering** (encode → revoke → write → rotate). This slice
  changes only what `rotate` *does*, never when it runs.
- **No new session-management posture** — no concurrent-session limits, no `SessionRegistry`, no
  `maximumSessions`. Those are a different feature, not a fix for this defect.
- **No attempt to make the concurrent request itself succeed.** After this fix its deferred write
  hits a deleted row; that request's outcome is out of scope (see R-1).
- **No frontend change.** The SPA already follows the replacement `Set-Cookie`.

## Behavior-parity ledger

> The slice replaces `changeSessionId()` semantics inside `rotate` with invalidate-and-recreate.
> That is a **replacement**, so every behavior of the old mechanism is enumerated here — the
> "same thing, done durably" claim is aspirational until checked row by row.

| Old (`changeSessionId()`) behavior | Verdict | How the new `rotate` does it, or why it's gone |
|---|---|---|
| Session id changes to a fresh value | **preserved** | `getSession(true)` after `invalidate()` mints a new id via the same `SessionIdGenerator` |
| Replacement `SESSION` cookie written on the same response | **preserved** | `commitSession` compares the current id to the requested one and calls `setSessionId` — the invalidate path takes the same branch (`SessionRepositoryFilter` L226-234) |
| All session attributes survive | **preserved** | attributes are read into a map **before** `invalidate()` and re-set on the replacement |
| `SPRING_SECURITY_CONTEXT` survives → caller stays signed in | **preserved** | it is one of the carried attributes; AC-5 pins the observable half |
| `PRINCIPAL_NAME` index still resolves → `revokeAll` finds the session | **preserved** | `PrincipalNameIndexResolver` derives it from the carried `SPRING_SECURITY_CONTEXT`; AC-4 pins it |
| `maxInactiveInterval` survives | **preserved** | read before `invalidate()`, re-applied to the replacement |
| Old id stops authenticating | **changed → strengthened** | was "stops, unless a concurrent save writes it back"; now the row is **deleted**, so there is nothing to write back — this is the fix |
| `PRIMARY_ID` (DB row identity) is stable across the rotation | **dropped — deliberate** | the stable `PRIMARY_ID` is precisely what let a stale in-memory id target the live row; a new row is the mechanism, not a side effect |
| `creationTime` / `lastAccessedTime` carried over | **dropped — accepted** | the replacement is a new session, so its clocks restart. Rotation happens only at login and at a password change — both moments of genuine activity — so an idle-timeout reset is not user-visible. Recorded rather than silently absorbed (R-3) |
| A concurrent request's deferred `UPDATE` silently succeeds | **changed** | it now affects 0 rows (or, if it inserts an attribute, fails loudly) — R-1 |
| No session → no-op | **preserved** | the `getSession(false) == null` guard is unchanged; AC-6 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A concurrent request that **adds** a session attribute now hits an FK violation on `SPRING_SESSION_ATTRIBUTES` (parent row deleted) instead of silently clobbering — a `500` on that request | low | low | Not a new failure class: `PrincipalSessionRevoker`'s immediate `DELETE`s have exposed exactly this since #113, and the realistic concurrent request (a badge poll, `GET /api/auth/me`) adds no attribute. The direction is right — fail loudly on a request racing a security-critical rotation rather than resurrect a dead credential. Stated in the `rotate` Javadoc | Ivo | open |
| R-2 | Attribute carry-over misses `SPRING_SECURITY_CONTEXT` → the `PRINCIPAL_NAME` column is written `NULL` on insert, `findByPrincipalName` stops matching, and **every later revocation silently no-ops** — a security regression with no failing test unless one is written for it | low | **high** | AC-4 pins revocation-by-principal-name against a rotated session; the carry-over is a blanket copy of *all* attributes, not a named subset | Ivo | open |
| R-3 | `creationTime`/`lastAccessedTime` reset on rotation, so the idle-expiry clock restarts | high | very low | Accepted and recorded in the parity ledger; rotation only happens at login and password change, both moments of real activity | Ivo | open |
| R-4 | `SessionIdentityTest` runs on `MockHttpServletRequest`/`MockHttpSession`, which model neither Spring Session's deferred save nor the row `DELETE` — a green unit test is **no evidence** the defect is fixed | certain | med | The unit test is deliberately scoped down to the no-session guard (AC-6); every substantive guarantee is an `@EnabledIfDockerAvailable` Testcontainers IT (AC-1/2/3/4). Stated in the test's Javadoc so a future reader does not mistake its scope | Ivo | open |
| R-5 | The SSO callback holds `sso.state` / `sso.verifier` / `sso.provider` on the pre-login session; a rotation that dropped them would break the flow | low | med | The carry-over is unconditional and untyped, so it is byte-for-byte `changeSessionId()` parity. (`SsoController` consumes the nonce *before* `establish`, so nothing depends on it — belt and braces) | Ivo | open |
| R-6 | Rotation costs more round-trips: `DELETE` + a failed `findById` + `INSERT` (+ one insert per attribute), versus a single `UPDATE` | certain | very low | Rotation fires only on login and password change, never per-request; the added cost is bounded by login rate, not traffic | Ivo | open |
| R-7 | ITs are Docker-gated (`@EnabledIfDockerAvailable`) and skip cleanly without a daemon — a local "all green" can mean "all skipped" | med | med | Assert the ITs actually **ran** locally (non-zero test count), and treat the PR's CI run as the authority (`riviera-sdlc` CI gate) | Ivo | open |

## Open questions / Assumptions

- **Assumption:** MockMvc replaying a concurrent request's deferred save through the
  `SessionRepository` (load → `setLastAccessedTime` → `save`) is a faithful model of a real
  overlapping HTTP request. *Basis:* that is exactly and only what
  `SessionRepositoryRequestWrapper.getSession(boolean)` (L290) and `commitSession` (L230) do to a
  session they did not create. It is preferred over two real threads because the defect needs a
  **specific interleaving** (B loads → A commits → B saves), which a latch-free thread test cannot
  pin without flaking. — *Owner:* Ivo · *Resolves by:* phase 0 (the test must be red before the fix)

### Resolved

- **Open question:** Repository-level optimistic guard (the issue's first suggested direction) or
  an authoritative rotate (its second)? → **Authoritative rotate.** `JdbcIndexedSessionRepository`
  binds exactly **six positional parameters in a fixed order** (L918-925) and the *loaded*
  pre-rotation id is not among them, so a customized `UPDATE` cannot express "write `SESSION_ID`
  only if the row still carries the id I loaded" — the guard needs a seventh value the library
  never supplies, and no predicate over those six can tell a legitimate rotation from a stale
  write-back. Confirmed with the maintainer at the grill gate; *pre-implementation, this plan.*
- **Open question:** Fix only the password-change path (as #359 is titled), or the shared helper?
  → **The shared helper.** The grill found `SessionAuthentication.establish` calls the same
  `rotate` on every login path, where the defect is an **attacker-controllable session-fixation
  bypass** rather than an incidental race. Confirmed with the maintainer; recorded on #359;
  *pre-implementation, this plan.*

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No booking, beach-map, or `availability(set_id,
booking_date)` write path is in scope; no set is held, released or marked. The only concurrency in
this slice is between two HTTP requests sharing one `SPRING_SESSION` row, which is Spring
Session's table, not the availability table, and carries none of invariant #2's semantics.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | *none* | — | — | Every changed class is in the **root package** `ai.riviera.platform` (`SessionIdentity`, plus tests). Per `riviera-modulith`, the root holds `@SpringBootApplication` and app-wide edge config and **is not a module**; per RV-BE-11 session-identity lifecycle is platform-edge machinery precisely because neither `customer` nor `operator` may import the servlet or Spring Session APIs |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | *none* | — | — | No published surface is added, moved, or widened; no `allowedDependencies` grant changes |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | *none* | — | — | — | — | — |

> Deliberately **not** an event, for the same reason #128 and #357 gave for revocation: the
> rotation must be observable to the very response being written, so it is synchronous and
> edge-orchestrated.

### Module ownership (§4a)

| Capability (what the slice changes) | Owner module | Justification |
|---|---|---|
| "Retire the calling session's id durably" | **none — platform edge** (`ai.riviera.platform` root) | RV-BE-11: login/session machinery stays at the edge. `customer`'s and `operator`'s **Not My Job** lists both reject a login/session subsystem (`CLAUDE.md`: "login machinery stays at the platform edge"), and neither may import `jakarta.servlet` or `org.springframework.session` — pinned by `CustomerAuthPlacementTests` / `OperatorAuthPlacementTests`. No module gains or loses behavior |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no ledger row is written, no Stripe call is made.

## Angular — frontend surfaces touched

**N/A — backend-only.** No file under `frontend/` changes. The fix is invisible to the SPA: the
replacement `SESSION` cookie is issued on the same response exactly as it is today (parity ledger,
row 2), so no e2e spec changes and `playwright-cli` is not triggered.

## FE↔BE contract

**N/A — no contract change.** No endpoint, DTO, status code or error `code` is added or altered.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window as the change
> it records — at every phase boundary AND every SDLC stage transition.

**Stage pointer:** `plan — complete, awaiting phase 0`

**Next action:** Load `riviera-local-debug`, then write the phase-0 red test
(`OperatorPasswordChangeIT.aConcurrentSaveOnTheOldSessionCannotResurrectItsId`) and run it to
confirm it fails **both ways** (old cookie 200, new cookie 401) before touching `SessionIdentity`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Red: pin the lost update | | |
| 1 — Green: authoritative rotate | | |
| 2 — Generalize: login path, customer twin, principal-index parity | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what
the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *none yet* | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/SessionIdentity.java` — **modified.** `rotate`
  becomes authoritative (carry attributes → `invalidate()` → recreate); the Javadoc's "Known
  limitation (issue #359)" paragraph is replaced by the mechanism and R-1's consequence.
- `platform/src/test/java/ai/riviera/platform/OperatorPasswordChangeIT.java` — **modified.** AC-1
  and AC-4.
- `platform/src/test/java/ai/riviera/platform/AuthSessionIT.java` — **modified.** AC-2.
- `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java` — **modified.** AC-3.
- `platform/src/test/java/ai/riviera/platform/SessionIdentityTest.java` — **modified.** The
  fresh-id assertion must read the request's *current* session (the old handle is invalidated);
  the Javadoc gains R-4's scope caveat.
- `docs/plans/session-rotation-lost-update.md` — this plan.

---

## Phase 0 — Red: pin the lost update

**Files:** Modify `platform/src/test/java/ai/riviera/platform/OperatorPasswordChangeIT.java`

- [ ] **Step 1: Write the failing test.** Replay a concurrent request's deferred save around the
      password change. The session id is taken from the principal index rather than from the
      cookie value, because `DefaultCookieSerializer` base64-encodes the cookie by default and
      the repository keys on the raw id. The body is a generic private method so the
      package-private `JdbcSession` type is never named (it is only inferred).

```java
	/**
	 * AC-1 for #359: the rotation must survive a request that overlaps it. A second request on the same
	 * session — the operator console's pending-request poll is the realistic one — loads the session before
	 * the change commits and saves it after, and Spring Session's save writes that request's <em>in-memory</em>
	 * id (<code>UPDATE … SET SESSION_ID = ? WHERE PRIMARY_ID = ?</code>). Before this slice that wrote the OLD
	 * id back: the exfiltrated cookie the rotation exists to kill started working again, and the caller's
	 * freshly issued cookie was orphaned.
	 *
	 * <p>Driven through the repository rather than two threads deliberately. The defect needs one specific
	 * interleaving — B loads, A commits, B saves — and load/touch/save is exactly and only what
	 * {@code SessionRepositoryRequestWrapper.getSession} and {@code commitSession} do to a session they did
	 * not create. Two real threads would model the same three calls with a race added on top, and could not
	 * pin the ordering without a latch inside library code.
	 */
	@Test
	void aConcurrentSaveOnTheOldSessionCannotResurrectItsId() throws Exception {
		assertConcurrentSaveCannotResurrect(sessions);
	}

	private <S extends Session> void assertConcurrentSaveCannotResurrect(
			FindByIndexNameSessionRepository<S> repository) throws Exception {
		Cookie beforeTheChange = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		S concurrentRequest = repository.findById(onlySessionIdOf(repository, TARGET));
		assertNotNull(concurrentRequest, "the concurrent request must have loaded the pre-change session");

		Cookie afterTheChange = mvc.perform(changePassword(beforeTheChange, OLD_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		// The concurrent request completes and its deferred save lands — with the id it loaded.
		concurrentRequest.setLastAccessedTime(Instant.now());
		repository.save(concurrentRequest);

		assertNotNull(afterTheChange, "the change must hand back the rotated SESSION cookie");
		mvc.perform(get(ME_PATH).cookie(beforeTheChange)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(afterTheChange)).andExpect(status().isOk());
	}

	/** The principal index, not the cookie — {@code DefaultCookieSerializer} base64-encodes the value. */
	private static <S extends Session> String onlySessionIdOf(
			FindByIndexNameSessionRepository<S> repository, String principal) {
		Set<String> ids = repository.findByPrincipalName(principal).keySet();
		assertEquals(1, ids.size(), "the test expects exactly one live session for " + principal);
		return ids.iterator().next();
	}
```

  with the field `@Autowired FindByIndexNameSessionRepository<? extends Session> sessions;` (the
  same injection point `PrincipalSessionRevoker` already proves wires) and imports for
  `java.time.Instant`, `java.util.Set`, `org.springframework.session.FindByIndexNameSessionRepository`,
  `org.springframework.session.Session`, and `assertEquals`.

- [ ] **Step 2: Run it, verify it fails** —
      `./gradlew test --tests "*OperatorPasswordChangeIT*"` → FAIL. Expect the assertion on the
      **old** cookie: `Status expected:<401> but was:<200>` — the resurrected id authenticates
      again. Confirm the run is not a Docker skip (the class must report executed tests).

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Commit the red test** — `git commit -m "test(#359): pin the concurrent save that
      undoes the session rotation"` (a deliberate red-TDD push; exempt from the CI-green rule per
      `riviera-sdlc` CI gate).

- [ ] **Step 4: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Green: authoritative rotate

**Files:** Modify `platform/src/main/java/ai/riviera/platform/SessionIdentity.java` ·
`platform/src/test/java/ai/riviera/platform/SessionIdentityTest.java`

- [ ] **Step 1: Minimal implementation.** Replace `changeSessionId()`'s deferred save with an
      immediate delete plus a fresh session, carrying everything the old one held.

```java
	/**
	 * Give the calling request a fresh session identity, so the cookie value that reached it stops
	 * authenticating anyone — the rotation half of a password change (#344) and the session-fixation
	 * defence on every login path (design D-1). Spring Session's filter writes the replacement
	 * {@code SESSION} cookie on the same response, so a legitimate caller notices nothing; a copy of the
	 * old cookie is simply dead.
	 *
	 * <p><strong>Why this is not {@code changeSessionId()}</strong> (issue #359). That call keeps the same
	 * {@code SPRING_SESSION} row and defers the new id to the filter's post-request save, which writes
	 * <em>that request's</em> in-memory id. Any second request on the same session performs the same write
	 * on completion, so one that loaded before the rotation committed and finished after wrote the OLD id
	 * back — resurrecting the exfiltrated cookie and orphaning the caller's new one. Invalidating instead
	 * issues the {@code DELETE} immediately, so the stale write has no row left to target.
	 *
	 * <p><strong>Must run after any {@code revokeAllExcept} that spares this session.</strong> The keep-id
	 * a revoke is handed is the pre-rotation one; taken after this call it matches no row, so the caller's
	 * own session would be deleted by its own revoke.
	 *
	 * <p>Attributes and the inactive interval are carried over so this stays a drop-in for the old
	 * semantics — in particular {@code SPRING_SECURITY_CONTEXT}, which keeps the caller signed in AND is
	 * what {@code PrincipalNameIndexResolver} derives the {@code PRINCIPAL_NAME} index from, so
	 * {@link PrincipalSessionRevoker} still finds the rotated session. The row identity, creation time and
	 * last-access time do not survive: a new row is the mechanism, not a side effect.
	 *
	 * <p>A concurrent request that <em>adds</em> a session attribute now fails on the deleted parent row
	 * rather than silently clobbering. That is the intended direction — and not a new failure class, since
	 * {@link PrincipalSessionRevoker}'s deletes have done the same to other sessions since #113.
	 *
	 * <p>A request with no session is a no-op rather than an error: a rotation with nothing to rotate has
	 * nothing to fail about.
	 */
	static void rotate(HttpServletRequest request) {
		HttpSession retiring = request.getSession(false);
		if (retiring == null) {
			return;
		}
		Map<String, Object> carried = new LinkedHashMap<>();
		for (String name : Collections.list(retiring.getAttributeNames())) {
			carried.put(name, retiring.getAttribute(name));
		}
		int maxInactiveInterval = retiring.getMaxInactiveInterval();
		retiring.invalidate();
		HttpSession replacement = request.getSession(true);
		replacement.setMaxInactiveInterval(maxInactiveInterval);
		carried.forEach(replacement::setAttribute);
	}
```

- [ ] **Step 2: Fix the unit test's fresh-id assertion.** `rotateGivesTheSessionAFreshId` holds a
      handle to the *old* session, which is now invalidated, so it must read the request's current
      session instead. Add R-4's scope caveat to the class Javadoc so nobody later reads this file
      as evidence the race is fixed.

```java
	@Test
	void rotateGivesTheSessionAFreshId() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		String idBefore = request.getSession(false).getId();

		SessionIdentity.rotate(request);

		assertThat(request.getSession(false).getId()).isNotEqualTo(idBefore);
	}
```

- [ ] **Step 3: Run it, verify it passes** — `./gradlew test --tests "*SessionIdentityTest*"
      --tests "*OperatorPasswordChangeIT*"` → PASS, including AC-5's three untouched regression
      tests in the same class.

> Scope (end-of-phase regression): broaden to the edge classes this touches —
> `./gradlew test --tests "*Session*" --tests "*Auth*" --tests "*PasswordChange*"`.

- [ ] **Step 4: Commit** — `git commit -m "fix(#359): make the session rotation authoritative
      instead of a deferred id write"`

- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Generalize: login path, customer twin, principal-index parity

**Files:** Modify `AuthSessionIT.java` (AC-2) · `SetPasswordIT.java` (AC-3) ·
`OperatorPasswordChangeIT.java` (AC-4)

- [ ] **Step 1: Generalization-audit pass — run it FIRST here, because it is what defines this
      phase's scope.** Search `rg -n "SessionIdentity\.rotate" platform/src` → three call sites:
      `OperatorAccountController` (AC-1), `MyAccountController` (AC-3), `SessionAuthentication`
      (AC-2). Decision: **all three get an AC** — one shared fix with only one of its callers
      covered is how the next regression ships. Append to the log below.

- [ ] **Step 2: AC-2 — the login/fixation instance.** In `AuthSessionIT`, alongside the existing
      `sessionIdRotatesOnLogin`, replay the same concurrent save around a login that arrives with
      an existing session (the pattern `sessionIdRotatesOnLogin` already uses to obtain one).
      Assert the pre-login cookie is dead and the post-login cookie works.

- [ ] **Step 3: AC-3 — the customer twin.** Mirror phase 0's test in `SetPasswordIT` against
      `POST /api/me/password`, so the two password endpoints do not drift (the standing rule in
      `MyAccountController`'s Javadoc).

- [ ] **Step 4: AC-4 — the parity that fails silently.** In `OperatorPasswordChangeIT`, after a
      change has rotated the calling session, assert `findByPrincipalName(TARGET)` still returns
      it — proving the carried `SPRING_SECURITY_CONTEXT` kept the `PRINCIPAL_NAME` index intact
      and revocation still reaches the session (R-2).

- [ ] **Step 5: Run it, verify it passes** — `./gradlew test --tests "*AuthSessionIT*" --tests
      "*SetPasswordIT*" --tests "*OperatorPasswordChangeIT*" --tests "*SessionPersistenceIT*"` →
      PASS, with a non-zero executed count per class (R-7).

- [ ] **Step 6: Commit** — `git commit -m "test(#359): pin the rotation against a concurrent save
      on the login and customer paths"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-26 | plan (pre-phase-0) | every caller of the rotation being fixed | `rg -n "SessionIdentity\.rotate" platform/src` | 3 — `OperatorAccountController:132`, `MyAccountController:92`, `SessionAuthentication:30` | fix all (one shared helper); one AC each — AC-1, AC-3, AC-2 |
| 2026-07-26 | plan (pre-phase-0) | other deferred-save assumptions about session identity | `rg -n "changeSessionId\|getSession\(true\)" platform/src/main` | `SessionIdentity` (fixed here) + `SsoController:82` (creates the pre-auth session, never rotates) | no change to `SsoController`; its attributes are carried by the new `rotate`, covered by R-5 |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*OperatorPasswordChangeIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** `./gradlew test --tests "*AuthSessionIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** `./gradlew test --tests "*SetPasswordIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** `./gradlew test --tests "*OperatorPasswordChangeIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** the three pre-existing rotation tests + `AuthSessionIT.sessionIdRotatesOnLogin`
      still PASS, unmodified. Verified at commit `<sha>`.
- [ ] **AC-6:** `./gradlew test --tests "*SessionIdentityTest*"` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A`); no availability write path in scope (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no module changed; no cross-module import added (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct: UTC stored (invariant #6) — session clocks are the library's epoch millis.
- [ ] Booking codes unguessable (invariant #7) — untouched; **no session id is ever logged** here.
- [ ] Flyway migration present for schema changes (invariant #12) — **none needed**, verified.
- [ ] **Frontend** standards met — `N/A`, no frontend file changed.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`, not the
      overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is
      left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
