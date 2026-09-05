---
name: riviera-docs-freshness
description: >-
  Staleness audit of the substrate docs (CLAUDE.md, CONTEXT.md, RESPONSIBILITIES.md, ADRs,
  riviera-* skills, source Javadoc) over a git range, including the counting sweep for
  "the two X" facts. Load at merge close-out step 5, at epic close-out, or whenever a
  change might invalidate something a substrate doc states.
---

# Riviera docs freshness

**Announce at start:** "Running riviera-docs-freshness over `<range>`."

Docs the agents load every session are load-bearing — a stale fact there propagates into
every future plan and review.

## Inputs

A git range — a slice's own diff pre-merge, `<last-audit-sha>..main`, or an epic's merge
span. When unspecified, default to the slice's own diff if on a branch, else ask for the
range.

**Resolve the range; never name it as a bare `origin/main...HEAD`** — that is a local ref a cloud
session never refetches, so the sweep silently widens and reports another slice's files as this
one's. For **every** shape above: `git fetch --unshallow` if the clone is shallow, then `git fetch
--no-tags origin <base-ref>`, then take the merge base. Only the slice's-own-diff shape can go
further and verify itself against a PR's reported counts (`riviera-sdlc` `references/pr-gates.md`
§1 step 2) — `check-review-range.mjs` needs a PR to check against, so that half does not apply at
epic close-out or to a `<sha>..main` audit.

## The substrate-doc map (what can go stale)

| Doc | Stated facts that rot | Typical invalidators |
|---|---|---|
| `CLAUDE.md` (+ `frontend/.claude/CLAUDE.md`) | module table + shipped/planned notes, invariant wording, the skills list, provisional decisions; frontend idioms/styling posture in the nested file | a module ships/graduates, an auth/payment mechanism changes, a new skill lands, a frontend idiom is re-decided |
| `CONTEXT.md` | glossary terms, canonical value sets (statuses, pools), flow descriptions | a new domain term, a renamed status, a changed flow |
| `RESPONSIBILITIES.md` | each module's Job / Not-My-Job lists, shipped-state notes, the invariants' long form, the platform-edge rules | behavior moves between modules, an edge concern changes shape |
| `docs/adr/*` | decision + consequences paragraphs | a decision gets re-decided (needs an amendment note, never silent contradiction) |
| `docs/plans/*` | the in-flight slice's execution-status table | only the CURRENT slice's plan exists; a merged slice's plan is deleted at the next close-out of any kind (*Plan-doc retirement*, below), never audited as history |
| `docs/design/*.dc.html` | copy/behavior a design record depicts that shipped code has since changed | a slice ships copy/behavior that diverges from an artboard — per `docs/design/README.md`, add a one-line `<!-- as-built diverges — see #NNN -->` pointer next to the diverged line; never rewrite the artboard's copy in place |
| `docs/design/*.md` — the maintained files (`colour-literal-token-audit.md`, `non-text-contrast.md`) | ledger rows still marked open for a family that shipped; a rule's family table citing a spec that does not measure what it claims | these ARE rewritten to track the app — correct them in place; `docs/design/README.md` states which files are which |
| `.claude/skills/riviera-*/SKILL.md` **and `.claude/skills/riviera-*/references/*.md`** | concrete file names, class names, endpoints, and example tables inside skills; a reference file's worked example that the tree or a fitness function has since ruled out | a rename/removal of anything a skill cites as an example; a new ArchUnit/fitness rule an existing example would now fail |
| `docs/agents/*`, `README.md`, `CONTRIBUTING.md` | run recipes, label sets, env vars | build/tooling changes |
| `docs/deploy/*`, `docs/runbooks/*` | deploy-pipeline shape, hosting/service names, env vars, ops procedures | a CD/hosting change, a rotated secret's name, a new or changed operational mechanism |
| `platform/src/**` — Javadoc, `package-info.java`, and test-assertion descriptions | counts and enumerations of things the code owns ("the two booking kinds", "not just the two that exist today") | the counting sweep's territory (step 2b). Source prose is in the map because it is what the next reader believes; the rest of the code is the reviewer's job |

## Procedure

1. **Summarize the diff's fact-changes.** `git diff --stat <range>` for shape, then read
   the diff for renames, removals, mechanism swaps, new modules/endpoints/skills, changed
   value sets. Note each as "fact F changed: old → new."
2. **Grep the substrate — twice: once for what got renamed, once for what got counted.**

   **2a — the rename/removal grep.** For every renamed/removed identifier or superseded
   mechanism, grep the substrate-doc set for the OLD name/wording — every file the map
   above names, which is wider than the set one thinks of first:

   ```bash
   grep -rn "<old>" CLAUDE.md frontend/.claude/CLAUDE.md CONTEXT.md RESPONSIBILITIES.md \
     README.md CONTRIBUTING.md docs/adr docs/agents docs/design docs/deploy docs/runbooks \
     .claude/skills
   ```

   A hit in a historical record (an old plan doc, a PR body, an ADR's history section) is
   fine; a hit in a stated present-tense fact is a finding. `platform/src` is deliberately
   absent — source prose is step 2b's sweep — and so is `docs/plans`, which is history by
   construction.

   **2b — the counting sweep.** Trigger: this slice made the **Nth** instance of something
   that previously had N−1 — a listener, a metric/counter, an event, a module, a profile, a
   transport, a scheduled sweep, an endpoint in a named set. Every sentence that said "the
   two X", "both X", "the first of the two", "five mail counters" is now false, and by
   definition it lives in a file the slice never touched — reviewing the changed files
   cannot find it. Grep the words, not the new identifier, in two steps (the phrasings alone
   are too broad repo-wide):

   ```bash
   # 1. phrasings of N−1 — ordinal and cardinal, spelled-out and digit
   # 2. narrowed to the vocabulary of what just grew (here: the mail lineage)
   grep -rniE '\b(the|both|only) (two|2)\b|\bof the two\b|\b(five|5) mail counters\b' \
     platform/src CLAUDE.md CONTEXT.md RESPONSIBILITIES.md \
     docs/adr docs/agents docs/runbooks .claude/skills \
     | grep -iE 'mail|listener|counter'
   ```

   Read every hit — this is judgement, not a lint: most hits are "two" of some other
   subject and stay true, and historical narrative legitimately keeps saying "two". Javadoc
   and test-assertion descriptions count as stated facts. **Re-run the sweep after the fix
   round** — a fix round routinely makes a test's Javadoc stale.
3. **Walk the map top-down for the reverse direction.** Skim each substrate doc's claims
   that touch the diff's area (the module table row, the skill's example table, the
   glossary entries) and ask: does the diff make any stated sentence false, even where no
   identifier matches (e.g. "operators authenticate per request" after a session switch)?
4. **Patch or flag.** Small factual fixes (a filename in a skill's example table, a
   shipped-note, a mechanism phrase) → patch in place, same commit window. Anything that
   changes a decision's substance (an ADR consequence, an invariant's wording) → flag to
   the human with the exact sentence and the contradiction; never silently rewrite decisions.
5. **Report.** One line per finding: `doc:line — stated fact — contradicted by — action
   (patched/flagged)`. Zero findings is a valid result — say so explicitly. Record the run
   (range + findings) in the slice's plan doc or the epic close-out comment.

## Scope discipline

- **Present-tense facts only.** Historical narrative stays true forever; don't churn it.
- **In-repo docs only.** GitHub issue bodies are records of intent at creation time — the
  issue-intake grill gate owns those.
- **Don't restate, verify.** This skill never adds new documentation; it only reconciles
  existing statements with reality.

## Plan-doc retirement (every close-out)

A plan doc is working state: it carries the slice from plan to merge, and afterwards it
only costs every later search tokens. It cannot be deleted in its own PR (a review or merge
session reads it until the merge), so the trigger is **the next close-out of any kind** —
any later slice's merge close-out or an epic close-out. Whoever runs a close-out deletes
every plan in `docs/plans/` whose PR has already merged, in the code PR being closed out:

1. `git rm` the plan doc and any `docs/plans/<slug>/` asset directory.
2. Repoint every citation: grep the slug across the tree outside `docs/plans/` — Javadoc,
   TSDoc, `tailwind.css`, the skills, ADRs and runbooks all cite plans by path or by bare
   slug. Markdown docs and e2e/spec headers cite the issue or PR; a Javadoc/TSDoc citation
   becomes a one-line pointer to the `RESPONSIBILITIES.md` section, ADR or skill that holds
   the rationale — never an issue number there (`riviera-java-conventions` §6d).
3. Anything only the plan recorded that a later slice needs (a deferred-residual
   disposition, a rejected alternative, an operational list) moves first — to the
   `RESPONSIBILITIES.md` section or ADR that owns it, with a pointer from the Javadoc it
   constrains (§6d: the contract, not the history), or to the issue — in the same commit.
4. Note the sweep in the close-out comment. The file stays recoverable by slug:
   `git log --all --diff-filter=D -- 'docs/plans/<slug>.md'` — silent, not an error, on a shallow
   clone, so `git fetch --unshallow` first (`riviera-local-debug` § *Git in a cloud session*).

## When to run

- **Merge close-out step 5** (`riviera-sdlc`) — over the merged PR's range, when the slice
  changed something a substrate doc states.
- **Epic close-out** — over the epic's full merge span.
- **Pre-merge smoke** — over the slice's own diff, resolved per *Inputs* above rather than
  named as a bare `origin/main...HEAD`, when a slice knowingly renames/moves things (the
  cheapest moment to catch the skill/table references).

`domain-modeling` owns changing `CONTEXT.md`/ADRs; this skill only detects the drift.
