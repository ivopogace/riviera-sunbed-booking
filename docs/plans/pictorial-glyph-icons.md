# Pictorial glyphs → inline-SVG icon components Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** No pictorial symbol-block or emoji codepoint is rendered as a mark in any template;
every one is an inline-SVG `shared/` component on the `clock-icon.ts` contract (ICON-1..6), and
a source sweep fails the build if one returns.

**Architecture:** One `@Component` per drawing in `shared/` (no registry, no variant input), sized
by presentation attributes and resized at the call site with `[&_svg]:size-[Npx]`. Where a
glyph's meaning rested on a *pair* of codepoints (★/☆, ✓/●), the pair becomes one geometry
whose fill the call site sets, so the distinction is structural rather than font-dependent.
`appFailureIcon` stays a directive (a surface); only its content becomes a component.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no tables or migrations.

**Source of intent:** GitHub issue #1188, widened at intake by the maintainer (see Resolved).

**Skills consulted:** `riviera-sdlc` (the intake gate found ~15 unlisted sites sharing a job with
listed ones; the maintainer folded them all in) · `riviera-plan-doc` (forced the sweep AC and
the parity ledger for the star rows' retired `starGlyphs()`) · `tdd` (each icon red via its spec
before the file exists; each call-site swap red via the spec that asserted the glyph) ·
`riviera-review-overlay` (ran with `code-review:code-review` over `d55fb4df..a7a38cea`; 1 finding, F-3) · `riviera-docs-freshness` (**ran** over `d55fb4df..HEAD`, 0 findings; retired the merged `shoreline-snap.md` plan) ·
`riviera-frontend` (every icon in `shared/`, no new cross-feature edge) · `riviera-tailwind`
(ICON-1..6; `[&_svg]:size-*` at call sites; toHaveCSS size pins in the mocked e2e) ·
`angular-developer` (signal inputs on `StarRow`; `@switch` over a state kind instead of a
string glyph) · `playwright-cli` (mocked-suite pins for rendered size and star fill) ·
`riviera-local-debug` (scoped Vitest runs; Chromium path for `test:e2e:a11y`)

**Branch:** `claude/sdlc-1188-8rpgto` (cloud session's designated branch, standing in for
`feature/pictorial-glyph-icons`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given any new icon component, when it renders, then the host and the inner svg
  are `aria-hidden`, the host is `display: contents`, the stroke is `currentColor` with no
  colour of its own, size is a presentation attribute (13 by default), and every child is in
  the SVG namespace. *Seam:* the component's rendered DOM (TestBed). *Pinned by:*
  `shared/<name>-icon.spec.ts`, each through `testing/icon-contract.ts`'s `iconContract()`.
- [x] **AC-2:** Given the app's non-spec sources, when the sweep reads them with comments
  stripped, then none of `✕ × ⚠ ⏰ ★ ☆ ⏳ ▲ ▼ ▾ ⛱ ✉ ← 🌧 🎉 🏖 🔒 ✓ ●` appears, except the
  recorded residue (the `R×C` grid-size string in `layout-editor.ts`, the deferred price-pin
  fallback `●` in `venue-pin-layer.html`). *Seam:* the source tree as text. *Pinned by:*
  `pictorial-glyph-sweep.spec.ts`.
- [x] **AC-3:** Given any close/dismiss control (booking dialog, find booking, lightbox, coast
  picker, head note, map note, set editor ×2), when it renders, then its mark is
  `app-cross-icon` and its accessible name is unchanged. *Seam:* each component's DOM.
  *Pinned by:* the sweep (AC-2) + `cross-icon.spec.ts`; existing `aria-label` specs unchanged.
- [x] **AC-4:** Given the star-rating radiogroup with 3 chosen, when it renders, then stars 1–3
  wear the filled treatment and 4–5 the outline one, all five sharing one path geometry, so
  selection survives without colour (WCAG 1.4.1). *Seam:* `StarRating`'s DOM + rendered CSS.
  *Pinned by:* `star-rating.spec.ts` ("conveys selection by fill, not colour") +
  `review-a-stay.e2e.ts` (computed `fill` of a chosen vs unchosen star).
- [x] **AC-5:** Given a stored rating of 4, when a read-only star row renders (venue reviews,
  admin reviews, own review), then four filled and one outline `app-star-icon` render under an
  unchanged accessible name ("4 out of 5 stars"). *Seam:* `StarRow`'s DOM. *Pinned by:*
  `star-row.spec.ts` + `venue-reviews.spec.ts`.
- [x] **AC-6:** Given a failure panel, when it renders, then `appFailureIcon` is still a
  directive and the svg inside it is 26 px. *Seam:* rendered CSS. *Pinned by:*
  `failure-panel.spec.ts` (class) + `fixed-fill-state-skins.e2e.ts` `toHaveCSS('width','26px')`.
- [x] **AC-7:** Given the daily view, when a set is staff-marked / booked online, then its tile
  shows `app-check-icon` / `app-dot-icon` beside the number (glyph + fill, never colour alone).
  *Seam:* `DailyViewTab` DOM. *Pinned by:* `daily-view-tab.spec.ts` + `operator-daily.e2e.ts`.
- [x] **AC-8:** `clock-icon.ts`'s "and stay" paragraph states the decision #1188 records.
  *Pinned by:* review.
- [x] **AC-9:** Out-of-scope marks untouched: `+`/`−` zoom, `·`, `€`, `⌘K`, `→` in running
  strings, the price-pin `●`. *Pinned by:* AC-2's residue list + diff review.
- [x] **AC-10:** `npm run lint`, `format:check`, `test`, `test:a11y`, `test:e2e:a11y` green; the
  three `scripts/check-*.mjs` guards clean; touch targets and `discover-sheet.e2e.ts` at 320 px
  green.

## Non-goals

- The map zoom pair `+`/`−` (settled in the issue).
- Typographic characters: `·`, `€`, `⌘K`, `→` inside running strings, the `R×C` dimension sign.
- The price-pin fallback `●` in `venue-pin-layer.html` (a no-price venue's pin face): deferred to
  #1195. Kept out of this slice's scope, not because it is text — `pinWidth(null)` is the fixed
  44 px, so converting it moves no pin geometry.
- Migrating the four pre-existing icons' specs onto `iconContract()`.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `starGlyphs(n)` text row, `aria-hidden`, named by `starsOutOfFive` on its wrapper | preserved | `StarRow` renders five `app-star-icon`s; the wrapper keeps its `aria-label` |
| `starGlyphs` exported from `shared/rating.ts` | dropped | no caller left; its spec block goes with it |
| star-rating filled ★ vs outline ☆ | preserved, made structural | one geometry, `fill-current` vs `fill-none` |
| emoji colour (🌧 🎉 🏖 🔒) | changed | line icons inherit the surrounding ink (issue: screenshot each) |
| `stateGlyph()` returning a character | changed | returns a state kind; the template `@switch`es to a component |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An svg box is wider than its glyph; a crowded row (discover head at 320 px) overflows | M | M | 13 px default; run `discover-sheet.e2e.ts` + `touch-targets*.e2e.ts` | agent | closed — `discover-sheet`/`touch-targets*` green at 320 px; screenshot at 320 px |
| R-2 | Tailwind preflight makes `svg` `display:block`, so an icon inside running text (requests ⚠, 🎉 heading, 🌧 button, sea banner) breaks the line | H | M | those call sites become `inline-flex items-center gap-*` or give the svg `inline` + an alignment | agent | closed — inline-flex rows or `[&_svg]:inline` + align (ICON-8) |
| R-3 | Specs/e2e that assert glyph text (`'⛱ 3'`, `'Today ▾'`, `hasText: '✓'`) fail | H | L | enumerated at intake; each updated with its swap | agent | closed — every glyph-text assertion re-targeted to the icon |
| R-4 | Star fill class loses to the svg's `fill="none"` attribute | L | H | CSS beats presentation attributes; pinned by computed `fill` in e2e (AC-4) | agent | closed — `review-a-stay.e2e.ts` reads the rendered fill |
| R-5 | Medallion ink relationship (fixed fill + fixed ink) drifts | L | M | icons take `currentColor`; the medallion keeps its ink class; `fixed-fill-state-skins.e2e.ts` re-targets the medallion by its icon | agent | closed — medallion ink + svg size pinned in `fixed-fill-state-skins.e2e.ts` |

## Open questions / Assumptions

None open.

### Resolved

- **Sizing by drawn extent** (assumption) — held: every call-site box is pinned in the mocked e2e (`icon-sizes.e2e.ts` and the specs it names); screenshots at 320/390/1280 px.
- **`ClockIcon` for ⏰, `LockIcon` for 🔒** (assumption) — held through the review gate; both docs name their two jobs.
- **One `CrossIcon` for close and the failed-payment medallion** (assumption) — held through the review gate.

- **Scope beyond the listed 24** — maintainer (intake, 2026-09-23): include the same-job sites
  (set-editor ✕ ×2, discover-head ▾ ×2, static ★ ×2 on home/venue-row, my-bookings ←, the
  `starGlyphs()` rows), the outcome-medallion family (✓/⏳/failure ✕), and daily-view's ✓/●.

## Availability & concurrency (invariant #2)

N/A — presentation only; no claim, booking or availability path changes. The beach map's
`beach-grid-frame` banners change glyph only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no behaviour added or moved between modules.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope (the pay page's 🔒 and ✓/⏳/✕ medallions are marks only).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | 13 icon components (`cross`, `star`, `check`, `hourglass`, `mail`, `alert`, `umbrella`, `chevron-down`, `triangle`, `arrow-left`, `rain`, `party`, `dot`) | new | presentational, `shared/` | none | — |
| FE-2 | `shared/star-row.ts` | new | presentational | `input.required<number>()` | — |
| FE-3 | `shared/star-rating.ts` | existing | form control | unchanged | Signal Forms (unchanged) |
| FE-4 | ~25 call-site templates across `booking/`, `venue/`, `operator/`, `admin/`, `pages/home/`, `shared/` | existing | markup swap | `daily-view-tab` `stateGlyph` → state kind | — |

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** DONE — merged via PR #1194

**Next action:** none — merge close-out steps 2–3 and 6–7 are post-merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan + draft PR | ✅ | 5fd49962 |
| 1 — `CrossIcon`: close controls + failure medallion | ✅ | 785784e9 |
| 2 — `StarIcon` + `StarRow`: rating marks | ✅ | a4be93c0 |
| 3 — `CheckIcon`/`HourglassIcon`/`MailIcon` (+ `DotIcon`, daily-view ✓/● pulled forward): medallions + waiting | ✅ | cdf94bc4 |
| 4 — `AlertIcon`/`UmbrellaIcon`/`ClockIcon` (+ `ChevronDownIcon`, discover-head ▾ pulled forward — its specs assert ⛱ and ▾ in one string): failures, alerts, beach | ✅ | 09358e66 |
| 5 — `TriangleIcon`/`ArrowLeftIcon`: wayfinding | ✅ | 9058cb1b |
| 6 — `RainIcon`/`PartyIcon`/`LockIcon`: emoji | ✅ | 62a2f3c8 |
| 7 — sweep, prose freshness, e2e size pins, full gates | ✅ | a7a38cea, the close-out commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-5 | Sonar (`typescript:S7721`, Major) | `testing/icon-contract.ts`'s `svgOf` captured nothing yet lived inside `iconContract()` | fixed in the close-out: moved to module scope; Sonar list re-read empty before merge |
| F-4 | self-review, filing #1195 | the pin `●` residue was justified as "measured as text by the crowding maths"; `pinWidth(null)` is a fixed 44 px, so that was false | fixed in the close-out: comment + plan reworded, conversion deferred to #1195 |
| F-3 | review gate (`code-review:code-review` + overlay, ICON-4) | 28 of 34 call-site `[&_svg]:size-*` overrides had no rendered-size pin in the mocked e2e | fixed in the close-out commit: `e2e/icon-sizes.e2e.ts` + one pin in each spec already reaching a surface |
| F-2 | `check-inline-comments`, phase 4 | a touched doc comment in `failure-panel.ts` kept a `#858` provenance ref (guard judges a touched comment whole) | fixed in phase 5 |
| F-1 | self-review, phase 2 | set-editor's two close buttons are not flex, so preflight's block svg sat top-left in the 44 px box | fixed in phase 2 (`inline-flex items-center justify-center`) |

---

## File structure

- `docs/plans/pictorial-glyph-icons.md` — this plan
- `frontend/src/testing/icon-contract.ts` — the ICON-1..6 assertions every icon spec runs
- `frontend/src/app/pictorial-glyph-sweep.spec.ts` — AC-2's source sweep
- `frontend/src/app/shared/{cross,star,check,hourglass,mail,alert,umbrella,chevron-down,triangle,arrow-left,rain,party,dot}-icon.ts` — the icons
- `frontend/src/app/shared/{cross,star,check,hourglass,mail,alert,umbrella,chevron-down,triangle,arrow-left,rain,party,dot}-icon.spec.ts` — their specs
- `frontend/src/app/operator/daily-view-tab.html` — state marks
- `frontend/src/app/shared/star-row.ts|.spec.ts` — the read-only five-star row
- `frontend/src/app/shared/{clock-icon,lock-icon,failure-panel,star-rating,rating,outcome-card,photo-lightbox,beach-grid-frame,riviera-map}.ts|.html|.spec.ts` — reused icons' docs, call sites, specs
- `frontend/src/app/booking/{booking-dialog,find-booking,booking-pay,booking-confirmation,request-confirmation,booking-view,my-bookings,review-panel}.ts|.html|.spec.ts` — call sites, specs
- `frontend/src/app/venue/{venue-map,venue-reviews}.ts|.html|.spec.ts` — call sites, specs
- `frontend/src/app/operator/{set-editor,requests-tab,pending-approval-banner,payouts-tab,daily-view-tab}.ts|.html|.spec.ts` — call sites, specs
- `frontend/src/app/admin/admin-reviews.ts|.spec.ts` — call site, spec
- `frontend/src/app/pages/home/{home,venue-row,discover-head,coast-picker}.ts|.html|.spec.ts` — call sites, specs
- `frontend/e2e/*.e2e.ts` — size pins (`icon-sizes.e2e.ts` new), star fill, glyph-text assertions re-targeted
- `frontend/src/app/**/*.contrast.spec.ts`, `frontend/src/app/**/*.a11y.spec.ts` — prose that named a retired glyph
- `frontend/src/{tailwind.css,testing/glass-tokens.ts,app/shared/deadline.ts,app/operator/requests-tab.ts}` — prose that named a retired glyph
- `.claude/skills/riviera-tailwind/SKILL.md` — ICON-7 (no pictorial character; the sweep) and ICON-8 (fill-by-call-site; inline svg in text)
- `docs/plans/shoreline-snap.md` — retired at close-out (its PR #1187 merged)
- `frontend/src/app/pages/home/venue-row.html` — static star
- `frontend/src/app/pages/home/home.html` — failure mark, static star
- `frontend/src/app/operator/requests-tab.html` — alert, clock, check
- `frontend/src/app/operator/payouts-tab.html` — rain

---

## Phases

Each phase: per icon, write `<name>-icon.spec.ts` (red: module missing) → the component
(green) → per call site, update the spec that asserted the glyph (red) → swap (green) → scoped
`npx ng test --include` over the touched specs → commit `… (#1188)` + Execution status.

1. **`CrossIcon`** — booking-dialog, find-booking, photo-lightbox, coast-picker, discover-head
   note, riviera-map note, set-editor ×2; booking-pay failure medallion.
2. **`StarIcon` + `StarRow`** — star-rating (AC-4 spec), venue-map/home/venue-row static star,
   venue-reviews/admin-reviews/review-panel rows; retire `starGlyphs`.
3. **`CheckIcon`, `HourglassIcon`, `MailIcon`** — outcome-card, booking-pay done badge,
   booking-confirmation, requests-tab empty state, request-confirmation (✉ badge, ⏳ info),
   pending-approval-banner.
4. **`AlertIcon`, `UmbrellaIcon`, reuse `ClockIcon`** — `appFailureIcon` sizes the svg;
   home/venue-map ⚠, venue-map 🏖, requests-tab ⚠ inline + ⏰ chip, discover-head ⛱;
   rewrite `clock-icon.ts`'s paragraph.
5. **`ChevronDownIcon`, `TriangleIcon`, `ArrowLeftIcon`** — discover-head ▾ ×3,
   beach-grid-frame ▲/▼, venue-map + my-bookings ←.
6. **`RainIcon`, `PartyIcon`, reuse `LockIcon`, `DotIcon`** — payouts-tab 🌧, booking-view 🎉,
   booking-pay 🔒, daily-view ✓/●.
7. **Sweep + gates** — `pictorial-glyph-sweep.spec.ts`; e2e `toHaveCSS` size pins; lint,
   format, test, a11y, full mocked e2e, guards; screenshots of the emoji surfaces.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-23 | intake | pictorial codepoints in non-comment template/TS lines | python sweep over `src/app` for U+2190–21FF, 2300–23FF, 25A0–27BF, 2B00–2BFF, 2100–214F, U+1F000–1FAFF, U+00D7, U+2212 | 24 listed + 15 unlisted + typographic residue | unlisted put to the maintainer; all folded in except the pin `●` (deferred to #1195) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-9:** `npx ng test --watch=false` → 312 files / 3724 tests green; `npm run test:a11y` → 109 / 1077 green (at `a7a38cea`).
- [x] **AC-10:** `npm run lint`, `format:check` clean; full `test:e2e:a11y` → 733 passed at `a7a38cea`; the F-3 pins' 51 tests green; the four `scripts/check-*.mjs` guards clean.

## Self-review checklist

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] Frontend standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [x] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
