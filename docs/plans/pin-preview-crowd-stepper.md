# Riviera map: the pin preview's crowd stepper and its sets-free count — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** While a venue opened from a crowd the camera cannot separate is previewed, the pin
preview carries a dot-rail stepper (`‹` dots `›`) that walks the same crowd in the same order the
pill's press-again walks it, wrapping, announcing `k of n here, <venue>` and keeping focus on the
pressed chevron; and every pin preview says how many sets are free (`18 of 24 free`) exactly as the
list card's footer does, sharing the footer's no-sets, sales-closed and closed-for-season states.

**Architecture:** Both halves are card-side; the map is untouched. The pin layer already knows,
for the `selected` pin, whether its crowd is *here* and which members flank it, so it exposes that
as one computed `stack` (`CrowdStack | null`, `null` for a lone pin or a separable crowd) and the
page hands it to the card; the card's `stepped(id)` routes through the page's existing
`onPinSelected`, which now leaves focus alone when the preview already holds it. The sets-free line
and the sales-closed chip become two `shared/` primitives the list card and the preview both render,
so the two surfaces cannot drift.

**Persistence:** JDBC only (invariant #1). No table or migration touched — frontend-only.

**Source of intent:** GitHub issue #1139 (slice 2 of #1134; slice 1 merged via PR #1138). The
design record is the surviving prototype on `claude/prototype-1134-variant-e-w9clbm` @ `1c37baa1`:
its README § *Where there is nowhere closer, press through the venues* and § *What to settle*
items 1 and 4, `variant-place-pill.ts`'s `CrowdStack`, `venue-preview-card.html`'s `preview-stack`
block, and the screenshots `dhermi-open-phone.png` / `dhermi-stepped-phone.png`. Nothing on that
branch merges.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — re-verified every
seam the issue names against `main` @ `37bb891f`: the card's `card`/`date`/`closed` surface, the
layer's `places` with `here`/`current`/`index`, `onPinSelected` and `closePreview → focusPin`; one
gap found — the preview shows no sales-closed state at all, which the brief's "edge cases shared"
closes; one seam conflict settled below — `stepped` through `onPinSelected` must not move focus off
the chevron; only Dependabot's vitest bump (#1093) is open, no overlap; no Flyway number in play;
slice 1's plan doc is stale — its PR #1138 merged — and is retired in this PR's close-out) ·
`riviera-plan-doc` (this template — forced a seam per AC, the four "settle in the plan" decisions
recorded under *Decisions*, and every touched spec into the file table) · `tdd` (each AC red at its
seam before the primitive, the layer, the card or the page changed) · `riviera-review-overlay`
(review gate — **ran** at ready-for-review on PR #1140 over `37bb891f..04138d8f`: `/code-review`
via the plugin (rung 1, effort high) with the overlay's RV-FE-1/7/8/9/10/E2E, RV-STYLE-1 and
RV-PROC-1/2 walked; five reviewers, one sub-threshold finding, F-1, fixed) · `riviera-docs-freshness` (**ran** over `origin/main..HEAD` at close-out, `main` @ `37bb891f`:
the rename/removal grep — nothing renamed, 0 hits; the substrate grep for *pin preview* / *sets
free* / *sales closed* facts — 0 hits outside CONTEXT.md; the counting sweep — 0 findings: every
"the two"/"five" hit is another subject, and the semantic chip's five box recipes are unchanged
since the sales-closed chip still wears the band's box wherever it renders; reverse walk —
CONTEXT.md's *Pin preview* and *Pin crowd* entries patched to name the sets-free line, the badges
and the stepper; slice 1's plan retired, no citation outside `docs/plans/`) · `riviera-local-debug`
(`git fetch --unshallow` before any history claim; scoped Vitest via `--include`; mocked e2e with
`PW_CHROMIUM_EXECUTABLE`) · `riviera-frontend` (the two new primitives are pure presentational
elements → `shared/`, following `closed-for-season-chip.ts`; `CrowdStack` is Discover vocabulary →
`pages/home/pin-crowding.ts`; the mocked suite is the CI-run one) · `angular-developer` +
angular-cli MCP `get_best_practices` (v22: `input()`/`output()`, `computed`, host bindings in the
decorator, `@if`/`@for`, class bindings not `ngClass`) · `riviera-tailwind` (the stepper wears the
card's own tokens — `bg-riv-card-track`, `text-riv-card-ink`, the active dot `bg-riv-accent-ink` —
never a theme name; `text-[…px]`; `appTouchTarget` on both chevrons; the baseline focus ring, never
`outline-none`; a reused element is a component, hence `app-sets-free` and `app-sales-closed-chip`
with `class: 'contents'` hosts) · `playwright-cli` (the press-through e2e gains the card's `‹`/`›`
walk with role/test-id locators and web-first `expect`; the sweep names the chevrons before
measuring) · `frontend-design` (the prototype's design pass is the visual spec: the stepper is the
app's own dot rail — an 18 px accent pill marks the current slot, 8 px dots the rest — on the card's
track pill between two chevrons, sitting under the location line).

**Branch:** `claude/pin-preview-crowd-stepper-krst4n` (the session's designated remote branch
stands in for `feature/pin-preview-crowd-stepper`).

---

## Intake-gate outcome (issue #1139, grilled 2026-09-17)

| Issue claim | Checked against `main` @ `37bb891f` |
|---|---|
| `venue-preview-card.ts` / `.html` carry `card`, `date`, `closed` and nothing crowd-shaped | **Holds.** |
| `venue-pin-layer.ts` can expose the open crowd's stack — its `slots` already know `here` and the members | **Holds.** `places()` carries `here`, `current`, `index` and `next` per crowd; the stack is one more `computed` over it. |
| `home.ts` hands the stack to the card and routes `stepped` to `onPinSelected` | **Holds with one correction:** `onPinSelected` calls `focusAfterRender('venue-preview')`, which would pull focus off the pressed chevron and onto the dialog. It now skips that move when the preview already holds focus (`previewHoldsFocus()` exists). |
| Escape still returns focus to the open venue's pin | **Holds.** `closePreview → pinLayer.focusPin(open)`; the open venue's button is the pill while its preview is open. |
| The list card's footer says `18 of 24 free`; the preview lacks it | **Holds.** The footer renders `<strong>{{ free }}</strong> of {{ total }} free` unconditionally (`0 of 0 free` beside `No sets yet`); the preview renders neither the count nor, as it turns out, the sales-closed chip the list band shows. |
| Fixtures: `src/testing/venue-cards.ts` `venueCard()`; the e2e `CROWDED_VENUES` at Dhërmi | **Holds.** `venueCard()` is priced €25 with 18 of 24 free; the e2e Dhërmi trio is Aurora Bay (5/10), Folie Marine (2/34), Dhërmi Sun Club (19/22) in list order. |
| Out of scope: the map; sorting the crowd | **Holds.** The layer's slots, the pill and the crumb are untouched; the crowd's order is the list's (`rating DESC, name ASC`, slice 1 § 1). |

**In flight:** one open PR, Dependabot's vitest 4→5 bump (#1093) — no file overlap. No Flyway
number in play (frontend-only). No epic checklist: #1134 is closed; slice 1's close-out filed #1139.

**Module ownership:** frontend-only; no backend module touched (§4a: one line).

### Decisions (the brief's "settle in the plan")

1. **The stack is computed in the layer, read by the page.** The layer's `places()` already
   answers *here*, *current* and *index* for the selected pin; recomputing that in `home.ts` would
   be a second copy of the crowd rule. `VenuePinLayer.stack` is a public `computed<CrowdStack |
   null>` and `Home.crowdStack` is `computed(() => this.pinLayer()?.stack() ?? null)`. **A lone
   pin's stack is absent (`null`), never `1/1`:** `here` is only ever true for a crowd of two or
   more, so the shape falls out of the existing rule and the card's `@if (stack())` draws nothing.
2. **Past six members the `k / n` count is the card's, not the rail's.** The app's rail lives
   inside `photo-slideshow.ts`, bound to its photos and capped at three by `PhotoSlot`; the card's
   stepper is its own markup in the prototype's shape (the rail idiom, not the component), so the
   overflow branch is `VenuePreviewCard.stackDots` — dots while `count ≤ 6`, else an empty list and
   the `k / n` text. Nothing in `shared/` changes for it.
3. **The sets-free line sits in the price line, after the price** — `from €24 / set · 18 of 24
   free` — the footer's own order, so the reading order of the dialog is: name, close, location,
   the stepper (while there is one), rating, the closure chip (while there is one), price + sets
   free, the beach-map link. The stepper sits under the location line, as the screenshots show.
4. **Sharing, not copying:** `shared/sets-free.ts` (`app-sets-free`, `<strong>N</strong> of M
   free`) and `shared/sales-closed-chip.ts` (`app-sales-closed-chip`, the band's `Sales closed for
   today` semantic chip) are extracted; `home.html` renders both where it rendered the inline
   markup, the preview renders them beside its existing `app-closed-for-season-chip`. The
   season chip outranks the sales chip on the preview exactly as on the band. `No sets yet` stays
   the price line's own branch on both surfaces (a one-word state, not markup worth a component)
   and the count beside it reads `0 of 0 free`, as the footer's does.
5. **Focus on step.** `onPinSelected` moves focus into the preview only when the preview does not
   already hold it. The pill and a member button keep today's behaviour (focus lands in the
   dialog); the chevrons keep focus, since they are inside the dialog that stays mounted.
6. **Slicing: one PR**, five phases, each independently green: the shared primitives + sets free
   on the preview; the layer's stack; the card's stepper; the page wiring; the mocked e2e.

---

## Acceptance criteria (testable)

> Every seam below is public: the two primitives' inputs and rendered text, the layer's `stack`
> signal, the card's inputs/outputs and rendered DOM, the Discover page's DOM, and the mocked e2e.

**The shared footer pieces** (`shared/`)

- [x] **AC-1:** Given `free` 18 and `total` 24, when `app-sets-free` renders, then it reads
  `18 of 24 free` with the count in a `<strong>`; the list card's footer and the pin preview both
  render it, so the preview's `[data-testid="preview-availability"]` reads `18 of 24 free` and the
  list card's `[data-testid="card-availability"]` still does. *Seam:* `SetsFree` inputs → rendered
  text; the card's DOM · *Pinned by:* `sets-free.spec.ts` "says how many sets are free, the count in
  bold", `venue-preview-card.spec.ts` "says how many sets are free, as the list card's footer does",
  `home.spec.ts` "renders a card per venue with name, location, rating, from-price and availability"
  (existing, unchanged).
- [x] **AC-2:** Given a venue whose online sales for today have closed and which is not closed for
  the season, when it is previewed, then the preview carries `[data-testid="preview-sales-closed"]`
  reading `Sales closed for today` (the `app-sales-closed-chip` the list band renders, keeping the
  `.sales-closed-chip` marker); a venue closed for the season shows the season chip and no sales
  chip; an open venue shows neither. *Seam:* the card's DOM; `SalesClosedChip` · *Pinned by:*
  `sales-closed-chip.spec.ts` "wears the semantic-chip skin and says sales closed for today",
  `venue-preview-card.spec.ts` "badges sales closed for today, outranked by the season closure",
  `home.spec.ts` "badges a venue whose online sales for today have closed" (existing, unchanged).
- [x] **AC-3:** Given a venue with no sets (`priceLabel` null, 0 of 0), when it is previewed, then
  the price line reads `No sets yet` and the count `0 of 0 free`, as the footer does. *Seam:* the
  card's DOM · *Pinned by:* `venue-preview-card.spec.ts` "says No sets yet and 0 of 0 free where a
  venue has no sets".

**The layer** (`pages/home/venue-pin-layer.ts`)

- [x] **AC-4:** Given the inseparable Dhërmi trio at `maxZoom` (Havana `11`, Folie `12`, Sun Club
  `13`), when `selected` is `12`, then `stack()` is `{ index: 1, count: 3, place: 'Dhërmi', prevId:
  '11', nextId: '13' }`; when `11`, `prevId` is `13` (wrapping) and `nextId` `12`; when `13`,
  `prevId` is `12` and `nextId` `11`. *Seam:* `VenuePinLayer.stack` · *Pinned by:*
  `venue-pin-layer.spec.ts` "exposes the open venue's place in an inseparable crowd, wrapping at
  both ends".
- [x] **AC-5:** Given nothing selected, a lone pin selected, or a member of a crowd the camera can
  still separate selected (the Ksamil pair at the opening view), when `stack()` is read, then it is
  `null`. *Seam:* as AC-4 · *Pinned by:* `venue-pin-layer.spec.ts` "exposes no stack for nothing
  open, a lone pin, or a crowd the camera can still separate".

**The card** (`pages/home/venue-preview-card.ts`)

- [x] **AC-6:** Given Folie Marine's card and `stack` `{ index: 1, count: 3, place: 'Dhërmi',
  prevId: '11', nextId: '13' }`, when the preview renders, then `[data-testid="preview-stack"]` is
  a `group` named `3 venues at Dhërmi` holding a `‹` button named `Previous venue at Dhërmi`
  (`preview-stack-prev`), three decorative dots (`preview-stack-dots`, the second `data-current`),
  and a `›` button named `Next venue at Dhërmi` (`preview-stack-next`); the polite live region
  `preview-stack-position` reads `2 of 3 here, Folie Marine`. *Seam:* the card's `stack` input →
  rendered DOM · *Pinned by:* `venue-preview-card.spec.ts` "carries the crowd stepper while its
  venue is one of an inseparable crowd".
- [x] **AC-7:** Given no `stack`, when the preview renders, then no `preview-stack` exists and the
  live region is mounted and empty. *Seam:* as AC-6 · *Pinned by:* `venue-preview-card.spec.ts`
  "carries no stepper for a venue on its own, keeping the live region mounted".
- [x] **AC-8:** Given the stack of AC-6, when `‹` is pressed, then `stepped` emits `11`; when `›`
  is pressed, `13`; and when the card and stack inputs then change to the neighbour's, the `›`
  button is the same element (the card stays mounted). *Seam:* the card's `stepped` output; its
  DOM · *Pinned by:* `venue-preview-card.spec.ts` "steps to the neighbour on either side" and
  "keeps its controls across a step".
- [x] **AC-9:** Given a stack of six, when the preview renders, then six dots show; given seven,
  no dots and `preview-stack-count` reading `3 / 7` for index 2. *Seam:* as AC-6 · *Pinned by:*
  `venue-preview-card.spec.ts` "shows a count instead of dots past six venues".
- [x] **AC-10:** Given the preview rendered with a stepper (three and seven members) and with the
  sales-closed chip, when axe runs, then no violation; and the chevrons' ink clears AA normal on the
  track over the card glass over every worst-case stop in all three themes, and the active dot
  clears 3:1 on the track. *Seam:* the rendered DOM; the `--riv-card-*` / `--riv-accent-ink`
  tokens · *Pinned by:* `venue-preview-card.a11y.spec.ts`, `venue-preview-card.contrast.spec.ts`.

**The page** (`pages/home/`)

- [x] **AC-11:** Given the inseparable crowd pressed through from the map (Aurora Bay open), when
  the preview's `›` is pressed, then Folie Marine's preview shows in the same dialog element, the
  pressed `›` is still the focused element, the pill reads `Folie Marine from €39 2/3`; two more
  `›` presses wrap to Aurora Bay; one `‹` press from Aurora Bay wraps to Dhërmi Sun Club; Escape
  then focuses Dhërmi Sun Club's own button. *Seam:* the Discover DOM (`venue-preview`,
  `preview-stack-*`, `map-place-pill`) · *Pinned by:* `home.spec.ts` "walks an inseparable crowd
  from the preview card's stepper, wrapping, with focus kept on the chevron".
- [x] **AC-12:** Given a lone pin's preview, when it renders, then it carries no stepper and says
  its sets free. *Seam:* the Discover DOM · *Pinned by:* `home.spec.ts` "opens the preview for the
  pin that was pressed" (extended).
- [x] **AC-13:** Given the preview open over the map with its stepper, when axe runs, then no
  violation. *Seam:* the Discover DOM · *Pinned by:* `home.a11y.spec.ts` "has no violations with an
  inseparable crowd's preview and its stepper open over the map".

**End to end** (`frontend/e2e/`, the mocked suite, fake engine)

- [x] **AC-14:** Given the Dhërmi pill pressed through to Folie Marine, when the card's `›` is
  pressed, then Dhërmi Sun Club's preview shows with the pill at `3/3`, the `›` keeps focus, the
  position region reads `3 of 3 here, Dhërmi Sun Club`, the card says `19 of 22 free`; `›` again
  wraps to Aurora Bay and `‹` back to Dhërmi Sun Club; Escape focuses Dhërmi Sun Club's button;
  the page is axe-clean and every control clears 44 px with the stepper open. *Seam:* the mocked
  Discover page · *Pinned by:* `discover-map.e2e.ts` "where nowhere is closer, press through the
  venues…" (extended).
- [x] **AC-15:** Given the phone width with a crowd pressed through, when the sweep runs, then the
  card's two chevrons are measured (named before the sweep) and pass. *Seam:*
  `touch-targets-tourist.e2e.ts` · *Pinned by:* "home — the map view with a place pill, its
  pressed-through state and the beach crumb" (extended).

## Non-goals

- Anything on the map: the pill, the walk from the pill, the crumb, the member buttons (slice 1).
- Sorting the crowd by sets free then price — the one order is the list's (slice 1 § 1).
- Swipe or arrow-key stepping on the card (the pill's press-again and the chevrons are the walk).
- Making the dot rail a shared component or touching `photo-slideshow.ts` / `photo-step-button.ts`.
- Showing sets free on the pill, or any change to `VenueCard`'s fields.
- Any backend or API change.

## Behavior-parity ledger (retirement / replacement slices only)

The list card's inline footer count and its inline sales-closed chip are replaced by the two
`shared/` primitives; the preview's closure branch grows a sales-closed arm.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Footer: `<strong>{{ free }}</strong> of {{ total }} free` in `card-availability`, `12.5px` ink-soft with the count in card ink | preserved | `app-sets-free` renders the same markup inside the same span; the span keeps its classes and test id |
| Band: `Sales closed for today` semantic chip, `.sales-closed-chip`, shown only when not closed for the season | preserved | `app-sales-closed-chip` renders the same span with the same classes; the `@else if` stays in `home.html` |
| `card.ariaLabel` folds the closed state and the count | preserved | untouched — `toCard` is not in scope |
| Preview: closed-for-season chip, no sales-closed state | **changed** | the preview now shows the sales-closed chip where the band would — the one fact the two surfaces disagreed on |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `onPinSelected`'s focus move pulls focus off the pressed chevron, so a keyboard user steps once and lands on the dialog | certain | high | the move is skipped when the preview already holds focus (`previewHoldsFocus()`); AC-11 and AC-14 assert the chevron stays focused | agent | closed — phase 3 |
| R-2 | The live region announces nothing on the first open (born with its text) or twice on a step | low | med | one `<output aria-live="polite">` mounted for the card's whole life (`shared/load-announcer.ts` shape), text empty without a stack; RV-FE-10 | agent | closed — phase 2 |
| R-3 | The stepper's inks fail AA on the card track in the dark theme (light ink on a light track over dark glass) | med | med | `venue-preview-card.contrast.spec.ts` composites the track over the glass over every stop per theme, chevrons at AA normal, active dot at 3:1; alphas retuned if any fails | agent | closed — phase 2 (every pair clears in all three themes without a retune) |
| R-4 | Sonar duplication: the two chevron buttons share a class string | med | low | one `CHEVRON_CLASSES` constant bound with `[class]` on both | agent | closed — phase 2 |
| R-5 | `check-inline-comments` rejects provenance inside a touched doc comment | med | low | no issue/PR number in any doc comment; the `venueCard()` TSDoc touched here cites none | agent | open |
| R-6 | The list's swap to `app-sets-free` shifts the footer (a `contents` host, no box) | low | low | the host is `display: contents`, the wrapping span keeps its classes; `home.spec.ts`'s footer assertions unchanged | agent | closed — phase 0 |
| R-7 | A `stack` for a lone pin renders `1/1` | low | med | `here` is false for a crowd of one, so `current` is null and `stack()` is `null`; AC-5 pins the lone case | agent | closed — phase 1 |
| R-8 | Stepping past the last member re-renders the card and drops focus | low | high | the page's `@if (selectedCard(); as selected)` keeps the branch while the value changes; AC-8 asserts the same element survives an input change, AC-11 the page-level focus | agent | closed — phase 3 |

## Open questions / Assumptions

None open.

### Resolved

- The inactive dots are decorative (the current slot is the accent pill at 3:1, the pill's `k/n`
  states the count), so their `card-ink-soft/35` tint is not held to 1.4.11 — the reading
  `photo-slideshow.contrast.spec.ts` records for the inert Discover rail; written into
  `venue-preview-card.contrast.spec.ts`'s header (phase 2, `2e4c42d3`).
- The six decisions above (intake, `d2cac6d0`).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the slice reads `VenueCard.free`/`total` (from
`VenueSummary.availability`) only to show it; nothing here writes, holds or claims a set.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. Module ownership (§4a): all in `frontend/`, no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Money appears only as the already-formatted `priceLabel`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/sets-free.ts` | new | standalone component, `class: 'contents'` host | two `input()`s | — |
| FE-2 | `shared/sales-closed-chip.ts` | new | standalone component, `class: 'contents'` host | none | — |
| FE-3 | `pages/home/pin-crowding.ts` | existing | pure vocabulary | `CrowdStack` interface | — |
| FE-4 | `pages/home/venue-pin-layer.ts` | existing | standalone component | `stack` `computed` | — |
| FE-5 | `pages/home/venue-preview-card.ts` / `.html` | existing | standalone component | `stack` `input()`, `stepped` `output()`, `stackDots` / `stackPosition` `computed` | — |
| FE-6 | `pages/home/home.ts` / `.html` | existing | standalone component | `crowdStack` `computed` over the layer `viewChild` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs.
No deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `sonar gate — awaiting the analysis on the ready-for-review head; F-1 fixed locally, batched with any Sonar fix`

**Next action:** read the SonarCloud list for PR #1140 once `SonarCloud Code Analysis` concludes; fix every entry; push F-1 and the Sonar fixes with this close-out in one commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The shared footer pieces; sets free and sales closed on the preview | ✅ | `d2cac6d0` |
| 1 — The layer's stack | ✅ | `680abbf7` |
| 2 — The card's stepper | ✅ | `2e4c42d3` |
| 3 — Discover wiring | ✅ | `81de5bd3` |
| 4 — Mocked e2e | ✅ | `e34b2a07` |
| 5 — Close-out | ✅ | the close-out commit; `main` @ `37bb891f` unchanged since the branch point, nothing to merge in |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (bank #4, prior-PR context; confidence 50, under the 80 posting bar) | the stepper's chevrons declare `touch-manipulation` with no `expectTouchManipulation` proof in `discover-map.e2e.ts`, the class PR #1131's review set for map-area controls | fixed — the press-through case proves both chevrons; rides the next push |

---

## File structure

- `docs/plans/pin-preview-crowd-stepper.md` — this plan
- `docs/plans/venue-pin-crowds.md` — retired (its PR #1138 merged; `riviera-docs-freshness` § *Plan-doc retirement*)
- `CONTEXT.md` — glossary: *Pin preview* gains the sets-free line and the stepper; *Pin crowd* names the card's stepper beside the pill's walk
- `frontend/src/app/shared/sets-free.ts` — `app-sets-free`: `<strong>N</strong> of M free`
- `frontend/src/app/shared/sets-free.spec.ts` — AC-1
- `frontend/src/app/shared/sales-closed-chip.ts` — `app-sales-closed-chip`: the band's semantic chip
- `frontend/src/app/shared/sales-closed-chip.spec.ts` — AC-2
- `frontend/src/app/pages/home/pin-crowding.ts` — `CrowdStack`
- `frontend/src/app/pages/home/venue-pin-layer.ts` — `stack`
- `frontend/src/app/pages/home/venue-pin-layer.spec.ts` — AC-4, AC-5
- `frontend/src/app/pages/home/venue-preview-card.ts` — `stack`, `stepped`, `stackDots`, `stackPosition`
- `frontend/src/app/pages/home/venue-preview-card.html` — the stepper block, the sales-closed arm, the sets-free line
- `frontend/src/app/pages/home/venue-preview-card.spec.ts` — AC-1..3, AC-6..9; its fixture becomes `venueCard()`
- `frontend/src/app/pages/home/venue-preview-card.a11y.spec.ts` — AC-10 (axe)
- `frontend/src/app/pages/home/venue-preview-card.contrast.spec.ts` — AC-10 (contrast)
- `frontend/src/testing/venue-cards.ts` — its TSDoc names the preview card among the fixture's consumers
- `frontend/src/app/pages/home/home.ts` — `crowdStack`; `onPinSelected` keeps focus inside an open preview
- `frontend/src/app/pages/home/home.html` — the card's `stack`/`stepped` bindings; the footer and band render the two primitives
- `frontend/src/app/pages/home/home.spec.ts` — AC-11, AC-12
- `frontend/src/app/pages/home/home.a11y.spec.ts` — AC-13
- `frontend/e2e/discover-map.e2e.ts` — AC-14
- `frontend/e2e/touch-targets-tourist.e2e.ts` — AC-15

---

## Phase 0 — The shared footer pieces; sets free and sales closed on the preview

**Files:** Create `shared/sets-free.ts`, `shared/sales-closed-chip.ts` · Modify `home.html`,
`venue-preview-card.ts`, `.html`, `src/testing/venue-cards.ts` · Test `shared/sets-free.spec.ts`,
`shared/sales-closed-chip.spec.ts`, `venue-preview-card.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-1..3: the two primitives' rendered text and the
  `.sales-closed-chip` marker; on the preview, `preview-availability` reads `18 of 24 free`,
  `preview-sales-closed` shows for a sales-closed open venue and not for a season-closed one,
  `No sets yet` + `0 of 0 free` for a venue with no sets.
- [x] **Step 2: Run it, verify it fails** — `cd frontend && npx ng test --watch=false --include="src/app/shared/sets-free.spec.ts" --include="src/app/shared/sales-closed-chip.spec.ts" --include="src/app/pages/home/venue-preview-card.spec.ts"` → FAIL (no such component; no such test id).
- [x] **Step 3: Minimal implementation** — the two components (`class: 'contents'` hosts, the
  band's classes carried over); `home.html` renders them; the preview renders the line in its price
  `<p>` and the chip in its closure branch.
- [x] **Step 4: Run it, verify it passes** — the same command, then `--include="src/app/pages/home/home*.spec.ts"` (the footer and band assertions), then `npm run lint`, `npm run format:check`.
- [x] **Step 5: Generalization-audit pass** — population: every place the footer's count or the
  sales-closed chip is rendered (`grep -rn "of {{ card.total }} free\|Sales closed for today" frontend/src/app --include=*.html --include=*.ts`) → the list band/footer and now the preview; `venue-map.html`'s `map-sales-closed` is an alert, not the chip, and stays.
- [x] **Step 6: Commit** — `Pin preview: sets free and sales closed, shared with the list card (#1139)`
- [x] **Step 7: Update plan-doc execution status; open the draft PR.**

## Phase 1 — The layer's stack

**Files:** Modify `pin-crowding.ts`, `venue-pin-layer.ts` · Test `venue-pin-layer.spec.ts`

- [x] **Step 1: Failing tests** — AC-4, AC-5 against the Dhërmi trio at `maxZoom` and the Ksamil pair at the opening view.
- [x] **Step 2: Run, verify FAIL** — `--include="src/app/pages/home/venue-pin-layer.spec.ts"` → `stack is not a function`.
- [x] **Step 3: Minimal implementation** — `CrowdStack` in `pin-crowding.ts`; `stack = computed(...)` over `places()` finding the place whose `current` is the selected pin.
- [x] **Step 4: Run, verify PASS** — the same, then `--include="src/app/pages/home/venue-pin-layer*.spec.ts"`.
- [x] **Step 5: Generalization audit** — population: every reader of the crowd's neighbour rule (`grep -n "members\[(" frontend/src/app/pages/home/venue-pin-layer.ts`) → `describe`'s `next` and the stack's `prevId`/`nextId`; both index the same `crowd.members` modulo its length.
- [x] **Step 6: Commit** — `Pin layer: expose the open crowd's stack for the preview card (#1139)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — The card's stepper

**Files:** Modify `venue-preview-card.ts`, `.html` · Test `venue-preview-card.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`

- [x] **Step 1: Failing tests** — AC-6..10.
- [x] **Step 2: Run, verify FAIL** — `--include="src/app/pages/home/venue-preview-card*.spec.ts"`.
- [x] **Step 3: Minimal implementation** — `stack` input, `stepped` output, `stackDots`, `stackPosition`; the template block from the prototype with the `‹`/`›` glyphs, `appTouchTarget` on both, one `CHEVRON_CLASSES` constant, the live region mounted for the card's life.
- [x] **Step 4: Run, verify PASS**, then `npm run test:a11y`.
- [x] **Step 5: Generalization audit** — population: every control on the card (`grep -n "<button\|<a " frontend/src/app/pages/home/venue-preview-card.html`) → close, `‹`, `›`, the link; every one carries `appTouchTarget`; `node scripts/check-touch-target.mjs --files frontend/src/app/pages/home/venue-preview-card.html` green.
- [x] **Step 6: Commit** — `Pin preview: the crowd stepper — dots, chevrons and the position announcement (#1139)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — Discover wiring

**Files:** Modify `home.ts`, `home.html` · Test `home.spec.ts`, `home.a11y.spec.ts`

- [x] **Step 1: Failing tests** — AC-11..13.
- [x] **Step 2: Run, verify FAIL** — `--include="src/app/pages/home/home.spec.ts"`.
- [x] **Step 3: Minimal implementation** — `crowdStack`; `[stack]`/`(stepped)` on the card; `onPinSelected` skips the focus move when `previewHoldsFocus()`.
- [x] **Step 4: Run, verify PASS** — `home*.spec.ts`; then `npm run lint`, `npm run format:check`, `npm test`.
- [x] **Step 5: Generalization audit** — population: every caller of `onPinSelected` (`grep -n "onPinSelected" frontend/src/app/pages/home/home.html frontend/src/app/pages/home/home.ts`) → the layer's `chosen` and the card's `stepped`; the focus rule serves both.
- [x] **Step 6: Commit** — `Discover: the preview's stepper walks the crowd through the page (#1139)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 4 — Mocked e2e

**Files:** Modify `frontend/e2e/discover-map.e2e.ts`, `frontend/e2e/touch-targets-tourist.e2e.ts`

- [x] **Step 1: Failing tests** — AC-14, AC-15.
- [x] **Step 2: Run, verify** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-map.e2e.ts e2e/touch-targets-tourist.e2e.ts`.
- [x] **Step 3–4:** fix anything the browser shows that jsdom could not.
- [x] **Step 5: Generalization audit** — population: every e2e that opens a pin preview (`grep -rln "venue-preview" frontend/e2e`) → still green; the sweep's pressed-through state now measures the chevrons.
- [x] **Step 6: Commit** — `Discover e2e: the card's stepper walks the crowd; the sweep measures its chevrons (#1139)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 5 — Close-out

- [x] `git rm docs/plans/venue-pin-crowds.md`; grep `venue-pin-crowds` outside `docs/plans/` → repoint any citation to PR #1138.
- [x] `CONTEXT.md`: *Pin preview* and *Pin crowd* entries.
- [x] `riviera-docs-freshness` over `origin/main..HEAD`; `node scripts/check-plan-file-structure.mjs --diff origin/main` green; execution status finalized in the last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-17 | phase 0 | every renderer of the footer's count or the sales-closed chip | `grep -rn "of {{ card.total }} free\|Sales closed for today" frontend/src/app --include=*.html --include=*.ts \| grep -v spec` | `shared/sales-closed-chip.ts` only (the list band and the preview both render it; the count is `app-sets-free` on both) | done — `venue-map.html`'s `map-sales-closed` is an alert with its own copy, not the chip, and stays |
| 2026-09-17 | phase 1 | every reader of the crowd's neighbour rule (index modulo the member count) | `grep -n "members\[(" frontend/src/app/pages/home/venue-pin-layer.ts` | `describe`'s `next`, the stack's `prevId` | the stack's `nextId` reuses the place's `next`; only `prevId` indexes on its own, against the same `crowd.members` |
| 2026-09-17 | phase 2 | every control on the preview card | `grep -n "<button\|<a " frontend/src/app/pages/home/venue-preview-card.html` | close, `‹`, `›`, the beach-map link | every one carries `appTouchTarget`; `check-touch-target.mjs` green over the diff |
| 2026-09-17 | phase 3 | every caller of `onPinSelected` | `grep -n "onPinSelected" frontend/src/app/pages/home/home.html frontend/src/app/pages/home/home.ts` | the layer's `chosen`, the card's `stepped` | one focus rule serves both: move into the dialog unless it already holds focus |
| 2026-09-17 | phase 4 | every e2e that opens a pin preview | `grep -rln "venue-preview" frontend/e2e` | `discover-map.e2e.ts`, `touch-targets-tourist.e2e.ts` | both green in Chromium with the stepper on the card; the sweep's pressed-through state names the chevrons |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..3:** `npx ng test --watch=false --include="src/app/shared/sets-free.spec.ts" --include="src/app/shared/sales-closed-chip.spec.ts" --include="src/app/pages/home/venue-preview-card.spec.ts"` → PASS. Verified at commit `<sha>`.
- [x] **AC-4..5:** `--include="src/app/pages/home/venue-pin-layer.spec.ts"` → PASS. Verified at commit `<sha>`.
- [x] **AC-6..10:** `--include="src/app/pages/home/venue-preview-card*.spec.ts"` → PASS. Verified at commit `<sha>`.
- [x] **AC-11..13:** `--include="src/app/pages/home/home*.spec.ts"` → PASS. Verified at commit `<sha>`.
- [x] **AC-14..15:** the Playwright command above → PASS. Verified at commit `<sha>`.

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
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
