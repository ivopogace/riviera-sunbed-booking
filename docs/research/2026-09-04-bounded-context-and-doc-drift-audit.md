# Bounded contexts, module boundaries and doc/code drift: what the code actually shows

**Status / provenance.** Findings only, no decision (a decision would land in an ADR or an issue).
Audited 2026-09-04 against commit `1f715c1`, by reading `platform/src/main/java`,
`platform/src/main/resources/db/migration` and the substrate docs, then running the structural net.
The brief was deliberately adversarial — "assume nothing is intentional until the code shows it is"
— and supplied its own starting hypotheses; §0 reports which of those survive contact with the tree
and which do not.

**Verification.** These five classes were run in this session and passed
(`gradle --no-daemon --console=plain test`, JDK 25 toolchain, 2 m 14 s, `BUILD SUCCESSFUL`):
`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
`ResponsibilitiesArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`. Runtime
behaviour (the abandoned sweep, the webhook path, the erasure transaction) was **read, not
executed** — the ITs that cover it need Docker and were not run. Every structural claim below cites
a file and line; where the code is ambiguous the note says so rather than guessing.

**TL;DR**

- **This is one bounded context with twelve modules.** None of the four language tells fires across
  any module pair. The three duplicated id records (`operator.VenueRef`, `review.VenueRef`,
  `review.BookingRef`) are each `record X(long value)`, converted by identity, and each Javadoc
  names a Spring Modulith cycle — not a difference in meaning — as the reason. `SetId` crosses four
  modules with one spelling because no cycle forced a copy. The modules are correct *module*
  boundaries; "bounded context" is a label with nothing behind it.
- **The only genuine translation boundary is against Stripe**, and it is already fenced correctly:
  `payment` declares `allowedDependencies = { "shared" }` and the Stripe SDK is unreachable
  elsewhere (machine-checked).
- **No anticorruption layer exists anywhere.** `grep -rni "anticorruption\|anti-corruption\|\bACL\b"`
  over `platform/src/main/java`, `docs/` and the three root docs returns nothing;
  `git ls-files '**/*Mapper*.java' '**/*Translator*.java' '**/*Adapter*.java'` returns nothing. Nor
  is there one Spring Data `CrudRepository` — all 27 `Jdbc*` classes under `adapter/out` are
  hand-written `JdbcClient` SQL, so no `adapter/out` is a second wrapper on a first abstraction.
- **Four items are ceremony**: `venue.api.VenueCatalog` (published, zero cross-module consumers),
  `venue.spi.SalesWindow` (same-signature pass-through), the three duplicated id records, and the
  three spellings of money.
- **No communication mismatches.** Every transactional requirement is a synchronous in-transaction
  port call; the `BookingConfirmed` fan-out is async and registry-backed. Both of the brief's
  specific checks pass.
- **No set invariant is enforced only in application code.** #2, #7 and #9 each have a unique
  constraint with the application code written *against* it. #3 has no constraint (it cannot — it
  spans two tables) and is held by an explicit `FOR KEY SHARE` lock plus a write-side guard.
- **The predicted availability leak is refuted**, but the release port's signature is a latent
  hazard — see §G-2.
- **Fourteen drift items**, concentrated in `docs/architecture/domain-model.md` §3. The largest:
  eleven of the thirteen documented "aggregate roots" have no class.
- **Three of the brief's own premises do not reproduce** at this commit — §0.

---

## 0. Premises that do not hold at `1f715c1`

The brief asserted a conflict between the docs and four specific drift items. Read against the
tree, most of that does not reproduce. Recording it here because a future reader will otherwise
re-derive the same corrections.

| Claim in the brief | What the source says | Verdict |
|---|---|---|
| ADR-0007 asserts *one platform hexagon with modules as internal partitions*, conflicting with README/CLAUDE.md. | ADR-0007 asserts the opposite. Its hard constraints read "DDD (strategic + light tactical) + Spring Modulith + **Hexagonal**" (`docs/adr/ADR-0007-package-structure.md:31`) and it gives a per-module hexagon template (`:44–68`). Amendment 2 opens "The two templates describe **bounded contexts**" (`:171`). | **Not found.** No doc conflict exists. All four docs agree on nine contexts; the disagreement is between the docs and the code. |
| The docs assert *six* bounded contexts. | "The **nine** bounded-context Spring-Modulith modules" (`docs/architecture/domain-model.md:20`); "Nine Spring-Modulith bounded contexts" (`README.md:70`). | **Not found.** Nine contexts, twelve modules. |
| The `operator` module is absent from `domain-model.md`. | Present in §1's context map — `subgraph operator["operator — per-venue authorization (#13)"]` (`:49–51`), with four inbound `assertOwns` edges (`:71–74`). | **Partly.** Absent from **§3**, which promises "One class diagram per bounded context" (`:136`) then supplies six of nine — missing `operator`, `review`, `notification`. Logged as G-8. |
| Invariant count differs: README 12 vs CLAUDE.md 13. | `README.md:26` — "the **13** invariants (canonical)". The seven-item list at `README.md:98–110` is explicitly a subset: "Full list and rationale in CLAUDE.md; the ones that bite hardest." | **Not found.** Both say 13; no "12" appears in README's history. |
| §6.2's FREE/BOOKED_ONLINE/STAFF_MARKED contradicts §4's "provisional hold" — a possible availability leak. | Both sections already reconcile in prose: "the row is written as `BOOKED_ONLINE` immediately" (`:427`) and "The soft-hold is the same `BOOKED_ONLINE` availability row as any online booking (availability records *that* a set is held, never *why*)" (`:499`). | **Refuted** as a defect — full analysis in G-2. The row genuinely carries no holder, and does not need to. |

**What survives.** The brief's instinct that shapes may "pattern-match to DDD without a real reason"
is right, but the pattern-matching is in the *vocabulary*, not the structure. The structure is
deliberate, justified at every seam in the `package-info` files, and machine-enforced. The DDD
*strategic* labels — "bounded context", "aggregate root" — are the part with nothing behind them.

---

## A. Language map

Evidence only, no interpretation. Shapes are transcribed from the record header or the
`CREATE TABLE`.

| Noun | Module | Where | Shape | Lifecycle |
|---|---|---|---|---|
| **Venue** | venue | `V1__baseline.sql` table `venue` | `id, name, beach, region, description, rating_tenths, reviews_count, booking_mode, commission_bps, payout_currency, booking_cutoff` + later `sales_close`, `late_cancel_refund_bps`, `distance_to_water_m`, `version` | Created by admin; mutated by operator edits under an optimistic `version` token. No class. |
| | venue | `venue/vocabulary/VenueId.java` | `record VenueId(long value)` | Value. |
| | venue | `venue/vocabulary/VenueSummaryView.java`, `VenueMapView.java` | 14 and 17 components — read projections carrying `MoneyView fromPrice`, `List<Amenity>`, `List<SetView> sets`, `boolean salesOpen` | Per-request, immutable. |
| | operator | `operator/vocabulary/VenueRef.java` | `record VenueRef(long value)` — identical shape | Value; `new VenueRef(venueId.value())`. |
| | review | `review/vocabulary/VenueRef.java` | `record VenueRef(long value)` — third identical spelling | Value; same conversion. |
| **Set / SetPosition** | venue | `V2__venue_beach_map.sql` table `set_position` | `id, venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y` (+ `version`, V23) | Created/moved/deleted by layout writes, fenced by live-hold and live-booking probes. |
| | venue | `venue/vocabulary/SetView.java` | `record SetView(long id, String rowLabel, int positionNo, String tier, String pool, MoneyView price, int gridX, int gridY, String availability)` | Per-request tourist projection. |
| | venue | `venue/vocabulary/SetBookingInfo.java` | `record SetBookingInfo(SetId, VenueId, String venueName, String rowLabel, int positionNo, String pool, MoneyView price, LocalTime bookingCutoff, LocalTime salesClose, BookingMode)` | Per-request. All ten components read by `booking`; used lightly by `notification`, `availability`. |
| | venue · availability · booking · notification | `venue/vocabulary/SetId.java` | `record SetId(long value)` — **one spelling, four modules** | Value. No sibling copy, unlike `VenueId`/`BookingId`. |
| **SetAvailability** | availability | `V4__availability.sql` table `set_availability` | `id, set_id, booking_date, state, created_at, updated_at` · `CHECK (state IN ('BOOKED_ONLINE','STAFF_MARKED'))` · `UNIQUE (set_id, booking_date)` | Row *existence* is the hold; FREE = no row. Insert-or-delete only, never updated in place. |
| | availability | `availability/vocabulary/ClaimOutcome.java` | `enum { CLAIMED, ALREADY_TAKEN, NOT_ONLINE_POOL, NO_SUCH_SET }` | Per-call value. |
| | venue | `venue/spi/SetAvailabilityLookup.java:73` | State crosses back as a bare `Map<SetId, String>` | Read-only snapshot; "never a hold" (`:82`). |
| **Booking** | booking | `V5__booking_and_customer.sql` table `booking` | `id, code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency, status, created_at, confirmed_at` + V10/V14/V19/V26/V40: `cancelled_at, refund_minor, cancel_reason, request_expires_at, accepted_at, account_id, completed_at` | Nine statuses, six terminal. Every transition is a guarded `UPDATE … WHERE status = … RETURNING`. |
| | booking | `booking/application/view/BookingRecord.java` | 15 components — the full row, un-projected | Per-read. |
| | payment | `payment/vocabulary/BookingRef.java` | `record BookingRef(long value)` | Value; "a correlation handle". |
| | review | `review/vocabulary/BookingRef.java` | `record BookingRef(long value)` — third spelling alongside `booking.vocabulary.BookingId` | Value. |
| **Payment** | payment | `V7__payment_and_webhook_events.sql` table `payment` | `id, booking_ref, payment_intent_id, amount_minor, currency, status` · `UNIQUE(payment_intent_id)` · `UNIQUE(booking_ref)` | One payment per booking, enforced. State reconciled only from verified webhooks. |
| | payment | `payment/domain/PaymentStatus.java` | `enum { REQUIRES_PAYMENT, SUCCEEDED, FAILED, CANCELED, REFUNDED, PARTIALLY_REFUNDED }` | Mirrors the `payment.status` CHECK one-to-one. |
| | payment | — no `Payment` class, no `PaymentId` type — | The aggregate is the table plus `PaymentService`/`RefundService`. | — |
| **Refund** | payment | `V11__payment_refund.sql:17–19` | `ALTER TABLE payment ADD COLUMN refunded_minor BIGINT NOT NULL DEFAULT 0`; `ADD COLUMN refund_id TEXT` — **two columns, not a table** | At most one refund per payment. No `Refund` entity, no `RefundStatus` enum. |
| | booking | `booking/vocabulary/RefundReason.java` | `enum { POLICY, WEATHER, CONFLICT }` — owned by `booking`, not `payment` | Value; recorded on the payout reversal. |
| | booking | `booking/application/refund/RefundOutbox.java`, `RefundResubmission.java` | An outbox + resubmission window, registry-backed | Retried until the gateway accepts. |
| **Money** | payment | `payment/vocabulary/Money.java` | `record Money(long minor, String currency)` — **validated**: rejects negative minor, blank currency | Value; crosses `booking ↔ payment`. |
| | venue | `venue/vocabulary/MoneyView.java` | `record MoneyView(long minorUnits, String currency)` — **no validation**, different component name | Value; crosses `venue → booking → payout` on the HTTP views. |
| | booking · payment · payout · notification | events, tables, ports | Inline pairs: `long amountMinor, String currency` · `long refundMinor, String currency` | The dominant spelling — used by both cross-module events and every table. |
| | payout | `payout/domain/PayoutLedgerEntry.java:17` | A triple flattened into the record: `long grossMinor, long commissionMinor, long netMinor, String currency` | Value, with `net = gross − commission` checked in the canonical constructor and again by `payout_net_check`. |
| **Customer** | customer | `V5` table `customer` | `id, email, full_name, phone, created_at, updated_at` · `UNIQUE(email)` | Guest contact, find-or-create by e-mail. Tombstoned by erasure, never deleted. |
| | customer | `V25__customer_account.sql` table `customer_account` | Separate table, **no FK to the guest row** | Sign-in, SSO, verification, password, erasure. |
| | customer | `customer/vocabulary/` — `CustomerId`, `CustomerAccountId`, `GuestContact`, `Emails` | Two id types, deliberately unlinked | Value. |
| **PayoutLedgerEntry** | payout | `payout/domain/PayoutLedgerEntry.java` | `record PayoutLedgerEntry(VenueId venueId, long bookingId, EntryType entryType, long grossMinor, long commissionMinor, long netMinor, String currency, RefundReason reason)` | Append-only. `accrual()` / `reversalOf()` factories; the only place the commission division is written. |
| | payout | `V9__payout_ledger.sql:33` | `UNIQUE (booking_id, entry_type)` — the exactly-once guard | One ACCRUAL and one REVERSAL per booking, ever. |
| **Operator** | operator | `V16__operator.sql`, V17, V29 | Account, credentials, `is_admin`, status lifecycle, `operator_venue` ownership | Admin-driven approve/reject/retire; revocation orchestrated at the edge. |
| | operator | `operator/vocabulary/` — 11 types incl. `OperatorId`, `OperatorStatus`, `PendingOperator`, `NotVenueOwnerException` | No `domain/` package; no controllers. Three services, one JDBC adapter. | — |
| **Review** | review | `review/domain/` — `AggregateRating`, `ReviewGate`, `ReviewSlot`, `ReviewState`, `ReviewText`, `ReviewWindow`, `Stars` | The richest `domain/` in the codebase — and still no `Review` class | One per booking; eligibility window; admin takedown; erasure tombstone keeps the star. |

---

## B. Context verdict — one bounded context, twelve modules

Working the four language tells in order.

### Tell 1 — the same word carries genuinely different fields or rules in two places

**Does not fire.** Three words are spelled more than once. In all three the duplicate is
*structurally identical* and the source comment names a graph constraint, not a meaning difference:

```java
// operator/vocabulary/VenueRef.java:7–14
 * <p><strong>Why not reuse {@code venue.vocabulary.VenueId}?</strong> ...
 * If {@code operator.api} depended on {@code venue::api}, then {@code venue → operator}
 * ... plus {@code operator → venue} (for {@code VenueId}) would form a Spring Modulith
 * cycle. ... Callers convert with {@code new VenueRef(venueId.value())}.
```

The same reasoning appears verbatim in `review/vocabulary/VenueRef.java:7–12` and
`review/vocabulary/BookingRef.java:4–8`. A real context boundary produces a conversion that can
**fail** or **lose information**; `new VenueRef(venueId.value())` is the identity function. The
counter-example proves the point: `SetId` crosses four modules with one spelling, because no cycle
forced a copy.

### Tell 2 — a word needs a qualifier to stay unambiguous

**Fires once, weakly, and not on a domain word.** `Money` needs qualifying — `Money` vs `MoneyView`
vs the bare `amountMinor`/`currency` pair. But the qualifier separates *layers* (validated value
object, wire projection, column pair), not *meanings*: all three mean EUR integer minor units under
invariant #5. Redundancy, not a seam. Logged as ceremony in §D.

### Tell 3 — two rules about one noun contradict and both are correct

**Does not fire.** The nearest candidate is "is this set claimed?", asked three ways — and the code
makes the three deliberately non-contradictory, with the owning module keeping the definition:

```java
// venue/spi/BookingPresence.java:56–58 — on hasLiveBookings
 * Which statuses count as live is <strong>this module's</strong> call, not
 * the caller's — {@code venue} must never enumerate booking statuses.
```

Compare `venue/spi/SetAvailabilityLookup.java:24–26`: `"Taken" means any existing
set_availability row for the date — BOOKED_ONLINE or STAFF_MARKED`. Two definitions of "taken",
both correct, both owned, neither leaking the other's vocabulary. That is a *well-drawn module*
boundary. A context boundary would show `venue` maintaining its own idea of booking status and the
two drifting.

### Tell 4 — a class has fields most callers ignore

**Does not fire on a domain type.** The widest published record, `SetBookingInfo` (10 components),
is fully consumed by its primary caller: `booking` reads all ten. `VenueMapView` (17) and
`VenueSummaryView` (14) are single-controller read projections, not shared types.

### Conclusion

**One bounded context, twelve modules.** The whole system speaks one ubiquitous language: a *set*
is the same set in `venue`, `availability`, `booking` and `notification`; a *booking* is the same
booking in `booking`, `payment`, `payout` and `review`; money is EUR minor units everywhere. No
module needed to redefine a word to do its job — every duplicated id type exists to satisfy the
Modulith acyclicity checker.

The one language *outside* the domain is Stripe's — `PaymentIntent`, idempotency key, `evt_` ids,
`payment_intent.succeeded` — and the code already fences it: the Stripe SDK is unreachable outside
`payment` (machine-checked by `ResponsibilitiesArchitectureTests`' Stripe-reach rule), and nothing
crosses the `payment` boundary but `BookingRef`, `Money` and a sealed outcome. That is the
codebase's only genuine translation boundary, and it is against an *external system*, not between
two internal contexts.

The twelve modules are not a mistake. They are correct *module* boundaries — deep, well-named, one
owner per table — mislabelled as context boundaries by the documentation. Nothing in §C or §D
argues for removing them.

---

## C. Boundaries that earn their cost

Against the five cost tests (different change reasons/rates; different owners; different
consistency needs; one must survive the other being down; the models genuinely contradict).

### `booking → availability` — the claim

- **Different consistency needs.** The claim must be transactional and serialized; nothing else in
  the system must be. This is the one boundary where the consistency requirement genuinely differs
  from its neighbours.
- **Sole-writer discipline is machine-checked** by a bytecode scan over `set_availability`.
  Deleting the boundary leaves the double-booking guard with no single home.

The port is deep: two methods hiding the pool check (#3), the row lock, the atomic insert and the
four-way outcome.

```java
// availability/adapter/out/JdbcAvailabilityClaim.java:58–67
INSERT INTO set_availability (set_id, booking_date, state)
VALUES (:setId, :bookingDate, 'BOOKED_ONLINE')
ON CONFLICT (set_id, booking_date) DO NOTHING
...
return inserted == 1 ? ClaimOutcome.CLAIMED : ClaimOutcome.ALREADY_TAKEN;
```

### `payment` — the Stripe fence

- **One must survive the other being down.** Literally true and literally handled:
  `PaymentCancellation.Failed` is "a transient gateway error — skipped and retried on the next run"
  (`AbandonedBookingSweepService.java:40`), and `StripePaymentGateway` replays timeouts under the
  same idempotency key (`:290`).
- **The models genuinely contradict.** Stripe's model is PaymentIntent + webhook event stream; the
  domain's is booking status. Invariant #8 says the two must never be conflated.
- **Different change rate.** `allowedDependencies = { "shared" }` — `payment` imports nothing
  domain-shaped, so a Stripe SDK change cannot reach the domain or vice versa. ADR-0009 (a Paysera
  migration) is the change this buys.

Three of five. The only boundary here that would still be worth drawing if the module system
disappeared tomorrow.

### `review` as a leaf (ADR-0015)

- **Different change rate.** `allowedDependencies = { "shared" }` exactly. Reviews are a late
  feature over a stable core; the leaf shape means review work cannot destabilise the booking spine.
- **Eventual consistency is correct here.** The rating recompute is an async
  `@ApplicationModuleListener` on `ReviewsChanged`. A star rating being a second stale is fine; a
  set being double-sold is not. The boundary encodes that difference.

Cost: two duplicated id records. Cheap relative to the isolation bought.

### `operator.api.VenueOwnership` — the BOLA fence

Four consumers — `availability`, `booking`, `payout`, `venue` — one uniform
`assertOwns(operator, venueRef)`. Deleting it means the object-level check under #13 is
re-implemented four times, which is the shape OWASP API #1 describes. The duplicated `VenueRef`
exists precisely to keep this a *single* port rather than four
(`operator/vocabulary/VenueRef.java:7–14`). Clears none of the five tests as a *context* boundary;
clears the only test that matters for a *module*: one rule, one home, no bypass.

### `customer.spi.ReviewErasure` — implemented by `booking`

The one SPI in the codebase that does real work rather than relaying. `customer` cannot resolve a
data subject to their reviews; `booking` owns the join table and can reach `review`'s published
surface.

```java
// booking/adapter/out/BookingReviewErasure.java:50–54
List<BookingRef> bookings = jdbc.sql("SELECT id FROM booking WHERE customer_id IN (:guests)")
        .param(GUESTS, guests.stream().map(CustomerId::value).toList())
        .query((rs, rowNum) -> new BookingRef(rs.getLong("id")))
        .list();
return tombstones.tombstone(bookings);
```

A genuine id resolution across two vocabularies, inside the erasure's transaction so "a scrubbed
contact and a still-named review can never commit apart" (`customer/spi/ReviewErasure.java:12–13`).
Different consistency need: this one must be transactional where the rest of erasure could be
eventual.

### `challenge` and `audit` (ADR-0017) — correctly *not* contexts

Both declare `allowedDependencies = {}` and are documented as Evans Cohesive Mechanisms:

```java
// audit/package-info.java:2–4
 * The <strong>admin audit trail</strong> (ADR-0013, ADR-0017) — not a bounded context
 * but a Cohesive Mechanism (Evans, DDD ch. 15): a separate lightweight framework behind
 * an intention-revealing interface.
```

This is the one place the codebase's own docs get the strategic-DDD vocabulary right — and the
model for what §G-1 says should have happened to the other nine labels.

---

## D. Ceremony

Note first what is **absent**: no ACL, no mapper, no translator class, and no Spring Data
repository (see TL;DR for the exact greps). The layer the brief was most worried about — an ACL
between modules sharing one language — was never built here.

### `venue.api.VenueCatalog` — published to nobody

1. *What breaks if deleted?* Nothing outside `venue`. Four modules hold a `venue::api` grant; none
   references `VenueCatalog`. Its only caller is `venue/adapter/in/VenueReadController.java:65`.
2. *What future change is cheap?* None claimed — the Javadoc closes the door explicitly.
3. *Different word on either side?* There is no other side.

```java
// venue/api/VenueCatalog.java:16–19
 * Consumed only by the module's own REST adapter since the role split (issue #94):
 * set facts live on {@link SetBookingFacts}, rate configuration on {@link VenueRates}
 * — do not add sibling-facing methods here ({@code VenueApiRoleSplitTests} enforces this).
```

Three empty answers. The *interface* still earns its keep as a controller seam
(`VenueAvailabilityCalendarControllerTest` mocks it), but the `@NamedInterface("api")`
*publication* is ceremony: a cross-module surface with no cross-module consumer, plus a test whose
job is to keep it that way.

### `venue.spi.SalesWindow` — a same-signature pass-through

1. *What breaks?* Only the module graph. `venue` would call `booking` directly and
   `ModularityTests` would fail on the cycle. No domain rule is protected.
2. *What is cheap later?* A second `SalesWindow` implementor — there is no plausible one; #4 says
   the rule has exactly one home.
3. *Different word?* No. Identical parameter list, order and types; only the method name differs.

```java
// booking/adapter/out/BookingCutoffSalesWindow.java:43–46
@Override
public boolean isOpen(LocalTime salesClose, LocalDate bookingDate, Instant now) {
    return cutoff.isBookable(salesClose, bookingDate, now);
}
```

Three empty answers: a port whose only justification is the boundary it is an instrument of. Honest
ceremony — the class comment states the circularity plainly ("the compile edge stays
`booking → venue`, the runtime call goes the other way") — but ceremony. Compare `BookingPresence`,
structurally the same inversion, which *does* pass question 3 by owning the definition of "live".

### Three duplicated id records

`operator.vocabulary.VenueRef`, `review.vocabulary.VenueRef`, `review.vocabulary.BookingRef` —
each `record X(long value)`, each converted by identity, each documented as existing to keep the
Modulith graph acyclic. Question 3 comes back empty by their own admission.
`payment.vocabulary.BookingRef` is the exception that passes: "the `payment` module treats it as a
correlation handle — it does not import the `booking` module's types" is a real statement about what
`payment` is allowed to know. The cost is small and the alternative (a shared id kernel) has its own
price; recorded because the brief asked what is paid for nothing.

### Three spellings of money

Not a boundary artefact — a missing one. `payment.vocabulary.Money(minor, currency)` validates;
`venue.vocabulary.MoneyView(minorUnits, currency)` does not; the inline `(long amountMinor,
String currency)` pair carries every event and every column. All three cross module boundaries, all
three mean the same thing, and only one enforces #5 in the type. The invariant survives on defence
in depth (`BIGINT` columns, `CHECK (amount_minor >= 0)`, `PayoutLedgerEntry`'s canonical
constructor) — but the type system does none of the work on the two most-travelled spellings, and
the value object that would is scoped to one module.

### Checked, not ceremony

- **`venue.spi.SetAvailabilityLookup`** — four methods with genuinely different semantics
  (`takenOn` state-agnostic for the tourist map; `statesOn` state-aware for the owner-asserted
  operator read, so "an unpaid hold never renders as a walk-in", `:63–65`).
- **`venue.spi.BookingPresence`** — three methods encoding *strictness that follows what the write
  destroys*. Passes question 3.
- **`customer.spi.GuestBookingHistory`** — same shape as `ReviewErasure`, one call shallower.
- **`booking.spi.ConfirmationMailDelivery`** — implemented by `SuppressedConfirmationMailDelivery`,
  which applies the ADR-0012 suppression list. Real behaviour, not relay.

---

## E. Communication choices

Eleven handler methods, ten of them cross-module, over eight published event types.

| Interaction | Mechanism | Consistency requirement | Verdict |
|---|---|---|---|
| `booking → availability` claim / release | Sync port, in-transaction | Transactional — the caller must know *now* whether it won | **Correct.** `ReserveSetService.reserve` is `@Transactional` and the claim sits inside it (`:81, :99`). Release is co-transactional with the guarded status `UPDATE` at all six call sites. |
| `BookingConfirmed` fan-out → `payout`, `notification` | Async `@ApplicationModuleListener` | Eventual — a ledger row and an e-mail may lag; neither can double-sell anything | **Correct.** Both registry-backed and at-least-once; `payout` idempotent on `UNIQUE(booking_id, entry_type)`. `payout/adapter/in/BookingConfirmedPayoutListener.java:45`, `notification/adapter/in/BookingConfirmationMailListener.java:86`. |
| `payment → booking` (`PaymentConfirmed`/`PaymentCanceled`) | Async `@ApplicationModuleListener` | Eventual, and must be — #8, the webhook commits first and is the truth | **Correct.** Layered idempotency: registry replay + `stripe_webhook_event` event-id dedup + the guarded `UPDATE … RETURNING`. `booking/adapter/in/PaymentEventListener.java:30`. |
| `booking → payment` (checkout, cancel, refund) | Sync ports | Deliberately *outside* any transaction — no row lock across a network round-trip | **Correct.** The reserve transaction commits before the Stripe call; the authoritative gateway call precedes any state change (`AbandonedBookingSweepService.java:26–28`). |
| `review → venue` (`ReviewsChanged`) | Async `@ApplicationModuleListener` | Eventual — `venue.rating_tenths` is a denormalised cache of a `review`-owned computation | **Correct.** Sole-writer scan pins the columns to `venue` and the computation to `review`. |
| `booking`/`venue`/`payout`/`availability` → `operator` (`assertOwns`) | Sync port | Transactional — an authorization fence; lag means a window where a 403 is a 200 | **Correct.** Called first in each service, before any read or write (`WeatherRefundService.java:71`, `VenueAdminService.java:190`). |
| `payout → booking` (`DailyTakings`) | Sync port | Read for an operator report; lag would be fine | **Acceptable.** A synchronous *query*, not a command — sync is the cheap default for a read and no state is coupled. Not a mismatch worth flagging. |
| `notification → booking`/`venue`/`customer` (fact resolution) | Sync ports, called from inside an async listener | The async boundary is already crossed; the reads inside it are point lookups | **Correct.** The standard shape. |

**No mismatches found.** Nothing uses an event where a transaction is required: every transactional
requirement — the claim, the release, the ownership check, the erasure scrub — is a synchronous
in-transaction port call. And nothing uses a synchronous call where lag would be fine except the two
read ports, where sync is the correct cheap choice rather than over-coupling.

One nuance worth recording rather than flagging: **the release path is not qualified by holder.**
`AvailabilityClaim.release(setId, bookingDate)` issues
`DELETE … WHERE set_id = :setId AND booking_date = :bookingDate AND state = 'BOOKED_ONLINE'` with no
reference to which booking held it. That is safe today only because every one of the six call sites
gates it behind a conditional status transition in the same transaction — see G-2. It is a
correctness property that lives in the callers, not in the port.

---

## F. Invariant classification

AGGREGATE = enforceable inside one aggregate, in code. SET = spans all rows, needs a DB constraint.
CROSS-AGGREGATE = needs a process/saga or reconciliation.

| # | Invariant | Class | Where enforced | Assessment |
|---|---|---|---|---|
| 1 | JDBC only, no JPA | Build-time | `JdbcOnlyArchitectureTests`; no `data-jpa` in `platform/build.gradle` | **Sound.** Verified green. |
| 2 | Availability single source of truth per `(set, date)` | **SET** | DB: `CONSTRAINT set_availability_uniq UNIQUE (set_id, booking_date)` (`V4:32`), also the `ON CONFLICT` target. Code: single-writer scan. | **Sound.** The textbook case: a set invariant with a DB constraint *and* the atomic primitive built on it. No application-code race. |
| 3 | Online and walk-in pools are separate | **CROSS-AGGREGATE** | **No DB constraint.** Two application fences: `SELECT pool FROM set_position WHERE id = :id FOR KEY SHARE` inside the claim transaction (`JdbcVenueCatalog.java:393`), and the layout-edit guard `isLivelyClaimed` (`VenueAdminService.java:172`). | **Sound, but by lock.** Spans two tables, so no single constraint can express it. `FOR KEY SHARE` conflicts with the `FOR NO KEY UPDATE` a pool flip takes, and the edit guard refuses a flip while any live hold or live booking exists. See the note below. |
| 4 | Sales close is venue-controlled, on the day itself | AGGREGATE | `BookingCutoff.isBookable(salesClose, bookingDate, now)`, reached from the reserve fence and — via the `SalesWindow` inversion — the browse verdict | **Sound.** One home, two callers. |
| 5 | Money is integer minor units | AGGREGATE | DB: `BIGINT` throughout, `CHECK (amount_minor >= 0)`, `payout_net_check`. Code: `Money`'s and `PayoutLedgerEntry`'s canonical constructors; rounding written down at `Math.floorDiv` (`PayoutLedgerEntry.java:41, :61`). | **Sound, unevenly typed.** Enforced where it matters, but two of the three money spellings carry no type-level guard — §D. |
| 6 | Store UTC `Instant`, reason in `Europe/Tirane` | AGGREGATE | `TIMESTAMPTZ` everywhere (commented per migration); an injected `Clock`, never the JVM default zone | **Sound.** |
| 7 | Booking codes are unguessable bearer credentials | **SET** + AGGREGATE | DB: `CONSTRAINT booking_code_uniq UNIQUE (code)`. Code: `SecureRandomBookingCodeGenerator`; collision handled by an atomic `ON CONFLICT (code) DO NOTHING` with bounded retry (`ReserveSetService.java:131–134`). | **Sound.** Uniqueness is the DB's; entropy and secrecy-in-logs are the code's — the right split. No CHECK on length or alphabet, correctly. |
| 8 | Stripe webhooks are the source of truth | CROSS-AGGREGATE | Three layers: `stripe_webhook_event` event-id PK dedup; stable idempotency keys derived from the booking id; the guarded `UPDATE … RETURNING` | **Sound.** A genuine saga, treated as one. `NotCancellable` deliberately yields to the webhook (`AbandonedBookingSweepService.java:99–104`). |
| 9 | The payout ledger is auditable and idempotent | **SET** | DB: `CONSTRAINT payout_once_per_booking UNIQUE (booking_id, entry_type)` (`V9:33`) — "the payout analogue of set_availability's double-booking UNIQUE". Plus three CHECKs mirrored in the record constructor. | **Sound.** Set invariant, DB-enforced, with the at-least-once listener written against it. |
| 10 | Cancellation/refund policy enforced server-side | AGGREGATE | `CancellationPolicy.quote` then the guarded `bookings.cancelConfirmed(...)`; refund computed before the event is published (`CancelBookingService.java:84–105`) | **Sound.** The lost-race branch returns `NotCancellable` rather than double-refunding. |
| 11 | Modulith boundaries hexagonal and id-based | Build-time | `ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `ResponsibilitiesArchitectureTests` | **Sound, over-stated.** Structure fully enforced and green; the *prose* half is not what the code does — G-9. |
| 12 | Schema changes go through Flyway | Process | 49 versioned forward migrations, V1–V49; no repeatables, no hand DDL | **Sound.** |
| 13 | Venue-scoped operations verify ownership (BOLA) | AGGREGATE | `VenueOwnership.assertOwns` called first in each venue-scoped application service; `/api/admin/**` role-gated and exempt | **Sound.** Correctly in the service rather than the adapter. |

**Set invariants enforced only in application code: none.** Every invariant that spans rows (#2, #7,
#9) has a unique constraint behind it, and in each case the application code is written *against*
that constraint rather than in place of it: `ON CONFLICT DO NOTHING` for the claim and the code,
`ON CONFLICT` accrual for the ledger.

**#3 is the one rule holding without a constraint, and it cannot have one** — it spans
`set_position.pool` and `set_availability`. It is held by an explicit `FOR KEY SHARE` lock inside
the claim transaction plus a write-side guard, which is the correct answer for a cross-aggregate
rule. The residual risk is not a race but a *maintenance* one: safety depends on a lock mode chosen
in one line of SQL, and the comment naming it ("the lock the claim's own INSERT needs anyway, taken
early", `JdbcVenueCatalog.java:392`) is the only thing that would stop someone dropping it as
redundant.

---

## G. Doc/code drift

Fourteen items, ordered by consequence.

### G-1 · Eleven of thirteen "aggregate roots" have no class

`CLAUDE.md:96–115` names an "Aggregate root(s)" column for every module, and
`domain-model.md:24–76` draws each as `«aggregate root»`. Against the code:

| Claimed root | Class exists? | What is actually there |
|---|---|---|
| `Venue`, `BeachMap` | No | `venue/domain/` holds one file: `SalesClose.java`. Tables + `VenueAdminService`. |
| `SetAvailability` | No | `availability/` has **no `domain/` package**. A table and one JDBC adapter. |
| `Booking` | No | `booking/domain/` holds `BookingStatus` and `RefundPolicy`. 72 application files, no aggregate class. |
| `Payment` | No | `payment/domain/` holds `PaymentStatus` and `RefundLifecycle`. |
| `Customer`, `CustomerAccount` | No | `customer/` has **no `domain/` package**. |
| `Operator` | No | `operator/` has **no `domain/` package**. |
| `Review` | No | `review/domain/` holds 7 policy/value types — the richest domain layer here — but no `Review`. |
| `PayoutLedgerEntry`, `PayoutBatch` | **Yes** | Immutable value records with factories, not mutable roots with identity and lifecycle. |

**Which the code supports: the code.** This is a service-and-SQL architecture with `domain/` used
for policies, enums and value objects — exactly what ADR-0007 signed up for when it wrote "DDD
(**strategic + light tactical**)". Notably `RESPONSIBILITIES.md`, the deepest doc, never uses the
phrase "aggregate root" once. The vocabulary is confined to the two summary docs, and it is the part
with nothing behind it.

### G-2 · The availability leak is refuted — the reaper never asks availability

The brief asked what state a claim writes before payment succeeds, and whether the reaper can
distinguish an expired hold from a confirmed booking.

**The claim writes `BOOKED_ONLINE`, immediately.** There is no provisional state — `V4:26` comments
`state TEXT NOT NULL, -- BOOKED_ONLINE | STAFF_MARKED (FREE = no row)` and the CHECK admits only
those two.

**The availability row genuinely cannot distinguish them.** It has no holder column at all. This is
deliberate and dated:

```sql
-- V4__availability.sql:18–20
-- `held_by_booking_id` and an optimistic-lock `version` are intentionally deferred to the
-- slice that needs them (U3/U6) — there is no BookingId and no in-place mutation path in U2.
```

**But the reaper never asks it.** The sweep drives off `booking.status`, not availability, and the
discriminating step is a conditional `UPDATE` that returns the held `(set, date)` only if it won:

```java
// booking/application/reserve/ClaimReleaseService.java:36–44
@Override
@Transactional
public boolean release(BookingId bookingId) {
    return bookings.cancelAwaitingPayment(bookingId.value())
            .map(claim -> {
                availability.release(claim.setId(), claim.bookingDate());
                return true;
            })
            .orElse(false);
}
```

A confirmed booking is not `AWAITING_PAYMENT`, so the `UPDATE` matches zero rows, the `Optional` is
empty, and no release is issued. The same guarded-transition shape holds at all six release sites —
`RequestReleaseService.decline/expire/withdraw` (`:61–107`), `CancelBookingService` (`:91–99`),
`WeatherRefundService` (`:81–87`) — each inside one transaction with the release. And a succeeded
payment is protected twice over: the sweep cancels the PaymentIntent *first* and treats
`NotCancellable` as "leave it alone, the webhook wins" (`AbandonedBookingSweepService.java:99–104`).

**Verdict: not a defect.** The discriminator was placed on the booking row rather than the
availability row — a legitimate design, and the one the guarded-transition idiom is built around.
What is real is narrower: **the release port's own contract cannot express the safety property.**
`release(setId, bookingDate)` would happily delete a row a different booking now holds; the six
callers are what makes that impossible. A seventh caller written without the guarded transition — or
an out-of-band `DELETE` — reintroduces exactly the leak the brief predicted, and no test or
constraint would catch it. A latent hazard in the port's signature, not a live bug.

### G-3 · `domain-model.md` §3.2 gives `SetAvailability` fields that do not exist

Diagrammed at `:212–228`: `+BookingId heldBy`, `+Instant updatedAt`, `+long version`, and an
`AvailabilityState` enum with a `FREE` member. In code: no `heldBy` column, no `version` column, no
`AvailabilityState` type anywhere (state crosses as a bare `String`), and `FREE` is explicitly *not*
a token — "FREE is the absence of a row, so there is no 'FREE' state token" (`V4:7–8`). Only
`updated_at` is real. The prose note directly under the diagram (`:230–235`) describes the real
mechanism accurately; the diagram above it does not. **The code is right.**

### G-4 · `domain-model.md` §3.4 diagrams a `Payment` aggregate that does not exist

Claimed at `:285–318`: `PaymentId id`, `Money amount`, `String idempotencyKey`,
`List~Refund~ refunds`, a `Refund` entity with `RefundId`/`RefundStatus`, and `RefundReason` owned by
`payment`. In code: none of those types exist. There is no `refund` table — V11 adds **two columns**
to `payment`:

```sql
-- V11__payment_refund.sql:17–19
ALTER TABLE payment ADD COLUMN refunded_minor BIGINT NOT NULL DEFAULT 0
    CONSTRAINT payment_refunded_check CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor);
ALTER TABLE payment ADD COLUMN refund_id TEXT;
```

So the model is **at most one refund per payment**, not a collection — materially different from the
`1 *-- many` the diagram draws. The idempotency key is not stored at all; it is derived from the
booking id at call time (`StripePaymentGateway.java:333`). And `RefundReason` lives in
`booking/vocabulary/`, not `payment` — the reason for a refund is `booking`'s word. **The code is
right.**

### G-5 · `domain-model.md` §3.5 misstates the ledger record

Claimed: `EntryId id`, `Money gross/commission/net`, `String periodKey`, `Instant createdAt`;
`PayoutBatch` with `BatchId id` and `Money totalNet`. Actual
(`payout/domain/PayoutLedgerEntry.java:17`): `record PayoutLedgerEntry(VenueId venueId,
long bookingId, EntryType entryType, long grossMinor, long commissionMinor, long netMinor,
String currency, RefundReason reason)` — no id type, no `Money`, no `periodKey`, no `createdAt`, and
one field the diagram omits entirely: `reason`, which is what makes a reversal auditable under #9.
`PayoutBatch` is `(Long id, VenueId, PeriodKey, long totalNetMinor, String currency, BatchStatus)`.
Also note `long bookingId` raw — the module that publishes a typed `VenueId` in the same record uses
a bare `long` for the booking. **The code is right.**

### G-6 · `domain-model.md` §3.1 and §3.3 diverge on Venue and Booking

- `Venue.commissionRate: CommissionRate` — the live rate is `venue.commission_bps INTEGER`, and
  since V39 the *effective-dated* rate lives in a separate `venue_commission_rate` table, because
  "history is never repriced". A single-valued field misrepresents the schedule.
- `Venue.photos: List~PhotoRef~` — photos are two tables (`venue_photo`, `venue_photo_variant`) and
  there is no `PhotoRef` type; the vocabulary is `PhotoSlot`, `PhotoSurface`, `ContentHash`,
  `CoverPhotoView`.
- `Booking.pricePaid: Money` — the columns are `amount_minor` + `amount_currency`.
- `Booking.cancellationDeadline: Instant` — **no such column.** It is computed per request by
  `CancellationPolicy` from the venue's `booking_cutoff`. A reader would look for a stored deadline
  and not find one.
- `SetPosition.price: Money` — columns are `price_minor` + `price_currency`.

### G-7 · `domain-model.md` §3.6 misstates `Customer`

Claimed: `CustomerId id`, `Email email`, `String name`, `boolean guest`. Actual columns:
`id, email, full_name, phone, created_at, updated_at`. There is no `guest` flag and no `Email` value
type (the vocabulary type is `Emails`, a canonicalisation helper). Guest-ness is not a field — it is
which of two unlinked tables the row is in.

### G-8 · §3 covers six of nine contexts

`domain-model.md:136` promises "One class diagram per bounded context." §3.1–3.6 supply `venue`,
`availability`, `booking`, `payment`, `payout`, `customer`. Missing: **`operator`** (7 api ports, 11
vocabulary types, the #13 fence), **`review`** (the largest `domain/` in the codebase),
**`notification`** (67 files).

### G-9 · Invariant #11's prose overstates what the code and the test do

`CLAUDE.md:150–151`: "event payloads carry **ids, not business fields**." Two published events carry
business fields:

```java
public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
        LocalDate bookingDate, long amountMinor, String currency,
        CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {

public record BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId,
        LocalDate bookingDate, long refundMinor, String currency, RefundReason reason) {
```

The machine check is narrower than the prose and the code satisfies it:
`ResponsibilitiesArchitectureTests`' rule is "Events carry technical ids/**values**, never foreign
**aggregates**" (`RESPONSIBILITIES.md:1031`). So `RESPONSIBILITIES.md`'s table row and `CLAUDE.md`'s
invariant text disagree with each other, and the code follows the former. Carrying `amountMinor` on
`BookingConfirmed` is also deliberately correct — it is what lets `payout` accrue without a callback
into `booking`. **The code is right; `CLAUDE.md`'s wording is not.**

### G-10 · "Spring Data JDBC aggregates" are offered but never used

`CLAUDE.md:124–125`: "Spring Data JDBC aggregates **and/or** `JdbcTemplate` with explicit SQL." The
starter is on the classpath (`platform/build.gradle:27`) but there is not a single `CrudRepository`,
`@Table`, `@Id` or `org.springframework.data.*` import in `src/main/java`. All 27 `Jdbc*` classes
under `adapter/out` are hand-written `JdbcClient` SQL. The doc describes a choice the codebase has
uniformly made one way.

### In code, omitted by the docs

- **G-11 · `audit` and `challenge` do not appear in `domain-model.md`'s diagrams** — correctly
  excluded by the note at `:20` ("collaborate with nobody and are not drawn"), but a reader of §1
  alone sees nine of twelve modules with no sign the other three exist. They landed in `#916`/`#917`.
- **G-12 · The composition root holds nine controllers and 52 classes** — `AuthController`,
  `SsoController`, `MyAccountController`, `AccountRecoveryController`, `MyErasureController`,
  `AdminOperatorController`, `AdminErasureController`, `OperatorAccountController`,
  `MockSsoIdpController`. `customer` and `operator` — two of the nine "bounded contexts" — have
  **zero controllers of their own**. `CLAUDE.md`'s "Platform edge" paragraph states the rule ("login
  machinery at the edge, never in modules"); no diagram shows how much of the system lives there.
- **G-13 · `booking`'s real weight is invisible in the docs.** 141 files across six use-case slices
  (`reserve`, `cancel`, `refund`, `request`, `checkin`, `view`) — larger than `payment`, `payout`,
  `operator` and `availability` combined (108). §3.3 draws it as a nine-field record. ADR-0007
  sub-decision 3 is the only place this asymmetry is acknowledged.
- **G-14 · Refund resubmission has no doc presence.** `RefundOutbox`, `RefundOutboxStatus`,
  `RefundResubmission`, `RefundResubmissionWindow`, `RefundResubmissionService` plus V42's failure
  trace implement a retry loop for refunds the gateway rejected. §5's cancellation sequence stops at
  "webhook refund updated (signed)" and shows no failure leg.

---

## H. Open questions the code cannot answer

1. **Was "nine bounded contexts" ever a decision, or an inherited label?** Every module's
   `package-info.java` justifies its *dependency grants* in detail and none justifies its
   *context-hood*. The two files that do use the term (`audit`, `challenge`) use it to say what they
   are *not*.
2. **Is `venue.spi.SalesWindow` load-bearing for a reason not in the code?** §D marks it ceremony on
   all three questions. If a second sales-window rule is foreseen — a per-beach curfew, a seasonal
   close — the inversion is prescient rather than empty. Nothing in the repo says either way.
3. **Why does `SetId` cross four modules unduplicated while `VenueId` and `BookingId` are copied?**
   The cycle argument explains why `operator` and `review` need their own refs. It does not explain
   why `availability`, `booking` and `notification` may import `venue.vocabulary.SetId` directly. The
   asymmetry looks like a consequence of grant history rather than a rule, but that cannot be
   confirmed from the tree.
4. **Is the single-refund-per-payment model intentional or an unfinished slice?** V11 adds
   `refund_id TEXT` — singular. `domain-model.md` draws `List~Refund~`. Partial refunds exist
   (`PARTIALLY_REFUNDED`, `lateCancelRefundBps`), so one refund per payment may be exactly right; or
   the diagram may be the intended target and the schema the current step. No ADR covers it.
5. **Should availability's state and pool cross module boundaries as `String`?** `statesOn` returns
   `Map<SetId, String>`; `poolForClaim` returns `Optional<String>`; callers compare against
   `private static final String ONLINE_POOL = "ONLINE"` in two separate modules. The same codebase
   publishes a dedicated record to avoid passing a bare `long`. Whether the untyped tokens are a
   deliberate exemption or an oversight is not written down.
6. **Is the "provisional decision" on venue payout currency still open?** `CLAUDE.md:174–176` lists
   EUR-vs-ALL per venue as provisional. The column `venue.payout_currency TEXT NOT NULL` has existed
   since V1 and `JdbcVenues.java:391` comments that it is read-only after creation. The code has made
   a choice; whether the decision is settled is a product question.
7. **What is the intended fate of the aggregate-root vocabulary?** G-1 establishes it is
   unsupported. Whether the right resolution is to build the aggregates or to drop the label is a
   design decision, not an audit finding, and was outside this note's brief.
