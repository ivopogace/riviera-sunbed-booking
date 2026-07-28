# Truthful Verification-Resend Claim Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The signed-in customer's account page stops claiming a verification email was sent when
the suppression list withheld it. `POST /api/me/verify-email/request` reports whether the mail was
withheld; `set-password` branches its success copy on that fact. `forgot-password`'s hedged copy is
untouched — making *it* conditional would rebuild the enumeration oracle #369 closed.

**Architecture:** The `notification` module already knows the answer, but its one published port
(`MailSender`) is deliberately **fire-and-forget** — never throws, runs off the caller's thread,
its outcome influencing neither the response's status code (D-8) nor its latency (#369). Widening
that port to return an outcome would drag `forgot-password` — the surface those guarantees exist
for — into the change. So the fact arrives through a **second, role-split published port**
(`api/` role-split, #94): **`notification.api.MailDeliverability#isWithheld(String toEmail)`**, a
synchronous query the edge consults **only** on the authenticated resend endpoint. `api/` and not
`spi/` is forced by the direction rule: the consumer (the root edge) *calls* it, so it is inbound.

Why a synchronous read is safe **here** and nowhere else in the recovery family: the caller is
signed in and the address queried is **its own session principal's**. It learns one bit about an
address it already owns — no account-enumeration and no timing oracle, because there is no
"does this account exist" question left to answer. The three `permitAll` recovery paths keep the
`204`/hedged-copy contract untouched.

**Persistence:** JDBC only (invariant #1). **No Flyway migration** — the read reuses the existing
`email_suppression` table through `notification`'s `JdbcEmailSuppressions` adapter, whose
adapter-scoped `queryTimeout` (#386, lowered to 2 s in #390/G-14) already bounds it. No DDL.

**Source of intent:** GitHub issue **#400**, item 1 (carried out of #390's review gate; surfaced by
that slice's phase-0 generalization audit, row 1 of `suppressed-confirmation-mail-notice.md`).
Item 2 of #400 (the refundable `emailWithheld` probe) is **out of scope** — maintainer's call at
intake; it stays the recorded residual #390 accepted.

**Skills consulted:**
- `riviera-sdlc` — ran the issue-intake grill gate + the Skill-routing gate; supplied the
  cloud-session branch substitution and the review/sonar/merge gate procedures.
- `riviera-plan-doc` — this document's structure and the AC-at-the-inner-hexagon rule.
- `riviera-modulith` — decided `api/` over `spi/` (the root *calls* the port; nothing implements it
  for `notification`) and decided a **second port** over a method on `MailSender` (the #94
  role-split rule: "send this, best-effort" and "would this arrive" are different conversations
  with opposite contracts). Confirmed the root already depends on `notification`, so no new edge.
- `riviera-java-conventions` — records for the wire DTO, a typed outcome (`VerificationMailOutcome`)
  over a bare `boolean` return, package-private edge classes, narrow catch, one-line comments.
- `riviera-frontend` — placement: the change is confined to the existing `auth/` feature folder and
  `core/customer-auth.ts`; nothing is promoted to `shared/` (one consumer).
- `angular-developer` + angular-cli MCP — v22 signal APIs for the branched notice.
- `playwright-cli` — *(phase 3)* the e2e case extends the existing `email-verification.e2e.ts` in
  the CI-safe mocked suite.
- `riviera-local-debug` — scoped test recipes for this cloud session.
- `riviera-tailwind` — *(phase 2)* consulted and **found not to apply**: the notice reuses the
  page's existing `auth-intro` `role="status"` paragraph; no new styled surface, no new class.
- `riviera-review-overlay` — the RV-BE/FE/CT bank at the review gate.
- `riviera-docs-freshness` — merge close-out step 5.

**Branch:** cloud session — the designated remote branch **`claude/sdlc-400-review-gate-e22v1k`**
stands in for `feature/truthful-verification-resend` (`riviera-sdlc` remote addendum). The literal
`feature/*` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in customer whose address is on the suppression list, when it POSTs
      `/api/me/verify-email/request`, then the response is `200` with `emailWithheld = true`.
      *Pinned by:* `MyAccountControllerTest.reportsAWithheldVerificationMailForASuppressedAddress`
- [ ] **AC-2:** Given a signed-in customer whose address is not suppressed, when it POSTs the same
      path, then the response is `200` with `emailWithheld = false`.
      *Pinned by:* `MyAccountControllerTest.reportsADeliverableVerificationMail`
- [ ] **AC-3:** Given either outcome, when the endpoint runs, then the verification token is issued
      and the send is dispatched **exactly as today** — the disclosure changes nothing about the
      send. *Pinned by:* `CustomerRecoveryTest.issuesAndDispatchesRegardlessOfSuppression`
- [ ] **AC-4:** Given the suppression lookup throws, when the endpoint runs, then it still answers
      `200 emailWithheld = false` (degrade to today's copy; the resend never 500s).
      *Pinned by:* `CustomerRecoveryTest.reportsDeliverableWhenTheLookupFails`
- [ ] **AC-5:** Given an address on the suppression list, when `notification`'s `MailDeliverability`
      implementation is asked, then it reports withheld; for an address that is not on the list it
      reports not withheld — and it answers on the **canonical** email form, so a differently-cased
      or space-padded address resolves to the same row.
      *Pinned by:* `SuppressedMailDeliverabilityTest.reportsWithheldForASuppressedAddress`,
      `…​.reportsDeliverableForAnUnlistedAddress`, `…​.answersOnTheCanonicalEmailForm`
- [ ] **AC-6:** Given the real bean wiring and a real suppression row, when a signed-in customer
      hits the endpoint, then the wire body carries `emailWithheld` computed through the real
      HMAC/normalization chain. *Pinned by:* `EmailVerificationIT.reportsWithheldForASuppressedAddress`
- [ ] **AC-7:** Given `requestVerification()` resolves `'withheld'`, when the account page renders
      the resend notice, then it says no email was sent and **drops** "Verification email sent.
      Check your inbox."; given `'sent'` it renders today's string byte-for-byte.
      *Pinned by:* `set-password.spec.ts` ("tells the customer when the verification email was
      withheld", "keeps the sent copy for a deliverable address")
- [ ] **AC-8:** Given a mocked backend answering `emailWithheld: true`, when a signed-in customer
      clicks *Resend verification email*, then the withheld notice is visible and the "sent" copy
      is absent; with `false` the sent copy shows. *Pinned by:* `frontend/e2e/email-verification.e2e.ts`
- [ ] **AC-9:** Given the new `notification::api` port, when the structural net runs, then the
      module structure verifies. *Pinned by:* `ModularityTests.verifiesModularStructure`,
      `PublishedSurfacePlacementArchitectureTests`, `PackageShapeArchitectureTests`
- [ ] **AC-10:** Given the endpoint's status changed `204 → 200`, when the role-gate and rate-limit
      suites run, then both still pass against the new status.
      *Pinned by:* `MeSurfaceRoleGateTest`, `RateLimitFilterTest`

## Non-goals

- **`auth/forgot-password.ts`'s hedged copy** — *"If an account exists for that email, we've sent a
  link…"*. Explicitly excluded by #400: it is hedged **because** of D-8, and branching it on
  suppression rebuilds the account-enumeration oracle #369 closed. Untouched, and the three
  `permitAll` recovery endpoints keep their current contracts.
- **Item 2 of #400** — the refundable `emailWithheld` probe on the code-gated booking read. Maintainer
  chose "item 1 only" at intake; it stays the recorded residual (#390 finding G-3), issue #400 stays
  open for it.
- **The password-reset mail.** Its trigger is `permitAll` forgot-password, so the same D-8 reasoning
  as above applies; no reset surface changes.
- **Changing suppression semantics** — no new reason, no write path, no change to never-deleted
  (ADR-0012 as amended by #391), no change to the send-side fail-open carve-out (#386).
- **Making the mail actually send** to a suppressed address. The invariant stands; this slice only
  stops the UI from lying about it.
- **A "request removal from the do-not-email list" affordance** — that is #391's ADMIN-gated
  reinstatement, not a self-service flow.

## Behavior-parity ledger

> No surface is retired, but one existing **claim** and one **status code** change, so both get a row.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `POST /api/me/verify-email/request` → `204 No Content`, always | **changed** | Now `200 OK` with `{"emailWithheld": boolean}`. Same auth gate, same rate-limit budget, same token issue + dispatch; only the response carries one more fact. |
| `set-password` resend → unconditional "Verification email sent. Check your inbox." | **changed** | Renders only when `emailWithheld === false`; the withheld case gets its own sentence. |
| `set-password` resend failure → "Could not send the email. Please try again." | **preserved** | Unchanged — a transport/HTTP failure is still distinct from a withheld send. |
| `forgot-password` / `reset-password` / public `verify-email` copy + status | **preserved** | Untouched by construction (non-goal above). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Enumeration oracle** — the new disclosure leaks whether an address is suppressed | low | high | The read is reachable **only** from `hasRole(CUSTOMER)` on `/api/me/**`, and it answers about `authentication.getName()` — the caller's *own* session principal, never a path/body-supplied address. There is no id in the request to tamper with (BOLA-safe by shape). The three `permitAll` recovery paths are untouched. Pinned by **AC-1/AC-2** + `MeSurfaceRoleGateTest` | agent | open |
| R-2 | **Timing oracle** (#369) — a synchronous suppression SELECT on the request thread re-widens what the dispatcher closed | low | med | #369's oracle is *anonymous* forgot-password: latency differing by whether an account exists. Here the caller is authenticated and the address is its own, so the timing carries no fact it doesn't already hold. The send itself stays off-thread and its own check stays inside the dispatched task — unchanged. The added read is bounded by the adapter's 2 s `queryTimeout` (#386/G-14) | agent | open |
| R-3 | The edge's answer and the dispatched task's own check **diverge** (a bounce lands between them, or a #391 reinstatement) | med | low | Accepted and documented on the port as a **present-tense** question ("would a mail to this address be withheld *now*"), not a record of what happened — the #390 F-3 lesson. The window is milliseconds and the consequence is one advisory sentence | agent | open |
| R-4 | The lookup fails and the page claims the wrong thing | med | low | Degrade to `false` — today's copy, today's behavior. Deliberately **not** the send path's transient-only carve-out: that one decides whether to *drop a bearer-credential mail*, this one decides whether to show a sentence. Documented as an asymmetry rather than denied (the #390 F-8 lesson). Pinned by **AC-4** | agent | open |
| R-5 | `204 → 200` breaks an existing caller | med | low | Two known callers: `customer-auth.ts` (updated in phase 2) and two backend suites (**AC-10**). `200` with a body is strictly more informative; no client parses `204` semantics | agent | open |
| R-6 | PII: an address reaches a log line or a module that shouldn't hold it | low | med | The port speaks the address `notification` already receives on every send, returns a `boolean`, and no new log line names one (the module's PII posture, ADR-0012). `booking` and `customer` are untouched | agent | open |
| R-7 | The error contract of the touched endpoint drifts to a per-controller body | low | med | No new error path; `MyAccountController` keeps the centralized `ApiProblem`/`ApiErrorHandler` mapping (`riviera-java-conventions` §6b, `ErrorContractArchitectureTests`) | agent | open |

## Open questions / Assumptions

*(none open — both intake questions were answered by the maintainer before phase 0)*

### Resolved

- **Open question:** Does this slice cover #400 item 2 (the refundable `emailWithheld` probe)?
  → **Resolved** at intake: **item 1 only**. Item 2 keeps the "ship and record" decision #390 made;
  #400 stays open to track it.
- **Open question:** How does "the mail was withheld" reach the resend response, given the send is
  deliberately fire-and-forget and off-thread (#369)? → **Resolved** at intake: a **new published
  query port** (`notification.api.MailDeliverability`) consulted by the edge on this endpoint only,
  answered `200 {emailWithheld}`. Rejected: returning an outcome from `MailSender` (couples the
  fire-and-forget contract that `forgot-password` rides), and a `spi`-style inversion (nothing to
  invert — the root may depend on `notification` directly).
- **Assumption:** the withheld copy names the consequence, not the mechanism — it tells the customer
  no email was sent and that they should get in touch, without exposing suppression vocabulary or a
  reason code. → Accepted with the surface decision above.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The slice touches the account-recovery edge and the
`notification` module's read side only. It opens no transaction, writes no row, and never reaches
`availability(set_id, booking_date)`; no booking lifecycle transition is added or altered. The one
added read is a single-row `SELECT` on `email_suppression` bounded by that adapter's own
`queryTimeout` — deliberately not the global property, which would also bound `availability`'s
`SELECT … FOR UPDATE` (#386, invariant #2).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | *(none — owns `email_suppression` state, no aggregate)* | Owns the suppression list and the *no send to a suppressed address* invariant, so it is the only module that can answer whether a mail will be withheld. |
| M-2 | *(root / platform edge)* | existing | — | `CustomerRecovery` + `MyAccountController` are the S8 recovery edge (RV-BE-11); they orchestrate *when* to send and now also *what to tell the caller*. The root may depend on modules — that is the composition-root direction. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumer |
|---|---|---|---|---|
| API-1 | `notification.api` (existing named interface, **new port**) | `MailDeliverability#isWithheld(String toEmail)` | `String`, `boolean` | the root edge (`CustomerRecovery`) — the only consumer of `notification`, as today |

> Direction check (`riviera-modulith`, api-vs-spi rule): the consumer **calls** it and `notification`
> implements it → `api/`, never `spi/`. Role-split check (#94): it is **not** a method on
> `MailSender` — that port's whole contract is "never throws, never influences status or latency,
> runs off your thread"; a synchronous query that *does* influence the response is a different
> conversation. Two narrow ports, not one wide one. No `allowedDependencies` change: `notification`
> gains no dependency, and nothing depends on `notification` except the root (which declares none).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | *none added* | — | — | — | — | — |

> Deliberately **no** event: the caller needs the answer *now*, inside the request it is answering —
> the textbook synchronous-port case (`riviera-modulith`, port-vs-event).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide whether a mail to a given address would be withheld | `notification` | **Job:** owns the email-suppression list and the defining invariant *no send to a suppressed address*. No other module may hold that state (ADR-0012). |
| Normalize the address to its canonical form before the lookup | `customer` (via `customer.vocabulary.Emails`) | **Job:** owns the platform's one canonical email form (#386); it is already the suppression key's HMAC input, so the query must use the same function or it would miss rows. `notification` already holds the grant. |
| Decide *when* to send, mint/hash the token, build the link, and shape the HTTP answer | *(root / platform edge)* | RV-BE-11: login/session/credential-material machinery lives at the platform edge, never in a module. `customer`'s **Not My Job** explicitly excludes tokens/mail/crypto. |
| Render the branched copy | frontend `auth/` feature | The claim being corrected is UI copy on the account page. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no charge/refund is created, no ledger entry is
written or reversed, no Stripe call is added, and no commission arithmetic runs. The slice touches
the account-recovery edge and a mail-suppression read only. Invariant #8 (webhook-as-truth) is
untouched — nothing here confirms a booking or reads payment state. (#400 item 2, which *is* a
payment-adjacent judgement, is explicitly out of scope; see Non-goals.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/customer-auth.ts` | modified | `@Service` | `requestVerification()` widens to `'sent' \| 'withheld' \| 'error'` | none |
| FE-2 | `auth/set-password.ts` | modified | standalone component | existing `notice` signal; the resend handler picks the copy | none |

**Standards:** standalone components, `inject()`, `@if`, signal APIs, no `changeDetection`/`standalone`
declarations (v22 defaults). The notice reuses the page's existing `role="status"`
`data-testid="setpw-notice"` paragraph, so a screen reader announces the change with no new ARIA and
no new styled surface — hence no Tailwind/contrast work (`riviera-tailwind` consulted, not applicable).

## FE↔BE contract

- **Changed response:** `POST /api/me/verify-email/request` → **`200 OK`** with
  `{"emailWithheld": boolean}` (was `204 No Content`). `true` only when the signed-in caller's own
  address is currently suppressed; `false` otherwise, including when the lookup fails.
- **Unchanged responses:** `POST /api/auth/customer/forgot-password`, `…/reset-password`,
  `…/verify-email` — deliberately (Non-goals, D-8).
- **Client typing:** `CustomerAuth.requestVerification()` returns the union
  `'sent' | 'withheld' | 'error'`; the response body is read through a hand-written typed
  interface, no `as any`.
- **Money/date on the wire:** N/A — no money or date crosses this surface.

## Execution status

**Stage pointer:** `PLAN — written, not yet committed`

**Next action:** commit the plan doc, then phase 0.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `notification.api.MailDeliverability` + its implementation | | |
| 1 — the edge reports it (`CustomerRecovery` + `MyAccountController`, `204 → 200`) | | |
| 2 — Angular: branch the resend copy | | |
| 3 — Playwright e2e (mocked suite) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

**Backend — `platform/src/main/java/ai/riviera/platform/`**

- `notification/api/MailDeliverability.java` — **new.** The published query port: would a mail to
  this address be withheld?
- `notification/application/MailDeliverabilityService.java` — **new.** Package-private `@Service`
  answering the port from `EmailSuppressions`, normalizing through `Emails` and degrading to
  "not withheld" on a lookup failure.
- `CustomerRecovery.java` — `sendVerificationEmail` returns `VerificationMailOutcome`.
- `VerificationMailOutcome.java` — **new.** Package-private edge enum (`SENT` / `WITHHELD`).
- `MyAccountController.java` — `200` + `VerificationRequestedView` record.

**Backend tests — `platform/src/test/java/ai/riviera/platform/`**

- `notification/SuppressedMailDeliverabilityTest.java` — **new** (AC-5).
- `CustomerRecoveryTest.java` — extend (AC-3, AC-4).
- `MyAccountControllerTest.java` — extend (AC-1, AC-2).
- `EmailVerificationIT.java` — extend (AC-6).
- `MeSurfaceRoleGateTest.java`, `RateLimitFilterTest.java` — update the expected status (AC-10).

**Frontend — `frontend/src/app/`**

- `core/customer-auth.ts` + `core/customer-auth.spec.ts` — the widened return (FE-1).
- `auth/set-password.ts` + `auth/set-password.spec.ts` — the branched copy (FE-2, AC-7).

**Frontend e2e — `frontend/e2e/`**

- `email-verification.e2e.ts` — extend with the withheld case (AC-8).

---

## Phase 0 — `notification.api.MailDeliverability` + its implementation

**Files:** Create `notification/api/MailDeliverability.java`,
`notification/application/MailDeliverabilityService.java`,
`platform/src/test/java/ai/riviera/platform/notification/SuppressedMailDeliverabilityTest.java`

- [ ] **Step 1: Write the failing test** — three cases (AC-5): a suppressed address reports withheld,
      an unlisted one reports not withheld, and a differently-cased/space-padded address resolves to
      the same row (so dropping `Emails.normalize` fails the test — the #390 G-4 lesson: never assert
      canonicalization with byte-identical inputs on both sides). Reach the package-private service
      the way the module's existing tests reach their package-private classes.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*SuppressedMailDeliverabilityTest*"`
      → FAIL: the port does not exist.

- [ ] **Step 3: Minimal implementation** — the port in `api/` with javadoc stating (a) it is a
      **present-tense** question, not a record of a past send (R-3), (b) it never throws for an
      operational failure, answering `false` instead (R-4), and (c) why it is a separate port from
      `MailSender` rather than a method on it. The service normalizes through
      `customer.vocabulary.Emails`, delegates to `EmailSuppressions`, and catches
      `DataAccessException` — narrow, per convention §6, and justified in the javadoc against the
      send path's deliberately *transient-only* carve-out (#386), which is the opposite trade for a
      different stake.

- [ ] **Step 4: Run it, verify it passes** — same command → PASS

- [ ] **Step 5: Run the structural net** (AC-9) —
      `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS

- [ ] **Step 6: Commit** — `git commit -m "feat(#400): notification.api port answering whether a mail would be withheld"`

- [ ] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 1 — the edge reports it (`204 → 200`)

**Files:** Modify `CustomerRecovery.java`, `MyAccountController.java` · Create
`VerificationMailOutcome.java` · Test `CustomerRecoveryTest.java`, `MyAccountControllerTest.java`,
`EmailVerificationIT.java`, `MeSurfaceRoleGateTest.java`, `RateLimitFilterTest.java`

- [ ] **Step 1: Write the failing tests** — AC-1/AC-2 (the controller's `200` + body), AC-3 (the send
      is dispatched identically either way — assert the token issue *and* the `MailSender` call still
      happen when withheld), AC-4 (a throwing lookup still answers `200 false`), AC-6 (the IT drives
      the real chain and asserts the `emailWithheld` wire name).

- [ ] **Step 2: Run them, verify they fail** —
      `./gradlew test --tests "*CustomerRecoveryTest*" --tests "*MyAccountControllerTest*"` → FAIL

- [ ] **Step 3: Minimal implementation**
  - `CustomerRecovery.sendVerificationEmail` returns `VerificationMailOutcome`: issue the token,
    dispatch the send (both unchanged and in that order), then consult `MailDeliverability`. The
    disclosure is computed **after** the dispatch so no failure of it can alter the send.
  - `MyAccountController.requestVerification` returns
    `ResponseEntity.ok(new VerificationRequestedView(outcome == WITHHELD))`.
  - Update `MeSurfaceRoleGateTest` / `RateLimitFilterTest` expectations to `200` (AC-10).

- [ ] **Step 4: Run them, verify they pass** — same command → PASS

- [ ] **Step 5: End-of-phase regression** —
      `./gradlew test --tests "*MeSurfaceRoleGateTest*" --tests "*RateLimitFilterTest*" --tests "*EmailVerificationIT*" --tests "*RecoveryRateLimitIT*"` → PASS

- [ ] **Step 6: Commit** — `git commit -m "feat(#400): tell the signed-in caller when the verification mail was withheld"`

- [ ] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 2 — Angular: branch the resend copy

**Files:** Modify `core/customer-auth.ts`, `auth/set-password.ts` · Test `core/customer-auth.spec.ts`,
`auth/set-password.spec.ts`

- [ ] **Step 1: Write the failing specs** (AC-7) — `customer-auth.spec.ts`: a `200 {emailWithheld:true}`
      resolves `'withheld'`, `false` resolves `'sent'`, a non-2xx resolves `'error'`.
      `set-password.spec.ts`: the withheld branch renders the new sentence in the existing
      `setpw-notice` region and the string "Verification email sent" is **absent**; the deliverable
      branch renders it unchanged.

- [ ] **Step 2: Run them, verify they fail** — `npm test -- customer-auth set-password` → FAIL

- [ ] **Step 3: Minimal implementation** — widen the service's return union and read the typed body;
      branch the component's `notice` copy three ways. No template structure change beyond the string.

- [ ] **Step 4: Run them, verify they pass** — `npm test` and `npm run test:a11y` → PASS

- [ ] **Step 5: Lint** — `npm run lint` → PASS

- [ ] **Step 6: Commit** — `git commit -m "feat(#400): stop claiming a verification email was sent when it was withheld"`

- [ ] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 3 — Playwright e2e (mocked suite)

**Files:** Modify `frontend/e2e/email-verification.e2e.ts`

- [ ] **Step 1: Write the failing spec** (AC-8) — extend the existing spec (it already owns this
      flow's mocks) with a withheld case: route-mock the resend to `200 {emailWithheld:true}`, click
      *Resend verification email*, assert the withheld notice and the absence of the sent copy.
      **Mocked suite** (`frontend/e2e/`), not `real-backend/` — it needs no live backend and must run
      in CI (RV-FE-E2E).

- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- email-verification` → FAIL

- [ ] **Step 3: Make it pass** — no product change expected; fix the spec's selectors/mocks.

- [ ] **Step 4: Run the suite** — `npm run test:e2e:a11y` → PASS

- [ ] **Step 5: Commit** — `git commit -m "test(#400): e2e coverage for the withheld verification-email notice"`

- [ ] **Step 6: Update the plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| | | | | | |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 / AC-2:** `./gradlew test --tests "*MyAccountControllerTest*"` → _pending_
- [ ] **AC-3 / AC-4:** `./gradlew test --tests "*CustomerRecoveryTest*"` → _pending_
- [ ] **AC-5:** `./gradlew test --tests "*SuppressedMailDeliverabilityTest*"` → _pending_
- [ ] **AC-6:** `./gradlew test --tests "*EmailVerificationIT*"` → _pending_
- [ ] **AC-7:** `npm test` → _pending_
- [ ] **AC-8:** `npm run test:e2e:a11y` → _pending_
- [ ] **AC-9:** `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → _pending_
- [ ] **AC-10:** `./gradlew test --tests "*MeSurfaceRoleGateTest*" --tests "*RateLimitFilterTest*"` → _pending_

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A` — no availability path touched).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; the new port is in `api/` not `spi/`; no cross-module
      `application.*`/`adapter.*` imports; no `allowedDependencies` widening (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`); confirmation still webhook-driven (invariant #8).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes unguessable and never logged (invariant #7); no verification token logged.
- [ ] No Flyway migration needed; no schema change (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.
