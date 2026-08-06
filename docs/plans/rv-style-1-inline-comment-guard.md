# RV-STYLE-1 authoring-time guard Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A diff-scoped checker that fails when a diff *writes* a multi-line inline comment
in Java, TypeScript, SCSS/CSS or HTML, wired so the authoring agent sees it immediately
after the offending edit — not eight PRs later at the review gate.

**Architecture:** One dependency-free Node ESM script, `scripts/check-inline-comments.mjs`,
holding a pure detector (added lines in → findings out) behind two thin git front-ends: a
`--files` mode the Claude Code `PostToolUse` hook calls per edited file, and a `--diff` mode
CI calls over the whole branch. The single most significant decision is that the detector is
**diff-scoped by construction** — it only ever reasons about lines a diff *added* — because
the existing tree carries dozens of pre-existing multi-line inline comments that read as
established convention, and a repo-wide gate would go red on day one and get switched off
(issue #529's one hard constraint).

**Persistence:** N/A — no database, no migration, no schema change. Invariant #1 untouched.

**Source of intent:** GitHub issue #529.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's "`//`-style … Java and TypeScript" AC is narrower than the rule it enforces, and that
one of the two named test cases has no commit to point at) · `riviera-plan-doc` (this
template — forced the Non-goals section that pins the `#`/SQL-`--` exclusions, and the risk
register that surfaced R-2/R-3) · `tdd` (detector built test-first: every rule below is a
failing spec before it is code, the two named regressions first) · `riviera-review-overlay`
(review gate — due at ready-for-review; RV-STYLE-1 is the item this slice automates) ·
`riviera-docs-freshness` (**ran** over the slice's own range at close-out — see Execution
status) · `update-config` (Claude Code hook authority — gave the `PostToolUse` schema, the
`hookSpecificOutput.additionalContext` feedback channel over a blocking `decision`, the
merge-don't-replace rule for the existing `hooks` block, and the pipe-test/`jq -e` validation
flow used in phase 2) · `postgres` `N/A — no SQL, no migration` · `riviera-modulith` +
`riviera-java-conventions` `N/A — the guard reads Java, it adds none` · `riviera-frontend` +
`angular-developer` + `playwright-cli` `N/A — nothing under frontend/src or frontend/e2e` ·
`riviera-local-debug` (run recipes — the checker's suite is `node --test`, no Gradle/npm)

**Branch:** `claude/sdlc-529-f6p8y1` — the cloud session's designated remote branch, standing
in for `feature/rv-style-1-inline-comment-guard` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

> Written against the detector's own boundary — added lines in, findings out — not against
> the git plumbing or the hook JSON, both of which are thin adapters over it.

- [ ] **AC-1 (the #522 regression):** Given the `SecurityConfig` matcher comment exactly as
      commit `7d89c0b` wrote it — two `//` lines above `.requestMatchers(HttpMethod.GET,
      ADMIN_VENUE_COMMISSIONS_PATH)` — when the detector runs over that hunk as added lines,
      then it reports one finding naming the file and the block's first line.
      *Pinned by:* `check-inline-comments.test.mjs` › `flags the SecurityConfig two-line matcher block (#522)`
- [ ] **AC-2 (the SCSS `/* */` case):** Given a two-line `/* … */` comment added inside a
      `:root` block in a `.scss` file, when the detector runs, then it reports one finding —
      i.e. the guard is comment-syntax-scoped, not `//`-only.
      *Pinned by:* `check-inline-comments.test.mjs` › `flags a two-line block comment in SCSS`
- [ ] **AC-3 (doc comments exempt):** Given an added Javadoc `/** … */` spanning eight lines
      and an added TSDoc block, when the detector runs, then it reports nothing.
      *Pinned by:* `check-inline-comments.test.mjs` › `exempts Javadoc and TSDoc doc comments`
- [ ] **AC-4 (one-liners pass):** Given added one-line `//`, `/* … */` and `<!-- … -->`
      comments — including two one-line comments separated by a line of code — when the
      detector runs, then it reports nothing.
      *Pinned by:* `check-inline-comments.test.mjs` › `passes one-line comments`
- [ ] **AC-5 (no false positive on strings):** Given an added line declaring a URL
      (`"https://example.com"`), a Java text block containing `//`, and a line where `/*`
      appears inside a string literal, when the detector runs, then it reports nothing.
      *Pinned by:* `check-inline-comments.test.mjs` › `does not treat comment markers inside string literals as comments`
- [ ] **AC-6 (diff-scoped, the hard constraint):** Given `styles.scss` and `SecurityConfig.java`
      exactly as they stand on `main` — both carrying pre-existing multi-line inline comments —
      when the checker runs in `--diff` mode with no lines added, then it exits 0 and reports
      nothing. *Pinned by:* `check-inline-comments.test.mjs` › `reports nothing when a diff adds no lines`
      **and** the phase-1 whole-repo run recorded in AC-verification.
- [ ] **AC-7 (fires at authoring time):** Given the `PostToolUse` hook installed in
      `.claude/settings.json`, when it is piped the payload Claude Code sends after an `Edit`
      of a file containing a diff-added multi-line inline comment, then the hook emits
      `hookSpecificOutput.additionalContext` naming the violation. *Pinned by:* the phase-2
      pipe-test recorded in AC-verification (a hook is config, not a unit — the detector under
      it is covered by AC-1..AC-6).
- [ ] **AC-8 (the rule points at the tool):** Given `riviera-java-conventions` §6c and
      `riviera-review-overlay` RV-STYLE-1, when a reader reaches either, then both name
      `scripts/check-inline-comments.mjs` and state its language scope, so the review item
      points at the guard instead of duplicating the check by hand.
      *Pinned by:* the phase-3 diff + the review gate's own read.

## Non-goals

- **No repo-wide sweep and no back-fixing the existing tree.** The pre-existing multi-line
  inline comments in `SecurityConfig` (3 blocks), `styles.scss` (6 blocks) and elsewhere stay
  exactly as they are. Issue #529's constraint; RV-STYLE-1's own "don't reflow untouched
  comments to satisfy it".
- **No `#`-comment languages** — shell, YAML, `.properties`. RV-STYLE-1's scope names `#`, but
  in *this* repo every `#` file (`ci.yml`, `sonar-project.properties`, `scripts/*.sh`) carries
  multi-line `#` header prose as its documented convention; including them would reproduce the
  day-one-red failure the issue rules out. Human review still governs them.
- **No SQL `--`.** Settled by precedent, not invented here: PR #522 finding F-6 declined
  exactly this, citing `V9__payout_ledger.sql`'s matching shape.
- **No plan-doc File-structure guard.** The issue's related-recurrence note; kept out by the
  triage call recorded below, and tracked as its own issue.
- **No pre-commit hook and no Husky dependency.** The wiring decision picked the Claude Code
  hook + CI; a `git` pre-commit hook lives in `.git/hooks`, which is not version-controlled,
  so it would need an install step this slice does not want to add.
- **No auto-fix.** The guard reports; the author shortens or deletes. Reflowing prose
  automatically is how a rule about *judgment* becomes a rule about *formatting*.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. RV-STYLE-1 stays exactly as written; this slice adds a
tool that fires earlier and leaves the review item's wording governing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | False positive on a comment marker inside a string literal (`"https://…"`) — this repo is full of URLs and text-block SQL; one bad flag on a legitimate line and the guard gets switched off | high | high | The detector scans character-by-character tracking quote state (`"`, `'`, backtick, Java `"""` text blocks) rather than regex-matching `//`; AC-5 pins it | Claude | open |
| R-2 | False positive on a **file-header** block comment — `styles.scss` opens with a multi-line `/* * … */` header, and PR #471 edited it; flagging that would fail the guard on its own repo | med | high | A block comment appearing before any non-comment content is treated as the file's doc comment and exempted, same category as Javadoc | Claude | open |
| R-3 | Hook latency on every `Edit`/`Write` makes the session sluggish and the hook gets removed | low | med | The check is one `git diff` + a regex-free line scan of a single file; the hook is filtered by extension before any work, and wrapped so a failure can never block an edit | Claude | open |
| R-4 | The hook is written correctly but never fires, giving false confidence that authoring-time coverage exists | med | med | Phase 2 does not claim done on the JSON alone: it pipe-tests the raw command, validates placement with `jq -e`, and proves the hook fires via a sentinel edit (the `update-config` verification flow) | Claude | open |
| R-5 | The guard disagrees with the rule it enforces — the tool covers 4 languages, RV-STYLE-1's text names `#` too — and a future session "fixes" one to match the other | med | low | Phase 3 writes the scope into both `riviera-java-conventions` §6c and RV-STYLE-1, so the narrowing is stated where the rule is read, not only here (AC-8) | Claude | open |

## Open questions / Assumptions

- **Assumption:** the `#467/F-1 styles.scss` case named in the issue's ACs is unreconstructable
  as a commit — PR #467 has no reviews and no `styles.scss` hunk, and the issue itself says the
  finding scored 25 confidence, *below the reporting bar*, so it was never posted or committed.
  AC-2 therefore pins the same *class* with a verbatim-shaped SCSS two-line block rather than a
  quoted specimen. — *Owner:* Claude · *Resolves by:* phase 0

### Resolved

- **Q1 — build the guard, or close `wontfix`?** → **Build it.** User decision, this session.
  Grounds recorded on the issue: #521 fixed a multi-line block on `SecurityConfig`'s matcher
  constants and #522 re-broke the same block days later, so habit alone does not survive a
  session boundary.
- **Q2 — where does it fire?** → **Claude Code `PostToolUse` hook + CI backstop.** User
  decision, this session. In this repo the author *is* the agent, so the hook is the only
  wiring that fires before the code is even committed; CI catches an author with hooks off.
- **Q3 — does this issue also cover the plan-doc File-structure guard?** → **No, RV-STYLE-1
  only.** User decision, this session (the issue left it to triage). Different input, own issue.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds no runtime code: nothing reads or writes
`availability(set_id, booking_date)`, no booking path, no beach map. The only artifacts that
execute are a developer-tooling script, a Claude Code hook, and a CI step.

## Spring Modulith — modules, interfaces, events

N/A — no backend Java is added, moved, or modified. The guard *reads* `.java` files as text;
it introduces no class, port, event, or package, so `ApplicationModules.verify()` and the
package-shape tests are untouched. No module ownership question arises (§4a).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money, no ledger, no Stripe surface.

## Angular — frontend surfaces touched

N/A — nothing under `frontend/src` or `frontend/e2e`. The guard reads `.ts`/`.scss`/`.html`
as text; it adds no component, route, service or spec, so no e2e coverage is due.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or wire shape.

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** Phase 3 — point §6c and RV-STYLE-1 at the guard, open the plan-doc-guard
follow-up issue, record the decision on #529, then close out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Detector core, test-first | ✅ | `175bac5` |
| 1 — Git front-ends (`--files`, `--diff`) + clean-tree proof | ✅ | `4468e5f` |
| 2 — Wiring: PostToolUse hook + CI step | ✅ | this commit |
| 3 — Rule docs name the guard; follow-up issue; close-out | ⏳ | |

**Positive control (phase 1).** An exit 0 is not evidence the plumbing works, so the #522 block
was re-injected into `SecurityConfig.java` verbatim and the CLI run against it: `--files` exited
1 naming `SecurityConfig.java:422-423`, `--hook` emitted the `additionalContext` payload, and the
file was reverted clean. That is AC-1 proven end-to-end through git, not only through the unit.

**Hook verification (phase 2, AC-7).** The `update-config` flow ran in full: the raw command was
pipe-tested on three payloads (violating file → JSON, clean file → silent, `.md` → silent) before
any JSON was written; the entry was **merged** into the existing `hooks` block (`SessionStart` and
both `PreToolUse` entries intact, 61 permissions and 2 plugins untouched); `jq -e` confirmed
placement; a sentinel prefix proved the hook fires; and finally a **real violation was introduced
through the `Edit` tool** — the hook answered in-context naming
`scripts/check-inline-comments.mjs:150-151`, and the edit was reverted. The guard's first live
catch was on its own source.

**Positive control (phase 1).** An exit 0 is not evidence the plumbing works, so the #522 block
was re-injected into `SecurityConfig.java` verbatim and the CLI run against it: `--files` exited
1 naming `SecurityConfig.java:422-423`, `--hook` emitted the `additionalContext` payload, and the
file was reverted clean. That is AC-1 proven end-to-end through git, not only through the unit.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `scripts/check-inline-comments.mjs` — **new.** The detector (pure: added lines → findings)
  plus the two git front-ends and the CLI.
- `scripts/check-inline-comments.test.mjs` — **new.** `node --test` suite; owns AC-1..AC-6.
- `.claude/settings.json` — **modified.** A `PostToolUse` entry on `Write|Edit` merged into the
  existing `hooks` block (which already carries `SessionStart` and two `PreToolUse` entries).
- `.github/workflows/ci.yml` — **modified.** A diff-scoped step in the existing `frontend` job
  (Node is already set up there) or a small standalone job.
- `.claude/skills/riviera-java-conventions/SKILL.md` — **modified.** §6c names the guard.
- `.claude/skills/riviera-review-overlay/SKILL.md` — **modified.** RV-STYLE-1 names the guard
  and its language scope.
- `docs/plans/rv-style-1-inline-comment-guard.md` — **new.** This document.

---

## Phase 0 — Detector core, test-first

**Files:** Create `scripts/check-inline-comments.test.mjs` · Create `scripts/check-inline-comments.mjs`

The detector's contract: given a file path (for extension → comment syntax) and the file's new
content annotated with which line numbers the diff **added**, return one finding per comment
block that (a) spans more than one line, (b) is not a doc comment, (c) is not a file header,
and (d) has at least one added line.

- [ ] **Step 1: Write the failing tests** — AC-1 and AC-2 first (the two named regressions),
      then AC-3/AC-4 (exemptions), AC-5 (string safety), AC-6 (empty diff).
- [ ] **Step 2: Run them, verify they fail** — `node --test "scripts/*.test.mjs"` → FAIL (module not found)
- [ ] **Step 3: Minimal implementation** — the line scanner with quote-state tracking.
- [ ] **Step 4: Run them, verify they pass** — `node --test "scripts/*.test.mjs"` → PASS
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Add the diff-scoped inline-comment detector (#529)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Git front-ends and the clean-tree proof

**Files:** Modify `scripts/check-inline-comments.mjs` · Modify `scripts/check-inline-comments.test.mjs`

- [ ] **Step 1:** `--diff <baseRef>` — added lines from `git diff --unified=0 <base>...HEAD`.
- [ ] **Step 2:** `--files <paths…>` — added lines of each path against `HEAD` (working tree),
      which is what the hook needs after an `Edit`.
- [ ] **Step 3:** Prove AC-6 for real — run `--diff origin/main` on a clean `main` checkout and
      on this branch; both report only what this branch actually writes.
- [ ] **Step 4: Commit** + execution-status update.

## Phase 2 — Wiring: PostToolUse hook + CI step

**Files:** Modify `.claude/settings.json` · Modify `.github/workflows/ci.yml`

Follows the `update-config` construction flow — dedup check, build the command, **pipe-test it
raw**, write the JSON, validate with `jq -e`, then prove it fires with a sentinel.

- [ ] **Step 1:** Build + pipe-test the hook command against a real repo file.
- [ ] **Step 2:** Merge the `PostToolUse` entry into the existing `hooks` block — never replace it.
- [ ] **Step 3:** `jq -e` placement validation.
- [ ] **Step 4:** Prove it fires (sentinel), then clean up.
- [ ] **Step 5:** Add the CI step; keep it diff-scoped against the PR base.
- [ ] **Step 6: Commit** + execution-status update.

## Phase 3 — The rule points at the tool; follow-up issue; close-out

**Files:** Modify `.claude/skills/riviera-java-conventions/SKILL.md` · Modify `.claude/skills/riviera-review-overlay/SKILL.md`

- [ ] **Step 1:** §6c and RV-STYLE-1 name the guard, its command, and its language scope (AC-8, R-5).
- [ ] **Step 2:** Open the follow-up issue for the plan-doc File-structure guard (Q3).
- [ ] **Step 3:** Record the decision on #529 (its AC-1).
- [ ] **Step 4:** `riviera-docs-freshness` over the slice range; plan-doc final state.
- [ ] **Step 5: Commit** + execution-status update.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1..AC-6:** Run `node --test "scripts/*.test.mjs"` → all pass. Verified at commit `<sha>`.
- [ ] **AC-6 (real tree):** Run `node scripts/check-inline-comments.mjs --diff origin/main` →
      exit 0 on an unchanged tree. Verified at commit `<sha>`.
- [ ] **AC-7:** Pipe-test transcript recorded in phase 2. Verified at commit `<sha>`.
- [ ] **AC-8:** Both skill files name the guard. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
