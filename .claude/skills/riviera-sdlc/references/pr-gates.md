# PR gates: Review → SonarCloud → Merge close-out

Read when the PR is marked **ready for review**, not when the draft opens.

## 1. Review gate

Due the moment the PR is ready for review; don't wait to be asked. Green CI and a clear Sonar
gate are not the review.

**Run it on the PR number.** `Skill("code-review:code-review")` with the PR number (enabled at
project scope via `.claude/settings.json` → `enabledPlugins`), plus `riviera-review-overlay`. The
plugin reads the diff from GitHub (`gh pr diff`), so there is no local range to get stale. If the
plugin is refused, `bash scripts/ensure-plugins.sh` repairs its payload; failing that, run the
built-in `Skill("code-review")` on the PR number with the overlay and say in the PR that it ran
degraded. If nothing starts, leave the PR's review checkbox unticked and say why. The subagent
fan-out is pre-authorized for this gate.

**`gh` in cloud sessions** (`GH_TOKEN` in env; the proxy serves repo-scoped REST only, no GraphQL):
`gh pr diff N` and `gh api repos/{owner}/{repo}/...` work. `gh pr list`/`gh pr checks`/`gh search`
403 → `gh api "repos/O/R/pulls?state=open"`, `gh api repos/O/R/commits/{sha}/check-runs`, `gh api
"repos/O/R/issues?labels=<l>&state=all"`. Review threads, auto-merge and draft/ready-for-review go
through `repos/O/R/pulls/N/ccr/...` (the 403 body lists the routes). Comment: `gh api -X POST
repos/O/R/issues/N/comments -f body='...'`. `gh pr view --json comments` 403s; use `gh api
repos/O/R/pulls/N`. Job logs: the GitHub MCP `get_job_logs` (`return_content: true` + `tail_lines`)
— the `gh` redirect to Azure is denied.

**Effort:** medium for a pure move/no-behaviour-change slice with the structural net green;
**high** for anything touching availability, the booking lifecycle, money or authorization.
Unsure → high.

**Resolve:** a behaviour fix re-enters at Implement and gets a re-review of what it changed;
out-of-scope findings → follow-up issue.

## 2. SonarCloud gate

Sonar runs on PRs and `main` only. Project key `ivopogace_riviera-sunbed-booking`, `<N>` = PR
number (anonymous-readable; `WebFetch` works, cache-bust on re-read):

- Issues: `https://sonarcloud.io/api/issues/search?componentKeys=ivopogace_riviera-sunbed-booking&pullRequest=<N>&resolved=false&ps=100`
- Measures: `https://sonarcloud.io/api/measures/component?component=ivopogace_riviera-sunbed-booking&pullRequest=<N>&metricKeys=new_bugs,new_vulnerabilities,new_security_hotspots,new_code_smells,new_duplicated_blocks,new_coverage`

**Bar:** no new bug, vulnerability or unreviewed security hotspot; new-code coverage ≥ 80%. Code
smells and duplication are judged: fix one that marks a real defect or an easy win; mark a false
positive, or one whose fix would degrade the design, in SonarCloud with a one-line rationale.
Never reshape a design only to satisfy the analyzer.

**False zeros:** a zero counts only when `measures` is non-empty and the `SonarCloud Code
Analysis` check-run concluded `success` — a red build skips the scan, and a PR whose changed files
all sit outside `sonar.sources` reports no new lines ("gate did not apply", not "passed").

## 3. Merge close-out

1. Issue closed (`Closes #NN` or manually with a completion comment).
2. Parent epic checklist ticked with the PR number.
3. Deferred findings written onto their follow-up issues.
4. **The plan doc never reaches `main`.** In the PR's last commit before merge, move anything a
   later slice needs into `RESPONSIBILITIES.md`, an ADR or the issue, then `git rm` the plan. The
   squash merge leaves it only in the PR's history.
5. At epic close-out (not every slice), run `riviera-docs-freshness` over the epic's merge span.
6. PR-activity subscription ended.
7. Notify (push; email only if a send-capable tool exists).
