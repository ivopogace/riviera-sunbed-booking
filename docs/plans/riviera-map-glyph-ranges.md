# Riviera map glyph ranges Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every codepoint a label in the committed riviera map archive actually renders falls
inside a shipped glyph range for every font stack the style names — a pan across the whole
extract on the Discover map logs no glyph `404` and no "Unable to load glyph range" fallback.

**Architecture:** A committed Node script (`scripts/riviera-map-label-codepoints.mjs`) decodes
every tile in the archive and every `text-field` the style renders, deriving the exact set of
256-wide glyph ranges `GLYPH_RANGES` must cover — not the single observed codepoint from the
bug report. Separately, `build-riviera-map.sh`'s `fetch()` now reuses a prior MANIFEST line
byte-for-byte when a re-fetch's sha256 still matches it, so widening `GLYPH_RANGES` and
re-running `--assets` only adds the new ranges' lines instead of rewriting every line's
timestamp — the mechanism issue #1107 asked for ("leave the rest untouched").

**Persistence:** N/A — no database involved; `platform/map/MANIFEST.txt` is a plain-text
build manifest, not an app table.

**Source of intent:** GitHub issue #1107 (follow-up from PR #1105 / issue #1103, epic #806).

**Skills consulted:** `riviera-sdlc` (routing + issue-intake grill — confirmed sibling #1108
already merged, so its mode-isolation code was in place; the grill did NOT catch that the
*committed* `MANIFEST.txt` still predated that format — found during execution, see Risk
register R-2) · `riviera-plan-doc` (this template) · `tdd` (red-then-green on the three new
`fetch()`-reuse unit tests in `build-riviera-map.test.sh`, verified red against the pre-fix
script) · `riviera-review-overlay` (review gate — runs at PR ready-for-review) ·
`riviera-docs-freshness` (N/A — no formal audit run; found and deleted one stale plan doc,
`docs/plans/map-manifest-completeness.md`, left behind after #1108/PR #1112 merged) ·
`riviera-local-debug` (local-machine recipes: `./gradlew` and `npm` work directly, no
cloud-session workarounds needed).

**Branch:** `bugfix/riviera-map-glyph-ranges`

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the committed `riviera.pmtiles` archive and the shipped `style.json`,
  when `scripts/riviera-map-label-codepoints.mjs` decodes every tile and every label field the
  style's `text-field` layout property names, then it reports the exact glyph-range set the
  archive needs. *Seam:* the script's own stdout, run standalone. *Pinned by:* manual run,
  compared against the pre-existing bug report's `U+2013` (verified in that set) — no
  automated test wraps this (see Open Questions).
- [x] **AC-2:** Given `GLYPH_RANGES` widened to include the computed set, when
  `scripts/build-riviera-map.sh --assets` runs, then the new ranges' `.pbf` files are fetched
  for every font stack and their MANIFEST lines added. *Seam:* `build_assets()`/`fetch()`.
  *Pinned by:* manual run — MANIFEST diff inspected line-by-line (see Execution status).
- [x] **AC-3:** Given a MANIFEST line whose freshly-fetched file still hashes to the
  previously recorded sha256, when `fetch()` runs, then the old line (timestamp included) is
  reused verbatim; given a changed or new file, a fresh line is written. *Seam:* `fetch()` /
  `reuse_manifest_line()`. *Pinned by:*
  `build-riviera-map.test.sh#test_fetch_reuses_old_line_byte_for_byte_when_content_unchanged`,
  `#test_fetch_writes_a_fresh_line_when_content_drifted`,
  `#test_fetch_writes_a_fresh_line_when_theres_no_prior_entry`.
- [x] **AC-4:** Given the regenerated MANIFEST, when diffed against the pre-change version,
  then only the new glyph-range lines appear — the style, sprite, existing-glyph and tiles
  (`planetiler.jar`, `geofabrik:…`) lines are byte-identical. *Seam:* `platform/map/MANIFEST.txt`
  as committed. *Pinned by:* manual `diff` (Execution status) — no automated test wraps a
  real regeneration (network-dependent, out of CI's reach).
- [x] **AC-5:** Given the regenerated `style.json`/sprites/glyphs, when
  `MapStyleSelfHostedTest` and `MapResourcesTest` run, then both stay green. *Seam:* those two
  test classes. *Pinned by:* `./gradlew test --tests "*MapStyleSelfHostedTest*" --tests
  "*MapResourcesTest*"`.
- [x] **AC-6:** Given the app running with the regenerated assets, when the Discover map is
  panned/zoomed through areas whose labels use the newly-added ranges, then no
  "Unable to load glyph range" console warning and no glyph `404` appear. *Seam:* the real
  MapLibre engine against the running app (manual/real-engine check, not a new Playwright
  spec — see Open Questions). *Pinned by:* manual browser session (Execution status);
  additionally every one of the 8 ranges × 3 stacks resolves `200` via direct request against
  the running backend.

## Non-goals

- Changing fonts or font stacks (issue's own Out of scope).
- Regenerating the tile archive (issue's own Out of scope) — only `--assets` runs.
- The attribution (#1106) and MANIFEST-completeness (#1108, already merged) follow-ups.
- Pinning `OSM_LIBERTY_REF`/`FONT_GLYPHS_REF` to a commit SHA — the reuse mechanism (AC-3)
  makes that unnecessary for this issue's hazard.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior (wider `GLYPH_RANGES` + a more careful `fetch()`), replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `--assets` re-fetches style/sprites from a mutable `gh-pages` ref; unrelated upstream drift could sneak into this PR's diff | low | med | `fetch()`'s reuse check compares sha256 before writing a line — a real drift still shows, an unchanged fetch does not | agent | closed — verified `style.json`/sprites are byte-identical in the diff |
| R-2 | Committed `MANIFEST.txt` predated #1108's header format; a plain `--assets` run would drop the un-sectioned `# tiles` lines (the exact truncation hazard #1107 warns about, resurfacing because #1108 never regenerated the file it changed the format for) | high (hit it) | high (silent data loss in a committed file) | Found via a first dry run + diff, reverted, manually retrofitted the two section headers onto the existing lines (no content/timestamp change), re-ran | agent | closed — `# tiles` section verified present with unchanged sha256/timestamps |
| R-3 | Some needed range unavailable upstream for one of the three Roboto stacks (CJK is unusual for a Latin-oriented glyph set) | low | med | Checked all 8 ranges × 3 stacks via `curl -o /dev/null -w %{http_code}` against `raw.githubusercontent.com/orangemug/font-glyphs` before touching the script — all `200` | agent | closed |

## Open questions / Assumptions

- **Assumption:** the 5 pre-existing ranges stay in `GLYPH_RANGES` even though the archive
  scan shows `512-767` (Latin Extended-B/IPA) currently unused — removing a shipped range is
  a separate, riskier decision (could regress if OSM data changes) and the issue's AC only
  requires the needed set to be *covered*, not minimal. — *Owner:* agent · *Resolves by:*
  accepted, not blocking.
- **Assumption:** AC-6's real-engine check is manual, not a new Playwright spec — the mocked
  e2e suite (`frontend/e2e/discover-map.e2e.ts`) already exercises the real MapLibre engine
  against the committed style/sprites/glyphs with a synthetic tile fixture and a same-origin
  network guard; adding label-specific assertions there is a larger scope than this bug fix
  (the issue's AC explicitly allows "an automated real-engine check or a documented manual
  one"). — *Owner:* agent · *Resolves by:* accepted, not blocking.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; this is a static map-asset build script.

## Spring Modulith — modules, interfaces, events

N/A — no backend module code changes; `MapStyleSelfHostedTest`/`MapResourcesTest` are
existing tests re-run against regenerated static resources, not new module code.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — no Angular component/service changes. `frontend/package.json` gains two devDependencies
(`pbf`, `@mapbox/vector-tile`) already present transitively via `maplibre-gl`, made explicit
so the new audit script doesn't rely on an undeclared transitive path.

## FE↔BE contract

N/A — no API shape change.

## Execution status

**Stage pointer:** implement — done; ready for CI/PR.

**Next action:** open the PR (draft as soon as pushed, per `riviera-sdlc`), let CI run, then
the review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Audit script + GLYPH_RANGES + fetch() reuse mechanism (TDD) | ✅ | (pending commit) |
| 1 — Regenerate assets, verify, docs | ✅ | (pending commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar | `build-riviera-map.test.sh:129` shellcheck:S7679 — assign the positional parameter to a local variable | fixed-in-`(pending commit)` |
| F-2 | sonar | `riviera-map-label-codepoints.mjs` javascript:S6582 — prefer optional chaining over `&&` | fixed-in-`(pending commit)` |
| F-3 | sonar | `riviera-map-label-codepoints.mjs` javascript:S8786 — `{([^}]+)}` regex flagged for super-linear backtracking | fixed-in-`(pending commit)` — replaced with a non-regex `templateFields()` scanner |
| F-4 | sonar | `riviera-map-label-codepoints.mjs` javascript:S3776 — `main()` cognitive complexity 44 > 15 | fixed-in-`(pending commit)` — decomposed into `scanArchive`/`collectTileCodepoints`/`collectFeatureCodepoints` |
| F-5 | sonar | `riviera-map-label-codepoints.mjs` javascript:S7785 — prefer top-level await over an async `main()` call | fixed-in-`(pending commit)` — top-level `if (isMain) { … }` guard, no wrapper function |
| F-6 | sonar | new-code coverage 0.0% (the script had no test file) | fixed-in-`(pending commit)` — `riviera-map-label-codepoints.test.mjs`, 9 tests, 84% line coverage on the script |

---

## File structure

- `scripts/riviera-map-label-codepoints.mjs` — new committed audit script; decodes the
  archive and reports the needed glyph-range set.
- `scripts/riviera-map-label-codepoints.test.mjs` — new unit tests for its pure functions
  (added in the Sonar-gate fix round, see Findings register).
- `scripts/build-riviera-map.sh` — `GLYPH_RANGES` widened; `fetch()`/`build_assets()` gain the
  reuse-unchanged-line mechanism (`reuse_manifest_line()`, new).
- `scripts/build-riviera-map.test.sh` — three new unit tests for the reuse mechanism.
- `frontend/package.json`, `frontend/package-lock.json` — `pbf`, `@mapbox/vector-tile` made
  explicit devDependencies (already present transitively).
- `platform/map/MANIFEST.txt` — retrofitted with the `# assets`/`# tiles` headers (R-2), plus
  9 new glyph-range lines.
- `platform/map/glyphs/**/*.pbf` — 9 new committed glyph files (the 3 new ranges × 3 font
  stacks).
- `docs/runbooks/riviera-map-tiles.md` — new § *Glyph ranges* documenting the recompute
  procedure; glyph-row description generalized off the specific 0–1279 list.
- `docs/plans/map-manifest-completeness.md` — deleted (stale plan doc left behind after
  #1108/PR #1112 already merged; `riviera-docs-freshness` § *Plan-doc retirement*).
- `docs/plans/riviera-map-glyph-ranges.md` — this plan doc.

---

## Phase 0 — Audit script + GLYPH_RANGES + fetch() reuse mechanism

**Files:** Create `scripts/riviera-map-label-codepoints.mjs` · Modify
`scripts/build-riviera-map.sh`, `scripts/build-riviera-map.test.sh`, `frontend/package.json`,
`frontend/package-lock.json`

- [x] **Step 1: Write the failing tests** — three `fetch()`-reuse tests in
  `build-riviera-map.test.sh` (byte-identical reuse on sha256 match, fresh line on drift,
  fresh line on no prior entry).
- [x] **Step 2: Run it, verify it fails** — `bash scripts/build-riviera-map.test.sh` with the
  pre-fix `fetch()` (stashed) → `test_fetch_reuses_old_line_byte_for_byte_when_content_unchanged`
  FAILs (fresh timestamp instead of the reused one); confirmed via `git stash`.
- [x] **Step 3: Minimal implementation** — `reuse_manifest_line()` + `fetch()`'s new
  `<old-section>` param; `build_assets()` passes `manifest_section "$MANIFEST_ASSETS_HEADER"`
  through; `GLYPH_RANGES` widened to `(0-255 256-511 512-767 768-1023 1024-1279 8192-8447
  21248-21503 33536-33791)`; new audit script.
- [x] **Step 4: Run it, verify it passes** — `bash scripts/build-riviera-map.test.sh` → `13
  passed, 0 failed`.
- [x] **Step 5: Generalization-audit pass** — population: every script that computes a
  MANIFEST line (`fetch()`'s only caller pattern in `build-riviera-map.sh`) → enumerated via
  `grep -n 'manifest_line\|fetch "' scripts/build-riviera-map.sh` → candidates: the 6
  `fetch()` calls in `build_assets()` (style, 4 sprites, glyphs loop) and the 4
  `manifest_line`/`record_planetiler_*` calls in `build_tiles()` → decision: only
  `build_assets()`'s calls route through the new reuse mechanism (all converted, via the
  shared `fetch()` helper); `build_tiles()`'s Planetiler-managed lines are untouched by this
  issue — its own sources already have cache-hit/sidecar handling from #1108 and don't share
  `fetch()`'s curl-download shape, so extending the same mechanism there is a separate,
  unscoped change.
- [x] **Step 6: Commit** — pending.
- [x] **Step 7: Update plan-doc execution status** — this document.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | Phase 0 | Every MANIFEST-line-writing call site in `build-riviera-map.sh` | `grep -n 'manifest_line\|fetch "' scripts/build-riviera-map.sh` | 6 `fetch()` calls (assets), 4 `manifest_line`/`record_planetiler_*` calls (tiles) | Converted all 6 `fetch()` call sites (the only ones this issue's hazard applies to); left `build_tiles()`'s Planetiler-sourced lines alone — different mechanism, already has its own drift handling |

---

## Phase 1 — Regenerate assets, verify, docs

**Files:** Modify `platform/map/MANIFEST.txt` · Create 9 `platform/map/glyphs/**/*.pbf` files
· Modify `docs/runbooks/riviera-map-tiles.md` · Delete `docs/plans/map-manifest-completeness.md`

- [x] **Step 1:** Ran `scripts/riviera-map-label-codepoints.mjs` against the committed
  archive → `0-255 256-511 768-1023 1024-1279 8192-8447 21248-21503 33536-33791` (231 distinct
  codepoints across 356,277 labeled features in 19,090 tiles).
- [x] **Step 2:** First `--assets` dry run against the as-committed `MANIFEST.txt` (no section
  headers) → confirmed R-2 (the `# tiles` lines vanished) → reverted with `git checkout`.
- [x] **Step 3:** Manually retrofitted the `# assets`/`# tiles` headers onto the existing 22
  lines (no content change) → re-ran `--assets` → diff showed **only** the 9 new lines added;
  `style.json`/sprites byte-identical; `# tiles` section (planetiler.jar, geofabrik) intact.
- [x] **Step 4:** `cd platform && ./gradlew --console=plain test --tests
  "*MapStyleSelfHostedTest*" --tests "*MapResourcesTest*"` → `BUILD SUCCESSFUL`.
- [x] **Step 5:** Manual real-engine check — built the SPA (`npm run build`), served it
  same-origin from `bootRun` (matching prod topology), loaded `/`, confirmed all 24
  `glyphs/**/*.pbf` (incl. the 3 new ranges × 3 stacks) resolve `200` directly and via the
  live map; panned/zoomed the Discover map repeatedly — new tile/glyph fetches observed
  (`768-1023` loaded beyond the default `0-255`), zero "Unable to load glyph range" console
  warnings and zero glyph `404`s across the session. Reverted the local-only build artifacts
  (`platform/src/main/resources/static`) afterward — not part of this change.
- [x] **Step 6:** Documented the recompute procedure in
  `docs/runbooks/riviera-map-tiles.md` § *Glyph ranges*; generalized the glyph-row table
  description off the old hardcoded `0-255…1024-1279` list.
- [x] **Step 7: Commit** — pending.
- [x] **Step 8: Update plan-doc execution status** — this document.

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `node scripts/riviera-map-label-codepoints.mjs` → `0-255 256-511 768-1023
  1024-1279 8192-8447 21248-21503 33536-33791` (verified against the earlier scratch scan and
  against the bug report's `U+2013`, which falls in `8192-8447`).
- [x] **AC-2:** `scripts/build-riviera-map.sh --assets` → `24 glyph ranges` fetched (8 × 3
  stacks); 9 new `.pbf` files present on disk.
- [x] **AC-3:** `bash scripts/build-riviera-map.test.sh` → `13 passed, 0 failed`.
- [x] **AC-4:** `diff` of `MANIFEST.txt` before/after → only 9 added lines.
- [x] **AC-5:** `./gradlew test --tests "*MapStyleSelfHostedTest*" --tests
  "*MapResourcesTest*"` → `BUILD SUCCESSFUL`.
- [x] **AC-6:** manual browser session — no glyph 404/warning; all ranges resolve `200`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (or documented manual check
  where the issue's own AC allows one).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] No JPA introduced (N/A — no backend code touched).
- [x] Availability section filled (N/A, justified).
- [x] Pool + cutoff rules honored (N/A, justified).
- [x] Modulith section filled (N/A, justified).
- [x] Payment/payout section filled (N/A, justified).
- [x] Refund policy N/A.
- [x] Timezone N/A.
- [x] Booking codes N/A.
- [x] Flyway N/A — no migration.
- [x] Frontend N/A — no Angular component change; the two new devDependencies documented.
- [ ] Execution status at HEAD matches reality — will be finalized in the PR's last
  code-touching commit, once CI/review/Sonar have run.
- [x] Risk register has no stale `open` rows; Open Questions have no unresolved blocking
  entries.
- [ ] Close-out written in THIS PR's last code-touching commit — pending PR creation.
- [ ] The review gate ran in full — pending.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
