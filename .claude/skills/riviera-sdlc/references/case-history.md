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
next Flyway `V<n>` is free on `main` *and* unclaimed by any open PR's diff; if a
collision is possible, record in the plan doc **who renumbers** (default: the branch that
merges second) and expect a merge-from-main before the PR.

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
