# Where the business rules live: is the thin domain layer placement or flattening?

**Status / provenance.** Findings only, no decision. Follow-up to
`2026-09-04-bounded-context-and-doc-drift-audit.md` §G-1, which established that nine of the
eleven documented "aggregate roots" have no class (that note's own headline said eleven of
thirteen; see its 2026-09-04 amendment) and that this is a service-and-SQL architecture.
This note answers the narrower question that left open:

> Is the domain layer thin because the logic legitimately lives elsewhere, or because business
> rules were flattened into service procedures?

Audited 2026-09-04 against `9f2411d` (`main` + the first note) by reading all 18 `domain/` files,
all 26 branch-carrying files of `booking/application/`, the guarded `UPDATE`s in
`booking/adapter/out/JdbcBookings.java`, and the service layers of `availability`, `customer` and
`operator`. No code was run for this note; the first note's structural-test verification still
stands and nothing here depends on it.

**Scope note.** First drafted against a brief truncated at "STEP 5 — Duplication check"; the full
brief arrived afterwards and confirmed §E's reading. §E and §F were then extended to what the
complete brief asks for — the homeless rules **ranked by duplication evidence**, and a **per-module**
verdict rather than a single one. Section letters follow that brief's A–G.

**TL;DR**

- **Mixed, but heavily weighted to legitimately thin — and the answer differs per module (§F).**
  Nine of twelve modules are thin for reasons the code states and the tests corroborate. `booking`
  is the only module where the answer is genuinely mixed, and the only one large enough for the
  question to bite.
- **Placement, not flattening — with five named exceptions.** The line between `domain/` and
  `application/` in this codebase is drawn by **whether a rule needs an injected collaborator**, not
  by whether it is a rule. Pure rules go to `domain/`; rules needing a `Clock` or a port become a
  named `@Component` in `application/` — `BookingCutoff`, `CancellationPolicy`, `RequestWindows`,
  `RetentionWindow`, `RefundResubmissionWindow`. All five are separately unit-tested, exactly like
  the `domain/` classes.
- **The decisive evidence is the test tree.** `BookingCutoffTest`, `CancellationPolicyTermsTest`
  and `RequestWindowsTest` sit beside `RefundPolicyTest`, `ReviewGateTest`, `CommissionSplitTest`.
  A rule flattened into a procedure cannot be unit-tested in isolation; these all are.
- **A large share of the rules are genuinely in Postgres**, not missing. The booking state machine
  is eleven `WHERE status = :x … RETURNING` predicates plus `booking_status_check`; `operator`'s
  lifecycle is the same idiom. The services only *interpret the miss*.
- **`availability` has no `domain/` and should not.** Its core rule is `UNIQUE(set_id,
  booking_date)` plus one `INSERT … ON CONFLICT DO NOTHING`. Exactly one small rule sits in its
  service, and it is a one-liner.
- **Five real instances of flattening**, all in `booking`: `ViewBookingService.toDetail` (six inline
  predicates), `CheckInService.classify`, the admitted-status lists in `JdbcBookings`,
  `StaffAvailabilityService`'s past-date guard, and the absence of any Java statement of the booking
  transition table.
- **The extractability shape test, derived from `review/domain/`, is four-part:** pure, multi-caller,
  a choice rather than a consequence, and it names its own DB counterpart. Most STEP-2 rules fail
  clause 2 — they have exactly one caller — which is why they never moved.
- **One duplication is load-bearing and only held by a comment:** `ViewBookingService`'s
  `payWindowClosed` re-derives in Java what the abandoned sweep states in SQL. It ranks first in §E;
  the break in that ranking falls between ranks 3 and 4, below which every rule is single-caller.
- **`review` shows the benchmark working.** Its services *call* `ReviewGate.stateOf` from two places
  rather than re-deriving it — the direct internal contrast with `booking`'s "who may cancel",
  stated four times across three layers with no shared function.

---

## A. Domain layer inventory

18 files across 5 modules; 7 modules have none.

| Module | Files | File | Lines | Kind |
|---|---|---|---|---|
| `venue` | 1 | `SalesClose.java` | 52 | Enum + value-object conversion (`fromTime` rejects off-vocabulary times) |
| `availability` | **0** | — | — | *No `domain/` package* |
| `booking` | 2 | `BookingStatus.java` | 49 | Enum + one predicate (`canStillBeHonoured`) |
| | | `RefundPolicy.java` | 41 | Calculation (three-tier refund, pure integer) |
| `payment` | 2 | `PaymentStatus.java` | 21 | Enum (mirrors `payment.status` CHECK) |
| | | `RefundLifecycle.java` | 25 | Policy predicate (`returnedNoMoney`) |
| `payout` | 6 | `PayoutLedgerEntry.java` | 65 | Value object + calculation (accrual / proportional reversal) |
| | | `PeriodKey.java` | 51 | Value object |
| | | `CommissionSplit.java` | 21 | Calculation (the commission formula's single home) |
| | | `BatchStatus.java` | 25 | Enum |
| | | `EntryType.java` | 16 | Enum |
| | | `PayoutBatch.java` | 24 | Value object |
| `customer` | **0** | — | — | *No `domain/` package* |
| `operator` | **0** | — | — | *No `domain/` package* |
| `review` | 7 | `ReviewGate.java` | 43 | **State machine** (fence ordering → `ReviewState`) |
| | | `ReviewWindow.java` | 31 | Policy (60-day window) |
| | | `ReviewText.java` | 34 | Value bounds |
| | | `Stars.java` | 26 | Value bounds |
| | | `AggregateRating.java` | 30 | Calculation (half-up mean in tenths) |
| | | `ReviewState.java` | 28 | Enum |
| | | `ReviewSlot.java` | 18 | Enum |
| `notification` | **0** | — | — | *No `domain/` package* |
| `shared` · `challenge` · `audit` | **0** | — | — | *No `domain/` package* (non-context modules) |

**Totals:** 18 files, 600 lines. By kind: 7 enums, 4 value objects/bounds, 4 calculations, 2 policy
predicates, 1 state machine.

The five rule-holding `@Component`s and records in `application/` that are *not* in `domain/` —
`BookingCutoff` (121), `CancellationPolicy` (114), `RequestWindows` (51), `RetentionWindow` (22),
`RefundResubmissionWindow` (32) — add 340 further lines of rule. Counting them, the rule layer is
~940 lines, not 600.

---

## B. `booking/application/` branch classification

72 files, 3,524 lines. A mechanical scan for `if` / `else` / `switch` / `case` / loops / `Optional`
combinators finds **26 files carrying any branch**; the other 46 are records, sealed outcome
hierarchies and port interfaces with none. All 26 were read.

The ORCHESTRATION and DB-DELEGATED sites are the large majority and are summarised by pattern
below; every RULE is enumerated individually, since that is what the question turns on.

### ORCHESTRATION — the bulk

Recurring patterns, none of them statements about the business:

- **Compensating try/catch around a gateway call** — `CreateBookingService:112–117, 127–131,
  156–160`; `RespondToRequestService:120–127, 136–142`. Each releases or reverts a committed
  transition when Stripe throws, then rethrows.
- **Sealed-outcome dispatch** — `switch (payment)` over `PaymentOutcome` (`CreateBookingService`,
  `RespondToRequestService`), `switch (outcome)` over `PaymentCancellation`
  (`AbandonedBookingSweepService:92–111`). Sequencing, not rules.
- **Per-row isolation in a sweep** — `ExpireRequestsService:45–52`,
  `AbandonedBookingSweepService:71–85`: a `try/catch` inside the loop so one bad row cannot abort
  the batch.
- **Batch draining** — `NoShowSweepService:59–66` (`inBatch < BATCH_SIZE` ⇒ drained), plus
  `BATCH_SIZE`/`MAX_BATCHES_PER_RUN`. Throughput, not policy.
- **Empty-input short circuits and log guards** — `PendingRequestsService:44`,
  `ExpireRequestsService:57`, `NoShowSweepService:80–88`, `RefundResubmissionService:48`.
- **Fail-loud on the impossible** — `MyBookingsService:56–59` throws when a booking's set does not
  resolve, which the `ON DELETE RESTRICT` FK makes unreachable.

### DB-DELEGATED — the second-largest group

Every one of these exists to react to a guarded `UPDATE … RETURNING` or an `ON CONFLICT`. The rule
is the SQL predicate; the Java only reads the result.

- `ClaimReleaseService:38–43` — `.map(…).orElse(false)` over `cancelAwaitingPayment`.
- `RequestReleaseService:62–107` — three legs (decline / expire / withdraw), same shape.
- `CancelBookingService:92` and `WeatherRefundService:82` — `transitioned.isEmpty()` ⇒ lost
  race.
- `ReserveSetService:100–106` — `switch (claim)` over `ClaimOutcome`, four arms.
- `StaffAvailabilityService:86, 105` — `inserted == 1` / `deleted == 1`.
- `CheckInService:51–53`, `RespondToRequestService:96–98`, `WithdrawRequestService:41–48` —
  `.orElseGet(this::classify)`: the transition missed, so read committed state to say why.

The guarded predicates these react to are in `booking/adapter/out/JdbcBookings.java`:

```sql
-- :170  accept          WHERE id = :id AND venue_id = :venue AND status = :pending
--                         AND request_expires_at > :now
-- :198  revert accept   WHERE id = :id AND status = :awaiting
-- :213  decline         WHERE id = :id AND venue_id = :venue AND status = :pending
-- :232  withdraw        WHERE code = :code AND status = :pending
-- :388  confirm         WHERE id = :id AND status = :awaiting
-- :431  cancel          WHERE id = :id AND status = ANY (:admitted)
-- :454  check-in        WHERE code = :code AND venue_id = :venue AND status = :confirmed
--                         AND booking_date = :date
-- :488  no-show sweep   WHERE status = :confirmed AND booking_date < :today
-- :619  expire request  WHERE id = :id AND status = :pending AND request_expires_at <= :now
-- :639  release unpaid  WHERE id = :id AND status = :awaiting
```

**This is where the booking state machine actually lives.** Eleven predicates in one adapter, plus
`booking_status_check` (V5, widened by V19/V37). There is no Java transition table anywhere.

### RULE — enumerated

Nineteen sites. "Home?" asks whether a named rule-holder already states it.

| # | Rule | Site | Home? |
|---|---|---|---|
| R1 | Only an ONLINE-pool set may be booked online (#3) | `ReserveSetService:92` — `if (!ONLINE_POOL.equals(set.pool()))` | **Partial** — restated in `JdbcAvailabilityClaim:54`; see §E |
| R2 | A date sells until the venue's sales close on the day (#4) | `ReserveSetService:97` — `if (!cutoff.isBookable(set.salesClose(), …, now))` | ✅ `BookingCutoff` |
| R3 | A hidden venue's set books like one that does not exist | `ReserveSetService:89` — `if (!visibility.isVisible(…))` | ✅ `operator.api.VenueVisibility` |
| R4 | A REQUEST-mode venue's booking starts as a pending request, not a payment | `ReserveSetService:113` — `if (set.bookingMode() == BookingMode.REQUEST)` | ❌ inline |
| R5 | The accept deadline is capped at the venue's sales close | `ReserveSetService:114` — `min(now.plus(expiryWindow), cutoff.salesCloseAt(…))` | **Partial** — `RequestWindows` holds the pay-window cap, not this one |
| R6 | A delivered or no-show booking is past cancelling | `CancelBookingService:77–79` — `if (status == NO_SHOW \|\| status == COMPLETED) return WindowClosed` | ❌ inline |
| R7 | Only a CONFIRMED booking is cancellable by the guest | `CancelBookingService:80–82` — `if (status != CONFIRMED) return NotCancellable` | **Duplicated** — see §E |
| R8 | Cancellation is refused once the service day opens (#10) | `CancelBookingService:85–87` — `if (!quote.cancellationOpen())` | ✅ `CancellationPolicy` / `BookingCutoff` |
| R9 | Which refund tier a cancellation reports | `CancelBookingService:109, 119` — `tierFor(window, refundMinor)` switch | ❌ inline (the *amount* is `RefundPolicy`; the *label* is not) |
| R10 | The venue's late share applies only inside the LATE window | `CancellationPolicy:51–53, 93` — `window == LATE ? bps : 0` | ✅ own class (two sites, one class) |
| R11 | Which cancellation window an instant falls in (#4/#10) | `BookingCutoff:73–78` | ✅ own class |
| R12 | Three-tier refund arithmetic (#10) | `RefundPolicy:35–39` | ✅ `domain/` |
| R13 | What a booking code means at a venue that cannot be checked in | `CheckInService:58–62` — `COMPLETED → AlreadyCheckedIn`, `CONFIRMED, NO_SHOW → WrongServiceDate`, `default → NotFound` | ❌ inline |
| R14 | A booking is cancellable iff CONFIRMED and the window is open | `ViewBookingService:93` | **Duplicated** with R7 |
| R15 | A booking is withdrawable iff PENDING_REQUEST | `ViewBookingService:95` | ❌ inline |
| R16 | Mail status may be disclosed only post-payment | `ViewBookingService:85–89` — `status == CONFIRMED && collection.provenBeforeConfirmation()` | ❌ inline |
| R17 | A refund is outstanding iff cancelled, non-zero, and the gateway has not settled | `ViewBookingService:101–105` | ❌ inline |
| R18 | The pay window is closed iff the service day ended or the raw window ran out | `ViewBookingService:107–110` | **Duplicated** with the sweep's SQL — see §E |
| R19 | A set may not be staff-marked for a past date | `StaffAvailabilityService:75–77` — `if (date.isBefore(LocalDate.ofInstant(clock.instant(), TIRANE)))` | ❌ inline (module has no `domain/`) |

Plus two rules that sit **outside** `application/` entirely and belong in this tally:

| # | Rule | Site | Home? |
|---|---|---|---|
| R20 | A guest cancel may act only on CONFIRMED; the admin weather refund may also reach NO_SHOW | `JdbcBookings:404–416` — `List.of(CONFIRMED)` vs `List.of(CONFIRMED, NO_SHOW)` | ❌ **in the adapter**; *documented* in `BookingStatus`'s Javadoc |
| R21 | A stranded booking with no payment on record is releasable past its TTL | `AbandonedBookingSweepService:94` — the `NoCollection` arm | ❌ inline (reasoned at length in the Javadoc) |

**Score: 8 of 21 rules have a named home; 13 do not.** But the 13 are not uniform — see §4.

---

## C. The no-domain modules: correct absence vs displaced rules

### `availability` — absence is correct

Its subject is one table with one constraint. The whole write path is
`StaffAvailabilityService` (107 lines) and `JdbcAvailabilityClaim` (83), and between them the
branches are: two absent-set short circuits, two ownership assertions, two `rows-affected == 1`
reads, one pool check (R1), and one past-date check (R19).

The core rule — *at most one party per `(set, date)`* — has no Java expression at all, and should
not:

```sql
-- V4__availability.sql:30–32
-- invariant #2: at most one party per (set, date). THE double-booking guard and the
-- ON CONFLICT target for the atomic claim.
CONSTRAINT set_availability_uniq UNIQUE (set_id, booking_date)
```

A `domain/` class here could only restate the constraint less reliably. **Verdict: correct absence.**
The one rule genuinely sitting in the service is R19, a one-liner with no second caller.

### `customer` — absence is correct

The retention policy is a `Period` and a batch size, held as a plain application-layer record
(`RetentionWindow`, 22 lines) deliberately carrying no configuration type. The rule "a contact with
a booking on or after the cutoff is retained" is a SQL predicate reached through
`GuestBookingHistory.withBookingOnOrAfter`, not a Java condition; the service's
`!stillInBasis.contains(candidate)` (`ExpireGuestContactsService:74`) reads that answer. The
canonical e-mail form lives in `customer/vocabulary/Emails`, a value type. Nothing is flattened.

### `operator` — absence is correct

`OperatorService.assertOwns` (`:39–43`) is four lines: ask `Operators.ownsVenue`, throw if false.
The membership relation is a row in `operator_venue`; the status lifecycle is the same guarded-UPDATE
idiom as booking:

```sql
-- JdbcOperators.java:207–208, 246–247
UPDATE operator SET status = :target WHERE id = :id AND status = :pending    RETURNING …
UPDATE operator SET status = :target WHERE id = :id AND status = :expected   RETURNING …
```

`OperatorStatus`'s Javadoc names the reason its predicates are *not* centralised: "Published so each
status predicate lives with its owner: the edge's may-authenticate set, the module's ownership
resolution, and tourist visibility." That is a stated placement decision, not a gap.

---

## D. What makes a rule extractable here, derived from `review/`

`review/domain/` is the richest domain layer in the codebase and its seven types are unusually
explicit about why they exist. Four clauses recur, and every one of the seven satisfies all four.

**(a) Pure — statics or an enum over values, no Spring, no I/O.** All seven are a `final class` with
a private constructor, or an enum. Inputs are `boolean`, `Instant`, `int`, `String`, enums — never a
port or a row.

**(b) Two or more callers that must agree.** This is the clause the Javadoc keeps naming:

```java
// ReviewGate.java:10–14
 * <p>The order is the point. Every path that asks whether a stay may be rated — submit, edit,
 * delete, and the code-gated read — asks here … That agreement is a property of there being one
 * statement of the order, not of four services being kept in step.

// Stars.java:4–6
 * The driving adapter validates incoming requests against it and the submit use case guards on
 * it, so widening the scale is one edit here rather than a hunt through both.
```

The same clause appears outside `review`: `CommissionSplit` — "Used by both the payout-ledger
accrual … and the operator console's daily-takings read … so the arithmetic is written once and
never diverges."

**(c) A choice, not a consequence.** 1..5 stars, 60 days, half-up rounding, 1000 characters — each
could be otherwise without anything else breaking. Contrast a `rows-affected == 1` check, which
could not.

**(d) It names its own database counterpart.** Where a CHECK states the same bound, the class says
so and calls the duplication deliberate:

```java
// Stars.java:8–10
 * The database's {@code review_stars_check} states the same bounds independently and stays the
 * backstop: it is the only one of the two that also holds for a row written by anything but this
 * application, so the duplication there is deliberate, not drift.
```

### Applying the test to §B's rules

| Rule | (a) pure | (b) 2+ callers | (c) a choice | (d) names its DB twin | Verdict |
|---|---|---|---|---|---|
| R12 `RefundPolicy` | ✅ | ✅ view + cancel | ✅ | n/a | **already in `domain/`** |
| R11 `BookingCutoff.cancellationWindow` | ❌ needs `Clock` | ✅ 5 slices | ✅ | n/a | **`application/`, correctly** |
| R10 `CancellationPolicy` | ❌ needs 3 ports | ✅ view + cancel + accept | ✅ | n/a | **`application/`, correctly** |
| R5/R18 `RequestWindows` | ✅ | ✅ mail + sweep + view | ✅ | ✅ (`JdbcBookings:580`) | **`application/` as a record — passes all four** |
| R1 pool check | ✅ | ✅ reserve + claim | ✅ | ❌ no constraint | passes; **not extracted** |
| R7/R14/R20 "who may cancel" | ✅ | ✅ three sites | ✅ | ❌ | passes; **not extracted** |
| R13 check-in classification | ✅ | ❌ one caller | ✅ | ❌ | fails (b) |
| R15, R16, R17 view predicates | ✅ | ❌ one caller each | ✅ | ❌ | fail (b) |
| R4, R6, R9, R19, R21 | ✅ | ❌ one caller each | ✅ | ❌ | fail (b) |

**This is the answer to the question.** Of the 13 rules with no named home, **nine fail clause (b)
— they have exactly one caller.** By this codebase's own standard, a single-caller rule stays where
it is used; that is not flattening, it is the benchmark applied consistently. The remaining
**four — R1, R7/R14/R20, R18 and R5 — pass every clause of the test and were still not extracted.**
Those are the real exceptions.

### The line that is actually being drawn

The `domain/` ⇄ `application/` split tracks **clause (a) alone**:

- Passes (a) and (b) → `domain/`: `RefundPolicy`, `CommissionSplit`, `ReviewGate`, `Stars`.
- Fails (a), passes (b) → a named `@Component` in `application/`: `BookingCutoff`,
  `CancellationPolicy`.
- Fails (a) for configuration rather than I/O → a plain record in `application/`:
  `RequestWindows`, `RetentionWindow`, `RefundResubmissionWindow`, each documented as
  "a plain application-layer value … so the inner hexagon stays framework-light".

The codebase is explicit that this is a placement rule and not an accident. `BookingCutoff` carries
one static method with a Javadoc paragraph defending its staticness:

```java
// BookingCutoff.java:105–108
 * <p><strong>Static, and that is the contract:</strong> it is a pure projection of the caller's
 * own instant onto the Tirane civil day … An instance method here would read as clock-backed like
 * its neighbour and silently is not.
```

**The decisive corroboration is the test tree.** Rules that were flattened into procedures cannot be
unit-tested apart from their service. These can, and are:

| In `domain/` | In `application/` |
|---|---|
| `RefundPolicyTest` · `SalesCloseTest` · `CommissionSplitTest` · `ReviewGateTest` · `ReviewWindowTest` · `AggregateRatingTest` | `BookingCutoffTest` · `CancellationPolicyTermsTest` · `RequestWindowsTest` |

(`Stars`, `ReviewText` and `RefundLifecycle` have no dedicated test — they are constants and a
two-line predicate, exercised through their callers.)

**Verdict: placement, not flattening**, with five named exceptions — R1, R7/R14/R20, R13,
R18 and the missing transition table (§E, D5).

---

## E. Rules with no home in `domain/`, ranked by duplication evidence

The brief's §5, now received in full: for every RULE in §B–§C, is the same rule stated in more than
one place — two services, a service and a controller, a service and a SQL predicate, or a service
and the frontend? Duplicated rules have the strongest case for a home.

### The duplications

Five duplications, in descending order of risk.

### D1 · The pay-window rule is stated three times

`RequestWindows.payDeadline` / `acceptedBefore` is the value object. The sweep restates it in SQL:

```sql
-- JdbcBookings.java:580–583
-- SQL mirror of RequestWindows#payDeadline; identity pinned by RequestWindowsTest
AND (   booking_date <= :serviceDayEndedOnOrBefore
     OR (accepted_at IS NULL AND created_at < :createdBefore)
     OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
```

And `ViewBookingService` re-derives the same two arms a third time, in Java:

```java
// ViewBookingService.java:107–110
// Sweep-arm parity by construction: day end inclusive, the promised raw-window instant payable.
boolean payWindowClosed = awaitingPayment && (cutoff.serviceDayHasEnded(b.bookingDate())
        || (b.acceptedAt() != null
                && b.acceptedAt().isBefore(windows.acceptedBefore(clock.instant()))));
```

The SQL↔record identity is pinned by `RequestWindowsTest`. **The third statement — the view's — is
held by a comment and nothing else.** If the sweep's arms change, the view silently disagrees, and
the symptom is a guest shown a pay button for a booking the sweep has already cancelled. This is the
one duplication in the codebase that is load-bearing and unpinned.

### D2 · "Who may cancel" is stated three times, in three layers

| Layer | Statement |
|---|---|
| View | `ViewBookingService:93` — `status == CONFIRMED && quote.cancellationOpen()` |
| Service | `CancelBookingService:77–82` — `NO_SHOW \|\| COMPLETED → WindowClosed`; `!= CONFIRMED → NotCancellable` |
| Adapter | `JdbcBookings:407` — `cancelConfirmed` admits `List.of(CONFIRMED)` |

Three agreeing statements with no shared function. The adapter's is the enforcing one; the other two
are advisory, so a drift shows as a button that 409s rather than as a wrong write. Lower risk than
D1, but the same shape.

### D3 · The weather-refund status rule is documented in one place and implemented in another

`BookingStatus`'s Javadoc states it:

```java
// BookingStatus.java:17
 * Only the admin weather refund reaches a {@link #NO_SHOW}, deliberately.
```

It is implemented 350 lines away in the adapter, as a list literal:

```java
// JdbcBookings.java:411–415
// Admits NO_SHOW beside CONFIRMED: the sweep gets to a washed-out day before the operator does.
return cancelReturningFacts(bookingId, cancelledAt, refundMinor, RefundReason.WEATHER,
        List.of(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW));
```

The enum documents a rule it does not hold. Nothing binds the two.

### D4 · The ONLINE-pool check runs twice, in two modules

`ReserveSetService:92` checks `!ONLINE_POOL.equals(set.pool())` against an unlocked read;
`JdbcAvailabilityClaim:54` re-checks it against a `FOR KEY SHARE` read inside the claim transaction.
Each module declares its own `private static final String ONLINE_POOL = "ONLINE"`. The second is the
authoritative one and the first is a fast path — a defensible arrangement — but the pool token is an
untyped `String` duplicated across a module boundary, where the same codebase publishes a typed
record to avoid passing a bare `long` (first note, §H-5).

*Correction, 2026-09-04 (#929's `venue/application/` pass).* **The token is declared in three
modules, not two.** The third is in the module that owns the concept:
`venue/application/SetCommand:18` — `private static final Set<String> POOLS = Set.of("ONLINE",
"WALK_IN")` — and `venue/api/SetBookingFacts:24` hands the token to `booking` as a bare `String`
with the two legal values written out in prose. The sharpest form of the finding is now internal to
`venue`: its sibling field went the other way, `VenueFieldValidation:23–26` deriving the
booking-mode tokens from the typed `venue/vocabulary/BookingMode` enum *"so the validator, the enum,
and the CHECK stay in one source of truth"*, while `pool` has no type at all. The rest of the entry
stands; only the count and the ownership reading change.

### D5 · The booking transition table is stated twice, in neither Java nor one place

`booking_status_check` (V5/V19/V37) enumerates the nine legal *states*; the eleven `WHERE status =`
predicates in `JdbcBookings` enumerate the legal *transitions*. `BookingStatus`'s Javadoc narrates
them in prose. There is no single artefact — Java or SQL — a reader can consult to answer "what may
follow `AWAITING_PAYMENT`?"; the answer is assembled from grep. This is the one place where
`review/domain/ReviewGate`'s virtue ("one statement of the order") has no counterpart in `booking`,
which has nine states to `review`'s six.

### Deliberate duplications, correctly handled — not findings

For contrast, four Java↔SQL duplications that *are* pinned and documented, and are the model D1–D3
depart from: `Stars` ↔ `review_stars_check`; `ReviewText` ↔ `review_comment_length_check`;
`SalesClose` ↔ `venue_sales_close_check`; `BookingStatus` ↔ `booking_status_check` (pinned by
`BookingMigrationIT.everyEnumStatusAccepted`). Each names its twin in the Javadoc and calls the
duplication deliberate.

**Not duplicated (checked and clear):** the refund arithmetic does not exist in the frontend.
`frontend/src/app/booking/cancellation-terms-note.ts:32–38` switches on the server-supplied
`CancellationWindow` to choose copy, and no TypeScript applies a bps figure to an amount — invariant
#10 holds across the stack.

*Extended, 2026-09-04 (#929).* The frontend sweep has a second answer, in `venue`: the layout maxima
are stated in Java (`LayoutCommand.MAX_SETS = 26 * 40`) and again in TypeScript
(`frontend/src/app/operator/beach-cell.ts:9–10`, `MAX_ROWS = 26` / `MAX_COLS = 40`), and the
row-label bound a third time as `layout-editor.html:159`'s `maxlength="40"`. The frontend states the
relationship correctly — *"the layout maxima the server enforces, published once so no grid clamps
differently"* — and nothing pins either figure against the backend's; the shapes even differ, the
server's bound being the product. Unlike D1 this is a bound restated rather than a rule re-derived,
and the server stays the enforcing side, so it ranks below D4. No rule *calculation* crosses into
TypeScript anywhere: that half of the sweep is unchanged.

### The ranking

The thirteen rules from §B with no named home, ordered by how much duplication evidence argues for
one. Rank is the strength of the case, not a recommendation — this note proposes nothing.

| Rank | Rule | Statements of it | Pinned? | Case |
|---|---|---|---|---|
| 1 | **R18** pay window closed | **3** — `RequestWindows.payDeadline/acceptedBefore`; the sweep's SQL (`JdbcBookings:580–583`); `ViewBookingService:107–110` | SQL↔record only (`RequestWindowsTest`) | **Strongest.** Three statements, two pinned, the third held by a comment. The only unpinned duplication in the codebase whose drift is user-visible. |
| 2 | **R7 / R14 / R20** who may cancel | **4** — `CancelBookingService:80–82`; `ViewBookingService:93`; `JdbcBookings:407` (`List.of(CONFIRMED)`); `JdbcBookings:411–415` (weather admits `NO_SHOW`) | No | **Strong.** Spans three layers plus an admin variant. The enforcing statement is the adapter's; the other three are advisory, so drift 409s rather than mis-writes. |
| 3 | **R1** ONLINE-pool check | **2**, in **two modules** — `ReserveSetService:92`; `JdbcAvailabilityClaim:54`, each with its own `private static final String ONLINE_POOL = "ONLINE"` | No | **Strong.** The only duplicated rule that crosses a module boundary, on an untyped `String` token, in a codebase that publishes a typed record to avoid a bare `long`. |
| 4 | **R5** accept-deadline cap | **1 + a doc** — computed at `ReserveSetService:114`; `RequestWindows` holds the *pay*-window cap and describes the accept cap without holding it | No | Medium. Not duplicated code, but a rule-holder that documents a sibling rule it does not own. |
| 5 | **R9** refund tier | **1**, derived a second time from a value that has a home — `CancelBookingService:119` switches on the same `CancellationWindow` that `RefundPolicy:35–39` already switches on | No | Medium. The *amount* has a home; the *label* is a second switch over the same three-valued input. |
| 6 | **R6** delivered/no-show past cancelling | **1**, with a **deliberately rejected** near-duplicate — `CancelBookingService:77–79` tests `{COMPLETED, NO_SHOW}`, a strict subset of `BookingStatus.canStillBeHonoured()`'s false-set | n/a | Low, and instructive. The codebase anticipated the merge and refused it: *"a general-sounding predicate would be a trap"* (`BookingStatus:38–41`). Evidence **against** extraction. |
| 7 | **R4** REQUEST-mode entry leg | 1 | n/a | Low — single caller, and the branch *is* the fork in the use case. |
| 8 | **R13** check-in classification | 1 | n/a | Low — single caller; classifies a guarded-`UPDATE` miss. |
| 9 | **R15** withdrawable | 1 | n/a | Low — one line, one caller. `ViewBookingService:94–95` notes it is deliberately not a reuse of `cancellable`. |
| 10 | **R16** mail-status disclosure | 1 | n/a | Low — single caller, five lines of Javadoc defending its narrowness. |
| 11 | **R17** refund outstanding | 1 | n/a | Low — single caller. |
| 12 | **R19** staff-mark past date | 1 | n/a | Low — single caller. Parallel to R2 (sales close) but a *different* rule: staff may mark today after online sales close. |
| 13 | **R21** stranded-booking release | 1 | n/a | Low — single caller, reasoned at length in the sweep's Javadoc. |

**The break is between ranks 3 and 4.** Ranks 1–3 are duplications with no shared function; ranks
4–13 are single-caller rules that fail the benchmark's clause (b) and, by this codebase's own
standard, belong where they are. Rank 6 is the one case where the code contains an explicit refusal
to unify, with the reason written down.

---

## F. Verdict, per module

**Coverage caveat — lifted for `venue`, 2026-09-04.** The brief scoped the branch classification to
`booking/application/`, and §B is exhaustive there. For the other modules the verdict below rests on
a branch census of each `application/` package plus reading the rule-holders it named — firm for
`availability`, `customer`, `operator` and `review`, which are small. `venue` was **provisional**,
its `VenueAdminService` (314 lines, 28 branches) read only around its layout guards. It has since
been classified branch-by-branch — all 14 branch-carrying files of `venue/application/`, against
`e115733` — in `2026-09-04-venue-application-branch-classification.md` (issue #929). **The verdict
stands and is now firm**; the `venue` row below is updated with the fuller evidence. Two figures
elsewhere in this note change as a result, both noted in place: §E/D4's pool-token count (two
statements → **three**), and §E's "not duplicated (checked and clear)" sweep of the frontend, which
now has a second answer (the layout maxima).

| Module | Verdict | Evidence |
|---|---|---|
| `booking` | **Mixed** — legitimately thin in the main, displaced in five named places | Rules needing a `Clock` or a port are extracted into `BookingCutoff`, `CancellationPolicy`, `RequestWindows`, each separately unit-tested; the state machine is genuinely in SQL. Displaced: `ViewBookingService.toDetail`'s six inline predicates, `CheckInService.classify`, `JdbcBookings`' admitted-status lists, R18's third statement, and no single artefact stating the transition table. |
| `availability` | **Legitimately thin** — absence is correct | The core rule is `set_availability_uniq` plus one `INSERT … ON CONFLICT DO NOTHING`. A `domain/` class could only restate the constraint less reliably. One displaced one-liner (R19). |
| `customer` | **Legitimately thin** — absence is correct | Retention is a `Period` in `RetentionWindow` plus a SQL predicate reached through `GuestBookingHistory`; the canonical e-mail form is `vocabulary/Emails`. Nothing displaced. |
| `operator` | **Legitimately thin** — absence is correct | `assertOwns` is four lines over a row; the lifecycle is guarded `UPDATE … WHERE status = :expected` (`JdbcOperators:207, 246`). `OperatorStatus`'s Javadoc states the placement decision: *"each status predicate lives with its owner."* |
| `review` | **Legitimately thin — and the benchmark** | Seven `domain/` types, and the services **call** them rather than re-deriving: `ReviewGate.stateOf` is invoked from both `ReviewLifecycleService:121` and `ReviewEligibilityService:46`; `Stars.isValid` from `ReviewLifecycleService:55, 72`. This is the direct contrast with `booking`'s R7/R14/R20. |
| `venue` | **Legitimately thin** (firm — classified branch-by-branch, #929) | One `domain/` file, but **six** named rule-holders in `application/`: `VenueFieldValidation` (used by both command records *"so the two enforce the same invariants from one place — no duplicated validation block"*, naming its DB counterparts), `LayoutCommand`, `SetPlacement`, `PhotoProcessor`, `VenueCreationProperties`, and the layout guards (`hasLiveHold`, `isLivelyClaimed`, `isLivelyClaimedOrEverBooked`) as named private predicates with rationale. **13 of 21 rules have a named home** against `booking`'s 8 of 21; `VenueAdminService`'s 28 branches are mostly concurrency control (the `set_version` token, lock-before-probe) reacting to statements, not rule. Exactly one homeless rule passes all four §D clauses — `priceMinor >= 0`, stated at `SetCommand:32` and `RowPriceCommand:20`, one of the two untested. One near-miss passes three of four (a row label names one row, `VenueAdminService:240` ↔ `LayoutCommand.splitsRowLabel`, kinship named, no DB twin possible). The other six fail clause (b). |
| `payment` | **Legitimately thin** | `RefundService` carries 2 branches in 76 lines; `PaymentStatus` mirrors the CHECK and `RefundLifecycle` holds the one predicate that is a choice. The rest is Stripe protocol, which is not domain rule. |
| `payout` | **Legitimately thin — the strongest domain layer after `review`** | 6 files, 202 lines, holding the commission formula once (`CommissionSplit`) for two callers, and the proportional-reversal arithmetic in `PayoutLedgerEntry`. `PayoutReportService` carries 4 branches in 112 lines. |
| `notification` | **Legitimately thin** — no domain rule to hold | Its subject is transport, suppression and retry. The one policy value, `MailResubmissionWindow`, is a named record in `application/` — the same pattern as `RefundResubmissionWindow`. |
| `shared` · `challenge` · `audit` | **n/a** | Non-context modules by ADR-0017; owning no domain concept is their defining property. |

**Overall: mixed, but heavily weighted to legitimately thin.** Nine of the twelve modules are thin
for reasons the code states and the tests corroborate. `booking` is the one module where the answer
is genuinely mixed, and it is also the only module large enough for the question to bite — 141 files
and nine states against `review`'s 50 and six. The displacement is not spread thin across it: it is
concentrated in one method (`ViewBookingService.toDetail`) and one absent artefact (a statement of
the transition table).

---

## G. Open questions the code cannot answer

1. **Is D1's third statement intentional?** The comment reads "Sweep-arm parity by construction",
   which asserts the property rather than enforcing it. Whether a shared predicate was considered and
   rejected — the view needs a per-booking answer, the sweep a set-based one — is not written down.
2. **Does R5's accept-deadline cap belong in `RequestWindows`?** `RequestWindows` holds the pay-window
   cap and documents that the *accept* cap "sits before the day's end", but the accept cap itself is
   computed inline at `ReserveSetService:114`. The asymmetry may be deliberate; nothing says.
3. **Why is `RefundLifecycle` in `payment/domain/` while `RefundResubmissionWindow` is in
   `booking/application/`?** Both are pure. The first is a `final class` of statics, the second a
   record with a validating constructor. The (a)-clause explains most placements but not this pair.
4. **Was `ViewBookingService.toDetail` ever reviewed as a unit?** It computes six predicates in
   twenty lines, each individually justified by a comment, with no name for the whole. Whether that
   density is accepted or simply un-noticed cannot be read from the code.
