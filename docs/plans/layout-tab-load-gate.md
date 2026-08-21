# Beach-Map Tab Load Gate Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** the Beach map tab stops reading an **unsettled** map GET as *this venue is empty*.
For the width of that read, the per-set surface shows a pulsing skeleton instead of a 1×1 grid
plus "This venue has no sets yet", and Generate cannot replace a layout nobody has seen yet.

**Architecture:** one signal pair on `LayoutEditor` — the component that actually owns the read —
answers both symptoms, because both are the same missing fact:

- **`mapLoaded`** — a map read has **succeeded** for this venue, so `loadedSets()` is server truth
  rather than the `[]` default. Passed into `SetEditor` as a new required `loaded` input; false
  renders the skeleton. It is deliberately *not* cleared by `onSetsChanged()`'s re-read, so the
  common per-set-write path never flashes a skeleton over sets it already has.
- **`reading`** — a map read is **in flight**. Generate is disabled while it is true, so the
  destructive regenerate acts only on a map the operator has actually been shown. This one *does*
  cover `onSetsChanged()`'s window, which is why the gate is "the read has settled" and not "the
  grid is non-empty" (issue #721, *How it's reached*).

The two are separate on purpose: one is "what we hold is real", the other is "a read is running".
Collapsing them would either flash the skeleton on every per-set write (if `SetEditor` read
`reading`) or leave Generate open during the reconcile window (if the gate read `mapLoaded`).

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no backend file in scope.

**Source of intent:** GitHub issue **#721** (filed by PR #720's review gate as its deferred finding
F-2, then widened on 2026-08-21 with symptom 2; the sibling zero-set-copy slice it defers from is
`docs/plans/operator-map-empty-state.md`, merged via PR #720).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill re-verified
every premise against `main` @ `aa65fcd` and settled the two forks the issue leaves open: which arm
of AC-4 to take, and what the *failed* read must render on the per-set surface, D-1/D-2) ·
`riviera-plan-doc` (this template — its Behavior-parity ledger is what forced the `onSetsChanged()`
row, i.e. the reason `mapLoaded` and `reading` are two signals rather than one) · `tdd` (each phase
writes the failing spec against the unsettled render first, then the gate) ·
`riviera-review-overlay` (review gate — walked at ready-for-review; see Execution status) ·
`riviera-docs-freshness` (close-out — see Execution status) · `riviera-frontend` (structure —
confirmed both edits stay inside the `operator/` feature folder: no new file, no new cross-feature
edge, and the skeleton stays in `set-editor.html` rather than being promoted to `shared/`, which
has exactly one consumer today) · `riviera-tailwind` (styling — utilities only, no new `.scss`
(neither component carries legacy SCSS, so migrate-on-touch has nothing to migrate);
`animate-pulse` + `motion-reduce:animate-none` + `bg-(--riv-card-track)`, the home-grid tokens,
never a hardcoded grey) · `angular-developer` + angular-cli MCP (`get_best_practices` v22 +
`list_projects` — `@if`/`@else`, `input.required()` for the new gate, signal reads in the template,
no `ngClass`) · `playwright-cli` (the mocked held-GET e2e — and its `getAnimations().finished` trap,
R-2) · `riviera-local-debug` (scoped Vitest runs — `npm test -- <file>`, never the full suite per
phase).

> **The five leading entries are pre-filled on purpose — extend them, don't replace them**
> (#447: pre-fill the constant so the author edits rather than recalls; full rationale:
> `riviera-plan-doc` workflow step 0). Fill every parenthesis with what the skill actually
> did — a name with a fixed label is cargo cult; RV-PROC-1 checks the line against the diff
> either way. Keep `riviera-docs-freshness`'s parenthesis **explicit — `ran` (range +
> findings) or `N/A — <reason>`**: "not listed" and "not applicable" read the same in a diff.

**Branch:** `claude/riviera-sunbed-booking-721-yaijxa` — the cloud session's **designated remote
branch**, standing in for `bugfix/layout-tab-load-gate` per `riviera-sdlc` § *Remote / cloud session
addendum*. It existed at `origin/main` before phase 0.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests (Cockburn 2005). This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.

These are frontend-render ACs by nature — the slice adds no application-boundary behavior (no new
request, no state change server-side). They are written at the surface's own boundary: what an
operator is shown, and what the tab lets them do, before/at/after the map read settles.

- [x] **AC-1:** Given a venue with sets whose map GET has not resolved, when the operator switches to
      Edit sets, then the per-set surface renders the skeleton — pulsing placeholder tiles on the
      canvas and placeholder lines in the panel — and renders **no** `set-cell`, no
      `set-panel-no-sets` copy.
      *Pinned by:* `SetEditor (#600) › shows a skeleton, not an empty venue, while the map read is in flight (#721)`
- [x] **AC-2:** Given that read then resolves with the venue's sets, when it lands, then the grid and
      panel render the real sets with no further interaction and **no skeleton element remains in the
      DOM**.
      *Pinned by:* `SetEditor (#600) › replaces the skeleton with the venue's real sets when the read lands (#721)`
- [x] **AC-3:** Given a genuinely set-less venue whose read **has** resolved, when Edit sets is
      chosen, then the #718 no-sets copy (`set-panel-no-sets`) and the single empty spot still render
      and no skeleton is present (no regression).
      *Pinned by:* `SetEditor (#600) › points a set-less venue at the bulk generator, and still adds into the one empty spot (#718)` (extended with the no-skeleton assertion)
- [x] **AC-4:** Given a venue whose map read has not resolved, when the operator reaches Generate,
      then it is **unavailable** (`disabled`, labelled as loading) and activating it neither
      generates nor saves anything — the stored layout is never silently replaced. Holds for **both**
      windows that open one: the tab's own mount and `onSetsChanged()`'s re-read.
      *Pinned by:* `LayoutEditor (#172) › refuses Generate until the map read settles, on mount and on the per-set reconcile (#721)`
- [x] **AC-5:** Given a genuinely set-less venue whose read has resolved, when Generate is activated,
      then it still generates immediately with no confirmation; and given a venue **with** a layout,
      Generate still asks for the destructive-regenerate confirmation (no regression, both arms).
      *Pinned by:* `LayoutEditor (#172) › starts empty and generates an R×C grid with row A front-row premium` + `… asks for confirmation before regenerating over an existing grid` (both extended to assert Generate is enabled once settled)
- [x] **AC-6:** Given the initial map read **fails**, when the operator is on either surface, then the
      skeleton does not pulse forever: the tab renders the `layout-load-failed` notice in **both**
      modes, and the per-set editor is not rendered at all (it would otherwise repeat the very
      "no sets yet" claim this issue is about, over a venue whose sets are simply unknown).
      *Pinned by:* `LayoutEditor (#172) › explains a failed map read on both surfaces instead of an empty per-set editor (#721)`
- [x] **AC-7:** Given `prefers-reduced-motion`, when a skeleton renders, then it does not animate —
      every pulsing element carries `motion-reduce:animate-none` beside `animate-pulse`.
      *Pinned by:* `SetEditor (#600) › skeletons are decorative: aria-hidden, announced sr-only, and motion-reduce safe (#721)`
- [x] **AC-8:** Given assistive tech, when the skeleton renders, then the skeleton tree is
      `aria-hidden="true"` and a polite `sr-only` line names what is loading — the home-grid contract
      (`home.spec.ts` *"renders pulsing skeleton cards (decorative) with a text announcement while
      loading"*).
      *Pinned by:* `SetEditor (#600) › skeletons are decorative: aria-hidden, announced sr-only, and motion-reduce safe (#721)`
- [x] **AC-9:** Given axe in jsdom, when it runs over the in-flight per-set surface and over the
      failed-read tab, then there are no violations.
      *Pinned by:* `SetEditor a11y (#600) › has no axe violations while the map read is in flight (#721)` +
      `LayoutEditor a11y (#172) › has no axe violations when the initial map read failed (#721)`
- [x] **AC-10:** Given a real browser whose venue GET is held open, when the operator re-enters the
      Beach map tab, then Generate is disabled, Edit sets shows the skeleton, and releasing the read
      restores both surfaces (real tiles; Generate enabled and confirming).
      *Pinned by:* `layout-editor.e2e.ts › holds both surfaces until the map read settles (#721)`

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **No skeleton on the bulk canvas.** Its `canvasEmpty` copy ("Generate a layout to begin, then
  paint tiers…") is an *instruction*, not a claim about the venue, and the only destructive thing it
  invites — Generate — is exactly what this slice fences. The bulk grid is a **draft** surface, which
  is why `seedFrom()` refuses to clobber it; a skeleton over a draft would be a different (and
  wrong) statement. The disabled Generate button reads "Loading the current layout…", so the window
  is named on that surface too.
- **No `ConsoleVenueMap` caching for the layout editor.** The editor reads through `VenueService`
  deliberately, so it always seeds from server truth (`console-venue-map.ts`); shortening the window
  by caching would re-open the staleness the bypass exists to prevent.
- **No change to `shared/beach-map-canvas.*`.** The skeleton reuses the canvas as-is (its own
  `--riv-tile` sizing is what makes the shape match); no slot, input or behavior is added to it.
- **No promotion of the skeleton to `shared/`.** One consumer today; `riviera-frontend`'s promotion
  rule is "when two features need the same thing".
- **No retirement of `booking/my-bookings.scss`'s `.skeleton`.** The issue names it as debt, not
  precedent, and explicitly scopes its conversion out.
- **No new design token and no new colour.** `--riv-card-track` (`styles.scss`, theme-invariant) is
  the placeholder fill the home grid already uses; the failure notice keeps `#a3160e`, already
  proven AA on this surface by `layout-editor.contrast.spec.ts`.
- **No retry affordance on the failed read.** The existing copy prompts a refresh; adding a Retry
  button is a separate behavior with its own error paths.

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

The slice replaces no surface, but it **gates two existing ones**, so the ledger is filled for
exactly those gates rather than waived — this is where the `onSetsChanged()` trap was caught.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `SetEditor` renders the venue's sets by id, selection + draft re-seeded by `linkedSignal` on every re-read | **preserved** | the gate wraps the whole two-column render in `@if (loaded())`; nothing inside the loaded branch is edited, and `sets` still drives both `linkedSignal`s |
| `onSetsChanged()` re-reads without clearing `loadedSets`, so a per-set write never flashes the wrong copy | **preserved** | `mapLoaded` is set once per venue and **not** cleared by the re-read; only `reading` flips, and `SetEditor` never reads `reading` |
| The per-set write reconcile clears `grid` + `priceByCoord` synchronously | **preserved** (and its second-order Generate window now closed) | unchanged code; `reading` covers the window it opens, which the issue calls out as the reason the gate must be read-settled |
| Generate over an existing grid asks for confirmation (`layout-confirm-regen`) | **preserved** | `onGenerate()`'s `hasLayout()` branch is untouched; the new check sits **before** it |
| Generate on an empty venue generates immediately | **preserved** once the read has settled; **changed** while it is in flight | in flight the button is disabled — the state where "empty" is not yet known is no longer treated as known-empty (the defect) |
| `seedFrom()` early-returns on `hasLayout()` so a late read never clobbers in-progress work | **preserved** | untouched; with Generate fenced, the only way to reach that branch is a deliberate paint, which is still respected |
| `loadFailed` blocks Save (no token) and prompts a refresh | **preserved** | same signal, same `data-testid="layout-load-failed"`, same `role="alert"`; only its **position** moves (out of the bulk-only save row, up to the tab level) so it serves both modes |
| `loadFailed` renders only after Save is pressed | **changed** | it now renders as soon as the read fails — the operator learns the map is unavailable before spending work on a grid that cannot be saved. The Save-time path (`onSave()` with a null token) still sets it, so the old spec's assertion holds |
| A **failed** read leaves the per-set editor rendering a 1×1 empty grid + the no-sets copy | **changed** (editor not rendered) | that copy is the exact false claim #721 is about — an unknown map is not an empty one (D-2) |
| A **later** failed re-read (after a successful first read) keeps the editor on the last-known sets | **preserved** | the suppression is `loadFailed() && !mapLoaded()`, so only the never-loaded case replaces the editor |
| The venue switch resets every venue-scoped draft/flag and re-loads | **preserved**, extended | `resetForVenue()` also clears `mapLoaded`, so venue B never renders venue A's "loaded" verdict; the `epoch` guard keeps a superseded read from clearing the live read's `reading` flag |
| `reloadAfterStale()` re-seeds grid + token inside the response handler, keeping work on failure | **preserved** | untouched apart from marking `mapLoaded` on its success, so "a successful map read marks the map loaded" holds at every read site |
| `set-editor`'s `data-testid` is the surface handle for e2e/unit waits | **preserved** | the testid stays on the outer `<section>` in both branches |
| The canvas's `set-grid` / `set-grid-frame` testids identify the real map | **preserved** | the skeleton canvas uses its **own** testids (`set-skeleton-grid` / `set-skeleton-frame`), so nothing waiting on `set-grid` matches a skeleton |

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.
> Fill before phase 0; use the `grilling` skill if risks aren't yet visible.
> Categories that already matter in this project: concurrent reservation of the
> same set (invariant #2), Stripe webhook duplicate/out-of-order delivery (#8),
> payout double-accrual (#9), timezone/cutoff arithmetic (#4/#6), money rounding
> (#5), module boundary leaks (#11), per-venue authorization on any venue-scoped
> endpoint (an operator must only reach their own venue's data — BOLA; if the slice
> touches `/api/venues/{venueId}/**`, the payout ledger, staff bookings, or
> beach-map edit, state how ownership is verified in the application service), and
> any temptation toward JPA or Stripe Connect. A new/changed request DTO or error
> response → note the error-contract expectation (`riviera-java-conventions` §6b). A
> Flyway migration → claim `V<n>` only per the in-flight check in `riviera-sdlc`
> `references/issue-intake-gate.md` (free on `main` AND unclaimed by open PRs; name
> who renumbers).

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `[disabled]="reading()"` on Generate strands focus on `<body>` if the button is focused when a read starts (WCAG 2.4.3, the repo's most-repeated bug class — RV-FE-9) | low | high | enumerate the transitions: the mount and mode-toggle windows render the button **already** disabled (a disabled button is not focusable, so nothing to blur); the only mid-life flip to disabled is `onSetsChanged()`, which fires from `SetEditor` (bulk not rendered), and the in-place venue switch, which is activated from the console shell's own switcher and therefore holds focus itself. `[disabled]` — not `[appBusy]` — is the correct posture per `frontend/.claude/CLAUDE.md`'s decision table: this is a *state* gate ("the map is unknown"), not a write this button started, and its sibling `layout-save` already uses `[disabled]="!hasLayout()"` for the same kind of state | Claude | open |
| R-2 | The skeleton's `animate-pulse` never finishes, so a real-browser axe run that first awaits `getAnimations().finished` (the repo's rule for animated surfaces) would hang the e2e | med | med | do not run axe over the skeleton in Playwright; jsdom axe covers the in-flight structure (AC-9), and the e2e asserts geometry + gating only. Recorded here so a later slice does not "fix" the missing axe call into a hang | Claude | open |
| R-3 | Making `loaded` a **required** input breaks the three existing `SetEditor` spec files that call `setInput('sets', …)` and nothing else | high | low | deliberate: a defaulted `loaded = true` would silently re-open this bug for the next caller. All three render helpers take the flag (defaulting to `true` in the helper, not in the component) — `set-editor.spec.ts`, `set-editor.a11y.spec.ts` are the callers; `set-editor.contrast.spec.ts` renders nothing | Claude | open |
| R-4 | The skeleton canvas reuses `set-grid`/`set-grid-frame`, so an existing wait matches the skeleton and a spec asserts against placeholder tiles | med | med | distinct testids (`set-skeleton-grid`, `set-skeleton-frame`, `set-skeleton-tile`), and AC-2 asserts **no** skeleton element survives the read | Claude | open |
| R-5 | A superseded read's handler clears `reading`/sets `mapLoaded` for the venue that replaced it (the A→B→A case `epoch` exists for) | med | high | every new write in both handlers goes **after** the `this.epoch !== epoch` early return — never in a `finally`; the venue-switch spec (`#180`) is extended to assert the flags follow the live read | Claude | open |
| R-6 | Hoisting `layout-load-failed` out of the bulk save row regresses the existing "Save after a failed load" spec, or double-renders in sets mode | med | low | one element at tab level, both modes; the existing spec asserts presence after Save, which still holds (the notice is present from the failure on, and `onSave()` still sets the flag). AC-6 pins the both-modes render | Claude | open |
| R-7 | The skeleton's placeholder geometry (4 rows × 6 tiles, the generator's own default) differs from the venue's real map, so content jumps when the read lands | med | low | accepted and bounded: the skeleton uses the canvas's own `--riv-tile` sizing and row rhythm, so the *tile* geometry matches exactly; only the row/column **count** is a guess, which is what any skeleton of unknown-size data is. The rail chips carry grid letters, so the rail width is representative | Claude | open |
| R-8 | The plan's File-structure section drifts from the diff (CI-enforced since #533) | med | low | `node scripts/check-plan-file-structure.mjs --diff origin/main` run with the doc staged before every push | Claude | open |
| R-9 | In-flight collision with another branch | low | low | checked at intake: the only open PRs are 18 Dependabot bumps, none under `frontend/src/app/operator/**`; no Flyway migration in this slice, so no `V<n>` to claim | Claude | open |
| R-10 | The gate hides a *slow* read behind a pleasant animation, so a genuinely stuck read looks like a working one forever | low | med | the failure path is explicit (AC-6): an error settles the read and swaps the skeleton for the notice. A read that never settles at all is an HTTP-layer concern (no timeout is configured app-wide today) and is out of scope — recorded rather than silently accepted | Claude | open |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **D-1 (fork in the issue, settled at intake — AC-4 offers two arms).** #721's AC-4 accepts either
  "unavailable until the read settles" **or** "asks for the same destructive-regenerate
  confirmation". Taken: **unavailable**. The confirmation arm asks the operator to decide over a map
  they have not seen — and on a genuinely empty venue it would state "Regenerate replaces your
  current layout", which is false; worse, confirming still lands the destructive outcome the issue
  describes (`seedFrom()` early-returns, the token resolves, Save writes over the real layout).
  Disabling states exactly what is true: Generate acts only on a known map. — *Owner:* Claude ·
  *Resolves by:* phase 1
- **D-2 (gap in the issue, settled at intake — what a *failed* read renders on the per-set
  surface).** AC-6 says the skeleton must resolve into the existing `loadFailed` messaging, but that
  messaging lives inside the **bulk** branch of `layout-editor.html` today, and simply letting
  `loaded` settle on error would drop the per-set surface back onto "This venue has no sets yet" —
  the same false claim, one state later. So the notice is hoisted to tab level (both modes) and the
  per-set editor is not rendered while `loadFailed() && !mapLoaded()`. — *Owner:* Claude ·
  *Resolves by:* phase 2
- **D-3 (scope, held).** A read that *fails* leaves Generate ungated (no confirmation), because a
  failed read is settled. This is safe rather than an oversight: without the `setVersion` token
  `onSave()` cannot write at all, and the operator is now told the map could not be loaded before
  they paint anything. — *Owner:* Claude · *Resolves by:* phase 2
- **Assumption:** the skeleton belongs to `SetEditor` (which owns the shape it mirrors) rather than
  to `LayoutEditor` (which owns the read). Keeping the skeleton next to the real markup is what
  keeps the two in sync; the parent passes only the fact. — *Owner:* Claude · *Resolves by:* phase 0

## Availability & concurrency (invariant #2)

> **Mandatory if the feature touches `booking`, `availability`, or the beach map.**
> Otherwise write `N/A — does not affect availability` and say why. This is the
> highest-stakes section in the plan.

The slice touches beach-map **surfaces**, so this section is filled rather than waived — and it is
not empty in substance: the slice **removes** a path that could destroy layout state.

- **Write paths to `availability(set_id, booking_date)`:** **none added or changed.** Neither
  surface writes availability; the layout editor writes `set_position` through
  `PUT /api/venues/{id}/beach-map` and the U7 per-set endpoints, and this slice adds no request.
- **What it does change:** the bulk `PUT` can no longer be reached from a state where the tab
  believes an in-use venue is empty. `LAYOUT_IN_USE` already refuses the replace for any venue that
  has ever been booked or holds a claim, so no availability row was ever at risk — the loss was the
  operator's hand-built layout and (since #723/#725/#727) their hand-typed row names.
- **Uniqueness guarantee:** unchanged — `availability(set_id, booking_date)`'s unique constraint,
  owned by the `availability` module. Nothing here reaches it.
- **Concurrency strategy:** unchanged. The optimistic-concurrency token (`setVersion`) is untouched;
  the slice does not create, advance or bypass it. It removes the case where a *valid* token was
  paired with a grid that never reflected the server's layout.
- **Pool rule (invariant #3):** unchanged; the skeleton renders no pool and the gate reads none.
- **Cutoff rule (invariant #4):** unchanged; no sales path on either surface.
- **Pinning test:** AC-4 (Generate refused while unsettled) is the pinning test for the removed
  path; the existing bulk-save suite pins that the surviving path is unchanged.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` is in scope; no module, port or event is added,
moved or changed.

### Module ownership (§4a)

`N/A — frontend-only; no backend capability added or moved.` The frontend-side equivalent —
which folder each change belongs to — is `riviera-frontend`'s call and is answered in the Angular
section: both components already live in the `operator/` feature folder, and the skeleton stays
inside `set-editor.html` rather than being promoted to `shared/` (one consumer).

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, moved or formatted by the gate; the skeleton renders
no price chip (`priceLabel: null` on every placeholder row), and the loaded branch's existing
`formatMoney` chips are untouched.

## Angular — frontend surfaces touched

> **Mandatory if frontend is in scope. Backend-only: `N/A — backend-only`.** Load
> `angular-developer`.

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` | existing | standalone component | two new `signal`s (`reading`, `mapLoaded`) + one `computed` (`mapUnavailable`); written only after the `epoch` guard in each async handler | none |
| FE-2 | `operator/layout-editor.html` | existing | template | Generate's `[disabled]` + label branch; `layout-load-failed` hoisted to tab level; the per-set editor gated on `!mapUnavailable()` and bound `[loaded]` | none |
| FE-3 | `operator/set-editor.ts` | existing | standalone component | new `loaded = input.required<boolean>()`; two `readonly` constants for the placeholder geometry | none |
| FE-4 | `operator/set-editor.html` | existing | template | `@if (loaded())` around the existing two-column render; `@else` renders the skeleton (panel lines + a canvas of placeholder tiles) | none |

**Standards:** standalone components, `inject()`, `@if`/`@else`, `input()`/`output()` signal APIs,
`computed()` for derived state, no `ngClass`/`ngStyle`. The new input is `input.required<boolean>()`
on purpose (R-3): a defaulted "loaded" is how this bug reaches the next caller. The placeholder rows
are a plain `readonly` array, not a signal — they never change.

**Styling (`riviera-tailwind`):** utilities only; no `.scss` is created and neither component
carries legacy SCSS, so migrate-on-touch has nothing to migrate. The skeleton follows the
home-grid pattern exactly — `animate-pulse` + `motion-reduce:animate-none` on the pulsing element,
`bg-(--riv-card-track)` for every placeholder block (never a hardcoded grey), the whole tree
`aria-hidden="true"` with the meaning carried by an `sr-only` line inside an `aria-live="polite"`
wrapper. Tile geometry comes from the canvas's own `--riv-tile` custom property (inherited into the
projected row template), which is why the skeleton renders **through** `app-beach-map-canvas`
instead of re-declaring the tile size.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or query parameter is added or altered; the slice
changes only what the tab renders between issuing today's `GET /api/venues/{id}` and receiving it.

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation. After a compaction, in a fresh
> session, or whenever unsure: re-read it (plus the current stage's `riviera-sdlc`
> reference file) before acting. Update it in the SAME commit window as the change it
> records — the same commit or the immediately-following one, nothing unrelated between;
> covers every plan-doc update incl. *Skills consulted* — at every phase boundary and
> SDLC stage transition (why: `riviera-sdlc` §Context hygiene).
>
> **Finalize BEFORE the merge, in the PR's own last commit** — stage pointer DONE, phase
> rows ✅ with commits, Open Questions empty, risk rows closed, AC pin-names matching the
> shipped tests. Record **`merged via PR #NN`, never a merge SHA** (case history + details:
> `riviera-sdlc` `references/pr-gates.md` §3 step 4).

**Stage pointer:** `implement` — phases 0–3 shipped; draft **PR #731** open, CI running per push.

**Next action:** phase 4 close-out — mark the PR ready for review, then the review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Per-set load gate + skeleton (unit + a11y) | ✅ | `664b19c` |
| 1 — Generate gated on the read settling | ✅ | `b4d299b` |
| 2 — Failed-read path on both surfaces | ✅ | `45acf63` |
| 3 — Mocked Playwright e2e (held GET) | ✅ | (this commit) |
| 4 — Close-out (gates, docs freshness, final plan state) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

> Map files to be created/modified before defining tasks.
>
> **Every path in the diff, including the one-line ones — and this is machine-checked.** Listing
> only the interesting files was a review finding on five consecutive slices (#438, #522, #524,
> #525, #526), and the paths that fall out are always the same shape: a registry entry, a
> comment-only freshness fix, a docs-sweep file. Since #533 CI fails the PR on any path the diff
> changed and this section does not list. Run it yourself before pushing — it is the check, not a
> reminder to do the check by hand:
>
> ```bash
> node scripts/check-plan-file-structure.mjs --diff origin/main
> ```
>
> Since #654 it judges untracked paths as well as the diff, so a file you have written but not
> staged is caught too. **Stage or commit this plan doc first** — `git add` is what marks it as part
> of the change, and with the doc merely written the guard short-circuits and passes whatever the
> section says. A file you never intend to commit belongs behind an ignore rule (`.git/info/exclude`
> for a personal scratch path, `.gitignore` repo-wide).
>
> The guard reads paths written any way real plans write them — repo-relative
> (`payout/application/DailyTakingsServiceTest.java`), sibling extensions
> (`` `privacy-policy.ts` `` then `` `.html` ``), brace sets, `a.ts|.html`, a bare directory, and
> globs (`frontend/src/app/**/*.contrast.spec.ts`) — so a large mechanical sweep is one honest
> entry rather than fifty. It never flags the reverse (a path you listed and did not need), and it
> exempts the plan doc itself and lockfiles. A slice with no plan doc is not checked at all.

- `docs/plans/layout-tab-load-gate.md` — this plan (exempt from the guard, listed for the reader)
- `frontend/src/app/operator/set-editor.ts` — the `loaded` input + the placeholder geometry
- `frontend/src/app/operator/set-editor.html` — the `@if (loaded())` gate + the skeleton branch
- `frontend/src/app/operator/set-editor.spec.ts` — AC-1, AC-2, AC-3, AC-7, AC-8
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — AC-9 (in-flight axe)
- `frontend/src/app/operator/layout-editor.ts` — `reading`, `mapLoaded`, `mapUnavailable`, the
  Generate gate
- `frontend/src/app/operator/layout-editor.html` — the disabled Generate + hoisted failure notice +
  the `[loaded]` binding
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-4, AC-5, AC-6
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — AC-9 (failed-read axe)
- `frontend/e2e/layout-editor.e2e.ts` — AC-10

---

## Phase 0 — Per-set load gate + skeleton

**Files:** Modify `frontend/src/app/operator/set-editor.ts`,
`frontend/src/app/operator/set-editor.html`, `frontend/src/app/operator/layout-editor.ts`,
`frontend/src/app/operator/layout-editor.html` · Test
`frontend/src/app/operator/set-editor.spec.ts`,
`frontend/src/app/operator/set-editor.a11y.spec.ts`

- [x] **Step 1: Write the failing tests** — one at a time: AC-1 (`render([], false)` → skeleton
      tiles present, `set-cell` absent, `set-panel-no-sets` absent), then AC-2 (flip both inputs →
      real cells, no skeleton), then AC-7 + AC-8 (the decorative contract), then AC-3's
      no-skeleton extension, then AC-9's set-editor half in the a11y spec.
- [x] **Step 2: Run them, verify they fail** —
      `ng test --include="src/app/operator/set-editor*.spec.ts"` → **30 + 7 failed**, every one on
      `NG0303: Can't set value of the 'loaded' input` (the gate does not exist yet).
- [x] **Step 3: Minimal implementation** — `loaded = input.required<boolean>()`; `@if (loaded())`
      around the existing two-column grid; the `@else` skeleton (aria-live wrapper + `sr-only`
      line + aria-hidden tree; panel placeholder lines; `app-beach-map-canvas` with its own
      testids and placeholder rows). In `LayoutEditor`: the `mapLoaded` signal (set after the
      epoch guard in `loadExisting`'s success and in `reloadAfterStale`'s success; cleared in
      `resetForVenue`) and the `[loaded]="mapLoaded()"` binding.
- [x] **Step 4: Run them, verify they pass** — 37/37 across the two `set-editor*` spec files;
      end-of-phase regression `--include="src/app/operator/*.spec.ts"` → **430 passed**. Lint,
      Prettier, `check-touch-target.mjs` and `check-inline-comments.mjs` all clean.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-0 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window; open the **draft PR**
      immediately after this first phase commit (CI fires on the `pull_request` event only).

---

## Phase 1 — Generate gated on the read settling

**Files:** Modify `frontend/src/app/operator/layout-editor.ts`,
`frontend/src/app/operator/layout-editor.html` · Test
`frontend/src/app/operator/layout-editor.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-4 on both windows (mount: the GET left pending;
      reconcile: a real per-set save through the child, its re-read left pending), asserting the
      button is `disabled` and that clicking it produces neither a grid nor a PUT; AC-5's two
      no-regression arms; plus the R-5 venue-switch assertion (a superseded read does not un-gate
      the live one).
- [x] **Step 2: Run them, verify they fail** —
      `ng test --include="src/app/operator/layout-editor.spec.ts"` → **3 failed / 49 passed**, each
      on `expected false to be true` for `generate.disabled`.
- [x] **Step 3: Minimal implementation** — the `reading` signal (set true in `loadExisting`,
      cleared after the epoch guard in **both** handlers), the `onGenerate()` early return, the
      `[disabled]="reading()"` binding and the button's loading label.
- [x] **Step 4: Run them, verify they pass** — `--include="src/app/operator/*.spec.ts"` → **433
      passed**; `check-focus-posture.mjs --diff origin/main` and `check-touch-target.mjs` clean.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-1 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Failed-read path on both surfaces

**Files:** Modify `frontend/src/app/operator/layout-editor.ts`,
`frontend/src/app/operator/layout-editor.html` · Test
`frontend/src/app/operator/layout-editor.spec.ts`,
`frontend/src/app/operator/layout-editor.a11y.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-6 (failed initial read → `layout-load-failed`
      present in bulk **and** after switching to Edit sets; `set-editor` not rendered; no skeleton
      pulsing on), the later-failed-re-read parity row (editor kept), and AC-9's axe case.
- [x] **Step 2: Run them, verify they fail** — **2 failed / 58 passed**, both `expected null to be
      truthy` on `layout-load-failed` in Edit-sets mode. The a11y case passed on write: the bulk
      half already rendered the notice, which is exactly why the gap was mode-shaped.
- [x] **Step 3: Minimal implementation** — `mapUnavailable` computed; the notice hoisted above the
      mode branch with mode-neutral copy; `<app-set-editor>` gated on `!mapUnavailable()`.
- [x] **Step 4: Run them, verify they pass** — `--include="src/app/operator/*.spec.ts"` → **436
      passed**, including the untouched "Save after a failed load" spec (R-6). The ink is unmoved
      (`#a3160e` on the same porcelain page ground), so `layout-editor.contrast.spec.ts`'s existing
      "save error … over every porcelain stop" row still covers it — no contrast row needed.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-2 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Mocked Playwright e2e (held GET)

**Files:** Modify `frontend/e2e/layout-editor.e2e.ts`

- [x] **Step 1: Write the spec** — AC-10: sign in with the venue GET served (so the shell renders),
      go to Daily view, *then* park the next venue GET and return to Beach map to force a fresh tab
      mount, assert Generate disabled + its loading label + the Edit-sets skeleton, release the
      read, assert the real tiles and that Generate is enabled and confirms over the seeded layout.
      No axe run over the skeleton (R-2). The hold is a `mapGate` promise the route handler awaits.
- [x] **Step 2: Run it, verify it fails on `main`'s templates** —
      `git checkout origin/main -- layout-editor.{html,ts} set-editor.{html,ts}` →
      `-g "#721"` → **1 failed**: `expect(locator).toBeDisabled() — unexpected value "enabled"`,
      i.e. the in-flight Generate this issue reports. Restored with `git checkout HEAD -- …`.
- [x] **Step 3:** no implementation — phases 0–2 shipped it; this phase proves it in a real browser.
- [x] **Step 4: Run it, verify it passes** — `-g "#721"` → 1 passed; the three affected files
      (`layout-editor`, `operator-set-editing`, `operator-daily`) → **23 passed**.
- [x] **Step 5: Generalization-audit pass** — see the log's phase-3 row.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Close-out

- [ ] **Step 1: Review gate** — PR marked ready for review; `/code-review` via the
      `references/pr-gates.md` §1 ladder, plus the `riviera-review-overlay` FE bank on top.
- [ ] **Step 2: Sonar gate** — pull the reported new-issue + duplication list from the API (not the
      badge) and clear every entry.
- [ ] **Step 3: `riviera-docs-freshness`** over `origin/main..HEAD`.
- [ ] **Step 4:** finalize this Execution status in the PR's own last commit, citing
      **merged via PR #NN**.
- [ ] **Step 5:** merge + close-out checklist per §3.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | phase 3 | **Mechanism:** every **surface that renders a loading state**, and whether any spec in the mocked browser suite ever *reaches* it — the suite's mocks all resolve instantly, so an in-flight render can be invisible to it by construction. Enumerated from the loading states themselves (their testids), then cross-cut against the whole e2e suite | `grep -rno 'data-testid="[a-z-]*loading[a-z-]*"' src/app --include=*.html --include=*.ts \| sort -u` (12 surfaces), then each id searched across `e2e/*.e2e.ts` | 12 loading states — home's skeleton grid, `my-bookings` (×2), six admin tabs, `operator-home`, `payouts-tab`, `requests-tab`. **None** is asserted by any mocked e2e; `set-loading`, added here, is the first | **Left, with the finding recorded.** Each of the twelve is unit-covered in jsdom (e.g. `home.spec.ts`'s skeleton assertions), so this is coverage *depth*, not a defect, and widening it is not this slice's scope. What the slice does leave behind is the technique — a `mapGate` promise the route handler awaits — for the next spec that needs one |
| 2026-08-21 | phase 2 | **Mechanism:** every **notice whose signal is set by mode-independent code but which renders inside ONE arm of an in-component surface switch** — so half the surfaces it describes never show it. Enumerated from the switches (a component holding a mode signal and branching its template on it), not from "error messages that look misplaced" | `grep -rn "signal<'\|= signal<[A-Za-z]*Mode\|Mode>(" src/app --include=*.ts` (mode-holding components) cross-cut with `grep -rc 'role="alert"' src/app/**/*.html`, then each switch's arms read for a notice | 3 in-component surface switches: `layout-editor` (`mode()` bulk/sets — the defect: `layout-load-failed` lived in the bulk arm while `loadFailed` is set by the shared read), `auth-page` (`mode()` signin/register — `auth-error` is a form-level sibling of the register-only hint, so it renders in both), `booking-dialog` (`mode()` INSTANT/REQUEST — `dialog-error` sits at panel level, outside both arms). Every other console surface is a **route** tab with one arm, where the shape cannot occur | **One fix, two judged and left.** Both survivors already place the notice outside the arms, which is the fix applied here |
| 2026-08-21 | phase 1 | **Mechanism:** every **destructive or irreversible action whose confirmation is conditional on fetched state** — the shape where "there is nothing to lose" and "we have not looked yet" are the same value. Enumerated from the confirm machinery itself (who sets a confirm flag, and under what condition) rather than from "editors with a Generate button" | `grep -rln "app-confirm-panel" src/app --include=*.html` (2 surfaces) + `grep -rn "confirm[A-Za-z]*\.set(true)" src/app --include=*.ts -B 3` (5 sites, with their guards), cross-checked against `grep -rn "length === 0" src/app --include=*.ts` for write guards reading a collection | 5 confirm sites. **Exactly one is conditional:** `layout-editor.onGenerate()`'s `if (hasLayout())` — the defect. The other four are unconditional (`set-editor`'s remove, `booking-view`'s cancel and withdraw, `set-password`'s), and each is reachable only from an already-loaded subject (`@if (booking(); as b)`, a selected set). `onSave()`'s `sets.length === 0` reads the **painted grid**, not a read, and is fenced again by the null `setVersion` token | **One fix, four judged and left.** The conditional-confirm shape exists once in this app, and it is the one this issue reports |
| 2026-08-21 | phase 0 | **Mechanism:** every surface that renders a **fetched collection's emptiness as a fact** — either it takes the collection as a required input from a parent that may still be reading, or it seeds its own list signal with `[]` and branches on `.length`. Enumerated from the two syntactic shapes that create the state, not from "editors that look like this one" | `grep -rn "input.required<readonly" src/app --include=*.ts` (5) + `grep -rln "signal<readonly [A-Za-z]*\[\]>(\[\])\|signal<[A-Za-z]*\[\]>(\[\])" src/app --include=*.ts` (12), then read each surface's emptiness branch for a settled flag | 16 sites. **Inputs:** `set-editor` (the defect); `payout-statement` — its parent gates the whole tab on `@if (!loaded())`; `photo-slideshow` — both callers bind from an already-loaded object (`@if (venue(); as v)` / a loaded card); `segmented-control` — static config, never fetched; `beach-map-canvas` — a presentational primitive whose consumers own the question. **Own-read surfaces:** 11 of 11 already distinguish unread from empty — 10 via a `loaded`/`loading` signal, `admin-mail-delivery` via `searched() && bookings().length === 0` | **One fix, fifteen judged and left.** The population's defect rate is 1/16, and the one hit is the surface whose settled flag lives in a *different component* — which is exactly why it was the one to go missing |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1 / AC-2 / AC-3 / AC-7 / AC-8:** `npm test -- set-editor` → the in-flight, resolved and
      set-less renders pass.
- [ ] **AC-4 / AC-5 / AC-6:** `npm test -- layout-editor` → the Generate gate and the failed-read
      path pass.
- [x] **AC-9:** `npm test -- set-editor.a11y layout-editor.a11y` → axe clean on both new states.
- [x] **AC-10:** `npm run test:e2e:a11y -- layout-editor` → passes.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced — no backend file in the diff at all (invariant #1).
- [ ] **Availability** section filled — no write path added or changed; the slice removes a way to
      overwrite `set_position`, and touches no availability row (invariant #2).
- [ ] Pool + cutoff rules honored — the skeleton renders neither (invariants #3, #4).
- [ ] **Modulith** section `N/A — frontend-only`; its FE mirror checked instead — RV-FE-8's grep
      still returns the frozen five cross-feature edges (invariant #11).
- [ ] **Payment/payout** `N/A — no payment in scope` (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: the slice renders no date; the read's `todayBookingDate(new Date())` argument is
      untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change, so no migration and no `V<n>` claimed (invariant #12).
- [ ] **Frontend** standards met — no `as any`, signal APIs, native control flow.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register: every row closed with an outcome. Open Questions: all resolved.
- [ ] **Close-out written in THIS PR** — the final state committed here as **merged via PR #NN**.
- [ ] **The review gate ran in full** — `/code-review` plus the `riviera-review-overlay` FE bank.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
