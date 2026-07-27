# Email S3 — Booking-confirmation email with the booking code Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** When a booking is confirmed, the tourist receives exactly one plain-text email carrying
their booking code, venue name, booking date, set location and amount paid — sent from the platform
edge, off the request thread, deduplicated by the Event Publication Registry.

**Architecture:** The single most significant decision is that **the registry's own
`completion_date` is the idempotency record — no dedupe table, no `Message-ID` scheme, no Flyway
migration in this slice.** A ledger row written inside the listener's transaction would have exactly
the same crash window as `completion_date` (send succeeds → process dies → row rolls back →
republish → second email); both are database writes wrapped around a non-transactional SMTP call, so
neither is exactly-once. `republish-outstanding-events-on-restart=true` already resubmits *only*
publications with a NULL `completion_date`, which is precisely the wanted behaviour for zero code.
The slice is therefore: one edge `@ApplicationModuleListener` on `booking.events.BookingConfirmed`,
one new narrow `booking::api` port for the two facts the event does not carry (the code and the
contact id), and one new message kind on the existing edge `Mailer` port.

**Persistence:** JDBC only (invariant #1). **No migration in this slice** — the registry schema
(`V8`) and its configuration (`application.properties:99-100`) are already in place; the new
`booking` read port is a `JdbcClient` query over the existing `booking` table.

**Source of intent:** GitHub issue #371 (epic #367; ADR-0011 decision 5), as amended by the
issue-intake grill recorded at
[#371 comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/371#issuecomment-5093611774)
and the epic amendment at
[#367 comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/367#issuecomment-5093616191).

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake grill — surfaced the epic-vs-AC
idempotency conflict and split the admin surface out to #380); `riviera-plan-doc` (this structure);
`riviera-modulith` (edge-listener placement, the `api`-vs-`spi` rule → a plain inbound `api/` port,
and the ids-only event payload rule that keeps the booking code out of `event_publication`);
`riviera-java-conventions` (records for the port DTO and the mail payload, package-private edge
classes, `JdbcClient` text-block SQL, no Lombok); `codebase-design` (collapsed the tempting
"read everything through one fat booking port" seam — the event already carries venue/set/date/money,
and `venue.api.SetBookingFacts` already publishes venue name + set label, so the new port stays two
fields wide); `riviera-local-debug` (scoped test-run recipe). **Not loaded, deliberately:** `postgres`
(no migration — see Architecture), `riviera-stripe-payments` (no money moves), the frontend skills
(backend-only; the UI half is #380).

**Branch:** `feature/email-s3-booking-confirmation-mail` — exists.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a confirmed **Instant-mode guest** booking, when `BookingConfirmed` is
  published, then exactly one `BOOKING_CONFIRMATION` email is recorded for the booking's contact
  email, carrying the booking code, venue name, booking date, set location (row label + position)
  and the gross amount in minor units + currency. *Pinned by:*
  `BookingConfirmationMailIT.sendsOneConfirmationCarryingCodeVenueDateSetAndAmount`

- [ ] **AC-2:** Given a booking created while **signed in** (`booking.account_id` non-null), when it
  is confirmed, then the email goes to the booking's **guest-contact** email (the same resolution
  path as guest checkout — `account_id` is never consulted). *Pinned by:*
  `BookingConfirmationMailIT.sendsToTheBookingContactForASignedInBooking`

- [ ] **AC-3:** Given a booking confirmed through the asynchronous **payment** route — the tail shared by Request-mode pay-on-accept and the Stripe webhook —, when that path
  it confirms, then the same single confirmation email is produced, since both confirm paths publish from
  the one `ConfirmBooking` seam. *Pinned by:*
  `BookingConfirmationMailIT.sendsForABookingConfirmedViaThePaymentPath`

- [ ] **AC-4:** Given a `BookingConfirmed` publication that the registry has already **completed**,
  when outstanding publications are resubmitted, then no second email is produced. *Pinned by:*
  `BookingConfirmationMailIT.doesNotResendWhenACompletedPublicationIsResubmitted`

- [ ] **AC-5:** Given the running application, when its event-registry configuration is read, then
  `republish-outstanding-events-on-restart` is `true` and `completion-mode` is a bounded mode
  (`archive`), so the live publication table cannot grow without bound. *Pinned by:*
  `EventRegistryDurabilityIT.republishesOutstandingPublicationsOnRestart` + `.boundsTheLivePublicationTableByArchivingCompletions`

- [ ] **AC-6:** Given the confirmation listener, when the structural net runs, then module boundaries
  hold — the listener consumes an ids-only event from `booking::events` and reads through `api/`
  ports only, and no module gains a mail dependency. *Pinned by:* `ModularityTests`,
  `PublishedSurfacePlacementArchitectureTests`, `PackageShapeArchitectureTests`

- [ ] **AC-7:** Given a booking confirmation, when `MockMailer` records it, then the recorded
  `SentEmail` carries the new `BOOKING_CONFIRMATION` kind and its payload, **and the booking code
  appears in no log line** (invariant #7). *Pinned by:* `MockMailerTest.recordsBookingConfirmation`
  and `MockMailerTest.neverLogsTheBookingCode`

- [ ] **AC-8:** Given the real SMTP transport, when a booking confirmation is sent to a local sink,
  then the delivered message is plain text carrying the code/venue/date/spot/amount, with **no
  tracking markup** and no HTML part. *Pinned by:*
  `SmtpMailerIT.deliversBookingConfirmationOverSmtp` + `.neverLogsTheBookingCode`

## Non-goals

- **Any admin surface** — the mail-delivery view and the one-click resend are **#380**, split out of
  this slice's grill. This slice must not pre-build for it (no projection table, no admin endpoint).
- **Exactly-once delivery.** The accepted guarantee is at-least-once, deduplicated by the registry;
  see R-1.
- **A dedupe/ledger table or a `Message-ID` scheme** — rejected with reasons in Architecture and on
  the epic.
- **Cancellation / request-accepted / operator-approval mails** — later epic slices (#373, #374, #375).
- **Bounce & complaint suppression** — the epic's own suppression slice; see R-2.
- **Rendering the booking code anywhere new** beyond the email body itself.
- **Localization** — English only, per the epic.
- **The free-cancellation cutoff line in the email body** — deliberately excluded so mail copy stays
  decoupled from invariant #4/#10 policy.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. No existing surface is retired or reshaped; `SentEmail` gains a
component and `Mailer` gains a method, both additive (see R-5).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Duplicate email in the crash window** — the send succeeds, the process dies before the registry writes `completion_date`, and restart republication sends again | low | low | Accepted and documented as at-least-once, not defended against: no DB write around a non-transactional SMTP call can be exactly-once (Architecture). The operational lever for the *other* direction — "completed but the inbox is empty" — is #380, not a restart | Ivo | accepted — documented in Architecture + on #367 |
| R-2 | **Mail to an erasure tombstone** — a right-to-erasure scrub between confirmation and the async send leaves `CustomerLookup` returning `erased+<id>@erased.invalid` (ADR-0010), and we mail it | very low | low | Not guarded in this slice: `.invalid` is an RFC 2606 reserved TLD, so the message can never be delivered, and the race is seconds wide. The correct home for "never send to an address that cannot receive" is the epic's bounce/suppression slice, which needs the same check for hard-bounced addresses | Ivo | accepted — deferred to the epic's suppression slice |
| R-3 | **A new edge bean breaks `@ApplicationModuleTest` contexts** (`PayoutModuleTest`, module tests that bootstrap the root config) — a known repeat in this repo, and **full-suite-only**, so a scoped green run can hide it | med | med | Add the module tests to the scoped run for the listener phase, not just the new ITs; if a context fails, add the `@MockitoBean` the module test needs rather than weakening the listener | Ivo | **fired, fixed** — `PayoutModuleTest` needed `@MockitoBean` for the listener's three ports *and* for `CurrentCustomer` (a second-order effect of R-9's extraction: Modulith auto-supplies root-package beans, not another module's). It is the only `@ApplicationModuleTest` in the repo |
| R-9 | **The edge cannot host a listener on a module event** — five of seven modules import root-package types (`ApiProblem`, `CurrentOperator`, `CurrentCustomer`, `ObservabilityMetrics`), so `root → booking` closed `booking → root → booking` and `ModularityTests` went red. Pre-existing latent ADP violation, not a defect in this slice; it had held only because every earlier edge class happened to touch just `customer`/`operator`, the two modules that don't depend back. Blocks #373/#374 identically | — (materialised) | **high** | Extracted the four types into a `shared` **Shared Kernel** module (`type = OPEN`), restoring the composition-root rule: modules → `shared`, root → modules, **nothing → root**. Folded into this PR at the maintainer's explicit direction after the split-PR option was put and declined. Also removes the constraint for a future `notification` module, so listener placement can be decided on merits | Ivo | closed — `ModularityTests` + full structural net green |
| R-4 | **Existing booking ITs start firing an extra async listener**, adding nondeterminism to unrelated assertions | med | low | `MockMailer` only appends to an in-memory list, so the added work is inert; `Awaitility` is used only where the mail itself is asserted, following `PayoutAccrualIT`'s established pattern | Ivo | open |
| R-5 | **`SentEmail` gains a component**, so any construction site or exhaustive destructuring breaks | low | low | Tests use accessors only (`toEmail()`/`kind()`/`link()`), verified by grep across `src/test`; the record gains static factories so no caller writes the 4-arg canonical constructor | Ivo | open |
| R-6 | **Invariant #7 leak** — the booking code now travels through the edge, into `MockMailer`'s memory and an SMTP body | med | **high** | The code is never in the event payload (ids-only, so it never reaches `event_publication` — the reason this mail can ride the registry at all); never logged by `MockMailer` (AC-7) or `SmtpMailer`; and #380 carries a standing "never render the code in the admin UI" AC | Ivo | open |
| R-7 | **A booking cancelled between confirmation and the async send** still receives a "confirmed" email | low | low | Accepted: the event asserts what happened, and the listener deliberately does not re-gate on current status (re-reading status would make the mail depend on a race it cannot win). The cancellation email is #374's job | Ivo | accepted |
| R-8 | **Flyway collision** | n/a | n/a | Moot — this slice ships no migration. Highest on `main` is V30; all 10 open PRs are Dependabot frontend bumps | Ivo | closed — no migration in scope |

## Open questions / Assumptions

- **Assumption:** `venue.api.SetBookingFacts.setBookingInfo(setId)` remains the published source of
  venue name + set label, so no new `venue::api` surface is needed. Its own javadoc names "build the
  booking confirmation summary (venue name + set label)" as a purpose. — *Owner:* Ivo · *Resolves by:*
  phase 2 (the listener wires it; a compile failure falsifies it immediately)

### Resolved

- **Open question:** How is the send made idempotent, given the epic says `Message-ID` and the issue
  AC demands a test? → **Resolved 2026-07-27** (user decision, recorded on #371 and #367): the
  registry's `completion_date` is the record; no table, no `Message-ID` scheme. AC-4 tests it
  directly.
- **Open question:** Does the operational "resend on complaint" need to land here? → **Resolved
  2026-07-27**: no — split to **#380** so this slice stays backend-only (SDLC rule 1).
- **Open question:** Does the body carry the amount paid? → **Resolved 2026-07-27**: yes; the
  free-cancellation cutoff stays out.
- **Open question:** Does the structural net reject a root-package `@ApplicationModuleListener`? →
  **Resolved 2026-07-27** by reading `PublishedSurfacePlacementArchitectureTests:206-228` +
  `ArchitectureTestSupport:86-89`: `moduleOf` returns `null` at the root, and the rule only requires
  the *event* to live in its owner's `events` surface — which `booking.events.BookingConfirmed` does.
  `ApplicationModules.verify()` does not govern the root package at all.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The slice is read-only with respect to every booking/venue
table and writes nothing to `availability(set_id, booking_date)`. It reacts *after* confirmation has
already committed (`AFTER_COMMIT`), reads two columns from `booking`, and sends an email. No claim,
no release, no staff mark, no new write path. The `(set, date)` uniqueness guarantee and the
`AvailabilityClaim` port are untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns booking codes and the customer link — the two facts `BookingConfirmed` deliberately does not carry. Gains one read port; no behavior change |
| M-2 | `venue` | existing | `Venue`, `BeachMap` | Already publishes venue name + set label via `SetBookingFacts` → `SetBookingInfo`. **Unchanged — consumed, not modified** |
| M-3 | `customer` | existing | `Customer` | Already publishes guest-contact resolution via `CustomerLookup`. **Unchanged — consumed, not modified** |
| M-4 | — (platform edge, root package) | existing | n/a | Mail composition and dispatch live at the edge and never inside a module (RV-BE-11, epic #367). The listener, the `Mailer` kind and the body text all land here |
| M-5 | `shared` | **new** — not a bounded context | none | The Shared Kernel forced by R-9: `ApiProblem`, `CurrentOperator`, `CurrentCustomer`, `ObservabilityMetrics` move out of the root so the root can go back to being purely a composition root. `type = OPEN` (technical shared code, no published surface); may depend only on `customer::api` + `operator::api`, the two modules that don't depend back |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` | **new** `BookingNotificationFacts#notificationInfo(BookingId)` | `booking.vocabulary.BookingNotificationInfo(String code, CustomerId customerId)` | the platform edge |
| NI-2 | `venue.api` | existing `SetBookingFacts#setBookingInfo(SetId)` | `venue.vocabulary.SetBookingInfo` | the platform edge (new consumer) |
| NI-3 | `customer.api` | existing `CustomerLookup#findById(CustomerId)` | `customer.vocabulary.GuestContact` | the platform edge (new consumer) |

> NI-1 is an inbound "call-me" port implemented by `booking`'s own `adapter/out` → `api/`, **not**
> `spi/` (the `api`-vs-`spi` rule). It is deliberately two fields wide: the event already carries
> `venueId`, `setId`, `bookingDate`, `amountMinor` and `currency`, and those are **immutable facts of
> the confirmation**, so re-reading them would add coupling without adding truth (the same reasoning
> that keeps the mutable commission rate *off* `BookingConfirmed` and on `venue::api`).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` | `{ bookingId, venueId, setId, bookingDate, amountMinor, currency }` — **unchanged** | `payout` (existing), **the platform edge (new)** | async `AFTER_COMMIT`, registry-backed | `BookingConfirmationMailIT`, `PayoutAccrualIT` (unchanged) |

> **The payload is not widened.** Putting the booking code on the event is the tempting fix and is
> forbidden: the registry serializes payloads into `event_publication` as text and retains them under
> `archive` completion mode, so a code in the payload would be a bearer credential persisted in
> cleartext — the same reasoning that kept recovery mail off the registry entirely (#369, ADR-0011
> decision 5). The code is read through NI-1 at send time instead; the *payload* stays ids-only even
> though the *rendered body* is not.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Hold the edge types bounded contexts share (error contract, principal accessors, metric names) | `shared` | Not a bounded context and owns no aggregate — a Shared Kernel (Evans ch. 14). It cannot stay at the root: the root is the composition root and **depends on** modules, so hosting types modules depend on closes cycles by construction (R-9). Admission rule written into `RESPONSIBILITIES.md`: no business logic, no module-owned state, no dependency on a module that depends back |
| Resolve a booking's arrival code + contact id from a `BookingId` | `booking` | `booking` Job: owns "bookings, booking codes"; the customer link is `booking.customer_id`. Not `customer` — its Not-My-Job list rejects owning booking facts |
| Provide venue name + set label for a set | `venue` | `venue` Job: owns the beach map and set positions. Already published on `SetBookingFacts`; **no new surface** |
| Resolve a `CustomerId` to a contact email | `customer` | `customer` Job: "tourist identity: guest-checkout contact". Not `booking` — booking holds the id, never the PII |
| Compose and send the confirmation email | **the platform edge** | Epic #367's locked seam decision and RV-BE-11: "mail composition stays at the platform edge; modules never touch mail." No module gains a `Mailer` dependency — pinned by AC-6 |
| Decide *whether* to send | **the platform edge** | The trigger is a published fact (`BookingConfirmed`); the edge subscribes. `booking` neither knows nor cares that mail exists |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves.** No charge, refund, commission or ledger arithmetic is added or changed.
The email *renders* the already-settled gross from the event payload — integer minor units + ISO
currency (invariant #5), formatted for display at the edge only, never re-computed. The payout
listener on the same event is untouched (`PayoutAccrualIT` must stay green, and AC-6's structural run
plus that IT are the guard).

## Angular — frontend surfaces touched

**N/A — backend-only.** The user-visible half of this epic slice is an email, not a screen; the only
frontend work in the epic's neighbourhood is #380's admin console tab, which is a separate slice with
its own Playwright coverage.

## FE↔BE contract

**N/A — no contract change.** No endpoint is added, removed or reshaped; no DTO crosses the wire.

## Execution status

> **This section is the session-recovery anchor.** Long sessions get compacted
> (summarized) and lose fine-grained state; a fresh session starts with none.
> Everything a resuming session needs lives HERE, committed — never only in the
> conversation. After a context compaction, in a fresh session, or whenever unsure
> where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window
> as the change it records — at every phase boundary AND every SDLC stage
> transition (plan → implement → CI → PR → review → sonar → merge).
>
> **Finalize this section BEFORE the merge, in the PR's own last commit** — stage pointer
> DONE, every phase row ✅ with its commit, Open Questions empty, every risk row closed with
> its outcome, AC pin-names matching the tests that shipped. Record **`merged via PR #NN`,
> never a merge SHA**.

**Stage pointer:** `implement (phase 3) — phases 0–2 done, plus the unplanned phase 2b (shared-kernel extraction, R-9)`

**Next action:** Finish phase 3 close-out (AC verification table + self-review checklist), then open the PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `booking::api` notification-facts read port | ✅ | see `feat(#371): publish booking's notification-facts read port` |
| 1 — `Mailer` grows the booking-confirmation kind (mock + SMTP) | ✅ | see `feat(#371): add the booking-confirmation message kind to the Mailer port` |
| 2 — the edge listener on `BookingConfirmed` | ✅ | see `feat(#371): mail the booking code on BookingConfirmed from the platform edge` |
| 2b — **shared-kernel extraction** (unplanned; R-9) | ✅ | see `refactor(#371): extract the shared kernel out of the composition root` |
| 3 — registry-config pinning + structural net + close-out | ⏳ | `EventRegistryDurabilityIT` written and green; close-out pending |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend — `booking` module**

- `platform/src/main/java/ai/riviera/platform/booking/api/BookingNotificationFacts.java` — **new**;
  the published read port (NI-1)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/BookingNotificationInfo.java` —
  **new**; its record `(String code, CustomerId customerId)`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingNotificationFacts.java` —
  **new**; package-private `JdbcClient` adapter
- `platform/src/main/java/ai/riviera/platform/booking/api/package-info.java` — modify; the surface
  javadoc names one port today

**Backend — the platform edge (root package)**

- `platform/src/main/java/ai/riviera/platform/Mailer.java` — modify; add
  `sendBookingConfirmation(String, BookingConfirmationMail)`
- `platform/src/main/java/ai/riviera/platform/BookingConfirmationMail.java` — **new**; the edge
  payload record
- `platform/src/main/java/ai/riviera/platform/SentEmail.java` — modify; new `Kind`, a payload
  component, static factories
- `platform/src/main/java/ai/riviera/platform/MockMailer.java` — modify; record the kind, log without
  the code
- `platform/src/main/java/ai/riviera/platform/SmtpMailer.java` — modify; render + send the plain-text
  body
- `platform/src/main/java/ai/riviera/platform/BookingConfirmationMailListener.java` — **new**; the
  `@ApplicationModuleListener`

**Tests**

- `platform/src/test/java/ai/riviera/platform/BookingConfirmationMailIT.java` — **new**; AC-1..AC-4
- `platform/src/test/java/ai/riviera/platform/EventRegistryDurabilityIT.java` — **new**; AC-5
- `platform/src/test/java/ai/riviera/platform/MockMailerTest.java` — modify; AC-7
- `platform/src/test/java/ai/riviera/platform/SmtpMailerIT.java` — modify; AC-8
- `platform/src/test/java/ai/riviera/platform/booking/...` — **new** port test for phase 0

---

## Phase 0 — `booking::api` confirmed-booking read port

**Files:** Create `booking/api/BookingNotificationFacts.java`, `booking/vocabulary/BookingNotificationInfo.java`,
`booking/adapter/out/JdbcBookingNotificationFacts.java` · Modify `booking/api/package-info.java` · Test a new IT

- [ ] **Step 1: Write the failing test** — an IT that creates a booking through the existing fixture
  and asserts `BookingNotificationFacts.notificationInfo(bookingId)` returns its code and the `CustomerId` the
  booking was created against, and `Optional.empty()` for an unknown id.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*JdbcBookingNotificationFactsIT*"` → FAIL (no such type)
- [ ] **Step 3: Minimal implementation** — the port, the record, and a `JdbcClient` text-block
  `SELECT code, customer_id FROM booking WHERE id = :id`, package-private adapter.
- [ ] **Step 4: Run it, verify it passes** → PASS
- [ ] **Step 5: Structural check** — `./gradlew test --tests "*ModularityTests*" --tests "*PackageShape*" --tests "*PublishedSurfacePlacement*"`
- [ ] **Step 6: Commit** — `feat(#371): publish booking's confirmed-booking read port (code + contact id)`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `Mailer` grows the booking-confirmation kind

**Files:** Create `BookingConfirmationMail.java` · Modify `Mailer.java`, `SentEmail.java`,
`MockMailer.java`, `SmtpMailer.java` · Test `MockMailerTest`, `SmtpMailerIT`

- [ ] **Step 1: Write the failing tests** — `MockMailerTest.recordsBookingConfirmation`,
  `MockMailerTest.neverLogsTheBookingCode` (assert via a captured log appender), and
  `SmtpMailerIT.deliversBookingConfirmationOverSmtp` + `.neverLogsTheBookingCode` against the existing local sink.
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*MockMailerTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — the port method, the payload record, the new `Kind`, the
  `SentEmail` factories, kind-aware logging in `MockMailer`, the `SmtpMailer` text block.
- [ ] **Step 4: Run them, verify they pass** — plus `--tests "*Mailer*"` for the mailer regression set.
- [ ] **Step 5: Generalization-audit pass** — search every `Mailer` implementation and every
  `SentEmail` construction site; confirm no third implementation and no canonical-constructor caller
  was missed.
- [ ] **Step 6: Commit** — `feat(#371): add the booking-confirmation message kind to the Mailer port`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — the edge listener on `BookingConfirmed`

**Files:** Create `BookingConfirmationMailListener.java`, `BookingConfirmationMailIT.java`

- [ ] **Step 1: Write the failing tests** — AC-1 through AC-4. AC-4 follows `PayoutAccrualIT`'s
  no-second-effect pattern (`Awaitility.await().during(...)` after resubmitting outstanding
  publications) rather than asserting on a timer.
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*BookingConfirmationMailIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — the listener: read NI-1 for code + contact id, NI-2 for
  venue name + set label, NI-3 for the email; compose `BookingConfirmationMail` from those plus the
  event's own date/amount/currency; send. Missing booking or missing contact → log and return (never
  throw a permanently-failing listener into the registry's retry loop).
- [ ] **Step 4: Run them, verify they pass** — then the async-neighbours regression set:
  `--tests "*BookingConfirmationMailIT*" --tests "*PayoutAccrualIT*" --tests "*PayoutModuleTest*"` (R-3, R-4).
- [ ] **Step 5: Generalization-audit pass** — every other `BookingConfirmed` subscriber, and whether
  any other edge listener should exist yet (it should not — #373/#374 are separate slices).
- [ ] **Step 6: Commit** — `feat(#371): mail the booking code on BookingConfirmed from the platform edge`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — registry-config pinning, structural net, close-out

**Files:** Create `EventRegistryDurabilityIT.java` · Modify the plan doc

- [ ] **Step 1: Write the failing test** — AC-5, asserting both registry properties from the running
  context so a future edit cannot silently unbound the publication table.
- [ ] **Step 2: Run it, verify it fails** if the assertion is wrong; then implement/confirm → PASS.
- [ ] **Step 3: Full structural net** — `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*ResponsibilitiesArchitectureTests*"`
- [ ] **Step 4: Acceptance-criteria verification** — fill the section below with real commands + SHAs.
- [ ] **Step 5: Commit** — `test(#371): pin the event-registry durability configuration`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-27 | phase 1 — new `Mailer` method | every `Mailer` implementation | `grep -rn "implements Mailer\|new Mailer()" platform/src` | 3 — `MockMailer`, `SmtpMailer`, the `WebSliceStubs` anonymous bean | Fixed all 3. The `WebSliceStubs` break is the repo's recurring "new edge dep breaks `@WebMvcTest`" pattern and surfaced as a `compileTestJava` failure, not a runtime one |
| 2026-07-27 | phase 1 — `SentEmail` gained a component (R-5) | canonical-constructor callers | `grep -rn "new SentEmail(" platform/src` | 2 — both inside `SentEmail`'s own factories | No action; the static factories mean no external caller writes the 4-arg form. R-5 closed |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*BookingConfirmationMailIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Same run, `sendsToTheBookingContactForASignedInBooking` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Same run, `sendsForABookingConfirmedViaThePaymentPath` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Same run, `doesNotResendWhenACompletedPublicationIsResubmitted` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `./gradlew test --tests "*EventRegistryDurabilityIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run the phase-3 step-3 structural command → all PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `./gradlew test --tests "*MockMailerTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-8:** Run `./gradlew test --tests "*SmtpMailerIT*"` → PASS (skips cleanly without Docker). Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified — read-only slice); no new write path.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched, no reservation logic in scope.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payload unchanged and id-based (invariant #11).
- [ ] **Payment/payout** section filled (N/A justified); `PayoutAccrualIT` still green.
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct: the booking date is rendered as the `Europe/Tirane` `LocalDate` the event carries (invariant #6); no JVM-default zone use.
- [ ] Booking codes unguessable (invariant #7) — generation untouched; the code is never logged and never enters the event payload / `event_publication`.
- [ ] Flyway migration present for schema changes — **N/A, no schema change** (invariant #12).
- [ ] **Frontend** standards — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
