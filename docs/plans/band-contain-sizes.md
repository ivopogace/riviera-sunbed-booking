# Contain-fitted `sizes` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every `object-contain` photo surface requests the `srcset` candidate its
**letterboxed image** needs, not the one its element box implies — so the beach-map band
fetches `BANNER@1` at DPR 1 instead of `BANNER@2`, and still fetches `BANNER@2` at DPR 2.

**Architecture:** The fix is a **smaller responsive `sizes` per contain-fitted surface**,
derived from `boxHeight × sourceAspect` rather than box width. Two cheaper-looking routes are
closed, both verified rather than assumed: `sizes="auto"` resolves to the element's layout box,
and under `fill` the `<img>` is `inset-0` — `object-contain` letterboxes the *content*, not the
element — so dropping `priority` to get the directive's `auto,` prefix changes nothing; and a
pixel-valued `sizes` throws `RuntimeError 2952` from `assertNoComplexSizes`
(`@angular/common@22.1.4` `fesm2022/common.mjs:1190`, called at `:806` under `if (!this.ngSrcset)`,
which is our case because the slideshow supplies `[attr.srcset]` directly). angular.dev documents
neither guard, so the bundle is cited rather than the docs. The documented escape — supplying
`ngSrcset` — silences the px guard but is useless here rather than blocked: with the noop loader
every width descriptor resolves to the same URL (Angular's own `NG02963` warning says exactly
that), and the directive would then write `srcset` itself and fight the `[attr.srcset]` binding for
the same attribute. `assertNoConflictingSrcset` does *not* catch that, because it tests the
`srcset` **input**, which a `[attr.srcset]` binding never sets. A `vw` value is therefore the only
lever the directive leaves, and it is an approximation by construction: the painted width is
constant above 1280 px while a `vw` value is not.

angular.dev does endorse the *direction*: `sizes` is documented as describing the image's rendered
width ("if your image is only likely to take up half the screen … set `sizes` to `50vw`"), and the
fill-mode section states that `object-fit: contain` letterboxes the image inside the element. Those
two together are exactly the mismatch this slice fixes.

**Persistence:** N/A — frontend-only, no table and no migration touched (invariant #1 not in play).

**Source of intent:** GitHub issue #1069 (surfaced by the #1059 intake grill).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — found the defect
while grilling #1059, and caught that the issue's own `sizes="auto"` remedy is disproven) ·
`riviera-plan-doc` (this template — forced the candidate-selection ACs to be stated as observable
`currentSrc` outcomes rather than as a pinned `sizes` string) · `tdd` (phase 0 pins today's wrong
candidate as a characterization test, phase 1 is red-green on the band, phase 2 on the gallery) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(`N/A — no substrate doc states a `sizes` value; re-check at close-out if the band geometry moves`)
· `riviera-frontend` (placement: no new file in `app/`; the e2e spec belongs in the CI-safe
`frontend/e2e/` suite, not `real-backend/`) · `angular-developer` + the installed
`@angular/common` bundle (the two ruled-out routes above; `assertNoPostInitInputChange` covers
`sizes`, so the value must be a constant per instance) · `riviera-local-debug` (every build and test
command in this doc — the shallow-clone deepening, the `PW_CHROMIUM_EXECUTABLE` recipe, and the
rule against the bare full-suite task in a sandbox) · `playwright-cli` (candidate selection is
only observable in a real engine — `deviceScaleFactor` per project is what makes the DPR-2 AC
testable) · angular-cli MCP `search_documentation` v22 (checked the plan against angular.dev:
confirmed the `auto,` prepend, the contain-letterboxing statement and that `sizes` is meant to
describe rendered width; found the docs silent on both dev-mode guards) · `riviera-tailwind`
(`N/A — measured, not assumed: Tailwind 4.3.3 ships no srcset/sizes/DPR utility and no
min-resolution variant, so nothing in the styling layer can express this. object-contain is the
only relevant utility and it is unchanged. No class changes, so the no-drift computed-style proof
does not apply — if a phase ends up touching a class, rule 2 fires: `.photo-band` is a live test
hook in `venue-map.spec.ts` and must survive as an inert marker`).

**Branch:** `claude/beach-map-band-sizes-ucub4s` — the implement session's designated remote
branch, standing in for `bugfix/band-contain-sizes` per `riviera-sdlc` § *Remote / cloud session
addendum*. It starts from `claude/intelligent-albattani-otm46u`, the planning session's branch,
which is not on `main`. That branch carries three artifacts this PR therefore also contains and
this slice does not own: this doc, #1070's plan (`docs/plans/lightbox-photo-surface.md`, not
started) and #1059's wontfix record (`.out-of-scope/photo-width-ladder.md`).

---

## Acceptance criteria (testable)

> Each AC observes **which candidate the browser actually fetched** (`img.currentSrc`), never the
> `sizes` string itself. A pinned string is a tautology; the candidate is the behaviour.

- [x] **AC-1:** Given a venue whose cover photo carries both `BANNER` candidates (720w + 1440w), when the venue page renders at a 1440 × 900 viewport at **DPR 1**, then the band image's `currentSrc` is the **720w** candidate. *Seam:* the `/venue/:venueId` route's rendered band `<img>` · *Pinned by:* `venue-photo-candidates.e2e.ts` → `band picks the baseline candidate at DPR 1`
- [x] **AC-2:** Given the same venue, when the venue page renders at 1440 × 900 at **DPR 2**, then the band image's `currentSrc` is the **1440w** candidate. *Seam:* same route · *Pinned by:* `venue-photo-candidates.e2e.ts` → `band still picks the retina candidate at DPR 2`
- [x] **AC-3:** Given the same venue at a **900 × 800** viewport (the 150 px band, below the `min-[1024px]` step), when the page renders at **DPR 2**, then `currentSrc` is the **720w** candidate — the short band needs 267 device px at most. *Seam:* same route · *Pinned by:* `venue-photo-candidates.e2e.ts` → `the short band stays on the baseline candidate at DPR 2`
- [x] **AC-4:** Given a photo with a **single** stored candidate (pre-retina, un-backfillable per ADR-0008), when the band renders, then no `srcset` attribute is emitted and `src` is the baseline URL. *Seam:* `photoSrcset` in `shared/photo-url.ts`, observed through the rendered `<img>` · *Pinned by:* `photo-slideshow.spec.ts` → `renders no srcset for a photo with a single candidate, since src already says it` (the test that already existed; it is AC-4's pin, so no duplicate was written)
- [x] **AC-5:** Given a venue with ≥ 2 photos (so the gallery grid renders), when the page renders at 1440 × 900 at **DPR 1**, then the hero tile and both side tiles each resolve to the **720w** candidate. *Seam:* the `/venue/:venueId` route's rendered gallery `<img>`s · *Pinned by:* `venue-photo-candidates.e2e.ts` → `every contain-fitted gallery tile picks the baseline candidate at DPR 1` (green before the change too, so it is a guard; the hero's genuinely red viewports are the two cases beside it — phase 2 notes)
- [x] **AC-6:** Given any `sizes` value this slice authors, when `NgOptimizedImage` initialises in dev mode, then no `RuntimeError 2952` is thrown — i.e. no value contains a `px` token. *Seam:* the `sizes` input of `app-photo-slideshow` / the gallery `<img>`s · *Pinned by:* `photo-url.spec.ts` → `states every contain-fitted sizes as vw clauses with a vw fallback, never a pixel length`, and `photo-slideshow.spec.ts` → `carries every authored contain-fitted sizes through NgOptimizedImage untouched`, which runs the real directive rather than a copy of its regex
- [x] **AC-7:** Given the three existing specs that pin today's exact `sizes` strings, when the slice lands, then each asserts the new value and its test name still describes what it checks. *Seam:* the same rendered `<img>`s those specs already observe · *Pinned by:* `venue-map.spec.ts` → `sizes the single-photo header band to its own breakout, not the 100vw default` (line 415, whose name must change too) and `discover-photos.e2e.ts` → `every tourist photo offers its candidates as a srcset the browser sizes against`

## Non-goals

- Storing any new rendition. This slice selects better among candidates that already exist; the
  lightbox's genuine under-service is #1070.
- Changing `object-contain` to `object-cover` on any surface. That would make `sizes` honest by
  construction, but it is a visual-design change and belongs to whoever owns the band's look.
- Introducing an `IMAGE_LOADER`. Ruled out on its merits in #1041 and unchanged here.
- Touching the Discover card. It is `object-cover`, so its element box *is* its painted box and
  its `sizes` is already honest.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced. The band, the gallery tiles and the slideshow keep every
behaviour; only the `sizes` value each passes changes. AC-4 is the guard that the one behaviour
adjacent to the change (a one-candidate photo emitting no `srcset`) is untouched.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A `vw` value tuned for one viewport under-serves at another, trading a DPR-1 win for a visible DPR-2 regression | high | med | The candidate set is coarse (720w / 1440w), so the whole correct answer is the window `360 < sizes ≤ 720` CSS px at every supported viewport. Derive the value against that window, not against a single width; AC-1/2/3 probe three viewport × DPR combinations | agent | **closed** — AC-2 (DPR 2) passed before and after the band change, so the DPR-1 win cost no retina ground |
| R-2 | A wide-panorama upload (aspect > ~2.7:1) paints wider than the tuned value and becomes under-served | low | low | Tune to the widest *common* aspect (16:9 → `264 × 1.78 ≈ 470` px painted), so under-service needs an unusually wide source; note the bound in the code's one-line comment | agent | **closed** — phase 3 moved the value into `CONTAIN_SIZES`, and the bound is stated in that registry's doc beside it |
| R-3 | A pixel value slips into `sizes` during tuning and throws `RuntimeError 2952` only in dev/test, not prod | med | med | AC-6 pins it in a unit spec, which runs in `ngDevMode`; the guard is the assertion, not review | agent | **closed** — two specs over `CONTAIN_SIZES`, and a `300px` mutation failed both |
| R-4 | The gallery tiles' geometry is derived from markup rather than measured, so the tuned value is wrong | med | med | Measure the rendered tile boxes in the e2e run (`getBoundingClientRect`) before choosing values; phase 2 step 1 does this and records the numbers in this doc | agent | **closed** — measured in phase 0 (table under Open questions); the grid is 731/361 above 1280 and 485/239 from 1024 |
| R-6 | Three existing specs pin today's exact `sizes` strings, so the fix lands as a red suite rather than a clean green | **certain** | low | Known and located before phase 0: `venue-map.spec.ts:425` (`'(min-width: 1280px) 70vw, 100vw'`), `discover-photos.e2e.ts:162` (hero) and `:166` (tile). They are updated in the phase that changes each value, not swept at the end. The Discover card's assertion at `:151` must NOT change — it is `object-cover` and out of scope | agent | **closed** — all three repointed in the phase that moved their value; the Discover card's stands unchanged |
| R-5 | Playwright's pinned browser revision is absent in the cloud sandbox; only `/opt/pw-browsers/chromium` exists | high | low | Run the mocked suite as `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` — `playwright.a11y.config.ts` honours only that env var (`riviera-local-debug` § Frontend). Never `playwright install`. CI has its own browsers and is unaffected | agent | **closed** — the env var ran every phase's suite against Chromium 141 |

## Open questions / Assumptions

- **Assumption (resolved, review round 1):** 16:9 is the widest aspect worth tuning for. The review
  found the premise half-wrong and it is now stated correctly in the code. A BANNER rendition is fit
  within 1280 × 480, so a height-bound upload stores a baseline `480 × aspect` wide and paints
  `boxHeight × aspect` — **the aspect cancels**, and the baseline candidate suffices exactly when
  `boxHeight × DPR ≤ 480`, whatever was uploaded. The stored pair is 720w/1440w only for a 3:2
  upload (16:9 stores 853w/1706w), which is what the fixtures pin. The aspect still sets how far an
  authored value may drift, and 16:9 remains that bound. — *Owner:* agent
- **Open question (resolved in phase 2, corrected in review round 3):** Do the three gallery tiles
  want one shared `sizes` or one each? **One each.** The hero takes three clauses, one per box
  width; the two side tiles share a value but still need two clauses, because a tile's painted
  width stops growing at the 1280px breakout while a `vw` does not. Neither is "inside
  `360 < s ≤ 720`" as this entry first said — that window is the 3:2 instantiation of the rule, and
  the hero's narrowest clause sits deliberately below it. — *Owner:* agent

### Measured boxes (phase 0 step 3)

`getBoundingClientRect()` in a real Chromium, one photo for the band and three for the grid.
"Painted" is the 16:9 letterbox inside that box (`min(boxW, boxH × 16/9)`), which is what the
candidate should be chosen against. For the 3:2 fixture the candidates are 720w and 1440w and the
answer is a threshold — the browser takes 720w while `sizes × DPR ≤ 720` — but the stored widths
follow the upload's aspect, so the general rule is the one under the resolved Assumption above.

| Viewport | Band box | Band painted | Hero box | Hero painted | Tile box | Tile painted |
|---|---|---|---|---|---|---|
| 1920 | 1098 × 264 | 470 | 731 × 360 | 640 | 361 × 176 | 313 |
| 1440 | 1098 × 264 | 470 | 731 × 360 | 640 | 361 × 176 | 313 |
| 1280 | 1098 × 264 | 470 | 731 × 360 | 640 | 361 × 176 | 313 |
| 1100 | 730 × 264 | 470 | 485 × 360 | 485 | 239 × 176 | 239 |
| 1024 | 730 × 264 | 470 | 485 × 360 | 485 | 239 × 176 | 239 |
| 900 | 730 × 150 | 267 | 485 × 220 | 391 | 239 × 106 | 189 |
| 768 | 718 × 150 | 267 | 477 × 220 | 391 | 235 × 106 | 189 |
| 500 | 450 × 150 | 267 | 299 × 220 | 299 | 145 × 106 | 145 |
| 390 | 340 × 150 | 267 | 225 × 220 | 225 | 109 × 106 | 109 |

The band's two heights confirm the plan's arithmetic: `30vw` / `45vw` / `35vw` land inside the
`360 < s ≤ 720` window above 1024 and under 360 below it. That window is the **3:2** instantiation of the
rule while the `Painted` column is a 16:9 letterbox — pairing the two is what misled the first cut
of the gallery values, and then the band's widest clause, which review round 3 raised to `36vw`. The gallery is the surprise — see the
phase 2 notes, where the measured hero already picks correctly at 1440 × DPR 1.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice changes one presentational attribute on already-
rendered photo elements. It reads no `set_availability` row, writes none, and touches no booking,
beach-map set or sales-window code path.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is touched, no published surface changes, and the photo
serving contract (`PhotoView` / `PhotoSourceView`) is consumed exactly as it stands.

### Module ownership (§4a)

N/A — no backend behavior is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` | existing | template | none — a constant attribute value | none |
| FE-2 | `shared/photo-gallery-grid.ts` | existing | standalone component (inline template) | none — constant attribute values | none |
| FE-3 | `frontend/e2e/venue-photo-candidates.e2e.ts` | new | Playwright spec (CI-safe mocked suite) | n/a | n/a |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
`NgOptimizedImage` for images. No deviation. `sizes` stays a constant per instance, as
`assertNoPostInitInputChange` requires.

## FE↔BE contract

N/A — no contract change. `PhotoView.sources` is already everything the browser needs; this slice
changes only how the client describes its own layout.

## Execution status

**Stage pointer:** `review — round 3 findings fixed; CI + Sonar, then close-out`

**Next action:** Check CI on the new head, read the Sonar issue list for PR #1071 (not its gate
conclusion alone), then write the close-out and tick the self-review checklist.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Characterize: pin the wrong candidate today | ✅ | `Pin today's band candidate selection (#1069)` |
| 1 — Fix the beach-map band (both heights) | ✅ | `Size the beach-map band by its painted image (#1069)` |
| 2 — Measure and fix the three gallery tiles | ✅ | `Size the gallery tiles by their painted images (#1069)` |
| 3 — Pin the no-pixel-token rule | ✅ | `Guard authored sizes against pixel tokens (#1069)` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (hygiene, phase 0 push) | A two-line inline comment in the new e2e tripped `check-inline-comments.mjs` | **fixed** in phase 1's commit; green on every push since |
| F-2 | review — bug scan | `gallerySideTile` `22vw` exceeds the 360 CSS px ceiling above 1636px, so a wide desktop at DPR 2 buys the retina candidate a 176px-tall tile can never need | **fixed** — `(min-width: 1280px) 18vw, 22vw`, which holds the ceiling to the 2000px the doc claims |
| F-3 | review — git history | Claimed the hero's `<1024` clause under-serves at DPR 2 in a ~60px viewport window | **rejected, and a real defect found underneath** — the claim mixes a 16:9 painted width with the 3:2 candidate pair. The aspect-independent rule is `boxHeight × DPR ≤ 480`, so the 220px-tall box can never need retina; `55vw` was buying it anyway across 655–1023px. Fixed to `35vw`, and the untested tier the finding pointed at now has its own DPR-2 case |
| F-4 | review — comments | The registry doc claimed to hold *every* `object-contain` surface; the lightbox still states its own `94vw` | **fixed** — the claim now names the band and the grid, and says the lightbox is out |
| F-5 | review — comments | The 2952 rule and the constant-per-instance rule were stated authoritatively in two files | **fixed** — the pixel rule lives in `CONTAIN_SIZES`, the input constraint on `PhotoSlideshow.sizes`, neither restates the other |
| F-6 | review — overlay RV-STYLE-1 | A field doc on the gallery grid restated its own class doc | **fixed** — dropped; `venue-map.ts`'s kept, it is that call site's only pointer |
| F-7 | review — overlay RV-PROC-1 | `riviera-local-debug` missing from *Skills consulted* though every command in the doc came from it | **fixed** — added |
| F-8 | review — overlay (plan-doc discipline) | `<sha>` placeholders left in the AC-verification block, and three recorded `npm test -- <name>` commands that error rather than run | **fixed** — real SHAs, and `ng test --include` |
| F-9 | review — overlay (plan-doc accuracy) | R-2's resolution pointed at a template comment phase 3 had removed; the 16:9 assumption still open | **fixed** — R-2 re-pointed at the registry, the assumption resolved with the corrected aspect model |
| F-10 | review — CLAUDE.md audit, prior-PR sweep | Registry doc over §6d's ~6-line type budget, the pattern flagged on PRs #1039 and #1058 | **partly fixed in `e8889782`, and deliberately left over budget** — 21 prose lines to 11. What went was archaeology; what stays a new entry has to act on, and §6d's budget is a smell test that asks the question rather than settling it |
| F-11 | re-review rounds 2 and 3, independently | The band's `(min-width: 1280px) 30vw` under-served at DPR 2: 768 device px against a 16:9 upload's 853w baseline, for a band painting 469 — a regression from `main` on the page's LCP image, across viewports 1280–1422 | **fixed** — `36vw`, and a 16:9 fixture now exists, so a suite that had only ever seen 3:2 can see this class of defect |
| F-12 | re-review round 3 | The side tile's entry claimed its 1280px clause stops a wide desktop buying retina; in Chromium the lazy `auto` prefix wins and it buys retina anyway | **fixed** — the entry now says which engines the value reaches, agreeing with the grid's class doc instead of contradicting it |
| F-13 | re-review round 3 | The registry doc over-generalized three ways: "whatever was uploaded" (false past 8:3, where the baseline caps at 1280), "holds up to 16:9" (unbounded on the narrow side), and "overstates, which costs a candidate rather than correctness" (backwards — past 16:9 it understates, which costs sharpness) | **fixed** — each bound now stated in both directions |
| F-14 | re-review round 3 | Four comments in the new e2e explained a 3:2 fixture's choice with 16:9 arithmetic — the premise-mixing F-3 was supposed to have removed | **fixed** — every number in that file is now its own fixture's |
| F-15 | re-review round 3 | `venue-map.spec.ts` pointed at the e2e for "each clause", but the band's 1024–1279 clause had no case | **fixed** — a 1100 × 800 DPR 2 case covers it |
| F-16 | re-review round 3 | A `{@link CONTAIN_SIZES}` added to `photo-slideshow.ts` had no symbol in scope | **fixed** — a plain path reference; importing a value for a doc link would be an unused import |

---

## File structure

- `docs/plans/band-contain-sizes.md` — this plan
- `frontend/src/app/venue/venue-map.html` — the band's `sizes`
- `frontend/src/app/shared/photo-gallery-grid.ts` — the hero + two tiles' `sizes`
- `frontend/src/app/shared/photo-url.ts` — the authored-`sizes` constants, if phase 1 extracts them
- `frontend/src/app/shared/photo-url.spec.ts` — AC-6, the no-pixel-token rule
- `frontend/src/app/shared/photo-slideshow.ts` — the `sizes` input's doc, which points at the registry
- `frontend/src/app/shared/photo-slideshow.spec.ts` — AC-4, one-candidate photos emit no `srcset`
- `frontend/e2e/venue-photo-candidates.e2e.ts` — AC-1/2/3/5, candidate selection per viewport × DPR
- `frontend/src/app/venue/venue-map.spec.ts` — AC-7, the band's pinned `sizes` string and its test name
- `frontend/e2e/discover-photos.e2e.ts` — AC-7, the gallery hero + tile pinned `sizes` strings
- `frontend/e2e/support/photo-views.ts` — the mocked photo fixture, if a two-candidate cover is missing

---

## Phase 0 — Characterize: pin the wrong candidate today

**Files:** Create `frontend/e2e/venue-photo-candidates.e2e.ts` · Read `frontend/e2e/support/photo-views.ts`

- [x] **Step 1: Write the characterization test** — assert the band's `currentSrc` is the **1440w**
      candidate at 1440 × 900 DPR 1. This is today's wrong behaviour; the test passes now and is
      inverted in phase 1. Serve two distinguishable image bodies from `page.route` so `currentSrc`
      identifies the candidate unambiguously.
- [x] **Step 2: Run it, verify it PASSES** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-photo-candidates` → PASS
      (characterization, not red-green; it documents the defect before the fix moves it)
- [x] **Step 3: Record the measured boxes** — in the same run, log
      `getBoundingClientRect()` for the band and each gallery tile, and write the numbers into
      this doc's Open questions. Phase 1 and 2 tune against measurements, not against markup arithmetic.
- [x] **Step 4: Commit** — `git commit -m "Pin today's band candidate selection (#1069)"`
- [x] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Fix the beach-map band (both heights)

**Files:** Modify `frontend/src/app/venue/venue-map.html:37` · Test `frontend/e2e/venue-photo-candidates.e2e.ts`

- [x] **Step 1: Invert the characterization into AC-1, and add AC-2 + AC-3** — three assertions:
      720w at 1440 × 900 DPR 1, 1440w at 1440 × 900 DPR 2, 720w at 900 × 800 DPR 2.
- [x] **Step 2: Run it, verify it fails** — FAIL on AC-1 *and* AC-3, both with the 1440w
      candidate; AC-2 passed from the start, which is what makes it the guard rather than a win
- [x] **Step 3: Minimal implementation** — replace the band's `sizes`, deriving each clause so the
      computed value lands inside the `360 < sizes ≤ 720` window across that clause's viewport range:

| Viewport range | Band box | Painted at 16:9 | Target window | Clause |
|---|---|---|---|---|
| ≥ 1280px | 1098 × 264 (fixed) | ~470px | 360 < s ≤ 720 | `30vw` (1280→384, 1920→576) |
| 1024–1279px | 730 × 264 | ~470px | 360 < s ≤ 720 | `45vw` (1024→461, 1279→576) |
| < 1024px | 732 × 150 | ~267px | s ≤ 360 (720w at both densities) | `35vw` (768→269, 1023→358) |

      Values are the derivation, not the answer — re-derive against phase 0's measured boxes and let
      the ACs arbitrate.

- [x] **Step 4: Update the pinned band spec** — `venue-map.spec.ts:415` asserts the old string and its
      name says "not the 100vw default". Re-point both at the new value and what it now guards.
- [x] **Step 5: Run it, verify it passes** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-photo-candidates` then `npx ng test --include "src/app/venue/venue-map.spec.ts"` → PASS
- [x] **Step 6: Generalization-audit pass** — Population `every NgOptimizedImage call site whose
      element is object-contain under fill` → enumerate
      `grep -rn "object-contain" frontend/src/app --include=*.ts --include=*.html` → candidates
      `the band (venue-map.html, via PhotoSlideshow [contain]); the gallery hero + both side tiles
      (photo-gallery-grid.ts:54,82,109); the lightbox (photo-lightbox.ts, via [contain])` → decision
      `band fixed here, the three gallery tiles in phase 2, the lightbox excluded by decision — it
      is #1070's surface and its defect runs the other way (it needs a rendition nobody stored, not
      a smaller sizes)`. Appended to the log below.
- [x] **Step 7: Commit** — `git commit -m "Size the beach-map band by its painted image (#1069)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Measure and fix the three gallery tiles

**Files:** Modify `frontend/src/app/shared/photo-gallery-grid.ts:51,80,107` · Test `frontend/e2e/venue-photo-candidates.e2e.ts`

- [x] **Step 1: Write the failing test** — AC-5, over all three tiles at 1440 × 900 DPR 1.
- [x] **Step 2: Run it, verify it fails** — AC-5 as written **passed** before the change; the red
      cases are 1920 × 900 DPR 1 and 1100 × 800 DPR 1, added beside it. See the phase 2 notes.
- [x] **Step 3: Minimal implementation** — hero `(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, 55vw`,
      both side tiles `22vw`. The Open question resolves as *not one shared value*: the hero needs a
      clause per box width to stay inside `360 < s ≤ 720`, while a side tile paints under 360 px at
      every viewport and therefore states a single number.
- [x] **Step 3a: Update the pinned gallery assertions** — `discover-photos.e2e.ts:162` (hero) and
      `:166` (tile). Leave `:151` (the Discover card) alone: it is `object-cover`, so its `sizes`
      is already honest and changing it would be scope creep.
- [x] **Step 4: Run it, verify it passes** — 7/7 in the candidates spec, then 191/191 across the
      photo + venue-map unit specs and 599/599 in the whole mocked e2e suite.
- [x] **Step 5: Commit** — `git commit -m "Size the gallery tiles by their painted images (#1069)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---


### Phase 2 notes — where the gallery is actually wrong

AC-5's viewport was derived from markup, and the measurement disagreed with it — R-4's whole point.
Probed in Chromium 141 over 8 viewports × 2 densities against the real `720w, 1440w` pair:

- **AC-5 as written was already green.** At 1440 × 900 DPR 1 the hero's `50vw` computes to exactly
  720 px and the 720w candidate covers it, so all three tiles already picked the baseline. Kept as
  a guard rather than deleted — it is the case the fix must not break.
- **The hero is red at 1920 × 900 DPR 1 and at 1100 × 800 DPR 1.** Above 1280 the grid stops
  growing at its 1100 px breakout while `50vw` keeps climbing (960 px at 1920); below 1280 the grid
  drops to the 730 px breakout while `66vw` *rises* to 726 px. Both bought 1440w for an image
  painting 640 px and 485 px. Those two are the red tests this phase turns green, and a
  1440 × 900 DPR 2 case guards the retina side.
- **A side tile's authored `sizes` is unobservable in Chromium.** The tiles are lazy, so
  `NgOptimizedImage` prefixes `auto,` and Chromium resolves it against the tile's layout box: at
  1100 × DPR 2 the tile picked 720w, which only `auto` (239 × 2 = 478) explains — the authored
  `33vw` would have asked for 726. So the tile value is pinned as a string in
  `discover-photos.e2e.ts` and reaches only engines without `sizes=auto`. No candidate assertion
  can prove it, and inventing one would have been a test that proves nothing.

## Phase 3 — Pin the no-pixel-token rule

**Files:** Modify `frontend/src/app/shared/photo-url.ts` · Test `frontend/src/app/shared/photo-url.spec.ts`, `frontend/src/app/shared/photo-slideshow.spec.ts`

- [x] **Step 1: Write the failing tests** — the three authored values moved into one named
      `CONTAIN_SIZES` registry in `photo-url.ts`, and AC-6 written twice over it: the shape rule at
      the registry (`photo-url.spec.ts`) and the real one through the directive
      (`photo-slideshow.spec.ts`). AC-4 needed no new test — `photo-slideshow.spec.ts` →
      `renders no srcset for a photo with a single candidate, since src already says it` already
      pins it, and a duplicate would have proven nothing.
- [x] **Step 2: Run it, verify it fails** — FAIL, no `CONTAIN_SIZES` to import. Then, once green,
      mutated `gallerySideTile` to `300px`: both tests failed, the directive one on the real
      `NG02952` text. The guard bites.
- [x] **Step 3: Minimal implementation** — the registry, and the three surfaces bound to it
      (`[sizes]` instead of a literal attribute; still constant per instance, as
      `assertNoPostInitInputChange` requires).
- [x] **Step 4: Run it, verify it passes** — 3162/3162 unit tests, the two photo e2e specs green
      after the binding change, plus `npm run lint` and `npm run format:check`.
- [x] **Step 5: Commit** — `git commit -m "Guard authored sizes against pixel tokens (#1069)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-11 | phase 1 — the band's `sizes` | Every `NgOptimizedImage` call site whose element is `object-contain` under `fill`, i.e. every surface whose `sizes` describes a box the browser does not paint into. Enumerated from the utility class, then each hit read back to separate the mechanism (`photo-slideshow.ts`'s `[class.object-contain]`) from its call sites | `grep -rn "object-contain" frontend/src/app --include=*.ts --include=*.html` | 4 call sites: the beach-map band (`venue-map.html`, through `PhotoSlideshow [contain]`), the gallery hero and both side tiles (`photo-gallery-grid.ts:54,82,109`), the lightbox (`photo-lightbox.ts`, through `[contain]`). The Discover card is `object-cover` and outside the population | Band fixed in this phase; the three gallery tiles in phase 2. The lightbox is excluded by decision, not by oversight: it is #1070's surface and its defect is the opposite one — it paints wider than any stored candidate, so a smaller `sizes` would make it worse |

---

## Acceptance-criteria verification (final)

> `npm test` is `ng test`, which reads a bare argument as a PROJECT name and errors. Filter a unit
> run with `--include` instead; the e2e runner does take a path filter after `--`.

- [x] **AC-1:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-photo-candidates` → 720w at DPR 1. Verified at commit `7e558f22`.
- [x] **AC-2:** same run → 1440w at DPR 2. Verified at commit `7e558f22`.
- [x] **AC-3:** same run → 720w on the short band at DPR 2. Verified at commit `7e558f22`.
- [x] **AC-4:** `npx ng test --include "src/app/shared/photo-slideshow.spec.ts"` → no `srcset` for one candidate. Verified at commit `6b0c7bc7`.
- [x] **AC-5:** the e2e run above → all three tiles 720w at DPR 1, the hero also at 1920 × DPR 1, 1100 × DPR 1 and 900 × DPR 2. Verified at the review-round commit.
- [x] **AC-6:** `npx ng test --include "src/app/shared/photo-url.spec.ts" --include "src/app/shared/photo-slideshow.spec.ts"` → no pixel length, and the directive accepts every value. Verified at commit `418c3014`.
- [x] **AC-7:** the three pinned strings re-point to the new values, each in the phase that moved it. Verified at commits `7e558f22`, `6b0c7bc7` and the review-round commit.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
