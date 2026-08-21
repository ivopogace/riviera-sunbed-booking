# Discover cutoff note — one rule, one voice, one clock Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover's cutoff note states the 6 PM evening-before rule in the beach map's
positive voice behind the same `aria-hidden` SVG clock, with that clock existing exactly
once in the source and consumed by both surfaces.

**Architecture:** The single significant decision is the **shape of the icon seam**: a
shared standalone **component** (`shared/clock-icon.ts`) with an inline template, not the
attribute directive every neighbouring `shared/` glyph primitive uses — a directive can only
add classes and attributes to an element that already exists, so it cannot carry the circle
and path geometry. The host is `display: contents` so the SVG stays the direct flex child of
each note and neither call site's existing `gap-1`/`shrink-0` layout moves.

**Persistence:** N/A — frontend-only, no tables and no migrations.

**Source of intent:** GitHub issue #733 (with the icon-seam research recorded in its body);
predecessor #703 / PR #732 and its plan doc `docs/plans/beach-map-mode-aware-copy.md` (Q-1).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — pulled
`playwright-cli` and `riviera-tailwind` in on top of the ticket's own list, and its
right-size rule is why this slice gets a plan doc at all) · `riviera-plan-doc` (this
template — forced the behavior-parity ledger that caught the dropped `&ngsp;` and the
`cutoff-icon` marker class) · `tdd` (each phase writes the failing spec first; the
`clock-icon.spec.ts` host-merge case was written before the component existed) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(**ran** over `9a45a4a..HEAD` at close-out — the icon § this slice owes
`riviera-tailwind` per issue #733 §5 is the finding it exists to catch) ·
`riviera-frontend` (**decided the folder**: `shared/` is the only stratum both `pages/home/`
and `venue/` may import from, so the seam lands there and creates no cross-feature edge) ·
`riviera-tailwind` (rule 1 — a reused *element* is a component, never `@apply`; and the
no-drift rule, which is why the map's SVG attributes move over byte-identical) ·
`angular-developer` + angular-cli MCP (v22: `search_documentation` for `svg icon component
template` returns **0 results** — re-confirmed this session, there is no framework icon
mechanism to reach for) · `playwright-cli` (the mocked-suite assertion at
`discovery-flow.e2e.ts:212`; no new spec — the surface is already covered in every state,
including the load-failure panel) · `riviera-local-debug` (cloud-session recipe:
`PW_CHROMIUM_EXECUTABLE` for the mocked e2e, scoped vitest first)

**Branch:** `claude/issue-733-implementation-n9fgba` — the cloud session's designated remote
branch stands in for `feature/discover-cutoff-note-parity` (`riviera-sdlc` §Remote/cloud
session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given Discover has loaded, when the cutoff note renders, then its text is
  "Book any day from tomorrow — each day's sales close at 6 PM the evening before." and
  contains neither the retired "book by 6 PM the day before" clause nor "Today isn't
  available". *Pinned by:* `home.spec.ts` › `states the cutoff as an invitation, iconed by an aria-hidden SVG (no emoji)`
- [ ] **AC-2:** Given Discover has loaded, when the cutoff note renders, then it contains no
  `⏰` character and its leading glyph is an `<svg aria-hidden="true">`, so the note's
  `textContent` is the sentence alone. *Pinned by:* the same `home.spec.ts` case
- [ ] **AC-3:** Given the shared `<app-clock-icon />`, when it renders, then the host is
  `aria-hidden="true"` **and** the inner `<svg>` is `aria-hidden="true"`, and the host's
  static `contents` class merges with (rather than replaces) a class written at the call
  site. *Pinned by:* `clock-icon.spec.ts`
- [ ] **AC-4:** Given the whole frontend source tree, when swept for `<svg` in `.html`/`.ts`,
  then exactly one hit remains — `shared/clock-icon.ts`. *Pinned by:* AC-verification
  command `grep -rnF '<svg' frontend/src --include=\*.html --include=\*.ts`
- [ ] **AC-5:** Given the beach map's cutoff note, when it renders after adopting the shared
  component, then its copy, its `<svg aria-hidden>` and the date input's `min` are unchanged.
  *Pinned by:* the pre-existing `venue-map.spec.ts` › `states the cutoff as an invitation, iconed by an aria-hidden SVG (no emoji)` (edited: no)
- [ ] **AC-6:** Given the mocked e2e suite, when Discover renders in its list, empty and
  load-failure states, then the cutoff note matches the new copy and axe reports no serious
  violations. *Pinned by:* `discovery-flow.e2e.ts` + `expectNoSeriousAxeViolations`
- [ ] **AC-7:** Given the contrast specs, when run, then `--riv-card-ink-soft` on the card
  glass (Discover) and `--riv-ink-faint` on the header glass (map) both still pass AA.
  *Pinned by:* `home.contrast.spec.ts`, `venue-map.contrast.spec.ts` (both unedited)

## Non-goals

- **The third ⏰** — `operator/requests-tab.html`'s urgent time-left chip. It means *urgency*,
  not the cutoff rule; out of population despite matching the glyph (#733 Context, and the
  same call #703's generalization audit already made).
- **A general icon set / icon registry.** One glyph, two call sites. No `input()` for size or
  colour: `stroke: currentcolor` and the cascade already give each call site full control.
- **The esbuild `with { loader: 'text' }` SVG import** — rejected in #733 §1 (needs
  `innerHTML`, loses per-call-site sizing, a build-config change for one glyph).
- **Any change to date fencing** — the earliest-bookable-date clamp, the `min` attribute and
  the server-side cutoff are untouched. This slice is copy + glyph only.
- **Re-wording the map.** #703 shipped its sentence three commits ago; Discover adopts it.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Discover: ⏰ emoji glyph, `aria-hidden`, `text-[15px] leading-none` | **changed** | inline SVG via `<app-clock-icon class="[&>svg]:size-[15px]" />` — same 15 px optical size, now platform-independent |
| Discover: `&ngsp;` between glyph and copy | **dropped** | the note is `inline-flex`, so a whitespace-only run between flex items is not rendered as an item anyway; the parent's `gap-1` is the real spacing, exactly as on the map. Dropping it is what makes the note's `textContent` the sentence alone (AC-2) |
| Discover: `.cutoff-icon` marker class | **dropped** | swept `frontend/src frontend/e2e` — no spec queries it (unlike `.cutoff-note`, which is retained). `riviera-tailwind` rule 2 only protects classes a test queries |
| Discover: `.cutoff-note` marker class + `appCardGlass` glass pill, radius, padding, `--riv-card-ink-soft` ink, backdrop filters | **preserved** | untouched in `home.html`; #733 explicitly keeps the glass pill — only copy and glyph change |
| Discover: note renders in list, empty **and** load-failure states | **preserved** | it is a sibling of the results region, not inside it; `discovery-flow.e2e.ts` asserts it in the failure state |
| Map: inline `<svg>` with `width/height/viewBox/fill/stroke/stroke-width/stroke-linecap` + `class="shrink-0"` | **preserved** | the same attributes move verbatim into `clock-icon.ts`; `display: contents` on the host keeps the SVG the direct flex child, so `gap-1`/`shrink-0` still apply and the rendered box is byte-identical |
| Map: `note.querySelector('svg')` is `aria-hidden="true"` | **preserved** | `aria-hidden` stays on the **inner SVG**, not only on the host — moving it to the host alone would turn `venue-map.spec.ts:661` red for no behavioural gain (#733 §4 gotcha) |
| Map: cutoff copy, date `min`, header-glass ink | **preserved** | untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `display: contents` on the host changes the map's flex layout, so the glyph shifts or stops shrinking | low | med | the SVG stays the direct flex child, so `gap-1` and its own `shrink-0` still apply; `contents` verified to compile to `display: contents` against this repo's `tailwindcss@4.3.3` | claude | open |
| R-2 | Tailwind never generates the component's utilities because they live in an inline `.ts` template | low | high | `src/tailwind.css` is `@import 'tailwindcss'` with no `source(none)`, so auto source detection scans `.ts`; the `shared/retry-button.ts` precedent already ships utilities from an inline template | claude | open |
| R-3 | The call-site override loses to the component's own size, so Discover's glyph silently drops 15 px → 13 px | med | low | the component sizes via **presentation attributes** (`width="13"`), which lose to *every* CSS rule — so a call-site class wins unconditionally, with no specificity arithmetic to get wrong | claude | open |
| R-4 | The host's static `class: 'contents'` replaces the call site's class (or vice versa), silently dropping one | low | med | Angular merges host metadata classes with the template's static class; pinned by a `clock-icon.spec.ts` case rather than assumed | claude | open |
| R-5 | An SVG at the root of an **inline** template is parsed in the HTML namespace, so `<circle>`/`<path>` never paint | low | high | pinned by `clock-icon.spec.ts` asserting `namespaceURI`; the map's rendered output re-checked by `venue-map.spec.ts` | claude | open |
| R-6 | The e2e regex is updated but the suite is never run in this cloud session, so a copy typo ships | med | med | run the mocked suite with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` per `riviera-local-debug`; CI runs it again | claude | open |

## Open questions / Assumptions

- **Assumption:** Discover keeps the map's sentence **verbatim** rather than adapting it to
  read about *beaches*. #733 offers the adaptation ("the sentence may want to read about
  beaches rather than a single map") but does not require it. — *Owner:* claude · *Resolves
  by:* phase 1

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No `availability(set_id, booking_date)` row is read or
written, and no reservation path is touched. Invariant #4 appears only as **display copy**:
both notes describe the 6 PM `Europe/Tirane` cutoff, and both keep the existing HTML comment
stating that the server is authoritative. The date fencing itself (the `min` attribute from
`defaultBookingDate`, and the server-side close) is explicitly a non-goal.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/clock-icon.ts` | new | standalone component, inline template | none — pure presentational, zero API surface | none |
| FE-2 | `pages/home/home.html` + `home.ts` | existing | standalone component | unchanged | unchanged |
| FE-3 | `venue/venue-map.html` + `venue-map.ts` | existing | standalone component | unchanged | unchanged |

**Standards:** standalone (no `standalone: true`), no explicit `OnPush` (v22 default), host
bindings in the `host` object (never `@HostBinding`), Tailwind utilities for all styling. No
`input()`/`output()`/signals — the component has deliberately no API surface.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or client typing is touched.

## Execution status

**Stage pointer:** `plan — complete, entering implement (phase 0)`

**Next action:** Phase 0 — write `clock-icon.spec.ts` red, then create `shared/clock-icon.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the shared clock-icon seam | | |
| 1 — adopt it on both notes + reframe Discover's copy | | |
| 2 — e2e assertion + the `riviera-tailwind` icon § | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/discover-cutoff-note-parity.md` — this plan
- `frontend/src/app/shared/clock-icon.ts` — the shared glyph component (new)
- `frontend/src/app/shared/clock-icon.spec.ts` — its unit spec (new)
- `frontend/src/app/pages/home/home.ts|.html` — Discover adopts the component + the reframed copy
- `frontend/src/app/pages/home/home.spec.ts` — the cutoff case rewritten to the new copy
- `frontend/src/app/venue/venue-map.ts|.html` — the map's inline SVG replaced by the component
- `frontend/e2e/discovery-flow.e2e.ts` — the retired `book by 6 PM the day before` assertion
- `.claude/skills/riviera-tailwind/SKILL.md` — the icon § this slice's precedent owes it (#733 §5)

---

## Phase 0 — The shared clock-icon seam

**Files:** Create `frontend/src/app/shared/clock-icon.ts` · Test `frontend/src/app/shared/clock-icon.spec.ts`

- [ ] **Step 1–4:** spec first (host + inner `aria-hidden`, SVG namespace, class merge), then
  the component; `npx vitest run src/app/shared/clock-icon.spec.ts`.

## Phase 1 — Both notes adopt it; Discover's copy is reframed

**Files:** Modify `venue-map.html|.ts`, `home.html|.ts` · Test `home.spec.ts`, `venue-map.spec.ts`

- [ ] **Step 1–4:** rewrite `home.spec.ts`'s cutoff case red, then swap both templates;
  `npx vitest run src/app/pages/home src/app/venue/venue-map.spec.ts`.
- [ ] **Step 5:** Generalization-audit pass — sweep by mechanism, not resemblance.

## Phase 2 — e2e + the docs gap the precedent creates

**Files:** Modify `discovery-flow.e2e.ts`, `.claude/skills/riviera-tailwind/SKILL.md`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-2:** `npx vitest run src/app/pages/home` → the cutoff case passes.
- [ ] **AC-3:** `npx vitest run src/app/shared/clock-icon.spec.ts` → passes.
- [ ] **AC-4:** `grep -rnF '<svg' frontend/src --include=\*.html --include=\*.ts` → one hit.
- [ ] **AC-5:** `npx vitest run src/app/venue/venue-map.spec.ts` → passes, unedited.
- [ ] **AC-6:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → green.
- [ ] **AC-7:** `npm run test:a11y` → green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #4 appears as display copy only.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — no fencing behavior changed.
- [ ] **Modulith** section filled (N/A — frontend-only).
- [ ] **Payment/payout** section filled (N/A).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — the `Europe/Tirane` clamp is untouched.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met; no `as any`; folder placement per `riviera-frontend`.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full.**
