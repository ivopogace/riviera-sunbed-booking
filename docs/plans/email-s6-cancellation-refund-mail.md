# Email S6 — Cancellation / refund confirmation email — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A cancelled booking mails its tourist exactly one record of the cancellation —
why it happened and the server-computed refund amount (or that none applies) — driven by
the one `BookingCancelled` event, so every cancellation channel is covered by construction.

**Architecture:** The registry vehicle again (ADR-0011 decision 5: an ids-only payload rides
the Event Publication Registry), so the slice is `BookingConfirmationMailListener`'s twin —
a second `notification` driving adapter on the mail bulkhead. The one significant decision is
that the twin is **not** written twice: both listeners need the same three facts from the same
three modules' ports, so the assembly moves inside the hexagon as
`BookingMailFactsService` returning a typed outcome, and each listener keeps only what
differs — the mail it builds and the loss it counts. That is what makes a near-verbatim second
listener (and the Sonar duplicated-block it would be) unnecessary rather than merely tolerated.

**Persistence:** JDBC only (invariant #1). **No migration** — this slice adds no table, no
column and no `event_type` rewrite. Latest applied version on `main` is `V35`; nothing here
claims `V36`.

**Source of intent:** GitHub issue **#374** (`[Email S6]`), under epic **#367**
(`docs/adr/ADR-0011-transactional-email-scaleway-tem.md`, decision 5).

**Skills consulted:**
- `riviera-sdlc` — routed the gate; recorded the cloud-branch substitution below.
- `riviera-plan-doc` — this doc's shape; forced the behavior-parity ledger for the phase-1 refactor.
- `riviera-modulith` — kept the new listener a driving adapter in `adapter/in`, the assembly in
  `application`; confirmed `BookingCancelled` is already in `booking::events` and every grant the
  slice needs (`booking::events`/`::vocabulary`, `venue::api`, `customer::api`) is already declared,
  so `allowedDependencies` does **not** change.
- `riviera-java-conventions` — sealed outcome + record-deconstruction `switch` over the resolver
  result instead of three nested `Optional.isEmpty()` early returns; named reason vocabulary rather
  than repeated string literals; one-line-or-no inline comments.
- `codebase-design` — applied the deletion test to `BookingMailFactsService`: deleting it puts
  three port reads plus the reason vocabulary back into two (soon three, #373) listeners, so the
  seam earns its keep; it stays module-internal, not a published port.
- `riviera-stripe-payments` — confirmed the slice renders a refund **decision** and moves no money;
  no Connect, no gateway call, no ledger write. Produced risk R-3.
- `riviera-local-debug` — to be loaded before the session's first `./gradlew` (phase 1).

**Branch:** cloud session — the designated remote branch **`claude/sdlc-374-whbejt`** stands in
for `feature/email-s6-cancellation-refund-mail` (riviera-sdlc §Remote/cloud addendum). It exists
and is level with `origin/main`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `CONFIRMED` booking with a guest contact, when `BookingCancelled` is
      published after commit, then exactly one cancellation mail is recorded to that contact's
      address carrying the booking code, venue, date and the event's refund amount.
      *Pinned by:* `BookingCancellationMailIT.mailsTheGuestOneCancellationRecord`
- [ ] **AC-2:** Given a cancellation whose server-computed refund is `0` minor units (cancelled
      after the invariant-#4 cutoff, ADR-0005 tier `NONE`), when the mail is sent, then it states
      that no refund applies and names no amount.
      *Pinned by:* `SmtpMailerIT.rendersNoRefundWhenNothingIsReturned`
- [ ] **AC-3:** Given the same event delivered through each cancellation channel — tourist
      self-service (`RefundReason.POLICY`) and admin weather refund (`RefundReason.WEATHER`) —
      then both produce a mail, and the body states which of the two happened.
      *Pinned by:* `BookingCancellationMailIT.coversBothCancellationChannels`,
      `SmtpMailerIT.namesTheCancellationReason`
- [ ] **AC-4:** Given a rendered cancellation mail, then every amount is derived from integer minor
      units + the ISO currency and no floating-point type appears on the path (invariant #5).
      *Pinned by:* `SmtpMailerIT.rendersTheRefundFromMinorUnits`
- [ ] **AC-5:** Given an outstanding publication for the cancellation listener, when
      `IncompleteEventPublications` resubmits (what `republish-outstanding-events-on-restart` does
      at boot), then no second mail is produced for an already-completed publication.
      *Pinned by:* `BookingCancellationMailIT.resubmissionProducesNoSecondMail`
- [ ] **AC-6:** Given the mail transport throws, when the listener runs, then the exception
      propagates so the publication stays outstanding — and given the *cancellation transaction*,
      then it has already committed, so no mail outcome can affect the cancellation or its refund.
      *Pinned by:* `BookingCancellationMailListenerTest.aTransportFailurePropagates`,
      `BookingCancellationMailIT.mailsTheGuestOneCancellationRecord` (AFTER_COMMIT phase)
- [ ] **AC-7:** Given the recipient's address is on the suppression list, when the listener runs,
      then no send is attempted and the listener completes normally (no permanent retry loop).
      *Pinned by:* `TransactionalMailServiceTest.aSuppressedAddressSkipsTheCancellation`
- [ ] **AC-8:** Given any one of the booking, set or contact does not resolve, then the listener
      returns normally, increments `riviera.mail.cancellation.abandoned` under the matching
      `reason` tag, and logs one `ERROR` carrying ids only.
      *Pinned by:* `BookingCancellationMailListenerTest.aMissing{Booking,Set,Contact}IsCountedAndAbandoned`
- [ ] **AC-9:** Given the module's structural net, then the new listener is
      `@Async(MAIL_EXECUTOR)` + `@TransactionalEventListener` at `AFTER_COMMIT`, its id falls under
      the notification listener-id prefix (so #405's admin re-drive scopes it), and
      `ApplicationModules.verify()` still passes.
      *Pinned by:* `MailListenerExecutorArchitectureTest.theRuleExaminesBothProductionListeners`,
      `MailOutboxScopeTest.scopesTheCancellationListener`, `ModularityTests`
- [ ] **AC-10:** Given the mock transport, then it records the new kind with its fields verbatim and
      logs no arrival code (invariant #7); given the SMTP transport, then the body carries no
      tracking pixel or rewritten link (ADR-0011 §25-TDDDG).
      *Pinned by:* `MockMailerTest.recordsTheCancellation`, `SmtpMailerIT.carriesNoTrackingMarkup`

## Non-goals

- **No new cancellation channel.** The slice adds a listener, never a way to cancel.
- **No refund-settlement mail.** The mail reports the refund *decision* carried on the event, not
  Stripe's confirmation that money landed (see R-3). A "your refund has settled" mail is not this
  slice, and no such event exists.
- **No withheld-mail disclosure on the read model.** `booking.spi.ConfirmationMailDelivery` (#390)
  stays confirmation-only; no cancellation twin, and no change to `booking`'s published surface.
- **No `MailSender` (`notification::api`) change.** This is a module-internal registry-vehicle mail,
  exactly like the confirmation; the edge does not drive it.
- **No admin per-booking resend.** That is #380.
- **No mail for `DECLINED` / `EXPIRED` request bookings.** Those are different statuses that publish
  no `BookingCancelled`; #373 owns the request-mode mail.
- **No HTML/localisation.** Plain-text English v1 (ADR-0011).
- **No frontend change.**

## Behavior-parity ledger

> Phase 1 refactors the **shipped** `BookingConfirmationMailListener` onto the extracted resolver.
> That is a replacement of an existing surface, so every behavior it has today is enumerated here.

| Old-surface behavior (`BookingConfirmationMailListener`, #371/#383/#410/#428) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Reads booking facts, then set, then contact — **in that order**, short-circuiting | preserved | `BookingMailFactsService.resolve` performs the identical ordered reads; order is asserted so a missing booking still never triggers the set/contact reads |
| Skips (returns normally) on a missing booking / set / contact | preserved | resolver returns `BookingMailFacts.Missing(fact)`; the listener's `switch` abandons |
| Counts `riviera.mail.confirmation.abandoned` with `reason=no-booking\|no-set\|no-contact` | preserved | same metric name, same three tag values — now sourced from the shared `MissingBookingFact` vocabulary instead of three local string constants |
| Logs one unthrottled `ERROR` per abandonment carrying booking + set ids, never the code/address | preserved | `abandon(...)` stays on the listener (its wording is confirmation-specific) |
| Class, method name and parameter type unchanged → registry `listener_id` still reads as V31 | preserved | only the constructor's parameter list changes; the id embeds FQCN + method + **parameter type**, none of which move. Re-pinned by `RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated` (untouched) |
| `@Async(MAIL_EXECUTOR)` + `@TransactionalEventListener`, no `@Transactional` | preserved | annotations untouched; `RegistryMailBulkheadIT#sendsWithNoTransactionHeldOpen` still asserts the connection is unbound |
| Transport failure propagates (publication stays outstanding) | preserved | the send call is unchanged and still outside any catch |
| Builds `BookingConfirmationMail` from event + resolved facts | preserved | same record, same five resolved fields |
| Injects `BookingNotificationFacts`, `SetBookingFacts`, `CustomerLookup` directly | **changed** | now injects `BookingMailFactsService` + `TransactionalMailService` + `MeterRegistry`. Deliberate: the three port reads belong inside the hexagon, and `BookingConfirmationMailListenerTest` is rewritten to stub the resolver. No production behavior depends on the injection shape |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Refactoring a **shipped** listener (phase 1) silently changes its registry `listener_id`, dead-lettering every outstanding confirmation publication | low | high | The id embeds FQCN + method name + parameter type only — none change. Phase 1 touches the constructor and body, and leaves `RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated` + `BookingMailFixtures.LISTENER_ID` (value untouched) as the pin | agent | open |
| R-2 | The new listener reaches for `@ApplicationModuleListener` (the obvious spelling) and lands the send on Boot's shared pool — the money-path spine (invariants #8/#9) | med | high | `MailListenerExecutorArchitectureTest` already fails this by construction and was written naming #374; phase 3 additionally extends its non-vacuity guard to name **both** listeners | agent | open |
| R-3 | The mail promises a refund the async `BookingRefundListener` may then fail to issue (`riviera.refunds.failed`), so the tourist holds a written record of money that never moved | med | med | Accepted and made explicit in the copy: the mail states the refund **decision** and that it is being returned to the original payment method, never that it has settled. The existing `REFUNDS_FAILED` counter + money-path alert remains the detection path. Recorded as a Non-goal, not silently glossed | maintainer | open |
| R-4 | A venue-wide weather refund cancels N bookings in one transaction, publishing N events that all land on the 2-thread/200-deep registry pool at once — a shed (`riviera.mail.registry.shed`) drops mails from the queue | low | med | The bulkhead is designed for exactly this and the shed is durable: a shed send never runs, so its publication stays outstanding (`RegistryMailShedDurabilityIT`) and #405's admin re-drive or the restart republish recovers it. Realistic N is one venue's online sets (tens), well under the 200-deep queue. No new mitigation; verified, not assumed | agent | open |
| R-5 | Near-verbatim second listener trips SonarCloud's **0 duplicated blocks** merge bar, blocking the PR after the build is done | med | med | Pre-empted by design: the duplicated part (three port reads + reason vocabulary + field/constructor block) is extracted in phase 1 *before* the second listener exists in phase 3 | agent | open |
| R-6 | Rendering the refund reintroduces floating point (`double`/`BigDecimal` euros) on the money path (invariant #5) | low | high | Reuse `SmtpMailer.formatAmount` verbatim — integer minor units → `BigDecimal.movePointLeft` at the display edge only, exponent from `Currency`, `RoundingMode.UNNECESSARY`. AC-4 pins it | agent | open |
| R-7 | The mail leaks the arrival code into a log line (invariant #7) | low | med | The code is mailed (a decision the maintainer took, see Resolved Q-2) but never logged: `MockMailer`'s cancellation branch follows the confirmation branch's no-code rule, `SmtpMailer` logs nothing, and the abandon line carries ids only. `MockMailerTest` asserts the absence | agent | open |
| R-8 | `booking` later adds a fourth `RefundReason` and the mail renders a blank or wrong opening line | low | low | The transport switches **exhaustively** over the published enum with no `default`, so a new constant is a compile error in this module rather than a silent blank | agent | open |

## Open questions / Assumptions

- **Assumption:** `notification` may consume `booking.vocabulary.RefundReason` directly rather than
  mapping it to a module-local enum — it is published vocabulary and the grant already exists.
  *Owner:* agent · *Resolves by:* phase 2 (`ModularityTests` settles it).
- **Assumption:** No operator-initiated single-booking cancel channel needs covering, because none
  exists — see Resolved Q-3. *Owner:* agent · *Resolves by:* phase 4 (the IT enumerates the two real
  publishers).

### Resolved

- **Q-1 — Should the mail say *why* it was cancelled?** → **Yes, reason-specific copy.** Maintainer
  decision, 2026-07-30 (this session, `AskUserQuestion`): a `WEATHER` cancellation is one the tourist
  never asked for, so a channel-neutral body would read as an unexplained loss. The opening line
  branches on `RefundReason`; the refund line does not.
- **Q-2 — Should the mail repeat the 8-char booking code?** → **Yes, as the reference.** Maintainer
  decision, 2026-07-30 (same round): it identifies *which* booking when a tourist holds several, the
  confirmation mail already sent that code to the same address, and the code unlocks nothing once the
  booking is `CANCELLED`. Invariant #7 bars logging it, not mailing it (R-7 holds the logging line).
- **Q-3 — Does the issue's "operator" cancellation channel exist?** → **No — issue drift, harmless.**
  Grep of `BookingCancelled` publishers finds exactly two: `CancelBookingService` (tourist
  self-service, `POLICY`) and `WeatherRefundService` (admin/operator weather, `WEATHER`).
  `RefundReason.CONFLICT` is admitted by the V14 CHECK as a closed value set but is not exercised in
  v1. Listening to the event covers every publisher present *and* future, which is exactly the issue's
  stated intent, so no AC changes — AC-3 enumerates the two that exist and R-8 covers a third arriving.
- **Q-4 — Reuse `riviera.mail.confirmation.abandoned` for the cancellation listener's giving-up?**
  → **No; a sibling counter, `riviera.mail.cancellation.abandoned`.** Tagging the shipped series with
  a `kind` would leave a metric *named* `confirmation` counting cancellations, and the repo's standing
  rule (#442, `MailKind` Javadoc) is that a shipped metric name is never renamed because renaming
  breaks whatever reads it. The #442 lesson that *does* apply is the anti-drift one — so the two
  series share one `reason` vocabulary (`MissingBookingFact`) rather than two spellings of
  `no-booking`. Resolved at plan time; runbook records both halves.

## Availability & concurrency (invariant #2)

**This slice performs no availability write and holds no lock.** It is stated rather than waved at,
because the feature sits directly downstream of a release:

- **Write paths to `availability(set_id, booking_date)` in scope:** **none.** The release already
  happened — `CancelBookingService` / `WeatherRefundService` call `AvailabilityClaim.release(...)`
  *synchronously inside the cancelling transaction*, before the event is published. This listener
  runs at `AFTER_COMMIT`, so by the time it exists the row is already free.
- **Uniqueness guarantee:** unchanged (the `(set_id, booking_date)` unique constraint); nothing here
  claims, releases or reads that table.
- **Concurrency strategy:** none needed. The listener's three reads are independent, read-only
  queries against already-settled state, and — deliberately, per #383 — run under **no transaction
  at all**, so no Hikari connection is pinned across the SMTP round-trip.
- **Pool rule (invariant #3):** not applicable; no set is selected or claimed.
- **Cutoff rule (invariant #4):** applied upstream, not here. The cutoff decided the refund tier
  (`CancellationPolicy.quote`) whose result rides the event as `refundMinor`; the mail renders that
  number and never recomputes it (invariant #10 — server-side, one owner).
- **The concurrency property that *is* this slice's:** exactly-one-mail under registry
  republication. Guaranteed by the Event Publication Registry alone (completion marked on normal
  return; only NULL-`completion_date` rows are resubmitted) — no dedupe table, the same accepted
  at-least-once contract #371 documented. *Pinning test:*
  `BookingCancellationMailIT.resubmissionProducesNoSecondMail`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns `email_suppression` state, no aggregate) | Owns transactional-mail delivery end-to-end (#382): the transports, both ADR-0011 vehicles, and the driving listeners. A cancellation mail is delivery, nothing else |
| M-2 | `shared` | existing | none (OPEN kernel) | One added `ObservabilityMetrics` constant. Admissible by the kernel's own test: a metric name is no business logic, no module state, no back-dependency |
| M-3 | `booking` | existing | `Booking` | **Read-only.** Consumed via `booking::events` (`BookingCancelled`), `booking::api` (`BookingNotificationFacts`) and `booking::vocabulary` (`RefundReason`). **No change to any booking file** |
| M-4 | `venue`, `customer` | existing | `Venue`, `Customer` | Read-only via `venue::api` / `customer::api`, unchanged |

**No `allowedDependencies` change.** `notification`'s grant list already carries every surface the
new listener touches (`booking::api`, `booking::events`, `booking::vocabulary`, `customer::api`,
`customer::vocabulary`, `venue::api`, `venue::vocabulary`, `shared`) — the confirmation listener
established all of them.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` | `BookingNotificationFacts#notificationInfo(BookingId)` | `BookingNotificationInfo` | `notification` (existing consumer; second call site) |
| NI-2 | `venue.api` | `SetBookingFacts#setBookingInfo(SetId)` | `SetBookingInfo` | `notification` (existing; second call site) |
| NI-3 | `customer.api` | `CustomerLookup#findById(CustomerId)` | `GuestContact` | `notification` (existing; second call site) |

No port is added, widened or published. `BookingMailFactsService` is a module-**internal**
collaborator in `application`, not a published surface — deliberately, per `codebase-design`: one
implementation, no cross-module caller, so publishing it would be a hypothetical seam.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` (**existing, unchanged**) | `booking` | `{ bookingId, venueId, setId, bookingDate, refundMinor, currency, reason }` | `payout` (reversal), `booking` (refund), **+ `notification` (this slice)** | async `AFTER_COMMIT`, on the mail bulkhead executor | `BookingCancellationMailIT`, `MailListenerExecutorArchitectureTest` |

The payload is already ids-only plus immutable cancellation facts, so **no event change is needed**
and no Flyway `event_type` rewrite applies. The arrival code is *not* on the payload (invariant #7 —
the registry persists payloads as text) and is read at send time through NI-1, exactly as #371 does.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Deliver a cancellation/refund mail on `BookingCancelled` | `notification` | Its **Job**: transactional-mail delivery + the driving listener for the registry vehicle. Explicitly **not** `booking` — `RESPONSIBILITIES.md` puts "deciding whether a confirmation email will be sent, or knowing any address → `notification`" on booking's Not-My-Job list, and RV-BE-11 keeps mail out of every module but this one |
| Assemble the facts a booking mail renders from three modules' ports | `notification` (`application`) | Composition of *other* modules' published reads is the consumer's job, not the providers'. It sits in `application` rather than `adapter/in` so the driving adapter stays thin (ADR-0007 inside/outside asymmetry) |
| Decide the refund amount and reason | `booking` — **unchanged, not this slice** | `booking` Job: cancellation-policy enforcement (invariant #10). This slice only *renders* what the event already carries; re-deriving it here would be the decision-vs-execution split inverted |
| Count a cancellation mail abandoned for missing facts | `notification` emits, `shared` names | Matches the #428 precedent and `RESPONSIBILITIES.md`'s rule that the module doing the thing emits the metric while `ObservabilityMetrics` holds the name |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Untouched.
- **Money that moves in this slice:** **none.** No gateway call, no `RefundPort` call, no ledger
  read or write. The refund is issued by `booking`'s own `BookingCancelled` listener and reversed in
  `payout` by theirs; this is a third, independent subscriber to the same event.
- **Confirmation trigger:** unchanged (signature-verified webhook, invariant #8) — not in scope.
- **Idempotency:** the mail's, not money's — Event Publication Registry completion (AC-5). The
  refund's own idempotency key is `booking`'s, untouched.
- **Money rendering:** integer minor units + ISO currency straight off the event, converted to a
  display string only inside `SmtpMailer.formatAmount` (exponent from `Currency`,
  `RoundingMode.UNNECESSARY`). `MockMailer` records the minor units verbatim. No `double` anywhere
  (AC-4, R-6).
- **Payout-ledger effect:** none from this slice; `payout`'s reversal is a sibling subscriber.
- **Refund policy applied:** server-side and upstream — `CancellationPolicy.quote` (free before the
  invariant-#4 cutoff, partial/none after, ADR-0005) for `POLICY`; full-regardless-of-cutoff for
  `WEATHER`. The mail is a **read** of that decision (R-3 records that it is a decision, not a
  settlement).
- **Pinning tests:** `SmtpMailerIT.rendersTheRefundFromMinorUnits`,
  `SmtpMailerIT.rendersNoRefundWhenNothingIsReturned`, `BookingCancellationMailIT` (asserts the
  mailed amount equals the event's `refundMinor`).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is added or altered.

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

**Stage pointer:** `implement (phase 4)` — draft PR **#445** open, so every push is CI-gated.

**Next action:** Phase 4 — `BookingCancellationMailIT`, the end-to-end registry path against
Postgres (both channels, idempotency under republication, suppression).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ✅ | `8acf653` · draft PR #445 |
| 1 — Shared booking-mail fact resolver (+ confirmation listener refactor) | ✅ | `5cd3f37` |
| 2 — Transport: the cancellation message kind | ✅ | `5155745` |
| 3 — Chokepoint + the cancellation listener | ✅ | `PHASE3SHA` |
| 4 — End-to-end registry IT | | |
| 5 — Docs: runbook, RESPONSIBILITIES, CLAUDE.md | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Production — new**

- `platform/src/main/java/ai/riviera/platform/notification/application/BookingMailFacts.java` —
  sealed outcome: `Resolved(toEmail, bookingCode, venueName, rowLabel, positionNo)` | `Missing(fact)`.
- `platform/src/main/java/ai/riviera/platform/notification/application/MissingBookingFact.java` —
  the shared reason vocabulary (`NO_BOOKING`/`NO_SET`/`NO_CONTACT` + `tagValue()` + `TAG = "reason"`),
  shaped after `MailKind` so the two abandon counters cannot drift into two spellings.
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingMailFactsService.java` —
  the ordered three-port resolve behind one method.
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingCancellationMail.java` —
  `(bookingCode, venueName, bookingDate, refundMinor, currency, reason)`, structured not pre-rendered.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingCancellationMailListener.java` —
  the second registry driving adapter.

**Production — modified**

- `.../notification/application/Mailer.java` — add `sendBookingCancellation`.
- `.../notification/application/TransactionalMailService.java` — add the registry-vehicle twin
  (synchronous, suppression-checked, transport failure propagates).
- `.../notification/adapter/in/BookingConfirmationMailListener.java` — refactor onto the resolver.
- `.../notification/adapter/out/MockMailer.java` + `SentEmail.java` — record the new kind.
- `.../notification/adapter/out/SmtpMailer.java` — subject + reason-branched plain-text body.
- `.../shared/ObservabilityMetrics.java` — `MAIL_CANCELLATION_ABANDONED`.

**Tests — new**

- `.../notification/application/BookingMailFactsServiceTest.java`
- `.../notification/adapter/in/BookingCancellationMailListenerTest.java`
- `.../notification/BookingCancellationMailIT.java`

**Tests — modified**

- `.../notification/adapter/in/BookingConfirmationMailListenerTest.java` — stub the resolver.
- `.../notification/adapter/in/MailListenerExecutorArchitectureTest.java` — non-vacuity guard names both listeners.
- `.../notification/adapter/out/MailOutboxScopeTest.java` — the new listener id is in scope.
- `.../notification/adapter/out/MockMailerTest.java`, `SmtpMailerIT.java`,
  `.../application/TransactionalMailServiceTest.java`
- `.../notification/BookingMailFixtures.java` — **renamed** from `ConfirmationMailFixtures`: its
  seed and its two disciplines are properties of this database and this registry, not of one message
  kind, and the old name would have invited a second near-copy. Gains `cancellationOf(...)` and
  `CANCELLATION_LISTENER_ID`.

**Docs — modified**

- `docs/runbooks/observability.md` — the new counter, its tag table, and its place in the
  read-first ordering.
- `RESPONSIBILITIES.md`, `CLAUDE.md` — the `notification` Job / module-table row gains the
  cancellation mail.
- `docs/plans/email-s6-cancellation-refund-mail.md` — this doc.

---

## Phase 0 — Plan doc + branch

**Files:** Create `docs/plans/email-s6-cancellation-refund-mail.md`

- [ ] **Step 1:** Confirm `claude/sdlc-374-whbejt` exists and is level with `origin/main`.
- [ ] **Step 2:** Commit this plan doc — `git commit -m "docs(#374): plan the cancellation/refund confirmation email"`.
- [ ] **Step 3:** Push, then open the **draft PR immediately** (CI fires on `pull_request` only —
      a branch with no PR gets no CI at all, #417).

---

## Phase 1 — Shared booking-mail fact resolver

**Files:** Create `BookingMailFacts.java`, `MissingBookingFact.java`, `BookingMailFactsService.java`,
`BookingMailFactsServiceTest.java` · Modify `BookingConfirmationMailListener.java`,
`BookingConfirmationMailListenerTest.java`

- [ ] **Step 1: Write the failing test** — `BookingMailFactsServiceTest`: resolves all five fields
      from the three ports; returns `Missing(NO_BOOKING)` / `(NO_SET)` / `(NO_CONTACT)`; **and**
      asserts the short-circuit order (a missing booking leaves `sets`/`customers` untouched —
      `verifyNoInteractions`), which is the behavior-parity row that would otherwise be lost silently.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*BookingMailFactsServiceTest*"` → FAIL (class absent).
- [ ] **Step 3: Minimal implementation** — the sealed outcome, the enum, and the service (constructor
      injection into `final` fields; `public` because `adapter/in` calls it).
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Refactor the confirmation listener onto it**, rewrite its unit test to stub the
      resolver, and keep `abandon(...)` (wording is confirmation-specific) sourcing its tag from
      `MissingBookingFact`. Re-run `--tests "*BookingConfirmationMailListenerTest*"` → PASS with the
      same three counter assertions.
- [ ] **Step 6: Generalization-audit pass** — search for other multi-port assembly in
      `notification`; record the decision.
- [ ] **Step 7: Commit** — `refactor(#374): extract the booking-mail fact resolver both listeners need`.
- [ ] **Step 8: Update the plan-doc execution status** in the same commit window; verify that push's CI.

---

## Phase 2 — Transport: the cancellation message kind

**Files:** Create `BookingCancellationMail.java` · Modify `Mailer.java`, `MockMailer.java`,
`SentEmail.java`, `SmtpMailer.java`, `MockMailerTest.java`, `SmtpMailerIT.java`

- [ ] **Step 1: Write the failing tests** — `MockMailerTest.recordsTheCancellation` (fields verbatim,
      **no arrival code in the logged line**); `SmtpMailerIT` for the subject, the reason-branched
      opening line (AC-3), the minor-units amount (AC-4), the no-refund wording (AC-2), and no
      tracking markup (AC-10).
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*MockMailerTest*" --tests "*SmtpMailerIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — the record; the `Mailer` method; `SentEmail`'s new kind +
      factory; `SmtpMailer`'s subject + body with an **exhaustive** `switch` over `RefundReason` (no
      `default`, so R-8 is a compile error) reusing `formatAmount` and `headerSafe`.
- [ ] **Step 4: Run them, verify they pass** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `feat(#374): render the cancellation/refund mail on both transports`.
- [ ] **Step 7: Update the plan-doc execution status;** verify that push's CI.

---

## Phase 3 — Chokepoint + the cancellation listener

**Files:** Create `BookingCancellationMailListener.java`, `BookingCancellationMailListenerTest.java` ·
Modify `TransactionalMailService.java`, `ObservabilityMetrics.java`,
`TransactionalMailServiceTest.java`, `MailListenerExecutorArchitectureTest.java`,
`MailOutboxScopeTest.java`

- [ ] **Step 1: Write the failing tests** — `TransactionalMailServiceTest`: a suppressed address skips
      and returns normally (AC-7), a healthy address reaches the transport, a transport failure
      **propagates** (AC-6). `BookingCancellationMailListenerTest`: the happy path builds the right
      record; each missing fact counts `riviera.mail.cancellation.abandoned` under its own `reason`
      and logs one `ERROR` with ids only (AC-8); a transport failure propagates.
      `MailListenerExecutorArchitectureTest.theRuleExaminesBothProductionListeners` (AC-9);
      `MailOutboxScopeTest.scopesTheCancellationListener` (AC-9).
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*BookingCancellationMailListenerTest*" --tests "*TransactionalMailServiceTest*" --tests "*MailListenerExecutorArchitectureTest*" --tests "*MailOutboxScopeTest*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — the metric constant with its Javadoc (why a sibling name,
      per Resolved Q-4); `TransactionalMailService.sendBookingCancellation` mirroring
      `sendBookingConfirmation`; the listener with `@Async(MAIL_EXECUTOR)` +
      `@TransactionalEventListener` and a record-deconstruction `switch` over the resolver outcome.
- [ ] **Step 4: Run them, verify they pass** — same command → PASS.
- [ ] **Step 5: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS.
- [ ] **Step 6: Generalization-audit pass.**
- [ ] **Step 7: Commit** — `feat(#374): mail the tourist a cancellation/refund record`.
- [ ] **Step 8: Update the plan-doc execution status;** verify that push's CI.

---

## Phase 4 — End-to-end registry IT

**Files:** Create `BookingCancellationMailIT.java` · Modify `BookingMailFixtures.java`

- [ ] **Step 1: Write the failing test** — Testcontainers + `@EnabledIfDockerAvailable`, mirroring
      `BookingConfirmationMailIT`: one mail per cancellation to the guest contact (AC-1); both
      channels (AC-3); resubmitting outstanding publications yields no second mail (AC-5); a
      suppressed address yields none (AC-7). Seed with a **deliberately improbable refund amount per
      test** and dates no other IT uses — the `BookingMailFixtures` disciplines, which exist
      because matching a bare id also matches another test's venue or set id.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*BookingCancellationMailIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — the fixtures' `cancellationOf(...)` factory + cancellation
      `LISTENER_ID`; no production change expected (if one *is* needed, phases 1–3 missed something —
      record it in the findings register).
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Module regression** — `./gradlew test --tests "ai.riviera.platform.notification.*"` → PASS.
- [ ] **Step 6: Generalization-audit pass.**
- [ ] **Step 7: Commit** — `test(#374): pin the cancellation mail end-to-end through the registry`.
- [ ] **Step 8: Update the plan-doc execution status;** verify that push's CI.

---

## Phase 5 — Docs

**Files:** Modify `docs/runbooks/observability.md`, `RESPONSIBILITIES.md`, `CLAUDE.md`, this plan doc

- [ ] **Step 1:** Runbook — a `riviera_mail_cancellation_abandoned_total` section: what one increment
      means (a tourist has no written record of their refund), the three-row tag table pointing at
      `booking`/`venue`/`customer`, why it is a data-integrity and not a relay signal, why it is a
      sibling series rather than a `kind` tag on the confirmation counter (Resolved Q-4), and its
      place in the read-first ordering during a suspected relay outage.
- [ ] **Step 2:** `RESPONSIBILITIES.md` + `CLAUDE.md` — the `notification` Job/module row gains the
      cancellation mail alongside the confirmation.
- [ ] **Step 3:** Merge the latest `origin/main` into the branch, mark the PR **ready for review**
      (this is what makes the Review and Sonar gates due).
- [ ] **Step 4: Commit** — `docs(#374): document the cancellation-mail loss counter`.
- [ ] **Step 5:** Update the plan-doc execution status; verify that push's CI.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*BookingCancellationMailIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** `./gradlew test --tests "*SmtpMailerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** `./gradlew test --tests "*BookingCancellationMailIT*" --tests "*SmtpMailerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** `./gradlew test --tests "*SmtpMailerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** `./gradlew test --tests "*BookingCancellationMailIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** `./gradlew test --tests "*BookingCancellationMailListenerTest*" --tests "*BookingCancellationMailIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** `./gradlew test --tests "*TransactionalMailServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-8:** `./gradlew test --tests "*BookingCancellationMailListenerTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-9:** `./gradlew test --tests "*MailListenerExecutorArchitectureTest*" --tests "*MailOutboxScopeTest*" --tests "*ModularityTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-10:** `./gradlew test --tests "*MockMailerTest*" --tests "*SmtpMailerIT*"` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; no availability write in scope, stated with why (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — applied upstream, not recomputed here.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled; no money moves; amounts in minor units (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — rendered, never recomputed.
- [ ] Timezone correct: the booking date rides the event as a `Europe/Tirane` `LocalDate` (invariant #6).
- [ ] Booking codes unguessable and **never logged** (invariant #7).
- [ ] Flyway: no migration in scope; no `event_type` rewrite needed (invariant #12).
- [ ] **Frontend** N/A — backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
