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
- `riviera-local-debug` — to load before the first `./gradlew` of the implement stage (not yet loaded at plan time).

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
| R-1 | **V35 collision** with a parallel slice | low | high | Verified at plan time: `V34` is head on `main`; all 10 open PRs are frontend-only dependabot bumps (no `db/migration` diff). If a slice claims V35 first, **this branch renumbers** (it merges second by default) | claude | open |
| R-2 | The `isSuppressed` predicate change silently breaks the module's **defining invariant** (*no send to a suppressed address*) — e.g. a typo makes every address unsuppressed | low | **critical** | The filter lands in the same phase as an IT that asserts both directions (suppressed → true, reinstated → false), plus AC-6 at the chokepoint. `EmailSuppressionIT`'s existing suppression assertions stay green unmodified | claude | open |
| R-3 | New `@RestController` breaks every `@WebMvcTest` slice — the web slice registers all controllers but no services, so an unstubbed port fails context load | **high** | med | Add the driving-port bean to `WebSliceStubs` **in the same commit** as the controller. This is a recurring trap in this repo (recorded across #111/#114/#116) — hence the port is an *interface*, stubbable with a lambda like `CreateBooking`/`ViewBooking` | claude | open |
| R-4 | Concurrent reinstate vs. suppress reports a state that never existed (read-then-write race) | low | low | The adapter does it in **one statement** via a data-modifying CTE — single snapshot, atomic by construction. Documented on the method; see the Modulith section | claude | open |
| R-5 | The future feed's out-of-order upsert guard (#367 comment, finding 1: `WHERE excluded.last_event_at >= email_suppression.last_event_at`) would, if added naively, let a **stale** event skip the `reinstated_at = NULL` clear — leaving a bounced address deliverable | med | med | Not this slice's code, but this slice's obligation: the `suppress` SQL gets a comment stating the clear must survive any future guard, and a note goes on **#367** so the #372 slice inherits it | claude | open |
| R-6 | PII leak — `reinstate` takes a **raw address**; echoing it into a log line, an `ApiProblem` `detail`, or an error message re-opens what ADR-0012 closed | med | high | Log the **outcome + reason enum only** (the `AccountErasureService` precedent). No address, and deliberately **not** the `domain` either — see R-7. `ApiProblem` detail stays generic (`riviera-java-conventions` §6b) | claude | open |
| R-7 | **Log injection** via `domain`. The tempting audit field is `domain` (ADR-0012 calls a bare domain non-PII), but V34's CHECK only bans *edge* whitespace — `user@bad\ndomain.com` normalizes to a domain containing a newline, so logging it raw forges log lines (`riviera-java-conventions` §10) | low | med | **Do not log `domain`.** The outcome + `SuppressionReason` enum are both closed sets and injection-proof. Recorded here because "log the domain, it's non-PII" is the obvious wrong turn | claude | open |
| R-8 | The contract change reads as **drift** rather than decision — three documents state "never deleted" | **high** | med | All four documented statements are amended in the same slice: `EmailSuppressions` javadoc, ADR-0012 *Consequences*, `docs/runbooks/suppression-list-ops.md` §"Manual suppression / un-suppression" (whose current advice is a hand-run `DELETE` — this slice replaces it), and `RESPONSIBILITIES.md`'s `notification` Job line | claude | open |
| R-9 | Missing rate-limit budget on a new admin endpoint | low | low | Deliberate parity: `/api/admin/erasure` and `/api/admin/operators/**` carry no dedicated budget either — ADMIN role + CSRF is the gate. Adding one for this endpoint alone would be inconsistent; if the admin surface ever gets a budget it should get one as a surface (noted, not built) | claude | open |

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

**Stage pointer:** `implement — phase 2`

**Next action:** Phase 2 — the `ReinstateSuppression` driving port and its package-private
`@Service` (injected `Clock`, one audit log line carrying outcome + reason only), AC-5.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V35 migration + `reinstated_at`-aware read/write | ✅ | `8d71339` |
| 1 — `reinstate` on the port + sealed outcome + CTE adapter | ✅ | `<phase-1>` |
| 2 — Application service: clock, audit log, driving port | | |
| 3 — Admin controller + `SecurityConfig` gate + `WebSliceStubs` | | |
| 4 — Contract amendments (javadoc, ADR-0012, runbook, RESPONSIBILITIES, CONTEXT) + #367 note | | |

**Verified so far:** `EmailSuppressionReinstatementIT` — 6 tests, 0 failures, 0 skipped (Docker
29.4.3 present, so nothing silently skipped): AC-1, AC-3, AC-4, AC-6, AC-8 + the re-suppression
cycle. `EmailSuppressionIT` / `SuppressionQueryTimeoutIT` / `TransactionalMailServiceTest` green
**unmodified** — the real check on the changed `isSuppressed` predicate (R-2).

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what
the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

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
- `…/notification/application/TransactionalMailServiceTest.java` — AC-6
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

- [ ] **AC-1..4, AC-8:** `./gradlew test --tests "*EmailSuppressionReinstatementIT*"` → PASS
- [ ] **AC-5:** `./gradlew test --tests "*SuppressionReinstatementServiceTest*"` → PASS
- [ ] **AC-6:** `./gradlew test --tests "*TransactionalMailServiceTest*"` → PASS
- [ ] **AC-7:** `./gradlew test --tests "*AdminEmailSuppressionControllerTest*"` → PASS
- [ ] **Structural net:** `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*CompositionRootDisciplineTests*"` → PASS

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified); the adapter-scoped `queryTimeout` was not globalized (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no new published surface; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [ ] **Payment/payout** N/A justified.
- [ ] Timezone correct: UTC `TIMESTAMPTZ` stored, `Clock`-supplied `Instant` (invariant #6).
- [ ] No address, domain, or booking code in any log line or error body (invariant #7, R-6/R-7).
- [ ] Flyway migration present (V35) and its number re-verified free against `main` at PR time (invariant #12).
- [ ] **Frontend** N/A — backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN` (never a merge SHA).
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.
