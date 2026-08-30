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
absence idiom is `toHaveCount(0)`).

**Branch:** `claude/sdlc-828-planning-xh3wm2` — the cloud session's designated branch,
standing in for `bugfix/action-alert-lifetime` per `riviera-sdlc` §Remote/cloud addendum.
It exists and is checked out.

---

## Acceptance criteria (testable)

> Written at the surface's own boundary: these components have no application-service
> seam beneath them — the observable outcome *is* the rendered DOM and the focus
> position, so that is where the ACs sit.

- [ ] **AC-1:** Given the admin Privacy tab with a confirmation armed and no failure yet,
      when the panel renders, then no element with `role="alert"` exists inside
      `admin-privacy-confirm-panel`. *Pinned by:*
      `admin-privacy.spec.ts` › `mounts no error element while the confirmation is clean`
- [ ] **AC-2:** Given an armed confirmation, when the erasure request fails, then
      `admin-privacy-error` exists, carries `role="alert"`, and contains
      "Nothing was erased". *Pinned by:* `admin-privacy.spec.ts` ›
      `keeps the confirmation armed when the request fails` (existing, still green)
- [ ] **AC-3:** Given an armed confirmation, when the panel is clean and then fails, then
      the vertical offset of `admin-privacy-confirm` (the destructive button) is unchanged
      between the two states — the reserve absorbs the banner. *Pinned by:*
      `admin-privacy.e2e.ts` › `arming and failing does not shift the confirm button`
- [ ] **AC-4:** Given the operator change-password form untouched, when it renders, then
      `oppw-error` is absent **and** `oppw-notice` is present with `role="status"` and
      empty text. *Pinned by:* `operator-password.spec.ts` ›
      `keeps the polite notice mounted before there is anything to announce` **and** ›
      `mounts no alert region before there is anything to announce`
- [ ] **AC-5:** Given a submit that fails (wrong current password), when the failure
      lands, then `oppw-error` exists with `role="alert"` and
      `document.activeElement` is that element. *Pinned by:*
      `operator-password.spec.ts` › `focuses the error it just inserted, not the body`
- [ ] **AC-6:** Given a submit that succeeds, when the notice lands, then `oppw-error`
      is absent and `document.activeElement` is `oppw-notice`. *Pinned by:*
      `operator-password.spec.ts` › `focuses the success notice and mounts no alert`
- [ ] **AC-7:** Given the mocked e2e run over both surfaces, when each of the three
      states is reached, then `expectNoSeriousAxeViolations` passes and the absence
      assertions use `toHaveCount(0)`, not `toHaveText('')`. *Pinned by:*
      `operator-password.e2e.ts` (existing three axe calls) + `admin-privacy.e2e.ts`

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
| `admin-privacy-error` reserves `min-h-[1.25rem]` so the panel does not grow when it speaks | **preserved** | the reserve moves to a `<div class="mt-2 min-h-[1.25rem]">` wrapper, exactly the #827 shape (`admin-commissions.ts:222`) |
| `admin-privacy-error` carries `mt-2` spacing | **preserved** | moves to the wrapper with the reserve; the inner `<p>` keeps only its type/colour classes |
| erasure failure returns focus to `admin-privacy-confirm` (`admin-privacy.ts:326`) | **preserved** | untouched — the banner never held focus on this surface, so the RV-FE-9 leg is unaffected |
| `oppw-error` announces a failure via text mutation on a mounted `role="alert"` | **changed** | as above — announced on insertion |
| `oppw-error` is scrolled into view and focused by `revealOutcome()` | **preserved** | `tabindex="-1"` stays on the element; `earlyRead` finds the just-inserted node (AS-1). Newly pinned by AC-5, which nothing asserts today |
| `revealOutcome()`'s `:not(:empty)` distinguishes "has something to say" from "sitting empty" | **changed** | redundant for the error half (gating does the distinguishing) but **kept verbatim** — still load-bearing for the always-mounted notice half. See AS-2 |
| `cls.submitError` collapses its own top margin when empty (`empty:mt-0`) | **dropped** | dead once the element only exists non-empty. The identical `empty:mb-0` on `cls.notice` **stays** — that element is still mounted empty |
| `oppw-error` is present-but-empty on a *successful* submit, and specs read `''` from it | **changed** | absent. Three assertions read that emptiness today and each breaks — see Grill findings G-1…G-3 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Gating `oppw-error` breaks `revealOutcome()` — `earlyRead` runs before the `@if` view is created, so focus is stranded on `<body>` (RV-FE-9, the repo's most-repeated bug class) | low | high | AS-1 settles the ordering on in-repo evidence. Regardless: AC-5 and AC-6 assert `document.activeElement` directly, and both are written **red-first against the current code** so they cannot be assertions that pass vacuously | claude | open |
| R-2 | Someone "finishes the job" by gating `oppw-notice` too — it is the same always-mounted `<p>` matched by the same selector | med | high | Non-goals row 1 + the surviving spec `keeps the polite notice mounted…` fails loudly if it is gated. The ticket's own second comment reversed this exact conclusion once | claude | open |
| R-3 | The three test breakages (G-1…G-3) are discovered at CI rather than at plan time, costing a red-CI round trip | — | med | **Already mitigated**: enumerated below by mechanism, and Phase 0 fixes them before the template changes | claude | closed by this plan |
| R-4 | Swapping `text-[#b3261e]` for `text-riv-error-ink` while the class attribute is already being edited introduces colour drift | low | med | **Declined.** The token is `#a3160e`/`#ffa9a1` — a real colour change in both themes — and `admin-privacy` has no `.contrast.spec.ts` to prove AA either way. `riviera-tailwind`'s no-drift rule requires a computed-style diff, which this slice will not run. 16 raw-hex sites across 11 files make it a repo-wide sweep, not a rider | claude | declined — see FU-1 |
| R-5 | The a11y specs' file-header TSDoc keeps describing an always-mounted alert after the code stops having one | med | low | #827 updated `admin-commissions.a11y.spec.ts`'s header in the same commit; mirror that. Listed explicitly in File structure so `check-plan-file-structure.mjs` sees the paths | claude | open |
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
- **AS-2 (Assumption):** `revealOutcome()`'s selector is left **byte-identical**. Dropping
  `:not(:empty)` from only the error half would make the selector asymmetric for no gain;
  dropping it from both would break the notice half, which is still mounted empty. Keeping
  it costs one redundant pseudo-class and keeps the diff to the template. — *Owner:* claude
  · *Resolves by:* Phase 1 review.
- **AS-3 (Assumption):** `admin-privacy`'s reserve is worth keeping. The banner is the
  panel's *last* child, so nothing above it shifts when it appears — but the ticket asks for
  the wrapper explicitly, #827 set the precedent, and silently deleting a reserve is an
  unproven visual change. AC-3 turns the assumption into a measured e2e assertion rather
  than leaving it as taste. — *Owner:* claude · *Resolves by:* Phase 2.

**Follow-ups (not blocking):**

- **FU-1:** File an issue for the raw `#b3261e` → `--riv-error-ink` sweep (16 sites, 11
  files, needs contrast proofs). Do this at close-out, not now.

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

**Stage pointer:** `plan` — plan doc authored, not yet committed. Implementation is
deliberately **not** started: this session's scope is "sdlc #828 and we stop after
creating the plan".

**Next action:** Commit this plan doc to `claude/sdlc-828-planning-xh3wm2` and push. Then
**stop** and await instruction. A session resuming to build starts at Phase 0 and opens the
draft PR at the first phase commit (CI fires on `pull_request` only — #417).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Retarget the three assertions that read the old shape (G-1…G-3) | | |
| 1 — Gate `oppw-error`, preserving the focus contract | | |
| 2 — Gate `admin-privacy-error`, reserve to a wrapper | | |
| 3 — Doc-header freshness + generalization audit | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet — no code written | — |

---

## File structure

- `docs/plans/action-alert-lifetime.md` — this plan
- `frontend/src/app/auth/operator-password.ts` — gate `oppw-error` on `error()`; drop
  `empty:mt-0` from `cls.submitError`; retarget the `cls.notice` comment at `:30` so it
  describes the notice only
- `frontend/src/app/auth/operator-password.spec.ts` — split the both-regions spec (G-1),
  fix the `toBe('')` assertion (G-2), add the two focus specs (AC-5, AC-6)
- `frontend/src/app/auth/operator-password.a11y.spec.ts` — header TSDoc: the alert is no
  longer "present before it carries text" (R-5)
- `frontend/e2e/operator-password.e2e.ts` — `toHaveText('')` → `toHaveCount(0)` on the two
  error-absence assertions (G-3)
- `frontend/src/app/admin/admin-privacy.ts` — wrap the banner in
  `<div class="mt-2 min-h-[1.25rem]">` and gate the `<p>` on `erasureError()`
- `frontend/src/app/admin/admin-privacy.spec.ts` — add the clean-state spec (AC-1)
- `frontend/src/app/admin/admin-privacy.a11y.spec.ts` — header TSDoc (R-5)
- `frontend/e2e/admin-privacy.e2e.ts` — add the no-shift measurement (AC-3)

---

## Phase 0 — Retarget the assertions that read the old shape

**Files:** Modify `frontend/src/app/auth/operator-password.spec.ts:75,174-187` ·
`frontend/e2e/operator-password.e2e.ts:53,91`

Phase 0 is deliberately **not** red-green: these are pre-existing assertions being pointed
at the shape the next two phases produce. Each edit turns a currently-green assertion red;
Phases 1–2 turn them green again. That ordering is what makes G-1…G-3 impossible to
discover late.

- [ ] **Step 1: Split the both-regions spec** (G-1) into
      `keeps the polite notice mounted before there is anything to announce` (asserts
      `oppw-notice` present, `role="status"`, text `''` — RV-FE-10's protection, unchanged
      in substance) and `mounts no alert region before there is anything to announce`
      (asserts `querySelector('[data-testid="oppw-error"]')` is `null`). Keep the
      one-line comment above the first; the second gets its own naming the lifetime rule.
- [ ] **Step 2: Fix the success-path assertion** (G-2) — `:75` becomes an explicit absence
      check against the queried element, not `text(…)`, so the assertion says *absent*
      rather than leaning on a helper's `undefined`.
- [ ] **Step 3: Retarget the two e2e assertions** (G-3) — `:53` and `:91` become
      `await expect(page.getByTestId('oppw-error')).toHaveCount(0);`. Leave the adjacent
      `oppw-notice` `toHaveText('')` lines alone.
- [ ] **Step 4: Run and verify they now fail** —
      `npm test -- operator-password` → FAIL on the three retargeted assertions (element
      still mounted). The e2e half is proven in Phase 1's run, not here.

> Scope per `riviera-local-debug`: a single spec file, never the full suite.

- [ ] **Step 5: Commit** — `git commit -m "Point the operator-password assertions at a gated alert (#828)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Gate `oppw-error`, preserving the focus contract

**Files:** Modify `frontend/src/app/auth/operator-password.ts:32,98-100` · Test
`frontend/src/app/auth/operator-password.spec.ts`

- [ ] **Step 1: Write the two failing focus specs** (AC-5, AC-6) — assert
      `document.activeElement` is the `oppw-error` element after a failed submit, and the
      `oppw-notice` element after a successful one, with `oppw-error` absent in the second.
      These pin RV-FE-9 on a surface that asserts focus nowhere today, and they must be
      **mutation-checked**: each has to fail if `revealOutcome()` is deleted.
- [ ] **Step 2: Run, verify failure** — `npm test -- operator-password` → the focus specs
      FAIL (nothing asserts focus yet), alongside Phase 0's three.
- [ ] **Step 3: Gate the element.** Wrap the `<p>` at `:98` in `@if (error()) { … }`,
      keeping `role="alert"`, `tabindex="-1"` and `data-testid` verbatim; drop
      `empty:mt-0` from `cls.submitError` at `:32`; leave `cls.notice`'s `empty:mb-0` and
      the `revealOutcome()` selector at `:207` untouched (AS-2).
- [ ] **Step 4: Run, verify pass** — `npm test -- operator-password` → PASS (all five).
      Then `npm run test:e2e:a11y -- operator-password` → PASS, proving G-3's retarget.
- [ ] **Step 5: Generalization-audit pass** — see the log; this phase introduces the
      pattern the sweep is about.
- [ ] **Step 6: Commit** — `git commit -m "Mount the operator password error only while it has something to say (#828)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Gate `admin-privacy-error`, reserve to a wrapper

**Files:** Modify `frontend/src/app/admin/admin-privacy.ts:179-184` · Test
`frontend/src/app/admin/admin-privacy.spec.ts` · `frontend/e2e/admin-privacy.e2e.ts`

- [ ] **Step 1: Write the failing specs** — AC-1 (`mounts no error element while the
      confirmation is clean`, asserting `confirmPanel.querySelector('[role="alert"]')` is
      `null`, mirroring `admin-commissions.spec.ts:266`) and AC-3 (e2e: read
      `admin-privacy-confirm`'s `boundingBox().y` clean, trigger the failure, read it again,
      assert equality).
- [ ] **Step 2: Run, verify failure** — `npm test -- admin-privacy` → AC-1 FAILS (the
      empty alert is mounted).
- [ ] **Step 3: Apply the #827 shape** — wrapper takes the layout, `<p>` keeps the type:

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

- [ ] **Step 4: Run, verify pass** — `npm test -- admin-privacy` → PASS; then
      `npm run test:e2e:a11y -- admin-privacy` → PASS (AC-3).
- [ ] **Step 5: Commit** — `git commit -m "Mount the erasure failure banner only while it has something to say (#828)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Doc-header freshness, audit, close-out prep

**Files:** Modify both `*.a11y.spec.ts` headers · this plan doc

- [ ] **Step 1: Update both a11y spec header TSDocs** (R-5) so neither still describes an
      alert region that exists before it carries text — the #827 precedent updated its
      header in the same commit as the code.
- [ ] **Step 2: Record the generalization audit** in the log below.
- [ ] **Step 3: Run the structural checks** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc **staged**
      first, or it short-circuits and passes),
      `node scripts/check-inline-comments.mjs --diff origin/main`,
      `node scripts/check-focus-posture.mjs --diff origin/main` (read FOCUS-1's *output*;
      it returns 0 either way), `npm run lint`, `npm run format:check`.
- [ ] **Step 4: File FU-1** and record its number here.
- [ ] **Step 5: Commit + finalize execution status** for the PR's last commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | plan (pre-audit, inherited) | Every `role="alert"` in `frontend/src` that is mounted unconditionally — enumerated by **mechanism** (an error element mounted regardless of its message), not by resemblance to `admin-commissions` | `grep -rn 'role="alert"' frontend/src` (#826's Phase 0 sweep) | 4 ungated | 1 fixed by #827; 2 are this slice; the 4th judged on its merits in #827's audit log — **do not re-enumerate** |
| _(Phase 1)_ | | Every reader of a gated testid — the mechanism this slice's defect class needs is *a test that asserts emptiness on an element that may now be absent*, which is invisible to a `role="alert"` sweep | `grep -rn 'oppw-error\|admin-privacy-error' frontend/` then, for the general form, `grep -rn "toHaveText('')\|toBe('')" frontend/e2e frontend/src` | _(fill at Phase 1)_ | The narrow sweep already yielded G-1…G-3. The broad one asks whether other surfaces carry the same latent coupling; record the verdict, do not skip it |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- admin-privacy` → `mounts no error element while the confirmation is clean` PASS. Verified at `<sha>`.
- [ ] **AC-2:** `npm test -- admin-privacy` → `keeps the confirmation armed when the request fails` PASS (unchanged). Verified at `<sha>`.
- [ ] **AC-3:** `npm run test:e2e:a11y -- admin-privacy` → no-shift assertion PASS. Verified at `<sha>`.
- [ ] **AC-4:** `npm test -- operator-password` → both split specs PASS. Verified at `<sha>`.
- [ ] **AC-5:** `npm test -- operator-password` → `focuses the error it just inserted, not the body` PASS, **and** fails when `revealOutcome()` is stubbed out. Verified at `<sha>`.
- [ ] **AC-6:** `npm test -- operator-password` → `focuses the success notice and mounts no alert` PASS. Verified at `<sha>`.
- [ ] **AC-7:** `npm run test:e2e:a11y` over both specs → PASS with three axe calls green. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no backend code in the diff.
- [ ] **Availability** section justified N/A (invariant #2) — no `(set, date)` write path in scope.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11) — frontend-only.
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A; the erasure *failure* banner is presentation over an existing endpoint.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met — native `@if`, signals, no `ngClass`; `riviera-tailwind`'s reserve-in-a-wrapper shape followed; no new `.scss` (RV-FE-7 clean).
- [ ] `oppw-notice` still mounted and still `role="status"` (RV-FE-10 — the one thing this slice must **not** change).
- [ ] `revealOutcome()`'s scroll/focus contract asserted, not assumed (RV-FE-9, AC-5/AC-6).
- [ ] Neither banner gained `[appFieldErrorFor]` (RV-FE-11's action-level checkbox).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (AS-1…AS-3 resolved or moved under `### Resolved`).
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
