---
name: riviera-docs-freshness
description: >-
  Staleness audit of the substrate docs (CLAUDE.md, CONTEXT.md, RESPONSIBILITIES.md, ADRs,
  riviera-* skills, source Javadoc) over a git range. Load at epic close-out, or when a slice
  knowingly renames, moves or removes something a substrate doc states.
---

# Riviera docs freshness

## Range

A slice's own diff, `<last-audit-sha>..main`, or an epic's merge span (default: the slice's
diff if on a branch, else ask). **Never a bare `origin/main...HEAD`** — a cloud session never
refetches it. Always: `git fetch --unshallow` if shallow, `git fetch --no-tags origin
<base-ref>`, then the merge base.

## What can go stale

| Doc | Facts that rot |
|---|---|
| `CLAUDE.md`, `frontend/.claude/CLAUDE.md` | module table, invariant wording, skills list, provisional decisions, frontend idioms |
| `CONTEXT.md` | glossary terms, canonical value sets, flows |
| `RESPONSIBILITIES.md` | Job / Not-My-Job lists, shipped-state notes, invariant long form, platform-edge rules |
| `docs/adr/*` | decision + consequences (a re-decision needs an amendment note, never silent contradiction) |
| `docs/plans/*` | in-flight plans only — never audited |
| `docs/design/*` (`colour-literal-token-audit.md`, `non-text-contrast.md`, `README.md`) | ledger rows still open for a shipped family; a family table citing a spec that doesn't measure what it claims |
| `.claude/skills/riviera-*/SKILL.md` + `references/*.md` | file/class/endpoint names, example tables, worked examples a fitness function now rejects |
| `docs/agents/*`, `README.md`, `CONTRIBUTING.md` | run recipes, label sets, env vars |
| `docs/deploy/*`, `docs/runbooks/*` | pipeline shape, service names, env vars, ops procedures |
| `platform/src/**`, `frontend/src/**` prose (Javadoc/TSDoc, `package-info.java`, test descriptions) | enumerations naming members the diff renamed or removed |

## Procedure

1. Summarize the diff's fact-changes ("fact F: old → new") — renames, removals, mechanism
   swaps, new modules/endpoints/skills, changed value sets.
2. For every old name or wording, grep the substrate:

   ```bash
   grep -rn "<old>" CLAUDE.md frontend/.claude/CLAUDE.md CONTEXT.md RESPONSIBILITIES.md \
     README.md CONTRIBUTING.md docs/adr docs/agents docs/design docs/deploy docs/runbooks \
     .claude/skills
   ```

   A hit in historical narrative is fine; a present-tense fact is a finding. `platform/src` and
   `docs/plans` are deliberately absent. A doc that states a count ("the two X", "thirteen
   modules") is itself the finding: rewrite it to name the members or point at the source of
   truth, so the next addition cannot falsify it.
3. Walk the map top-down: does the diff falsify any stated sentence in its area even where
   no identifier matches ("operators authenticate per request" after a session switch)?
4. Patch small factual fixes in place, same commit window. Anything touching a decision's
   substance → flag to the human with the exact sentence; never silently rewrite decisions.
5. Report one line per finding: `doc:line — stated fact — contradicted by — action`. Zero
   findings is a valid result — say so. Record range + findings in the plan or the epic
   close-out comment.

Present-tense facts only; in-repo docs only (issue bodies are the intake gate's); verify,
never add documentation. `domain-modeling` owns changing `CONTEXT.md`/ADRs.

## When to run

Epic close-out (full merge span); pre-merge over a slice's own diff when it knowingly renames,
moves or removes things.
