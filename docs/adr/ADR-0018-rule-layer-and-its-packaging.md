# ADR-0018: The rule layer holds choices, calculations and lifecycles; purity decides which package it sits in, and a set invariant stays in the database

- **Status:** Accepted
- **Date:** 2026-09-04
- **Relates to:** ADR-0007 (package structure — its "bounded context" wording is corrected here and
  in that document), ADR-0005 (the refund tiers this layer computes), ADR-0015 (`review`, the
  module this ADR reads as the benchmark), ADR-0017 (non-context modules — the category survives
  this ADR's vocabulary change, see *Consequences*), invariants #2, #4, #5, #7, #9, #10, #11,
  `RESPONSIBILITIES.md` § *Invariants, long form*. Evidence:
  `docs/research/2026-09-04-bounded-context-and-doc-drift-audit.md` (§B, §F, §G-1) and
  `docs/research/2026-09-04-where-the-business-rules-live.md` (§A, §D, §E, §F) — every file/line
  citation below is re-read against the tree at `b8ab723` (the notes audited `1f715c1` and
  `9f2411d`; where a count differs, this ADR states the re-read one and says so).

## Context

Nothing in the substrate wrote down what `domain/` is *for*. ADR-0007 lists it in the full template
as "aggregates, value objects, policies, enums" (`docs/adr/ADR-0007-package-structure.md:63`) and
names "DDD (strategic + light tactical)" among its hard constraints (`:31`), but neither says which
statements belong in the layer, which belong beside it in `application/`, and which belong in
neither because Postgres already holds them. Two consequences followed.

**First, a recurring question with no written answer.** The domain layer is 18 files and 600 lines
across five of twelve modules; seven modules have none
(`2026-09-04-where-the-business-rules-live.md` §A). Whether that is legitimate placement or rules
flattened into service procedures took a full audit to answer. The answer was *placement* — nine of
twelve modules are thin for reasons the code states and the tests corroborate (§F) — but it was
reconstructed from Javadoc and the test tree rather than read off a decision.

**Second, the vocabulary in the two summary docs describes a design that was never built.**
`CLAUDE.md:86` heads a column "Aggregate root(s)" naming eleven classes, and
`docs/architecture/domain-model.md:27–53` draws ten `«aggregate root»` boxes (the same set minus
`CustomerAccount`). **Nine of those eleven names have no class**
(`2026-09-04-bounded-context-and-doc-drift-audit.md` §G-1 — its table enumerates exactly these
nine, under a headline that miscounts them as "eleven of thirteen"; the two that do exist are
`PayoutLedgerEntry` and `PayoutBatch`). The same note's §B finds the
"bounded context" label equally unbacked: none of the four language tells fires across any module
pair, the three duplicated id records are identity conversions that exist to keep the Modulith graph
acyclic, and the only genuine translation boundary in the system is against Stripe. `RESPONSIBILITIES.md`,
the deepest doc, never uses the phrase "aggregate root" once.

Because the Claude Code skills read ADRs, an unstated rule and an unbacked vocabulary reproduce
themselves in generated code and generated docs. This ADR states the rule and retires the
vocabulary.

## Decision

### 1. The rule layer holds the business's choices, calculations and lifecycles

A statement belongs in the rule layer — `domain/` or its `application/` counterpart, per §2 — when
it is one of three things:

- **A choice.** A window, a tier, a bound, a rate, a rounding direction: something that could have
  been decided otherwise without anything else breaking. `ReviewWindow`'s 60 days, `Stars`' 1..5
  (`review/domain/Stars.java:14–15`), `SalesClose`'s three fixed times
  (`venue/domain/SalesClose.java:18–22`), `RefundPolicy`'s three tiers
  (`booking/domain/RefundPolicy.java:34–40`), the pay and expiry windows of
  `RequestWindows` (`booking/application/request/RequestWindows.java:20`).
- **A calculation** — anything deriving money or a rating. `CommissionSplit.of`
  (`payout/domain/CommissionSplit.java:17–20`), `PayoutLedgerEntry.accrual`/`reversalOf`
  (`payout/domain/PayoutLedgerEntry.java:39–64`), `RefundPolicy.refundMinor`,
  `AggregateRating`. Where a calculation divides, the rounding direction is written down at the
  division (`PayoutLedgerEntry.java:35`, `:54`; invariant #5).
- **A lifecycle** — what may follow what. `ReviewGate.stateOf` is the model
  (`review/domain/ReviewGate.java:30–42`): one ordered statement of the fences, called by every
  path that asks, "so a stay that trips two fences at once is told the same thing whichever surface
  asks … That agreement is a property of there being one statement of the order, not of four
  services being kept in step" (`:10–14`).

The corollary the codebase already applies: **a rule with exactly one caller stays where it is
used.** Nine of the thirteen homeless rules in `2026-09-04-where-the-business-rules-live.md` §B have
one caller and fail clause (b) of that note's four-part benchmark (§D). Extracting them would be
ceremony, and in at least one case a trap the codebase has already refused by name —
`BookingStatus.canStillBeHonoured()` is "deliberately narrow and narrowly named … a
general-sounding predicate would be a trap" (`booking/domain/BookingStatus.java:36–41`). Naming a
rule is not free: a name that reads more general than the rule is worse than an inline condition.

### 2. Purity decides the package; both packages are the rule layer

- **A rule that is pure** — statics or an enum over values; no Spring, no `Clock`, no port, no row
  — goes in **`domain/`**. `RefundPolicy`, `CommissionSplit`, `ReviewGate`, `Stars`, `SalesClose`,
  `AggregateRating`, `PayoutLedgerEntry`.
- **A rule that needs an injected collaborator** — a `Clock`, a port, bound configuration — goes in
  **`application/`**, as a **named holder, separately unit-tested**, never as a condition inlined
  in a service. `BookingCutoff` (a `@Component` over an injected UTC `Clock`,
  `booking/application/BookingCutoff.java:29–37`), `CancellationPolicy` (three ports,
  `booking/application/cancel/CancellationPolicy.java:30–40`), `RequestWindows`,
  `RetentionWindow`, `RefundResubmissionWindow` (plain records the adapter binds from
  configuration, "so the inner hexagon stays framework-light",
  `customer/application/RetentionWindow.java:10–12`).

**Both are the rule layer. The split is packaging, not status.** The evidence that they are one
layer is the test tree: `RefundPolicyTest`, `CommissionSplitTest`, `ReviewGateTest`,
`ReviewWindowTest`, `AggregateRatingTest` and `SalesCloseTest` sit in `src/test/java/**/domain/`;
`BookingCutoffTest`, `CancellationPolicyTermsTest` and `RequestWindowsTest` sit beside them in
`src/test/java/**/application/`. A rule flattened into a procedure cannot be unit-tested apart from
its service; all nine are.

`BookingCutoff` is where the codebase already defends this line in prose. Its one static method
carries a paragraph explaining why it is static while its neighbours are clock-backed: "**Static,
and that is the contract:** it is a pure projection of the caller's own instant onto the Tirane
civil day … An instance method here would read as clock-backed like its neighbour and silently is
not" (`booking/application/BookingCutoff.java:105–108`). That paragraph is this decision applied
one method at a time.

**Consequently `BookingCutoff`, `CancellationPolicy`, `RequestWindows`, `RetentionWindow` and
`RefundResubmissionWindow` do not move.** They need a `Clock` or a port; `application/` is where
this ADR puts such a rule. Their placement was already correct and is now written down.

### 3. A set invariant does not go in the rule layer

A rule spanning **all rows** lives in a **database constraint**, and the application code is
written *against* the constraint rather than in place of it:

| Invariant | Constraint | The code written against it |
|---|---|---|
| #2 — at most one party per `(set, date)` | `set_availability_uniq UNIQUE (set_id, booking_date)` (`V4__availability.sql:32`) | `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING` (`availability/adapter/out/JdbcAvailabilityClaim.java:58–67`) |
| #9 — a booking accrues once, a refund reverses it once | `payout_once_per_booking UNIQUE (booking_id, entry_type)` (`V9__payout_ledger.sql:33`) | the at-least-once `BookingConfirmed` listener, idempotent on that constraint |
| #7 — a booking code is unique | `booking_code_uniq UNIQUE (code)` (`V5__booking_and_customer.sql:43`) | `INSERT … ON CONFLICT (code) DO NOTHING` (`booking/adapter/out/JdbcBookings.java:143`) with bounded regeneration above it (`ReserveSetService.java:128–134`) |

**A Java class asserting one of these would be a weaker restatement**: it would hold only for rows
this application writes, and only when every writer remembers to call it. That is why
`availability` has no `domain/` package and should not have one — its subject is one table with one
constraint (`2026-09-04-where-the-business-rules-live.md` §C).

This does **not** forbid a Java statement that mirrors a DB *bound or vocabulary*. Four such
mirrors exist, each naming its twin in Javadoc and calling the duplication deliberate: `Stars` ↔
`review_stars_check` ("the only one of the two that also holds for a row written by anything but
this application, so the duplication there is deliberate, not drift",
`review/domain/Stars.java:8–10`), `ReviewText` ↔ `review_comment_length_check`, `SalesClose` ↔
`venue_sales_close_check` (`venue/domain/SalesClose.java:10–12`), `BookingStatus` ↔
`booking_status_check` (pinned by `BookingMigrationIT.everyEnumStatusAccepted`). The distinction is
that a bound constrains one row's field and a set invariant constrains the relationship *between*
rows; only the second is beyond Java's reach.

### 4. `domain/` is framework-free, and that is checkable

The reason `domain/` is worth having as a separate package is that its statements survive throwing
away the database, the HTTP API, Stripe and Spring. The property holds today — every `import` in
the 18 files resolves to `java.*` or another module's `vocabulary`/`domain` — but nothing holds it
except human review. It should be a fitness function beside
`PackageShapeArchitectureTests` and `ResponsibilitiesArchitectureTests`: no class under any
module's `domain/` package imports Spring, JDBC or `java.sql`, the Stripe SDK, any `adapter/`
package, or any port/repository interface. It may name the JDK and other modules' `vocabulary/`
and `domain/` types — purity here means no framework and no outside layer, never module isolation.
`DomainPurityArchitectureTests` is that rule; it passed against all 18 files unchanged, and its
negative cases are proven against `ai.riviera.domainpurityfixture`.

### 5. The twelve are **modules**; the platform is one bounded context

`2026-09-04-bounded-context-and-doc-drift-audit.md` §B works the four language tells and none
fires: one *set* in `venue`, `availability`, `booking` and `notification`; one *booking* in
`booking`, `payment`, `payout` and `review`; money is EUR minor units everywhere. The three
duplicated id records are `record X(long value)` converted by identity, each documented as existing
to keep the Modulith graph acyclic (`operator/vocabulary/VenueRef.java:7–14`). The boundaries are
correct **module** boundaries — deep, well-named, one owner per table — and nothing here argues for
removing or merging any of them.

So: **the twelve are modules.** ADR-0007's "bounded context" wording is corrected in that document
by this decision. Where a module's own `package-info` or an ADR uses "bounded context" to say what
something is *not* (`audit`, `challenge`, `shared`), the statement stands — see *Consequences*.

### 6. The aggregate-root vocabulary is dropped, not built out

Against the code, nine of the eleven documented roots have no class
(`2026-09-04-bounded-context-and-doc-drift-audit.md` §G-1): `Venue`, `BeachMap`,
`SetAvailability`, `Booking`, `Payment`, `Customer`, `CustomerAccount`, `Operator`, `Review`.
`availability`, `customer` and `operator` have no `domain/` package at all.

**The resolution is to drop the label, not to build the classes.** This is a service-and-SQL
architecture with `domain/` holding policies, calculations and value objects — which is what
ADR-0007 signed up for when it wrote "DDD (strategic + light tactical)" (`:31`). The tactical
patterns this codebase actually uses are value objects, policies and enums; the aggregate-root
pattern it does not. Building nine mutable roots would mean re-homing rules that the two research
notes find correctly placed, and re-litigating a state machine that Postgres enforces today with
guarded `UPDATE`s.

The two classes that do exist are **immutable value records, not mutable roots with identity and
lifecycle** — the entry carries static factories, the batch is constructed directly — and the docs
should describe them that way:

- `PayoutLedgerEntry` — `record PayoutLedgerEntry(VenueId, long bookingId, EntryType, long
  grossMinor, long commissionMinor, long netMinor, String currency, RefundReason)`
  (`payout/domain/PayoutLedgerEntry.java:17–18`), append-only, with `accrual()` and `reversalOf()`
  factories and a canonical constructor that re-checks the amount invariants the DB also enforces
  (`:20–30`). Its own Javadoc calls it "A value object: immutable, transparent, and the home of the
  commission arithmetic" (`:7–9`).
- `PayoutBatch` — `record PayoutBatch(Long id, VenueId, PeriodKey, long totalNetMinor, String
  currency, BatchStatus)` (`payout/domain/PayoutBatch.java:15–16`), one row per `(venue, period)`,
  `id` null before persistence. Its Javadoc line "Aggregate root: one row per `(venue, period)`"
  (`:8`) is the one residue of the vocabulary left in source and reads against this decision.

Correcting `CLAUDE.md`'s column and `domain-model.md`'s `«aggregate root»` boxes is doc work and
lands with the rest of the §3 drift batch, not here.

## Considered options

**Build the aggregates (rejected).** It is the option the docs describe, so it is the one that
would end the drift by making the docs true. Rejected because it inverts a design the code has held
consistently for the whole tree: the booking state machine is eleven guarded `UPDATE … WHERE status
= …` predicates plus `booking_status_check`, and moving it into a mutable `Booking` root would put
the enforcing statement in Java while the SQL kept enforcing it anyway — two statements where there
is now one authority. It also has no sponsor: no issue, no failing test, no reviewer asking for it.

**Leave the vocabulary and let it mean "the conceptual thing" (rejected).** This is the status quo:
`domain-model.md` §3 documents fields, types and collections that do not exist (§G-3 to §G-7 of the
first note), because a diagram of an aggregate that has no class has nothing to be checked against.
A label that cannot go stale because it was never true is worse than no label.

**Move the five `Clock`/port-needing holders into `domain/`, passing time as a parameter
(rejected).** It would make `domain/` the whole rule layer and simplify §2 to one sentence. But
`BookingCutoff`'s own Javadoc already rules on this trade-off for its one static method (`:105–108`)
and the answer cuts the other way: a rule that reads clock-backed and silently is not is the worse
failure. `CancellationPolicy` resolves set facts and venue rates through two `venue::api` ports; it
is an application service by any reading.

**Extract ranks 4–13 of the second note's §E (rejected).** Those are single-caller rules. The
codebase's own benchmark, derived from `review/domain/` in that note's §D, has "two or more callers
that must agree" as clause (b), and `CommissionSplit`'s Javadoc states the same reason for its
existence ("used by both … so the arithmetic is written once and never diverges",
`payout/domain/CommissionSplit.java:8–10`). Applying the benchmark consistently means leaving them.

**A rule-placement section in `RESPONSIBILITIES.md` instead of an ADR (rejected).** The vocabulary
correction in §5 and §6 changes what other documents say and needs a dated decision to cite;
`RESPONSIBILITIES.md` records settled per-module contracts and would have to cite this reasoning
from somewhere.

## Consequences

**Improves.** "Where does this rule go?" has a written answer with two clauses instead of a
convention reconstructed from Javadoc. New modules generated against these ADRs stop reproducing
the aggregate-root vocabulary. The domain layer gets a stated property (framework-free) that a
fitness function can hold, rather than 18 files that happen to comply.

**Costs and residues.**

- `CLAUDE.md`'s "Aggregate root(s)" column, `domain-model.md`'s ten `«aggregate root»` boxes and
  its §3 diagrams, and `README.md:70`'s "Nine Spring-Modulith bounded contexts" all now disagree
  with an accepted ADR until the doc batch lands.
- `PayoutBatch.java:8` calls itself an aggregate root in Javadoc. Recorded here; a one-line
  correction when that file is next touched.
- The `domain/` purity rule now holds `domain/` to the JDK and published ids, values and rules, so
  a rule that genuinely needs a `Clock` or a port has one place to go: `application/`, per §2.

**ADR-0017's category is unaffected.** It classifies `challenge` and `audit` as *non-context
modules* on the ground that each "owns no aggregate a tourist or operator would name"
(`docs/adr/ADR-0017-non-context-module-for-edge-mechanisms.md:80–83`) — a statement about owning no
domain concept, which stays true and stays useful whether the surrounding twelve are called
contexts or modules. The same holds for ADR-0007 Amendment 2's `shared` and for the `audit`/
`challenge` `package-info` files, which the first note singles out as the one place the repo uses
the strategic-DDD vocabulary correctly (§C). Nothing in §5 asks any of them to change.

**Revisit if:** a second implementor appears for a rule this ADR leaves inline and the two must
agree (clause (b) starts firing on the single-caller rules); or a module grows a genuinely mutable
root with identity and its own invariants, at which point "light tactical" has stopped describing
the tree and the aggregate question is open again on evidence rather than on a label.
