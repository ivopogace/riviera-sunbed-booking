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
(review gate — **ran** on PR #643 at ready-for-review, medium effort, 11 findings; RV-BE-10 gained the
`detail`-voice paragraph as part of the fix round) · `riviera-docs-freshness` (**ran** over
`origin/main...HEAD` — 1 finding, patched here: `bulk-replace-past-hold-freeze.md:165` quoted the
removed server string as present-tense fact. Counting sweep clean — the slice adds no Nth instance of
anything) · `riviera-java-conventions` (§6b is the contract being amended; **§6d** kept the new
`ApiProblem` javadoc free of an issue number, and at review round 1 trimmed it further to rule +
pointer, with the rationale living once in the skill reference) · `riviera-local-debug` (scoped
build/test recipe for the two Testcontainers ITs, and the manual `start-dockerd.sh` fallback the
session needed — no daemon was up, so the ITs would otherwise have skipped silently).

> `riviera-modulith` was **not** loaded, against the routing table's backend-Java row. The diff
> creates no class, moves none, and touches no published surface (`api`/`spi`/`events`/`vocabulary`)
> — two string literals in an existing `adapter/in` controller and a javadoc line in `shared`. There
> is no placement decision for it to own. Flagged rather than silently skipped; same call, and same
> reasoning, as #607's `playwright-cli` note.

**Branch:** `claude/sdlc-610-msve9z` — the cloud session's designated remote branch, standing in for
`bugfix/error-detail-not-ui-copy` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a per-set write refused by the in-use guard, when the server answers `409
  SET_IN_USE`, then `detail` is one arm-agnostic sentence at every arm this suite provokes — the
  remove guard's future-dated staff hold and its terminal-booking arm, and the edit guard's live
  hold — **and it is true of each**, including the terminal-booking case, where the set is pinned by
  the RESTRICT FK rather than in use. *Pinned by:*
  `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409`,
  `VenueAdminControllerIT.removeSetOnABookedSetAnswers409NotAServerError`,
  `VenueAdminControllerIT.editSetKeepsAClaimedSetInItsPoolButStillTakesAPriceChange`.
- [x] **AC-2:** Given a bulk layout replace refused by the venue-wide guard, when the server answers
  `409 LAYOUT_IN_USE`, then `detail` is the matching arm-agnostic sentence whichever arm fired — a
  booking of any status or a future-dated walk-in hold. *Pinned by:*
  `BeachMapReplaceIT.rejectsWhenVenueHasBooking`,
  `BeachMapReplaceIT.rejectsWhenVenueHasWalkInHoldAndHoldSurvives`.
- [x] **AC-3:** No sentence the console renders survives in the server's `detail` — `grep -rn "so it
  can.t be moved, repooled or removed\|so its layout is locked" platform/src` returns nothing.
- [x] **AC-4:** The rule that produced the change is stated where the next author meets it —
  `grep -rln "states the condition, not the remedy"
  platform/src/main/java/ai/riviera/platform/shared/ApiProblem.java
  .claude/skills/riviera-java-conventions/` returns all three of `ApiProblem`, `SKILL.md` §6b and
  `references/error-contract.md`. *(Review r1 F-2: the javadoc originally wrapped the word in
  `<em>` so this grep matched only two of the three; the tags are gone rather than the AC widened,
  so one literal pattern proves all three.)*
- [x] **AC-5:** The operator sees exactly what they saw before — `frontend/src/app/operator/set-editor.ts`
  and `layout-editor.ts` are unchanged, and their specs pass without edits. *Pinned by:*
  `npx ng test --include` over `set-editor.spec.ts` + `layout-editor.spec.ts`, unmodified, plus an
  empty `git diff origin/main -- frontend/`.

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
| Mocked e2e 409s carrying `detail` sentinels (#607 AC-4) | preserved | #607 chose `'in use'` / `'locked'` as strings **the server would never send**, so an echoing client fails by construction. The first draft of this slice broke that — it sent "This set is in use.", making the sentinel a substring of the real prose (review r1 F-3). The shipped wording ("has a booking or a hold") restores the property without touching `frontend/e2e/` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A non-console API client depended on the prose | low | low | `code` is the documented contract and is unchanged; the console is the only known client and reads `code` only — verified: no `.detail` read anywhere in `frontend/src`, and #607's e2e mocks already send throwaway `detail` sentinels | claude | **Closed** — no client reads `detail`; 43 console specs pass unedited |
| R-2 | The new `detail` drifts again when the guards change (#609) | med | low | Arm-agnostic wording — it names the condition class, not which arm fired — pinned *identical* across all three `SET_IN_USE` arms by AC-1, so a future guard change cannot falsify it | claude | **Closed, and it very nearly bit inside this slice** — the first draft ("This set is in use.") was arm-agnostic *and false* for the terminal-booking arm. Review r1 F-1 caught it; the shipped superset wording ("has a booking or a hold") is falsifiable by no narrowing or widening. The near-miss is written into `error-contract.md` as the trap |
| R-3 | The documented convention indicts code this slice does not fix (the `STALE_WRITE` trio, other controllers) | high | low | State the rule as go-forward, name the known exceptions in the follow-up issue rather than leaving them silent; the convention text does not claim the tree already complies | claude | **Closed** — `error-contract.md` names the six known exceptions *and* labels them a lower bound (review r1 F-8), so absence from the list reads as unexamined, not clean. Follow-up: issue #644 |
| R-4 | Pinning `detail` in an IT re-creates the brittleness #608 declined | low | low | #608 declined it because the string was a *duplicate* of the frontend's copy; once the server string is deliberately not UI copy, the IT is its only owner — and it asserts the arm-agnostic *property*, not a sentence rendered elsewhere | claude | **Closed** — and the pin earned itself immediately: it is what made review r1 F-1's falsehood concrete, by showing a CANCELLED-booking fixture asserting "in use" |

## Open questions / Assumptions

*None open.*

### Resolved

- **Open question:** Do the three `STALE_WRITE` details get the same treatment? → **Not in this
  slice.** Held out by the maintainer's scope call at the issue-intake gate; carried to **issue #644**
  with the other three remedy-voiced details and, more importantly, with the mechanism-level
  enumeration (49 detail literals × 21 client mappers) that the phrase sweep could not stand in for.

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

**Stage pointer:** `merge close-out — all gates run; merged via PR #643`

**Next action:** Merge PR #643. Post-merge, only GitHub-side items remain: confirm #610 closed (the
PR's `Closes #610` does it) and confirm the PR-activity subscription ended. No epic owns this issue,
so there is no checklist to tick.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Pin the arm-agnostic detail, then write it | ✅ red 3/3 + 2/2, green 53 tests 0 skipped | `897f6f8` |
| 1 — Document the convention | ✅ AC-3/AC-4 greps clean, AC-5 43 specs pass unedited | `d3a5208` |
| 2 — Review round 1 fixes (11 findings) + close-out | ✅ 53 IT tests green on the new wording | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review r1 | **"This set is in use." is false on the ever-booked arm** — `removeSet` refuses on a booking of any status, so a set whose only booking is long-cancelled is not in use but undeletable by RESTRICT FK (`RESPONSIBILITIES.md`:121). The slice's own IT pinned that falsehood | **fixed** — both strings restated as the superset "has a booking or a hold", true at every arm and unfalsifiable by a guard change |
| F-2 | review r1 | AC-4 ticked claiming three grep hits; the javadoc's `<em>` tags meant the named pattern matched only two | **fixed** — `<em>` removed so one literal pattern proves all three; AC-4 text corrected |
| F-3 | review r1 | The new server string contained #607's e2e sentinel `'in use'`, quietly voiding the "server would never send this" property | **fixed by F-1** — the shipped wording contains neither sentinel; `frontend/e2e/` untouched |
| F-4 | review r1 | Both details were prose transliterations of their `code`, carrying nothing RFC 7807 asks `detail` to carry | **fixed by F-1** — the shipped strings state the condition |
| F-5 | review r1 | Plan declared complete with 35 unticked boxes | **fixed** — every box evaluated and ticked in this commit |
| F-6 | review r1 | Literal template placeholders `<when it ran>` / `<ran/N/A>` left in *Skills consulted* | **fixed** — both filled; the freshness run it was hiding found a real stale quote |
| F-7 | review r1 | The duplication fix introduced three copies of its own rationale; javadoc restated it *and* pointed | **fixed** — javadoc trimmed to rule + pointer (§6d shape). The three layers are now contract / summary / rationale, not three copies. *Partly rejected:* the pointer targets `riviera-java-conventions` §6b rather than `RESPONSIBILITIES.md`, matching existing precedent (`ResubmissionOutcome`, `ObservabilityMetrics`) — the error contract is not a module responsibility |
| F-8 | review r1 | The "known exceptions" list read as complete, though its sweep was a lower bound | **fixed** — the reference now says so and states the real population |
| F-9 | review r1 | No machine guard and no review-bank text for the new rule | **half fixed, half rejected** — RV-BE-10 gained the `detail`-voice paragraph incl. F-1's and F-4's traps. The machine check stays out: the maintainer declined it at the plan stage (brittle banned-phrase list; a gate that fails correct strings is the wrong error direction) |
| F-10 | review r1 | All four risk rows still `open` in a plan declaring both phases done | **fixed** — all four closed with outcomes |
| F-11 | review r1 | Test-constant javadoc claimed "every arm", but the guard has four sub-arms and the live-*booking* arm of `isLivelyClaimed` is never provoked | **fixed** — javadoc and AC-1 now say "every arm this suite provokes" and name them. Adding a live-booking fixture is out of scope; both `editSet` conditions share one return, so nothing is unpinned today |
| — | sonar | Quality gate **passed** — 0 new issues, 0 accepted issues, 0 security hotspots, 0.0% duplication on new code | verified against the API, not just the badge (see the Sonar note) |

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
- `.claude/skills/riviera-review-overlay/references/backend-conventions.md` — RV-BE-10 gains the
  `detail`-voice paragraph (review r1 F-9), the review-time half of a rule nothing machine-checks
- `docs/plans/bulk-replace-past-hold-freeze.md` — docs-freshness patch: its *Deliberate non-change*
  entry quoted the removed server string as present-tense fact
- `docs/plans/error-detail-not-ui-copy.md` — this plan

---

## Phase 0 — Pin the arm-agnostic detail, then write it

**Files:** Modify `VenueAdminControllerIT.java` · `BeachMapReplaceIT.java` ·
`VenueAdminController.java:223-224,238-239`

- [x] **Step 1: Write the failing assertions** — one shared expected string per code, asserted at
  every arm, so the test states the property (same detail whichever arm fired) and not just the text.

- [x] **Step 2: Run them, verify they fail** — `gradle test --tests "*VenueAdminControllerIT*"
  --tests "*BeachMapReplaceIT*"` → FAIL, actual is the old operator prose.

- [x] **Step 3: Minimal implementation** — replace the two literals in `VenueAdminController`.

- [x] **Step 4: Run them, verify they pass** — same command → PASS.

- [x] **Step 5: Generalization-audit pass** — population is *every `detail` string in the repo that a
  client also renders from its `code`*; enumerate, judge, record below.

- [x] **Step 6: Commit** — `git commit -m "Take operator prose out of the two in-use error details (#610)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Document the convention

**Files:** Modify `ApiProblem.java` · `riviera-java-conventions/SKILL.md` ·
`references/error-contract.md`

- [x] **Step 1: `ApiProblem` javadoc** — extend the existing `detail` safety sentence with the voice
  rule. No issue number, no decision history (§6d).

- [x] **Step 2: §6b** — one sentence, matching the section's existing density.

- [x] **Step 3: `error-contract.md`** — the rule with its rationale and the drift history, which is
  the reference's job and not the javadoc's.

- [x] **Step 4: Verify** — AC-3 and AC-4 greps.

- [x] **Step 5: Commit** — `git commit -m "State that an error detail describes the condition, not the remedy (#610)"`

- [x] **Step 6: Update plan-doc execution status** in the same commit window.

## Phase 2 — Review round 1 (unplanned; 11 findings) + close-out

**Files:** Modify `VenueAdminController.java` · both ITs · `ApiProblem.java` ·
`references/error-contract.md` · `riviera-review-overlay/references/backend-conventions.md` ·
`bulk-replace-past-hold-freeze.md` · this plan

- [x] **Step 1: Re-run the routing gate for what the fixes touch** — backend Java
  (`riviera-java-conventions`, already loaded) and the two skill references. No new area: the
  wording fix stayed server-side, so `playwright-cli` never became due (F-3 dissolved with F-1
  rather than being fixed in `frontend/e2e/`).

- [x] **Step 2: F-1 — restate both details truthfully.** "This set is in use." is false where
  `isLivelyClaimedOrEverBooked` fires on a long-cancelled booking; the superset "has a booking or a
  hold" is true at every arm and cannot be falsified by narrowing or widening a guard.

- [x] **Step 3: Re-run the ITs** — `gradle test --tests "*VenueAdminControllerIT*" --tests
  "*BeachMapReplaceIT*"` → 40 + 13, `skipped="0"`, 0 failures on the new wording.

- [x] **Step 4: F-2/F-7/F-8/F-9/F-11 — the documentation fixes**, each recorded in the findings
  register with what was accepted and what was rejected-with-reason.

- [x] **Step 5: `riviera-docs-freshness`** over `origin/main...HEAD` — 1 finding, patched.

- [x] **Step 6: F-5/F-6/F-10 — close the plan out**, and file issue #644 so the deferred population
  has a home before the merge, not after.

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

## Sonar note

Quality gate **passed** on PR #643, and the reported list was pulled rather than inferred from the
badge (`pr-gates.md` §2 — a green gate is necessary, not sufficient):

- `api/issues/search?…&pullRequest=643&resolved=false` → `"total": 0`.
- `api/measures/component?…&pullRequest=643` → `new_bugs 0`, `new_vulnerabilities 0`,
  `new_code_smells 0`, `new_duplicated_blocks 0`, `new_duplicated_lines_density 0.0`.

**The zero is a real zero, not the false-clean read**: `new_lines` came back with a value (`6`), so an
analysis exists for this PR — the check that distinguishes "analyzed and clean" from "never
analyzed", which return byte-identical issue lists. Read with `curl` rather than `WebFetch` to sidestep
the 15-minute response cache the gate warns about, and **re-read after the review-fix push**, since
that changes the head Sonar analyzed.

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

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
