# Email S2 — Recovery-email sends off the request thread (#369) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dispatch the verification and password-reset email sends off the request thread through
an in-memory executor, so that under the `mailer` profile the SMTP round-trip — which today runs
synchronously and only on the known-email branch of `register`/`forgot-password` — is no longer a
measurable timing account-enumeration oracle, while the raw token never leaves memory.

**Architecture:** One new edge seam — `MailDispatcher`, a one-method "where does this send run"
interface — inserted inside `CustomerRecovery`'s existing best-effort `sendQuietly` choke point, so
all three senders (`register`, `forgot-password`, and the signed-in re-send) move off-thread with a
single change. The production `AsyncMailDispatcher` owns a **dedicated, bounded** thread pool rather
than Boot's shared `applicationTaskExecutor`: that pool is what Spring Modulith's
`@ApplicationModuleListener`s run on (`PaymentEventListener`, `BookingConfirmedPayoutListener`), and
a stalled SMTP relay must never back up the money path. Deliberately **not** the Event Publication
Registry (ADR-0011 decision 5): the payload carries the raw single-use token, and the registry
serializes payloads into `event_publication` — persisting a bearer credential in cleartext
(invariant #7) and, under our `archive` completion mode, retaining it after the send.

**Persistence:** JDBC only (invariant #1). No tables, no migrations — the whole point of the slice
is that nothing about the send is persisted. (Next free Flyway version is **V31**, unclaimed by any
open PR; this slice does not take it.)

**Source of intent:** issue #369 (Email S2), epic #367, ADR-0011
(`docs/adr/ADR-0011-transactional-email-scaleway-tem.md`, decision 5). Absorbs item 2 of #255
(S8 review finding F-R6).

**Skills consulted:** `riviera-sdlc` (issue-intake grill gate + routing), `riviera-plan-doc` (this
doc), `riviera-modulith` (the dispatcher is platform-edge machinery in the root package, RV-BE-11 —
no module surface, no `api`/`spi`/`events` addition, so `ApplicationModules.verify()` is untouched),
`riviera-java-conventions` (package-private edge component + functional interface, constructor
injection into `final` fields, catch the narrow `TaskRejectedException` rather than a bare
`catch (Exception)` §6, named constants for the pool sizing §6a, never log the tokenized link §10,
one-line comments §6c, and §8's "don't hand-roll thread pools" → Spring's lifecycle-managed
`ThreadPoolTaskExecutor`, and **no** flipping of `spring.threads.virtual.enabled`),
`riviera-local-debug` (scoped-test discipline; also the reason the new `@Component`'s full-suite
shared-state risk was interrogated before pushing — its §"full-suite-only failure class"),
`riviera-review-overlay` + `code-review` (the review gate — RV-STYLE-1 and RV-PROC-1 walked on top
of the generic banks; 3 findings), `riviera-docs-freshness` (close-out step 5 — caught the stale
activation gate in `CLAUDE.md`). `postgres` N/A — no migration. `riviera-stripe-payments` N/A — no
money. Frontend skills + `playwright-cli` N/A — no user-observable change, backend + docs only.

**Branch:** `feature/email-s2-async-recovery-mail`

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a recording `MailDispatcher` that captures the task without running it, when
  `CustomerRecovery.sendPasswordResetEmail` / `sendVerificationEmail` is called, then the `Mailer`
  is never invoked on the calling thread; when the captured task is then run, the `Mailer` receives
  the tokenized link. *Pinned by:*
  `CustomerRecoveryDispatchTest.doesNoMailWorkOnTheCallersThread` /
  `.sendsTheTokenizedLinkWhenTheDispatchedTaskRuns`
- [x] **AC-2:** Given the production `AsyncMailDispatcher`, when a send is dispatched, then it runs
  on a dedicated `recovery-mail-*` thread — not the caller's, and not Boot's shared
  `applicationTaskExecutor` the Modulith money-path listeners use. *Pinned by:*
  `AsyncMailDispatcherTest.runsTheSendOffTheCallersThread`
- [x] **AC-3:** Given a completed `forgot-password` for a known account, when the raw token is taken
  from the delivered link, then that raw token appears in **no** row of `event_publication` or
  `event_publication_archive` and is not stored in the recovery-token table (only its digest is) —
  the credential never reaches a persistent store (invariant #7). *Pinned by:*
  `RecoveryTokenNeverPersistedIT.theRawTokenIsInNoPersistentStore`
- [x] **AC-4:** Given a dispatcher whose executor can no longer accept work, when a send is
  dispatched, then the task is dropped with a WARN that names neither the address nor the link, and
  **no exception reaches the caller**; and given a `Mailer` that throws, registration still returns
  `201` and `forgot-password` still returns its uniform `204`. *Pinned by:*
  `AsyncMailDispatcherTest.aRejectedDispatchIsDroppedWithoutThrowing` + `RecoveryMailerFailureIT`
  (unmodified)
- [x] **AC-5:** Given the existing recovery integration tests, when they run against the synchronous
  test dispatcher, then they pass **unmodified** — `MockMailer.lastTo(...)` assertions stay
  deterministic. *Pinned by:* `EmailVerificationIT`, `PasswordResetIT`, `SetPasswordIT`,
  `RecoveryRateLimitIT`, `RecoveryMailerFailureIT` (all unchanged apart from nothing)
- [x] **AC-6:** Given the non-enumeration contract (D-8), when `register` is called with a duplicate
  email and when `forgot-password` is called for an unknown email, then status codes and bodies are
  byte-identical to the known-email branch. *Pinned by:* existing
  `CustomerRegisterIT.duplicateEmailResponseIsIdenticalButSessionless` +
  `PasswordResetIT.forgotPasswordResponseIsIdenticalRegardlessOfAccountState` (both unmodified)
- [x] **AC-7:** Given a request carrying a correlation id in the MDC, when the send runs on the pool
  thread, then it logs under the same correlation id, and the pooled thread's MDC is cleared
  afterwards so it cannot leak into the next task. *Pinned by:*
  `AsyncMailDispatcherTest.carriesTheCallersLoggingContext` /
  `.clearsTheLoggingContextAfterTheTask`
- [x] **AC-8:** ADR-0011 decision 5 is amended in this slice with the payload-picks-mechanism rule
  (ids-only payload → Event Publication Registry; bearer-credential payload → in-memory executor,
  because the registry persists payloads into `event_publication`); the runbook's "Known interim
  limits" no longer bars prod `mailer` activation on this slice; `CustomerRecovery`'s Javadoc no
  longer describes a synchronous send. *Pinned by:* doc review (no test)

## Non-goals

- **The booking-confirmation mail (#371) and the other event-driven mails (#373, #374).** They ride
  the Event Publication Registry, not this dispatcher — ids-only payloads.
- **Wiring the operator-approval mail (#375).** The dispatcher is deliberately named and shaped for
  reuse there, but nothing in that flow is touched here.
- **Retries / at-least-once delivery for recovery mail.** Deliberately best-effort: the flow is
  user-retryable (re-request the email), and durability would mean persisting the token.
- **Closing the residual token-insert timing delta** (see R-3) — decided in the grill, documented,
  not built.
- **Bounce/complaint suppression** (later epic slice) and **lifting the #370 activation
  precondition** — prod `mailer` activation still waits on the domain + DPA.
- **Virtual threads.** `spring.threads.virtual.enabled` stays untouched (`riviera-java-conventions`
  §8), and the dispatcher's own pool stays platform-threaded. Weighed and rejected for this slice on
  three grounds: the workload is a handful of sends a day capped at 2 concurrent, so there is no
  blocked-thread pressure to relieve; `SimpleAsyncTaskExecutor(virtualThreads)`'s only bounding knob
  (`setConcurrencyLimit`) **blocks the submitting thread** when saturated — which is the request
  thread, re-opening the very oracle this slice closes — while unbounded means unbounded in-flight
  SMTP connections; and flipping the global flag would move Tomcat and the Modulith money-path
  listeners too. Worth revisiting if a later slice fans out mail at volume (#371 is the candidate):
  on **Java 25 the classic objection is gone** — JEP 491 means a virtual thread blocking inside
  Jakarta Mail's `synchronized` internals no longer pins its carrier.

## Behavior-parity ledger

> The slice replaces the *timing* of an existing surface (`CustomerRecovery.sendQuietly`), so every
> behavior that choke point guarantees today is enumerated rather than assumed preserved.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A mail-transport `RuntimeException` never fails the triggering request | preserved | the try/catch moves **inside** the dispatched task, so it still swallows the send failure; `RecoveryMailerFailureIT` stays unmodified as the proof |
| The WARN on a failed send names only the exception class — never the address or link (invariant #7) | preserved | same log statement, same argument; the new dispatch-rejection WARN follows the identical rule |
| A **token-store** failure is a real error and still propagates (only the send is guarded) | preserved | the token issue/mint stays on the request thread, ahead of the dispatch (grill decision: issue scope) |
| `forgot-password` returns a uniform `204` on both branches | preserved | untouched; controller code unchanged |
| `register` returns `201` with a session on the fresh branch and an identical sessionless response on the duplicate branch | preserved | untouched; controller code unchanged |
| The send happens **after** the token is issued (never before) | preserved | dispatch is the last statement of each send method, as today |
| The send completes before the HTTP response is written | **changed** | that ordering *is* the oracle — it is what this slice removes. Nothing observable depends on it: no response field, header, or subsequent read reflects the send |
| Tests observe the send synchronously via `MockMailer.lastTo(...)` | preserved | the synchronous test dispatcher keeps the send inline in every integration test (AC-5) |
| The mail-failure WARN carries the request's correlation id (MDC) | preserved | the dispatcher copies the caller's MDC into the task and clears it afterwards (AC-7) — without this the hop would silently drop it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An integration test asserting on `MockMailer` after an HTTP call becomes **nondeterministic** (flaky in CI, green locally) because the send now races the response | high | high | the synchronous test dispatcher is wired **centrally**, in `TestcontainersConfiguration` (imported by every DB-backed IT) and `WebSliceStubs` (every `@WebMvcTest` slice) — not per test class; phase 1 greps every test reference to `MockMailer`/`lastTo`/`sent()` and confirms each one's context pulls in a synchronous dispatcher | Claude | **closed** in `aa4a076` — audit found all 9 racing classes already covered by the two central overrides; 0 needed a per-class annotation |
| R-2 | Reusing Boot's shared `applicationTaskExecutor` would put SMTP latency in the same pool as the Modulith `@ApplicationModuleListener` money path (payment→booking confirmation, booking→payout accrual) | med | high | dedicated bounded pool with its own `recovery-mail-` thread prefix, injected by nothing shared; AC-2 asserts the thread name | Claude | **closed** in `9f5a34d` — `AsyncMailDispatcherTest.runsTheSendOffTheCallersThread` pins the `recovery-mail-` prefix |
| R-3 | **Residual timing delta:** the known-email branch still does one synchronous token-row insert the unknown branch does not (~sub-ms) | high | low | accepted and documented (grill decision). The ~100ms SMTP delta this slice closes is the measurable oracle; `register`'s branch asymmetry is structural and pre-existing (the fresh branch inserts an account + a session row) and is answered by D-8's bcrypt-cost equalization, not by write-count equalization | Ivo | accepted — documented in ADR-0011 amendment |
| R-4 | A send is lost on crash, shutdown, or queue saturation, leaving a user with a token they never received | med | low | the flow is user-retryable by design (re-request the email); the pool drains in-flight tasks for up to 5s on shutdown; the trade-off is recorded in the ADR amendment | Claude | **accepted** — `9f5a34d` sets the 5s drain; ADR-0011 decision 5 now states the best-effort (not at-least-once) posture explicitly, and the runbook warns activators |
| R-5 | The copied MDC leaks from one task into the next on a pooled (reused) thread | med | med | `MDC.clear()` in a `finally` inside the task wrapper; AC-7's second assertion pins it | Claude | **closed** in `9f5a34d` — `AsyncMailDispatcherTest.clearsTheLoggingContextAfterTheTask` |
| R-6 | An exception escaping the dispatched task changes nothing about the response but surfaces as an uncaught-handler log, masking a real failure | low | med | the `RuntimeException` catch lives inside the task; the dispatcher additionally catches the narrow `TaskRejectedException` at dispatch time; both log at WARN | Claude | **closed** in `aa4a076` — `CustomerRecoveryDispatchTest.aSendFailureIsSwallowedInsideTheDispatchedTask` + `AsyncMailDispatcherTest.aRejectedDispatchIsDroppedWithoutThrowing` |
| R-7 | `WebSliceStubs` constructs `CustomerRecovery` by hand — a new constructor parameter breaks **every** `@WebMvcTest` slice at once | high | low | updated in the same phase as the constructor change; the web-slice suite is part of that phase's scoped test run | Claude | **closed** in `aa4a076` — `MeSurfaceRoleGateTest`, `MyAccountControllerTest`, `AccountRecoveryControllerTest` all green |
| R-8 | The dispatcher reads as a one-implementation "hypothetical seam" at review | low | low | it has two real implementations from day one (async production, synchronous test) and is the named vehicle for #375; purpose-named, not technology-named (`riviera-modulith`) | Claude | **closed** — shipped with two implementations (`AsyncMailDispatcher`, `SynchronousMailDispatch`); re-check at the review gate |

## Open questions / Assumptions

*(none open — both assumptions resolved below.)*

### Resolved

- **Assumption:** every `@SpringBootTest` that asserts on `MockMailer` imports
  `TestcontainersConfiguration`. → **Confirmed** by the phase-1 audit: all 6 such ITs import it, the
  3 remaining web slices go through `WebSliceStubs`, and the other 3 mail-referencing classes are
  `ApplicationContextRunner`/plain-unit tests that never dispatch. Resolved in `aa4a076`.
- **Assumption:** the recovery-token table stores only the digest, so AC-3's scan is satisfiable. →
  **Confirmed** against `V28`: the table is `customer_account_token` with a `token_hash` column
  (SHA-256 hex, `UNIQUE`), and `V8`'s `serialized_event` is `TEXT` (so the scan needs no `encode()`).
  The test's positive control asserts the *digest* of the same token is present exactly once, which
  is what keeps the three zero-assertions from passing vacuously. Resolved in `1d913aa`.

- **Open question:** how far should the timing closure go — the mail send only, or the whole
  known-branch body (token mint + insert + send)? → **Issue scope: the send only**, residual
  documented (R-3). Decided by Ivo at the issue-intake grill gate, 2026-07-27, before phase 0.

## Availability & concurrency (invariant #2)

`N/A — does not touch `booking`, `availability`, or the beach map.` No code path in this slice
reads or writes `availability(set_id, booking_date)`, and no booking state changes. The slice does
introduce **concurrency** (a thread pool), so for the avoidance of doubt: the pool carries only
best-effort email sends, holds no transaction, takes no lock, and touches no aggregate — invariant
#2's single-source-of-truth guarantee is entirely unaffected, and `riviera-java-conventions` §8's
"the DB is the concurrency primitive" is not being reinterpreted here.

## Spring Modulith — modules, interfaces, events

**Modules touched:** none. Every file in this slice is in the root package
`ai.riviera.platform` — the platform edge, which is deliberately *not* a module
(`riviera-modulith`: "keep `@SpringBootApplication` and app-wide config in the root package only;
the root is not a module"). Mail composition and login/recovery machinery stay at the edge
(RV-BE-11, pinned by `CustomerAuthPlacementTests`); the `customer` module keeps seeing only the
opaque token digest through its existing `CustomerAccountRecovery` port.

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | none | — | — | platform-edge only; no module boundary crossed |

**Cross-module named interfaces (`api/` ports):** none added or changed.
`customer.api.CustomerAccountRecovery` and `customer.api.CustomerAccountDirectory` are called
exactly as today.

**Domain events:** none. This is the slice that decides **not** to publish one — see the
Architecture note and ADR-0011 decision 5. No `events/` record, no `event_publication` row, no
`allowedDependencies` change, so `ModularityTests` and
`PublishedSurfacePlacementArchitectureTests` are unaffected (both still run in the phase-2 scoped
regression as proof).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Deciding **where** a recovery-mail send runs (the `MailDispatcher` seam + its async implementation) | platform edge (root package), no module | `RESPONSIBILITIES.md` puts mail, tokens and crypto at the edge: `customer`'s **Not My Job** covers login/session/mail machinery (RV-BE-11, D-6), and it must keep seeing only the opaque digest. No other module claims mail transport — `booking`/`payment` own money and lifecycle, not notification |
| Swallowing a dispatch rejection so the HTTP response is unchanged | platform edge (root package), no module | it is a property of the **edge orchestration** (D-8 non-enumeration), not of any aggregate; the same reasoning that put `sendQuietly` at the edge in S8 |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; no Stripe call, ledger row, refund, or commission
arithmetic is touched. The only payment-adjacent concern is **not** interfering with the money
path, which is R-2's dedicated-pool mitigation.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service, or contract changes; nothing a user can observe
changes, so no Playwright spec is added (RV-FE-E2E does not apply).

## FE↔BE contract

`N/A — no contract change.` Same endpoints, same status codes, same bodies — AC-6 pins that
explicitly.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `merge close-out — review gate done, awaiting CI + Sonar on the head`

**Next action:** confirm CI green on the head commit and clear the Sonar reported-issue +
duplication list; then merge **PR #379** and run close-out steps 1–3 + 6–7 (close #369, tick epic
#367's sub-issue, confirm subscription, notify).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The dispatch seam (`MailDispatcher` + `AsyncMailDispatcher`) | ✅ | `9f5a34d` |
| 1 — Route `CustomerRecovery` through it + synchronous test wiring | ✅ | `aa4a076` |
| 2 — Non-persistence proof (AC-3) + docs (ADR, runbook, Javadoc) | ✅ | `1d913aa` |
| 3 — Review-gate fixes (F-1..F-3) + docs-freshness patch + close-out | ✅ | `3385cd3` + this commit |

**Merged via PR #379.**

**Review gate:** ran in full — `/code-review` (5-agent fan-out, high effort, adapted to use the
GitHub MCP tools since `gh` is not installed here) **plus** `riviera-review-overlay`. Three findings,
all fixed in `3385cd3` and recorded below. Result posted to the PR.

**Docs-freshness (close-out step 5, run pre-merge over `origin/main...HEAD`):** one finding —
`CLAUDE.md:43` still stated prod `mailer` activation was "gated on #369 async dispatch + #370",
which this slice makes false; **patched in this commit** (activation now gated on #370 alone, plus
the payload-picks-vehicle rule). Checked and clean: no `riviera-*` skill cites `sendQuietly` or
`CustomerRecovery`; `RESPONSIBILITIES.md:209-210` ("the mailer … stays at the platform edge") stays
true and is reinforced; `CONTEXT.md` has no mail/recovery term to rot; the other "synchronous" hits
(`CLAUDE.md:145`/`:172`, `RESPONSIBILITIES.md:43`) are session revocation and the availability
claim — unrelated.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review`, prior-PR-comment agent) | Renaming `sendQuietly` → `dispatchQuietly` left a stale reference in a file the PR never opened: `SmtpMailerIT.java:81` named the old method. Exactly the doc-drift class this repo's reviewers flagged in PR #362 (F-2/F-3) and PR #377 — a mechanism-changing slice must sweep symbol references outside its own diff. The phase-1 audit grep looked for *racing* tests (`Mailer`/`lastTo`), not for *renamed-symbol* references, so it could not have caught this | **fixed** in `3385cd3` |
| F-2 | review (comment-accuracy agent) | The ADR-0011 amendment stated the operator-approval mail (#375) "uses the same vehicle" in present tense, alongside the now-true claim about recovery mail — reading as shipped when no such code exists, and contradicting this plan's own Non-goals | **fixed** in `3385cd3` — reworded to "will use … when it is built; nothing in that flow exists yet" |
| F-3 | review (bug-scan agent) | `MAX_POOL_SIZE = 2` was unreachable in practice: a `ThreadPoolExecutor` grows past core size only when the queue is **full**, so with `queue=100` the second thread would never start until 100 sends were backed up. Not a correctness bug (off-thread + drop-on-saturation both held) but a misleading config inviting a bad future "tune" | **fixed** in `3385cd3` — collapsed to a single `POOL_SIZE = 1` with the serial-drain rationale in the Javadoc, incl. why a stuck send cannot stall the queue (`SmtpMailer`'s finite timeouts, #368) |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/MailDispatcher.java` — **new.** The one-method edge
  seam: where a transactional-email send runs. Package-private, functional, never throws.
- `platform/src/main/java/ai/riviera/platform/AsyncMailDispatcher.java` — **new.** Production
  implementation: a dedicated bounded `ThreadPoolTaskExecutor`, MDC propagation, rejection
  swallowed, drained on shutdown.
- `platform/src/main/java/ai/riviera/platform/CustomerRecovery.java` — **modified.** Takes the
  dispatcher; `sendQuietly` becomes `dispatchQuietly` with the catch inside the task; Javadoc's
  interim #369 note replaced.
- `platform/src/test/java/ai/riviera/platform/AsyncMailDispatcherTest.java` — **new.** AC-2, AC-4,
  AC-7.
- `platform/src/test/java/ai/riviera/platform/CustomerRecoveryDispatchTest.java` — **new.** AC-1,
  the structural "no mail work on the caller's thread" assertion.
- `platform/src/test/java/ai/riviera/platform/RecoveryTokenNeverPersistedIT.java` — **new.** AC-3.
- `platform/src/test/java/ai/riviera/platform/SynchronousMailDispatch.java` — **new.**
  `@TestConfiguration` supplying the inline dispatcher.
- `platform/src/test/java/ai/riviera/platform/TestcontainersConfiguration.java` — **modified.**
  `@Import`s the above so every DB-backed IT stays deterministic (R-1).
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — **modified.** The hand-built
  `CustomerRecovery` gains the inline dispatcher (R-7).
- `docs/adr/ADR-0011-transactional-email-scaleway-tem.md` — **modified.** Decision 5 amendment
  (AC-8).
- `docs/runbooks/mailer-profile-smoke-test.md` — **modified.** "Known interim limits" bullet 1
  resolved (AC-8).

---

## Phase 0 — The dispatch seam

**Files:** Create `platform/src/main/java/ai/riviera/platform/MailDispatcher.java` ·
`AsyncMailDispatcher.java` · Test `platform/src/test/java/ai/riviera/platform/AsyncMailDispatcherTest.java`

- [x] **Step 1: Write the failing test**

```java
package ai.riviera.platform;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The production {@link MailDispatcher} (#369): a recovery-email send must leave the request thread,
 * on a pool of its OWN (never Boot's shared applicationTaskExecutor, which carries the Modulith
 * money-path listeners), and a dispatch that cannot be accepted must be dropped — never thrown at
 * the caller, whose HTTP response the send may not influence (D-8).
 */
class AsyncMailDispatcherTest {

	private static final String CORRELATION_KEY = "correlationId";

	@Test
	void runsTheSendOffTheCallersThread() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		AtomicReference<String> sendThread = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);

		dispatcher.dispatch(() -> {
			sendThread.set(Thread.currentThread().getName());
			sent.countDown();
		});

		assertTrue(sent.await(5, TimeUnit.SECONDS), "the dispatched send never ran");
		assertNotEquals(Thread.currentThread().getName(), sendThread.get());
		assertTrue(sendThread.get().startsWith("recovery-mail-"),
				"the send must run on the dedicated recovery-mail pool, not a shared one: " + sendThread.get());
		dispatcher.destroy();
	}

	@Test
	void aRejectedDispatchIsDroppedWithoutThrowing() {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		dispatcher.destroy(); // the executor can no longer accept work
		AtomicBoolean ran = new AtomicBoolean();

		assertDoesNotThrow(() -> dispatcher.dispatch(() -> ran.set(true)));

		assertFalse(ran.get(), "a rejected task must not run");
	}

	@Test
	void carriesTheCallersLoggingContext() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		AtomicReference<String> seen = new AtomicReference<>();
		CountDownLatch sent = new CountDownLatch(1);
		MDC.put(CORRELATION_KEY, "corr-1");

		try {
			dispatcher.dispatch(() -> {
				seen.set(MDC.get(CORRELATION_KEY));
				sent.countDown();
			});
			assertTrue(sent.await(5, TimeUnit.SECONDS));
			assertEquals("corr-1", seen.get());
		}
		finally {
			MDC.clear();
			dispatcher.destroy();
		}
	}

	@Test
	void clearsTheLoggingContextAfterTheTask() throws Exception {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher();
		AtomicReference<String> leaked = new AtomicReference<>("not-run");
		CountDownLatch first = new CountDownLatch(1);
		CountDownLatch second = new CountDownLatch(1);

		MDC.put(CORRELATION_KEY, "corr-1");
		dispatcher.dispatch(first::countDown);
		MDC.clear();
		assertTrue(first.await(5, TimeUnit.SECONDS));

		dispatcher.dispatch(() -> {
			leaked.set(MDC.get(CORRELATION_KEY));
			second.countDown();
		});

		assertTrue(second.await(5, TimeUnit.SECONDS));
		assertNull(leaked.get(), "the previous task's MDC leaked onto the pooled thread");
		dispatcher.destroy();
	}
}
```

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*AsyncMailDispatcherTest*"` →
  FAIL, compilation error: `AsyncMailDispatcher` / `MailDispatcher` do not exist.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation**

```java
package ai.riviera.platform;

import java.net.URI;

/**
 * Edge seam deciding <em>where</em> a transactional-email send runs (#369, ADR-0011 decision 5).
 * The recovery mails carry a raw single-use token inside the emailed link — a bearer credential
 * (invariant #7) — so they must NOT ride the Spring Modulith Event Publication Registry, which
 * serializes event payloads into {@code event_publication} and would persist that credential in
 * cleartext (and, under our {@code archive} completion mode, retain it after the send). The rule
 * the epic settled: <em>ids-only payload → registry; bearer-credential payload → this in-memory
 * dispatcher</em>. Losing a send on crash is acceptable precisely because the flow is
 * user-retryable.
 *
 * <p><strong>Contract: an implementation never throws.</strong> The send is a best-effort side
 * channel whose success may not influence the HTTP response — neither its status code (the D-8
 * non-enumeration contract) nor its latency (the timing oracle this seam exists to close). A
 * dispatch that cannot be accepted is dropped and logged, never propagated.
 *
 * <p>Package-private edge machinery (RV-BE-11); the {@link URI} tokenized link is handed to the
 * task in memory only and is never logged.
 */
@FunctionalInterface
interface MailDispatcher {

	/** Run the send away from the caller's thread. Never throws. */
	void dispatch(Runnable send);
}
```

```java
package ai.riviera.platform;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * Production {@link MailDispatcher} (#369): a small, bounded, in-memory pool that takes the SMTP
 * round-trip off the request thread, closing the timing account-enumeration oracle the real
 * {@code SmtpMailer} (#368) opened on the known-email branch of {@code register} /
 * {@code forgot-password}.
 *
 * <p><strong>The pool is deliberately its own.</strong> Boot's shared {@code applicationTaskExecutor}
 * is what Spring Modulith's {@code @ApplicationModuleListener}s run on — the payment→booking
 * confirmation and booking→payout accrual spine — so a degraded SMTP relay sharing it could back up
 * the money path. It is bounded for the same reason a queue is not free: a saturated dispatcher
 * drops the send (the user can re-request) rather than growing without limit or, worse, running the
 * send on the caller's thread, which would re-open the oracle.
 *
 * <p>The caller's logging context is carried across the hop so a failed send is still traceable to
 * its request (the correlation id from {@code CorrelationIdFilter}), and cleared afterwards so it
 * cannot leak onto the next task sharing the pooled thread.
 */
@Component
class AsyncMailDispatcher implements MailDispatcher, DisposableBean {

	private static final Logger log = LoggerFactory.getLogger(AsyncMailDispatcher.class);

	private static final int CORE_POOL_SIZE = 1;
	private static final int MAX_POOL_SIZE = 2;
	private static final int QUEUE_CAPACITY = 100;
	private static final int SHUTDOWN_DRAIN_SECONDS = 5;
	private static final String THREAD_NAME_PREFIX = "recovery-mail-";

	private final ThreadPoolTaskExecutor executor;

	AsyncMailDispatcher() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(CORE_POOL_SIZE);
		pool.setMaxPoolSize(MAX_POOL_SIZE);
		pool.setQueueCapacity(QUEUE_CAPACITY);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		pool.initialize();
		this.executor = pool;
	}

	@Override
	public void dispatch(Runnable send) {
		Map<String, String> callerContext = MDC.getCopyOfContextMap();
		try {
			executor.execute(() -> runWithin(callerContext, send));
		}
		catch (TaskRejectedException e) {
			// Never the address or the link (invariant #7); the token is issued, the user can re-request.
			log.warn("Recovery email dispatch rejected ({}); the send was dropped", e.getClass().getSimpleName());
		}
	}

	private static void runWithin(Map<String, String> callerContext, Runnable send) {
		if (callerContext != null) {
			MDC.setContextMap(callerContext);
		}
		try {
			send.run();
		}
		finally {
			MDC.clear();
		}
	}

	@Override
	public void destroy() {
		executor.shutdown();
	}
}
```

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*AsyncMailDispatcherTest*"` → PASS

- [x] **Step 5: Generalization-audit pass** — search for other synchronous edge side-channels that
  run on a request thread and could reuse this seam:
  `grep -rn "sendQuietly\|Mailer\b" platform/src/main/java` → decide (expected: only
  `CustomerRecovery` today; #375's operator-approval mail is the named future reuse, out of scope
  per Non-goals). Append to the log.

- [x] **Step 6: Commit** — `git commit -m "feat(#369): dedicated in-memory dispatcher for recovery-email sends (#369)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Route `CustomerRecovery` through the dispatcher

**Files:** Modify `CustomerRecovery.java:44-89` · Create `SynchronousMailDispatch.java` (test) ·
Modify `TestcontainersConfiguration.java`, `WebSliceStubs.java:403-407` · Test
`CustomerRecoveryDispatchTest.java`

- [x] **Step 1: Write the failing test**

```java
package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The structural closure of the timing oracle (#369 AC-1): the assertion is that NO mail work
 * happens on the caller's thread — recorded via a dispatcher that captures the task instead of
 * running it — not a wall-clock measurement, which would be both flaky and weaker.
 */
class CustomerRecoveryDispatchTest {

	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7L);
	private static final String EMAIL = "tourist@example.com";

	private final CustomerAccountRecovery accounts = mock(CustomerAccountRecovery.class);
	private final Mailer mailer = mock(Mailer.class);
	private final AtomicReference<Runnable> captured = new AtomicReference<>();
	private final CustomerRecovery recovery = new CustomerRecovery(accounts, mailer, new RecoveryTokens(),
			new RecoveryProperties(java.time.Duration.ofHours(24), java.time.Duration.ofHours(1),
					"https://riviera.example"),
			Clock.fixed(Instant.parse("2026-07-27T10:00:00Z"), ZoneOffset.UTC), captured::set);

	@Test
	void doesNoMailWorkOnTheCallersThread() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		verify(mailer, never()).sendPasswordReset(any(), any());
		verify(accounts).issuePasswordResetToken(eq(ACCOUNT), any(), any());
		assertNotNull(captured.get(), "the send must have been handed to the dispatcher");
	}

	@Test
	void sendsTheTokenizedLinkWhenTheDispatchedTaskRuns() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		captured.get().run();

		var link = org.mockito.ArgumentCaptor.forClass(URI.class);
		verify(mailer).sendPasswordReset(eq(EMAIL), link.capture());
		assertTrue(link.getValue().toString().startsWith("https://riviera.example/account/reset?token="));
	}

	@Test
	void aSendFailureIsSwallowedInsideTheDispatchedTask() {
		org.mockito.Mockito.doThrow(new IllegalStateException("relay down"))
				.when(mailer)
				.sendEmailVerification(any(), any());

		recovery.sendVerificationEmail(ACCOUNT, EMAIL);

		captured.get().run(); // must not propagate — the response may not change (D-8)
	}
}
```

> The `RecoveryProperties` / `RecoveryTokens` constructor shapes above are written from the S8 code;
> confirm both signatures when the test is first compiled and adjust the literal construction (not
> the assertions) if they differ.

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*CustomerRecoveryDispatchTest*"`
  → FAIL, compilation error: `CustomerRecovery` has no 6-argument constructor.

- [x] **Step 3: Minimal implementation** — thread the dispatcher through `CustomerRecovery`:

```java
	private final MailDispatcher dispatcher;

	CustomerRecovery(CustomerAccountRecovery recovery, Mailer mailer, RecoveryTokens tokens,
			RecoveryProperties properties, Clock clock, MailDispatcher dispatcher) {
		this.recovery = recovery;
		this.mailer = mailer;
		this.tokens = tokens;
		this.properties = properties;
		this.clock = clock;
		this.dispatcher = dispatcher;
	}
```

```java
	/**
	 * Hand a mail send to the {@link MailDispatcher}, best-effort: the token is already stored, so a
	 * transport failure must never fail the triggering request (registration would 500 after the
	 * account+session already exist) nor become a status-code enumeration oracle (forgot-password must
	 * return its uniform 204 whether or not the email has an account — D-8). The user can simply
	 * re-request. Only the mailer send is guarded — a token-store failure is a real error and still
	 * propagates.
	 *
	 * <p>The send runs <em>off this request thread</em> (#369): with the real {@code SmtpMailer} (#368)
	 * an inline SMTP round-trip on only the known-email branch was a measurable <em>timing</em>
	 * enumeration oracle. The catch sits inside the dispatched task so a failure is swallowed wherever
	 * the task runs; the dispatcher itself never throws.
	 */
	private void dispatchQuietly(Runnable send) {
		dispatcher.dispatch(() -> {
			try {
				send.run();
			}
			catch (RuntimeException e) {
				// The mailer is a best-effort side channel; never log the raw link/token (invariant #7).
				log.warn("Recovery email send failed ({}); the token was issued, delivery can be retried",
						e.getClass().getSimpleName());
			}
		});
	}
```

Both call sites become `dispatchQuietly(...)`; the class Javadoc's paragraph about the send being
synchronous is replaced with one stating the send is dispatched off-thread via `MailDispatcher`.

Test wiring — the synchronous dispatcher, wired centrally (R-1):

```java
package ai.riviera.platform;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Runs recovery-mail sends inline in tests (#369). The production {@link AsyncMailDispatcher} takes
 * the send off the request thread, which would race every {@code MockMailer.lastTo(...)} assertion;
 * this override keeps integration tests deterministic without weakening what they assert — the
 * off-thread dispatch itself is pinned structurally by {@code AsyncMailDispatcherTest} and
 * {@code CustomerRecoveryDispatchTest}. Imported by {@link TestcontainersConfiguration} so every
 * DB-backed integration test gets it automatically.
 */
@TestConfiguration(proxyBeanMethods = false)
public class SynchronousMailDispatch {

	@Bean
	@Primary
	MailDispatcher synchronousMailDispatcher() {
		return Runnable::run;
	}
}
```

`TestcontainersConfiguration` gains `@Import(SynchronousMailDispatch.class)`; `WebSliceStubs`'
hand-built `CustomerRecovery` gains `Runnable::run` as its sixth argument.

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*CustomerRecoveryDispatchTest*"`
  → PASS, then the recovery suites:
  `./gradlew test --tests "*RecoveryMailerFailureIT*" --tests "*EmailVerificationIT*" --tests "*PasswordResetIT*" --tests "*SetPasswordIT*" --tests "*RecoveryRateLimitIT*" --tests "*CustomerRegisterIT*" --tests "*MyAccountControllerTest*" --tests "*AccountRecoveryControllerTest*" --tests "*MeSurfaceRoleGateTest*"`
  → PASS (AC-4, AC-5, AC-6).

- [x] **Step 5: Generalization-audit pass (R-1 closure)** — every test context that observes a mail
  must have a synchronous dispatcher:
  `grep -rln "MockMailer\|lastTo(\|\.sent()" platform/src/test/java` → for each hit confirm the class
  either imports `TestcontainersConfiguration` (→ covered) or is a `@WebMvcTest` using
  `WebSliceStubs` (→ covered); any third case gets an explicit
  `@Import(SynchronousMailDispatch.class)`. Record the list and the decision in the log.

- [x] **Step 6: Commit** — `git commit -m "feat(#369): dispatch recovery-email sends off the request thread"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Non-persistence proof + docs

**Files:** Create `RecoveryTokenNeverPersistedIT.java` · Modify
`docs/adr/ADR-0011-transactional-email-scaleway-tem.md`,
`docs/runbooks/mailer-profile-smoke-test.md`

- [x] **Step 1: Write the failing test** — AC-3, the assertion that gives the "executor, not the
  registry" decision teeth. Register an account, request a reset, take the raw token out of the
  delivered link, and prove it exists in no persistent store:

```java
package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The raw reset token is a bearer credential (invariant #7) and the reason recovery mail does NOT
 * ride the Event Publication Registry (#369, ADR-0011 decision 5): the registry serializes event
 * payloads into {@code event_publication}, which would persist the credential in cleartext — and
 * under our {@code archive} completion mode retain it after the send. This test proves the token
 * reaches no persistent store: only its digest is stored, and no publication row mentions it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class RecoveryTokenNeverPersistedIT {

	private static final String EMAIL = "no-persist@example.com";

	@Autowired
	MockMvc mvc;

	@Autowired
	MockMailer mailer;

	@Autowired
	JdbcClient jdbc;

	@Test
	void theRawTokenIsInNoPersistentStore() throws Exception {
		register();
		mailer.clear();
		forgotPassword();

		String rawToken = tokenFromLastLink();

		assertEquals(0L, countMentioning("event_publication", rawToken));
		assertEquals(0L, countMentioning("event_publication_archive", rawToken));
		assertEquals(0L, countRecoveryRowsStoringRaw(rawToken));
	}

	private String tokenFromLastLink() {
		var email = mailer.lastTo(EMAIL).orElseThrow();
		String token = UriComponentsBuilder.fromUri(email.link()).build().getQueryParams().getFirst("token");
		assertNotNull(token, "the reset link must carry a token");
		return token;
	}

	private long countMentioning(String table, String rawToken) {
		return jdbc.sql("select count(*) from " + table + " where position(:token in encode(serialized_event, 'escape')) > 0")
				.param("token", rawToken)
				.query(Long.class)
				.single();
	}

	private long countRecoveryRowsStoringRaw(String rawToken) {
		return jdbc.sql("select count(*) from customer_password_reset_token where token_hash = :token")
				.param("token", rawToken)
				.query(Long.class)
				.single();
	}

	private void register() throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "password123"}""".formatted(EMAIL)))
				.andExpect(status().isCreated());
	}

	private void forgotPassword() throws Exception {
		mvc.perform(post("/api/auth/customer/forgot-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s"}""".formatted(EMAIL)))
				.andExpect(status().isNoContent());
	}
}
```

> The two SQL statements above are written against the expected schema; **before running, read
> `V28__customer_email_verification_and_recovery_tokens.sql` and `V8__event_publication_registry.sql`
> and correct the table/column names** (the reset-token table name, its digest column, and whether
> `serialized_event` is `bytea` or `text` — drop the `encode(...)` wrapper if it is text). Resolves
> the second Assumption.

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*RecoveryTokenNeverPersistedIT*"`
  → FAIL first on the schema mismatch (fix the SQL), and the test is only meaningful once green:
  confirm it can fail by temporarily asserting a non-zero count.

- [x] **Step 3: Minimal implementation** — none in production code; the test documents and locks the
  decision already implemented in phases 0–1. Then the docs (AC-8):
  - **ADR-0011 decision 5** — append the payload-picks-mechanism rule: *ids-only payload → Event
    Publication Registry; bearer-credential payload → in-memory executor, because the registry
    serializes payloads into `event_publication` (cleartext, retained under `archive`), which would
    defeat the S8 digest-only design.* Note the accepted consequences: best-effort, lost-on-crash,
    user-retryable, and the residual token-insert delta (R-3).
  - **`docs/runbooks/mailer-profile-smoke-test.md`** — "Known interim limits": drop the
    synchronous-send bullet and the prod-activation bar it carried; state that activation remains
    gated on #370 (domain + DPA) alone.
  - Confirm `CustomerRecovery`'s Javadoc no longer claims a synchronous send (done in phase 1).

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*RecoveryTokenNeverPersistedIT*"`
  → PASS.

> Scope (end-of-phase regression): the edge suite plus the structural net —
> `./gradlew test --tests "ai.riviera.platform.*Test" --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*CustomerAuthPlacementTests*" --tests "*ErrorContractArchitectureTests*"`

- [x] **Step 5: Generalization-audit pass** — search for any other place a bearer credential could
  reach a serialized/persisted payload: `grep -rn "ApplicationModuleListener\|@DomainEvent\|publishEvent" platform/src/main/java`
  → confirm every published event payload is ids-only (invariant #11) and none carries a token or
  booking code. Record the finding.

- [x] **Step 6: Commit** — `git commit -m "test(#369): pin that the raw recovery token reaches no persistent store + ADR-0011 amendment"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-27 | phase 0 — new `MailDispatcher` seam | other synchronous edge side-channels on a request thread that could reuse the seam | `grep -rl "Mailer\|sendQuietly" platform/src/main/java` | 8 files, but only `CustomerRecovery` *calls* the `Mailer`; the rest are the port, its two implementations, the prod guard, and the two records | Skip — no second call site exists today. #375's operator-approval mail is the named future reuse and is out of scope per Non-goals |
| 2026-07-27 | phase 1 — async dispatch could flake any mail-observing test (R-1) | every test context that observes a send | `grep -rl "Mailer" platform/src/test/java` then classify each by harness | 12 files: 6 `@SpringBootTest`+`@Import(TestcontainersConfiguration)` (`PasswordResetIT`, `EmailVerificationIT`, `CustomerRegisterIT`, `SetPasswordIT`, `RecoveryRateLimitIT`, `RecoveryMailerFailureIT`); 3 `@WebMvcTest`+`WebSliceStubs` (`MeSurfaceRoleGateTest`, `MyAccountControllerTest`, `AccountRecoveryControllerTest`); 4 `ApplicationContextRunner` bean-wiring tests that never trigger a send; 2 plain unit/GreenMail tests | Fix all — the two central overrides (`TestcontainersConfiguration` import + `WebSliceStubs` argument) cover all 9 that could race; the other 5 need nothing. **No per-class annotation**, deliberately: a missed class would flake, not fail. R-1 closed |
| 2026-07-27 | phase 2 — "a bearer credential must not reach a serialized payload" | every published domain-event record's payload | `grep -n "public record" platform/src/main/java/**/events/*.java` | 4 events: `BookingConfirmed`/`BookingCancelled` (typed ids + minor units + date + reason enum), `PaymentConfirmed`/`PaymentCanceled` (`BookingRef` + Stripe `paymentIntentId`) | Skip — none carries a token or booking code; all are ids-only per invariant #11, so no sibling of this bug exists. **Forward-looking:** #371's booking-confirmation mail needs the booking *code* (invariant #7) — `BookingConfirmed` deliberately carries only `bookingId`, so that listener must read the code through a `booking` `api/` port at send time and must **not** be "fixed" by widening the event payload |

---

## Acceptance-criteria verification (final)

> Local runs are scoped per `riviera-local-debug`; the **full suite is CI's job** and runs on the PR
> head. Where a local run predates the fix round (`3385cd3`), that is stated rather than papered over —
> the fix round touched only the pool sizing, a test comment, and docs, none of which those tests
> exercise, and CI re-ran all of them at the head regardless.

- [x] **AC-1:** `./gradlew test --tests "*CustomerRecoveryDispatchTest*"` → PASS (5 tests). Verified locally at `3385cd3`.
- [x] **AC-2:** `./gradlew test --tests "*AsyncMailDispatcherTest*"` → `runsTheSendOffTheCallersThread` PASS. Verified locally at `3385cd3`.
- [x] **AC-3:** `./gradlew test --tests "*RecoveryTokenNeverPersistedIT*"` → PASS; the JUnit XML confirms `tests=1 skipped=0` in 20.3s against a live Testcontainers Postgres, so it genuinely ran rather than skipping on a missing Docker daemon. Verified locally at `1d913aa`, re-run by CI at the head.
- [x] **AC-4:** `./gradlew test --tests "*AsyncMailDispatcherTest*" --tests "*RecoveryMailerFailureIT*"` → PASS. Verified locally at `3385cd3`.
- [x] **AC-5:** the phase-1 recovery batch (9 classes) → PASS, and `git diff --stat origin/main...HEAD` lists **none** of those IT files, so "unmodified" is checkable rather than asserted. Verified locally at `aa4a076`, re-run by CI at the head.
- [x] **AC-6:** `./gradlew test --tests "*CustomerRegisterIT*" --tests "*PasswordResetIT*"` → PASS (`duplicateEmailResponseIsIdenticalButSessionless`, `forgotPasswordResponseIsIdenticalRegardlessOfAccountState`). Verified locally at `aa4a076`, re-run by CI at the head.
- [x] **AC-7:** `./gradlew test --tests "*AsyncMailDispatcherTest*"` → `carriesTheCallersLoggingContext` + `clearsTheLoggingContextAfterTheTask` PASS. Verified locally at `3385cd3`.
- [x] **AC-8:** ADR-0011 decision 5 amended (`1d913aa`, reworded for tense accuracy in `3385cd3`); runbook interim limit resolved (`1d913aa`); `CustomerRecovery` Javadoc rewritten (`aa4a076`). Doc review — no test.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified N/A); no availability write path touched (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new published surface (invariant #11).
- [x] **Payment/payout** section filled (N/A); the money-path executor is provably not shared (R-2).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — untouched.
- [x] Booking codes unguessable (invariant #7) — and the recovery token now provably never persisted (AC-3).
- [x] Flyway migration present for schema changes (invariant #12) — none needed, none added.
- [x] **Frontend** standards met or deviation documented — N/A, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final plan-doc state committed here citing `merged via PR #NN`.
- [x] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
