# PR gates: Review → SonarCloud → Merge close-out

Read this the moment a PR exists (or before calling a slice "done"). Three procedures, in
order. Wherever a fix is required, the **re-entry rule** applies — the canonical statement
lives in SKILL.md ("The loop"); this file cites it rather than restating it.

## 1. Review gate (mandatory — between PR and merge)

> The `review` stage is a **gate, not a label on the diagram.** Opening a PR, getting
> green CI, and clearing Sonar are **necessary but not sufficient** — none of them is the
> review. A slice is **not done** and **must not be merged** until the review gate has run
> and its findings are resolved or explicitly deferred. "PR opened + CI green" is the
> trap, not the finish line.

**How the gate runs — every PR, before merge:**

1. **Trigger.** The moment a PR exists (or before you would call a slice "done"/"ready to
   merge"), the review gate is **due**. Do not wait to be asked.
2. **Run the review — right-sized, never skipped.** Start a review over the **PR diff** —
   `/code-review` `origin/main...HEAD` (or `/review <PR>`) — and **load
   `riviera-review-overlay`** so the project bank items (RV-BE-*/RV-FE-*/RV-CT-*, the
   availability and payment Blockers, RV-PROC-1) are walked **on top of** the generic
   banks. Announce it: *"Running the SDLC review gate (riviera-review-overlay +
   code-review) on PR #NN."*

   > **The overlay is not the review — running it alone does NOT satisfy this gate.**
   > `riviera-review-overlay` says so itself ("this overlay **never runs alone**"): it
   > contributes *additional* bank items to an active review. Walking those items by hand
   > without starting `/code-review` (or `/review <PR>`) leaves the **generic** FE/BE/contract
   > banks unrun, and those are where the non-project-specific defects live. Half the gate is
   > not the gate.
   >
   > **Blocked on `/code-review`? Try `/review <PR>` first — it is not the same tool.**
   > `/code-review` runs as a **subagent**, so a session under a standing "don't use the Agent
   > tool" instruction cannot start it. **`/review <PR>` loads as a plain skill and runs
   > inline**, needs no subagent, and walks the same generic banks against the PR diff (fetch
   > the diff with the GitHub MCP tools — `gh` is absent in cloud sessions, and the skill's
   > instructions assume it). Reach for `/review` before concluding the gate is unrunnable.
   >
   > **If neither can start, say so — never substitute silently.** That is a legitimate blocker
   > and an illegitimate secret: **leave the PR's review checkbox unticked, write one line in
   > the PR saying which half ran and why**, and ask the human to authorize the missing half.
   > Ticking a box whose text names `/code-review` when no review ran makes the PR record lie
   > about the process — precisely what close-out step 4 exists to prevent.
   > (Case history: PR #353, 2026-07-26 — the overlay bank ran and found two real issues, the
   > generic banks never ran, and the box was ticked anyway on the belief that no review could
   > run at all. `/review` could, and when finally run it found a **WCAG 2.4.3 focus-loss
   > regression** the overlay bank has no item for: the account popover was destroyed by its own
   > navigation with focus inside it, dropping focus to `document.body` — the #148 find-modal
   > bug, recurring. Fixed in #355, whose own `/review` pass then caught a false-passing
   > assertion and a repeat RV-STYLE-1 slip in that very fix.)

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
   work, so it **re-enters at Implement per the re-entry rule** (SKILL.md, "The loop"):
   load the fix's area skills per the routing table, build it test-first, get CI green
   again, re-review the changed surface. Additionally:
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

> SonarCloud's quality gate is **not** a feature-branch check — by design (`ci.yml`) Sonar
> analyzes **pull requests and `main` only**, because SonarCloud's plan cannot read
> non-`main` branches and a branch-push Sonar job would go spuriously red. So the Sonar
> gate is **due when the PR exists**, runs on the PR's check suite, and is a **distinct
> gate from CI** (a green CI build does **not** mean Sonar passed — the SonarCloud check
> is separate). A slice is **not** mergeable until this gate is green.
>
> **Green is necessary, NOT sufficient.** The quality gate can **pass while SonarCloud
> still reports new issues** (MAJOR/minor code smells, security hotspots) **and
> duplications** that sit *below* its fail thresholds. So the green **check-run conclusion
> is not proof of "no new issues"** — you MUST pull the actual reported issue +
> duplication *list* (step 2) and **fix every entry before merge, even when the gate is
> green.** Don't merge on the gate's pass/fail alone (case history: #158).

**How the gate runs — every PR, after CI + the Review gate, before merge:**

1. **Trigger.** The moment the PR is open, the SonarCloud analysis runs on the PR head.
   Wait for the **SonarCloud Code Analysis** check (and the PR's quality-gate status) to
   complete — do not merge on "CI green" alone. The gate must **pass** with **new-code
   coverage ≥ 80%** — **and** the reported new-issue + duplication *list* (step 2) must be
   empty-or-resolved, since the gate can be green while that list is non-empty.
2. **Read the findings — the actual list, not just the gate conclusion.** The check-run
   (`pull_request_read get_check_runs`) only reports the gate's **pass/fail**; it does
   **not** list the issues. Pull the real reported list from the SonarCloud web API
   (anonymous-readable for this public project, so `WebFetch` works), project key
   **`ivopogace_riviera-sunbed-booking`**, `<N>` = the PR number:
   - **Issues:** `https://sonarcloud.io/api/issues/search?componentKeys=ivopogace_riviera-sunbed-booking&pullRequest=<N>&resolved=false&ps=100`
     — every new bug, vulnerability, code smell, and security hotspot with its rule, file,
     line, message.
   - **Duplications + new-code measures:** `https://sonarcloud.io/api/measures/component?component=ivopogace_riviera-sunbed-booking&pullRequest=<N>&metricKeys=new_duplicated_lines_density,new_duplicated_blocks,new_bugs,new_vulnerabilities,new_code_smells,new_coverage`.

   > **The false-clean read — confirm an analysis actually exists before believing a zero.**
   > `api/issues/search` returns `"total": 0` with an empty array for a PR that has **not been
   > analyzed yet**, byte-for-byte identical to a genuinely clean PR. Read it too early and the
   > gate *looks* passed when it has not run at all. **The tell is the measures call: an empty
   > `measures` array means nothing has been ingested.** So: confirm `measures` is **non-empty**
   > (for a code PR, that `new_lines` has a value) **and** that the `SonarCloud Code Analysis`
   > check-run itself concluded `success`, before accepting a zero issue count. Note the
   > workflow's own `SonarCloud scan` job can legitimately conclude `skipped` on one of two
   > duplicate runs — that is not the gate; the `SonarCloud Code Analysis` check is.
   > Compounding it: `WebFetch` caches responses for **15 minutes**, so one early read can
   > persist as a stale "clean" answer across the whole gate — cache-bust when re-reading.
   > (Case history: PR #318, 2026-07-25 — the first read showed 0 issues while no analysis
   > existed; the real result, 445 new lines at 91.67% coverage, landed minutes later.)

   Triage **every** entry the list returns — bug, vulnerability, code smell, security
   hotspot, a **duplicated block**, or a coverage shortfall. A green gate with a
   **non-empty** issue/duplication list is **not** done.
3. **Resolve — back through the loop, not around it.** Triage by finding type:
   - **A finding that changes implemented logic** is a code change — it **re-enters at
     Implement per the re-entry rule** (SKILL.md, "The loop"): decide whether the issue is
     backend or frontend, load that area's skills per the routing table, fix test-first,
     CI green again, re-review the changed surface. Update the plan's *Skills consulted*
     line for any new area a fix pulled in.
   - **A coverage gap** on new code → add the missing tests (still test-first; the new
     test is itself the fix).
   - **A genuine defect** Sonar surfaced (real bug/vuln) → drive it with
     `diagnosing-bugs`, then the fix re-enters the loop as above.
   - **A duplicated block** (`new_duplicated_blocks > 0`, or a `common-*:DuplicatedBlocks`
     issue) → refactor the duplication out (extract the shared helper / dedupe the
     near-identical test or `.scss`) before merge — even if the duplication density stayed
     under the gate's fail threshold.
   - **A false positive / won't-fix / out-of-scope smell** → **prefer an in-code fix that
     also satisfies the static analyzer**, so the reported list reaches literally **zero**
     without needing SonarCloud UI/token access. The recurring FE case is **`css:S7924`
     ("text does not meet the minimal contrast requirement") on translucent glass** — the
     analyzer ignores the rgba alpha / can't composite the glass over the gradient, so a
     pair the `*.contrast.spec.ts` proves AA still flags. Fix it the way
     `frontend/src/app/shared/_glass.scss` (`failure-icon`, T3) already does: **swap the
     translucent fill for its solid composited equivalent** (and nudge the ink to clear
     4.5:1 outright); decorative `aria-hidden` glyphs get the same treatment. Only when a
     code fix would genuinely degrade the design do you **mark it resolved in SonarCloud
     with a written rationale** (or open a follow-up issue) — and record that decision in
     the plan's Sonar note. Either way, an **unaddressed** reported new issue blocks merge.
   - Each fix push re-triggers CI **and** the Sonar analysis — **re-check both before
     merging** (being small or post-green is not an exemption; re-entry rule).
4. **Only then merge.** Merge is reached **only** when CI is green **and** the Review gate
   has run **and** the **Sonar quality gate is green AND its reported new-issue +
   duplication list is empty-or-resolved** (each entry code-fixed, or
   resolved-with-rationale in SonarCloud), new-code coverage ≥ 80%, **and** every finding
   is resolved/deferred **and** any fix round itself cleared the loop. "Green CI +
   reviewed + Sonar issue-list cleared," never "the gate went green."

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
   body's Gates checkboxes** as each gate actually passes — both 2026-07-02 PRs merged with
   all three left `[ ]` despite all three passing, which makes the PR record lie about the
   process that ran.

   > **Reference the PR number, never the merge SHA — this is what makes the step
   > pre-merge-able.** A squash SHA cannot exist before the merge, so a plan doc that records
   > "merged as `<sha>`" *guarantees* a second commit; `merged via PR #NN` is knowable the
   > moment the PR opens, and the SHA is one `git log --grep "(#NN)"` away if anyone needs it.
   > Everything else in this step was always knowable pre-merge — it was only ever done late.
   >
   > **Why this hardened:** the guidance used to call the leftovers "a one-line follow-up (a
   > commit on `main`) — not a full PR." That assumes a permission agents don't have: a cloud
   > session cannot push to `main`, so "one-line follow-up" degrades into a whole PR + CI cycle
   > every single time. Three consecutive slices paid it — #326→PR #347, #346→PR #352,
   > #351→PR #354 — each a docs-only PR whose diff was ~96% content that predated the merge
   > (#354: **3 of 80 changed lines** actually needed the SHA). Removing the dependency beats
   > optimizing the follow-up.
   >
   > **After this step there is no post-merge repo commit.** The only genuinely post-merge
   > items are GitHub edits, not commits: the parent-epic checkbox tick (step 2) and any
   > follow-up issue (step 3).
5. **Substrate-doc staleness check — run `riviera-docs-freshness`.** If the slice changed
   something `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, an ADR, or a `riviera-*`
   skill **states** — a module's shipped/planned status, the package shape, a canonical
   value set (statuses, pools), an ownership rule, a filename a skill cites as an example —
   load the **`riviera-docs-freshness`** skill and run it. **Split it by what it needs:**
   - **Staleness patches (a renamed/removed file a skill cites, an epic's "in progress"
     line, a changed mechanism phrase) don't need the merge SHA — run the staleness grep
     `pre-merge` (the skill's "pre-merge smoke" mode over `origin/main...HEAD`) and fold
     those patches into the *code PR itself***. Don't spin up a whole second docs PR + CI
     cycle for edits the code PR could have carried (case history: O6 shipped a near-empty
     docs PR #219 for two one-line patches).
   - **Nothing here is inherently post-merge any more.** Step 4 removed the last repo-commit
     dependency by recording `merged via PR #NN` instead of the merge SHA, so the staleness
     patches and the plan-doc final state both belong in the **code PR itself**. What remains
     post-merge is GitHub-only and needs no commit: the epic checkbox tick (step 2) and any
     follow-up issue (step 3). **If you find yourself opening a docs-only PR to finish a
     close-out, step 4 was skipped** — that is the signal, not a normal cost.
   - It also runs over every epic's full merge span at epic close-out (case history: #72).
   **Then refresh the knowledge graph for the same doc changes:** the post-commit hook
   rebuilds *code* only, so after a doc/ADR/plan-touching slice run `graphify update .` to
   fold the doc edits into the graph (it's gitignored — a local refresh, nothing to commit;
   skip if the slice touched no docs, since code already rebuilt via the hook).
6. **Subscription closed:** confirm the PR-activity subscription ended with the merge
   (auto-unsubscribe) or unsubscribe manually.
7. **Notify** per *Staying in touch* (SKILL.md): push; email only if a send-capable tool
   exists.
