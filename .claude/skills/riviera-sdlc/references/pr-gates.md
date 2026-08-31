# PR gates: Review → SonarCloud → Merge close-out

Read this when the PR is **ready for review** (or before calling a slice "done"). Three
procedures, in order. Wherever a fix is required, the **re-entry rule** applies — the
canonical statement lives in SKILL.md ("The loop"); this file cites it rather than
restating it.

> **Not when the draft opens.** The draft PR that exists from the first phase commit is a
> CI vehicle, not a request to review (SKILL.md, PR row — #417). Both gates below are due
> at **ready-for-review**: running them against a half-built draft burns the gate on work
> that is about to change.

## 1. Review gate (mandatory — between PR and merge)

> The `review` stage is a **gate, not a label on the diagram.** Opening a PR, green CI,
> and a clear Sonar gate are necessary but not sufficient — none of them is the review. A
> slice is **not done** and must not be merged until this gate has run and its findings
> are resolved or explicitly deferred.

**How the gate runs — every PR, before merge:**

1. **Trigger.** Due the moment the PR is marked **ready for review** (or before you would
   call the slice "done"). Do not wait to be asked. A draft does not trigger it — see the
   note at the top of this file.
2. **Run the review — right-sized, never skipped.** Start `/code-review` over the **PR
   diff** (`origin/main...HEAD`) via the invocation ladder below, and **load
   `riviera-review-overlay`** so the project bank items (RV-BE-*/RV-FE-*/RV-CT-*, the
   availability and payment Blockers, RV-PROC-1) are walked **on top of** the generic
   banks. Announce it: *"Running the SDLC review gate (riviera-review-overlay +
   code-review) on PR #NN."*

   > **The overlay alone is NOT the review.** It contributes *additional* bank items to an
   > active review ("this overlay **never runs alone**"); walking them by hand without
   > starting `/code-review` (or the rung-3 fallback) leaves the **generic** banks unrun —
   > and those are where the non-project-specific defects live. `/code-review` is the
   > strongest engine here **by measurement** — its subagent fan-out found three defects
   > the hand-walked overlay *and* the then-installed inline `/review` had both missed
   > (case history: #351). Start it first, every time.
   >
   > **The subagent fan-out is pre-authorized in this repo** (maintainer, 2026-07-27): a
   > standing "don't use the Agent tool" session instruction does not reach this gate —
   > run it, don't stop to re-ask. The authorization covers this gate only.
   >
   > **The invocation ladder — how to actually start `/code-review`** (a rejected name is
   > NOT the gate being unavailable):
   >
   > 1. **Call `Skill("code-review:code-review")` — this is the gate; expect it to work.**
   >    The plugin is enabled at **project** scope (`.claude/settings.json` →
   >    `enabledPlugins`) and its installed command declares
   >    `disable-model-invocation: false`, so the Skill tool serves it. Note the
   >    **`plugin:skill` form** — a bare `Skill("code-review")` is a different skill, the
   >    harness's built-in reviewer: rung 3's fallback, not the gate. (An older revision
   >    claimed the CLI refuses this rung — wrong. When in doubt, read the payload's
   >    frontmatter and `enabledPlugins` — both one grep away — rather than believing
   >    either claim.)
   > 2. **Only if rung 1 is actually refused → execute the installed plugin's command file
   >    directly; that still IS the gate, not a degraded mode.** In
   >    `~/.claude/plugins/installed_plugins.json`, under the top-level `plugins` map, the
   >    key `code-review@claude-plugins-official` holds an **array** of installs — take the
   >    entry's `installPath`, read `<installPath>/commands/code-review.md`, and follow its
   >    steps exactly as if the command had been typed. Reading the installed payload at
   >    run time keeps Anthropic's upstream updates flowing (`scripts/ensure-plugins.sh`
   >    tracks the marketplace) — **never vendor a copy of the workflow into the repo.**
   >    (The cache can hold more than one payload dir; prefer the `installPath` the JSON
   >    names for this project.)
   > 3. The degraded built-in-reviewer fallback below applies only when this ladder cannot
   >    run the workflow: the payload is absent and `bash scripts/ensure-plugins.sh`
   >    cannot repair it, or the review subagents genuinely cannot run.
   >
   > **`gh` in cloud sessions** — provisioned by `scripts/cloud-session-setup.sh` step 6
   > (GH_TOKEN is already in the session env). The repo-scope proxy serves REST plus a
   > pinned set of PR-review GraphQL operations, so some `gh` calls need their REST
   > equivalent (the proxy's 403 message says exactly this):
   > - `gh pr diff N` and `gh api repos/{owner}/{repo}/...` **work**.
   > - `gh pr list` / `gh pr checks` / `gh search` **403** → use
   >   `gh api "repos/O/R/pulls?state=open"`, `gh api repos/O/R/commits/{sha}/check-runs`,
   >   and `gh api -X GET search/issues -f q=...` (the `-X GET` is load-bearing — a bare
   >   `-f` flips `gh api` to POST).
   > - Post the final review comment with
   >   `gh api -X POST repos/O/R/issues/N/comments -f body='...'`.
   > - **`gh pr view` is field-dependent, not simply blocked**: the
   >   pin is per GraphQL *query*, so `--json number,draft,…` is served while
   >   `--json comments` 403s — judge by the field set, not the subcommand.
   >   `gh api repos/O/R/pulls/N` sidesteps the question entirely.
   > - **Job logs are the one REST call that still fails, and not at the gateway:**
   >   `gh api …/actions/jobs/{id}/logs` answers a redirect to Azure blob storage, which
   >   the **agent proxy** denies (`connect_rejected` in
   >   `curl -sS "$HTTPS_PROXY/__agentproxy/status"`). Read a failed job's log with the
   >   GitHub MCP `get_job_logs` (`return_content: true` plus a `tail_lines`) and grep the
   >   saved file rather than pulling it all into context.
   > - The GitHub MCP tools remain the substitute if `gh` is missing.
   >
   > **Fallback, only under the ladder's rung-3 conditions: the harness's built-in
   > `code-review` skill** — `Skill("code-review")`, the unqualified name (a human types
   > `/code-review <PR>` at an effort level). It is the host CLI's own reviewer, not the
   > plugin's multi-reviewer workflow, and it does not know this repo's banks — still load
   > the overlay. Treat it as a degraded mode and say so in the PR. (The old `/review <PR>`
   > fallback no longer exists as an installable skill — don't chase it.)
   >
   > **If no rung can start, say so — never substitute silently.** That is a legitimate
   > blocker and an illegitimate secret: **leave the PR's review checkbox unticked, write
   > one line in the PR saying which half ran and why**, and ask the human to authorize
   > the missing half. Ticking a box whose text names `/code-review` when no review ran
   > makes the PR record lie about the process — and the unrun half is where the recurring
   > defect class hides (case history: PR #353/#355).

   **Pick the review effort by risk class** (same principle as the grill gate — the size
   flexes; the gate does not):
   - **Medium effort** for a pure move/retype/no-behavior-change slice whose structural
     net (`ModularityTests` + the ArchUnit rules + the module's own tests) is green — the
     net already proves the move; the review adds the overlay walk and human-judgment
     items, not a bug hunt at full fan-out.
   - **High effort (no exceptions)** for any slice that touches **availability, the
     booking lifecycle, money (payment/payout/refund), or authorization** — the spine
     invariants (#2, #8, #9, #13) are exactly where a plausible-looking diff hides a
     trust-breaking bug.
   - When unsure, go high. Effort choice changes the fan-out, never whether the overlay
     bank items are walked — those run every time.
3. **Resolve — back through the loop, not around it.** A finding fix is implementation
   work: it **re-enters at Implement per the re-entry rule** (SKILL.md, "The loop").
   Additionally:
   - **Update the plan's _Skills consulted_ line** with any new area a fix pulled in, so
     RV-PROC-1 stays truthful.
   - **Re-review** = re-run `/code-review` on the new diff, or at minimum re-walk the
     overlay bank items + RV-PROC-1 for the area the fix touched.
   - Out-of-scope findings → a follow-up issue with a one-line rationale.
   - Record the outcome (findings + fixes + skills loaded) in the plan doc's review note
     or the PR.
4. **Only then merge.** Merge is reached **only** when CI is green **and** the review gate
   has run **and** findings are resolved/deferred **and the fix round itself cleared the
   loop**. "Green + reviewed (incl. the fixes)," never "green."

**Definition of done for a slice:** green CI **and** review gate run **and** Sonar quality
gate green **with its reported new-issue + duplication list cleared** (not merely a green
gate) **and** findings resolved/deferred **and** the issue's acceptance criteria verified.
Missing any one means the slice is still in flight — say so rather than reporting it done.

## 2. SonarCloud quality gate (mandatory — on the PR, before merge)

> By design (`ci.yml`) Sonar analyzes **pull requests and `main` only** — SonarCloud's
> plan cannot read non-`main` branches, and a branch-push Sonar job would go spuriously
> red. So this gate is due at **ready-for-review** (not at draft creation — see the note
> at the top of this file), runs on the PR's check suite, and is a **distinct gate from
> CI**: a green CI build does **not** mean Sonar passed.
>
> **Green is necessary, NOT sufficient.** The quality gate can **pass while SonarCloud
> still reports new issues** (MAJOR/minor code smells, security hotspots) **and
> duplications** that sit below its fail thresholds. So the green check-run conclusion is
> not proof of "no new issues" — you MUST pull the actual reported issue + duplication
> *list* (step 2) and **fix every entry before merge, even when the gate is green** (case
> history: #158).

**How the gate runs — every PR, after CI + the Review gate, before merge:**

1. **Trigger.** The analysis runs on the PR head as soon as the PR is open. Wait for the
   **SonarCloud Code Analysis** check (and the PR's quality-gate status) to complete — do
   not merge on "CI green" alone. The gate must **pass** with **new-code coverage ≥ 80%**,
   and the reported list (step 2) must be empty-or-resolved.
2. **Read the findings — the actual list, not just the gate conclusion.** The check-run
   (`pull_request_read get_check_runs`) only reports pass/fail; it does **not** list the
   issues. Pull the real list from the SonarCloud web API (anonymous-readable for this
   public project, so `WebFetch` works), project key
   **`ivopogace_riviera-sunbed-booking`**, `<N>` = the PR number:
   - **Issues:** `https://sonarcloud.io/api/issues/search?componentKeys=ivopogace_riviera-sunbed-booking&pullRequest=<N>&resolved=false&ps=100`
     — every new bug, vulnerability, code smell, and security hotspot with its rule, file,
     line, message.
   - **Duplications + new-code measures:** `https://sonarcloud.io/api/measures/component?component=ivopogace_riviera-sunbed-booking&pullRequest=<N>&metricKeys=new_duplicated_lines_density,new_duplicated_blocks,new_bugs,new_vulnerabilities,new_code_smells,new_coverage`.

   > **The false-clean read — confirm an analysis actually exists before believing a zero.**
   > `api/issues/search` returns `"total": 0` for a PR that has **not been analyzed yet**,
   > byte-for-byte identical to a genuinely clean PR. Before accepting a zero issue count:
   > confirm `measures` is **non-empty** (for a code PR, that `new_lines` has a value)
   > **and** that the `SonarCloud Code Analysis` check-run itself concluded `success`. The
   > workflow's own `SonarCloud scan` job is **not** the gate: it `needs:
   > [backend, frontend]`, so a red build skips it, no analysis is uploaded, and the app
   > check never appears at all — a `skipped` there means *unanalyzed*, not *clean*.
   > (#418 removed a second origin of this trap — a duplicate push-triggered run whose
   > skipped check-run could land last and mask the real one; the `needs:` cause remains.)
   > Compounding it: `WebFetch` caches responses for **15 minutes** — cache-bust on every
   > re-read, or one early read persists as a stale "clean" answer across the whole gate.
   > (Case history: PR #318.)

   Triage **every** entry the list returns — bug, vulnerability, code smell, security
   hotspot, a **duplicated block**, or a coverage shortfall — even under a green gate.
3. **Resolve — back through the loop, not around it.** Triage by finding type:
   - **A finding that changes implemented logic** is a code change — it **re-enters at
     Implement per the re-entry rule** (SKILL.md, "The loop"). Update the plan's *Skills
     consulted* line for any new area a fix pulled in.
   - **A coverage gap** on new code → add the missing tests (still test-first; the new
     test is itself the fix).
   - **A genuine defect** Sonar surfaced (real bug/vuln) → drive it with
     `diagnosing-bugs`, then the fix re-enters the loop as above.
   - **A duplicated block** (`new_duplicated_blocks > 0`, or a `common-*:DuplicatedBlocks`
     issue) → refactor the duplication out before merge, even if the density stayed under
     the gate's fail threshold.
   - **A false positive / won't-fix / out-of-scope smell** → **prefer an in-code fix that
     also satisfies the static analyzer**, so the reported list reaches literally **zero**
     without needing SonarCloud UI/token access. The recurring FE case is **`css:S7924`
     ("text does not meet the minimal contrast requirement") on translucent glass** — the
     analyzer can't composite the rgba glass over the gradient, so a pair the
     `*.contrast.spec.ts` proves AA still flags. Fix it the way
     `frontend/src/app/shared/failure-panel.ts` (`failure-icon`) does: **swap the
     translucent fill for its solid composited equivalent** (nudging the ink to clear
     4.5:1 outright); decorative `aria-hidden` glyphs get the same treatment. Only when a
     code fix would genuinely degrade the design do you **mark it resolved in SonarCloud
     with a written rationale** (or open a follow-up issue) — and record that decision in
     the plan's Sonar note. Either way, an **unaddressed** reported new issue blocks merge.
   - Each fix push re-triggers CI **and** the Sonar analysis — **re-check both before
     merging** (re-entry rule; being small or post-green is not an exemption).
4. **Only then merge.** Merge is reached **only** when CI is green **and** the Review gate
   has run **and** the Sonar gate is green **with its reported list cleared** (each entry
   code-fixed, or resolved-with-rationale in SonarCloud; new-code coverage ≥ 80%) **and**
   any fix round itself cleared the loop.

## 3. Merge close-out (mandatory — after the merge, before calling the slice done)

Merging is not the last step; the close-out is. Every item, every merge:

1. **Verify the issue closed** (the PR's `Closes #NN` did it, or close it manually with a
   completion comment).
2. **Tick the parent epic's checklist** (if the issue belongs to a tracking epic) and note
   the merge commit / PR number on the ticked line.
3. **Propagate deferred review/Sonar findings.** Anything the review gate deferred or
   rejected-with-rationale that names a follow-up home (an existing issue or a new one)
   gets **written onto that issue now** — a deferred finding that lives only in the review
   transcript is lost by the next session.
4. **Plan doc final state — written BEFORE the merge, in the PR's own last commit.**
   Execution-status table ✅, Open Questions empty or deferred with issue numbers, every
   risk-register row closed with its outcome, AC pin-names matching the tests that actually
   shipped (already required by `riviera-plan-doc` — verify, don't assume). **Tick the PR
   body's Gates checkboxes** as each gate actually passes — two PRs once merged with all
   three left `[ ]` despite all three passing, which makes the PR record lie about the
   process that ran.

   > **Reference the PR number, never the merge SHA — this is what makes the step
   > pre-merge-able.** A squash SHA cannot exist before the merge, so recording "merged as
   > `<sha>`" *guarantees* a second commit; `merged via PR #NN` is knowable the moment the
   > PR opens (the SHA is one `git log --grep "(#NN)"` away if needed). A post-merge
   > "one-line follow-up commit on `main`" assumes a push permission cloud agents don't
   > have, so it degrades into a whole docs-only PR + CI cycle every time (case history:
   > the three close-out PRs, #326→#347, #346→#352, #351→#354).
   >
   > **After this step there is no post-merge repo commit.** The only genuinely post-merge
   > items are GitHub edits, not commits: the parent-epic checkbox tick (step 2) and any
   > follow-up issue (step 3). **If you find yourself opening a docs-only PR to finish a
   > close-out, step 4 was skipped** — that is the signal, not a normal cost.
5. **Substrate-doc staleness check — run `riviera-docs-freshness`.** If the slice changed
   something `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, an ADR, or a `riviera-*`
   skill **states** — a module's shipped/planned status, the package shape, a canonical
   value set, an ownership rule, a filename a skill cites as an example — load the skill
   and run it. **Split it by what it needs:**
   - **Staleness patches** (a renamed/removed file a skill cites, an epic's "in progress"
     line, a changed mechanism phrase) don't need the merge SHA — run the staleness grep
     **pre-merge** (the skill's "pre-merge smoke" mode over `origin/main...HEAD`) and fold
     the patches into the **code PR itself**; don't spin up a second docs PR + CI cycle
     for edits the code PR could have carried (case history: O6 / PR #219).
   - **Did this slice make the Nth of something?** A new listener, counter, event, module,
     profile, transport, or sweep falsifies every doc that says "the two …" — and none of
     those files is in the diff, so reviewing the changed files cannot find them. Run the
     skill's **counting sweep** (its procedure step 2b) beside the rename grep (case
     history: #447 — the sweep found ten statements the diff review could not see).
   - It also runs over every epic's full merge span at epic close-out (case history: #72).
6. **Subscription closed:** confirm the PR-activity subscription ended with the merge
   (auto-unsubscribe) or unsubscribe manually.
7. **Notify** per *Staying in touch* (SKILL.md): push; email only if a send-capable tool
   exists.
