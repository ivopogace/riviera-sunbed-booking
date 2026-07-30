# Admin mail-delivery view + one-click confirmation resend Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A platform admin can enter a tourist's email address, see every booking-confirmation
mail attempt the platform made for that address's bookings (trigger, outcome, timestamp, newest
first), and resend the confirmation for one booking — getting the *real* outcome back
immediately — without restarting the container and without re-driving any other
`BookingConfirmed` consumer.

**Architecture:** The single significant decision is **the delivery history is recorded at send
time in a `notification`-owned table, not inferred from Spring Modulith's Event Publication
Registry**. The registry's `completion_date` records only that the listener *returned* — which it
also does for a suppression skip (#382) and for an abandoned-for-missing-facts skip (#428) — so a
registry-derived view would report "dispatched 14:02" for a mail that was never sent, in precisely
the cases support phones about. `booking.spi.ConfirmationMailDelivery` already states the rule this
slice follows: *"Any consumer that needs the historical fact must record it at send time instead of
calling this."* Consequences: the resend is a **synchronous** call through the existing send
chokepoint (bounded by #410's socket budget) so the admin sees `SENT` / `WITHHELD_SUPPRESSED` /
`TRANSPORT_FAILED` now rather than "queued"; no new event type, no registry row, and therefore no
possibility of the mail pool silently *shedding* an admin's button press.

**Persistence:** JDBC only (invariant #1). New table `booking_confirmation_mail_attempt` in
**V36**; reads/writes via `JdbcClient` + text-block SQL. No other table is touched.

**Source of intent:** GitHub issue **#380** ([Email S9], epic #367 / ADR-0011). The two design
questions the issue asked to be weighed were settled with the maintainer on 2026-07-30 — see
*Resolved* under Open questions.

**Skills consulted:**
- `riviera-sdlc` — routed the gate; recorded the cloud-branch substitution below.
- `riviera-plan-doc` — this template + the Execution-status state-store rule.
- `postgres` — `BIGINT GENERATED ALWAYS AS IDENTITY` PK + `TEXT`-with-`CHECK` state tokens over a
  native enum, `TIMESTAMPTZ`, and an explicit index on the FK column (Postgres creates none);
  killed an early sketch that keyed the table on a UUID.
- `riviera-modulith` — placed the admin controller in `notification/adapter/in` (the #391/#405
  precedent) rather than the root; forced the `api`-vs-`spi` re-check (all three new reads are
  **inbound** `api/` ports, no inversion needed); required the `booking::api` role-split rather
  than piling methods onto one port (#94).
- `riviera-java-conventions` — the typed outcome returned from `sendBookingConfirmation` instead of
  a boolean/exception pair (§6), package-private adapters, `Optional` from query ports, named state
  tokens kept in lockstep with the SQL `CHECK` (§6a), one-line-or-none inline comments (§6c).
- `riviera-frontend` — the new surface is a card **on the existing `/admin/email` page** in the
  `admin/` feature folder (no third tab, no route), its HTTP service colocated, models in the
  feature's existing `admin.model.ts`.
- `riviera-tailwind`, `angular-developer` + angular-cli MCP, `playwright-cli` — **due at phase 4/5**
  (frontend + e2e); re-run the gate there and append what each changed.

**Branch:** `claude/sdlc-380-34lpjq` — the cloud session's designated remote branch **stands in for**
`feature/admin-mail-delivery-view` (`riviera-sdlc` remote-session addendum); it exists and is level
with `origin/main`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a confirmed booking whose confirmation mail was sent automatically, when an
  admin looks up the booking's contact email, then the response lists that booking with one attempt
  — source `AUTOMATIC`, outcome `SENT`, and the instant it was attempted. *Pinned by:*
  `AdminMailDeliveryIT.listsTheAutomaticAttemptForTheAddressesBookings`
- [ ] **AC-2:** Given a booking whose confirmation was withheld because the address is suppressed,
  when an admin looks it up, then the attempt reads `WITHHELD_SUPPRESSED` — not `SENT`. *Pinned by:*
  `BookingConfirmationMailListenerTest.recordsAWithheldAttemptWhenTheAddressIsSuppressed`
- [ ] **AC-3:** Given a confirmed booking whose confirmation already completed, when an admin
  triggers a resend, then the tourist's address receives a second confirmation mail carrying the same
  arrival code, and the response reports `SENT`. *Pinned by:*
  `AdminMailDeliveryIT.resendsTheConfirmationForABookingWhoseMailAlreadyCompleted`
- [ ] **AC-4:** Given that booking has a payout accrual from its original confirmation, when an admin
  resends the confirmation, then no `BookingConfirmed` is published and the payout ledger is
  byte-for-byte unchanged. *Pinned by:*
  `AdminMailDeliveryIT.resendDrivesNoOtherBookingConfirmedConsumer`
- [ ] **AC-5:** Given a resend whose transport fails, when the admin presses the button, then the
  response reports `TRANSPORT_FAILED`, an attempt row records it, and no exception escapes to the
  client. *Pinned by:* `BookingConfirmationResendServiceTest.reportsAndRecordsATransportFailure`
- [ ] **AC-6:** Given a signed-in operator without the platform-admin role, when it calls either
  endpoint, then the platform answers `403`; anonymous gets `401`. *Pinned by:*
  `AdminMailDeliveryControllerTest.aNonAdminOperatorIsForbiddenAndNeverReachesEitherPort` + `.anAnonymousRequestIsUnauthorizedAndNeverReachesEitherPort`
- [ ] **AC-7:** Given an email address with no bookings (or an unknown address), when an admin looks
  it up, then the platform answers `200` with an empty list — never a 404 and never a different
  latency or shape for "address unknown" vs "address known with no bookings". *Pinned by:*
  `AdminMailDeliveryIT.answersAnEmptyListForAnAddressWithNoBookings`
- [ ] **AC-8:** Given any lookup or resend response, when it is serialised, then it carries no
  booking code and no arrival credential anywhere (invariant #7), and the attempt table holds no
  email address (ADR-0010 erasure reach). *Pinned by:*
  `AdminMailDeliveryIT.neverRendersTheArrivalCode` + `AdminMailDeliveryControllerTest.neverRendersTheArrivalCodeOrTheRecipientAddress` + `ConfirmationMailAttemptsIT.storesNoRecipientAddressOrArrivalCode`
- [ ] **AC-9:** Given an admin on `/admin/email`, when they enter an address and press Look up, then
  the page lists each booking with its attempt history and a Resend button, and reports the resend
  outcome in an `aria-live` region. *Pinned by:* `admin-mail-delivery.spec.ts` +
  `admin-mail-delivery.e2e.ts` (CI-safe mocked suite)
- [ ] **AC-10:** Given the new surface, when axe runs over the loaded card and over its populated
  results state, then there are no serious violations. *Pinned by:*
  `admin-mail-delivery.a11y.spec.ts` + `expectNoSeriousAxeViolations` in the e2e spec.

## Non-goals

- **Recording the other two registry-borne booking mails** (cancellation #374, payment-due #373).
  The table is deliberately named for the one fact it holds — see R-6 for why a `mail_kind` column
  with one populated value would be actively misleading.
- **Looking a booking up by its arrival code.** Settled with the maintainer: anyone who can quote
  the code can also quote their address, and the converse is false.
- **Any retry of a failed resend.** The admin sees `TRANSPORT_FAILED` and presses again; the
  registry vehicle's automatic retry is unchanged for the automatic path.
- **A cooldown or per-booking rate limit on the resend.** ADMIN-gated, trusted, and every press is
  recorded — the attempt log *is* the audit trail. (Contrast #405's `MailResubmissionWindow`, which
  guards a whole-outbox sweep.)
- **A new metric.** The six mail counters answer aggregate health; this slice answers a per-booking
  question and the table is its record. No `MAIL_*` name is added.
- **Backfilling history for mail sent before V36.** Bookings confirmed before this ships show "no
  attempts recorded" — the view says exactly that rather than implying nothing was sent.
- **Reinstating a suppressed address from this surface.** That lever already exists (#391).
- **Touching the automatic listener's payload reads.** It keeps taking date/amount/currency from the
  `BookingConfirmed` payload; only the resend re-reads them.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` The `/admin/email` page gains a second card; the #405
outbox card, its status read, its cooldown reporting and its error states are untouched (no shared
component, no shared service method, no shared endpoint). Verified by leaving
`admin-mail-outbox.spec.ts` and `admin-mail-outbox.e2e.ts` unmodified — if either needs an edit, that
is a parity signal to record here.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Recording the attempt **after** a successful send: if the insert fails, rethrowing would leave the publication outstanding and duplicate the mail on retry | med | med | The record is best-effort *relative to the send it describes*: `ConfirmationMailAttempts` failures are caught, logged at `WARN` and swallowed **at the recording call site only** — never around the send. The view then reads "no attempts recorded", which is honest. Pinned by `ConfirmationAttemptRecorderTest.absorbsAFailedWriteRatherThanFailingTheSendThatAlreadyHappened` | agent | open |
| R-2 | The attempt insert runs on the registry-mail worker, which holds **no transaction** (#371 deliberately dropped `REQUIRES_NEW`) | high | low | That is the property that makes a `TRANSPORT_FAILED` row survive the rethrow: the insert auto-commits before the exception propagates. Asserted, not assumed, by `BookingConfirmationMailListenerTest.recordsTheFailedAttemptAndStillRethrows` | agent | open |
| R-3 | A resend re-drives `payout` (invariant #9) or Stripe (invariant #8) | low | high | The resend publishes **nothing** — it calls the send chokepoint directly, so there is no `BookingConfirmed` for `payout`'s accrual or `booking`'s refund listener to consume. AC-4 pins it at integration level (ledger row count unchanged + `PublishedEvents` empty) | agent | open |
| R-4 | Synchronous SMTP on an admin request thread wedges a Tomcat thread | low | med | Bounded by `riviera.notification.mail.socket-timeout-ms` (#410), which every `spring.mail.properties.mail.smtp.*` timeout interpolates. One admin, one press; the money-path bulkhead (#383) is untouched because this never runs on `applicationTaskExecutor` | agent | open |
| R-5 | Flyway **V36** collides with a parallel slice | low | high | V36 verified free on `main` and unclaimed by every open PR (only dependabot PRs are open, none touching `db/migration`). If a parallel slice merges first, **this branch renumbers** (default: whoever merges second) and re-runs `--tests "*Migration*"` | agent | open |
| R-6 | A `mail_kind` column populated with one value reads as "no cancellation mail was sent" when the truth is "cancellation mail was never recorded" | med | med | Table named `booking_confirmation_mail_attempt`; **no** kind column. A later slice that records another kind generalises the table *in the same slice as its write site*, so absence never lies. Recorded in Non-goals | agent | open |
| R-7 | The lookup becomes an address-enumeration oracle | low | med | ADMIN-gated (a role that can already read the operator list), and the response is identical in shape and status for "unknown address" and "known address, no bookings" — AC-7. The address is the *input*, so nothing is disclosed that the caller did not supply | agent | open |
| R-8 | PII in URLs: an address in a query string or path lands in access, proxy and browser-history logs | high | med | Both endpoints are `POST` with a JSON body; the address never appears in a path or query. The resend path segment carries the numeric `bookingId`, not the code | agent | open |
| R-9 | Erasure interaction: a scrubbed (tombstoned) guest contact must not resurrect an address | low | med | The lookup resolves an address to a `CustomerId` through `customer::api` only; ADR-0010 pseudonymises in place, so a scrubbed address simply stops matching and the lookup returns empty. The attempt table stores **no** address, so it needs no erasure reach — pinned by `ConfirmationMailAttemptsIT.storesNoRecipientAddressOrArrivalCode` | agent | open |
| R-10 | The new `customer` by-email read is confused with `CustomerDirectory.findOrCreate`, which **writes** — a support search would create guest-contact rows | med | high | The new method lands on `CustomerLookup` (the read-only conversation) and is `Optional`-returning; `findOrCreate` is not called anywhere in this slice. Pinned by `JdbcCustomerLookupIT.doesNotCreateAContactForAnUnknownAddress` | agent | open |
| R-11 | Error-contract drift: a per-controller `{"error": …}` body instead of RFC-7807 | low | low | Both endpoints return `200` with a typed outcome token for every expected flow (the #405 controller's precedent); anything genuinely thrown becomes `ProblemDetail` via the single `ApiErrorHandler`. No `@ExceptionHandler` is added (`ErrorContractArchitectureTests`) | agent | open |

## Open questions / Assumptions

- **Assumption:** an admin phoning with a tourist is holding the address the booking was made
  with — the same address the confirmation was sent to (`booking.customer_id` → guest contact).
  A tourist who books under one address and asks about another is out of reach of this view.
  *Owner:* agent · *Resolves by:* accepted, documented in the endpoint Javadoc.
- **Assumption:** bookings per address are few enough that an uncapped list is fine; the read is
  ordered newest-first and capped at **20** bookings defensively. *Owner:* agent · *Resolves by:*
  phase 2.

### Resolved

- **Which key does the admin look up by?** → **Email address**, not the arrival code. Anyone able
  to quote the code can also quote their address; the reverse is false, and delivery debugging is
  address-shaped. Decided with the maintainer 2026-07-30 (session discussion, pre-implementation).
  Issue #380's AC 1 and AC 5 are reworded accordingly (see Execution status → issue drift).
- **Where does the history come from, and how does a resend send?** → **A `notification`-owned
  attempt table + a synchronous resend through the send chokepoint** (option B), rejecting the
  issue's registry-derived sketch. Four reasons, in order of weight: (1) `completion_date` means
  "the listener returned", which is also true of a suppression skip and an abandoned-for-missing-facts
  skip — the view would lie in its main use case; (2) `event_publication` is framework-owned and has
  already been rewritten twice (V18, V31), and a JSON expression index over `serialized_event` would
  constrain every event type sharing that table; (3) aggregate observability
  (`riviera.outbox.pending`, the six counters) and per-entity support history are different concerns
  wanting different stores; (4) a registry-borne resend can only answer "queued", and a saturated
  mail pool can *shed* it. Decided with the maintainer 2026-07-30.
- **Does a resend risk being collapsed as a duplicate by the receiving MTA?** → No. Verified there
  is **no** `Message-ID` handling anywhere in `SmtpMailer`/`MockMailer`; #371's AC line about a
  booking-keyed stable `Message-ID` was never implemented (its Javadoc states the registry is "the
  *whole* idempotency story"), so JavaMail mints a fresh id per message and a resend is a genuinely
  new mail.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path in this slice touches
`availability(set_id, booking_date)`, and none of the three new reads selects from it: the slice
reads `booking` (two columns plus the confirmation facts), `customer` (id by canonical email),
`venue` (existing `SetBookingFacts` via the untouched `BookingMailFactsService`), and writes only
the new `booking_confirmation_mail_attempt` table. A resend changes no booking status, claims and
releases nothing, and re-sends a mail for a set whose claim already exists — so it cannot double-sell
a set or race a claim. The one concurrency question the slice does raise (two admins pressing Resend
simultaneously) is answered by accepting it: two mails and two recorded attempts, which is the
truthful record of what happened. There is deliberately **no** uniqueness constraint on
`(booking_id, attempted_at)` — an attempt log that rejects a duplicate attempt would be a log that
lies.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns table-backed state) | Owns transactional-mail **delivery** — the transports, both vehicles, and the send chokepoint. The attempt record is *what this module did*, so it is this module's state, sitting beside `email_suppression`. The admin adapter follows `AdminEmailSuppressionController` (#391) / `AdminMailOutboxController` (#405): in the module, not at the root, so no published port is minted for a single same-module consumer. |
| M-2 | `booking` | existing | `Booking` | Owns bookings, arrival codes and the confirmation facts a resend must re-read; owns "which bookings does this customer have" (`customer`'s Not-My-Job: *"Bookings → `booking`"*). |
| M-3 | `customer` | existing | `Customer` | Owns guest-contact identity and the canonical email form (`customer.vocabulary.Emails`, #386). Resolving an address to a `CustomerId` is its Job; `booking`'s Not-My-Job says *"Storing guest contact details → `customer`"*. |
| M-4 | `venue` | existing (read-only, unchanged) | `Venue` | Already supplies venue name + set label through `SetBookingFacts`, reached via the untouched `BookingMailFactsService`. No new grant, no new port. |

**Cross-module named interfaces (`api/` ports)**

All three are **inbound** — `notification` *calls* them, nobody implements anything for it — so
they are `api/`, not `spi/` (the `riviera-modulith` decision rule; an "implement-me" interface in
`api/` is RV-BE-3b's smell). No `allowedDependencies` change: `notification` already grants
`booking::api`, `booking::vocabulary`, `customer::api`, `customer::vocabulary`.

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` | `BookingNotificationFacts#confirmationFacts(BookingId)` — new method on the existing port; the same "tell the guest about one booking" conversation, widened for the trigger that has no event payload to read from | `BookingConfirmationFacts` (new, `booking::vocabulary`): `SetId setId, LocalDate bookingDate, long amountMinor, String currency, String code, CustomerId customerId` | `notification` |
| NI-2 | `booking.api` | `CustomerBookings#forCustomer(CustomerId)` — **new port**, split by consumer role (#94) rather than piled onto NI-1: a different conversation (find this person's bookings) for a different caller (the admin view) | `CustomerBookingSummary` (new, `booking::vocabulary`): `BookingId bookingId, VenueId venueId, LocalDate bookingDate, String status` | `notification` |
| NI-3 | `customer.api` | `CustomerLookup#findByEmail(String)` — new method on the **read-only** lookup port; canonicalises internally via `customer.vocabulary.Emails` so the caller cannot spell the rule a second way | `CustomerId` (existing) | `notification` |

**Module-internal ports (not published)**

| Port | Package | Implemented by |
|---|---|---|
| `ConfirmationMailAttempts` — `record(BookingId, MailAttemptSource, MailAttemptOutcome, Instant)` + `historyFor(List<BookingId>)` | `notification/application` | `notification/adapter/out/JdbcConfirmationMailAttempts` (package-private) |
| `BookingConfirmationResend` — the driving port the admin controller depends on | `notification/application` | `notification/application/BookingConfirmationResendService` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | **none added** | — | — | — | — | `AdminMailDeliveryIT.resendDrivesNoOtherBookingConfirmedConsumer` asserts the resend publishes nothing |

The absence is the design: the issue proposed a `BookingConfirmationMailRequested` event, whose only
real job was to manufacture a registry row for the history. With the history recorded directly, the
event buys nothing and costs a second delivery vehicle for the same mail.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Record that a confirmation mail attempt happened, with its outcome | `notification` | Its Job: own transactional-mail **delivery** and the module's own table-backed state (precedent: `email_suppression`). Not on any other module's Job; `booking`'s Not-My-Job list keeps mail out of it (mail composition and delivery have never been `booking`'s), and the inverted `booking.spi.ConfirmationMailDelivery` explicitly tells a consumer needing the historical fact to record it itself. |
| Decide *whether* a send was withheld (suppression) | `notification` | Already its defining invariant — *no send to a suppressed address*, enforced at the chokepoint. This slice only makes the existing decision **legible** by returning it as a typed outcome instead of discarding it. |
| Re-read a booking's confirmation facts (code, set, date, amount, currency) | `booking` | Its Job: owns bookings and booking codes. `notification` must not hold or re-derive them — the arrival code is read through `booking::api` at send time exactly as #371 established. |
| List the bookings belonging to a guest-contact id | `booking` | It owns the `booking` table; `customer`'s Not-My-Job says *"Bookings → `booking`"*. Inbound `api/` (no inversion) because `notification → booking` is already an allowed edge and closes no cycle. |
| Resolve an email address to a guest-contact id | `customer` | Its Job: guest-checkout contact identity + the canonical email form (`Emails`, #386). `booking`'s Not-My-Job: *"Storing guest contact details → `customer`"*. |
| Serve the ADMIN lookup + resend endpoints | `notification` (`adapter/in`) | Two shipped precedents in this exact module (#391 suppression reinstatement, #405 mail outbox); hosting at the root would force a published port for a single same-module consumer. Platform-wide `/api/admin/**`, so exempt from invariant #13 and gated to the ADMIN role in `SecurityConfig`. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope`, with one invariant obligation that is the reason AC-4 exists rather
than being assumed: a resend must not reach `payout`. It cannot, structurally — the resend publishes
no event, and `payout`'s accrual listens to `booking.events.BookingConfirmed` only. The mail body
renders the amount that already rode the original confirmation, re-read from `booking` as integer
minor units + ISO currency (invariant #5); no arithmetic, no rounding, no commission, no Stripe call
anywhere in this slice. AC-4 pins the ledger row count unchanged across a resend.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-mail-delivery.ts` | new | standalone component (card, rendered by FE-3) | signals: `bookings`, `busy`, `resending`, `notice`, `lookupError` | **Signal Forms** (`@angular/forms/signals`) — the established pattern in `auth/` (5 pages); no reactive-forms usage exists in the app |
| FE-2 | `admin/admin-mail-delivery.service.ts` | new | `@Service()` HTTP client | stateless; component holds page state (the `AdminMailOutboxService` shape) | — |
| FE-3 | `admin/admin-mail-outbox.ts` | modified | standalone component | unchanged | — |
| FE-4 | `admin/admin.model.ts` | modified | types | — | — |
| FE-5 | `admin/admin-mail-delivery.spec.ts` · `.a11y.spec.ts` | new | Vitest/jsdom specs | — | — |
| FE-6 | `e2e/admin-mail-delivery.e2e.ts` | new | Playwright, **CI-safe mocked suite** | `page.route` mocks + `expectNoSeriousAxeViolations` | — |

**Placement rationale** (`riviera-frontend`): the `admin/` feature folder already owns this concern;
no new route and **no third tab** — the card lands on the existing `/admin/email` page, whose subject
is exactly mail delivery, so `AdminConsoleTabs` is untouched. The card is its own component rather
than more template inside `AdminMailOutbox`, keeping both small and single-responsibility.

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
porcelain theme pinned via the page host (already set), no `ngClass`/`ngStyle`, TSDoc on the
component/service and one-line-or-none inline comments (RV-STYLE-1). The card self-gates on
`OperatorAuth.isAdmin()` for UX only — the backend role gate is the authority.

## FE↔BE contract

- **New endpoints** (both `POST`, both ADMIN-gated, both CSRF-protected like every write; paths
  enumerated in `SecurityConfig` beside the #405 ones):
  - `POST /api/admin/mail-deliveries/lookup` — body `{ "email": "…" }` → `200`
    `{ "bookings": [ { "bookingId": 42, "venueName": "…", "bookingDate": "2026-07-04", "status": "CONFIRMED", "attempts": [ { "source": "AUTOMATIC", "outcome": "SENT", "attemptedAt": "2026-07-03T12:02:11Z" } ] } ] }`
    — newest booking first, newest attempt first, `attempts: []` when nothing was recorded.
  - `POST /api/admin/mail-deliveries/{bookingId}/resend` → `200`
    `{ "outcome": "SENT" | "WITHHELD_SUPPRESSED" | "TRANSPORT_FAILED" | "NO_SUCH_BOOKING" | "MISSING_FACTS", "attemptedAt": "…" }`
- **Why `POST` for a read:** the lookup key is PII, and a query string or path segment would put it
  in access, proxy and browser-history logs (R-8). Every expected outcome is `200` with a token, the
  #405 controller's precedent — a refusal is an answer an admin acts on, not an error banner.
- **Client typing:** hand-written types in `admin.model.ts` (`MailDeliveryBookingView`,
  `MailAttemptView`, `MailResendResultView`), consumed by FE-2. No `as any`.
- **Money/date on the wire:** no money crosses this contract (the amount is rendered into the mail
  body server-side, never returned). `bookingDate` is an ISO `LocalDate`; `attemptedAt` is a UTC
  instant (invariant #6) formatted in `Europe/Tirane` for display only.
- **Never on the wire:** the arrival code, the recipient address (the caller supplied it), the
  registry payload.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session, re-read
> it (plus the current `riviera-sdlc` stage reference) before acting. Update it in the SAME commit
> window as the change it records.

**Stage pointer:** `implement — backend done (phases 0–3); phase 4 (frontend) next`

**Next action:** Phase 4 — re-run the Skill-routing gate (`angular-developer` + angular-cli MCP,
`riviera-tailwind`), then build the console card test-first.

**Issue drift to record on #380 before implementation ends:** AC 1 becomes "look up by the tourist's
email address"; AC 5's "the recipient address is read live via `customer::api`" becomes "the address
is the lookup input, is resolved through `customer::api`, and is stored nowhere" — same intent,
different mechanics. The issue's two implementation notes (JSON expression index; a
`BookingConfirmationMailRequested` event) are superseded by the *Resolved* decisions above.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V36 attempt table + `ConfirmationMailAttempts` port/adapter | ✅ | `1c03dee` |
| 1 — Record the automatic path (typed send outcome + listener recording) | ✅ | `5d26e5a` |
| 2 — The three new reads (`booking::api` ×2, `customer::api` ×1) | ✅ | `1cc8392` |
| 3 — Resend service + ADMIN lookup/resend endpoints | ✅ | `ca4302e` |
| 4 — Frontend card, service, unit + a11y specs | | |
| 5 — Playwright mocked e2e | | |
| 6 — Substrate docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-3 | sonar (phase-2 push, PR #449) | `java:S1192` CRITICAL — the literal `"email"` bound three times in `JdbcCustomerDirectory` once `findByEmail` joined it. | fixed-in-`ca4302e` — named `PARAM_EMAIL`, the `JdbcBookings` `PARAM_*` convention. |
| F-2 | sonar (phase-1 push, PR #449) | `java:S6213` MAJOR — `ConfirmationAttemptRecorder.record(...)` matches a restricted identifier (`record`). | fixed-in-`1cc8392` — renamed to `recordAttempt`. The push also revealed the recorder's swallow branch was the slice's only uncovered new code, so `ConfirmationAttemptRecorderTest` (4 tests) now pins R-1's policy — including that the catch stays `DataAccessException` and does **not** absorb a programming error. |
| F-1 | sonar (phase-0 push, PR #449) | `java:S2479` CRITICAL — a literal tab inside V36's `INSERT` text block (the column-list line was indented one tab past the block's common prefix, so the tab survived incidental-whitespace stripping into the SQL string). The gate passed with it; the repo's 0-new-issues bar does not. | fixed-in-`1a64291` — re-indented past the prefix with **spaces**, the convention `JdbcAccountErasure`/`JdbcCustomerDirectory` already follow. Same latent tab fixed in the IT's text block. No behaviour change (SQL is whitespace-insensitive); IT re-run 13/0/0. |

---

## File structure

**Backend — create**

- `platform/src/main/resources/db/migration/V36__booking_confirmation_mail_attempt.sql` — the table.
- `platform/src/main/java/…/notification/application/ConfirmationMailAttempts.java` — internal port.
- `…/notification/application/MailAttemptSource.java` — `AUTOMATIC` | `ADMIN_RESEND`, each carrying
  its SQL token (§6a lockstep).
- `…/notification/application/MailAttemptOutcome.java` — `SENT` | `WITHHELD_SUPPRESSED` |
  `TRANSPORT_FAILED` | `ABANDONED_MISSING_FACTS`, same lockstep.
- `…/notification/application/MailAttempt.java` — record: `BookingId`, source, outcome, `Instant`.
- `…/notification/application/ConfirmationSendOutcome.java` — `SENT` | `WITHHELD_SUPPRESSED`, the
  chokepoint's typed return.
- `…/notification/application/BookingConfirmationResend.java` — driving port for the controller.
- `…/notification/application/BookingConfirmationResendService.java` — resolve → send → record.
- `…/notification/application/MailDeliveryLookup.java` + `MailDeliveryView.java` — the lookup port
  and its result shape (booking summary + attempts).
- `…/notification/application/MailDeliveryLookupService.java` — address → customer → bookings →
  attach attempts + venue names.
- `…/notification/adapter/out/JdbcConfirmationMailAttempts.java` — package-private `JdbcClient`.
- `…/notification/adapter/in/AdminMailDeliveryController.java` — the two endpoints + response records.
- `…/booking/api/CustomerBookings.java` — NI-2.
- `…/booking/vocabulary/BookingConfirmationFacts.java` · `CustomerBookingSummary.java` — NI-1/NI-2 types.
- `…/booking/adapter/out/JdbcCustomerBookings.java` — NI-2's adapter.

**Backend — modify**

- `…/notification/application/TransactionalMailService.java` — `sendBookingConfirmation` returns
  `ConfirmationSendOutcome`; Javadoc records why.
- `…/notification/adapter/in/BookingConfirmationMailListener.java` — record every branch
  (`SENT`/`WITHHELD_SUPPRESSED`/`TRANSPORT_FAILED` with rethrow/`ABANDONED_MISSING_FACTS`).
- `…/booking/api/BookingNotificationFacts.java` — NI-1 method.
- `…/booking/adapter/out/JdbcBookingNotificationFacts.java` — NI-1 SQL.
- `…/customer/api/CustomerLookup.java` + its JDBC adapter — NI-3.
- `…/SecurityConfig.java` — two ADMIN-gated paths.
- `RESPONSIBILITIES.md`, `CLAUDE.md` (the `notification` module row), `docs/adr/ADR-0011` (decision-5
  note: the admin resend is a third trigger on the registry vehicle's *mail*, not a third vehicle).

**Frontend** — FE-1…FE-6 exactly as tabled above.

---

## Phase 0 — V36 attempt table + the recording port

**Files:** Create the migration, the port, the four value types, the JDBC adapter · Test
`platform/src/test/java/…/notification/adapter/out/ConfirmationMailAttemptsIT.java`

- [ ] **Step 1: Write the failing test** (Testcontainers, `@EnabledIfDockerAvailable` like
      `EmailSuppressionIT`)

```java
@Test
void recordsAttemptsForABookingNewestFirst() {
    BookingId booking = fixtures.confirmedBooking();

    attempts.record(booking, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.WITHHELD_SUPPRESSED,
            Instant.parse("2026-07-03T12:02:11Z"));
    attempts.record(booking, MailAttemptSource.ADMIN_RESEND, MailAttemptOutcome.SENT,
            Instant.parse("2026-07-04T09:31:00Z"));

    List<MailAttempt> history = attempts.historyFor(List.of(booking));

    assertEquals(2, history.size());
    assertEquals(MailAttemptSource.ADMIN_RESEND, history.getFirst().source());
    assertEquals(MailAttemptOutcome.SENT, history.getFirst().outcome());
    assertEquals(MailAttemptOutcome.WITHHELD_SUPPRESSED, history.getLast().outcome());
}

@Test
void rejectsAnUnknownOutcomeToken() {
    assertThrows(DataIntegrityViolationException.class,
            () -> jdbc.sql("""
                    INSERT INTO booking_confirmation_mail_attempt
                        (booking_id, trigger_source, outcome, attempted_at)
                    VALUES (:booking, 'AUTOMATIC', 'DELIVERED', now())
                    """).param("booking", fixtures.confirmedBooking().value()).update());
}

@Test
void rejectsAnAttemptForANonExistentBooking() {
    assertThrows(DataIntegrityViolationException.class, () -> attempts.record(
            new BookingId(-1L), MailAttemptSource.AUTOMATIC, MailAttemptOutcome.SENT, Instant.now()));
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ConfirmationMailAttemptsIT*"`
      → FAIL (`relation "booking_confirmation_mail_attempt" does not exist`)

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation** — the migration first:

```sql
-- V36: what the platform actually DID about each booking-confirmation mail, recorded at send time.
--
-- WHY A TABLE AND NOT THE EVENT PUBLICATION REGISTRY (#380): `event_publication.completion_date`
-- records that the listener RETURNED — which it also does for a suppression skip (#382) and for a
-- confirmation abandoned for missing facts (#428). A registry-derived "dispatched at 14:02" would
-- therefore be wrong in exactly the cases support asks about. `booking.spi.ConfirmationMailDelivery`
-- states the rule: a consumer needing the historical fact records it at send time.
--
-- NO recipient address and NO arrival code, ever: the address stays inside `customer` (ADR-0010
-- erasure reach) and the code is a bearer credential (invariant #7). The booking id is the only key.
--
-- Named for the single kind it records. A `mail_kind` column populated with one value would make
-- "no cancellation attempts" indistinguishable from "cancellation attempts were never recorded";
-- a later slice that records another kind generalises this table alongside its write site.
CREATE TABLE booking_confirmation_mail_attempt
(
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Plain FK in the house style (payout_ledger_entry.booking_id); NO ON DELETE CASCADE — nothing
  -- deletes a booking, and an attempt record outliving its booking would be a lie either way.
  booking_id     BIGINT      NOT NULL REFERENCES booking (id),
  trigger_source TEXT        NOT NULL CHECK (trigger_source IN ('AUTOMATIC', 'ADMIN_RESEND')),
  outcome        TEXT        NOT NULL CHECK (outcome IN ('SENT', 'WITHHELD_SUPPRESSED',
                                                         'TRANSPORT_FAILED', 'ABANDONED_MISSING_FACTS')),
  attempted_at   TIMESTAMPTZ NOT NULL
);

-- The only query shape: history for one or more bookings, newest first. Postgres creates no index
-- for the FK column, and this composite serves both the FK lookup and the ordering.
CREATE INDEX booking_confirmation_mail_attempt_booking_idx
  ON booking_confirmation_mail_attempt (booking_id, attempted_at DESC);

-- DELIBERATELY NO UNIQUE constraint: two admins pressing Resend at the same moment really did make
-- two attempts, and an attempt log that rejects a duplicate attempt is a log that lies.
```

Then `ConfirmationMailAttempts` (port), the three token types with their SQL tokens named as
constants, `MailAttempt`, and the package-private `JdbcConfirmationMailAttempts` using `JdbcClient`
with a text-block `INSERT`/`SELECT … WHERE booking_id IN (:ids) ORDER BY attempted_at DESC`.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*ConfirmationMailAttemptsIT*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — search for other state tokens whose Java/SQL lockstep
      this slice should match (`grep -rn "CHECK (.* IN (" src/main/resources/db/migration`); decide
      and log.
- [ ] **Step 6: Commit** — `git commit -m "feat(#380): record every booking-confirmation mail attempt (V36)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window. **Push and open the
      draft PR now** — CI fires on `pull_request` only, so the branch gets no CI until the draft exists
      (#417).

---

## Phase 1 — Record the automatic path

**Files:** Modify `TransactionalMailService`, `BookingConfirmationMailListener` · Test
`TransactionalMailServiceTest`, `BookingConfirmationMailListenerTest`

- [ ] **Step 1: Write the failing tests**

```java
// TransactionalMailServiceTest
@Test
void reportsTheConfirmationWithheldWhenTheAddressIsSuppressed() {
    suppressions.suppress(GUEST_EMAIL);

    ConfirmationSendOutcome outcome = service.sendBookingConfirmation(GUEST_EMAIL, CONFIRMATION);

    assertEquals(ConfirmationSendOutcome.WITHHELD_SUPPRESSED, outcome);
    assertTrue(mailer.recorded().isEmpty());
}

// BookingConfirmationMailListenerTest
@Test
void recordsAWithheldAttemptWhenTheAddressIsSuppressed() {          // AC-2
    given(mails.sendBookingConfirmation(any(), any())).willReturn(ConfirmationSendOutcome.WITHHELD_SUPPRESSED);

    listener.on(confirmed(BOOKING, SET));

    verify(attempts).record(eq(BOOKING), eq(MailAttemptSource.AUTOMATIC),
            eq(MailAttemptOutcome.WITHHELD_SUPPRESSED), any(Instant.class));
}

@Test
void recordsTheFailedAttemptEvenThoughItRethrows() {                // R-2
    given(mails.sendBookingConfirmation(any(), any())).willThrow(new MailSendException("relay down"));

    assertThrows(MailSendException.class, () -> listener.on(confirmed(BOOKING, SET)));

    verify(attempts).record(eq(BOOKING), eq(MailAttemptSource.AUTOMATIC),
            eq(MailAttemptOutcome.TRANSPORT_FAILED), any(Instant.class));
}

@Test
void doesNotFailTheSendWhenRecordingFails() {                       // R-1
    willThrow(new DataAccessResourceFailureException("gone")).given(attempts)
            .record(any(), any(), any(), any());

    assertDoesNotThrow(() -> listener.on(confirmed(BOOKING, SET)));   // the mail already went out
}

@Test
void recordsAnAbandonedAttemptWhenAFactIsMissing() {
    given(facts.resolve(BOOKING, SET)).willReturn(new BookingMailFacts.Missing(MissingBookingFact.NO_CONTACT));

    listener.on(confirmed(BOOKING, SET));

    verify(attempts).record(eq(BOOKING), eq(MailAttemptSource.AUTOMATIC),
            eq(MailAttemptOutcome.ABANDONED_MISSING_FACTS), any(Instant.class));
}
```

- [ ] **Step 2: Run them, verify they fail** —
      `./gradlew test --tests "*TransactionalMailServiceTest*" --tests "*BookingConfirmationMailListenerTest*"`
      → FAIL (compile: `void` cannot be converted, `attempts` unknown)
- [ ] **Step 3: Minimal implementation** — `sendBookingConfirmation` returns
      `ConfirmationSendOutcome` (suppressed branch `WITHHELD_SUPPRESSED`, otherwise `SENT`; the
      transport failure still propagates untouched). The listener records each branch, and its
      recording call is wrapped so a recording failure is logged at `WARN` and swallowed **there
      only** — never around the send. The existing `MAIL_CONFIRMATION_ABANDONED` counter and its
      `ERROR` line stay exactly as #428 shipped them; the record is additive.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS; then the module's package:
      `./gradlew test --tests "ai.riviera.platform.notification.*"`
- [ ] **Step 5: Generalization-audit pass** — the two sibling registry listeners (#374 cancellation,
      #373 payment-due) discard the same outcome. Decision: **skip by design** (Non-goals, R-6) —
      log the search and the reason.
- [ ] **Step 6: Commit** — `git commit -m "feat(#380): record the automatic confirmation-mail attempt with its real outcome"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The three new reads

**Files:** Modify `BookingNotificationFacts` + `JdbcBookingNotificationFacts`, `CustomerLookup` + its
adapter · Create `CustomerBookings`, `JdbcCustomerBookings`, `BookingConfirmationFacts`,
`CustomerBookingSummary` · Test `JdbcBookingNotificationFactsIT`, `JdbcCustomerBookingsIT`,
`JdbcCustomerLookupIT`, `ModularityTests`

- [ ] **Step 1: Write the failing tests**

```java
// JdbcBookingNotificationFactsIT
@Test
void readsEveryFactAResendMustRebuildTheMailFrom() {
    BookingId booking = fixtures.confirmedBooking(SET, LocalDate.of(2026, 7, 4), 4500L, "EUR");

    BookingConfirmationFacts facts = notificationFacts.confirmationFacts(booking).orElseThrow();

    assertEquals(SET, facts.setId());
    assertEquals(LocalDate.of(2026, 7, 4), facts.bookingDate());
    assertEquals(4500L, facts.amountMinor());
    assertEquals("EUR", facts.currency());
    assertEquals(fixtures.codeOf(booking), facts.code());
}

// JdbcCustomerLookupIT
@Test
void resolvesAnAddressRegardlessOfCaseOrSurroundingSpace() {
    CustomerId id = directory.findOrCreate(new GuestContact(" Guest@Example.COM ", "Guest", "+355"));

    assertEquals(Optional.of(id), lookup.findByEmail("guest@example.com"));
    assertEquals(Optional.of(id), lookup.findByEmail(" GUEST@example.com "));
}

@Test
void doesNotCreateAContactForAnUnknownAddress() {                   // R-10
    long before = countCustomers();

    assertEquals(Optional.empty(), lookup.findByEmail("nobody@example.com"));
    assertEquals(before, countCustomers());
}

// JdbcCustomerBookingsIT
@Test
void listsTheCustomersBookingsNewestFirstCappedAtTwenty() {
    CustomerId guest = fixtures.guest();
    fixtures.bookingFor(guest, LocalDate.of(2026, 7, 1));
    fixtures.bookingFor(guest, LocalDate.of(2026, 7, 9));

    List<CustomerBookingSummary> found = customerBookings.forCustomer(guest);

    assertEquals(LocalDate.of(2026, 7, 9), found.getFirst().bookingDate());
    assertTrue(found.size() <= 20);
}
```

- [ ] **Step 2: Run them, verify they fail** —
      `./gradlew test --tests "*JdbcBookingNotificationFactsIT*" --tests "*JdbcCustomerLookupIT*" --tests "*JdbcCustomerBookingsIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — the two `booking` reads (text-block SQL, `Optional`/`List`
      returns, `LIMIT 20`) and `CustomerLookup#findByEmail` canonicalising through
      `customer.vocabulary.Emails` inside the adapter. New published types land in
      `booking/vocabulary/` per the kind rule (records, not ports).
- [ ] **Step 4: Run it, verify it passes** — same command → PASS, then the structural net:
      `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*VenueApiRoleSplitTests*"`
- [ ] **Step 5: Generalization-audit pass** — check whether any existing caller re-derives what
      `confirmationFacts` now returns; log findings.
- [ ] **Step 6: Commit** — `git commit -m "feat(#380): publish the reads a mail-delivery view needs"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Resend service + the ADMIN endpoints

**Files:** Create `BookingConfirmationResend(+Service)`, `MailDeliveryLookup(+Service)`,
`MailDeliveryView`, `AdminMailDeliveryController` · Modify `SecurityConfig` · Test
`BookingConfirmationResendServiceTest`, `MailDeliveryLookupServiceTest`, `AdminMailDeliveryIT`

- [ ] **Step 1: Write the failing tests** — unit-level for the service outcomes, integration for the
      endpoints (the `AdminMailOutboxIT`/`OperatorLifecycleIT` harness shape):

```java
// BookingConfirmationResendServiceTest
@Test
void reportsAndRecordsATransportFailure() {                          // AC-5
    given(mails.sendBookingConfirmation(any(), any())).willThrow(new MailSendException("relay down"));

    assertEquals(ResendOutcome.TRANSPORT_FAILED, service.resend(BOOKING));

    verify(attempts).record(eq(BOOKING), eq(MailAttemptSource.ADMIN_RESEND),
            eq(MailAttemptOutcome.TRANSPORT_FAILED), any(Instant.class));
}

@Test
void reportsNoSuchBookingWithoutSendingAnything() {
    given(bookingFacts.confirmationFacts(BOOKING)).willReturn(Optional.empty());

    assertEquals(ResendOutcome.NO_SUCH_BOOKING, service.resend(BOOKING));

    verifyNoInteractions(mails);
    verifyNoInteractions(attempts);
}

// AdminMailDeliveryIT
@Test
void resendDrivesNoOtherBookingConfirmedConsumer(PublishedEvents events) {   // AC-4
    BookingId booking = fixtures.confirmedBookingWithAccrual();
    long ledgerBefore = countLedgerEntries();

    admin().perform(post("/api/admin/mail-deliveries/{id}/resend", booking.value()).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outcome").value("SENT"));

    assertEquals(0, events.ofType(BookingConfirmed.class).matching(e -> true).size());
    assertEquals(ledgerBefore, countLedgerEntries());
    assertEquals(2, mockMailer.confirmationsTo(GUEST_EMAIL).size());
}

@Test
void neverRendersTheArrivalCode() {                                          // AC-8
    String body = admin().perform(post("/api/admin/mail-deliveries/lookup")
            .contentType(APPLICATION_JSON).content("{\"email\":\"" + GUEST_EMAIL + "\"}").with(csrf()))
            .andReturn().getResponse().getContentAsString();

    assertFalse(body.contains(fixtures.codeOf(BOOKING)));
}

@Test
void deniesANonAdminOperator() {                                             // AC-6
    plainOperator().perform(post("/api/admin/mail-deliveries/lookup") /* … */).andExpect(status().isForbidden());
    anonymous().perform(post("/api/admin/mail-deliveries/lookup") /* … */).andExpect(status().isUnauthorized());
}
```

- [ ] **Step 2: Run them, verify they fail** —
      `./gradlew test --tests "*BookingConfirmationResendServiceTest*" --tests "*AdminMailDeliveryIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — the resend service (facts → `BookingMailFactsService.resolve`
      → chokepoint → record → typed `ResendOutcome`), the lookup service (address → `CustomerId` →
      bookings → attach attempts + venue names), the controller with `record` request/response DTOs
      and `200` for every expected outcome, and the two ADMIN-gated paths in `SecurityConfig`.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS, then
      `./gradlew test --tests "ai.riviera.platform.notification.*" --tests "*SecurityConfig*" --tests "*ErrorContractArchitectureTests*"`
- [ ] **Step 5: Generalization-audit pass** — compare the two admin controllers' outcome-reporting
      shape; keep them consistent or record the deviation.
- [ ] **Step 6: Commit** — `git commit -m "feat(#380): admin mail-delivery lookup and one-click confirmation resend"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — The console card

**Files:** Create `admin-mail-delivery.ts`, `admin-mail-delivery.service.ts`,
`admin-mail-delivery.spec.ts`, `admin-mail-delivery.a11y.spec.ts` · Modify `admin.model.ts`,
`admin-mail-outbox.ts`

- [ ] **Step 0: Re-run the Skill-routing gate** — load `angular-developer` + the angular-cli MCP
      (`get_best_practices`, and `search_documentation` for Signal Forms in v22) and
      `riviera-tailwind`; append both to *Skills consulted* with what they changed.
- [ ] **Step 1: Write the failing specs** — lookup renders a booking with its attempts; empty state
      reads "no attempts recorded" distinctly from "no bookings"; resend button reports the outcome
      into the `aria-live` region and refreshes that booking's attempts; a rejected request shows an
      error without wiping the results; axe clean in the loaded and populated states.
- [ ] **Step 2: Run them, verify they fail** — `cd frontend && npx vitest run src/app/admin` → FAIL
- [ ] **Step 3: Minimal implementation** — Signal Forms email field, the `@Service()` client, the card
      rendered under the outbox card on `/admin/email`, Tailwind tokens only (`--riv-card-*`), dates
      formatted in `Europe/Tirane`.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/admin && npm run lint`
- [ ] **Step 5: Generalization-audit pass** — check the outbox card's notice/`aria-live` pattern is
      reused rather than re-invented; log.
- [ ] **Step 6: Commit** — `git commit -m "feat(#380): mail-delivery lookup and resend on the admin Email tab"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — Playwright coverage (CI-safe mocked suite)

**Files:** Create `frontend/e2e/admin-mail-delivery.e2e.ts`

- [ ] **Step 0: Re-run the Skill-routing gate** — load `playwright-cli`; consult
      `riviera-review-overlay` RV-FE-E2E for suite placement (this spec is **mocked**, in
      `frontend/e2e/`, never `real-backend/`).
- [ ] **Step 1: Write the failing spec** — admin signs in (existing `auth-mocks.ts` helpers), routes
      `POST **/api/admin/mail-deliveries/lookup` and `**/resend`, asserts the history renders newest
      first, the resend reports `SENT`, a `WITHHELD_SUPPRESSED` response renders as a withheld
      notice rather than an error, and `expectNoSeriousAxeViolations` passes on the populated card.
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- admin-mail-delivery` → FAIL
- [ ] **Step 3: Minimal implementation** — adjust test ids/roles as the spec demands; no production
      logic should be needed here.
- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y` (whole mocked suite — it is CI's)
- [ ] **Step 5: Generalization-audit pass** — n/a unless the spec exposes a defect; then log it.
- [ ] **Step 6: Commit** — `git commit -m "test(#380): e2e the admin mail-delivery view and resend"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 6 — Substrate docs + close-out

- [ ] **Step 1:** `RESPONSIBILITIES.md` — `notification` gains the attempt record + the admin
      lookup/resend; `booking` gains the two published reads; `customer` gains the by-email read.
- [ ] **Step 2:** `CLAUDE.md` — the `notification` module row records the attempt table and *why it is
      not the registry*; the `booking` row records the new published reads.
- [ ] **Step 3:** `docs/adr/ADR-0011` — a note under decision 5: an admin resend is a **second
      trigger** for an existing mail, sent synchronously on the request thread with the outcome
      reported, and is therefore not a third vehicle.
- [ ] **Step 4:** Load `riviera-docs-freshness` and audit the slice's own range.
- [ ] **Step 5:** Comment the AC-1/AC-5 rewording on issue #380 (see Execution status → issue drift).
- [ ] **Step 6:** Finalise Execution status **in this PR's last commit** — stage pointer `DONE`, every
      phase ✅ with its commit, risks closed, Open Questions empty, `merged via PR #NN` (the PR number,
      never a merge SHA).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 0 (V36 + attempt log) | state tokens whose Java enum and SQL `CHECK` must stay in lockstep | `grep -rln "CHECK (.* IN (" src/main/resources/db/migration` | 14 migrations | **Matched the house pattern, added no new one**: V36's tokens are the enum constants' `name()`, and the lockstep is pinned by inserting every constant (`ConfirmationMailAttemptsIT.storesEvery*TheEnumSpells`). No existing table needs a change — several already carry an equivalent pin, and retrofitting the rest is out of this slice. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*AdminMailDeliveryIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** `./gradlew test --tests "*BookingConfirmationMailListenerTest*"` → PASS. Commit `<sha>`.
- [ ] **AC-3:** `./gradlew test --tests "*AdminMailDeliveryIT*"` → PASS. Commit `<sha>`.
- [ ] **AC-4:** `./gradlew test --tests "*AdminMailDeliveryIT*"` → ledger count unchanged, no
      `BookingConfirmed`. Commit `<sha>`.
- [ ] **AC-5:** `./gradlew test --tests "*BookingConfirmationResendServiceTest*"` → PASS. Commit `<sha>`.
- [ ] **AC-6:** `./gradlew test --tests "*AdminMailDeliveryIT*"` → 403/401. Commit `<sha>`.
- [ ] **AC-7:** `./gradlew test --tests "*AdminMailDeliveryIT*"` → `200` + empty list. Commit `<sha>`.
- [ ] **AC-8:** `./gradlew test --tests "*AdminMailDeliveryIT*" --tests "*ConfirmationMailAttemptsIT*"` → PASS. Commit `<sha>`.
- [ ] **AC-9:** `npx vitest run src/app/admin && npm run test:e2e:a11y` → PASS. Commit `<sha>`.
- [ ] **AC-10:** `npm run test:a11y && npm run test:e2e:a11y` → no serious violations. Commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified: no write path, no read of the table); no
      concurrency test needed and the reason is written down (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; the three new
      reads are inbound `api/` ports with published types in the right surface by kind (invariant #11);
      `allowedDependencies` needed no widening.
- [ ] **Payment/payout** section filled (N/A justified) and AC-4 proves the resend re-drives neither
      (invariants #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: `attempted_at` stored as UTC `TIMESTAMPTZ`, rendered in `Europe/Tirane`
      (invariant #6).
- [ ] Booking codes never rendered, logged, or stored by this slice (invariant #7) — AC-8.
- [ ] Flyway **V36** present, its `CHECK`s and FK tested (invariant #12); number still unclaimed at
      merge time.
- [ ] **Frontend** standards met (Signal Forms, signals, no `ngClass`/`ngStyle`, Tailwind tokens) and
      no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 invocation ladder *plus*
      `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
