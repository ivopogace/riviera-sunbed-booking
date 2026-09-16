# Riviera map: credit OpenMapTiles alongside OpenStreetMap — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every state of the riviera map visibly credits "© OpenMapTiles © OpenStreetMap
contributors", each name a link to its licence page, and the committed style plus the build
script that regenerates it carry the same credit — with still no request to a third-party host.

**Architecture:** The map chrome's own pill stays the only rendered credit (MapLibre's
attribution control is off, `maplibre-map-engine.ts`), so the fix is copy in one template plus the
metadata string the build script writes into `style.json`. The one decision worth naming: the
style keeps the credit as **plain text** (no URLs) — ADR-0022's review trap treats any hostname in
`platform/map/style.json` as a Blocker, and the links live in the chrome, where a hyperlink is not a
request.

**Persistence:** N/A — no table, no migration.

**Source of intent:** GitHub issue #1106 (follow-up from PR #1105 / issue #1103, epic #806).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — found the MANIFEST
hazard the brief warns of already fixed by #1112, the licence's *link-or-".org"* requirement that
makes plain "© OpenMapTiles" non-compliant, and the stale credit in epic #806's spec) ·
`riviera-plan-doc` (this template — forced the chrome↔style agreement to be a named test rather
than a review note) · `tdd` (each credit surface pinned red before its copy changes) ·
`riviera-review-overlay` (review gate — at ready-for-review) · `riviera-docs-freshness` (**to run**
at close-out over the PR range — also retires the merged `msys-style-json-paths` and
`riviera-map-glyph-ranges` plans) · `grilling` (the two human decisions: OpenMapTiles is a link;
the privacy policy is unchanged) · `riviera-frontend` (placement unchanged — `shared/riviera-map`,
the mocked `frontend/e2e/` suite for the agreement lock) · `riviera-tailwind` (rule 4: both links
keep the inline `data-touch-exempt`; the longer pill wraps at 320 px, so it takes a both-sides inset and a 13 px radius that is still a full pill on one line) ·
`angular-developer` + angular-cli MCP `get_best_practices` (template-only change; nothing to
modernise in the touched block) · `playwright-cli` (the agreement e2e compares the pill with the style response the
engine actually loaded, served from `platform/map/` by `support/map-resources.ts`) · `domain-modeling` (ADR-0022 corrected by amendment, no
new ADR — not a new trade-off) · `riviera-local-debug` (Vitest + mocked e2e via
`test:e2e:a11y` on Windows)

**Branch:** `bugfix/map-openmaptiles-attribution`

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the riviera map chrome in each state (booting, ready, unavailable), when it
  renders, then the attribution reads exactly "© OpenMapTiles © OpenStreetMap contributors", with
  "OpenMapTiles" linking to `https://openmaptiles.org/` and "OpenStreetMap" to
  `https://www.openstreetmap.org/copyright`, each opening in a new tab with `noopener` and carrying
  the inline-link touch exemption. *Seam:* the `RivieraMap` component's rendered chrome, driven
  through the `MapEngine` DI token (fake / no-WebGL engines) · *Pinned by:*
  `riviera-map.spec.ts › always credits OpenMapTiles and OpenStreetMap, each as a link to its licence page`
  and `› tells a WebGL-less browser the list has every venue, and offers no zoom`.
- [x] **AC-2:** Given the committed `platform/map/style.json` served under `/map/**`, when the real
  MapLibre adapter renders Discover's map, then the pill's text equals the style's vector-source
  `attribution` exactly (verified red against the pre-fix `style.json`). *Seam:* the served `/map/style.json` resource and the rendered chrome in a
  real browser · *Pinned by:* `discover-map.e2e.ts › Discover map — real engine › credits the tiles exactly as the committed style does`.
- [x] **AC-3:** Given an upstream style, when `rewrite_style` rewrites it, then the output's vector
  source carries `attribution: "© OpenMapTiles © OpenStreetMap contributors"`, identical to the
  committed style's — and re-running `scripts/build-riviera-map.sh --assets` changes nothing under
  `platform/map/` but that line. *Seam:* the sourced `rewrite_style` function · *Pinned by:*
  `build-riviera-map.test.sh › test_rewrite_style_credits_openmaptiles_and_osm` (by-hand verifier,
  not a CI gate) + the regeneration run recorded in Execution status.
- [x] **AC-4:** Given ADR-0022, when read, then decision 6 names both credits and both outbound
  links, marked amended, and the amendment log carries a #1106 entry. *Seam:* the ADR text ·
  *Pinned by:* review (`grep -n "OpenMapTiles" docs/adr/ADR-0022-self-hosted-map-resources.md`).
- [x] **AC-5:** Given the map open on Discover with the real adapter, when every request is
  observed, then none leaves our origin. *Seam:* the page's network traffic · *Pinned by:* the
  existing `discover-map.e2e.ts › Discover map — real engine › the map open on Discover makes no request to a third party`.
- [x] **AC-6:** Given a 320 px phone with the map open, where the credit takes two lines, when the
  pill renders, then it keeps its 12 px inset from the map's left, right and bottom edges; on a
  390 px phone the map chrome stays axe-clean and passes the touch-target sweep. *Seam:* the
  rendered chrome's bounding boxes · *Pinned by:* `discover-map.e2e.ts › Discover map — fake engine › keeps the credit inset inside the map on the narrowest phone, where it wraps`
  and `› map chrome is labelled, skippable and axe-clean; the switch alternates the panels on a phone`
  — contrast unchanged, `riviera-map.contrast.spec.ts`.

## Non-goals

- Changing the tile source, profile, bounding box or zoom range.
- A wider licence review (OSM Liberty's design, Maki icons, Roboto glyphs, the ALTCHA widget).
- The privacy policy's map section — decided unchanged: it describes data flow, and OpenMapTiles
  is neither a data source nor a recipient.
- Re-enabling MapLibre's own attribution control.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing (the pill gains a credit; nothing is retired).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Re-running `--assets` pulls upstream `gh-pages` drift (OSM Liberty style/sprites, glyph ranges) into an attribution-only PR | low (regenerated by #1114) | med | inspect `git diff --stat platform/map`; any change beyond the attribution line → revert those files, record the drift, file a follow-up | Claude | closed — the run changed `style.json`'s attribution line only; MANIFEST, sprites and glyphs byte-identical (phase 1) |
| R-2 | The longer pill wraps or overflows the map on a narrow phone | med | low | measured: one line from 360 px; at 320 px it wrapped flush with the map's left edge → `max-w-[calc(100%-24px)]` + `rounded-[13px]`, pinned by AC-6 | Claude | closed (phase 1) |
| R-3 | A URL pasted into `style.json`'s attribution trips the ADR-0022 review trap | low | high | the style carries plain text only; AC-3 pins the exact string | Claude | closed — pinned by AC-3 (phase 1) |

## Open questions / Assumptions

### Resolved

- **Is "OpenMapTiles" a hyperlink or plain text?** — a link to `https://openmaptiles.org/` (Ivo,
  intake grill). The licence requires either the ".org" text or a link; the link matches the
  licence's own example and the archive's metadata. ADR-0022 gains a second outbound reference.
- **Should the privacy policy name OpenMapTiles?** — no (Ivo, intake grill); see Non-goals.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: map chrome copy and a static style file only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only (plus the build script and the committed style file the root edge serves; no
Java changes).

### Module ownership (§4a)

All in the platform edge's map resources (`RESPONSIBILITIES.md` § *Platform edge* → *Riviera map
resources*) and the frontend `shared/riviera-map` chrome; no domain module, no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/riviera-map.html` (attribution pill) + `riviera-map.ts` doc comment | existing | standalone component template | none — static copy | none |

**Standards:** unchanged — no new bindings.

## FE↔BE contract

N/A — no contract change (the style file is a static resource; its URL fields are untouched).

## Execution status

**Stage pointer:** review gate — PR #1116 ready for review (phase 1 CI 8/8 green; branch level with `main`, no merge needed)

**Next action:** run `/code-review` over the resolved range (`pr-gates.md` §1) with `riviera-review-overlay`; then the Sonar gate (§2).

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — the credit (chrome, style, script) test-first | ✅ | `f34053af` |
| 2 — ADR-0022 amendment + epic #806 spec | ✅ | this commit (epic #806 body edited on GitHub) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/map-openmaptiles-attribution.md` — this plan.
- `frontend/src/app/shared/riviera-map.html` — the pill: two links, the combined credit.
- `frontend/src/app/shared/riviera-map.ts` — the component doc comment's credit wording.
- `frontend/src/app/shared/riviera-map.spec.ts` — AC-1.
- `frontend/e2e/discover-map.e2e.ts` — AC-2 (new real-engine test), AC-6 (containment), exact text.
- `scripts/build-riviera-map.sh` — `rewrite_style`'s attribution string.
- `scripts/build-riviera-map.test.sh` — AC-3.
- `platform/map/style.json` — regenerated: the vector source's attribution.
- `docs/adr/ADR-0022-self-hosted-map-resources.md` — decision 6 + amendment log (AC-4).
- `docs/plans/msys-style-json-paths.md`, `docs/plans/riviera-map-glyph-ranges.md` — retired at
  close-out (their PRs #1113, #1114 merged).

---

## Phase 1 — the credit, test-first

**Files:** Modify `riviera-map.html`, `riviera-map.spec.ts`, `discover-map.e2e.ts`,
`riviera-map.ts`, `build-riviera-map.sh`, `build-riviera-map.test.sh`,
`platform/map/style.json`

- [x] **Step 1:** AC-1 red — rewrite the unit test for the combined credit and both links; extend
  the no-WebGL test to assert the same text. `npx vitest run src/app/shared/riviera-map.spec.ts`
  (via `npm test -- --include`) → FAIL on the text.
- [x] **Step 2:** AC-3 red — `test_rewrite_style_credits_openmaptiles_and_osm` in the script test,
  asserting the exact string and equality with the committed style. `bash scripts/build-riviera-map.test.sh` → FAIL.
- [x] **Step 3:** AC-2 red — the real-engine e2e comparing the pill with the committed style's
  attribution; tighten the fake-engine phone test to the exact text + containment (AC-6).
  `npm run test:e2e:a11y -- discover-map` → FAIL.
- [x] **Step 4:** Green — the pill's copy and links; `rewrite_style`'s string; regenerate with
  `scripts/build-riviera-map.sh --assets` and check R-1 (`git diff --stat platform/map`).
- [x] **Step 5:** Re-run all three → PASS; `npm run lint`, `npm run format:check`, `npm run test:a11y`.
- [x] **Step 6:** Generalization-audit pass — population: every surface that states the map's
  credit, enumerated by `git grep -n "OpenStreetMap contributors"`.
- [x] **Step 7:** Commit `Credit OpenMapTiles alongside OpenStreetMap on the riviera map (#1106)` +
  Execution status; open the draft PR.

## Phase 2 — the record

- [x] **Step 1:** ADR-0022 decision 6 amended in place + amendment-log entry (AC-4); epic #806's spec (story 13 + Implementation Decisions) edited on
  GitHub.
- [x] **Step 2:** Commit + Execution status; push; check the run.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | phase 1 | every tracked file that states the map's credit or its licence | `git grep -n "OpenStreetMap contributors|OpenStreetMap attribution|ODbL" -- ':!platform/map/style.json'` | pill, unit spec, e2e, component TSDoc, build script + test (all updated); ADR-0022 decision 6 | ADR → phase 2; epic #806's spec (GitHub, not tracked) → phase 2 |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- --include src/app/shared/riviera-map.spec.ts` → pass.
- [ ] **AC-2, AC-5, AC-6:** `npm run test:e2e:a11y -- discover-map` → pass (and CI's mocked e2e).
- [ ] **AC-3:** `bash scripts/build-riviera-map.test.sh` → `0 failed`; regeneration diff recorded.
- [ ] **AC-4:** ADR-0022 grep shows the amended decision and the log entry.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no Java.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy (invariant #10) — N/A.
- [ ] Timezone (invariant #6) — N/A.
- [ ] Booking codes (invariant #7) — N/A.
- [ ] Flyway (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` per `pr-gates.md` §1 plus `riviera-review-overlay`.
