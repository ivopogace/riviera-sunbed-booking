# Fold `priceMinor >= 0` into `VenueFieldValidation` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The non-negative money bound on a set price is stated once, in
`VenueFieldValidation`, called by both `SetCommand` and `RowPriceCommand`, and verified for
both callers — closing the untested second statement in `SetCommandTest`.

**Architecture:** Rule V15 is the one rule in `venue/application/` that passes all four
clauses of the extractability test, and ADR-0018 §1's "two or more callers that must agree"
is exactly what it has. The bound stays an **application-layer** validator beside
`requireCommissionBps` — not `domain/` — because it is an edge guard on a wire value whose
race-safe backstop is the V2 `set_position_price_check` CHECK, which this slice does not touch.

**Persistence:** JDBC only (invariant #1). No tables and no migration touched — the V2
`price_minor >= 0` CHECK stays the backstop and keeps its Javadoc citations.

**Source of intent:** GitHub issue #932 (from
`docs/research/2026-09-04-venue-application-branch-classification.md` §C, rule V15)

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed both
inline throws still exist verbatim, that these are the tree's only two `priceMinor < 0`
sites, and that the three open PRs #940/#943/#944 are docs-only with no overlap) ·
`riviera-plan-doc` (this template — forced the money and beach-map sections to be filled
rather than waved off as N/A on a "small refactor") · `tdd` (characterization test first:
the missing `SetCommandTest` case is written and seen **green** against the inline throw,
then the refactor happens under it — a behavior-preserving refactor has no honest red) ·
`riviera-review-overlay` (review gate — ran at ready-for-review on PR #948 alongside `/code-review` at **high** effort, money in scope; contributed the RV-PROC/RV-STYLE items that caught F-1) · `riviera-docs-freshness`
(N/A — no substrate doc states the shape of this validator; `RESPONSIBILITIES.md` §`venue`
and ADR-0018 describe the rule layer, not this method list) · `riviera-java-conventions`
(§6a name-the-literal and §6d Javadoc-as-contract: the new method's Javadoc names its DB
twin in one line and carries no issue number) · `riviera-modulith` (ADR-0018 §1 two-caller
rule earns the extraction; `application/` not `domain/` because the twin is a DB bound) ·
`riviera-local-debug` (scoped `--tests "*SetCommandTest*"` runs, never the bare `test` task)

**Branch:** `claude/sdlc-928-4egivt` — the cloud session's designated remote branch stands in
for `feature/venue-price-bound-in-field-validation`; restarted from `origin/main` at
`9cc5eb4c` because its previous PR (#939) had already merged.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a set placement with a negative `priceMinor`, when the command is
  constructed, then it is rejected at the application boundary with
  `IllegalArgumentException` (→ `400 INVALID_REQUEST`, §6b) and no set reaches persistence.
  *Seam:* `venue.application.SetCommand`'s canonical constructor — the validated-intent
  boundary `EditBeachMap#addSet`/`#editSet` consume · *Pinned by:*
  `SetCommandTest.rejectsANegativePrice`
- [x] **AC-2:** Given a set placement priced at zero minor units, when the command is
  constructed, then it is accepted — the bound is `>= 0`, not `> 0`, matching the V2 CHECK.
  *Seam:* as AC-1 · *Pinned by:* `SetCommandTest.acceptsAZeroPrice`
- [x] **AC-3:** Given a row reprice with a negative `priceMinor`, when the command is
  constructed, then it is still rejected — the refactor preserves the existing behavior and
  message. *Seam:* `venue.application.RowPriceCommand`'s canonical constructor, the boundary
  `Venues#repriceRow` consumes · *Pinned by:* `RowPriceCommandTest.rejectsNegativePrice`
  (existing, must stay green unmodified)
- [x] **AC-4:** Given the `venue/application/` package, when searched for an inline
  `priceMinor < 0` throw, then none remains — the bound is stated once, in
  `VenueFieldValidation`. *Seam:* the package source itself · *Verified by:* the grep in
  *Acceptance-criteria verification*, not a test (a "no such code" claim is not a unit test).

## Non-goals

- **No validation-layer refactor.** V9, V5 and V20 were classified and deliberately left in
  place by #929; touching them here reopens settled ground.
- **The pool/tier token (V16)** belongs to #927.
- **No migration.** `set_position_price_check` is untouched; this changes no DB behavior.
- **No error-contract change.** The exception type and message stay byte-identical, so the
  wire response for a negative price is unchanged.
- No widening of the new validator to other money fields (commission bps already has its own).

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces two inline guards with one shared call — a behavior-preserving refactor,
so the ledger applies and is short.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `SetCommand` rejects `priceMinor < 0` with `IllegalArgumentException("priceMinor must be >= 0")` | preserved | `VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor")` throws the same type with the same message, composed as `field + " must be >= 0"` |
| `RowPriceCommand` rejects `priceMinor < 0` with the same type + message | preserved | same call, same field name argument |
| Both accept `priceMinor == 0` | preserved | the bound stays `< 0`, not `<= 0` |
| Validation order within each constructor (label → … → price → currency) | preserved | the call sits exactly where the inline block sat, so the first-failing field is unchanged |
| Javadoc citations of the V2/V12/V43 CHECKs on both records | preserved | left in place verbatim, per the issue's "Keep the DB-twin citations" |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The refactor silently changes the exception message, altering a `400` body clients may key on | low | med | Message composed as `field + " must be >= 0"` with both callers passing `"priceMinor"` — byte-identical; parity ledger row 1 + both tests assert the throw | claude | closed — message identical in the diff |
| R-2 | Validation *order* shifts, so a request bad in two fields reports a different field first | low | low | The call replaces the block in place, not hoisted to the top of the constructor; parity ledger row 4 | claude | closed — diff shows an in-place substitution |
| R-3 | A third caller of the money bound exists and is missed, leaving the rule stated twice anyway | low | med | `grep -rn "priceMinor < 0"` over `platform/src` at plan time returned exactly the two known sites; re-run in AC-4 | claude | closed — AC-4 grep clean; generalization audit widened the sweep to every `*Minor` bound |
| R-4 | Money bound weakened to `<= 0` (rejecting free rows) while touching it — invariant #5 says non-negative, not positive | low | high | AC-2 pins zero as accepted on `SetCommand`; `RowPriceCommandTest.acceptsZeroPrice` already pins it on the sibling | claude | closed — both zero cases green |
| R-5 | Merge conflict with an in-flight PR over `venue/application/` | low | low | Intake gate checked #940/#943/#944 — all docs/Javadoc, no overlap; no Flyway version claimed by this slice | claude | open — re-check at merge |

## Open questions / Assumptions

None outstanding.

### Resolved

- **Assumption:** `SetCommandTest`'s new cases belong in that class rather than a new one —
  confirmed in phase 0: the class already pins `SetCommand`'s constructor bounds, and its type
  Javadoc was widened from "the row-label bound" to "the edge bounds" to match.

## Availability & concurrency (invariant #2)

Not a bare N/A: `SetCommand` is the beach-map set-placement command, and the beach map is
named in this section's trigger list.

- **Write paths to `availability(set_id, booking_date)`:** none in scope. `SetCommand` writes
  `set_position` via `EditBeachMap#addSet`/`#editSet` → `JdbcVenues`; `RowPriceCommand` writes
  `set_position.price_minor` via `Venues#repriceRow`. Neither touches `set_availability`.
- **Uniqueness guarantee:** unchanged — this slice adds no row and no claim.
- **Concurrency strategy:** unchanged. The validator is a pure, stateless bound check on a
  wire value; it introduces no read-modify-write and holds no state between calls.
- **Pool rule (invariant #3):** unchanged — `SetCommand`'s `POOLS` check is untouched.
- **Cutoff rule (invariant #4):** N/A — no sales-close or date arithmetic in scope.
- **Pinning test:** none added. No concurrency test is owed because no write path, no claim
  and no shared state changes; the existing beach-map ITs stay green as the regression net.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | none changed (`set_position` write paths untouched) | `venue` Job: owns the beach map and **pricing**; the bound guards a venue-owned price field |

**Cross-module named interfaces (`api/` ports)** — N/A: nothing published. `VenueFieldValidation`
is package-private and static-only, and both callers are records in the same package. No
`allowedDependencies` change; no new import crosses a module boundary.

**Domain events (id-based payloads, invariant #11)** — N/A: no event published, subscribed or moved.

### Module ownership (§4a)

All in `venue`, no boundary change.

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| "state the non-negative bound on a set price once" | `venue` | `venue` Job: owns venue **pricing** and the beach map; the value never leaves the module, and no other module's Not-My-Job list claims it (`payment` owns charging an amount, not bounding a catalogue price) |

## Payment & payout (invariants #5, #8, #9, #10)

No money **moves**, but the slice is squarely about money's representation, so this is not
an N/A.

- **Model:** unchanged — collect-only via Stripe, no Connect; nothing in this slice touches
  the charge, refund or payout path.
- **Confirmation trigger:** unchanged (webhook, not redirect).
- **Idempotency:** N/A — no charge or refund issued.
- **Money:** the point of the slice. `priceMinor` stays a `long` of **integer minor units**
  paired with an ISO-4217 `priceCurrency` (invariant #5, never a float), and the bound stays
  **non-negative** — zero is a legal free row, so the guard is `< 0` and AC-2 pins that.
- **Payout-ledger effect:** none — `payout_ledger_entry` is untouched; a set's catalogue price
  is not an accrual.
- **Refund policy applied:** N/A — no cancellation or refund path in scope.
- **Pinning tests:** `SetCommandTest` (new negative + zero cases), `RowPriceCommandTest`
  (existing negative + zero cases, unmodified).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. The exception type and message are preserved byte-for-byte, so the
`400 INVALID_REQUEST` body for a negative price is identical before and after.

## Execution status

**Stage pointer:** `review gate — ran high on PR #948, findings F-1/F-2 fixed, F-3 deferred; next is CI + Sonar gate`

**Next action:** Confirm CI green on the review-fix push, then pull the SonarCloud new-issue
list for PR #948 and clear every entry before merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Pin the bound for both callers, then state it once | ✅ | `ee9e7d8c` |
| 1 — Review-gate fixes (F-1, F-2) | ✅ | `b01d1c0d` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (code-review high + overlay, reviewer #5) | **Major.** The `VenueFieldValidation` class Javadoc this PR rewrote enumerates its callers, and the rewrite was still incomplete: 7 records call the class (`SetCommand`, `RowPriceCommand`, `RowNameCommand`, `NewVenueCommand`, `VenueProfileCommand`, `CommissionRateCommand`, `VenueCreationProperties`), the sentence named 4. Verified independently with `grep -rln "VenueFieldValidation\." --include=*.java platform/src/main`. | fixed-in-`b01d1c0d` — the enumeration is **removed**, not extended: a caller roster in a shared validator's Javadoc had already gone stale once before this PR touched it, and §6d asks for the contract, not provenance. |
| F-2 | review gate (reviewer #1) | **Minor.** The rewritten class Javadoc ran 7 lines against §6d's ~6-line type budget. | fixed-in-`b01d1c0d` — same edit; the block is back to 5 content lines. |
| F-3 | review gate (reviewer #5) | **Minor, pre-existing, out of scope.** `SetCommand.java:12` cites "invariant #12" for 1-based grid coordinates, but invariant #12 is *"Schema changes go through Flyway"* — it conflates the invariant with **migration** V12, which does add those CHECKs. Verified against `CLAUDE.md:161`. On a line this PR does not modify. | deferred → follow-up issue (below); fixing it here would widen a slice #932 scoped shut, and it is a substrate-citation error worth its own diff |

---

## File structure

- `docs/plans/venue-price-bound-in-field-validation.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueFieldValidation.java` — gains `requireNonNegativeMinor`
- `platform/src/main/java/ai/riviera/platform/venue/application/SetCommand.java` — inline throw → the shared call
- `platform/src/main/java/ai/riviera/platform/venue/application/RowPriceCommand.java` — inline throw → the shared call
- `platform/src/test/java/ai/riviera/platform/venue/application/SetCommandTest.java` — gains the negative + zero price cases

---

## Phase 0 — Pin the bound for both callers, then state it once

**Files:** Modify `VenueFieldValidation.java` · `SetCommand.java:32-34` ·
`RowPriceCommand.java:20-22` · Test `SetCommandTest.java`

- [x] **Step 1: Write the characterization test** — the coverage gap the issue is really about

```java
	@Test
	void acceptsAZeroPrice() {
		// Zero is a legitimate price (a free row); the CHECK constraint is price_minor >= 0.
		assertEquals(0, new SetCommand("A", 1, "PREMIUM", "ONLINE", 0, "EUR", 1, 1).priceMinor());
	}

	@Test
	void rejectsANegativePrice() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetCommand("A", 1, "PREMIUM", "ONLINE", -1, "EUR", 1, 1));
	}
```

- [x] **Step 2: Run it, verify it PASSES against the inline throw** —
  `gradle --no-daemon --console=plain test --tests "*SetCommandTest*"` → PASS.
  This is deliberate and is the one honest deviation from red-green: the behavior already
  exists and is correct, it is merely **unverified**. Red would require breaking the guard
  first. The test earns its keep by being the net the refactor moves under — a red here would
  mean the issue's premise (the rule is stated, just untested) was wrong, and the slice would
  stop and re-plan.

- [x] **Step 3: State the bound once, and call it from both records**

```java
	/**
	 * Non-negative money bound on a minor-units amount (invariant #5) — zero is legal (a free
	 * row), so the bound is {@code >= 0}, mirroring the V2 {@code set_position_price_check} CHECK
	 * that remains the race-safe backstop.
	 */
	static void requireNonNegativeMinor(long amountMinor, String field) {
		if (amountMinor < 0) {
			throw new IllegalArgumentException(field + " must be >= 0");
		}
	}
```

In `SetCommand` and `RowPriceCommand`, the three-line block becomes:

```java
		VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor");
```

- [x] **Step 4: Run both command tests, verify they still pass** —
  `gradle --no-daemon --console=plain test --tests "*SetCommandTest*" --tests "*RowPriceCommandTest*"`
  → PASS, then the touched package: `--tests "ai.riviera.platform.venue.*"`.

- [x] **Step 5: Generalization-audit pass** — the mechanism is "a money bound stated inline in
  a `venue/application/` command record"; enumerate and record below.

- [x] **Step 6: Commit** — `git commit -m "Fold the non-negative price bound into VenueFieldValidation (#932)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-04 | phase 0 — extracting the shared money bound | A minor-units money bound asserted **inline** rather than through a named validator, anywhere in the backend. Enumerated by mechanism (a comparison of a `*Minor` value against `0`), not by resemblance to the two known sites. | `grep -rnE '[A-Za-z]*[Mm]inor\s*(<\|<=\|>\|>=)\s*0' --include=*.java platform/src/main` and `grep -rn 'must be >= 0' --include=*.java platform/src/main` | 5 hits → the 2 in scope, plus `payment/vocabulary/Money.java:11`, `payout/domain/PayoutLedgerEntry.java:24`, `booking/application/cancel/CancelBookingService.java:122` | Fixed the 2 in scope. The other 3 stay: `CancelBookingService` is a refund-**tier** decision, not a bound (not a population member on inspection); `Money` and `PayoutLedgerEntry` are single-site canonical-constructor guards, which ADR-0018 §1 leaves where they are used — and sharing one validator across `venue`/`payment`/`payout` would breach invariant #11. Adopting `payment.vocabulary.Money` for venue's `priceMinor` is a cross-module coupling change #929's classification pass did not ask for; deliberately not opened here. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2:** `gradle --no-daemon --console=plain test --tests "*SetCommandTest*"` → PASS (7 tests, 0 failures). Verified at commit `ee9e7d8c`.
- [x] **AC-3:** `gradle --no-daemon --console=plain test --tests "*RowPriceCommandTest*"` → PASS (5 tests), and `RowPriceCommandTest.java` is absent from the diff. Verified at commit `ee9e7d8c`.
- [x] **AC-4:** `grep -rn "priceMinor < 0" platform/src/main` → no matches. Verified at commit `ee9e7d8c`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; no write path or claim changes, so no concurrency test is owed (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — both untouched.
- [ ] **Modulith** section filled; no cross-module import added; nothing published (invariant #11).
- [ ] **Payment/payout** section filled; money stays integer minor units and the bound stays non-negative (invariant #5).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — no time in scope.
- [ ] Booking codes unguessable (invariant #7) — none in scope.
- [ ] No schema change, so no Flyway migration is owed (invariant #12); the V2 CHECK stays the backstop.
- [ ] **Frontend** N/A — backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
