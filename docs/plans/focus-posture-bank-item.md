# Review-bank item for the stranded-focus class Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo's most-repeated bug class — WCAG 2.4.3 stranded focus, fourteen instances
across #604, #614, #616 and #621 — the review-bank item it has never had, so the gate asks the
question on the slice that writes the bug instead of the next slice's generalization audit finding it.

**Architecture:** The single most significant decision is that the item is written **around** the
guard, not over it: `scripts/check-focus-posture.mjs` already discharges the syntactic half, so
RV-FE-9 states the rule once and then spends its length on the three things the guard structurally
cannot judge — **where** focus should land, whether a component's *second* surface has a leg
(FOCUS-1's exemption is component-scoped, #624), and teardowns that are not confirm surfaces at all.
That is RV-STYLE-1's shape, with one inversion worth naming: RV-STYLE-1's guard discharges most of
its rule, so its item is a short remainder; here the guard discharges the *smaller* half — one of two
rules gates, the other only advises — so the remainder is the item's centre of gravity.

**Persistence:** N/A — no backend, no schema, no migration. Repo skill content only.

**Source of intent:** GitHub issue #623 (filed from #621/PR #622's `riviera-docs-freshness` sweep and
recorded there as a Non-goal in `docs/plans/focus-posture-guard.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — it re-verified the
issue's three load-bearing claims against today's tree rather than trusting the ticket: the overlay
still returns **exactly one** `focus` hit, `GATING = new Set(['BUSY-1'])` still makes FOCUS-1
advisory, and no in-flight PR touches the overlay — every open PR is Dependabot. It also turned up
what the issue does **not** name: the input carve-out is a third guard-blind shape, live in
`operator/pricing-tab.html`) · `riviera-plan-doc` (this template — its "prose is not an AC" rule is
what turned the slice's central claim into evidence: AC-3 is a **recorded mutation run** proving the
guard cannot see instances 13 and 14, where the first draft was going to assert it from #621's
findings register) · `tdd` (no code ships, so nothing to drive test-first; the discipline is borrowed
for AC-3 — the gap is proven RED, by re-introducing both instances and watching the guard stay
silent, *before* the item claims it) · `riviera-review-overlay` (the artifact under edit — read end
to end first, so RV-FE-9 matches the house item format and takes the next free number; RV-STYLE-2 is
what set the "don't hand-flag what a gate already names" posture the new item copies) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD` + the working tree — **3 stale statements,
all patched**, and two of them came only from the counting sweep, in files this slice would otherwise
never have opened: the guard's own module header and `frontend/.claude/CLAUDE.md` both still said
"#604, #614, #616 — thirteen instances" after #621 fixed three more, so the item's "fourteen" would
have shipped contradicting the two docs a reader reaches first) · **not triggered, and why:** `riviera-frontend` /
`angular-developer` / `playwright-cli` / `riviera-tailwind` — the diff creates or modifies **no** file
under `frontend/src` or `frontend/e2e`, which is what those skills are the authority for. The one
`frontend/` path in the diff is `frontend/.claude/CLAUDE.md`, an agent-instruction doc reconciled by
the docs-freshness sweep, and the `payouts-tab.ts` edit AC-3 needed was a scratch mutation, reverted
with `git checkout --` and never committed (`git status` clean, recorded in Phase 0).

**Branch:** `claude/issue-623-r8r8ro` — the cloud session's designated branch, standing in for
`bugfix/focus-posture-bank-item` per `riviera-sdlc`'s remote-session addendum. Started from `main` at
`4c3eb2b` (#621's merge), so #621's shipped guard and conventions are the baseline this item is
written against.

---

## Acceptance criteria (testable)

> Written at the boundary that matters for a review-bank item: **what a reviewer walking it would
> catch that the machine does not**. An item is not "done" because it reads well — it is done when
> the gap it covers is demonstrated and the item names it.

- [x] **AC-1:** Given the overlay loaded for a frontend diff, when a reviewer walks the frontend
  bank, then an item states the destroy-the-focused-element rule and its three legs. *Pinned by:*
  `grep -rn "2.4.3" .claude/skills/riviera-review-overlay/` returning RV-FE-9 where it returned
  nothing before (recorded in Acceptance-criteria verification).
- [x] **AC-2:** Given a diff containing `<button [disabled]="saving()">`, when the reviewer reaches
  RV-FE-9, then the item tells them **not** to hand-flag it — BUSY-1 is a hard gate that has already
  failed the build and named the line. *Pinned by:* the item's "discharged mechanically" paragraph,
  cross-checked against `GATING = new Set(['BUSY-1'])` in `scripts/check-focus-posture.mjs`.
- [x] **AC-3:** Given `payouts-tab.ts` with the two statement-modal focus legs deleted — instances 13
  and 14 re-introduced verbatim — when the guard judges that file both ways it can be asked
  (`--all` and an explicit `--files`), then it reports **0** violations, so nothing mechanical
  surfaces either bug. *Pinned by:* the recorded mutation run in Phase 0 / Acceptance-criteria
  verification.
- [x] **AC-4:** Given the item, when a reviewer asks "what am I for, that the guard is not", then it
  names all three blind spots — the landing spot, the component-scoped exemption (#624), and
  teardowns that are not confirm surfaces — **plus** the input carve-out the issue does not name.
  *Pinned by:* the item's "What the guard cannot judge" list.
- [x] **AC-5:** Given a green `Repo hygiene (diff-scoped)` job, when the reviewer treats that as
  proof, then the item corrects them: FOCUS-1 prints and returns 0, so a green **exit code** can sit
  over unread FOCUS-1 findings. *Pinned by:* the item's guard paragraph, cross-checked against the
  `GATING` set and `frontend/.claude/CLAUDE.md`'s statement of the same posture.
- [x] **AC-6:** Given a frontend-scoped review, when the overlay decides which reference file to load
  and what it contains, then `SKILL.md`'s frontend bullet names the new item — it enumerates the
  bank's contents, so leaving it alone would ship a stale map on the same commit. *Pinned by:* the
  `SKILL.md` diff.

## Non-goals

- **No change to the *rule* stated in `frontend/.claude/CLAUDE.md`.** It already states both postures
  (#616, #621) and is the authoring-time home; #623 is explicit that this is about the review bank.
  Restating the rule there would create the second statement that goes stale. What the slice *does*
  change there is one enumeration the docs-freshness sweep found false, plus a pointer to RV-FE-9 —
  reconciliation, not a second statement of the rule.
- **No behavioral change to `scripts/check-focus-posture.mjs`.** Narrowing FOCUS-1's component-scoped
  exemption is #624's job, and #621 records two spikes at that predicate that each traded one error
  direction for the other. The item cites #624 rather than pre-empting it. The only edit to that file
  is its module-header comment, for the same stale count.
- **Not folded into RV-FE-5.** That item is the beach-map seat picker's accessibility (keyboard
  activation, non-colour status) — one surface. This class spans every confirm, modal and teardown in
  the app, so it earns its own number rather than a bullet under a map-specific item.
- **Not added to `SKILL.md`'s "Highest-stakes items".** Those three are default-**Blocker** and guard
  money, double-selling and BOLA. A stranded focus is a real WCAG AA failure and defaults to Major —
  promoting it would flatten a list whose whole value is that it is short.
- **No retro-sweep of the standing tree.** The `--all` run is `BUSY-1: 0  FOCUS-1: 0` today; the one
  candidate this slice turned up (`pricing-tab`, see the Generalization-audit log) is filed, not
  fixed here — fixing it is a frontend slice with a Chromium leg, which this docs slice is not.
- **No `.claude/settings.json` or CI change.** The mechanical half already ships (#621); this is the
  human half, which is not a thing a hook can run.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new bank item, replaces nothing. No existing RV-FE item is retired, renumbered or narrowed;
RV-FE-9 is the next free number (the bank runs 1–8 plus RV-FE-E2E), and the single `SKILL.md` edit
appends to a list rather than rewriting one.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The item restates what the guard discharges**, so a reviewer hand-flags a BUSY-1 shape CI already failed — the redundant-comment round trip RV-STYLE-2 exists to retire (PR #520, PR #612) | med | med | The item splits explicitly: one line hands BUSY-1 to the hard gate with "don't hand-flag it", and the rest is the guard-blind remainder | Ivo | **closed** — the item names the command, states which rule gates, and says in as many words that a BUSY-1 shape is the build's finding, not the reviewer's (AC-2) |
| R-2 | **The item over-trusts a green run.** FOCUS-1 prints and returns 0, so a green `Repo hygiene` step can carry unread FOCUS-1 lines — the opposite failure to R-1, and the easier one to write by accident | med | high | The guard paragraph states the exit-code/output split as its own sentence, in the same place it names the command | Ivo | **closed** — AC-5; the item says read the output, not the exit code, and says why FOCUS-1 advises (a runtime property approximated over source) |
| R-3 | **Bank fatigue.** A tenth frontend item on a bank already walked per review makes the whole file skimmable rather than checkable | med | med | The item's checklist is capped at the six questions the guard cannot answer; everything mechanical is one line pointing at the command | Ivo | **closed** — six checklist bullets, one of which is a pointer; the item is comparable in length to RV-FE-8 and shorter than RV-FE-E2E |
| R-4 | **The item goes stale if #624 lands** and narrows FOCUS-1's component-scoped exemption — the blind spot it describes would no longer be blind | med | low | The exemption is cited **by issue number** rather than described as permanent, so #624's own close-out has a pointer back here; `riviera-docs-freshness` is due at that close-out and greps the skills tree | Ivo | **closed** — RV-FE-9 names #624 at the exemption and again in its follow-up list |
| R-5 | **A claim about the guard's blindness that is asserted rather than shown** would be the worst outcome in a doc whose whole job is to be trusted at review time | low | high | AC-3 is a recorded mutation run, not a citation of #621's findings register | Ivo | **closed** — both legs deleted, `--all` and `--files` both reported 0, file restored with `git checkout --` and the tree verified clean (Phase 0) |

## Open questions / Assumptions

None open.

### Resolved

- **Open question:** does the item belong in `SKILL.md` (RV-STYLE-1's home) or in the frontend
  reference file? — **Resolved 2026-08-11 at plan time:** the reference file, as **RV-FE-9**. #623
  asks for "an RV-FE item", and the two `RV-STYLE-*` items sit in `SKILL.md` because they are
  language-agnostic and repo-wide (inline comments in four languages; Prettier in `frontend/` with an
  explicit outside-`frontend/` clause). This rule is Angular-template-shaped and scoped to
  `frontend/src/app/**`, which is exactly what the frontend bank is loaded for — and putting it there
  means a backend-only review does not pay for it, which is the whole point of the scope split.
- **Open question:** cite `pricing-tab` as a live instance in the item? — **Resolved 2026-08-11 at
  plan time:** no — cite the **shape**, and file the candidate. Whether it strands focus depends on
  whether `change` fires while the input still holds focus (the Enter-commit path), which per #616's
  R-1 lesson only a Chromium run settles — jsdom does not model unfocus-on-disable. Asserting an
  unverified bug in a permanent skill doc is the one thing worse than not mentioning the shape.
  Filed as **#625**.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes two markdown files under `.claude/skills/`;
no code ships to the app or the backend, no request is added or changed, and no line in the diff is
reachable from any write path to `availability(set_id, booking_date)`.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope. Repo skill content only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic in scope. Worth one line rather than left implicit: the surface the item's
worked example is drawn from (`payouts-tab`'s weather refund) is money-adjacent, but this slice only
*reads* it — the file was mutated for AC-3's evidence and restored, and is absent from the diff.

## Angular — frontend surfaces touched

N/A — no frontend surface changes. No component, service, route, token, template, style or spec is
added or modified: the diff's only `frontend/` path is `frontend/.claude/CLAUDE.md`, an
agent-instruction doc. The item's subject is frontend code, but its home is the review bank.
`frontend/src/app/operator/payouts-tab.ts` was mutated in the working tree for AC-3 and reverted
(`git checkout --`), with `git status` verified clean before the Phase 0 commit.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, header or error body is added, removed or reshaped.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `merge — implementation complete, close-out written, pushed to the designated branch`

**Next action:** Open the PR for `claude/issue-623-r8r8ro` (`Closes #623`) and let the CI, review and
Sonar gates run against it — **none of the three has run on this slice**, see Gates. This session was
instructed not to open a PR, so the branch carries the finished work and the three gates are
outstanding by declaration rather than by omission.

PR: **not opened** — the session's operating instructions forbid creating one without an explicit
request. `riviera-sdlc` rule 3 wants a draft PR at the first phase commit precisely because CI fires
on the `pull_request` event only, so this branch has had **no CI run at all**; the substitution is
recorded here rather than left to be inferred.

**Gates:** CI — **not run** (no PR; `push` triggers are scoped to `main`). The four checks this diff
can actually fail were run by hand instead and are recorded under Acceptance-criteria verification:
the three diff-scoped hygiene guards and `node --test "scripts/*.test.mjs"` (112 tests, 0 failures).
Review gate — **not run**: `/code-review` fans out subagents, which this session is instructed not to
spawn, and `riviera-sdlc` rule 4 is explicit that the overlay alone is not the review. A self-walk
against the overlay's own bank produced S-1 and S-2 and is recorded below **in its place, not as
it**. Sonar gate — **not run** (Sonar analyzes PRs and `main` only; this diff adds no analyzable
code). docs-freshness — **ran**, 3 stale statements, all patched.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Prove the gap, then plan | ✅ | `517ad93` |
| 1 — RV-FE-9 + the scope pointer | ✅ | `c8f155b` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| S-1 | self-walk (RV-PROC-1, own bank) | The first draft of *Skills consulted* listed only the skills that were loaded, which reads identically to a routing gate that was never run for the frontend row — the diff's subject **is** frontend conventions | fixed — the line now states which frontend skills were **not** triggered and the evidence, and was corrected again when the docs-freshness patch put `frontend/.claude/CLAUDE.md` in the diff: the claim is now "no file under `frontend/src` or `frontend/e2e`", which is what those skills are the authority for |
| S-2 | self-walk (RV-FE-9, against its own subject) | The draft item said a green guard run "discharges the mechanical half", copying RV-STYLE-1's wording — but RV-STYLE-1's guard **gates**, and half of this one does not, so the sentence would have taught the exact over-trust R-2 names | fixed — the two rules' opposite postures are stated as their own bullets, and only BUSY-1 is described as discharged |

---

## File structure

- `docs/plans/focus-posture-bank-item.md` — this plan
- `.claude/skills/riviera-review-overlay/references/frontend-conventions.md` — RV-FE-9, the bank item
- `.claude/skills/riviera-review-overlay/SKILL.md` — the frontend-scope bullet, which enumerates the
  bank's contents and would otherwise ship stale
- `scripts/check-focus-posture.mjs` — docs-freshness patch (comment only): the module header still
  said "#604, #614, #616 — **thirteen** instances", falsified by #621's own three fixes, and now
  points at RV-FE-9 for the shapes neither rule can see
- `frontend/.claude/CLAUDE.md` — docs-freshness patch: the same enumeration, plus the pointer from
  the authoring-time convention to the review-time item

> Reconcile this section with `node scripts/check-plan-file-structure.mjs --diff origin/main`
> before pushing.

---

## Phase 0 — Prove the gap, then plan

**Files:** Create `docs/plans/focus-posture-bank-item.md`

- [x] **Step 1: Re-verify the issue's claims** (issue-intake grill gate) — the overlay's single
      `focus` hit, FOCUS-1's advisory posture, the fourteen-instance count, and what else is in
      flight. All three claims hold; every open PR is Dependabot, none touching the overlay.
- [x] **Step 2: Prove the gap the item exists to cover** — delete both statement-modal focus legs
      from `payouts-tab.ts` (instances 13 and 14, verbatim as #621's F-3 and H-14 describe them) and
      ask the guard both ways it can be asked:

```
$ node scripts/check-focus-posture.mjs --all
BUSY-1: 0  FOCUS-1: 0
$ node scripts/check-focus-posture.mjs --files frontend/src/app/operator/payouts-tab.ts
(no output)
```

- [x] **Step 3: Restore and verify clean** — `git checkout -- frontend/src/app/operator/payouts-tab.ts`,
      `git status --short` empty, `--all` back to `BUSY-1: 0  FOCUS-1: 0`.
- [x] **Step 4: Write the plan** with AC-3 pinned to that recorded run rather than to #621's
      findings register.
- [x] **Step 5: Commit** — `git commit -m "docs: plan the stranded-focus review-bank item (#623)"`

---

## Phase 1 — RV-FE-9 + the scope pointer

**Files:** Modify `.claude/skills/riviera-review-overlay/references/frontend-conventions.md`,
`.claude/skills/riviera-review-overlay/SKILL.md`

- [x] **Step 1: Write RV-FE-9** in the house item format (gate → checklist → follow-up → default
      severity → skill framing), structured as: the rule, the mechanical half handed to the guard,
      then the guard-blind remainder that is the item's reason to exist.
- [x] **Step 2: Update `SKILL.md`'s frontend-scope bullet** so the enumeration of the bank's
      contents names the new item (AC-6).
- [x] **Step 3: Generalization-audit pass** — see the log below (the `[disabled]` census that found
      the `pricing-tab` candidate).
- [x] **Step 4: Verify** — the three diff-scoped guards over the diff, `node --test "scripts/*.test.mjs"`,
      and the AC greps. Recorded under Acceptance-criteria verification.
- [x] **Step 5: Commit** — `git commit -m "Add the review-bank item for the stranded-focus class (#623)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 0 — writing the item's carve-out bullet | the standing `[disabled]` bindings the guard deliberately does not judge, to check the carve-out is as safe as it is documented to be | `grep -rn "\[disabled\]" --include=*.html --include=*.ts frontend/src/app \| grep -v "\.spec\."` | 11 live bindings: 7 validity/state (`!canAddRow()`, `cell.disabled`, `isPending(set)`, `venueForm().invalid()`, `detailsForm().invalid()`, `dirty()`, `!hasLayout()`) and **4 busy-flag bindings on `<input>`** — `admin-commissions` ×2, `admin-privacy`, `pricing-tab` | Recorded. The 7 are the documented state carve-out, correct as-is. The 4 inputs are the documented **input** carve-out, whose premise is "focus is on the button, never the field" — true wherever a *button* starts the write, which holds for three of the four. `pricing-tab` is the exception: the write is started by the **input's own** `(change)`, and `saving.set(true)` runs synchronously in that handler, disabling the field the event came from. Whether focus is still in it depends on the Enter-commit path, which only Chromium settles (#616 R-1) — so it is filed as a candidate, **#625**, not asserted here. It is also the third guard-blind shape, and it is now named in RV-FE-9 |
| 2026-08-11 | Phase 1 — the docs-freshness counting sweep | every present-tense statement of the class's instance count, since the new item asserts "fourteen" | `grep -rniE '\b(thirteen\|fourteen)\b' CLAUDE.md RESPONSIBILITIES.md CONTEXT.md docs/adr docs/agents .claude/skills frontend/.claude scripts` + a `#604` enumeration grep over the same set | 2 stale: `scripts/check-focus-posture.mjs:3` ("#604, #614, #616 — thirteen instances") and `frontend/.claude/CLAUDE.md:33` (the same three-issue list), both falsified by #621's own three fixes | Both patched, and both given the pointer to RV-FE-9 that closes the authoring-time ↔ review-time loop. Neither file is one this slice would have opened otherwise — the sweep is the only thing that could have found them, exactly as the skill's step 2b argues. Sweep re-run after the fix: all four statements now read "fourteen" |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1:** `grep -rn -i "2\.4\.3" .claude/skills/riviera-review-overlay/` → one hit, the RV-FE-9
      heading, where the same grep returned **nothing** at `origin/main` (the overlay's only `focus`
      hit was RV-FE-5's beach-map bullet, which is about tile activation, not focus management).
- [x] **AC-2:** the item's guard paragraph reads "a BUSY-1 shape in the diff is the build's finding,
      not yours"; `grep -n "GATING" scripts/check-focus-posture.mjs` → `new Set(['BUSY-1'])`, so the
      claim that it is a hard gate is the code's, not the doc's.
- [x] **AC-3:** the Phase 0 mutation run — both legs deleted, `--all` → `BUSY-1: 0  FOCUS-1: 0`,
      `--files frontend/src/app/operator/payouts-tab.ts` → no output. Restored; tree clean.
- [x] **AC-4:** the item's "What the guard cannot judge" list has four entries — landing spot,
      component-scoped exemption (#624), non-confirm teardowns, and the input carve-out (#625).
- [x] **AC-5:** the item states that FOCUS-1 prints and returns 0, so the step is green either way.
- [x] **AC-6:** `SKILL.md`'s frontend bullet names RV-FE-9 alongside RV-FE-8.
- [x] **Repo guards over the diff:** `node scripts/check-plan-file-structure.mjs --diff origin/main`
      → clean; `node scripts/check-inline-comments.mjs --diff origin/main` → clean;
      `node scripts/check-focus-posture.mjs --diff origin/main` → clean (no in-scope file changed);
      `node --test "scripts/*.test.mjs"` → **112 tests, 0 failures** — the guard's own suites still
      pass with its header rewritten, which is the only thing this diff could have broken in `scripts/`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test — verification is by recorded command
      for a docs slice; each AC names the exact one.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases — N/A, no code.
- [x] **No JPA** introduced (invariant #1) — no backend code in the diff.
- [x] **Availability** section justified N/A; no write path touched (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking logic.
- [x] **Modulith** section justified N/A (invariant #11) — no backend code. FE mirror RV-FE-8: no
      import of any kind is added, no file under `frontend/` is in the diff.
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9) — no money logic.
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented — N/A, no frontend file in the diff.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, and findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (the two resolved ones name their
      outcome, and the deferred candidate cites #625).
- [x] **Close-out written in THIS branch** — the plan doc's final state is committed here, so no
      docs-only follow-up is needed.
- [ ] **The review gate ran in full** — **left unticked deliberately.** `/code-review` fans out
      subagents, which this session is instructed not to spawn, and `riviera-sdlc` rule 4 is explicit
      that the overlay alone is not the review. A self-walk against the overlay's own bank produced
      S-1 and S-2 and is recorded in the findings register, but it is not the gate and is not counted
      as one. The gate is due when the PR is opened.
