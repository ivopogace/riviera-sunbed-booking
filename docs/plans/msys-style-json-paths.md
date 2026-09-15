# MSYS2 path-mangling in build-riviera-map.sh --assets Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams.

**Goal:** `scripts/build-riviera-map.sh --assets`, run from Git Bash (MSYS2) on Windows,
writes `style.json`'s `sprite`/`glyphs` fields as the literal `/map/…` strings the script
assigns — not a Windows-path-mangled variant — regardless of shell.

**Architecture:** Stop passing the `/map/…` constants to `node.exe` as environment-variable
values (MSYS2 auto-converts an env var value that looks like a POSIX absolute path before a
native, non-MSYS exe like `node.exe` ever sees it). Instead write them to a small temp JSON
file and have the Node script read the values out of the file's *content* — data, never a
path — so no argv/env path-conversion heuristic ever touches them. The temp file's own path
is still passed as an argument, which conversion is correct and necessary for `node` to open
it on Windows.

**Persistence:** N/A — no database, no Flyway migration; this is a build-tooling script.

**Source of intent:** GitHub issue #1111 (filed as an out-of-scope side effect of #1108).

**Skills consulted:** `riviera-sdlc` (routing + issue-intake grill gate — issue is small,
scoped, still accurate; no drift, no fog) · `riviera-plan-doc` (this template — right-sized
for a small tooling fix per Rule 4) · `tdd` (red-green on an extracted `rewrite_style()`
seam, reproducing the real MSYS mangling on this machine) · `riviera-review-overlay` (review
gate — ran full 5-agent `/code-review` fan-out, 1 finding ≥80 confidence, fixed in `12d1b2b5`)
· `riviera-docs-freshness` (N/A — no substrate doc states the old env-var mechanism; the
runbook only documents the CLI surface, unaffected).

**Branch:** `bugfix/msys-style-json-paths` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the style-rewrite step runs under Git Bash (MSYS2) on this Windows
  machine, when `build_assets` (or its extracted `rewrite_style` function) runs, then the
  output `style.json`'s `sprite` and `glyphs` fields equal the literal input strings
  (`/map/sprites/osm-liberty`, `/map/glyphs/{fontstack}/{range}.pbf`) byte-for-byte, with no
  `D:/Git/...`-style Windows-path mangling. *Seam:* the extracted `rewrite_style(input,
  output, source, sprite, glyphs)` bash function, invoked directly (no network, no
  Planetiler). *Pinned by:* `build-riviera-map.test.sh test_rewrite_style_preserves_map_paths`.
- [ ] **AC-2:** Given a real `--assets` run on this machine (Git Bash), when it completes,
  then `MapStyleSelfHostedTest.everyStyleUrlStaysOnOurOrigin` passes against the freshly
  generated `style.json`. *Seam:* the `--assets` CLI entry point end-to-end. *Pinned by:*
  manual verification run + `MapStyleSelfHostedTest.everyStyleUrlStaysOnOurOrigin`.

## Non-goals

- Any change to the MANIFEST format (that's #1108, already shipped).
- Widening the bounding box, glyph ranges, or upstream pins.
- A general-purpose MSYS/argv-conversion helper for the rest of the script — only the one
  call site that demonstrably breaks (`build_assets`'s `node` invocation) is in scope; the
  generalization-audit pass below decides whether any other call site shares the mechanism.

## Behavior-parity ledger

N/A — bugfix restoring intended behavior (the style rewrite already exists; this fixes how
its inputs reach `node`, not what it produces on a non-MSYS shell, where it already worked).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The temp-JSON-file approach still has some other MSYS conversion edge case (e.g. a value containing a literal `\` on Windows) | low | low | Values here are fixed constants (`/map/...`), not user input, with no quote/backslash/newline in them, so plain `printf` interpolation into JSON is safe | Ivo | resolved — bash `printf` builds the params file directly, so no node/env-var hop is involved at all |
| R-2 | Fix works on this machine but the generalization sweep misses a sibling call site with the same env-var-to-node pattern | low | med | Grep the whole script for `node -` invocations and env-var assignments preceding them | Ivo | resolved — single call site found (§ Generalization-audit log) |

## Open questions / Assumptions

*(none — closed before phase 0)*

### Resolved

- **Assumption:** the MSYS conversion only mangles values that look like a standalone
  absolute POSIX path (leading `/`, not `//`), so `STYLE_SOURCE="pmtiles:///map/..."` was
  unaffected (confirmed by the issue's own report, which only flags `sprite`/`glyphs`) —
  verified empirically by the original bug report and by this fix's manual verification run.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; this is a build-tooling script with no booking/DB
interaction.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope.

## Payment & payout

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend/tooling-only; no frontend surface touched.

## FE↔BE contract

N/A — no API shape changes.

## Execution status

**Stage pointer:** ready to merge — CI green (8/8), review gate run (1 finding fixed in
`12d1b2b5`), Sonar gate clean (0 new issues, 0% duplication).

**Next action:** merge PR #1113, then close-out: confirm #1111 auto-closes, check the
tracking source (#1111 was filed standalone, not under a tracking epic).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Extract `rewrite_style` + fix via temp-JSON-file param passing | ✅ | `a6f76b8e` |
| Review-fix — drop RV-STYLE-1 provenance/multi-line comments | ✅ | `12d1b2b5`, `41d28693` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review | RV-STYLE-1: two new multi-line inline comments cited `(#1111)` — provenance belongs in the commit, not the code | fixed-in-`12d1b2b5` |

---

## File structure

- `scripts/build-riviera-map.sh` — extract `rewrite_style()`, fix its `node` invocation to
  pass params via a temp JSON file instead of env vars.
- `scripts/build-riviera-map.test.sh` — new test(s) pinning AC-1.
- `docs/plans/msys-style-json-paths.md` — this plan doc.

---

## Phase 0 — Extract `rewrite_style` + fix via temp-JSON-file param passing

**Files:** Modify `scripts/build-riviera-map.sh:99-136` · Test
`scripts/build-riviera-map.test.sh`

- [ ] **Step 1: Write the failing test**

A new test function calling the not-yet-extracted `rewrite_style` (fails to source/run since
the function doesn't exist yet).

- [ ] **Step 2: Run it, verify it fails** —
  `bash scripts/build-riviera-map.test.sh` → FAIL (`rewrite_style: command not found`)

- [ ] **Step 3: Minimal implementation** — extract `rewrite_style()`, pass values via a temp
  JSON params file instead of env vars.

- [ ] **Step 4: Run it, verify it passes** —
  `bash scripts/build-riviera-map.test.sh` → PASS (all assertions, run on this Git-Bash
  machine, so a real MSYS mangling regression would show up as a real failure here)

- [ ] **Step 5: Generalization-audit pass**

Population: every `node -`/`node -e` invocation in the script that passes data via env vars
preceding the call. Enumerate: `grep -n "node -" scripts/build-riviera-map.sh` plus a scan
for `=\"\$` env-assignment prefixes on the preceding line. Candidates: only the one call site
in `build_assets` (Planetiler itself is invoked as `java -jar`, not `node`, and takes no
env-var-passed `/map/...`-shaped values). Decision: fix the one site; no other site shares
the mechanism.

- [ ] **Step 6: Commit** — `git commit -m "Fix MSYS2 path-mangling of style.json sprite/glyphs URLs (#1111)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-15 | Phase 0 | Every `node` invocation in the script fed a value via env-var assignment prefix | `grep -n "node -\\|^[A-Z_]*=.*node" scripts/build-riviera-map.sh` | 1 (`build_assets`'s style rewrite) | Fixed the one site; Planetiler's `java -jar` invocation takes no such env vars |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Ran `bash scripts/build-riviera-map.test.sh` → `10 passed, 0 failed`
  (includes `test_rewrite_style_preserves_map_paths`). Verified at commit `a6f76b8e`, on this
  machine's Git Bash / MSYS2; still passing at `41d28693`.
- [x] **AC-2:** Ran `scripts/build-riviera-map.sh --assets` on this machine's Git Bash, then
  inspected `platform/map/style.json` — `sprite`/`glyphs`/source `url` all literal `/map/...`
  / `pmtiles:///map/...`, no Windows-path mangling — then
  `./gradlew test --tests "*MapStyleSelfHostedTest*"` from `platform/` → BUILD SUCCESSFUL.
  Verified at commit `a6f76b8e`. Regenerated `platform/map/*` reverted afterward (not
  committed — same policy as #1108: no regenerated map assets shipped in a script-only
  bugfix PR).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] No JPA — N/A, no backend code.
- [x] Availability — N/A, justified above.
- [x] Pool + cutoff rules — N/A.
- [x] Modulith — N/A, justified above.
- [x] Payment/payout — N/A, justified above.
- [x] Refund policy — N/A.
- [x] Timezone — N/A.
- [x] Booking codes — N/A.
- [x] Flyway — N/A.
- [x] Frontend standards — N/A.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] Close-out written in THIS PR. Process note: it landed across two small commits
  (`12d1b2b5` the review-fix, `41d28693` recording that fix's own sha in this doc) rather than
  a single last code-touching commit — both pushed together in one push, so only one extra CI
  cycle was spent, but the ideal per `pr-gates.md` §3 step 4 is still one commit.
- [x] The review gate ran in full — `/code-review` 5-agent fan-out + `riviera-review-overlay`,
  1 finding ≥80 confidence (RV-STYLE-1), fixed in `12d1b2b5`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
