# Venue-caused cancellation — the VENUE_CHANGE refund, the release and decline legs, the typed confirmation and the rebook mail Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A remodel commit whose claims classify as *move*, *refund* or *release/decline* goes
through: in the one transaction `venue` owns, every confirmed claim with no candidate is cancelled
with reason `VENUE_CHANGE`, every `AWAITING_PAYMENT` claim is released and every `PENDING_REQUEST`
claim declined; the refunds drain afterwards on the existing refund executor, the released
bookings' uncollected PaymentIntents are voided there too, and the guest's cancellation mail
carries a rebook link to the venue's map for the same date — or to the discovery list for that
date when the venue cannot sell it. A commit that refunds anything is refused unless the operator
types the refund count the fresh picture holds and gives a reason; both, with the refunded total
and every refund, release and decline line, land on the persisted receipt.

**Architecture:** The commit keeps the seat #1034 built — `venue.api.BeachMapRemodel#commit` owns
the transaction and the venue-wide set lock, the root's `RemodelCommitService` is its gate, and
`booking.api.RemodelClaims#commit` re-derives the classification under those locks. This slice
widens what that re-derivation *applies*: `Blocked` is still the only refusal, and the three new
legs reuse the guarded transitions the tree already has (`cancelConfirmed`, `cancelAwaitingPayment`,
`declinePending`) plus the existing events, so nothing in the transaction talks to Stripe and every
downstream — refund, reversal, mails — is the spine that already drains them. The typed
confirmation is a rule about the commit, so it rides the port as a `RefundConfirmation` value and
is checked inside `booking`, after the token and after the appliability check, answering a fourth
`RemodelCommit` arm.

**Persistence:** JDBC only (invariant #1). **Flyway `V53__venue_caused_cancellation.sql`:**
`remodel_receipt.refund_reason TEXT` (the operator's free text, NULL when the commit refunded
nothing) and a new `booking`-owned `remodel_receipt_outcome` table — one row per refunded, released
or declined claim, snapshotting the spot by label with the amount in integer minor units
(invariant #5). Both reason CHECKs already admit `VENUE_CHANGE` (V52, #1034); V53 adds no
constraint churn and carries the one-line comment distinguishing it from the reserved `CONFLICT`.
New SQL: the outcome insert and its read alongside the moves, and the receipt's reason column on
both receipt reads.

**Source of intent:** GitHub issue #1035 (parent epic #1027, revision 3 — user stories 22, 31–32
and 35).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced, all from the
code: (1) AC-1 is **already half-shipped** — V52 (#1034) widened both `cancel_reason` and
`payout_reason` CHECKs to admit `VENUE_CHANGE` and `RemodelCommitMigrationIT` already pins every
enum value against both, so V53 owes only the distinguishing comment and the receipt's new shape,
never a re-created constraint; (2) `AWAITING_PAYMENT` has **no existing mail** — the
`payment_intent.canceled` webhook and the TTL sweep both release silently through
`ClaimReleaseService`, which publishes nothing — so "its existing mail" can only mean the
`BookingCancelled` cancellation mail, reached by publishing that fact with `refundMinor = 0`, which
the payout reversal listener already no-ops on (`refundMinor <= 0` ⇒ the accrual stands) and the
refund listener already skips; (3) releasing an unpaid booking without voiding its PaymentIntent
leaves a live intent on a cancelled booking — the abandoned sweep's own Javadoc states such an
intent "sits in `requires_payment_method` indefinitely", and the sweep only ever reads
`AWAITING_PAYMENT` rows, so nothing would ever reach it again: the release leg owes an
after-commit void, on the refund bulkhead, outside the transaction; (4) `remodel_receipt_move`
carries FKs to `set_position` because a moved booking's own `set_id` moves away and stops pinning
the old spot — a refunded/released/declined booking keeps its `set_id`, so the outcome table
records the set id **without** an FK and `BookingPresence#hasBookings` needs no third arm;
(5) `RequestDeclinedMail` is a settled product decision with no call-to-action, so a remodel-caused
decline reuses it verbatim and only the refund and release mails carry the rebook link — the
narrowing the ticket states over story 32; (6) the discovery list does not read a `?date` query
param today, so "the discovery list for that date" needs one added to `pages/home`; (7) no open
PRs — `V53` is free on `main` and unclaimed; #1034 closed out on the epic with PR #1052 and
`docs/plans/remodel-commit.md` retires in this close-out) ·
`riviera-plan-doc` (this template — forced a seam per AC, the module-ownership table for the three
legs and the mail decision, and the parity ledger for the commit's widened contract) ·
`tdd` (each phase red first at its named seam; the mixed-commit IT is written before the legs and
stays red until phase 2) · `riviera-review-overlay` (review gate — runs at ready-for-review over `170568dd..<head>`) · `riviera-docs-freshness` (**ran** over `170568dd..HEAD`: four findings, all patched — the
`notification` grants paragraph, the refund-bulkhead fitness function's non-vacuity test, ADR-0020's
status and decision 1, and the three enumerations of `booking`'s single `BookingCancelled` listener;
`docs/plans/remodel-commit.md` retired) · `riviera-stripe-payments` (collect-only, no Connect: the `VENUE_CHANGE`
refund is the existing `BookingCancelled` → `RefundPort` path with the gateway's
already-holds check as the idempotency guarantee, so a redelivery returns the same refund rather
than making a second; the release leg's void is `CancelPaymentPort`, which moves no money) ·
`riviera-modulith` (kept the composition at the root — `venue` still never learns what a booking
is; the confirmation is a `booking.vocabulary` record on the existing port rather than a fifth
port; the new payment-void listener is a `booking` driving adapter, not a root listener) ·
`riviera-java-conventions` (typed outcomes over exceptions for the unconfirmed commit; the sealed
`RemodelCommit` gains a fourth arm so both switches stay exhaustive without a `default`; money as
integer minor units on the receipt) · `postgres` (`TEXT` + `CHECK` for the outcome kind rather than
a native enum; `BIGINT` identity PK; every FK column indexed; the recorded-not-referenced set id
with its stated reason) · `codebase-design` (the deletion test rejected a separate
"apply-non-move-outcomes" port: it would be a pass-through over the same re-derivation
`RemodelClaims#commit` already does under the same locks) · `domain-modeling` (`CONTEXT.md` gains
**Venue-caused refund**; `RESPONSIBILITIES.md` §`booking` and §`notification` gain the legs and
the rebook link) · `riviera-frontend` (the confirmation step stays inside
`operator/remodel-preview-panel.ts` — the panel already owns the picture and its counts, so a
second component would be a shallow module; the `?date` read belongs to `pages/home`, which may
take `core`/`shared` only) · `angular-developer` + the angular-cli MCP (verified below) ·
`riviera-tailwind` (verified below) · `playwright-cli` (the mocked layout-editor spec covers the
commit-with-refunds flow; the real-backend spec extends #1034's to a refund outcome) ·
`riviera-local-debug` (clone unshallowed; system Gradle on the JDK 21 daemon compiling on the JDK
25 toolchain; scoped `--tests`; the structural net after the port and event changes; the module
tests for the root-bean blast radius; the mocked e2e via `PW_CHROMIUM_EXECUTABLE`).

**Angular-idiom check (angular-cli MCP, framework v22).** `list_projects` → one workspace at
`frontend/`, `frameworkVersion` 22, Vitest. `get_best_practices` for that workspace →
`input()`/`output()` over decorators, `model()` for two-way, `computed()` for derived state,
`linkedSignal()` for state derived from several reactive sources, **Signal Forms
(`@angular/forms/signals`) preferred for new forms in v22**, native control flow, no explicit
`standalone`/`OnPush`. `search_documentation` (v22) for each API in scope:
- **Signal Forms validation** — confirmed `form(model, path => …)` with `required(path.x, {message})`
  and `validate(path.x, ({value, valueOf}) => ({kind, message}) | null)` for the cross-field rule,
  `form().invalid()` for the submit gate, `FormField` as the template directive. **Changed because
  of it:** the refund confirmation was going to be two bare `signal()`s with an `(input)` handler
  copied from `shared/confirm-with-reason.ts`; it becomes a Signal Form with a `required` reason and
  a `validate` count rule, which is what v22 prescribes and what four in-tree forms already do.
- **`linkedSignal`** — confirmed the `{source, computation}` overload returns a `WritableSignal`
  reset by its source, and then **rejected it here**: reseeding the discovery page's `selectedDate`
  from the route would have shown a new date label over the old counts, because the refetch is a
  command and not derived state. The page keeps a plain writable signal, seeded from the route
  snapshot, with the constructor subscribing to `queryParamMap` so a later `?date`-only navigation
  sets the date and reloads together. Verified against the same guide that a data fetch does not
  belong in an `effect`.
- **`output()`** — confirmed a typed payload; the panel's `committed` output stops being
  `output<void>()` and carries the confirmation.
- **`resource()`/`httpResource`** — searched and **deliberately not used**: both new server calls
  are writes (`POST …/commit`), and the guide's own tip is to avoid `httpResource` for mutations;
  the tree already records that decision on `admin-commissions.service.ts`.
- **Control flow** — `@if`/`@for` only, as the touched templates already use.

**Tailwind-v4 check (tailwindcss.com/docs, v4.3 as pinned).** Verified `--color-*` theme variables
generate `bg-*`/`text-*`/`border-*` utilities and that `@theme inline` is what keeps a utility
emitting `var(--riv-*)` so the per-scope overrides still resolve; verified arbitrary values
(`text-[12.5px]`) are the documented escape hatch. **No `@apply`** anywhere (repo rule, not a
Tailwind rule — `riviera-tailwind` rule 1); sharing stays at the component layer. **Changed because
of it:** the confirmation's two fields were going to wear the console field skin
(`border-riv-field-border bg-riv-console-inset/70 text-riv-card-ink`, copied from
`shared/confirm-with-reason.ts`). That skin **themes**, and the remodel panel's ground
(`--riv-warn-fill`) is a **fixed** fill declared once with no dark override — a themed ink or fill
over it drifts in the dark console exactly as `tailwind.css`'s own note on the family warns. The
fields therefore paint in the fixed warn family only: `border-riv-warn-edge bg-riv-warn-fill
text-riv-warn-ink`, the 6.86:1 pair `shared/warn-token-skin.contrast.spec.ts` already proves. No new
token, no colour literal (`operator/console-literal-sweep.spec.ts` admits none).

**Both checks re-run in review, against the diff (the brief's second pass).**
*Angular (angular-cli MCP, v22).* `list_projects` → the same single v22/Vitest workspace;
`get_best_practices` re-read. `search_documentation` on **Signal Forms field metadata** confirmed
what the diff actually shipped: `required()` and `maxLength()` are constraint validators that both
enforce and publish a metadata key, while `validate()` enforces without publishing — so the
panel's `maxLength(path.reason, 500)` is what surfaces the limit to the control, and the separate
`validate` blank rule is not redundant with `required` (a whitespace-only reason passes `required`
and fails the blank rule). `FormField` with `[formField]` is confirmed as the v22 template
directive the diff binds. Nothing changed as a result: the diff already matched. The one idiom the
diff had to give up stands — `NG8022` forbids a literal `min`/`maxlength` attribute beside
`[formField]`, so both constraints live in the schema.
*Tailwind v4 (tailwindcss.com/docs).* Re-verified against the diff's own classes: a `--color-*`
theme colour takes the slash opacity modifier (`border-riv-warn-edge/60`) exactly as a palette
colour does, and `bg-*`/`text-*`/`border-*` resolve custom names identically. The diff adds **no
`@apply`** (repo rule 1) and no colour literal. Ground discipline re-checked line by line: every
`--riv-warn-*` class sits on the fixed warn ground of `remodel-preview-panel`, and the one themed
ink in the slice (`text-riv-card-ink-soft`) sits in `remodel-receipt-panel`, on the themed card
ground. Nothing changed as a result.

**Branch:** `claude/riviera-refunds-3rsa0g` — the cloud session's designated remote branch stands
in for `feature/venue-caused-cancellation` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the V53 schema, when a receipt records a refunded, released and declined
      claim with the operator's reason, then the outcome kind CHECK refuses an unknown token, a
      negative amount is refused, every FK column carries an index, and both reason CHECKs still
      admit all four `RefundReason` values. *Seam:* the `booking`-owned tables (`remodel_receipt`,
      `remodel_receipt_outcome`) · *Pinned by:*
      `VenueCausedCancellationMigrationIT.receiptOutcomeTableHoldsItsShape`
- [x] **AC-2:** Given a disturbed set holding one `CONFIRMED` claim beyond the refund-notice floor
      with no free same-or-better set that day, when `RemodelClaims#commit` runs with a matching
      token and a confirmation naming one refund and a reason, then the booking is `CANCELLED` with
      reason `VENUE_CHANGE` and its full amount as `refundMinor`, its `(set, date)` row is released,
      exactly one `BookingCancelled` carrying `VENUE_CHANGE` is published, and nothing calls Stripe
      inside the transaction. *Seam:* `booking.api.RemodelClaims#commit` · *Pinned by:*
      `RemodelClaimsServiceTest.refundsAConfirmedClaimWithVenueChange`
- [x] **AC-3:** Given the same set holding one `AWAITING_PAYMENT` and one `PENDING_REQUEST` claim,
      when the commit runs, then the first is `CANCELLED` with a `BookingCancelled` carrying
      `refundMinor = 0` and reason `VENUE_CHANGE`, the second is `DECLINED` with a
      `BookingRequestDeclined`, both `(set, date)` rows are released, and no payout reversal is
      posted for either. *Seam:* `booking.api.RemodelClaims#commit` · *Pinned by:*
      `RemodelClaimsServiceTest.releasesUnpaidAndDeclinesPendingWithoutMoney`
- [x] **AC-4:** Given a fresh picture holding two refunds, when the commit carries a confirmation
      whose count is one, or whose reason is blank, then the answer is `RemodelCommit.Unconfirmed`
      naming two, and nothing is written — no transition, no availability release, no receipt.
      *Seam:* `booking.api.RemodelClaims#commit` · *Pinned by:*
      `RemodelClaimsServiceTest.refusesACommitWhoseRefundCountOrReasonDoesNotMatch`
- [x] **AC-5:** Given a fresh picture holding a `Blocked` claim or a staff walk-in hold, when the
      commit carries a correct confirmation, then it is still refused and no claim is refunded,
      released or declined. *Seam:* `booking.api.RemodelClaims#commit` · *Pinned by:*
      `RemodelClaimsServiceTest.blockedAndHeldPicturesAreStillRefusedWhateverTheConfirmation`
- [x] **AC-6:** Given an owner posting a save that removes three sets carrying a movable claim, a
      refundable one, an unpaid one and a pending request, when the body carries the preview token,
      the refund count and a reason, then `POST /api/venues/{id}/beach-map/commit` answers `200`
      with a receipt listing the move, the refund with its amount, the release, the decline, the
      refunded total and the reason; the layout is saved; and a non-owner is `403`. *Seam:*
      `POST /api/venues/{venueId}/beach-map/commit` · *Pinned by:*
      `RemodelCommitIT.commitsAMixedPictureAndReceiptsEveryOutcome`
- [x] **AC-7:** Given the same body without the refund count or without the reason, when it is
      posted, then the answer is `409 REFUND_NOT_CONFIRMED` carrying the fresh preview and its
      token — the count to type is that picture's own `refunds.length` — and the layout is
      unchanged. *Seam:*
      `POST /api/venues/{venueId}/beach-map/commit` · *Pinned by:*
      `RemodelCommitIT.refusesACommitWithRefundsThatIsNotTypedOut`
- [x] **AC-8:** Given a committed receipt with refund, release and decline lines, when its owner
      reads `GET /api/venues/{id}/remodels/{receiptId}`, then every line is returned with its spot,
      day and amount plus the reason and refunded total, and a foreign venue's receipt reads `404`.
      *Seam:* `GET /api/venues/{venueId}/remodels/{receiptId}` · *Pinned by:*
      `RemodelReceiptIT.readsRefundReleaseAndDeclineLinesWithTheReason`
- [x] **AC-9:** Given a `BookingCancelled` carrying reason `VENUE_CHANGE` and `refundMinor = 0`,
      when the booking module's listeners run after commit, then the booking's PaymentIntent is
      cancelled through `payment.api.CancelPaymentPort`, no refund is issued, and a transient
      gateway failure throws so the publication stays outstanding. *Seam:*
      `booking.events.BookingCancelled` (the module's after-commit listeners) · *Pinned by:*
      `RemodelReleasePaymentListenerTest.voidsTheUncollectedIntentOfAReleasedClaim`
- [x] **AC-10:** Given a `VENUE_CHANGE` cancellation of a booking at a venue whose sales for that
      date are open, when the cancellation mail is sent, then it carries a rebook link to that
      venue's map for that date; and given a venue closed for season or past its sales close for
      the date, then the link is the discovery list for that date. Suppression is honoured on both.
      *Seam:* `booking.events.BookingCancelled` → `notification.application.Mailer#sendBookingCancellation`
      · *Pinned by:* `BookingCancellationMailListenerTest.rebookLinkFallsBackToDiscoveryWhenTheVenueCannotSell`
- [x] **AC-11:** Given the remodel preview panel showing two refunds and one release, when the
      operator opens it, then Save is inert until the refund count reads `2` and a reason is typed,
      the count and reason ride the `committed` output, and the panel keeps its axe-clean
      `alertdialog` shape and 44 px targets. *Seam:* `<app-remodel-preview-panel>` (its `preview`
      input and `committed` output) · *Pinned by:*
      `remodel-preview-panel.spec.ts` › `arms Save only once the refund count and reason are typed`
- [x] **AC-12:** Given a receipt carrying refunds, releases, declines, a reason and a refunded
      total, when the receipt panel renders it, then each group is listed with its spot, day and
      amount, the reason and the total are shown, and both are absent when the commit refunded
      nothing. *Seam:* `<app-remodel-receipt-panel>` (its `receipt` input) · *Pinned by:*
      `remodel-receipt-panel.spec.ts` › `lists the refund, release and decline lines with the reason and total`
- [x] **AC-13:** Given `/?date=2026-07-04`, when the discovery page loads, then it counts
      availability for that date, and a past or malformed value clamps to the earliest bookable day.
      *Seam:* the `/` route (its `?date` query param) · *Pinned by:*
      `home.spec.ts` › `seeds the selected date from the route's ?date and clamps a past one`
- [x] **AC-14:** Given the mocked editor, when the operator saves a layout whose preview holds a
      refund, types the count and a reason and confirms, then the commit POSTs both, the receipt
      replaces the dialog listing the refund line, and the surface is axe-clean. *Seam:* the
      operator console's beach-map route · *Pinned by:*
      `frontend/e2e/layout-editor.e2e.ts` › `a picture with refunds commits once the count and reason are typed`
- [x] **AC-15:** Given a real backend, when a remodel leaves a booked set with nowhere same-or-better
      to go, then Save is inert until the count and reason are typed, the receipt lists the refund
      with that reason, the guest's booking reads `CANCELLED` and refunded, and the mock outbox holds
      the cancellation mail with its rebook link. *Seam:* the deployed HTTP surface · *Pinned by:*
      `frontend/e2e/real-backend/remodel-move.e2e.ts` › `with nowhere same-or-better free, the commit
      refunds the guest under the typed confirmation`

## Non-goals

- **The venue-change fee.** No `FEE` ledger entry type, no net-check relaxation, no ledger-sum
  audit, no statement line — that is #1036, and this slice writes no `payout` code at all.
- **The admin venue-caused-refunds page** (#1036) and the admin-editable fee surface (#1037).
- **Relocation pending** — a homeless booking that waits for the tourist's choice (epic
  *Out of scope*).
- **Changing the existing release path.** The `payment_intent.canceled` webhook and the TTL sweep
  keep releasing silently through `ClaimReleaseService`; only the remodel's own leg mails.
- **Re-wording the declined mail.** A remodel-caused decline reuses `RequestDeclinedMail`
  unchanged (the ticket's "existing mail"); it carries no rebook link.
- **Auto-refunding a race-lost release.** A guest who pays between the commit and the intent void
  gets a loud `ERROR` naming the booking, not an automatic refund (R-6).
- **Undo of a commit** — the epic settled that there is none.

## Behavior-parity ledger

> The slice widens an existing surface (`POST …/beach-map/commit`, shipped by #1034) rather than
> replacing one. Every old behaviour is listed.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A moves-only picture commits, moves each booking, writes the receipt, publishes `BookingMoved` | preserved | untouched; the move leg is the same code, now one arm of four |
| Any refund / release / decline in the fresh picture → `409 REMODEL_REFUSED` | **changed** | those three are applied; `REMODEL_REFUSED` now means a `Blocked` claim only, and its detail sentence narrows to say so |
| A staff walk-in hold on a disturbed set → `409 STALE_PREVIEW` from the edge gate | preserved | the gate is untouched; a held set still cannot be saved away |
| Token mismatch → `409 STALE_PREVIEW` with the fresh preview and its token | preserved | checked first, before appliability and before the confirmation |
| The save's own live-claim probe runs after the gate | preserved | the three legs release their `(set, date)` rows inside the gate, so the probe still sees a clear set |
| `200` body: `receiptId`, `committedAt`, `moves[]` | **changed** (additive) | gains `refunds[]`, `releases[]`, `declines[]`, `refundReason`, `refundedTotal`; existing fields keep their shape and the FE type widens with them |
| `GET …/remodels` summary row: `receiptId`, `committedAt`, `moveCount` | **changed** (additive) | gains `refundCount`; the FE list row widens |
| `GET …/remodels/{id}` returns the moves | **changed** (additive) | returns the outcome lines and the reason beside them |
| The editor previews before any save that drops a loaded set; an empty answer saves straight through | preserved | unchanged |
| The editor offers Save only on a moves-only picture | **changed** | Save is offered on any picture free of staff holds and blocks; a picture with refunds arms it only once the count and reason are typed |
| A stale answer re-renders the dialog in place and re-focuses | preserved | the new `REFUND_NOT_CONFIRMED` answer takes the same path |
| The cancellation mail's `VENUE_CHANGE` opening reads "You cancelled the booking the venue had moved…" | **changed** | that copy now applies only when no rebook link rides the mail (the free exit); a venue-caused refund or release gets its own opening and the link |
| The cancellation mail's zero-refund line reads "No refund applies — … after the free-cancellation cutoff" | **changed** | a released unpaid claim says nothing was charged instead; the cutoff sentence stays for a policy cancellation |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A refunded or released claim's `(set, date)` row is not released, so the save's own live-claim probe refuses the write the gate just paid for, or the set stays sold | med | high | every leg releases through `availability.api.AvailabilityClaim#release` in the same transaction, exactly as the guest cancel does; AC-2/AC-3 assert the row is free and `RemodelCommitIT` asserts the layout committed | agent | closed |
| R-2 | A redelivered `BookingCancelled` refunds twice (invariant #8/#10) | low | high | no new refund path — the existing `BookingRefundListener` issues it, and the gateway is asked what refunds it already holds before creating one; `RemodelCommitIT` re-publishes the event and asserts one refund | agent | closed |
| R-3 | A released claim's payout accrual is reversed although nothing was ever collected (invariant #9) | low | high | `refundMinor = 0` on the release's `BookingCancelled`; `BookingCancelledPayoutListener` returns before touching the ledger on `refundMinor <= 0`; AC-3 asserts no ledger row | agent | closed |
| R-4 | `V53` collides with another branch's migration number | low | med | no open PRs at plan time and `V52` is HEAD's highest; if one appears, the branch that merges second renumbers | agent | closed |
| R-5 | The rebook read (`VenueCatalog#availabilityBetween`) throws or answers empty inside a mail listener, losing the mail | low | med | the listener treats an absent or failed answer as "cannot sell" and falls back to the discovery link — never an exception path; AC-10's fallback case covers it | agent | closed |
| R-6 | The guest pays between the release commit and the async intent void, leaving money collected against a `CANCELLED` booking | low | high | the void runs on the refund bulkhead within seconds of commit; a `NotCancellable` answer (the payment already succeeded) logs `ERROR` naming the booking so it is refunded by hand. Accepted, not closed: closing it needs a refund on a booking that is not being cancelled, which the epic lists as out of scope for this epic | agent | accepted → epic #1027 *Out of scope* |
| R-7 | `BOLA`: a non-owner commits or reads another venue's receipt (invariant #13) | low | high | unchanged — `BeachMapRemodel#commit`, `RemodelClaims#commit` and `ViewRemodelReceipts` each assert ownership through `operator.api.VenueOwnership` before any read or write; AC-6 and AC-8 assert the 403/404 | agent | closed |
| R-8 | The new `409 REFUND_NOT_CONFIRMED` leaks internals or breaks the error contract (§6b) | low | low | built through `ApiProblem` in the controller's typed-outcome switch, like its two siblings; no booking code in `detail` (invariant #7) | agent | closed |
| R-9 | The confirmation's fields drift in the dark console theme over the fixed amber ground | med | med | the fields paint only in the fixed `--riv-warn-*` family; a contrast pair spec asserts the rendered pair and the literal sweep admits no hex | agent | closed |

## Open questions / Assumptions

None outstanding.

### Resolved

- **Assumption:** "each gets its existing mail" for an `AWAITING_PAYMENT` release means the existing
  **cancellation** mail, reached by publishing `BookingCancelled` with `refundMinor = 0` — there is
  no release-specific mail in the tree and the ticket forbids a new one. **Outcome:** built that way
  and pinned by `RemodelClaimsServiceTest.releasesUnpaidAndDeclinesPendingWithoutMoney`; the payout
  listener's own `refundMinor <= 0` branch is what keeps the ledger untouched (`6e64018d`). Stated
  in the PR for the maintainer to object to.
- **Assumption:** a remodel-caused decline keeps the settled `RequestDeclinedMail` copy ("the venue
  declined your request") and carries no rebook link, per the ticket's narrowing of story 32.
  **Outcome:** unchanged, and `RESPONSIBILITIES.md` §`notification` now says so (`062e12f3`).
- **Assumption:** voiding the released booking's PaymentIntent is in scope even though the ticket
  does not name it, because the release leg would otherwise leave a collectable intent on a
  cancelled booking. **Outcome:** built as `RemodelReleasePaymentListener` on the refund bulkhead
  (`0fee9de6`); the race it cannot close is R-6.
- **Open question:** whether the guest's own free exit could be told from a venue-caused refund
  without changing the `BookingCancelled` payload — both are `VENUE_CHANGE`. **Outcome:** yes: the
  commit receipt already records the ended claim, so `BookingNotificationFacts#endedByRemodel` reads
  it and the event is untouched (`062e12f3`).

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged in number — online reserve,
  staff tap-to-mark, guest cancel release, weather refund, request decline/expire/withdraw release,
  abandoned release, and the remodel move's claim-then-release. This slice adds **three release-only
  callers inside the remodel transaction**: the `VENUE_CHANGE` refund, the unpaid release and the
  decline each call `AvailabilityClaim#release(setId, date)` for the spot the claim held. No new
  claim path, so no new way to double-sell.
- **Uniqueness guarantee:** `UNIQUE (set_id, booking_date)` on `set_availability` (V4), untouched.
- **Concurrency strategy:** the whole commit runs inside `venue`'s transaction under the venue row
  lock plus `FOR UPDATE` over every active set row of the venue (#1034). The classification the
  legs act on is re-derived under those locks, so a claim cannot appear or change status between
  the decision and the write; a lost guarded `UPDATE` (0 rows) throws and rolls the whole
  transaction back, exactly as the move leg already does.
- **Pool rule (invariant #3):** untouched. Only the move leg picks a candidate, and it still takes
  online-pool sets only; the three new legs pick nothing.
- **Cutoff rule (invariant #4):** untouched. The remodel zones are durations to service-day open
  (`RemodelZones`), not the sales close; a frozen claim still blocks and is never refunded, and a
  move-only claim without a candidate still blocks — AC-5. The rebook link separately consults the
  venue's per-date sales-open projection, which is where the sales close and the season closure do
  bite (AC-10).
- **Pinning test:** `MoveVsReserveConcurrencyIT` (unchanged) proves a move racing a reserve on the
  candidate cannot both succeed; `RemodelCommitIT.commitsAMixedPictureAndReceiptsEveryOutcome`
  proves each refunded/released/declined `(set, date)` is free after commit.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `booking`, `remodel_receipt`, `remodel_receipt_outcome` | it owns the lifecycle, the cancellation/refund decision and the receipt |
| M-2 | `notification` | existing | none | it owns transactional mail, including the link a booking mail renders |
| M-3 | root (composition) | existing | none | the commit's gate composes `venue` and `booking` (ADR-0020) |

`venue`, `availability`, `payment` and `payout` are **called**, not changed.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` | `RemodelClaims#commit(OperatorId, VenueId, Collection<SetId>, PreviewToken, RefundConfirmation)` | `RefundConfirmation` (new, `booking.vocabulary`), `RemodelCommit.Unconfirmed` (new arm) | the root's `RemodelCommitService` |
| NI-2 | `payment.api` | `CancelPaymentPort#cancel(BookingRef)` | `PaymentCancellation` | `booking` (new caller: the release leg's void) — grant already held |
| NI-3 | `venue.api` | `VenueCatalog#availabilityBetween(VenueId, from, to)` | `DailyAvailability` | `notification` (new caller: the rebook link) — grant already held |

No new port and no new grant: every edge above is already in the owner's `allowedDependencies`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` | `booking` (new publisher: the remodel's refund and release legs) | `{bookingId, venueId, setId, bookingDate, refundMinor, currency, reason}` | `payout`, `notification`, `booking`'s own refund listener, `booking`'s new intent-void listener | async `AFTER_COMMIT` | `RemodelClaimsServiceTest`, `RemodelCommitIT` |
| EV-2 | `BookingRequestDeclined` | `booking` (new publisher: the remodel's decline leg) | `{bookingId, setId, bookingDate}` | `notification` | async `AFTER_COMMIT` | `RemodelClaimsServiceTest` |

**No new event.** `CLAUDE.md` still counts nine.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide that a disturbed confirmed claim is refunded in full with reason `VENUE_CHANGE` | `booking` | `booking` Job: "the whole lifecycle … cancellation policy, driving refunds via `payment.api.RefundPort`"; **not** `payment`, whose Not-My-Job is "deciding whether/how much to refund → `booking`" |
| Release an unpaid claim and decline a pending request as part of a remodel | `booking` | same Job line — the three terminal legs already live in `booking.application` (`ClaimReleaseService`, `RequestReleaseService`); the remodel reuses those guarded transitions rather than inventing a fourth |
| Refuse a commit whose typed refund count or reason does not match | `booking` | it is a rule about the commit `booking` decides; the root "holds no rule" (`RemodelCommitService`'s own contract) and `venue` may not learn what a booking is |
| Persist the receipt's refund/release/decline lines and the operator's reason | `booking` | it already owns `remodel_receipt`; **not** `audit`, whose surface is the admin trail and whose fence watches `/api/admin/**` only (epic: "the remodel writes no audit row") |
| Void a released claim's uncollected PaymentIntent | `booking` drives, `payment` executes | `payment` Job: "Stripe collection, PaymentIntents, refunds"; `booking` decides *when*, through `payment.api.CancelPaymentPort` — the abandoned sweep's existing direction |
| Choose the rebook link, and fall back when the venue cannot sell the date | `notification` | `notification` Job: transactional mail, and `BookingLinks` already formats a booking link inside the hexagon because registry listeners have no edge flow to build one; the *sellability* answer is read from `venue.api`, never recomputed here |
| Answer whether a venue's online sales for a date are open | `venue` | unchanged — `venue` Job: "sales-close setting, season closure"; the projection is the one the list and map already consult |
| Post a `FEE` for a venue-caused refund | **none — out of scope** | `payout` decides the fee (#1036); this slice writes no `payout` code |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook. Unchanged — this slice confirms nothing.
- **Idempotency:** the `VENUE_CHANGE` refund rides the existing `BookingCancelled` →
  `BookingRefundListener` → `RefundPort` path, whose guarantee is the gateway's already-holds check
  ahead of the booking-derived idempotency key; a redelivered event returns the same refund. The
  guarded `cancelConfirmed`/`cancelAwaitingPayment`/`declinePending` transitions make a re-run a
  0-row no-op, so at most one event per claim is ever published. The intent void is idempotent by
  `CancelPaymentPort`'s own contract.
- **Money:** integer minor units + ISO currency throughout — the refund is the booking's
  snapshotted `amountMinor`, and the receipt stores the same integer per line and derives the
  refunded total by summing them. No division, so no rounding rule is owed.
- **Payout-ledger effect:** a `VENUE_CHANGE` refund reverses its accrual proportionally through the
  existing `BookingCancelledPayoutListener`, stamped with the reason. A release and a decline post
  **nothing**: `refundMinor = 0` returns before the ledger, and a `PENDING_REQUEST` never accrued.
  No `FEE` entry — #1036.
- **Refund policy applied:** venue-caused, full, server-computed from the booking's own amount; the
  guest supplies nothing. The refund-notice floor and the freeze window (`RemodelZones`) decide
  which claims may be refunded at all, and both are checked under the locks.
- **Pinning tests:** `RemodelCommitIT.commitsAMixedPictureAndReceiptsEveryOutcome` (one refund, one
  reversal, no reversal for the unpaid legs), `RemodelClaimsServiceTest` (the three legs and their
  events), `RemodelReleasePaymentListenerTest` (the void and its failure posture).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/remodel-preview-panel.ts|.html` | existing | standalone component | `input()` + `computed()` for the committable rule and the required count; typed `output()` | **Signal Forms** — `required` reason + `validate` count |
| FE-2 | `operator/remodel-receipt-panel.ts` | existing | standalone component | `input()` only | none |
| FE-3 | `operator/layout-editor.ts` | existing | standalone component | signals; carries the confirmation into the commit POST and maps `REFUND_NOT_CONFIRMED` | none |
| FE-4 | `operator/operator-console.model.ts` | existing | types | — | — |
| FE-5 | `operator/operator-console.service.ts` | existing | `@Service` | plain `post` (a mutation, not `httpResource`) | — |
| FE-6 | `pages/home/home.ts` | existing | standalone component | a writable signal seeded from the route, kept in step by a `queryParamMap` subscription | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs.
No deviation.

## FE↔BE contract

- **New/changed endpoints:**
  - `POST /api/venues/{venueId}/beach-map/commit` — body gains `refundCount` (integer, defaults 0)
    and `refundReason` (string, defaults `""`). `200` body gains `refunds[]` and `releases[]` (each
    `{bookingId, bookingDate, spot{setId,rowLabel,positionNo}, amount{minorUnits,currency}}`, and a
    release also `kind: RELEASE | DECLINE` — a decline is a release row, not a third array),
    `refundReason` and `refundedTotal{minorUnits,currency}`. New `409 REFUND_NOT_CONFIRMED` carrying
    `preview` alone (the fresh picture + token): the count to type is that picture's
    `refunds.length`.
  - `GET /api/venues/{venueId}/remodels` — summary row gains `refundCount`.
  - `GET /api/venues/{venueId}/remodels/{receiptId}` — gains the same four fields as the commit's
    `200`.
- **Client typing:** hand-written typed models in `operator/operator-console.model.ts`; never
  `as any`.
- **Money/date on the wire:** amounts as integer minor units + currency (`MoneyView`); dates as ISO
  `LocalDate` strings; instants as ISO-8601 UTC.

## Execution status

**Stage pointer:** `merge close-out — merged via PR #1053`

**Next action:** watch the CI run on this head and pull the Sonar new-issue list; if either
reports, the fix commit rewrites this close-out in place.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V53 + the receipt's outcome lines | ✅ | `6e64018d` |
| 1 — the three legs and the typed confirmation in `booking` | ✅ | `6e64018d` |
| 2 — the edge: commit body, `REFUND_NOT_CONFIRMED`, the receipt reads | ✅ | `6e64018d` |
| 3 — voiding a released claim's PaymentIntent | ✅ | `0fee9de6` |
| 4 — the rebook link on the cancellation mail | ✅ | `062e12f3` |
| 5 — the console: confirmation step, receipt lines, discovery `?date` | ✅ | `59542a97` |
| 6 — e2e: mocked commit-with-refunds, real-backend refund outcome | ✅ | `531224f1` |
| 7 — docs + close-out | ✅ | this commit |

> Phases 0–2 share one commit: the port's widened signature, the legs behind it and the edge that
> calls it are one compile unit, so splitting them would have committed a tree that does not build.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | docs-freshness | `notification/package-info.java` still said "the five listeners' reads … all five assemble the same facts through one shared resolver, so listeners were added without widening them" — this slice adds a `venue::api` read the resolver does not serve | fixed-in this commit |
| F-2 | docs-freshness | `RefundListenerExecutorArchitectureTest`'s non-vacuity test named "the one production listener"; there are now two | fixed-in this commit |
| F-3 | docs-freshness | ADR-0020's status and decision 1 said the commit "re-seats the moves" | fixed-in this commit |
| F-4 | docs-freshness | `CLAUDE.md`, `riviera-modulith/references/events.md` and `riviera-stripe-payments` each named `booking`'s single `BookingCancelled` listener; `events.md` also omitted `BookingMoved` from the notification-only list (drift from #1034) | fixed-in this commit |
| F-5 | review — RV-FE-9 | The refusal focus leg sent focus to Save, which the confirmation step renders `disabled` whenever the fresh picture's refund count differs from the typed one, so focus was stranded on `<body>` inside the `alertdialog` | fixed — `freshPictureLandingSpot()` lands on the refund-count field, covered by the `REFUND_NOT_CONFIRMED` spec |
| F-6 | review — RV-BE-8 | `RemodelReleasePaymentListener`'s `NotCancellable` branch is a money-owed loss (the guest paid for a booking that no longer exists) carrying only a `log.error`; nothing an alert can watch | fixed — `ObservabilityMetrics.REMODEL_RELEASE_COLLECTED`, its runbook row, two unit tests |
| F-7 | review — git history | The new bulkhead listener was outside `RegistryRefundOutbox`'s allowlist, so a shed or thrown intent-void was invisible to `GET /api/admin/refund-outbox` and unreachable by its `POST` until a restart republished it | fixed — the allowlist is the two refund-bulkhead listener ids, pinned by `RefundOutboxScopeTest` |
| F-8 | review — code comments | Four doc statements the diff falsified: `BookingCancellationMail`'s "a fourth constant", `notification/package-info.java`'s five-listener count and its `#95` provenance, `NewReceipt`'s "six arguments" narration | fixed |
| F-9 | review — git history | `RemodelClaims#commit` claimed the caller's set locks make a lost guarded transition impossible; they lock the venue's sets, not the booking rows, so a concurrent webhook, guest cancel or expiry sweep reaches it | fixed — the premise is restated as what actually happens (a rollback the operator's next save reclassifies against); the throw stays, matching the move leg |
| F-10 | review — copy | The preview panel promised every ended guest "a link to book again"; a declined request gets `RequestDeclinedMail`, which carries none | fixed |
| F-11 | review — RV-BE-19 | `refundedTotal` sums the minor units while taking the currency from one row, with no stated basis | fixed — the Javadoc states the invariant-#5 EUR-only basis, on both the commit response and the receipt view |
| F-12 | review — shallow scan | The commit's 409 carried a `requiredRefundCount` extension that restated `preview.refunds.length` | fixed — removed from the controller, the outcome, the vocabulary, the service, the IT and the model doc |
| F-13 | review — Vitest | The past-remodels list fixtures lagged the widened summary shape, so the row rendered "undefined refunded" | fixed — the fixtures carry `refundCount` and the expectation covers both tally shapes |

---

## File structure

- `docs/plans/venue-caused-cancellation.md` — this plan
- `docs/plans/remodel-commit.md` — retired in this close-out (#1034's plan, its PR merged)
- `platform/src/main/resources/db/migration/V53__venue_caused_cancellation.sql` — the receipt's
  reason column and outcome table; the `VENUE_CHANGE`-vs-`CONFLICT` comment
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RefundConfirmation.java` — the
  operator's typed count + reason, published so the edge can carry it
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RemodelCommit.java` — the fourth arm
- `platform/src/main/java/ai/riviera/platform/booking/api/RemodelClaims.java` — the widened contract
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — the three legs
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/ReceiptOutcome.java` — one receipt line
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/ReceiptOutcomeKind.java` — REFUND | RELEASE | DECLINE
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelReceipt.java` — outcomes + reason
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelReceipts.java` — the widened store
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceipts.java` — the outcome SQL
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelReceiptView.java` — the wire shape
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelReleasePaymentListener.java` — the intent void
- `platform/src/main/java/ai/riviera/platform/RemodelCommitService.java` — the gate passes the confirmation
- `platform/src/main/java/ai/riviera/platform/RemodelCommitOutcome.java` — the matching arm
- `platform/src/main/java/ai/riviera/platform/RemodelCommitController.java` — `409 REFUND_NOT_CONFIRMED`
- `platform/src/main/java/ai/riviera/platform/RemodelCommitRequest.java` — the two new body fields
- `platform/src/main/java/ai/riviera/platform/RemodelCommitResponse.java` — the widened `200`
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingLinks.java` — the venue-map and discovery links
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingCancellationMail.java` — the rebook link
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingCancellationMailListener.java` — chooses it
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — renders it
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/MockMailer.java` — records it
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SentEmail.java` — the recorded shape
- `platform/src/test/java/ai/riviera/platform/booking/VenueCausedCancellationMigrationIT.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsServiceTest.java` — AC-2..5
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceiptsIT.java` — the outcome round-trip
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RemodelReleasePaymentListenerTest.java` — AC-9
- `platform/src/test/java/ai/riviera/platform/RemodelCommitIT.java` — AC-6, AC-7, the ledger legs
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/MockMailOutboxController.java` — the rebook link the real-backend spec reads
- `platform/src/test/java/ai/riviera/platform/RemodelReceiptIT.java` — AC-8
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/BookingCancellationMailListenerTest.java` — AC-10
- `platform/src/test/java/ai/riviera/platform/notification/BookingCancellationMailIT.java` — the vehicle + suppression on the venue-caused leg
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SmtpMailerIT.java` — the venue-caused copy
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/MockMailerTest.java`, `platform/src/test/java/ai/riviera/platform/notification/application/TransactionalMailServiceTest.java` — the widened record
- `platform/src/main/java/ai/riviera/platform/notification/application/RebookLinks.java` — which of the two links a mail carries
- `platform/src/main/java/ai/riviera/platform/booking/api/BookingNotificationFacts.java`, `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingNotificationFacts.java` — `endedByRemodel`, the venue-caused discriminator
- `frontend/src/app/operator/operator-console.model.ts` — the widened types + committable rule
- `frontend/src/app/operator/operator-console.service.ts` — the commit body
- `frontend/src/app/operator/operator-console.service.spec.ts` — its spec
- `frontend/src/app/operator/remodel-preview-panel.{ts,html}` — the confirmation step
- `frontend/src/app/operator/remodel-preview-panel.spec.ts` — AC-11
- `frontend/src/app/operator/remodel-preview-panel.a11y.spec.ts` — the a11y pair
- `frontend/src/app/operator/remodel-preview-panel.contrast.spec.ts` — the contrast pair
- `frontend/src/app/operator/remodel-receipt-panel.ts` — the outcome lines
- `frontend/src/app/operator/remodel-receipt-panel.spec.ts` — AC-12
- `frontend/src/app/operator/remodel-receipt-panel.a11y.spec.ts` — the a11y pair
- `frontend/src/app/operator/remodel-receipt-panel.contrast.spec.ts` — the contrast pair
- `frontend/src/app/operator/layout-editor.{ts,html}` — carries the confirmation, maps the new 409
- `frontend/src/app/operator/layout-editor.spec.ts` — the editor's leg
- `frontend/src/app/pages/home/home.ts` — the `?date` read
- `frontend/src/app/operator/remodel-preview-panel.a11y.spec.ts`, `frontend/src/app/operator/remodel-preview-panel.contrast.spec.ts` — the confirmation's pairs
- `frontend/src/app/operator/remodel-receipt-panel.a11y.spec.ts`, `frontend/src/app/operator/remodel-receipt-panel.contrast.spec.ts` — the ended-claim lines' pairs
- `frontend/src/app/operator/operator-console.service.ts` — the commit body and the third 409
- `frontend/src/app/pages/home/home.spec.ts` — AC-13
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java`, `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcSetBookingFacts.java` — `sellsOnlineOn`, the sellability verdict the rebook link picks on (the role-named port, not the tourist-read `VenueCatalog`)
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java`, `platform/src/test/java/ai/riviera/retirefixture/venue/adapter/out/FixtureSetFacts.java` — the fakes that implement it
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RefundReason.java` — `VENUE_CHANGE`'s two shapes stated
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — `REMODEL_RELEASE_COLLECTED` (F-6) and the widened `REFUNDS_SHED`
- `docs/runbooks/observability.md` — the new counter's row and the shed row's second listener
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfig.java` — the pool's population is two listeners now
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/RegistryRefundOutbox.java`, `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundOutbox.java` — the two-id allowlist (F-7)
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/BookingListenerIds.java`, `platform/src/test/java/ai/riviera/platform/booking/adapter/out/RefundOutboxScopeTest.java`, `platform/src/test/java/ai/riviera/platform/booking/RefundOutboxScopeIT.java` — its pins
- `frontend/e2e/layout-editor.e2e.ts` — AC-14
- `frontend/e2e/real-backend/remodel-move.e2e.ts` — AC-15
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/NewReceipt.java` — the receipt as it is written
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java`, `platform/src/test/java/ai/riviera/platform/MoveVsReserveConcurrencyIT.java`, `platform/src/test/java/ai/riviera/platform/booking/FreeExitCancelIT.java`, `platform/src/test/java/ai/riviera/platform/notification/BookingMovedMailIT.java` — the widened port and store call sites
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundListenerExecutorArchitectureTest.java` — the bulkhead rule now examines both listeners
- `platform/src/main/java/ai/riviera/platform/notification/package-info.java` — the grants paragraph (docs-freshness F-1)
- `docs/adr/ADR-0020-remodel-orchestration-at-the-composition-root.md` — the commit settles every claim (F-3)
- `CLAUDE.md`, `.claude/skills/riviera-modulith/references/events.md`, `.claude/skills/riviera-stripe-payments/SKILL.md` — `booking`'s two `BookingCancelled` listeners (F-4)
- `CONTEXT.md` — **Venue-caused refund**
- `RESPONSIBILITIES.md` — §`booking` (the three legs, the confirmation, the receipt) and
  §`notification` (the rebook link and its fallback)

---

## Phase 0 — V53 and the receipt's outcome lines

**Files:** Create `platform/src/main/resources/db/migration/V53__venue_caused_cancellation.sql` ·
Create `booking/application/remodel/ReceiptOutcome.java`, `ReceiptOutcomeKind.java` · Modify
`RemodelReceipt.java`, `RemodelReceipts.java`, `adapter/out/JdbcRemodelReceipts.java` · Test
`booking/VenueCausedCancellationMigrationIT.java`, `booking/adapter/out/JdbcRemodelReceiptsIT.java`

- [x] **Step 1: Write the failing test** — `VenueCausedCancellationMigrationIT`: the outcome table
      accepts one row per kind, refuses an unknown kind and a negative amount, indexes every FK, and
      `remodel_receipt.refund_reason` starts NULL; `JdbcRemodelReceiptsIT` round-trips a receipt
      carrying moves, outcomes and a reason.
- [x] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*VenueCausedCancellationMigrationIT*"` →
      FAIL, relation `remodel_receipt_outcome` does not exist.
- [x] **Step 3: Minimal implementation** — the migration, the two new value types, the widened
      store port and its JDBC adapter.
- [x] **Step 4: Run it, verify it passes** — the same command plus
      `--tests "*JdbcRemodelReceiptsIT*"` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every read of `remodel_receipt`.
- [x] **Step 6: Commit** — `git commit -m "Receipt lines for refunded, released and declined claims (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — the three legs and the typed confirmation in `booking`

**Files:** Create `booking/vocabulary/RefundConfirmation.java` · Modify
`booking/vocabulary/RemodelCommit.java`, `booking/api/RemodelClaims.java`,
`booking/application/remodel/RemodelClaimsService.java` · Test
`booking/application/remodel/RemodelClaimsServiceTest.java`

- [x] **Step 1: Write the failing test** — AC-2..AC-5 at `RemodelClaims#commit`.
- [x] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*RemodelClaimsServiceTest*"` → FAIL, the
      commit refuses a refund picture.
- [x] **Step 3: Minimal implementation** — the fourth `RemodelCommit` arm, the confirmation value,
      and the refund / release / decline legs beside the move leg.
- [x] **Step 4: Run it, verify it passes** — the same command → PASS, then the structural net.
- [x] **Step 5: Generalization-audit pass** — population: every publisher of `BookingCancelled`.
- [x] **Step 6: Commit** — `git commit -m "Apply VENUE_CHANGE refunds, releases and declines in the remodel commit (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — the edge: commit body, `REFUND_NOT_CONFIRMED`, the receipt reads

**Files:** Modify `RemodelCommitService.java`, `RemodelCommitOutcome.java`,
`RemodelCommitController.java`, `RemodelCommitRequest.java`, `RemodelCommitResponse.java`,
`booking/adapter/in/RemodelReceiptView.java` · Test `RemodelCommitIT.java`, `RemodelReceiptIT.java`

- [x] **Step 1: Write the failing test** — AC-6, AC-7, AC-8 at the two routes.
- [x] **Step 2: Run it, verify it fails** — `gradle … --tests "*RemodelCommitIT*"` → FAIL, `409`.
- [x] **Step 3: Minimal implementation** — the body's two fields, the new outcome arm and its
      problem response, the widened `200` and receipt views.
- [x] **Step 4: Run it, verify it passes** — the same command + `--tests "*RemodelReceiptIT*"`.
- [x] **Step 5: Generalization-audit pass** — population: every `ApiProblem` conflict in the root.
- [x] **Step 6: Commit** — `git commit -m "Type the refund count and reason on the remodel commit (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 3 — voiding a released claim's PaymentIntent

**Files:** Create `booking/adapter/in/RemodelReleasePaymentListener.java` · Test
`booking/adapter/in/RemodelReleasePaymentListenerTest.java`

- [x] **Step 1: Write the failing test** — AC-9.
- [x] **Step 2: Run it, verify it fails** — `gradle … --tests "*RemodelReleasePaymentListenerTest*"`.
- [x] **Step 3: Minimal implementation** — the listener on the refund bulkhead.
- [x] **Step 4: Run it, verify it passes**; re-run the `@ApplicationModuleTest`s for blast radius.
- [x] **Step 5: Generalization-audit pass** — population: every `BookingCancelled` listener.
- [x] **Step 6: Commit** — `git commit -m "Void the uncollected intent of a remodel-released booking (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 4 — the rebook link on the cancellation mail

**Files:** Modify `notification/application/BookingLinks.java`, `BookingCancellationMail.java`,
`adapter/in/BookingCancellationMailListener.java`, `adapter/out/SmtpMailer.java`,
`adapter/out/MockMailer.java`, `adapter/out/SentEmail.java` · Test
`notification/adapter/in/BookingCancellationMailListenerTest.java`,
`notification/BookingCancellationRebookMailIT.java`

- [x] **Step 1: Write the failing test** — AC-10, both arms plus suppression.
- [x] **Step 2: Run it, verify it fails** — `gradle … --tests "*BookingCancellationMailListenerTest*"`.
- [x] **Step 3: Minimal implementation** — the two link builders, the mail's new field, the
      listener's sellability read and fallback, and the transports' copy.
- [x] **Step 4: Run it, verify it passes** — plus `--tests "*BookingCancellationRebookMailIT*"`.
- [x] **Step 5: Generalization-audit pass** — population: every `Mailer` implementation.
- [x] **Step 6: Commit** — `git commit -m "Rebook link on the venue-caused cancellation mail, with the discovery fallback (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 5 — the console: confirmation step, receipt lines, discovery `?date`

**Files:** Modify `operator/operator-console.model.ts`, `operator-console.service.ts`,
`remodel-preview-panel.{ts,html}`, `remodel-receipt-panel.ts`, `layout-editor.{ts,html}`,
`pages/home/home.ts` · Test the six specs plus the four a11y/contrast pairs

- [x] **Step 1: Write the failing test** — AC-11, AC-12, AC-13 and the editor's leg.
- [x] **Step 2: Run it, verify it fails** — `npm test -- --run remodel-preview-panel`.
- [x] **Step 3: Minimal implementation** — the Signal Form confirmation, the widened committable
      rule, the receipt's groups, the editor's body, and Home's `linkedSignal` over `?date`.
- [x] **Step 4: Run it, verify it passes** — `npm test`, `npm run lint`, `npm run format:check`.
- [x] **Step 5: Generalization-audit pass** — population: every console surface rendering money.
- [x] **Step 6: Commit** — `git commit -m "Console: type the refund count and reason, receipt lines, discovery date link (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 6 — e2e

**Files:** Modify `frontend/e2e/layout-editor.e2e.ts`, `frontend/e2e/real-backend/remodel-move.e2e.ts`

- [x] **Step 1: Write the failing test** — AC-14 and AC-15.
- [x] **Step 2: Run it, verify it fails** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- layout-editor`.
- [x] **Step 3: Minimal implementation** — none expected; fix whatever the specs expose.
- [x] **Step 4: Run it, verify it passes** — the same command.
- [x] **Step 5: Generalization-audit pass** — population: every mocked commit route.
- [x] **Step 6: Commit** — `git commit -m "e2e: a remodel commit that refunds (#1035)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 7 — docs and close-out

**Files:** Modify `CONTEXT.md`, `RESPONSIBILITIES.md`, this plan · Delete
`docs/plans/remodel-commit.md`

- [x] **Step 1–4:** run `riviera-docs-freshness` over `170568dd..HEAD`, patch what it finds, add the
      glossary entry and the two responsibility paragraphs, retire #1034's plan doc.
- [x] **Step 5: Generalization-audit pass** — the counting sweep for "the two X" facts.
- [x] **Step 6: Commit** — `git commit -m "Document the venue-caused cancellation legs and retire the remodel-commit plan (#1035)"`
- [x] **Step 7:** finalize the Execution status in this same commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `gradle … --tests "*VenueCausedCancellationMigrationIT*"` → PASS.
- [x] **AC-2..5:** `gradle … --tests "*RemodelClaimsServiceTest*"` → PASS.
- [x] **AC-6, AC-7:** `gradle … --tests "*RemodelCommitIT*"` → PASS.
- [x] **AC-8:** `gradle … --tests "*RemodelReceiptIT*"` → PASS.
- [x] **AC-9:** `gradle … --tests "*RemodelReleasePaymentListenerTest*"` → PASS.
- [x] **AC-10:** `gradle … --tests "*BookingCancellationMailListenerTest*" --tests "*BookingCancellationRebookMailIT*"` → PASS.
- [x] **AC-11..13:** `npm test` → PASS.
- [x] **AC-14:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS.
- [x] **AC-15:** `npm run test:e2e` against the local stack → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled; the three release-only callers are inside the locked transaction (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled; webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable and never on an event or in a log (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
