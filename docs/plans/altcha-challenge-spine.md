# Proof-of-work challenge spine (#905) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist registering sees the ALTCHA control solve a server-issued, HMAC-signed,
ten-minute challenge as soon as the form is focused; the submit carries the solution in a request
header; the server accepts each solution exactly once through a Postgres registry row and answers a
missing, forged, expired or replayed one with `400` and a stable code, writing nothing.

**Architecture:** Everything lives at the platform edge (root package, RV-BE-11): a public
`GET /api/auth/challenge` endpoint and a `ChallengeVerificationFilter` that runs after the rate
limiter and the CSRF filter and before the controller, both driven by one `ProofOfWorkChallenges`
bean that wraps the official `org.altcha:altcha` v2 library. Replay protection is the invariant-#2
idiom on a new `challenge_registry` table (`INSERT … ON CONFLICT DO NOTHING` claims the challenge
nonce; accepted only if the insert wins), swept by a root-package `@Scheduled` job. The SPA bundles
the `altcha` widget behind a shared wrapper component; the enabled flag is the challenge endpoint's
own answer (`200` challenge / `204` off), probed once per SPA session by a `core/` service.

**Persistence:** JDBC only (invariant #1). One new table, `challenge_registry` (`V49`); nothing
else touched.

**Source of intent:** GitHub issue #905 (epic #903); ADR-0016; `docs/architecture/auth-signin-register.md`
§ D-8; `docs/research/2026-09-03-altcha-proof-of-work-and-replay-registry.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
library's expiry check reads the wall clock and cannot take the injected `Clock`, that the web-slice
tests' fixed 2026-06-30 clock would therefore mint pre-expired challenges, that a `403` from the
verifier would be *refunded* by the recovery budget the next slice fences, that `V49` is free on
`main` with no open PR claiming it, and that #904's plan doc is still in `docs/plans/` awaiting
retirement) · `riviera-plan-doc` (this template — forced the seam per AC, the module-ownership
table for a root-only slice, and the prototype record) · `tdd` (each phase red→green at the named
seam, one behavior per cycle) · `riviera-review-overlay` (review gate — at ready-for-review) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD` at phase 5 — the counting sweep for the *sixth* `@Scheduled` job, the *eleventh* rate-limit dimension map and the *fifth* bounded scheduled-query client found 3 stale statements, all patched: two "four" phrasings in `ScheduledQueryTimeout`'s Javadoc and `CLAUDE.md`'s Platform-edge summary, which now names the fence; the rename grep for the path helper moved into `RequestPaths` found nothing; `production-hardening.md`'s "two lockless sweeps" heading names the two that break at N>1 and stays true) · `grilling` (the intake interrogation above) ·
`prototype` (the solve-time harness — Chromium + Pixel-7 emulation; verdict below) · `postgres`
(`TEXT` primary key on the 32-hex nonce, `TIMESTAMPTZ` expiry, one index for the sweep's range
delete, no FK) · `riviera-modulith` (root placement; nothing enters a module; the registry is a
root-owned table like `admin_audit_record`; `CompositionRootDisciplineTests` untouched) ·
`codebase-design` (`ChallengeRegistry` is a real seam — JDBC adapter + the web-slice in-memory
fake; the verdict is a sealed-enum outcome, not exceptions; the filter and controller share one
`ProofOfWorkChallenges` interface) · `riviera-java-conventions` (records, package-private
adapters, typed verdict, the hand-mirrored problem body pattern, no bare `catch (Exception)`
except the one the library's `throws Exception` forces, translated once) · `riviera-frontend`
(the wrapper is a pure presentational primitive → `shared/challenge-widget.ts`; the HTTP probe
and header vocabulary → `core/proof-of-work.ts` + `shared/challenge.ts`) · `riviera-tailwind`
(loaded at phase 3 — the widget's `--altcha-*` variables are mapped from `--riv-*` tokens on the
host, the 44 px floor on the widget's checkbox) · `angular-developer` + angular-cli MCP (loaded at
phase 3 — `httpResource`, `model()`, custom-element schema) · `playwright-cli` (loaded at
phase 4 — the mocked challenge route, real PoW solve in Chromium, the real-backend journey).

**Branch:** `claude/sdlc-905-3i3zwv` — the session's designated remote branch stands in for
`feature/altcha-challenge-spine` (cloud-session addendum).

---

## Prototype — solve time vs `cost` (the `riviera.altcha.cost` default)

Throwaway harness (scratchpad only — the session cannot push a `spike/` branch): a page loading
`altcha@3.2.2`'s bundled widget, a `/challenge` route minting unsigned v2 challenges
(`PBKDF2/SHA-256`, `keyPrefix "00"`, `keyLength 32`) at a given `cost`, and a Playwright script
driving `widget.verify({ minDuration: 0 })` in the pre-installed Chromium under `devices['Pixel 7']`
emulation, timing `performance.now()` around each solve. Five to seven trials per cost.

**Finding 1 — CDP CPU throttling does not reach the Web Workers**, so the "4×" run is not a phone:
`Emulation.setCPUThrottlingRate(4)` moved the medians by <30 % (cost 3000: 427 → 479 ms). The
numbers below are therefore the sandbox's 4 vCPUs at full speed, and the phone estimate is by
scaling, not emulation.

| cost | workers | median | min | max | median counter |
|---|---|---|---|---|---|
| 2000 | 1 | 148 ms | 63 | 486 | 118 |
| 4000 | 1 | 178 ms | 49 | 764 | 79 |
| 8000 | 1 | 615 ms | 59 | 2221 | 150 |
| 16000 | 1 | 1539 ms | 725 | 6677 | 201 |
| 3000 | 4 | 427 ms | 118 | 685 | 255 |
| 4000 | 4 | 191 ms | 86 | 1858 | 94 |
| 6000 | 4 | 585 ms | 192 | 2497 | 207 |
| 8000 | 4 | 1005 ms | 93 | 4091 | 258 |
| 12000 | 4 | 897 ms | 229 | 2646 | 159 |
| 16000 | 4 | 602 ms | 338 | 2832 | 81 |
| 24000 | 4 | 2423 ms | 1020 | 7874 | 218 |

**Finding 2 — the variance is the counter, not the CPU.** With a one-byte `keyPrefix` the number
of attempts is geometric with mean 256, so a run at 3× the mean (a 5 % case) takes 3× as long. Any
default is a median with a long tail; the widget's own 90 s timeout and the kill switch are the
backstops. Per-attempt cost from the single-worker rows is ≈ 0.47 µs × `cost` (native WebCrypto).

**Verdict — `riviera.altcha.cost = 5000`.** Measured ≈ 0.3–0.6 s median here with 4 workers; a
mid-range phone core runs WebCrypto PBKDF2 roughly 3× slower and the widget spreads the work over
its cores, so the estimate is **≈ 1–2 s median on a mid-range phone**, the issue's target band. It
is also the value `altcha-lib`'s own README example uses. `8000` was rejected: ≈ 1 s here already,
so 2–3 s median and a 6–9 s 95th percentile on the phone estimate. **Follow-up for the maintainer:**
no real phone was reachable from the session; confirm on a device before launch and tune the
property (no deploy needed — it is configuration; recorded in `production-hardening.md`).

## Acceptance criteria (testable)

- [ ] **AC-1 (issue):** Given `riviera.altcha.enabled=true`, when an anonymous client GETs
  `/api/auth/challenge`, then it answers `200 application/json` with a v2 challenge whose
  `parameters.algorithm` is `PBKDF2/SHA-256`, `parameters.cost` is the configured value,
  `parameters.expiresAt` is the injected clock + 10 minutes (epoch seconds), a non-blank
  `signature`, `Cache-Control: no-store`, and no session cookie (the SPA's platform-wide `XSRF-TOKEN` bootstrap rides every response, `CsrfCookieBootstrapIT`). *Seam:* the HTTP route ·
  *Pinned by:* `ChallengeEndpointTest.issuesASignedTenMinuteChallenge`
- [ ] **AC-2 (own bucket):** Given the challenge budget's capacity is 2, when one IP GETs the
  challenge three times, then the third is `429 RATE_LIMITED` while a customer login from the same
  IP is still admitted (the login budget is a different dimension). *Seam:* the HTTP route ·
  *Pinned by:* `ChallengeEndpointTest.challengeBudgetIsItsOwnDimension`
- [ ] **AC-3 (happy path):** Given a challenge minted by the endpoint and solved in the test with
  the Java library, when the customer register POST carries it in `X-Altcha-Payload`, then the
  answer is `201` with a `SESSION` cookie and the account row exists. *Seam:* the HTTP route (real
  Postgres) · *Pinned by:* `CustomerRegisterChallengeIT.registersWithASolvedChallenge`
- [ ] **AC-4 (rejections, no write):** Given a register POST without the header / with a tampered
  signature / with a challenge whose `expiresAt` has passed / with a solution already accepted once,
  when it is submitted, then the answer is `400` with `CHALLENGE_REQUIRED` / `CHALLENGE_INVALID` /
  `CHALLENGE_EXPIRED` / `CHALLENGE_EXPIRED` respectively, no session cookie, and no
  `customer_account` row. *Seam:* the HTTP route · *Pinned by:* `CustomerRegisterChallengeIT.rejectsAMissingHeader`,
  `.rejectsATamperedSignature`, `.rejectsAnExpiredChallenge`, `.rejectsAReplayedSolution`
- [ ] **AC-5 (the claim is the database):** Given one solved challenge, when two threads submit it
  concurrently, then exactly one register is `201` and the other `400 CHALLENGE_EXPIRED`.
  *Seam:* the HTTP route (real Postgres) · *Pinned by:* `CustomerRegisterChallengeIT.concurrentReplayAdmitsExactlyOne`;
  and the V49 constraint itself: *Pinned by:* `ChallengeRegistryMigrationIT.primaryKeyRejectsASecondRow`,
  `.onConflictDoNothingLosesQuietly` (invariant #12)
- [ ] **AC-6 (rate limit first, never refunded):** Given the shipped register budget (10/min per
  IP), when one IP sends eleven header-less registers, then the first ten are
  `400 CHALLENGE_REQUIRED` and the eleventh `429 RATE_LIMITED`. *Seam:* the HTTP route ·
  *Pinned by:* `CustomerRegisterChallengeIT.aChallengeFailureStillSpendsTheRegisterBudget`
- [ ] **AC-7 (sweep):** Given a registry row whose expiry is an hour past and one ten minutes
  ahead, when the sweep runs, then only the expired row is gone. *Seam:* `ChallengeRegistry` +
  the sweep bean · *Pinned by:* `ChallengeRegistrySweepIT.deletesExpiredRowsAndKeepsLiveOnes`
- [ ] **AC-8 (kill switch + binding):** Given `riviera.altcha.enabled=false`, when a register
  POST carries no header, then the filter admits it (no `CHALLENGE_*` code) and the challenge
  endpoint answers `204`. Given the shipped `application.properties`, the properties bind to
  `enabled=true`, `cost=5000`, `expiry=PT10M`, `clock-skew=PT30S`, blank secret; a cost or expiry
  outside its bounds fails the context. *Seam:* the HTTP route / the property binder ·
  *Pinned by:* `AltchaDisabledTest.registerAdmitsWithoutAHeader`, `.challengeEndpointAnswersNoContent`,
  `AltchaPropertiesBindingTest.*`
- [ ] **AC-9 (verifier contract, cheap net):** Given the web slice with a known test secret, when
  the fenced route receives no header / garbage / a forged signature / a real solution / the same
  solution twice / an expired challenge, then the codes are as in AC-4 and a non-fenced route
  (customer login) is untouched. *Seam:* the HTTP route (`@WebMvcTest`, in-memory registry) ·
  *Pinned by:* `ChallengeVerificationFilterTest.*`
- [ ] **AC-10 (structure):** `ModularityTests`, `JdbcOnlyArchitectureTests`,
  `PackageShapeArchitectureTests`, `ScheduledWorkArchitectureTest` (six known jobs, pool ≥ 6),
  `EndpointRoleGateCoverageTest` (the challenge GET declared reachable) stay green.
- [ ] **AC-11 (mocked Playwright):** On `/account/sign-in?mode=register` (tourist) the widget
  appears with its attribution, solves a mocked low-cost challenge, the register POST carries
  `x-altcha-payload`, each of the three rejection codes renders its message and a fresh challenge
  is fetched, and a `204` from the challenge route hides the widget while register still works.
  *Seam:* the SPA against `page.route` mocks · *Pinned by:* `e2e/customer-auth-challenge.e2e.ts`
- [ ] **AC-12 (real backend):** One journey registers a customer by solving a real challenge in
  Chromium against the real verifier. *Seam:* the SPA against the running backend ·
  *Pinned by:* `e2e/real-backend/register.e2e.ts`
- [ ] **AC-13 (a11y):** axe passes on the wrapper and on the tourist register card with the widget
  enabled; contrast holds for the widget's mapped tokens in all three themes; each widget state is
  announced through a `role="status"` region. *Seam:* the rendered component ·
  *Pinned by:* `challenge-widget.a11y.spec.ts`, `challenge-widget.contrast.spec.ts`,
  `challenge-widget.spec.ts.announcesEachState`, `auth-page.a11y.spec.ts`
- [ ] **AC-14 (client mapping):** `CustomerAuth.register` sends the header only when a payload is
  given and maps the three codes to `challenge-required` / `challenge-invalid` /
  `challenge-expired`; `ProofOfWork.enabled` is `true` on `200`, `false` on `204`, `true` on a
  transport error. *Seam:* `HttpTestingController` · *Pinned by:* `customer-auth.spec.ts`,
  `proof-of-work.spec.ts`, `challenge.spec.ts`
- [ ] **AC-15 (docs):** `RESPONSIBILITIES.md` § *Platform edge*, `production-hardening.md`
  (secret + properties + the CSP `worker-src blob:` note), and this doc's prototype record ship in
  the PR; `docs/plans/password-policy-12.md` is retired.

## Non-goals

- The operator register, forgot-password (#906) and booking create (#907) fences — the filter's
  fenced-path set is built to grow, but only the customer register is in it here.
- Challenge on login; adaptive "challenge when the bucket runs low" (recorded phase two).
- The privacy-policy paragraph (#907), a Content-Security-Policy header (note only), the ALTCHA
  hosted services, Argon2/Scrypt algorithms, the code/audio fallback challenge, i18n bundles.
- Multi-instance HMAC key management beyond "set the env secret on every instance".
- A real-device solve-time measurement (recorded as the maintainer's pre-launch check).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. The register endpoint keeps every existing behavior
(non-enumerating body, timing equalizer, password policy) behind the new fence.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A solved challenge is accepted twice (restart, second instance, concurrent submits) | med | high | `challenge_registry(challenge_id PK)` + `INSERT … ON CONFLICT DO NOTHING`, accepted only if the insert wins (invariant #2 idiom); AC-5 IT + migration IT | agent | open |
| R-2 | The verifier's status interacts with the rate limiter's refund: a `403` is refunded on `guardsAuthenticatedWork` budgets (the recovery budget #906 fences) | high | med | Every challenge failure is `400`; the filter runs after `RateLimitFilter` so a `429` wins; AC-6 pins the register budget is spent | agent | open |
| R-3 | Full-suite-only failures (`riviera-local-debug`): a new `@Scheduled` job, a new bucket map, DB state across tests | med | med | Sweep `initial-delay PT1M`; pool size 6 + `ScheduledWorkArchitectureTest`; ITs use `SessionLoginSupport.uniqueClientIp()`; registry keys are random nonces so tests never collide | agent | open |
| R-4 | Clock: the library's expiry check reads `System.currentTimeMillis()`; the issuer uses the injected `Clock`; web slices run a fixed 2026-06-30 clock | high | med | The endpoint slice asserts the fixed-clock `expiresAt`; the verifier slice mints its own real-time challenges with the test secret; ITs run `systemUTC`; the skew allowance applies to registry retention (row outlives expiry by `clock-skew`), which is where instance skew bites | agent | open |
| R-5 | No `RIVIERA_ALTCHA_HMAC_SECRET` in prod → random boot key → a restart invalidates in-flight challenges, a second instance verifies nothing | med | med | WARN at boot naming the variable; `production-hardening.md` env row | agent | open |
| R-6 | `org.json` is `provided` in the library's pom — missing at runtime is a `NoClassDefFoundError` on the first challenge | high | high | Pinned `implementation 'org.json:json'`; the ITs exercise the path | agent | open |
| R-7 | The widget's 22 px checkbox fails the 44 px touch-target floor | high | low | `--altcha-checkbox-size` set from the wrapper host; measured by the tourist touch-target sweep in register mode | agent | open |
| R-8 | `import 'altcha'` in Vitest/jsdom (custom element, Workers, `isSecureContext`) | med | low | Specs mock the module (`vi.mock('altcha')`) if the element breaks jsdom; the real widget is proven in Playwright | agent | open |
| R-9 | The bundled widget (~34 kB gz, Blob-URL workers) lands in the initial chunk or trips the `anyComponentStyle` budget | low | med | Imported only by the lazy auth route's wrapper; `npm run build` in phase 3 | agent | open |
| R-10 | Error contract: three new codes emitted from a filter, i.e. before `ApiErrorHandler` | high | low | Hand-mirrored bodies in `SecurityProblemResponses` (the existing pattern), pinned by the ITs | agent | open |
| R-11 | Custom request header on a cross-origin dev POST triggers a CORS preflight | low | low | `WebCorsConfig` allows `*` headers; prod is same-origin | agent | open |
| R-12 | Widget in `EXPIRED` state does not re-solve on focus (`auto=onfocus` fires only from `UNVERIFIED`) | high | med | The wrapper listens to `expired` and `reset()`s + `verify()`s; e2e pins the refetch | agent | open |

## Open questions / Assumptions

### Resolved

- **Q1 — the `cost` default:** resolved by the prototype above → `5000`, with the real-device
  check recorded as the maintainer's pre-launch item.
- **Q2 — status code for challenge failures:** `400` for all three codes (R-2). `403` reads as
  authorization and is refunded by the recovery budget; `422` is used nowhere at this edge.
- **Q3 — where the wrapper lives:** the widget wrapper is pure (no HTTP of its own beyond the
  widget's challenge fetch against a URL from `environments/`) → `shared/challenge-widget.ts`;
  the enabled probe is HTTP + state → `core/proof-of-work.ts`; the header/code vocabulary →
  `shared/challenge.ts`. The host page binds `[enabled]` and `[(payload)]`.
- **Q4 — the enabled flag's source:** the challenge endpoint's own answer (`204` when off),
  probed once per SPA session via `httpResource` in `ProofOfWork`. No second endpoint.
- **Q5 — the registry key:** the challenge `nonce` (16 random bytes, hex) — it is signed, so a
  forged nonce never reaches the registry; the signature would do as well but names nothing.
- **Q6 — clock skew (issue wording "expiry check allows a small clock skew"):** the expiry
  verdict is the library's, by the server clock — server-minted and server-checked, so the client
  clock never enters and a per-request skew allowance would only widen the window. The allowance
  lands where instance skew bites: a used row outlives its expiry by `riviera.altcha.clock-skew`
  (`PT30S`) before the sweep removes it.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The booking-create fence is slice #907; this slice writes
only `challenge_registry`, which borrows the invariant's `INSERT … ON CONFLICT DO NOTHING`
idiom for the replay claim (R-1).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | none | — | — | Everything is root-package edge machinery (RV-BE-11); no module imports it and it imports no module surface. |

**Cross-module named interfaces (`api/` ports):** none added or changed.

**Domain events:** none.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Issue a signed challenge; verify a solution; claim it once | root package (`ProofOfWorkChallenges`, `ChallengeRegistry`, `JdbcChallengeRegistry`) | Abuse machinery is a platform-edge concern like `RateLimitFilter` (RESPONSIBILITIES § *Platform edge*, ADR-0016 §3); `customer`'s Not-My-Job rejects login/abuse subsystems. `challenge_registry` is a root-owned table like `admin_audit_record`. |
| Fence the customer register route | root package (`ChallengeVerificationFilter`, `SecurityConfig`) | The filter chain is the root's; the controller and `customer` module never see the header. |
| Sweep expired registry rows | root package (`ChallengeRegistrySweep`) | The sixth `@Scheduled` job, shaped like `MoneyPathAlertCheck` (root) and the module sweeps; single-instance posture inherited. |
| Show the control, carry the header | `shared/challenge-widget.ts` + `core/proof-of-work.ts` + `core/customer-auth.ts` | Frontend taxonomy per Q3; the auth feature hosts it. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/challenge.ts` | new | pure vocabulary (header name, codes, `challengeHeaders()`, `challengeRejection()`) | — | — |
| FE-2 | `shared/challenge-widget.ts` | new | standalone component `app-challenge-widget` (`CUSTOM_ELEMENTS_SCHEMA`, `import 'altcha'`) | `input enabled`, `model payload`, `signal state` → `role="status"` text; `refresh()` | — |
| FE-3 | `core/proof-of-work.ts` | new | `@Service` | `httpResource` probe → `enabled` computed | — |
| FE-4 | `core/customer-auth.ts` | modify | service | `register(email, password, challenge?)` + three new result kinds and messages | — |
| FE-5 | `auth/auth-page.ts` | modify | component | hosts FE-2 in tourist register mode; passes the payload; refreshes on a challenge rejection | Signal Forms (unchanged) |

**Standards:** standalone components, `inject()`, `@if`, `input()`/`model()`; the one deviation is
`schemas: [CUSTOM_ELEMENTS_SCHEMA]` on FE-2 for the `<altcha-widget>` element (documented on the
component).

## FE↔BE contract

- **New endpoint:** `GET /api/auth/challenge` → `200 application/json` (ALTCHA v2 challenge:
  `{ parameters: { algorithm, cost, expiresAt, keyLength, keyPrefix, nonce, salt }, signature }`,
  `Cache-Control: no-store`) or `204` when `riviera.altcha.enabled=false`. `permitAll`, per-IP
  budget `riviera.ratelimit.challenge` (60/min).
- **New request header** on `POST /api/auth/customer/register`: `X-Altcha-Payload` — the widget's
  base64 JSON `{ challenge: { parameters, signature }, solution: { counter, derivedKey, time } }`.
- **New problem codes** (`400`, `application/problem+json`, hand-mirrored in the filter):
  `CHALLENGE_REQUIRED` (header absent or blank), `CHALLENGE_INVALID` (unparseable, forged
  signature, wrong solution, unknown algorithm), `CHALLENGE_EXPIRED` (past `expiresAt`, or already
  accepted once).
- **Client typing:** hand-written; the widget's payload is an opaque `string`; the challenge
  JSON is typed by `altcha`'s own `Challenge` type only where the probe parses it.

## Execution status

**Stage pointer:** `PR — ready for review; review gate next`

**Next action:** run the review gate (`/code-review` + `riviera-review-overlay`, high effort) and clear the Sonar list on PR #911.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — prototype + plan doc + draft PR | ✅ | `47944af`, PR #911 |
| 1 — properties, V49 registry, JDBC claim, sweep | ✅ | `d00b703` |
| 2 — challenge endpoint, verifier filter, rate-limit budget, ITs | ✅ | `f1b6eab` |
| 3 — frontend: vocabulary, probe service, widget wrapper, auth page, unit + a11y + contrast specs | ✅ | `6a505b5` |
| 4 — mocked Playwright spec, real-backend journey | ✅ | `d1c680f`; the full mocked suite passed (413); the real-backend journey passed on the sandbox's local stack (host Postgres 16 + `gradle bootRun`, cost 5000, 13 s end to end) |
| 5 — docs (Platform edge, production-hardening, CSP note), retire #904's plan, merge `main`, ready for review | ✅ | phase-5 commit; `origin/main` had not moved since the branch point (0 commits behind), so there was nothing to merge |
| 6 — review gate, Sonar gate, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar (phase-2 push) | `java:S2119` — `ProofOfWorkChallenges` built a `SecureRandom` per boot-key fallback | fixed in the phase-4 commit: one static instance |
| F-2 | phase-4 e2e (the first run) | the widget never solved: the page autofocuses the email field before the lazily loaded bundle mounts, so the widget's own `focusin` listener saw no focus change | fixed: the wrapper starts the solve on `load` when the form already holds focus (`challenge-widget.spec.ts` pins both arms) |
| F-3 | phase-4 touch sweep | the widget's decorative logo link (`aria-hidden`, `tabindex=-1`) is 22 px | fixed: exempted on `load` like the footer link; the checkbox itself is 44 px via `--altcha-checkbox-size` |

---

## File structure

- `docs/plans/altcha-challenge-spine.md` — this plan
- `docs/plans/password-policy-12.md` — retired (merged via PR #910)
- `platform/build.gradle` — `org.altcha:altcha:2.0.3` + `org.json:json` pinned
- `platform/src/main/resources/application.properties` — `riviera.altcha.*`, `riviera.ratelimit.challenge.*`, `spring.task.scheduling.pool.size=6`, the scheduled-query comment count
- `platform/src/main/resources/db/migration/V49__challenge_registry.sql` — the single-use registry
- `platform/src/main/java/ai/riviera/platform/AltchaProperties.java` — `riviera.altcha.*` binding + bounds
- `platform/src/main/java/ai/riviera/platform/ChallengeRegistry.java` — the claim/sweep port
- `platform/src/main/java/ai/riviera/platform/JdbcChallengeRegistry.java` — `INSERT … ON CONFLICT DO NOTHING` + bounded range delete
- `platform/src/main/java/ai/riviera/platform/ChallengeRegistrySweep.java` — the `@Scheduled` sweep
- `platform/src/main/java/ai/riviera/platform/ChallengeVerdict.java` — `VERIFIED / INVALID / EXPIRED / REPLAYED`
- `platform/src/main/java/ai/riviera/platform/ProofOfWorkChallenges.java` — issue + verify around the library, secret resolution
- `platform/src/main/java/ai/riviera/platform/ChallengeController.java` — `GET /api/auth/challenge`
- `platform/src/main/java/ai/riviera/platform/ChallengeVerificationFilter.java` — the fence
- `platform/src/main/java/ai/riviera/platform/RequestPaths.java` — the decoded path-within-application helper both filters share
- `platform/src/main/java/ai/riviera/platform/SecurityProblemResponses.java` — the three challenge bodies
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — properties, bean, filter order
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — the challenge budget (eleventh map), path helper moved out
- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — `challenge` limit, count wording
- `platform/src/test/java/ai/riviera/platform/AltchaPropertiesBindingTest.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeRegistryMigrationIT.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeRegistrySweepIT.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeEndpointTest.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeVerificationFilterTest.java`
- `platform/src/test/java/ai/riviera/platform/AltchaDisabledTest.java`
- `platform/src/test/java/ai/riviera/platform/CustomerRegisterChallengeIT.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeSolving.java` — test helper: solve a challenge with the library, mint expired/forged ones
- `platform/src/test/java/ai/riviera/platform/CustomerRegisterIT.java`, `EmailVerificationIT.java`, `PasswordResetIT.java`, `RecoveryMailerFailureIT.java`, `RecoveryTokenNeverPersistedIT.java`, `SetPasswordIT.java` — every register carries a solved challenge
- `platform/src/test/java/ai/riviera/platform/SessionLoginSupport.java` — `solvedChallenge(mvc)` + the header name
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the in-memory `ChallengeRegistry`
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — `GET /api/auth/challenge` declared reachable
- `platform/src/test/java/ai/riviera/platform/ScheduledWorkArchitectureTest.java` — sixth known job
- `platform/src/test/java/ai/riviera/platform/RateLimitPropertiesBindingTest.java` — record arity, count wording
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — fence off (it pins budgets), `RequestPaths.decode` references
- `frontend/package.json`, `frontend/package-lock.json` — `altcha` pinned exact
- `frontend/src/app/shared/challenge.ts`, `frontend/src/app/shared/challenge.spec.ts`
- `frontend/src/app/shared/challenge-widget.ts`, `.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`
- `frontend/src/app/core/proof-of-work.ts`, `frontend/src/app/core/proof-of-work.spec.ts`
- `frontend/src/app/core/customer-auth.ts`, `frontend/src/app/core/customer-auth.spec.ts`
- `frontend/src/app/auth/auth-page.ts`, `frontend/src/app/auth/auth-page.spec.ts`, `frontend/src/app/auth/auth-page.a11y.spec.ts`
- `frontend/src/tailwind.css` — the one new token, `--riv-on-accent-ink` (ink on an accent fill), base + dark
- `frontend/src/testing/glass-tokens.ts` — its test-side mirror
- `frontend/e2e/support/auth-mocks.ts` — the mocked challenge route + header-checking register
- `frontend/e2e/support/pages/customer-auth.page.ts` — widget locators
- `frontend/e2e/customer-auth-challenge.e2e.ts` — the mocked spec
- `frontend/e2e/customer-auth.e2e.ts` — existing register journey mocks the challenge route
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the register card with the widget
- `frontend/e2e/real-backend/register.e2e.ts` — the real solve
- `RESPONSIBILITIES.md` — § *Platform edge*: the challenge
- `docs/deploy/production-hardening.md` — env row, properties, the CSP `worker-src` note
- `docs/architecture/auth-signin-register.md` — the D-8 status line (#905 shipped, #906/#907 in flight)
- `CLAUDE.md` — the Platform-edge summary names the fence (docs-freshness)
- `platform/src/main/java/ai/riviera/platform/ScheduledQueryTimeout.java` — two count phrasings dropped (docs-freshness)

---

## Phase 0 — prototype + plan doc + draft PR

- [x] Prototype run; numbers and verdict recorded above.
- [x] Commit this doc — `Plan the proof-of-work challenge spine (#905)`; draft PR #911 opened.

## Phase 1 — properties, V49 registry, JDBC claim, sweep

- [x] Red: `AltchaPropertiesBindingTest` (shipped defaults; cost/expiry/skew bounds fail the context).
- [x] Red: `ChallengeRegistryMigrationIT` (PK rejects a second row; `ON CONFLICT DO NOTHING` answers 0).
- [x] Red: `ChallengeRegistrySweepIT` (expired row gone, live row kept; the claim port answers true once).
- [x] Green: `AltchaProperties`, `V49__challenge_registry.sql`, `ChallengeRegistry`,
  `JdbcChallengeRegistry` (bounded sweep client, `riviera.scheduled.query-timeout-seconds`),
  `ChallengeRegistrySweep`; `ScheduledWorkArchitectureTest` set + `pool.size=6`.
- [x] Scoped runs: the three classes + `ScheduledWorkArchitectureTest` + the structural net.
- [x] Commit — `Add the single-use challenge registry, its sweep and the riviera.altcha properties (#905)`

## Phase 2 — challenge endpoint, verifier filter, rate-limit budget, ITs

- [x] Red: `ChallengeEndpointTest` (AC-1, AC-2), `ChallengeVerificationFilterTest` (AC-9),
  `AltchaDisabledTest` (AC-8), `RateLimitFilterTest` (challenge dimension), then
  `CustomerRegisterChallengeIT` (AC-3..AC-6) and `CustomerRegisterIT` carrying a solution.
- [x] Green: `build.gradle` deps, `ProofOfWorkChallenges`, `ChallengeVerdict`, `ChallengeController`,
  `ChallengeVerificationFilter` (after `CsrfFilter`), `SecurityProblemResponses` bodies,
  `RequestPaths`, `RateLimitFilter`/`RateLimitProperties` challenge budget, `SecurityConfig`
  wiring, `WebSliceStubs` in-memory registry, `EndpointRoleGateCoverageTest` entry, `ChallengeSolving`.
- [x] Scoped runs: each class one at a time; the structural net; `EndpointRoleGateCoverageTest`.
- [x] Generalization audit: every fixture that POSTs the customer register (`grep -rln "customer/register" platform/src/test frontend/e2e`) carries a solution or a mocked route.
- [x] Commit — `Issue and verify ALTCHA challenges at the edge; fence the customer register (#905)`

## Phase 3 — frontend

- [x] Load `riviera-tailwind`, `angular-developer` (+ angular-cli MCP — `list_projects` + `get_best_practices`; `search_documentation` is broken in this sandbox, the skill's `http-client.md` reference stood in), announce.
- [x] Red: `challenge.spec.ts`, `proof-of-work.spec.ts`, `customer-auth.spec.ts` (header + codes),
  `challenge-widget.spec.ts` (renders only when enabled; state → status text; `refresh()`),
  `challenge-widget.a11y.spec.ts`, `challenge-widget.contrast.spec.ts`, `auth-page.spec.ts` (passes
  the payload; refreshes on a challenge rejection), `auth-page.a11y.spec.ts`.
- [x] Green: `altcha@3.2.2` pinned; FE-1..FE-5; `npm run lint`, `format:check`, `test` (2505 passed), `build` (the widget is its own 32 kB lazy chunk; the initial bundle is unchanged).
- [x] Commit — `Show the ALTCHA control on customer register and carry the solution header (#905)`

## Phase 4 — Playwright

- [x] Load `playwright-cli`, announce. Mocked: `auth-mocks.ts` challenge route (cost 10, real solve),
  `customer-auth-challenge.e2e.ts` (AC-11), `customer-auth.e2e.ts` + `touch-targets-tourist.e2e.ts`
  updated; run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` scoped.
- [x] Real backend: `real-backend/register.e2e.ts` (AC-12) written; run via `scripts/e2e-local-stack.sh` if the
  container can bring the stack up; otherwise say so in the PR.
- [x] Commit — `Cover the challenge in the mocked and real-backend Playwright suites (#905)`

## Phase 5 — docs, merge `main`, ready for review

- [x] `RESPONSIBILITIES.md` § *Platform edge*, `production-hardening.md`, D-8 status line;
  `git rm docs/plans/password-policy-12.md`; `riviera-docs-freshness` counting sweep.
- [x] Merge `origin/main` — nothing to merge (0 behind); `node scripts/check-plan-file-structure.mjs --diff origin/main` clean.
- [x] Mark the PR ready for review.

## Phase 6 — gates

- [ ] `/code-review` (high effort: authorization edge) + `riviera-review-overlay`; Sonar list cleared; findings register updated; close-out.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-03 | phase 2 — the fence refuses a header-less register | every test that POSTs the customer register or probes it | `grep -rln "customer/register" platform/src/test frontend/e2e frontend/src` | 6 ITs (`CustomerRegisterIT`, `EmailVerificationIT`, `PasswordResetIT`, `RecoveryMailerFailureIT`, `RecoveryTokenNeverPersistedIT`, `SetPasswordIT`), `RateLimitFilterTest`, `EndpointRoleGateCoverageTest`, the FE service + spec, the e2e mocks | ITs carry `SessionLoginSupport.solvedChallenge(mvc)`; the two guards switch the fence off (they pin budgets / gates, not the fence); the FE sites are phase 3–4 |

---

## Acceptance-criteria verification (final)

Backend runs are `gradle --no-daemon --console=plain test --tests "*<Class>*"` from `platform/` (JDK 25
toolchain, the sandbox's `dockerd` for the ITs — every IT ran with `skipped="0"`); frontend runs are from
`frontend/`.

- [x] **AC-1, AC-2:** `*ChallengeEndpointTest*` → 3 passed. Verified at `316c64b`.
- [x] **AC-3..AC-6:** `*CustomerRegisterChallengeIT*` → 7 passed (real Postgres; the concurrent replay admits exactly one; the eleventh header-less register is `429`). Verified at `f1b6eab`.
- [x] **AC-5 (constraint):** `*ChallengeRegistryMigrationIT*` → 2 passed. Verified at `d00b703`.
- [x] **AC-7:** `*ChallengeRegistrySweepIT*` → 2 passed. Verified at `d00b703`.
- [x] **AC-8:** `*AltchaDisabledTest*` → 2 passed; `*AltchaPropertiesBindingTest*` → 8 passed. Verified at `f1b6eab` / `d00b703`.
- [x] **AC-9:** `*ChallengeVerificationFilterTest*` → 9 passed. Verified at `f1b6eab`.
- [x] **AC-10:** `*ModularityTests* *JdbcOnlyArchitectureTests* *PackageShapeArchitectureTests* *CompositionRootDisciplineTests* *ScheduledWorkArchitectureTest* *EndpointRoleGateCoverageTest*` → all green. Verified at `f1b6eab`.
- [x] **AC-11:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → 413 passed (incl. `customer-auth-challenge.e2e.ts` ×5). Verified at `d1c680f`.
- [x] **AC-12:** local stack (`scripts/e2e-local-stack.sh` with `gradle bootRun`), `npx playwright test e2e/real-backend/register.e2e.ts` → 1 passed, 13 s. Verified at `d1c680f`.
- [x] **AC-13, AC-14:** `npx ng test --watch=false` → 2505 passed (the wrapper's unit, a11y and contrast specs, `auth-page.*.spec.ts`, `customer-auth.spec.ts`, `proof-of-work.spec.ts`). Verified at `6a505b5` / `d1c680f`.
- [x] **AC-15:** `RESPONSIBILITIES.md` § *Platform edge*, `production-hardening.md`, the D-8 status line, `git rm docs/plans/password-policy-12.md` — in `d1c680f` / `316c64b`.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
