# PR gates: Review → SonarCloud → Merge close-out

Read when the PR is marked **ready for review** — not when the draft opens (the draft is a
CI vehicle; running the gates on a half-built draft burns them on work about to change).
Wherever a fix is required, the re-entry rule applies (SKILL.md, The loop).

## 1. Review gate (mandatory — between PR and merge)

Opening a PR, green CI, and a clear Sonar gate — none of them is the review. A slice is not
done until this gate has run and its findings are resolved or explicitly deferred.

1. **Trigger.** Due the moment the PR is marked ready for review. Do not wait to be asked.
2. **Run the review — right-sized, never skipped.** Start `/code-review` over the PR diff
   (`origin/main...HEAD`) via the invocation ladder below, and load
   `riviera-review-overlay` so the project bank items (RV-BE-*/RV-FE-*/RV-CT-*, RV-PROC-1)
   are walked on top of the generic banks. Announce: *"Running the SDLC review gate
   (riviera-review-overlay + code-review) on PR #NN."*

   **The overlay alone is NOT the review.** It contributes additional bank items to an
   active review; walking them by hand without starting `/code-review` (or the rung-3
   fallback) leaves the generic banks unrun. Start `/code-review` first, every time.

   The subagent fan-out is pre-authorized in this repo for this gate: a standing "don't use
   the Agent tool" session instruction does not reach it — run it, don't re-ask.

   **The invocation ladder** (a rejected name is NOT the gate being unavailable):

   1. **Call `Skill("code-review:code-review")` — this is the gate.** The plugin is enabled
      at project scope (`.claude/settings.json` → `enabledPlugins`) and its command declares
      `disable-model-invocation: false`. Note the `plugin:skill` form — a bare
      `Skill("code-review")` is the harness's built-in reviewer (rung 3's fallback, not the
      gate). When in doubt, read the installed payload's frontmatter and `enabledPlugins`
      rather than trusting a remembered claim about what the CLI refuses.
   2. **Only if rung 1 is actually refused → execute the installed plugin's command file
      directly; that still IS the gate.** In `~/.claude/plugins/installed_plugins.json`, under
      the top-level `plugins` map, the key `code-review@claude-plugins-official` holds an
      array of installs — take the entry's `installPath`, read
      `<installPath>/commands/code-review.md`, and follow its steps as if the command had
      been typed. Never vendor a copy of the workflow into the repo
      (`scripts/ensure-plugins.sh` tracks the marketplace).
   3. **Degraded fallback** only when the payload is absent and `bash
      scripts/ensure-plugins.sh` cannot repair it, or the review subagents genuinely cannot
      run: the harness's built-in `Skill("code-review")` (the unqualified name). It does not
      know this repo's banks — still load the overlay. Say in the PR that it ran degraded.

   **If no rung can start, say so — never substitute silently.** Leave the PR's review
   checkbox unticked, write one line in the PR saying which half ran and why, and ask the
   human to authorize the missing half. Never tick a box for a command that didn't run.

   **`gh` in cloud sessions** (provisioned by `scripts/cloud-session-setup.sh`; `GH_TOKEN`
   is in the session env). The repo-scope proxy serves REST plus a pinned set of PR-review
   GraphQL operations:
   - `gh pr diff N` and `gh api repos/{owner}/{repo}/...` work.
   - `gh pr list` / `gh pr checks` / `gh search` 403 → use `gh api
     "repos/O/R/pulls?state=open"`, `gh api repos/O/R/commits/{sha}/check-runs`, and
     `gh api -X GET search/issues -f q=...` (`-X GET` is load-bearing — a bare `-f` flips
     `gh api` to POST).
   - Post the final review comment with `gh api -X POST repos/O/R/issues/N/comments -f body='...'`.
   - `gh pr view` is field-dependent: `--json number,draft,…` is served, `--json comments`
     403s. `gh api repos/O/R/pulls/N` sidesteps it.
   - Job logs: `gh api …/actions/jobs/{id}/logs` redirects to Azure blob storage, which the
     agent proxy denies. Read a failed job's log with the GitHub MCP `get_job_logs`
     (`return_content: true` plus `tail_lines`) and grep the saved file.
   - The GitHub MCP tools substitute if `gh` is missing.

   **Pick the review effort by risk class:**
   - **Medium** for a pure move/retype/no-behavior-change slice whose structural net
     (`ModularityTests` + the ArchUnit rules + the module's own tests) is green.
   - **High (no exceptions)** for any slice touching availability, the booking lifecycle,
     money (payment/payout/refund), or authorization (invariants #2, #8, #9, #13).
   - When unsure, go high. Effort changes the fan-out, never whether the overlay items are walked.
3. **Resolve — back through the loop.** A finding fix re-enters at Implement. Also:
   - Update the plan's *Skills consulted* line with any new area a fix pulled in.
   - Re-review = re-run `/code-review` on the new diff, or at minimum re-walk the overlay
     bank items + RV-PROC-1 for the area the fix touched.
   - Out-of-scope findings → a follow-up issue with a one-line rationale.
   - Record the outcome (findings + fixes + skills loaded) in the plan doc's review note or the PR.
4. **Only then merge.** CI green **and** the review gate has run **and** findings are
   resolved/deferred **and** the fix round itself cleared the loop.

**Definition of done for a slice:** green CI, review gate run, Sonar quality gate green
with its reported new-issue + duplication list cleared, findings resolved/deferred, and the
issue's acceptance criteria verified. Missing any one means the slice is still in flight.

## 2. SonarCloud quality gate (mandatory — on the PR, before merge)

Sonar analyzes pull requests and `main` only (`ci.yml`), so this gate is due at
ready-for-review, runs on the PR's check suite, and is distinct from CI: a green CI build
does not mean Sonar passed. **Green is necessary, not sufficient:** the quality gate can
pass while SonarCloud still reports new issues (MAJOR/minor code smells, security hotspots)
and duplications below its fail thresholds. Pull the actual list and fix every entry.

1. **Trigger.** Wait for the **SonarCloud Code Analysis** check (and the PR's quality-gate
   status) to complete. The gate must pass with new-code coverage ≥ 80%, and the reported
   list must be empty or resolved.
2. **Read the findings — the list, not the gate conclusion.** The check-run only reports
   pass/fail. Pull the list from the SonarCloud web API (anonymous-readable; `WebFetch`
   works), project key `ivopogace_riviera-sunbed-booking`, `<N>` = the PR number:
   - **Issues:** `https://sonarcloud.io/api/issues/search?componentKeys=ivopogace_riviera-sunbed-booking&pullRequest=<N>&resolved=false&ps=100`
   - **Duplications + new-code measures:** `https://sonarcloud.io/api/measures/component?component=ivopogace_riviera-sunbed-booking&pullRequest=<N>&metricKeys=new_duplicated_lines_density,new_duplicated_blocks,new_bugs,new_vulnerabilities,new_code_smells,new_coverage`

   **Confirm an analysis exists before believing a zero.** `api/issues/search` returns
   `"total": 0` for a PR that has not been analyzed yet, identical to a clean PR. Before
   accepting a zero: confirm `measures` is non-empty (for a code PR, `new_lines` has a
   value) **and** the `SonarCloud Code Analysis` check-run concluded `success`. The
   workflow's own `SonarCloud scan` job `needs: [backend, frontend]`, so a red build skips
   it and no analysis is uploaded — `skipped` means *unanalyzed*, not *clean*. `WebFetch`
   caches responses for 15 minutes — cache-bust on every re-read.

   Triage every entry — bug, vulnerability, code smell, security hotspot, duplicated block,
   coverage shortfall — even under a green gate.
3. **Resolve — back through the loop.** By finding type:
   - A finding that changes implemented logic re-enters at Implement; update *Skills consulted*.
   - A coverage gap on new code → add the missing tests (test-first; the test is the fix).
   - A genuine defect (real bug/vuln) → `diagnosing-bugs`, then the fix re-enters the loop.
   - A duplicated block (`new_duplicated_blocks > 0`, or a `common-*:DuplicatedBlocks`
     issue) → refactor it out before merge, even under the fail threshold.
   - A false positive / won't-fix / out-of-scope smell → prefer an in-code fix that also
     satisfies the analyzer, so the list reaches zero without SonarCloud UI/token access.
     The recurring FE case is `css:S7924` ("text does not meet the minimal contrast
     requirement") on translucent glass — the analyzer can't composite rgba over a gradient.
     Fix it the way `frontend/src/app/shared/failure-panel.ts` (`failure-icon`) does: swap
     the translucent fill for its solid composited equivalent; decorative `aria-hidden`
     glyphs get the same treatment. Only when a code fix would genuinely degrade the design,
     mark it resolved in SonarCloud with a written rationale (or open a follow-up issue) and
     record that in the plan's Sonar note. An unaddressed reported issue blocks merge.
   - Each fix push re-triggers CI and the Sonar analysis — re-check both before merging.
4. **Only then merge.** CI green, Review gate run, Sonar gate green with its list cleared
   (each entry code-fixed or resolved-with-rationale; new-code coverage ≥ 80%), and any fix
   round cleared the loop.

## 3. Merge close-out (mandatory — after the merge, before calling the slice done)

1. **Verify the issue closed** (the PR's `Closes #NN` did it, or close it manually with a
   completion comment).
2. **Tick the parent epic's checklist** (if the issue belongs to a tracking epic) and note
   the PR number on the ticked line.
3. **Propagate deferred review/Sonar findings.** Anything deferred or
   rejected-with-rationale that names a follow-up home gets written onto that issue now.
4. **Plan doc final state — written BEFORE the merge, in the PR's own last commit.**
   Execution-status table ✅, Open Questions empty or deferred with issue numbers, every
   risk-register row closed with its outcome, AC pin-names matching the tests that shipped.
   Tick the PR body's Gates checkboxes as each gate actually passes. **Reference the PR
   number, never the merge SHA** — a squash SHA cannot exist before the merge, and a
   post-merge commit on `main` is not available to cloud agents, so it degrades into a
   docs-only PR + CI cycle. After this step there is no post-merge repo commit; the only
   post-merge items are GitHub edits (steps 2 and 3). If you find yourself opening a
   docs-only PR to finish a close-out, step 4 was skipped. The plan doc then lives until the
   epic close-out, where it is deleted (`riviera-docs-freshness` § *Plan-doc retirement*) —
   so code and docs cite the issue or PR, never its path.
5. **Substrate-doc staleness check — run `riviera-docs-freshness`** if the slice changed
   something `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, an ADR, or a `riviera-*`
   skill states (a module's status, the package shape, a canonical value set, an ownership
   rule, a filename a skill cites). Split it:
   - **Staleness patches** (a renamed/removed file a skill cites, an epic's "in progress"
     line, a changed mechanism phrase): run the skill's pre-merge smoke over
     `origin/main...HEAD` and fold the patches into the code PR itself.
   - **Did this slice make the Nth of something?** A new listener, counter, event, module,
     profile, transport, or sweep falsifies every doc that says "the two …" — none of those
     files is in the diff, so run the skill's counting sweep (procedure step 2b).
   - The skill also runs over every epic's full merge span at epic close-out.
6. **Subscription closed:** confirm the PR-activity subscription ended with the merge or
   unsubscribe manually.
7. **Notify** per *Notifications* (SKILL.md): push; email only if a send-capable tool exists.
