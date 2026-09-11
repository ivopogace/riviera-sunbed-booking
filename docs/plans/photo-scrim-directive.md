# Photo-scrim Directive Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Replace the two hand-written `photo-scrim` spans (Discover card band, beach-map
banner band) with one `shared/photo-scrim.ts` attribute directive, so the recipe — including
the `pointer-events-none` that drifted between them — has exactly one definition.

**Architecture:** The decision the issue left open is **build the directive**, on three pieces
of evidence: `riviera-tailwind` rule 1 makes a reused *surface* a directive with no call-site
threshold; the nearest in-tree precedents sit at the same order of magnitude (`appPanelGlass`
at 3 call sites, `appFieldGlass` at 4); and these two spans have already diverged once and
cost a second ticket (#1064). The directive bundles the whole recipe — marker class,
`pointer-events-none`, the full-bleed geometry and `aria-hidden` — because every one of those
is a divergence surface; that geometry is bundled deliberately where `card-glass`/`panel-glass`
unbundle radius, and the reason is written at the declaration.

**Persistence:** N/A — frontend-only, no table and no migration touched (invariant #1 not in play).

**Source of intent:** GitHub issue #1066 (surfaced by the review gate on PR #1064, closing #1045).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed both
call sites are still byte-identical today, listed the three live test hooks, and found no open
PR to collide with) · `riviera-plan-doc` (this template — forced the no-drift AC and the
behavior-parity ledger this refactor would otherwise have skipped) · `tdd` (phase 0 pins the
current computed styles as a characterization test, phase 1 is red-green on the directive,
phase 2 swaps the call sites under both) · `riviera-review-overlay` (review gate — runs at
ready-for-review) · `riviera-docs-freshness` (ran over `origin/main..HEAD` at close-out —
findings recorded in the Execution status) · `riviera-tailwind` (rule 1 settled directive-vs-spans;
rule 2 kept `photo-scrim` as an inert marker on the host; rule 3 kept radius and padding off
the directive; the no-drift rule made computed styles, not the class list, the proof) ·
`riviera-frontend` (placed the directive in `shared/` as a stateless presentational primitive
beside `card-glass.ts`/`panel-glass.ts`) · `angular-developer` (the `host` static-class +
static-attribute form, standalone directive, no inputs) · `playwright-cli` (the mocked
CI-safe suite is where the no-drift and hit-test proofs live).

**Branch:** `claude/sdlc-1066-jijqhf` — the cloud session's designated remote branch stands in
for `feature/photo-scrim-directive` (`riviera-sdlc` § Remote / cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a host element carrying `appPhotoScrim`, when it renders, then it carries
  exactly the scrim recipe — `photo-scrim`, `pointer-events-none`, `absolute`, `inset-0`,
  `bg-(image:--riv-photo-scrim)` and `aria-hidden="true"` — and no border-radius or padding
  utility (rule 3). *Seam:* the `[appPhotoScrim]` directive's host contract ·
  *Pinned by:* `photo-scrim.spec.ts` › `applies the scrim recipe to the host` and
  `carries no border-radius or padding of its own`.
- [ ] **AC-2:** Given a Discover card with a cover photo, when Home renders, then the card
  contains a `.photo-scrim` element and it is pointer-transparent. *Seam:* the `/` route's
  rendered DOM · *Pinned by:* `home.spec.ts` › `renders each venue as a card…` (existing
  `.photo-scrim` assertion, extended with `pointer-events-none`) and
  `discover-photos.e2e.ts` › `the Discover card shows the cover photo…`.
- [ ] **AC-3:** Given the beach-map banner with one photo, when it renders, then the band
  contains a `.photo-scrim` element and a touch anywhere over the band lands on the band's own
  "view larger" control, never the scrim. *Seam:* the `/venues/:id` route's rendered DOM and
  its hit test · *Pinned by:* `venue-map.spec.ts` › `renders the cover banner photo when
  present…` and `discover-photos.e2e.ts` › `the banner scrim is paint only…`.
- [ ] **AC-4 (no drift):** Given either surface, when the scrim renders, then its *computed*
  `background-image`, `position`, the four inset offsets and `pointer-events` are identical to
  the values the hand-written spans produce today. *Seam:* `getComputedStyle` on the rendered
  `.photo-scrim` in a real browser, on both routes · *Pinned by:* `discover-photos.e2e.ts` ›
  `the photo scrim computes one identical recipe on the Discover card and the map banner (#1066)`.

## Non-goals

- The slideshow chrome's own backing. `photo-slideshow.contrast.spec.ts` records, at its
  declaration, why the chrome carries its own backing instead of borrowing `--riv-photo-scrim`;
  that decision stands and is not revisited here.
- `--riv-hero-scrim` (the home hero wash). A different token, a different geometry
  (px-anchored fades), one call site, and a treatment-off token in two of three themes.
- The `--riv-photo-scrim` token's own value, stops and geometry — `home.contrast.spec.ts`
  owns those and this slice must leave them untouched.
- Any other duplicated span (`photo-sun`, `card-photo`). The generalization audit in phase 2
  decides those on the evidence; it does not pre-commit to extracting them.

## Behavior-parity ledger

> The slice replaces an existing surface (two hand-written spans), so this is mandatory.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Paints `--riv-photo-scrim` as a background image | preserved | directive host class `bg-(image:--riv-photo-scrim)`; computed value pinned by AC-4 |
| Covers its positioned parent edge-to-edge (`absolute inset-0`) | preserved | directive host classes `absolute inset-0`; computed insets pinned by AC-4 |
| Takes no pointer (`pointer-events-none`) | preserved | directive host class `pointer-events-none`; the map band's hit test (AC-3) and AC-4 both prove it |
| Hidden from assistive tech (`aria-hidden="true"`) | preserved | moved from both call sites to the directive host as a static attribute — one source instead of two |
| Carries the `photo-scrim` marker class for `home.spec.ts` + `discover-photos.e2e.ts` | preserved | first class on the directive host (`riviera-tailwind` rule 2) |
| Carries no border-radius and no padding | preserved | the directive declares neither (rule 3); AC-1 asserts their absence |
| Home: sits inside the already-`aria-hidden` `.card-photo` span, above the sun and under the chips/location | preserved | same DOM position; only the element's own attributes move to the directive |
| Map: sits inside `.photo-band`, above the slideshow and the empty-state sun, under the "view larger" button | preserved | same DOM position; only the element's own attributes move to the directive |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Silent visual drift: a class is dropped or reordered in the move and the class list still "looks right" | med | high | `riviera-tailwind`'s hard rule — AC-4 diffs *computed* styles in a real browser on both surfaces, and phase 0 lands it green against the OLD markup first, so it is a characterization test, not a post-hoc rationalization | claude | closed — phase 0 baseline green against the old spans |
| R-2 | A live test hook breaks: `home.spec.ts` and `discover-photos.e2e.ts` query `.photo-scrim`; `venue-map.spec.ts` asserts `.photo-band` innerHTML contains `riv-photo-scrim` | high | med | rule 2 keeps `photo-scrim` first on the host; the innerHTML assertion keeps passing because Angular writes static host classes into the real `class` attribute — and phase 2 *adds* an element-level assertion beside it rather than replacing the innerHTML proof | claude | open |
| R-3 | Bundling `absolute inset-0` into a surface directive conflicts with rule 3's stylesheet-order argument if a future call site wants different geometry | low | low | rule 3 names border-radius and padding, not position; both call sites are full-bleed and full-bleed *is* the scrim's identity. The reason is written at the declaration so a third call site wanting other geometry re-opens it deliberately rather than by drift | claude | closed — reason recorded in `photo-scrim.ts`'s NOTE |
| R-4 | `aria-hidden` on the directive host hides something that should be exposed | low | med | the scrim is paint-only, has no content and is never focusable; both call sites already set it. AC-1 pins it and the e2e axe pass on both routes stays green | claude | closed — AC-1 pins it; axe stays green in phase 2 |
| R-5 | Tailwind stops generating a utility because the class now lives in a `.ts` host string rather than a template | low | high | `riviera-tailwind`'s ICON-5 note records that a host `class` string is scanned by Tailwind — the same mechanism `card-glass.ts` and `panel-glass.ts` already rely on. AC-4's computed `background-image` would catch a missing utility outright | claude | open — settles at phase 2's e2e run |

## Open questions / Assumptions

- *(empty — see Resolved)*

### Resolved

- **Open question (from the issue):** "Only two call sites — does a directive earn its keep,
  or leave two explicit spans?" → **Resolved: build the directive.** `riviera-tailwind` rule 1
  states the sharing rule with no call-site threshold; the in-tree precedents sit at the same
  scale (`appPanelGlass` 3 call sites — two of them these very two files — and `appFieldGlass`
  4, enumerated with `grep -rln "appPanelGlass\|appFieldGlass" frontend/src`); and the pair has
  a recorded divergence (#1044 gave the card `pointer-events-none`, the banner only caught up
  in #1064). The issue delegates the weighing to the implementer and asks only that it be
  deliberate, so it is recorded here and in the PR rather than escalated. — resolved at plan
  time, this commit.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes one decorative background-image overlay
on two read-only display surfaces; it touches no booking, no `set_availability` row, no pool
membership and no sales-close arithmetic.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file is in the diff.

### Module ownership (§4a)

N/A — frontend-only; no backend capability added or moved, so no module boundary is in play.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money, no Stripe call, no ledger entry.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/photo-scrim.ts` | new | standalone attribute directive, `host` classes + static `aria-hidden`, no inputs | none — stateless presentational primitive | none |
| FE-2 | `pages/home/home.html` + `home.ts` | existing | standalone component | unchanged | unchanged |
| FE-3 | `venue/venue-map.html` + `venue-map.ts` | existing | standalone component | unchanged | unchanged |

**Standards:** standalone directive, `host` metadata (not `@HostBinding`), no inputs, imported
explicitly by each consuming component — matching `card-glass.ts` and `panel-glass.ts` exactly.
No deviation.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** Extend `home.spec.ts` / `venue-map.spec.ts`, then swap both call sites to `appPhotoScrim`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Pin the no-drift baseline (characterization e2e against the OLD markup) | ✅ | this commit |
| 1 — The directive, red-green | ✅ | this commit |
| 2 — Swap both call sites, tighten the map assertion, generalization audit | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| *(none yet)* | | | |

---

## File structure

- `docs/plans/photo-scrim-directive.md` — this plan doc
- `frontend/src/app/shared/photo-scrim.ts` — new: the `[appPhotoScrim]` surface directive
- `frontend/src/app/shared/photo-scrim.spec.ts` — new: the host-contract spec (AC-1)
- `frontend/src/app/pages/home/home.html` — the Discover card's scrim span becomes the directive
- `frontend/src/app/pages/home/home.ts` — imports `PhotoScrim`
- `frontend/src/app/pages/home/home.spec.ts` — extends the `.photo-scrim` assertion with pointer-transparency (AC-2)
- `frontend/src/app/venue/venue-map.html` — the banner band's scrim span becomes the directive
- `frontend/src/app/venue/venue-map.ts` — imports `PhotoScrim`
- `frontend/src/app/venue/venue-map.spec.ts` — adds the element-level scrim assertion beside the innerHTML proof (AC-3)
- `frontend/e2e/discover-photos.e2e.ts` — the computed-style no-drift test across both surfaces (AC-4)

---

## Phase 0 — Pin the no-drift baseline

**Files:** Modify `frontend/e2e/discover-photos.e2e.ts`

This phase is a **characterization test**: it must pass against the OLD hand-written spans.
That is what makes it evidence in phase 2 rather than a description of whatever phase 2 did.

- [x] **Step 1: Write the test** — one mocked-suite test that reads the computed
  `background-image`, `position`, the four inset offsets and `pointer-events` off `.photo-scrim`
  on the Discover card and on the map banner, asserts the two are equal to each other, and
  asserts the literal recipe (`pointer-events: none`, `position: absolute`, every inset `0px`,
  a `background-image` carrying the scrim's `rgba(13, 40, 40, …)` stops).

- [x] **Step 2: Run it, verify it PASSES against the current markup** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts discover-photos -g "one identical recipe"`
  → **PASS (1 passed, 23.3s)**. The premise holds: the two spans are computationally identical
  today, so the recipe this test pins is theirs, not the directive's.

- [x] **Step 3: Commit** — `git commit -m "Pin the photo scrim's computed recipe on both surfaces (#1066)"`

- [x] **Step 4: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The directive, red-green

**Files:** Create `frontend/src/app/shared/photo-scrim.ts` · Test `frontend/src/app/shared/photo-scrim.spec.ts`

- [x] **Step 1: Write the failing test** — `photo-scrim.spec.ts`, modelled on `card-glass.spec.ts`:
  a `Host` component applying `appPhotoScrim` to a `<span>`; assert every recipe class is present,
  assert `aria-hidden="true"`, and assert no class on the host starts with `rounded` or `p`-padding
  (rule 3).

- [x] **Step 2: Run it, verify it fails** — `npx ng test --include "src/app/shared/photo-scrim.spec.ts"`
  → **FAIL**, `Cannot find module './photo-scrim'`. (`npm test -- <name>` does not scope — the
  Angular Vitest builder takes `--include <glob>`; the plan's later commands use that form.)

- [x] **Step 3: Minimal implementation** — `shared/photo-scrim.ts`: a standalone `@Directive`
  with selector `[appPhotoScrim]` and a `host` block carrying the recipe classes and
  `aria-hidden`, with the comment recording why the geometry is bundled where the glass
  directives unbundle radius.

- [x] **Step 4: Run it, verify it passes** — `npx ng test --include "src/app/shared/photo-scrim.spec.ts"`
  → **PASS (3 passed)**. Mutation-checked, not just observed green: dropping `pointer-events-none`
  and `aria-hidden` and adding `rounded-lg` fails all three tests, so none of them is vacuous.

- [x] **Step 5: Commit** — `git commit -m "Add the appPhotoScrim surface directive (#1066)"`

- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Swap both call sites

**Files:** Modify `frontend/src/app/pages/home/home.html|.ts|.spec.ts` ·
`frontend/src/app/venue/venue-map.html|.ts|.spec.ts`

- [ ] **Step 1: Extend the two surface specs first** — `home.spec.ts` asserts the card's
  `.photo-scrim` is pointer-transparent; `venue-map.spec.ts` gains a `.photo-band .photo-scrim`
  element assertion beside (not replacing) its innerHTML proof. Both pass against the old
  markup too — they describe the surface, not the mechanism.

- [ ] **Step 2: Swap the markup** — each span becomes `<span appPhotoScrim></span>`; add the
  `PhotoScrim` import to `home.ts` and `venue-map.ts`.

- [ ] **Step 3: Run the scoped suites** — `npm test -- photo-scrim home venue-map` → PASS, then
  `npm run lint && npm run format:check`.

- [ ] **Step 4: Run the no-drift proof** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- discover-photos`
  → PASS, unchanged from phase 0. This is AC-4.

- [ ] **Step 5: Generalization-audit pass** — population: *every element in a tourist template
  that hand-writes a multi-class decorative overlay recipe more than once*. Enumerate, judge each,
  record the finding command in the log below.

- [ ] **Step 6: Commit** — `git commit -m "Share the photo scrim as a directive across both bands (#1066)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npm test -- photo-scrim` → the host-contract spec passes. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `npm test -- home` → the card's scrim assertion passes. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `npm test -- venue-map` → the band's scrim assertion passes; the mocked e2e
  hit test still gives every touch to the "view larger" control. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- discover-photos`
  → the computed recipe is identical on both surfaces and unchanged from the phase-0 baseline.
  Verified at commit `<sha>`.

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
