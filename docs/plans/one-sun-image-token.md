# One Sun Image Token Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Collapse the tree's three inline sun gradients — the app-shell brand mark and the
two `photos.length === 0` empty states — onto one `--riv-sun-grad` image token carrying
#704's opaque values, which also fixes the home card's sun compositing green.

**Architecture:** One declaration is the only thing that keeps a mirror mirroring
(`--riv-premium-grad`, `--riv-walkin-hatch`). The merged value is the **map's** 4-stop paint,
not a negotiated middle, because it is the one already tuned against the cyan it sits on —
which makes two of the three consumers byte-identical or imperceptible, and leaves the third
(the broken one) as the only pixel movement. The token is theme-invariant on the #704 ground
generalized: **every stop is opaque, so the sun composites against nothing** and cannot drift
with the themed backdrop under it.

**Persistence:** N/A — frontend-only, no tables, no migration.

**Source of intent:** GitHub issue #882 (parent: #879's phase-1 generalization audit, PR #880).
Prototype: branch `spike/882-sun-merge`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue pairs the wrong two suns and that a third exists) · `riviera-plan-doc` (this template —
forced the behavior-parity ledger that surfaced `venue-map.spec.ts`'s rgba assertion needing a
new home) · `tdd` (each phase red→green at the seams below) · `riviera-review-overlay` (review
gate — runs at ready-for-review) · `riviera-docs-freshness` (**ran** over the slice range at
close-out, findings recorded in the Generalization-audit log) · `prototype` (built the spike
that answered the design question with a real render rather than an argument) ·
`riviera-tailwind` (image tokens keep the `bg-(image:--riv-*)` arbitrary form and need no
`@theme inline` row; the single-declaration + no-drift proofs; theme-invariance argued at the
declaration) · `riviera-frontend` (the tree-wide guard spec belongs in `shared/`, not `venue/`;
the CI-safe mocked suite is where the computed-style proof lives) · `riviera-local-debug`
(scoped Vitest + `PW_CHROMIUM_EXECUTABLE` for the mocked e2e) · `playwright-cli` (authoring the
computed-style e2e) · `riviera-java-conventions` (loaded at the review-fix round — §6d is the
canonical comment rule the F-2 trim applied, frontend twin included).

**Branch:** `claude/sdlc-882-u5bby2` — the cloud session's designated remote branch stands in
for `feature/one-sun-image-token` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given `src/tailwind.css`, when the stylesheet is read as text, then
  `--riv-sun-grad` is declared exactly once and that declaration sits in the base block, so no
  theme block can override it. *Seam:* `src/tailwind.css` as text via
  `testing/stylesheet-tokens.ts` (`declarationsOf`, `baseBlock`) · *Pinned by:*
  `sun-token.contrast.spec.ts` › `declares one sun, in the base block`

- [x] **AC-2:** Given every non-spec `.ts`/`.html` under `src/app`, when swept for a radial
  gradient built inline from the sun's own amber family, then no file rebuilds one — the sweep
  reports the paths to fix, not the sources. *Seam:* the app-source sweep over `src/app`
  (`class-o-tint-tokens.contrast.spec.ts`'s `appSources()` pattern) · *Pinned by:*
  `sun-token.contrast.spec.ts` › `no source rebuilds a sun inline`

- [x] **AC-3:** Given the brand mark, a photo-less venue card and a photo-less venue-map band
  rendered in a real browser, when each element's `background-image` is read from
  `getComputedStyle`, then all three resolve to the same value. *Seam:* the rendered DOM at `/`
  and `/venues/1` (mocked API) · *Pinned by:* `e2e/sun-token.e2e.ts` › `all three suns resolve
  one computed background-image`

- [x] **AC-4:** Given the home venue card's `.photo-sun` in a real render, when its computed
  `background-image` and `opacity` are read, then the image contains no `rgba(` stop and the
  opacity is `1` — the sun covers the cyan instead of compositing green against it. *Seam:* the
  rendered `.photo-sun` at `/` · *Pinned by:* `e2e/sun-token.e2e.ts` › `the card sun is opaque,
  so it cannot composite against the sea`

- [x] **AC-5:** Given the venue-map band's sun, when its computed `background-image` is compared
  against the literal it carried before this slice, then the two are equal — the merge moves no
  pixel at the consumer whose values were adopted. *Seam:* the rendered
  `[data-testid="map-banner-empty"]` at `/venues/1` · *Pinned by:* `e2e/sun-token.e2e.ts` › `the
  band does not move — the merged value is the one it already had`

- [x] **AC-6:** Given a photo-less venue card, when the location text's contrast floor is
  computed against its worst-case backdrop, then the floor is unchanged by this slice — the
  white-photo worst case (`#ffffff`) still bounds the sun's brightest stop (`#fff6da`). *Seam:*
  the composited-contrast maths in `src/testing/contrast.ts` · *Pinned by:*
  `home.contrast.spec.ts` (existing, must stay green unmodified)

## Non-goals

- The other five inline gradients the enumeration returns (`booking-dialog`, `booking-view`,
  `beach-grid-frame`, `beach-map-canvas`, `map-tile`). None is a sun; each is per-site. The
  answer here does not generalize to them.
- Re-tuning the sun's geometry, size or glow at any site. Sizes (32 / 52 / 68–96 px), the brand
  mark's white ring, and the map's halo stay exactly as they are — only the **fill** merges.
- A `@theme inline` utility mapping. Image tokens are consumed as `bg-(image:--riv-*)` and get
  no `bg-riv-*` utility (`riviera-tailwind` § Styling across the themes).
- Any change to `--riv-photo-grad` / `--riv-photo-scrim`, including their dark overrides.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Map band sun: opaque 4-stop `circle at 38% 30%` fill | **preserved** | becomes the token's value verbatim; AC-5 pins it byte-identical |
| Map band sun: `shadow-[0_0_44px_14px_rgba(255,199,105,0.4)]` halo | **preserved** | untouched — the halo is translucent on purpose ("a halo is meant to take the sea's colour"), and it is not part of the fill |
| Map band sun: `size-[68px] min-[1024px]:size-[96px]` responsive size | **preserved** | untouched; `venue-map.spec.ts` keeps asserting the `min-[1024px]` step |
| Map band sun: spec asserts the fill carries no `rgba` stop (#704) | **changed** | the assertion moves to the token guard (AC-2/AC-4), where it now covers *all three* consumers instead of one; `venue-map.spec.ts` keeps a consumes-the-token assertion in its place |
| Card sun: `circle at 34% 30%` two translucent stops | **changed** | → the merged opaque paint. This is the pixel movement the slice exists to make; it was rendering rgb(117,162,126) |
| Card sun: `opacity-85` | **dropped** | it is half of what composited the sun green; an opaque fill behind 85% opacity is still 85% composited. Approved from the prototype render |
| Card sun: `blur-[0.5px]` | **dropped** | ditto — softening the edge of a correctly-opaque disc was compensating for a fill that read wrong. Approved from the prototype render |
| Card sun: `.photo-sun` class, position, size, `@if` empty-state condition | **preserved** | `.photo-sun` stays as an inert marker (`riviera-tailwind` rule 2 — `home.spec.ts` queries it) |
| Brand mark: `#ffe6a3 → #f0aa2e 70%` two-stop fill | **changed** | → the merged paint. Indistinguishable at 32 px per the prototype; AC-3 pins the shared value |
| Brand mark: white ring + amber glow `shadow-[…]` | **preserved** | untouched — a separate property from the fill |
| Brand mark: `aria-hidden`, inside `[data-testid="brand-home"]` | **preserved** | untouched; decorative to AT either way |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The brighter, fully-opaque card sun raises the backdrop under the card's location text and breaks its AA floor | low | high | The floor is already computed against a **white** photo, which bounds `#fff6da`; AC-6 keeps `home.contrast.spec.ts` green **unmodified** — if it needs editing to pass, the floor moved and the slice stops | Claude | **closed** — phase 0: `home.contrast.spec.ts` green, unmodified in the diff |
| R-2 | A later slice adds a `[data-riv-theme='dark']` override of `--riv-sun-grad`, silently re-introducing per-theme drift that no contrast maths can see | med | med | AC-1's single-declaration + base-block guard reads the stylesheet as text — the only check able to see an override added later (`stylesheet-tokens.ts`'s stated reason) | Claude | **closed** — phase 0 |
| R-3 | AC-2's sweep is written so it can only pass — a regex that stops matching yields `[]` and the assertion passes for the wrong reason | med | high | A meta-test asserts the sweep's pattern **does** match the pre-merge literals, the trap `class-o-tint-tokens.contrast.spec.ts` documents hitting ("a helper that fails OPEN") | Claude | **closed** — phase 0: `has a sweep that can actually fail`, green while the other three were red |
| R-4 | `venue-map.spec.ts`'s `not.toContain('rgba')` assertion is deleted rather than rehomed, dropping #704's guarantee | med | high | Behavior-parity ledger row marks it **changed, not dropped**; AC-4 re-establishes it in a real render across all three consumers | Claude | **closed** — phase 1: AC-4 asserts it in a real render, across all three consumers |
| R-5 | Flyway version collision with an in-flight PR | n/a | n/a | N/A — no migration in this slice | — | closed |

## Open questions / Assumptions

### Resolved

- **Open question:** Are the app shell's sun and the home one meant to be the same sun?
  — *Resolved:* the question was mis-framed; there are **three** suns and they split 1/2 by
  role. Discharged by `prototype` (branch `spike/882-sun-merge`), which rendered all three under
  each candidate in the real app; the maintainer's call on that evidence was **merge all three**.
  Recorded on issue #882.
- **Open question:** May the PR be opened? — *Resolved:* the maintainer authorised it and asked
  for the flow driven to merge. Opened as **PR #885**, ready for review.
- **Open question:** May `spike/882-sun-merge` be pushed? — *Resolved:* not authorised, so not
  pushed. The spike's verdict — the only thing `prototype` says graduates — is captured in the
  audit-doc section and on issue #882, so nothing depends on the branch surviving.
- **Open question:** Which paint does the merged token carry? — *Resolved:* the map's opaque
  4-stop. Two of three consumers then do not move (byte-identical band, imperceptible 32 px brand
  mark) and #704's already-tuned values become the single declaration. Maintainer confirmed.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes one CSS custom property and three
`class` attributes; it reads no `(set, date)` row, touches no booking path, and ships no
backend code.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is in the diff.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/app/app.html` | existing | root shell template | none — a static decorative span | none |
| FE-2 | `src/app/pages/home/home.html` | existing | page template | none — inside the existing `@if (card.photos.length === 0)` | none |
| FE-3 | `src/app/venue/venue-map.html` | existing | feature template | none — inside the existing `@if (v.photos.length === 0)` | none |
| FE-4 | `src/tailwind.css` | existing | token registry (base block) | n/a | n/a |

**Standards:** no component/TS change at all — three `class` attributes and one token
declaration. Native control flow, `aria-hidden` and the empty-state conditions are untouched, so
the standalone/`inject()`/signal-API surface is unchanged by construction.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `review gate run (3 findings, all fixed) — awaiting CI + Sonar on the fix round`

**Next action:** Confirm CI green and pull the SonarCloud issue + duplication list for PR
#885; then the merge close-out (`pr-gates.md` §3).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the token, the three consumers, the unit guard | ✅ | `b93044c` |
| 1 — the mocked-e2e computed-style proof | ✅ | `dc214d4` |
| 2 — record the answer in the audit doc | ✅ | `dc214d4` |
| 3 — review-gate findings F-1..F-3 | ✅ | `859ce7d` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (bug scan) | The sweep's meta-test exercised the matcher but never `appSources()`, so a broken enumeration would still pass `[]` vacuously — the exact fail-open the docblock claimed to close | fixed-in-`859ce7d` — the meta-test now pins that the enumeration reaches all three sun sites; verified by breaking the filter (the sweep passed, the meta-test failed) |
| F-2 | review gate (prior-PR feedback) | Doc comments over §6d budget, carrying issue numbers and decision history — the same shape reviews on PR #878 and #883 trimmed on this file family | fixed-in-`859ce7d` — token comment 27→6 lines, spec docblock 25→9, e2e docblock 14→7; narration relocated to the audit-doc section, pointers kept |
| F-3 | review gate (comment compliance) | Audit doc said the slice removes **two** `rgba(240,170,46,…)` positions; the card sun carried **one** (its other stop was a different colour family) | fixed-in-`859ce7d` |

---

## File structure

- `docs/plans/one-sun-image-token.md` — this plan
- `frontend/src/tailwind.css` — declare `--riv-sun-grad` in the base block; correct the stale
  claim in `--riv-premium-grad`'s comment that its walk-in sibling cannot be an image token
  (#879 overturned it and the very next block declares `--riv-walkin-hatch`)
- `frontend/src/app/app.html` — brand mark onto the token
- `frontend/src/app/pages/home/home.html` — card empty state onto the token; drop `opacity-85`
  and `blur-[0.5px]`
- `frontend/src/app/venue/venue-map.html` — band empty state onto the token
- `frontend/src/app/venue/venue-map.spec.ts` — rehome the #704 `rgba` assertion as a
  consumes-the-token assertion
- `frontend/src/app/shared/sun-token.contrast.spec.ts` — the single-declaration + no-inline-rebuild
  guard, with its fails-open meta-test
- `frontend/src/app/shared/fixed-fill-token-skins.contrast.spec.ts` — retire the out-of-family row
  for `pages/home/home.html`, whose guarded paint this slice removes rather than renames
- `frontend/e2e/sun-token.e2e.ts` — the computed-style proof across all three surfaces
- `docs/design/colour-literal-token-audit.md` — record the answer, per the issue's AC-1

---

## Phase 0 — The token, the three consumers, the unit guard

**Files:** Create `frontend/src/app/shared/sun-token.contrast.spec.ts` · Modify
`frontend/src/tailwind.css`, `frontend/src/app/app.html`,
`frontend/src/app/pages/home/home.html`, `frontend/src/app/venue/venue-map.html`,
`frontend/src/app/venue/venue-map.spec.ts`

- [ ] **Step 1: Write the failing test** — `sun-token.contrast.spec.ts`, asserting one
  declaration in the base block and that no app source rebuilds a sun inline, plus the meta-test
  that the sweep's pattern really does match the pre-merge literals.

- [ ] **Step 2: Run it, verify it fails** —
  `npm test -- --run src/app/shared/sun-token.contrast.spec.ts` → FAIL: `--riv-sun-grad`
  declarations `[]` (expected length 1), and the sweep reports three paths.

- [ ] **Step 3: Minimal implementation** — declare the token, move the three consumers, rehome
  the `venue-map.spec.ts` assertion.

- [ ] **Step 4: Run it, verify it passes** —
  `npm test -- --run src/app/shared/sun-token.contrast.spec.ts src/app/venue/venue-map.spec.ts src/app/pages/home/home.spec.ts src/app/pages/home/home.contrast.spec.ts`
  → PASS, with `home.contrast.spec.ts` green **unmodified** (AC-6).

- [ ] **Step 5: Generalization-audit pass** — population: every image built inline in a class
  expression. Enumerate with the issue's own command; judge each survivor.

- [ ] **Step 6: Commit** — `git commit -m "Collapse the three suns onto one --riv-sun-grad token (#882)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The computed-style proof

**Files:** Create `frontend/e2e/sun-token.e2e.ts`

- [ ] **Step 1: Write the failing test** — the mocked e2e reading `background-image` off all
  three suns and asserting one shared value, no `rgba(`, `opacity: 1` on the card, and the band
  equal to its pre-merge literal.

- [ ] **Step 2: Run it, verify it fails** — against `git stash`ed phase-0 changes, or by
  asserting first and implementing after; → FAIL on three differing values.

- [ ] **Step 3: Minimal implementation** — none needed if phase 0 is correct; the e2e is the
  proof, and a failure here means phase 0 is wrong.

- [ ] **Step 4: Run it, verify it passes** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- sun-token` → PASS.

- [ ] **Step 5: Generalization-audit pass** — n/a for a proof-only phase; record "no new pattern".

- [ ] **Step 6: Commit** — `git commit -m "Prove the merged sun in a real render (#882)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Record the answer

**Files:** Modify `docs/design/colour-literal-token-audit.md`

- [ ] **Step 1: Write the failing test** — n/a, documentation phase. The issue's AC-1 ("the
  question is answered either way and recorded") is the acceptance test, verified by review.

- [ ] **Step 2–4:** Write the entry: the 1/2-by-role split, the third sun the enumeration
  returned, the #704 defect the merge fixed, the values chosen and why, and the app shell's role
  distinction written at the declaration.

- [ ] **Step 5: Generalization-audit pass** — run `riviera-docs-freshness` over the slice range,
  including the counting sweep (this makes the Nth image token; check every doc stating "the two
  image tokens" or similar).

- [ ] **Step 6: Commit** — `git commit -m "Record the sun merge in the colour-literal audit (#882)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-01 | phase 0 | every image built inline in a class expression — the mechanism, not the ambers the issue named | `for f in $(git ls-files \| sed 's\|^frontend/\|\|' \| grep -E '^src/app/.*\.(ts\|html)$' \| grep -v '\.spec\.ts$'); do grep -oE "bg-\[[^]]*gradient\([^]]*\]" "$f" \| sed "s\|^\|${f}: \|"; done` | 8 → 5 after the merge | 3 were suns (the issue named 2) → merged onto `--riv-sun-grad`; the surviving 5 are linear/repeating-linear, none a sun, each per-site → out of scope per the issue |
| 2026-09-01 | phase 1 | every guard asserting that a source still paints one of the literals this slice removes — enumerated by running the whole unit suite rather than by grepping for what I expected to break | `npx ng test --watch=false` | 1 — `fixed-fill-token-skins.contrast.spec.ts`'s `OUT_OF_FAMILY` row for `pages/home/home.html` | Row retired with the reason recorded at the site: its guarded paint is **gone**, not renamed, which is the case that rewrites a row instead. The other three `rgba(240,170,46,…)` rows still stand |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `npx ng test --watch=false --include="src/app/shared/sun-token.contrast.spec.ts"` → 4 passed. Verified at commit `b93044c`.
- [x] **AC-2:** Same command → 4 passed (sweep + meta-test). Verified at commit `b93044c`.
- [x] **AC-3:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- sun-token` → 3 passed. Verified at commit `dc214d4`.
- [x] **AC-4:** Same command → 3 passed. Verified at commit `dc214d4`.
- [x] **AC-5:** Same command → 3 passed. Verified at commit `dc214d4`.
- [x] **AC-6:** Run `npx ng test --watch=false --include="src/app/pages/home/home.contrast.spec.ts"` → PASS, with the file absent from the diff. Verified at commit `b93044c`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — n/a, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — n/a.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy (invariant #10) — n/a.
- [ ] Timezone (invariant #6) — n/a.
- [ ] Booking codes (invariant #7) — n/a.
- [ ] Flyway migration (invariant #12) — n/a, no schema change.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
