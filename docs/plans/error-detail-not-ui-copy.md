# Error `detail` Is Not UI Copy Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `VenueAdminController` shipping operator-facing prose in the RFC-7807 `detail` for
`SET_IN_USE` and `LAYOUT_IN_USE` — the console renders its own copy from the `code` and never reads
`detail`, so the two sentences are a hand-synced duplicate that has already drifted once.

**Architecture:** Issue #610's option (1) — the server keeps the stable machine `code` and `detail`
becomes a short technical statement. The one significant decision is **how short**: the maintainer
declined having `detail` state the *real reason* a write is refused ("this logic will also change in
the future"), so the new strings are **arm-agnostic** — they name the condition class, not which
guard arm fired. That is what makes them survive #609's pending change to the guards, and it is the
property the ITs pin by asserting the *same* string across the hold arm, the terminal-booking arm and
the edit guard.

**Persistence:** JDBC only (invariant #1). N/A — no table, migration or query touched.

**Source of intent:** GitHub issue #610, itself deferred from #607's review gate (PR #608, finding
F-4).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill found three
more strings of the same class that the issue never spotted: the `STALE_WRITE` trio duplicates the
console's three stale-write banners; the maintainer held scope at the two filed codes) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what turned "no
user-visible change" from a claim into a checked row) · `tdd` (red-green on the two ITs: the `$.detail`
assertions fail against the old prose before the controller changes) · `riviera-review-overlay`
(review gate — <when it ran>) · `riviera-docs-freshness` (<ran/N/A>) · `riviera-java-conventions`
(§6b is the contract being amended; **§6d** kept the new `ApiProblem` javadoc free of an issue number
and pushed the rationale into the skill reference instead) · `riviera-local-debug` (scoped build/test
recipe for the two Testcontainers ITs).

> `riviera-modulith` was **not** loaded, against the routing table's backend-Java row. The diff
> creates no class, moves none, and touches no published surface (`api`/`spi`/`events`/`vocabulary`)
> — two string literals in an existing `adapter/in` controller and a javadoc line in `shared`. There
> is no placement decision for it to own. Flagged rather than silently skipped; same call, and same
> reasoning, as #607's `playwright-cli` note.

**Branch:** `claude/sdlc-610-msve9z` — the cloud session's designated remote branch, standing in for
`bugfix/error-detail-not-ui-copy` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a per-set write refused by the in-use guard, when the server answers `409
  SET_IN_USE`, then `detail` is the same arm-agnostic sentence whichever arm fired — a future-dated
  staff hold, a terminal booking, or the edit guard's lively claim. *Pinned by:*
  `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409`,
  `VenueAdminControllerIT.removeSetOnABookedSetAnswers409NotAServerError`,
  `VenueAdminControllerIT.editSetKeepsAClaimedSetInItsPoolButStillTakesAPriceChange`.
- [ ] **AC-2:** Given a bulk layout replace refused by the venue-wide guard, when the server answers
  `409 LAYOUT_IN_USE`, then `detail` is the matching arm-agnostic sentence whichever arm fired — a
  booking or a future-dated walk-in hold. *Pinned by:* `BeachMapReplaceIT.rejectsWhenVenueHasBooking`,
  `BeachMapReplaceIT.rejectsWhenVenueHasWalkInHoldAndHoldSurvives`.
- [ ] **AC-3:** No sentence the console renders survives in the server's `detail` — `grep -rn "so it
  can.t be moved, repooled or removed\|so its layout is locked" platform/src` returns nothing.
- [ ] **AC-4:** The rule that produced the change is stated where the next author meets it — `grep -rn
  "states the condition, not the remedy" platform/src/main/java/ai/riviera/platform/shared/ApiProblem.java
  .claude/skills/riviera-java-conventions/` returns a hit in all three of `ApiProblem`, `SKILL.md` §6b
  and `references/error-contract.md`.
- [ ] **AC-5:** The operator sees exactly what they saw before — `frontend/src/app/operator/set-editor.ts`
  and `layout-editor.ts` are unchanged, and their specs pass without edits. *Pinned by:* `npm test`
  over `set-editor.spec.ts` + `layout-editor.spec.ts`, unmodified.

## Non-goals

- The three `STALE_WRITE` details in the same controller ("…changed by someone else. **Reload the
  latest and try again.**"), which duplicate the console's three stale-write banners
  (`layout-editor.html`, `pricing-tab.html`, `venue-tab.html`). Same defect class, found at this
  slice's grill, **held out of scope by the maintainer** — follow-up issue, see Open questions.
- Every other controller that builds a `ProblemDetail` (~20). Each needs its own check for whether a
  client reads the detail; not foldable into a low-severity slice.
- #609's question — whether the panel should know which action was attempted, and the `SET_IN_USE`
  message serving two guards of different breadth. That is now **wholly client-side**: this slice
  removes the server's copy of the inaccurate three-verb claim, so #609 has one place left to fix
  rather than two.
- Option (2) from the issue — making the client render `detail`. Declined: it would move
  UI-navigation copy ("Switch to Edit sets…") into the API.
- Any change to the guards themselves, or to the `code`/status/shape of either error.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice changes a wire field, so "no user-visible change" is a claim to verify, not to assert.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `409` + `code: SET_IN_USE` on a refused repool/move/remove | preserved | Untouched — only the `detail` string differs |
| `409` + `code: LAYOUT_IN_USE` on a refused bulk replace | preserved | Untouched — only the `detail` string differs |
| `application/problem+json` body shape, `instance` redacted | preserved | Still built by the one `ApiProblem` factory |
| Server `detail` states the refusal in operator voice | **dropped** | Deliberate — it reached no user (no client reads `detail`) and was a hand-synced duplicate of the console copy |
| Console panel copy for both codes | preserved | Not touched; it was always the only rendered wording |
| Mocked e2e 409s carrying `detail` sentinels (#607 AC-4) | preserved | Sentinels (`'in use'`, `'locked'`) stay absent from the *client* copy, which is what they assert |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A non-console API client depended on the prose | low | low | `code` is the documented contract and is unchanged; the console is the only known client and reads `code` only — verified: no `.detail` read anywhere in `frontend/src`, and #607's e2e mocks already send throwaway `detail` sentinels | claude | open |
| R-2 | The new `detail` drifts again when the guards change (#609) | med | low | Arm-agnostic wording — it names the condition class, not which arm fired — pinned *identical* across all three `SET_IN_USE` arms by AC-1, so a future guard change cannot falsify it | claude | open |
| R-3 | The documented convention indicts code this slice does not fix (the `STALE_WRITE` trio, other controllers) | high | low | State the rule as go-forward, name the known exceptions in the follow-up issue rather than leaving them silent; the convention text does not claim the tree already complies | claude | open |
| R-4 | Pinning `detail` in an IT re-creates the brittleness #608 declined | low | low | #608 declined it because the string was a *duplicate* of the frontend's copy; once the server string is deliberately not UI copy, the IT is its only owner — and it asserts the arm-agnostic *property*, not a sentence rendered elsewhere | claude | open |

## Open questions / Assumptions

- **Open question:** Do the three `STALE_WRITE` details get the same treatment? Held out of this
  slice by the maintainer's scope call. — *Owner:* maintainer · *Resolves by:* follow-up issue filed
  at merge close-out (see Execution status).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes two string literals in a driving adapter. The
guards that produce these refusals (`isLivelyClaimed`, `isLivelyClaimedOrEverBooked`) and every write
path to `availability(set_id, booking_date)` are untouched; the refusals themselves — which are what
protect a held set from being moved out from under a booking — still fire on exactly the same
conditions and still answer the same `code`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | `VenueAdminController` is its `adapter/in`; the strings are that adapter's wire mapping |
| M-2 | `shared` | existing | none (Shared Kernel) | `ApiProblem` is the one error-body factory and the natural home for the convention line |

**Cross-module named interfaces (`api/` ports)** — N/A, none added or changed.

**Domain events (id-based payloads, invariant #11)** — N/A, none published or consumed.

### Module ownership (§4a)

No behavior added or moved: two literals rewritten in `venue::adapter.in`, one javadoc sentence added
in `shared`. No boundary change, no new capability to place.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend + docs only. The console's copy is the surface this slice deliberately leaves as the
single source of the wording; changing it would defeat the point.

## FE↔BE contract

- **New/changed endpoints:** none. `PATCH`/`DELETE /api/venues/{venueId}/sets/{setId}` and
  `PUT /api/venues/{venueId}/beach-map` keep their method, path, status (`409`), body media type
  (`application/problem+json`) and `code` values.
- **Changed field:** the `detail` string for `SET_IN_USE` and `LAYOUT_IN_USE` only.
- **Client typing:** unchanged — `operator-console.model.ts` types the `code` union; `detail` is not
  in the client's model at all, which is the fact that makes this safe.
- **Money/date on the wire:** N/A — no amounts or dates in scope.

## Execution status

**Stage pointer:** `PR #643 — both phases built, marking ready for review`

**Next action:** Mark PR #643 ready for review, then run the Review gate (`pr-gates.md` §1
invocation ladder + `riviera-review-overlay`) and the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Pin the arm-agnostic detail, then write it | ✅ red 3/3 + 2/2, green 53 tests 0 skipped | `897f6f8` |
| 1 — Document the convention | ✅ AC-3/AC-4 greps clean, AC-5 43 specs pass unedited | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — the two
  `detail` strings
- `platform/src/main/java/ai/riviera/platform/shared/ApiProblem.java` — the convention, on the factory
  every author passes through
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — `$.detail`
  assertions on the three `SET_IN_USE` arms
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — `$.detail` assertions on
  the two `LAYOUT_IN_USE` paths
- `.claude/skills/riviera-java-conventions/SKILL.md` — §6b, one sentence
- `.claude/skills/riviera-java-conventions/references/error-contract.md` — the rule plus its rationale
- `docs/plans/error-detail-not-ui-copy.md` — this plan

---

## Phase 0 — Pin the arm-agnostic detail, then write it

**Files:** Modify `VenueAdminControllerIT.java` · `BeachMapReplaceIT.java` ·
`VenueAdminController.java:223-224,238-239`

- [ ] **Step 1: Write the failing assertions** — one shared expected string per code, asserted at
  every arm, so the test states the property (same detail whichever arm fired) and not just the text.

- [ ] **Step 2: Run them, verify they fail** — `gradle test --tests "*VenueAdminControllerIT*"
  --tests "*BeachMapReplaceIT*"` → FAIL, actual is the old operator prose.

- [ ] **Step 3: Minimal implementation** — replace the two literals in `VenueAdminController`.

- [ ] **Step 4: Run them, verify they pass** — same command → PASS.

- [ ] **Step 5: Generalization-audit pass** — population is *every `detail` string in the repo that a
  client also renders from its `code`*; enumerate, judge, record below.

- [ ] **Step 6: Commit** — `git commit -m "Take operator prose out of the two in-use error details (#610)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Document the convention

**Files:** Modify `ApiProblem.java` · `riviera-java-conventions/SKILL.md` ·
`references/error-contract.md`

- [ ] **Step 1: `ApiProblem` javadoc** — extend the existing `detail` safety sentence with the voice
  rule. No issue number, no decision history (§6d).

- [ ] **Step 2: §6b** — one sentence, matching the section's existing density.

- [ ] **Step 3: `error-contract.md`** — the rule with its rationale and the drift history, which is
  the reference's job and not the javadoc's.

- [ ] **Step 4: Verify** — AC-3 and AC-4 greps.

- [ ] **Step 5: Commit** — `git commit -m "State that an error detail describes the condition, not the remedy (#610)"`

- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated; a row whose population is "the other X like
> this one" is the shape that misses things (Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-12 | Phase 0 | **Mechanism: a server `detail` literal whose `code` a client also renders its own copy from** — the thing that makes a string a hand-synced duplicate. Enumerated both halves rather than looking for strings resembling the two fixed ones | `grep -rn "ApiProblem\.\(response\|of\)(" platform/src/main --include=*.java` (49 detail literals) × `grep -rln "case '[A-Z_]\{4,\}':" frontend/src/app --include=*.ts` (21 client code→copy mappers) | 49 server details, 21 client mappers | Scope held at the 2 filed codes by the maintainer; the intersection needs per-code judgment (does *this* client render *this* code) and is the follow-up issue's job, not a sweep this slice can do blind |
| 2026-08-12 | Phase 0 | **Sub-population: details written in remedy / second-person voice** — the drift-prone subset, since that voice is what makes a server string read as UI copy | `grep -rn "ApiProblem\.\(response\|of\)(" platform/src/main --include=*.java -A2 \| grep -iE '"[^"]*(try again\|reload\|please\|your \|you )'` | 6 — the 3 `STALE_WRITE` details in this controller, plus `"Enter your current password."`, `"You cannot suspend the account you are signed in with."`, `"You do not manage this venue."` | All 6 out of scope; named in the follow-up issue. **The phrase sweep is a lower bound, not the population** — it would not have caught either string this slice fixed (neither contains those words), which is why the row above enumerates by mechanism instead |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `gradle --no-daemon test --tests "*VenueAdminControllerIT*"` → 40 tests,
  `skipped="0"`, 0 failures. Red first at `897f6f8~1`: all three arms failed on the old prose.
  Verified at `897f6f8`.
- [x] **AC-2:** `gradle --no-daemon test --tests "*BeachMapReplaceIT*"` → 13 tests, `skipped="0"`,
  0 failures. Verified at `897f6f8`.
- [x] **AC-3:** `grep -rn "so it can.t be moved, repooled or removed\|so its layout is locked"
  platform/src` → no output. Verified at this commit.
- [x] **AC-4:** grep for the rule across `ApiProblem.java`, `SKILL.md`,
  `references/error-contract.md` → three hits. Verified at this commit.
- [x] **AC-5:** `npx ng test --include "src/app/operator/set-editor.spec.ts" --include
  "src/app/operator/layout-editor.spec.ts"` → 43 passed, and `git diff origin/main -- frontend/`
  is empty. Verified at this commit. *(The `npm test -- <name>` form in the phase plan takes only
  one positional filter; `--include` is the two-file form.)*

**Also run:** the structural net (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`,
`*PackageShapeArchitectureTests*`, `*ErrorContractArchitectureTests*`) → BUILD SUCCESSFUL; all four
repo hygiene guards (inline comments, plan file-structure, focus posture, whole-scope Prettier) → clean.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
