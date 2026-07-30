# Operator-approved notification email (Email S7) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a platform admin approves a `PENDING` operator registration, exactly one email
reaches that operator's registered contact address telling it the account is active and linking
to `/account/sign-in`; reject, suspend and reinstate send nothing, and a mail failure can neither
fail nor slow the approval request.

**Architecture:** The single significant decision is **how the edge learns the approved operator's
address**: `operator.vocabulary.ApprovalOutcome` graduates from an `enum` to a **sealed interface**
whose `Approved` case carries `contactEmail`, and the JDBC adapter obtains it from the *same*
conditional statement that performs the transition (`UPDATE … WHERE status = 'PENDING' … RETURNING
contact_email`). The address therefore arrives only when this call is the one that actually flipped
the row, which makes "exactly one mail per approval" a property of the database rather than of edge
sequencing. This mirrors the shipped `OperatorLifecycleOutcome.Changed(operatorId, username)` (#128/#357)
and `ResetPasswordOutcome.Reset(accountId, email)`, and its stated rationale — *asking the module a
second time would open a window between the status write and the follow-up action*. Composition and
sending stay at the platform edge (RV-BE-11); the send rides the existing in-memory dispatcher
(#369 mechanism), locked by epic #367: *"The operator-approval mail (#375) also uses the executor —
no secret, but it's edge-orchestrated from an admin request, not a domain event."*

**Persistence:** JDBC only (invariant #1). **No Flyway migration** — the grill resolved the issue's
"schema check first" clause: `operator.contact_email` already exists (V29, nullable) and
self-registration already captures it (`AuthController.OperatorRegistrationRequest`). One existing
statement in `JdbcOperators` changes shape (adds `RETURNING contact_email`); no table, column, index
or constraint is touched.

**Source of intent:** GitHub issue [#375](https://github.com/ivopogace/riviera-sunbed-booking/issues/375)
(Email S7), under epic [#367](https://github.com/ivopogace/riviera-sunbed-booking/issues/367) +
`docs/adr/ADR-0011-transactional-email-scaleway-tem.md` (decision 5 — which vehicle a mail uses).

**Skills consulted:**
- `riviera-sdlc` — drove the loop; its issue-intake grill gate produced the four drift findings below.
- `riviera-plan-doc` — this doc's structure, the AC-at-the-inner-hexagon rule, the Execution-status anchor.
- `riviera-modulith` — kept the new surface on `notification::api` (`MailSender` grows a method rather
  than a new port: "a port is a purposeful conversation"), confirmed `ApprovalOutcome` belongs in
  `operator/vocabulary/` (sealed outcome type → `vocabulary`, never `api/`), and confirmed **no new
  `allowedDependencies` grant** is needed — the only new cross-module edge is composition-root → module.
- `riviera-java-conventions` — sealed interface + record deconstruction in the controller `switch`
  (§5), typed outcome over exception (§6), named constants for the new kind/status tokens (§6a),
  one-line-or-none inline comments (§6c), and the §10 rule that decided the mock's log line carries no
  raw address without newline-sanitisation.
- `postgres` — confirmed `UPDATE … WHERE <guard> RETURNING <col>` keeps the existing single-statement
  conditional-update locking semantics (no new lock, no second visit to the row), so `RETURNING`
  costs nothing over the shipped `int rows = …update()` shape.
- `codebase-design` — applied the *deletion test* to the proposed edge collaborator: `OperatorApprovalMail`
  survives it (null/blank guard + link construction + the "only on Approved" rule would otherwise spread
  into `AdminOperatorController`), so it is a real seam, not a pass-through.
- `domain-modeling` — checked `CONTEXT.md`: **no new glossary term** (a message *kind* is not domain
  vocabulary; "approval" and the mail-vs-account "reinstatement" disambiguation are already recorded)
  and **no new ADR** (ADR-0011 decision 5 already locked the vehicle choice; nothing here is a fresh
  hard-to-reverse trade-off).
- `riviera-local-debug` — scoped-test discipline for every command in this doc (CI owns the full suite).
- `riviera-review-overlay` — loaded at the review gate; its backend bank walked against the diff,
  producing finding F-1 (RV-STYLE-1, a two-line inline comment) which is fixed. RV-PROC-1 re-checked
  after that fix: it touched backend Java only, an area already covered by this line.

**Branch:** `claude/sdlc-375-uk5u5w` — the cloud session's designated remote branch **stands in for**
`feature/operator-approved-notification-email` (`riviera-sdlc` §Remote/cloud session addendum). Cut
fresh from `main` at `d2f3732`; exists before phase 0.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a `PENDING` operator registered with a known address, when an admin approves it,
  then `OperatorLifecycle.approve` answers `ApprovalOutcome.Approved(<that address>)` and exactly one
  `OPERATOR_APPROVED` mail is recorded for it, carrying an absolute link whose path is
  `/account/sign-in`. *Pinned by:* `OperatorApprovalMailIT.approvingAPendingOperatorMailsItTheSignInLink`
  (end to end through the admin endpoint) + `OperatorLifecycleIT.approveActivatesAPendingOperatorAndReportsItsContactEmail`
  (the module half) + `OperatorApprovalMailTest.sendsTheSignInLinkBuiltOnTheConfiguredOrigin` (the exact link).
- [x] **AC-2:** Given a `PENDING` operator, when the same approval is submitted twice, then the second
  call answers `ApprovalOutcome.NotPending` and **no second mail** is recorded — the address is returned
  only by the statement that flipped the row. *Pinned by:* `OperatorApprovalMailIT.aSecondApprovalMailsNothing`
  + `OperatorLifecycleIT.aSecondApproveIsNotPendingAndCarriesNoAddress`.
- [x] **AC-3:** Given a `PENDING` operator, when an admin **rejects** it — and given an `ACTIVE` operator,
  when an admin **suspends** and then **reinstates** it — then no mail of any kind is recorded.
  *Pinned by:* `OperatorApprovalMailIT.rejectAndSuspendReinstateMailNothing`
- [x] **AC-4:** Given a `Mailer` whose `sendOperatorApproved` throws, when the send runs, then the
  failure dies inside the dispatched task and is counted under
  `riviera.mail.recovery.failed{kind="operator-approved",reason="transport"}`; and given an approval,
  the mail is issued only **after** the transition, so it cannot influence the admin's response.
  *Pinned by:* `TransactionalMailServiceTest.anOperatorApprovedTransportFailureIsSwallowedAndCounted`
  and `AdminOperatorControllerTest.approveMailsTheOperatorAfterTheTransition`
- [x] **AC-5:** Given a suppressed address, when an operator registered with it is approved, then the
  chokepoint skips the send and the mock records nothing — no new bypass of the module's defining
  invariant. *Pinned by:* `TransactionalMailServiceTest.anOperatorApprovedMailToASuppressedAddressIsSkipped`
- [x] **AC-6:** Given the public registration and sign-in surfaces, when this slice ships, then their
  request/response contracts are byte-for-byte unchanged and no new account-existence signal appears.
  *Pinned by:* the unchanged `OperatorRegistrationIT` + `PerOperatorLoginIT` (regression, not new tests).

## Non-goals

- **No email-format validation added to operator self-registration.** See the Open-questions section:
  the issue's validation clause is conditional on the schema *lacking* a contact email; it does not.
  Registration stays byte-for-byte unchanged (AC-6), non-blank + trimmed as today.
- **No mail on reject.** The issue is explicit: "Rejection sends nothing in this slice."
- **No mail on suspend/reinstate.** Those transitions revoke sessions; telling an operator by email that
  it has been suspended is a separate product decision, not in this slice.
- **No new operator-facing endpoint, page, or frontend change** — `area:backend`, and the operator learns
  by email instead of by polling the sign-in page.
- **No renaming of the `riviera.mail.recovery.*` counters** even though this non-recovery kind now rides
  them — see R-4. Renaming a shipped metric breaks whatever reads it; the Javadoc and runbook are
  corrected instead.
- **No operator email verification / no suppression-reinstatement affordance for operators** — the
  operator address stays unverified and informational-plus-deliverable, as V29 describes it.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` One published type changes *shape* without changing behavior;
that is covered by the Module/interfaces table and by the unchanged `AdminOperatorControllerTest`
status-mapping assertions (`APPROVED/REJECTED → 204`, `NOT_PENDING → 409`, `NO_SUCH_OPERATOR → 404`),
which must keep passing verbatim.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `ApprovalOutcome` enum → sealed interface is a **published-vocabulary shape change**; a missed consumer breaks the build or, worse, an `equals` comparison silently stops matching | med | med | Only three production consumers (`OperatorRegistrationService`, `JdbcOperators`, `AdminOperatorController`) + tests; all comparisons are `switch` over the closed set, none is `==`/`equals` on an enum constant — verified by `grep -rn "ApprovalOutcome"` before and after. Exhaustive `switch` with no `default` makes a missed case a **compile error** | Claude | **closed** (phase 1) — the compiler found the one consumer the grep plan had missed (`WebSliceStubs`); no `==` comparison existed anywhere |
| R-2 | `contact_email` is **nullable** (V29: the env-managed bootstrap admin has none), so `Approved` can carry `null` and the edge could NPE or mail an empty address | low | med | `OperatorApprovalMail` guards null **and** blank before touching `MailSender` | Claude | **closed** (phase 2) — pinned twice: `OperatorApprovalMailTest.sendsNothingWhenTheApprovedOperatorHasNoAddress` (both null and blank) and `OperatorLifecycleIT.approveReportsANullAddressWhenTheRowCarriesNone`, which proves the null survives the `RETURNING` round-trip rather than assuming it |
| R-3 | Mail send inside the approval request could slow it or fail it, or interleave with the session-revocation bracket | low | high | The send goes through `TransactionalMailService.dispatchQuietly` → `AsyncMailDispatcher`: off-thread, never throws, failures swallowed-and-counted. It is issued **after** `lifecycle.approve` returns and touches no session state (approve has no revoke bracket — only suspend/reinstate/password paths do). AC-4 pins it | Claude | **closed** (phase 2) — and hardened past the mitigation: writing the test surfaced that the *link builder* was the one request-time throw source (a mis-set `link-base-url` would have 500'd a committed approval, the #357 failure shape). The link is now built at construction, so a bad origin fails at boot instead |
| R-4 | This non-recovery kind rides the `riviera.mail.recovery.*` counters, so a reader of the metric/log could mis-attribute an operator-approval loss to a tourist recovery flow | high | low | Deliberate and documented: "recovery" names the **vehicle**, not the flow — the `kind` tag disambiguates | Claude | **closed** (phase 3) — `docs/runbooks/observability.md` states the vehicle-vs-flow reading where an on-call reader meets it, and gains a `kind="operator-approved"` row with its own alert semantics (one lost operator, not a relay signal, since the volume is a trickle). `CLAUDE.md` + `RESPONSIBILITIES.md` carry the same clause. Two recovery-specific log lines were generalised — the loss line no longer promises a token this kind never had |
| R-5 | `UPDATE … RETURNING` through `JdbcClient.query(...)` is a shape this repo has not used before; a driver/`JdbcClient` mismatch would surface only against real Postgres | low | high | Proven by a Testcontainers IT against the full Flyway chain, not by a unit test | Claude | **closed** (phase 1) — green in `OperatorLifecycleIT` against real Postgres. It was also less novel than the risk assumed: `insertPending` and the ITs' own fixtures already use `INSERT … RETURNING` through the same `JdbcClient` path. The documented fallback (a same-transaction follow-up read) was not needed |
| R-6 | Mock/SMTP transports drift — a new kind added to the port but not to one implementation | low | med | `Mailer` is an interface, so an omission is a compile error | Claude | **closed** (phase 0) — and the compiler proved the point immediately, failing on three *test* doubles the plan's grep had not predicted. Both transports covered: `MockMailerTest.recordsOperatorApproved`, `SmtpMailerIT.deliversOperatorApprovedEmailOverSmtp` |
| R-7 | Suppression bypass — a new send path that skips the module's defining invariant | low | high | Impossible by construction: the new method delegates to the same `dispatchQuietly` chokepoint | Claude | **closed** (phase 0) — pinned by `TransactionalMailServiceTest.anOperatorApprovedMailToASuppressedAddressIsSkipped` |
| R-8 | Flyway version collision | none | — | No migration in this slice. (For the record: `V35` is the highest on `main`, `V36` is free, and the only open PRs are Dependabot frontend bumps — no `.sql` in any of them) | Claude | closed — no migration |

## Open questions / Assumptions

**None open.** All three entries below resolved during the build; they are kept (moved, not deleted)
so the decisions are reviewable.

### Resolved

- **Assumption → held.** *The issue's AC-2 ("If the schema lacked an operator email, a Flyway migration
  adds it and self-registration captures + validates it") is **moot**, because the schema does not lack
  it.* V29 added `operator.contact_email`; `AuthController` captures it (required, non-blank, trimmed).
  No migration was written, and **no format validation was added**: the issue's own AC-4 requires the
  public registration surface to be unchanged, and a syntax check would catch neither realistic failure
  (a typo'd domain, an address the applicant does not control) while changing a shipped public contract.
  The admin sees the address in the pending queue before approving, which is the check that exists.
  Flagged in PR #437's Scope notes for the maintainer to overrule. *Resolved:* plan stage, `71ad6e7`.
- **Assumption → held.** *The sign-in link is built from the existing `riviera.recovery.link-base-url`*
  rather than a new property — already documented as "the absolute origin the emailed links point at"
  (#368), already an env-injected deploy secret on #370's checklist. The residual cost (a `recovery.*`
  property serving a non-recovery link) is documented on `OperatorApprovalMail` itself. *Resolved:*
  phase 2, `cbdee4d`.
- **Assumption → held.** *`/account/sign-in` is the correct landing path* — the S9 audience-aware page;
  post-sign-in landing is then driven by `GET /api/venues/mine` (0 venues → onboarding), which is right
  for a freshly-approved operator. No `returnUrl` appended. Asserted by AC-1. *Resolved:* phase 2, `cbdee4d`.


- **Grill finding (drift):** the issue says "**Schema check first:** verify the operator aggregate
  actually stores a contact email from self-registration; if not, add it (Flyway)". **It does** —
  `operator.contact_email` (V29) + `PendingOperator.contactEmail` + `OperatorAccount.contactEmail`.
  No migration. Recorded above as the first assumption.
- **Grill finding (drift):** the issue implies the approval flow can reach the address. **It cannot** —
  `OperatorLifecycle.approve` returns a payload-free `enum`. Resolved by the sealed-outcome change
  described under **Architecture**; the alternative (a pre-read query mirroring `activeUsername`) was
  rejected because that precedent exists only because a revoke must *precede* its write, whereas this
  mail must *follow* one.
- **Grill finding (in-flight check):** no feature PR is open (only ten Dependabot frontend bumps), no
  shared-file contention, `V36` free. Epic #367 tracks slices as GitHub sub-issues (13/20 closed), so
  the previous sibling's close-out tick is automatic — no missed checklist to repair.
- **Grill finding (module ownership):** checked against `RESPONSIBILITIES.md` — see §4a. No capability
  lands on another module's Not-My-Job list.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` This slice touches no booking, no `availability` row, no beach
map and no set. Its only concurrency concern is *approval* concurrency (two admins approving the same
registration), which is already resolved by the shipped conditional `UPDATE … WHERE status = 'PENDING'`
and is **strengthened**, not weakened, here: the address now rides that same statement's `RETURNING`
clause, so the loser of the race receives no address and therefore cannot send a duplicate mail (AC-2).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | `Operator` | Owns the admin-driven lifecycle **state transition** `PENDING → ACTIVE` and the stored `contact_email`. It reports the transition's outcome; it neither composes nor sends mail. |
| M-2 | `notification` | existing | (none — owns `email_suppression` state) | Owns transactional-mail delivery: the transports, both vehicles, the suppression chokepoint. A new message *kind* is by definition its job. |
| M-3 | root (composition root, **not** a module) | existing | — | Orchestrates *when* to send and hands the message fully formed (RV-BE-11), exactly as `CustomerRecovery` does. Approval machinery is edge-orchestrated. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `notification.api` | `MailSender#sendOperatorApproved(String toEmail, URI signInLink)` — a **new method on the existing port**, not a new port | `java.net.URI` | composition root (`OperatorApprovalMail`) |
| NI-2 | `operator.api` | `OperatorLifecycle#approve(OperatorId)` — signature unchanged; its **return type changes shape** | `operator.vocabulary.ApprovalOutcome` (enum → sealed interface; `Approved` gains `contactEmail`) | composition root (`AdminOperatorController`) |

**No `allowedDependencies` change.** `MailSender` grows a method rather than a port because the
conversation is the same one — *"send this fully-formed transactional message"* (`riviera-modulith`:
a port is a purposeful conversation; the port's own Javadoc already says it "grows a method per
edge-called message kind"). Both consumers are the composition root, which depends on modules by
design; no module gains a dependency, so `ModularityTests` sees no new edge.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none — deliberately** | — | — | — | — | — |

Per ADR-0011 decision 5 and epic #367's locked note: this mail is triggered by an **admin request**,
not by a domain fact any other module needs. Minting `OperatorApproved` + a registry publication to
carry it back to the same edge that issued the request would be ceremony, and would additionally
persist the payload in `event_publication`. It rides the in-memory dispatcher (the #369 mechanism).
The trade this accepts, stated plainly: a crash between the committed approval and the queued send
loses the mail with no republish. That is the same bargain the recovery vehicle already makes, and it
is a better fit here than for recovery — the operator's fallback is simply signing in, and the admin
can see the account is `ACTIVE`.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Report the approved operator's contact address alongside the transition | `operator` | `operator` **Job**: "own operator accounts incl. their admin-driven lifecycle state … answers *what is the ACTIVE operator with this id called?*, so the edge can revoke its sessions". Reporting a stored account attribute with its own transition is the same job, same precedent (`OperatorLifecycleOutcome.Changed` carries the username). **Not** `notification` — its Not-My-Job is knowing accounts. |
| Compose + send the "your account is active" message | `notification` | `notification` **Job**: transactional-mail delivery, the transports, the suppression chokepoint. `booking`'s Not-My-Job list already routes *"deciding whether a confirmation email will be sent, or knowing any address"* → `notification`; the same rule applies here. |
| Decide *when* to send, and build the sign-in link | composition root (edge) | RV-BE-11 + `RESPONSIBILITIES.md`: "login/approval/session machinery stays at the edge"; mail composition is edge-orchestrated (`notification` is "driven through `notification::api`" by the edge). `operator` must not learn about mail; `notification` must not learn about approvals. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no ledger entry, no Stripe call, no commission arithmetic.

## Angular — frontend surfaces touched

`N/A — backend-only.` The operator's experience changes because an email arrives, not because a page
changes; `area:backend` on the issue, and AC-6 requires the public surfaces to stay as they are.

## FE↔BE contract

`N/A — no contract change.` `POST /api/admin/operators/{id}/approve` keeps its request shape and all
three response statuses (`204` / `409 NOT_PENDING` / `404 NO_SUCH_OPERATOR`); the changed
`ApprovalOutcome` is an internal Java type that never reaches the wire.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting.

**Stage pointer:** `merge close-out — Sonar gate PASSED, review gate HALF-RUN (see F-2), awaiting merge`

**Next action:** Merge PR #437 once the human authorizes and the `/code-review` subagent fan-out has
run (F-2); then close-out steps 1–3 + 5–7 (`references/pr-gates.md` §3).

**Gate results**

| Gate | Result |
|---|---|
| CI (PR #437) | ✅ all 7 checks green on `b2af957`, incl. the **full** backend suite — the full-suite-only failure class the scoped local runs cannot show |
| Sonar | ✅ genuinely clear, not a false-clean zero: `api/issues/search` **total 0**, and `measures` is non-empty with `new_lines=238`, `new_coverage=100.0`, `new_duplicated_blocks=0`, `new_bugs`/`new_vulnerabilities`/`new_code_smells` all 0; the `SonarCloud Code Analysis` check-run concluded `success` |
| Review | ⚠️ **half-run — see finding F-2.** The `riviera-review-overlay` backend bank was walked in full against the diff (one finding, F-1, fixed); the `/code-review` subagent fan-out was **not** run, because this session carries a standing "do not use the Agent tool unless the user requested it" instruction. Per `pr-gates.md` §1 the PR's review checkbox stays **unticked** rather than claiming a gate that did not fully run |

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `notification`: the `OPERATOR_APPROVED` mail kind, end to end inside the module | ✅ | `afedbec` |
| 1 — `operator`: `ApprovalOutcome` sealed + `RETURNING contact_email` | ✅ | `6963c4a` |
| 2 — edge: `OperatorApprovalMail` + controller wiring + ITs | ✅ | `cbdee4d` |
| 3 — docs: `RESPONSIBILITIES.md`, observability runbook, `CLAUDE.md`, close-out | ✅ | `b2af957` + this commit (F-1 fix + close-out) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (overlay, RV-STYLE-1) | `OperatorApprovalMail`'s constructor carried a **two-line** inline comment; the rule is one line or none, with Javadoc exempt | fixed — the rationale moved onto the constructor's Javadoc, where it was always allowed to be long; re-ran `*OperatorApprovalMail*` + `*AdminOperatorControllerTest*` green |
| F-3 | review (`/code-review`, agent 1 — CLAUDE.md adherence) | The enum→sealed rewrite of `ApprovalOutcome` left **four dangling `{@link ApprovalOutcome#APPROVED}`-style Javadoc references** on `OperatorLifecycle`, a *published* `api/` port — the one surface this repo treats as load-bearing documentation. The file was untouched by the diff, so nothing pointed at it | fixed — the refs now name the record cases, and `approve`'s contract documents the address it carries (and `reject`'s that it deliberately carries none). `gradle javadoc` confirms the four errors are gone; the 12 that remain are all in files this PR never touched (pre-existing on `main`, out of scope) |
| F-2 | process (review gate) | The `/code-review` subagent fan-out did not run — this session may not start subagents unasked. The overlay bank ran in full; the **generic** BE/contract banks did not | **open — blocks merge.** Needs one line of human authorization, then re-run per the `pr-gates.md` §1 ladder (rung 1, `Skill("code-review")`, is confirmed working this session). The PR's review checkbox is left unticked and the PR says so |

---

## File structure

**`notification` (phase 0)**

- `notification/api/MailSender.java` — **modify**: `+ sendOperatorApproved(String toEmail, URI signInLink)`.
- `notification/application/Mailer.java` — **modify**: the same method on the internal transport port.
- `notification/application/TransactionalMailService.java` — **modify**: implement the new port method
  via `dispatchQuietly`; add `KIND_OPERATOR_APPROVED`; generalise `recordLoss`'s recovery-specific wording.
- `notification/adapter/out/SentEmail.java` — **modify**: `Kind.OPERATOR_APPROVED` + an
  `operatorApproved(toEmail, signInLink)` factory (the link slot carries a **non**-credential URL here).
- `notification/adapter/out/MockMailer.java` — **modify**: record + log the new kind (no `logRecovery`
  reuse — its Javadoc is about bearer-credential links, which this is not).
- `notification/adapter/out/SmtpMailer.java` — **modify**: subject + plain-text body with the sign-in URL.

**`operator` (phase 1)**

- `operator/vocabulary/ApprovalOutcome.java` — **rewrite**: enum → sealed interface
  (`Approved(String contactEmail)` / `Rejected` / `NotPending` / `NoSuchOperator`).
- `operator/application/Operators.java` — **modify**: Javadoc for the address the port now returns.
- `operator/adapter/out/JdbcOperators.java` — **modify**: `activate` gets its own `UPDATE … RETURNING
  contact_email`; the miss classification is extracted so `rejectPending` keeps sharing it.
- `AdminOperatorController.java` — **modify**: the `ApprovalOutcome` `switch` becomes a pattern switch.

**edge (phase 2)**

- `OperatorApprovalMail.java` — **create** (root package): the "send it, if there is an address" seam —
  null/blank guard, `/account/sign-in` link construction from `RecoveryProperties#linkBaseUrl`, one call
  to `MailSender`.
- `AdminOperatorController.java` — **modify**: on `Approved`, hand the address to `OperatorApprovalMail`.

**Tests**

- `notification/application/TransactionalMailServiceTest.java` — **modify** (AC-4, AC-5).
- `notification/adapter/out/MockMailerTest.java` — **modify** (records the new kind).
- `notification/adapter/out/SmtpMailerIT.java` — **modify** (recipient/subject/link, no tracking markup).
- `notification/MailSenderWiringIT.java` — **modify** (the new method reaches the mock through the port).
- `operator/OperatorLifecycleIT.java` — **modify** (approve returns `Approved` with the address; reject
  and a second approve do not).
- `AdminOperatorControllerTest.java` — **modify** (status mapping unchanged; approve still `204` when
  the mail fails).
- `OperatorApprovalMailTest.java` — **create** (guard: null/blank address sends nothing; link shape).
- `OperatorApprovalMailIT.java` — **create** (AC-1, AC-2, AC-3 end-to-end through the admin surface).

**Docs (phase 3)**

- `RESPONSIBILITIES.md`, `docs/runbooks/observability.md`, `CLAUDE.md` (the `notification` module row),
  and this plan doc's close-out.

---

## Phase 0 — `notification`: the `OPERATOR_APPROVED` mail kind

**Files:** Modify `notification/api/MailSender.java` · `notification/application/Mailer.java` ·
`notification/application/TransactionalMailService.java` · `notification/adapter/out/{SentEmail,MockMailer,SmtpMailer}.java`
· Test `notification/application/TransactionalMailServiceTest.java` ·
`notification/adapter/out/{MockMailerTest,SmtpMailerIT}.java` · `notification/MailSenderWiringIT.java`

- [ ] **Step 1: Write the failing tests** — in `TransactionalMailServiceTest`: the new kind goes through
  the dispatcher (not the caller's thread), a suppressed address is skipped (AC-5), and a throwing
  transport is swallowed and counted under `kind="operator-approved", reason="transport"` (AC-4).
  In `MockMailerTest`: the mock records `Kind.OPERATOR_APPROVED` with the link.
- [ ] **Step 2: Run them, verify they fail** —
  `./gradlew test --tests "*TransactionalMailServiceTest*" --tests "*MockMailerTest*"` → FAIL
  (compile error: no such method).
- [ ] **Step 3: Minimal implementation** — add the method to `MailSender` + `Mailer`, implement it in
  `TransactionalMailService` as `dispatchQuietly(KIND_OPERATOR_APPROVED, toEmail, …)`, add
  `Kind.OPERATOR_APPROVED` + the `SentEmail.operatorApproved` factory, implement both transports.
  Generalise `recordLoss`'s log wording so it does not promise a token that this kind has none of.
- [ ] **Step 4: Run them, verify they pass** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — search for every place that enumerates mail kinds
  (`grep -rn "PASSWORD_RESET\|KIND_VERIFICATION" platform/src`), so the new kind is added everywhere the
  existing ones appear rather than in the two obvious files.
- [ ] **Step 6: Commit** — `git commit -m "feat(#375): add the operator-approved transactional mail kind (#375)"`
- [ ] **Step 7: Push + open the draft PR immediately** (CI fires on `pull_request` only, `riviera-sdlc`
  rule 3), and update this doc's Execution status in the same commit window.

## Phase 1 — `operator`: the approval outcome carries the address

**Files:** Modify `operator/vocabulary/ApprovalOutcome.java` · `operator/application/Operators.java` ·
`operator/adapter/out/JdbcOperators.java` · `AdminOperatorController.java` ·
Test `operator/OperatorLifecycleIT.java` · `AdminOperatorControllerTest.java`

- [ ] **Step 1: Write the failing test** — `OperatorLifecycleIT`: approving a `PENDING` operator
  registered with a known address answers `ApprovalOutcome.Approved` carrying **that** address; a second
  approve answers `NotPending`; reject answers `Rejected`; an unknown id answers `NoSuchOperator`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*OperatorLifecycleIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — rewrite `ApprovalOutcome` as the sealed interface; give
  `activate` its own `UPDATE operator SET status = :target WHERE id = :id AND status = :pending RETURNING
  contact_email` mapped straight to `Approved`, falling back to the extracted miss classification;
  convert the controller's `switch` to a pattern switch (no `default`, so the compiler proves exhaustiveness).
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*OperatorLifecycleIT*"
  --tests "*AdminOperatorControllerTest*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — `grep -rn "ApprovalOutcome" platform/src` to confirm every
  consumer moved, and re-run the structural net:
  `./gradlew test --tests "*ModularityTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"
  --tests "*PackageShapeArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*"`.
- [ ] **Step 6: Commit** — `git commit -m "refactor(#375): carry the approved operator's address on ApprovalOutcome (#375)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — edge: send the mail on approval

**Files:** Create `OperatorApprovalMail.java` · Modify `AdminOperatorController.java` ·
Test `OperatorApprovalMailTest.java` (create) · `OperatorApprovalMailIT.java` (create) ·
`AdminOperatorControllerTest.java`

- [ ] **Step 1: Write the failing tests** — `OperatorApprovalMailIT` (Testcontainers, through the real
  admin endpoint): AC-1 (exactly one mail, `/account/sign-in` link), AC-2 (second approve mails nothing),
  AC-3 (reject / suspend / reinstate mail nothing). `OperatorApprovalMailTest`: a null address and a blank
  address each send nothing. `AdminOperatorControllerTest`: approve is still `204` when the mail fails.
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*OperatorApprovalMail*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — `OperatorApprovalMail` (guard + link + one `MailSender` call);
  the controller calls it when and only when the outcome deconstructs to `Approved`.
- [ ] **Step 4: Run them, verify they pass** — `./gradlew test --tests "*OperatorApprovalMail*"
  --tests "*OperatorApprovalIT*" --tests "*AdminOperatorControllerTest*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — check the other lifecycle transitions (reject, suspend,
  reinstate) for an accidental send path, and confirm `CompositionRootDisciplineTests` + the auth-placement
  tests still pass: `./gradlew test --tests "*CompositionRootDisciplineTests*"
  --tests "*OperatorAuthPlacementTests*" --tests "*ErrorContractArchitectureTests*"`.
- [ ] **Step 6: Commit** — `git commit -m "feat(#375): email an operator when an admin approves its registration (#375)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 3 — docs + close-out

**Files:** Modify `RESPONSIBILITIES.md` · `docs/runbooks/observability.md` · `CLAUDE.md` ·
`docs/plans/operator-approved-notification-email.md`

- [ ] **Step 1:** `RESPONSIBILITIES.md` — add the kind to `notification`'s Job; note that `operator`'s
  approval outcome now reports the address (and that mail composition is still not its job).
- [ ] **Step 2:** `docs/runbooks/observability.md` — add `operator-approved` to the `kind` tag values and
  state explicitly that `riviera.mail.recovery.*` names the **vehicle**, not the flow (R-4).
- [ ] **Step 3:** `CLAUDE.md` — extend the `notification` module row with the new kind.
- [ ] **Step 4:** Run `riviera-docs-freshness` over the slice's range (merge close-out step 5).
- [ ] **Step 5: Commit** — `git commit -m "docs(#375): record the operator-approved mail kind (#375)"`
- [ ] **Step 6:** Mark the PR ready for review → Review gate → Sonar gate → merge close-out.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 0 — new mail kind | every site that enumerates mail kinds | `grep -rln "PASSWORD_RESET\|KIND_PASSWORD_RESET\|BOOKING_CONFIRMATION" platform/src docs/runbooks RESPONSIBILITIES.md CLAUDE.md` | 6, all Java (3 main + 3 test); no doc enumerates kinds by constant | Fixed all 6. The compiler found three more the grep would have missed — the `Mailer`/`MailSender` test doubles (`WebSliceStubs`, `ControllableMailer`, `MailSenderWiringIT.RecordingMailer`), which is the argument for growing an interface rather than a `switch`. |
| 2026-07-30 | phase 1 — sealed `ApprovalOutcome` | every consumer of the retired enum constants | `grep -rn "ApprovalOutcome" platform/src` | 4 (`JdbcOperators`, `AdminOperatorController`, `WebSliceStubs`, `OperatorLifecycleIT`) | All moved. The plan predicted three; `WebSliceStubs` was the fourth and the compiler, not the grep, is what caught it. No `==`/`equals`-on-constant comparison existed, so no silent-mismatch class to sweep for. |
| 2026-07-30 | phase 2 — the send site | any other path that makes an operator sign-in-capable and might deserve the same mail | `grep -rn "activate\|provision(" platform/src/main/java/ai/riviera/platform/operator` | 2: the approval path (in scope) and `OperatorProvisioning#provision`, which creates an ACTIVE operator directly | **Skipped deliberately.** Provisioning is the admin/bootstrap path (`OperatorCredentialInitializer`, test fixtures) — there is no applicant waiting to be told, and #375 scopes the mail to the `PENDING → ACTIVE` approval. Recorded so the omission is a decision, not an oversight. |

---

## Acceptance-criteria verification (final)

All six verified against the commits below, and independently by **CI's full backend suite** on
`b2af957` (green) — which is the half the scoped local runs cannot prove (`riviera-local-debug`,
full-suite-only failure class). Testcontainers ITs ran for real, not skipped:
`OperatorApprovalMailIT` reported `tests=3 skipped=0 failures=0 errors=0`.

- [x] **AC-1:** `gradle test --tests "*OperatorApprovalMailIT*" --tests "*OperatorLifecycleIT*" --tests "*OperatorApprovalMailTest*"` → PASS. Verified at `cbdee4d`.
- [x] **AC-2:** `gradle test --tests "*OperatorApprovalMailIT*" --tests "*OperatorLifecycleIT*"` → PASS. Verified at `cbdee4d`.
- [x] **AC-3:** `gradle test --tests "*OperatorApprovalMailIT*"` → PASS. Verified at `cbdee4d`.
- [x] **AC-4:** `gradle test --tests "*TransactionalMailServiceTest*" --tests "*AdminOperatorControllerTest*"` → PASS. Verified at `afedbec` (chokepoint half) and `cbdee4d` (edge half).
- [x] **AC-5:** `gradle test --tests "*TransactionalMailServiceTest*"` → PASS. Verified at `afedbec`.
- [x] **AC-6:** `gradle test --tests "*OperatorRegistrationIT*" --tests "*PerOperatorLoginIT*" --tests "*OperatorApprovalIT*"` → PASS, unmodified. Verified at `cbdee4d`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — `JdbcClient` + text-block SQL; `JdbcOnlyArchitectureTests` green.
- [x] **Availability** section filled — justified `N/A`; the only concurrency in scope is approval
      concurrency, and the `RETURNING` clause *strengthens* its single-winner property (AC-2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path touched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event added
      (with the reason recorded); `ModularityTests` + `PublishedSurfacePlacementArchitectureTests` +
      `PackageShapeArchitectureTests` green (invariant #11).
- [x] **Payment/payout** section filled — `N/A`, no money moves (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A, no new time logic.
- [x] Booking codes unguessable (invariant #7) — N/A, and the new mail carries no bearer credential at
      all; the mock's link echo needed no invariant-#7 argument for the first time.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change (the grill's
      first finding); `V36` left free.
- [x] **Frontend** standards — N/A, backend-only; no file under `frontend/` touched.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, gate results, findings register.
- [x] Risk register has no stale `open` rows (all eight closed with outcomes); Open Questions empty.
- [x] **Close-out written in THIS PR** — this final state is committed here citing `merged via PR #437`,
      so no docs-only follow-up PR is needed.
- [ ] **The review gate ran in full** — **deliberately unticked (finding F-2).** The
      `riviera-review-overlay` backend bank ran in full against the diff; the `/code-review` subagent
      fan-out did not, because this session may not start subagents unasked. Stated in PR #437 rather
      than ticked, per `pr-gates.md` §1 ("never substitute silently").
