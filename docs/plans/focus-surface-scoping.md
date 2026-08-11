# Narrow FOCUS-1 from component scope to surface scope Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** make `scripts/check-focus-posture.mjs`'s FOCUS-1 report a stranded-focus surface that a
*second* surface in the same component currently hides — measured against the tree that hid instance
14 — without reporting any of the 11 correct surfaces standing today.

**Architecture:** the exemption moves from **the component** to **the signal that gates the surface**:
a surface is excused when at least one of its gating signal's flip-to-closed sites moves focus inside
its own class member. That sits deliberately between the two shapes #621 rejected — strictly narrower
than "the component moves focus somewhere", strictly wider than the killed flip-level rule that
demanded a leg at *every* flip site (which false-positived on bulk state resets). The trigger widens
with it: instance 14 was a **modal dismiss**, not a confirm branch, so a branch that renders a
focus-trapped child is now a surface too.

**Persistence:** JDBC only (invariant #1). N/A — no tables, no migration; this is repo tooling.

**Source of intent:** GitHub issue #624 (deferred from #621 / PR #622 as known limit (a) in
`docs/plans/focus-posture-guard.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the issue proposed two
shapes and asked for a spike first; the gate is what made the spike precede the design, and it is
what refuted both proposals) · `riviera-plan-doc` (this template — forced the counterfactual
measurement into an AC rather than a claim, and the Behavior-parity ledger for a rule that already
ships) · `tdd` (every predicate change proven RED against a fixture first, then the four-tree
measurement re-run) · `riviera-review-overlay` (review gate — at ready-for-review) ·
`riviera-docs-freshness` (**ran** over `origin/main..HEAD` — 5 findings, all patched in this PR: the
FOCUS-1 paragraph in both `CLAUDE.md` files, its "does this **component** move focus" rationale, and
#621's known limit (a) plus the Non-goal that filed this issue. The counting sweep found nothing
falsified — the guard still has exactly two rules and the hygiene job still four checks) ·
`riviera-frontend` (**not loaded — no file under `frontend/src` or `frontend/e2e` changes**; the one
frontend-tree file touched is `frontend/.claude/CLAUDE.md`, the convention prose the guard enforces).

**Branch:** `claude/issue-624-nwe7aj` — the cloud session's designated branch stands in for
`bugfix/focus-surface-scoping` (`riviera-sdlc` § Remote / cloud session addendum).

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC against the application boundary —
> the inner hexagon — not the outside technology.**

- [x] **AC-1:** Given a branch whose condition names no confirm flag but whose body renders a
  focus-trapped child, when the file is judged, then the branch is a FOCUS-1 surface. *Pinned by:*
  `check-focus-posture.test.mjs` › `treats a branch that renders a focus-trapped child as a surface`
- [x] **AC-2:** Given a component that moves focus for one surface while every flip-to-closed site of
  a *second* surface's signal moves focus nowhere, when the file is judged, then that second surface
  is reported — the exemption instance 14 hid behind. *Pinned by:* `check-focus-posture.test.mjs` ›
  `reports a second surface the component moves no focus for`
- [x] **AC-3:** Given a signal flipped closed at two sites, one of which moves focus, when the file is
  judged, then nothing is reported — a bulk state reset beside a compliant dismiss is not a
  violation (the shape that killed the flip-level rule in #621). *Pinned by:*
  `check-focus-posture.test.mjs` › `accepts a signal one of whose flip sites moves focus`
- [x] **AC-4:** Given the standing tree, when `--all` sweeps it, then FOCUS-1 reports **0** over the
  11 surfaces it now judges (up from 8 confirm-only). *Pinned by:* the recorded `--all` run under
  Acceptance-criteria verification, plus the mutation sweep that proves all 11 are judged —
  deliberately not a suite-level test, which would be a repo-wide gate (#621 R-1).
- [x] **AC-5:** Given a modal branch whose component restores focus with a plain `.focus()` and no
  `afterNextRender` (`app.ts`, `venue-map.ts`), when the file is judged, then nothing is reported —
  the component-level floor does not reach the widened trigger. *Pinned by:*
  `check-focus-posture.test.mjs` › `does not apply the component floor to a modal branch`
- [x] **AC-6:** Given a page-level branch that contains a nested branch rendering the modal, when the
  file is judged, then only the innermost branch is the surface. *Pinned by:*
  `check-focus-posture.test.mjs` › `attributes a modal to the innermost branch that renders it`
- [x] **AC-7:** Given a component whose mover field is not named `focusAfterRender`, when its flip
  site calls that field, then the surface is exempt. *Pinned by:* `check-focus-posture.test.mjs` ›
  `counts a call to a mover field under any name`
- [x] **AC-8:** Given a component with an **external** template, when either half is judged, then the
  sibling supplies the missing side of the rule and each half reports at the line it can act on — the
  `.ts` at the flip, the `.html` at the branch. *Pinned by:* `check-focus-posture.test.mjs` ›
  `judges a component with an external template against its sibling`
- [x] **AC-9:** Given a diff that added neither the branch line nor a flip line, when the file is
  judged diff-scoped, then nothing is reported. *Pinned by:* `check-focus-posture.test.mjs` ›
  `judges only the surfaces and flips a diff added`
- [x] **AC-10:** Given a FOCUS-1 finding and no BUSY-1 finding, when the CLI runs `--diff`, then it
  prints the advisory and exits **0** (#621's settled posture, unchanged). *Pinned by:*
  `check-focus-posture.test.mjs` › `keeps FOCUS-1 advisory and BUSY-1 gating`
- [x] **AC-11:** Given `payouts-tab` as it stood mid-#621 — the weather-confirm legs in, the
  statement-modal legs not yet — when judged, then FOCUS-1 reports the statement surface. *Pinned
  by:* `check-focus-posture.test.mjs` › `reports the surface that hid behind the weather-confirm legs`

## Non-goals

- **FOCUS-1 stays advisory, not gating.** #621's third review pass settled that (the predicate still
  approximates a runtime property); this slice sharpens *what it sees*, not *what it fails*. The
  false-positive count over the standing tree is 0, but so it was for the predicate that then found
  three fresh holes in three passes.
- **Neither shape the issue proposed is built.** Both are refuted by the spike (recorded under
  Resolved open questions): counting legs against surfaces misses instance 14 outright, and counting
  *movers* against surfaces reports `booking-view` — one `focusMover()` field, two correct confirm
  surfaces, nine legs — which is a false positive on correct code (the G-2 error direction).
- **No child-component behaviour analysis beyond the modal markers.** A tag resolves to a focus trap
  by `trapFocusWithin` / `aria-modal` / `role="dialog"` in the file its selector's basename names; an
  unresolvable tag is not a modal. That is the safe error direction, and the same posture
  `BUSY_STEMS` takes.
- **A second stranding flip beside a compliant one stays unreported.** One compliant flip site excuses
  the signal, so adding a *new* teardown to a signal that already has a good one is silent — verified
  against `payouts-tab`'s `statementOpen` through the hook. That is the direct price of not reporting
  every bulk state reset, which is the rule #621 killed; the alternative trades this miss for the
  false positive the guard cannot afford. Stated in the guard's TSDoc and in the conventions doc.
- **No `--fix` mode**, unchanged from #621: where focus should land stays a judgement call.
- **No new e2e or component specs.** No file under `frontend/src` changes, so there is no runtime
  behaviour to pin; the 14 shipped instances keep their existing specs.
- **No re-audit of the standing tree's focus legs.** `--all` is 0 and stays the evidence; this slice
  does not re-open the fixed instances.

## Behavior-parity ledger

> The slice replaces no surface — it changes one rule inside a guard that already ships. What it
> *changes* is what FOCUS-1 reports, verdicted here.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| FOCUS-1 reports a component that renders a confirm branch and holds no focus call site | preserved | the component-level floor is kept verbatim for confirm branches — every existing test of it passes unmodified |
| One finding per component, anchored at the prompt branch rather than the trigger | preserved | unchanged for the floor; the new signal-scoped finding is per **signal**, which is the point (a component with two broken surfaces has two) |
| Rendering `<app-confirm-panel>` is not an exemption | preserved | untouched — the shared panels own the open leg only |
| A component that moves focus **anywhere** is exempt for **every** surface it owns | **changed (deliberate)** | that is the gap #624 exists for; the exemption is now per gating signal, and the floor is what stays component-wide |
| The trigger is a confirm-conditioned branch | **changed (extended)** | a branch rendering a focus-trapped child is a surface too — instance 14 was a modal dismiss, not a confirm branch |
| BUSY-1 gates the build; FOCUS-1 advises | preserved | untouched, and pinned by AC-10 |
| Diff-scoped: only lines the diff added are judged | preserved (extended) | a surface is judged when the diff wrote its branch line **or** a flip site of its gating signal — the same scoping question asked of the second half of the rule, and what keeps a newly added stranding branch from going unreported when only one half of a split component is in the diff (F-10) |
| `--hook` / `--files` judge a named file whole | preserved | unchanged; still the authoring-time half where a whole-file verdict is wanted |
| The guard imports nothing outside `node:` and `./git-diff.mjs` | preserved | the modal index is one `git ls-files`, built lazily and cached, through the existing `git()` helper |
| A `.ts` is scanned for its inline `template:` literal only | **changed (deliberate)** | a `.ts` whose sibling `.html` holds the template now reads it, so editing the component reports its own flip lines rather than nothing |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **A false positive kills the rule.** #621's own history is three review passes, each finding a fresh false positive in this predicate; the standing tree's 11 surfaces must all stay green | high | high | The predicate is measured over **four trees**, not argued: HEAD (expect 0), the mid-#621 counterfactual (expect exactly instance 14), and the pre-#621 / pre-#616 / pre-#614 trees (expect the instances those slices fixed, and nothing else). FOCUS-1 is advisory, so even a miss cannot redden a build | Ivo | **closed** — every tree measured with the real guard, not a model of it, in a `git worktree` per historical SHA: `0 / 1 / 3 / 4 / 5`, and each historical report is a bug that slice went on to fix. The table is under Acceptance-criteria verification |
| R-2 | **The widened trigger reaches components the confirm-only trigger never did** — `app.ts` and `venue-map.ts` restore focus with a plain `.focus()`, which `movesFocus` deliberately does not accept | high | high | Measured before designing: applying the component floor to modal branches reports both, on correct code. The floor is therefore confirm-only, and modal branches are judged by the signal check alone — AC-5 | Ivo | **closed** — both stay green on HEAD, and both report the moment their focus calls are stripped, so they are genuinely judged rather than skipped. The floor's confirm-only restriction is the reason, pinned by AC-5 |
| R-3 | **The mover field's name is a convention, not an API.** A component naming it `moveFocus` would read as moving no focus at its flip site | med | med | The names bound to `focusMover()` are read out of the component and counted as focus calls alongside `.focus(` — AC-7 | Ivo | **closed** — `moverNames()` reads the bindings; AC-7 pins a component whose field is named `moveFocus`, and it was RED before the binding scan existed |
| R-4 | **Hook cost.** #621's R-6 bounded the hook at two file reads; modal resolution needs to know which components are focus traps | med | low | The index is one `git ls-files frontend/src/app`, built **lazily** (only when a branch body holds an unresolved `<app-…>` tag) and cached for the process; at most one extra read per candidate tag. The `\|\| true` suffix still degrades a fault to silence | Ivo | **closed** — measured rather than reasoned: `--all` over the whole app, which is the worst case for the index, runs in **0.3s**; a single-file hook invocation touches the index only if the edited template renders an `<app-…>` child |
| R-5 | **A flip written some other way** (`update(…)`, a `linkedSignal`, a `resource` reset) is not seen, so the surface is silently exempt | med | low | **Accepted deliberately** — the safe error direction, and the floor still covers a component that moves focus nowhere at all. Stated in the guard's TSDoc beside the pattern so the next author widens it rather than routes around it | Ivo | **closed — accepted as designed, and made visible.** `flipSites`' TSDoc names the miss and says to widen it rather than route around it, mirroring what R-2 of #621 did for `BUSY_STEMS`; the convention doc repeats it where an author reads it |
| R-6 | **Scanner regression.** The `.ts` scan now also reads a sibling `.html`, and the branch walk gains nesting spans — either could mis-report a line on a real component | med | med | The existing 24-case suite is the parity net (it passes unmodified), `--all` over the whole app is the breadth proof, and the four-tree measurement is re-run after the change lands | Ivo | **closed** — all 24 pre-existing cases pass **unmodified**, and the one real defect the new code had (a member written on one line, whose `{` the backward walk consumed) was caught by an AC's RED run, not by review. Recorded in the Generalization-audit log because it would hit `if (x) { open.set(false); }` in real source too |

## Open questions / Assumptions

*(empty — the one assumption resolved in Phase 0; see below.)*

### Resolved

- **Assumption:** the modal markers (`trapFocusWithin`, `aria-modal`, `role="dialog"`) identify the
  app's focus traps exactly. — **Resolved 2026-08-11 in Phase 0:** three components carry them
  (`booking-dialog`, `find-booking`, `payout-statement`), all three reached through the
  `app-<basename>` selector convention, and the `--all` sweep judges each of their render sites as a
  surface. A fourth trap added under a selector whose basename does not name its file is a **false
  negative**, not a false positive — the direction this guard can afford, and the same posture
  `BUSY_STEMS` takes.

- **Open question:** which of the issue's two shapes to build? — **Resolved 2026-08-11 at plan time
  by Ivo, after the spike the issue asked for: neither.** Measured on the mid-#621 counterfactual
  (`payouts-tab` with the weather legs in and the statement legs stripped): **counting legs against
  surfaces** sees 5 focus call sites against 2 surfaces and reports nothing; **counting movers**
  (1 field, 2 surfaces — the issue's own reading) reports it, but also reports `booking-view`, which
  has one `focusMover()` field, two correct confirm surfaces and nine legs — a false positive on
  correct code, which is the error direction #621 spent three passes eliminating. **Widening the
  trigger alone** does not work either: with the exemption still component-scoped, `payouts-tab`
  holds a `focusMover()` and stays exempt, so instance 14 hides exactly as before. Only the
  combination — widened trigger **plus** signal-scoped exemption — reports it.
- **Open question:** does the sharpened rule fire on correct code? — **Resolved 2026-08-11 at plan
  time by measurement.** Over the standing tree it judges 11 surfaces (8 confirm + 3 modal) and
  reports **0**. Stripping any one component's focus calls makes it fire for all 11 — so the green is
  load-bearing, not vacuous. Over the pre-#614 tree it reports 5, each an instance #614/#616/#621
  went on to fix, and nothing else.
- **Open question:** where does a signal finding anchor, given the flip lives in the `.ts` and the
  branch may live in the `.html`? — **Resolved 2026-08-11 at plan time:** at the **flip site**, which
  is where the fix goes (#621's own fix is a leg immediately above `statementOpen.set(false)`). That
  makes the `.ts` the file that reports it, which is why the `.ts` scan reads its sibling template.
  The floor finding keeps anchoring at the branch, so neither is reported twice.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds no request and changes no runtime code at all:
`scripts/` is build tooling that never ships in the image, and no file under `frontend/src` or
`platform/` changes. Every write path to `availability(set_id, booking_date)` is untouched.

## Spring Modulith — modules, interfaces, events

N/A — repo tooling and documentation only; no backend code in scope.

### Module ownership (§4a)

N/A — no module owns repo tooling; no capability moves.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The one money-adjacent component the rule reasons about (`payouts-tab`) is
read as text by the guard and not modified.

## Angular — frontend surfaces touched

N/A — no Angular source changes. The guard reads `frontend/src/app/**` as text; the only file under
`frontend/` that changes is `frontend/.claude/CLAUDE.md`, the convention prose stating what FOCUS-1
flags.

## FE↔BE contract

N/A — no contract change.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session, or
> whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window as the change it
> records — at every phase boundary AND every SDLC stage transition.

**Stage pointer:** `merge close-out — gates cleared, merged via PR #626`

**Next action:** none — the slice is closed out. Its one deliberate successor is #623, the review-bank
item for this bug class, which #621 filed and this slice does not touch.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The rule: widened trigger + signal-scoped exemption | ✅ | `0fe1ebd` |
| 1 — Anchoring: external templates, diff scoping, advisory posture | ✅ | `e0ad18a` |
| 2 — Measure the four trees, then the conventions doc | ✅ | `ef15912` |
| Review-gate fix round (14 findings) | ✅ | `81f1bd7` |
| Close-out (docs-freshness sweep, the known miss) | ✅ | `bf48126`, `c5c1467`, this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

> The review gate ran `/code-review` at **high** effort over `origin/main...HEAD` and returned **14
> findings, every one in this slice's own new code**. Grouped below where they share a root cause.
> All fixed in `81f1bd7`; the four-tree measurement and the mutation sweep were re-run after.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (CONFIRMED) | **The false positive this rule cannot afford, reproduced.** An `@else` body sits *outside* its `@if`'s braces, so scanning for `@if` alone attributed a trap rendered there to whatever branch wrapped the page — reporting `reload() { this.venueView.set(undefined); }`, correct code, while the real dismiss went unjudged. Ten templates already use `@else`/`@empty`; `@case` and `@defer` have the same shape | fixed — the scan tracks **every** Angular block, and a trap whose innermost block carries no condition is left unattributed (a miss, not a report). Pinned by `does not attribute a trap in an else block to the branch that wraps the page`, verified RED |
| F-2 | review (CONFIRMED) | The signal check looped per **branch**, so a component rendering one modal in two layouts emitted two byte-identical findings — and the rule both CLAUDE.md files call "judged per gating signal" was judged per branch | fixed — one finding per signal per file, seeded with the floor's own signal so the two halves cannot double up either. Pinned by `reports a signal once however many branches are gated on it` |
| F-3, F-5 | review (CONFIRMED) | **Three ways `memberOf` could hand a flip a leg it does not have.** `/\bclass\b/` on the brace's own line misread Prettier's overflowed heritage clause (`class X` / `implements Y` / `{`) as a member, making the whole class the unit; `blockEnd` lacked its sibling's `opened` guard, so a member starting with `}` ran to EOF; and slicing whole lines let a neighbour sharing the opening line lend its `.focus()` | fixed — both ends column-precise, one shared quote-aware brace matcher, and the class body identified by walking the declaration rather than one line's text. Two RED tests |
| F-4, F-10 | review (CONFIRMED) | The two halves of a split component both reported one surface — **and, worse, the inverse**: a diff adding a stranding modal branch to an `.html` whose `.ts` was unchanged reported **nothing**, because the `.ts` was never scanned and the `.html` could not anchor. That is exactly the miss #624 exists to close | fixed by choosing the miss over the duplicate: each half now reports at the line **it** can act on — the `.ts` at the flip, the `.html` at the branch. The double report is kept deliberately and documented in `findViolations`' TSDoc, which no longer claims otherwise. AC-8 rewritten to pin both halves |
| F-6 | review (CONFIRMED) | `bodyEnd` counted raw braces, so `{{ label() ?? '}' }}` closed a branch early and dropped the trap out of every span — or into a later sibling, reporting the wrong signal | fixed — the brace matcher skips quoted strings. Pinned by `reads past a brace quoted inside the branch body` |
| F-7 | review (CONFIRMED) | The trap resolver tested the child's **raw source**, comments included — `payout-statement.ts` names `role="dialog"` and `trapFocusWithin` in its TSDoc, so the classification was partly prose. The same mistake `movesFocus` already refuses to make | fixed — judged on the code and template regions plus any sibling `.html`. Pinned by `does not call a component a focus trap on the strength of its comments`, which needed `focusTraps` exported with its two seams |
| F-11 | review (CONFIRMED) | `(dismissed)="statementOpen.set(false)"` — the most idiomatic dismiss in a small component — left the signal with zero flip sites and therefore **fully exempt**. Unlike the R-5 shapes this is a complete teardown with provably no leg | fixed — template flips count, and never count as compliant since there is no handler to hold a leg. Pinned by `reports a teardown wired in the template with no handler at all` |
| F-8 | review (CONFIRMED, doc) | The AC-11 fixture's TSDoc was orphaned above the wrong test by an insertion, leaving AC-11's named test undocumented and the external-template test documented by someone else's paragraph | fixed — moved back onto its test |
| F-9 | review (CONFIRMED, doc) | AC-4 cited a pinning test (`sweeps the standing tree clean`) that does not exist, and the verification section quietly downgraded it to a manual run | fixed by **correcting the AC, not writing the test**: a suite-level assertion over the real tree would be the repo-wide gate the diff-scoping exists to avoid (#621 R-1). AC-4 now names the recorded `--all` run as its evidence |
| F-12, F-13, F-14 | review (CONFIRMED, quality) | Two near-duplicate brace matchers disagreeing on a corner one had already solved; `end` computed for every branch in every file though only a trap ever reads it; and `surfaces` bound to three different meanings in ninety lines | fixed — one matcher, `end` computed on demand (a file with no `<app-…>` child pays no brace walk), extractor renamed `surfacesIn` |

---

## File structure

> Map files to be created/modified before defining tasks.

- `scripts/check-focus-posture.mjs` — the guard: widened trigger, signal-scoped exemption, sibling
  template read, the modal index
- `scripts/check-focus-posture.test.mjs` — AC-1..AC-11
- `frontend/.claude/CLAUDE.md` — the FOCUS-1 paragraph, which states what the rule flags
- `docs/plans/focus-posture-guard.md` — #621's known limit (a), now closed
- `docs/plans/focus-surface-scoping.md` — this plan
- `CLAUDE.md` — the CI-hygiene paragraph's FOCUS-1 clause

---

## Phase 0 — The rule: widened trigger + signal-scoped exemption

> Trigger and exemption ship together on purpose: neither reports instance 14 alone (Resolved open
> questions), so a phase boundary between them would land a half-rule whose RED test cannot go green.

**Files:** Modify `scripts/check-focus-posture.mjs` · Test `scripts/check-focus-posture.test.mjs`

- [x] **Step 1: Write the failing tests** — AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-11.
- [x] **Step 2: Run them, verify they fail** — `node --test scripts/check-focus-posture.test.mjs`
- [x] **Step 3: Minimal implementation** — surfaces gain the modal branch (innermost attribution);
  judgement gains the per-signal flip check, judged in the class member that holds each flip; the
  component floor stays confirm-only.
- [x] **Step 4: Run it, verify it passes**
- [x] **Step 5: Generalization-audit pass**
- [x] **Step 6: Commit** — `git commit -m "Scope FOCUS-1 to the signal that gates each surface (#624)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Anchoring: external templates, diff scoping, advisory posture

**Files:** Modify `scripts/check-focus-posture.mjs` · Test `scripts/check-focus-posture.test.mjs`

- [x] **Step 1: Write the failing tests** — AC-8, AC-9, AC-10.
- [x] **Step 2: Run them, verify they fail**
- [x] **Step 3: Minimal implementation** — a `.ts` with no inline template reads its sibling `.html`;
  a signal finding is scoped by its own flip line.
- [x] **Step 4: Run it, verify it passes**
- [x] **Step 5: Generalization-audit pass**
- [x] **Step 6: Commit** — `git commit -m "Anchor a FOCUS-1 signal finding on the flip that strands focus (#624)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Measure the four trees, then the conventions doc

**Files:** Modify `frontend/.claude/CLAUDE.md` · `CLAUDE.md` · `docs/plans/focus-posture-guard.md`

- [x] **Step 1: Write the failing test** — AC-4 (`--all` over the standing tree reports 0).
- [x] **Step 2: Run it, verify it fails** if any surface regressed.
- [x] **Step 3: Re-run the four-tree measurement** and record the counts here.
- [x] **Step 4: Update the conventions prose** — what FOCUS-1 flags, in both CLAUDE.md files.
- [x] **Step 5: Generalization-audit pass**
- [x] **Step 6: Commit** — `git commit -m "State the surface-scoped FOCUS-1 rule where the convention lives (#624)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | plan-time spike | every component that is a focus trap, so the widened trigger sees all of them | `grep -rln "trapFocusWithin\|aria-modal\|role=\"dialog\"" frontend/src/app --include=*.ts` | 3 (`booking-dialog`, `find-booking`, `payout-statement`) + `shared/focus-trap.ts` itself | all three are reached through the `app-<basename>` selector convention; the helper owns no template, so it is not a surface |
| 2026-08-11 | Phase 0 | a member written on one line closes before the flip it holds, which `memberOf` walked past | the RED tests for AC-3/AC-7, then `--files` over the counterfactual | 1 shape (any flip sharing a line with its member's `{`) | fixed by walking back from the flip's own column, not the line end — the same defect would hit `if (x) { open.set(false); }` in real code |
| 2026-08-11 | Phase 1 | components split across two files, where each half sees one side of the rule | `git ls-files 'frontend/src/app/**/*.html'` | 15 external templates, 4 holding a surface (`set-editor`, `layout-editor`, `payouts-tab`, `venue-map`) | both directions read the sibling, and the `.html` is barred from reporting a flip it cannot anchor — pinned by AC-8, which fails if either half reports the other's lines |
| 2026-08-11 | Phase 2 | whether the standing tree's green is load-bearing or vacuous | strip every focus call from each component with a surface, then `--files` on it | 9 components, all 9 report (13 findings total) | no change needed — the sweep's 0 is a verdict, not an absence of surfaces |
| 2026-08-11 | Phase 2 | every doc that states what FOCUS-1 flags | `grep -rn "FOCUS-1" --include=*.md .` | 4 files (`CLAUDE.md`, `frontend/.claude/CLAUDE.md`, both plan docs) | all four updated; #621's known limit (a) marked closed rather than deleted |
| 2026-08-11 | review round (F-1) | every Angular block whose body sits outside its head's braces, since each is the same mis-attribution | the block vocabulary in the Angular control-flow syntax, checked against the templates in the tree | `@else`, `@empty`, `@case`, `@default`, `@placeholder`, `@loading`, `@error`, `@defer` | all scanned as spans, not just `@else` — fixing only the reported one would have left `@case` and `@empty` to be found by the next slice |
| 2026-08-11 | review round (F-3/F-5) | every place the member's boundary was taken from a whole line rather than a position | reading both brace matchers against each other | 3 sites (class-brace detection, `blockEnd`'s missing guard, the whole-line slice) | all three fixed together and the two matchers merged into one, since the review's own finding was that keeping two means the next corner is fixed once |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1..AC-3, AC-5..AC-11:** `node --test "scripts/*.test.mjs"` → **129 pass, 0 fail** (45 in
      this suite, up from 24). Every new case was verified RED first; the ones asserting *absence*
      (AC-3, AC-5, AC-7, F-1's) were mutation-checked rather than trusted.
- [x] **AC-4:** `node scripts/check-focus-posture.mjs --all` → `BUSY-1: 0  FOCUS-1: 0`, over **11**
      surfaces (8 confirm + 3 modal), in 0.3s for the whole app. Its evidence is that **recorded
      run**, deliberately not a test: a suite-level assertion over the standing tree would be the
      repo-wide gate diff-scoping exists to avoid (#621 R-1). Its regression net is the mutation
      sweep below plus the per-shape cases.

**The four-tree measurement** (the evidence R-1 and R-2 are closed on — the new guard run against
each tree, not a model of it):

| Tree | FOCUS-1 | What it reports |
|---|---|---|
| HEAD (standing) | **0** | nothing — and stripping any one component's focus calls makes all 9 report, so the green is load-bearing |
| mid-#621 counterfactual (instance 14 unfixed) | **2** | `payouts-tab.ts:100 this.statementOpen.set(false)` — the exact flip #621's review pass found by hand, at the line its fix went in — and the same surface's branch in the `.html`, per F-4/F-10 |
| pre-#621 (`c58317b`) | 4 | the weather confirm and the statement modal, each at its branch and its flip — the two instances #621 fixed |
| pre-#616 (`7c1234a`) | 5 | the above plus `set-password.ts:254`, the instance #616 fixed |
| pre-#614 (`5f415a2`) | 6 | the above plus `booking-view.ts:209`, the instance #614 fixed |

No tree reports anything that was not a real bug those slices went on to fix. The counts are surfaces
× reporting file, not distinct bugs: a component split across `.ts` + `.html` reports each surface
once per half, at the line that half can act on (F-4/F-10).

If any AC isn't verified by a passing test, write the test or admit it's not done.

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
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
