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
`riviera-review-overlay` (review gate — **ran** on PR #734 at ready-for-review; its bank rode on top of the `code-review` plugin workflow, 10 findings, register below) · `riviera-docs-freshness`
(**ran** over `9a45a4a..HEAD` — 3 findings, all patched here: the icon § `riviera-tailwind`
owed per #733 §5, and two now-false present-tense claims in #703's shipped plan doc, whose
Non-goals still read "still ⏰ …" and "One call site". Swept `CLAUDE.md`, `CONTEXT.md`,
`RESPONSIBILITIES.md`, `docs/adr/`, `docs/architecture/` and the `riviera-*` skills for the
old copy, the emoji and the SVG-inlining claim — no other doc states them;
`domain-model.md:125` states the cutoff *rule*, which this slice does not change) ·
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

- [x] **AC-1:** Given Discover has loaded, when the cutoff note renders, then its text is
  "Book any day from tomorrow — each day's sales close at 6 PM the evening before." and
  contains neither the retired "book by 6 PM the day before" clause nor "Today isn't
  available". *Pinned by:* `home.spec.ts` › `states the cutoff as an invitation, iconed by an aria-hidden SVG (no emoji)`
- [x] **AC-2:** Given Discover has loaded, when the cutoff note renders, then it contains no
  `⏰` character and its leading glyph is an `<svg aria-hidden="true">`, so the note's
  `textContent` is the sentence alone. *Pinned by:* the same `home.spec.ts` case
- [x] **AC-3:** Given the shared `<app-clock-icon />`, when it renders, then the host is
  `aria-hidden="true"` **and** the inner `<svg>` is `aria-hidden="true"`, and the host's
  static `contents` class merges with (rather than replaces) a class written at the call
  site. *Pinned by:* `clock-icon.spec.ts`
- [x] **AC-4:** Given the whole frontend source tree, when swept for `<svg` in `.html`/`.ts`,
  then exactly one hit remains — `shared/clock-icon.ts`. *Pinned by:* AC-verification
  command `grep -rnF '<svg' frontend/src --include=\*.html --include=\*.ts`
- [x] **AC-5:** Given the beach map's cutoff note, when it renders after adopting the shared
  component, then its copy, its `<svg aria-hidden>` and the date input's `min` are unchanged.
  *Pinned by:* the pre-existing `venue-map.spec.ts` › `states the cutoff as an invitation, iconed by an aria-hidden SVG (no emoji)` (edited: no)
- [x] **AC-6:** Given the mocked e2e suite, when Discover renders in its list, empty and
  load-failure states, then the cutoff note matches the new copy and axe reports no serious
  violations. *Pinned by:* `discovery-flow.e2e.ts` + `expectNoSeriousAxeViolations`
- [x] **AC-7:** Given the contrast specs, when run, then `--riv-card-ink-soft` on the card
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
| R-1 | `display: contents` on the host changes the map's flex layout, so the glyph shifts or stops shrinking | low | med | the SVG stays the direct flex child, so `gap-1` and its own `shrink-0` still apply; `contents` verified to compile to `display: contents` against this repo's `tailwindcss@4.3.3` | claude | **closed** `f8ef9aa` — measured in a real browser: host `display` is `contents` on both surfaces and the svg is still the note's direct flex child |
| R-2 | Tailwind never generates the component's utilities because they live in an inline `.ts` template | low | high | `src/tailwind.css` is `@import 'tailwindcss'` with no `source(none)`, so auto source detection scans `.ts`; the `shared/retry-button.ts` precedent already ships utilities from an inline template | claude | **closed** `f8ef9aa` — `shrink-0` and the call-site `[&>svg]:size-[15px]` both resolve in the rendered page |
| R-3 | The call-site override loses to the component's own size, so Discover's glyph silently drops 15 px → 13 px | med | low | the component sizes via **presentation attributes** (`width="13"`), which lose to *every* CSS rule — so a call-site class wins unconditionally, with no specificity arithmetic to get wrong | claude | **closed** `f8ef9aa` — computed `width`/`height` measure 15 px on Discover and 13 px on the map, and each stroke resolves to exactly its note's ink |
| R-4 | The host's static `class: 'contents'` replaces the call site's class (or vice versa), silently dropping one | low | med | Angular merges host metadata classes with the template's static class; pinned by a `clock-icon.spec.ts` case rather than assumed | claude | **closed** `404f3b6` — the merge case passes, and the browser measurement confirms both classes act |
| R-5 | An SVG at the root of an **inline** template is parsed in the HTML namespace, so `<circle>`/`<path>` never paint | low | high | pinned by `clock-icon.spec.ts` asserting `namespaceURI`; the map's rendered output re-checked by `venue-map.spec.ts` | claude | **closed** `404f3b6` — svg, circle and path all report the SVG namespace |
| R-6 | The e2e regex is updated but the suite is never run in this cloud session, so a copy typo ships | med | med | run the mocked suite with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` per `riviera-local-debug`; CI runs it again | claude | **closed** — the full mocked suite ran green locally (232 passed); CI re-ran it green on `79ae097` |
| R-7 | *(added at the review gate)* Discover's 15 px override is pinned by no executable test, so it regresses to 13 px silently — jsdom computes no Tailwind and the probe that proved it was deleted | med | med | measure the rendered box in the mocked e2e (`toHaveCSS`), and **falsify the pin** rather than trusting it | claude | **closed** `79ae097` — removing the class turns it red (13 px vs 15 px expected); the descendant `[&_svg]` also removes the wrap-the-root failure mode |

## Open questions / Assumptions

*(empty — the one assumption is resolved below.)*

### Resolved

- **A-1 (assumption → resolved at phase 1, `f8ef9aa`):** should Discover adapt the map's
  sentence to read about *beaches*? **No — verbatim.** #733 offers the adaptation but does not
  require it, and the map's sentence never names a map: "Book any day from tomorrow — each
  day's sales close at 6 PM the evening before." is already surface-neutral, and it sits
  directly under Discover's date picker, which is exactly what it talks about. The candidate
  adaptation ("book any *beach* from tomorrow") also conflates the two axes — you book a
  sunbed set on a date, not a beach. Re-diverging the wording is the thing this slice exists
  to fix, so the strongest reading of "one rule, one voice" is the identical sentence.

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

**Stage pointer:** `DONE — merged via PR #734`

**Next action:** none — all three gates cleared on the final head `79ae097`. Post-merge, only the
two GitHub-only items remain: nothing to tick (no parent epic), and the deferred findings are
already written onto **#735** / **#736**.

**Gate record (final head `79ae097`):**

- **CI:** green — `Backend (build + test)`, `Frontend (lint + test + build)`, `Repo hygiene
  (diff-scoped)`, `CodeQL`, both `Analyze` jobs, all `success`.
- **Review gate:** ran via the `code-review` plugin workflow (invocation ladder rung 1) with
  `riviera-review-overlay` layered on. 10 findings, **no functional defect**; 8 fixed in
  `79ae097`, 2 deferred to #735 / #736. Register below.
- **Sonar gate:** `SonarCloud Code Analysis` = `success`, and the **reported list pulled from the
  API, not just the gate conclusion**: 0 issues, 0 security hotspots, 0 new bugs / vulnerabilities
  / code smells, **100.0%** coverage on new code (bar ≥80%), **0.0%** duplication and **0**
  duplicated blocks. The false-clean read was ruled out per `pr-gates.md` §2: `new_lines = 50`
  proves an analysis exists, so the zero is genuine and not an unanalyzed PR. (Note for the next
  session: the measures API returns `periods` — plural, an array — not `period`; parsing for the
  singular key silently yields `None` for every metric and looks exactly like the false clean.)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the shared clock-icon seam | ✅ | `404f3b6` |
| 1 — adopt it on both notes + reframe Discover's copy | ✅ | `f8ef9aa` |
| 2 — e2e assertion + the `riviera-tailwind` icon § | ✅ | `28bb5d7` |
| 3 — close-out (docs freshness, review + Sonar gates, final state) | ✅ | `922982d` (freshness), `79ae097` (review-gate fixes), this commit (final state) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

Review gate ran on PR #734 via the `code-review` plugin workflow (rung 1 of the invocation
ladder succeeded), with `riviera-review-overlay`'s bank layered on. **10 findings, no functional
defect** — the reviewer independently re-measured the rendered glyph and confirmed the shipped
behavior. Every fix re-entered at Implement through the frontend routing row.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review | Discover's 15 px override was pinned by **no executable test** — the only rendered-box proof was the throwaway probe, so it could regress silently. Violates rule 4's own "the proof is the rendered box, never the class list" | fixed — `discovery-flow.e2e.ts` now asserts `toHaveCSS` 15 px on the glyph; **falsified** by removing the class (went red at 13 px), so the pin genuinely bites |
| F-2 | review | Zero API surface made the component's internal DOM part of its contract: `[&>svg]` breaks the day anyone wraps the root, with no compile error and no failing test | fixed — moved to the **descendant** `[&_svg]`, which survives wrapping; the residual coupling is now guarded by F-1's measured pin and stated as a cost in ICON-4 rather than sold as free |
| F-3 | review | The slice dedupes the glyph but leaves the **sentence** duplicated in 5 places — the exact drift #733 exists to repair can recur | deferred → **#735**. #733's ACs scope this slice to copy + icon, and the shape (constant vs `<app-cutoff-note>`) is a real tradeoff; the repo's precedent for that is a follow-up issue (#703 → #733 itself) |
| F-4 | review | The freshness sweep missed `docs/design/` and the rest of `docs/plans/` — two docs still state the retired copy | split: `t2b-discover-v3-additions.md` patched here (a plan-doc final state, inside the skill's map); the artboards deferred → **#736**, which also asks whether `docs/design/` should join that map. Verified both claims before acting — artboard line 232 has been stale since **#703**, not this slice |
| F-5 | review | The new Icons § opened a second `1.`–`6.` list in a skill whose rules are cited by bare number — this plan doc's own "rule 2" citation became ambiguous | fixed — renumbered **ICON-1…ICON-6**; the upward cross-reference now says "the top-level rule 1" |
| F-6 | review | ICON-5 gave an **incorrect** causal rationale (blamed preflight's `svg{display:block}`) and presented `host: { class: 'contents' }` as novel when `shared/stat-tile.ts` already ships it | fixed — the cause is the **wrapper** becoming the flex item, preflight noted as the separate fact it is; `stat-tile.ts` cited as precedent. R-1's "verified against tailwindcss@4.3.3" re-derived an in-repo precedent |
| F-7 | review | The spec's whitespace normalization collapses U+00A0, so `6&nbsp;PM` was asserted **nowhere** — replacing it with a plain space passed every suite, letting the note wrap between "6" and "PM" | fixed — `home.spec.ts` pins `6\u00a0PM` alongside the normalized compare |
| F-8 | review | The plan doc contradicted itself: unticked ACs and phase steps beside a ✅ table, a placeholder beside a ticked "no placeholders", a stage pointer behind HEAD | fixed — this section |
| F-9 | review | The e2e regex was loosened to `.*` over the clause that actually differed between the surfaces, and Playwright skips whitespace normalization for RegExp matchers, so it depended on Angular's collapsing to match at all | fixed — asserts the "each day's" clause explicitly and uses `[\s\S]*` so a reflowed template can't turn it red |
| F-10 | review | The component's rationale ("emoji render platform-dependently") is a property of the glyph that applies to the app's other on-glass emoji, but the audit rejected those on a *meaning* argument — a rule applied to one of three instances | fixed — the doc comment now scopes the judgement to these two notes and says the remaining emoji glyphs are unrelated and stay |

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
- `docs/plans/beach-map-mode-aware-copy.md` — #703's two Non-goals that this slice closes

---

## Phase 0 — The shared clock-icon seam

**Files:** Create `frontend/src/app/shared/clock-icon.ts` · Test `frontend/src/app/shared/clock-icon.spec.ts`

- [x] **Step 1–4:** spec first (host + inner `aria-hidden`, SVG namespace, class merge), then
  the component; `npx vitest run src/app/shared/clock-icon.spec.ts`.

## Phase 1 — Both notes adopt it; Discover's copy is reframed

**Files:** Modify `venue-map.html|.ts`, `home.html|.ts` · Test `home.spec.ts`, `venue-map.spec.ts`

- [x] **Step 1–4:** rewrite `home.spec.ts`'s cutoff case red, then swap both templates;
  `npx vitest run src/app/pages/home src/app/venue/venue-map.spec.ts`.
- [x] **Step 5:** Generalization-audit pass — sweep by mechanism, not resemblance.

## Phase 2 — e2e + the docs gap the precedent creates

**Files:** Modify `discovery-flow.e2e.ts`, `.claude/skills/riviera-tailwind/SKILL.md`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | Phase 1 | **Duplicated SVG geometry** — every inline `<svg>` in app source, the mechanism the seam exists to collapse (not "places that look like icons") | `grep -rnF '<svg' frontend/src --include=\*.html --include=\*.ts` | before: 1 (`venue/venue-map.html`); after: 1 (`shared/clock-icon.ts`) | **All.** The population was a single site plus the one Discover was about to add, which is exactly why #703 correctly declined the seam and why this slice buys it. AC-4 is this command |
| 2026-08-21 | Phase 1 | **Surfaces stating the cutoff rule in prose**, keyed by *wording* rather than by the `cutoff-note` test id — a surface can state the rule without carrying the id, so id-keying would have returned a false clean | `grep -rniE "6\s*(&nbsp;\|\xc2\xa0\| )?PM\|evening before\|day before\|same.day\|closes? (the )?(evening\|day)" frontend/src frontend/e2e --include=\*.html --include=\*.ts` | 6 beyond the two notes: `admin/admin-commissions.ts:49,313`, `booking/booking-dialog.ts:260`, `booking/booking-view.ts:733`, `pages/legal/terms-of-service.html:30,43` (+ its `.ts:14`), `e2e/legal-pages.e2e.ts:78` | **Subset, with reasons.** The two `booking/` hits state the **cancellation** policy (invariant #10) — same instant, different rule. `admin-commissions` explains to an admin why today's commissions already accrued — different audience, not a point-of-sale invitation. The legal pages state the rule in legal register and deliberately name no clock time (their own doc comment says so). None carries a glyph, so the icon population is unaffected. Only the two tourist-facing point-of-sale notes were ever in scope |
| 2026-08-21 | Close-out | **Counting sweep** (`riviera-docs-freshness` step 2b) — docs stating a *count* of glyphs/icons/shared primitives go stale outside the diff when a slice makes the Nth instance, so none of them is findable by reviewing changed files | `grep -rniE "the (one\|two\|three\|only) (glyph\|icon\|svg\|shared component)\|no icon\|zero occurrences of\|first icon" CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr/ .claude/skills/ --include=*.md` | 1 hit, and it is this slice's own new ICON § ("no icon library and no icon registry"), which stays true — a hand-written glyph is not a library | **None needed.** `riviera-tailwind` rule 1's `retry-button.ts` citation and `riviera-frontend`'s `shared/` examples are illustrative, not exhaustive counts, so neither is falsified |
| 2026-08-21 | Phase 1 | **Every `⏰` in app source**, re-run to confirm the glyph swap left no stragglers | `grep -rn '⏰' frontend/src frontend/e2e` | `operator/requests-tab.html:78` + 3 doc mentions + `e2e/operator-requests.e2e.ts:59`, and the new `shared/clock-icon.ts:5` | **Skip, deliberately.** The requests-tab ⏰ means *urgency*, not the cutoff rule — out of population despite matching the glyph, the same call #703's audit made. The `clock-icon.ts` hit is the rationale prose ("not the ⏰ emoji, which…") that moved out of `venue-map.html`'s comment, not a glyph |

---

## Acceptance-criteria verification (final)

> The commands `#733` suggests use bare `npx vitest`, which **cannot** run this repo's specs —
> the setup file is registered in `vitest-base.config.ts` and applied by the
> `@angular/build:unit-test` builder, so a bare run dies with `describe is not defined`
> (ADR-0014 / #663 explain why it lives there). Go through `ng test` instead.

- [x] **AC-1/AC-2:** `npx ng test --watch=false --include="src/app/pages/home/**/*.spec.ts"` →
  the cutoff case passes; the note's whitespace-normalized text equals the new sentence exactly,
  which is what pins "no emoji, no `&ngsp;`, accessible text is the sentence alone". Verified at `f8ef9aa`.
- [x] **AC-3:** `npx ng test --watch=false --include="src/app/shared/clock-icon.spec.ts"` →
  6 passed. Verified at `404f3b6`.
- [x] **AC-4:** `grep -rnF '<svg' frontend/src --include=\*.html --include=\*.ts` → exactly one
  hit, `shared/clock-icon.ts`. Verified at `f8ef9aa`.
- [x] **AC-5:** `npx ng test --watch=false --include="src/app/venue/venue-map.spec.ts"` → passes,
  **unedited** — including its `note.querySelector('svg')` aria-hidden assertion. Verified at `f8ef9aa`.
- [x] **AC-6:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` →
  232 passed, axe included. Verified at phase 2.
- [x] **AC-7:** `npm run test:a11y` → 58 files / 356 tests passed, both contrast specs unedited.
  Verified at `f8ef9aa`.
- [x] **No-drift proof** (`riviera-tailwind`'s hard rule — computed styles, not class lists): a
  throwaway Playwright probe read `getComputedStyle` on both glyphs — Discover `15px × 15px`
  with `stroke` = `rgba(12,42,51,0.78)` = its note's `--riv-card-ink-soft`; the map `13px × 13px`
  with `stroke` = `rgba(12,42,51,0.66)` = its note's `--riv-ink-faint`; host `display: contents`
  on both. The map's box is unchanged from the shipped inline SVG. Probe deleted after the run.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled (justified N/A); invariant #4 appears as display copy only.
- [x] Pool + cutoff rules honored (invariants #3, #4) — no fencing behavior changed.
- [x] **Modulith** section filled (N/A — frontend-only).
- [x] **Payment/payout** section filled (N/A).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — the `Europe/Tirane` clamp is untouched.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A.
- [x] **Frontend** standards met; no `as any`; folder placement per `riviera-frontend`.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR**, citing PR **#734** — the final `merged via PR #734`
      stage pointer lands in this PR's last commit, so no docs-only follow-up PR is needed.
- [x] **The review gate ran in full** — the `code-review` plugin workflow executed (invocation
      ladder rung 1) with `riviera-review-overlay` layered on, not the overlay alone. 10 findings,
      8 fixed here, 2 deferred with issues **#735** / **#736**.
