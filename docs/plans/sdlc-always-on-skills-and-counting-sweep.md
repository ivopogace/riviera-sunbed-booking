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
line) · `riviera-docs-freshness` (**due**, runs in phase 3 over `origin/main...HEAD` — the
skill is also the second artifact under change, so this slice dogfoods its new counting
sweep on its own diff; result recorded in the Docs-freshness run section)

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
| R-1 | The pre-filled line becomes cargo-cult — an author ships `tdd (build)` on a slice built without a test, so the line is *present* and *false*, which is worse than absent | med | med | Every pre-filled entry carries a parenthesis the author must fill with what it actually did (not a fixed label); `riviera-docs-freshness` additionally forces ran-or-N/A-with-reason; RV-PROC-1 re-checks the line against the diff at every review incl. fix commits | this slice | open |
| R-2 | A future editor "simplifies" the pre-fill back to a bare placeholder, restoring the gap | med | med | The adjacent blockquote records the six-slice run (#427/#430/#436/#440/#374/#373) and says *extend, don't replace* — AC-1 + AC-4 | this slice | open |
| R-3 | The counting sweep is too noisy to run — an unscoped phrasing grep returns 186 hits repo-wide, and a check nobody runs is not a check | high | med | Document the **two-step** recipe measured on this repo: phrasing grep **filtered by the grown thing's vocabulary** (67 hits for the mail lineage, of which #373's review confirmed 16 real), plus the present-tense-only scope discipline that discards historical narrative | this slice | open |
| R-4 | Adding a procedure step to `riviera-docs-freshness` renumbers steps 3–6 and silently breaks any doc citing "step N" of that skill | low | med | Fold the sweep into step 2 as `2a`/`2b` so later numbers are untouched; verified by grep that no doc outside the skill cites its internal step numbers (only `riviera-sdlc`'s *own* "close-out step 5" is cited externally, which this slice does not move) | this slice | open |
| R-5 | This slice's own edits falsify a stated fact elsewhere (the very failure it exists to catch) | low | med | Run the new counting sweep on this slice's own diff as part of AC-5; record the result in the Docs-freshness run section | this slice | open |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Assumption:** a plan doc is warranted despite the slice shipping no production code —
  `riviera-sdlc` rule 6 exempts only a one-line/copy fix, and this has five ACs, a
  case-history requirement, and edits three files that every future session loads.
  *Owner:* this slice · *Resolves by:* phase 0 (accepted on write; no further action).

### Resolved

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

**Stage pointer:** `implement (phase 3 — docs-freshness run over the slice's own diff)`

**Next action:** run `riviera-docs-freshness` over `origin/main...HEAD`, including the new
counting sweep dogfooded on this diff (R-5); record the run, verify AC-5, then mark PR #448
ready for review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | `51e537c` (PR #448, draft) |
| 1 — Gap 1: pre-fill the always-on skills in the template | ✅ | `9ad7af3` |
| 2 — Gap 2: counting sweep in `riviera-docs-freshness` + close-out citation | ✅ | see phase-2 commit below |
| 3 — Docs-freshness run over the slice's own diff + close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet — gates not reached | — |

## Docs-freshness run

> Filled in phase 3: `riviera-docs-freshness` over `origin/main...HEAD`, including the new
> counting sweep run against this slice's own diff (R-5). Range, per-step outcome, and one
> line per finding (`doc:line — stated fact — contradicted by — action`).

*(pending — phase 3)*

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

- [ ] **Step 1: Run `riviera-docs-freshness`** over `origin/main...HEAD`, *including the
  new counting sweep on this slice's own diff* (R-5) — the first exercise of the rule.
- [ ] **Step 2: Record the run** in the Docs-freshness run section (range + findings +
  action per finding), and patch anything it flags.
- [ ] **Step 3: Verify every AC** in the Acceptance-criteria verification section.
- [ ] **Step 4: Finalize the Execution status + Self-review checklist**, citing
  `merged via PR #NN` (never a merge SHA), then mark the PR ready for review.
- [ ] **Step 5: Commit** — `git commit -m "docs(#447): record the docs-freshness run and close out the plan"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | Phase 1 (new pattern: pre-fill the constant part of a hand-authored line) | Other plan-doc-template lines whose answer is partly constant across slices | `grep -n '^\*\*[A-Za-z].*:\*\*' .claude/skills/riviera-plan-doc/references/plan-doc-template.md` | 8 header lines: Goal, Architecture, **Persistence**, Source of intent, Skills consulted, Branch, **Standards**, Stage pointer | **Subset — no further edits.** Two lines already ship their constant pre-filled (`Persistence:` "JDBC only (invariant #1)"; the Angular section's `Standards:` list), so the pattern is proven rather than novel, and this slice applies it to the one line the review gate has actually caught six times. Goal / Architecture / Source-of-intent are wholly slice-specific (no constant to lift); `Branch:` and `Stage pointer:` already spell their convention out inline. |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1:** Run
  `grep -A20 '^\*\*Skills consulted:\*\*' .claude/skills/riviera-plan-doc/references/plan-doc-template.md | grep -oE 'riviera-sdlc|riviera-plan-doc|\`tdd\`|riviera-review-overlay|riviera-docs-freshness' | sort -u`
  → **all five** distinct names (was `riviera-sdlc` alone), and the
  `riviera-docs-freshness` entry reads `**ran** over <range>, N findings — **or** N/A —
  <reason>`. Verified in the phase-1 commit.
- [x] **AC-2:** Run `grep -n "counting sweep" .claude/skills/riviera-docs-freshness/SKILL.md`
  → **2** hits: the frontmatter trigger and the **step 2b** heading inside the Procedure,
  which states the why-the-diff-cannot-reveal-it rule and carries the runnable two-step
  grep recipe. Verified in the phase-2 commit.
- [x] **AC-3:** Run `grep -n "counting sweep" .claude/skills/riviera-sdlc/references/pr-gates.md`
  → **1** hit, at line 252, inside merge close-out **step 5**. Verified in the phase-2 commit.
- [x] **AC-4:** Run `grep -c "#427" .claude/skills/riviera-plan-doc/references/plan-doc-template.md`
  → **1** (the six-slice run, gap 1), and `grep -c "sixteen"
  .claude/skills/riviera-docs-freshness/SKILL.md` → **2** (step 2b's case history plus the
  close-out-facing summary, gap 2). Verified in the phase-1 / phase-2 commits.
- [ ] **AC-5:** *(pending — phase 3)*

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying command (no test class exists for
      prose — the deviation is stated in the AC blockquote rather than papered over).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases — `N/A`, no code.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [ ] **Payment/payout** section filled (or N/A) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
