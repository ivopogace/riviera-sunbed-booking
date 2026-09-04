# `venue/application/` branch-by-branch: does the *legitimately thin* verdict stand?

**Status / provenance.** Findings only, no decision. Closes the coverage caveat in
`2026-09-04-where-the-business-rules-live.md` §F, which marked `venue`'s verdict **provisional**
because `VenueAdminService` (314 lines) was read only around its layout guards and never classified
branch-by-branch. Issue #929.

Audited 2026-09-04 against `e115733` (`main`) by reading all 14 branch-carrying files of
`venue/application/` in full, plus `venue/adapter/out/JdbcVenues.java` and
`JdbcVenueCatalog.java` for the predicates they react to, the V2/V12/V39/V43/V44 migrations for the
DB counterparts, and `venue`'s test tree. Method is the parent note's — §B's three-way
classification (ORCHESTRATION / DB-DELEGATED / RULE) and §D's four-clause extractability test. No
code was run; nothing here depends on the parent note's structural verification.

**TL;DR**

- **The verdict stands, and is now firm: `venue` is legitimately thin.** The provisional marker is
  lifted, not replaced with a mixed verdict.
- **13 of 21 rules have a named home**, against `booking`'s 8 of 21 — the best ratio of any module
  with a comparable branch count. `venue` has *six* named rule-holders in `application/`
  (`VenueFieldValidation`, `LayoutCommand`, `SetPlacement`, `PhotoProcessor`,
  `VenueCreationProperties`, and the three private claim predicates) beside its one `domain/` type.
- **Exactly one homeless rule passes all four clauses of §D's test: `priceMinor >= 0`**, stated
  twice — `SetCommand:32` and `RowPriceCommand:20` — in the one module whose shared validator
  exists so *"the two enforce the same invariants from one place — no duplicated validation
  block"*. Three lines, two callers, a DB twin it cites, and one of the two statements untested.
  The single site worth an issue.
- **One near-miss passes three of four:** *a row label names exactly one physical row*, stated at
  `VenueAdminService:240` and again in `LayoutCommand.splitsRowLabel`, whose Javadoc names the
  kinship (*"the batch twin of the rename path's `ROW_NAME_TAKEN` rule"*) without sharing a
  function. It fails (d) for a stated reason: no DB constraint can see it.
- **The remaining six homeless rules fail clause (b)** — one caller each — and by this codebase's
  own standard stay where they are. That is the same disposition nine of `booking`'s thirteen got.
- **No displaced cluster and no absent artefact.** There is nothing here shaped like
  `ViewBookingService.toDetail` (six inline predicates in twenty lines) or like the missing booking
  transition table. `venue`'s branches are dense in `VenueAdminService` but the density is
  concurrency control, not rule.
- **One naming asymmetry, not an extraction:** the claim probe is asked three times, and two of the
  three are named private predicates with rationale (`isLivelyClaimed`,
  `isLivelyClaimedOrEverBooked`) while the third is an inline `||` at `VenueAdminService:290`.
- **Two duplications that cross a seam, both pre-existing findings rather than new ones:** the pool
  token is now stated in **three** modules, not the two §E/D4 recorded; and the layout maxima
  (26 × 40) are stated in Java and again in TypeScript, documented on the frontend side and pinned
  by nothing.

---

## A. Census

`venue/application/` is **52 files, 2,577 lines**. A scan for `if` / `else` / `switch` / `case` /
loops / `try` / ternaries / `Optional` combinators, checked by hand against Javadoc and signature
noise, finds **14 files carrying an executable branch**; the other 38 are records, sealed outcome
hierarchies, view types and port interfaces with none. All 14 were read in full.

| File | Lines | Decision points | Kind |
|---|---|---|---|
| `VenueAdminService.java` | 314 | ~28 | The four beach-map writes + profile edit + two reads |
| `PhotoProcessor.java` | 178 | 12 | The pure image pipeline |
| `LayoutCommand.java` | 124 | 7 | Whole-layout rules on the command record |
| `VenuePhotoService.java` | 108 | 4 | Photo orchestration |
| `VenueFieldValidation.java` | 103 | 11 | The shared field validators |
| `VenueCommissionService.java` | 72 | 1 | The rate change |
| `DailyAvailabilityService.java` | 59 | 1 | The owner's day view |
| `SetCommand.java` | 40 | 6 | Per-set command validation |
| `ListVenueReviewsService.java` | 40 | 1 | Visibility fence + delegate |
| `VenueProfileCommand.java` · `NewVenueCommand.java` · `RowPriceCommand.java` · `VenueCreationProperties.java` | 131 | 1 each | Command residue past the shared validators |
| `SetPlacement.java` | 24 | 5 | `disturbedBy` — which edits harm a claim |

`VenueRatingService`, `OnboardVenueService` and `RowNameCommand` are straight-line: no branch at
all. `VenueRatingService.recompute` is three statements whose *order* carries the invariant, which
is the shape §C found in `operator`.

---

## B. Classification

### ORCHESTRATION — 17 sites

None of these says anything about the business.

- **Existence probe before a conditional write** — `VenueAdminService:68, 103, 117, 140, 195, 223,
  263`; `DailyAvailabilityService:50`. Seven of the eight are `venues.venueExists(venueId)` guarding
  a 404, and `:66–67` states why the probe precedes the write rather than being folded into it:
  *"so that a 0-rows result is unambiguous: here it can only mean the loaded version no longer
  matches (stale tab), never no-such-venue."* That is a diagnosability argument, not a rule.
- **Empty-input short circuit** — `VenueAdminService:96` (`ids.isEmpty() ? List.of() : …`), so no
  `IN ()` predicate reaches Postgres. Throughput, not policy — the parent note's
  `PendingRequestsService:44` pattern.
- **Sealed-outcome dispatch** — `VenuePhotoService:51–57` `switch` over `PhotoProcessingResult`,
  and `VenueAdminService:302, 309`, two exhaustive two-arm `switch`es mapping `Venues.Conflict` onto
  the two rejection vocabularies. Sequencing and translation.
- **Read-model shaping** — `VenuePhotoService:70–81`: pick each slot's PREVIEW variant, then emit
  *every* slot occupied or not so the console renders a stable grid. A presentation choice, argued
  on the port (`VenuePhotoModeration:40–42`), not a rule about venues.
- **Boot-time configuration validation** — `VenueCreationProperties:25` (`null` ⇒ fail the boot
  loudly, because a primitive would silently bind `0` and every new venue would earn nothing).
- **Defensive copies** — `VenueProfileCommand:41`, `LayoutCommand:29`.
- **Fail-loud on the impossible** — `PhotoProcessor:112–114`, which throws if the JPEG the class
  itself just encoded has no readable header.

### DB-DELEGATED — 13 sites

Every one exists to read the result of a guarded statement. The rule is the SQL predicate or the
constraint; the Java only interprets the miss.

- `VenueAdminService:76` — `rows == 0 ? STALE_WRITE : APPLIED`, over
  `UPDATE venue … WHERE id = :id AND version = :version` (`JdbcVenues:399`).
- `VenueAdminService:203, 227, 280` — `lockAndReadSetVersion(venueId) != expectedVersion`, over
  `SELECT set_version … FOR UPDATE` (`JdbcVenues:198`). Three sites, one token: the comparison is in
  Java, but the lock and the read that make it meaningful are the statement's. Optimistic
  concurrency is a consequence, not a choice (§D clause (c)).
- `VenueAdminService:107, 129, 267` — `conflict.isPresent()`, over `JdbcVenues:237–240`, whose two
  `EXISTS` legs mirror `set_position_cell_uniq` (V2) and `set_position_grid_uniq` (V12). The
  constraints are the race-safe enforcement; the pre-check exists to return a precise rejection
  instead of a raw violation.
- `VenueAdminService:122, 144` — `lockSet(...).isEmpty()`, over
  `SELECT … WHERE id = :setId AND venue_id = :venue FOR UPDATE` (`JdbcVenues:219–220`). Note the
  `venue_id` leg: this is where cross-venue set addressing dies, in SQL.
- `VenueAdminService:210, 244` — rows-affected as existence, over the non-destructive
  `UPDATE … WHERE venue_id = :venue AND row_label = :rowLabel` (`JdbcVenues:301, 324`).
- `VenueAdminService:232` — `!labels.contains(command.rowLabel())` over
  `SELECT DISTINCT row_label` (`JdbcVenues:312`).
- `VenueCommissionService:64` — `updated.ifPresent(...)`, over
  `UPDATE venue … RETURNING` (`JdbcVenues:158–159`): the `RETURNING` miss *is* "no such venue", so a
  404 schedules nothing and leaves no orphan row.

Two of `venue`'s rules live wholly in SQL and correctly have no Java statement:

```sql
-- JdbcVenueCatalog.java:360-371 — invariant #9: the effective-dated rate. The latest scheduled
-- rate at or before the service date, falling back to the live column when the venue has never
-- changed rate.
SELECT COALESCE((SELECT commission_bps FROM venue_commission_rate
                  WHERE venue_id = v.id AND effective_from <= :serviceDate
                  ORDER BY effective_from DESC LIMIT 1),
                v.commission_bps) FROM venue v WHERE v.id = :id

-- JdbcVenues.java:127-128 — the schedule's epoch floor, pinned idempotently.
SELECT id, :floor, commission_bps FROM venue WHERE id = :id
ON CONFLICT (venue_id, effective_from) DO NOTHING
```

This is the `availability` shape from the parent note's §C: a Java class here could only restate the
statement less reliably.

### RULE — enumerated

Twenty-one sites. "Home?" asks whether a named rule-holder already states it.

| # | Rule | Site | Home? |
|---|---|---|---|
| V1 | Repooling or repositioning a set harms a claim; repricing and retiering do not | `VenueAdminService:125` → `SetPlacement.disturbedBy:17–22` | ✅ `SetPlacement` |
| V2 | "Still owed this spot", *edit* sense — a live hold or a non-terminal booking | `:125` → `isLivelyClaimed:173–175` | ✅ named private predicate, 5 lines of rationale |
| V3 | "Still owed this spot", *delete* sense — a live hold or a booking of any status | `:147` → `isLivelyClaimedOrEverBooked:185–187` | ✅ named private predicate |
| V4 | A hold is live iff dated today or later in `Europe/Tirane` (#6) | `hasLiveHold:163–164` | ✅ named, `Clock`-backed → `application/` per ADR-0018 §2 |
| V5 | "Still owed", *replace* sense — a live hold on any set, or any booking at the venue | `:290` — `hasLiveHold(existing) \|\| bookings.hasBookings(venueId)` | ❌ **inline** — the one of the three sibling questions with no name |
| V6 | A layout may not be empty | `:257` → `LayoutCommand.isEmpty` | ✅ `LayoutCommand` |
| V7 | A layout is capped at 26 × 40 sets | `:260` → `LayoutCommand.tooLarge` / `MAX_SETS:26` | ✅ `LayoutCommand` — restated in TypeScript, see §D |
| V8 | No two sets in one batch share a row+position or a grid cell; position clashes outrank cell clashes | `:266` → `LayoutCommand.duplicateWithin:46–59` | ✅ `LayoutCommand` (precedence mirrors `JdbcVenues.findConflict`, by comment) |
| V9 | A row label names exactly one physical row | `:240` — `labels.contains(command.newLabel())` **and** `LayoutCommand.splitsRowLabel:68–76` | **Duplicated** — two statements, kinship named, no shared function; see §C |
| V10 | A rename to the label a row already carries succeeds without spending the shared version token | `:235–238` | ❌ inline |
| V11 | A rename of a row that is gone reports the missing row, not the taken label | `:230–234` (statement order) | ❌ ordering |
| V12 | Repricing is permitted on a claimed venue; replacing is not | `repriceRow` — the deliberate *absence* of a claim probe, `:206–208` | ✅ argued on `EditBeachMap#repriceRow` and in `SetPlacement`'s Javadoc |
| V13 | Required text, bounded row label, ISO-4217 currency, booking-mode token, 0..10000 bps, positive-or-absent distance | the four command records | ✅ `VenueFieldValidation` |
| V14 | An unstated sales close is 16:00 | `NewVenueCommand:30` → `SalesClose.DEFAULT` | ✅ `venue/domain/SalesClose` |
| V15 | A set price is integer minor units and never negative (#5) | `SetCommand:32–34` **and** `RowPriceCommand:20–22` | ❌ **duplicated inline**; see §C |
| V16 | A set is in exactly one of two pools (#3); a set is one of two tiers | `SetCommand:17–18, 26–31` | ❌ private `Set<String>` literals; the pool token is re-declared in two other modules |
| V17 | Grid coordinates and position numbers are 1-based | `SetCommand:23–25, 36–38` | ❌ inline |
| V18 | An upload is bounded by bytes, pixel dimensions and megapixels, and must be a real JPEG/PNG/WebP | `PhotoProcessor:64–78` | ✅ `PhotoProcessor`, bound configuration, `PhotoProcessorTest` |
| V19 | A hidden venue has no review list | `ListVenueReviewsService:34` | ✅ `operator.api.VenueVisibility` — the parent note's R3, called from a second module |
| V20 | A rate change takes effect from today's service date, and the superseded rate is pinned at the floor first (#9) | `VenueCommissionService:59–66`, `currentServiceDate:69–71` | **Partial** — no named holder; the ordering is the service's, defended in 12 lines of Javadoc and pinned by `VenueCommissionServiceTest` |
| V21 | A new venue's commission is stamped from platform configuration, never client input | `OnboardVenueService:37` + `VenueCreationProperties` | ✅ `VenueCreationProperties` |

**Score: 13 of 21 rules have a named home; 8 do not** — against `booking`'s 8 of 21. Two of the
eight are single-statement asymmetries (V5, V20), four are single-caller inline conditions
(V10, V11, V16, V17), and two are duplications (V9, V15).

---

## C. §D's four-clause test applied to the eight

Clauses, from the parent note: **(a)** pure — statics or an enum over values, no Spring, no I/O;
**(b)** two or more callers that must agree; **(c)** a choice rather than a consequence;
**(d)** it names its own database counterpart.

| Rule | (a) pure | (b) 2+ callers | (c) a choice | (d) names its DB twin | Verdict |
|---|---|---|---|---|---|
| **V15** price ≥ 0 | ✅ two integer comparisons | ✅ `SetCommand` + `RowPriceCommand` | ✅ a free set is legal, a negative one is not | ✅ `set_position_price_check` (V2:49), cited by both Javadocs | **passes all four** |
| **V9** one label, one row | ✅ set membership over strings | ✅ rename + replace, kinship named in `LayoutCommand:64–66` | ✅ case is deliberately kept significant | ❌ stated reason: *"no DB constraint can see it"* | **three of four** |
| V17 1-based coordinates | ✅ | ❌ one caller | ✅ | ✅ `set_position_grid_x_check` / `_grid_y_check` / `set_position_no_check` (V12:23–25) | fails (b) |
| V16 pool/tier vocabulary | ✅ | ❌ one *validator*; the **token** has three declarations (§D) | ✅ | ✅ `set_position_pool_check` / `_tier_check` (V2:46–47) | fails (b) as a rule |
| V5 replace-time claim probe | ❌ two ports + a `Clock` | ❌ one caller | ✅ | ❌ | fails (b) |
| V20 rate effective today | ❌ needs a `Clock` | ❌ one caller | ✅ today rather than tomorrow is argued, not forced | ❌ | fails (b) |
| V10 no-op rename | ✅ | ❌ one caller | ✅ | ❌ | fails (b) |
| V11 rejection precedence | ✅ | ❌ one caller | ✅ | ❌ | fails (b) |

### V15 — the one site that passes every clause

```java
// SetCommand.java:32-34
if (priceMinor < 0) {
    throw new IllegalArgumentException("priceMinor must be >= 0");
}

// RowPriceCommand.java:20-22
if (priceMinor < 0) {
    throw new IllegalArgumentException("priceMinor must be >= 0");
}
```

Both records reach `VenueFieldValidation` for every *other* shared bound in the same constructor —
`strip`, `requireText`, `requireIsoCurrency` — and both name the same DB twin: `RowPriceCommand:9`
cites *"the V2 `price_minor >= 0` CHECK"* outright, `SetCommand:8–11` the V2/V12/V43 CHECKs
collectively. The validator's own opening line is the argument against this pair
existing: it is *"used by both
{@link NewVenueCommand} and {@link VenueProfileCommand} so the two command records enforce the same
invariants from one place — no duplicated validation block."* The money bound is the one field
where that did not happen.

The test tree shows the cost already: `RowPriceCommandTest.rejectsNegativePrice` exists;
`SetCommandTest` has no negative-price case at all — five tests, all about the row label. One of the
two statements of the rule is untested.

This is small (three lines, one obvious `requireNonNegativeMinor(long, String)` beside
`requireCommissionBps`) and it is exactly what §D's test is for. It is the only thing in
`venue/application/` this pass would put to the benchmark.

### V9 — the near-miss, and why it is not the same case

`LayoutCommand`'s Javadoc names the relationship itself:

```java
// LayoutCommand.java:64-66
 * Whether one {@code rowLabel} appears under two distinct {@code gridY} values … The batch twin of
 * the rename path's {@code ROW_NAME_TAKEN} rule; not a {@link Venues.Conflict} because no DB
 * constraint can see it (gap-cell numbering keeps every (row_label, position_no) pair unique).
```

Two statements of *a label names exactly one physical row*, asked from two directions — the rename
path asks "is this label already taken?", the replace path asks "does this label span two grid
rows?". They are the same rule and the code knows it. But they are not the same *question*: one
takes a label and a stored label set, the other takes a batch; a shared function would have to be
one of the two shapes with the other adapting to it. Clause (d) fails for a written-down reason, and
clause (b) is satisfied only in the sense that the two agree by construction rather than by call.
Reported, not recommended — the parent note's rank-4-and-below disposition.

### V5 — a naming asymmetry, not a displaced rule

The claim probe is asked three times, at three grains, and two of the three are named:

| Question | Site | Named? |
|---|---|---|
| May this set be **edited**? | `isLivelyClaimed:173–175` | ✅ private predicate, Javadoc: *"an UPDATE of pool or coordinates strands only a guest who is still coming"* |
| May this set be **deleted**? | `isLivelyClaimedOrEverBooked:185–187` | ✅ private predicate, Javadoc: *"the RESTRICT booking.set_id FK makes a set carrying any booking undeletable"* |
| May this **whole map** be replaced? | `VenueAdminService:290` | ❌ an inline `hasLiveHold(existing) \|\| bookings.hasBookings(venueId)` |

The third is a real question with a real answer — venue-scoped rather than set-scoped on the booking
arm — and it is the only one a reader has to reconstruct from an expression. It fails clause (b) with
one caller, so by the codebase's own standard it stays; the observation is that its two siblings
*also* have one caller each and were named anyway. Whichever convention is right, `venue` currently
applies both.

---

## D. Duplications crossing a seam

Neither is new; both change a figure the parent note recorded.

### The pool token is stated in **three** modules, not two

§E/D4 recorded two: `ReserveSetService:48` and `JdbcAvailabilityClaim:37`, each with its own
`private static final String ONLINE_POOL = "ONLINE"`. The third is in the module that **owns** the
concept:

```java
// venue/application/SetCommand.java:17-18
private static final Set<String> TIERS = Set.of("PREMIUM", "STANDARD");
private static final Set<String> POOLS = Set.of("ONLINE", "WALK_IN");
```

The sharpest form of the finding is internal to `venue`. Its sibling field went the other way, and
the Javadoc says why:

```java
// VenueFieldValidation.java:23-26
 * The booking-mode tokens accepted on the wire — derived from the {@link BookingMode} enum (whose
 * names are the same tokens the venue_booking_mode_check CHECK stores), so the validator, the enum,
 * and the CHECK stay in one source of truth: a new mode added to the enum is accepted here too.
```

`venue/vocabulary/` publishes a typed `BookingMode`, `Amenity`, `PhotoSlot` and `PhotoSurface`, and
`venue/api/SetBookingFacts:24` still hands `booking` a bare `String` pool token with the two legal
values written out in prose. There is no `Pool` type. This belongs to R1/D4's issue, not to a new
one — but the count there should read three.

### The layout maxima are stated in Java and again in TypeScript

`LayoutCommand.MAX_SETS = 26 * 40` (`:26`, *"the design caps generation at 26 rows × 40
positions"*) and, across the wire:

```typescript
// frontend/src/app/operator/beach-cell.ts:8-10
/** The layout maxima the server enforces, published once so no grid clamps differently. */
export const MAX_ROWS = 26;
export const MAX_COLS = 40;
```

The frontend states the intent correctly — the server enforces, the client clamps — and
`beach-cell.spec.ts:146` pins `MAX_ROWS` to 26 against itself. Nothing pins either figure against
the backend's. The shapes also differ: the server's bound is the *product*, so a 1 × 1040 layout
passes `tooLarge()` and no client can generate one. Low risk (drift shows as a client that clamps
tighter or looser than a server that still refuses correctly), and unlike the parent note's D1 it is
not a rule re-derived — it is a bound restated. Recorded for completeness; §E's frontend sweep found
only the refund arithmetic, and this is the second answer to the same question.

Two smaller Java↔SQL parities, both by comment and neither pinned: `duplicateWithin`'s precedence
*"position clashes take priority over cell clashes (mirroring `JdbcVenues.findConflict`)"*
(`LayoutCommand:42–43` ↔ `JdbcVenues:237–240`), and `VenueFieldValidation.MAX_ROW_LABEL_LENGTH`
↔ `set_position_row_label_check` (V43:16) ↔ `layout-editor.html:159`'s `maxlength="40"`. Both are
the *deliberate, documented* Java↔SQL shape the parent note listed as the model, one step short of
`Stars`, which names its constraint.

---

## E. The test tree

The parent note's decisive corroboration was that a rule flattened into a procedure cannot be
unit-tested apart from its service. `venue`'s holders are all reachable, though two are exercised
through their callers rather than by a dedicated class — the `Stars` / `ReviewText` status:

| Holder | Test |
|---|---|
| `SalesClose` (`domain/`) | `SalesCloseTest` |
| `PhotoProcessor` | `PhotoProcessorTest` |
| `VenueCreationProperties` | `VenueCreationPropertiesTest` |
| `VenueFieldValidation` | through its callers — `VenueProfileCommandTest`, `SetCommandTest`, `RowNameCommandTest`, `RowPriceCommandTest`, `VenueCreationPropertiesTest` |
| `LayoutCommand`, `SetPlacement`, the three claim predicates | through `VenueAdminServiceTest` (63 tests), including `everyPlacementFieldOnItsOwnDisturbsAClaimedSet`, `removeSetAsksTheSetScopedBookingQuestionNotTheVenueScopedOne`, `editSetIsAllowedWhenTheOnlyBookingIsTerminalAndTheOnlyHoldIsPast`, `rejectsALayoutSharingOneLabelAcrossTwoGridRows`, `duplicatePositionOutranksTheSplitLabel` |
| V20's ordering | `VenueCommissionServiceTest.thePreviousRateIsPinnedBeforeTheLiveColumnMoves`, `.todayIsReckonedInTiraneNotUtc` |

Every rule in the table above is named by at least one test that would fail if it changed —
**except** `SetCommand`'s half of V15, which has none.

---

## F. Verdict

**`venue` is legitimately thin. The provisional marker lifts; the verdict is firm and unchanged.**

What the parent note established from a partial read holds under the full one: `VenueFieldValidation`
is a genuine shared rule-holder that names its DB counterparts, and the layout guards are named
predicates with rationale. The full pass adds four holders it had not seen — `LayoutCommand`,
`SetPlacement`, `PhotoProcessor`, `VenueCreationProperties` — which is why the ratio comes out at
13 of 21 rather than `booking`'s 8 of 21.

`VenueAdminService`'s 28 branches are the reason the caveat existed, and they turn out to be mostly
not rule at all: seven existence probes, six optimistic-concurrency and rows-affected reads, three
conflict reactions, two exhaustive mapping `switch`es. The density is concurrency control — the
`set_version` token, the `FOR UPDATE` ordering, the lock-before-probe discipline — and every one of
those branches reacts to a statement rather than deciding anything.

There is no `ViewBookingService.toDetail` here and no missing transition table. The one site that
clears §D's bar is a three-line duplicate of an integer bound; the one near-miss is a rule the code
already names as a pair and explains why it did not merge.

**Follow-up worth an issue:** V15 only — fold `priceMinor >= 0` into `VenueFieldValidation` beside
`requireCommissionBps`, and give `SetCommandTest` the negative-price case it lacks. V9, V5 and V20
are recorded here and left alone: single-caller or explained, the disposition nine of `booking`'s
thirteen homeless rules got. The pool-token count belongs to R1/D4's issue, corrected from two
statements to three.

---

## G. Open questions the code cannot answer

1. **Is the claim probe meant to be named at every grain, or only where it is reused?** Two of the
   three are named private predicates with one caller each; the third is inline with one caller.
   Nothing says which is the convention.
2. **Why did the money bound not go into `VenueFieldValidation` when every other shared field bound
   did?** The validator predates `RowPriceCommand` (O4, #174), so the likeliest answer is sequence
   rather than intent — but no comment records a decision either way.
3. **Should `pool` be a typed `Pool` in `venue/vocabulary/`?** `venue` owns the concept, publishes
   typed vocabulary for `BookingMode`/`Amenity`/`PhotoSlot`, and hands the pool across two module
   boundaries as a bare `String`. Whether that was considered and rejected — the token is a DB
   value the claim compares in SQL — is not written down anywhere in the three modules that declare
   it.
4. **Is the frontend's copy of the layout maxima meant to be pinned?** Its comment says *"the layout
   maxima the server enforces, published once so no grid clamps differently"*, which asserts the
   agreement across the wire without any test holding it.
