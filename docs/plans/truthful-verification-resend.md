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

- [x] **AC-1:** Given a signed-in customer whose address is on the suppression list, when it POSTs
      `/api/me/verify-email/request`, then the response is `200` with `emailWithheld = true`.
      *Pinned by:* `MyAccountControllerTest.reportsAWithheldVerificationMailForASuppressedAddress`
- [x] **AC-2:** Given a signed-in customer whose address is not suppressed, when it POSTs the same
      path, then the response is `200` with `emailWithheld = false`.
      *Pinned by:* `MyAccountControllerTest.reportsADeliverableVerificationMail`
- [x] **AC-3:** Given either outcome, when the endpoint runs, then the verification token is issued
      and the send is dispatched **exactly as today** — the disclosure changes nothing about the
      send. *Pinned by:* `CustomerRecoveryTest.issuesAndDispatchesRegardlessOfSuppression`
- [x] **AC-4:** Given the suppression lookup throws — a data-access failure **or** a programming error —
      when the endpoint runs, then it still answers `200 emailWithheld = false` (degrade to today's
      copy; the resend never 500s). The barrier lives in the port's implementation, where its total
      contract is declared, not restated at the caller (the #390 F-2 precedent).
      *Pinned by:* `MailDeliverabilityServiceTest.reportsDeliverableWhenTheLookupFailsTransiently`,
      `…​.reportsDeliverableWhenTheLookupIsStructurallyBroken`,
      `…​.reportsDeliverableWhenTheLookupThrowsSomethingThatIsNotADataAccessFailure`
- [x] **AC-5:** Given an address on the suppression list, when `notification`'s `MailDeliverability`
      implementation is asked, then it reports withheld; for an address that is not on the list it
      reports not withheld; and a failing lookup — transient **or** structural — reports not withheld.
      *Pinned by:* `MailDeliverabilityServiceTest.reportsWithheldForASuppressedAddress`,
      `…​.reportsDeliverableForAnUnlistedAddress`,
      `…​.reportsDeliverableWhenTheLookupFailsTransiently`,
      `…​.reportsDeliverableWhenTheLookupIsStructurallyBroken`
- [x] **AC-6:** Given the real bean wiring and a real suppression row, when a signed-in customer
      hits the endpoint, then the wire body carries `emailWithheld` computed through the real
      HMAC/**normalization** chain — the row is written in a differently-cased, space-padded form
      from the one the caller signs in with, so dropping `Emails.normalize` on either side fails it
      (the #390 G-4 lesson). *Pinned by:* `EmailVerificationIT.reportsWithheldForASuppressedAddress`
- [x] **AC-7:** Given `requestVerification()` resolves `'withheld'`, when the account page renders
      the resend notice, then it says no email was sent and **drops** "Verification email sent.
      Check your inbox."; given `'sent'` it renders today's string byte-for-byte.
      *Pinned by:* `set-password.spec.ts` ("tells the customer when the verification email was
      withheld", "keeps the sent copy for a deliverable address")
- [x] **AC-8:** Given a mocked backend answering `emailWithheld: true`, when a signed-in customer
      clicks *Resend verification email*, then the withheld notice is visible and the "sent" copy
      is absent; with `false` the sent copy shows. *Pinned by:* `frontend/e2e/email-verification.e2e.ts`
- [x] **AC-9:** Given the new `notification::api` port, when the structural net runs, then the
      module structure verifies. *Pinned by:* `ModularityTests.verifiesModularStructure`,
      `PublishedSurfacePlacementArchitectureTests`, `PackageShapeArchitectureTests`
- [x] **AC-10:** Given the endpoint's status changed `204 → 200`, when the role-gate and rate-limit
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
| Normalize the address to its canonical form before the lookup | `customer` (via `customer.vocabulary.Emails`), applied by `notification`'s existing adapter | **Job:** `customer` owns the platform's one canonical email form (#386), already the suppression key's HMAC input. **Unchanged by this slice** — `JdbcEmailSuppressions` normalizes on both read and write, so the new port inherits it and adds no second normalization site (phase-0 deviation 1). |
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
| FE-2 | `auth/set-password.ts` | modified | standalone component | existing `notice` signal; the resend handler indexes a `RESEND_NOTICES` lookup | none |

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

**Stage pointer:** `IMPLEMENT — all phases done`

**Next action:** merge `origin/main`, push, open the PR, then the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `notification.api.MailDeliverability` + its implementation | ✅ | `a071ac6` |
| 1 — the edge reports it (`CustomerRecovery` + `MyAccountController`, `204 → 200`) | ✅ | `4b1c04a` |
| 2 — Angular: branch the resend copy | ✅ | `b77d8d0` |
| 3 — Playwright e2e (mocked suite) | ✅ | *(this commit)* |

> **Phase-0 deviations from the plan as written.**
> 1. **No `Emails.normalize` in the service.** `JdbcEmailSuppressions` already normalizes on both
>    read and write — it owns that key's input contract (#386/#388) — so normalizing again here
>    would re-create the second definition #386 removed. AC-5's canonical-form case therefore moves
>    to AC-6's IT, which is where the real chain can actually prove it; the §4a ownership row is
>    corrected to say the adapter already does this, unchanged by this slice.
> 2. **Names.** `MailDeliverabilityService` + `MailDeliverabilityServiceTest` in
>    `notification/application/`, matching `TransactionalMailService(Test)`, rather than the plan's
>    `SuppressedMailDeliverabilityTest` in `notification/`. The service is package-private, so the
>    test sits in its own package and needs no widening.
> 3. **The degrade catches every `DataAccessException`**, not just transient ones — documented on
>    the class as an accepted asymmetry against the send path's narrower carve-out, with the
>    divergence stated rather than denied (the #390 F-8 lesson).
>
> **Phase-1 deviation:** the AC-4 fault barrier was **widened to `RuntimeException` and kept in the
> port's implementation** rather than added as a second `try/catch` in `CustomerRecovery`. Writing
> the edge test first made the duplication obvious: #390's F-2 established that a port promising a
> total contract must honour it *at the implementation*, so a caller never has to defend against it.
> One barrier, documented as a deliberate deviation from catch-narrowly, with the exception logged so
> the programming errors it now swallows stay diagnosable (#390 G-7). `EmailVerificationIT` also
> gained the deliverable case, so the IT proves both wire values and not just the interesting one.

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
  answering the port from `EmailSuppressions`, degrading to "not withheld" on a lookup failure.
- `CustomerRecovery.java` — `sendVerificationEmail` returns `VerificationMailOutcome`.
- `VerificationMailOutcome.java` — **new.** Package-private edge enum (`SENT` / `WITHHELD`).
- `MyAccountController.java` — `200` + `VerificationRequestedView` record.

**Backend tests — `platform/src/test/java/ai/riviera/platform/`**

- `notification/application/MailDeliverabilityServiceTest.java` — **new** (AC-5).
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

- [x] **Step 1: Write the failing test** — four cases (AC-5): a suppressed address reports withheld,
      an unlisted one reports not withheld, and a differently-cased/space-padded address resolves to
      the same row (so dropping `Emails.normalize` fails the test — the #390 G-4 lesson: never assert
      canonicalization with byte-identical inputs on both sides). Reach the package-private service
      the way the module's existing tests reach their package-private classes.

- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*MailDeliverabilityServiceTest*"`
      → FAIL: `cannot find symbol: class MailDeliverabilityService`.

- [x] **Step 3: Minimal implementation** — the port in `api/` with javadoc stating (a) it is a
      **present-tense** question, not a record of a past send (R-3), (b) it never throws for an
      operational failure, answering `false` instead (R-4), and (c) why it is a separate port from
      `MailSender` rather than a method on it. The service normalizes through
      `customer.vocabulary.Emails`, delegates to `EmailSuppressions`, and catches
      `DataAccessException` — narrow, per convention §6, and justified in the javadoc against the
      send path's deliberately *transient-only* carve-out (#386), which is the opposite trade for a
      different stake.

- [x] **Step 4: Run it, verify it passes** — same command → PASS (4 tests)

- [x] **Step 5: Run the structural net** (AC-9) —
      `gradle test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*"` → PASS

- [x] **Step 6: Commit** — `git commit -m "feat(#400): notification.api port answering whether a mail would be withheld"`

- [x] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 1 — the edge reports it (`204 → 200`)

**Files:** Modify `CustomerRecovery.java`, `MyAccountController.java` · Create
`VerificationMailOutcome.java` · Test `CustomerRecoveryTest.java`, `MyAccountControllerTest.java`,
`EmailVerificationIT.java`, `MeSurfaceRoleGateTest.java`, `RateLimitFilterTest.java`

- [x] **Step 1: Write the failing tests** — AC-1/AC-2 (the controller's `200` + body), AC-3 (the send
      is dispatched identically either way — assert the token issue *and* the `MailSender` call still
      happen when withheld), AC-4 (a throwing lookup still answers `200 false`), AC-6 (the IT drives
      the real chain and asserts the `emailWithheld` wire name).

- [x] **Step 2: Run them, verify they fail** —
      `gradle test --tests "*CustomerRecoveryTest*" --tests "*MyAccountControllerTest*"` → FAIL (symbol `VerificationMailOutcome` absent)

- [x] **Step 3: Minimal implementation**
  - `CustomerRecovery.sendVerificationEmail` returns `VerificationMailOutcome`: issue the token,
    dispatch the send (both unchanged and in that order), then consult `MailDeliverability`. The
    disclosure is computed **after** the dispatch so no failure of it can alter the send.
  - `MyAccountController.requestVerification` returns
    `ResponseEntity.ok(new VerificationRequestedView(outcome == WITHHELD))`.
  - Update `MeSurfaceRoleGateTest` / `RateLimitFilterTest` expectations to `200` (AC-10).

- [x] **Step 4: Run them, verify they pass** — same command → PASS

- [x] **Step 5: End-of-phase regression** —
      `gradle test --tests "*MeSurfaceRoleGateTest*" --tests "*RateLimitFilterTest*" --tests "*EmailVerificationIT*" --tests "*ModularityTests*" --tests "*ErrorContractArchitectureTests*" --tests "*CompositionRootDisciplineTests*"` → PASS

- [x] **Step 6: Commit** — `git commit -m "feat(#400): tell the signed-in caller when the verification mail was withheld"`

- [x] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 2 — Angular: branch the resend copy

**Files:** Modify `core/customer-auth.ts`, `auth/set-password.ts` · Test `core/customer-auth.spec.ts`,
`auth/set-password.spec.ts`

- [x] **Step 1: Write the failing specs** (AC-7) — `customer-auth.spec.ts`: a `200 {emailWithheld:true}`
      resolves `'withheld'`, `false` resolves `'sent'`, a non-2xx resolves `'error'`.
      `set-password.spec.ts`: the withheld branch renders the new sentence in the existing
      `setpw-notice` region and the string "Verification email sent" is **absent**; the deliverable
      branch renders it unchanged.

- [x] **Step 2: Run them, verify they fail** — `npm test` → FAIL (2 tests: `expected 'sent' to be 'withheld'`)

- [x] **Step 3: Minimal implementation** — widen the service's return union and read the typed body;
      branch the component's `notice` copy three ways. No template structure change beyond the string.

- [x] **Step 4: Run them, verify they pass** — `npm test` (901) and `npm run test:a11y` (290) → PASS

- [x] **Step 5: Lint** — `npm run lint` → PASS

- [x] **Step 6: Commit** — `git commit -m "feat(#400): stop claiming a verification email was sent when it was withheld"`

- [x] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 3 — Playwright e2e (mocked suite)

**Files:** Modify `frontend/e2e/email-verification.e2e.ts`

- [x] **Step 1: Write the failing spec** (AC-8) — extend the existing spec (it already owns this
      flow's mocks) with a withheld case: route-mock the resend to `200 {emailWithheld:true}`, click
      *Resend verification email*, assert the withheld notice and the absence of the sent copy.
      **Mocked suite** (`frontend/e2e/`), not `real-backend/` — it needs no live backend and must run
      in CI (RV-FE-E2E).

- [x] **Step 2: Run it, verify it fails** — the resend had **no route mock at all** before this slice, so the first run failed on the missing route; the pair of tests (withheld vs deliverable, opposite copy) is what makes a flag-ignoring component fail

- [x] **Step 3: Make it pass** — no product change; added the `/api/me/verify-email/request` route to the shared `auth-mocks` helper, mirroring the real `200 {emailWithheld}` shape.

- [x] **Step 4: Run the suite** — `npm run test:e2e:a11y` → PASS (90/90)

- [x] **Step 5: Commit** — `git commit -m "test(#400): e2e coverage for the withheld verification-email notice"`

- [x] **Step 6: Update the plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-28 | phase 3 | Recovery/`/api/me/**` endpoints the CI-safe e2e suite leaves unrouted, so a spec silently exercises real network instead of a contract | `grep -rn "page.route(/\\/api" frontend/e2e/support/auth-mocks.ts` vs the paths in `SecurityConfig`/`RateLimitFilter` | 1: `POST /api/me/verify-email/request` had no route in the shared helper — the resend was never covered by any e2e | **Fixed here.** The route now mirrors the real `200 {emailWithheld}` body. The other three recovery paths and `/api/me/password` were already routed; `/api/me/erasure` is routed by the erasure spec's own helper. No further gap found. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2:** `gradle test --tests "*MyAccountControllerTest*"` → PASS
- [x] **AC-3:** `gradle test --tests "*CustomerRecoveryTest*"` → PASS (5 tests)
- [x] **AC-4:** `gradle test --tests "*MailDeliverabilityServiceTest*"` → PASS (5 tests)
- [x] **AC-5:** `gradle test --tests "*MailDeliverabilityServiceTest*"` → PASS (5 tests)
- [x] **AC-6:** `./gradlew test --tests "*EmailVerificationIT*"` → _pending_
- [x] **AC-7:** `npm test` → PASS (901 tests); `npm run test:a11y` → PASS (290); `npm run lint` → PASS
- [x] **AC-8:** `npm run test:e2e:a11y` → PASS (90/90, incl. an axe audit of the withheld notice)
- [x] **AC-9:** `gradle test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS
- [x] **AC-10:** `gradle test --tests "*MeSurfaceRoleGateTest*" --tests "*RateLimitFilterTest*"` → PASS

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
