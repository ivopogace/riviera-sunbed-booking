# Notification Module (#382) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `notification` bounded context owns all transactional-mail machinery
(moved off the platform root, behavior unchanged) plus its first owned state — a
Flyway-migrated email-suppression list enforced on both delivery vehicles.

**Architecture:** The nine root mail classes relocate into an ADR-0007 full module
`ai.riviera.platform.notification`; the single significant new seam is the public
`notification.api.MailSender` port, which absorbs the *fire-and-forget* semantics the
edge previously assembled by hand (`CustomerRecovery.dispatchQuietly`): off-request-thread
dispatch, never-throws, catch-inside-task — and now suppression enforcement — behind one
application-service chokepoint (`TransactionalMailService`) that both vehicles (registry
listener and in-memory dispatcher) flow through. The shared kernel is untouched; nothing
depends on the root; only the root depends on `notification`.

**Persistence:** JDBC only (invariant #1). Two migrations: `V31` rewrites
`event_publication`/`event_publication_archive.listener_id` for the moved listener FQCN
(V18 precedent); `V32` creates the module-owned `email_suppression` table.

**Source of intent:** GitHub issue #382 (context: epic #367, ADR-0011, #371's kernel
extraction and its `shared/package-info.java` "future notification module" paragraph).

**Skills consulted:** `riviera-modulith` (full-template shape; listener → `adapter/in`
*overriding the issue's "listener … are application/" phrasing* — @ApplicationModuleListener
is a driving adapter; api-vs-internal port split; the listener_id/event_type registry-rewrite
rule), `riviera-java-conventions` (records, package-private adapters, typed-outcome/no-broad-catch,
CRLF/log-forging posture preserved), `postgres` (BIGINT identity PK + `UNIQUE(email)`,
`TIMESTAMPTZ`, `CHECK (reason IN …)` over native enum), `codebase-design` (one deep chokepoint
service instead of a Mailer-decorator — avoids the self-injection @Primary tangle and keeps the
suppression rule in exactly one place), `domain-modeling` (module row wording for
CLAUDE.md/RESPONSIBILITIES.md; "suppression" enters the ubiquitous language),
`riviera-plan-doc` (this doc), `grilling` (issue-intake gate findings folded in below).

**Branch:** `claude/sdlc-382-4s8n27` — the cloud session's designated remote branch stands
in for `feature/notification-module` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (module exists, root cleaned):** Given the moved machinery, when the structural
  net runs, then `notification` verifies as a Modulith module and no mail class remains in
  `ai.riviera.platform` root. *Pinned by:* `ModularityTests.verifiesModularStructure`,
  `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` (all green
  with the new module).
- [ ] **AC-2 (root import discipline):** Given the composition root after the move, when the
  new root-discipline arch test runs, then no root class imports any
  `booking`/`venue`/`payment`/`payout`/`availability` surface. *Pinned by:*
  `CompositionRootDisciplineTests.rootImportsNoSpineModuleSurfaces` (new).
- [ ] **AC-3 (shared kernel untouched):** Given this slice's diff, when reviewed, then
  `ai/riviera/platform/shared/**` shows zero byte changes except the package-info paragraph
  update explicitly required by the issue's docs AC. *Pinned by:* diff inspection at review
  gate (recorded in Execution status; the four kernel types byte-identical).
- [ ] **AC-4 (suppression — dispatcher vehicle):** Given `addr@example.com` is suppressed,
  when the edge calls `MailSender.sendEmailVerification`/`sendPasswordReset` for it, then no
  transport send happens (MockMailer records nothing) and the call still returns normally.
  *Pinned by:* `TransactionalMailServiceTest.suppressedAddressIsNeverDispatchedToTheTransport` +
  `EmailSuppressionIT` (real Postgres).
- [ ] **AC-5 (suppression — registry vehicle):** Given a suppressed address and a
  `BookingConfirmed` publication, when the listener runs, then no transport send happens and
  the publication **completes** (a suppressed skip is success, not a retry loop). *Pinned by:*
  `BookingConfirmationMailIT.suppressedAddressCompletesWithoutSend` (new method).
- [ ] **AC-6 (behavior otherwise unchanged):** Given the move, when the existing mail test
  net runs relocated, then booking-confirmation idempotency under registry republication,
  bearer-credentials-never-persisted, mock-mailer prod-guard boot failure, profile wiring,
  off-thread dispatch and never-throws semantics all still pass. *Pinned by:* relocated
  `BookingConfirmationMailIT`, `RecoveryTokenNeverPersistedIT`, `MockMailerProdGuardTest`,
  `MailerProfileWiringTest`, `AsyncMailDispatcherTest`, `TransactionalMailServiceTest`
  (absorbing `CustomerRecoveryDispatchTest`'s assertions), `EmailVerificationIT`,
  `PasswordResetIT`, `RecoveryMailerFailureIT`.
- [ ] **AC-7 (outstanding publications survive the move):** Given an `event_publication` row
  carrying the OLD listener FQCN, when `V31` runs, then the row's `listener_id` carries the
  new FQCN (same for the archive table). *Pinned by:* `ListenerMoveMigrationIT` (SQL-level
  assertion against migrated schema; V18 pattern).

## Non-goals

- The Scaleway TEM bounce/complaint webhook (`adapter/in` feed into the suppression table) —
  needs #370 provider specifics; natural follow-up slice.
- Dissolving the `shared` kernel (explicitly kept, per the issue).
- Trimming `CurrentOperator`/`CurrentCustomer` from the kernel.
- Any new mail kind (the issue's "set-password confirmation" phrasing matches no existing
  kind — grill finding; the port publishes exactly today's two edge-called sends).
- A public suppression read/write API (internal write path only, provider-agnostic).
- Any change to guest checkout, booking, payments, or frontend.

## Behavior-parity ledger (retirement / replacement slices only)

The root mail machinery is replaced by the module — every observable behavior enumerated:

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| Exactly one `Mailer` bean per profile: mock under `!mailer & !smtp4dev`, SMTP under `mailer \| smtp4dev` | preserved | classes move to `adapter/out`, `@Profile` expressions byte-identical; `MailerProfileWiringTest` relocated |
| `MockMailerProdGuard` aborts boot under `prod & !mailer` | preserved | moved unchanged; `MockMailerProdGuardTest` relocated |
| Recovery sends run off the request thread, bounded queue (1 drainer, cap 100), drop+warn on rejection, MDC carried + cleared, drain on shutdown | preserved | `AsyncMailDispatcher` moves unchanged into `application/`; `AsyncMailDispatcherTest` relocated |
| Recovery send failures are swallowed inside the dispatched task (never fail the request; no status/timing oracle — D-8) | preserved (moved) | `dispatchQuietly` logic moves from `CustomerRecovery` into `TransactionalMailService`; pinned by `TransactionalMailServiceTest` + `RecoveryMailerFailureIT`. One accepted drift (review Info-5): the suppression read shares the swallow, so a transient DB failure on it now also drops the send (best-effort contract; log wording covers both). **Reversed in #386** — the read now fails **open** (send anyway) in its own `catch (DataAccessException)`, with a distinct log line, because the list is empty in production until #370's bounce feed lands, a user-requested reset to a suppressed address is the most harmless send available, and D-8 makes the response identical either way, so a dropped reset was a dead end the user got no signal about. Bounding the read with a `queryTimeout` (same slice) made this branch *more* reachable. The registry vehicle still propagates — fail-open is recovery-only |
| Token issue stays ON the request thread; only the send moves off it | preserved | `CustomerRecovery` still calls `recovery.issue…` synchronously, then `MailSender.send…` |
| Booking-confirmation mail rides the Event Publication Registry, `@ApplicationModuleListener`, at-least-once, idempotent per booking; missing booking/set/contact → log+skip (complete), transport failure → propagate (retry) | preserved | listener moves to `adapter/in` unchanged; suppression skip added as a *complete* outcome (AC-5); `BookingConfirmationMailIT` relocated |
| Bearer-credential payloads never persisted (no registry for recovery mail) | preserved | recovery sends still ride the in-memory dispatcher only; `RecoveryTokenNeverPersistedIT` |
| No bearer credential logged at transport; CRLF stripped for headers (`headerSafe`) and logs (`sanitize`) | preserved | `SmtpMailer`/`MockMailer` move unchanged |
| Mock records `SentEmail`s; ITs assert via `lastTo`/`sent`/`clear`; dev-only recovery-link log line | preserved | mock unchanged (package-private in `adapter/out`); external ITs assert through a new same-package `@TestComponent` probe (`RecordedMailbox`) |
| `@WebMvcTest` slices stub `Mailer` + synchronous dispatcher via `WebSliceStubs`; DB ITs get `SynchronousMailDispatch` via `TestcontainersConfiguration` | changed (equivalent) | stubs target the new seams: `MailSender` for web slices; `SynchronousMailDispatch` moves to the notification test package, still `@Primary MailDispatcher` |
| Outstanding registry publications re-deliver to the listener across restarts | preserved | **V31 `listener_id` rewrite** — without it the moved listener's id no longer matches and rows dead-letter (V18 case history) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Moved listener's `listener_id` no longer matches persisted publications → outstanding booking-confirmation mails dead-letter on post-deploy republish | high (without action) | high | V31 rewrite of `event_publication` + archive, V18 pattern; `ListenerMoveMigrationIT`; roll-forward-only note in migration header | agent | closed — V31 shipped + IT green (phase 1) |
| R-2 | Suppression check on the request thread would widen the known-email timing oracle (D-8) | med | high | check runs **inside** the dispatched task (off-thread) for the dispatcher vehicle; pinned by `TransactionalMailServiceTest` asserting no suppression read on caller thread | agent | closed — `theSuppressionReadRunsOffTheCallersThread` green (phase 2) |
| R-3 | Hidden test coupling: ~16 test classes touch the moved types; a missed one fails compile or (worse) silently weakens the net | med | med | full inventory in File structure; compile is the net for the former, relocated assertions reviewed one-by-one against the parity ledger for the latter | agent | closed — fired once as F-1 (compile passed, context load didn't); every inventory class now run green locally or in CI |
| R-4 | `PackageShapeArchitectureTests`/`PublishedSurfacePlacementArchitectureTests` may enumerate module packages and reject the newcomer | med | low | read both tests at phase-1 start; extend the module list, never weaken a rule | agent | closed — both discover modules dynamically; no enumeration; green (phase 1) |
| R-5 | Flyway V31/V32 collision with a parallel slice | low | med | verified free on `main` and unclaimed by all open PRs (Dependabot-only) at plan time; renumber rule: whoever merges second renumbers | agent | closed — no parallel backend PR appeared; V31/V32 merged via PR #385 |
| R-6 | Suppressed listener skip accidentally implemented as *throw* → permanent retry loop parking the publication | low | med | AC-5 asserts the publication completes; typed internal outcome, no exception for the suppressed branch | agent | closed — `suppressedAddressCompletesWithoutSend` green (phase 2) |
| R-7 | A registry-republished confirmation could race the suppression insert (suppress lands between send attempts) — double semantics unclear | low | low | at-least-once already accepted (ADR-0011); check runs per attempt, so the retry honors the newest suppression state — documented in `TransactionalMailService` Javadoc | agent | closed — documented in the service Javadoc (phase 2) |

## Open questions / Assumptions

None open.

### Resolved

- **Naming (`MailSender` / `TransactionalMailService`):** shipped as picked — 495c6a7.
- **Normalization:** verified — `customer` stores `trim().toLowerCase(Locale.ROOT)`
  (`JdbcCustomerDirectory`); the adapter applies the same form on read and write, and the
  review round added a V32 `CHECK (email = lower(btrim(email)))` pinning it in the DB — a3de354.
- **`allowedDependencies` subset (no `shared` grant):** shipped; `ModularityTests` green —
  495c6a7.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No write path to `availability(set_id, booking_date)` is
touched; the slice moves mail machinery and adds a mail-only table. The only concurrency
surface is `email_suppression` upserts (`INSERT … ON CONFLICT` on the unique email) — no
interaction with the booking spine.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | **new** | (none — owns `email_suppression` state, no domain aggregate yet) | transactional-mail delivery + the do-not-mail list; born per the shared package-info's anticipation, now that real owned state exists |
| M-2 | root (not a module) | existing | — | sheds all mail machinery; keeps orchestrating *when* to send (RV-BE-11), now via `notification::api` |

Module layout (ADR-0007 full template; no `domain/` — the single `SuppressionReason` enum
rides with its port in `application/`, per "don't invent an empty layer"):

```
ai.riviera.platform.notification/
├── package-info.java      @ApplicationModule(allowedDependencies = { "booking::api",
│                            "booking::events", "booking::vocabulary", "customer::api",
│                            "customer::vocabulary", "venue::api", "venue::vocabulary" })
├── api/                   MailSender (public port; the ONLY published surface)
├── application/           Mailer (internal transport port), MailDispatcher (internal port),
│                          AsyncMailDispatcher, BookingConfirmationMail,
│                          TransactionalMailService (implements MailSender; the chokepoint),
│                          EmailSuppressions (internal port) + SuppressionReason
└── adapter/
    ├── in/                BookingConfirmationMailListener (@ApplicationModuleListener = driving adapter)
    └── out/               SmtpMailer, MockMailer (+ SentEmail), MockMailerProdGuard,
                           JdbcEmailSuppressions
```

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `notification.api` | `MailSender#sendEmailVerification(String, URI)` / `#sendPasswordReset(String, URI)` — fire-and-forget: off-thread, never throws, suppression-enforced | none beyond JDK | root (`CustomerRecovery`) only; **no module depends on `notification`** |

Consumed surfaces (the listener's existing imports, now module-scoped):
`booking.api.BookingNotificationFacts`, `booking.events.BookingConfirmed`,
`booking.vocabulary.BookingNotificationInfo`, `customer.api.CustomerLookup`,
`customer.vocabulary.GuestContact`, `venue.api.SetBookingFacts`,
`venue.vocabulary.SetBookingInfo`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` (existing, unmoved) | `booking` | `{ bookingId, venueId, setId, bookingDate, amountMinor, currency }` | `payout` (existing), **`notification`** (listener relocated, not new) | async `AFTER_COMMIT` (registry) | relocated `BookingConfirmationMailIT` |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Transactional-mail delivery (transports, dispatch, composition of the confirmation mail) | `notification` | new Job line (docs phase adds it); RV-BE-11 keeps login/session at the edge — *sending mail* is not session machinery; no other module claims it (customer's Not-My-Job already excludes mail/tokens/crypto) |
| Deciding *when* to send recovery mail + minting/handling raw tokens | root (edge) | unchanged — RV-BE-11: credential-material machinery stays at the edge; the module gets the fully-formed link, never the token store |
| The suppression list (state + enforcement + internal write path) | `notification` | the module's defining invariant per the issue; provider feed (out of scope) will be its `adapter/in` |
| Booking/venue/customer facts for the confirmation mail | `booking`/`venue`/`customer` | unchanged — read via their `api/` ports from the listener, ids only |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (`BookingConfirmationMail` continues to carry
`amountMinor`+currency for display only, formatted in the transport — invariant #5 posture
unchanged, no arithmetic touched.)

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change (no HTTP surface added or altered).

## Execution status

**Stage pointer:** DONE — merged via PR #385; merge close-out complete

**Next action:** none — slice complete. Follow-up home for the provider bounce feed: the
`adapter/in` slice gated on #370 (see Non-goals).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc committed | ✅ | 538a09f |
| 1 — mechanical move (module + api port + V31 + tests relocated) | ✅ | 495c6a7 |
| 2 — suppression list (V32 + enforcement both vehicles) + F-1 fix | ✅ | (this commit) |
| 3 — docs + close-out (CLAUDE.md, RESPONSIBILITIES.md, shared package-info) | ✅ | 7ce2e78 |
| 4 — review-gate + docs-freshness fix round | ✅ | a3de354 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run 30294203563, phase-1 push) | `PayoutModuleTest > initializationError`: the root's `CustomerRecovery` now needs `notification.api.MailSender`, absent from payout's `@ApplicationModuleTest` isolation (root beans auto-supplied, module beans not — the #371 kernel lesson, mail edition). R-3 firing exactly as registered: the class was in the phase-1 inventory but only compile-verified, never run. Fix: mock `MailSender`; drop the three #371 facts mocks the departed listener no longer needs. | fixed-in-`a464744` |
| F-2 | review (`/review 385` + overlay; degraded fallback — `/code-review` unavailable in this session's roster, noted in the PR) | 0 Blocker / 0 Major / 4 Minor / 4 Info: stale `SynchronousMailDispatch` Javadoc citation; 3× RV-STYLE-1 multi-line inline comments; V32 lacked a stored-normalization CHECK; plan-doc drift (public `sendBookingConfirmation`, AC-4 pin name); misleading not-delivered log wording; import ordering; archive rewrite unasserted; stale `MockMailer` profile Javadoc. All 8 fixed (none deferred). | fixed-in-`a3de354` |
| F-3 | sonar (PR 385) | Quality gate green AND list verified via API: 0 issues, 0 hotspots, 0 duplicated blocks, new-code coverage 93.1% (≥80), analysis confirmed real (`new_lines=847`). | clean — no action |
| F-4 | docs-freshness (pre-merge smoke) | 3 stale spots: riviera-modulith root blockquote ("the mailers, edge listeners"), domain-model.md "seven modules" + missing context-map node/arrow, docs/agents/domain.md seven-context roster. | fixed-in-`a3de354` |

---

## File structure

**Created (main):**
- `platform/src/main/java/ai/riviera/platform/notification/package-info.java` — `@ApplicationModule` + grants
- `…/notification/api/package-info.java` — `@NamedInterface("api")`
- `…/notification/api/MailSender.java` — the published port
- `…/notification/application/TransactionalMailService.java` — chokepoint (dispatch + swallow + suppression; public `sendBookingConfirmation` for the `adapter/in` listener — cross-package, so package-private was never possible; plan corrected)
- `…/notification/application/EmailSuppressions.java` + `SuppressionReason.java` — internal port + reason
- `…/notification/adapter/out/JdbcEmailSuppressions.java` — `JdbcClient` adapter
- `platform/src/main/resources/db/migration/V31__event_publication_listener_move.sql`
- `platform/src/main/resources/db/migration/V32__notification_email_suppression.sql`
- `platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java` — AC-2
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/RecordedMailbox.java` — public `@TestComponent` probe over the package-private mock
- notification test classes: `TransactionalMailServiceTest`, `EmailSuppressionIT`, `ListenerMoveMigrationIT`

**Moved (main, behavior unchanged):** `Mailer`, `MailDispatcher`, `AsyncMailDispatcher`,
`BookingConfirmationMail` → `notification/application/`; `SmtpMailer`, `MockMailer`,
`SentEmail`, `MockMailerProdGuard` → `notification/adapter/out/`;
`BookingConfirmationMailListener` → `notification/adapter/in/`.

**Modified (main):** `CustomerRecovery.java` (drop `Mailer`/`MailDispatcher`/`dispatchQuietly`,
call `MailSender`).

**Moved/updated (test):** `AsyncMailDispatcherTest`, `MockMailerTest`, `MockMailerProdGuardTest`,
`SmtpMailerIT`, `MailerProfileWiringTest`, `BookingConfirmationMailIT`, `SynchronousMailDispatch`
→ notification test packages; `WebSliceStubs` (stub `MailSender` instead of `Mailer`+dispatcher),
`TestcontainersConfiguration` (import path), `EmailVerificationIT`, `PasswordResetIT`,
`RecoveryTokenNeverPersistedIT`, `RecoveryMailerFailureIT` (import updates — see the probe-plan
change below), `CustomerRecoveryDispatchTest` → renamed `CustomerRecoveryTest` (off-thread +
swallow assertions absorbed into `TransactionalMailServiceTest`; the residual test keeps
token-issue-on-caller-thread + link correctness), `MailerProfileWiringTest`'s two
`RecoveryProperties` binding tests split back to a new root `RecoveryPropertiesBindingTest`
(the link base URL is edge config and `RecoveryProperties` stays root-package-private).

**Plan change (phase 1, recorded):** the planned `RecordedMailbox` `@TestComponent` probe was
dropped — the ITs assert on recorded `SentEmail` contents (`.confirmation()`, `.link()`, `.kind()`),
so a probe would have had to either mirror the whole record or expose it anyway. Instead
`MockMailer` + `SentEmail` are **public in `adapter/out`** with a Javadoc note: the recording
surface is the platform test suite's established observation seam; no production caller exists
(Modulith walls modules off; the root talks only to `notification::api`, pinned by
`CompositionRootDisciplineTests`).

**Modified (docs, phase 3):** `CLAUDE.md` (module table row), `RESPONSIBILITIES.md`
(`notification` section), `shared/package-info.java` (the "future notification module"
paragraph → points at the shipped module).

---

## Phase 1 — Mechanical move: the `notification` module

**Files:** see File structure (created/moved main + test); no suppression logic yet.

- [ ] **Step 1:** Read `PackageShapeArchitectureTests` + `PublishedSurfacePlacementArchitectureTests`
  for hardcoded module enumerations (R-4); extend for `notification` if needed.
- [ ] **Step 2 (red):** Write `CompositionRootDisciplineTests` (root imports none of
  booking/venue/payment/payout/availability) — fails while the listener still sits at root.
- [ ] **Step 3 (green):** Create the module skeleton + package-infos; move the nine classes;
  introduce `MailSender` + `TransactionalMailService` (absorbing `dispatchQuietly`); rewire
  `CustomerRecovery`; relocate/rewire tests + `RecordedMailbox` probe; add V31 with
  `ListenerMoveMigrationIT`.
- [ ] **Step 4:** Scoped run: `ModularityTests`, the three arch tests, `CompositionRootDisciplineTests`,
  all relocated mail tests, `EmailVerificationIT`/`PasswordResetIT`/`RecoveryMailerFailureIT`/
  `RecoveryTokenNeverPersistedIT`, `ListenerMoveMigrationIT` → PASS (Docker-dependent ITs skip
  cleanly without a daemon; CI owns the full suite).
- [ ] **Step 5:** Generalization audit — other root classes importing spine surfaces? (none per
  grill; the arch test now pins it).
- [ ] **Step 6:** Commit `refactor(#382): move mail machinery into the notification module`.
- [ ] **Step 7:** Update Execution status (same commit window); push; check CI.

## Phase 2 — The suppression list

- [ ] **Step 1 (red):** `TransactionalMailServiceTest.suppressedAddressIsNeverDispatched` (+
  not-suppressed still sends; suppression read happens off the caller thread — R-2) and
  `BookingConfirmationMailIT.suppressedAddressCompletesWithoutSend` (AC-5).
- [ ] **Step 2 (green):** V32 `email_suppression` (BIGINT identity PK, `email TEXT NOT NULL UNIQUE`
  normalized lower-case, `reason TEXT CHECK (reason IN ('HARD_BOUNCE','COMPLAINT','MANUAL'))`,
  `first_suppressed_at`/`last_event_at TIMESTAMPTZ NOT NULL` — app-supplied UTC instants,
  invariant #6); `EmailSuppressions` port (`isSuppressed`, `suppress` upsert
  `ON CONFLICT (email) DO UPDATE` reason + `last_event_at`); `JdbcEmailSuppressions`;
  enforcement in `TransactionalMailService` for all three send paths; `EmailSuppressionIT`
  against real Postgres (constraint + upsert + both-vehicle enforcement).
- [ ] **Step 3:** Scoped run: notification tests + `EmailSuppressionIT` + relocated ITs → PASS.
- [ ] **Step 4:** Generalization audit — any other send path bypassing the chokepoint? (grep
  `Mailer` usages; must be transports + service only).
- [ ] **Step 5:** Commit `feat(#382): email suppression list enforced on both delivery vehicles`;
  update Execution status; push; check CI.

## Phase 3 — Docs + close-out

- [ ] CLAUDE.md module table + the "shipped epics" prose if stale; RESPONSIBILITIES.md
  `notification` section (Job / Not-My-Job, per the ownership table above); `shared`
  package-info paragraph updated to point at the shipped module (the issue's docs AC — the
  one permitted `shared/` change); run `riviera-docs-freshness` at merge close-out step 5.
- [ ] Commit `docs(#382): notification module substrate rows`; push; CI; then PR → review
  gate (`/code-review` + `riviera-review-overlay`) → Sonar gate → merge close-out
  (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** structural net (`ModularityTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`) green locally per phase and in CI runs
  30294887615 / 30295282512.
- [x] **AC-2:** `CompositionRootDisciplineTests` red before the move (21 violations), green after.
- [x] **AC-3:** `git diff origin/main -- …/shared/` = the package-info paragraph only (1 file, 7+/4−).
- [x] **AC-4:** `TransactionalMailServiceTest.suppressedAddressIsNeverDispatchedToTheTransport`
  + `theSuppressionReadRunsOffTheCallersThread` + `EmailSuppressionIT` (3/3, real Postgres) green.
- [x] **AC-5:** `BookingConfirmationMailIT.suppressedAddressCompletesWithoutSend` green (5/5 in class).
- [x] **AC-6:** full relocated net green locally (each IT verified `skipped=0`) and in the full-suite
  CI runs above.
- [x] **AC-7:** `ListenerMoveMigrationIT` green — old-format row rewritten, new-format untouched,
  archive row rewritten (review round added the archive assertion).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** N/A justified (invariant #2 untouched).
- [x] Pool + cutoff rules not in scope (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** N/A justified.
- [x] Refund policy untouched (invariant #10).
- [x] Timezone: `TIMESTAMPTZ` + app-supplied UTC instants on the new table (invariant #6).
- [x] Booking codes / bearer credentials never logged or persisted (invariant #7) — parity rows verified.
- [x] Flyway migrations V31+V32 present and IT-verified (invariant #12).
- [x] Frontend N/A.
- [x] Execution status at HEAD matches reality (stage pointer, phase table, findings register).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #385`.
- [x] **The review gate ran in full** — `/review 385` (the sanctioned fallback; `/code-review`
      unavailable in this session's roster — stated in the PR) plus `riviera-review-overlay`,
      run as a subagent walking the full RV-BE bank; findings F-2 all fixed.
