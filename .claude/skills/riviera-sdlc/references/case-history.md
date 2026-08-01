# Case history — the incidents behind the rules

Every oddly specific rule in riviera-sdlc earned its specificity from one of these.
Elsewhere in the skill they are cited as "(case history: #NNN)" — this file is the one
place they are told in full. Read it when you want the why behind a gate.

## #122 / #127 — red pushes rode along unnoticed (2026-07-02)

The scoped-test discipline (smallest local set that proves the change; CI owns the full
suite) means a **full-suite-only failure** shows up *only* in push CI. On 2026-07-02
nothing in the loop looked at push CI before PR time, so red pushes rode along unnoticed
twice — #122: 3 red pushes / 45 min; #127: 6 red pushes / 33 min. Lesson: after any push
that claims a phase green, **check that push's CI run before starting the next phase**
(deliberate red-TDD commits and honestly-labeled partial commits are exempt; a "phase
complete" push is not). See `riviera-local-debug` for the full-suite-only failure class.

## #122 / #127 — the V19 Flyway collision (2026-07-02)

Two parallel sessions both claimed migration version **V19**. The loser's PR went
unmergeable, no PR CI or Sonar could run on it, and a large semantic integration merge
had to happen at the very end of the session. Lesson: at issue intake, check that the
next Flyway `V<n>` is free on `main` *and* unclaimed by any open PR's diff — the
in-flight check in `references/issue-intake-gate.md` (step 2) owns the rule, including
who renumbers on a collision.

## PR #158 — merged green with 9 unaddressed MAJOR smells

PR #158 merged with the SonarCloud quality gate **green** while still carrying **9
unaddressed MAJOR `css:S7924` code smells**, because only the check-run conclusion was
read — never the reported issue list. Lesson: the gate's pass/fail is not the check; pull
the actual new-issue + duplication list from the SonarCloud API and clear every entry
before merge, even when the gate is green.

## Epic #72 — ten slices shipped, three substrate docs stale

Epic #72 shipped ten slices and left `CLAUDE.md`, `CONTEXT.md`, and `RESPONSIBILITIES.md`
describing the pre-epic world (invariant #11's old layout, "operator is planned") until a
retro caught it. Lesson: run `riviera-docs-freshness` at merge close-out whenever a slice
changes something a substrate doc states, and over every epic's full merge span at epic
close-out.

## Epic #93 — the conversation-only plan

The improvement plan behind the #93 epic existed only in a conversation (pasted, never
committed), so a later session had to **reconstruct the epic from a one-line summary**.
Lesson: source-of-intent documents live in the repo — any plan, spec, or improvement plan
that issues or ADRs reference must be committed (e.g. `docs/architecture/`, `docs/plans/`)
before or with the artifacts that cite it.

## Epic #141 — O4 and O5 merged with the epic checklist un-ticked

Two consecutive slices of the operator-console epic (#141) merged without ticking their
lines on the parent epic's checklist — a silent close-out gap caught only at O6's
close-out, two slices later. Lesson: the issue-intake gate now verifies the
*previously-merged* sibling's close-out (checklist ticked, issue closed) before planning
the next slice — you're already reading the epic, and catching it there fixes it one
slice later instead of at a retro.

## O6 / PR #219 — the near-empty docs PR

O6's close-out shipped a separate docs-only PR (#219) — a whole PR + CI cycle — for two
one-line staleness patches the code PR could have carried. Lesson: run the
`riviera-docs-freshness` staleness grep **pre-merge** (over `origin/main...HEAD`) and fold
the patches into the code PR itself; a second docs PR is a cost, not a habit.

## PR #318 — the false-clean Sonar read (2026-07-25)

The first `api/issues/search` read on PR #318 showed **0 issues** — because no analysis
existed yet, which is byte-for-byte identical to a genuinely clean PR. The real result
(445 new lines at 91.67% coverage) landed minutes later, and `WebFetch`'s 15-minute cache
could have pinned the stale "clean" answer across the whole gate. Lesson: never accept a
zero issue count without the tells in `pr-gates.md` §2 step 2 — a **non-empty** `measures`
array, a `success` conclusion on the `SonarCloud Code Analysis` check-run, and a
cache-bust on every re-read.

## #326→PR #347, #346→PR #352, #351→PR #354 — three docs-only close-out PRs

The close-out guidance used to call the plan-doc leftovers "a one-line follow-up (a
commit on `main`) — not a full PR." A cloud session cannot push to `main`, so that
degraded into a whole docs-only PR + CI cycle three slices in a row — each diff ~96%
content that predated the merge (#354: **3 of 80 changed lines** actually needed the
SHA). Lesson: record `merged via PR #NN`, never the merge SHA — that makes the plan-doc
final state pre-merge-able in the PR's own last commit, and removing the dependency beats
optimizing the follow-up.

## #351 — the review methods measured against each other (2026-07-26)

On the #351 slice, `/code-review`'s forked subagent fan-out found three defects that both
the hand-walked overlay bank *and* inline `/review` had missed: a same-URL activation
that left the popover stuck open (`NavigationSkipped` ≠ `NavigationEnd`), a second
focus-strand in `signOut()` of the very WCAG class the slice had just fixed elsewhere,
and a dropped `cursor: pointer`. Lesson: `/code-review` is the strongest of the three by
measurement — start it first, every time, and ask the human to authorize the subagent
rather than silently downgrade.

## PR #353 / #355 — the ticked box over a half-run gate (2026-07-26)

On PR #353 the overlay bank ran and found two real issues, the generic banks never ran,
and the review checkbox was ticked anyway on the belief that no review could run at all.
`/review` could — and when finally run it found a **WCAG 2.4.3 focus-loss regression**
the overlay bank has no item for: the account popover was destroyed by its own navigation
with focus inside it, dropping focus to `document.body` — the #148 find-modal bug,
recurring. Fixed in #355, whose own `/review` pass then caught a false-passing assertion
and a repeat RV-STYLE-1 slip in that very fix. Lesson: never tick a box for a command
that didn't run — leave it unticked, say which half ran and why, and ask for the missing
half; the unrun half is where the recurring defect class hides.

## #447 — the constant nobody remembered, and the count nobody could see (2026-07-30)

Two gaps, both caught by the review gate repeatedly rather than by one incident.

**The constant.** The plan-doc template asked for *Skills consulted* as free prose, so an
author filling it in thought about the **routed** skills and let something fall off the
line. RV-PROC-1 caught an omission on six consecutive slices — #427, #430, #436, #440,
#374, #373. What went missing varied (`riviera-review-overlay` and `riviera-docs-freshness`
most often; `riviera-stripe-payments` on #430, `riviera-local-debug` on #440), which is the
tell: six in a row is not six careless authors, it is a template asking a question whose
answer is partly constant. Lesson: **pre-fill the constant part so the author edits rather
than recalls**, and make `riviera-docs-freshness` state *ran* or *N/A + reason* — "not
listed" and "not applicable" look identical in a diff, so a skipped run hid five times.

**The count.** #373 added the third registry-borne booking mail and the sixth mail counter,
falsifying **sixteen** stated facts: `Mailer`'s "the two booking kinds",
`MissingBookingFact`'s "two counters"/"two listeners", both `package-info.java` files,
`MAIL_CONFIRMATION_ABANDONED`'s "first of the two",
`MailListenerExecutorArchitectureTest`'s "not just the two that exist today",
`MockMailerTest`'s assertion description, three surviving "five mail counters", and the
runbook's "do not sum the two abandoned counters". Reviewing the changed files found six of
them. The other **ten** came only from grepping the substrate, in a second round, after the
first six were fixed: by definition they lived in files the diff never touched, so no
amount of reviewing the diff could surface them. One of the sixteen was self-inflicted
inside the fix round — `PaymentDueAnnouncerIT`'s Javadoc still called a method
package-private an hour after the fix made it public. #374 hit the same class one slice
earlier. Lesson: when a slice makes the **Nth** of something, grep the substrate for the
phrasings of **N−1** (not just the renamed identifier) and **re-run the sweep after the fix
round** — `riviera-docs-freshness` procedure step 2b, cited from merge close-out step 5.
