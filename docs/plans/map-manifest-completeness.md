# Riviera map MANIFEST completeness Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** After any run mode of `scripts/build-riviera-map.sh`, `platform/map/MANIFEST.txt`
has exactly one line per upstream input (style, sprites, each glyph range, `planetiler.jar`,
the dated OSM extract, water polygons, Natural Earth, lake centrelines) — recorded whether
freshly downloaded or reused from `RIVIERA_MAP_WORK`'s cache — and re-running one mode never
duplicates or erases the other mode's lines.

**Architecture:** The single most significant decision: split `MANIFEST.txt` into two
named sections (`# assets` / `# tiles`), each wholesale-replaced by the mode that owns it and
left untouched by the other — instead of today's truncate-then-append that lets `--assets`
erase `--tiles`'s lines and lets a second `--tiles` run duplicate them. For the three
Planetiler-managed sources Planetiler itself fetches (water polygons, Natural Earth, lake
centrelines) and the OSM extract, Planetiler logs nothing at all on a cache hit (verified
empirically below), so the script parses Planetiler's own `Downloading <url> (redirected to
<url>)? to <path>` log line when a fresh download happens and persists the resolved URL (or,
for the OSM extract, just the dated basename) to a small sidecar file beside the cached
source; a later cache-hit run reads the sidecar instead of re-deriving it. A cache hit with
no sidecar yet (pre-existing warm cache from before this fix) degrades to the old
undated/static-URL behavior for that one source until the cache is next refreshed —
documented, not hidden.

**Persistence:** N/A — no database involved; this is a build script and its committed static
output (`platform/map/`), not a Postgres table.

**Source of intent:** GitHub issue #1108 (follow-up from PR #1105 / issue #1103, under the
riviera-map epic #806).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed no
sibling PR/Flyway collision; this touches no DB/backend/frontend module) · `riviera-plan-doc`
(this template — forced the explicit N/A-with-reason on every module/DB/payment/frontend
section since none apply) · `tdd` (red-green on a new isolated bash test harness for the
manifest-section logic; the Planetiler-integration behavior itself was verified by two real
end-to-end runs against a warm cache, since it needs live network + a JVM and has no existing
test harness) · `riviera-review-overlay` (review gate — to run before merge)
· `riviera-docs-freshness` (N/A — reason: no substrate doc (`CLAUDE.md`,
`RESPONSIBILITIES.md`, `CONTEXT.md`, an ADR) states anything about the MANIFEST's contents;
only the runbook does, and that's this slice's own edit).

**Branch:** `bugfix/map-manifest-completeness`

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a fresh `RIVIERA_MAP_WORK`, when `--tiles` runs, then `MANIFEST.txt`'s
  `# tiles` section has one line each for `planetiler.jar`, the OSM extract (under
  `geofabrik:<dated-basename>`, e.g. `geofabrik:albania-260914.osm.pbf`), water polygons,
  Natural Earth, and lake centrelines — each with a real sha256 and origin URL. *Seam:* the
  script's `build_tiles` function / `MANIFEST.txt` file contract. *Pinned by:* manual
  end-to-end run against live upstreams (`scripts/build-riviera-map.test.sh` cannot exercise
  this without a live ~1.5 GB download + JVM) — verified 2026-09-15, see Execution status.
- [x] **AC-2:** Given the same `RIVIERA_MAP_WORK` now warm, when `--tiles` runs again, then
  every one of those five lines is still present (sha256 unchanged, timestamp refreshed,
  extract still under its dated name via the sidecar) and the section has no duplicates.
  *Seam:* same as AC-1. *Pinned by:* manual end-to-end run (second pass against warm cache),
  verified 2026-09-15.
- [x] **AC-3:** Given an existing `MANIFEST.txt` with a `# tiles` section, when `--assets`
  runs, then the `# assets` section is replaced and the `# tiles` section is byte-identical
  to before — and the reverse (existing `# assets`, then `--tiles` runs) leaves `# assets`
  untouched. *Seam:* `write_manifest_section` / `manifest_section` functions. *Pinned by:*
  `scripts/build-riviera-map.test.sh` (`test_write_manifest_section_leaves_other_section_untouched`,
  `test_write_manifest_section_reverse_order`,
  `test_write_manifest_section_replaces_own_section_without_duplicating`) — 7/7 green — plus a
  real `--assets` re-run confirming the live `# tiles` section byte-for-byte unchanged.
- [x] **AC-4:** Given `RIVIERA_OSM_PBF` set to a local file, when `--tiles` runs, then the
  extract's manifest line is `supplied:<basename>` (unchanged behavior) and no Geofabrik host
  is contacted. *Seam:* `build_tiles`'s `osm_source` branch. *Pinned by:* manual review — this
  path is unchanged from the pre-existing (already-correct) behavior; no new test needed.
- [x] **AC-5:** The runbook's MANIFEST paragraph names all eight recorded inputs and the
  section-replace (not truncate/append) behavior. *Seam:* `docs/runbooks/riviera-map-tiles.md`.
  *Pinned by:* doc review at the review gate.

## Non-goals

- Changing any pin (refs, Planetiler version, bounding box, zoom, glyph ranges).
- Automating regeneration in CI or at deploy time (ADR-0022 keeps it manual).
- Adding glyph ranges (issue #1107, sibling follow-up).
- A general-purpose bash test framework for the whole `scripts/` tree — this slice adds one
  small, self-contained test file for the new pure-function manifest logic only.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior (manifest completeness + mode isolation), replaces no existing surface;
the pre-existing correct behaviors (style/sprite/glyph recording, `RIVIERA_OSM_PBF`
`supplied:` marking) are preserved unchanged, not retired.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Planetiler logs nothing on a cache hit for any of the four sources it manages, so a naive re-parse-the-log approach would silently stop recording a reused source | high (confirmed empirically) | med (AC-2 would fail) | persist the resolved URL/dated-name to a sidecar file next to the cached source on the run that discovers it; read the sidecar back on a cache hit | agent | resolved — verified by a real two-pass run against a warm cache |
| R-2 | Lake centrelines' redirect target is a signed, expiring `release-assets.githubusercontent.com` URL — recording it would be both useless to a future reader and different on every run even for the same underlying file | high | low (manifest noise, not a correctness bug) | always record the pre-redirect stable GitHub release URL for this source, never the redirect target | agent | resolved |
| R-3 | The three static fallback URLs (`WATER_POLYGONS_URL`, `NATURAL_EARTH_URL`, `LAKE_CENTERLINES_URL`) are copied from Planetiler 0.10.2's own compiled-in defaults; a future `PLANETILER_VERSION` bump could change them silently | low | low (manifest would then show a stale URL on a cache-hit run only, until the next fresh download corrects it via the log-scrape path) | comment at the constants pointing at this risk; a version bump is already a deliberate pin change reviewed by hand | agent | open — accepted, documented in-script |
| R-4 | No existing test harness for `scripts/*.sh` (only the `scripts/*.mjs` Node checks have `node --test` coverage) | med | low | add one small, self-contained bash test file exercising only the pure manifest-section functions (no network/JVM needed) | agent | resolved |

## Open questions / Assumptions

*(none open — the design was settled by running the real script against live upstreams
before writing this plan; see Architecture and the risk register. One unrelated bug was
discovered along the way — Git Bash on Windows mangles the `/map/…` glyph/sprite paths
`--assets` writes into `style.json`, caught immediately by `MapStyleSelfHostedTest` — and is
tracked as issue #1111, out of this slice's scope.)*

## Availability & concurrency (invariant #2)

N/A — does not affect availability; this is a build-time script with no runtime component
and touches no `booking`/`availability` table.

## Spring Modulith — modules, interfaces, events

N/A — backend-only sections don't apply; this slice touches no `platform/` Java module (it
touches `scripts/` and `docs/`, and regenerates no committed map bytes — the archive itself is
unchanged when inputs are unchanged, per issue AC-5, which this plan verified directly).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend/tooling-only; no `frontend/` file changes.

## FE↔BE contract

N/A — no API shape changes.

## Execution status

**Stage pointer:** sonar gate — fixes pushed, awaiting the re-run to confirm the list is
clear before merge.

**Next action:** once the Sonar re-analysis on the latest push confirms the `S7679` findings
are gone and nothing new appeared, this doc's close-out (below) is already final — ask the
user to authorize the merge (per this session's own risk-confirmation rule for a
shared-state action), then run the merge close-out checklist (`riviera-sdlc`
`references/pr-gates.md` §3): verify #1108 closes via the PR, `git rm` this plan doc in the
close-out commit... except this repo's convention removes it at the *next* close-out after
merge, not in this PR — so nothing further to do here once merged.

Verification narrative (2026-09-15, this machine has full outbound access including
Geofabrik — unlike the cloud-session proxy the runbook's Egress table describes):
1. Ran `--tiles` cold against a scratch `RIVIERA_MAP_WORK` — confirmed Planetiler's own log
   format (`Downloading <url> (redirected to <url2>)? to <path>`) and that a cache hit on a
   second run logs **nothing** for any of the four sources, which is what makes the
   sidecar-file design (not log-scraping alone) necessary for AC-2.
2. Reproduced the pre-fix bug live on the real `platform/map/MANIFEST.txt`: an `--assets`
   run from 2026-09-14 followed by two `--tiles` runs had silently duplicated the
   `planetiler.jar` and `geofabrik:albania.osm.pbf` lines — exactly the "run modes clash" bug
   in the issue. Reverted before making any code change (not this slice's commit).
3. Implemented the fix; `scripts/build-riviera-map.test.sh` red → green (7/7) for the
   section-replace mechanism (AC-3).
4. Real end-to-end run: `--assets`, then `--tiles` with sources force-evicted from the warm
   cache (fresh download) → `# tiles` section got all five lines, extract under
   `geofabrik:albania-260914.osm.pbf` (AC-1). Archive sha256 matched `origin/main`'s
   `riviera.pmtiles` byte-for-byte.
5. Re-ran `--tiles` on the now-fully-warm cache → identical sha256/URLs incl. the dated
   extract name (via sidecar), only timestamps refreshed, no duplicates (AC-2).
6. Re-ran `--assets` again → `# tiles` section byte-for-byte unchanged (AC-3, real run in
   addition to the unit tests).
7. Reverted all local `platform/map/` changes (not part of this PR — see Non-goals; also
   avoids committing the Windows/Git-Bash path-mangled `style.json` from issue #1111).
8. `./gradlew test --tests "*MapStyleSelfHostedTest*" --tests "*MapResourcesTest*"` green
   against the untouched, committed `platform/map/` (baseline unaffected by this slice).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Manifest section-replace + Planetiler source recording | ✅ | (this PR) |
| 1 — Runbook update | ✅ | (this PR) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (code-review, 5-agent fan-out) | Comment on `WATER_POLYGONS_URL` et al. overstated how quickly a stale fallback self-corrects (only on the *next fresh download*, not "that one" cache-hit run) | fixed-in-`d0f4b798` |
| F-2 | review (RV-STYLE-1) | Four new inline comments cited `(#1108)` — provenance belongs in the commit/PR, not inline prose | fixed-in-`d0f4b798` |
| F-3 | sonar (`shelldre:S7679`, MAJOR ×4) | Positional parameters (`$1`/`$2`/`$3`) used directly instead of assigned to a named local, in `manifest_line`, `assert_eq`, `with_temp_manifest` | fixed — also generalized to `origin_sidecar`, `planetiler_stable_url`, `osm_dated_basename`, which weren't flagged but had the same shape |

---

## File structure

- `scripts/build-riviera-map.sh` — the manifest section-replace mechanism, cache-aware
  Planetiler source recording, sidecar files under `RIVIERA_MAP_WORK`
- `scripts/build-riviera-map.test.sh` — new; unit tests for the pure manifest-section
  functions (`manifest_section`, `write_manifest_section`)
- `docs/runbooks/riviera-map-tiles.md` — MANIFEST paragraph updated to match new behavior
- `docs/plans/map-manifest-completeness.md` — this plan doc

---

## Phase 0 — Manifest section-replace + Planetiler source recording

**Files:** Modify `scripts/build-riviera-map.sh` · Create `scripts/build-riviera-map.test.sh`

- [ ] **Step 1: Write the failing test** for the section-replace mechanism (no network/JVM
  needed — this is the part with a clean unit seam)
- [ ] **Step 2: Run it, verify it fails**
- [ ] **Step 3: Implement `manifest_section` / `write_manifest_section` / `manifest_line` /
  the cache-aware Planetiler source recording** in `scripts/build-riviera-map.sh`
- [ ] **Step 4: Run the unit test, verify it passes**
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Real end-to-end verification** against the warm scratch `RIVIERA_MAP_WORK`
  cache from this session's earlier exploratory run: `--assets` then `--tiles`, then
  `--tiles` again on the warm cache, then `--tiles` then `--assets` in the other order —
  confirming AC-1 through AC-3 and that `riviera.pmtiles` rebuilds byte-identically
- [ ] **Step 7: Commit**
- [ ] **Step 8: Update plan-doc execution status**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-15 | Phase 0 | Every place `MANIFEST.txt` is written or documented (mechanism: `grep` for the literal filename across the repo) | `grep -rn "MANIFEST" --include=*.sh --include=*.md .` | `scripts/build-riviera-map.sh`, `docs/runbooks/riviera-map-tiles.md` | both updated in this slice; no other writer/reader exists |
| 2026-09-15 | Sonar finding F-3 | Every function in the two touched scripts using a positional parameter (`$1`/`$2`/…) directly rather than a named local | `grep -n '\$1\|\$2\|\$3' scripts/build-riviera-map.sh scripts/build-riviera-map.test.sh` | 2 more (`origin_sidecar`, `planetiler_stable_url`/`osm_dated_basename`) beyond Sonar's 4 reported lines; `main()`'s single-use `case "$1" in` left alone (idiomatic, not the rule's target, not flagged) | fixed the 2 unflagged ones for consistency |

---

## Phase 1 — Runbook update

**Files:** Modify `docs/runbooks/riviera-map-tiles.md`

- [ ] **Step 1:** Update the MANIFEST paragraph to name all eight recorded inputs and the
  section-replace behavior (AC-5)
- [ ] **Step 2:** Commit
- [ ] **Step 3:** Update plan-doc execution status

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2 / AC-3:** verified by a real run sequence against `RIVIERA_MAP_WORK` on
  2026-09-15 — see Execution status narrative above. `scripts/build-riviera-map.test.sh`: 7/7
  passed.
- [x] **AC-4:** unchanged code path, reviewed by hand.
- [x] **AC-5:** runbook diff written; final review at the review gate.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** — N/A, no backend code in scope.
- [x] **Availability** — N/A, justified above.
- [x] Pool + cutoff rules — N/A.
- [x] **Modulith** — N/A, justified above.
- [x] **Payment/payout** — N/A, justified above.
- [x] Refund policy — N/A.
- [x] Timezone correct — N/A (the script already uses `date -u`; unchanged).
- [x] Booking codes — N/A.
- [x] Flyway — N/A.
- [x] **Frontend** — N/A.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows without an explicit accepted-risk note (R-3 is
  explicitly accepted, not stale); Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — pending: this plan
  doc is deleted at the next close-out after merge per `riviera-docs-freshness`; the final
  `merged via PR #NN` line goes in that last commit, not this one.
- [ ] **The review gate ran in full** — pending: due once the PR is marked ready for review.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
