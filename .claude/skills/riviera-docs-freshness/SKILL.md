---
name: riviera-docs-freshness
description: >
  Substrate-doc staleness audit for riviera-sunbed-booking — given a git range (a merged
  slice, an epic's merge span, or main since the last audit), walk the substrate-doc map
  (CLAUDE.md, CONTEXT.md, RESPONSIBILITIES.md, docs/adr/, plan-doc final states, the
  .claude/skills/riviera-* skills) and flag or patch any stated fact the diff contradicts.
  Load it at merge close-out step 5 (riviera-sdlc), at every epic close-out, or whenever a
  change might invalidate something a substrate doc states.
---

# Riviera docs freshness

**Announce at start:** "Running riviera-docs-freshness over `<range>`."

The systematic backstop behind `riviera-sdlc`'s merge close-out step 5 (the NemoClaw
`update-docs` pattern, owned in-repo). The cautionary tale is epic #72: ten slices shipped
while `CLAUDE.md`, `CONTEXT.md`, and `RESPONSIBILITIES.md` kept describing the pre-epic
world until a retro caught it. Docs the agents load every session are **load-bearing** —
a stale fact there propagates into every future plan and review.

## Inputs

- **A git range** — e.g. `origin/main...HEAD` (a slice's own diff, pre-merge),
  `<last-audit-sha>..main`, or an epic's merge span. When unspecified, default to
  `origin/main...HEAD` if on a branch, else ask for the range.

## The substrate-doc map (what can go stale)

| Doc | Stated facts that rot | Typical invalidators |
|---|---|---|
| `CLAUDE.md` | module table + shipped/planned notes, invariant wording, the skills list, provisional decisions | a module ships/graduates, an auth/payment mechanism changes, a new skill lands |
| `CONTEXT.md` | glossary terms, canonical value sets (statuses, pools), flow descriptions | a new domain term, a renamed status, a changed flow |
| `RESPONSIBILITIES.md` | each module's Job / Not-My-Job lists, shipped-state notes | behavior moves between modules, an edge concern changes shape |
| `docs/adr/*` | decision + consequences paragraphs | a decision gets re-decided (needs an amendment note, never silent contradiction) |
| `docs/plans/*` (final states) | execution-status tables, "Resolved" sections | only the CURRENT slice's plan — historical plans are records, not living docs |
| `.claude/skills/riviera-*/SKILL.md` | **concrete file names, class names, endpoints, and example tables** inside skills | a rename/removal of anything a skill cites as an example |
| `docs/agents/*`, `README.md`, `CONTRIBUTING.md` | run recipes, label sets, env vars | build/tooling changes |

## Procedure

1. **Summarize the diff's fact-changes.** `git diff --stat <range>` for shape, then read
   the diff for *renames, removals, mechanism swaps, new modules/endpoints/skills, changed
   value sets*. Each is a candidate invalidator; note it as "fact F changed: old → new."
2. **Grep the substrate for each old fact.** For every renamed/removed identifier or
   superseded mechanism, grep the substrate-doc set for the OLD name/wording (e.g.
   `grep -rn "<old>" CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents .claude/skills`).
   A hit in a historical record (an old plan doc, a PR body, an ADR's *history* section) is
   fine; a hit in a **stated present-tense fact** is a finding.
3. **Walk the map top-down for the reverse direction.** Skim each substrate doc's claims
   that TOUCH the diff's area (the module table row, the skill's example table, the
   glossary entries) and ask: does the diff make any stated sentence false, even where no
   identifier matches (e.g. "operators authenticate per request" after a session switch)?
4. **Patch or flag.** Small factual fixes (a filename in a skill's example table, a
   shipped-note, a mechanism phrase) → patch in place, same commit window. Anything that
   changes a decision's substance (an ADR consequence, an invariant's wording) → flag to
   the human with the exact sentence and the contradiction; never silently rewrite
   decisions.
5. **Report.** One line per finding: `doc:line — stated fact — contradicted by — action
   (patched/flagged)`. Zero findings is a valid result — say so explicitly. Record the
   run (range + findings) in the slice's plan doc or the epic close-out comment.

## Scope discipline

- **Present-tense facts only.** Historical narrative ("#74 shipped per-operator
  credentials") stays true forever; don't churn it.
- **In-repo docs only.** GitHub issue bodies are records of intent at creation time —
  the Issue-intake grill gate owns those, not this skill.
- **Don't restate, verify.** This skill never adds new documentation; it only reconciles
  existing statements with reality. New docs are the slice's job.

## When to run

- **Merge close-out step 5** (`riviera-sdlc`) — over the merged PR's range, when the slice
  changed something a substrate doc states.
- **Epic close-out** — over the epic's full merge span (the systematic sweep; first real
  target: epic #108).
- **Pre-merge smoke** — over `origin/main...HEAD` when a slice knowingly renames/moves
  things (cheapest moment to catch the skill/table references).

## Integration

- **`riviera-sdlc`** — merge close-out step 5 delegates the mechanical sweep here.
- **`riviera-plan-doc`** — the run's findings land in the plan's review note.
- **`domain-modeling`** — owns *changing* `CONTEXT.md`/ADRs; this skill only detects the drift.
