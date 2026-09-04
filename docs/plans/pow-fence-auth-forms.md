# Proof-of-Work Fence on Operator Register and Forgot-Password — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Extend the ADR-0016 proof-of-work fence from customer register to the two remaining
public auth writes — `POST /api/auth/operator/register` and `POST /api/auth/customer/forgot-password`
— with the same verifier, header, registry, problem codes and widget wrapper, and no new backend
building blocks.

**Architecture:** The single significant decision is that **nothing new is built**: the fenced route
set is one `Set<String>` constant in the root's `ChallengeVerificationFilter` (ADR-0017 keeps the
fence at the edge and the mechanism in the `challenge` module), so the backend change is two entries
plus the tests that prove them. On the frontend the same `shared/challenge-widget.ts` wrapper is
mounted on two more forms and the two auth services grow the same optional `challenge` argument the
customer register already takes. Forgot-password's non-enumeration (D-8) is preserved *by
construction* — the fence is a servlet filter that runs before the controller, so a challenge
refusal is decided before any account lookup or mail decision and is byte-identical for a registered
and an unregistered email.

**Persistence:** JDBC only (invariant #1). **No schema change, no Flyway migration** — the
`challenge_registry` table (V49) and its single-use claim are unchanged; this slice adds no table,
column, index or query.

**Source of intent:** GitHub issue #906 (parent epic #903; decisions ADR-0016, ADR-0017, D-8;
stories 16, 21).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed both
blockers merged, found the six backend ITs and the mocked-e2e assertion that the fence will break,
and the stale `RateLimitFilter` refund comment) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger for the retired "no widget in this slice" assertions and the AC seam names) ·
`tdd` (each phase red-green at the HTTP route / Angular component seam) · `riviera-review-overlay`
(review gate — runs at ready-for-review) · `riviera-docs-freshness` (**ran** over
`origin/main...HEAD`, 2 findings, both patched — see the Findings register) · `riviera-modulith`
(confirmed the change is root-only: no module, port, event or `allowedDependencies` change — the
fenced-route decision is explicitly `challenge`'s Not-My-Job) · `riviera-java-conventions`
(§6a named constants for the two route literals, §6c one-line comments, §6d Javadoc-as-contract on
the filter and the new ITs) · `riviera-frontend` (`auth/` feature folder for both pages,
`core/` for the two auth services, `shared/challenge.ts` as the one wording source) ·
`angular-developer` + angular-cli MCP (v22 signal APIs on the forgot-password widget wiring) ·
`riviera-tailwind` (the widget carries its own host tokens; the only added class is a margin — no
new token, and the 24 px checkbox exemption is inherited unchanged) · `playwright-cli` (both
suites: mocked fence handles in `e2e/support/auth-mocks.ts`, real-challenge journeys in
`e2e/real-backend/`) · `riviera-local-debug` (scoped Gradle/Vitest/Playwright commands in a cloud
session).

**Branch:** `claude/sdlc-906-62bsyj` — the cloud session's designated remote branch stands in for
`feature/pow-fence-auth-forms` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the fence is armed, when `POST /api/auth/operator/register` carries a
  library-minted solved challenge, then the registration is accepted (`202`) and the pending
  operator row exists; when the header is missing / forged / expired / already claimed, then the
  response is `400` with `CHALLENGE_REQUIRED` / `CHALLENGE_INVALID` / `CHALLENGE_EXPIRED` /
  `CHALLENGE_EXPIRED` respectively and **no operator row is written**.
  *Seam:* `POST /api/auth/operator/register` (the fenced HTTP route) · *Pinned by:*
  `OperatorRegisterChallengeIT.{registersWithASolvedChallenge,rejectsAMissingHeader,rejectsATamperedSignature,rejectsAnExpiredChallenge,rejectsAReplayedSolution}`
- [ ] **AC-2:** Given the fence is armed, when `POST /api/auth/customer/forgot-password` carries a
  solved challenge, then it answers the uniform `204` and mails the link for an account that exists;
  when the challenge is missing / forged / expired / replayed, then it answers `400` with the
  matching code and **sends no mail**.
  *Seam:* `POST /api/auth/customer/forgot-password` (the fenced HTTP route) · *Pinned by:*
  `ForgotPasswordChallengeIT.{sendsTheLinkWithASolvedChallenge,rejectsAMissingHeader,rejectsATamperedSignature,rejectsAnExpiredChallenge,rejectsAReplayedSolution}`
- [ ] **AC-3:** Given a registered email, an unregistered email and an SSO-only email, when each
  posts forgot-password with a **failed** challenge, then all three answers are byte-identical
  (status, body and headers) and the mock outbox is empty for all three.
  *Seam:* `POST /api/auth/customer/forgot-password` · *Pinned by:*
  `PasswordResetIT.forgotPasswordChallengeFailureIsIdenticalRegardlessOfAccountState`
- [ ] **AC-4:** Given a per-IP budget of N on each route, when N challenge-refused requests are sent
  from one IP, then the next request from that IP is `429 RATE_LIMITED` — a `400` challenge refusal
  is never refunded (the limiter refunds only `401`/`403`).
  *Seam:* the two fenced HTTP routes behind `RateLimitFilter` · *Pinned by:*
  `OperatorRegisterChallengeIT.aChallengeFailureStillSpendsTheOperatorRegisterBudget` and
  `ForgotPasswordChallengeIT.aChallengeFailureStillSpendsTheRecoveryBudget`
- [ ] **AC-5:** Given each verdict the `challenge` module's port can return, when it is returned for
  either newly fenced route, then the filter answers the same `400` + code contract as customer
  register, and an unfenced sibling route (`/api/auth/customer/reset-password`) still ignores the
  header entirely.
  *Seam:* `ChallengeVerificationFilter` observed through the three routes' HTTP contract ·
  *Pinned by:* `ChallengeVerificationFilterTest.{eachFencedRouteRefusesAMissingHeader,eachFencedRouteRefusesAnInvalidVerdict,eachFencedRouteRefusesAnExpiredVerdict,anUnfencedRecoveryRouteIgnoresTheHeader}`
- [ ] **AC-6:** Given the operator register card, when the audience is `operator` and the mode is
  `register`, then the widget is mounted, its solved payload is sent as `X-Altcha-Payload`, and each
  of the three rejection codes renders the shared message from `shared/challenge.ts` and restarts
  the widget; when the platform answers `204` from the challenge route, the widget is absent and the
  register still submits.
  *Seam:* `auth/auth-page.ts` rendered component + `core/operator-auth.ts#register` ·
  *Pinned by:* `auth-page.spec.ts` (`operator register` describe) + `operator-auth.spec.ts`
- [ ] **AC-7:** Given the forgot-password page, when the fence is armed, then the widget is mounted
  and the request carries the solved payload; a rejection renders the shared message and refreshes
  the widget; with the fence off the widget is absent and the request still submits.
  *Seam:* `auth/forgot-password.ts` rendered component + `core/customer-auth.ts#forgotPassword` ·
  *Pinned by:* `forgot-password.spec.ts` + `customer-auth.spec.ts`
- [ ] **AC-8:** Given the CI-safe mocked suite, when the operator-registration and password-reset
  journeys run in Chromium, then the widget really solves the mocked challenge, the POST carries the
  header, each of the three refusals renders its message and fetches a fresh challenge so the retry
  succeeds without a reload, and the kill switch hides the widget on both pages.
  *Seam:* the two routes' Playwright journeys · *Pinned by:*
  `frontend/e2e/operator-register-challenge.e2e.ts` and `frontend/e2e/forgot-password-challenge.e2e.ts`
- [ ] **AC-9:** Given a real backend, when an operator self-registers and when a tourist requests a
  password reset, then each solves a **real** challenge in the browser and the backend accepts it.
  *Seam:* the two journeys against the running API · *Pinned by:*
  `frontend/e2e/real-backend/auth-challenge.e2e.ts`
- [ ] **AC-10:** Given all three themes, when axe and the composited-contrast maths run on the
  operator register card and the forgot-password page (widget mounted), then there are no serious
  violations and every text pair meets AA.
  *Seam:* the rendered components under `src/testing/contrast.ts` · *Pinned by:*
  `auth-page.a11y.spec.ts` (a fenced case per register audience), `forgot-password.a11y.spec.ts`
  (new, four states), plus the existing contrast maths: `auth-page.contrast.spec.ts` for the card
  tokens both pages share and `shared/challenge-widget.contrast.spec.ts` for the widget's own, each
  already per-theme over the worst-case gradient stops. **No `forgot-password.contrast.spec.ts`**:
  the card is the same glass stack with the same `--riv-*` pairs, so a third file would be a
  duplicated block proving nothing new (recorded here rather than silently narrowed).
- [ ] **AC-11:** Given `RESPONSIBILITIES.md` § *Platform edge*, when a reader looks for the fenced
  set, then all three fenced auth routes are named there (and the "in their own slices" list no
  longer claims these two are pending). *Seam:* the doc itself · *Pinned by:* review (RV-PROC) +
  `riviera-docs-freshness` at close-out.

## Non-goals

- **Fencing booking create** — story 16's remaining route, its own slice; the wording in
  `RESPONSIBILITIES.md` keeps it as pending.
- **Fencing reset-password, verify-email, or either login.** Login stays unfenced (the per-identity
  throttle covers it, ADR-0016); the token-redemption routes carry a bearer credential already.
- **Any new backend building block** — no new port, filter, problem code, property, table or
  migration. Issue #906 says a need for one is a smell to raise, not to build around; none was found.
- **Changing the widget wrapper, the verifier, the registry, the kill switch, or the 24 px checkbox
  exemption** (#920/#921 shipped those; this slice mounts and calls them unchanged).
- **Re-wording the rejection copy** — the shared constants from the spine slice are reused verbatim.

## Behavior-parity ledger

> The slice replaces two *assertions of absence* (the fence deliberately not present on these forms)
> rather than a user-facing surface. Each retired assertion is listed so no coverage is silently lost.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `auth-page.ts` `showChallenge` = tourist ∧ register (operator register renders no widget) | changed → widget on both audiences | `showChallenge` becomes `mode() === 'register'`; the operator branch of `runRegister` now awaits `solved()` and passes the payload |
| `customer-auth-challenge.e2e.ts` "the operator register shows no widget in this slice" | dropped → **inverted** | replaced by `operator-register-challenge.e2e.ts`, which asserts the widget IS mounted and solves |
| `operator-auth.ts#register` returns only `submitted`/policy/rate-limit/error on a 400 | changed | a 400 now maps through `challengeRejection(code)` first, exactly as `customer-auth.ts#register` does |
| `customer-auth.ts#forgotPassword` collapses every non-429 failure to `error` | changed | a 400 with a challenge code maps to its `ChallengeRejection`; every other failure still collapses to `error` (D-8 uniformity unchanged) |
| Six backend ITs post to these two routes with no challenge header and expect success | changed | each now sends `SessionLoginSupport.solvedChallenge(mvc)` — the ITs solve, they never bypass |
| `RateLimitFilter` `RECOVERY_PATHS` Javadoc: "the only denial reachable before the controller is a CSRF 403" | changed | reworded: the fence's `400` is now also reachable pre-controller, and is deliberately **not** refunded |
| Forgot-password answers a uniform 204 for every email (D-8) | preserved | the fence runs before the controller, so a refusal is decided before the account lookup; AC-3 pins byte-identity across account states |
| The three rejection codes' user-facing wording | preserved | both new call sites read `challengeRejectionMessage` from `shared/challenge.ts` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Fencing forgot-password turns it into an enumeration oracle (a challenge failure answering differently for a known vs unknown email) | low | high | The fence is a filter ahead of the controller — it cannot see the email; AC-3 pins byte-identical answers **and** an empty outbox across registered / unregistered / SSO-only | agent | closed — `e69e3e4` (`PasswordResetIT`; the per-request `X-Correlation-Id` is the one excluded header, a fresh UUID carrying nothing about the account) |
| R-2 | Six existing backend ITs and several `@WebMvcTest` slices post to the newly fenced routes without a header and start failing | **high** | med | Enumerated up front (`grep -rln` over `platform/src/test`); each is fixed in phase 0 with `SessionLoginSupport.solvedChallenge(mvc)`; the phase's regression run is the whole `ai.riviera.platform` root package, not just the new ITs | agent | closed — `e69e3e4`; it was **eight** ITs, not six, and the two web slices needed nothing (both pin the kill switch) |
| R-3 | Solving a real challenge in every touched IT slows the suite (shipped `cost` = 5000) | med | low | The challenge ITs pin `riviera.altcha.cost=10` in their own contexts; the shared-context ITs already pay this on customer register (precedent: `CustomerRegisterIT`), and each adds at most one solve per request | agent | closed — `e69e3e4`; the repaired ITs ran in 43–50 s per batch locally, in line with their pre-slice cost |
| R-4 | A challenge refusal gets refunded by the rate limiter, so a flood of header-less posts is free | low | med | `RateLimitFilter` refunds only on `401`/`403` (`accessWasDenied`); the fence answers `400` deliberately. AC-4 pins the budget draining on both routes | agent | closed — `e69e3e4` (both budget tests), with the limiter's own note corrected (finding D-1) |
| R-5 | The operator register's **auto-sign-in follow-up** (`runRegister` → `signIn`) is mistakenly fenced too, so a fresh registration cannot land | med | med | Login is not in `FENCED_POSTS` and stays out; the mocked e2e drives register→auto-sign-in→console end to end | agent | closed — `6cf6149`; `operator-register-challenge.e2e.ts` also asserts sign-in shows no widget at all |
| R-6 | The widget survives an audience/mode switch holding a stale solution, so an operator register posts a payload minted for the tourist card | low | med | `auth-page.ts`'s existing audience/mode effect already clears `challengePayload`; a unit spec pins that the operator card starts unverified | agent | closed — `31e158a` (`auth-page.spec.ts` "never carries the tourist card's solution across the audience switch") |
| R-7 | Flyway version collision with an in-flight PR | n/a | n/a | **No migration in this slice**; `V<n>` unclaimed. Checked: no open PRs on the repo at plan time | agent | closed — no schema change |
| R-8 | `mockCustomerRecoveryApi` / `mockOperatorLifecycleApi` gain a fence by default and silently break unrelated e2e specs that never solve | med | med | Both mocks default the fence **on** (matching the shipped server) and are audited spec by spec in phase 2; the widget solves automatically on form focus, so a journey that focuses the form needs no change | agent | closed — `6cf6149`; the whole 424-test mocked suite is green. One spec did need a change: `fixed-fill-state-skins.e2e.ts` hand-rolls its own routes and mocked no challenge route at all, so it now installs the fence explicitly off |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** the two blockers are on `main` — #905's spine (PR #911) and #913's module move
  (PR #916), plus the follow-ups #917/#919/#921. **Verified at plan time** from `git log origin/main`.
- **Assumption:** "each route's own rate-limit bucket" (issue AC-3) means the bucket the route
  already draws on. **Confirmed in phase 0** (`e69e3e4`): `RateLimitFilter.authPostBudgetFor` gives
  operator register its own `operatorRegisterBuckets` and forgot-password the `recoveryBuckets` map
  the three public recovery POSTs share by design. This slice does not split the recovery bucket, and
  each route's budget test drains the bucket it actually rides.
- **Assumption:** the mocked e2e fence stays **on by default** in the two extended mocks.
  **Held in phase 2** (`6cf6149`) — one shared `mockChallengeFence` arms all three, `challenge: 'off'`
  is the per-spec kill switch, and the full 424-test suite is green.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches no booking, no beach map and no
`availability` row: it adds two entries to an edge filter's fenced-route set and mounts an existing
widget on two auth forms. The one concurrency property in play is the challenge registry's
single-use claim (`INSERT … ON CONFLICT DO NOTHING` on `challenge_registry`), which is the
`challenge` module's own, unchanged by this slice and already pinned by
`CustomerRegisterChallengeIT.concurrentReplayAdmitsExactlyOne`; the replay AC on each new route
observes the same claim from its own route.

## Spring Modulith — modules, interfaces, events

**Modules touched:** none. The whole backend change is in the composition root
(`ai.riviera.platform.ChallengeVerificationFilter` + `RateLimitFilter`'s Javadoc), which is not a
module. No `allowedDependencies` change, no new published surface, no new event, no
`@ApplicationModuleListener`. The root already reaches `challenge::api` + `::vocabulary` and
continues to reach exactly that.

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | none | — | — | root-only change; `ModularityTests` unaffected but re-run as the structural net |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `challenge.api` | `ProofOfWorkChallenges#enabled()`, `#verify(String)` | `ChallengeVerdict` | the root's `ChallengeVerificationFilter` — **consumed unchanged, not modified** |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none | — | — | — | — | — |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Deciding that operator-register and forgot-password are fenced routes | the **root** (platform edge) | `challenge`'s Not-My-Job list is explicit: "deciding which routes are fenced, the filter and its ordering, the problem bodies" (`RESPONSIBILITIES.md` §`challenge`); ADR-0017 keeps the fence at the edge and the mechanism in the module |
| Verifying and single-use-claiming a submitted solution | `challenge` | its Job line — unchanged by this slice, called through `api.ProofOfWorkChallenges` |
| Creating the pending operator row / issuing the reset token + mail | `operator` / `customer` + `notification` | unchanged; the fence never reaches them on a refusal |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; no ledger row, Stripe call, refund or commission is
touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/auth-page.ts` | existing | standalone component | signals; `showChallenge` computed widened to both audiences; `challengePayload` model already reset by the audience/mode effect | Signal Forms |
| FE-2 | `auth/forgot-password.ts` | existing | standalone component | signals; injects `ProofOfWork`, holds a `challengePayload` signal + a `viewChild` on the widget | Signal Forms |
| FE-3 | `core/operator-auth.ts` | existing | `@Service()` | `register()` gains an optional `challenge` argument; `OperatorRegisterResult` gains `ChallengeRejection` | — |
| FE-4 | `core/customer-auth.ts` | existing | `@Service()` | `forgotPassword()` gains an optional `challenge` argument; `ForgotPasswordResult` gains `ChallengeRejection` | — |
| FE-5 | `shared/challenge-widget.ts` | existing | standalone component | **consumed unchanged** | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()`
signal APIs. No deviation. Styling: the widget carries its own `--altcha-*`→`--riv-*` host mapping;
the only new class is the forgot-password mount's spacing utility (`riviera-tailwind` rule 5 idioms,
no new token, no `@apply`).

## FE↔BE contract

- **New/changed endpoints:** none. Two existing `POST`s gain a **request header** requirement when
  the fence is armed: `X-Altcha-Payload: <base64 widget payload>`, and three new failure codes on
  their existing `400 application/problem+json` shape — `CHALLENGE_REQUIRED`, `CHALLENGE_INVALID`,
  `CHALLENGE_EXPIRED` (all already defined by the spine slice, none new).
- **Client typing:** the header is built by `shared/challenge.ts#challengeHeaders(payload)` and the
  codes are mapped by `challengeRejection(code)` — the same typed helpers customer register uses. No
  `as any`.
- **Money/date on the wire:** N/A — neither route carries money or a booking date.

## Execution status

**Stage pointer:** `PR — marking #922 ready for review`

**Next action:** mark PR #922 ready for review, then run the Review gate
(`riviera-sdlc` `references/pr-gates.md` §1) and the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend: fence the two routes + repair the existing ITs | ✅ | (this commit) |
| 1 — Frontend: services, both pages, unit + a11y/contrast specs | ✅ | (this commit) |
| 2 — e2e: mocked fence handles + both suites | ✅ | (this commit) |
| 3 — Docs + close-out | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| D-1 | docs-freshness (`origin/main...HEAD`) | `RateLimitFilter`'s `RECOVERY_PATHS` Javadoc stated "the only denial reachable before the controller is a CSRF `403`" — the fence's `400` is now also reachable there, and is deliberately outside the refund | patched in phase 0 |
| D-2 | docs-freshness (`origin/main...HEAD`) | `RESPONSIBILITIES.md` § *Platform edge* said the fenced set is "customer register today; operator register, forgot-password and booking create in their own slices" — two of those three shipped here | patched in phase 3 (AC-11) |

---

## File structure

- `docs/plans/pow-fence-auth-forms.md` — this plan doc.
- `RESPONSIBILITIES.md` — § *Platform edge*: name all three fenced auth routes.
- `platform/src/main/java/ai/riviera/platform/ChallengeVerificationFilter.java` — the two routes join
  `FENCED_POSTS`; Javadoc updated.
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — `RECOVERY_PATHS` Javadoc: the
  fence's non-refunded `400` is now also reachable before the controller.
- `platform/src/test/java/ai/riviera/platform/ChallengeVerificationFilterTest.java` — the contract
  runs over every fenced route, plus the unfenced-sibling case.
- `platform/src/test/java/ai/riviera/platform/OperatorRegisterChallengeIT.java` — new: AC-1, AC-4.
- `platform/src/test/java/ai/riviera/platform/ForgotPasswordChallengeIT.java` — new: AC-2, AC-4.
- `platform/src/test/java/ai/riviera/platform/PasswordResetIT.java` — AC-3 + solved challenges.
- `platform/src/test/java/ai/riviera/platform/SessionLoginSupport.java` — the solve helper's Javadoc
  names all fenced writes.
- `platform/src/test/java/ai/riviera/platform/OperatorRegistrationIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/OperatorApprovalIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/OperatorApprovalMailIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/OperatorRejectionRevocationIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/PendingOperatorConsoleIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/RecoveryRateLimitIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/RecoveryMailerFailureIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/RecoveryTokenNeverPersistedIT.java` — solved challenge.
- `platform/src/test/java/ai/riviera/platform/AccountRecoveryControllerTest.java` — slice-level
  adjustment if the slice imports `SecurityConfig`.
- `platform/src/test/java/ai/riviera/platform/MyAccountControllerTest.java` — same, if affected.
- `platform/src/test/java/ai/riviera/platform/AltchaDisabledTest.java` — the kill switch covers all
  three fenced routes.
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — kept green (it pins
  `riviera.altcha.enabled=false`).
- `frontend/src/app/core/operator-auth.ts|.spec.ts` — `register(…, challenge?)` + rejection results.
- `frontend/src/app/core/customer-auth.ts|.spec.ts` — `forgotPassword(…, challenge?)` + rejections.
- `frontend/src/app/auth/auth-page.ts|.spec.ts` — widget on the operator register card.
- `frontend/src/app/auth/auth-page.a11y.spec.ts` — operator register card with the widget.
- `frontend/src/app/auth/auth-page.contrast.spec.ts` — unchanged; already covers the shared card
  tokens in all three themes (see AC-10's note).
- `frontend/src/app/auth/forgot-password.ts|.spec.ts` — widget mounted + solved payload.
- `frontend/src/app/auth/forgot-password.a11y.spec.ts` — new.
- `frontend/e2e/support/auth-mocks.ts` — the fence in `mockOperatorLifecycleApi` +
  `mockCustomerRecoveryApi`, exposing the shared `ChallengeMock` handle.
- `frontend/e2e/support/pages/operator-sign-in.page.ts` — widget locators + the register gesture.
- `frontend/e2e/fixed-fill-state-skins.e2e.ts` — its hand-rolled operator-register routes turn the
  fence off, so the spec stays about the fill state.
- `frontend/e2e/operator-register-challenge.e2e.ts` — new (AC-8).
- `frontend/e2e/forgot-password-challenge.e2e.ts` — new (AC-8).
- `frontend/e2e/customer-auth-challenge.e2e.ts` — the "no widget in this slice" assertion retired.
- `frontend/e2e/operator-registration.e2e.ts` — journey audited against the armed fence.
- `frontend/e2e/unified-auth.e2e.ts` — same.
- `frontend/e2e/admin-operator-suspension.e2e.ts` — same.
- `frontend/e2e/fixed-fill-state-skins.e2e.ts` — same.
- `frontend/e2e/password-reset.e2e.ts` — same.
- `frontend/e2e/real-backend/auth-challenge.e2e.ts` — new (AC-9).

---

## Phase 0 — Backend: fence the two routes

**Files:** Modify `ChallengeVerificationFilter.java` · Modify `RateLimitFilter.java` (Javadoc) ·
Test `ChallengeVerificationFilterTest.java`, new `OperatorRegisterChallengeIT`,
`ForgotPasswordChallengeIT`, extended `PasswordResetIT` · Repair the enumerated ITs.

- [ ] **Step 1: Write the failing tests** — parameterize `ChallengeVerificationFilterTest` over the
  fenced set (AC-5); add `OperatorRegisterChallengeIT` and `ForgotPasswordChallengeIT` modelled on
  `CustomerRegisterChallengeIT` (AC-1, AC-2, AC-4); add
  `PasswordResetIT.forgotPasswordChallengeFailureIsIdenticalRegardlessOfAccountState` (AC-3).
- [ ] **Step 2: Run them, verify they fail** —
  `./gradlew test --tests "*ChallengeVerificationFilterTest*" --tests "*OperatorRegisterChallengeIT*" --tests "*ForgotPasswordChallengeIT*"`
  → FAIL (the routes are not fenced: `202`/`204` where a `400` code is expected).
- [ ] **Step 3: Minimal implementation** — add the two paths to `FENCED_POSTS` as named constants
  and update the constant's Javadoc.
- [ ] **Step 4: Run them, verify they pass**, then broaden to the root package:
  `./gradlew test --tests "ai.riviera.platform.*"`.
- [ ] **Step 5: Generalization-audit pass** — population = *every test that POSTs to a route in
  `FENCED_POSTS`*; enumerate with
  `grep -rln "operator/register\|forgot-password" platform/src/test --include=*.java`; fix each.
- [ ] **Step 6: Commit** — `git commit -m "Fence operator register and forgot-password with the proof-of-work challenge (#906)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Frontend: services and both forms

**Files:** Modify `core/operator-auth.ts`, `core/customer-auth.ts`, `auth/auth-page.ts`,
`auth/forgot-password.ts` · Test their specs + the four a11y/contrast specs.

- [ ] **Step 1: Write the failing specs** — `operator-auth.spec.ts` (header sent, the three codes
  map to rejections), `customer-auth.spec.ts` (same for forgot-password), `auth-page.spec.ts`
  (widget on the operator register card, payload passed, refusal refreshes), `forgot-password.spec.ts`
  (widget mounted, payload sent, refusal message + refresh, fence off = no widget).
- [ ] **Step 2: Run them, verify they fail** — `npm test -- --run auth`.
- [ ] **Step 3: Minimal implementation** — the optional `challenge` argument on both service
  methods, `challengeHeaders`/`challengeRejection` at both call sites, `showChallenge` widened, the
  widget mounted on forgot-password.
- [ ] **Step 4: Run them, verify they pass**, then `npm run test:a11y` for AC-10.
- [ ] **Step 5: Generalization-audit pass** — population = *every FE call site of a fenced write*;
  enumerate with `grep -rn "AUTH_API}/\(customer\|operator\)" frontend/src/app/core`.
- [ ] **Step 6: Commit** — `git commit -m "Mount the proof-of-work widget on operator register and forgot-password (#906)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — e2e: both suites

**Files:** Modify `e2e/support/auth-mocks.ts`, `e2e/support/pages/operator-sign-in.page.ts`,
`e2e/customer-auth-challenge.e2e.ts` · Create `e2e/operator-register-challenge.e2e.ts`,
`e2e/forgot-password-challenge.e2e.ts`, `e2e/real-backend/auth-challenge.e2e.ts`.

- [ ] **Step 1: Write the failing specs** (AC-8, AC-9).
- [ ] **Step 2: Run them, verify they fail** — `npm run test:e2e:a11y -- operator-register-challenge forgot-password-challenge`.
- [ ] **Step 3: Minimal implementation** — the fence in both mocks (default on), the retired
  assertion inverted.
- [ ] **Step 4: Run the whole mocked suite** — `npm run test:e2e:a11y` (R-8's audit).
- [ ] **Step 5: Generalization-audit pass** — population = *every mocked spec that posts to a fenced
  route*; enumerate with `grep -rln "operator/register\|forgot-password\|customer/register" frontend/e2e`.
- [ ] **Step 6: Commit** — `git commit -m "Prove the fence on both new auth forms in the mocked and real-backend suites (#906)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Docs + close-out

**Files:** Modify `RESPONSIBILITIES.md` · Finalize this plan doc.

- [ ] **Step 1:** `RESPONSIBILITIES.md` § *Platform edge* names all three fenced auth routes and
  leaves booking create as the pending one (AC-11).
- [ ] **Step 2:** run `riviera-docs-freshness` over `origin/main..HEAD`; record findings.
- [ ] **Step 3:** `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [ ] **Step 4:** finalize Execution status, ACs and the self-review checklist.
- [ ] **Step 5: Commit** — `git commit -m "Name the three fenced auth routes in RESPONSIBILITIES (#906)"`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-04 | phase 3 — the fenced set grew from one route to three | every substrate-doc sentence that counts or enumerates fenced routes, plus the renamed `refuseNextRegisterWith` | `grep -rniE '\b(the\|one\|only\|a) fenced (route\|post\|write)\b\|\bfenced routes?\b\|\bthe fence\b' CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents docs/runbooks docs/design .claude/skills platform/src/main frontend/src` + `grep -rn 'refuseNextRegisterWith\|customer register today' <substrate>` | 30 hits, 1 stale | only `RESPONSIBILITIES.md`'s enumeration named a count (D-2, patched); every other "the fence" sentence is subject-generic and stays true, and ADR-0017's "two slices are about to widen the fenced route set" is Context-section narrative, which the skill's scope discipline keeps as history |
| 2026-09-04 | phase 2 — the fence reached two more mocked routes | every mocked e2e spec that POSTs to a fenced route (whether through a shared mock or its own `page.route`) | `grep -rln "operator/register\|forgot-password\|customer/register" frontend/e2e` | 10 files | the three stateful mocks now share one `mockChallengeFence` (so no spec can meet a fence that behaves unlike its siblings'); `fixed-fill-state-skins.e2e.ts` hand-rolls its own routes and had no challenge route at all, so it now installs the fence explicitly **off**; the rest go through a shared mock and needed nothing |
| 2026-09-04 | phase 0 — the fenced set grew | every backend test that POSTs to a route in `FENCED_POSTS` | `grep -rn "operator/register\|forgot-password" platform/src/test --include=*.java` | 16 hits over 12 files | 8 ITs now send `SessionLoginSupport.solvedChallenge(mvc)`; `RateLimitFilterTest` + `EndpointRoleGateCoverageTest` need nothing (both pin `riviera.altcha.enabled=false`); `MyAccountControllerTest` was a comment hit only; `AltchaDisabledTest` gained a kill-switch case per new route |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*OperatorRegisterChallengeIT*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*ForgotPasswordChallengeIT*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "*PasswordResetIT*"` → PASS.
- [ ] **AC-4:** covered by the two challenge ITs' budget tests → PASS.
- [ ] **AC-5:** `./gradlew test --tests "*ChallengeVerificationFilterTest*"` → PASS.
- [ ] **AC-6/AC-7:** `npm test` → PASS.
- [ ] **AC-8:** `npm run test:e2e:a11y` → PASS.
- [ ] **AC-9:** `npm run test:e2e` (local, real backend) → PASS or recorded as not runnable here.
- [ ] **AC-10:** `npm run test:a11y` → PASS.
- [ ] **AC-11:** review + docs-freshness.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (no booking/map/availability surface touched).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module imports added; root reaches only
      `challenge::api` + `::vocabulary` (invariant #11).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7); the challenge payload is never logged.
- [ ] No schema change, so no Flyway migration (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per `riviera-sdlc` `references/pr-gates.md` §1 + the overlay.
