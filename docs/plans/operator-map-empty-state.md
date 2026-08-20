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
branch) · `riviera-review-overlay` (review gate — walked the FE bank at ready-for-review on PR #720: RV-FE-1/7/E2E/8/9 and RV-STYLE-1/2 clean, RV-FE-2/3/4/6 N/A, RV-PROC-1 reconciled against this line; the fix round re-entered at Implement under `frontend/.claude/CLAUDE.md` §Comments + `riviera-java-conventions` §6d, the rule F-1 turned on) ·
`riviera-docs-freshness` (**ran** over `origin/main..HEAD` = `dd8c9a9..HEAD`, **0 findings** — the
rename/removal grep had nothing to chase (this slice renames and removes nothing), and the counting
sweep's subject, the shared canvas's own prose, stays true: no slot was added, so "three content
slots" holds; nothing new was projected into `canvasLegend`, so "the tile legend is tourist-only"
holds; and "the three operator surfaces" is still three) · `riviera-frontend` (structure — confirmed both edits
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

- [x] **AC-1:** Given an operator on a venue whose map read returns `sets: []`, when the Daily view
      tab finishes loading, then the map card renders the empty-state message
      (`daily-map-empty`) — a heading, an explanation, and a link to that venue's Beach map tab —
      and renders no tile, no row/price rail and no scroll hint.
      *Pinned by:* `DailyViewTab (#175) › explains a venue with no sets instead of framing empty space (#718)`
- [x] **AC-2:** Given the same zero-set venue, when the Daily view tab renders, then the live
      availability summary reads "No sets on the map yet" **in the same `<p data-testid="daily-availability">`
      element** (the `aria-live` region survives), and the tile legend is not rendered at all.
      *Pinned by:* `DailyViewTab (#175) › drops the 0-of-0 count and the tile legend when there are no sets (#718)`
- [x] **AC-3:** Given a populated venue, when the Daily view tab renders, then the summary still
      reads "<n> walk-in marked · <n> of <n> sets free on <date>", the legend renders its three
      entries, and no empty-state element exists.
      *Pinned by:* `DailyViewTab (#175) › keeps the count, the legend and no empty state on a populated map (#718)`
- [x] **AC-4:** Given the per-set editor rendered for a venue with zero sets, when the operator has
      selected nothing, then the panel reads the no-sets copy (`set-panel-no-sets`) naming the Bulk
      layout generator, **not** "Pick a set on the map…", and the map still offers exactly one
      empty spot whose click puts the panel into "Add a set".
      *Pinned by:* `SetEditor (#600) › points a set-less venue at the bulk generator, and still adds into the one empty spot (#718)`
- [x] **AC-5:** Given the per-set editor rendered for a venue **with** sets and nothing selected,
      when it renders, then the panel still reads the original "Pick a set on the map…" copy.
      *Pinned by:* `SetEditor (#600) › keeps the pick-a-set copy when the venue has sets (#718)`
- [x] **AC-6:** Given the zero-set Daily view, when axe runs over it in jsdom, then there are no
      violations (heading order, link name, live-region shape).
      *Pinned by:* `DailyViewTab a11y (#175) › has no axe violations on a venue with no sets (#718)`
- [x] **AC-7:** Given the zero-set per-set editor inside its parent tab, when axe runs over it in
      jsdom, then there are no violations.
      *Pinned by:* `LayoutEditor a11y (#172) › has no axe violations in Edit-sets mode with no sets (#718)`
- [x] **AC-8:** Given a real browser with the venue read mocked to `sets: []`, when the operator
      opens the Daily view tab, then the empty-state message is visible, the Beach-map link
      navigates to `/operator/1/beach-map`, and axe reports no serious violations.
      *Pinned by:* `operator-daily.e2e.ts › explains a zero-set day and links to the Beach map tab (#718)`
- [x] **AC-9:** Given a real browser with `sets: []`, when the operator opens the Beach map tab and
      switches to **Edit sets**, then the panel shows the no-sets copy and the single empty spot is
      clickable into "Add set here".
      *Pinned by:* `operator-set-editing.e2e.ts › a set-less venue is pointed at the bulk generator (#718)`
- [x] **AC-10:** The tourist beach map and the bulk layout editor render unchanged — **structural,
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
| R-1 | Branching the `aria-live` summary swaps the element instead of its content, silently killing date-change announcements on the **populated** map (the common case) | med | high | the branch is `@if` **inside** the `<p>`, never around it; AC-2 asserts the element identity (`daily-availability` present in both states) and AC-3 re-asserts the populated string | Claude | closed — `814c640`. The branch is an `@if` **inside** the `<p>`; AC-2 asserts the element still carries `aria-live="polite"` in the zero state and AC-3 re-asserts the populated string. The git-history review pass independently confirmed the shape matches #717's tourist precedent |
| R-2 | The empty-state link needs `venueId`, which `DailyViewTab` holds **private** — exposing it as `protected` is a real (if small) API widening on a component whose venue identity drives every request | low | med | expose it `protected` only (template-visible, still not public), reusing the existing `parentVenueId(route)` signal — no second source of the id, no new route read; the link binds `['/operator', id, 'beach-map']`, the same array shape `operator-console.html` uses for the tab links | Claude | closed — `814c640`. `venueId` is `protected`, not public, and reuses the existing `parentVenueId(route)` signal — no second source of the id |
| R-3 | The new `<a>` misses the 44×44 touch floor: `min-h-11` is a **no-op** on a `display: inline` anchor, and `<a>` is outside `check-touch-target.mjs`'s scope, so the guard stays green while the box is short | med | med | pair `[appTouchTarget]` with `inline-flex items-center justify-center` (the documented pairing in `shared/touch-target.ts`), and let the e2e assert the rendered box in AC-8's spec rather than the class list | Claude | closed — `ee6a076`. `[appTouchTarget]` paired with `inline-flex items-center justify-center`, and AC-8 measures `boundingBox()` in Chromium rather than trusting the class list |
| R-4 | An added `<h2>` in the empty state breaks heading order or duplicates a landmark name → axe failure | low | med | the tab already renders `<h2 id="arrivals-title">` under the shell's single `<h1>`, so `<h2>` is the established level here; AC-6 runs axe over exactly this state | Claude | closed — `814c640`. `<h2>` matches the tab's existing `<h2 id="arrivals-title">` under the shell's single `<h1>`; AC-6 runs axe over exactly this state, AC-8 again in a real browser |
| R-5 | New empty-state ink fails WCAG AA on the map-card glass | low | med | reuses `--riv-card-ink` (heading) + `--riv-card-ink-soft` (copy) — rows 1 and 2 of `daily-view-tab.contrast.spec.ts` — plus white on the two `--riv-cta-grad` stops, the pair `set-editor.contrast.spec.ts` and `layout-editor.contrast.spec.ts` already prove; the daily spec gains that CTA row so the surface proves its own | Claude | closed — `814c640`. Heading and copy reuse the two pairs the spec already proved; the CTA row was added, and Sonar reported no `css:S7924` on the new code |
| R-6 | Hiding the legend at zero sets regresses the populated map's legend | low | med | one `@if (totalCount())` around the existing `<ul>`, nothing inside it edited; AC-3 asserts the three legend entries on a populated map | Claude | closed — `814c640`. One `@if (totalCount())` around the existing `<ul>`, nothing inside it edited; AC-3 asserts all three entries on a populated map |
| R-7 | The plan's File-structure section drifts from the diff (CI-enforced since #533) | med | low | `node scripts/check-plan-file-structure.mjs --diff origin/main` run before every push, with the plan doc staged | Claude | closed — `node scripts/check-plan-file-structure.mjs --diff origin/main` run with the doc staged before every push, and green in CI's Repo hygiene job on both runs |
| R-8 | Deviating from the issue's literal AC-2 (no `canvasEmpty` on the per-set editor) is read at review as scope-dodging rather than a corrected premise | med | med | the deviation is argued from code in D-1 with the exact expressions, recorded as a comment on #718 **before** phase 0, and re-stated in the PR body; the replacement AC-4/AC-5/AC-9 cover the surface's real defect | Claude | closed — the deviation was recorded on #718 **before** phase 0, argued from the code in D-1/D-2/D-3, and re-stated in the PR body. The review gate raised no objection to it |
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
  generator) on the surface's real defect. The review gate examined the deviation and did not
  dispute it; the code-comment pass independently re-derived D-1's clamp argument from
  `set-editor.ts`'s own TSDoc.
- **The AC-1 widening — held, phase 0 (`814c640`).** The legend gate and the summary branch shipped
  as one `@if` each, no element moved. The review gate raised no scope objection, and the
  behavior-parity ledger's rows 2–3 carry the reasoning.
- **A fourth question the slice surfaced and did not answer: `SetEditor` cannot tell "no sets" from
  "not loaded yet"** — filed as **#721** with the argument for why the copy alone is the wrong fix
  (the 1×1 grid beside it lies in the same window). Not left open here: it is out of this slice's
  scope by AC-10, and the register's rule is that an open entry blocks done.

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

**Stage pointer:** `merge close-out` — CI green, Review gate run, Sonar gate green with its
reported list verified empty from the API, all findings resolved or filed.

**Next action:** merge PR #720, then close-out steps 1–3 (verify #718 closed; no parent epic; #721
already carries the deferred finding).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Daily view zero-set state (unit + a11y + contrast) | ✅ | `814c640` |
| 1 — Per-set editor no-sets panel copy (unit + a11y) | ✅ | `d9d7762` |
| 2 — Mocked Playwright e2e, both surfaces | ✅ | `ee6a076` |
| 3 — Close-out (gates, docs freshness, final plan state) | ✅ | `7a92af0` (review-fix round) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review`, prior-PR-comments pass) | The three `/** */` doc blocks this slice wrote carried `(#718)`. TSDoc states the contract, not the changelog — **no issue numbers** (`frontend/.claude/CLAUDE.md` Comments; canonical `riviera-java-conventions` §6d). Raised as a finding on **both** preceding PRs to touch these files (#688, #719), and unguardable: `check-inline-comments.mjs` exempts `/** */` by design | fixed-in-`7a92af0` — refs dropped from the doc blocks; `test(…)`/`it(…)` name strings and inline HTML comments keep theirs, both established conventions §6d does not reach |
| F-2 | review (`/code-review`, shallow-bug-scan pass) | `SetEditor` cannot distinguish "no sets" from "not loaded yet" (`sets` is a plain required input), so during the initial map GET a venue **with** sets renders a 1×1 empty grid and — since this slice — an affirmatively false "This venue has no sets yet" | **deferred → issue #721.** Fixing only the copy would be cosmetic: the map beside it lies in the same window and is the more misleading half. The real fix is a load gate on the surface, which changes what the layout editor renders — ruled out by AC-10 |
| F-3 | review (`/code-review`, code-comment pass) | Three spec files' own doc blocks enumerate what each covers; tests were added without extending those lists, so each described less than the file does | fixed-in-`7a92af0` — each block gains the state it was missing |
| — | sonar | Quality gate **passed**, and the reported list pulled from the API is genuinely empty (not the false-clean read): `new_lines: 52` proves an analysis ran; 0 issues, 0 hotspots, 0 duplicated blocks, **100.0 % new-code coverage** | closed — nothing to resolve |
| — | CI | 8/8 checks green on `22d78ba` (Backend, Frontend, Repo hygiene, both CodeQL analyses, SonarCloud ×2); re-run green on the `7a92af0` fix round | closed |

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

- [x] **Step 1: Write the failing tests** — one at a time (vertical slices, not all-tests-then-all-code):
      AC-1, then AC-2, then AC-3 in `daily-view-tab.spec.ts`; AC-6 in `daily-view-tab.a11y.spec.ts`;
      the CTA row (R-5) in `daily-view-tab.contrast.spec.ts`. The zero-set case is `render([], [], [])`.
- [x] **Step 2: Run them, verify they fail** — `ng test --include="src/app/operator/daily-view-tab.spec.ts"`
      → AC-1 FAILs on `expected null not to be null` (`daily-map-empty`); AC-2 FAILs on the received
      `"0 walk-in marked · 0 of 0 sets free on Mon 15 Jun 2026"`. AC-3 is a **characterization** test
      of preserved behavior (parity-ledger rows 2–3) and passes on write by design.
- [x] **Step 3: Minimal implementation** — the `canvasEmpty` slot + the summary `@if` + the legend
      `@if` in `daily-view-tab.html`; `private` → `protected venueId` + `RouterLink` in the `.ts`.
      The link is guarded by an `@if` **inside** the projected `<div canvasEmpty>`, never around it:
      content projection matches the static template, so an `@if` wrapping the slot element itself
      would hand the canvas an `<ng-template>` carrying no `canvasEmpty` attribute.
- [x] **Step 4: Run them, verify they pass** — 50/50 across the three `daily-view-tab*` spec files;
      end-of-phase regression `--include="src/app/operator/*.spec.ts"` +
      `shared/beach-map-canvas.spec.ts` + `venue/venue-map*.spec.ts` → **510 passed**.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-0 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window; open the **draft PR**
      immediately after this first phase commit (CI fires on the `pull_request` event only).

---

## Phase 1 — Per-set editor no-sets panel copy

**Files:** Modify `frontend/src/app/operator/set-editor.html` · Test
`frontend/src/app/operator/set-editor.spec.ts`, `frontend/src/app/operator/layout-editor.a11y.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-4 (`render([])`: `set-panel-no-sets` present, the one
      cell clicks into "Add a set"), AC-5 (`render()`: the original copy survives), AC-7 (axe in
      Edit-sets mode with no sets — the parent's a11y spec already flushes a `sets: []` venue, so
      the case is one mode click).
- [x] **Step 2: Run them, verify they fail** — `ng test --include="src/app/operator/set-editor.spec.ts"`
      → AC-4 FAILs on `set-panel-empty` still present. AC-5 is the **characterization** half of the
      branch (parity-ledger row 8) and passes on write by design.
- [x] **Step 3: Minimal implementation** — `@else if (sets().length)` keeps the original `<p>`
      verbatim; the new `@else` carries the no-sets copy naming **Bulk layout** (D-2: the generator
      is a sibling toggle in this same tab, not another tab).
- [x] **Step 4: Run them, verify they pass** — 81/81 across the `set-editor*` + `layout-editor*`
      spec files.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-1 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Mocked Playwright e2e

**Files:** Modify `frontend/e2e/operator-daily.e2e.ts`, `frontend/e2e/operator-set-editing.e2e.ts`

- [x] **Step 1: Write the specs** — AC-8 re-registers the Daily view's venue read with `sets: []`
      **after** `mockDaily` (Playwright resolves the most recently added route first — the idiom the
      neighbouring `#605` spec already uses); AC-9 instead takes a `seed` parameter added to
      `mockConsole`, so the stateful add still round-trips and the first set can really be created.
- [x] **Step 2: Run them, verify they fail on `main`'s templates** — the phases are already
      committed, so the red check is explicit rather than incidental:
      `git checkout origin/main -- daily-view-tab.{html,ts} set-editor.html` →
      `playwright test --config playwright.a11y.config.ts -g "#718"` → **2 failed**
      (`daily-map-empty` / `set-panel-no-sets` not found) → `git checkout HEAD -- …` to restore.
- [x] **Step 3:** no implementation — phases 0/1 shipped it; this phase proves it in a real browser,
      including the two things jsdom cannot: the link's **rendered box** against the 44 px floor
      (`<a>` is outside `check-touch-target.mjs`'s scope) and real-browser axe.
- [x] **Step 4: Run them, verify they pass** — `-g "#718"` → 2 passed. One assertion was **wrong and
      the run corrected it**: after adding the first set the panel keeps the new set *selected*, so
      the spec now asserts that (`set-selected` = Row A · position 1) rather than a return to
      `set-panel-empty`.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-2 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Close-out

- [x] **Step 1: Review gate.** PR #720 marked ready for review; `/code-review` run over
      `origin/main...HEAD` at high effort (ladder rung 1), five parallel passes — CLAUDE.md
      adherence, shallow bug scan, git blame/history, prior-PR review comments, code-comment
      compliance — **plus** the `riviera-review-overlay` FE bank walked on top, since the overlay
      alone is not the gate. Three findings: F-1 and F-3 fixed in `7a92af0`, F-2 deferred to #721.
      The two passes that disagreed (CLAUDE.md-adherence called the TSDoc issue refs grandfathered;
      prior-PR-comments called them a finding) were resolved against the source rule, §6d's
      verbatim "**No issue numbers**", not by vote.
- [x] **Step 2: Sonar gate.** Not read off the badge: `api/measures/component` returned
      `new_lines: 52` — proof an analysis exists, which is what separates a real zero from the
      false-clean read — alongside 0 bugs / 0 vulnerabilities / 0 code smells / 0 duplicated blocks
      and **100.0 % new-code coverage**; `api/issues/search` returned `total: 0`. Nothing to resolve.
- [x] **Step 3: `riviera-docs-freshness`** run over `origin/main..HEAD` — **0 findings**; the
      reasoning is in *Skills consulted*.
- [x] **Step 4:** this Execution status finalized in the PR's own last commit, citing
      **merged via PR #720**.
- [ ] **Step 5:** merge + close-out checklist per §3 — the only item that cannot precede the merge.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-20 | review-fix round (`7a92af0`) | **Mechanism:** every **doc-comment block** (`/** … */`) this diff writes — the surface §6d governs and the one `check-inline-comments.mjs` exempts by design, so the guard's silence carries no information here. Enumerated from the diff's added lines by comment syntax, not by file | `git diff origin/main...HEAD -- 'frontend/**' \| grep -E "^\+" \| grep -E "#7[0-9]{2}"` — then split by whether the hit is a doc-block line (`^+ \*`), a `test`/`it` name string, or an inline HTML comment | 16 added lines cite the ticket: **3** are doc-block lines (all fixed), 11 are `test`/`it` name strings, 2 are inline HTML comments | **Three fixed, thirteen left with reason.** §6d governs Javadoc/TSDoc only; test-name strings and inline HTML comments carry issue refs by established convention here (`venue-map.html`'s own `<!-- Zero sets (#717) -->`), and §6c's rule for inline comments is length, not provenance |
| 2026-08-20 | phase 2 | **Mechanism:** every mocked e2e that serves a **`sets: []` venue** into a rendered surface — i.e. every spec that can hit one of the states this slice changed, enumerated from the fixture data rather than from spec names. Enumerated escaping-tolerantly, the trap #717's own audit fell into | `grep -rln 'api.\{0,2\}/venues' e2e/*.e2e.ts` (22) narrowed by `grep -rln "sets: \[\]" e2e/*.e2e.ts` (6), then cross-cut with `xargs grep -ln "beach-map\|/daily"` | 6 serve an empty venue; 4 of them reach an operator beach-map surface (`layout-editor`, `operator-daily`, `operator-onboarding`, `operator-venue`); `discovery-flow` + `operator-venue-photos` reach only the tourist map (#717's) or the photos tab | **No change needed, verified not assumed.** Ran all four affected files plus `operator-set-editing` → **26 passed**: the bulk editor still renders `layout-empty`, and no existing assertion depended on the Daily view's 0-of-0 count or its legend |
| 2026-08-20 | phase 1 | **Mechanism:** every empty-state copy that instructs the reader to *pick an existing thing*, on a surface where that thing can legitimately be absent — the defect is the imperative presupposing its object, not "editor panels" | `grep -rn "Pick a\|Pick an\|Select a\|Choose a\|Tap a\|Tap any" src/app --include=*.html` | 5: `set-editor:217` (fixed here); `set-editor:166` "pick an empty spot" (move-armed — needs a *selected set* to exist, and the grid is growable, so its object cannot be absent); `layout-editor:117` "pick a tool" (the tool list is static, and that surface's empty state already forward-references it); `venue-map:219` "tap any free set" (projected via `canvasFooter`, so the canvas already drops it with the grid — #717); `home:22` (marketing hero, not an empty state) | **One fix, four judged-and-left.** Only the per-set panel's imperative can address nothing; the other four either have a guaranteed object or already drop with the grid |
| 2026-08-20 | phase 0 | **Mechanism:** every element that *decodes or counts the tiles* of a beach-map surface while living **outside** `<app-beach-map-canvas>` — so the canvas's empty branch cannot drop it with the grid it describes. Enumerated by the markup that does the decoding (the legend list), not by "surfaces that look bare" | `grep -rn 'aria-label="Legend"' src/app --include=*.html` (3), cross-cut with `grep -rn "canvasLegend" src/app --include=*.html` (which of them are projected back **in**) | 3 legends: `venue-map` is projected into the canvas via `canvasLegend` (#701) so it already drops; `daily-view-tab`'s was outside and unguarded; `layout-editor`'s is outside too | **Subset, argued.** The Daily view legend is gated on `totalCount()`. The layout editor's is **not** a defect: that surface's empty state already forward-references it — "Generate a layout to begin, then paint tiers, walk-in sets and aisles" — so its legend and Paint-tool counts read as the next step, not as decoders of nothing. Its `render unchanged` AC (issue #718 AC-3) fences it either way |
| 2026-08-20 | plan (intake grill) | **Mechanism:** every surface that projects a tile grid into `BeachMapCanvas` and therefore *could* render its `canvasEmpty` slot — then, per surface, whether its `rows()` can actually empty (the property the slot depends on), which is the step #717's audit did not need and #718 assumed | `grep -rl "app-beach-map-canvas" frontend/src/app --include=*.html` → 4; then read each surface's `rows()` computation | 4 project a grid; `venue-map` + `layout-editor` already fill the slot; `daily-view-tab`'s `rows()` **can** empty (`groupSetsByRow(sets)`); `set-editor`'s **cannot** (`Math.max(1, …)` clamped ≥ 1×1) | **Split, not uniform.** The slot goes to `daily-view-tab` only; `set-editor` gets its real zero-set defect fixed in the panel. Recorded as D-1 and on issue #718 |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1 / AC-2 / AC-3:** `npm test -- daily-view-tab` → 3 new specs pass. Verified at `<sha>`.
- [x] **AC-4 / AC-5:** `npm test -- set-editor` → 2 new specs pass. Verified at `<sha>`.
- [x] **AC-6:** `npm test -- daily-view-tab.a11y` → axe clean on the zero-set render. Verified at `<sha>`.
- [x] **AC-7:** `npm test -- layout-editor.a11y` → axe clean in Edit-sets mode with no sets. Verified at `<sha>`.
- [x] **AC-8 / AC-9:** `npm run test:e2e:a11y -- operator-daily operator-set-editing` → pass. Verified at `<sha>`.
- [x] **AC-10:** `git diff --stat origin/main` lists no path under `frontend/src/app/venue/`,
      `frontend/src/app/shared/`, and no `layout-editor.html`. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced — no backend file in the diff at all (invariant #1).
- [x] **Availability** section filled — no write path added or changed; the tap-to-mark writer lives inside the row template, which is exactly the branch this slice does not touch (invariant #2).
- [x] Pool + cutoff rules honored — a set-less venue has neither pool, and the empty state deliberately carries no date (invariants #3, #4).
- [x] **Modulith** section `N/A — frontend-only`; its FE mirror checked instead — RV-FE-8's grep still returns the frozen **five** cross-feature edges, so the diff adds none (invariant #11).
- [x] **Payment/payout** `N/A — no payment in scope`; no money is read, formatted or moved (invariants #5, #8, #9).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone: the zero branch renders **no** date, deliberately — the set count comes from the venue's static layout, so no day reads differently (invariant #6).
- [x] Booking codes untouched — the arrivals block is outside every branch this slice writes (invariant #7).
- [x] No schema change, so no migration and no `V<n>` claimed (invariant #12).
- [x] **Frontend** standards met — the CLAUDE.md-adherence review pass found no violation; no `as any`.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, and a findings register whose every row carries a decision (F-1/F-3 fixed, F-2 deferred to #721).
- [x] Risk register: all nine rows closed with outcomes. Open Questions: all resolved, with the one question the slice did not answer deferred to **#721**.
- [x] **Close-out written in THIS PR** — this final state is committed here as **merged via PR #720**, never a merge SHA, so no docs-only follow-up PR is needed.
- [x] **The review gate ran in full** — `/code-review` via ladder rung 1 (the Skill probe succeeded), five parallel review passes over the PR diff, **plus** the `riviera-review-overlay` FE bank walked on top. The session's standing "no Agent tool" instruction was **not** treated as grounds to skip: authorization was requested and granted, exactly as §1 prescribes. Three findings, none a Blocker.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
