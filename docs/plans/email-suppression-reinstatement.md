# MANUAL reinstatement path for the email-suppression list — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A platform admin can lift a suppression on a recovered address — `isSuppressed`
returns `false` afterwards, a later bounce cleanly re-suppresses, no row is ever deleted, and
the action is audit-logged with technical data only.

**Architecture:** Reinstatement is a **state flag on the existing row** (`reinstated_at
TIMESTAMPTZ NULL`, V35), not a `DELETE`. That is the single significant decision: it keeps
ADR-0012's "durable deliverability record" contract literally true (the amendment becomes *"a row
may be marked reinstated"*, not *"rows may vanish"*), preserves `first_suppressed_at` / `reason`
across a reinstate→re-bounce cycle so a reinstatement loop is visible to ops, and makes
re-suppression the **existing** `ON CONFLICT` upsert plus one `SET reinstated_at = NULL`. The
surface is a driving adapter **inside `notification`** (the `payout/adapter/in` precedent), so the
module's published surface stays exactly one port (`MailSender`) — the fact `RESPONSIBILITIES.md`
asserts.

**Persistence:** JDBC only (invariant #1). Touches `email_suppression` (V32→V33→V34) via new
migration **V35**; `JdbcEmailSuppressions` is the only writer.

**Source of intent:** GitHub issue **#391**; contract context in
[ADR-0012](../adr/ADR-0012-email-suppression-hashed-key.md) and
[ADR-0011](../adr/ADR-0011-transactional-email-scaleway-tem.md) decision 5/7. Sibling slices:
#382/#385 (the list), #388/#392 (hashing), #386/#396 (hardening).

**Skills consulted:**
- `riviera-sdlc` — drove the loop; its issue-intake gate surfaced the runbook drift (below) and the #367 feed interaction.
- `riviera-plan-doc` — this document's structure; forced the Module-ownership table and the risk register.
- `riviera-modulith` — settled controller placement (`adapter/in`, not the root) and killed a would-be `notification::api` port: one consumer, same module, so no `api/` surface is earned.
- `postgres` — nullable-column ALTER over a table rewrite; **no new index** (the `UNIQUE (email_key)` lookup already returns one row, `reinstated_at` is a post-filter); `TIMESTAMPTZ` per invariant #6.
- `riviera-java-conventions` — sealed `ReinstateOutcome` + records over exceptions (§6), driving-port interface so `@WebMvcTest` can stub it, and §10 caught the **log-injection** risk in logging `domain` (see R-7).
- `codebase-design` — the deletion test kept `reinstate` **on** `EmailSuppressions` (same purposeful conversation, Cockburn's "few ports") instead of minting a second repository port.
- `domain-modeling` — flagged that `reinstate` is already taken by the operator lifecycle (#128, `ACTIVE⇄SUSPENDED`); glossary entries disambiguate the two.
- `riviera-local-debug` — the scoped-test discipline for every run in this slice (loaded before the session's first `./gradlew`).
- `code-review:code-review` + `riviera-review-overlay` — the review gate; found the F-1 concurrency defect.
- `riviera-docs-freshness` — the pre-merge staleness sweep; its two patches ship in this PR rather than a second docs-only PR.

**Branch:** `feature/email-suppression-reinstatement` ✅ exists

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an address on the suppression list, when an admin reinstates it, then
  `EmailSuppressions.isSuppressed` returns `false` and the outcome is `Reinstated` carrying the
  row's `reason`, `firstSuppressedAt` and `lastEventAt`. *Pinned by:*
  `EmailSuppressionReinstatementIT.reinstatingASuppressedAddressLiftsTheSuppression`
- [ ] **AC-2:** Given a reinstated address, when a later suppression event arrives for it, then it
  is suppressed again, `first_suppressed_at` is unchanged, and `reinstated_at` is back to `NULL`.
  *Pinned by:* `EmailSuppressionReinstatementIT.aLaterBounceReSuppressesAReinstatedAddress`
- [ ] **AC-3:** Given an address that was never suppressed, when an admin reinstates it, then the
  outcome is `NotSuppressed` and **no row is written**. *Pinned by:*
  `EmailSuppressionReinstatementIT.reinstatingAnUnknownAddressWritesNothing`
- [ ] **AC-4:** Given an already-reinstated address, when an admin reinstates it again, then the
  outcome is `AlreadyReinstated` carrying the **original** `reinstatedAt` and the row is unchanged
  (idempotent). *Pinned by:* `EmailSuppressionReinstatementIT.reinstatingTwiceIsIdempotent`
- [ ] **AC-5:** Given any reinstatement attempt, when it completes, then exactly one structured log
  line records the outcome and the suppression reason, and **no** line contains the address or its
  domain (invariant #7 posture, #100 pattern). *Pinned by:*
  `SuppressionReinstatementServiceTest.logsTheOutcomeWithoutTheAddress`
- [ ] **AC-6:** Given a reinstated address, when a transactional mail is sent to it, then it is
  **delivered** (the defining invariant tracks the flag, not row presence). *Pinned by:*
  `EmailSuppressionReinstatementIT.aReinstatedAddressReceivesMailAgain`
  > Corrected at phase 0 from a `TransactionalMailServiceTest` pin: that test mocks
  > `EmailSuppressions`, so an AC-6 assertion there would only prove the mock. The claim is only
  > real end-to-end — real adapter, real chokepoint, recording `MockMailer`.
- [ ] **AC-7:** Given the reinstate endpoint, when a non-admin (anonymous, `OPERATOR`, `CUSTOMER`)
  calls it, then the response is `401`/`403` and nothing is written; an `ADMIN` gets `200`.
  *Pinned by:* `AdminEmailSuppressionControllerTest.onlyAnAdminMayReinstate`
- [ ] **AC-8:** Given the whole slice, when every reinstatement path has run, then
  `count(*) FROM email_suppression` never decreases — no code path deletes a row. *Pinned by:*
  `EmailSuppressionReinstatementIT.noPathEverDeletesARow`

## Non-goals

- **Self-service un-suppress.** A complainer lifting their own suppression is an abuse and
  enumeration vector; reinstatement is an ops judgment call (issue #391, explicit).
- **A standing admin *read* surface** ("is this address suppressed?"). Decided 2026-07-28: the
  reinstate response carries the row's technical facts, so the check-then-reinstate workflow needs
  no second endpoint and no new authenticated suppression oracle. The runbook's psql+pepper recipe
  remains the investigation path. Revisit if #348 grows a mail tab.
- **Any console UI.** #348's five tabs have no mail surface; this slice is backend-only.
- **Changing ADR-0012's erasure posture.** The list still survives right-to-erasure; reinstatement
  is a deliberate admin decision, never an erasure side-effect.
- **The bounce/complaint feed** (#372, gated on #370) and its parked out-of-order upsert guard —
  see R-5 for the interaction this slice hands forward.
- **A reinstatement *history*** (every reinstate/re-suppress cycle). `reinstated_at` holds the most
  recent lift; the full trail is the structured log. An event table is not earned at v1 volume.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior. Nothing is retired or replaced. The one *changed* existing behavior is
`EmailSuppressions.isSuppressed`'s predicate (row exists → row exists **and not reinstated**),
which is additive: with no reinstatements written, it is byte-for-byte the old result. AC-6 pins
that the change reaches the send chokepoint; AC-2 pins the re-suppression round trip.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **V35 collision** with a parallel slice | low | high | Verified at plan time: `V34` is head on `main`; all 10 open PRs are frontend-only dependabot bumps (no `db/migration` diff). If a slice claims V35 first, **this branch renumbers** (it merges second by default) | claude | **closed** — re-verified at PR time: `origin/main` still heads at V34, no open PR touches `db/migration` |
| R-2 | The `isSuppressed` predicate change silently breaks the module's **defining invariant** (*no send to a suppressed address*) — e.g. a typo makes every address unsuppressed | low | **critical** | The filter lands in the same phase as an IT that asserts both directions (suppressed → true, reinstated → false), plus AC-6 at the chokepoint. `EmailSuppressionIT`'s existing suppression assertions stay green unmodified | claude | **closed** `8d71339` — `EmailSuppressionIT` 9/0/0 unmodified; AC-6 proven end-to-end |
| R-3 | New `@RestController` breaks every `@WebMvcTest` slice — the web slice registers all controllers but no services, so an unstubbed port fails context load | **high** | med | Add the driving-port bean to `WebSliceStubs` **in the same commit** as the controller. This is a recurring trap in this repo (recorded across #111/#114/#116) — hence the port is an *interface*, stubbable with a lambda like `CreateBooking`/`ViewBooking` | claude | **closed** `3ef1bb0` — stub added in the same commit; `AdminErasureControllerTest` re-run green as proof |
| R-4 | Concurrent reinstate vs. suppress reports a state that never existed (read-then-write race) | low | low | The adapter does it in **one statement** via a data-modifying CTE — single snapshot, atomic by construction. Documented on the method; see the Modulith section | claude | **reopened by the review, then closed properly** — the CTE mitigation was *wrong* (see F-1); closed by `SELECT … FOR UPDATE` + `@Transactional`, pinned by a regression test proven red on the old code |
| R-5 | The future feed's out-of-order upsert guard (#367 comment, finding 1: `WHERE excluded.last_event_at >= email_suppression.last_event_at`) would, if added naively, let a **stale** event skip the `reinstated_at = NULL` clear — leaving a bounced address deliverable | med | med | Not this slice's code, but this slice's obligation: the `suppress` SQL gets a comment stating the clear must survive any future guard, and a note goes on **#367** so the #372 slice inherits it | claude | **closed** — `suppress` javadoc + [#367 comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/367#issuecomment-5100845967) spelling out the trap and the test to write |
| R-6 | PII leak — `reinstate` takes a **raw address**; echoing it into a log line, an `ApiProblem` `detail`, or an error message re-opens what ADR-0012 closed | med | high | Log the **outcome + reason enum only** (the `AccountErasureService` precedent). No address, and deliberately **not** the `domain` either — see R-7. `ApiProblem` detail stays generic (`riviera-java-conventions` §6b) | claude | **closed** `6965244` — asserted by `SuppressionReinstatementServiceTest` |
| R-7 | **Log injection** via `domain`. The tempting audit field is `domain` (ADR-0012 calls a bare domain non-PII), but V34's CHECK only bans *edge* whitespace — `user@bad\ndomain.com` normalizes to a domain containing a newline, so logging it raw forges log lines (`riviera-java-conventions` §10) | low | med | **Do not log `domain`.** The outcome + `SuppressionReason` enum are both closed sets and injection-proof. Recorded here because "log the domain, it's non-PII" is the obvious wrong turn | claude | **closed** `6965244` — the domain-absence assertion is explicit, with the reason in the test's javadoc |
| R-8 | The contract change reads as **drift** rather than decision — three documents state "never deleted" | **high** | med | All four documented statements are amended in the same slice: `EmailSuppressions` javadoc, ADR-0012 *Consequences*, `docs/runbooks/suppression-list-ops.md` §"Manual suppression / un-suppression" (whose current advice is a hand-run `DELETE` — this slice replaces it), and `RESPONSIBILITIES.md`'s `notification` Job line | claude | **closed** `8d4c8cd` — all four amended, plus `CONTEXT.md` glossary entries and `package-info.java`; the docs-freshness sweep then caught two more (`CLAUDE.md`'s module row, ADR-0012's Context sentence) |
| R-9 | Missing rate-limit budget on a new admin endpoint | low | low | Deliberate parity: `/api/admin/erasure` and `/api/admin/operators/**` carry no dedicated budget either — ADMIN role + CSRF is the gate. Adding one for this endpoint alone would be inconsistent; if the admin surface ever gets a budget it should get one as a surface (noted, not built) | claude | **closed — accepted**, parity with the existing admin surfaces; no code |

## Open questions / Assumptions

- **Assumption:** `email_suppression` is still effectively empty in every environment (only tests
  write it until #372's feed lands, per V33's header), so `ADD COLUMN … NULL` needs no backfill and
  no data step. — *Owner:* claude · *Resolves by:* phase 0 (the migration runs against a real
  container in `EmailSuppressionIT`)

### Resolved

- **Mechanism — hard `DELETE` vs. a status column.** Issue #391 deferred this to the slice.
  Decided 2026-07-28 (maintainer): **nullable `reinstated_at`**. Rationale in *Architecture*
  above; the losing option erases `first_suppressed_at` and the prior `reason`, making a
  reinstatement loop invisible.
- **Read surface.** Decided 2026-07-28 (maintainer): **no separate lookup endpoint**; the
  reinstate response carries the row's technical facts instead. Checked first that no ticket
  already owns it — #348 (admin console) has no mail tab, #380 is booking-keyed, #372 is the feed.
- **Controller placement.** `notification/adapter/in`, not the root. Both pass
  `CompositionRootDisciplineTests` (the root *is* granted `notification::api`), but the root
  variant would force a new published port for a single same-module consumer — a hypothetical
  seam (`codebase-design`) and a second published surface where `RESPONSIBILITIES.md` documents
  exactly one. `payout`'s `AdminPayoutBatchController` is the precedent.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice touches only `email_suppression`, which no
booking path reads or writes. It does **not** go near `availability(set_id, booking_date)`, the
`SELECT … FOR UPDATE` claim, or any booking transaction.

One adjacent guard worth restating, because #386 made it a standing rule: the suppression
adapter's `queryTimeout` stays **scoped to its own `JdbcClient`** and must not migrate to the
global `spring.jdbc.template.query-timeout` — the global property would also bound
`availability`'s `SELECT … FOR UPDATE`, turning invariant #2's serialization point into a flaky
timeout under contention. The new `reinstate` statement rides the same bounded client.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state, no aggregate) | It owns the suppression list outright (`RESPONSIBILITIES.md`: "the module's first owned state"), and reinstatement is a write to that state |
| M-2 | root (`SecurityConfig`) | existing | — | Path→role gating is composition-root config, as for every other `/api/admin/**` surface |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | **none added** | — | — |

`notification` keeps publishing exactly one surface (`notification::api`'s `MailSender`). The new
types are **module-internal**: the driving port and the outcome live in `application/`, alongside
`EmailSuppressions` and `SuppressionReason`, and the only consumer is the module's own
`adapter/in`. Nothing outside `notification` imports them, so no `api/`, `vocabulary/` or `spi/`
surface is earned (invariant #11; `PublishedSurfacePlacementArchitectureTests` only constrains
*published* kinds).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none** | — | — | — | — | — |

Reinstatement is a synchronous admin command with an answer the caller must act on — the
`api`-port shape, not the event shape (`riviera-modulith`, "Choosing between an `api/` port and a
domain event"). Nothing outside the module needs to react.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Lift a suppression on an address (write `reinstated_at`) | `notification` | Its **Job** names the email-suppression list as its own state and the *no send to a suppressed address* invariant as its defining one; nothing is on another module's Not-My-Job list here. `customer` owns tourist identity, never deliverability — the two are deliberately strangers (ADR-0012: "`customer` and `notification` stay strangers") |
| Normalize the submitted address before hashing | `customer` (consumed) | Already settled by #386: `customer.vocabulary.Emails.normalize` is the platform's one canonical form and the suppression key's **input contract**. `JdbcEmailSuppressions` already calls it; `reinstate` reuses the same path — a divergent copy would hash to a key that never matches |
| Gate the endpoint to the platform admin | root (`SecurityConfig`) | Role-gating is composition-root config; invariant #13's `/api/admin/**` exemption applies (platform-wide, not venue-scoped) |
| Audit-log the action | `notification` (application service) | The `#100` structured-log pattern, applied by the service that performs the action — mirrors `AccountErasureService` |

**Seam shape** (`codebase-design`): `reinstate` joins **`EmailSuppressions`**, the existing
do-not-mail repository port, rather than minting a second one — `isSuppressed` / `suppress` /
`reinstate` are one purposeful conversation about one table. The deletion test agrees: delete a
hypothetical `SuppressionReinstatement` port and nothing reappears anywhere.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves; no ledger row is read or written.

## Angular — frontend surfaces touched

N/A — backend-only. No console UI (see Non-goals; #348 has no mail tab today).

## FE↔BE contract

New endpoint, **no existing contract changes** and no Angular client consumes it this slice
(ops calls it directly; a future #348 tab would be its first UI).

- **New endpoint:** `POST /api/admin/email-suppressions/reinstate`
  - Request: `{ "email": "user@example.com" }`
  - `200` — `{ "outcome": "REINSTATED", "reason": "HARD_BOUNCE", "firstSuppressedAt": "…", "lastEventAt": "…" }`
  - `200` — `{ "outcome": "NOT_SUPPRESSED" }`
  - `200` — `{ "outcome": "ALREADY_REINSTATED", "reason": "…", "firstSuppressedAt": "…", "lastEventAt": "…", "reinstatedAt": "…" }`
  - `400 INVALID_REQUEST` — blank/absent email, or a value with no `local@domain` shape
  - `401` / `403` — not an authenticated platform admin
- **Why `200` for all three outcomes:** they are expected flows, not errors
  (`riviera-java-conventions` §6 — typed outcomes over exceptions). `404` would also make the
  endpoint a bare-status oracle, and the admin needs the *facts*, not just presence.
- **Money/date on the wire:** no money. Timestamps are UTC ISO-8601 instants (invariant #6).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus `riviera-sdlc`'s reference file for the current stage) before acting.

**Stage pointer:** `DONE — all gates passed; merged via PR #398`

**Next action:** Merge PR #398 (maintainer's call), then the two GitHub-only close-out items —
confirm #391 closed, and note the outcome on epic #367 alongside the R-5 hand-forward already posted.

**Gates**

| Gate | Result |
|---|---|
| CI | ✅ green on `43ac2ff` — backend build+test, frontend lint+test+build, CodeQL (both analyses) |
| **Review** | ✅ **RAN IN FULL** — `/code-review` (5 parallel angles + per-issue adversarial scoring) **plus** `riviera-review-overlay`: [comment](https://github.com/ivopogace/riviera-sunbed-booking/pull/398#issuecomment-5101006606). 5 findings, all fixed (F-1..F-5 below) |
| **Sonar** | ✅ gate green **and its reported list cleared**: 0 new issues, 0 duplicated blocks, new-code coverage **96.63%** (bar ≥80%). Zero confirmed genuine — `new_lines` = 395, so an analysis really ran (not the #318 false-clean read) |
| Docs freshness | ✅ run over `origin/main...HEAD` — 2 findings, both patched into this PR (below) |

**`riviera-docs-freshness` run** (`origin/main...HEAD`, pre-merge smoke):

- `docs/adr/ADR-0012…md:23` — *"the **only** operation the system ever performs against this table is
  an equality lookup … plus the upsert"* — contradicted by the new reinstatement write path —
  **patched** (an update note; the decision's rationale is unaffected, since reinstatement also
  addresses the row by normalize-then-hash and reads no address back).
- `CLAUDE.md` `notification` module row — enumerates V32/V33/V34 but not V35, so the row understated
  the module's owned state — **patched** with the flag mechanism.
- Checked and *not* stale: `CONTEXT.md`'s "entries are never deleted" (still literally true — a
  reinstatement is not a deletion, and the adjacent new glossary entry says so),
  `ADR-0011:122` ("the suppression list is empty in production until #370's feed"), and
  `RESPONSIBILITIES.md` (already amended in phase 4).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V35 migration + `reinstated_at`-aware read/write | ✅ | `8d71339` |
| 1 — `reinstate` on the port + sealed outcome + CTE adapter | ✅ | `2ecb87b` |
| 2 — Application service: clock, audit log, driving port | ✅ | `6965244` |
| 3 — Admin controller + `SecurityConfig` gate + `WebSliceStubs` | ✅ | `3ef1bb0` |
| 4 — Contract amendments (javadoc, ADR-0012, runbook, RESPONSIBILITIES, CONTEXT) + #367 note | ✅ | `8d4c8cd` |
| 5 — Review-gate fixes (F-1..F-5) + docs-freshness patches + close-out | ✅ | `43ac2ff` + this commit |

**Verified so far** (Docker 29.4.3 present, so nothing silently skipped):

| Test | Result | Covers |
|---|---|---|
| `EmailSuppressionReinstatementIT` | 6 / 0 failed / 0 skipped | AC-1, AC-3, AC-4, AC-6, AC-8 + the re-suppression cycle |
| `SuppressionReinstatementServiceTest` | 4 / 0 / 0 | AC-5 (audit line; no address, no domain) |
| `AdminEmailSuppressionControllerTest` | 6 / 0 / 0 | AC-7 (401/403/200) + the three-outcome wire contract + validation |
| `EmailSuppressionIT` | 9 / 0 / 0 | **unmodified** — the real check on the changed `isSuppressed` predicate (R-2) |
| `AdminErasureControllerTest` | 4 / 0 / 0 | **unmodified** — a sibling web slice still loads (R-3) |
| structural net (6 classes) | 22 / 0 / 0 | `ModularityTests`, package shape, published-surface placement, composition-root discipline, JDBC-only, error contract |

> **Structural finding, fixed in phase 3 (not a test edit).** `ModularityTests` failed:
> `notification` reached `shared.ApiProblem` without a grant. Fixed at the source — `"shared"` added
> to the module's `allowedDependencies`, matching how `payout` declares the same need. The kernel is
> OPEN with no named interfaces, so the module root is the narrowest available grant.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what
the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review ([PR #398](https://github.com/ivopogace/riviera-sunbed-booking/pull/398#issuecomment-5101006606)) — 3 of 5 angles, reproduced on postgres:17 | **`reinstate` NPE'd under two concurrent lifts.** The data-modifying CTE's "same snapshot" claim holds only while nobody else touches the row: under READ COMMITTED a blocked `UPDATE` re-checks its `WHERE` against the newest committed version (EvalPlanQual) while the outer `SELECT` keeps the original snapshot, producing the combination the javadoc called unreachable — then the mapper dereferenced a null `Timestamp`. `ApiErrorHandler` has no `RuntimeException` catch-all, so it escaped as a raw 500, breaking AC-4 and the #97 error contract | **fixed** — replaced with `SELECT … FOR UPDATE` + `@Transactional` (the `JdbcAvailabilityClaim` shape): a waiting reader re-fetches the committed row, which is the property the CTE was assumed to have |
| F-1a | self-caught while fixing F-1 | **The first regression test was not load-bearing.** Two barrier-synchronized threads *passed against the broken adapter* — under autocommit the window where one blocks the other is vanishingly small | **fixed** — replaced with a deterministic lock handoff (a held-open uncommitted `UPDATE`), verified **red (NPE) on the old adapter, green on the fix** |
| F-2 | review | **Validation tested only for `@`**, so `"@"`, `"user@"` and `"@example.com"` reached the port and answered `200 NOT_SUPPRESSED` — the exact misleading answer the branch exists to prevent — contradicting both its own comment and this doc's FE↔BE contract | **fixed** — `isAddressShaped` requires a non-empty local *and* domain part; the test now covers all five shapeless inputs |
| F-3 | review — `riviera-review-overlay` RV-STYLE-1 | Two multi-line inline `//` comments (`package-info.java`, `AdminEmailSuppressionControllerTest`) | **fixed** — moved into javadoc (exempt) and the test's method javadoc |
| F-4 | review (scored 50, folded in) | Plan doc's *File structure → Modify* still listed `TransactionalMailServiceTest.java`, which this slice never touches — the AC-6 pin moved at phase 0 | **fixed** — entry removed |
| F-5 | review (scored 25, folded in) | `WebSliceStubs` imports inserted out of alphabetical order | **fixed** — moved beside the existing `notification.api` import |

---

## File structure

**Create**

- `platform/src/main/resources/db/migration/V35__email_suppression_reinstatement.sql` — the nullable `reinstated_at` column
- `platform/src/main/java/ai/riviera/platform/notification/application/ReinstateOutcome.java` — sealed outcome + its three records
- `platform/src/main/java/ai/riviera/platform/notification/application/ReinstateSuppression.java` — the driving port (one method)
- `platform/src/main/java/ai/riviera/platform/notification/application/SuppressionReinstatementService.java` — package-private `@Service`: clock + audit log
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/AdminEmailSuppressionController.java` — package-private `@RestController`
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/EmailSuppressionReinstatementIT.java` — AC-1..4, AC-8
- `platform/src/test/java/ai/riviera/platform/notification/application/SuppressionReinstatementServiceTest.java` — AC-5
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/AdminEmailSuppressionControllerTest.java` — AC-7

**Modify**

- `…/notification/application/EmailSuppressions.java` — add `reinstate`; amend the never-deleted javadoc (R-8)
- `…/notification/adapter/out/JdbcEmailSuppressions.java` — `isSuppressed` filter, `suppress` clears `reinstated_at`, new `reinstate` CTE
- `…/notification/package-info.java` — one clause on the reinstatement path
- `…/platform/SecurityConfig.java` — path constant + `ADMIN` rule
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stub the driving port (R-3)
- `docs/adr/ADR-0012-email-suppression-hashed-key.md` — amend the *Consequences* never-deleted line
- `docs/runbooks/suppression-list-ops.md` — replace the hand-run `DELETE` advice with the endpoint
- `RESPONSIBILITIES.md` — `notification` Job line
- `CONTEXT.md` — glossary entries (disambiguating the operator-lifecycle `reinstate`)

---

## Phase 0 — V35 migration + `reinstated_at`-aware read/write

**Files:** Create `db/migration/V35__email_suppression_reinstatement.sql` · Modify
`JdbcEmailSuppressions.java` · Test `EmailSuppressionReinstatementIT.java`

- [ ] **Step 1: Write the failing test** — an IT that suppresses, hand-sets `reinstated_at`, and
      asserts `isSuppressed` is `false`; plus the re-suppression round trip (AC-2) and the
      never-deletes count (AC-8).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*EmailSuppressionReinstatementIT*"` → FAIL (no such column)
- [ ] **Step 3: Minimal implementation** — the migration, the `AND reinstated_at IS NULL` filter,
      and `reinstated_at = NULL` in the upsert's `DO UPDATE SET`.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS
- [ ] **Step 5: Regression** — `./gradlew test --tests "*EmailSuppression*" --tests "*SuppressionQueryTimeout*"` (the existing suppression assertions must stay green **unmodified** — that is R-2's real check)
- [ ] **Step 6: Generalization-audit pass** — search for every reader of `email_suppression`; confirm `isSuppressed` is the only one.
- [ ] **Step 7: Commit** + update this Execution status in the same commit window.

## Phase 1 — `reinstate` on the port + sealed outcome + CTE adapter

**Files:** Create `ReinstateOutcome.java` · Modify `EmailSuppressions.java`, `JdbcEmailSuppressions.java` · Test `EmailSuppressionReinstatementIT.java`

Covers AC-1, AC-3, AC-4. The adapter does it in **one** data-modifying-CTE statement (R-4): the
`UPDATE … WHERE reinstated_at IS NULL RETURNING` runs inside a CTE whose effect the outer `SELECT`
deliberately does **not** see (Postgres gives both the same snapshot), so one row-shape carries all
three outcomes — `just_reinstated` true → `Reinstated`; false with a non-null `reinstated_at` →
`AlreadyReinstated`; zero rows → `NotSuppressed`. Reuses the bounded `JdbcClient` and
`Emails.normalize` + `keyOf` unchanged.

## Phase 2 — Application service: clock, audit log, driving port

**Files:** Create `ReinstateSuppression.java`, `SuppressionReinstatementService.java` · Test `SuppressionReinstatementServiceTest.java`

Covers AC-5. Injected `Clock` supplies the `Instant` (invariant #6; no `Instant.now()` in the
adapter). One `log.info` with outcome + reason only — **no address, no domain** (R-6, R-7).

## Phase 3 — Admin controller + gate + WebSliceStubs

**Files:** Create `AdminEmailSuppressionController.java` · Modify `SecurityConfig.java`, `WebSliceStubs.java` · Test `AdminEmailSuppressionControllerTest.java`

Covers AC-7. Controller is package-private, switches exhaustively on the sealed outcome, and builds
errors only through `ApiProblem` (`riviera-java-conventions` §6b — no per-controller
`@ExceptionHandler`). `WebSliceStubs` gains the port bean **in this same commit** (R-3).

## Phase 4 — Contract amendments + the #367 hand-forward

**Files:** Modify `EmailSuppressions.java` (javadoc), `notification/package-info.java`, `docs/adr/ADR-0012-*.md`, `docs/runbooks/suppression-list-ops.md`, `RESPONSIBILITIES.md`, `CONTEXT.md`

Closes R-8. Every "never deleted" statement is amended to name reinstatement as *the one sanctioned
exception* — a deliberate contract change, not drift. The runbook's `DELETE` recipe is replaced by
the endpoint. A comment goes on **#367** recording R-5 so the #372 feed slice inherits the
`reinstated_at`-clear obligation alongside its out-of-order upsert guard.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-28 | phase 0 — the `isSuppressed` predicate changed | every reader/writer of `email_suppression` | `git ls-files \| … Select-String "email_suppression"` (see note) | `JdbcEmailSuppressions` only (+ 4 migrations, 3 ITs) | Both of its statements updated together — the read filter and the upsert's `reinstated_at = NULL` clear. No other reader exists, so no further sites. |

> **Tooling note that shaped the audit above.** A `Grep` rooted at `platform/src` **silently omits
> every `adapter/out` package** — including `JdbcEmailSuppressions`, the only file that mattered
> here. Cause: `platform/.gitignore`'s stock IntelliJ block (`out/` plus
> `!**/src/main/**/out/` re-includes). Git resolves the negation (`git check-ignore` exits 1);
> ripgrep does not when the search root is *inside* `src`. Roots `platform/` and
> `platform/src/main/java` are correct; `platform/src` is not. Same root-cause class as the
> graphify blind spot in `CLAUDE.md`/#321 — confirm any negative with `git ls-files`.

---

## Acceptance-criteria verification (final)

- [x] **AC-1..4, AC-6, AC-8:** `./gradlew test --tests "*EmailSuppressionReinstatementIT*"` → **7 tests, 0 failed, 0 skipped** (AC-6 pinned by `aReinstatedAddressReceivesMailAgain`, end-to-end through the real chokepoint)
- [x] **AC-5:** `./gradlew test --tests "*SuppressionReinstatementServiceTest*"` → **4 / 0 / 0**
- [x] **AC-7:** `./gradlew test --tests "*AdminEmailSuppressionControllerTest*"` → **6 / 0 / 0**
- [x] **Regression pin for F-1:** `aLiftThatLosesTheRaceReportsTheWinnersInstant` verified **red (NPE) against the pre-fix adapter, green against the fix** — the test was rewritten precisely because its first version passed on the broken code
- [x] **No regression in the sibling suites:** `EmailSuppressionIT` 9/0/0, `SuppressionQueryTimeoutIT` 2/0/0, `TransactionalMailServiceTest` 11/0/0, `AdminErasureControllerTest` 4/0/0 — all **unmodified**
- [x] **Structural net:** `ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `CompositionRootDisciplineTests`, `ErrorContractArchitectureTests` → **22 / 0 / 0**

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [x] **Availability** section filled (N/A justified); the adapter-scoped `queryTimeout` was **not** globalized (invariant #2) — the new `FOR UPDATE` rides the same bounded client.
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no new published surface; the one new dependency (`shared`) is declared in `allowedDependencies` (invariant #11) — `ModularityTests` green.
- [x] **Payment/payout** N/A justified.
- [x] Timezone correct: UTC `TIMESTAMPTZ` stored, `Clock`-supplied `Instant` (invariant #6).
- [x] No address, domain, or booking code in any log line or error body (invariant #7, R-6/R-7) — asserted, not assumed.
- [x] Flyway migration present (V35) and its number re-verified free against `main` at PR time (invariant #12).
- [x] **Frontend** N/A — backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (both resolved with the maintainer).
- [x] **Close-out written in THIS PR**, citing `merged via PR #398` (never a merge SHA).
- [x] **The review gate ran in full** — `/code-review` (5 angles + adversarial scoring) *plus* `riviera-review-overlay`.
