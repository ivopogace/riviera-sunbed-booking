# New / Unrated Venue State (issue #154) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use `- [ ]` tracking.

**Goal:** A venue with `reviewsCount === 0` shows a **"New"** treatment (no `★ 0.0`,
no *"rated 0.0 out of 5"* a11y label) on both the home venue card and the venue-map
detail header; rated venues are byte-for-byte unchanged.

**Architecture:** Extract the rating logic (`isRated` + score formatting) into a
single pure `shared/rating.ts` helper consumed by both surfaces, so the
"no-reviews" decision has one tested home instead of two drifting copies (the issue
explicitly flags the mirrored pattern).

**Persistence:** N/A — frontend-only, no wire/contract change (`ratingTenths`
stays the API contract, per Non-goals).

**Source of intent:** GitHub issue #154 (part of #152).

**Skills consulted:** `riviera-frontend` (pure stateless helper → `shared/`; feature
files stay in `pages/home` + `venue`), `riviera-tailwind` (reuse the existing
proven mode-chip token recipe `--riv-chip-*`/`--riv-card-*` for the "New" pill — no
new tinted surface, so no new contrast-spec math), `angular-developer` + angular-cli
MCP (`@if/@else` native control flow, delegate helpers, no new component needed),
`playwright-cli` (assess e2e — see Non-goals; unit + a11y coverage is the AC bar here).

**Branch:** cloud designated branch `claude/sdlc-154-mq9ldm` stands in for
`bugfix/new-venue-unrated-state` (remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with `reviewsCount === 0`, when the home card renders,
  then it shows a "New" treatment and **no** `★`/`0.0`/"0 reviews" text. *Pinned by:*
  `home.spec.ts` "renders a New state for an unrated venue".
- [ ] **AC-2:** Given a venue with `reviewsCount === 0`, when the home card's
  accessible label is computed, then it contains "no reviews yet" and **not** "rated
  0.0 out of 5". *Pinned by:* `home.spec.ts` "card aria-label says no reviews yet for an unrated venue".
- [ ] **AC-3:** Given a venue with `reviewsCount === 0`, when the venue-map header
  renders, then it shows a "New" pill (aria "No reviews yet") and no `0.0` rating.
  *Pinned by:* `venue-map.spec.ts` "renders a New state for an unrated venue".
- [ ] **AC-4:** Given a rated venue (48 tenths / 326 reviews), when either surface
  renders, then it shows `4.8` + "326 reviews" exactly as before. *Pinned by:*
  existing `home.spec.ts`/`venue-map.spec.ts` rating assertions (kept green).
- [ ] **AC-5:** Given the `shared/rating.ts` helper, `isRated` is true iff
  `reviewsCount > 0` and `ratingScore(48) === "4.8"`. *Pinned by:* `rating.spec.ts`.

## Non-goals

- Changing the rating source/precision — `ratingTenths` stays the API contract.
- ~~New e2e spec~~ — **reversed at the review gate (F-1):** RV-FE-E2E warranted
  real-browser axe on the new "New" pill (the venue-map chip is *not* inside an
  aria-hidden region, unlike the home card), so an unrated-venue case was added to the
  mocked CI suite `discovery-flow.e2e.ts`.
- Backfilling review data or any backend change.

## Behavior-parity ledger

N/A — additive branch (a new "no-reviews" render path); the rated path is unchanged
and pinned by AC-4.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | "New" pill introduces an un-proven tinted surface → contrast regression | low | med | Reuse the existing proven `--riv-chip-*`/`--riv-card-ink` tokens (mode chip already renders there); no new contrast surface | agent | open |
| R-2 | a11y label still leaks "0.0" via `cardLabel` string concat | low | med | Branch the rating segment inside `cardLabel`; assert absence in AC-2 | agent | open |

## Open questions / Assumptions

- **Assumption:** "New" is the agreed visible treatment (issue offered "New" chip
  *or* "No reviews yet" label). Choosing the compact "New" pill + "No reviews yet"
  accessible text. — *Owner:* agent · *Resolves by:* review gate.

## Availability & concurrency (invariant #2)

N/A — does not touch booking, availability, or the beach map (display-only).

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/rating.ts` (+ `.spec.ts`) | new | pure helper | — | — |
| FE-2 | `pages/home/home.ts` + `home.html` + `home.scss` | modify | component | signals (unchanged) | — |
| FE-3 | `venue/venue-map.ts` + `venue-map.html` | modify | component | signals (unchanged) | — |

**Standards:** `@if/@else` native control flow, delegate to the shared helper, keep
`data-testid="new-chip"` as the test hook, reuse proven `--riv-*` tokens.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** Review gate walked (self-review) → awaiting CI + Sonar on the PR.

**Next action:** confirm CI green on HEAD; run the Sonar gate when the PR exists.

**Review-gate verdict (riviera-review-overlay, FE scope):** RV-FE-1 ✅ (`@if/@else`,
no `ngClass`/`ngStyle`, pure helper in `shared/`); RV-FE-7 ✅ (venue-map reuses the
proven mode-chip token recipe — no `@apply`/new `.scss`; home keeps its SCSS idiom,
test-hook classes `.star`/`.rating`/`.dot` retained, no drift on the unchanged rated
path); RV-FE-3 ➖ (no money math — rating display only); RV-FE-E2E → F-1 fixed;
RV-STYLE-1 → F-2 fixed (2-line SCSS comment shortened); RV-PROC-1 ✅ (Skills consulted
covers every touched area).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — shared `rating.ts` helper + spec | ✅ | pending push |
| 1 — home card New state + specs | ✅ | pending push |
| 2 — venue-map header New state + specs | ✅ | pending push |

Local verification: `rating.spec.ts` (4), `home.spec.ts` (26), `venue-map.spec.ts` (29),
home+venue-map a11y/contrast (56) all green; `ng lint` clean; `ng build` OK (pre-existing
`.scss` budget warnings only).

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-FE-E2E) | Frontend change lacked real-browser e2e coverage of the "New" state | fixed — added unrated case to `discovery-flow.e2e.ts` (6/6 green) |
| F-2 | review (RV-STYLE-1) | 2-line inline comment in `home.scss` | fixed — shortened to one line |

---

## File structure

- `frontend/src/app/shared/rating.ts` — `RatingView`, `isRated`, `ratingScore` (new).
- `frontend/src/app/shared/rating.spec.ts` — unit spec (new).
- `frontend/src/app/pages/home/home.ts` — delegate `rating`, add `isRated`, branch `cardLabel`.
- `frontend/src/app/pages/home/home.html` — `@if (isRated)` rating row `@else` New chip.
- `frontend/src/app/pages/home/home.scss` — `.card-meta .new-chip` pill (proven tokens).
- `frontend/src/app/venue/venue-map.ts` — delegate `rating`, add `isRated`.
- `frontend/src/app/venue/venue-map.html` — `@if (isRated)` rating row `@else` New pill.
- Specs: `home.spec.ts`, `venue-map.spec.ts` gain unrated-venue cases.

---

## Acceptance-criteria verification (final)

- [ ] AC-1..5 verified via `npm test` (scoped) + `npm run test:a11y` green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying test.
- [ ] Frontend standards met; no `as any`; helper is pure and placed in `shared/`.
- [ ] No new un-proven tinted surface (contrast specs stay green).
- [ ] Execution status at HEAD matches reality.
