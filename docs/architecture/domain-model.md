# Riviera Sunbed Booking — Domain Model (diagrams)

> Pre-implementation modeling. This file visualizes the bounded contexts,
> aggregates/entities, actors & use cases, and the core flows **before** any code
> is written. It is derived from `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`
> and the invariants in `/CLAUDE.md` (referenced below as "invariant #N").
>
> All diagrams are [Mermaid](https://mermaid.js.org/) and render on GitHub. Treat
> this as a living sketch — names will firm up at scaffolding time.

---

## 1. Bounded context map

The six Spring-Modulith modules and how they collaborate. **Solid arrows = domain
events** (state changes). **Dotted arrows = `api/` port queries** (reads). Modules
never import each other's internals — only `api/` ports or events (invariant #11).

```mermaid
graph TB
    subgraph customer["customer"]
        CUST["Customer<br/>«aggregate root»"]
    end
    subgraph venue["venue"]
        VEN["Venue<br/>«aggregate root»"]
        MAP["BeachMap<br/>«aggregate root»"]
    end
    subgraph availability["availability — single writer of (set, date)"]
        AVAIL["SetAvailability<br/>«aggregate root»"]
    end
    subgraph booking["booking"]
        BOOK["Booking<br/>«aggregate root»"]
    end
    subgraph payment["payment"]
        PAY["Payment<br/>«aggregate root»"]
    end
    subgraph payout["payout"]
        LEDG["PayoutLedgerEntry<br/>«aggregate root»"]
        BATCH["PayoutBatch<br/>«aggregate root»"]
    end

    PAY -- "PaymentSucceeded" --> BOOK
    BOOK -- "BookingConfirmed" --> AVAIL
    BOOK -- "BookingConfirmed" --> LEDG
    BOOK -- "BookingCancelled" --> AVAIL
    BOOK -- "BookingCancelled" --> PAY
    PAY -- "PaymentRefunded" --> LEDG

    BOOK -. "pricing, pool, mode, cutoff" .-> VEN
    BOOK -. "set position" .-> MAP
    BOOK -. "guest contact" .-> CUST
    AVAIL -. "render map state" .-> MAP
    LEDG --> BATCH
```

**The spine** (invariant #2, #9): `PaymentSucceeded → BookingConfirmed →`
availability marks the set taken **and** payout accrues a ledger entry. On
`BookingCancelled →` availability frees the set **and** payment refunds per policy.

---

## 2. Actors & use cases

```mermaid
graph LR
    Tourist(("Tourist"))
    Staff(("Venue staff"))
    Admin(("Platform admin"))
    Stripe(("Stripe<br/>webhooks"))

    subgraph discover["Discover & book (tourist)"]
        U1["Browse venues by beach + date"]
        U2["View beach map + set prices"]
        U3["Select exact set"]
        U4["Pay in-app (card / Apple / Google Pay)"]
        U5["Get booking code + email"]
        U6["View / cancel booking"]
    end

    subgraph operate["Operate venue (staff)"]
        V1["Onboard: profile, photos, prices"]
        V2["Lay out beach map (rows, positions)"]
        V3["Split online vs walk-in pool"]
        V4["Choose Instant / Request mode"]
        V5["Accept / decline requests"]
        V6["Today's bookings + codes sheet"]
        V7["Tap-to-mark walk-in set"]
        V8["See payout owed"]
    end

    subgraph platform["Platform (admin)"]
        A1["Trigger weather refund (manual)"]
        A2["Run weekly BKT payout report"]
        A3["Set commission per venue"]
    end

    Tourist --> U1 & U2 & U3 & U4 & U5 & U6
    Staff --> V1 & V2 & V3 & V4 & V5 & V6 & V7 & V8
    Admin --> A1 & A2 & A3
    Stripe -. "payment / refund events" .-> U4
```

> v1 scope note: weather refund and payout reporting are **manual/admin** (invariant
> #10, spec §6 & §10). No same-day booking — bookings close the evening before
> (invariant #4).

---

## 3. Aggregates, entities & value objects

One class diagram per bounded context. `«aggregate root»` = transactional
consistency boundary. Cross-aggregate links are **by technical id only** (invariant
#11) — never object references across a boundary. Money is always integer minor
units + currency (invariant #5).

### 3.1 `venue`

```mermaid
classDiagram
    class Venue {
        <<aggregateRoot>>
        +VenueId id
        +String name
        +Beach beach
        +String description
        +List~PhotoRef~ photos
        +Rating rating
        +BookingMode mode
        +CommissionRate commissionRate
        +Currency payoutCurrency
        +LocalTime bookingCutoff
    }
    class BeachMap {
        <<aggregateRoot>>
        +BeachMapId id
        +VenueId venueId
        +List~SetPosition~ positions
    }
    class SetPosition {
        <<entity>>
        +SetId id
        +String rowLabel
        +int positionNo
        +SetTier tier
        +Pool pool
        +Money price
        +int x
        +int y
    }
    class Money {
        <<valueObject>>
        +long minorUnits
        +Currency currency
    }
    class BookingMode {
        <<enumeration>>
        INSTANT
        REQUEST
    }
    class Pool {
        <<enumeration>>
        ONLINE
        WALK_IN
    }
    class SetTier {
        <<enumeration>>
        PREMIUM
        STANDARD
    }
    BeachMap "1" *-- "many" SetPosition
    SetPosition --> Money
    BeachMap ..> Venue : venueId
```

> `bookingCutoff` defaults to 18:00 `Europe/Tirane` (invariant #4, #6). `pool`
> keeps online and walk-in sets physically separate (invariant #3) — an online
> booking can only target an `ONLINE` set.

### 3.2 `availability` — the heart (invariant #2)

```mermaid
classDiagram
    class SetAvailability {
        <<aggregateRoot>>
        +SetId setId
        +LocalDate bookingDate
        +AvailabilityState state
        +BookingId heldBy
        +Instant updatedAt
        +long version
    }
    class AvailabilityState {
        <<enumeration>>
        FREE
        BOOKED_ONLINE
        STAFF_MARKED
    }
    SetAvailability --> AvailabilityState : state
```

> Identity is the pair **(setId, bookingDate)**. A DB `UNIQUE(set_id, booking_date)`
> constraint plus a claim done as `SELECT ... FOR UPDATE` or
> `INSERT ... ON CONFLICT DO NOTHING` guarantees **at most one party per set per
> date** (invariant #2). This module is the *only* writer of this table — both
> online bookings and staff taps go through it.

### 3.3 `booking`

```mermaid
classDiagram
    class Booking {
        <<aggregateRoot>>
        +BookingId id
        +SetId setId
        +VenueId venueId
        +CustomerId customerId
        +LocalDate bookingDate
        +Money pricePaid
        +BookingStatus status
        +BookingCode code
        +Instant cancellationDeadline
        +Instant createdAt
    }
    class BookingCode {
        <<valueObject>>
        +String value
    }
    class BookingStatus {
        <<enumeration>>
        PENDING_REQUEST
        AWAITING_PAYMENT
        CONFIRMED
        CANCELLED
        COMPLETED
        NO_SHOW
        DECLINED
        EXPIRED
    }
    Booking --> BookingCode : code
    Booking --> BookingStatus : status
```

> `BookingCode` is an unguessable bearer credential — ≥ 8 random base32 chars,
> never sequential, treated as a secret in logs (invariant #7). `cancellationDeadline`
> is the evening-before cutoff, computed in `Europe/Tirane`, stored UTC (invariant #4, #6).

### 3.4 `payment`

```mermaid
classDiagram
    class Payment {
        <<aggregateRoot>>
        +PaymentId id
        +BookingId bookingId
        +Money amount
        +String stripePaymentIntentId
        +String idempotencyKey
        +PaymentStatus status
        +List~Refund~ refunds
    }
    class Refund {
        <<entity>>
        +RefundId id
        +Money amount
        +RefundReason reason
        +String stripeRefundId
        +RefundStatus status
    }
    class PaymentStatus {
        <<enumeration>>
        REQUIRES_PAYMENT
        SUCCEEDED
        FAILED
        REFUNDED
        PARTIALLY_REFUNDED
    }
    class RefundReason {
        <<enumeration>>
        POLICY
        WEATHER
        CONFLICT
    }
    Payment "1" *-- "many" Refund : refunds
```

> State is reconciled from **signature-verified Stripe webhooks**, never the client
> redirect (invariant #8). Charge/refund creation uses **idempotency keys**.
> Collection-only — no Stripe Connect (see `riviera-stripe-payments`).

### 3.5 `payout`

```mermaid
classDiagram
    class PayoutLedgerEntry {
        <<aggregateRoot>>
        +EntryId id
        +VenueId venueId
        +BookingId bookingId
        +Money gross
        +Money commission
        +Money net
        +EntryType type
        +String periodKey
        +Instant createdAt
    }
    class PayoutBatch {
        <<aggregateRoot>>
        +BatchId id
        +VenueId venueId
        +String periodKey
        +Money totalNet
        +BatchStatus status
    }
    class EntryType {
        <<enumeration>>
        ACCRUAL
        REVERSAL
    }
    class BatchStatus {
        <<enumeration>>
        DRAFT
        REPORTED
        SETTLED
    }
    PayoutBatch "1" o-- "many" PayoutLedgerEntry : periodKey + venueId
```

> A booking contributes **exactly once** (an `ACCRUAL`); a refund posts a `REVERSAL`
> (invariant #9). `net = gross − commission`; commission rate stored per venue.
> Payouts settle manually via BKT — the ledger is the record of what is owed.

### 3.6 `customer`

```mermaid
classDiagram
    class Customer {
        <<aggregateRoot>>
        +CustomerId id
        +Email email
        +String name
        +boolean guest
    }
    class Email {
        <<valueObject>>
        +String value
    }
    Customer --> Email : email
```

> Intentionally light — guest checkout with an email is acceptable (spec §4.1).

---

## 4. Core flow — Instant Book (happy path)

Shows the double-booking claim (invariant #2) and webhook-as-source-of-truth
(invariant #8) working together.

```mermaid
sequenceDiagram
    actor T as Tourist
    participant FE as Angular
    participant B as booking
    participant A as availability
    participant P as payment
    participant S as Stripe
    participant L as payout

    T->>FE: pick ONLINE set + date
    FE->>B: POST /bookings
    B->>A: claim(setId, date)
    alt set already taken
        A-->>B: rejected
        B-->>FE: 409 unavailable
    else claimed (provisional hold)
        A-->>B: held
        B->>P: create PaymentIntent (idempotency key)
        P->>S: PaymentIntent
        S-->>FE: client secret
        T->>S: confirm card / wallet
        S-->>P: webhook payment_intent.succeeded (signed)
        P-->>B: PaymentSucceeded
        B->>B: status = CONFIRMED, issue booking code
        B-->>A: BookingConfirmed → state = BOOKED_ONLINE
        B-->>L: BookingConfirmed → accrue ledger entry
        B-->>FE: confirmation + code + email
    end
```

---

## 5. Core flow — cancellation & refund

```mermaid
sequenceDiagram
    actor T as Tourist
    participant B as booking
    participant A as availability
    participant P as payment
    participant S as Stripe
    participant L as payout

    T->>B: cancel booking
    B->>B: evaluate policy vs cutoff (Europe/Tirane)
    alt before cutoff
        B->>B: CANCELLED — full refund due
    else after cutoff
        B->>B: CANCELLED — non-refundable / partial
    end
    B-->>A: BookingCancelled → state = FREE
    B-->>P: BookingCancelled (refund amount computed server-side)
    P->>S: create Refund (idempotency key)
    S-->>P: webhook refund updated (signed)
    P-->>L: PaymentRefunded → REVERSAL entry
```

> Refund amounts are computed **server-side** then actioned via Stripe (invariant
> #10). Weather refunds are the same flow but admin-triggered with reason `WEATHER`.

---

## 6. State machines

### 6.1 Booking lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING_REQUEST: Request-to-Book venue
    [*] --> AWAITING_PAYMENT: Instant Book venue
    PENDING_REQUEST --> AWAITING_PAYMENT: venue accepts
    PENDING_REQUEST --> DECLINED: venue declines
    AWAITING_PAYMENT --> CONFIRMED: PaymentSucceeded (webhook)
    AWAITING_PAYMENT --> EXPIRED: payment not completed
    CONFIRMED --> CANCELLED: tourist cancel / weather refund
    CONFIRMED --> COMPLETED: day passed, guest arrived
    CONFIRMED --> NO_SHOW: day passed, no arrival
    DECLINED --> [*]
    EXPIRED --> [*]
    CANCELLED --> [*]
    COMPLETED --> [*]
    NO_SHOW --> [*]
```

### 6.2 Set availability per (set, date)

```mermaid
stateDiagram-v2
    [*] --> FREE
    FREE --> BOOKED_ONLINE: BookingConfirmed (ONLINE-pool set only)
    FREE --> STAFF_MARKED: staff tap-to-mark walk-in
    BOOKED_ONLINE --> FREE: BookingCancelled
    STAFF_MARKED --> FREE: staff un-mark
```

---

## How to extend this

- Edit the Mermaid blocks above; GitHub re-renders on push. For a quick local
  preview use the [Mermaid Live Editor](https://mermaid.live/).
- When names/fields change at scaffolding, update here first — this doc is the
  shared picture the modules are built against.
