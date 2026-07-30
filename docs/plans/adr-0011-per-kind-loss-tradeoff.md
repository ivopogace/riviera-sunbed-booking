# ADR-0011 per-kind loss trade-off Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No place in the repo justifies the in-memory mail vehicle's accepted loss with a
reason that is false for one of the kinds riding it — the operator-approval notice (#375),
which has no token and nothing to re-send it.

**Architecture:** Option 1 of issue #439, chosen by the maintainer: **amend the recorded
rationale, do not change the vehicle.** ADR-0011 decision 5's trade-off becomes explicitly
**per-kind** — the recovery pair self-heals (token committed, user re-requests), the
operator-approval notice is accepted as the knowingly weaker case (loss unrecoverable,
mitigated only operationally by the `kind="operator-approved"` counters plus the runbook's
"tell them" remedy). Option 2 (move the notice to the Event Publication Registry for
at-least-once) was considered and rejected — see Open questions → Resolved. Zero behaviour
change: prose, Javadoc, and three log-message clauses.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue **#439** (deferred finding F-8 from PR #437's review gate);
the decision it amends is `docs/adr/ADR-0011-transactional-email-scaleway-tem.md` decision 5;
epic **#367**.

**Skills consulted:** `riviera-sdlc` (routing + the intake grill gate; docs-only close-out is
pre-merge-able per the #326/#346/#351 case history) · `domain-modeling` (ADR discipline: amend
the text to be true **and** append a dated blockquote note quoting the removed claim — the
in-file convention set by the #371 and #386 amendments; no new ADR, since nothing hard-to-reverse
is being decided) · `riviera-java-conventions` (§6c — Javadoc is the documented surface and is
exempt from the one-line comment rule, so the per-kind explanation belongs *in* the Javadoc on the
port rather than inline at call sites) · `riviera-plan-doc` (this doc). **Not loaded, deliberately:**
`riviera-modulith` — no class, package, published surface, or dependency changes; the only
`api/` file touched is `MailSender`, whose *contract prose* changes while its methods, types and
module edges stay byte-identical. `postgres`, `riviera-stripe-payments`, `riviera-frontend`,
`playwright-cli`, `angular-developer` — no migration, money, or frontend surface in scope.

**Branch:** `claude/sdlc-439-f9jmnb` — the cloud session's designated branch, standing in for
`feature/adr-0011-per-kind-loss-tradeoff` (`riviera-sdlc` §Remote/cloud session addendum). Cut
from `main` at `15e15ad`.

---

## Acceptance criteria (testable)

> No AC here names a test class, and that is not a gap being papered over: the slice changes
> **prose and three log-message strings**, and asserting the wording of documentation in a unit
> test would pin the words rather than any behaviour. Each AC is therefore verified by an exact
> command whose output is checkable by a reviewer, which is the strongest available pin. The
> **behaviour** the prose describes is already pinned by the tests #375/#415/#423/#434 shipped
> (`AsyncMailDispatcherTest`, `TransactionalMailServiceTest`) and those must stay green — AC-5.

- [ ] **AC-1:** Given ADR-0011 decision 5, when its trade-off paragraph is read, then it states the
      justification **per kind** and no longer asserts that the vehicle's loss is tolerable *because*
      the flow is user-retryable and a token is already committed. *Verified by:*
      `grep -n "user-retryable" docs/adr/ADR-0011-transactional-email-scaleway-tem.md` → the phrase
      survives only inside the amendment note that quotes it as the **removed** claim, and inside the
      recovery-pair bullet where it is true.
- [ ] **AC-2:** Given the amendment, when a reader asks why the ADR changed, then a dated
      `> **Amended 2026-07-30 (#439).**` blockquote — matching the #371 and #386 convention in the
      same decision — quotes the removed justification, states that the vehicle *choice* was not
      reconsidered, and records why option 2 was rejected. *Verified by:*
      `grep -c "Amended" docs/adr/ADR-0011-transactional-email-scaleway-tem.md` → `3`.
- [ ] **AC-3:** Given the published `MailSender` port, when its contract is read, then the
      "never throws" bullet no longer claims retryability for every flow, and
      `sendOperatorApproved` no longer says it inherits that justification unchanged.
      *Verified by:* reading `notification/api/MailSender.java` — the blanket
      "The flows are user-retryable by design." is gone.
- [ ] **AC-4:** Given a lost operator-approval mail, when the dispatcher logs the loss, then no
      line tells the reader the user must re-request a mail nothing re-sends. *Verified by:*
      `grep -rn "must re-request" platform/src/main` → no hits.
- [ ] **AC-5:** Given the amendment is prose-only, when the notification module's tests run, then
      they are unchanged and green. *Verified by:*
      `gradle test --tests "*AsyncMailDispatcher*" --tests "*TransactionalMailService*" --tests "*MailTransportBudget*"`
      → PASS, with `git diff --stat` showing **no** file under `platform/src/test/` modified except
      one stale comment (`AsyncMailDispatcherTest:298`).

## Non-goals

- **Moving the operator-approval notice to the Event Publication Registry** (option 2). Rejected
  by the maintainer; if the accepted risk ever bites, that is a new issue, not this one.
- **Renaming the `riviera.mail.recovery.*` metric series.** "Recovery" names the *vehicle*; a
  shipped metric name breaks whatever reads it (#375, #415). The `kind` tag stays the discriminator.
- **Any change to which vehicle any mail rides**, to the pools' bounds, or to the drain semantics.
- **Flipping ADR-0011 from Proposed to Accepted** — still gated on #370 (domain + DPA).
- **A general docs-freshness sweep of the mail arc.** Two stale bullets *inside the one runbook
  block this slice edits* are patched (folded in per the #219 lesson); the rest is close-out step 5.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — nothing is retired or replaced. No runtime behaviour changes: the same mails ride the same
vehicles with the same bounds, counters and drain semantics. The only externally visible delta is
the wording of three `WARN`/`ERROR` log lines whose metric increments beside them are untouched
(no test, alert rule, or runbook grep matches the removed clause — verified before editing).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The amendment reads as reopening the **vehicle choice**, inviting a future session to "finish" the move to the registry | med | med | The note states in its own sentence that the choice is pre-authorised by this bullet and epic #367 and was **not** reconsidered, and records option 2 as considered-and-rejected with the reason | Claude | open |
| R-2 | Editing a log-message string silently breaks something that greps for it (an alert rule, a test, a runbook) | low | med | Swept first: `grep -rn "must re-request" platform/src/test docs frontend` → the only hits are one stale test *comment* and one runbook sentence, both in scope. No alert rule or assertion matches | Claude | open |
| R-3 | The scope grows from the four sites the maintainer approved to every prose repetition, turning a docs fix into a sprawling diff | high | low | Bounded by one test — *does this sentence carry the **justification** for accepting the loss, or an on-call instruction?* If yes it is fixed; if it merely describes the vehicle's mechanism, the fix is a clause, not a rewrite. Site list frozen in the File-structure section below (10 sites) and reported in the PR | Claude | open |
| R-4 | The `kind`-tag mitigation the amendment leans on is itself unreliable, making the "accepted" risk worse than recorded | low | high | Not taken on faith: the two counters (`MAIL_RECOVERY_DROPPED` #415/#434, `MAIL_RECOVERY_FAILED` #423) are shipped and tagged `kind="operator-approved"`, and `docs/runbooks/observability.md` already carries that row with its own alert semantics. The amendment cites what exists, promising nothing new | Claude | open |
| R-5 | A reader takes "accepted as the weaker case" as *nobody noticed*, when it is a deliberate, dated call | low | low | The note names the trade explicitly (unrecoverable in the product, mitigated operationally) and names the human in the loop — the admin who approved, who can be told to tell them | Claude | open |

## Open questions / Assumptions

*(none open — both forks were put to the maintainer before planning; see Resolved.)*

### Resolved

- **Which option?** → **Option 1, amend the ADR** (maintainer, `AskUserQuestion`, 2026-07-30). Option 2
  (mint an ids-only `OperatorApproved` event so the notice rides the registry and gains at-least-once)
  was rejected: it reverses epic #367's "the trigger settles it" reasoning for a kind whose loss is
  already *visible* (a tagged counter, volume one per approval) and *remediable* (the approving admin
  is a human already in the loop), and it would buy durability with an event whose only consumer is
  the edge that raised it.
- **How wide?** → **Fix every site carrying the false justification, not only the ADR paragraph**
  (maintainer, same exchange): leaving the port Javadoc saying the operator kind "inherits the
  contract above unchanged" would re-create the exact finding one file over. The grill put the count
  at four; the pre-implementation sweep found **ten** (File structure), including three log lines.
  The extra six are the same defect, so they are in — and called out in the PR rather than slipped in.
- **Is the issue's premise accurate?** → **Confirmed but under-stated.** #439 says "the code and
  runbook already state the asymmetry … the ADR is the one place that still does not." True of
  `TransactionalMailService` and of `observability.md`'s two `kind` rows — but `MailSender`,
  `MailDispatcher`, `AsyncMailDispatcher`, `ObservabilityMetrics` (the `DROPPED` counter, whose own
  sibling `FAILED` states the asymmetry) and `mailer-profile-smoke-test.md` do not. Recorded here
  rather than silently widening the diff.
- **Does anything else claim it?** → Swept `user-retryable`, `best-effort`, `re-request`,
  `self-heal`, `acceptable because` across `docs/`, `CLAUDE.md`, `RESPONSIBILITIES.md`, and
  `platform/src/main`. `CLAUDE.md`'s notification row ("recovery *drops*, having no durable copy")
  is about mechanism and is true for every kind — left alone.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Nothing in scope reads or writes
`availability(set_id, booking_date)`; no booking, beach-map, or claim path is touched. The mail
vehicles sit downstream of the money-path spine and this slice does not change even them.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns `email_suppression` state) | Owns both delivery vehicles and the send chokepoint; four of the ten sites are its files |
| M-2 | `shared` | existing | none (Shared Kernel, #371) | Owns `ObservabilityMetrics`, where the counter's meaning is documented |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `notification.api` | `MailSender` — **contract prose only**; the three method signatures, their parameter types, and the port's module edges are byte-identical | unchanged | the platform root (edge) alone |

**Domain events (id-based payloads, invariant #11)**

N/A — no event is added, removed, or re-routed. That is precisely what option 2 would have done
(a new `OperatorApproved` event published by `operator`) and precisely what was rejected.

### Module ownership (§4a)

No behaviour is added or moved, so there is no ownership question to settle: every edited file
stays in its current module, and the two module boundaries in scope (`notification::api`'s
published contract, `shared`'s kernel doc) keep their existing shape. Checked against
`RESPONSIBILITIES.md` only to confirm the amended prose still describes the right owner — the
`notification` row's "both delivery vehicles per ADR-0011 decision 5" remains accurate.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves; no charge, refund, commission, or ledger row is read
or written. (The mail pools are kept *off* the money-path executor — invariants #8/#9, #383 — and
this slice does not touch that separation, only the prose explaining it.)

## Angular — frontend surfaces touched

N/A — backend-only. No file under `frontend/` is touched, so no e2e spec is due (RV-FE-E2E).

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, status code, or wire shape is touched.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `plan → implement (phase 1 next)`

**Next action:** Phase 1 — rewrite ADR-0011 decision 5's trade-off paragraph per-kind and append
the dated amendment note; then phase 2 (the six code sites), phase 3 (the two runbooks).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan (grill, maintainer decision, this doc) | ⏳ | |
| 1 — the ADR amendment | | |
| 2 — the code sites (`notification` + `shared`) | | |
| 3 — the runbook sites (+ two stale interim bullets) | | |
| 4 — close-out (AC verification, this section) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(no gate has run yet)* | — |

---

## File structure

> The frozen site list (R-3). Ten sites, grouped by why each is in.

**The recorded decision (the issue's own AC):**

- `docs/adr/ADR-0011-transactional-email-scaleway-tem.md` — decision 5's trade-off paragraph
  rewritten per-kind + a dated amendment note.

**Sites where the false claim *is* the justification:**

- `platform/src/main/java/ai/riviera/platform/notification/api/MailSender.java` — the published
  port's "never throws" bullet ("The flows are user-retryable by design.") and
  `sendOperatorApproved`'s "inherits the contract above unchanged".
- `platform/src/main/java/ai/riviera/platform/notification/application/MailDispatcher.java` — the
  seam's "Losing a send to a crash is acceptable precisely because the flow is user-retryable."
- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java` —
  the bounding rationale "(the user can re-request)".
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` —
  `MAIL_RECOVERY_DROPPED`'s "Read an increment as exactly that: one person who asked for a reset or
  verification link", which its own sibling `MAIL_RECOVERY_FAILED` already contradicts.

**Operational output an on-call reader acts on:**

- `AsyncMailDispatcher` ×3 log lines (shutdown drop, saturation drop, abandoned-at-shutdown) — each
  ends "the user must re-request", emitted for every kind. The `Recovery email …` prefix **stays**:
  that is the vehicle's shipped name (#375, #415).
- `docs/runbooks/mailer-profile-smoke-test.md` — the activation warning "a send is best-effort (…
  the user re-requests)". Plus, folded in per the #219 lesson, two stale bullets in the same
  *Known interim limits* block: booking-confirmation mail (#371) and the operator-approval notice
  (#375) have shipped, and suppression enforcement exists (V32–V35) while only its bounce **feed**
  (#372) is still pending.
- `docs/runbooks/observability.md` — the drain-window paragraph's "For the recovery vehicle it is a
  lost mail the user must re-request", which under this repo's own "recovery names the vehicle"
  convention covers the approval notice too.

**Mechanism descriptions — a clause, not a rewrite:**

- `platform/src/main/java/ai/riviera/platform/notification/application/MailTransportBudget.java`
  and `platform/src/main/java/ai/riviera/platform/notification/adapter/in/RegistryMailExecutorConfig.java`
  — each contrasts the two pools' durability and trails off into "the user re-requests".
- `platform/src/test/java/ai/riviera/platform/notification/application/AsyncMailDispatcherTest.java:298`
  — a stale Javadoc *comment* on a test whose assertions are untouched.

---

## Phase 1 — The ADR amendment

**Files:** Modify `docs/adr/ADR-0011-transactional-email-scaleway-tem.md:101-111`

- [ ] **Step 1:** Rewrite the trade-off paragraph as a per-kind statement — the loss modes, then
      the recovery pair (self-heals: token committed, user re-requests) and the operator-approval
      notice (unrecoverable; mitigated only by the tagged counters and the runbook's manual remedy).
      Keep the two clauses that are still true and load-bearing: the pool is **not**
      `applicationTaskExecutor`, and the known residual (the synchronous token insert).
- [ ] **Step 2:** Append `> **Amended 2026-07-30 (#439).**` quoting the removed justification,
      stating that the vehicle choice was **not** reconsidered, and recording option 2 as
      considered-and-rejected — the #371/#386 convention.
- [ ] **Step 3:** Verify AC-1 + AC-2 — `grep -n "user-retryable"` and `grep -c "Amended"`.
- [ ] **Step 4: Commit** — `git commit -m "docs(#439): make ADR-0011's accepted mail loss per-kind (#439)"`
- [ ] **Step 5:** Update this Execution status in the same commit window.

## Phase 2 — The code sites

**Files:** Modify `notification/api/MailSender.java` · `notification/application/MailDispatcher.java` ·
`notification/application/AsyncMailDispatcher.java` (Javadoc + 3 log strings) ·
`notification/application/MailTransportBudget.java` ·
`notification/adapter/in/RegistryMailExecutorConfig.java` · `shared/ObservabilityMetrics.java` ·
`notification/application/AsyncMailDispatcherTest.java` (comment only)

> No failing test opens this phase, and that is deliberate rather than a skipped red step: there is
> no behaviour to drive out. The `tdd` loop applies to the *behaviour* these files describe, which
> #375/#415/#423/#434 already pinned — so this phase's discipline is the inverse, **prove the tests
> did not move**: `git diff --stat` shows no assertion touched, and Step 3 re-runs them green.

- [ ] **Step 1:** Edit each site to state the cost per kind. Justification sites get the full
      clause; mechanism sites get a short one. Never remove the `Recovery email` log prefix or
      the metric names — the vehicle keeps its shipped names.
- [ ] **Step 2:** Verify AC-3 + AC-4 — `grep -rn "must re-request" platform/src/main` → empty;
      `grep -rn "user-retryable" platform/src/main` → only where scoped to the recovery pair.
- [ ] **Step 3:** Run the touched module's tests (AC-5) —
      `gradle test --tests "*AsyncMailDispatcher*" --tests "*TransactionalMailService*" --tests "*MailTransportBudget*"`
      per `riviera-local-debug` (system `gradle`, scoped; never the bare `test` task).
- [ ] **Step 4: Commit** — `git commit -m "docs(#439): state the per-kind mail loss cost where the code claims it (#439)"`
- [ ] **Step 5:** Push, open the **draft PR** (CI fires on `pull_request` only — #417), update this section.

## Phase 3 — The runbook sites

**Files:** Modify `docs/runbooks/mailer-profile-smoke-test.md` · `docs/runbooks/observability.md`

- [ ] **Step 1:** Amend the activation warning and the drain-window paragraph to name the
      asymmetry, pointing at `observability.md`'s `kind="operator-approved"` row rather than
      restating it.
- [ ] **Step 2:** Patch the two stale *Known interim limits* bullets in the same block (#219 lesson).
- [ ] **Step 3: Commit** — `git commit -m "docs(#439): reconcile the mail runbooks with the per-kind loss (#439)"`
- [ ] **Step 4:** Update this section.

## Phase 4 — Close-out

- [ ] **Step 1:** Merge latest `origin/main`; mark the PR ready for review.
- [ ] **Step 2:** Review gate (`/code-review` per the `pr-gates.md` §1 ladder + `riviera-review-overlay`).
- [ ] **Step 3:** Sonar gate — pull the new-issue + duplication list, not just the gate verdict.
- [ ] **Step 4:** Finalize this section **in this PR's last commit**, citing `merged via PR #NN`,
      never a merge SHA (#326/#346/#351 case history).
- [ ] **Step 5:** Merge; close #439; tick epic #367; `riviera-docs-freshness` over the merge span.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | Phase 0 (plan) — the issue named one site; a repeated *justification* is exactly the pattern that spreads by copy | Any claim that the in-memory vehicle's loss is acceptable *because* the flow is retryable / a token is committed | `grep -rn "user-retryable\|best-effort\|re-request\|self-heal\|acceptable because" docs/ CLAUDE.md RESPONSIBILITIES.md platform/src/main` | **10** (1 ADR, 6 Java, 2 runbook, 1 test comment) — vs the 1 in the issue and the 4 in the grill | Fix all 10. Bounded by R-3's test (justification/instruction → clause; mechanism → short clause). `CLAUDE.md`'s "having no durable copy" is mechanism-true for every kind → left |
| 2026-07-30 | Phase 0 (plan) — second pass, after the first found the claim in Javadoc | Would the same false claim reach a reader through **runtime** output, not just source? | `grep -rn "must re-request" platform/src/main platform/src/test docs frontend` | 3 log strings (emitted for every kind), 1 test comment, 1 runbook line | All four added to the phase-2/3 site list; swept for assertions and alert rules first, none matched (R-2) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `grep -n "user-retryable" docs/adr/ADR-0011-transactional-email-scaleway-tem.md` →
      the phrase appears only in the amendment note (as the removed claim) and in the recovery-pair
      bullet. Verified at commit `<sha>`.
- [ ] **AC-2:** `grep -c "Amended" docs/adr/ADR-0011-transactional-email-scaleway-tem.md` → `3`.
      Verified at commit `<sha>`.
- [ ] **AC-3:** Read `notification/api/MailSender.java` → no blanket retryability claim; the
      operator-approval method states what it does **not** inherit. Verified at commit `<sha>`.
- [ ] **AC-4:** `grep -rn "must re-request" platform/src/main` → no hits. Verified at commit `<sha>`.
- [ ] **AC-5:** `gradle test --tests "*AsyncMailDispatcher*" --tests "*TransactionalMailService*" --tests "*MailTransportBudget*"`
      → PASS; `git diff --stat origin/main...HEAD -- platform/src/test` → one comment line.
      Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying command (no test class — see the ACs' preamble).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases — **nothing** signature-level changes.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified N/A (no availability write path in scope) (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no import changes; no event added or re-routed (invariant #11).
- [ ] **Payment/payout** N/A; the mail pools stay off the money-path executor (invariants #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] **Booking codes / bearer credentials** (invariant #7): no edited log line gains an address or
      a link, and the bearer-credential argument for the vehicle split is preserved verbatim.
- [ ] No schema change, so no Flyway migration (invariant #12) — and no `V<n>` claimed, so no
      collision with the open PR #438.
- [ ] **Frontend** N/A — no file under `frontend/`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`, so no docs-only follow-up PR.
- [ ] **The review gate ran in full** — the `pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
