# Action-level alert lifetime Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Gate the two remaining always-mounted `role="alert"` banners —
`admin-privacy-error` and `oppw-error` — on their own message, so each alert region's
lifetime is its message's lifetime, while `oppw-notice` stays mounted (RV-FE-10) and
`oppw-error`'s scroll/focus contract survives (RV-FE-9).

**Architecture:** The single significant decision is **which of the three regions on
these two surfaces changes**. `role="alert"` is the one live region announced reliably
*on insertion* (`shared/load-announcer.ts`), so an alert born holding its text is the
correct shape and an alert mounted empty buys nothing. `role="status"` is the opposite:
RV-FE-10 requires it to pre-exist the text it announces. `oppw-notice` and `oppw-error`
therefore look like a symmetric pair — the same always-mounted `<p>`, matched by the same
`revealOutcome()` selector — and are deliberately asymmetric. Two elements change; the
third is load-bearing as it stands.

**Persistence:** N/A — frontend presentation only; no table, no migration, no SQL
(invariant #1 not engaged).

**Source of intent:** GitHub issue #828 (deferred from #826, recorded as finding F-3 in
`docs/plans/admin-commissions-field-error.md`), plus its two owner comments, both verified
against merged `main` `0dec1f9`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill is
what found the three test breakages in §Grill findings; the ticket carries none of them) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what turned
"gate two elements" into a nine-row enumeration of what each element does today) · `tdd`
(each phase inverts the existing assertion red-first, then gates the element green) ·
`riviera-review-overlay` (RV-FE-9 / RV-FE-10 / RV-FE-11 are the three bank items in
tension here; due at ready-for-review) · `riviera-docs-freshness` (**ran** — scoped read of
`frontend/.claude/CLAUDE.md` §Accessibility Requirements and `riviera-tailwind`; 0 findings:
neither states a fact this diff contradicts, since the alert-only classification the ticket
relies on is exactly what the diff preserves. Re-run over the merge range at close-out) ·
`riviera-frontend` (structure: both files stay where they are — `admin/` and `auth/` are
existing feature folders, no new file, no cross-feature edge, so RV-FE-8's frozen table is
untouched) · `riviera-tailwind` (the `min-h-[1.25rem]` reserve moves to a wrapper per the
#827 precedent; `empty:mt-0` becomes dead code and is deleted; ruled the raw-hex→token swap
out of scope — see Non-goals R-4) · `angular-developer` + angular-cli MCP
(`get_best_practices` confirmed native `@if` control flow and signals-for-state as the v22
posture; `search_documentation` on `afterNextRender` did **not** settle the earlyRead
ordering, so the claim is anchored on in-repo evidence instead — see AS-1) · `playwright-cli`
(the mocked e2e suite is where the two `toHaveText('')` breakages live; the repo's
absence idiom is `toHaveCount(0)`; at the review gate it also supplied the RV-FE-9 shape —
`toBeFocused()` at each leg in the CI-run suite — that F-9 adds) · `riviera-local-debug`
(every scoped run in this slice: the `npx ng test --include=` form that F-3 records, and the
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` recipe the Playwright runs use — it was
consulted throughout and cited in-body, but omitted from this line until the review gate's
RV-PROC-1 walk caught it, F-10).

**Branch:** `claude/action-alert-lifetime-828-u8kh54` — the implementing cloud session's
designated branch, standing in for `bugfix/action-alert-lifetime` per `riviera-sdlc`
§Remote/cloud addendum. Branched from `claude/sdlc-828-planning-xh3wm2` (the planning
session's designated branch, whose single commit is this plan doc) so the plan travels with
the code in one PR.

---

## Acceptance criteria (testable)

> Written at the surface's own boundary: these components have no application-service
> seam beneath them — the observable outcome *is* the rendered DOM and the focus
> position, so that is where the ACs sit.

- [x] **AC-1:** Given the admin Privacy tab with a confirmation armed and no failure yet,
      when the panel renders, then no element with `role="alert"` exists inside
      `admin-privacy-confirm-panel`. *Pinned by:*
      `admin-privacy.spec.ts` › `mounts no error element while the confirmation is clean`
- [x] **AC-2:** Given an armed confirmation, when the erasure request fails, then
      `admin-privacy-error` exists, carries `role="alert"`, and contains
      "Nothing was erased". *Pinned by:* `admin-privacy.spec.ts` ›
      `keeps the confirmation armed when the request fails` (existing, still green)
- [x] **AC-3 (restated at Phase 2, see F-4):** Given an armed confirmation, when the panel
      is clean and then fails, then `admin-privacy-confirm`'s vertical offset is unchanged
      **and** the panel grows by strictly less than the banner's own height — the reserve
      absorbs a line of it. The original "the reserve absorbs the banner" is not
      achievable *at this width*: the message wraps to two lines while the reserve is one,
      so the panel grows by the difference — exactly as it did on `main`. The bound stayed
      one-sided (`0 ≤ grew < banner`) rather than pinning that wrap — F-7. *Pinned by:*
      `admin-privacy.e2e.ts` › `the failure banner lands in reserved space, so the panel
      absorbs part of it`
- [x] **AC-4:** Given the operator change-password form untouched, when it renders, then
      `oppw-error` is absent **and** `oppw-notice` is present with `role="status"` and
      empty text. *Pinned by:* `operator-password.spec.ts` ›
      `keeps the polite notice mounted before there is anything to announce` **and** ›
      `mounts no alert region before there is anything to announce`
- [x] **AC-5:** Given a submit that fails (wrong current password), when the failure
      lands, then `oppw-error` exists with `role="alert"` and
      `document.activeElement` is that element. *Pinned by:*
      `operator-password.spec.ts` › `focuses the error it just inserted, not the body`,
      **and in Chromium** by `operator-password.e2e.ts`'s `toBeFocused()` leg (F-9)
- [x] **AC-6:** Given a submit that succeeds, when the notice lands, then `oppw-error`
      is absent and `document.activeElement` is `oppw-notice`. *Pinned by:*
      `operator-password.spec.ts` › `focuses the success notice and mounts no alert`,
      **and in Chromium** by `operator-password.e2e.ts`'s success `toBeFocused()` leg (F-9)
- [x] **AC-7:** Given the mocked e2e run over both surfaces, when each of the three
      states is reached, then `expectNoSeriousAxeViolations` passes and the absence
      assertion uses `toHaveCount(0)`, not `toHaveText('')` (one such assertion, not two —
      F-2). *Pinned by:* `operator-password.e2e.ts` (existing three axe calls) +
      `admin-privacy.e2e.ts`

## Non-goals

- **`oppw-notice` is not touched.** It is `role="status"` (`operator-password.ts:65`) and
  RV-FE-10 requires it to pre-exist its message. Gating it is a regression, not a
  consistency win — #616 made this exact call once already (`empty:hidden`, element kept).
- **`admin-privacy.ts:104`'s email-field error is not touched.** It already has the
  correct shape (`@if`-gated, `role="alert"`, `[appFieldErrorFor]="emailControl"`). It
  lives ~75 lines above the banner in the same template; per the ticket this is the
  easy mis-edit.
- **No `[appFieldErrorFor]` is added to either banner.** Both are action-level: they name
  no single control, and `aria-invalid` would claim the *entered value* is wrong when the
  actual failure is a refused write. That is RV-FE-11's fourth checkbox, and adding the
  association would be the #823 mistake in reverse.
- **No raw-hex → token migration.** `admin-privacy` paints its errors `text-[#b3261e]`
  while `oppw-error` uses `text-riv-error-ink`; the token resolves to `#a3160e`
  (porcelain) / `#ffa9a1` (dark), so this is **not** a free swap — see R-4.
- **No fourth site.** #826's sweep found four ungated alerts; #827 fixed one and judged
  the fourth on its merits in its audit log. Do not re-enumerate — read that log.

## Behavior-parity ledger

> This slice replaces the rendering shape of two existing elements, so the ledger is
> mandatory. "Presentation only, no behaviour change" is exactly the claim this table
> exists to verify row by row (case history: O6 #176).

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `admin-privacy-error` announces a failure via text mutation on a mounted `role="alert"` | **changed** | announces via *insertion* instead — the reliable case per `load-announcer.ts`. Both announce; insertion is the settled shape |
| `admin-privacy-error` reserves `min-h-[1.25rem]` so the panel does not grow when it speaks | **preserved** | the reserve moves to a `<div class="mt-2 min-h-[1.25rem]">` wrapper, exactly the #827 shape (`admin-commissions.ts:222`). The parenthetical is the part that was never true — one reserved line against a two-line message, on `main` as much as here (F-4). Byte-for-byte the same reserved space before and after |
| `admin-privacy-error` carries `mt-2` spacing | **preserved** | moves to the wrapper with the reserve; the inner `<p>` keeps only its type/colour classes |
| erasure failure returns focus to `admin-privacy-confirm` (`admin-privacy.ts:326`) | **preserved** | untouched — the banner never held focus on this surface, so the RV-FE-9 leg is unaffected |
| `oppw-error` announces a failure via text mutation on a mounted `role="alert"` | **changed** | as above — announced on insertion |
| `oppw-error` is scrolled into view and focused by `revealOutcome()` | **fixed** | `tabindex="-1"` stays and `earlyRead` finds the just-inserted node (AS-1 held). But the focus never reached it: AC-5 measured focus landing on `oppw-notice` instead, on `main` and after gating alike — see F-1. The error arm is now queried first |
| `revealOutcome()`'s `:not(:empty)` distinguishes "has something to say" from "sitting empty" | **dropped** | it never did — an interpolated `<p>` always holds a text node, and `:empty` matches only an element with no child nodes at all. AS-2 is falsified, not kept; the ordered two-query lookup replaces it |
| `cls.submitError` collapses its own top margin when empty (`empty:mt-0`) | **dropped** | dead once the element only exists non-empty. The identical `empty:mb-0` on `cls.notice` was **also dropped**, for a different reason: measured in Chromium, it never fired at all (F-5). Deleting it is a no-op — 20px before and after — not a restyle |
| `oppw-error` is present-but-empty on a *successful* submit, and specs read `''` from it | **changed** | absent. Three assertions read that emptiness today and each breaks — see Grill findings G-1…G-3 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Gating `oppw-error` breaks `revealOutcome()` — `earlyRead` runs before the `@if` view is created, so focus is stranded on `<body>` (RV-FE-9, the repo's most-repeated bug class) | low | high | AS-1 settles the ordering on in-repo evidence. Regardless: AC-5 and AC-6 assert `document.activeElement` directly, and both are written **red-first against the current code** so they cannot be assertions that pass vacuously | claude | **closed, Phase 1** — AS-1 held (`earlyRead` finds the `@if`-created node), but the specs caught a different live defect on the same line: F-1. Both were mutation-checked against a deleted `revealOutcome()` |
| R-2 | Someone "finishes the job" by gating `oppw-notice` too — it is the same always-mounted `<p>` matched by the same selector | med | high | Non-goals row 1 + the surviving spec `keeps the polite notice mounted…` fails loudly if it is gated. The ticket's own second comment reversed this exact conclusion once | claude | **closed, Phase 3** — `oppw-notice` is untouched: still mounted, still `role="status"`, still `empty:mb-0`, and AC-4's first spec plus AC-6's focus assertion both fail if it is gated |
| R-3 | The three test breakages (G-1…G-3) are discovered at CI rather than at plan time, costing a red-CI round trip | — | med | **Already mitigated**: enumerated below by mechanism, and Phase 0 fixes them before the template changes | claude | closed by this plan |
| R-4 | Swapping `text-[#b3261e]` for `text-riv-error-ink` while the class attribute is already being edited introduces colour drift | low | med | **Declined.** The token is `#a3160e`/`#ffa9a1` — a real colour change in both themes — and `admin-privacy` has no `.contrast.spec.ts` to prove AA either way. `riviera-tailwind`'s no-drift rule requires a computed-style diff, which this slice will not run. The raw-hex sites make it a repo-wide sweep, not a rider | claude | **declined, reaffirmed at Phase 3.** Re-put to the maintainer when FU-2 was pulled in-slice; they held R-4. The swap is a restyle needing design input on which red is correct — including whether `--riv-error-ink` even suits the three *danger/status* affordances among the sites. Tracked by **#829**, which predates this plan (deferred from #826 as OQ-2). My duplicate #830 is closed: its enumeration was wrong (grep *lines*, missing the three `border-[#b3261e]`) and its "no raw hex remains" bar would have reversed the documented deviation at `app.ts:59–69` |
| R-5 | The a11y specs' file-header TSDoc keeps describing an always-mounted alert after the code stops having one | med | low | #827 updated `admin-commissions.a11y.spec.ts`'s header in the same commit; mirror that. Listed explicitly in File structure so `check-plan-file-structure.mjs` sees the paths | claude | **closed, Phase 3** — one header was stale, not two; `admin-privacy.a11y.spec.ts` never described the banner |
| R-6 | An identical failure repeated back-to-back re-announces on one surface but not the other | low | low | Not a regression either way: today the text goes `X → X` with no mutation and no announcement. Gating makes `admin-privacy` *better* (the `set('')` before the `await` destroys the view, so the retry re-inserts) and leaves `oppw`'s synchronous-validation path identical (both `set`s coalesce into one render). Focus, not the live region, is what conveys it on `oppw` — and `revealOutcome()` re-runs every time | claude | accepted |

## Open questions / Assumptions

- **AS-1 (Assumption, load-bearing for R-1):** `afterNextRender`'s `earlyRead` observes DOM
  created by the change-detection pass that the triggering `signal.set()` scheduled — so a
  just-`@if`-created element is findable. angular.dev's `afterNextRender` page states only
  that phases run "once, after the next render" and does not pin the relation to change
  detection, so this rests on **in-repo evidence instead**:
  `shared/focus-after-render.ts`'s TSDoc says it outright — *"The target rarely exists yet
  when the transition is decided, so the lookup runs in `earlyRead`"* — and `admin-privacy`
  already uses `focusMover()` to land focus on `admin-privacy-confirm-panel` and
  `admin-privacy-done-panel`, both of which are `@if`-gated stage panels created by the very
  render the move rides on. Same mechanism, same file, shipped. — *Owner:* claude ·
  *Resolves by:* Phase 1, where AC-5 proves it directly rather than by analogy.
- **AS-2 (Assumption) — FALSIFIED at Phase 1, see F-1.** It assumed `revealOutcome()`'s
  selector could be left byte-identical because `:not(:empty)` was load-bearing for the
  notice half. Measured: it is load-bearing for neither half. `:empty` matches an element
  with **no child nodes at all**; an Angular interpolation always leaves a text node, so
  both regions match `:not(:empty)` unconditionally — and `querySelector` resolves a
  selector *list* in **document order**, not list order, with the notice above the form and
  the error below it. The selector therefore returned the notice on every call. Replaced by
  an ordered pair of queries (error, then notice); the diff reaches
  `operator-password.ts`'s class, not just its template. — *Owner:* claude ·
  *Resolved:* Phase 1, by AC-5.
- **AS-3 (Assumption) — HELD, but its premise was wrong; see F-4.** Keeping the reserve is
  right: deleting it shrinks the clean panel by a line, an unproven visual change #828 does
  not own. The premise that the reserve makes the banner cost *no* shift is false, and the
  AC-3 the assumption produced was **vacuous as first written** — it measured the confirm
  button, which sits above the banner and cannot move either way; it passed with the
  reserve deleted. Rewritten to measure the panel and mutation-checked both directions.
  — *Owner:* claude · *Resolved:* Phase 2.

**Follow-ups (not blocking):**

- **FU-1 (already tracked: #829):** the raw `#b3261e` → `--riv-error-ink` sweep (16 sites, 11
  files, needs contrast proofs). Do this at close-out, not now.
- ~~**FU-2**~~ — **not deferred; measured and resolved in this slice** at the maintainer's
  instruction (#831 filed, then closed as done here). See F-5.

## Grill findings — what the issue does not carry

> The issue-intake gate's whole point. All three are **mechanical breakages the ticket's
> "presentation only" framing hides**, found by enumerating every reader of the two testids
> (`grep -rn 'oppw-error\|admin-privacy-error' frontend/`), not by reading the ticket.

- **G-1 — a unit spec asserts the exact shape being removed.**
  `operator-password.spec.ts:174`, `it('keeps both live regions in the DOM before there is
  anything to announce')`, asserts *both* regions are present and empty. Half of it is
  RV-FE-10's protection of the notice and must survive; the other half is the defect. It
  splits into two specs (AC-4), which is also what makes R-2 loud.
- **G-2 — a unit assertion flips from passing to failing.**
  `operator-password.spec.ts:75` reads `expect(text(fixture, 'oppw-error')).toBe('')`. That
  file's `text()` helper (`:59`) is `…?.textContent?.trim()` with **no `?? ''` fallback**,
  so it returns `undefined` on absence and the assertion fails. Note the asymmetry:
  `admin-privacy.spec.ts:57`'s helper *does* have `?? ''`, which is why the admin side
  produces no equivalent break — the two helpers differ by four characters and that is the
  whole difference in blast radius.
- **G-3 — two e2e assertions break, and their failure will be misread.**
  `operator-password.e2e.ts:53` and `:91` are
  `await expect(page.getByTestId('oppw-error')).toHaveText('')`. Against a gated-away
  element Playwright retries to timeout and reports `Received string: ""` — an error message
  that describes a *passing* comparison (microsoft/playwright#29873), so the real cause
  (element absent) is invisible in the failure text. Both become `toHaveCount(0)`, the
  repo's dominant absence idiom (16 uses; nearest neighbour
  `admin-mail-delivery.e2e.ts:139`). The paired `oppw-notice` `toHaveText('')` lines on
  `:43` and `:91` stay as they are — that element is still mounted.

Not drift, checked and clear: every code citation in the issue body and both comments
matches `main` `0dec1f9` exactly (`oppw-error` at `:98`, `submitError` at `:32`,
`admin-privacy.ts:180`'s `min-h-[1.25rem]`, `:104`'s field error, `:323`'s
`messageFor(erasureErrorOf(error))`, and the `revealOutcome()` selector at `:207`). No open
PR touches either file; no Flyway number is in play; #828 has no parent epic, so there is no
sibling close-out to verify.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No booking, beach map, or `availability` code is in
scope; the diff is two Angular templates plus their tests. Neither surface reserves,
releases, or reads a `(set, date)` row.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` changes; no module, port, or event is
touched.

### Module ownership (§4a)

N/A — no behavior is added or moved across any boundary. Both files stay in their existing
feature folders (`frontend/src/app/admin/`, `frontend/src/app/auth/`), which is
`riviera-frontend`'s call and unchanged by this slice.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money is displayed, computed, or moved.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-privacy.ts` | existing | standalone component, inline template | `signal` (`erasureError`) drives a new `@if` | Signal Forms (untouched) |
| FE-2 | `auth/operator-password.ts` | existing | standalone component, inline template | `signal` (`error`) drives a new `@if`; `afterNextRender` focus | Signal Forms (untouched) |

**Standards:** native `@if` control flow (not `*ngIf`), signals for state, `class`
bindings not `ngClass`, no explicit `OnPush` (default in v22) — all already true of both
files; this slice adds one `@if` block to each and changes no API. Confirmed against the
angular-cli MCP `get_best_practices` for v22.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or client type is touched.

## Execution status

**Stage pointer:** `implement` — building on
`claude/action-alert-lifetime-828-u8kh54`, branched from the planning branch so the plan
doc travels with the code (cloud-session branch substitution, `riviera-sdlc`
§Remote/cloud addendum).

**Next action:** Phases 0–3 are complete and every AC is verified below. PR **#832** is open
and out of draft; CI, the Review gate and the Sonar gate have all run — see §Gate log.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Retarget the three assertions that read the old shape (G-1…G-3) | ✅ | `4ea229b` |
| 1 — Gate `oppw-error`, preserving the focus contract | ✅ | `288067b` |
| 2 — Gate `admin-privacy-error`, reserve to a wrapper | ✅ | `1543276` |
| 3 — Doc-header freshness + generalization audit | ✅ | `c449eb5` + `6344b79` (F-5) |
| 4 — Review-gate findings F-7…F-10 | ✅ | this commit |

**Next after this commit:** the close-out commit — plan-doc final state and the two open
self-review boxes — then squash-merge once this push's CI is green.

### Gate log

- **Integration.** No merge commit: the branch's merge-base already *was* `origin/main`'s tip
  (`0dec1f9`), so there was nothing to integrate and nothing for a routing gate to cover.
- **CI.** Green on `7d355be` — all 8 checks (backend build+test, frontend lint/test/build,
  repo hygiene, both CodeQL analyses, SonarCloud). CI fires on `pull_request` only (#417), so
  opening PR #832 is what produced the branch's first run.
- **Review gate.** Ran via **rung 1** of the `riviera-sdlc` `references/pr-gates.md` §1 ladder:
  `Skill("code-review")` was **not** refused this session, so the plugin's subagent fan-out ran
  directly over `origin/main...HEAD`; `riviera-review-overlay` was layered on top and its
  frontend bank walked item by item. Two findings from the fan-out (F-7, F-8), two from the
  overlay (F-9 RV-FE-9, F-10 RV-PROC-1). Effort: **medium** — the slice touches no availability,
  booking, money or authorization surface, and its structural net (lint, format, the four
  diff-scoped hygiene guards) is green. Overlay items that mattered: RV-FE-9 ✅ (all three legs,
  now with a Chromium leg), RV-FE-10 ✅ (the notice is untouched; an alert created *with* its
  message is the shape this item explicitly sanctions), RV-FE-11 ✅ (both banners are
  action-level, so alert-only is correct), RV-FE-E2E ✅ (mocked/CI-run suite, correct half),
  RV-FE-8 ✅ (the diff adds no import at all), RV-FE-7 ✅, RV-STYLE-1/2 ✅ (guard + Prettier).
- **Sonar gate.** Clear on `7d355be`, and **not** a false-clean read: `new_lines=20` is
  populated and the `SonarCloud Code Analysis` check-run concluded `success`. 0 new issues,
  0 new bugs / vulnerabilities / code smells / security hotspots, `new_duplicated_blocks=0`,
  new-code coverage **100%** (bar: ≥80%). Re-checked after the F-7…F-10 push.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | Phase 1 TDD (AC-5 red) | `revealOutcome()` focused `oppw-notice` on **every** call, failure path included — so a failed password change dropped a keyboard user on a blank paragraph above the form (RV-FE-9, live on `main`). Two causes compounding: `querySelector` resolves a selector list in document order (notice above, error below), and the `:not(:empty)` meant to exclude the silent region cannot — `:empty` matches only an element with **no child nodes**, and an interpolation always leaves one. Invisible until AC-5 asserted `document.activeElement`; gating the element alone did **not** fix it | fixed in Phase 1 — error queried first, notice as fallback; pinned by AC-5 + AC-6, both mutation-checked |
| F-2 | Phase 0 (G-3 re-check) | G-3 overcounted the e2e breakage: `operator-password.e2e.ts:91` is an `oppw-notice` assertion, not an `oppw-error` one (the plan lists `:91` in both roles, two paragraphs apart). Exactly **one** e2e assertion needed retargeting, `:53` | fixed in Phase 0 — `:53` → `toHaveCount(0)`; `:43` and `:91` left alone as the second G-3 paragraph intended |
| F-6 | Maintainer review of the filed follow-ups | **#830 was a duplicate of #829**, which the maintainer had filed seven hours earlier from #826's close-out. Filed without searching the tracker first — the plan said "file an issue" and that instruction was followed without checking whether one already existed. Worse than redundant: #830's enumeration counted grep *lines* (16) rather than occurrences (18, three of them `border-[#b3261e]`), and its acceptance bar "no raw `#b3261e` remains" would have reversed the deliberate, contrast-measured deviation documented at `app.ts:59–69`. #829 also splits the sites into 13 error messages vs 3 danger/status affordances, a distinction #830 lacked | closed — #830 closed as duplicate with the corrections recorded on it; R-4 and FU-1 now point at #829. **Process lesson: search the tracker before filing, even when a plan instructs the filing** |
| F-5 | Phase 3 follow-up, at maintainer's instruction ("don't file follow-ups, fix it here") | The two surviving `empty:` utilities, measured in real Chromium instead of deferred — and they went **opposite** ways. `booking-view.ts`'s `empty:hidden` **works** (its `<p>` holds only `@if` comment anchors, which do not affect `:empty`): left untouched. `operator-password.ts`'s `cls.notice` `empty:mb-0` is **dead** (Angular collapses the whitespace around `{{ notice() }}` to `"  "`, and whitespace is not `:empty` in Chromium): deleted, with its comment corrected. Chromium and jsdom disagree in *opposite directions* on a zero-length text node — Chromium calls it empty, nwsapi does not — so this is unpinnable by any unit spec | fixed in Phase 3 — deletion proven a no-op (20px before and after) by a `toHaveCSS` assertion in `operator-password.e2e.ts` |
| F-4 | Phase 2 TDD (AC-3 mutation check) | AC-3 as the plan wrote it could not fail: it measured `admin-privacy-confirm`'s `y`, and the banner is the panel's **last** child, so nothing above it moves whether the reserve exists or not — it passed with `min-h-[1.25rem]` deleted. Rewriting it to measure the panel exposed the second half: the reserve is one line (20px) while the message wraps to two (40.5px), so the panel grows 20.5px anyway. Not a regression — the always-mounted banner reserved the same single line on `main` | fixed in Phase 2 — AC-3 restated as "grows by less than the banner's own height", verified red with the reserve deleted and green with it |
| F-3 | Phase 1 generalization audit | The plan's per-phase command `npm test -- <name>` does not scope anything here: `ng test` reads a positional argument as the *project* name and exits `Invalid values: Argument: project`. The working scoped form is `npx ng test --include="<path to spec>"` | no code change — recorded so the next session does not re-derive it |
| F-7 | Review gate (`code-review`, PR #832) | `admin-privacy.e2e.ts`'s new AC-3 test pinned the *current* two-line wrap as a requirement: `expect(grew).toBeGreaterThan(0)` goes red if `messageFor()` is ever shortened enough for the reserve to absorb the banner whole — i.e. it fails for a strictly **better** layout outcome than the one the test's own name describes. The real claim is one-sided: `0 ≤ grew < banner` | fixed — `toBeGreaterThanOrEqual(0)`; the mutation check survives unchanged, since deleting the reserve makes `grew == banner` and `toBeLessThan` still fails. The test's TSDoc now states the bound is one-sided on purpose |
| F-8 | Review gate (`code-review`, PR #832) | The same test settled the panel's entry animation with `page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))` — **document-scoped**, so any `infinite` animation anywhere on the page (`animate-pulse`, `pay-spin`, `riv-drift` all exist in this repo) never resolves `finished` and hangs the test to a 60s timeout. Inert on the Privacy tab today, but latent — and the file already defines the element-scoped `settled(panel)` helper at `:71`, used twice above | fixed — the new test calls `settled(panel)` like its neighbours; no new helper, the duplication was the finding |
| F-9 | Review gate (riviera-review-overlay, RV-FE-9) | F-1 is a **shipped WCAG 2.4.3 defect** and it was pinned only in jsdom. RV-FE-9's stated shape for this repo is `await expect(page.getByTestId('…')).toBeFocused()` at each leg in the CI-run mocked suite — and the item warns in the same breath that jsdom is not evidence for a focus claim. The `<p>`s carry `tabindex="-1"`, so the browser leg was available and simply absent | fixed — a `toBeFocused()` leg on each arm of the existing `operator-password.e2e.ts` walk-through. **Mutation-checked**: restoring `main`'s selector list turns the failure leg red (`unexpected value "inactive"` — focus on the notice), which is F-1 reproduced in Chromium rather than argued |
| F-10 | Review gate (riviera-review-overlay, RV-PROC-1) | `riviera-local-debug` was missing from **Skills consulted** although the plan cites its recipes in three places (the scoped-run rule, the `npx ng test --include=` form recorded as F-3, and the `PW_CHROMIUM_EXECUTABLE` Playwright recipe). The skill was consulted; the line under-reported it, which is exactly the drift RV-PROC-1 checks for | fixed — added to the line with what it contributed. `playwright-cli`'s entry also now records the RV-FE-9 shape it supplied for F-9 |

---

## File structure

- `docs/plans/action-alert-lifetime.md` — this plan
- `frontend/src/app/auth/operator-password.ts` — gate `oppw-error` on `error()`; drop
  `empty:mt-0` from `cls.submitError`; **and, unplanned (F-1), fix `revealOutcome()`** to
  query the error before the notice instead of as one selector list, with the why moved into
  the method's TSDoc (RV-STYLE-1: an inline comment is one line); drop `cls.notice`'s dead
  `empty:mb-0` and correct the comment that claimed it worked (F-5)
- `frontend/src/app/auth/operator-password.spec.ts` — split the both-regions spec (G-1),
  fix the `toBe('')` assertion (G-2), add the two focus specs (AC-5, AC-6)
- `frontend/src/app/auth/operator-password.a11y.spec.ts` — header TSDoc: the alert is no
  longer "present before it carries text" (R-5)
- `frontend/e2e/operator-password.e2e.ts` — `toHaveText('')` → `toHaveCount(0)` on the
  **one** error-absence assertion, `:53` (G-3, corrected by F-2); pin the notice's resting
  margin so the `empty:mb-0` deletion is proven a no-op, with the why in the file header
  (F-5)
- `frontend/src/app/admin/admin-privacy.ts` — wrap the banner in
  `<div class="mt-2 min-h-[1.25rem]">` and gate the `<p>` on `erasureError()`
- `frontend/src/app/admin/admin-privacy.spec.ts` — add the clean-state spec (AC-1)
- `frontend/src/app/admin/admin-privacy.a11y.spec.ts` — **unchanged**; its header never
  described the banner (R-5 over-scoped, see Phase 3 Step 1)
- `frontend/e2e/admin-privacy.e2e.ts` — add the reserve measurement (AC-3, restated per F-4)

---

## Phase 0 — Retarget the assertions that read the old shape

**Files:** Modify `frontend/src/app/auth/operator-password.spec.ts:75,174-187` ·
`frontend/e2e/operator-password.e2e.ts:53,91`

Phase 0 is deliberately **not** red-green: these are pre-existing assertions being pointed
at the shape the next two phases produce. Each edit turns a currently-green assertion red;
Phases 1–2 turn them green again. That ordering is what makes G-1…G-3 impossible to
discover late.

- [x] **Step 1: Split the both-regions spec** (G-1) into
      `keeps the polite notice mounted before there is anything to announce` (asserts
      `oppw-notice` present, `role="status"`, text `''` — RV-FE-10's protection, unchanged
      in substance) and `mounts no alert region before there is anything to announce`
      (asserts `querySelector('[data-testid="oppw-error"]')` is `null`). Keep the
      one-line comment above the first; the second gets its own naming the lifetime rule.
- [x] **Step 2: Fix the success-path assertion** (G-2) — `:75` becomes an explicit absence
      check against the queried element, not `text(…)`, so the assertion says *absent*
      rather than leaning on a helper's `undefined`.
- [x] **Step 3: Retarget the two e2e assertions** (G-3) — `:53` and `:91` become
      `await expect(page.getByTestId('oppw-error')).toHaveCount(0);`. Leave the adjacent
      `oppw-notice` `toHaveText('')` lines alone.
- [x] **Step 4: Run and verify they now fail** —
      `npm test -- operator-password` → FAIL on the three retargeted assertions (element
      still mounted). The e2e half is proven in Phase 1's run, not here.

> Scope per `riviera-local-debug`: a single spec file, never the full suite.

- [x] **Step 5: Commit** — `git commit -m "Point the operator-password assertions at a gated alert (#828)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Gate `oppw-error`, preserving the focus contract

**Files:** Modify `frontend/src/app/auth/operator-password.ts:32,98-100` · Test
`frontend/src/app/auth/operator-password.spec.ts`

- [x] **Step 1: Write the two failing focus specs** (AC-5, AC-6) — assert
      `document.activeElement` is the `oppw-error` element after a failed submit, and the
      `oppw-notice` element after a successful one, with `oppw-error` absent in the second.
      These pin RV-FE-9 on a surface that asserts focus nowhere today, and they must be
      **mutation-checked**: each has to fail if `revealOutcome()` is deleted.
- [x] **Step 2: Run, verify failure** — `npm test -- operator-password` → the focus specs
      FAIL (nothing asserts focus yet), alongside Phase 0's three.
- [x] **Step 3: Gate the element.** Wrap the `<p>` at `:98` in `@if (error()) { … }`,
      keeping `role="alert"`, `tabindex="-1"` and `data-testid` verbatim; drop
      `empty:mt-0` from `cls.submitError` at `:32`; leave `cls.notice`'s `empty:mb-0`
      untouched. **The `revealOutcome()` selector at `:207` did not survive AS-2** — AC-5
      stayed red after the gating, and the two-query fix in F-1 is what turned it green.
- [x] **Step 4: Run, verify pass** — `npm test -- operator-password` → PASS (all five).
      Then `npm run test:e2e:a11y -- operator-password` → PASS, proving G-3's retarget.
- [x] **Step 5: Generalization-audit pass** — see the log; this phase introduces the
      pattern the sweep is about.
- [x] **Step 6: Commit** — `git commit -m "Mount the operator password error only while it has something to say (#828)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Gate `admin-privacy-error`, reserve to a wrapper

**Files:** Modify `frontend/src/app/admin/admin-privacy.ts:179-184` · Test
`frontend/src/app/admin/admin-privacy.spec.ts` · `frontend/e2e/admin-privacy.e2e.ts`

- [x] **Step 1: Write the failing specs** — AC-1 (`mounts no error element while the
      confirmation is clean`, asserting `confirmPanel.querySelector('[role="alert"]')` is
      `null`, mirroring `admin-commissions.spec.ts:266`) and AC-3 (e2e: read
      `admin-privacy-confirm`'s `boundingBox().y` clean, trigger the failure, read it again,
      assert equality).
- [x] **Step 2: Run, verify failure** — `npm test -- admin-privacy` → AC-1 FAILS (the
      empty alert is mounted).
- [x] **Step 3: Apply the #827 shape** — wrapper takes the layout, `<p>` keeps the type:

```html
<div class="mt-2 min-h-[1.25rem]">
  @if (erasureError()) {
    <p
      class="text-[13.5px] font-semibold text-[#b3261e]"
      role="alert"
      data-testid="admin-privacy-error"
    >
      {{ erasureError() }}
    </p>
  }
</div>
```

- [x] **Step 4: Run, verify pass** — `npm test -- admin-privacy` → PASS; then
      `npm run test:e2e:a11y -- admin-privacy` → PASS (AC-3).
- [x] **Step 5: Commit** — `git commit -m "Mount the erasure failure banner only while it has something to say (#828)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Doc-header freshness, audit, close-out prep

**Files:** Modify both `*.a11y.spec.ts` headers · this plan doc

- [x] **Step 1: Update the a11y spec header TSDocs** (R-5). **One** of the two needed it:
      `operator-password.a11y.spec.ts`'s header said both regions "only exist after a
      submit", which post-gating conflates the always-mounted notice with the inserted
      alert and reads as a contradiction of RV-FE-10 — rewritten to state the asymmetry.
      `admin-privacy.a11y.spec.ts` needed **no** edit: its header describes the `@if`-gated
      email-field error, never the banner, so nothing in it went stale. R-5 assumed two
      stale headers; there was one.
- [x] **Step 2: Record the generalization audit** in the log below.
- [x] **Step 3: Run the structural checks** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc **staged**
      first, or it short-circuits and passes),
      `node scripts/check-inline-comments.mjs --diff origin/main`,
      `node scripts/check-focus-posture.mjs --diff origin/main` (read FOCUS-1's *output*;
      it returns 0 either way), `npm run lint`, `npm run format:check`.
- [x] **Step 4: File FU-1** — **not needed: #829 already tracks it**, filed from #826's
      close-out before this plan was written. The plan's instruction to file one was stale,
      and following it produced duplicate #830, now closed against #829 (see F-6). FU-2 was
      filed as **#831** and then **closed as done here** when the maintainer pulled
      follow-up work in-slice — see F-5.
- [x] **Step 5: Commit + finalize execution status** for the PR's last commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | plan (pre-audit, inherited) | Every `role="alert"` in `frontend/src` that is mounted unconditionally — enumerated by **mechanism** (an error element mounted regardless of its message), not by resemblance to `admin-commissions` | `grep -rn 'role="alert"' frontend/src` (#826's Phase 0 sweep) | 4 ungated | 1 fixed by #827; 2 are this slice; the 4th judged on its merits in #827's audit log — **do not re-enumerate** |
| 2026-08-30 | Phase 1 | Every reader of a gated testid — *a test that asserts emptiness on an element that may now be absent*, invisible to a `role="alert"` sweep | `grep -rn 'oppw-error\|admin-privacy-error' frontend/` then `grep -rn "toHaveText('')" frontend/e2e frontend/src` | 4 other `toHaveText('')` sites | All four target regions that stay unconditionally mounted (`oppw-notice` ×2, `admin-photos-notice`, the load announcer, a skeleton placeholder). No other surface carries the coupling — nothing to change |
| 2026-08-30 | Phase 1 (F-1) | The **new** mechanism F-1 exposed, which no `role="alert"` sweep reaches: a `querySelector` **selector list** used to pick a focus target, where the list's order reads as a priority it does not have | `grep -rn 'querySelector' frontend/src --include=*.ts \| grep -v spec \| grep ','` | 1 — `revealOutcome()` itself | Fixed in place. No second site: every other focus lookup is a single selector, or goes through `shared/focus-after-render.ts`'s explicit primary/fallback pair, which had the ordering right all along |
| 2026-08-30 | Phase 1 (F-1) | The second half of F-1: a **CSS `:empty` guard on an element whose content is an Angular interpolation**, which cannot fire because the interpolation leaves a text node | `grep -rn ':empty' frontend/src --include=*.ts` | 3 — the fixed selector, `cls.notice`'s `empty:mb-0`, `booking-view.ts`'s `result` `empty:hidden` | All three resolved in-slice (F-5), not deferred. Selector fixed; `booking-view`'s utility **measured working** (comment anchors do not defeat `:empty`) and left alone; `cls.notice`'s **measured dead** (whitespace text node) and deleted as a proven no-op. The generalizing rule: never let focus or announcement correctness depend on `:empty` — and never let a *unit* spec adjudicate it, since jsdom and Chromium disagree in opposite directions |

---

## Acceptance-criteria verification (final)

> Test scope per `riviera-local-debug`: one spec file per run, never the full suite. The
> **working scoped command is `npx ng test --include="<path>"`** — `npm test -- <name>` as
> the phases wrote it does not scope anything (`ng test` reads the positional argument as a
> *project* name and exits `Invalid values: Argument: project`). Finding F-3.

- [x] **AC-1:** `npx ng test --include="src/app/admin/admin-privacy.spec.ts"` →
      `mounts no error element while the confirmation is clean` PASS (20/20). Red before
      the gating with `expected <p role="alert" …> to be null`. Verified at `1543276`.
- [x] **AC-2:** same run → `keeps the confirmation armed when the request fails` PASS,
      unchanged. Verified at `1543276`.
- [x] **AC-3 (restated):** `npm run test:e2e:a11y -- admin-privacy` → 8/8 PASS, including
      `the failure banner lands in reserved space, so the panel absorbs part of it`.
      **Mutation-checked both ways:** with `min-h-[1.25rem]` deleted it fails
      (`Expected: < 40.5, Received: 40.5`); the *original* AC-3 wording passed with the
      reserve deleted, which is why it was restated — F-4. Verified at `1543276`.
- [x] **AC-4:** `npx ng test --include="src/app/auth/operator-password.spec.ts"` → both
      split specs PASS (14/14). Verified at `288067b`.
- [x] **AC-5:** same run → `focuses the error it just inserted, not the body` PASS, **and
      it fails with `revealOutcome()` deleted** — run with both call sites stripped:
      `2 failed | 12 passed`, the two focus specs being the failures. It also stayed red
      after the gating alone, which is what exposed F-1. Verified at `288067b`.
- [x] **AC-6:** same run → `focuses the success notice and mounts no alert` PASS, and in
      the same mutation run above it fails with `revealOutcome()` deleted. Verified at
      `288067b`.
- [x] **AC-7:** `npm run test:e2e:a11y -- operator-password` → 2/2 PASS with its three
      `expectNoSeriousAxeViolations` calls green (and, since F-5, the notice's resting-margin
      assertion); `npm run test:e2e:a11y -- admin-privacy`
      → 8/8 PASS. The absence assertion is `toHaveCount(0)`; no `toHaveText('')` remains on
      either error testid. Verified at `1543276`.

Playwright runs use `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` per
`riviera-local-debug`. **CI owns the full suite** — these scoped runs prove the changed
surfaces only.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test. AC-3 and AC-5/AC-6 were mutation-checked rather than trusted; AC-3 failed that check as first written and was restated (F-4).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases — no signature changed; `revealOutcome()` keeps its `(): void`.
- [x] **No JPA** introduced (invariant #1) — N/A, no backend code in the diff.
- [x] **Availability** section justified N/A (invariant #2) — no `(set, date)` write path in scope.
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11) — frontend-only; nothing under `platform/` is in the diff.
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A; the erasure *failure* banner is presentation over an existing endpoint.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met — native `@if`, signals, no `ngClass`; `riviera-tailwind`'s reserve-in-a-wrapper shape followed (#827's exact shape); no new `.scss`, and neither touched component carries legacy SCSS, so RV-FE-7's migrate-on-touch does not fire. `npm run lint` and `npm run format:check` both clean.
- [x] `oppw-notice` still mounted and still `role="status"` (RV-FE-10) — its element, role, `tabindex`, `empty:mb-0` and template comment are byte-identical to `main`. Two specs fail if it is gated.
- [x] `revealOutcome()`'s scroll/focus contract asserted, not assumed (RV-FE-9, AC-5/AC-6) — and asserting it found the contract **broken on `main`** (F-1), not merely unpinned.
- [x] Neither banner gained `[appFieldErrorFor]` (RV-FE-11's action-level checkbox); `admin-privacy.ts`'s email-field error is untouched.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, and a findings register carrying F-1…F-4.
- [x] Risk register has no stale `open` rows (R-1, R-2, R-5 closed; R-3 closed by the plan; R-4 declined → #829; R-6 accepted). AS-1 held, AS-2 falsified, AS-3 held with a corrected premise — each annotated in place.
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`. **Open:** no PR exists yet; due when one is opened.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`. **Open:** due at ready-for-review, not yet run.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
