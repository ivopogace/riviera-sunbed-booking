# Per-set beach-map editing UI Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give an operator a way to add, edit and remove a single set on a venue whose
beach map is otherwise frozen — so a live venue's map stops being uneditable the moment it
takes its first booking.

**Architecture:** The single significant decision is **a second, sibling component rather
than a second mode inside `layout-editor`**. The two write models are genuinely different:
the layout editor is a client-side grid buffer flushed by one bulk `PUT` with an
`expectedVersion` token, whereas per-set editing issues an immediate owner-asserted call per
action against a real `setId` and must surface a per-set `409 SET_IN_USE`. Bolting the second
onto a 507-line component that already carries generate/paint/drag/confirm/stale-reload state
would entangle two concurrency stories in one place. The Beach map tab picks between them on
one signal — the bulk editor while the venue is unclaimed, the per-set editor once it is live.

**Persistence:** N/A — **no backend change and no migration.** All three endpoints, their
claim guards and the `409 SET_IN_USE` contract shipped in #567.

**Source of intent:** GitHub issue **#600** (follow-on from #567; the guard that made per-set
editing safe on a live venue).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — this slice was
refined in-session, and the gate's in-flight check is what surfaced that #600 makes #598's
race UI-reachable for the first time) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what caught that the bulk editor's `LAYOUT_IN_USE` copy is
now false) · `tdd` (each AC red-first) · `riviera-review-overlay` (review gate — runs at
ready-for-review; **RV-FE-8** is the one to watch, see Risks) · `riviera-docs-freshness`
(close-out) · `riviera-frontend` (**structure, settled at plan time**: the new component is a
sibling inside the existing `operator/` feature folder, so no new cross-feature edge is
created; the tab stays a child route of the `/operator/:venueId` tree and reads `:venueId`
reactively via `parentVenueId`) · **Load at implement time:** `angular-developer` +
angular-cli MCP (v22 signal APIs, a11y), `riviera-tailwind` (porcelain console tokens — the
console pins `data-riv-theme="porcelain"`), `playwright-cli` (the CI-safe mocked spec).

**Branch:** `claude/sdlc-567-256zjs` — the cloud session's designated remote branch, restarted
from `origin/main` after PR #597 merged (`riviera-sdlc` § Remote/cloud addendum). Stands in for
`feature/per-set-map-editing-ui`.

---

## Acceptance criteria (testable)

- [ ] **AC-1 (a live venue is editable at all):** Given a venue whose bulk layout write is
      refused (it has a booking or a hold), when the operator opens the Beach map tab, then
      the per-set editor is shown instead of the locked bulk editor, and the map renders.
      *Pinned by:* `beach-map-tab.spec.ts.showsThePerSetEditorWhenTheLayoutIsLocked`
- [ ] **AC-2 (remove):** Given an unclaimed set on a live venue, when the operator removes it
      and confirms, then `DELETE …/sets/{setId}` is sent and the set disappears from the map
      without a full reload. *Pinned by:* `set-editor.spec.ts.removesASetAfterConfirmation`
- [ ] **AC-3 (remove is refused honestly):** Given a set the server answers `409 SET_IN_USE`
      for, when the operator removes it, then the set stays on the map and the message names
      the reason ("booked or held"), not a generic failure.
      *Pinned by:* `set-editor.spec.ts.keepsTheSetAndExplainsWhenItIsInUse`
- [ ] **AC-4 (edit — price/tier always):** Given any set on a live venue, when the operator
      changes only its price or tier, then `PATCH …/sets/{setId}` is sent and the change is
      applied. *Pinned by:* `set-editor.spec.ts.appliesAPriceOnlyEditToAClaimedSet`
- [ ] **AC-5 (edit — reposition refused when live-claimed):** Given a set the server answers
      `409 SET_IN_USE` for, when the operator changes its pool or position, then the map is
      unchanged and the message explains that a booked or held set cannot be moved.
      *Pinned by:* `set-editor.spec.ts.keepsThePlacementWhenTheSetIsInUse`
- [ ] **AC-6 (add):** Given a live venue, when the operator adds a set at a free cell, then
      `POST …/sets` is sent and the new set appears with the id the server returned.
      *Pinned by:* `set-editor.spec.ts.addsASetAtAFreeCell`
- [ ] **AC-7 (add — cell conflicts surface):** Given a cell another set occupies, when the
      operator adds there, then the server's `CELL_TAKEN` / `DUPLICATE_POSITION` is shown and
      no set is added. *Pinned by:* `set-editor.spec.ts.surfacesACellConflictOnAdd`
- [ ] **AC-8 (the bulk path is untouched while unclaimed):** Given an unclaimed venue, when
      the operator opens the Beach map tab, then the existing generate/paint/save editor is
      shown and behaves exactly as before.
      *Pinned by:* the existing `layout-editor.spec.ts` suite, unchanged
- [ ] **AC-9 (e2e + a11y):** The mocked Playwright spec drives add → edit → remove against a
      live venue and asserts each request payload and the `SET_IN_USE` message; the a11y and
      contrast specs pass. *Pinned by:* `frontend/e2e/set-editor.e2e.ts`,
      `set-editor.a11y.spec.ts`, `set-editor.contrast.spec.ts`

## Non-goals

- **Any backend change.** The endpoints, guards and error contract shipped in #567. If this
  slice finds itself wanting a backend edit, that is a signal to stop and re-plan.
- **A "which sets are movable?" pre-warn probe.** `editSet` refuses a reposition when the set
  has a hold on *any* future date or a non-terminal booking; the console's only availability
  read is single-date, so the UI cannot predict it. Surface the server's `409` reactively, as
  the bulk editor already does for `LAYOUT_IN_USE`. O3 (#172) rejected a probe endpoint as a
  non-goal and that still stands.
- **Giving the per-set writes an `expectedVersion` token.** They deliberately do not
  participate in `set_version` (#567 non-goal). See R-3 for what that costs here.
- **Retiring the bulk editor.** It stays the right tool for laying out a new venue.
- **Fixing #598 or #599.** #600 makes #598 reachable from the UI (R-2); it does not fix it.

## Behavior-parity ledger

> The slice does not retire a surface, but it **changes what the Beach map tab shows** for a
> whole class of venues, so every behavior of today's tab needs a verdict.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Unclaimed venue → generate/paint/save bulk editor | preserved | unchanged component, selected by the new branch; AC-8 |
| Live venue → same editor, save always fails `LAYOUT_IN_USE` | **changed** → per-set editor | the point of the slice; AC-1 |
| `LAYOUT_IN_USE` copy: "Layout changes are not possible while sets are in use" | **changed** → corrected | now false: per-set changes *are* possible. Reword, and only show it in the bulk editor's own stale/regenerate path |
| Stale-token reload flow (`reloadAfterStale`) | preserved | bulk editor only; per-set writes carry no token, so they have no stale path |
| Per-row price editing (Pricing tab) | preserved | untouched; still the bulk way to reprice a whole row |
| Daily view tap-to-mark | preserved | untouched — but see R-2 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Splitting into a second component duplicates the grid rendering, so the two editors drift visually | med | med | Extract the cell rendering + tier/pool swatch classes into one shared presentational piece **before** writing the second editor, and have the bulk editor use it too. If extraction proves messy, that is the signal the mode-inside-one-component alternative was right — record the reversal rather than duplicating markup | agent | open |
| R-2 | **This slice makes #598 reachable from the UI.** Nothing in the app calls `DELETE …/sets/{setId}` today, so the staff-mark-vs-remove race needs direct API use; a remove button ends that | high (by construction) | low | Accepted, and stated in #600. It fails closed — the DB refuses, no phantom hold — and the staff member's retry correctly reports the set is gone; a refresh shows the right map. Re-weight #598 once this ships | agent | open |
| R-3 | Per-set writes do not bump `set_version`, so another tab's bulk editor keeps a token that no longer describes the map | low | med | Only reachable on a venue that is *unclaimed* (the only state where the bulk editor can save) **and** being per-set edited at the same time. The bulk save is still guarded — it will either succeed against a map it did not expect, or hit a cell/position conflict. Reload the map after each per-set write so the acting tab is never the stale one; do not add a token (non-goal) | agent | open |
| R-4 | **RV-FE-8**: adding a *new* cross-feature import is a Major finding (Blocker if `shared/`-directed) | low | high | The new component lives in `operator/`, beside `layout-editor`, and takes the same already-grandfathered `venue.service` edge — no new edge. Any shared cell rendering goes in `operator/`, not `shared/`, unless it is genuinely venue vocabulary | agent | open |
| R-5 | Per-venue authorization (invariant #13, BOLA) | low | high | Nothing new: all three endpoints assert ownership in the application service and are pinned by `CrossVenueDenialIT`. The UI adds no authorization of its own and must not appear to | agent | open |
| R-6 | The confirm-before-remove step is skipped, so a mis-click deletes a set | med | med | Removal is destructive and irreversible from the UI. Require an explicit confirm, mirroring the bulk editor's existing regenerate confirm (`confirmRegen`) rather than inventing a second pattern | agent | open |

## Open questions / Assumptions

- **Assumption:** the Beach map tab can tell "live" from "unclaimed" without a new endpoint —
  by attempting nothing and instead reading the venue map plus the owner availability read, or
  by treating the bulk save's `LAYOUT_IN_USE` as the signal. — *Owner:* agent · *Resolves by:*
  phase 0. **This is the one thing to settle before writing UI**: if neither existing read can
  answer it cleanly, the honest options are (a) always offer per-set editing alongside the bulk
  editor rather than branching, or (b) accept a probe endpoint and re-open the O3 non-goal with
  the maintainer. Do **not** infer liveness from a failed save alone — that shows the operator a
  dead end first, which is the bug being fixed.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none added. This slice drives three
  `venue`-module layout writes; it never writes availability.
- **Uniqueness guarantee / concurrency strategy:** unchanged and entirely server-side. Each
  per-set write takes `SELECT … FOR UPDATE` on its `set_position` row and probes for claims
  before writing (#567); the online claim reads the pool under `FOR KEY SHARE`.
- **Pool rule (invariant #3):** the UI may offer a pool change, but the server refuses it on a
  live-claimed set with `409 SET_IN_USE`. The UI must **never** decide this itself — it renders
  the server's answer (AC-5).
- **Cutoff rule (invariant #4):** not affected.
- **Pinning test:** the concurrency proofs live in the backend and already shipped
  (`SetWriteVsClaimConcurrencyIT`). This slice adds no concurrency surface of its own, which is
  why its ACs are UI-level — **if that stops being true, stop and re-plan.**

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file changes; no module, port or event is touched.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` Prices are edited as integer minor units through the existing
`SetCommand` contract (invariant #5); no money moves and no ledger effect.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` (+ `.html`) | new | standalone component | signals; one call per action, map reloaded after each | Signal Forms for the per-set fields |
| FE-2 | `operator/beach-map-tab.ts` | new (thin) | standalone component | chooses bulk vs per-set editor on one signal | — |
| FE-3 | `operator/layout-editor.ts` | existing | — | unchanged except the corrected `LAYOUT_IN_USE` copy | — |
| FE-4 | `operator/operator-console.service.ts` | existing | service | gains `addSet` / `editSet` / `removeSet` | — |
| FE-5 | `app.routes.ts` | existing | route | the `beach-map` child route points at FE-2 | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. The console pins `data-riv-theme="porcelain"` — do not write the document theme
attribute. (Detail in `angular-developer`'s `references/`, loaded at implement time.)

## FE↔BE contract

- **Endpoints consumed (all existing, none changed):** `POST /api/venues/{venueId}/sets`
  (`201` + `{id}`), `PATCH /api/venues/{venueId}/sets/{setId}` (`204`),
  `DELETE /api/venues/{venueId}/sets/{setId}` (`204`).
- **Rejections to render:** `409 SET_IN_USE` (booked or held — cannot be moved or removed),
  `409 CELL_TAKEN` / `409 DUPLICATE_POSITION`, `404 NO_SUCH_SET` / `NO_SUCH_VENUE`, `403`
  (not the owner). All are RFC-7807 `ProblemDetail` with a stable `code`; read `code`, never
  the human `detail`.
- **Client typing:** extend `operator-console.model.ts` with the per-set request type; reuse
  `SetCellRequest`'s existing shape where it already matches. No `as any`.
- **Money/date on the wire:** amounts stay integer minor units + currency (invariant #5).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current stage's `riviera-sdlc` reference file) before acting.

**Stage pointer:** `plan — authored and committed; implementation not started`

**Next action:** Resolve the Open Question in phase 0 (how the tab tells live from unclaimed)
**before** writing any UI, then run the Skill-routing gate for the frontend area
(`angular-developer` + angular-cli MCP, `riviera-tailwind`, `playwright-cli`) and start phase 1.

> **Context note for a resuming session:** this plan was authored at the end of a long session
> that shipped #567 (PR #597). Nothing has been implemented — the branch is at `origin/main`.
> The backend half is done and merged; this slice is frontend-only.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Settle liveness detection + extract the shared cell rendering (R-1) | | |
| 1 — `operator-console.service` gains add/edit/remove + model types | | |
| 2 — `set-editor` component: remove (AC-2/AC-3) | | |
| 3 — `set-editor`: edit (AC-4/AC-5) and add (AC-6/AC-7) | | |
| 4 — Beach map tab branch (AC-1/AC-8) + corrected `LAYOUT_IN_USE` copy | | |
| 5 — e2e + a11y + contrast (AC-9), docs close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

> Provisional until phase 0 settles R-1's extraction. Re-run
> `node scripts/check-plan-file-structure.mjs --diff origin/main` before every push — CI fails
> the PR on any path the diff changes and this section omits.

- `docs/plans/per-set-map-editing-ui.md` — this plan doc
- `frontend/src/app/operator/set-editor.ts|.html` — the per-set editor
- `frontend/src/app/operator/set-editor.spec.ts` — AC-2..AC-7
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — axe
- `frontend/src/app/operator/set-editor.contrast.spec.ts` — composited contrast
- `frontend/src/app/operator/beach-map-tab.ts|.spec.ts` — the bulk-vs-per-set branch (AC-1/AC-8)
- `frontend/src/app/operator/layout-editor.ts` — corrected `LAYOUT_IN_USE` copy
- `frontend/src/app/operator/operator-console.service.ts` — `addSet` / `editSet` / `removeSet`
- `frontend/src/app/operator/operator-console.model.ts` — the per-set request/response types
- `frontend/src/app/app.routes.ts` — the `beach-map` child route points at the new tab
- `frontend/e2e/set-editor.e2e.ts` — CI-safe mocked spec (AC-9)

---

## Phase 0 — Settle liveness detection, then extract the shared cell rendering

**Files:** read-only investigation, then `frontend/src/app/operator/*`

- [ ] **Step 1:** Answer the Open Question from the existing reads only — `GET /api/venues/{id}`
      (public map) and `GET /api/venues/{venueId}/availability?date=` (owner, single date) —
      plus whatever the console already loads. Write the answer into the Open Questions section
      as **Resolved**, with the read that settles it. If nothing settles it, escalate per the
      Open Question's own options rather than guessing.
- [ ] **Step 2:** Extract the cell/swatch rendering shared by both editors (R-1), leaving
      `layout-editor` behaviourally identical — its existing spec suite is the proof (AC-8).
- [ ] **Step 3:** Run `npm test` scoped to the operator specs; then commit.
- [ ] **Step 4:** Open the draft PR (CI runs on the `pull_request` event only) and update the
      Execution status in the same commit window.

---

## Phases 1–5

Deliberately not expanded here. Each depends on phase 0's answer to the Open Question and on
the shape the extraction takes, and a plan that pre-writes UI code against an unresolved
question is how the wrong abstraction gets built. Expand each phase at its start, test-first,
and keep the Execution-status table current.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] Each AC verified by its named spec; record the command and commit per AC at close-out.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled; this slice adds no availability write (invariant #2).
- [ ] Pool rule honored — the server decides, the UI renders (invariant #3).
- [ ] **Modulith** section filled (N/A, frontend-only) (invariant #11).
- [ ] **Payment/payout** N/A; money stays integer minor units (invariant #5).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] **No new cross-feature import** (RV-FE-8).
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per the invocation ladder in `references/pr-gates.md` §1.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
