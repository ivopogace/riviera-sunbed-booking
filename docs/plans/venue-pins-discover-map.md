# Venue pins on the Discover map Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The riviera map on Discover draws one keyboard-reachable pin per venue in the
current result set that carries a venue location, and tapping a pin opens a Liquid Glass
preview card that leads to that venue's beach-map page with the chosen date carried.

**Architecture:** The map issues **no query of its own** — pins are a `computed()` over the
same `venuesView` the cards render, so beach/region/date filters and the availability-aware
from-price agree with the list *by construction* rather than by a test. `RivieraMap` grows a
**generic** `pins` input (id + position + label) and knows nothing about venues; the
venue→pin mapping and the preview card live in `pages/home`, which is where the venue
vocabulary already is.

**Persistence:** JDBC only (invariant #1). **No migration, no production Java** — the only
backend change is an extension of `VenueCatalogVisibilityIT`, which proves the existing
`venue` catalogue fence also hides a *pinned* venue. `venue.latitude`/`longitude` already
exist (`V58__venue_location.sql`, #1099).

**Source of intent:** GitHub issue #1101 (sub-issue of epic #806 — the epic spec is the
issue body of #806). Last of the epic's four slices.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
`RivieraMap` is single-pin *by construction*, that the #1098 network guard runs against the
**real** engine whose fixture has no locations, and that #806 tracks slices as native
sub-issues with no markdown checklist) · `riviera-plan-doc` (this template — forced the
Module-ownership table for a slice with no production Java, and the seam per AC) · `tdd`
(every phase red-first at the seams named below) · `riviera-review-overlay` (review gate —
due at ready-for-review) · `riviera-docs-freshness` (**due** at merge close-out, and again
over the epic's full merge span — #1101 is the last slice of #806) · `riviera-frontend`
(placement: the generic pin input stays on `shared/riviera-map.ts`; `VenueCard`, the pin
derivation and the preview card are colocated flat in `pages/home/`; `VenueCard` moves to
its own file to break the `home.ts` ↔ preview-card import cycle) · `riviera-tailwind`
(Liquid Glass via the existing `appCardGlass`/`appPhotoScrim` directives, never `@apply`;
the 44 px floor via `[appTouchTarget]`; `starting:` for the entry fade under `motion-safe:`)
· `angular-developer` + angular-cli MCP (`get_best_practices` → `linkedSignal()` for state
derived from reactive sources that must stay synchronized; `search_documentation` →
`linkedSignal`'s `{source, computation, previous}` form, which is what resets the selection
when the pin set changes) · `playwright-cli` (mocked-suite e2e authoring) ·
`riviera-java-conventions` + `riviera-modulith` (the IT extension — both fire on any
backend Java, tests included)

**Branch:** `claude/venue-pins-discover-map-t9fupc` — the cloud session's designated remote
branch stands in for `feature/venue-pins-discover-map` (`riviera-sdlc` § Remote/cloud
session addendum). Exists at `origin/main` (3003420) before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue list of two located venues and one with a null location, when
  the pins are derived, then exactly two pins are produced, in list order, each carrying the
  venue's id and its name as the label. *Seam:* `venuePins(cards)` — the pure derivation
  function `pages/home/venue-pins.ts` exports · *Pinned by:*
  `venue-pins.spec.ts` › `venuePins omits a venue with no location` / `keeps list order`

- [ ] **AC-2:** Given a `RivieraMap` fed three `pins`, when it renders against the fake
  engine, then the engine holds one marker per pin whose element is a `<button>` named by
  the pin's label, mounted in feed order; and when the `pins` input drops one, then its
  marker is gone. *Seam:* the `MapEngine` token (`MapHandle.markers()` on the fake) ·
  *Pinned by:* `riviera-map.spec.ts` › `draws one marker per pin, in feed order`

- [ ] **AC-3:** Given a rendered pin button, when it is activated, then `RivieraMap` emits
  `pinSelected` with that pin's id and the click does **not** also reach the map surface (so
  a pin tap never counts as the map tap that closes a preview). *Seam:* the `MapEngine`
  token + the component's `pinSelected` output · *Pinned by:* `riviera-map.spec.ts` ›
  `a pin press selects it without reporting a map click`

- [ ] **AC-4:** Given Discover with a preview open for venue 1, when the beach filter
  changes, then exactly one further `GET /api/venues` request is made, the pin set becomes
  the new result's located venues, and the preview is closed. *Seam:* `GET /api/venues` (the
  mocked route) + the rendered pin/preview DOM · *Pinned by:* `discover-map.e2e.ts` ›
  `a filter change re-feeds the pins from one request and closes the preview`

- [ ] **AC-5:** Given Discover with pins, when a pin is tapped, then a preview card opens
  showing the venue's cover photo, name, `beach · region`, rating and the from-price for the
  chosen date, and its link navigates to `/venues/:id?date=<selected>`. *Seam:* the rendered
  Discover DOM + the router URL · *Pinned by:* `discover-map.e2e.ts` › `a pin opens its
  preview and the preview leads to the beach map with the date carried`

- [ ] **AC-6:** Given a venue closed for the season, when its pin is tapped, then the preview
  card carries the closed-for-season state the list card shows. *Seam:* the
  `VenuePreviewCard` component input · *Pinned by:* `venue-preview-card.spec.ts` › `shows the
  closed-for-season state`

- [ ] **AC-7:** Given one preview open, when another pin is tapped, then only the newer
  preview is present; and when Escape is pressed or the map surface is tapped, then the
  preview closes and focus returns to the pin that opened it. *Seam:* the rendered Discover
  DOM (`document.activeElement`) · *Pinned by:* `home.spec.ts` › `opens one preview at a
  time` / `Escape closes the preview and returns focus to its pin`

- [ ] **AC-8:** Given Discover on a wide viewport with a preview open, when a pin is
  selected, then the matching list card is marked `aria-current="true"` and scrolled into
  view, and no other card is. *Seam:* the rendered Discover DOM · *Pinned by:* `home.spec.ts`
  › `marks and reveals the selected venue's card`

- [ ] **AC-9:** Given Discover with pins and a preview open, when axe, the contrast sweep and
  the touch-target sweep run on chromium, phone and fold, then no serious violation is
  reported, every pin measures ≥ 44 × 44 px, and the map's OpenMapTiles/OpenStreetMap credit
  is **not** covered by the preview card. *Seam:* the rendered Discover DOM ·
  *Pinned by:* `discover-map.e2e.ts` › `pins and an open preview stay accessible and leave
  the credit visible`, `home.a11y.spec.ts`, `home.contrast.spec.ts`

- [ ] **AC-10:** Given a venue that carries a location and whose owning operator is then
  suspended, when the tourist catalogue is listed, then the venue is **absent from the
  response entirely** — not present with a null location — and while the operator is `ACTIVE`
  the same venue is listed *with* its location. *Seam:* `venue.api.VenueCatalog#listVenues` ·
  *Pinned by:* `VenueCatalogVisibilityIT.listOmitsPinnedVenueOfSuspendedOperator`

- [ ] **AC-11:** Given the **real** MapLibre engine on Discover with pins and a preview open
  (cover photo included), when every request is inspected, then none leaves our origin.
  *Seam:* Playwright's `page.on('request')` against the real adapter · *Pinned by:*
  `discover-map.e2e.ts` › `the map open on Discover makes no request to a third party`
  (extended, not replaced)

## Non-goals

- **Pin clustering, viewport-bounded queries, server-side proximity, distance sorting** —
  epic #806 out-of-scope, restated here because a map invites all four.
- **A second HTTP call for the map.** The map never queries; if it ever needs data the list
  does not have, that is a new slice with its own argument.
- **A map on the venue detail page** — epic out-of-scope; v1 is Discover only.
- **Changing the venue list API.** `location` already rides `VenueSummaryView` (#1099); this
  slice adds no field, no endpoint and no migration.
- **Backfilling locations** for existing venues — an unpinned venue stays in the list and is
  simply not drawn (story 16).
- **Making the map an alternative to the list for assistive tech.** The card list stays the
  fully accessible path; the map's skip control keeps bypassing it, pins included.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` The slice is purely additive: `RivieraMap`'s
existing single `pin`/`pinDraggable`/`pinMoved` placement contract (the operator console's,
#1099) is untouched and keeps its own marker id, and no Discover behavior is removed.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The preview card overlays the map and covers the OpenMapTiles/OpenStreetMap credit, breaking the ODbL + CC-BY attribution obligation ADR-0022 and story 13 rest on | high | high | Card is bottom-anchored with a clearance above the credit pill; an e2e measures both boxes on the **narrowest** phone (320 px, where the credit wraps to two lines) and asserts they do not intersect — the same shape as #1098's existing credit-inset test | plan | open |
| R-2 | Pin markers are appended into the engine's surface, so a rebuild on every selection change would drop focus mid-interaction and scramble tab order | med | med | Rebuild only when the pin *identity* changes (`id`+`label` key); a selection change only re-writes `aria-expanded`/`data-selected` on the existing buttons | plan | open |
| R-3 | A pin tap bubbles to the map surface and is read as the map tap that closes previews — the pin would open and instantly close | high | high | Pin elements `stopPropagation()` on click, the prior art the existing placement pin already uses (`buildPinElement`); AC-3 pins it at the seam | plan | open |
| R-4 | #1098's network guard runs against the **real** engine, whose `VENUES` fixture has no `location` and no `coverPhoto` — extending it naively would assert "no third-party requests" on a map with zero pins, i.e. vacuously | high | med | The fixture gains locations **and** a mocked same-origin cover photo, and the guard's test taps a pin and asserts the preview is open *before* reading the request log (AC-11) | plan | open |
| R-5 | Moving `VenueCard` out of `home.ts` for the preview card creates a `home.ts` ↔ `venue-preview-card.ts` import cycle | med | med | `VenueCard` lands in its own `pages/home/venue-card.ts`; both import it, neither imports the other | plan | open |
| R-6 | Focus moves into a non-modal preview dialog and is stranded when the preview closes because its list re-fetched underneath it | med | med | Selection is a `linkedSignal` over the pin set: a re-fetch empties `venuesView`, which resets the selection to `null`, closes the preview and returns focus to the pin — and when the pin is gone too, to the map's own end marker | plan | open |
| R-7 | Open PR #1093 bumps Vitest 4.1.11 → **5.0.0** (a major) under this slice's new specs | low | med | No Flyway migration here, so no `V<n>` collision; if #1093 merges first, merge `main` in with full phase discipline and re-run `npm test` before ready-for-review | plan | open |
| R-8 | Adding pins to Discover puts 2–N new tab stops inside the map region, degrading keyboard bypass | med | med | `mapEnd` is already the template's last element and markers mount into the canvas host above it, so `Skip map` bypasses every pin; AC-9's axe run and the existing `map-skip` e2e assertion both stay green | plan | open |

## Open questions / Assumptions

- **Assumption:** A filter/date change **closes** an open preview rather than preserving it.
  Not a free choice — `beginRequest()` sets `venues` to `undefined` before every re-fetch, so
  the pin set empties and R-6's `linkedSignal` resets the selection. Recorded so a reviewer
  reads it as designed, not incidental. — *Owner:* plan · *Resolves by:* phase 4
- **Assumption:** The epic's "checklist" is #806's **native GitHub sub-issue list** — the
  issue body has no markdown checklist and #806 carries no comments at all, so #1099's
  close-out "tick" was its sub-issue closing as completed (3/4 done). AC "ticked with the PR
  number" is therefore honoured as a close-out **comment** on #806; being the last slice,
  that comment names all four slice PRs. — *Owner:* plan · *Resolves by:* merge close-out

### Resolved

- **Open question (resolved at plan time):** the issue body says "Selecting a pin highlights
  the matching card in the list where both are visible", but no acceptance criterion covers
  it. Asked the maintainer: **in scope, highlight *and* scroll the card into view** →
  AC-8.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path of any kind is in scope. The slice
renders the `free`/`total` snapshot and the availability-aware `fromPrice` that
`GET /api/venues` already returns for the selected date; it never claims, holds or reads
`set_availability` directly, and adds no endpoint that could.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | *none — test-only change* | `venue` owns the venue profile, the venue location (the riviera-map pin) and the tourist catalogue read; the fence being proven is its own `VenueCatalog` port |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog#listVenues(VenueFilter, LocalDate)` | `VenueSummaryView` (carries `VenueLocation`) | *unchanged* — observed by the IT, not re-shaped |

No port is added, changed or moved. No new production Java at all.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event is published, subscribed or changed by this slice.`

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Prove the tourist catalogue fence also hides a **pinned** venue (a suspended owner's venue carries no row, not a row with a null location) | `venue` | `venue` Job: owns the venue profile incl. "venue location (the riviera-map pin)" and the tourist catalogue read behind `VenueCatalog`. The fence's *decision* (is the owner ACTIVE?) stays `operator`'s — the IT drives it through `operator.api.OperatorLifecycle` and asserts only on `venue`'s read, so nothing about operator status is re-implemented here. Not `operator`: its Not-My-Job is venue content. |
| Draw and select venue pins; render the preview card | *frontend only* | No module. `shared/riviera-map.ts` gains a venue-agnostic `pins` input; the venue vocabulary stays in `pages/home`. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves. The preview card renders the same
`VenueCard.priceLabel` string the list card renders, produced by `shared/money.ts`'s
`formatMoney` from the integer minor units + ISO currency the API already sends (invariant
#5). The slice performs **no** money arithmetic — no division, no rounding, no new format
call site.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/riviera-map.ts` | existing | standalone component | new `pins`/`selectedPin` `input()`s + `pinSelected` `output()`; markers synced by an `effect()` keyed on pin identity | none |
| FE-2 | `pages/home/venue-card.ts` | new | interface only (moved out of `home.ts`) | — | none |
| FE-3 | `pages/home/venue-pins.ts` | new | pure function | none — signal-free, called from a `computed()` | none |
| FE-4 | `pages/home/venue-preview-card.ts` | new | standalone component | `input.required<VenueCard>()` + `close` output; `role="dialog"` labelled by its heading | none |
| FE-5 | `pages/home/home.ts` | existing | standalone component | `pins` `computed()` over `venuesView`; `selectedVenueId` `linkedSignal({source: pins, computation})`; `selectedCard` `computed()` | none |
| FE-6 | `pages/home/home.html` | existing | template | binds the map's pins/selection, renders the preview, marks the selected card | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, no `@HostBinding`/`@HostListener`, no explicit `standalone: true` or `OnPush`.
`NgOptimizedImage`: the preview card reuses the existing `PhotoSlideshow`/`PhotoScrim`
primitives, which already own the image element and its `ngSrc` — the card adds no raw
`<img>`. Deviation: none.

## FE↔BE contract

`N/A — no contract change.` `VenueSummary.location` and the backend `VenueSummaryView`'s
`VenueLocation` shipped with #1099; this slice only consumes them. No DTO, endpoint, status
code or error shape moves.

## Execution status

**Stage pointer:** `plan — doc written, awaiting phase 0`

**Next action:** Run the Skill-routing gate for backend Java (`riviera-java-conventions` +
`riviera-modulith`), then start phase 0 red: extend `VenueCatalogVisibilityIT` with
`listOmitsPinnedVenueOfSuspendedOperator`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend: the fence proven for a pinned venue (AC-10) | | |
| 1 — Pure pin derivation + `VenueCard` extraction (AC-1) | | |
| 2 — `RivieraMap` grows multi-pin (AC-2, AC-3) | | |
| 3 — The Liquid Glass preview card (AC-6) | | |
| 4 — Wire Discover: pins, selection, preview, card highlight (AC-7, AC-8) | | |
| 5 — e2e: pin → preview → venue page, filters, the network guard (AC-4, AC-5, AC-9, AC-11) | | |
| 6 — `CONTEXT.md` + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| | *(none yet)* | | |

---

## File structure

- `docs/plans/venue-pins-discover-map.md` — this plan
- `platform/src/test/java/ai/riviera/platform/venue/VenueCatalogVisibilityIT.java` — AC-10: the pinned-venue fence case + its fixture helper
- `frontend/src/app/shared/riviera-map.ts` — the generic `pins`/`selectedPin` inputs, `pinSelected` output, `MapPin`, pin-button build + marker sync, `focusPin()`
- `frontend/src/app/shared/riviera-map.spec.ts` — AC-2, AC-3
- `frontend/src/app/pages/home/venue-card.ts` — the `VenueCard` view model, moved out of `home.ts` (R-5)
- `frontend/src/app/pages/home/venue-pins.ts` — AC-1: the pure `venuePins()` derivation
- `frontend/src/app/pages/home/venue-pins.spec.ts` — AC-1
- `frontend/src/app/pages/home/venue-preview-card.ts` — the preview component
- `frontend/src/app/pages/home/venue-preview-card.html` — its Liquid Glass template
- `frontend/src/app/pages/home/venue-preview-card.spec.ts` — AC-6
- `frontend/src/app/pages/home/home.ts` — pins/selection wiring, `location` on the card view
- `frontend/src/app/pages/home/home.html` — map bindings, the preview, the selected-card marking
- `frontend/src/app/pages/home/home.spec.ts` — AC-7, AC-8
- `frontend/src/app/pages/home/home.a11y.spec.ts` — AC-9 (axe, preview open)
- `frontend/src/app/pages/home/home.contrast.spec.ts` — AC-9 (preview card inks)
- `frontend/e2e/discover-map.e2e.ts` — AC-4, AC-5, AC-9, AC-11
- `CONTEXT.md` — the **riviera map** entry gains the pin and the preview card

---

## Phase 0 — Backend: the fence proven for a pinned venue

**Files:** Modify `platform/src/test/java/ai/riviera/platform/venue/VenueCatalogVisibilityIT.java`

- [ ] **Step 1: Write the failing test** — a pinned venue of an ACTIVE operator is listed
  *with* its location; suspending the owner removes the row entirely.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew --console=plain test --tests
  "*VenueCatalogVisibilityIT*"` → FAIL (the helper/assertions do not exist yet)
- [ ] **Step 3: Minimal implementation** — no production change is expected; the fence
  already holds. If it passes on first write, that is the point of AC-10 (prove, don't
  assume) — record it as such rather than inventing a change.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Prove the catalogue fence hides a pinned venue (#1101)"`
- [ ] **Step 7: Open the draft PR** (first phase commit — CI fires on `pull_request` only)
  and update the execution status in the same commit window.

## Phase 1 — Pure pin derivation + `VenueCard` extraction

**Files:** Create `frontend/src/app/pages/home/venue-card.ts`, `venue-pins.ts`,
`venue-pins.spec.ts` · Modify `home.ts`

- [ ] **Step 1:** `venue-pins.spec.ts` red — list order kept, null/absent location omitted,
  label is the venue name, id is the venue id as a string.
- [ ] **Step 2:** `npm test -- venue-pins` → FAIL
- [ ] **Step 3:** Move `VenueCard` to `venue-card.ts` (adding `location`), write `venuePins()`.
- [ ] **Step 4:** `npm test -- venue-pins home` → PASS
- [ ] **Step 5–7:** audit · commit · status

## Phase 2 — `RivieraMap` grows multi-pin

**Files:** Modify `frontend/src/app/shared/riviera-map.ts`, `riviera-map.spec.ts`

- [ ] **Step 1:** Spec red for AC-2 and AC-3 against `FakeMapEngine` — one marker per pin in
  feed order, button element named by the label, removal on drop, `pinSelected` on activation,
  no map click.
- [ ] **Step 2:** `npm test -- riviera-map` → FAIL
- [ ] **Step 3:** `MapPin`, the `pins`/`selectedPin` inputs, `pinSelected`, identity-keyed
  marker sync (R-2), `stopPropagation` (R-3), `focusPin()`. The single-pin placement contract
  is left exactly as it is.
- [ ] **Step 4:** `npm test -- riviera-map console-venue-map` → PASS (the operator console is
  the existing single-pin consumer and must not move)
- [ ] **Step 5–7:** audit · commit · status

## Phase 3 — The Liquid Glass preview card

**Files:** Create `venue-preview-card.ts|.html|.spec.ts`

- [ ] **Step 1:** Spec red for AC-6 and the card's content contract.
- [ ] **Step 2:** `npm test -- venue-preview-card` → FAIL
- [ ] **Step 3:** The component: `role="dialog"` labelled by its heading, cover photo through
  the existing slideshow + `appPhotoScrim`, name, `beach · region`, rating, from-price,
  closed-for-season chip, a `routerLink` to `/venues/:id` with the date, a close button at the
  touch floor.
- [ ] **Step 4:** `npm test -- venue-preview-card` → PASS
- [ ] **Step 5–7:** audit · commit · status

## Phase 4 — Wire Discover

**Files:** Modify `home.ts`, `home.html`, `home.spec.ts`, `home.a11y.spec.ts`, `home.contrast.spec.ts`

- [ ] **Step 1:** Spec red for AC-7 and AC-8 (+ the a11y/contrast additions of AC-9).
- [ ] **Step 2:** `npm test -- home` → FAIL
- [ ] **Step 3:** `pins` computed, `selectedVenueId` linkedSignal, preview render, Escape on
  the map panel, map-tap close, focus return, selected-card `aria-current` + scroll.
- [ ] **Step 4:** `npm test -- home` then `npm run test:a11y` → PASS
- [ ] **Step 5–7:** audit · commit · status

## Phase 5 — e2e

**Files:** Modify `frontend/e2e/discover-map.e2e.ts`

- [ ] **Step 1:** Specs red for AC-4, AC-5, AC-9 (credit clearance, touch targets) and AC-11
  (the extended real-engine guard, with the fixture gaining locations + a mocked same-origin
  cover photo per R-4).
- [ ] **Step 2:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y --
  discover-map` → FAIL
- [ ] **Step 3:** Fix whatever the real browser disagrees with (clearance values, tab order).
- [ ] **Step 4:** same command → PASS
- [ ] **Step 5–7:** audit · commit · status

## Phase 6 — `CONTEXT.md` + close-out

**Files:** Modify `CONTEXT.md`, this plan

- [ ] **Step 1:** The **riviera map** entry gains the pin and the preview card.
- [ ] **Step 2:** Run `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 3:** Write the close-out into this, the last code-touching commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- venue-pins` → green. Verified at commit `<sha>`.
- [ ] **AC-2:** `npm test -- riviera-map` → green. Verified at commit `<sha>`.
- [ ] **AC-3:** `npm test -- riviera-map` → green. Verified at commit `<sha>`.
- [ ] **AC-4:** `npm run test:e2e:a11y -- discover-map` → green. Verified at commit `<sha>`.
- [ ] **AC-5:** `npm run test:e2e:a11y -- discover-map` → green. Verified at commit `<sha>`.
- [ ] **AC-6:** `npm test -- venue-preview-card` → green. Verified at commit `<sha>`.
- [ ] **AC-7:** `npm test -- home` → green. Verified at commit `<sha>`.
- [ ] **AC-8:** `npm test -- home` → green. Verified at commit `<sha>`.
- [ ] **AC-9:** `npm run test:a11y` + `npm run test:e2e:a11y -- discover-map` → green. Verified at commit `<sha>`.
- [ ] **AC-10:** `./gradlew test --tests "*VenueCatalogVisibilityIT*"` → green. Verified at commit `<sha>`.
- [ ] **AC-11:** `npm run test:e2e:a11y -- discover-map` → green. Verified at commit `<sha>`.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
