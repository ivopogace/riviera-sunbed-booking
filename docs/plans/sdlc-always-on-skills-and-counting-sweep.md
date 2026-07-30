# Close two recurring process gaps at the source Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move two recurring review findings out of the author's memory and into the
substrate — pre-fill the always-on skills in the plan-doc template, and give
`riviera-docs-freshness` a **counting sweep** for the stale statements a diff structurally
cannot contain — so neither depends on remembering harder.

**Architecture:** Both fixes are edits to prose that agents load every session, so the
single most significant decision is **where each rule lives so it is reached by the
existing gate rather than by recall**: gap 1 goes in the plan-doc *template* (the artifact
an author edits, not the skill an author reads), and gap 2 goes in
`riviera-docs-freshness`'s **procedure step 2** — folded in as `2a`/`2b` rather than a new
step 7, so nothing that cites the skill's later steps has to renumber — with a one-bullet
citation from `riviera-sdlc`'s close-out step 5, which is what actually makes it reachable.

**Persistence:** JDBC only (invariant #1). `N/A — no schema, no migration, no SQL; this
slice writes prose only.`

**Source of intent:** GitHub issue #447

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — re-verified
all three target files against the issue's claims, confirmed only Dependabot PRs are in
flight so no shared-file overlap, and confirmed no Flyway number is at stake) ·
`riviera-plan-doc` (this doc; and its `references/plan-doc-template.md` is one of the two
artifacts under change) · `tdd` (`N/A as executable tests` — the deliverable is prose, so
each AC is pinned by a verification **command** whose expected output is stated, run
before and after each edit; there is no behavior to red-green) · `riviera-review-overlay`
(review gate — RV-PROC-1 is the item that caught both gaps, and it re-checks this very
line) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD` — **1 finding + 1
ripple, both patched**: the "Anything, always" routing row named three skills where the
template now pre-fills five; the skill is also the second artifact under change, so this
slice dogfooded its own new counting sweep — full run recorded below)

**Branch:** `claude/sdlc-447-dcr1si` — the cloud session's **designated remote branch
stands in for** `feature/<slug>` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC.
>
> **Deviation, stated rather than hidden:** the deliverable of this slice is prose in
> `.claude/skills/`, which has no test class and cannot have one (the issue's own
> non-goal: a lint over prose would fire on historical narrative, which is legitimately
> allowed to keep saying "two"). Each AC is therefore pinned by an **exact verification
> command with a stated expected result**, run in the Acceptance-criteria verification
> section below. That is a weaker pin than a test and is called out as such — it is not a
> claim that these are tested.

- [ ] **AC-1:** Given an author copying `plan-doc-template.md` for a new slice, when they
  reach the `**Skills consulted:**` line, then all five always-on entries (`riviera-sdlc`,
  `riviera-plan-doc`, `tdd`, `riviera-review-overlay`, `riviera-docs-freshness`) are
  already present as text to **extend**, and the `riviera-docs-freshness` entry carries a
  placeholder that forces an explicit **ran** (range + findings) **or** `N/A — <reason>`,
  so "not listed" and "not applicable" are no longer indistinguishable in the diff.
  *Pinned by:* `grep -c` for the five names within the Skills-consulted block of
  `.claude/skills/riviera-plan-doc/references/plan-doc-template.md` → all five present.

- [ ] **AC-2:** Given a slice that adds the Nth instance of something that previously had
  N−1 (a listener, counter, event, module, profile, transport, sweep), when
  `riviera-docs-freshness` runs, then its **procedure step 2** directs a **counting
  sweep** — grep the ordinal/cardinal phrasings of **N−1** across `platform/src`, the
  substrate docs, `docs/runbooks/` and `.claude/skills/`, not merely the renamed
  identifier — and states **why the diff cannot reveal these** (the stale statement lives
  in a file the slice never touched).
  *Pinned by:* `grep -n "counting sweep" .claude/skills/riviera-docs-freshness/SKILL.md`
  → ≥1 hit inside the Procedure section, and the step contains a runnable grep recipe.

- [ ] **AC-3:** Given an agent working `riviera-sdlc`'s merge close-out, when it reaches
  **step 5**, then the counting sweep is cited there by name, so the check is reachable
  from the gate and not only from the skill.
  *Pinned by:* `grep -n "counting sweep" .claude/skills/riviera-sdlc/references/pr-gates.md`
  → ≥1 hit inside close-out step 5.

- [ ] **AC-4:** Given a future editor reading either new rule, when they ask "why is this
  here", then each carries its case history in one line — **#427/#430/#436/#440/#374/#373**
  for gap 1, **#373's sixteen falsified statements** for gap 2 — so a rule with no incident
  behind it does not get edited away.
  *Pinned by:* `grep -c "#427" .claude/skills/riviera-plan-doc/references/plan-doc-template.md`
  and `grep -c "sixteen" .claude/skills/riviera-docs-freshness/SKILL.md` → ≥1 each.

- [ ] **AC-5:** Given the slice's full diff, when `git diff --stat origin/main...HEAD` is
  read, then it touches **only** `.claude/skills/**` and `docs/plans/**` — no file under
  `platform/src` or `frontend/src` — and `riviera-docs-freshness` has been run over that
  range with its result recorded in this doc.
  *Pinned by:* `git diff --name-only origin/main...HEAD | grep -cvE '^(\.claude/skills|docs/plans)/'`
  → 0, plus the **Docs-freshness run** section below being filled.

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **Automating either check in CI.** Both are judgement-shaped: the sweep needs a
  human/agent to pick the N−1 phrasings for the thing that just grew, and a lint over
  prose would fire on historical narrative, which is legitimately allowed to keep saying
  "two" (`riviera-docs-freshness`: *"Present-tense facts only"*).
- **Retroactively auditing already-merged slices for undercounts.** #373's sweep already
  cleaned the mail lineage, which is where the density was.
- **Changing RV-PROC-1.** The overlay item already catches gap 1 — it is what caught it
  six times. The defect is the template asking a question whose answer is partly constant,
  not the reviewer failing to check.
- **Changing `riviera-plan-doc/SKILL.md` §0.** It says "record every loaded skill + one
  phrase on what it changed", which the pre-fill satisfies rather than contradicts; a
  second home for the same rule is how the two drift.
- **Restructuring the loop.** Neither fix changes a stage, a gate, or their order.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` Both edits are **additive**: the template's
Skills-consulted guidance keeps its existing "must cover every area the diff touches"
rule and gains a pre-filled constant ahead of it; `riviera-docs-freshness`'s step 2 keeps
its rename/removal grep verbatim as `2a` and gains `2b`.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The pre-filled line becomes cargo-cult — an author ships `tdd (build)` on a slice built without a test, so the line is *present* and *false*, which is worse than absent | med | med | Every pre-filled entry carries a parenthesis the author must fill with what it actually did (not a fixed label); `riviera-docs-freshness` additionally forces ran-or-N/A-with-reason; RV-PROC-1 re-checks the line against the diff at every review incl. fix commits | this slice | **closed** — every pre-filled entry ships a `<…>` the author must fill, and `riviera-docs-freshness`'s forces ran-or-N/A; shipped in `9ad7af3` |
| R-2 | A future editor "simplifies" the pre-fill back to a bare placeholder, restoring the gap | med | med | The adjacent blockquote records the six-slice run (#427/#430/#436/#440/#374/#373) and says *extend, don't replace* — AC-1 + AC-4 | this slice | **closed** — blockquote shipped in `9ad7af3`; AC-1 + AC-4 verified |
| R-3 | The counting sweep is too noisy to run — an unscoped phrasing grep returns ~200 hits repo-wide, and a check nobody runs is not a check | high | med | Document the **two-step** recipe measured on this repo: phrasing grep **filtered by the grown thing's vocabulary** (~200 hits unfiltered → ~75 for the mail lineage, of which #373's review confirmed 16 real), plus the present-tense-only scope discipline that discards historical narrative | this slice | **closed** — recipe shipped in `562a07a` and exercised in phase 3: the two-step grep returned a readable list and found the one real finding |
| R-4 | Adding a procedure step to `riviera-docs-freshness` renumbers steps 3–6 and silently breaks any doc citing "step N" of that skill | low | med | Fold the sweep into step 2 as `2a`/`2b` so later numbers are untouched; verified by grep that no doc outside the skill cites its internal step numbers (only `riviera-sdlc`'s *own* "close-out step 5" is cited externally, which this slice does not move) | this slice | **closed** — steps 3–6 verified unmoved after the edit |
| R-5 | This slice's own edits falsify a stated fact elsewhere (the very failure it exists to catch) | low | med | Run the new counting sweep on this slice's own diff as part of AC-5; record the result in the Docs-freshness run section | this slice | **closed** — it fired: `riviera-sdlc` SKILL.md:122 plus one ripple, both patched (Docs-freshness run) |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

*(empty — both entries resolved below.)*

### Resolved

- **Assumption (resolved at phase 0):** a plan doc is warranted despite the slice shipping
  no production code — `riviera-sdlc` rule 6 exempts only a one-line/copy fix, and this has
  five ACs, a case-history requirement, and edits files every future session loads. Outcome:
  written; it earned itself in phase 3, where the plan's R-5 dogfood is what caught the
  `riviera-sdlc` routing-row finding.

- **Assumption (resolved at plan time):** the issue's factual claims still hold today —
  verified at intake: `plan-doc-template.md:20–25` is still hand-authored prose with no
  constant part; `riviera-docs-freshness`'s step 2 is still the rename/removal grep alone;
  `pr-gates.md` close-out step 5 still delegates to the skill without naming a counting
  check; and the six cited plan docs do list `riviera-sdlc`/`riviera-plan-doc` while
  omitting `tdd`, `riviera-review-overlay` and `riviera-docs-freshness`. Outcome: the ACs
  are planned against reality unchanged.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No booking, no beach map, no `availability` row, no
code path at all: the diff is three prose files plus this plan.

## Spring Modulith — modules, interfaces, events

`N/A — no backend code in scope.` No module, port, event, adapter, or dependency grant
changes; `platform/src` is untouched (AC-5 pins that).

### Module ownership (§4a)

`N/A — the slice adds no behavior to any module.` It changes process substrate under
`.claude/skills/`, which no Modulith module owns.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves and no ledger, refund, or commission
statement is touched.

## Angular — frontend surfaces touched

`N/A — no frontend in scope.` `frontend/` is untouched (AC-5 pins that).

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire shape exists in this diff.

## Execution status

> **This section is the session-recovery anchor.** Update it in the SAME commit window
> as the change it records — at every phase boundary AND every SDLC stage transition.

**Stage pointer:** `merge — gates cleared, awaiting the merge and the post-merge close-out items`

**Next action:** confirm CI + the Sonar reported list on the final head, merge PR #448,
then run close-out steps 1-3 and 6-7 (the GitHub-only items; steps 4-5 are already in this
PR).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | `51e537c` (PR #448, draft) |
| 1 — Gap 1: pre-fill the always-on skills in the template | ✅ | `9ad7af3` |
| 2 — Gap 2: counting sweep in `riviera-docs-freshness` + close-out citation | ✅ | `562a07a` |
| 3 — Docs-freshness run over the slice's own diff + close-out | ✅ | `924b22e` |

**Close-out reference:** this slice merges **via PR #448** — recorded as the PR number, never a
merge SHA, per close-out step 4. (A reference, not a claim that the merge has happened: at the
time of writing the gates are still running.)

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` fan-out, Major) | Execution status asserted **"Merged via PR #448"** as settled fact while the same section says the gates had not run — the PR-record-lies failure `pr-gates.md` warns about, inverted | fixed-in-`437e988` — reworded to a close-out *reference* (PR number, never a merge SHA) that does not claim the merge happened |
| F-2 | review (`/code-review` fan-out, Major) | Self-review checklist claimed "risk register has no stale `open` rows (all five closed)" while R-1's Resolution cell still read `open` | fixed-in-`437e988` — R-1 closed with its outcome and shipping commit |
| F-3 | review (`/code-review` fan-out, Major) | Generalization-audit log reported **8** header lines where the command it cites returns **10** — the original run was piped through `head -8`, so `**Next action:**` and `**Files:**` were never seen. The slice's own undercount class, inside its own audit log | fixed-in-`437e988` — count corrected to 10, both extra lines addressed, and the cause recorded in the row |
| F-4 | review (`/code-review` fan-out, Major) | Step 2b's grep targets `platform/src` and declares Javadoc/test-assertion text in scope, but the skill's own **substrate-doc map** — the table it presents as the canonical inventory of what can go stale — had no row for source prose | fixed-in-`437e988` — map gains a `platform/src/**` Javadoc/`package-info`/test-assertion row, scoped to counts and enumerations only |
| F-5 | review (`/code-review` fan-out, Major) | The template's new blockquote **re-listed** the "Anything, always" row's skill names, creating a second manually-synced home — exactly what RV-PROC-1 ("that table is the authority; do not re-list it here") and `riviera-plan-doc` §0 forbid, and the drift class this very slice adds a sweep for | fixed-in-`437e988` — blockquote now points at the row as the authority instead of enumerating it |
| F-6 | review (`/code-review` fan-out, Minor) | The documented grep recipe's illustrative counts (186 / 67) were measured over a **narrower path set** than the command finally shipped, which returns 201 / 77 — so they never matched the recipe as written | fixed-in-`437e988` — restated as ~200 / ~75 with an explicit "re-measure, these date the recipe" instruction, in both the skill and R-3 |
| F-9 | review (`/code-review` fan-out, **Major**) | The "six consecutive slices" claim — inherited verbatim from issue #447 — overstated the evidence. Verified against each cited plan doc: #430's RV-PROC-1 finding was about `riviera-stripe-payments` (its line already listed `riviera-review-overlay`), and #440's was about `riviera-local-debug`; `tdd` and `riviera-plan-doc` have **never** been flagged missing | fixed-in-`bdf09f0` — restated accurately (six consecutive slices each omitted *something*; which skill varied, and it is named), with `tdd`/`riviera-plan-doc` marked as pre-filled prophylactically rather than incident-driven. Issue premise corrected, per the intake gate's "record the drift" rule |
| F-10 | review (`/code-review` fan-out, **Major**) | "One grep found all sixteen at once" mischaracterized #373: its plan doc records **six** found by ordinary review and **ten more** by a substrate grep in a *second* round | fixed-in-`bdf09f0` — restated as 6-then-10 in the skill, `pr-gates.md`, and the new case-history entry. The accurate version is the *stronger* argument: the ten were invisible to file-by-file review precisely because they were never in the diff |
| F-11 | review (`/code-review` fan-out, Major) | `case-history.md` states it is "the one place [the incidents] are told in full", and every `(case history: #NNN)` citation in `riviera-sdlc` has a matching entry — the new #447 rules cited an incident with no entry | fixed-in-`bdf09f0` — added the `## #447` entry covering both gaps; the two new citations now read `(case history: #447)` per the convention |
| F-12 | review — self-caught on the re-review (Minor) | The AC-verification section's own hit counts (AC-2 "2 hits", AC-4 "sixteen → 2") went stale during the fix rounds — a count quietly going wrong inside the slice whose subject is counts quietly going wrong | fixed-in-`dcb0f74` — re-verified at the final head and corrected to 3 and 1, with the change noted rather than silently overwritten |
| F-7 | review (`/code-review` fan-out, Minor) | Blockquote placement: the new Skills-consulted note sits mid-field, where every other blockquote in the template follows a heading | **rejected with rationale** — the header block has no headings, so any note explaining this line is necessarily mid-field, and AC-1 requires the *why* to sit beside the thing it explains. Moving it to a heading would separate the rule from the field it governs |
| F-8 | review (`/code-review` fan-out, Minor) | RV-STYLE-1: the step-2b grep snippet carries a two-line `#` comment header | **rejected with rationale** — RV-STYLE-1 scopes to inline comments inside a code body; these are two *independent* one-line comments inside a fenced example in a markdown doc, each fitting on its line |

## Docs-freshness run

> `riviera-docs-freshness` over `origin/main...HEAD`, including the new counting sweep run
> against this slice's own diff (R-5) — the rule's first exercise, on itself.

**Range:** `origin/main...HEAD` · **Findings: 1** (patched, plus its one ripple).

- **Step 1 — fact-changes in the diff.** Three prose files change: (a) the plan-doc
  template's Skills-consulted guidance gains a pre-filled constant + a blockquote;
  (b) `riviera-docs-freshness`'s procedure step 2 splits into `2a`/`2b` and its frontmatter
  description gains the counting-sweep trigger; (c) `pr-gates.md` close-out step 5 gains a
  bullet. Nothing is renamed or removed; no mechanism is swapped; no module, endpoint,
  value set, or skill is added or deleted.
- **Step 2a — rename/removal grep.** `N/A — nothing renamed or removed.` The one
  identifier-shaped change is `riviera-docs-freshness`'s internal step numbering, which R-4
  designed away by folding the sweep into step 2; `grep -rniE "docs-freshness.{0,60}step
  [0-9]"` over the repo confirms the only external citation is `riviera-sdlc`'s own "merge
  close-out step 5", which this slice does not move.
- **Step 2b — counting sweep (dogfood, R-5).** Did this slice make the Nth of something?
  Yes: the template now pre-fills **five** always-on entries where the routing table's
  always-on row named **three**. Swept for statements that count either the always-on set
  or the skill's procedure steps —
  `grep -rniE 'always[- ]on|anything, always' CLAUDE.md .claude/skills docs/agents`, then
  the phrasing grep `'\b(the|both|only) (two|three|2|3)\b|\bof the (two|three)\b'`
  filtered to skills/plan-doc vocabulary.
  **Finding (the sweep's whole point — it is not in the diff):**
  `.claude/skills/riviera-sdlc/SKILL.md:122` — the **"Anything, always"** routing row named
  three skills and omitted `riviera-docs-freshness`, so an agent consulting the table alone
  would reproduce gap 1 exactly. → **patched in place**: the row now carries
  `riviera-docs-freshness` with its due-condition and points at the template's pre-fill.
  **Ripple, caught by re-running the sweep after the fix** (step 2b's own
  re-run-after-the-fix-round rule, which #373 learned the hard way): the template's new
  blockquote described that row as naming three *plus* docs-freshness — true when written,
  false one commit later. → patched to match.
  Every other phrasing hit is about a different subject and stays true: the two-suite e2e
  split, `payment`'s two ports, the two themes, the two-template module layout, the three
  review tools, the three docs-only close-out PRs.
- **Step 3 — reverse walk.** `CLAUDE.md:314` ("plan-doc discipline + the canonical
  template") and `CLAUDE.md:327` ("substrate-doc staleness audit (merge close-out step 5;
  every epic close-out)") both remain true — the skills gained content, not a new home or
  trigger point. `riviera-review-overlay`'s RV-PROC-1 text is untouched by this slice and
  stays accurate: it checks the line against the diff either way.
- **Step 4 — patch or flag.** Two patches (the finding + its ripple), in this phase's
  commit window. Nothing changes a decision's substance, so nothing is flagged to the
  human.
- **Step 5 — report.** Above. **Step 6 — graph refresh:** skipped — `graphify-out/` is
  absent in this cloud clone (gitignored, so a fresh clone starts without it); nothing to
  refresh, nothing to commit.

---

## File structure

> Map files to be created/modified before defining tasks.

- `.claude/skills/riviera-plan-doc/references/plan-doc-template.md` — gap 1: the
  Skills-consulted line ships the always-on constant pre-filled, with the case-history
  blockquote beside it.
- `.claude/skills/riviera-docs-freshness/SKILL.md` — gap 2: procedure step 2 splits into
  `2a` (existing rename/removal grep, verbatim) + `2b` (the new counting sweep); the
  frontmatter description gains the sweep's trigger.
- `.claude/skills/riviera-sdlc/references/pr-gates.md` — gap 2: close-out step 5 cites
  the counting sweep so it is reachable from the gate.
- `.claude/skills/riviera-sdlc/SKILL.md` — **not planned; added in phase 3** as the
  counting sweep's own first finding: the "Anything, always" routing row named three
  skills where the template now pre-fills five.
- `.claude/skills/riviera-sdlc/references/case-history.md` — **not planned; added at the
  review gate** (F-11): the file states it is the one place these incidents are told in
  full, and both new rules cite #447, so it gets the `## #447` entry.
- `docs/plans/sdlc-always-on-skills-and-counting-sweep.md` — this plan.

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/sdlc-always-on-skills-and-counting-sweep.md`

- [x] **Step 1: Intake grill** — verify the issue's claims against the three target files,
  the in-flight PR list, and the six cited plan docs. (Done at plan entry; outcome in
  Open questions → Resolved.)
- [x] **Step 2: Write this plan doc**, ACs first.
- [x] **Step 3: Commit + push, then open the draft PR immediately** — CI fires on
  `pull_request` only, so a branch with no PR gets no CI at all (#417). → PR #448, draft.

---

## Phase 1 — Gap 1: pre-fill the always-on skills in the plan-doc template

**Files:** Modify `.claude/skills/riviera-plan-doc/references/plan-doc-template.md:20-25`

- [x] **Step 1: Record the before-state** (the "failing test" for a prose deliverable) —

```bash
grep -A20 '^\*\*Skills consulted:\*\*' \
  .claude/skills/riviera-plan-doc/references/plan-doc-template.md \
  | grep -oE 'riviera-sdlc|`tdd`|riviera-review-overlay|riviera-docs-freshness|riviera-plan-doc' \
  | sort -u
```

→ **observed: `riviera-sdlc` alone** (1 of 5). The plan first predicted 0; the one hit is
the guidance prose naming the *routing gate* it quotes, not a pre-filled entry, so the gap
is real and the count of **distinct always-on names present** is the honest pin. Everything
else the line names is a *routed* example (`postgres`, `codebase-design`,
`angular-developer`) — precisely the gap.

- [x] **Step 2: Rewrite the Skills-consulted line** so the five always-on entries are
  pre-filled with a fill-in parenthesis each, `riviera-docs-freshness` demanding an
  explicit **ran** (range + findings) or `N/A — <reason>`, and the routed skills follow as
  the extension point. Keep the existing "must cover every area the diff touches" rule —
  that is what RV-PROC-1 checks.

- [x] **Step 3: Add the adjacent blockquote** carrying the why in one line: the six-slice
  run **#427, #430, #436, #440, #374, #373**; *extend, don't replace*; and why the
  docs-freshness parenthesis must stay explicit (not-listed vs not-applicable were
  indistinguishable, which is how it slipped five times).

- [x] **Step 4: Re-run the step-1 command** → **all five** distinct names present
  (`riviera-sdlc`, `riviera-plan-doc`, `` `tdd` ``, `riviera-review-overlay`,
  `riviera-docs-freshness`).

- [x] **Step 5: Generalization-audit pass** — where else does "a template asking a question
  whose answer is partly constant" apply? Search the template for other hand-authored
  lines with a constant part; record the decision in the log below.

- [x] **Step 6: Commit** — `git commit -m "docs(#447): pre-fill the always-on skills in the plan-doc template"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Gap 2: the counting sweep + its close-out citation

**Files:** Modify `.claude/skills/riviera-docs-freshness/SKILL.md` (frontmatter +
procedure step 2) · `.claude/skills/riviera-sdlc/references/pr-gates.md` (close-out step 5)

- [x] **Step 1: Record the before-state** —

```bash
grep -rn "counting sweep" .claude/skills/ | wc -l
```

→ **observed 0** before the edit, as expected.

- [x] **Step 2: Split procedure step 2** into `2a` (the existing rename/removal grep,
  text unchanged) and `2b` (the counting sweep), so steps 3–6 keep their numbers (R-4).

- [x] **Step 3: Write `2b`** with: the trigger (*this slice made an Nth instance of
  something that previously had N−1* — listener, counter, event, module, profile,
  transport, sweep); **why the diff cannot reveal it**; the measured two-step grep recipe
  (phrasing grep filtered by the grown thing's vocabulary); the "read each hit,
  present-tense facts only" discipline, including that Javadoc and test-assertion
  descriptions count as stated facts; and #373's sixteen-statement case history in one
  line, plus the re-run-after-the-fix-round note (`PaymentDueAnnouncerIT`).

- [x] **Step 4: Add the frontmatter trigger clause** so the sweep is reachable from the
  skill's "when to load" description, not only from its body.

- [x] **Step 5: Cite it from `pr-gates.md` close-out step 5** as a bullet under the
  existing split, in the gate's own voice.

- [x] **Step 6: Re-run the step-1 command** → **3** hits across the two files (the skill's
  frontmatter trigger + its step-2b heading, and the close-out bullet in `pr-gates.md`).
  Steps 3–6 of the skill's procedure kept their numbers, as R-4 required.

- [x] **Step 7: Commit** — `git commit -m "docs(#447): add the counting sweep to riviera-docs-freshness"`

- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Docs-freshness run over the slice's own diff + close-out

**Files:** Modify `docs/plans/sdlc-always-on-skills-and-counting-sweep.md`

- [x] **Step 1: Run `riviera-docs-freshness`** over `origin/main...HEAD`, *including the
  new counting sweep on this slice's own diff* (R-5) — the first exercise of the rule.
- [x] **Step 2: Record the run** in the Docs-freshness run section (range + findings +
  action per finding), and patch anything it flags.
- [x] **Step 3: Verify every AC** in the Acceptance-criteria verification section.
- [x] **Step 4: Finalize the Execution status + Self-review checklist**, citing
  `merged via PR #448` (never a merge SHA), then mark the PR ready for review.
- [x] **Step 5: Commit** — `git commit -m "docs(#447): record the docs-freshness run and close out the plan"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | Phase 3 (counting sweep, dogfooded on this slice's own diff — R-5) | Statements counting the always-on skill set, or `riviera-docs-freshness`'s procedure steps | `grep -rniE 'always[- ]on\|anything, always' CLAUDE.md .claude/skills docs/agents`, then the N−1 phrasing grep filtered to skills/plan-doc vocabulary | 1 real: `riviera-sdlc` SKILL.md:122's "Anything, always" row named three skills where the template now pre-fills five — **plus one ripple**, the template blockquote that described that row, found only by re-running the sweep after the fix | **Fixed all.** Row now names `riviera-docs-freshness` with its due-condition and points at the pre-fill; blockquote patched to match. Every other phrasing hit is a "two/three" of a different subject (two-suite e2e split, two payment ports, two themes, two-template layout, three review tools) and stays true. |
| 2026-07-30 | Phase 1 (new pattern: pre-fill the constant part of a hand-authored line) | Other plan-doc-template lines whose answer is partly constant across slices | `grep -n '^\*\*[A-Za-z].*:\*\*' .claude/skills/riviera-plan-doc/references/plan-doc-template.md` | 10 header lines: Goal, Architecture, **Persistence**, Source of intent, Skills consulted, Branch, **Standards**, Stage pointer, Next action, Files | **Subset — no further edits.** Two lines already ship their constant pre-filled (`Persistence:` "JDBC only (invariant #1)"; the Angular section's `Standards:` list), so the pattern is proven rather than novel, and this slice applies it to the one line the review gate has actually caught six times. Goal / Architecture / Source-of-intent / `Next action:` / `Files:` are wholly slice-specific (no constant to lift); `Branch:` and `Stage pointer:` already spell their convention out inline. *(Count corrected at the review gate from 8 — the original run was piped through `head -8`, so two lines were never seen: the undercount class this slice exists to catch, inside its own audit log.)* |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1:** Run
  `grep -A20 '^\*\*Skills consulted:\*\*' .claude/skills/riviera-plan-doc/references/plan-doc-template.md | grep -oE 'riviera-sdlc|riviera-plan-doc|\`tdd\`|riviera-review-overlay|riviera-docs-freshness' | sort -u`
  → **all five** distinct names (was `riviera-sdlc` alone), and the
  `riviera-docs-freshness` entry reads `**ran** over <range>, N findings — **or** N/A —
  <reason>`. Verified in the phase-1 commit.
- [x] **AC-2:** Run `grep -n "counting sweep" .claude/skills/riviera-docs-freshness/SKILL.md`
  → **3** hits after the fix rounds: the frontmatter trigger, the **step 2b** heading
  inside the Procedure (which states the why-the-diff-cannot-reveal-it rule and carries the
  runnable two-step grep recipe), and the substrate-doc map's new source-prose row added
  for F-4. *(Was 2 at the phase-2 commit — corrected here rather than left stale, since a
  count going quietly wrong is this slice's own subject.)*
- [x] **AC-3:** Run `grep -n "counting sweep" .claude/skills/riviera-sdlc/references/pr-gates.md`
  → **1** hit, inside merge close-out **step 5**. Verified at the final head.
- [x] **AC-4:** Run `grep -c "#427" .claude/skills/riviera-plan-doc/references/plan-doc-template.md`
  → **1** (the six-slice run, gap 1), and `grep -c "sixteen"
  .claude/skills/riviera-docs-freshness/SKILL.md` → **1** (step 2b's case history, gap 2 —
  the second occurrence went away when F-10 reworded that paragraph). The fuller account
  now also lives in `case-history.md`'s `## #447` entry (F-11). Verified at the final head.
- [x] **AC-5:** Run
  `git diff --name-only origin/main...HEAD | grep -cvE '^(\.claude/skills|docs/plans)/'`
  → **0** (5 files: 4 under `.claude/skills/`, 1 under `docs/plans/`; `platform/` and
  `frontend/` untouched), and the **Docs-freshness run** section above is filled with the
  range, per-step outcome, and both patches. Verified in the phase-3 commit.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying command (no test class exists for
      prose — the deviation is stated in the AC blockquote rather than papered over).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases — `N/A`, no code.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1) — `platform/` untouched.
- [x] **Availability** section filled (justified `N/A`) — no code path touches availability (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — `N/A`, nothing in scope touches them.
- [x] **Modulith** section filled (justified `N/A`); no Java in the diff, module structure unchanged (invariant #11).
- [x] **Payment/payout** section filled (`N/A`); no money moves (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — `N/A`, unchanged.
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — `N/A`, no time handling.
- [x] Booking codes unguessable (invariant #7) — `N/A`.
- [x] Flyway migration present for schema changes (invariant #12) — `N/A`, no schema change, no version claimed.
- [x] **Frontend** standards met or deviation documented — `N/A`, `frontend/` untouched.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows (all five closed with their outcome); Open Questions empty.
- [x] **Close-out written in THIS PR** — this doc's final state is committed here, citing
      `merged via PR #448`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — `/code-review` started at **rung 1** of the
      `references/pr-gates.md` §1 ladder (the Skill probe succeeded; no fallback needed),
      running the plugin's full workflow: eligibility check, CLAUDE.md map, change summary,
      five parallel reviewers, then verification of each finding against the files. The
      subagent fan-out was authorized by the maintainer, since this session's standing
      instruction withholds the Agent tool. `riviera-review-overlay` was layered on top
      (RV-PROC-1 walked and re-walked after each fix round; the RV-BE/FE/CT banks are `N/A`
      — no code in the diff). **11 findings: 9 fixed, 2 rejected with rationale**; see the
      findings register.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
