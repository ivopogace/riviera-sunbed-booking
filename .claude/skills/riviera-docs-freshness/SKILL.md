---
name: riviera-docs-freshness
description: >-
  Staleness audit of the substrate docs (CLAUDE.md, CONTEXT.md, RESPONSIBILITIES.md, ADRs,
  riviera-* skills, source Javadoc) over a git range, including the counting sweep for
  "the two X" facts. Load at merge close-out step 5, at epic close-out, or whenever a
  change might invalidate something a substrate doc states.
---

# Riviera docs freshness

Announce: "Running riviera-docs-freshness over `<range>`."

## Range

A slice's own diff, `<last-audit-sha>..main`, or an epic's merge span (default: the slice's
diff if on a branch, else ask). **Never a bare `origin/main...HEAD`** — a cloud session never
refetches it. Always: `git fetch --unshallow` if shallow, `git fetch --no-tags origin
<base-ref>`, then the merge base. Only a slice's own diff can also be verified against the
PR's counts (`riviera-sdlc` `references/pr-gates.md` §1).

## What can go stale

| Doc | Facts that rot |
|---|---|
| `CLAUDE.md`, `frontend/.claude/CLAUDE.md` | module table, invariant wording, skills list, provisional decisions, frontend idioms |
| `CONTEXT.md` | glossary terms, canonical value sets, flows |
| `RESPONSIBILITIES.md` | Job / Not-My-Job lists, shipped-state notes, invariant long form, platform-edge rules |
| `docs/adr/*` | decision + consequences (a re-decision needs an amendment note, never silent contradiction) |
| `docs/plans/*` | the current slice's plan, plus merged ones awaiting the next close-out's retirement — never audited |
| `docs/design/*` (`colour-literal-token-audit.md`, `non-text-contrast.md`, `README.md`) | ledger rows still open for a shipped family; a family table citing a spec that doesn't measure what it claims |
| `.claude/skills/riviera-*/SKILL.md` + `references/*.md` | file/class/endpoint names, example tables, worked examples a fitness function now rejects |
| `docs/agents/*`, `README.md`, `CONTRIBUTING.md` | run recipes, label sets, env vars |
| `docs/deploy/*`, `docs/runbooks/*` | pipeline shape, service names, env vars, ops procedures |
| `platform/src/**`, `frontend/src/**` prose (Javadoc/TSDoc, `package-info.java`, test descriptions) | counts and enumerations ("the two booking kinds") — step 2b |

## Procedure

1. Summarize the diff's fact-changes ("fact F: old → new") — renames, removals, mechanism
   swaps, new modules/endpoints/skills, changed value sets.
2. Grep twice.

   **2a — renames/removals:** for every old name or wording:

   ```bash
   grep -rn "<old>" CLAUDE.md frontend/.claude/CLAUDE.md CONTEXT.md RESPONSIBILITIES.md \
     README.md CONTRIBUTING.md docs/adr docs/agents docs/design docs/deploy docs/runbooks \
     .claude/skills
   ```

   A hit in historical narrative is fine; a present-tense fact is a finding. `platform/src` and
   `docs/plans` are deliberately absent.

   **2b — the counting sweep.** Trigger: the slice made the Nth of something (listener,
   counter, event, module, profile, transport, sweep, endpoint in a named set). Every "the
   two X" / "both X" / "five mail counters" is now false and lives in a file the diff never
   touched. Grep the phrasings, then narrow to the vocabulary of what grew:

   ```bash
   grep -rniE '\b(the|both|only) (two|2)\b|\bof the two\b|\b(five|5) mail counters\b' \
     platform/src CLAUDE.md CONTEXT.md RESPONSIBILITIES.md \
     docs/adr docs/agents docs/runbooks .claude/skills \
     | grep -iE 'mail|listener|counter'
   ```

   Read every hit — judgement, not lint. Re-run after the fix round.
3. Walk the map top-down: does the diff falsify any stated sentence in its area even where
   no identifier matches ("operators authenticate per request" after a session switch)?
4. Patch small factual fixes in place, same commit window. Anything touching a decision's
   substance → flag to the human with the exact sentence; never silently rewrite decisions.
5. Report one line per finding: `doc:line — stated fact — contradicted by — action`. Zero
   findings is a valid result — say so. Record range + findings in the plan or the epic
   close-out comment.

Present-tense facts only; in-repo docs only (issue bodies are the intake gate's); verify,
never add documentation. `domain-modeling` owns changing `CONTEXT.md`/ADRs.

## Plan-doc retirement (every close-out)

A merged plan cannot be deleted in its own PR, so whoever runs any later close-out deletes
every `docs/plans/` plan whose PR already merged, in the code PR being closed out:

1. `git rm` the plan and any `docs/plans/<slug>/` assets.
2. Repoint every citation of the path or bare slug outside `docs/plans/`: docs and spec
   headers → the issue or PR; Javadoc/TSDoc → a one-line pointer to the `RESPONSIBILITIES.md`
   section, ADR or skill holding the rationale, never an issue number (`riviera-java-conventions` §6d).
3. Anything only the plan recorded that a later slice needs moves first to the owning
   `RESPONSIBILITIES.md` section, ADR or issue.
4. Note the sweep in the close-out comment. Recover a plan with
   `git log --all --diff-filter=D -- 'docs/plans/<slug>.md'` after `git fetch --unshallow`.

## When to run

Merge close-out step 5 (over the merged PR's range); epic close-out (full merge span);
pre-merge smoke over the slice's diff when it knowingly renames or moves things.
