# Customer set/change-password — e2e coverage Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `POST /api/me/password` — the signed-in customer's set/change-password endpoint (S8
#113) — its first real-render e2e coverage, proving a change actually ROTATES the credential (old
password stops working, new one starts) and that the three failure branches an account can meet
(wrong current password, weak new password, exhausted rate-limit budget) render their own message.

**Architecture:** Test-only slice. One new CI-safe mocked spec (`frontend/e2e/customer-password.e2e.ts`)
plus a `POST /api/me/password` route added to the existing `mockCustomerRecoveryApi` — extended, not
duplicated, because that mock already models a rotating credential and a live session. The mock's
branch order deliberately mirrors `MyAccountController.setPassword` (rate-limit filter → policy →
current-password check), so a real reordering cannot leave this suite green (the #342 lesson).

**Persistence:** N/A — no backend change, no migration, no SQL. Invariant #1 untouched.

**Source of intent:** GitHub issue #346 (found by the #326 Phase-3 generalization audit).

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake grill), `riviera-plan-doc` (this
doc), `playwright-cli` (spec authored to its best practice — web-first `expect`, test-id locators, no
fixed sleeps; `references/request-mocking.md` for the stateful `page.route` shape),
`riviera-review-overlay` RV-FE-E2E (suite placement: mocked-a11y `frontend/e2e/`, CI-run via
`npm run test:e2e:a11y` — NOT the local-only real-backend tree), `riviera-frontend` (e2e two-suite
split + support/ placement; confirmed no `src/` change is needed — every `data-testid` the flow needs
already exists), `riviera-local-debug` (scoped run recipe for the cloud container).
`angular-developer` NOT loaded — deliberately: this slice adds no component/service code (see
Non-goals); if a missing test hook had forced a `src/` edit, the gate would re-fire.

**Branch:** `claude/cloud-environment-candidates-eozsc3` — the cloud session's designated branch
stands in for `feature/customer-password-e2e` (`riviera-sdlc` §Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in customer whose account already has a password, when they submit the
      account page's form with the WRONG current password, then the page renders "The current password
      is incorrect.", shows no success notice, and the credential is NOT rotated (the original password
      still signs in). *Pinned by:* `customer-password.e2e.ts` → `a signed-in tourist changes their
      password, and the new credential replaces the old`
- [x] **AC-2:** Given that same customer, when they submit the CORRECT current password with a valid
      new one, then a saved notice renders, both password fields are cleared from the DOM, the calling
      session survives (the shell still shows "Signed in as …"), and after signing out ONLY the new
      password signs back in. *Pinned by:* the same test.
- [x] **AC-3:** Given an SSO-only account (provider-verified session, no local credential — the S4 F-1
      case the page exists for), when they submit a new password with the current-password field left
      blank, then it is accepted and that new password signs in afterwards. *Pinned by:*
      `customer-password.e2e.ts` → `an SSO-only account sets its first password with no current password`
- [x] **AC-4:** Given a new password shorter than the 8-character policy minimum, when they submit,
      then the length message renders from the client-side guard and NO request is made to
      `/api/me/password`. *Pinned by:* the same SSO test (request counter asserted).
- [x] **AC-5:** Given the per-IP change budget (#326) is exhausted, when they submit a valid change,
      then the page renders "Too many attempts. Please wait a minute and try again." — the 429 branch
      #342 mapped but never rendered — and the credential is NOT rotated. *Pinned by:*
      `customer-password.e2e.ts` → `an exhausted change-password budget renders the rate-limit message`
- [x] **AC-6:** Every newly rendered state in the flow (error, notice, rate-limited) passes the axe
      serious-violations bar. *Pinned by:* `expectNoSeriousAxeViolations` calls in all three tests.

## Non-goals

- **No `src/` change.** The flow's test hooks (`setpw-current`, `setpw-new`, `setpw-submit`,
  `setpw-error`, `setpw-notice`, `setpw-email`) all exist; this slice adds coverage, not UI.
- **No in-app entry point for `/account/password`.** The tourist shell has no link to the account page
  (the operator's console header has `oc-change-password`; the tourist's has only Sign out), so the
  spec navigates by URL exactly as `erasure.e2e.ts` does. Adding navigation is a product change —
  recorded in Open questions as a follow-up, deliberately not smuggled in here.
- **Not fixing #345** (INVALID_REQUEST conflating "current password missing" with "weak new password").
  The mock mirrors today's contract; changing it belongs to that issue.
- **No real-backend spec.** Wiring + the real filter's arithmetic are backend-tested; per RV-FE-E2E the
  render/interaction/a11y half belongs in the CI-run mocked suite.
- **No coverage of the account page's other sections** (erasure — already covered by `erasure.e2e.ts`;
  the verification resend — a different surface).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new coverage, replaces nothing. `mockCustomerRecoveryApi` is extended additively (a new route +
three optional options); its existing callers (`password-reset.e2e.ts`, `email-verification.e2e.ts`)
keep byte-identical behaviour, which the run in phase 2 confirms.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The mock's branch order drifts from `MyAccountController`, so a real reordering (e.g. checking the credential before the policy) leaves this suite green — the exact defect #342's review caught in the operator mock | med | high | Mock mirrors the controller: filter budget → `CustomerPasswords.validate` (400 `INVALID_REQUEST`) → credential-exists-and-mismatch (400 `INVALID_CURRENT_PASSWORD`) → 204; each branch carries a comment naming the server counterpart | this slice | mitigated in the phase-1 commit |
| R-2 | The 429 is modelled as an attempt counter, not the real per-IP token bucket (10 / PT1M via `props.login()`), so the spec could imply a budget the server doesn't have | med | low | The budget is an explicit option defaulting to the real 10; the spec sets a small value and asserts only the FE's rendering of 429 — the filter's arithmetic stays backend-tested | this slice | accepted, documented at the option |
| R-3 | A stale `/api/auth/me` answer after rotation makes the "session survives" assertion pass for the wrong reason | low | med | The mock keeps ONE `me` route reflecting a single `signedIn` flag; the assertion reads the shell's live `nav-user`, and the sign-out → old-password-rejected leg proves the rotation independently | this slice | closed — the mutation run shows the rotation legs fail when the credential does not actually rotate |
| R-4 | Coverage claimed but not actually CI-run (spec parked where CI can't see it) | low | high | Spec lands in `frontend/e2e/` (mocked-a11y suite, `playwright.a11y.config.ts`), verified by running `npm run test:e2e:a11y` locally — RV-FE-E2E's "green-but-blind" bar | this slice | closed — picked up by the a11y config's `testDir: './e2e'`, ran as 3 of the suite's 79 |

## Open questions / Assumptions

- **Assumption:** covering the SSO-only first-password branch (AC-3) and the 429 branch (AC-5) is
  within #346's intent — the issue's title says the flow "has no e2e coverage at all" and its body
  names the 429 as newly reachable, though its sketch enumerates only the change-with-current-password
  leg. *Owner:* this slice · *Resolves by:* review gate (flagged to the maintainer in the PR body).
- **Open question:** should the tourist shell gain a link to `/account/password`? Today the page is
  reachable only by typed URL (verified: no `routerLink` to it anywhere in `src/`), which is a real
  discoverability gap but a product change. *Owner:* maintainer · *Resolves by:* a follow-up issue
  filed at close-out, not this PR.
- **Open question:** `CLAUDE.md` §Commands labels `npm run test:e2e` "CI-safe mocked suite
  (frontend/e2e/)", but that script runs `playwright.config.ts` — the local-only REAL-BACKEND suite;
  the mocked suite is `npm run test:e2e:a11y` (as RV-FE-E2E states). Stale substrate line, pre-existing
  and unrelated to this slice. *Owner:* maintainer · *Resolves by:* `riviera-docs-freshness` at close-out.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No booking, set, or `availability(set_id, booking_date)` row is
read or written; the slice touches only the customer's own credential surface.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java changes, no module boundary, no event, no `api/`/`spi/` surface.
`MyAccountController` (platform edge, RV-BE-11) is READ as the contract the mock mirrors, not modified.

### Module ownership (§4a)

N/A — the slice adds no behavior to any backend module; it adds test coverage only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `e2e/support/auth-mocks.ts` → `mockCustomerRecoveryApi` | existing | Playwright request mock | in-memory `password` / `signedIn` / attempt counter | N/A |
| FE-2 | `e2e/customer-password.e2e.ts` | new | mocked-a11y e2e spec (CI-run) | N/A | drives `SetPassword`'s Signal Form via test ids |

**Standards:** no component code changes, so no Angular API surface is touched. The spec follows the
repo's e2e idiom (test-id locators, web-first `expect`, per-test mock state, axe assertions on each new
render) and must pass `npm run lint`, which covers `e2e/**/*.ts`.

## FE↔BE contract

N/A — no contract change. The mock encodes the EXISTING contract:

- `POST /api/me/password` `{ newPassword, currentPassword|null }` → `204`; `400 INVALID_REQUEST`
  (policy: <8 chars or >72 bytes), `400 INVALID_CURRENT_PASSWORD`, `401 UNAUTHENTICATED`,
  `429 RATE_LIMITED` (per-IP budget, #326). A success revokes the customer's OTHER sessions; the
  calling one survives.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session, re-read
> it (plus the current stage's `riviera-sdlc` reference file) before acting.

**Stage pointer:** `review gate — run, both findings fixed; pushed. Awaiting the maintainer's call on a PR`

**Next action:** Open a PR only if the maintainer asks; then the Sonar gate (Sonar analyses PRs +
`main` only, so it cannot run on this branch alone).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc | ✅ | `652ae3a` |
| 1 — Mock the endpoint | ✅ | `3a79631` (with phase 2) |
| 2 — The spec (3 tests) | ✅ | `3a79631` |
| 3 — Lint + full mocked-suite run | ✅ | `npm run lint` clean; 79/79 mocked specs pass |
| 4 — Review gate + fixes | ✅ | `04ac8ba` — re-linted and re-ran the full suite after the fixes (79/79) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate — RV-STYLE-1 | The new `/api/me/password` mock route carried a 5-line inline comment; inline comments are one line or they are not written (doc comments exempt) | fixed-in-`04ac8ba` — the branch-order rationale moved into the function's TSDoc, one inline pointer left |
| F-2 | review gate — quality (own diff) | `mockCustomerRecoveryApi` required `validToken`, forcing three dummy `'unused-here'` arguments in a spec that redeems no token | fixed-in-`04ac8ba` — `validToken` is optional, and both token routes now guard on `!== undefined` so an omitted token can never be redeemed as `undefined` |

---

## File structure

- `frontend/e2e/support/auth-mocks.ts` — extend `mockCustomerRecoveryApi`: route
  `POST /api/me/password`; new options `initialPassword?` (undefined ⇒ SSO-only, no stored
  credential), `signedIn?` (start with a live session, standing in for the completed SSO dance),
  `emailVerified?`, `passwordChangeBudget?` (default 10, mirroring `props.login()`).
- `frontend/e2e/customer-password.e2e.ts` — the new spec (3 tests, AC-1…AC-6).
- `docs/plans/s8-followup-customer-password-e2e.md` — this plan.

---

## Phase 1 — Mock `POST /api/me/password`

**Files:** Modify `frontend/e2e/support/auth-mocks.ts`

- [x] **Step 1:** Add the route mirroring `MyAccountController.setPassword`'s branch order, with the
      rate-limit budget spent first (the filter runs ahead of the controller).
- [x] **Step 2:** Keep existing callers green — `initialPassword` becomes optional, defaulting to the
      same behaviour when supplied.
- [x] **Step 3:** Commit.

## Phase 2 — The spec

**Files:** Create `frontend/e2e/customer-password.e2e.ts`

- [x] **Step 1:** Test 1 (AC-1, AC-2, AC-6) — sign in, wrong current → error + no rotation, correct →
      notice + cleared fields + session survives, sign out → only the new password works.
- [x] **Step 2:** Test 2 (AC-3, AC-4, AC-6) — SSO-only account: short password rejected client-side
      with zero requests, then blank current + valid new → saved, and it signs in.
- [x] **Step 3:** Test 3 (AC-5, AC-6) — exhausted budget → rate-limit message, no rotation.
- [x] **Step 4:** Run the spec — `npx playwright test --config playwright.a11y.config.ts customer-password` → PASS.
- [x] **Step 5:** Commit.

## Phase 3 — Regression + lint

- [x] **Step 1:** `npm run lint` → clean.
- [x] **Step 2:** Run the whole mocked suite (`npm run test:e2e:a11y`) — the shared-mock change makes
      the neighbouring recovery specs the real regression surface.
- [x] **Step 3:** Commit + push, then the review + Sonar gates.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-26 | Phase 2 — the "prove the rotation is real" pattern this spec adopts | Credential-rotation surfaces with no e2e proving old-stops/new-starts | `rg -l "reset-password\|verify-email\|operator/password\|me/password" frontend/e2e` | `password-reset`, `email-verification`, `operator-password` (all already prove it) + this one | None outstanding — with `customer-password` the family is complete; #346 was the last gap the #326 audit named |
| 2026-07-26 | Phase 2 — verifying the new spec can fail | Mutation: make the mocked endpoint answer `204` WITHOUT rotating the credential | temporary edit to `mockCustomerRecoveryApi`, reverted | Tests 1 + 2 failed as designed; test 3 (asserts *no* rotation) correctly stayed green | Reverted the mutation; recorded here as the evidence the coverage bites rather than merely renders |

---

## Acceptance-criteria verification (final)

- [x] **AC-1…AC-6:** `npx playwright test --config playwright.a11y.config.ts customer-password` → 3 passed;
      whole mocked suite `79 passed (2.3m)`; `npm run lint` clean. Verified on branch
      `claude/cloud-environment-candidates-eozsc3` (cloud run needs
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` — revision 1194 is pre-installed, CI installs
      its own). Mutation-checked: a mocked server that answers 204 without rotating fails AC-2 and AC-3.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, no backend code.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules (invariants #3, #4) — N/A, no booking surface.
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy (invariant #10) — N/A.
- [x] Timezone (invariant #6) — N/A, no date arithmetic.
- [x] Booking codes (invariant #7) — N/A.
- [x] Flyway migration (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met; spec in the CI-run suite (RV-FE-E2E); `npm run lint` clean.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows (two carried to the review gate as follow-ups, below); Open Questions empty (or deferred with an issue #).
