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
`riviera-review-overlay` (review gate — at ready-for-review) · `riviera-docs-freshness`
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

- [ ] **AC-1:** Given a set placement with a negative `priceMinor`, when the command is
  constructed, then it is rejected at the application boundary with
  `IllegalArgumentException` (→ `400 INVALID_REQUEST`, §6b) and no set reaches persistence.
  *Seam:* `venue.application.SetCommand`'s canonical constructor — the validated-intent
  boundary `EditBeachMap#addSet`/`#editSet` consume · *Pinned by:*
  `SetCommandTest.rejectsANegativePrice`
- [ ] **AC-2:** Given a set placement priced at zero minor units, when the command is
  constructed, then it is accepted — the bound is `>= 0`, not `> 0`, matching the V2 CHECK.
  *Seam:* as AC-1 · *Pinned by:* `SetCommandTest.acceptsAZeroPrice`
- [ ] **AC-3:** Given a row reprice with a negative `priceMinor`, when the command is
  constructed, then it is still rejected — the refactor preserves the existing behavior and
  message. *Seam:* `venue.application.RowPriceCommand`'s canonical constructor, the boundary
  `Venues#repriceRow` consumes · *Pinned by:* `RowPriceCommandTest.rejectsNegativePrice`
  (existing, must stay green unmodified)
- [ ] **AC-4:** Given the `venue/application/` package, when searched for an inline
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
| R-1 | The refactor silently changes the exception message, altering a `400` body clients may key on | low | med | Message composed as `field + " must be >= 0"` with both callers passing `"priceMinor"` — byte-identical; parity ledger row 1 + both tests assert the throw | claude | open |
| R-2 | Validation *order* shifts, so a request bad in two fields reports a different field first | low | low | The call replaces the block in place, not hoisted to the top of the constructor; parity ledger row 4 | claude | open |
| R-3 | A third caller of the money bound exists and is missed, leaving the rule stated twice anyway | low | med | `grep -rn "priceMinor < 0"` over `platform/src` at plan time returned exactly the two known sites; re-run in AC-4 | claude | open |
| R-4 | Money bound weakened to `<= 0` (rejecting free rows) while touching it — invariant #5 says non-negative, not positive | low | high | AC-2 pins zero as accepted on `SetCommand`; `RowPriceCommandTest.acceptsZeroPrice` already pins it on the sibling | claude | open |
| R-5 | Merge conflict with an in-flight PR over `venue/application/` | low | low | Intake gate checked #940/#943/#944 — all docs/Javadoc, no overlap; no Flyway version claimed by this slice | claude | open |

## Open questions / Assumptions

- **Assumption:** `SetCommandTest`'s new cases belong in that class rather than a new one —
  the class is already the pin for `SetCommand`'s constructor bounds. — *Owner:* claude ·
  *Resolves by:* phase 0 (settled by the file itself; no product decision involved)

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

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** Phase 0 step 1 — add the two `SetCommandTest` cases and run them green
against the *existing* inline throw (characterization), before touching any production code.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Pin the bound for both callers, then state it once | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

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

- [ ] **Step 1: Write the characterization test** — the coverage gap the issue is really about

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

- [ ] **Step 2: Run it, verify it PASSES against the inline throw** —
  `gradle --no-daemon --console=plain test --tests "*SetCommandTest*"` → PASS.
  This is deliberate and is the one honest deviation from red-green: the behavior already
  exists and is correct, it is merely **unverified**. Red would require breaking the guard
  first. The test earns its keep by being the net the refactor moves under — a red here would
  mean the issue's premise (the rule is stated, just untested) was wrong, and the slice would
  stop and re-plan.

- [ ] **Step 3: State the bound once, and call it from both records**

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

- [ ] **Step 4: Run both command tests, verify they still pass** —
  `gradle --no-daemon --console=plain test --tests "*SetCommandTest*" --tests "*RowPriceCommandTest*"`
  → PASS, then the touched package: `--tests "ai.riviera.platform.venue.*"`.

- [ ] **Step 5: Generalization-audit pass** — the mechanism is "a money bound stated inline in
  a `venue/application/` command record"; enumerate and record below.

- [ ] **Step 6: Commit** — `git commit -m "Fold the non-negative price bound into VenueFieldValidation (#932)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 / AC-2:** `gradle --no-daemon --console=plain test --tests "*SetCommandTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** `gradle --no-daemon --console=plain test --tests "*RowPriceCommandTest*"` → PASS, file unmodified in the diff. Verified at commit `<sha>`.
- [ ] **AC-4:** `grep -rn "priceMinor < 0" platform/src/main` → no matches. Verified at commit `<sha>`.

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
