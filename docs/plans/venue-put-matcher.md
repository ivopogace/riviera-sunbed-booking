# Venue PUT matcher — filter-layer role gate + endpoint-coverage tripwire

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Role-gate the two operator `PUT` endpoints (`/api/venues/{venueId}/beach-map`,
`/api/venues/{venueId}/rows/{rowLabel}/price`) to `OPERATOR` **at the security filter layer**, and
add a tripwire test that fails whenever *any* mapped endpoint becomes reachable by an arbitrary
authenticated principal without an explicit `SecurityConfig` rule.

**Architecture:** The single significant decision is the **shape** of the fix. #317 answered the
same question for `/api/me/**` with a *method-agnostic namespace rule*, because every verb under
that prefix belongs to one principal type. That answer is **wrong here** and must not be copied:
`/api/venues/**` deliberately mixes a public tourist `GET` with operator-only writes, so a
namespace rule would either expose the writes or break the public read. This slice therefore adds
**per-verb rules** — consistent with the sibling `PATCH`/`POST`/`DELETE` venue-write matchers — and
compensates for the per-verb shape's known weakness (a new verb silently falls through) with the
coverage tripwire, rather than with a rule shape that does not fit this surface.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue **#328** (found by the generalization-audit pass of #317).
Siblings in the same defect class: #316 (erasure matcher), #317 (`/api/me/**`).

**Skills consulted:**
- `riviera-sdlc` — routed the stages; issue-intake grill gate before planning.
- `riviera-plan-doc` — this doc's structure and the AC/risk discipline.
- `riviera-java-conventions` — §6 (no bare `catch (Exception)` in the probe loop — designed out by
  checking `ApiErrorHandler extends ResponseEntityExceptionHandler`, so nothing escapes a probe),
  §6a (named constants for the probe path-variable samples), §6c (one-line comments; the long
  rationale goes in Javadoc).
- `riviera-modulith` — confirmed `SecurityConfig` is **root-package app-wide config, not a module**
  ("keep `SecurityConfig`/`WebCorsConfig` in the root package only; the root is not a module"), so
  this slice makes **no module surface change** and both tests belong in the root test package.
- `riviera-local-debug` — the cloud Gradle/JDK recipe + scoped-test discipline for every test run.
- `riviera-review-overlay` — the review gate; produced F-1 (RV-STYLE-1), F-2, F-3 and the F-4 note.

**Branch:** `claude/sdlc-cloud-issues-ahqggt` — the cloud session's **designated remote branch
stands in for** `bugfix/venue-put-matcher` (`riviera-sdlc` §Remote/cloud session addendum). The
literal `bugfix/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in principal holding `ROLE_CUSTOMER`, when it issues
      `PUT /api/venues/1/beach-map` with a valid CSRF token, then the **security filter chain**
      rejects it with `403` **before `DispatcherServlet` dispatches** — `MvcResult#getHandler()` is
      `null` — and `EditBeachMap` is never invoked.
      *Pinned by:* `VenueWriteRoleGateTest.customerPutToBeachMapIsRejectedBeforeTheController`
- [x] **AC-2:** Same as AC-1 for `PUT /api/venues/1/rows/A/price`.
      *Pinned by:* `VenueWriteRoleGateTest.customerPutToRowPriceIsRejectedBeforeTheController`
- [x] **AC-3:** Given an **anonymous** caller, when it issues either PUT, then the chain answers
      `401` before dispatch (`getHandler()` is `null`).
      *Pinned by:* `VenueWriteRoleGateTest.anonymousPutsAreUnauthorizedBeforeTheController`
- [x] **AC-4 (positive control — proves AC-1/2 are not vacuous):** Given a principal holding
      `ROLE_OPERATOR`, when it issues `PUT /api/venues/1/beach-map` with a valid body, then the
      request **is** dispatched (`getHandler()` non-`null`) and reaches `EditBeachMap#replaceLayout`.
      *Pinned by:* `VenueWriteRoleGateTest.operatorPutToBeachMapDoesReachTheController`
- [x] **AC-5:** The public tourist read is unaffected — an **anonymous** `GET /api/venues/1` is
      still dispatched (`permitAll`), and the owning-operator write paths still work end-to-end.
      *Pinned by:* `VenueWriteRoleGateTest.anonymousVenueReadIsStillPublic` **plus** the existing
      `BeachMapReplaceIT` and `VenueRepriceIT` staying green **unchanged**.
- [x] **AC-6 (the recurrence guard):** Given the full set of endpoints in
      `RequestMappingHandlerMapping`, when each is probed with an authenticated principal holding
      **no project role** (`ROLE_NOBODY`), then every one is rejected before dispatch **unless** it
      appears in the test's declared reachable-by-any-principal list ({public endpoints} ∪ {the one
      deliberate fall-through, `GET /api/auth/me`}). A newly mapped endpoint with no matcher fails
      this test.
      *Pinned by:* `EndpointRoleGateCoverageTest.everyMappedEndpointIsGatedOrDeclaredReachable`
- [x] **AC-7:** AC-6's guard is proven to actually bite: with the PUT matchers temporarily removed,
      `EndpointRoleGateCoverageTest` fails and names **exactly** the two PUT endpoints.
      *Verified by:* the deliberate falsification step in Phase 1, recorded in Execution status.

## Non-goals

- Changing `/api/me/**`'s namespace rule (#317) or the erasure matcher (#316) — settled, untouched.
- Converting the venue-write rules to a method-agnostic shape — explicitly **wrong** on a surface
  that mixes a public `GET` with operator-only writes.
- Any change to invariant #13's object-level ownership check in `VenueAdminService` — that is a
  *different* layer, still enforced, still pinned by `CrossVenueDenialIT`.
- Covering `/actuator/**` in the tripwire: actuator endpoints are `WebMvcEndpointHandlerMapping`
  entries, not `RequestMappingHandlerMapping` ones, and are not loaded by `@WebMvcTest`. Their
  exposure lockdown is #75's, unchanged here.
- Any new endpoint, DTO, or response-shape change. No wire contract moves.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — nothing is retired or replaced. The slice **adds** two authorization rules and one test; the
`/api/me/**` matcher, the public venue `GET`, and every existing rule are untouched.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The tripwire **false-negatives**: a probe that is really a `404` (bad synthesized path) or a `429` (rate limiter, which runs *ahead of* authorization) looks like "denied at the filter", masking a genuine fall-through. | med | high — a guard that silently passes is worse than none | When `getHandler()` is `null`, additionally assert the status is `401` **or** `403`. A `404`/`405`/`429` fails the test loudly as "probe did not resolve", never as a pass. Each probe also carries a unique `X-Forwarded-For` (`SessionLoginSupport.uniqueClientIp()`), so no probe can exhaust another's bucket. | Claude | closed-in-`96000db` (both halves shipped; falsified) |
| R-2 | The **#127 full-suite-only failure class**: shared rate-limit buckets across a cached-context CI run turn green scoped batches into a wall of `429`s. | low | med | Verified at grill time that `PUT /api/venues/**` draws on **no** `RateLimitFilter` bucket (buckets exist only for booking, operator/customer login, operator register, recovery and SSO paths). The tripwire nonetheless probes throttled paths (`POST /api/bookings`, the logins), so every probe gets a unique client IP — the same defence `MeSurfaceRoleGateTest` uses. Confirmed only by the push's CI run. | Claude | closed — CI green on `edf0d32` and `cc6699b`; the 52 probes did not disturb any bucket |
| R-3 | **Matcher ordering** — a new rule placed below a broader one is shadowed and silently dead. | low | high | Both PUT rules go with the sibling venue-write rules, above `.anyRequest()`. The only broader venue rule is `GET /api/venues/**`, which is **method-scoped** and therefore cannot shadow a `PUT`. AC-1/2 (filter-layer discriminator) would fail if a rule were shadowed. | Claude | closed-in-`bc38dd8` (AC-1/2 green with the rule in place, red without) |
| R-4 | The fix is mistaken for a **replacement** of invariant #13's ownership check, and someone later removes `assertOwns` from `VenueAdminService`. | low | high (BOLA) | Javadoc on both new matchers states this is the role layer *above* object-level ownership, mirroring the existing `PATCH`/photo matcher comments; `CrossVenueDenialIT` stays green unchanged. | Claude | closed-in-`bc38dd8` (Javadoc shipped on the matcher) |
| R-5 | Tripwire **maintenance friction**: every genuinely-new public endpoint requires an allowlist edit. | high (by design) | low | Accepted — that is the tripwire's purpose. The failure message names the offending `VERB /path` and states the two legal resolutions (add a `SecurityConfig` rule, or declare it reachable with a reason). | Claude | accepted-by-design |
| R-6 | Probe requests **throw** out of a dispatched handler and abort the test run instead of being asserted. | low | med | Verified at plan time: `ApiErrorHandler extends ResponseEntityExceptionHandler`, so framework exceptions (unreadable body, missing param, unsupported method) all become `ProblemDetail` responses — nothing escapes to MockMvc. Probes also send `{}` rather than an empty body, so parsing succeeds and failure lands in validation (`IllegalArgumentException` → `400`, §6b). No `catch (Exception)` in the loop (`riviera-java-conventions` §6). | Claude | closed-in-`96000db` (52 probes ran, none threw) |

## Open questions / Assumptions

_None open._

### Resolved

- **Assumption (now confirmed):** the declared reachable list is complete at **18 entries** — 17
  `permitAll` plus the single deliberate fall-through `GET /api/auth/me`. The test is its own
  falsifier and it passes both ways: 52 endpoints enumerated, every non-declared one rejected
  before dispatch with 401/403, every declared one still mapped (`containsAll`) and still
  dispatched. A missing entry would have failed the escalation branch; a stale one, the
  reachable-must-dispatch branch. Confirmed at `96000db`, re-confirmed at `cc6699b`.

- **Open question (AC-4 scope, from the intake grill):** should the slice ship the recurrence guard
  at all, given the issue marks it optional? → **Yes, ship it.** User decision, 2026-07-25: the gap
  has recurred three times (#316, #317, #328), and the chosen shape (probe + declared list) costs
  an allowlist edit only when a genuinely public endpoint is added.
- **Open question:** implement the guard by introspecting Spring Security's
  `AuthorizationFilter#getAuthorizationManager()` (precise, no MockMvc false-negatives) or by
  driving MockMvc? → **MockMvc.** The Gradle cache is empty in this cloud clone, so the Spring
  Security 7 / Boot 4 manager API could not be verified offline; a guard built on an unverified
  internal API is the wrong trade for a test whose whole job is to be trustworthy. R-1's
  status-discriminator closes the false-negative gap MockMvc would otherwise leave.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds two authorization rules at the HTTP edge and one
test; it writes nothing, and touches no `availability(set_id, booking_date)` path. The endpoints
being gated (`replaceLayout`, `repriceRow`) already existed with unchanged behaviour for an
authorized operator.

## Spring Modulith — modules, interfaces, events

**Modules touched:** **none.** `SecurityConfig` is app-wide config in the **root package**, which
`riviera-modulith` states explicitly is *not* a module; login/authorization machinery stays at the
platform edge (RV-BE-11, pinned by `OperatorAuthPlacementTests`). Both new tests live in the root
test package `ai.riviera.platform` because the web slice imports the **package-private**
`SecurityConfig` / `WebCorsConfig` / `WebSliceStubs` — exactly where `MeSurfaceRoleGateTest` lives.

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | none | — | — | Edge-only change; no module package touched. |

**Cross-module named interfaces (`api/` ports):** N/A — no port added, changed, or consumed.

**Domain events:** N/A — no event published or subscribed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Filter-layer **role** gate for the two venue PUT writes | none — platform **edge** (root package) | Role-level authorization is the security filter chain's job and lives in `SecurityConfig` at the root, per RV-BE-11 ("login/authorization machinery stays at the platform edge"). It is **not** `venue`'s job: `venue` owns the beach map and pricing, and the **object-level** ownership check (invariant #13) already sits in `VenueAdminService`. The two layers are complementary — role gate at the edge, owner check in the application service. |
| The endpoint-coverage tripwire test | none — root test package | It asserts a property of `SecurityConfig` (package-private) across **all** modules' controllers, so it can only live beside the config it guards. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves, no ledger entry, no Stripe call, no refund decision.

## Angular — frontend surfaces touched

N/A — backend-only. No FE change: an authorized operator's PUT behaviour is byte-for-byte
unchanged, so the operator console needs no adjustment.

## FE↔BE contract

N/A — no contract change. Same paths, same request/response bodies, same status codes for every
**authorized** caller. The only observable difference is *which layer* produces the `403` for an
unauthorized one — and `SecurityProblemResponses` and `ApiErrorHandler.onAccessDenied` emit
byte-identical `403 ACCESS_DENIED` payloads by design, so even that is invisible on the wire.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current `riviera-sdlc`
> stage's reference file) before acting.

**Stage pointer:** `all three gates cleared on `cc6699b` — stopped before merge; the merge call is the maintainer's`

**Next action:** None pending — PR #331 is green, reviewed and Sonar-clean. On merge, run the
close-out: confirm #328 closed, tick the PR Gates boxes, `riviera-docs-freshness` (already
pre-checked: no substrate doc states anything this slice contradicts), and `graphify update .`
for the plan-doc addition.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Filter-layer role gate for the two PUTs (red → matchers → green) | ✅ | `bc38dd8` |
| 1 — Endpoint-coverage tripwire (+ deliberate falsification) | ✅ | `61131f2` |

**Phase 0 evidence.** Red first, for the right reason — `assertNeverDispatched` failed with
`expected: null but was: VenueAdminController#replaceLayout(...)` (and `#repriceRow(...)`),
i.e. a `ROLE_CUSTOMER` PUT reached the controller. Green after the matcher. Scoped regression
batch green: `VenueWriteRoleGateTest`, `MeSurfaceRoleGateTest`, `MeErasureControllerTest`,
`AdminErasureControllerTest`, `CsrfProtection*`, `RateLimitFilterTest`, `ClientIpResolverTest`,
`MyVenuesControllerTest`, `ModularityTests`, `JdbcOnlyArchitectureTests`,
`PackageShapeArchitectureTests`, `OperatorAuthPlacementTests`, `ErrorContractArchitectureTests`.

**Phase 1 evidence (AC-7 falsification).** With the Phase-0 `PUT` matcher removed, the tripwire
failed naming **exactly** the two endpoints and nothing else:

```
PUT /api/venues/{venueId}/beach-map reached VenueAdminController#replaceLayout(...) — no
  SecurityConfig rule gates it, so any authenticated principal passes the filter
PUT /api/venues/{venueId}/rows/{rowLabel}/price reached VenueAdminController#repriceRow(...) — …
```

The same run reported `PROBED(52)`, matching the 52 mappings counted by hand at the issue-intake
grill — so the enumeration covers the whole surface, not a subset. Matcher restored (`git diff`
clean against the Phase-0 commit) → green.

Two probe-design corrections found by *running* it, both kept: Boot's `BasicErrorController`
(`/error`, no explicit verb) is excluded as framework-supplied rather than an endpoint a client
calls, and the declared list is asserted **two-way** (`containsAll`) so an enumeration that
silently stopped finding endpoints cannot pass vacuously.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-STYLE-1) | The new matcher carried a **5-line inline comment**; the bank caps inline comments at one line (Javadoc is exempt). | fixed-in-`b4b3eb4` — rationale moved to the constants' Javadoc, matcher left with a one-liner, matching the file's own pattern (`ME_PATHS`, `MY_VENUES_PATH`) |
| F-2 | review (brittleness) | `anonymousVenueReadIsStillPublic` asserted the exact status `404`, coupling the test to `WebSliceStubs.venueCatalog()` returning empty — an unrelated stub change would break it for the wrong reason. | fixed-in-`b4b3eb4` — now asserts "not an auth rejection" (`isNotIn(401, 403)`), which is what the test actually means |
| F-3 | review (`riviera-java-conventions` §6a) | Raw status literals (`401`/`403`/`404`) in both new tests instead of named constants. | fixed-in-`b4b3eb4` — `HttpStatus.UNAUTHORIZED.value()` / `HttpStatus.FORBIDDEN.value()` |
| F-4 | review (scope note, not a defect) | The tripwire probes with an **authenticated** principal, so it cannot distinguish `permitAll` from `anyRequest().authenticated()`: a `permitAll` rule silently downgraded to authenticated-only would not fail it. | accepted — out of this guard's stated scope (it is a privilege-**escalation** guard). The anonymous side is already covered by the guest-checkout ITs and `CsrfProtectionIT`; recorded in the class Javadoc as a known limitation |
| F-5 | sonar (PR #331) | Gate green on both heads. **Verified against the API on the post-fix head `cc6699b`**, not the bot badge (`references/pr-gates.md` §2): `api/issues/search` total **0**, `api/hotspots/search` **0**, and — the false-clean guard — `measures` non-empty with `new_lines=20`, `new_coverage=100.0`, `new_duplicated_blocks=0`, `new_bugs/vulnerabilities/code_smells=0`. `SonarCloud Code Analysis` check concluded `success` on `cc6699b`. | closed — nothing to fix |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — add two `PUT` path constants
  and two `requestMatchers(HttpMethod.PUT, …).hasRole(OPERATOR_ROLE)` rules with the venue-write
  siblings, above `.anyRequest().authenticated()`.
- `platform/src/test/java/ai/riviera/platform/VenueWriteRoleGateTest.java` — **new.** The focused
  filter-layer discriminator for the two PUTs (AC-1…AC-5).
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — **new.** The
  recurrence tripwire over every mapped endpoint (AC-6).

Unchanged but load-bearing: `WebSliceStubs` (already supplies `EditBeachMap`, `CurrentOperator`,
and an `OperatorDirectory` resolving any principal to `OperatorId(1)`), `SessionLoginSupport`
(`uniqueClientIp()`), `BeachMapReplaceIT` / `VenueRepriceIT` / `CrossVenueDenialIT` (must stay green
**unchanged** — that is the AC-5 evidence).

---

## Phase 0 — Filter-layer role gate for the two PUTs

**Files:** Create `platform/src/test/java/ai/riviera/platform/VenueWriteRoleGateTest.java` ·
Modify `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` (path constants ~line 72,
rules ~line 292)

- [x] **Step 1: Write the failing test** — `VenueWriteRoleGateTest`, modelled on
  `MeSurfaceRoleGateTest`: `@WebMvcTest` + `@Import({SecurityConfig, WebCorsConfig, WebSliceStubs})`,
  `EditBeachMap` replaced by a `@MockitoBean` so "the controller never ran" is observable, the
  `getHandler()` discriminator in a shared `assertNeverDispatched`, and a positive control
  (`operatorPutToBeachMapDoesReachTheController`) proving the assertion varies. Bodies carry
  `expectedVersion` so the operator path reaches `EditBeachMap#replaceLayout` rather than dying in
  `requiredExpectedVersion()`.

- [x] **Step 2: Run it, verify it fails** —
  `gradle test --tests "*VenueWriteRoleGateTest*"` → FAIL on AC-1/AC-2 with the handler assertion:
  "the rejection must come from the security filter chain — a non-null handler means the request
  reached the controller and CurrentOperator produced the 403 instead". AC-3/AC-4/AC-5 pass already
  (anonymous is caught by `.anyRequest().authenticated()`; the operator and public-read paths are
  unchanged) — that is expected and is what makes the two failures meaningful.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite
> (`riviera-local-debug`: the bare `test` task can OOM the container).

- [x] **Step 3: Minimal implementation** — in `SecurityConfig`, two named constants beside the
  existing venue-path constants:

```java
	/** Bulk beach-map layout replace (O3 #172) — an operator-only PUT; the public venue GET is method-scoped. */
	private static final String BEACH_MAP_PATH = "/api/venues/*/beach-map";
	/** Row reprice (O4 #174) — an operator-only PUT; `*` matches one segment, so it never widens. */
	private static final String ROW_PRICE_PATH = "/api/venues/*/rows/*/price";
```

  and, with the sibling venue-write rules (after the `PATCH`/`POST`/`DELETE` set rules, above
  `.anyRequest()`):

```java
						// Beach-map replace + row reprice (O3 #172, O4 #174) — operator-only writes that had
						// NO matcher until #328 and fell through to anyRequest().authenticated(), where any
						// authenticated principal (incl. a tourist) passed the filter. Object-level ownership
						// (invariant #13) is still enforced in VenueAdminService; this is the role layer above it.
						.requestMatchers(HttpMethod.PUT, BEACH_MAP_PATH, ROW_PRICE_PATH).hasRole(OPERATOR_ROLE)
```

- [x] **Step 4: Run it, verify it passes** — `gradle test --tests "*VenueWriteRoleGateTest*"` → PASS

> Scope (end-of-phase regression): broaden to the edge/security classes —
> `--tests "*MeSurfaceRoleGateTest*" --tests "*MeErasureControllerTest*" --tests "*CsrfProtection*"`
> plus the venue web-slice tests. The Docker-gated ITs (`BeachMapReplaceIT`, `VenueRepriceIT`,
> `CrossVenueDenialIT`) skip cleanly without a daemon — CI owns them.

- [x] **Step 5: Generalization-audit pass** — the pattern is "a mapped verb with no explicit
  matcher". Phase 1 **is** the generalization of this fix, made permanent as a test rather than a
  one-off search. Record the enumeration (all 52 mappings, 2 unmatched, 1 deliberate fall-through)
  in the Generalization-audit log.

- [x] **Step 6: Commit** — `git commit -m "fix(#328): role-gate both venue PUT writes at the security filter (#328)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Endpoint-coverage tripwire

**Files:** Create `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java`

- [x] **Step 1: Write the test** — enumerate `RequestMappingHandlerMapping#getHandlerMethods()`;
  for each `(verb, pattern)` synthesize a concrete path (path variables replaced by named sample
  constants: ids → `1`, `{provider}` → `google`, `{code}` → a sample booking code, `{rowLabel}` →
  `A`, `{slot}` → `COVER`, `{hash}` → a sample hash); probe it with
  `user("probe").roles("NOBODY")` + `csrf()` + a unique `X-Forwarded-For` + a `{}` JSON body for
  body-taking verbs. Assert per endpoint:
  - **declared reachable** (the 18-entry list) → `getHandler()` must be **non-null** (a stale
    declaration fails here);
  - **otherwise** → `getHandler()` must be `null` **and** the status must be `401` or `403` (R-1:
    a `404`/`405`/`429` is a broken probe, not a pass).
  Collect all violations and assert once, so the failure message lists every offending endpoint
  rather than only the first.

- [x] **Step 2: Run it, verify it passes** — `gradle test --tests "*EndpointRoleGateCoverageTest*"`
  → PASS (Phase 0 already closed the only two holes).

- [x] **Step 3: Deliberate falsification (AC-7)** — temporarily remove the Phase-0 `PUT` matcher,
  re-run → the test must FAIL naming **exactly** `PUT /api/venues/*/beach-map` and
  `PUT /api/venues/*/rows/*/price`. Restore the matcher, re-run → PASS. A guard added after the
  hole is patched is unproven until it has been seen to go red; record both runs in Execution
  status.

- [x] **Step 4: Commit** — `git commit -m "test(#328): tripwire — every mapped endpoint is gated or declared reachable (#328)"`

- [x] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-25 | issue-intake grill for #328 | "a mapped `(verb, path)` with no explicit `SecurityConfig` rule" | `grep -rnE '@(RequestMapping\|GetMapping\|PostMapping\|PutMapping\|PatchMapping\|DeleteMapping)\b'` over `platform/src/main/java`, cross-read against every `authorizeHttpRequests` rule | 52 mappings; **2 unmatched** (both venue PUTs); **1 deliberate** fall-through (`GET /api/auth/me`, documented at `SecurityConfig.java:217-219`) | Fix all (Phase 0) + make the audit permanent as a test instead of repeating it by hand a fourth time (Phase 1) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-2/AC-3/AC-4 + AC-5 (slice half):** `gradle test --tests "*VenueWriteRoleGateTest*"`
      → PASS (5 tests). Red first at `a205c8d`'s tree for AC-1/AC-2 only, with
      `expected: null but was: VenueAdminController#replaceLayout(...)`. Verified at `bc38dd8`.
- [x] **AC-5 (end-to-end half):** `BeachMapReplaceIT` (12 tests), `VenueRepriceIT` (8),
      `CrossVenueDenialIT` (24) green **unchanged**, all `skipped=0` — run locally against real
      Postgres (this session had a dockerd) **and** on CI. That also discharges the PR template's
      "Testcontainers ITs not skipped" gate with a measured number rather than an inference.
- [x] **AC-6:** `gradle test --tests "*EndpointRoleGateCoverageTest*"` → PASS, 52 endpoints probed.
      Verified at `96000db`.
- [x] **AC-7:** Falsification recorded in Execution status — red naming exactly the two PUTs with
      the matcher removed, green with it restored. Verified at `96000db`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section justified N/A (no availability write path in scope) — invariant #2.
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no module package touched; no cross-module import added
      (invariant #11); edge placement matches RV-BE-11.
- [x] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6).
- [x] Booking codes: the tripwire probes `GET /api/bookings/{code}` with a **sample literal**, and
      no probe value is logged (invariant #7).
- [x] **Invariant #13 unaffected:** `VenueAdminService`'s `assertOwns` untouched; `CrossVenueDenialIT`
      green unchanged.
- [x] No Flyway migration needed (no schema change) — invariant #12 not engaged.
- [x] **Frontend** N/A — no FE file touched.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
