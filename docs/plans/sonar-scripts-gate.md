# Sonar gate reads `scripts/` — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A scripts-only pull request reaches the SonarCloud gate with its `scripts/*.mjs` lines
analysed and covered, so a green gate on such a PR means "read and clean" and never "never
looked", and `sonar-project.properties` says so in the file.

**Architecture:** `scripts` joins `sonar.sources`; the guard suites (`**/*.test.mjs`) join
`sonar.exclusions` exactly as the frontend's Vitest specs already do; the coverage the scanner
reads comes from Node's built-in test runner (`node --test --experimental-test-coverage`, lcov
reporter), produced **inside the `sonar` job** rather than in `Repo hygiene (diff-scoped)` —
that job runs on pull requests only, and a `needs:` on a skipped job would skip the scan on every
push to `main`. The most significant decision is *analyse with real coverage* over *record a
deliberate exclusion*: measured locally, the suites already cover 96% of the guard lines, so the
≥80% new-code bar is satisfiable by evidence rather than by waiver.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched.

**Source of intent:** GitHub issue #954 (surfaced at PR #953's Sonar gate, issue #952).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue's premise against the live project: SonarCloud's `ncloc_language_distribution` for the
project is `css, java, ts, web`, no `js` at all, and PR #953's measures carry no `new_lines`;
confirmed `.mjs` is in the project's effective `sonar.javascript.file.suffixes`) ·
`riviera-plan-doc` (this template — forced the "where is the lcov produced" decision to be
made before `ci.yml` was touched, which is what surfaced the skipped-`needs` trap) · `tdd` (the
red is the measurement: no `SF:` record for any guard before, one per non-test `.mjs` after;
the PR's own Sonar analysis is the green) · `riviera-review-overlay` (review gate — at ready for
review) · `riviera-docs-freshness` (**ran** over `828f0f09..HEAD` — rename grep: the only substrate line
that states what Sonar reads is `pr-gates.md` §2, edited by this slice; counting sweep over
"two/both/three" near Sonar, lcov, coverage and source vocabulary: every hit is another subject;
one finding, the properties file's own "(backend + frontend)" header, patched) ·
`riviera-local-debug` (unshallowed the clone before the guards' `--diff` runs; the
`node --test` coverage measurement below was its first invocation) · `grilling` (the four
decisions the issue leaves to the slice, answered under *Open questions / Assumptions*).

**Branch:** `claude/sdlc-954-zdz36e` (the session's designated remote branch stands in for
`feature/sonar-scripts-gate`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given `sonar-project.properties`, when a reader looks for whether `scripts/` is
      analysed, then the file states it (the `.mjs` guards and their shared modules are analysed and
      covered; the guard suites are excluded like the Vitest specs; the `.sh` files are analysed as
      shell with no coverage measure) beside the `sonar.sources` line — no diff against the repo map
      needed. *Seam:* the properties file · *Pinned by:* reading the file at the close-out commit.
- [x] **AC-2:** Given the scan runs with `scripts` in `sonar.sources`, when the PR's analysis is
      read, then the eleven `.mjs` files are indexed and analysed as JavaScript and the false-zero
      check has something to read. *Seam:* the `sonar` job's scanner log and the SonarCloud web API
      for this PR · *Pinned by:* the log ("Quality profile for js", "Analyzing 11 file(s)", the
      coverage sensor naming `scripts/coverage/lcov.info`) and the project measures on the PR:
      `lines_to_cover` 18,388 against `main`'s 14,517 (+3,871; the lcov holds 3,873). `new_lines`
      is absent on this PR because its diff changes no line under `sonar.sources` — the very class
      §2 now names — so the `new_lines` half is observed on the first scripts-touching PR, by the
      §2 check that reads it.
- [x] **AC-3:** Given the `sonar` job produces `scripts/coverage/lcov.info` from the guard suites,
      when the same command runs locally, then the lcov carries one `SF:` record per non-test
      `scripts/*.mjs` (11 of 11, spawned CLIs included) at repo-root-relative paths, and the scan
      reads it. *Seam:* the lcov file the scanner reads · *Pinned by:* the `SF:` count check in
      Phase 0 step 4 (11/11), and the PR's `uncovered_lines` 945 against `main`'s 810 (+135; the
      lcov's 137).
- [x] **AC-4:** Given `riviera-sdlc` `references/pr-gates.md` §2, when the false-zero paragraph
      is read, then it names the class "diff outside `sonar.sources`" explicitly, says the green
      proves nothing there, and says what to record in the plan's Sonar note. *Seam:* the
      reference's text · *Pinned by:* reading §2 against the issue's AC-4.
- [x] **AC-5:** Given the first analysis of the pre-existing `scripts/` tree, when the PR's issue
      list is pulled, then every entry is code-fixed or resolved with a written rationale before
      merge (`pr-gates.md` §2 step 3). *Seam:* `api/issues/search` for this PR · *Pinned by:* the
      Findings register (S-1: total 0, hotspots 0, with all eleven files fully analysed).

## Non-goals

- Doing anything about the `.sh` files under `scripts/` beyond stating what happens to them. The
  first analysis showed the plan does carry a shell analyser (the IaC one; a "Sonar way" shell
  profile), so they are read, without a coverage measure; the properties file says exactly that.
- Moving the guard tests out of `Repo hygiene (diff-scoped)`. That job stays the gate on the
  suites (its no-`node_modules` constraint holds there); the `sonar` job's run only produces the
  lcov.
- Adding `scripts/**` to `sonar.coverage.exclusions`. The coverage is real; a waiver would hide it.
- A `sonar.tests` declaration. The precedent for test files in this file is exclusion
  (`**/*.spec.ts`); a separate test-file partition would need `sonar.test.inclusions` as well and
  put ~4,000 lines of suites under the test-specific rule set for no gain this slice needs.
- Raising the coverage of `angular-cli-mcp.mjs` (64%) and `playwright-mcp.mjs` (72%) — the MCP
  launchers' uncovered lines are their `spawn` paths; new-code coverage counts only changed lines.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behaviour, replaces no surface.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The first analysis reports pre-existing `scripts/` issues on this PR as new (the target branch never analysed them) | med | med | pull the list at the Sonar gate; each entry is code-fixed (re-entering at Implement) or resolved with a rationale; AC-5 | session | closed — 0 issues, 0 hotspots, 0 duplicated blocks on the PR with all eleven files analysed in full (cache miss, `FILE_CHANGED [11/201]`); `main`'s first post-merge analysis is the whole-tree read, noted for the close-out |
| R-2 | Duplicated-block detection across the eleven guard suites trips the 0-duplication bar | low | med | the suites are excluded from analysis (`**/*.test.mjs`); the guards themselves share `git-diff.mjs` by import, not by copy | session | closed — `new_duplicated_blocks` 0 |
| R-3 | `needs:` on the hygiene job skips the scan on `main` pushes | — | high | the lcov is produced in the `sonar` job itself (see Architecture); the hygiene job is untouched | session | closed by design |
| R-4 | The `sonar` job's extra Node setup + test run lengthens the critical path | low | low | measured locally at 17 s for the suites; setup-node from `.nvmrc` is cached by the action; the job's 15-minute cap holds | session | closed — the job ran 1 min 32 s wall on the PR (suites 13.5 s, scanner 1 min 0 s) |
| R-8 | A stated fact about what the analyser does is wrong until the first analysis has been read | med | low | read the scanner log at the Sonar gate before finalising the properties comment | session | closed — it was (F-1), fixed from the log |
| R-5 | A guard-suite failure now reds the `sonar` job too | low | low | it reds the hygiene job on the same push already; the second red carries the same message | session | closed by design |
| R-6 | The lcov's `SF:` paths do not match Sonar's file keys | low | high | Node writes them repo-root-relative (`SF:scripts/git-diff.mjs`), the form the scanner wants when run from the root; no normalisation step, unlike the frontend's | session | closed — measured |
| R-7 | New prose in `pr-gates.md` trips the skill-prose gate (an issue number in an added skill line) | med | low | `node scripts/check-inline-comments.mjs --diff origin/main` before each push; the new paragraph names no issue | session | closed — exit 0 at the phase-1 commit |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption (issue decision 1):** `scripts/` joins `sonar.sources`. The issue calls the "no"
  outcome defensible; this slice takes "yes" because the cost it names (what the existing tree
  reports) is measurable on this PR and the benefit is the one the issue argues for: the tree whose
  defects are silent-by-construction gets read. — measured at the Sonar gate: the cost was zero
  entries (S-1). The maintainer overrules at review if the deliberate-exclusion outcome is
  preferred; the properties file then records that instead. 2cd3be35.
- **Assumption (issue decision 2):** the suites are excluded via `sonar.exclusions`, the
  `**/*.spec.ts` precedent, not declared as `sonar.tests`. — 2cd3be35.
- **Assumption (issue decision 3):** real coverage from `node --test`, not a waiver. Measured:
  96.46% lines / 89.43% branches over the eleven non-test `.mjs` files, spawned CLIs included
  (Node's runner passes `NODE_V8_COVERAGE` to the child processes the harness spawns); the scan read
  it (AC-3). — 2cd3be35.
- **Assumption (issue decision 4):** the answer is not "no" — see decision 1.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; CI configuration and docs only.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — no frontend surface.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** DONE — merged via PR #963

**Next action:** none in the repo; the post-merge items are GitHub edits only (the PR closes #954;
pull `main`'s first post-merge issue list for `scripts/` once — the PR analysis judged all eleven
files, so it is expected empty, and any entry becomes a follow-up issue).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `sonar-project.properties` + `ci.yml`: analyse `scripts/`, produce and read its lcov | ✅ | 2cd3be35 |
| 1 — `pr-gates.md` §2 names the outside-`sonar.sources` class | ✅ | f647bcd6 |
| 2 — first-analysis triage: fix or resolve what Sonar reports on `scripts/`; close-out | ✅ | the close-out commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| S-1 | sonar (PR analysis of f647bcd6) | quality gate passed; `api/issues/search` total 0; hotspots 0; `new_bugs`/`new_vulnerabilities`/`new_code_smells`/`new_violations` 0; `new_duplicated_blocks` 0; `new_lines` and `new_coverage` absent — this PR's own diff lies outside `sonar.sources` (the §2 class), so the gate applied to no line of it; what it did prove is AC-2/AC-3's evidence: the eleven `.mjs` files analysed in full and their lcov read (`lines_to_cover` +3,871 vs `main`, `uncovered_lines` +135, project coverage 92.7% → 93.2%) | clear — recorded as §2 now asks |
| F-1 | CI (the scanner log) | the properties comment and the §2 paragraph said the `.sh` files are not analysed ("no shell analyser"); the log shows `Sensor IaC Shell Sensor: 5/5 source files have been analyzed` under a "Sonar way" shell profile | fixed in the close-out commit: both say "analysed as shell, no coverage measure"; the `lines_to_cover` delta shows they add no lines to cover |
| F-2 | docs-freshness (this diff) | `sonar-project.properties` line 1 still said "(backend + frontend)" | patched in the close-out commit |

---

## File structure

- `sonar-project.properties` — `scripts` in `sonar.sources`, `**/*.test.mjs` excluded, the
  scripts lcov in `sonar.javascript.lcov.reportPaths`, and the statement AC-1 asks for
- `.github/workflows/ci.yml` — the `sonar` job sets up Node and runs the guard suites with
  coverage to `scripts/coverage/lcov.info` before the scan
- `.gitignore` — `/scripts/coverage/`, so the same command run locally leaves no untracked noise
- `.claude/skills/riviera-sdlc/references/pr-gates.md` — §2's false-zero paragraph names the
  class
- `docs/plans/sonar-scripts-gate.md` — this plan
- `docs/plans/ci-docs-only-push.md` — retired at close-out (its PR merged)
- `docs/plans/structural-net-membership-rule.md` — retired at close-out (its PR merged)

---

## Phase 0 — Analyse `scripts/`, produce and read its lcov

**Files:** Modify `sonar-project.properties` · Modify `.github/workflows/ci.yml` (the `sonar`
job) · Modify `.gitignore`

- [x] **Step 1: Write the failing test** — the check is a shell one-liner over the lcov the
      scanner will read: every non-test `scripts/*.mjs` has an `SF:` record.

```bash
node --test --experimental-test-coverage \
  --test-coverage-include='scripts/**' --test-coverage-exclude='scripts/*.test.mjs' \
  --test-reporter=lcov --test-reporter-destination=scripts/coverage/lcov.info \
  --test-reporter=spec --test-reporter-destination=stdout \
  "scripts/*.test.mjs"
diff <(ls scripts/*.mjs | grep -v '\.test\.mjs$' | sort) \
     <(grep '^SF:' scripts/coverage/lcov.info | sed 's/^SF://' | sort) && echo "all guards covered"
```

- [x] **Step 2: Run it, verify it fails** — with no lcov produced, the `diff` has no right-hand
      side → FAIL (no file). Before this slice the scanner read no such file at all. The first
      green attempt failed the same way for a second reason: Node's reporter does not create the
      destination directory, so the CI step carries a `mkdir -p` — a bug the red caught before CI.
- [x] **Step 3: Minimal implementation** — the properties lines, the `sonar` job steps, the
      ignore rule.
- [x] **Step 4: Run it, verify it passes** — the command above → `all guards covered`, 11 records;
      265 tests, 0 failures; 96.46% lines / 89.43% branches.
- [x] **Step 5: Generalization-audit pass** — population: every job that consumes a `needs:` whose
      producer is conditional on the event; see the log.
- [x] **Step 6: Commit** — `git commit -m "Analyse scripts/ in the Sonar scan with real coverage (#954)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit.

## Phase 1 — `pr-gates.md` §2 names the class

**Files:** Modify `.claude/skills/riviera-sdlc/references/pr-gates.md`

- [x] **Step 1: The failing test** — §2's false-zero paragraph, read against the issue's AC-4:
      it names "not analysed yet" and "red build skipped the scan" as the two ways a zero lies,
      and not the third — a diff outside `sonar.sources`.
- [x] **Step 3: Minimal implementation** — one paragraph naming the class and what to record.
- [x] **Step 4: Verify** — `node scripts/check-inline-comments.mjs --diff origin/main` exits 0.
- [x] **Step 6: Commit** — `git commit -m "Name the outside-sonar.sources class in the Sonar gate (#954)"`

## Phase 2 — First-analysis triage and close-out

- [x] Pull the PR's issue list and measures; record them in the Findings register; fix or
      resolve each entry through the loop (S-1 clear; F-1 and F-2 fixed); retire the two merged
      plan docs; finalize this doc in the last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | phase 2 (F-1) | substrate statements about which languages the scan reads (the properties file, §2) | `grep -rn "shell analyser\|not analysed\|unread" sonar-project.properties .claude/skills/riviera-sdlc` | 2 (the two this slice wrote) | both corrected from the scanner log |
| 2026-09-05 | phase 0 | jobs whose `needs:` names a producer that is itself conditional on the event (the skipped-`needs` trap) | `grep -n "^  [a-z-]*:$\|^    needs:\|^    if:" .github/workflows/ci.yml` | 1 consumer (`sonar`, needs `backend` + `frontend`, both unconditional); 1 conditional job (`repo-hygiene`), needed by nothing | the lcov is produced inside `sonar`; `repo-hygiene` stays unneeded |
| 2026-09-05 | plan | substrate lines stating what Sonar reads (`sonar.sources`, the properties file, coverage exclusions) | `grep -rn "sonar.sources\|sonar-project.properties\|coverage.exclusions" --include=*.md --include=*.yml --include=*.mjs --include=*.json .` (plans excluded) | 0 outside the properties file; the false-zero check in `pr-gates.md` §2 by intent | §2 edited in phase 1; nothing else to repoint |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** read `sonar-project.properties` at the close-out commit.
- [x] **AC-2:** the `sonar` job log on PR #963 and `api/measures/component?...&pullRequest=963&metricKeys=lines_to_cover,uncovered_lines,coverage` against the same call for `main`; the JSON is in the PR body. `new_lines` deliberately not claimed on this PR (see AC-2).
- [x] **AC-3:** Phase 0 step 4 locally (11/11 at 2cd3be35, re-run before the close-out commit); the CI log's coverage table matches it line for line.
- [x] **AC-4:** read §2.
- [x] **AC-5:** `api/issues/search?...&pullRequest=963&resolved=false` → total 0; S-1.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying check.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A, CI configuration and docs only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #963`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`; outcome recorded on PR #963 once it has run (ticked in the commit that carries its fixes, or here if it comes back clean).
