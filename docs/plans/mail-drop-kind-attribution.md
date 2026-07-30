# Mail-drop kind attribution Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `riviera.mail.recovery.dropped` names the flow it lost on **all three** of its
`reason`s, so the `dropped` series answers "who" exactly as its `failed` sibling already does
and ADR-0011 decision 5's "only in part" mitigation clause stops being true.

**Architecture:** Option 1 of issue #442, chosen by the maintainer: **widen the dispatch seam**
rather than record the gap as accepted. `MailDispatcher.dispatch(Runnable)` becomes
`dispatch(MailKind, Runnable)` — the kind is already in hand at the one production call site
(`TransactionalMailService.dispatchQuietly`), and the seam is module-internal and package-private,
so no published surface, no `allowedDependencies` grant and no ADR-0007 shape changes. The single
non-obvious part is the **`abandoned`** reason: it is raised while draining the queue at shutdown,
not while observing a send, so the kind has to travel *into* the queue and be readable back out of
the `MdcTaskDecorator` wrapper the pool puts around every task.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue **#442** (the design question PR #440's review gate deliberately
left out of that docs slice); epic **#367**. The decision it makes true is
`docs/adr/ADR-0011-transactional-email-scaleway-tem.md` decision 5, as amended by #439.

**Skills consulted:** `riviera-sdlc` (routing + the intake grill gate; caught the PR #443 overlap
in `docs/runbooks/observability.md` and the draft-PR-before-CI ordering) · `riviera-plan-doc` (this
doc) · `riviera-modulith` (placement: `MailKind` is module-internal, so it belongs in
`notification.application` beside the existing `SuppressionReason`/`MailOutboxStatus` — **not** in a
published `vocabulary/` surface, which the module does not have and does not need, since no kind
ever crosses the module edge; `PackageShapeArchitectureTests` constrains top-level package names
only, so no new package is created) · `riviera-java-conventions` (§2 + §6a turned the planned
`dispatch(String kind, …)` into a typed `MailKind` enum — the two loss counters must not be able to
drift into two `kind` vocabularies, which is the same defect class #442 exists to close; §6c keeps
the rationale in Javadoc rather than inline) · `codebase-design` (the seam: `dispatch` was
under-specified for the accounting responsibility the dispatcher already holds — widening it is
fixing an interface that does not carry what its implementation needs, not scope creep) ·
`domain-modeling` (ADR discipline: amend decision 5's text **and** append a dated blockquote quoting
the removed claim — the in-file convention set by the #371/#386/#439 amendments; no new ADR, since
this reverses nothing hard-to-reverse) · `riviera-local-debug` (cloud test recipe: system `gradle`
+ registered JDK-25 toolchain, scoped `--tests` only, never the bare `test` task) ·
`riviera-review-overlay` (review gate). **Not loaded, deliberately:** `postgres` (no migration,
no SQL), `riviera-stripe-payments` (no money), `riviera-frontend` / `angular-developer` /
`playwright-cli` (no frontend surface — the metric is scraped, not rendered).

**Branch:** `claude/sdlc-442-m2haug` — the cloud session's designated branch, standing in for
`feature/mail-drop-kind-attribution` (`riviera-sdlc` §Remote/cloud session addendum). Cut from
`main` at `8b25c00`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a saturated dispatcher, when a send of a known kind is refused, then
      `riviera.mail.recovery.dropped` increments under **that kind** and `reason="saturated"`, and
      not under any other kind. *Pinned by:*
      `AsyncMailDispatcherTest.aSaturatedDropNamesTheFlowItLost`
- [ ] **AC-2:** Given a dispatcher that has already shut down, when a send of a known kind is
      refused, then the counter increments under that kind and `reason="shutdown"`. *Pinned by:*
      `AsyncMailDispatcherTest.aDropDuringShutdownIsCountedButAttributedToTheShutdown`
- [ ] **AC-3:** Given sends of **two different kinds** still queued when the drain window expires,
      when the context closes, then each increments the counter under **its own** kind and
      `reason="abandoned"` — the drain path attributes as precisely as the two rejection paths.
      *Pinned by:* `AsyncMailDispatcherTest.anAbandonedSendNamesTheFlowItLost`
- [ ] **AC-4:** Given drops across several kinds and reasons, when the whole series is summed
      without a tag filter, then the total equals the number of sends the pool never ran — adding
      the dimension partitions the series, it does not double-count it. *Pinned by:*
      `AsyncMailDispatcherTest.countsEveryDropUnderTheOneMetricName`
- [ ] **AC-5:** Given both in-memory-vehicle loss counters, when their `kind` tag values are
      compared, then they come from the same `MailKind` vocabulary — a kind cannot be spelled one
      way on `dropped` and another on `failed`. *Pinned by:*
      `MailKindTest.bothLossCountersShareOneKindVocabulary`
- [ ] **AC-6:** Given the shipped tag values, when `MailKind` is read, then they are exactly
      `verification`, `password-reset` and `operator-approved` — renaming one would break every
      dashboard and alert that already reads `riviera.mail.recovery.failed`. *Pinned by:*
      `MailKindTest.theShippedTagValuesAreStable`
- [ ] **AC-7:** Given `TransactionalMailService` dispatches a send, when the dispatcher receives it,
      then it receives the kind alongside it — the service cannot dispatch a send it has not
      attributed. *Pinned by:* `TransactionalMailServiceTest.everyDispatchedSendCarriesItsKind`
- [ ] **AC-8:** Given ADR-0011 decision 5 and `docs/runbooks/observability.md`, when the `dropped`
      series' attribution is read, then no sentence claims the kind is absent or structurally
      impossible, and decision 5's "only **in part**" clause is amended. *Verified by:*
      `grep -rn "reason. alone\|no .kind.\|only \*\*in part\*\*" docs/ platform/src/main` returning
      no stale claim (step-by-step commands in Phase 2).

## Non-goals

- **Naming the *person* in the metric.** The tag says which flow was lost, never whose mail —
  invariant #7 keeps the address and the tokenized link out of metrics and logs alike. A dropped
  `operator-approved` notice still needs the approval log to name the operator; what this slice
  buys is *knowing to go and look*, and not looking when a password reset was what was lost.
- **Touching `riviera.mail.registry.shed`.** The registry vehicle carries exactly one kind (the
  booking confirmation), so a `kind` tag there would be a constant.
- **Renaming any metric.** `riviera.mail.recovery.*` keeps its name; "recovery" names the vehicle,
  not the flow, and a shipped name is load-bearing for whatever reads it.
- **Re-opening the vehicle choice.** Moving the operator-approval notice to the Event Publication
  Registry was considered and rejected by the maintainer in #439; this slice mitigates the accepted
  loss, it does not re-litigate it.
- **Alerting rules.** The runbook gains the new dimension's reading; no alert route changes (that
  route is still `MoneyPathAlertCheck` → `ERROR` log, and it does not read this counter).

## Behavior-parity ledger

> Filled rather than `N/A`: a shipped metric series **is** a consumed surface, and adding a tag to
> one changes what existing queries return. Every row below is checked by an AC.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `riviera_mail_recovery_dropped_total` is one series per `reason`, three in total | **changed** | now one series per `(kind, reason)`, nine in total. An unaggregated query returns 3 rows where it returned 1 — the documented consequence of the fix, called out in the runbook (Phase 2) |
| A `reason`-filtered query (`{reason="saturated"}`) returns the saturation count | **preserved** | still matches; Prometheus filters ignore un-named dimensions. AC-4 pins that the unfiltered total is unchanged |
| All three `reason` series exist at 0 from boot (counters pre-registered in the constructor) | **preserved** | all nine are pre-registered the same way, so a never-fired series is still queryable rather than absent |
| `reason` tag values `saturated` / `shutdown` / `abandoned` | **preserved** | untouched; only a dimension is added beside them |
| One log line per drop, `ERROR` for `saturated` and `WARN` for the two redeploy reasons | **preserved** | levels unchanged; each line now also names the kind, which is the whole point |
| The abandoned line borrows the discarded send's MDC (correlation id) | **preserved** | `MdcTaskDecorator.inContextOf` still supplies it; the kind is read from the same wrapper, not instead of it |
| Drop lines carry neither address nor link (invariant #7) | **preserved** | the kind is a flow name (`password-reset`), not PII. Pinned by the existing `theDropLineCarriesNeitherAddressNorLink` |
| The send caught **running** at drain expiry is deliberately in no counter | **preserved** | untouched — it may already have reached the relay. Pinned by the existing `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` |
| `MailDispatcher` never throws at its caller (D-8 / the timing oracle) | **preserved** | the widened signature changes what is passed, not the contract |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Only the two `execute()` rejections get the tag and the drain path is missed — a `kind`-filtered query then **silently under-counts**, which is a worse defect than today's honest absence | med | high | AC-3 asserts two *different* kinds through the drain path specifically; AC-4 asserts the unfiltered total still equals every send the pool never ran, so a missed path shows up as a mismatch | Claude | **closed** — `anAbandonedSendNamesTheFlowItLost` green; the risk also produced the phase merge recorded under Execution status, since the half-tagged intermediate was itself the hazard |
| R-2 | A tag value is spelled differently from the shipped `failed` series (`password_reset` vs `password-reset`), breaking dashboards while every test still passes | low | high | One `MailKind` vocabulary for both emitters (AC-5) + AC-6 pinning the three literals against the runbook's documented values | Claude | open |
| R-3 | A drained queue element that is not one of ours reaches the accounting and is silently uncounted — the same silent-loss class the counter exists to end | low | med | `dispatch(...)` is the only path onto this queue, so the branch is unreachable by construction; it is nonetheless handled explicitly (an `ERROR` naming the defect, never a swallow) and pinned by AC-3's drain assertions. **No new tag value is invented for it** — polluting a documented vocabulary for an unreachable state is how the next runbook sentence becomes false | Claude | **closed** — implemented as specified in `recordAbandonment`; the record deconstruction pattern makes the guard total |
| R-4 | `MdcTaskDecorator` gains a payload accessor and something reads the *context* out of it, defeating the "reachable only through `inContextOf`" property its Javadoc asserts | low | med | The accessor returns the wrapped task only; the context map stays private to the record. Reviewed under RV-BE-11 | Claude | **closed** — `payloadOf` returns `ContextCarryingTask#task()` and nothing else; the map stays unreachable |
| R-5 | ~~Merge conflict~~ **resolved**: PR #443, which is open against `docs/runbooks/observability.md` — the same file Phase 2 edits | **high** | low | #443 merged at `7057b49` before Phase 2 began; `git merge origin/main` was clean (its 16 added lines are elsewhere in the file). Phase 2 then rewrote **both** sentences #443 had rated "accurate only while #442 is open" | Claude | **closed** — merged clean, both sentences owned and corrected |
| R-6 | The widened seam is treated as a published-surface change and trips `ModularityTests` / `PublishedSurfacePlacementArchitectureTests` | low | low | Everything stays package-private inside `notification.application`; the published `MailSender` port keeps its per-kind methods and is untouched. Structural net run at the end of Phase 1 | Claude | **closed** — full structural net green (211 tests, 0 failures, 0 skipped) |
| R-7 | Boot-time meter pre-registration grows from 3 counters to 9 and someone reads the extra series as new failures | low | low | All nine are zero until they fire, exactly as the three were; the runbook's tag table gains the kind rows so a reader meets them documented | Claude | **closed** — the runbook's tag table now carries the kind rows and states the partition-not-double-count consequence explicitly |

## Open questions / Assumptions

- **Assumption:** dashboards/alerts read `riviera_mail_recovery_dropped_total` either unfiltered or
  filtered by `reason`, never by an exact full tag-set match. An exact-match query would break when
  a dimension is added. Nothing in the repo pins such a query (the alert route is
  `MoneyPathAlertCheck`, which does not read this counter), and no external dashboard is in-repo. —
  *Owner:* Claude · *Resolves by:* Phase 2 (the runbook states the change explicitly, which is the
  available notice)
### Resolved

- **Assumption (resolved):** #443 merges before this PR is marked ready for review. It merged at
  `7057b49`; `git merge origin/main` was clean and Phase 2 rewrote both of the sentences its review
  had rated accurate only while #442 stayed open.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No booking, no `(set, date)` row, no beach map: the slice
changes an observability tag on a mail-dispatch pool. The one concurrency property in scope is
pre-existing and preserved — `drainTo` and the drainer thread's `poll` hand each queued task to
exactly one of them, so an abandoned send is *run xor counted*, never both and never neither
(argued on `accountForAbandonedSends`, pinned by
`aSendStillQueuedWhenTheDrainWindowExpiresIsCountedAsAbandoned` and its `aSendThatDrainsInsideTheWindow…`
twin).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state, no aggregate) | It owns transactional-mail **delivery**, both vehicles, and the loss accounting for each (`RESPONSIBILITIES.md` → `notification` Job). The dispatcher, its counters and the kind vocabulary are all inside it |
| M-2 | `shared` | existing | (none — OPEN Shared Kernel) | `ObservabilityMetrics.MAIL_RECOVERY_DROPPED`'s Javadoc is edited; the constant, its name and its value are unchanged. No new type, no new dependency |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `notification.api` | `MailSender` — **unchanged**, listed to record that it is *not* touched | — | the root (composition root) |

`MailDispatcher` is **not** a published port: it is a package-private application-internal seam
(RV-BE-11), which is exactly why widening it costs no grant. `MailKind` is package-private beside
it — no kind name crosses the module edge, because `MailSender` publishes one method per kind.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published, consumed, moved or renamed.` No Flyway `event_type` rewrite.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Attribute an undispatched/undrained mail to its flow (`kind` on `MAIL_RECOVERY_DROPPED`) | `notification` | `notification` Job: owns both delivery vehicles **and** their loss accounting — `MAIL_RECOVERY_DROPPED`, `MAIL_RECOVERY_FAILED`, `MAIL_REGISTRY_SHED`, `MAIL_CONFIRMATION_ABANDONED` are all named as its own. No other module's Not-My-Job list claims mail observability, and no other module learns a kind |
| The `MailKind` vocabulary (three flow names, shared by both loss counters) | `notification` | Same Job clause. Deliberately **not** in `shared`: the kernel admits no module-owned vocabulary, and nothing outside `notification` names a kind |

All in `notification`, one Javadoc edit in `shared`; no cross-module interaction added.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; no ledger entry, refund, commission or Stripe call is
read or written.

## Angular — frontend surfaces touched

`N/A — backend-only.` The metric is scraped from the actuator endpoint; nothing renders it.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is added or altered.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting.

**Stage pointer:** `implement — all phases done; next is the PR gates (ready for review → review → sonar)`

**Next action:** Mark PR #444 ready for review, then run the review gate per `pr-gates.md` §1.

> **Phases 0 and 1 were merged into one commit, deliberately** — a correction to this plan made at
> the keyboard, recorded here rather than silently. As planned, Phase 0 would have tagged the two
> rejection reasons while leaving `abandoned` un-tagged until Phase 1. That intermediate state puts
> **inconsistent label sets on one meter name**, which `SimpleMeterRegistry` tolerates but a
> Prometheus registry rejects at scrape time — so the branch would have carried a commit whose CI
> could fail for a reason unrelated to either phase's intent. The TDD discipline the split existed
> to buy was kept in full: AC-3's drain-path spec was written red alongside the rest, before any
> implementation.

| Phase | Status | Commits |
|-------|--------|---------|
| 0+1 — The seam, both rejection paths, and the drain path | ✅ | `307441c` |
| 2 — Docs: ADR amendment, runbooks, Javadoc sweep | ✅ | `c99b988` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/notification/application/MailKind.java` — **new**,
  package-private enum: the three flow names and the `kind` tag key, shared by both loss counters.
- `platform/src/main/java/ai/riviera/platform/notification/application/MailDispatcher.java` — the
  widened seam (`dispatch(MailKind, Runnable)`); Javadoc's "never learns the kind" reasoning goes.
- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java` —
  nine pre-registered counters, kind-aware drop/abandon accounting, the queued `KindedSend`.
- `platform/src/main/java/ai/riviera/platform/notification/application/MdcTaskDecorator.java` — a
  narrow payload accessor so the drain can read the queued task back out of the wrapper.
- `platform/src/main/java/ai/riviera/platform/notification/application/TransactionalMailService.java` —
  passes the kind to `dispatch`; its three `KIND_*` string constants become `MailKind`.
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — Javadoc only.
- `platform/src/main/java/ai/riviera/platform/notification/api/MailSender.java` — Javadoc only (the
  `#442` forward-reference at line 56).
- `platform/src/test/java/ai/riviera/platform/notification/application/AsyncMailDispatcherTest.java`,
  `TransactionalMailServiceTest.java`, `SynchronousMailDispatch.java` — updated to the new seam.
- `platform/src/test/java/ai/riviera/platform/notification/application/MailKindTest.java` — **new**,
  the one-vocabulary and stable-literals pins (AC-5, AC-6).
- `docs/adr/ADR-0011-transactional-email-scaleway-tem.md`, `docs/runbooks/observability.md`,
  `docs/runbooks/mailer-profile-smoke-test.md`, `RESPONSIBILITIES.md`, `CLAUDE.md` — Phase 2.

---

## Phase 0 — The seam + the two rejection paths

**Files:** Create `MailKind.java`, `MailKindTest.java` · Modify `MailDispatcher.java`,
`AsyncMailDispatcher.java`, `TransactionalMailService.java`, `AsyncMailDispatcherTest.java`,
`TransactionalMailServiceTest.java`, `SynchronousMailDispatch.java`

- [ ] **Step 1: Write the failing tests** — AC-1, AC-2, AC-5, AC-6, AC-7. The saturation and
      shutdown specs move from `droppedFor(reason)` to `droppedFor(kind, reason)`; the existing
      `everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss`, `theDropLineCarriesNeitherAddressNorLink`
      and `countsEveryDropUnderTheOneMetricName` are re-pointed at the widened seam unchanged in
      intent (behavior-parity ledger rows 5, 7 and 2).
- [ ] **Step 2: Run them, verify they fail** — `gradle test --tests "*AsyncMailDispatcherTest*"
      --tests "*MailKindTest*"` → FAIL (does not compile: `dispatch` takes one argument).
- [ ] **Step 3: Minimal implementation** — the `MailKind` enum; the widened `dispatch`; the
      `EnumMap`-backed counters pre-registered per reason; `TransactionalMailService` passing its
      kind through.
- [ ] **Step 4: Run them, verify they pass** — same command → PASS. Then broaden to the module:
      `gradle test --tests "*notification*"`.
- [ ] **Step 5: Generalization-audit pass** — search for every other place a mail `kind` is spelled
      as a bare string, and for any *other* counter on these vehicles whose tag set was written from
      prose rather than from its construction site (the standing pattern recorded on #440's plan,
      F-5). Append to the log.
- [ ] **Step 6: Commit** — `git commit -m "feat(#442): attribute a refused recovery mail to its flow (#442)"`
- [ ] **Step 7: Push and open the draft PR immediately** — CI fires on `pull_request` only, so a
      branch with no PR gets no CI at all (`riviera-sdlc` rule 3, #417).
- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The abandoned path

**Files:** Modify `AsyncMailDispatcher.java`, `MdcTaskDecorator.java`, `AsyncMailDispatcherTest.java`

> **Why this is its own phase.** The two rejection paths learn the kind from the `dispatch` call
> that is happening right then; this one has to read it back off a task queued minutes earlier and
> wrapped by the pool's `MdcTaskDecorator`. It is the path #442's acceptance criteria call out by
> name, and R-1 says a half-tagged series is worse than an untagged one — so it gets its own red
> test before any of it is written.

- [ ] **Step 1: Write the failing test** — AC-3: wedge the drainer, queue sends of **two different
      kinds**, let the drain window expire, assert each kind's `abandoned` counter is exactly its own
      count. Extend `countsEveryDropUnderTheOneMetricName` (AC-4) to span all three reasons and more
      than one kind.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*AsyncMailDispatcherTest*"` → FAIL
      (the abandoned counter cannot name a kind).
- [ ] **Step 3: Minimal implementation** — queue a `KindedSend(MailKind, Runnable)`; add the narrow
      payload accessor to `MdcTaskDecorator` so the drain can unwrap; attribute each abandonment and
      carry the kind into its log line. The unreachable non-`KindedSend` branch is handled
      explicitly per R-3, never swallowed, and invents no tag value.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS. Then the module and the structural
      net: `gradle test --tests "*notification*" --tests "*ModularityTests*"
      --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"
      --tests "*PublishedSurfacePlacementArchitectureTests*"` (R-6).
- [ ] **Step 5: Generalization-audit pass** — does any other accounting path read a queued/wrapped
      task and lose information doing it? Check the registry pool's shed policy. Append to the log.
- [ ] **Step 6: Commit** — `git commit -m "feat(#442): attribute a mail abandoned at shutdown to its flow (#442)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Docs: ADR amendment, runbooks, Javadoc sweep

**Files:** Modify `ADR-0011-transactional-email-scaleway-tem.md`, `docs/runbooks/observability.md`,
`docs/runbooks/mailer-profile-smoke-test.md`, `RESPONSIBILITIES.md`, `CLAUDE.md`,
`ObservabilityMetrics.java`, `MailSender.java`, `AsyncMailDispatcher.java`, `MailDispatcher.java`,
`TransactionalMailService.java`

> **Merge `origin/main` first** (R-5) — PR #443 rewrites parts of `observability.md`, and two of the
> sentences this phase owns are the ones it rated "accurate only while #442 is open".

- [ ] **Step 1: ADR-0011 decision 5** — the "only **in part**" clause and the "cannot carry the
      kind, because it is raised by the dispatcher, whose interface is `dispatch(Runnable)`"
      sentence are now false. Rewrite the bullet to state that both counters attribute, and append a
      dated `> **Amended 2026-07-30 (#442).**` blockquote **quoting the removed claim** (the
      #371/#386/#439 convention) so the history stays legible.
- [ ] **Step 2: `docs/runbooks/observability.md`** — the `dropped` section's blockquote (the "On
      THIS series nothing does" correction #440 shipped) is replaced by the true statement; the tag
      table gains `kind` rows mirroring the `failed` table's; the shutdown section's "this counter
      cannot tell you" sentence is corrected. State the behavior-parity consequence: an unaggregated
      query now returns one row per kind.
- [ ] **Step 3: `docs/runbooks/mailer-profile-smoke-test.md:130`** — "carries **no `kind`**" is now
      false.
- [ ] **Step 4: Javadoc sweep** — `ObservabilityMetrics.MAIL_RECOVERY_DROPPED` (the "cannot, since
      it is raised by `AsyncMailDispatcher`" paragraph), `AsyncMailDispatcher`'s class Javadoc and
      `recordDrop`'s, `MailDispatcher`, `TransactionalMailService`, `MailSender:56`. Every one of
      these currently *argues* the gap; each must now describe what ships.
- [ ] **Step 5: `RESPONSIBILITIES.md` + `CLAUDE.md`** — both describe `MAIL_RECOVERY_FAILED` as the
      `kind`-tagged one by contrast. Reconcile the `notification` Job paragraph and the module-table
      row.
- [ ] **Step 6: Verify no stale claim survives** — `grep -rn "never learns the kind\|carries \`reason\` alone\|no \`kind\`\|only \*\*in part\*\*" docs/ platform/src/main RESPONSIBILITIES.md CLAUDE.md`
      → only amendment blockquotes quoting the old text may match.
- [ ] **Step 7: Commit** — `git commit -m "docs(#442): state the drop path's attribution where the repo claimed it was impossible (#442)"`
- [ ] **Step 8: Update plan-doc execution status**; mark the PR ready for review.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | Phase 0+1 — a new typed vocabulary replaced three loose string constants | Any other place a mail kind is spelled as a bare string, which would re-open the drift `MailKind` exists to prevent | `grep -rn '"verification"\|"password-reset"\|"operator-approved"' platform/src/main --include=*.java` | 3 — all inside `MailKind` itself, plus one Javadoc mention in `MailSender` | Fix all: the enum is the single source, and the Javadoc line is rewritten in Phase 2 |
| 2026-07-30 | Phase 0+1 — the slice's premise is "a counter documented as carrying a tag it does not carry" | Every other counter's tag set, read at its **construction site** rather than from prose about it (the standing pattern from PRs #427/#430/#436, recorded on #440's plan as F-5) | `grep -rn "meters.counter(" platform/src/main --include=*.java` | 6 — `MAIL_CONFIRMATION_ABANDONED` (`reason` only), `MAIL_REGISTRY_SHED` (untagged), `MAIL_RECOVERY_FAILED`, `MAIL_RECOVERY_DROPPED`, `REFUNDS_FAILED` ×2 (untagged) | **Skip — no sibling has the defect.** The two registry-vehicle counters carry exactly one kind by construction (the booking confirmation), so a `kind` tag there would be a constant, and both are documented that way. Checked, not assumed: `docs/runbooks/observability.md`'s shed row and the `no-booking`/`no-set`/`no-contact` vocabulary both match their call sites |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** Run `gradle test --tests "*AsyncMailDispatcherTest*"` → PASS.
- [ ] **AC-5, AC-6:** Run `gradle test --tests "*MailKindTest*"` → PASS.
- [ ] **AC-7:** Run `gradle test --tests "*TransactionalMailServiceTest*"` → PASS.
- [ ] **AC-8:** Run the Phase 2 step-6 grep → no stale claim outside an amendment blockquote.
- [ ] **Structural net:** `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A); no `(set, date)` write path touched (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking surface.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; nothing new published (invariant #11).
- [ ] **Payment/payout** section filled (N/A — no money in scope) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — N/A.
- [ ] **Booking codes unguessable (invariant #7)** — and the new tag carries a flow name, never an address or a tokenized link; the existing PII assertion still passes.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
