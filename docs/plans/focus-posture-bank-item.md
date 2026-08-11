# Review-bank item for the stranded-focus class Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo's most-repeated bug class — WCAG 2.4.3 stranded focus, fourteen instances
across #604, #614, #616 and #621 — the review-bank item it has never had, so the gate asks the
question on the slice that writes the bug instead of the next slice's generalization audit finding it.
**Extended at the user's request** to also fix **#625**, the fifteenth instance, which writing the item
turned up: `pricing-tab`'s price field is disabled by a write it starts itself.

**Architecture:** The single most significant decision is that the item is written **around** the
guard, not over it: `scripts/check-focus-posture.mjs` already covers what it can match, so
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
have shipped contradicting the two docs a reader reaches first) · **re-run for Phase 2, which put real
frontend code in scope:** `riviera-frontend` (placement: nothing moves — the fix edits three existing
`operator/pricing-tab.*` files in place and adds no import, so the taxonomy and RV-FE-8's frozen
five-edge table are both untouched) · `angular-developer` + angular-cli MCP `get_best_practices`
(confirmed the fix needs no new API — `[readonly]` is a native property binding, no `@HostListener`
or `ngClass` creep — and re-stated the a11y bar the fix serves: "MUST follow all WCAG AA minimums,
including focus management") · `playwright-cli` (the evidence leg: both new specs go in the CI-run
mocked suite per RV-FE-E2E, written against the existing `mockPricing` harness, `toBeFocused()`
web-first assertions, no fixed sleeps) · `riviera-local-debug` (cloud-session recipe: scoped
`npx ng test --include=…`, and the e2e run needed `PW_CHROMIUM_EXECUTABLE` pointed at the image's
Chromium **plus** an `npm ci` — the tree's `node_modules` predated `qrcode`/`jsqr`, so the dev server
would not build) · **still not triggered:** `riviera-tailwind` — one variant prefix is renamed with
its attribute (`disabled:opacity-60` → `read-only:opacity-60`), which is the same rename-not-restyle
call #616 made, and no token, surface or shared directive changes.

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
  failed the build and named the line — **and, since G-1, that this holds only for the shapes BUSY-1
  matches**. *Pinned by:* the item's guard bullets, cross-checked against
  `GATING = new Set(['BUSY-1'])` and `BUSY_STEMS`' documented exclusions in
  `scripts/check-focus-posture.mjs`.
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

### #625 — the fifteenth instance (Phase 2)

> Written against the browser, because that is the only thing that can settle them: jsdom does not
> implement unfocus-on-disable (#614 R-1), so every claim below is pinned in Chromium.

- [x] **AC-7:** Given the operator edits a row price and commits with **Enter** — which fires `change`
  without leaving the field — when the reprice settles, then focus is still in that price field, not
  on `<body>`. *Pinned by:* `e2e/operator-pricing.e2e.ts` › `keeps focus in the price field across an
  Enter commit (WCAG 2.4.3, #625)`
- [x] **AC-8:** Given the operator commits row A by **clicking into row B**, when the reprice settles,
  then focus is in row B's field — the one they clicked — and was not taken from them meanwhile.
  *Pinned by:* `e2e/operator-pricing.e2e.ts` › `leaves focus where the operator clicked when the
  commit came from blur (#625)`. This is the leg the issue did **not** predict: the busy flag disables
  *every* row input, so the click-away path strands focus on the field focus just landed on.
- [x] **AC-9:** Given a reprice in flight, when the operator edits another row, then that edit is
  still ignored (no concurrent PUT, the shown value restored) and the field is genuinely locked —
  `readOnly` true, `disabled` **false**, so it keeps its place in the tab order. *Pinned by:*
  `pricing-tab.spec.ts` › `serializes reprices: a second edit while one is in flight is ignored, not
  a concurrent PUT`
- [x] **AC-10:** Given the four pre-existing Pricing e2e journeys (reprice + axe, single map read,
  403 copy, 409 stale-write recovery), when the posture changes, then all four still pass unmodified
  — the parity net for a change to the tab's edit path. *Verified by:* the 6/6 run recorded in
  Acceptance-criteria verification.

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
- **No retro-sweep of the standing tree.** The `--all` run is `BUSY-1: 0  FOCUS-1: 0` today. The one
  candidate this slice turned up (`pricing-tab`) was filed as #625 and then **fixed here at the
  user's explicit request** (Phase 2) rather than deferred — it is the only site of its shape, which
  the Phase 2 generalization audit establishes rather than assumes.
- **No focus leg on the reprice settle path**, which is the fix #625 itself proposed. The second
  failing spec killed it: the busy flag disables *every* row input, so a leg for the committing field
  would still leave the click-away path stranding focus on the field the operator just clicked into.
  `[readonly]` removes the blur at its source instead, and needs no focus bookkeeping, no capture of
  which element was focused, and no epoch guard around a restore.
- **No change to the other three busy-flag `[disabled]` inputs** (`admin-commissions` ×2,
  `admin-privacy`). Their writes are started by a **button**, so the carve-out's premise holds and
  `[disabled]` is still right there — verified in the Phase 2 audit, not assumed by analogy.
- **No `.claude/settings.json` or CI change.** The mechanical half already ships (#621); this is the
  human half, which is not a thing a hook can run.

## Behavior-parity ledger (retirement / replacement slices only)

**Phases 0–1:** N/A — new bank item, replaces nothing. No existing RV-FE item is retired, renumbered
or narrowed; RV-FE-9 is the next free number (the bank runs 1–8 plus RV-FE-E2E), and the single
`SKILL.md` edit appends to a list rather than rewriting one.

**Phase 2** replaces the Pricing tab's in-flight lock (`[disabled]` → `[readonly]`), so the ledger is
due — each row verdicted against what the old attribute actually did, not what it was for:

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| a row input cannot be typed into while a reprice is in flight | preserved | `readonly` blocks typing just as completely — **measured in Chromium**, not assumed: a probe typed into a readonly field mid-window and the value did not move |
| a `change` that slips through anyway is ignored, the shown value restored | preserved | untouched — the handler's `if (this.saving())` backstop is not edited, and its spec still passes |
| the row inputs dim while a reprice runs | preserved | the variant prefix moves with the attribute, `disabled:opacity-60` → `read-only:opacity-60`; same declaration, same value |
| the row inputs **leave the tab order** while a reprice runs | **changed (deliberate)** | that is the bug: leaving the tab order blurs whichever field holds focus, on both commit paths, and re-entering it does not bring focus back |
| a screen reader announces the field as *disabled* during a save | **changed (deliberate)** | it now announces *read only*, which is the truer state — the field still exists, still holds focus, and accepts input again in a moment |
| the spinner arrows can step the value mid-save | **changed (accepted)** | Chromium does not step a readonly number input either, so the lock is if anything tighter; no spec covered the spinners before or after |
| `pricing-tab` renders rows, projects the online-only take, reverts per-row on failure, and recovers from a 409 | preserved | untouched; the four pre-existing e2e journeys pass unmodified as the parity net (AC-10) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The item restates what the guard discharges**, so a reviewer hand-flags a BUSY-1 shape CI already failed — the redundant-comment round trip RV-STYLE-2 exists to retire (PR #520, PR #612) | med | med | The item splits explicitly: one line hands BUSY-1 to the hard gate with "don't hand-flag it", and the rest is the guard-blind remainder | Ivo | **closed** — the item names the command, states which rule gates, and says in as many words that a BUSY-1 shape is the build's finding, not the reviewer's (AC-2) |
| R-2 | **The item over-trusts a green run.** FOCUS-1 prints and returns 0, so a green `Repo hygiene` step can carry unread FOCUS-1 lines — the opposite failure to R-1, and the easier one to write by accident | med | high | The guard paragraph states the exit-code/output split as its own sentence, in the same place it names the command | Ivo | **closed** — AC-5; the item says read the output, not the exit code, and says why FOCUS-1 advises (a runtime property approximated over source) |
| R-3 | **Bank fatigue.** A tenth frontend item on a bank already walked per review makes the whole file skimmable rather than checkable | med | med | The item's checklist is capped at the six questions the guard cannot answer; everything mechanical is one line pointing at the command | Ivo | **closed** — six checklist bullets, one of which is a pointer; the item is comparable in length to RV-FE-8 and shorter than RV-FE-E2E |
| R-4 | **The item goes stale if #624 lands** and narrows FOCUS-1's component-scoped exemption — the blind spot it describes would no longer be blind | med | low | The exemption is cited **by issue number** rather than described as permanent, so #624's own close-out has a pointer back here; `riviera-docs-freshness` is due at that close-out and greps the skills tree | Ivo | **closed** — RV-FE-9 names #624 at the exemption and again in its follow-up list |
| R-5 | **A claim about the guard's blindness that is asserted rather than shown** would be the worst outcome in a doc whose whole job is to be trusted at review time | low | high | AC-3 is a recorded mutation run, not a citation of #621's findings register | Ivo | **closed** — both legs deleted, `--all` and `--files` both reported 0, file restored with `git checkout --` and the tree verified clean (Phase 0) |
| R-6 | **`readonly` might not lock as completely as `disabled`** — if typing, pasting or the number spinners still reach the field mid-save, the fix trades a focus bug for a concurrency bug on a **money** surface (invariant #5, the shared `set_version` token) | med | high | Measured in Chromium before the code changed, not reasoned about: a probe held focus in a readonly field and typed | Ivo | **closed** — the value did not move while readonly (`20` before and after the typing), and the serialization spec still passes unmodified: a second edit mid-flight sends no PUT and the shown value is restored. The handler's `saving()` backstop is untouched either way |
| R-7 | **`pricing-tab` is money-adjacent.** The reprice writes prices for every set in a row against an optimistic-concurrency token; a careless edit could change what is sent or when | med | high | The diff is one attribute, one variant prefix and one TSDoc paragraph. No request, body, token, condition or handler line changes; the four pre-existing e2e journeys are the parity net | Ivo | **closed** — `git diff` on `pricing-tab.ts` is comment-only; `pricing-tab.html` changes two tokens on one element. The PUT body assertions (`minorUnits`, `expectedVersion`) pass untouched in both the unit spec and the e2e |
| R-8 | **A jsdom spec cannot see this bug**, so a unit-only proof would be a false green — the #614/#616 R-1 lesson | high | med | Every focus claim (AC-7, AC-8) is pinned in Chromium and was **verified RED first**; jsdom carries only the attribute claim (AC-9), which is non-vacuous there | Ivo | **closed** — both e2e specs failed against the old code with the honest message (`unexpected value "inactive"`), and pass after. No unit spec stands as sole evidence for any focus claim |

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

N/A — does not affect availability. The slice changes the review bank, three agent-instruction docs,
two TSDoc blocks and (Phase 2) one Angular attribute; no request is added or changed, and no line in the diff is
reachable from any write path to `availability(set_id, booking_date)`.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope. Repo skill content only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic in scope. Worth one line rather than left implicit: the surface the item's
worked example is drawn from (`payouts-tab`'s weather refund) is money-adjacent, but this slice only
*reads* it — the file was mutated for AC-3's evidence and restored, and is absent from the diff.

## Angular — frontend surfaces touched

Phases 0–1 touch no frontend surface. **Phase 2 does** — the #625 fix:

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/pricing-tab.html` | existing | external template | `[disabled]="saving()"` → `[readonly]="saving()"` on the row price input, with its dim variant renamed to match | unchanged |
| FE-2 | `operator/pricing-tab.ts` | existing | standalone component | **no logic change** — the `saving` signal's TSDoc records why the lock is `readonly` | unchanged |
| FE-3 | `operator/pricing-tab.spec.ts` | existing | Vitest/jsdom | AC-9 — locked, and *not* out of the tab order | — |
| FE-4 | `e2e/operator-pricing.e2e.ts` | existing | Playwright (CI-run mocked suite) | AC-7, AC-8 — the two commit paths, in a real browser | — |

**Standards:** no new component, service, route, token or import; `[readonly]` is a native property
binding, so no new Angular API surface. `riviera-frontend`'s taxonomy and RV-FE-8's frozen edge table
are untouched. No deviation.

`frontend/src/app/operator/payouts-tab.ts` was mutated in the working tree for AC-3 and reverted
(`git checkout --`), with `git status` verified clean before the Phase 0 commit.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, header or error body is added, removed or reshaped.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `review — gate run (8 findings), 7 fixed + 1 deferred; re-review then merge`

**Next action:** Re-review the fix diff per `pr-gates.md` §1 step 3, confirm CI green and the Sonar
issue list pulled from the API (not the badge), then merge PR #627.

PR: opened at the Phase 2 push, marked ready for review immediately (the branch already carries the
finished slice). `riviera-sdlc` rule 3's draft-at-first-commit is recorded as **not followed**: the
earlier session was instructed not to open a PR at all, so phases 0–2 have had no CI; the PR's first
run covers all three at once.

**Gates:** CI — see the PR's checks; locally the three diff-scoped hygiene guards,
`node --test "scripts/*.test.mjs"` (112 tests), the Pricing e2e (6), the `pricing-tab*` unit specs
(25), `npm run lint` and `npm run format:check` are green (Acceptance-criteria verification).
Review gate — **ran in full** via `pr-gates.md` §1 rung 1 (`Skill("code-review")` was accepted, so no
fallback), high effort over `origin/main...HEAD`: **8 findings, all CONFIRMED on verification** — 7
fixed here (F-1…F-7), 1 deferred with its argument intact (F-8 → **#628**). Two of them (F-1, F-2)
were defects **in the new bank item itself**, which is the outcome that most justifies having run the
gate on a docs slice. **Re-reviewed** after the fix round per §1 step 3 — **12 further findings, all
CONFIRMED, all fixed** (G-1…G-12), most of them defects the fix round itself introduced. Sonar gate —
**green, with the reported list pulled from the API rather than read off the badge** (the distinction
`pr-gates.md` §2 exists for): `issues/search?pullRequest=627` total **0**, `hotspots/search` **0**,
and `measures/component` **non-empty** — `new_lines 11`, `new_coverage 100.0`,
`new_duplicated_lines_density 0.0`, `new_duplicated_blocks 0`, 0 new bugs / vulnerabilities / code
smells. Non-empty measures are what distinguishes an analyzed PR from an unanalyzed one.
docs-freshness — ran twice: Phase 1 (3 statements) and again in Phase 3 over the whole range with
`frontend/src` added to the sweep set (5 more).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Prove the gap, then plan | ✅ | `517ad93` |
| 1 — RV-FE-9 + the scope pointer | ✅ | `c8f155b` |
| 2 — #625: the fifteenth instance | ✅ | `f9c001d` |
| 3 — Review-gate fixes (F-1…F-7) | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| G-1 | **re-review** (CONFIRMED) | **F-2's remedy for readonly-inert controls did not prevent the harm.** "Keep `[disabled]` and move focus on settle" leaves focus on `<body>` for the **whole** in-flight window; a settle-time leg only fixes where it lands afterwards | fixed in both statements — for those kinds the answer is **don't lock the control at all**, serialize in the handler, and `[disabled]`-plus-a-leg is now explicitly named as *not* the answer |
| G-2 | **re-review** (CONFIRMED) | F-3 added a **third** statement of the rule (`busy-action.ts`) and gave it the unqualified form F-2 had just fixed elsewhere — the point-of-use doc, which is the whole argument for F-3 | fixed — the directive no longer prescribes a remedy at all; it says the lock varies by control kind and points at the one statement that enumerates them, so a fourth restatement cannot drift |
| G-3 | **re-review** (CONFIRMED) | F-1 rewrote the prose but left the **checklist box** — the thing a reviewer actually executes — reading "discharged mechanically" | fixed — the box now says CI gates only the shapes it matches and sends the reviewer to the section before ticking |
| G-4 | **re-review** (CONFIRMED) | `SKILL.md`'s routing line, edited in the same commit, still claimed "the syntactic half is a CI gate" — the clean split that F-1 and S-2 both exist to deny | fixed — one rule gates, the other advises, and both have shapes they cannot match |
| G-5 | **re-review** (CONFIRMED) | The inert-control census said "two such controls today" while this PR's own audit row lists **four** — `pages/home`'s two filter `<select>`s were dropped. The counting-sweep failure mode, inside the fix for a counting-sweep failure | fixed — four, each named |
| G-6 | **re-review** (CONFIRMED) | "A binding the diff only moved or re-indented" was given as a BUSY-1 blind spot, and it is the opposite: the guards diff with `--unified=0` and no whitespace flag, so a moved line **is** an added line and BUSY-1 judges it — teaching reviewers to hand-check what CI already gates | fixed — the clause is inverted and parenthesised as a non-case, and the genuine second blind spot named instead: a flag renamed in the `.ts` while the template's `[disabled]` line stays untouched context |
| G-7 | **re-review** (CONFIRMED) | The two-bucket taxonomy classified neither `type="number"` — the live example both statements cite — nor the app's three date pickers, so a reader applying the rule to the sanctioned example had to guess | fixed — the bucket is defined as "where `readonly` applies", spelled out to include `number` and the date/time types |
| G-8 | **re-review** (CONFIRMED) | "(`focusMover()`, the same three legs)" imported the confirm-surface triad into a busy lock, which has no open/back-out/settled structure, and said one leg and three in the same sentence | fixed by G-1's rewrite, which drops the leg advice for those controls entirely |
| G-9 | **re-review** (CONFIRMED, doc) | The recovery anchor cited a Sonar list "pulled from the API below" that existed nowhere in the document — a discharged evidence claim with no evidence, the same class as F-7 | fixed — the list is now actually pulled and recorded inline (0 issues, 0 hotspots, non-empty measures) |
| G-10 | **re-review** (CONFIRMED, doc) | The phase table gained a Phase 3 row with no Phase 3 section and no criteria — a resuming session reads "✅" with nothing to look at | fixed — Phase 3 is written out below with its steps and verification |
| G-11 | **re-review** (CONFIRMED, doc) | F-7's rewritten scope statements were already one commit stale: all four described Phase 2's four files and omitted Phase 3's own `frontend/src/app/shared/busy-action.ts` | fixed — all four now say five frontend files across phases 2–3 |
| G-12 | **re-review** (CONFIRMED) | F-4 edited a line **inside** a three-line inline comment and left it three lines, against the one-line rule the same commit's F-6 cites as its authority; the guard misses it because a single edited continuation line is not a run | fixed — cut to one line, the rationale already being on the `saving` TSDoc |
| F-1 | **review gate** (`/code-review`, high) | **RV-FE-9 told reviewers to stand down on exactly the shapes BUSY-1 cannot see.** "Not a finding at all for a BUSY-1 shape — CI already failed it" reads as *all* busy `[disabled]`, but the guard matches a curated deny-list that deliberately excludes `loading`, `pending`, `processing`, `updating`, `creating` — so `[disabled]="loading()"` is green **and** unreviewed. Same for a binding the diff only moved | fixed — the bullet now says silence from BUSY-1 means "not one of the shapes I match", never "checked and fine", and names the excluded stems and the added-lines scoping |
| F-2 | **review gate** (CONFIRMED) | **The new rule was wrong for half the controls it addresses.** `[readonly]` is inert on `<select>`, checkbox, radio, `file`, `range` and `color` — and two of the app's nine self-committing fields are exactly those kinds (`admin-venue-photos`'s `<select>`, `venue-tab`'s `file` input). An author following the rule would ship a lock that does nothing | fixed in both statements — the rule is scoped to text-like inputs and `<textarea>`, with the inert-control list named and the alternative given (`[disabled]` **plus** a deliberate focus leg, or no lock) |
| F-3 | **review gate** (CONFIRMED) | **The code-side statement of the carve-out was never in the sweep set.** `shared/busy-action.ts`'s TSDoc — what an author reads at the point of use — still said "Inputs keep the native `[disabled]`" unconditionally. The Phase 1 sweep grepped the doc tree and `scripts`, never `frontend/src`, so the one statement living in code was structurally unreachable by the audit meant to catch it | fixed — the directive now carries the condition and points at `frontend/.claude/CLAUDE.md`. The sweep-set gap itself is the Phase 3 audit row |
| F-4 | **review gate** (CONFIRMED) | Two inline comments inside `onPriceChange` still said the inputs are *disabled* during a save — the TSDoc above them was updated and the body was not, leaving two contradictory accounts of the lock in one function | fixed — both now say readonly/locked |
| F-5 | **review gate** (CONFIRMED) | **The count this slice carefully corrected to "fourteen" was falsified by its own Phase 2.** Four freshly-written enumerations shipped without #625, and the audit log claimed a re-run that had only ever covered Phase 1 — the exact counting-sweep failure mode, baked into the docs a reviewer is told to trust | fixed — all four now read **fifteen** across #604/#614/#616/#621/#625, and the Phase 1 audit row is marked superseded by the Phase 3 re-run rather than left claiming more than it did |
| F-6 | **review gate** (CONFIRMED) | The new `saving` TSDoc broke three of `frontend/.claude/CLAUDE.md`'s four member-TSDoc limits at once: 10 lines where the rule says ~3, an issue number where it says none, and pure rejected-alternative history — the rationale already stated in two other places | fixed — trimmed to four lines stating the contract, with the rationale relocated to a one-line plan-doc pointer, which is what the rule prescribes |
| F-7 | **review gate** (CONFIRMED, doc) | The plan's **declared session-recovery anchor** still asserted in four places that no frontend code was in the diff, after Phase 2 added four frontend files the same document lists. A resuming session would have skipped the frontend review scope entirely | fixed — the Availability section, the RV-FE-8 self-review line, the Frontend self-review line and the focus-guard verification line all now describe Phase 2's real scope |
| F-8 | **review gate** (CONFIRMED, judgement) | **The #625 shape is syntactic and got only prose.** A `[disabled]` bound to a busy stem on an element whose own start tag carries `(change)`/`(blur)`/`(input)` is decidable from what `startTags()` already returns, has one site in 297 files, and the thesis of #621 is that this class recurs because it is invisible at authoring time | **deferred → #628**, with the reviewer's argument carried over intact. Not done here because F-2 is the reason to spike before coding: the correct advice differs by control kind (`readonly` for text-like, a focus leg for a `<select>`), so a rule that prints one fix would be wrong half the time — and #621 records two predicate-widening rounds that each traded one error direction for the other |
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
  the authoring-time convention to the review-time item — **and, from Phase 2, the condition on the
  input carve-out** (`[readonly]` where the field starts its own write)
- `frontend/src/app/operator/pricing-tab.html` — #625: `[readonly]` and the `read-only:` variant
- `frontend/src/app/operator/pricing-tab.ts` — #625: the `saving` TSDoc records why
- `frontend/src/app/operator/pricing-tab.spec.ts` — AC-9
- `frontend/e2e/operator-pricing.e2e.ts` — AC-7, AC-8, the Chromium legs
- `frontend/src/app/shared/busy-action.ts` — review finding F-3: the carve-out's code-side statement,
  the one no earlier docs-freshness sweep could reach because `frontend/src` was outside the set

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

## Phase 2 — #625: the fifteenth instance

**Files:** Modify `frontend/src/app/operator/pricing-tab.html`, `.ts` · Test
`frontend/src/app/operator/pricing-tab.spec.ts`, `frontend/e2e/operator-pricing.e2e.ts`

- [x] **Step 1: Write the failing specs** — AC-7 and AC-8 in the mocked suite, against the existing
      `mockPricing` harness.
- [x] **Step 2: Run them, verify they fail** —
      `PW_CHROMIUM_EXECUTABLE=… npx playwright test --config playwright.a11y.config.ts
      e2e/operator-pricing.e2e.ts -g "625"` → **2 failed**, both with the honest red for this class:
      `expect(locator).toBeFocused() … unexpected value "inactive"`.
      **AC-8's red is the finding that resized the fix:** the issue predicted only the Enter path, but
      the busy flag disables *every* row input, so clicking into row B strands focus on **B**. A
      settle-path focus leg — the fix #625 proposed — would not have moved that.
- [x] **Step 3: Choose the fix against the browser, not by analogy** — probe `readonly` in Chromium
      before writing any component code: does it keep focus on both paths, and does it really block
      typing? → focus survives both (`active=A` through the Enter window; `B` after the click-away),
      and a field typed into while readonly did not move off `20`. Recorded in the audit log.
- [x] **Step 4: Implement** — `[disabled]="saving()"` → `[readonly]="saving()"`, `disabled:opacity-60`
      → `read-only:opacity-60`, and the `saving` TSDoc saying why. No handler line changes.
- [x] **Step 5: Run them, verify they pass** — the whole Pricing e2e file (not just the new pair, so
      the four pre-existing journeys are the parity net) → **6 passed**; the three `pricing-tab*`
      unit spec files → **25 passed**, with AC-9 rewritten to assert `readOnly` **and** `disabled ===
      false`, which is what fails RED on the old attribute.
- [x] **Step 6: Generalization-audit pass** — see the log's third row: every other self-committing
      field in the app, and why none of them has this shape.
- [x] **Step 7: Reconcile the docs the fix contradicts** — the input carve-out in
      `frontend/.claude/CLAUDE.md` and RV-FE-9's fourth blind spot both said "live shape, filed";
      both now carry the settled rule and name `[readonly]` as the tool.
- [x] **Step 8: Commit** and update the plan-doc execution status in the same commit window.

---

## Phase 3 — Review-gate fixes

**Files:** Modify the two overlay files, `frontend/.claude/CLAUDE.md`,
`frontend/src/app/shared/busy-action.ts`, `frontend/src/app/operator/pricing-tab.ts`,
`scripts/check-focus-posture.mjs`, this plan

> No new acceptance criteria: every fix restores a claim AC-1…AC-10 already make, or corrects a
> statement about the code rather than the code's behavior. The two that touch behavior-adjacent
> prose (G-1, G-7) are re-verified by the same AC-7/AC-8 runs, which are unaffected — the component
> change from Phase 2 is untouched by this phase.

- [x] **Step 1: Verify each finding before acting** — 8 in the first round, 12 in the re-review. The
      one that looked wrong was checked against the code rather than accepted: G-6 claimed the
      moved-binding clause was inverted, and `scripts/git-diff.mjs:63` (`--unified=0`, no
      whitespace flag) plus `busyViolations`' `added.has(disabled.line + 1)` confirm it — a moved
      line *is* an added line, so the guard does judge it and the clause was backwards.
- [x] **Step 2: Fix the seven, then the twelve** — recorded one row each in the findings register.
- [x] **Step 3: Re-run the docs-freshness sweep with `frontend/src` in the set** — the gap that let
      F-3 through; see the audit log's Phase 3 row.
- [x] **Step 4: Pull the Sonar list from the API**, not the badge (`pr-gates.md` §2).
- [x] **Step 5: Re-verify** — lint, format, the touched unit specs, the full Pricing e2e, all four
      hygiene guards. Recorded under Acceptance-criteria verification.
- [x] **Step 6: Defer what should not be rushed** — F-8's guard rule → **#628**, with the reviewer's
      argument and the reason a spike must come first (the correct advice differs by control kind).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 0 — writing the item's carve-out bullet | the standing `[disabled]` bindings the guard deliberately does not judge, to check the carve-out is as safe as it is documented to be | `grep -rn "\[disabled\]" --include=*.html --include=*.ts frontend/src/app \| grep -v "\.spec\."` | 11 live bindings: 7 validity/state (`!canAddRow()`, `cell.disabled`, `isPending(set)`, `venueForm().invalid()`, `detailsForm().invalid()`, `dirty()`, `!hasLayout()`) and **4 busy-flag bindings on `<input>`** — `admin-commissions` ×2, `admin-privacy`, `pricing-tab` | Recorded. The 7 are the documented state carve-out, correct as-is. The 4 inputs are the documented **input** carve-out, whose premise is "focus is on the button, never the field" — true wherever a *button* starts the write, which holds for three of the four. `pricing-tab` is the exception: the write is started by the **input's own** `(change)`, and `saving.set(true)` runs synchronously in that handler, disabling the field the event came from. Whether focus is still in it depends on the Enter-commit path, which only Chromium settles (#616 R-1) — so it is filed as a candidate, **#625**, not asserted here. It is also the third guard-blind shape, and it is now named in RV-FE-9 |
| 2026-08-11 | Phase 3 — the review round (F-3, F-5) | the same two sweeps, re-run over the **whole** range and with the sweep set widened to include `frontend/src` — the gap that let F-3 through | `grep -rniE '\b(thirteen\|fourteen\|fifteen)\b' … frontend/.claude scripts frontend/src` and a carve-out-wording grep over `--include=*.ts --include=*.md` | 4 count statements stale at "fourteen" (the slice's own Phase 2 made it fifteen) and 1 carve-out statement living in **code** (`shared/busy-action.ts`) that no earlier sweep could reach | All five patched. **The lesson is the sweep set, not the five hits:** `riviera-docs-freshness`'s map lists `platform/src/**` Javadoc as in-scope for exactly this reason, but its worked grep — and this slice's Phase 1 copy of it — never included `frontend/src`, so the Angular tree's own doc comments were a blind spot on a frontend slice. Widened here; worth pushing back into the skill's own recipe |
| 2026-08-11 | Phase 2 — after the #625 fix | every other **self-committing field** in the app: a control whose own `(change)`/`(blur)` starts a write, which is the shape that breaks the input carve-out's premise | `grep -rn "(change)=\|(blur)=" --include=*.html --include=*.ts src/app \| grep -v "\.spec\."` → 9 sites, cross-referenced against the 11-binding `[disabled]` census above | 9 self-committing fields, of which **only `pricing-tab`'s price input is also disabled by the write it starts**. The other 8 (`admin-venue-photos` venue picker, `venue-tab` photo picker, three date pickers, two `home` filter selects, `payouts-tab`'s date) raise no busy flag on themselves | **No siblings to fix — established, not assumed.** The other three busy-flag `[disabled]` inputs (`admin-commissions` ×2, `admin-privacy`) are the mirror case: they *are* disabled by a write, but a **button** starts it, so focus is on the button and the carve-out holds. Both halves of the cross-reference had to be empty for this to be a one-site fix, and they are. The rule that generalizes is written into `frontend/.claude/CLAUDE.md` and RV-FE-9 rather than into more code |
| 2026-08-11 | Phase 1 — the docs-freshness counting sweep | every present-tense statement of the class's instance count, since the new item asserts "fourteen" | `grep -rniE '\b(thirteen\|fourteen)\b' CLAUDE.md RESPONSIBILITIES.md CONTEXT.md docs/adr docs/agents .claude/skills frontend/.claude scripts` + a `#604` enumeration grep over the same set | 2 stale: `scripts/check-focus-posture.mjs:3` ("#604, #614, #616 — thirteen instances") and `frontend/.claude/CLAUDE.md:33` (the same three-issue list), both falsified by #621's own three fixes | Both patched, and both given the pointer to RV-FE-9 that closes the authoring-time ↔ review-time loop. Neither file is one this slice would have opened otherwise — the sweep is the only thing that could have found them, exactly as the skill's step 2b argues. **Superseded by the Phase 3 row: Phase 2 made the answer fifteen, and the re-run recorded here covered only Phase 1** |

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
- [x] **AC-7, AC-8:** `PW_CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome
      | tail -1) npx playwright test --config playwright.a11y.config.ts e2e/operator-pricing.e2e.ts`
      → **6 passed**. Both were verified RED first against the old attribute
      (`unexpected value "inactive"`).
- [x] **AC-9:** `npx ng test --include="src/app/operator/pricing-tab*.spec.ts"` → **25 passed** across
      the unit, a11y and contrast spec files.
- [x] **AC-10:** the same 6/6 run — the four pre-existing journeys (reprice + axe, single map read,
      403 copy, 409 stale-write recovery) passed **unmodified**.
- [x] **Frontend hygiene:** `npm run lint` → all files pass; `npm run format:check` → reported one
      hunk in the new e2e block, fixed with `-- --fix`, then clean.
- [x] **Repo guards over the diff:** `node scripts/check-plan-file-structure.mjs --diff origin/main`
      → clean; `node scripts/check-inline-comments.mjs --diff origin/main` → clean;
      `node scripts/check-focus-posture.mjs --diff origin/main` → clean, and from Phase 2 it is
      judging real files: `pricing-tab.ts`/`.html` and `shared/busy-action.ts` all match its
      `frontend/src/app/**` scope — and `busy-action.ts`'s TSDoc quotes `[disabled]="saving()"`
      verbatim, the case AC-5 of #621 exists for — so this is "no violation", not "nothing looked at";
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
      import of any kind is added — the five frontend files across phases 2–3 are three existing
      `operator/pricing-tab.*`, an existing e2e spec and `shared/busy-action.ts`, all edited in
      place, so no folder, edge or dependency direction moves.
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9) — no money logic.
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met (phases 2–3, five files): no new Angular API — `[readonly]` is a native property
      binding — no new component/service/route/token, no `as any`, and the angular-cli MCP
      `get_best_practices` walk found nothing to change. Deviations: none.
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
