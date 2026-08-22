# Venue Photo Media Header Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the tourist beach-map page the venue's photos leave the availability card and
become a media header in the venue's identity zone — taller on desktop, with a warm empty
state and slideshow chrome proven at 3:1 over any photo — leaving the overview card as pure
status (count + bar).

**Architecture:** The band moves *into* the glass header as a full-bleed first child
(`-mx-[22px] -mt-5` against the header's own padding, clipped by the header's radius), so the
photos read as venue identity rather than as availability chrome. The slideshow's own chrome
stops depending on its consumer's scrim: the dot rail gets a dark backing and the step chips a
dark edge, both **new theme-invariant tokens** (`--riv-photo-chrome`, `--riv-photo-chrome-edge`)
proven at ≥3:1 over pure-white and pure-black photos — the same worst-case convention #142
established for the location overlay.

**Persistence:** N/A — frontend-only slice, no backend, no schema.

**Source of intent:** GitHub issue #704 (2026-08-19 design critique, finding 2); visual context
in the issue's design artboard link.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
band's *scrim* geometry, not just the band, moves with it, and that `.photo-band` is asserted
by an e2e spatial-order test) · `riviera-plan-doc` (this template — forced the behavior-parity
ledger that surfaced the loading-skeleton mirror, which the issue never mentions) · `tdd`
(each phase writes the failing spec first) · `riviera-review-overlay` (review gate — run at
ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 1 finding — the v3
artboard draws the band *below* the count line with a translucent sun, which this slice
diverges from; pointer added per `docs/design/README.md`, artboard left as drawn) ·
`riviera-tailwind` (arbitrary `min-[1024px]:` media variant over rem-based `lg:` — the repo's
px-query convention; token-first colours instead of literal rgba in the component;
`bg-(image:--riv-photo-grad)` stays an *image* utility) · `riviera-frontend` (placement: the
new contrast spec is `shared/photo-slideshow.contrast.spec.ts` beside the component it proves,
not in `venue/`, because both consumers share the chrome) · `angular-developer` + angular-cli
MCP (`search_documentation` "NgOptimizedImage fill sizes", v22: `fill` needs only a positioned
ancestor — no `width`/`height`, and `sizes`/`srcset` generation is a no-op under the generic
loader this app uses, so growing the band needs no image-directive change) · `playwright-cli`
(the mocked suite gets the geometry + placement assertions; measured boxes, never class lists)

**Branch:** `claude/tailwind-angular-mcp-docs-g6ygn0` — the cloud session's designated remote
branch stands in for `feature/<slug>` (`riviera-sdlc` § Remote/cloud addendum). It already
carried one unrelated, unmerged commit (`f4b222a`, the #736/#753 design-artboard docs) when the
session started; that commit is kept, not rebased away.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with photos, when the beach map renders, then the slideshow band
      is a descendant of the venue `<header>` (the identity zone) and the availability card
      contains only the count paragraph and its bar — no `.photo-band`.
      *Pinned by:* `venue-map.spec.ts` › "renders the photo band in the venue header, leaving
      the overview card as count + bar (#704)".
- [ ] **AC-2:** Given a ≥1024px viewport, when the beach map renders, then the band's measured
      height is ≥260px; at 390px it stays 150px.
      *Pinned by:* `discover-photos.e2e.ts` › "the venue banner is a media header: ≥260px on
      desktop, 150px on mobile (#704)".
- [ ] **AC-3:** Given a venue with no photos, when the band renders, then the empty-state sun is
      painted from **opaque** warm stops (no alpha composite against the cyan band gradient), so
      it reads warm on both themes.
      *Pinned by:* `venue-map.spec.ts` › "paints the no-photo empty state as an opaque warm sun
      (#704)".
- [ ] **AC-4:** Given the worst case any photo can present (pure white and pure black, plus both
      band-gradient stops), when the slideshow chrome composites over it, then the active dot,
      the inactive dot and the step chip's edge each reach ≥3:1 (WCAG 1.4.11).
      *Pinned by:* `shared/photo-slideshow.contrast.spec.ts` (all three cases).
- [ ] **AC-5:** Given the band in its new position, when the slideshow is stepped, then behavior
      is unchanged — own labelled controls outside the `aria-hidden` imagery, dots tracking the
      index, wrap at both ends, 44px touch targets — and axe reports no serious violations on
      both themes.
      *Pinned by:* `photo-slideshow.spec.ts` (unchanged behavior cases), `venue-map.spec.ts`
      cycle case, `discover-photos.e2e.ts` axe run, `touch-targets*.e2e.ts` sweep.

## Non-goals

- No change to which photos are shown, their order, upload, or moderation (`admin/`,
  `operator/` photo surfaces are untouched).
- No new slideshow behavior — no autoplay, no swipe gestures, no keyboard arrow handling
  beyond what the two step buttons already give.
- The Discover **card** band keeps its 150px height and its position inside the card; only its
  step-chip edge changes, and only because it is the same chrome defect.
- No `sizes`/`ngSrcset` tuning: the app uses NgOptimizedImage's generic loader, where srcset
  generation is disabled and `sizes` has no effect (angular.dev, v22 image-optimization guide).

## Behavior-parity ledger

> The band is *relocated and resized*, not rewritten — every behavior below must survive.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Band renders the venue's photos as `app-photo-slideshow` with `ownControls` | preserved | same component, same inputs, new parent element |
| Bottom-weighted `--riv-photo-scrim` layered over the band | preserved | the scrim span moves with the band (it is a sibling inside `.photo-band`) |
| `.photo-band` class queried by `venue-map.spec.ts` and `venue-map-pan.e2e.ts` | preserved | kept as an inert marker (`riviera-tailwind` rule 2); the e2e's *sea ↑ / promenade ↓* order still holds — the band moves further **up** |
| No-photo empty state = gradient band + sun disc, no "coming soon" pill | changed | same shape, but the sun's stops become opaque warm (AC-3); the pill still never renders |
| Overview card = count paragraph + bar + band | changed | band removed; the inner wrapper's `pb-[14px]` (the gap it left for the band) goes with it |
| Loading skeleton mirrors the loaded frame so nothing jumps (#744) | preserved | the 150px block moves from the skeleton overview card to the skeleton header, full-bleed, with the same responsive height as the real band |
| Dots: 6px, `bg-white` / `bg-white/45`, no backing | changed | 8px on a dark rail (AC-4); still 1 span per photo inside the `-dots` container, so both count assertions hold |
| Step chip: white glass + white border | changed | same glass, dark edge (AC-4); glyph, labels, hover and focus ring unchanged |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `overflow-hidden` on the header (needed to clip the full-bleed band to the 26px radius) clips a focus ring — the date input's `focus-visible:outline-offset-2` | low | med | the input sits 22px inside the panel's padding, well clear of the clip edge; the mocked e2e focuses it and asserts the outline is painted | this slice | closed — the assertion was missing when the review ran (F-2) and now exists in `discover-photos.e2e.ts` |
| R-2 | The dark dot rail lands on Discover's cards too (shared component) and reads as unwanted chrome there | med | low | deliberate — it is the same 1.4.11 defect; the rail is small, rounded and only renders with >1 photo. Computed-style diff in the e2e keeps the rest of the card unchanged | this slice | closed — accepted as shipped; the *layout* consequence it did not anticipate (the rail overrunning the location line) surfaced at the review gate as F-1 and is fixed |
| R-3 | Moving the band changes the LCP element/position; a mis-sized band causes CLS on the venue page | low | med | the band's height is fixed per breakpoint (no intrinsic-size dependency) and the loading skeleton mirrors it exactly, so the frame does not move when the map lands | this slice | closed — skeleton parity asserted by `venue-map.spec.ts`; no CLS mechanism remains |
| R-4 | Contrast thresholds pass in the spec's arithmetic but the shipped CSS uses a different alpha (spec/CSS drift) | med | high | the tokens live in `styles.scss`; the spec mirrors them beside the other token mirrors in `testing/glass-tokens.ts`, and the e2e reads the **computed** background of the rail so a token edit that misses the spec still fails | this slice | closed — the e2e reads the computed rail background and chip border, so spec/CSS drift fails a test |

## Open questions / Assumptions

- **Assumption:** "identity zone" is satisfied by placing the band *inside* the glass header
  rather than as a sibling directly under it — the issue names both as acceptable ("in or
  directly under the glass header"); inside is chosen because it makes the photos part of the
  venue's card rather than a floating strip. — *Owner:* this slice · *Resolves by:* phase 1
- **Assumption:** ~260px is read as a floor, not a target; 264px is used so the band clears it
  with a whole-pixel value at the 780px shell width (≈2.95:1). — *Owner:* this slice ·
  *Resolves by:* phase 1

### Resolved

- **Assumption (identity zone → inside the header):** held. The band ships as the header's
  full-bleed first child; AC-1 pins it with `band.closest('header')`. — `cbf313c`
- **Assumption (264px clears the ~260px floor):** held. The e2e measures ≥260px at the
  desktop viewport and exactly 150px at 390px. — `8dd7e14`

## Availability & concurrency (invariant #2)

N/A — presentation only. No booking, availability, or `(set, date)` write path is touched;
the map grid, its tiles and the booking dialog are not edited.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` | existing | template of a standalone component | `venueView()` computed signal (unchanged) | none |
| FE-2 | `shared/photo-slideshow.ts` | existing | standalone presentational component | `input()` + `linkedSignal` (unchanged) | none |
| FE-3 | `pages/home/home.html` | existing | template of a standalone component | unchanged | none |
| FE-4 | `styles.scss` | existing | theme token registry | — | — |

**Standards:** standalone components, `input()`, `@if`/`@for`, `NgOptimizedImage` `fill` on a
positioned ancestor. No deviation. Styling is Tailwind throughout — no `.scss` component file is
created or touched beyond the global token registry (`riviera-tailwind`: Tailwind is the
default).

## FE↔BE contract

N/A — no contract change. The venue map view (`photos`, `coverPhoto`) is consumed exactly as
today.

## Execution status

**Stage pointer:** `merge close-out — plan doc finalized, awaiting merge`

**Next action:** merge via PR #754, then tick nothing else in the repo — the only remaining
close-out items are GitHub-only (no parent epic here, no deferred findings to propagate).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Slideshow chrome: tokens + 3:1 proofs | ✅ | `b149c0f` |
| 1 — The band becomes a media header | ✅ | `cbf313c` |
| 2 — The warm empty state | ✅ | `cbf313c` (same template, one commit) |
| 3 — e2e geometry + placement | ✅ | `8dd7e14` |
| 4 — review-gate findings F-1, F-2 | ✅ | `9fae29c` |
| 5 — close-out (docs-freshness pointer, plan final state) | ✅ | this commit |

**Merged via PR #754.**

**Gates:** CI green on `9fae29c` (all 8 checks). Review gate **ran** — `/code-review` over
`origin/main...HEAD` with `riviera-review-overlay` layered on; 2 findings, both fixed in
`9fae29c` (see the findings register). Sonar gate green **and its reported list pulled and
empty**: `new_lines` 76, 0 new bugs / vulnerabilities / code smells / hotspots, 0.0%
duplication, 100.0% new-code coverage — the non-empty `measures` response rules out the
false-clean read on an unanalyzed PR.

**Local verification at `8dd7e14`:** `npm run lint`, `npm run format:check`, `npm test`
(1651 unit tests), `npm run build`, and the full mocked Playwright suite
(`npm run test:e2e:a11y`, 267 tests) all green, plus the five `scripts/check-*.mjs`
hygiene guards. CI itself has not run — it fires on the `pull_request` event only.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (`/code-review`) | The widened dot rail (52px at 3 photos, inset 13px) overlaps Discover's `.photo-location`, whose `right-[52px]` reservation was sized for the old 30px rail — a 13px overlap, and the rail's `z-[1]` paints its dark pill over the beach·region text on every 3-photo card | fixed — reservation re-derived to `right-[72px]` (65px rail + 7px clearance, the clearance the old geometry had), and a **measured** non-overlap assertion added to `discover-photos.e2e.ts`; confirmed the guard fails at `right-[52px]` before passing at 72 |
| F-2 | review gate (`/code-review`, process note) | Risk R-1 claimed its mitigation was an e2e focus-ring assertion that was never written — the ledger claimed coverage that did not exist | fixed — the assertion now exists (`map-date` focused, `outline-width` 3px) rather than the claim being softened |

---

## File structure

- `docs/plans/venue-photo-media-header.md` — this plan
- `frontend/src/styles.scss` — the two new slideshow-chrome tokens
- `frontend/src/testing/glass-tokens.ts` — worst-case photo stops + chrome token mirrors, shared by the two photo contrast specs
- `frontend/src/app/shared/photo-slideshow.ts` — dot rail, dot size, step-chip edge
- `frontend/src/app/shared/photo-slideshow.spec.ts` — chrome assertions beside the behavior ones
- `frontend/src/app/shared/photo-slideshow.contrast.spec.ts` — the WCAG 1.4.11 proofs (new)
- `frontend/src/app/pages/home/home.contrast.spec.ts` — consumes the shared worst-case stops
- `frontend/src/app/pages/home/home.html` — the same step-chip edge on Discover's external controls
- `frontend/src/app/venue/venue-map.html` — band into the header, responsive height, warm sun, skeleton mirror
- `frontend/src/app/venue/venue-map.spec.ts` — placement + empty-state assertions
- `frontend/e2e/discover-photos.e2e.ts` — measured band geometry and placement

- `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` — the close-out divergence pointer (the
  artboard's drawing is left untouched)

Carried in from the branch's pre-existing commit `f4b222a` (#736/#753), **not** authored by this
slice — listed because the branch's diff against `origin/main` contains them (the artboard above
appears in both: `f4b222a` added its earlier pointers, this slice adds the #704 one):

- `.claude/skills/riviera-docs-freshness/SKILL.md`
- `docs/design/README.md`

---

## Phase 0 — Slideshow chrome: tokens + 3:1 proofs

**Files:** Modify `frontend/src/styles.scss` · `frontend/src/testing/glass-tokens.ts` ·
`frontend/src/app/shared/photo-slideshow.ts` · `frontend/src/app/pages/home/home.html` ·
`frontend/src/app/pages/home/home.contrast.spec.ts` · Create
`frontend/src/app/shared/photo-slideshow.contrast.spec.ts` · Test
`frontend/src/app/shared/photo-slideshow.spec.ts`

- [x] **Step 1: Write the failing tests** — the new contrast spec asserts the active dot, the
      inactive dot and the step-chip edge each reach `AA_LARGE` over `WORST_PHOTOS`; the unit
      spec asserts the dots container carries the rail token and the chip the edge token.
- [x] **Step 2: Run them, verify they fail** — `npm test -- photo-slideshow`
- [x] **Step 3: Minimal implementation** — add `--riv-photo-chrome` (`rgba(13,40,40,0.7)`) and
      `--riv-photo-chrome-edge` (`rgba(12,42,51,0.6)`) to the `:root` block; consume them in the
      component and in Discover's external chips.
- [x] **Step 4: Run them, verify they pass** — `npm test -- photo-slideshow home`
- [x] **Step 5: Generalization-audit pass** — see the log below.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

## Phase 1 — The band becomes a media header

**Files:** Modify `frontend/src/app/venue/venue-map.html` · Test
`frontend/src/app/venue/venue-map.spec.ts`

- [x] **Step 1: Write the failing test** — the band is inside the `<header>`; the availability
      card holds no `.photo-band`; the band declares both heights.
- [x] **Step 2: Run it, verify it fails** — `npm test -- venue-map.spec`
- [x] **Step 3: Minimal implementation** — full-bleed band as the header's first child
      (`-mx-[22px] -mt-5 mb-[18px]`, header `overflow-hidden`), `h-[150px]
      min-[1024px]:h-[264px]`; the overview card loses the band and its bottom gap; the loading
      skeleton mirrors the move.
- [x] **Step 4: Run it, verify it passes** — `npm test -- venue-map`
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

## Phase 2 — The warm empty state

**Files:** Modify `frontend/src/app/venue/venue-map.html` · Test
`frontend/src/app/venue/venue-map.spec.ts`

- [x] **Step 1: Write the failing test** — the no-photo sun's gradient stops are opaque hex, not
      `rgba(...)`, and it scales with the band.
- [x] **Step 2: Run it, verify it fails** — `npm test -- venue-map.spec`
- [x] **Step 3: Minimal implementation** — opaque warm radial stops plus a warm glow shadow.
- [x] **Step 4: Run it, verify it passes** — `npm test -- venue-map`
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

## Phase 3 — e2e geometry + placement

**Files:** Modify `frontend/e2e/discover-photos.e2e.ts`

- [x] **Step 1: Write the failing test** — measured band height at 1280px and at 390px; the band
      sits above the availability card; the rail's computed background is painted.
- [x] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- discover-photos`
- [x] **Step 3: Minimal implementation** — none needed beyond phases 0–2 (the specs pin what
      those shipped).
- [x] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y -- discover-photos`
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-22 | Phase 0 — the step-chip edge was invisible over a light photo | Every step-control chip painted over an arbitrary uploaded photo — i.e. every element carrying the `--riv-mode-chip-glass` fill, whether rendered by the shared component or duplicated at a call site | `grep -rn "riv-mode-chip-glass" frontend/src` | 5 sites, of which 4 are step chips — `shared/photo-slideshow.ts` (prev + next) and `pages/home/home.html` (prev + next, external controls) | Fixed all 4. The Discover pair is *not* rendered by the component (nested controls inside the card `<a>` are invalid HTML), so a component-only fix would have left half the population unfixed. The 5th site, Discover's `.mode-chip`, is deliberately left alone: it is a **text** label whose ink is already AA-proven on the same glass, so 1.4.11 does not reach its border. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npm test -- venue-map.spec` → the placement case passes.
- [x] **AC-2:** `npm run test:e2e:a11y -- discover-photos` → the measured-geometry case passes.
- [x] **AC-3:** `npm test -- venue-map.spec` → the empty-state case passes.
- [x] **AC-4:** `npm test -- photo-slideshow` → all three 1.4.11 cases pass.
- [x] **AC-5:** `npm test` (unit) + `npm run test:e2e:a11y` (axe on both themes) → green;
      the touch-target sweep re-measured the enlarged step controls.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] **No JPA** introduced (invariant #1) — no backend code in the diff.
- [x] **Availability** section filled (N/A justified); no `(set, date)` write path touched.
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section N/A — frontend-only.
- [x] **Payment/payout** section N/A — no money in scope.
- [x] Timezone untouched (invariant #6).
- [x] No Flyway migration needed (invariant #12).
- [x] **Frontend** standards met; Tailwind-first; no `as any` on the contract.
- [x] Execution status at HEAD matches reality.
- [x] Risk register rows carry mitigations; Open Questions carry owners and resolve-by phases.
- [x] **Close-out written in THIS PR** — final state committed here, citing `merged via PR #754`.
- [x] **The review gate ran in full** — `/code-review` (invocation ladder rung 1, the Skill
      probe succeeded) plus `riviera-review-overlay`; both findings fixed, none deferred.
