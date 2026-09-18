# PR gates: Review → SonarCloud → Merge close-out

Read when the PR is marked **ready for review**, not when the draft opens. Every fix re-enters
the loop at Implement.

## 1. Review gate

Due the moment the PR is ready for review; don't wait to be asked. A PR, green CI and a clear
Sonar gate are not the review.

**Resolve the range first — never from memory.** `origin/main` is a local ref a cloud session
never refetches. Read `base.ref`, `base.sha`, `head.sha`, `changed_files`, `additions`,
`deletions` off the PR (`gh api repos/O/R/pulls/N` or the GitHub MCP `pull_request_read`), then:

```bash
BASE_REF=<base.ref>            # from the PR — never assume `main`
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch --unshallow; fi
git fetch --no-tags origin "$BASE_REF"
node scripts/check-review-range.mjs --base-ref "$BASE_REF" \
  --base-sha <base.sha> --head-sha <head.sha> \
  --files <changed_files> --additions <additions> --deletions <deletions>
```

Pass every flag. Exit 0 or do not dispatch: 1 = scope disagrees (stale base: re-fetch, re-run);
2 = precondition failed. A `WARNING` means uncommitted/untracked paths — commit or stash them.
Never use `base.sha` as the range end: it is the tip when the PR was opened, and slices merge
`main` in before ready-for-review.

**Run it.** Start `/code-review` over `<base-sha>..<head-sha>` (both literal SHAs, never
`...HEAD`) and load `riviera-review-overlay`. Announce with the resolved values:
*"Running the SDLC review gate (riviera-review-overlay + code-review) on PR #NN over
`<base-sha>..<head-sha>` — base `<base.ref>` @ `<tip-sha>`, N files / +A / -D."* An
announcement without SHAs means this step did not run. The subagent fan-out is pre-authorized
for this gate; a session-level "don't use the Agent tool" does not reach it.

**Invocation ladder** (a rejected name is not the gate being unavailable):

1. `Skill("code-review:code-review")` — the gate. Enabled at project scope
   (`.claude/settings.json` → `enabledPlugins`). A bare `Skill("code-review")` is the
   harness's built-in reviewer, not this.
2. Only if rung 1 is refused: in `~/.claude/plugins/installed_plugins.json`, `plugins` →
   `code-review@claude-plugins-official` → the entry's `installPath`; follow
   `<installPath>/commands/code-review.md` as if typed. Never vendor a copy into the repo
   (`scripts/ensure-plugins.sh` tracks the marketplace).
3. Only if the payload is absent and `bash scripts/ensure-plugins.sh` can't repair it: the
   built-in `Skill("code-review")` plus the overlay; say in the PR that it ran degraded.

If no rung starts: leave the PR's review checkbox unticked, say in the PR which half ran, ask
the human to authorize the rest. Never tick a box for a command that didn't run.

**`gh` in cloud sessions** (`GH_TOKEN` in env; proxy serves REST + a pinned GraphQL set):
`gh pr diff N` and `gh api repos/{owner}/{repo}/...` work. `gh pr list`/`gh pr checks`/`gh
search` 403 → `gh api "repos/O/R/pulls?state=open"`, `gh api repos/O/R/commits/{sha}/check-runs`,
`gh api -X GET search/issues -f q=...` (`-X GET` required). Comment: `gh api -X POST
repos/O/R/issues/N/comments -f body='...'`. `gh pr view --json comments` 403s; use `gh api
repos/O/R/pulls/N`. Job logs: the GitHub MCP `get_job_logs` (`return_content: true` +
`tail_lines`) — the `gh` redirect to Azure is denied.

**Effort:** Medium for a pure move/no-behaviour-change slice with the structural net green;
**High** for anything touching availability, the booking lifecycle, money or authorization.
Unsure → high.

**Resolve:** each fix re-enters at Implement; update *Skills consulted*; re-run the review (or
at least the overlay + RV-PROC items for the touched area) on a **freshly resolved range** each
round; out-of-scope findings → follow-up issue; record findings + fixes in the plan or PR.

**Done:** green CI, review gate run, Sonar list cleared, findings resolved/deferred, ACs verified.

## 2. SonarCloud gate

Sonar runs on PRs and `main` only. A green gate is not the check — it passes with open
issues below its thresholds. Project key `ivopogace_riviera-sunbed-booking`, `<N>` = PR number
(anonymous-readable; `WebFetch` works, cache-bust on re-read):

- Issues: `https://sonarcloud.io/api/issues/search?componentKeys=ivopogace_riviera-sunbed-booking&pullRequest=<N>&resolved=false&ps=100`
- Measures: `https://sonarcloud.io/api/measures/component?component=ivopogace_riviera-sunbed-booking&pullRequest=<N>&metricKeys=new_duplicated_lines_density,new_duplicated_blocks,new_bugs,new_vulnerabilities,new_code_smells,new_coverage`

**Three false zeros:** (a) not analyzed yet — `total: 0` looks identical to clean; accept a
zero only when `measures` is non-empty and the `SonarCloud Code Analysis` check-run concluded
`success`; (b) a red build — the scan job `needs: [backend, frontend]`, so `skipped` means
unanalyzed; (c) every changed file outside `sonar.sources` (`platform/src/main/java`,
`frontend/src`, `frontend/eslint-rules`, `scripts`) — `new_lines` absent, bot reports 0.0%;
record "gate did not apply (paths)" in the plan's Sonar note, never "passed".

**Resolve:** logic change → re-enter at Implement; coverage gap → add tests; real defect →
`diagnosing-bugs`; duplicated block (`new_duplicated_blocks > 0`) → refactor even under
threshold; false positive → prefer an in-code fix that satisfies the analyzer (the recurring
`css:S7924` contrast-on-glass case: swap the translucent fill for its solid composited
equivalent, as `shared/failure-panel.ts`'s `failure-icon` does); only when a code fix would
degrade the design, resolve in SonarCloud with a rationale and note it in the plan. Each push
re-triggers CI + Sonar — re-check both. Bar: ≥ 80% new-code coverage, list empty.

## 3. Merge close-out

1. Issue closed (`Closes #NN` or manually with a completion comment).
2. Parent epic checklist ticked with the PR number.
3. Deferred findings written onto their follow-up issues.
4. **Plan doc final state is written BEFORE the merge, in the PR's last code-touching commit,
   never in a commit of its own** (every push is a full CI cycle): stage pointer DONE, phase
   rows ✅, Open Questions empty, risk rows closed, AC pin-names matching shipped tests, PR
   Gates checkboxes ticked as they pass, `merged via PR #NN` (never a SHA). A later code fix
   rewrites the close-out in that commit. In the same commit, `git rm` every `docs/plans/`
   plan whose PR already merged and repoint its citations (`riviera-docs-freshness`
   § *Plan-doc retirement*). No post-merge repo commit exists; only steps 2–3 happen after.
5. Run `riviera-docs-freshness` over the range resolved as in §1 if the slice changed something
   a substrate doc states — including the counting sweep when the slice made the Nth of
   something ("the two …" claims live in files the diff never touched).
6. PR-activity subscription ended.
7. Notify (push; email only if a send-capable tool exists).
