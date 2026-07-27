# Per-username login throttle Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use `- [ ]` tracking.

**Goal:** Add a per-submitted-identity rate-limit dimension to `RateLimitFilter` for the two
login endpoints (operator `username`, customer normalised `email`), so credential guessing
against **one account from many source IPs** is throttled independently of client-IP attribution;
a request is rejected when **either** the per-IP or the per-identity bucket is exhausted.

**Architecture:** Keep every rate-limit dimension in the one place it already lives — the
edge `RateLimitFilter` (root package, RV-BE-11, no module surface). The single significant
decision (the issue's "hard part"): the per-identity bucket **counts only failed-auth attempts**
(`401`), gated by a *peek* before the chain and a *consume* after it only on `401`. This
(a) makes the body re-readable via a small cached-body wrapper applied to the two login paths
only, (b) keeps successful logins free — so the untouched auth-IT corpus stays green (AC-4)
without a generous, control-weakening default, and (c) is the correct posture: throttle
guessing, not success.

**Persistence:** JDBC only (invariant #1). **N/A — no schema change**; buckets are in-memory
(ADR-0004, single instance). No Flyway migration → no `V<n>` collision risk.

**Source of intent:** GitHub issue #292.

**Skills consulted:**
- `riviera-sdlc` (drove the loop; issue-intake grill gate).
- `riviera-java-conventions` (records-first, package-private nested wrapper, one-line comments,
  `MessageDigest`/`ObjectMapper` at the edge, no magic literals → named constants).
- `riviera-modulith` (confirmed root-package edge concern, RV-BE-11 — **no** module/`api`/`spi`
  surface change; filter imports nothing from a module).
- `codebase-design` (settled the seam: filter + failure-only counting vs. auth-path; kept limits
  in one home, added a peek to `TokenBucket` rather than splitting the decision).
- `riviera-local-debug` (scoped test recipe; the **#127 full-suite lockout class** is this
  slice's central risk — see R-1).
- `postgres` — **N/A**, no SQL/migration.

**Branch:** cloud session — designated remote branch **`claude/sdlc-292-pcrful`** stands in for
`bugfix/per-username-login-throttle` (recorded per riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given N+1 **failed** operator logins for the same `username` from N+1 **different**
  client IPs, when the per-identity budget (capacity N) is exhausted, then the last is `429` and
  the per-IP buckets do not save it. *Pinned by:* `RateLimitFilterTest.perUsernameOverLimitIs429AcrossIps`.
- [ ] **AC-2:** Given failed logins for **different** usernames, when one username's budget is
  exhausted, then another username's is unaffected (separate buckets). *Pinned by:*
  `RateLimitFilterTest.perUsernameBucketsAreKeyedByIdentity`.
- [ ] **AC-3:** Customer login is keyed on the **normalised** email (`trim`+`lowercase`), so
  `A@b.com ` and `a@b.com` share one bucket. *Pinned by:*
  `RateLimitFilterTest.customerLoginPerEmailBucketIsCaseAndWhitespaceInsensitive`.
- [ ] **AC-4:** A **successful** login still works and the downstream controller still reads the
  body correctly — the body-caching change is invisible. *Pinned by:* the existing
  `AuthSessionIT` / `PerOperatorLoginIT` / `SessionPersistenceIT` corpus staying green **unchanged**
  (they perform real successful logins whose bodies must deserialize through the wrapper), plus
  every existing `RateLimitFilterTest` login returning `401` (proves the wrapped body reaches the
  controller — a broken wrapper would `400` on deserialization).
- [ ] **AC-5:** The submitted identity is **never logged**; the `429` body carries no identity.
  *Pinned by:* `RateLimitFilterTest.identityIsNeverLogged` (+ the existing constant `RATE_LIMITED_BODY`).
- [ ] **AC-6:** The limiter is not an account-lockout oracle: the `429` for a (would-be) existing
  account and a nonexistent one are indistinguishable in status and body; keys are stored as a
  **SHA-256 hash** of the identity so the map cannot be inspected for valid usernames. *Pinned by:*
  design (limiter runs pre-auth, generic `RATE_LIMITED` body, hashed keys) +
  `RateLimitFilterTest.perUsernameOverLimitIs429AcrossIps` asserting a plain constant body.
- [ ] **AC-7:** The new limit's default lives in `application.properties` with an explicit
  `${VAR:default}` placeholder. *Pinned by:* `RateLimitPropertiesBindingTest` (shipped default +
  env override).

## Non-goals

- Any change to client-IP resolution (#286 / #290 / #291) — the per-IP dimension is untouched.
- Persistent/distributed buckets — in-memory is correct for the single instance (ADR-0004).
- Account lockout, CAPTCHA, MFA.
- Changing per-IP counting semantics (per-IP stays **count-all**; only the new per-identity
  dimension is failure-only — a deliberate asymmetry, see R-2).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — additive new dimension; retires/replaces no surface. Guest checkout, existing per-IP/per-code
buckets, and the login endpoints' request/response shapes are byte-for-byte unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **#127 full-suite lockout class:** a new shared-state bucket dimension collapses the ~19-file auth-IT corpus (shared `ghost`/`operator` identities) onto one budget mid-JVM-run → 429s only the full CI suite reveals. | high | high | **Failure-only counting** — successful `operator` logins never consume, so the corpus's session-establishing logins are free. Shared *failed* identities in the untouched corpus are few (`ghost`, `ghost@example.com`) and well under the shipped default (15). In `RateLimitFilterTest`, per-IP-only tests mint a **unique identity per call** so they never pollute the identity dimension. Verified only by the push's CI run. | Claude | open |
| R-2 | Per-IP (count-all) vs per-identity (failure-only) asymmetry could confuse a future reader. | low | low | Documented on the field + in this plan: per-IP = request-volume control (all requests); per-identity = credential-guess control (failures only). | Claude | open |
| R-3 | Reading the login body in the filter breaks the downstream `@RequestBody` (single-consumption stream). | med | high | Custom re-readable `CachedBodyRequest` wrapper (buffers bytes, serves fresh `getInputStream`/`getReader`), applied **only** to the two login paths and only when Content-Length is known and ≤ 8 KiB; else skip the identity dimension (per-IP still applies). AC-4 corpus proves invisibility. | Claude | open |
| R-4 | Lockout-by-proxy: an attacker burns a **known** account's identity budget to deny login. | med | med | Accepted trade-off (issue): modest capacity + steady refill (15 / 15 min ⇒ ~1/min sustained). A legit user rarely exceeds it; a burned account throttles, not hard-locks. Tunable via `${VAR}`. | Claude | accepted |
| R-5 | Error-contract drift: the new `429` must stay the RFC-7807 `RATE_LIMITED` `ProblemDetail`. | low | med | Reuse the existing `RATE_LIMITED_BODY` + `reject(...)`; no new body shape. | Claude | open |

## Open questions / Assumptions

- **Assumption:** operator login keys on the **raw** `username` (no normalisation) — it mirrors
  exactly the value `AuthController` passes to `authenticate()`; only customer email is normalised
  (issue AC-3 specifies email normalisation, says nothing of username). *Owner:* Claude · *Resolves by:* phase 1.
- **Assumption:** shipped default **capacity 15 / refill PT15M** is an acceptable
  "modest capacity + short refill" per the issue's DoS note. *Owner:* Claude · *Resolves by:* review gate.

### Resolved

- **Seam (issue "hard part"):** filter + cached-body wrapper + failure-only counting, **not** the
  auth-path option — keeps all limit dimensions in `RateLimitFilter` (issue: "keep the decision in
  one place"), pinned by `RateLimitFilterTest` as the ACs require. *(plan stage)*

## Availability & concurrency (invariant #2)

N/A — does not touch `booking`, `availability`, or the beach map. This is an auth-edge throttle.

## Spring Modulith — modules, interfaces, events

N/A — **no module code in scope.** All changes are in the root package
(`ai.riviera.platform.{RateLimitFilter,RateLimitProperties,TokenBucket,SecurityConfig}`), the
app-level web/edge layer that is deliberately *not* a Modulith module (RV-BE-11, like
`SecurityConfig`/`WebCorsConfig`). The filter reuses the one canonical email normaliser rather than
adding a copy. No `api`/`spi`/`vocabulary`/`events` surface, no `allowedDependencies`, no event.

> **Updated by #386:** that normaliser was `CustomerPasswords.normalizeEmail`, a root-package static
> helper, when this plan was written. #386 consolidated six private copies into
> `customer.vocabulary.Emails#normalize` and deleted the root helper, so the filter now calls
> `Emails.normalize` — which does mean the filter imports one `customer::vocabulary` type, a published
> surface the root already depended on. The "imports nothing from any module" claim above no longer
> holds literally; the RV-BE-11 point it was making (no module *internals*, no login machinery in a
> module) is unchanged.

### Module ownership (§4a)

All in the root edge package, no boundary change — login/rate-limit machinery lives at the platform
edge (RV-BE-11), not in `operator`/`customer` (whose Not-My-Job is the login subsystem).

## Payment & payout

N/A — no money in scope.

## Angular — frontend surfaces touched

N/A — backend-only. The `429`/`Retry-After`/`RATE_LIMITED` contract the FE already handles is unchanged.

## FE↔BE contract

N/A — no API shape change. Same login request/response DTOs; same `429` `ProblemDetail` on rejection.

## Execution status

**Stage pointer:** CI green on both commits (R-1 cleared) → awaiting PR decision for the Sonar gate

**Next action:** open a PR into `main` (on request) to run the Sonar gate, then merge close-out. CI backend
full-suite passed on `f3ef10e` (run #1138) and `ec196a4` (run #1139) — the #127 lockout class did not bite.

**Local verification (scoped, this session):** `RateLimitFilterTest` (19 tests incl. AC-1/2/3/5 + 3 defensive branches), `RateLimitPropertiesBindingTest` (AC-7, 6 tests), `RateLimitDisabledTest`, `PerOperatorLoginIT` (8) + `AuthSessionIT` (5) — real successful logins through the wrapper (AC-4), 0 skipped — and the structural net + `OperatorAuthPlacementTests`/`CustomerAuthPlacementTests` all green. Full suite (R-1) is CI's.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `username` limit property + binding test (AC-7) | ✅ | (this commit) |
| 1 — `TokenBucket.hasToken` peek | ✅ | (this commit) |
| 2 — filter: cached-body wrapper + per-identity failure-only dimension (AC-1/2/3/5/6) | ✅ | (this commit) |
| 3 — isolate existing `RateLimitFilterTest` per-IP tests on unique identities (AC-4/R-1) | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** (review gate, subagent RV-BE pass — verdict: mergeable, no Blocker/Major)

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review (Minor) | Peek-then-spend not atomic → concurrent guesses for one identity burst past capacity | fixed — switched to **spend-then-refund** (`TokenBucket.release`, atomic acquire before chain, refund on non-401) |
| F-2 | review (Minor) | Numeric-username bypass: filter's `isString()` skipped a JSON number the DTO coerces to String | fixed — `readJsonField` now accepts any scalar value node; pinned by `numericUsernameIsPerUsernameThrottledLikeTheControllerBindsIt` |
| F-3 | review (Minor) | No test proved a **successful** login does not consume (also a Sonar new-code-coverage gap) | fixed — new `PerUsernameLoginThrottleIT.aSuccessfulLoginNeverConsumesTheUsernameBudget` (real DB) |
| F-4 | review (Minor) | Per-identity check silently no-ops when the login body has no `Content-Length` (chunked) | fixed (observability) — `log.debug` when a login body is skipped for buffering |
| F-5 | review (Nit) | Javadoc "never throttled" overstates (lock-out-by-proxy can 429 a correct password) | fixed — reworded to "never throttled by its own success" + the accepted trade-off noted |
| F-6 | review (Nit) | Unsalted SHA-256 keys could be dictionary-confirmed against a candidate username list | fixed — per-process random salt (`identitySalt`) prefixes the digest |
| F-7 | sonar (`java:S1168`, Major) | `cacheableBody` returned `null` for an array-typed method (gate green, 87.2% new-cov, 0 dup, but 1 new issue) | fixed — returns `Optional<byte[]>` (also the repo convention: never return `null` from a query) |

---

## File structure

- `platform/src/main/resources/application.properties` — add the `riviera.ratelimit.username.*`
  limit with `${VAR:default}` placeholders (AC-7).
- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — add `Limit username`.
- `platform/src/main/java/ai/riviera/platform/TokenBucket.java` — add `hasToken(Instant)` peek.
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — per-identity dimension for
  the two login paths: cached-body wrapper, Jackson identity extract, SHA-256 hashed key,
  peek-before / consume-on-`401`-after.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — pass the auto-configured
  `ObjectMapper` into the `RateLimitFilter` constructor.
- `platform/src/test/java/ai/riviera/platform/RateLimitPropertiesBindingTest.java` — pin AC-7.
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — new AC-1/2/3/5/6 tests;
  isolate existing per-IP login tests on unique identities.

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..3,5,6:** `gradle --no-daemon --console=plain test --tests "*RateLimitFilterTest*"` → PASS.
- [ ] **AC-7:** `... --tests "*RateLimitPropertiesBindingTest*"` → PASS.
- [ ] **AC-4:** full CI suite green (auth-IT corpus unchanged) — the push's CI run.
- [ ] Structural net: `... --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] **No JPA**; buckets in-memory; no schema.
- [ ] Availability N/A justified.
- [ ] **Modulith:** no module code; root-package edge only; no cross-module import.
- [ ] Payment/payout N/A.
- [ ] Identity never logged (invariant #7 posture / AC-5); keys hashed (AC-6); newline-safe logging.
- [ ] Error contract: reuses `RATE_LIMITED` `ProblemDetail`, no per-controller body.
- [ ] Execution status at HEAD matches reality; findings register current.
