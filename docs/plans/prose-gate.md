# One prose gate for skills, doc comments and inline comments — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** One rule ("keep a line of prose only if a fresh session reading it would act
differently"), one review item, and one diff-scoped guard covering `riviera-*` skill prose,
Javadoc/TSDoc, and inline comments — the guard fails CI on a provenance tell in an added skill
line or anywhere in a doc comment the diff touched, and advises on history phrasing.

**Architecture:** Extend `scripts/check-inline-comments.mjs` rather than add a sixth guard: it
already scans comment regions per language, runs as the `PostToolUse` hook, and runs as the
RV-STYLE-1 CI step, so the merged gate keeps one hook entry, one CI step, one advice string.
The one new judging rule is *a touched doc comment is judged whole*: any `/** … */` block with
at least one added line is read line by line, including the lines the diff did not write — that
is what makes "touching an old Javadoc means re-reading it" mechanical. Gating vs advisory
follows `check-focus-posture.mjs`'s `settle()` split: a provenance tell (issue-shaped `#NNN`,
`issue N`, `PR N`) gates; a history phrase (`no longer`, `previously`, `used to be`, …) advises,
because the sample showed those are contract language half the time
(`AvailabilityClaim`: "Release a previously online-claimed set").

**Persistence:** JDBC only (invariant #1). No tables or migrations touched.

**Source of intent:** GitHub issue #956 (owner decision on the issue: hook context + CI fails).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — grounded the
issue in the tree: #884's one-shot trim regressed within ~70 PRs; §6d is review-only; no skill
rule exists; the triage skill's `OUT-OF-SCOPE.md` is the one legitimate issue-number ledger
under `.claude/skills/`, which scoped the markdown half to `SKILL.md` + `references/`) ·
`riviera-plan-doc` (this template — forced the seam per AC and the whole-block rule to be
stated before code) · `tdd` (each detector rule red→green at `findViolations`, then the CLI
front-end at the `guard-cli` harness) · `riviera-review-overlay` (review gate — at ready for
review; RV-PROC-2 for the substrate edits) · `riviera-docs-freshness` (**ran** over
`234b503c..14a3304e`, zero findings; retired `docs/plans/guard-base-fetch-or-refuse.md`, merged via
PR #953, no citations outside `docs/plans/`) · `riviera-local-debug`
(unshallowed the clone before the first `--diff`; `node --test scripts/<file>.test.mjs` is the
scoped run, no `node_modules`).

**Branch:** `claude/docs-quality-gate-llm-6t03he` (the session's designated remote branch
stands in for `feature/prose-gate`).

---

## Acceptance criteria (testable)

The guard's two seams are its exported detector `findViolations({ path, lines, added })`
(pinned in `scripts/check-inline-comments.test.mjs`) and its CLI — `--diff`, `--files`,
`--hook` — spawned against a throwaway repository (pinned in `scripts/guard-cli.test.mjs`).
Doc ACs are verified by reading the merged text against the tree (RV-PROC-2).

- [x] **AC-1:** Given a Java file whose Javadoc block (lines 2–7) carries `(#348)` on line 5,
      when the diff added only line 3 of that block, then one gating `provenance` violation is
      reported at line 5 — the block is judged whole. *Seam:* `findViolations` ·
      *Pinned by:* `check-inline-comments.test.mjs` "judges a touched Javadoc block whole".
- [x] **AC-2:** Given the same file where the diff added a line *outside* that block, when
      judged, then nothing is reported — an untouched doc comment is never read. *Seam:*
      `findViolations` · *Pinned by:* "never reads an untouched doc comment" (AC-3 on the issue).
- [x] **AC-3:** Given `.claude/skills/riviera-x/SKILL.md` where the diff added a prose line
      containing `since #952` and a fenced-code line containing `#333`, when judged, then exactly
      the prose line is a gating `provenance` violation. *Seam:* `findViolations` · *Pinned by:*
      "flags a provenance tell in an added skill line, not inside a fence".
- [x] **AC-4:** Given `.claude/skills/triage/OUT-OF-SCOPE.md` or `docs/adr/0001.md` with an added
      `#134` line, when judged, then nothing is reported — markdown scope is `SKILL.md` and
      `references/*.md` only. *Seam:* `findViolations` · *Pinned by:* "markdown outside
      SKILL.md and references/ is out of scope".
- [x] **AC-5:** Given a TSDoc block the diff added containing `no longer` and no provenance,
      when run as `--diff`, then the guard exits 0 and prints the line as advisory on stdout;
      given it contains `(#521)`, then it exits 1 with the line on stderr and the keep/drop
      sentence. *Seam:* CLI `--diff` · *Pinned by:* `guard-cli.test.mjs` "check-inline-comments
      --diff gates on provenance in a touched doc comment" and "… only advises on a history
      phrase".
- [x] **AC-6:** Given a `PostToolUse` payload for a `.ts` file whose touched TSDoc carries
      `PR #618`, when run as `--hook`, then the JSON `additionalContext` names the line and the
      test sentence. *Seam:* CLI `--hook` · *Pinned by:* `guard-cli.test.mjs`
      "check-inline-comments --hook reports a provenance tell with the keep/drop test".
- [x] **AC-7:** Given `main` as it stands, when `--diff origin/main` runs on this branch, then
      the only reports are lines this branch touched — verified by the PR's own green hygiene
      job, and by the file header of the guard itself, which this slice must clean because it
      touches it (the issue's AC-6 demo).
- [x] **AC-8:** `riviera-java-conventions` §6c states the test, the drop list, the keep list, and
      the three surfaces; §6d keeps the Javadoc-specific budget and relocation rule and cites
      §6c. `frontend/.claude/CLAUDE.md`, `riviera-review-overlay` RV-STYLE-1, `CONTRIBUTING.md`
      and the guard reference cite §6c rather than restate it. *Seam:* the text · *Pinned by:*
      RV-PROC-2 at review + `riviera-docs-freshness` at close-out.

## Non-goals

- No repo-wide sweep of the ~480 existing doc-comment lines carrying tells; untouched blocks
  are never read (issue #956 "Do NOT").
- No gate on `CLAUDE.md`, `frontend/.claude/CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`,
  ADRs or `docs/agents/` — RV-PROC-2 territory; a follow-up if the skill half proves out.
- No gate on `#` comment files (shell, YAML, `.properties`) or SQL `--`; the `#413`/`#417`/`#420`
  comments in `ci.yml` are the keep-list's "trap and its remedy" and stay.
- No new guard file, no hook entry, no CI step. The step's display *name* changes (it is not a
  required context — only the job name is); the issue's "do not rename the CI step" meant the
  job/context names and is corrected here.
- No machine gate on history phrasing — advisory only, for the false-positive reason above.
- `RV-STYLE-1` keeps its number; it widens, it is not renumbered.

## Behavior-parity ledger (retirement / replacement slices only)

The guard's existing surface is extended, not replaced. Every existing behaviour is preserved:

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| multi-line inline comment the diff added → gating RV-STYLE-1 | preserved | same regions, now tagged `rule: 'multiline'`, gating |
| doc comments exempt from the one-line rule | preserved | still exempt from `multiline`; now subject to the tell rules when touched |
| file-header block exempt | preserved | exempt from `multiline`; a file-header block is not a doc comment, so untouched by the tell rules |
| diff-scoped for tracked files; untracked judged whole | preserved | unchanged in `check`/`checkPaths` |
| `--hook` advisory JSON, `--files` exit 1, `--diff` exit 1, usage → 2 | preserved | `settle()` returns the same codes; advisory-only output exits 0 |
| the deliberate false negative (appending to an existing inline block) | preserved | documented in the guard reference, unchanged |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | False positive on an issue-shaped `#NNN` that is not provenance (a hex colour `#333`, a heading, an anchor) | med | high — a gate with false positives gets switched off (#529) | markdown: skip fenced code and backtick spans; all files: require `#\d{3,4}` not preceded by a word char, `#` or `&`, and not followed by a word char; pinned by AC-3 | agent | closed — pinned by AC-3 (e4dd8950, 0dc04164) |
| R-2 | History phrases are contract language in some doc comments ("previously claimed") | high | med | advisory only, never gating; pinned by AC-5 | agent | closed — 035011a6 |
| R-3 | A prettier reflow or rename touches an old doc comment and the gate demands its cleanup | med | low — that is the intended rule | stated in §6c and the guard reference: a touched block is re-read; relocate rationale per §6d | agent | closed — §6c and the guard reference state it (Phase 3) |
| R-4 | This slice's own diff trips the gate (the guard's header Javadoc cites five issues) | certain | none — it is the AC-6 demo | clean the touched blocks in Phase 3; record it in the PR description | agent | closed — the header was rewritten in Phase 3; the gate exits 0 on the branch |
| R-5 | Hook noise: an edit to a large file with an old provenance-laden Javadoc anywhere near the edit | low | med | only blocks with an added line are read; `--files`/`--hook` stay diff-scoped against `HEAD` for tracked files | agent | closed — `tellViolations` reads only touched regions (e4dd8950) |

## Open questions / Assumptions


### Resolved

- **Decision:** judging a touched doc comment whole flags lines the diff never wrote — the one
  place this slice deliberately departs from the guard's founding stance (a false positive
  switches a gate off, a false negative goes to review). Owner's ask on #956: touching an old
  Javadoc/TSDoc means re-reading it against the test. Bounded by touch (an untouched block is
  never read) and by rule (only provenance gates there; history advises), so the cost of an
  unrelated one-line edit to an old block is one cleanup of that block, once.

- **Assumption:** the `PostToolUse` hook's `additionalContext` carries the test sentence at
  authoring time → confirmed: it fired on the guard's own doc comment during Phase 0 and the
  wording was fixed before commit (035011a6 pins the message).

- **Open question (issue):** advisory or blocking? → **blocking for provenance, advisory for
  history phrasing**, owner decision recorded on #956.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; the slice touches `scripts/`, `.claude/`, `.github/` and
prose only.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope (the Java conventions *skill* changes; no Java does).

### Module ownership (§4a)

N/A — no module behaviour added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — no frontend code in scope (`frontend/.claude/CLAUDE.md` prose only).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — merged via PR #957`

**Next action:** none — close-out written here; this plan is deleted at the next close-out after PR #957 merges (`riviera-docs-freshness` § *Plan-doc retirement*).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — provenance in a touched doc block, judged whole | ✅ | e4dd8950 |
| 1 — skill markdown: added lines, fences and spans exempt, scope | ✅ | 0dc04164 |
| 2 — history advisory + `settle()` exit codes + hook/CLI rows | ✅ | 035011a6 |
| 3 — the rule folded into §6c/§6d, RV-STYLE-1, the reference, the citing docs; clean the touched headers | ✅ | 823dfdbf |
| 3a — review-gate fix round (F-1…F-6) | ✅ | 14a3304e |
| 4 — close-out: docs-freshness, plan final, retire the merged plan from PR #953 | ✅ | (this commit — the PR's last) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (#2, #3, #4) | code after a block comment's closing marker on the same line was scanned as comment text | fixed — `endColumn` on block regions; pinned by "never reads the code after a block comment closes on the same line" |
| F-2 | review (#2, #3, #4) | a bare pure-digit `#123` in a source comment gated as provenance (a colour); the markdown path stripped spans, the comment path did not | fixed — a bare `#NNN` counts only in a citing position (after `(`, `/`, a comma, or a citing word); pinned by "a bare issue number counts only in a citing position" |
| F-3 | review (#5) | four documents said provenance gates only skill lines and touched doc comments; the guard also gates an added inline comment | fixed — §6c, RV-STYLE-1, `CONTRIBUTING.md`, the `ci.yml` step comment |
| F-4 | review (#6, RV-PROC-2a) | the guard reference's `SecurityConfig` count (25) had drifted (29) | fixed — no count |
| F-5 | review (#3) | the whole-block rule was not recorded as a decided departure from the guard's false-positive stance | fixed — Resolved decision above |
| F-6 | review (#1) | the new `ci.yml` step comment cited `#956` | fixed — dropped; YAML stays out of the guard's scope |

**Review note.** Gate run per `pr-gates.md` §1 rung 1 (the code-review plugin: six agents incl. the
overlay's RV-PROC walk) over `234b503c..823dfdbf`, range verified by `check-review-range.mjs`;
outcome posted on PR #957. Fix round re-reviewed over `823dfdbf..14a3304e`.

**Sonar note.** Analysis present for PR #957: 0 new issues, 0 bugs, 0 smells, 0 vulnerabilities,
no duplication or new-lines measure reported — the PR touches only `scripts/`, `.claude/`, `.github/`
and prose, none of which Sonar analyses (#954), so the green gate is vacuous here and the
guard suites are the coverage.

---

## File structure

- `scripts/check-inline-comments.mjs` — the detector gains `TELLS`, the touched-doc-block and
  markdown rules, `settle()`; the header and touched doc comments are cleaned of provenance
- `scripts/check-inline-comments.test.mjs` — detector cases for AC-1…AC-4
- `scripts/guard-cli.test.mjs` — CLI rows for AC-5, AC-6
- `.claude/skills/riviera-java-conventions/SKILL.md` — §6c becomes the merged rule; §6d Javadoc-specific
- `.claude/skills/riviera-java-conventions/references/inline-comment-guard.md` — scope of the two new rules
- `.claude/skills/riviera-review-overlay/SKILL.md` — RV-STYLE-1 widened
- `frontend/.claude/CLAUDE.md` — Comments section cites §6c
- `CONTRIBUTING.md` — the guard's one-line description
- `.claude/settings.json` — the hook's `statusMessage`
- `.github/workflows/ci.yml` — the step's display name and the hygiene job's guard list comment
- `docs/plans/prose-gate.md` — this plan

---

## Phase 0 — Provenance in a touched doc block, judged whole

**Files:** Modify `scripts/check-inline-comments.mjs` · Test `scripts/check-inline-comments.test.mjs`

- [x] **Step 1: Write the failing tests** (AC-1, AC-2): a Javadoc block lines 2–7 with `(#348)`
      on line 5; `added: new Set([3])` → one violation `{ rule: 'provenance', line: 5 }`;
      `added: new Set([8])` → `[]`.
- [x] **Step 2: Run it, verify it fails** — `node --test scripts/check-inline-comments.test.mjs` → FAIL (no `rule`, no violation).
- [x] **Step 3: Minimal implementation** — `TELLS.provenance` regex; in `findViolations`, for
      each `isDoc` region with any line in `added`, test every line; tag existing multiline
      violations `rule: 'multiline'`.
- [x] **Step 4: Run it, verify it passes** — same command → PASS; the 15 existing cases still pass.
- [x] **Step 5: Generalization-audit pass** — population: "every guard that classifies a comment
      region" → `grep -l "isDoc" scripts/*.mjs` → only this guard; skip.
- [x] **Step 6: Commit** — `git commit -m "Judge a touched doc comment whole for provenance tells (#956)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 1 — Skill markdown: added lines, fences and spans exempt, scope

**Files:** Modify `scripts/check-inline-comments.mjs` · Test `scripts/check-inline-comments.test.mjs`

- [x] **Step 1: Write the failing tests** (AC-3, AC-4).
- [x] **Step 2: Verify they fail** — `syntaxFor` returns null for `.md`.
- [x] **Step 3: Minimal implementation** — `syntaxFor` answers `{ markdown: true }` for
      `.claude/skills/<skill>/SKILL.md` and `.claude/skills/<skill>/references/**/*.md`; a
      markdown scan tracks fence state and strips backtick spans before testing an added line.
- [x] **Step 4: Verify pass.**
- [x] **Step 5: Generalization-audit** — population: "every place that decides a path's scope
      for this guard" → `grep -n "syntaxFor" scripts/check-inline-comments.mjs` → the hook,
      `--files`, `check`; all route through the one function; no further sites.
- [x] **Step 6: Commit** — `git commit -m "Gate provenance in added riviera skill lines (#956)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — History advisory + `settle()` exit codes + hook/CLI rows

**Files:** Modify `scripts/check-inline-comments.mjs` · Test `scripts/guard-cli.test.mjs`, `scripts/check-inline-comments.test.mjs`

- [x] **Step 1: Write the failing tests** (AC-5, AC-6): CLI rows in the harness; a detector case
      for `rule: 'history'` on `no longer`.
- [x] **Step 2: Verify they fail.**
- [x] **Step 3: Minimal implementation** — `TELLS.history`; `GATING = new Set(['multiline',
      'provenance'])`; `settle(violations, headline)` after the focus guard's; `ADVICE` keyed by
      rule with the keep/drop sentence; `--hook` lists all rules.
- [x] **Step 4: Verify pass** — `node --test "scripts/*.test.mjs"`.
- [x] **Step 5: Generalization-audit** — population: "every guard with an advisory tier" →
      `grep -l "advisory" scripts/check-*.mjs` → focus posture and now this one; the shape is
      copied, not shared — a shared helper is a refactor for review, not this loop.
- [x] **Step 6: Commit** — `git commit -m "Advise on history phrasing; one settle() for the comment guard (#956)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — The rule, folded

**Files:** Modify the eight prose/config files listed under File structure.

- [x] §6c rewritten: the test, drop list, keep list, three surfaces, the one-line floor, the guard
      and its modes; §6d keeps budget + relocation, cites §6c for the test.
- [x] `inline-comment-guard.md`: the two new rules' scope and exemptions, the advisory tier, the
      touched-block rule.
- [x] RV-STYLE-1 widened; RV-PROC-2 untouched.
- [x] `frontend/.claude/CLAUDE.md`, `CONTRIBUTING.md`, `settings.json` `statusMessage`,
      `ci.yml` step name + job comment.
- [x] The guard's own touched doc comments cleaned (R-4); `node scripts/check-inline-comments.mjs
      --diff origin/main` → exit 0 on this branch.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` → exit 0.
- [x] **Commit** — `git commit -m "Fold the comment rules into one prose gate: keep it only if a fresh session would act on it (#956)"`

## Phase 4 — Close-out

- [x] Draft PR → ready for review; review gate (`/code-review` + overlay); Sonar list.
- [x] `riviera-docs-freshness` over `origin/main..HEAD`.
- [x] Plan final state in the last code-touching commit (`merged via PR #NN`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | Phase 0 | every guard that classifies a comment region | `grep -l isDoc scripts/*.mjs` | this guard only | skip |
| 2026-09-05 | Phase 1 | every site deciding a path's scope for this guard | `grep -n syntaxFor scripts/check-inline-comments.mjs` | hook, `--files`, `check` — all via the one function | none needed |
| 2026-09-05 | Phase 2 | every guard with an advisory tier | `grep -l advisory scripts/check-*.mjs` | focus posture, this guard | shape copied, not shared (a helper is review-stage refactoring) |
| 2026-09-05 | F-1 fix | every reader of a comment region's text | `grep -n "region.column\|endColumn" scripts/check-inline-comments.mjs` | `tellViolations` only | fixed there |

---

## Acceptance-criteria verification (final)

- [x] **AC-1…AC-6:** `node --test "scripts/*.test.mjs"` → 264 pass, 0 fail. Verified at commit `14a3304e`.
- [x] **AC-7:** `Repo hygiene (diff-scoped)` green on 823dfdbf (first ready head) and on the final head per the PR's checks; `--diff origin/main` exits 0 locally at `14a3304e`.
- [x] **AC-8:** RV-PROC-2 walked at review (one Minor, F-4, fixed); `riviera-docs-freshness` ran over `234b503c..14a3304e` — zero findings.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
