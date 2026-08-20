# Operator Beach-Map Zero-Set States Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** an operator whose venue has zero sets gets an explained, actionable state on both
remaining beach-map surfaces — the Daily view tab's map card, and the per-set editor's panel —
instead of chrome that decodes, counts and promises tiles that do not exist.

**Architecture:** the significant decision is **not** the one the issue assumed. #718 asks for a
`canvasEmpty` slot on both surfaces; the per-set editor can never render one — its grid extent is
`Math.max(1, …)` clamped to at least 1×1 (`set-editor.ts` `rowCount`/`colCount`), so `rows()` is
never empty and the canvas's `@else` branch is unreachable there. So the Daily view gets the
`canvasEmpty` slot (its `rows()` genuinely empties), and the per-set editor gets its defect fixed
where the defect actually is: the side panel's "Pick a set on the map" copy, which is false when
there is no set to pick. Full evidence: **Open questions / Assumptions**, entries D-1 and D-2.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no backend file in scope.

**Source of intent:** GitHub issue **#718** (filed by #717's generalization audit; the sibling
tourist slice is `docs/plans/tourist-map-empty-state.md`, merged via PR #719).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill is what
caught that AC-2's mechanism does not exist on the per-set editor, and that "point at the Beach map
tab" is wrong for a surface that *is* that tab) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what pinned "the summary branches its content, never its element")
· `tdd` (each phase writes the failing spec against the zero-set render first, then the template
branch) · `riviera-review-overlay` (review gate — run at ready-for-review, PR #720) ·
`riviera-docs-freshness` (**ran** over `dd8c9a9..HEAD`, 0 findings — no substrate doc states
anything about operator empty states; the counting sweep over "surfaces projecting `canvasEmpty`"
is recorded in the Generalization-audit log) · `riviera-frontend` (structure — confirmed both edits
stay inside the `operator/` feature folder, no new file, no new cross-feature edge; the empty
state's link is a `routerLink` into the console's own child-route tree, not a new route) ·
`riviera-tailwind` (styling — utilities only, no new `.scss`; the CTA link reuses
`bg-(image:--riv-cta-grad)` + `[appTouchTarget]` paired with `inline-flex items-center`, because
`min-h-11` is a no-op on an inline `<a>`) · `angular-developer` + angular-cli MCP
(`get_best_practices` v22 — `@if`/`@else if` native control flow, signal reads in the template, no
`ngClass`) · `playwright-cli` (the mocked zero-set e2e on both surfaces) · `riviera-local-debug`
(scoped Vitest runs — `npm test -- <file>`, never the full suite per phase).

> **The five leading entries are pre-filled on purpose — extend them, don't replace them**
> (#447: pre-fill the constant so the author edits rather than recalls; full rationale:
> `riviera-plan-doc` workflow step 0). Fill every parenthesis with what the skill actually
> did — a name with a fixed label is cargo cult; RV-PROC-1 checks the line against the diff
> either way. Keep `riviera-docs-freshness`'s parenthesis **explicit — `ran` (range +
> findings) or `N/A — <reason>`**: "not listed" and "not applicable" read the same in a diff.

**Branch:** `claude/sdlc-718-u58pr7` — the cloud session's **designated remote branch**, standing in
for `feature/operator-map-empty-state` per `riviera-sdlc` § *Remote / cloud session addendum*. It
existed at `origin/main` before phase 0.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests (Cockburn 2005). This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.

These are frontend-render ACs by nature — the slice adds no application-boundary behavior at all
(no request, no state change). They are written at the surface's own boundary: what an operator
looking at a zero-set venue is told, and what they can do about it.

- [ ] **AC-1:** Given an operator on a venue whose map read returns `sets: []`, when the Daily view
      tab finishes loading, then the map card renders the empty-state message
      (`daily-map-empty`) — a heading, an explanation, and a link to that venue's Beach map tab —
      and renders no tile, no row/price rail and no scroll hint.
      *Pinned by:* `DailyViewTab (#175) › explains a venue with no sets instead of framing empty space (#718)`
- [ ] **AC-2:** Given the same zero-set venue, when the Daily view tab renders, then the live
      availability summary reads "No sets on the map yet" **in the same `<p data-testid="daily-availability">`
      element** (the `aria-live` region survives), and the tile legend is not rendered at all.
      *Pinned by:* `DailyViewTab (#175) › drops the 0-of-0 count and the tile legend when there are no sets (#718)`
- [ ] **AC-3:** Given a populated venue, when the Daily view tab renders, then the summary still
      reads "<n> walk-in marked · <n> of <n> sets free on <date>", the legend renders its three
      entries, and no empty-state element exists.
      *Pinned by:* `DailyViewTab (#175) › keeps the count, the legend and no empty state on a populated map (#718)`
- [ ] **AC-4:** Given the per-set editor rendered for a venue with zero sets, when the operator has
      selected nothing, then the panel reads the no-sets copy (`set-panel-no-sets`) naming the Bulk
      layout generator, **not** "Pick a set on the map…", and the map still offers exactly one
      empty spot whose click puts the panel into "Add a set".
      *Pinned by:* `SetEditor (#600) › points a set-less venue at the bulk generator, and still adds into the one empty spot (#718)`
- [ ] **AC-5:** Given the per-set editor rendered for a venue **with** sets and nothing selected,
      when it renders, then the panel still reads the original "Pick a set on the map…" copy.
      *Pinned by:* `SetEditor (#600) › keeps the pick-a-set copy when the venue has sets (#718)`
- [ ] **AC-6:** Given the zero-set Daily view, when axe runs over it in jsdom, then there are no
      violations (heading order, link name, live-region shape).
      *Pinned by:* `DailyViewTab a11y (#175) › has no axe violations on a venue with no sets (#718)`
- [ ] **AC-7:** Given the zero-set per-set editor inside its parent tab, when axe runs over it in
      jsdom, then there are no violations.
      *Pinned by:* `LayoutEditor a11y (#172) › has no axe violations in Edit-sets mode with no sets (#718)`
- [ ] **AC-8:** Given a real browser with the venue read mocked to `sets: []`, when the operator
      opens the Daily view tab, then the empty-state message is visible, the Beach-map link
      navigates to `/operator/1/beach-map`, and axe reports no serious violations.
      *Pinned by:* `operator-daily.e2e.ts › explains a zero-set day and links to the Beach map tab (#718)`
- [ ] **AC-9:** Given a real browser with `sets: []`, when the operator opens the Beach map tab and
      switches to **Edit sets**, then the panel shows the no-sets copy and the single empty spot is
      clickable into "Add set here".
      *Pinned by:* `operator-set-editing.e2e.ts › a set-less venue is pointed at the bulk generator (#718)`
- [ ] **AC-10:** The tourist beach map and the bulk layout editor render unchanged — **structural,
      not asserted**: no file under `frontend/src/app/venue/`, `frontend/src/app/shared/` or
      `layout-editor.html` appears in the diff (the one `layout-editor.a11y.spec.ts` entry is a
      spec, adding a case, changing no template).
      *Pinned by:* `git diff --stat origin/main` in the AC-verification section + the untouched
      `venue-map.spec.ts` / `beach-map-canvas.spec.ts` / `layout-editor.spec.ts` suites running green.

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **No `canvasEmpty` slot on `set-editor.html`.** It is unreachable there (D-1); adding one would
  be dead template. This is a deliberate deviation from the issue's AC-2, argued in D-1.
- **No change to `shared/beach-map-canvas.*`.** The canvas's three-slot contract already covers
  every case this slice needs.
- **No change to the zero-set *reachability*.** A venue with no layout is a legitimate state (a
  freshly created venue), same posture #717 took for the tourist side.
- **No change to the Beach map tab's mode default.** A zero-set venue already opens in Bulk layout
  (`layout-editor.ts` `mode`); the per-set zero-set state is an explicit operator override and stays
  reachable.
- **No Arrivals-card change.** "No online bookings for <date>." is true and useful with zero sets;
  it is not chrome around emptiness.
- **No date-picker change.** It still round-trips a zero-set read harmlessly, and hiding it would
  strand the operator's day selection when the layout lands.
- **No new design token, no new colour.** Every ink is one the two contrast specs already prove.

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

The slice replaces no surface, but it *branches three existing ones*, so the ledger is filled for
exactly those branches rather than waived — this is where the aria-live trap was caught.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `daily-availability` announces the new free/total count on every date change (`aria-live="polite"`) | **preserved** | only the `<p>`'s **content** branches (`@if (totalCount())`), never the element — swapping the element rebuilds the live region and announces unreliably (#717's own finding, `venue-map.html`) |
| `daily-availability` renders "<n> walk-in marked · <n> of <n> sets free on <date>" | **preserved** for `totalCount() > 0`; **changed** for `0` | a 0-of-0 count on a venue with no layout states nothing and reads as a loading artifact; the zero branch names the real state instead |
| The tile legend decodes the three tile states | **preserved** for a populated map; **changed** (not rendered) at zero sets | it decodes tiles that do not exist; parity with the tourist surface, where #701 put the legend *inside* the canvas so it drops with the grid |
| Daily view loading state ("Loading the daily view…") | **preserved** | untouched `@if (!loaded())` branch, ahead of every change here |
| Daily view load-error state (`daily-load-error`, `role="alert"`) | **preserved** | untouched `@else if (loadError())` branch |
| Daily view mark/release round-trip, optimistic flip + reconcile | **preserved** | inside the row template, which only renders when `rows()` is non-empty — unreachable at zero sets, unchanged otherwise |
| Check-in (scan/type) block + its `role="status"` outcomes | **preserved** | outside the map card entirely; a zero-set venue can still have no bookings to check in, and the copy already says so |
| `set-panel-empty` "Pick a set on the map to change its tier, pool or price…" | **preserved** whenever the venue has sets; **changed** at zero sets | `@else if (sets().length)` keeps the original branch verbatim for the case it was written for; the new `@else` covers the case it was wrong for |
| The per-set editor's one empty cell is clickable → panel switches to "Add a set" | **preserved** | untouched — the new copy *names* this affordance instead of hiding it |
| "+ Add a row" / "+ Add a position" grow the grid past the sets' bounding box | **preserved** | untouched |
| The per-set editor's selection/draft `linkedSignal` re-seed on re-read | **preserved** | untouched; the new branch reads `sets()` only |

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.
> Fill before phase 0; use the `grilling` skill if risks aren't yet visible.
> Categories that already matter in this project: concurrent reservation of the
> same set (invariant #2), Stripe webhook duplicate/out-of-order delivery (#8),
> payout double-accrual (#9), timezone/cutoff arithmetic (#4/#6), money rounding
> (#5), module boundary leaks (#11), per-venue authorization on any venue-scoped
> endpoint (an operator must only reach their own venue's data — BOLA; if the slice
> touches `/api/venues/{venueId}/**`, the payout ledger, staff bookings, or
> beach-map edit, state how ownership is verified in the application service), and
> any temptation toward JPA or Stripe Connect. A new/changed request DTO or error
> response → note the error-contract expectation (`riviera-java-conventions` §6b). A
> Flyway migration → claim `V<n>` only per the in-flight check in `riviera-sdlc`
> `references/issue-intake-gate.md` (free on `main` AND unclaimed by open PRs; name
> who renumbers).

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Branching the `aria-live` summary swaps the element instead of its content, silently killing date-change announcements on the **populated** map (the common case) | med | high | the branch is `@if` **inside** the `<p>`, never around it; AC-2 asserts the element identity (`daily-availability` present in both states) and AC-3 re-asserts the populated string | Claude | open |
| R-2 | The empty-state link needs `venueId`, which `DailyViewTab` holds **private** — exposing it as `protected` is a real (if small) API widening on a component whose venue identity drives every request | low | med | expose it `protected` only (template-visible, still not public), reusing the existing `parentVenueId(route)` signal — no second source of the id, no new route read; the link binds `['/operator', id, 'beach-map']`, the same array shape `operator-console.html` uses for the tab links | Claude | open |
| R-3 | The new `<a>` misses the 44×44 touch floor: `min-h-11` is a **no-op** on a `display: inline` anchor, and `<a>` is outside `check-touch-target.mjs`'s scope, so the guard stays green while the box is short | med | med | pair `[appTouchTarget]` with `inline-flex items-center justify-center` (the documented pairing in `shared/touch-target.ts`), and let the e2e assert the rendered box in AC-8's spec rather than the class list | Claude | open |
| R-4 | An added `<h2>` in the empty state breaks heading order or duplicates a landmark name → axe failure | low | med | the tab already renders `<h2 id="arrivals-title">` under the shell's single `<h1>`, so `<h2>` is the established level here; AC-6 runs axe over exactly this state | Claude | open |
| R-5 | New empty-state ink fails WCAG AA on the map-card glass | low | med | reuses `--riv-card-ink` (heading) + `--riv-card-ink-soft` (copy) — rows 1 and 2 of `daily-view-tab.contrast.spec.ts` — plus white on the two `--riv-cta-grad` stops, the pair `set-editor.contrast.spec.ts` and `layout-editor.contrast.spec.ts` already prove; the daily spec gains that CTA row so the surface proves its own | Claude | open |
| R-6 | Hiding the legend at zero sets regresses the populated map's legend | low | med | one `@if (totalCount())` around the existing `<ul>`, nothing inside it edited; AC-3 asserts the three legend entries on a populated map | Claude | open |
| R-7 | The plan's File-structure section drifts from the diff (CI-enforced since #533) | med | low | `node scripts/check-plan-file-structure.mjs --diff origin/main` run before every push, with the plan doc staged | Claude | open |
| R-8 | Deviating from the issue's literal AC-2 (no `canvasEmpty` on the per-set editor) is read at review as scope-dodging rather than a corrected premise | med | med | the deviation is argued from code in D-1 with the exact expressions, recorded as a comment on #718 **before** phase 0, and re-stated in the PR body; the replacement AC-4/AC-5/AC-9 cover the surface's real defect | Claude | open |
| R-9 | In-flight collision with another branch | low | low | checked at intake: the only open PRs are 18 Dependabot bumps, none touching `frontend/src/app/operator/**`; no Flyway migration in this slice, so no `V<n>` to claim | Claude | closed — intake gate |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **D-1 (drift, resolved at intake — the issue's AC-2 mechanism does not exist).** #718 asks for a
  `canvasEmpty` slot on `set-editor.html`. `BeachMapCanvas` renders that slot **only** in the
  `@else` of `@if (rows().length > 0)`. `SetEditor.rows()` is
  `Array.from({ length: this.rowCount() }, …)` with
  `rowCount = clampGrid(Math.max(1, ...sets().map(s => s.gridY)) + extraRows(), 1, MAX_ROWS)` —
  `Math.max(1)` is `1` for an empty set list, so `rows().length ≥ 1` **always**, and `colCount`
  likewise. A zero-set per-set editor therefore renders a 1×1 grid holding one clickable empty spot
  ("Row A position 1, gap or aisle"), not two banners around nothing. The slot would be dead
  template. — *Owner:* Claude · *Resolves by:* phase 0 (recorded on #718 before any code)
- **D-2 (drift, resolved at intake — "the Beach map tab" is the surface itself).** The issue's copy
  direction, "point at the Beach map tab's layout generator", is right for the Daily view (a
  different tab) and wrong for the per-set editor: `SetEditor` is rendered *by* `LayoutEditor`, as
  the Beach map tab's **Edit sets** mode, with the bulk generator one toggle away in the same tab
  (`layout-editor.html` `layout-mode-bulk`). The per-set copy therefore names **Bulk layout**, not
  the tab. — *Owner:* Claude · *Resolves by:* phase 1
- **D-3 (drift, minor — reachability is narrower than the issue states).** "Both tabs are
  deep-linkable" holds for the *tabs*; the per-set editor's mode is not a route param, and a
  zero-set venue's Beach map tab **defaults to Bulk layout**
  (`mode = chosenMode() ?? (loadedSets().length > 0 ? 'sets' : 'bulk')`), which already explains
  itself via `layout-empty`. So the zero-set per-set state is reached only by an explicit "Edit
  sets" click. It stays worth fixing (the copy is actively false there), but it is not the
  every-new-venue landing state the issue describes — the Daily view is. — *Owner:* Claude ·
  *Resolves by:* phase 1
- **Assumption:** widening AC-1 slightly — hiding the tile legend and branching the availability
  summary, neither named in the issue — is in scope, because both are the same "chrome around
  emptiness" defect inside the same viewport, and #717 branched the tourist summary for exactly
  this reason in exactly this way. Held minimal: one `@if` each, no element moved. — *Owner:*
  Claude · *Resolves by:* phase 0 (raise at the review gate if the maintainer wants the diff
  narrower)

### Resolved

- **D-1, D-2, D-3 — held.** Recorded as a comment on #718 before phase 0; the ACs above replace the
  issue's AC-2 with AC-4/AC-5/AC-9 and keep the issue's intent (explain the state, point at the
  generator) on the surface's real defect.

## Availability & concurrency (invariant #2)

> **Mandatory if the feature touches `booking`, `availability`, or the beach map.**
> Otherwise write `N/A — does not affect availability` and say why. This is the
> highest-stakes section in the plan.

The slice touches beach-map **surfaces**, so this section is filled rather than waived — and the
substantive statement is that it adds no write path and reads no availability state that it did not
already read.

- **Write paths to `availability(set_id, booking_date)`:** **none added or changed.** Both changed
  surfaces render a message; neither issues a request. The Daily view's existing tap-to-mark
  (`POST`) and release (`DELETE`) live inside the tile-row template, which the canvas renders only
  when `rows()` is non-empty — i.e. exactly the state this slice does **not** touch. At zero sets
  there is no tile, therefore no writer.
- **Uniqueness guarantee:** unchanged — `availability(set_id, booking_date)`'s unique constraint,
  owned by the `availability` module. Nothing here reaches it.
- **Concurrency strategy:** N/A — no transaction, no claim.
- **Pool rule (invariant #3):** unchanged; a set-less venue has neither pool.
- **Cutoff rule (invariant #4):** unchanged; the Daily view is a staff surface with no sales path,
  and the empty state deliberately carries **no date** — the set count comes from the venue's static
  layout (`set_position`), so no other day reads differently.
- **Pinning test:** N/A — no reservation path in scope. The zero-set render is pinned by AC-1/AC-2.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` is in scope; no module, port or event is added,
moved or changed.

### Module ownership (§4a)

`N/A — frontend-only; no backend capability added or moved.` The frontend-side equivalent —
which folder each change belongs to — is `riviera-frontend`'s call and is answered in the Angular
section: both edits stay inside the `operator/` feature folder, which already owns both components.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, formatted or moved; the empty states name no price.

## Angular — frontend surfaces touched

> **Mandatory if frontend is in scope. Backend-only: `N/A — backend-only`.** Load
> `angular-developer`.

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/daily-view-tab.html` | existing | template of a standalone component | reads `totalCount()` / `rows()` (existing `computed`s) + `venueId()` (existing `parentVenueId` signal, widened `private` → `protected`) | none |
| FE-2 | `operator/daily-view-tab.ts` | existing | standalone component | one visibility change (`venueId`) + `RouterLink` added to `imports` | none |
| FE-3 | `operator/set-editor.html` | existing | template of a standalone component | reads the existing required input `sets()` | none |

**Standards:** standalone components, `inject()`, `@if`/`@else if`, `input()`/`output()` signal
APIs, `NgOptimizedImage` for new images (none here). Navigation is declarative `routerLink` with the
array form `['/operator', id, 'beach-map']`, matching `operator-console.html`'s tab links rather
than a programmatic `router.navigate` — a link is the correct element for "go to that tab", and it
gets middle-click/open-in-new-tab for free. No deviation to document.

**Styling (`riviera-tailwind`):** utilities only; no `.scss` is created, and neither component
carries legacy SCSS, so the migrate-on-touch rule has nothing to migrate. The CTA link reuses
`bg-(image:--riv-cta-grad)` (a **gradient**, hence `image:`) with white ink and
`[appTouchTarget] inline-flex items-center justify-center` per the inline-anchor trap.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or query parameter is added or altered; the slice
renders states that today's `GET /api/venues/{id}` response already produces (`sets: []`).

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation. After a compaction, in a fresh
> session, or whenever unsure: re-read it (plus the current stage's `riviera-sdlc`
> reference file) before acting. Update it in the SAME commit window as the change it
> records — the same commit or the immediately-following one, nothing unrelated between;
> covers every plan-doc update incl. *Skills consulted* — at every phase boundary and
> SDLC stage transition (why: `riviera-sdlc` §Context hygiene).
>
> **Finalize BEFORE the merge, in the PR's own last commit** — stage pointer DONE, phase
> rows ✅ with commits, Open Questions empty, risk rows closed, AC pin-names matching the
> shipped tests. Record **`merged via PR #NN`, never a merge SHA** — the SHA guarantees a
> second docs-only PR (case history + details: `riviera-sdlc` `references/pr-gates.md`
> §3 step 4).

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** phase 0 — write the failing `DailyViewTab` zero-set specs, then branch
`daily-view-tab.html`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Daily view zero-set state (unit + a11y + contrast) | | |
| 1 — Per-set editor no-sets panel copy (unit + a11y) | | |
| 2 — Mocked Playwright e2e, both surfaces | | |
| 3 — Close-out (gates, docs freshness, final plan state) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

> Map files to be created/modified before defining tasks.
>
> **Every path in the diff, including the one-line ones — and this is machine-checked.** Listing
> only the interesting files was a review finding on five consecutive slices (#438, #522, #524,
> #525, #526), and the paths that fall out are always the same shape: a registry entry, a
> comment-only freshness fix, a docs-sweep file. Since #533 CI fails the PR on any path the diff
> changed and this section does not list. Run it yourself before pushing — it is the check, not a
> reminder to do the check by hand:
>
> ```bash
> node scripts/check-plan-file-structure.mjs --diff origin/main
> ```
>
> Since #654 it judges untracked paths as well as the diff, so a file you have written but not
> staged is caught too. **Stage or commit this plan doc first** — `git add` is what marks it as part
> of the change, and with the doc merely written the guard short-circuits and passes whatever the
> section says. A file you never intend to commit belongs behind an ignore rule (`.git/info/exclude`
> for a personal scratch path, `.gitignore` repo-wide).
>
> The guard reads paths written any way real plans write them — repo-relative
> (`payout/application/DailyTakingsServiceTest.java`), sibling extensions
> (`` `privacy-policy.ts` `` then `` `.html` ``), brace sets, `a.ts|.html`, a bare directory, and
> globs (`frontend/src/app/**/*.contrast.spec.ts`) — so a large mechanical sweep is one honest
> entry rather than fifty. It never flags the reverse (a path you listed and did not need), and it
> exempts the plan doc itself and lockfiles. A slice with no plan doc is not checked at all.

- `docs/plans/operator-map-empty-state.md` — this plan (exempt from the guard, listed for the reader)
- `frontend/src/app/operator/daily-view-tab.html` — the `canvasEmpty` slot, the branched
  availability summary, the legend gate
- `frontend/src/app/operator/daily-view-tab.ts` — `venueId` widened to `protected`; `RouterLink`
  imported
- `frontend/src/app/operator/daily-view-tab.spec.ts` — AC-1, AC-2, AC-3
- `frontend/src/app/operator/daily-view-tab.a11y.spec.ts` — AC-6
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — the CTA-gradient row (R-5)
- `frontend/src/app/operator/set-editor.html` — the no-sets panel branch
- `frontend/src/app/operator/set-editor.spec.ts` — AC-4, AC-5
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — AC-7 (a case added; no template change)
- `frontend/e2e/operator-daily.e2e.ts` — AC-8
- `frontend/e2e/operator-set-editing.e2e.ts` — AC-9

---

## Phase 0 — Daily view zero-set state

**Files:** Modify `frontend/src/app/operator/daily-view-tab.html` ·
`frontend/src/app/operator/daily-view-tab.ts` · Test
`frontend/src/app/operator/daily-view-tab.spec.ts`,
`frontend/src/app/operator/daily-view-tab.a11y.spec.ts`,
`frontend/src/app/operator/daily-view-tab.contrast.spec.ts`

- [ ] **Step 1: Write the failing tests** — three in `daily-view-tab.spec.ts` (AC-1/2/3), one in
      `daily-view-tab.a11y.spec.ts` (AC-6), one row in `daily-view-tab.contrast.spec.ts` (R-5), each
      rendering `render([], [], [])` for the zero-set case.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- daily-view-tab` → FAIL
      (`daily-map-empty` is null).
- [ ] **Step 3: Minimal implementation** — the `canvasEmpty` slot + the summary `@if` + the legend
      `@if` in `daily-view-tab.html`; `protected readonly venueId` + `RouterLink` in the `.ts`.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- daily-view-tab` → PASS, then the
      operator folder's map-adjacent specs as the end-of-phase regression.
- [ ] **Step 5: Generalization-audit pass** — population: *every surface projecting a tile grid into
      `BeachMapCanvas`*, re-enumerated after this phase.
- [ ] **Step 6: Commit** — `git commit -m "Explain a zero-set operator Daily view instead of framing empty space (#718)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window; open the **draft PR**
      immediately after this first phase commit (CI fires on the `pull_request` event only).

---

## Phase 1 — Per-set editor no-sets panel copy

**Files:** Modify `frontend/src/app/operator/set-editor.html` · Test
`frontend/src/app/operator/set-editor.spec.ts`, `frontend/src/app/operator/layout-editor.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-4 (`render([])`: `set-panel-no-sets` present, the one
      cell clicks into "Add a set"), AC-5 (`render()`: the original copy survives), AC-7 (axe in
      Edit-sets mode with no sets).
- [ ] **Step 2: Run them, verify they fail** — `npm test -- set-editor` → FAIL.
- [ ] **Step 3: Minimal implementation** — `@else if (sets().length)` keeps the original `<p>`; the
      new `@else` carries the no-sets copy naming **Bulk layout**.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- set-editor layout-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every "pick / select an X" empty-state
      copy that presupposes an X exists*, enumerated across the operator console.
- [ ] **Step 6: Commit** — `git commit -m "Point a set-less venue's per-set editor at the bulk generator (#718)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Mocked Playwright e2e

**Files:** Modify `frontend/e2e/operator-daily.e2e.ts`, `frontend/e2e/operator-set-editing.e2e.ts`

- [ ] **Step 1: Write the failing specs** — AC-8 and AC-9, each re-registering the venue read with
      `sets: []` **after** the existing mock helper (Playwright resolves the most recently added
      route first), then asserting the message, the navigation and `expectNoSeriousAxeViolations`.
- [ ] **Step 2: Run them, verify they fail on `main`'s templates** — `npm run test:e2e:a11y -- operator-daily` → FAIL.
- [ ] **Step 3:** no implementation — phases 0/1 already shipped it; this phase proves it in a real browser.
- [ ] **Step 4: Run them, verify they pass** — `npm run test:e2e:a11y -- operator-daily operator-set-editing` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every mocked e2e that serves a `sets: []`
      venue into an operator surface*, enumerated escaping-tolerantly (#717's audit learned this the
      hard way).
- [ ] **Step 6: Commit** — `git commit -m "Cover both zero-set operator beach-map surfaces in the mocked e2e suite (#718)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Close-out

- [ ] **Step 1:** mark the PR ready for review; run the **Review gate** per `pr-gates.md` §1.
- [ ] **Step 2:** run the **Sonar gate** per §2 — pull the new-issue + duplication list, not just the badge.
- [ ] **Step 3:** run `riviera-docs-freshness` over the slice's range; patch or record.
- [ ] **Step 4:** finalize this Execution status (stage DONE, phases ✅, risks closed, `merged via PR #NN`).
- [ ] **Step 5:** merge + close-out checklist per §3.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-20 | plan (intake grill) | **Mechanism:** every surface that projects a tile grid into `BeachMapCanvas` and therefore *could* render its `canvasEmpty` slot — then, per surface, whether its `rows()` can actually empty (the property the slot depends on), which is the step #717's audit did not need and #718 assumed | `grep -rl "app-beach-map-canvas" frontend/src/app --include=*.html` → 4; then read each surface's `rows()` computation | 4 project a grid; `venue-map` + `layout-editor` already fill the slot; `daily-view-tab`'s `rows()` **can** empty (`groupSetsByRow(sets)`); `set-editor`'s **cannot** (`Math.max(1, …)` clamped ≥ 1×1) | **Split, not uniform.** The slot goes to `daily-view-tab` only; `set-editor` gets its real zero-set defect fixed in the panel. Recorded as D-1 and on issue #718 |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1 / AC-2 / AC-3:** `npm test -- daily-view-tab` → 3 new specs pass. Verified at `<sha>`.
- [ ] **AC-4 / AC-5:** `npm test -- set-editor` → 2 new specs pass. Verified at `<sha>`.
- [ ] **AC-6:** `npm test -- daily-view-tab.a11y` → axe clean on the zero-set render. Verified at `<sha>`.
- [ ] **AC-7:** `npm test -- layout-editor.a11y` → axe clean in Edit-sets mode with no sets. Verified at `<sha>`.
- [ ] **AC-8 / AC-9:** `npm run test:e2e:a11y -- operator-daily operator-set-editing` → pass. Verified at `<sha>`.
- [ ] **AC-10:** `git diff --stat origin/main` lists no path under `frontend/src/app/venue/`,
      `frontend/src/app/shared/`, and no `layout-editor.html`. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

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
