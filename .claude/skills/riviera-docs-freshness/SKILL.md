---
name: riviera-docs-freshness
description: >
  Substrate-doc staleness audit for riviera-sunbed-booking — given a git range (a merged
  slice, an epic's merge span, or main since the last audit), walk the substrate-doc map
  (CLAUDE.md, CONTEXT.md, RESPONSIBILITIES.md, docs/adr/, plan-doc final states, the
  .claude/skills/riviera-* skills) and flag or patch any stated fact the diff contradicts —
  including the ones it cannot show, via the counting sweep, when the slice makes the Nth
  instance of something that previously had N−1 (a listener, counter, event, module,
  profile, transport, sweep) and every doc saying "the two X" goes stale outside the diff.
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
| `CLAUDE.md` (+ `frontend/.claude/CLAUDE.md`) | module table + shipped/planned notes, invariant wording, the skills list, provisional decisions; frontend idioms/styling posture in the nested file | a module ships/graduates, an auth/payment mechanism changes, a new skill lands, a frontend idiom is re-decided |
| `CONTEXT.md` | glossary terms, canonical value sets (statuses, pools), flow descriptions | a new domain term, a renamed status, a changed flow |
| `RESPONSIBILITIES.md` | each module's Job / Not-My-Job lists, shipped-state notes | behavior moves between modules, an edge concern changes shape |
| `docs/adr/*` | decision + consequences paragraphs | a decision gets re-decided (needs an amendment note, never silent contradiction) |
| `docs/plans/*` (final states) | execution-status tables, "Resolved" sections | only the CURRENT slice's plan — historical plans are records, not living docs |
| `.claude/skills/riviera-*/SKILL.md` | **concrete file names, class names, endpoints, and example tables** inside skills | a rename/removal of anything a skill cites as an example |
| `docs/agents/*`, `README.md`, `CONTRIBUTING.md` | run recipes, label sets, env vars | build/tooling changes |
| `docs/deploy/*`, `docs/runbooks/*` | deploy-pipeline shape, hosting/service names, env vars, ops procedures | a CD/hosting change, a rotated secret's name, a new or changed operational mechanism |
| `platform/src/**` — **Javadoc, `package-info.java`, and test-assertion descriptions** | counts and enumerations of things the code owns ("the two booking kinds", "the first of the two counters", "not just the two that exist today") | the **counting sweep**'s territory (step 2b): a slice that adds the Nth of something. Source prose is in the map for this reason alone — it is what the next reader believes; the rest of the code is the reviewer's job, not this skill's |

## Procedure

1. **Summarize the diff's fact-changes.** `git diff --stat <range>` for shape, then read
   the diff for *renames, removals, mechanism swaps, new modules/endpoints/skills, changed
   value sets*. Each is a candidate invalidator; note it as "fact F changed: old → new."
2. **Grep the substrate — twice: once for what got renamed, once for what got counted.**

   **2a — the rename/removal grep.** For every renamed/removed identifier or
   superseded mechanism, grep the substrate-doc set for the OLD name/wording (e.g.
   `grep -rn "<old>" CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents .claude/skills`).
   A hit in a historical record (an old plan doc, a PR body, an ADR's *history* section) is
   fine; a hit in a **stated present-tense fact** is a finding.

   **2b — the counting sweep.** Trigger: *this slice made the **Nth** instance of something
   that previously had **N−1*** — a listener, a metric/counter, an event, a module, a
   profile, a transport, a scheduled sweep, an endpoint in a named set. Every sentence that
   said "the two X", "both X", "the first of the two", "five mail counters" is now false.

   **Why it needs its own step: the diff cannot reveal these.** By definition the stale
   statement lives in a file the slice never touched, so reviewing the changed files —
   however carefully, however structurally — *cannot* find one. Only a repo-wide grep for
   the **count** can, and it is seconds against a class of error that otherwise ships.

   Grep the **words**, not the new identifier — in two steps, because the phrasings alone
   are too broad (~200 hits repo-wide when this was written) and collapse to a readable
   list once filtered by the vocabulary of the thing that grew (~75 for the mail lineage).
   Re-measure rather than trusting those two numbers: they date the recipe, they do not
   describe your repo today.

   ```bash
   # 1. phrasings of N−1 — ordinal and cardinal, spelled-out and digit
   # 2. narrowed to the vocabulary of what just grew (here: the mail lineage)
   grep -rniE '\b(the|both|only) (two|2)\b|\bof the two\b|\b(five|5) mail counters\b' \
     platform/src CLAUDE.md CONTEXT.md RESPONSIBILITIES.md \
     docs/adr docs/agents docs/runbooks .claude/skills \
     | grep -iE 'mail|listener|counter'
   ```

   Then **read every hit** — this is judgement, not a lint (which is why #447 ruled out
   automating it): most hits are "two" of some *other* subject and stay true, and
   historical narrative legitimately keeps saying "two" (Scope discipline, below).
   **Javadoc and test-assertion descriptions count as stated facts** — they are what the
   next reader believes.

   Case history: **#373** added the third registry-borne booking mail and the sixth mail
   counter, and the review found **sixteen** statements it falsified — `Mailer`'s "the two
   booking kinds", `MissingBookingFact`'s "two counters"/"two listeners", both
   `package-info.java` files, `MAIL_CONFIRMATION_ABANDONED`'s "first of the two",
   `MailListenerExecutorArchitectureTest`'s "not just the two that exist today",
   `MockMailerTest`'s assertion description, three surviving "five mail counters", and the
   runbook's "do not sum the two abandoned counters". **How they were found is the
   argument for this step:** ordinary review of the changed files surfaced six; the other
   **ten** came only from grepping the substrate, in a second round, after the first six
   were already fixed — invisible to file-by-file review because they were never in the
   diff. #374 hit the same class one slice earlier. **Re-run the sweep after the fix
   round** —
   #373's own fix made `PaymentDueAnnouncerIT`'s Javadoc stale within the hour, by turning
   a package-private method public.
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
6. **Refresh the knowledge graph.** If any doc was patched, refresh via the graphify
   skill's update flow and **verify the docs were actually re-extracted** — the bare
   `graphify update .` CLI has been observed to re-extract code only. (The post-commit
   hook rebuilds code only; the graph is local/gitignored — nothing to commit; skip
   when `graphify-out/` is absent, e.g. a cloud clone.)

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
