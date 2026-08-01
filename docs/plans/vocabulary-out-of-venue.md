# Move the published API-view vocabulary out of `venue/` Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the frontend's cross-feature imports from 33 to exactly 5 by moving
`venue/venue.model.ts`, `venue/booking-date.ts` and `venue/photo-url.ts` to non-feature
addresses — a pure move, byte-identical logic, no behavior change (issue #489).

**Architecture:** The one significant decision (AC-6, owned by this slice): **both the
#95-shape and the #371-shape land at `shared/`, because on the frontend the distinction
collapses at the address level — the split by kind is expressed in file grain and
documented ownership, not in folder taxonomy.** Rationale in *The design decision* below.

**Persistence:** N/A — frontend-only; no tables, no migrations, no Flyway number claimed.

**Source of intent:** GitHub issue #489 (follow-up to #488's debt record and O2/#171's R-6).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — verified the
issue's counts against HEAD: exactly 33 non-spec cross-feature imports across 21 files;
only dependabot PRs in flight, no file overlap, no Flyway concern) · `riviera-plan-doc`
(this template — forced the parity ledger to say *how* "pure move" is verified, and the
risk row for the new `shared/` → `environments/` edge) · `tdd` (pure refactor: no new
behavior, so no new failing-test cycle — verification is the existing suites plus the
RV-FE-8 mechanical grep as the structural pin) · `riviera-review-overlay` (review gate —
due at ready-for-review; RV-FE-8 is the item this slice exists to serve) ·
`riviera-docs-freshness` (due at merge close-out — this slice edits two skills' debt
records itself, AC-8) · `riviera-frontend` (the placement decision itself: taxonomy,
the amenities/booking-status precedent, the debt table this PR rewrites) ·
`riviera-local-debug` (frontend npm recipes; e2e:a11y is the CI-safe suite) ·
`angular-developer` + angular-cli MCP (`get_best_practices` — confirmed import-path-only
edits implicate no v22 API surface) · `playwright-cli` (N/A — no e2e spec authored or
moved; the existing mocked suite runs unchanged as the parity proof).

**Branch:** `claude/sdlc-489-cgiixi` — the session's designated remote branch stands in
for `feature/vocabulary-out-of-venue` per the riviera-sdlc cloud addendum.

---

## The design decision (AC-6): where the vocabulary lands, and why

The issue offers two backend-precedent shapes and forbids assuming a wholesale move:

- **#95 shape** — owner keeps its types, publishes them as a named `::vocabulary`
  surface consumed under an explicit `allowedDependencies` grant.
- **#371 shape** — promote genuinely cross-cutting technical pieces into the kernel.

**The ACs themselves eliminate the literal #95 form.** `shared/money.ts` and
`shared/availability-grid.ts` consume `MoneyView`/`SetView` (AC-1), `booking/` and
`venue-admin/` must end at zero cross-feature imports (AC-2), `pages/home` may keep only
`venue.service` (AC-3). `shared/` may never import a feature — that is the load-bearing
edge — so every consumed type must live at an address importable by `shared/`, `pages/`,
and every feature alike. Keeping the types at a `venue/` address (even under a
`venue/vocabulary/` subfolder) fails AC-1/2/3/5 by construction.

**And the frontend has no grant mechanism.** The backend's #95 works because
`allowedDependencies` makes "published surface of module X" compiler-enforced. The
frontend has no ESLint boundary rule (deliberately out of scope here, per the issue);
the only address semantics available are the folder taxonomy, and the one-way rule
(features → `core`/`shared`; `core` → `shared`; `shared` → nothing app-internal) leaves
exactly **one** stratum every consumer may import: `shared/`. A new top-level
"published-vocabulary" folder was considered and rejected: it would have import rules
identical to `shared/` (importable by all, imports nothing app-internal) — a taxonomy
row that adds a name but no distinction — and it would cut against the repo's existing
precedent, which is the decisive fact:

> **`shared/` already hosts backend-vocabulary mirrors.** `shared/amenities.ts` is the
> frontend mirror of `ai.riviera.platform.venue.vocabulary.Amenity` (its own TSDoc says
> so), and `shared/booking-status.ts` mirrors the backend `BookingStatus` union the same
> way. The venue read-API views are the same kind of thing wearing the wrong address.

**So: split by kind, both kinds in `shared/`, the split expressed per file:**

| Piece | New address | Kind / rationale |
|---|---|---|
| `venue.model.ts` minus `MoneyView` (`CoverPhotoView`, `Tier`, `Pool`, `SeatAvailability`, `BookingMode`, `SetView`, `VenueMapView`, `AvailabilitySummary`, `VenueSummary`) | `shared/venue-views.ts` | **#95 in spirit:** the venue-owned published API-view vocabulary — one cohesive mirror of the venue read API (`VenueMapView` nests `SetView`; `VenueSummary` nests `AvailabilitySummary`/`CoverPhotoView`), kept as ONE file so the API contract is one document. The `venue` feature remains its **editor of record** — changes ride venue API slices — recorded in `riviera-frontend`. Follows the `amenities.ts`/`booking-status.ts` precedent exactly. |
| `MoneyView` | `shared/money.ts` (colocated with `formatMoney`/`eurosToMinorUnits`/`minorUnitsToEuros`) | **#371 kernel-style:** platform money vocabulary (invariant #5), not venue-owned — the issue classifies it cross-cutting; `shared/money.ts` already consumes it and is the stated "single home" of the euros↔minor boundary. Type + renderer + parser in the one home, as `booking-status.ts` pairs its union with `STATUS_META`. |
| `booking-date.ts` (whole file + its spec) | `shared/booking-date.ts` | **#371 kernel-style:** pure `Intl` civil-date helpers, no HTTP, no state. Heals the split the issue calls out (`shared/booking-date-label.ts` already lives in `shared/`). |
| `photo-url.ts` | `shared/photo-url.ts` | **#371 kernel-style:** pure config-dependent URL resolution consumed by `venue` + `operator`. Carries the one rule clarification below. |

**Rule clarification `photo-url.ts` forces (recorded in `riviera-frontend`):**
`environments/` is **not** "app-internal" for the purpose of `shared/` → nothing. It is
the public build-config stratum beneath the whole taxonomy (its own taxonomy row; `core/`
and features already import it freely), and `environment` is frozen build-time config,
not app state — `shared/` stays stateless and pure. Without this clarification
`photo-url.ts` has no legal address at all: it is not a stateful singleton (`core/`'s
definition) and not venue-owned (three features consume it).

**Intra-`shared/` imports after the move** (legal today — `amenity-chip.ts` →
`amenities.ts` is precedent): `venue-views.ts` → `./money` (`MoneyView`) + `./amenities`
(`Amenity`); `photo-url.ts` → `./venue-views` (`CoverPhotoView`) + `environments/`. No
cycles: `money.ts` and `amenities.ts` import nothing; `venue-views.ts` does not import
`photo-url.ts`.

## Acceptance criteria (testable)

> A pure move has no new behavior, so the pins are (a) the RV-FE-8 mechanical grep —
> feature folders are the direct children of `frontend/src/app` minus `core/`, `shared/`,
> `pages/`, `environments/` — and (b) the existing suites passing unchanged. The grep
> (from `riviera-review-overlay` `references/frontend-conventions.md` RV-FE-8):
> ```
> grep -rn "from '\(\.\./\)\+\(admin\|auth\|booking\|operator\|pages\|venue\|venue-admin\)/" \
>   --include=*.ts frontend/src/app | grep -v "\.spec\.ts"
> ```

- [ ] **AC-1:** Given the moved files, when the grep runs over `shared/` and `core/`, then it reports **zero** feature imports from either (`shared/money.ts` and `shared/availability-grid.ts` no longer reach `venue/`). *Pinned by:* the RV-FE-8 grep filtered to `app/shared|app/core`.
- [ ] **AC-2:** Given the moved files, when the grep runs over `booking/` and `venue-admin/`, then each reports **zero** cross-feature imports. *Pinned by:* the RV-FE-8 grep filtered to those folders.
- [ ] **AC-3:** Given the moved files, when the grep runs over `operator/` and `pages/`, then `operator/` shows exactly three hits, all `venue/venue.service` (`console-venue-map.ts`, `daily-view-tab.ts`, `layout-editor.ts`), and `pages/home/home.ts` exactly one (`venue.service`). *Pinned by:* the RV-FE-8 grep.
- [ ] **AC-4:** Given the move, `venue/venue-map.ts` still imports `../booking/booking-dialog` unchanged. *Pinned by:* the RV-FE-8 grep (the one remaining `venue/` hit).
- [ ] **AC-5:** Given the move, the grep's total over `frontend/src/app` is exactly **5** lines. *Pinned by:* the RV-FE-8 grep, recorded in Execution status.
- [ ] **AC-6:** The chosen shape + rationale are written down — this section — and reflected in `riviera-frontend`'s SKILL.md. *Pinned by:* this PR's diff to both docs.
- [ ] **AC-7:** Given the moved files, when `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e:a11y` run, then all pass with no spec edited other than import paths. *Pinned by:* the four commands + CI on the PR.
- [ ] **AC-8:** `riviera-frontend`'s debt table/counts AND `riviera-review-overlay` RV-FE-8's references are updated in this same PR to the residual set of 5. *Pinned by:* this PR's diff; verified against the AC-5 grep output.

## Non-goals

- The five residual behavioral imports (`operator/`×3 + `pages/home` → `venue.service`;
  `venue/venue-map` → `booking/booking-dialog`) — explicitly out of scope per the issue.
- Adding ESLint enforcement of the import direction (the issue's stated follow-up
  candidate once the residual is 5).
- Deduplicating `formatCivilDate` (moved file) vs `shared/booking-date-label.ts`'s
  `formatBookingDate` — near-identical `en-IE`/UTC formatters. A real cleanup, but a
  logic change, and this slice is a pure move. Noted for a follow-up.
- Any backend change; any behavior change of any kind.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced; every file keeps its exact contents. Parity is
mechanical: the moves are `git mv` + import-specifier rewrites only (plus deleting the
`MoneyView` interface from the moved vocabulary file and inserting it verbatim into
`money.ts`). Verified by `git diff` inspection (only import lines + file renames), the
unchanged unit suite, and the unchanged e2e:a11y suite (AC-7).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The "pure move" silently edits logic (missed importer, bad path rewrite, dropped export) | med | med | `git mv` for whole files; single mechanical find/replace per old path; `npm run lint` (import ordering) + `npm test` + `npm run build` + e2e:a11y; `git diff` must show only import/rename hunks | session | closed — `698131e`: only content hunk beyond imports/TSDoc is the `MoneyView` interface relocation; all four suites green |
| R-2 | `shared/photo-url.ts` creates the first `shared/` → `environments/` import and gets read as licence for `shared/` importing app code | low | med | the rule clarification is written into `riviera-frontend` in this same PR: `environments/` is the config stratum, not app-internal; `shared/` remains stateless | session | closed — clarification shipped in `riviera-frontend` §taxonomy (Phase 3 commit) |
| R-3 | Debt-record drift: `riviera-frontend`'s table or RV-FE-8's text still claims 33/21 after the move ("a stale count reads as licence") | med | med | AC-8 updates both in this PR; final counts taken from the AC-5 grep output, not from memory | session | closed — both skills rewritten from the live grep (Phase 3 commit); straggler sweep found zero stale path references outside intentional history notes |
| R-4 | Collision with in-flight work | low | low | intake gate checked: only dependabot dependency PRs open; none touch `src/app` | session | closed — verified at intake |
| R-5 | Import cycles inside `shared/` after the move | low | med | dependency direction fixed by design (see intra-`shared/` map above); `npm run build` fails on true cycles | session | closed — build green at `698131e` |

## Open questions / Assumptions

None open.

### Resolved

- **Where the venue-owned read models land** — resolved in *The design decision*:
  `shared/venue-views.ts`, venue as editor-of-record; the literal #95 keep-in-owner form
  is excluded by ACs 1–3/5 plus the absence of a grant mechanism. Decided at plan time
  (this commit).
- **Whether `photo-url.ts` may live in `shared/`** — resolved: yes, with the
  `environments/`-is-not-app-internal clarification recorded in `riviera-frontend`
  (R-2). Decided at plan time (this commit).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: frontend-only address moves; no write path, no API
call, no behavior touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behavior added or moved. The frontend analogue is the whole point of
the slice and is recorded in *The design decision* (venue stays editor-of-record of
`shared/venue-views.ts`; the cross-cutting helpers become ownerless kernel material).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (`MoneyView` moves address; invariant #5's minor-units form
is untouched.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/venue-views.ts` (from `venue/venue.model.ts`) | moved | pure types | none | none |
| FE-2 | `shared/booking-date.ts` + spec (from `venue/`) | moved | pure functions | none | none |
| FE-3 | `shared/photo-url.ts` (from `venue/`) | moved | pure functions | none | none |
| FE-4 | `shared/money.ts` | modified | gains the `MoneyView` interface verbatim | none | none |
| FE-5 | ~30 importer files across `booking/`, `operator/`, `venue-admin/`, `venue/`, `pages/home`, `shared/` (incl. specs) | modified | import-specifier rewrites only | unchanged | unchanged |

**Standards:** no component/service/template logic touched; import-path edits only
(v22 best practices loaded and implicated nothing).

## FE↔BE contract

N/A — no contract change; the types keep mirroring the same wire shapes byte-for-byte.

## Execution status

**Stage pointer:** implement done — next: mark PR #494 ready → review gate + Sonar gate

**Next action:** verify CI green on the Phase-3 push, mark PR #494 ready for review, run the review gate per `references/pr-gates.md` §1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR (#494) | ✅ | `b683135` |
| 1 — move `booking-date.ts` + `photo-url.ts` → `shared/` | ✅ | `698131e` (atomic with 2) |
| 2 — `venue.model.ts` → `shared/venue-views.ts`; `MoneyView` → `shared/money.ts` | ✅ | `698131e` |
| 3 — debt records (`riviera-frontend` + RV-FE-8) + full verification incl. e2e:a11y | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**AC-1..5 verification (RV-FE-8 grep at Phase 3, exactly 5 lines):**
`operator/console-venue-map.ts`, `operator/daily-view-tab.ts`, `operator/layout-editor.ts`
→ `../venue/venue.service`; `pages/home/home.ts` → `../../venue/venue.service`;
`venue/venue-map.ts` → `../booking/booking-dialog`. Zero hits under `shared/`, `core/`,
`booking/`, `venue-admin/`. Suites at `698131e`+Phase 3: lint ✅ · 1034 unit tests / 128
files ✅ · build ✅ · e2e:a11y 117 ✅ (chromium via `PW_CHROMIUM_EXECUTABLE`, the config's
own escape hatch for a pre-installed browser revision).

**Phase merge note:** `photo-url.ts` imports `CoverPhotoView` from `venue.model.ts`.
Moving `photo-url.ts` alone would create a NEW `shared/` → `venue/` import — the exact
edge this slice exists to delete. So Phases 1 and 2 land as ONE atomic commit; they are
listed separately only as work breakdown.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `frontend/src/app/shared/venue-views.ts` — the venue-owned API-view vocabulary (moved; minus `MoneyView`)
- `frontend/src/app/shared/money.ts` — gains `MoneyView` (the money vocabulary + its renderer/parser)
- `frontend/src/app/shared/booking-date.ts` (+ `.spec.ts`) — civil-date helpers (moved)
- `frontend/src/app/shared/photo-url.ts` — API-origin photo URL resolution (moved)
- ~30 importer files — path rewrites only (list = the grep at intake, plus 13 spec files, plus `venue/venue.service.ts` + `venue/venue-map.ts` internal imports)
- `.claude/skills/riviera-frontend/SKILL.md` — debt section rewritten to the residual 5; `environments/` clarification
- `.claude/skills/riviera-review-overlay/references/frontend-conventions.md` — RV-FE-8 references updated
- `docs/plans/vocabulary-out-of-venue.md` — this plan

---

## Phase 0 — Plan doc + draft PR

- [ ] Commit this plan doc → push → open draft PR referencing #489 (CI vehicle per rule 3).

## Phase 1+2 — The atomic move (one commit; see phase merge note)

**Files:** `git mv` `venue/booking-date.ts` → `shared/booking-date.ts`,
`venue/booking-date.spec.ts` → `shared/booking-date.spec.ts`, `venue/photo-url.ts` →
`shared/photo-url.ts`, `venue/venue.model.ts` → `shared/venue-views.ts` · In
`venue-views.ts`: delete the `MoneyView` interface, import it from `./money`; keep the
`Amenity` import (now `./amenities`) · In `money.ts`: insert `MoneyView` verbatim,
exported · Rewrite every importer (booking ×3, operator ×12, venue-admin ×2, shared ×2,
pages/home, venue ×2 internal, + the spec files).

- [ ] Adapted TDD steps: run the RV-FE-8 grep (33 hits = red) → perform the moves + rewrites → re-run the grep (5 hits = green) → `npm run lint && npm test && npm run build`.
- [ ] Generalization sweep: re-grep for `venue/venue.model|venue/booking-date|venue/photo-url` anywhere (`frontend/src`, `frontend/e2e`, `docs`, `.claude`) to catch stragglers; log below.
- [ ] Verify `git diff` shows only renames + import-line hunks (R-1).
- [ ] Commit + update Execution status in the same window.

## Phase 3 — Debt records + full verification

**Files:** `.claude/skills/riviera-frontend/SKILL.md` (debt section → residual-5 table,
target-state paragraph rewritten to "done", `environments/` clarification, decision
recorded per AC-6) · `.claude/skills/riviera-review-overlay/references/frontend-conventions.md`
(RV-FE-8: stale counts/wording updated).

- [ ] Update both skills from the live grep output (not from memory).
- [ ] `npm run test:e2e:a11y` (the CI-safe suite; Chromium preinstalled per `riviera-local-debug`).
- [ ] Verify every AC above; record the grep output in Execution status.
- [ ] Commit; mark PR ready for review; enter the gates (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | Phase 1+2 sweep (`698131e`) | residual references to the three old paths | `grep -rn "venue/venue\.model\|venue/booking-date\|venue/photo-url" frontend/src frontend/e2e` + the substrate docs | 2, both in the two skills' debt tables | rewritten in Phase 3 (AC-8); remaining mentions are intentional history notes |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..5:** RV-FE-8 grep at the final commit → exactly the 5 residual lines, zero under `shared/`/`core/`/`booking/`/`venue-admin/`.
- [ ] **AC-6:** decision + rationale in this doc; `riviera-frontend` updated in same PR.
- [ ] **AC-7:** lint / unit / build / e2e:a11y all green locally; CI green on the PR.
- [ ] **AC-8:** both debt records rewritten from live grep output, same PR.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying pin (grep or suite).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases (no signatures change at all).
- [ ] No JPA introduced (frontend-only; invariant #1 untouched).
- [ ] Availability section justified N/A (invariant #2 untouched).
- [ ] Pool + cutoff rules untouched (#3, #4) — `booking-date.ts` moved verbatim.
- [ ] Modulith section justified N/A; no backend imports (invariant #11's FE mirror is the slice itself).
- [ ] Payment/payout justified N/A; `MoneyView` shape untouched (#5).
- [ ] Refund policy untouched (#10).
- [ ] Timezone logic moved verbatim, not edited (#6).
- [ ] Booking codes untouched (#7).
- [ ] No schema change (#12).
- [ ] Frontend standards: no `as any`, no logic edits; import order per ESLint.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale open rows; Open Questions empty.
- [ ] Close-out written in THIS PR (`merged via PR #NN` recorded above).
- [ ] The review gate ran in full (invocation ladder per `references/pr-gates.md` §1 plus the overlay, not the overlay alone).
