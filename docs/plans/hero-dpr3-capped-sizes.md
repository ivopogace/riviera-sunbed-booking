# Gallery hero DPR-3 capped `sizes` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Below the `min-[1024px]` step, the gallery hero's 220px-tall box fetches a stored
candidate that covers its painted width at DPR 3, without changing any DPR-1 or DPR-2
selection for a 3:2 or 16:9 upload.

**Architecture:** One clause changes — `CONTAIN_SIZES.galleryHero`'s narrowest clause becomes
`min(330px, 66vw)`. The hero's paint **caps** at `boxHeight × aspect` once the 220px box stops
being width-bound, while a bare `vw` keeps growing; a capped length is the only aspect-blind
form that tracks that cap, which is why no single coefficient fits (the issue's History records
the impossibility derivation and why it holds only for a bare `k · vw`). The cost is that a
`px` now sits in a `sizes` string: `NgOptimizedImage`'s `assertNoComplexSizes` lets it through
only because its regex anchors on `") "`, `", "` or start-of-string, so a `px` after `(` is
not seen — a **regex gap, not documented behaviour**, held by `photo-slideshow.spec.ts`'s
canary, which turns red at upgrade time naming the value (proved by mutation, R-2).

**Persistence:** N/A — frontend-only, no table and no migration touched (invariant #1 not in
play). `PhotoProcessor`'s rendition boxes are **read** for the arithmetic, never changed.

**Source of intent:** GitHub issue #1072 (raised by the review gate on PR #1071 / issue #1069).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's AC-2 "every DPR-1 and DPR-2 selection is unchanged" holds only inside the registry's
stated 3:2–16:9 aspect band, see A-1) · `riviera-plan-doc` (this template — forced the
aspect-by-aspect AC split and the seam names) · `tdd` (phase 0 pins the defect as a red e2e
before the value moves; every new assertion is mutation-checked) · `riviera-review-overlay`
(review gate — runs at ready-for-review) · `riviera-docs-freshness` (**ran** at close-out over
`origin/main..HEAD`, findings in the register) · `riviera-local-debug` (unshallowed the clone
before the guards; `PW_CHROMIUM_EXECUTABLE` for the mocked suite; never `playwright install`) ·
`riviera-frontend` (`shared/photo-url.ts` is the registry's home — a pure `shared/` utility, no
folder move) · `riviera-tailwind` (checked and **compiled**: Tailwind 4.3.3 ships no `sizes`,
`srcset` or DPR utility and no `min-resolution` variant, so the styling layer cannot express
this and the slice adds no class at all — V-8) · `angular-developer` + angular-cli MCP
`search_documentation` v22 (the `sizes`/`ngSrcset`/`auto`-prefix contract; where angular.dev is
silent or broader than the shipped code, the installed bundle is cited by line — V-1, V-5,
V-6) · `playwright-cli` (the DPR-3 e2e cases and how the mocked suite fixes density).

**Branch:** `claude/issue-1072-hero-dpr3-6e33vj` — the cloud session's designated remote branch
stands in for `bugfix/hero-dpr3-capped-sizes` (`riviera-sdlc` § Remote/cloud addendum).

---

## Verified claims (the evidence this slice rests on)

> Every claim the slice depends on, with the source that settled it. Measured in
> `@angular/common@22.1.4`, `tailwindcss@4.3.3`, `@playwright/test@1.62.1`, Chromium 1194.
> Versions were re-measured this session; both are unchanged from what #1069 shipped against.

| # | Claim | Verdict | Source |
|---|---|---|---|
| V-1 | `assertNoComplexSizes` matches `/((\)\|,)\s\|^)\d+px/` and nothing else, so a `px` after `(` passes while `clamp(0px, …)` throws | **confirmed — and it is a regex gap, not documented** | `node_modules/@angular/common/fesm2022/common.mjs:1192`. angular.dev's v22 image-optimization guide documents no `px` restriction at all; the only statement of intent is the thrown message's own "`sizes` must only include responsive values" (same line). The slice therefore works against the directive's **stated intent** even where it works. |
| V-2 | The guard runs under `if (!this.ngSrcset)` and is **not** gated on `disableOptimizedSrcset` | confirmed | `common.mjs:805–807`, inside the `if (ngDevMode)` block at `:780`. `disableOptimizedSrcset` appears nowhere in that condition, so the guard fires even though automatic `srcset` generation is already off under the noop loader. |
| V-3 | `photo-slideshow.spec.ts`'s canary runs every registry value through the real directive and would fail if the guard tightened | **proved by mutation, both directions** | (a) Registry value set to `clamp(0px, 66vw, 330px)` → canary red, `NG02952`, naming the value. (b) Proposed value in place + the bundle's regex widened to `/((\)\|,)\s\|\(\|^)\d+px/` (the realistic "also catch a px after an open paren" tightening) → canary red, naming `(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, min(330px, 66vw)`; with the regex restored, green. |
| V-4 | The capped value stays constant per instance — `assertNoPostInitInputChange` covers `sizes` | confirmed | `common.mjs:859` lists `'sizes'` among the guarded inputs, called from `ngOnChanges`. |
| V-5 | The `auto,` prefix is added on a **lazy** image and not on a **priority** one | **confirmed — and angular.dev overstates it** | `common.mjs:841–846` prefixes only when `getLoadingBehavior() === 'lazy'` (`:895`). angular.dev v22 says flatly "NgOptimizedImage automatically prepends `auto` to the provided sizes value", with no condition. Measured on the real venue page: the hero (`priority`) renders `sizes="(min-width: 1280px) 35vw, …"`, the side tiles (lazy) render `sizes="auto, (min-width: 1280px) 18vw, 22vw"`. So the authored value reaches the hero on every engine and reaches a side tile only where `sizes=auto` is unsupported. |
| V-6 | `ngSrcset` with density descriptors is the documented route to a density ladder | **documented, and ruled out on its merits here** | angular.dev v22: "The directive supports both width descriptors (e.g. `100w`) and density descriptors (e.g. `1x`)." Ruled out because (a) there is no `IMAGE_LOADER`, so the generic loader returns `src` unchanged and every descriptor resolves to the same URL — Angular warns exactly that, `NG02963` at `common.mjs:1398`; (b) the real candidates are content-addressed hashes (`…/bb02`, `…/bb02@1440`) that no width-parameterised loader can synthesise; (c) setting `ngSrcset` makes the directive write `srcset` itself, fighting the `[attr.srcset]` binding that carries those candidates. Taking it would also silence V-1's guard — the documented escape — which is a reason against it, not for it. |
| V-7 | A CSS math function is a valid source-size-value, and an engine that cannot parse one over-fetches rather than under-serves | **half measured, half a stated limit** | Measured in Chromium at a 600px viewport, fresh page and unique URL namespace per case, with three exact controls (`35vw`→210, `330px`→330, no attribute→600): `min(330px, 66vw)`→330, `calc(66vw)`→396, `clamp(100px, 66vw, 330px)`→330. An entry the engine cannot parse is **dropped** and the next valid entry is used (`(min-width: 1px) nonsense(…), 35vw`→210); with no valid entry left, the default `100vw` applies (`nonsense(…)` alone→600). Our value puts the math function **last**, so an engine that cannot parse it falls to `100vw` — the largest possible request, i.e. over-fetch. **Not closed in a second engine:** no second engine is installed, `playwright install` is out of bounds here, and both html.spec.whatwg.org and developer.mozilla.org are blocked by this session's egress proxy, so the HTML spec could not be cited first-hand. Recorded as a known limit in the e2e header (AC-7). Incidental: Chromium honours a **bare** `330px` too, so the registry's "viewport-relative only" rule is Angular's, not the platform's. |
| V-8 | Tailwind still ships no `srcset`, `sizes` or DPR utility and no `min-resolution` variant | **confirmed by compiling candidates, one at a time** | Each candidate compiled alone through the installed `tailwindcss@4.3.3` compiler. MISS: `sizes-full`, `sizes-[50vw]`, `srcset-2`, `srcset-[2x]`, `dpr-2`, `dpr-3`, `dpr-[3]`, `density-2`, `resolution-2`, `image-resolution-2x`, `min-resolution:block`, `min-resolution-2:block`, `2x:block`, `retina:block`, `dpr-2:block`, `density-3:block`. HIT (controls, so a MISS means absent rather than a broken probe): `w-full`, `object-contain`, `min-[1024px]:h-[360px]`. The only reach is the arbitrary-variant escape hatch `[@media(min-resolution:3dppx)]:block`, which HITs and emits a real `@media (min-resolution:3dppx)` block — but that is CSS, and nothing in CSS can set a `sizes` attribute. |
| V-9 | Any variant or arbitrary value the slice adds is current v4 syntax | **vacuous — the slice adds none** | The diff touches one TypeScript string, two Vitest specs and one Playwright spec. No template, no class list, no `tailwind.css` change. |

### The arithmetic, measured

`PhotoProcessor` fits a BANNER rendition within **1280 × 480 at scale 1 and 2560 × 960 at
scale 2, each tier into its own box** (`PhotoProcessor.java:50–51`, `:156–162`), so the retina
width is **not** the baseline doubled. A 3:2 upload stores **720w and 1440w**; a 16:9 upload
stores **853w and 1707w**. `object-contain` paints `min(boxWidth, boxHeight × aspect)`.

Hero boxes were **measured** with `getBoundingClientRect` on the real venue page, never derived
from markup: 178.66 × 220 at a 320px viewport, 240 × 220 at 412, 338.66 × 220 at 560, 485.33 ×
220 from 780 to 1023, 485.33 × 360 from 1024 to 1279, 730.66 × 360 from 1280 up.

What each `sizes` string **resolves to** was measured too, by injecting a 1w-granular probe
`srcset` into the same document, so the engine's own arithmetic — the `min()` included — is
read rather than modelled. The selection rule "smallest candidate ≥ the resolved request, else
the widest" then reproduced **99/99** measured hero selections on a 3:2 page and **87/87** on a
16:9 page, which is what licenses the analytic sweep across aspects the e2e does not load.

Sweep: viewports 320–2560 (31 widths) × DPR 1, 2, 3 × aspects 2:3, 1:1, 4:3, 3:2, 16:9, 2:1,
8:3, 3:1. **Every under-service is classified sizes-limited or ladder-limited**, because they
have opposite fixes:

| Aspect | Shipped `35vw` — **sizes**-limited at DPR 3 | With `min(330px, 66vw)` | Ladder-limited (unchanged by any `sizes`) |
|---|---|---|---|
| 3:2 (720w/1440w) | 414–673, worst −27% | **none** | DPR 3, 1024–1279 −1%; 1280+ −11% |
| 16:9 (853w/1707w) | 480–800, worst −27% | **none** | DPR 3, 1280+ −11% |
| 1:1 (480w/960w) | 320–430, worst −27% | **none** | DPR 3, 1024+ −11% |
| 4:3 (640w/1280w) | 375–600, worst −27% | **none** | DPR 3, 1024+ −11% |
| 2:1 (960w/1920w) | 540–1023, worst −27% | **none** | DPR 3, 1280+ −11% |
| 8:3 and 3:1 (both 1280w/2560w) | 700–1023, worst −12% | unchanged — the cap cannot reach it | — |

Each band above belongs to its own aspect and to no other. **The issue's "412–686" is the 3:2
figure**; measured, 412 is the last covered width at 3:2 (it needs exactly 720 and gets 720)
and 686 is covered again, so the 3:2 failing band is 414–673 across the sampled widths. The
16:9 band is 480–800 — wider and shifted — which is why no number in this slice's code or
comments appears without the aspect it belongs to.

Past 8:3 both tiers are width-bound at 1280w/2560w and stop following the aspect, which is the
case the registry doc already disclaims; `min(330px, 66vw)` does not change it either way.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with 3 photos and a **3:2** upload (720w/1440w stored), when the
      venue page is rendered at DPR 3 at 430, 560 and 673 CSS px, then the gallery hero's
      `currentSrc` is the **1440w** candidate, which covers its measured paint of 252, 330 and
      330 CSS px respectively. *Seam:* the `/venues/1` route's rendered
      `img[data-testid="gallery-hero"]`, observed through `currentSrc` in a real engine ·
      *Pinned by:* `venue-photo-candidates.e2e.ts` › `the gallery hero at DPR 3` describes.
- [ ] **AC-2:** Given the same page with a **16:9** upload (853w/1707w stored), when rendered
      at DPR 3 at 800 CSS px, then the hero's `currentSrc` is the **1707w** candidate, which
      covers its 391 CSS px paint — a width at which the 3:2 upload is already served by its
      baseline, so the two aspects cannot be conflated. *Seam:* as AC-1 · *Pinned by:*
      `venue-photo-candidates.e2e.ts` › `a 16:9 upload's DPR-3 window runs wider than a 3:2 upload's`.
- [ ] **AC-3:** Given a **3:2** upload, when rendered at DPR 3 at 360 CSS px — below the
      window, where the 205 CSS px paint needs 616 device px — then the hero stays on the
      **720w** baseline, so the fix is a capped clause and not a blanket retina switch.
      *Seam:* as AC-1 · *Pinned by:* `venue-photo-candidates.e2e.ts` › `stays on the baseline below the DPR-3 window`.
- [ ] **AC-4:** Given a **3:2** upload at 560 CSS px at DPR 1 and at DPR 2, and a **16:9**
      upload at 560 CSS px at DPR 2, when the venue page is rendered, then the hero fetches the
      **baseline** candidate in all three — #1069's win is not traded back inside the
      registry's stated 3:2–16:9 band. *Seam:* as AC-1 · *Pinned by:*
      `venue-photo-candidates.e2e.ts` › `the #1069 win survives at DPR 1 and DPR 2` describes.
- [ ] **AC-5:** Given viewports 1024 to 2560 at DPR 1 and DPR 2, when the hero renders, then
      every selection is the one #1071 shipped — guaranteed by the two clauses above the
      `min-[1024px]` step being byte-identical, and pinned at the 1024 boundary and at 1440.
      *Seam:* as AC-1 · *Pinned by:* the existing `1440 x 900, DPR 1|2`, `1920 x 900, DPR 1`
      and `1100 x 800, DPR 1` describes plus a new `1024 x 800, DPR 2` case.
- [ ] **AC-6:** Given the `CONTAIN_SIZES` registry, when the shape rule runs, then it asserts
      **no `px` LENGTH** rather than "vw clauses only", its test name says so, and a companion
      case proves the rule is not vacuous by rejecting a value that does carry a px LENGTH.
      *Seam:* the exported `CONTAIN_SIZES` object · *Pinned by:* `photo-url.spec.ts` ›
      `states every contain-fitted sizes without a px length, a math function apart`.
- [ ] **AC-7:** Given every `CONTAIN_SIZES` value, when the canary mounts each through the real
      `NgOptimizedImage`, then none throws today and any Angular tightening of
      `assertNoComplexSizes` fails this spec at upgrade time naming the value — not in
      production. *Seam:* `PhotoSlideshow`'s `sizes` input through `NgOptimizedImage`'s
      init-time guards · *Pinned by:* `photo-slideshow.spec.ts` ›
      `carries every authored contain-fitted sizes through NgOptimizedImage untouched`.
- [ ] **AC-8:** Given `venue-photo-candidates.e2e.ts`, when a reader opens it, then its header
      states which densities it covers (1, 2 and 3) and which engine coverage it does **not**
      have (Chromium only; the math function's cross-engine behaviour unmeasured, with the
      measured Chromium failure mode named). *Seam:* the spec file's header comment ·
      *Pinned by:* review (prose); the DPR-3 describes are what make the "covers 3" half true.
- [ ] **AC-9:** Given `CONTAIN_SIZES`' TSDoc, when a reader consults it, then it states the
      **density bound** the registry now holds to and the **aspect band** it holds over, and
      replaces "a `px` LENGTH throws `RuntimeError 2952`" with the true rule (no bare px
      LENGTH; a px inside a math function passes by a regex gap that the canary guards).
      *Seam:* the `CONTAIN_SIZES` TSDoc · *Pinned by:* review (prose) + AC-6's shape rule,
      which is the machine-checked half.

## Non-goals

- **The hero's 360px box from 1024 up.** Ladder-limited: −1% at 1024–1279 and −11% at 1280+
  for a 3:2 upload at DPR 3. No `sizes` value reaches it; only a wider stored rendition does.
  Recorded on #1072 and noted on #1070, which re-reads ADR-0008's rendition list.
- **`gallerySideTile`.** Its DPR-3 window exists only on engines without `sizes=auto`;
  Chromium's `auto` prefix (V-5) resolves against the 361px tile box and buys retina anyway,
  so it is invisible there and not worth a clause.
- **A third BANNER rendition**, a denser ladder, or any `PhotoProcessor` / Flyway change. A
  denser ladder does not help this defect at all: at 560 × DPR 3 a 720/960/1200/1440 ladder
  still selects 720w, because the request is under-stated rather than the ladder too coarse.
- **The lightbox's own `sizes`.** A different defect, on a different surface.
- **The `band` clause.** Untouched; its own DPR-3 behaviour is not in this slice.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced. One clause of one existing value changes; the
registry, both components and every consumer keep their shape. What *is* replaced is a test's
rule (AC-6), and its parity is the point of that AC: the old rule said "vw clauses only", the
new rule says "no px LENGTH", which is the constraint the old one was always approximating.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The value ships as a string; a spec that pins the string is a tautology and proves nothing about the fetch | high | high | No new spec pins the string. Every new assertion observes `currentSrc` in a real engine (AC-1…AC-5) or the shape rule (AC-6). Every new assertion is mutation-checked: the value it guards is changed and the test shown red. | this slice | open |
| R-2 | A future Angular release replaces the regex with a parser and the value starts throwing `NG02952` in production | low | high | The canary (AC-7) mounts every registry value through the real directive, so the failure lands in CI at upgrade time naming the value. **Proved by mutation, V-3(b)** — not assumed. | this slice | open |
| R-3 | The 3:2 and 16:9 windows differ (414–673 vs 480–800) and get conflated, as they were on #1071 (F-3, F-13, F-14, part of F-17) | high | med | Each fixture's aspect is named beside every number it produces, in the e2e case titles, the inline comments and this doc. AC-2 exists purely to pin a width where the two aspects disagree. | this slice | open |
| R-4 | Box widths derived from markup rather than measured, as nearly happened on #1071 | med | high | Every box in this doc came from `getBoundingClientRect` on the real page at that viewport; the boxes narrow with the viewport under 780 and are not computable from the breakout alone. | this slice | open |
| R-5 | The mocked e2e suite cannot run here because the pinned Playwright wants a browser revision the image lacks | med | med | Run as `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` (`riviera-local-debug`); never `playwright install`. | this slice | open |
| R-6 | A `scripts/check-*.mjs` guard exits 2 on the shallow clone and the failure is read as a code problem | high | low | `git fetch --unshallow` ran before any guard. | this slice | resolved — done at intake |
| R-7 | The capped clause over-fetches at DPR 3 between roughly 364 and 412 CSS px for a 3:2 upload (1440w fetched where 720w covers the 240 CSS px paint) | certain | low | Accepted deliberately. The alternative coefficient that removes it (`58vw`) leaves a 16:9 upload short at 480 × DPR 3, and AC-1's "covers its painted width" is the property worth keeping. Recorded in the registry TSDoc. | this slice | open |

## Open questions / Assumptions

- **Assumption A-1:** AC-4/AC-5's "no DPR-1 or DPR-2 selection regressed" is proved **within
  the registry's stated 3:2–16:9 aspect band**, where it holds with zero changed selections.
  Outside that band the capped clause does change DPR-1/DPR-2 selections, always toward a
  wider candidate: 2:3 portrait at DPR 1 (540–900) and DPR 2 (320–430), 1:1 at DPR 2
  (375–673), 4:3 at DPR 2 (540–900). That trade is **unavoidable**, not a tuning error —
  fixing 3:2 at DPR 3 requires the resolved value to exceed 240 CSS px for viewports above
  240, while leaving 1:1 alone at DPR 2 requires it to stay at or below 240 for viewports up
  to 686; the two cannot both hold. Ship the issue's value, state the band in the TSDoc
  (AC-9). — *Owner:* this slice · *Resolves by:* phase 2 (the TSDoc wording).
- **Assumption A-2:** AC-8 is satisfied by covering DPR 3 in the spec's own `test.use`
  describes plus an honest header, rather than by a fourth Playwright *project*. The file
  already fixes density per describe, so a project-level `deviceScaleFactor` would re-run the
  DPR-1 and DPR-2 cases at the wrong density. The issue's AC allows either; this is the
  branch that actually covers the window. — *Owner:* this slice · *Resolves by:* phase 1.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes one `sizes` string and three test files;
no booking, set, date or beach-map state is read or written, and no request reaches the API.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file is modified. `PhotoProcessor` is read to confirm the
rendition arithmetic (V-section) and deliberately not touched — editing it, or a migration,
would mean the slice had left #1072.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/shared/photo-url.ts` (`CONTAIN_SIZES.galleryHero` + the registry TSDoc) | existing | pure `shared/` constant | none — a frozen `as const` registry | none |
| FE-2 | `frontend/src/app/shared/photo-url.spec.ts` (the shape rule) | existing | Vitest spec | none | none |
| FE-3 | `frontend/src/app/shared/photo-slideshow.spec.ts` (the canary's comment) | existing | Vitest spec + `TestBed` | none | none |
| FE-4 | `frontend/e2e/venue-photo-candidates.e2e.ts` (DPR-3 cases + header) | existing | Playwright spec, mocked API | none | none |

**Standards:** no component changes, so the standalone/`inject()`/`input()` surface is
untouched. `NgOptimizedImage` keeps `disableOptimizedSrcset` with a hand-built `[attr.srcset]`
— unchanged, and V-6 is why that stays the right shape. No deviation to document.

## FE↔BE contract

N/A — no contract change. `PhotoView`'s wire shape, the serving paths and the stored candidate
widths are all unchanged; only the client-side `sizes` hint moves.

## Execution status

**Stage pointer:** `implement (phases 0-1 done; phase 2 next)`

**Next action:** Phase 2 — rewrite the `CONTAIN_SIZES` TSDoc (density bound, aspect band,
the true px rule) and the e2e header's density/engine coverage.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Pin the defect as a red e2e | ✅ (red by design) | `3ccb0f50` |
| 1 — Ship the capped clause and correct the shape rule | ✅ | `<phase-1>` |
| 2 — State the density and aspect bounds in the registry TSDoc | | |
| 3 — Close-out: retire `band-contain-sizes.md`, finalize this doc | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/hero-dpr3-capped-sizes.md` — this plan
- `docs/plans/band-contain-sizes.md` — **deleted** at close-out; its PR #1071 has merged
  (`riviera-docs-freshness` § Plan-doc retirement)
- `frontend/src/app/shared/photo-url.ts` — `CONTAIN_SIZES.galleryHero`'s narrowest clause; the
  registry TSDoc's density bound, aspect band and px rule
- `frontend/src/app/shared/photo-url.spec.ts` — the shape rule: "no px LENGTH", plus its
  non-vacuity case
- `frontend/src/app/shared/photo-slideshow.spec.ts` — one line at the canary saying what it now
  holds
- `frontend/e2e/venue-photo-candidates.e2e.ts` — DPR-3 cases at both aspects, the DPR-1/DPR-2
  no-trade-back cases, the 1024 boundary case, and the header's density/engine coverage
- `frontend/e2e/discover-photos.e2e.ts` — the pinned RENDERED `sizes` attribute on the hero,
  which is what shows the priority image takes no `auto,` prefix (V-5); the string moves with
  the clause

---

## Phase 0 — Pin the defect as a red e2e

**Files:** Modify `frontend/e2e/venue-photo-candidates.e2e.ts`

- [ ] **Step 1: Write the failing tests** — the AC-1/AC-2/AC-3 describes, against the value
      currently on `main`. Each case names its fixture's aspect in the title and comment.
- [ ] **Step 2: Run them, verify they fail** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-photo-candidates`
      → the three DPR-3 retina cases FAIL (`bb02` / `ee05` where `bb02@1440` / `ee05@1707` is
      expected); the below-the-window case (AC-3) PASSES already, which is correct — it is a
      guard against the fix over-reaching, not a defect witness.
- [ ] **Step 3: Commit** — `git commit -m "Pin the gallery hero's DPR-3 under-service at 3:2 and 16:9 (#1072)"`
      (a red-TDD push; the CI gate's red-TDD exemption applies)
- [ ] **Step 4: Update plan-doc execution status** in the same commit window.

## Phase 1 — Ship the capped clause and correct the shape rule

**Files:** Modify `frontend/src/app/shared/photo-url.ts` · `frontend/src/app/shared/photo-url.spec.ts`

- [ ] **Step 1: Change the clause** to `min(330px, 66vw)` and run `photo-url.spec.ts` → the old
      "vw clauses only" rule goes RED, which is the cost the issue predicted.
- [ ] **Step 2: Correct the rule** to "no px LENGTH", rename the test, and add the non-vacuity
      case. Run → GREEN.
- [ ] **Step 3: Mutation-check the new rule** — assert it rejects `clamp(0px, 66vw, 330px)`
      inside the spec itself, so the rule cannot silently become vacuous.
- [ ] **Step 4: Run the canary** (`photo-slideshow.spec.ts`) → GREEN, and add the one line
      saying it is what holds V-1's regex gap.
- [ ] **Step 5: Run the DPR-3 e2e from phase 0** → GREEN.
- [ ] **Step 6: Add the DPR-1/DPR-2 no-trade-back cases and the 1024 boundary case** (AC-4,
      AC-5) and run → GREEN. Mutation-check each by reverting the clause and showing it red.
- [ ] **Step 7: Generalization-audit pass.**
- [ ] **Step 8: Commit + update execution status.**

## Phase 2 — State the density and aspect bounds in the registry TSDoc

**Files:** Modify `frontend/src/app/shared/photo-url.ts` · `frontend/e2e/venue-photo-candidates.e2e.ts`

- [ ] **Step 1:** Rewrite the `CONTAIN_SIZES` TSDoc's bound sentence — density bound, aspect
      band, A-1's out-of-band trade, R-7's DPR-3 over-fetch band, and the true px rule.
- [ ] **Step 2:** Rewrite the `galleryHero` clause comment: what the cap tracks, at which
      aspect, and that 330 is the 3:2 paint cap and not a 16:9 one.
- [ ] **Step 3:** Rewrite the e2e header for AC-8 — densities covered, engine not covered, and
      V-7's measured Chromium failure mode.
- [ ] **Step 4:** `npm run lint && npm run format:check` and
      `node scripts/check-inline-comments.mjs --diff origin/main`.
- [ ] **Step 5: Commit + update execution status.**

## Phase 3 — Close-out

**Files:** Delete `docs/plans/band-contain-sizes.md` · Modify `docs/plans/hero-dpr3-capped-sizes.md`

- [ ] **Step 1:** `git rm docs/plans/band-contain-sizes.md` — PR #1071 has merged.
- [ ] **Step 2:** Run `riviera-docs-freshness` over the range; record findings.
- [ ] **Step 3:** Finalize this doc in the PR's **last code-touching commit**.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Mutation matrix (no assertion that cannot fail)

> Every assertion this slice adds, with a mutation that turns it red. Run as a sweep after
> phase 1; #1069 shipped two tests that could not fail, and a later round had to replace both.

| Mutation of `galleryHero` | Assertions it turns red |
|---|---|
| M1 `…, 35vw` (revert to what #1071 shipped) | 430 · 560 · 673 at DPR 3, 3:2; 800 at DPR 3, 16:9 |
| M2 `…, 66vw` (drop the cap, keep the coefficient) | 560 at DPR 2, 3:2 (+ the pre-existing 900 at DPR 2) |
| M3 `…, min(3000px, 66vw)` (cap out of reach) | 560 at DPR 2, 3:2 (+ 900 at DPR 2) |
| M4 `…, min(330px, 70vw)` (coefficient up) | 360 at DPR 3, 3:2 — the below-the-window guard |
| M5 `…, min(200px, 66vw)` (cap down) | all four DPR-3 window cases + the 800 DPR-3 **3:2 control** |
| M6 `…, min(500px, 80vw)` | 560 at DPR 2 **16:9**; 560 at DPR 2 3:2; 360 at DPR 3 |
| M7 `…, min(900px, 200vw)` | 560 at **DPR 1**; both 560 DPR-2 cases; 360 at DPR 3 |
| M8 middle clause `45vw`→`30vw` | 1024 at DPR 2 — the no-leak-upward case |

Unit side: the shape rule's own non-vacuity case (AC-6) is a permanent mutation, asserting the
rule still rejects `(min-width: 1280px) 330px, 66vw` and a bare `330px`. The canary (AC-7) was
mutation-proved both ways in V-3 — a rejected value in the registry, and a widened guard regex
against the shipped value.

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-5:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-photo-candidates` → all green.
- [ ] **AC-6, AC-7:** Run `npm test -- --include="src/app/shared/photo-url.spec.ts" --include="src/app/shared/photo-slideshow.spec.ts"` → all green.
- [ ] **AC-8, AC-9:** Prose, checked at the review gate against this doc's V-table.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — no Java touched at all.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — not in play.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy (invariant #10) — not in play.
- [ ] Timezone (invariant #6) — not in play.
- [ ] Booking codes (invariant #7) — not in play.
- [ ] Flyway (invariant #12) — no schema change.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
