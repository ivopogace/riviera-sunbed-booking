# System Responsibilities

The Job / Not-My-Job boundaries for each module in the `ai.riviera.platform`
modular monolith. This is the plain-English companion to `CLAUDE.md`: `CLAUDE.md`
holds the invariants and the module table; this file says, for each module, what
it owns and — more usefully — what it must **refuse to own**. When a boundary is
ambiguous in a plan or review, this is the tie-breaker.

Modules: `venue`, `availability`, `booking`, `payment`, `payout`, `customer`, and
`operator`. Cross-module collaboration is **events for state changes,
`api/` ports for queries** (invariant #11).

The **structural** subset of these boundaries is machine-enforced — see
[Machine-checked vs review-checked](#machine-checked-vs-review-checked) at the end
of this file for exactly which clauses the build verifies and which remain
review-only.

## Main Use Case — Book and manage one sunbed reservation (Instant Book)

1. A tourist browses venues and opens one; they see the beach map and which sets
   are free for a chosen date. The map and set layout come from **`venue`**; which
   of those sets are actually free on that date comes from **`availability`**.
2. The tourist picks a set + date and gives guest-checkout contact. **`customer`**
   owns that contact; **`booking`** opens a booking.
3. **`booking`** reserves the set: it asks **`availability`** to claim the
   `(set, date)` row **atomically** — so it can never be double-sold — and commits
   the booking as `AWAITING_PAYMENT`. The claim happens **before** any money moves.
4. **`booking`** hands off to **`payment`**, which creates a Stripe PaymentIntent.
   `booking` never touches Stripe itself.
5. Stripe confirms out-of-band. **`payment`** reconciles the result from the
   **signature-verified webhook** — never a client "success" redirect — and marks
   the payment settled.
6. **`booking`** confirms: it transitions to `CONFIRMED`, issues the unguessable
   booking code, and publishes `BookingConfirmed`.
7. On `BookingConfirmed`, independent listeners fire: **`payout`** accrues a ledger
   entry for the venue (idempotently), and **`availability`** finalises the set as
   taken. Neither reaches back into `booking`.
8. On arrival, venue staff verify the booking code at the lane/set. Staff can also
   tap-to-mark a walk-in, which **`availability`** records against the **walk-in**
   pool — a separate pool from online bookings.
9. If the tourist cancels, **`booking`** applies the cancellation policy and, on
   `BookingCancelled`, **`availability`** frees the set and **`payment`** refunds
   the amount `booking` decided.

> **Variant — Request-to-Book** (per venue's booking mode; *not yet built — issue #98*): between
> steps 2 and 3 the host accepts or declines; on accept, `payment` sends a payment
> request rather than charging immediately. Same ownership boundaries apply.

**Key design decisions:**

- **`availability` is the single source of truth for `(set, date)` and the only
  writer of that table.** A set is claimed atomically (`INSERT … ON CONFLICT`) at
  reservation time, *before* payment, so it can never be double-sold (invariant #2).
- **Online and walk-in are separate pools.** An online booking can only ever target
  an online-pool set; staff walk-ins draw from the walk-in pool (invariant #3).
- **`payment` trusts Stripe webhooks, never the client.** Payment state is
  reconciled from signature-verified webhooks with idempotency keys (invariant #8).
- **Decision vs. execution is split, twice.** `booking` owns the cancellation/refund
  *policy*; `payment` *executes* the refund. `venue` stores the commission *rate*;
  `payout` *does* the arithmetic. Neither executor re-decides.
- **Money is integer minor units in EUR, everywhere. No floats** (invariant #5).
- **Events carry technical ids** (`BookingId`, `SetId`, `VenueId`), never foreign
  aggregates or mutable business fields — the Need-To-Know boundary (invariant #11).
- **Every venue-scoped operation verifies the operator owns the venue** (403 on
  mismatch). The check is performed in the application service; the ownership mapping
  is owned by **`operator`** (invariant #13).

---

## `venue`
**Job:** Own venue profiles, the beach map / layout, set positions, the online-vs-walk-in
pool assignment for each set, pricing, and the booking mode (Instant / Request).

**Not My Job:**
- Knowing whether a specific set is free on a date → **`availability`** (I own the
  static layout; it owns the per-date state)
- Creating or tracking bookings → **`booking`**
- Collecting money, or knowing an amount was actually paid → **`payment`** (I set the
  price; `payment` charges it)
- The payout math or commission arithmetic → **`payout`** (I store the commission
  *rate*; `payout` computes with it)
- Which operator owns this venue / authorizing them → **`operator`**

---

## `availability`
**Job:** Own the single source-of-truth state per `(set, date)` — free / booked-online /
staff-marked. Be the **only writer** of that table. Claim a set atomically so it can
never be double-sold.

**Not My Job:**
- The venue layout, which sets exist, or their positions → **`venue`** (I reference
  sets by id; I don't own them)
- *Why* a set is taken — which booking, who paid → **`booking`** (I record *that*
  `(set, date)` is claimed, not the booking behind it)
- Deciding whether bookings are even open for a date (the same-day cutoff) →
  **`booking`** owns that rule; I only hold state
- Pricing → **`venue`**; payment → **`payment`**

---

## `booking`
**Job:** Own bookings, booking codes, and the lifecycle (confirmed / cancelled /
completed / no-show). Enforce the cancellation policy and the same-day cutoff.
Orchestrate the reserve → pay → confirm flow across `availability` and `payment`.

**Not My Job:**
- Owning the `(set, date)` availability state → **`availability`** (I *ask* it to
  claim; it owns the row and the atomic guarantee)
- Talking to Stripe or moving money → **`payment`** (I *ask* it to collect; I never
  hold a PaymentIntent or a webhook)
- Computing the payout or commission → **`payout`** (my `BookingConfirmed` event
  *triggers* accrual; I don't do the math)
- The venue map, pricing, or pool rules → **`venue`**
- Storing guest contact details → **`customer`**
- Authorizing which operator may view staff bookings → **`operator`**

---

## `payment`
**Job:** Own Stripe collection — PaymentIntents, refunds, and webhook handling.
Reconcile payment state from **signature-verified Stripe webhooks** (never the
client). Collection only.

**Not My Job:**
- Deciding *whether* to refund or *how much* → **`booking`** owns the refund policy;
  I execute the refund it decided
- The booking lifecycle → **`booking`**
- The payout ledger or commission → **`payout`**
- Paying venues out / Stripe Connect → nobody uses Connect; **`payout`** records what's
  owed and payout is settled manually via BKT
- Setting or knowing the price → **`venue`** (I charge the amount I'm handed)
- Storing card numbers → **Stripe** (I hold PaymentIntent ids, not PANs)

---

## `payout`
**Job:** Own the venue payout ledger (Σ booking amounts − commission) and the manual
BKT batch reporting. Accrue **idempotently** — a booking contributes exactly once; a
refund reverses it.

**Not My Job:**
- Actually moving money to venues → settled **manually via BKT**; I only record what
  is owed
- Collecting money from tourists → **`payment`**
- Setting the commission rate → **`venue`** (I apply the rate it stores)
- The booking lifecycle or refund decisions → **`booking`** (I reverse a ledger entry
  when told; I don't decide the refund)
- The tourist's identity or contact → **not sent to me** (I work in venue-ids,
  booking-ids, and money — no Need-To-Know)

---

## `customer`
**Job:** Own light tourist identity / guest-checkout contact.

**Not My Job:**
- Bookings → **`booking`**; payment → **`payment`**
- Operator accounts or staff logins → **`operator`** (I am the *tourist*; `operator`
  is the *venue's* people)
- Tourist accounts, marketing, or authentication → out of scope in v1 (guest checkout)

---

## `operator`
**Job:** Own operator accounts and the **operator↔venue ownership mapping**. Answer
one question for the rest of the system: *does this operator own this venue?*
(invariant #13).

**Not My Job:**
- Tourist identity → **`customer`**
- The venue's own data — map, pricing, pools → **`venue`** (I own *who may act on* a
  venue, not the venue itself)
- *Performing* the authorization check at each endpoint → each venue-scoped module's
  **application service** performs it by asking me; I own the mapping and answer, I
  don't sit in everyone's request path
- Bookings, payment, payout → their own modules
- Encoding/verifying credentials → the **platform edge** (Spring Security
  `UserDetailsService`); I own the account identity + ownership mapping and store an
  opaque credential hash, never the login machinery (RV-BE-11)

**Shipped** (#73 module + per-venue `assertOwns` → `403` in every venue-scoped
application service; #74 per-operator DB-backed credentials — no shared password). See
`docs/runbooks/operator-credential-provisioning.md`. Remaining follow-up: fully retiring
the owns-all **bootstrap operator** (every operator strictly per-venue) +
creator-owns-on-create.

---

## Machine-checked vs review-checked

The boundaries above split into a **structural** half the build enforces as fitness
functions, and a **semantic** half no import rule can see. **A green architecture-test
run must never be read as "boundaries fully enforced"** — the tests are necessary, not
sufficient.

**Machine-checked** (fails the build; all under
`platform/src/test/java/ai/riviera/platform/`):

| Clause of this file | Fitness function |
|---|---|
| `availability` is the **only writer** (and direct reader) of `set_availability` — invariant #2 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| Only `payment` talks to Stripe — the SDK is unreachable elsewhere | `ResponsibilitiesArchitectureTests` (Stripe-reach rule) |
| Events carry technical ids/values, never foreign aggregates — invariant #11 Need-To-Know | `ResponsibilitiesArchitectureTests` (id-based-events rule) |
| `payment` uses no Stripe **Connect** API (collect-only, ADR-0002) | `NoStripeConnectArchitectureTest` |
| No module reaches another's `application`/`domain`/`adapter` internals; `allowedDependencies` deny-lists hold | `ModularityTests` (`ApplicationModules.verify()`) |
| The ADR-0007 package shape; published-surface kinds (`api`/`spi`/`vocabulary`/`events`); the `VenueCatalog` role split | `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` |
| No JPA/Hibernate on the classpath — invariant #1 | `JdbcOnlyArchitectureTests` |
| No login machinery inside `operator` (RV-BE-11) | `OperatorAuthPlacementTests` |

Each rule is proven able to fail on every build, against deliberately-violating fixtures
(`ai.riviera.responsibilityfixture`, `ai.riviera.placementfixture`) — never by breaking
production code.

**Review-checked only** (the semantic half — needs **no illegal import**, so it cannot
be encoded; owned by the plan-time Module-ownership table, `riviera-plan-doc` §4a, and
review item RV-BE-11):

- A refund **policy** reimplemented inside `payment` (only `booking` decides
  whether/how much to refund; `payment` executes).
- Commission **math** inside `venue` (it stores the rate; only `payout` computes).
- A booking-lifecycle decision creeping into `availability` (it holds state, not the
  cutoff rule), or any other capability landing on a module's Not-My-Job list without
  crossing a package boundary.

Known scan limits (documented on the tests): the sole-writer rule keys on the contiguous
whole-word table name in compiled constant pools — SQL assembled by string concatenation
could evade it (the text-block-SQL idiom keeps names contiguous). The id-based-events rule
unwraps generics and arrays (a `List<Aggregate>` component is caught), but only for the
component's declared type.
