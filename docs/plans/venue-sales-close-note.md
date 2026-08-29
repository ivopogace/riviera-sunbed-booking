# Venue-specific sales-close note; the generic cutoff note retires (#804)

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The venue map states *this venue's* sales-close rule (three branches keyed on
the venue's `00:01`/`16:00`/`23:59` setting); the homepage's generic cutoff note is
removed; the shared `cutoff-note` component retires with both call sites gone.

**Architecture:** The tourist venue-map read (`GET /api/venues/{id}?date=`) gains the
venue's sales-close value as an additive `salesClose: "HH:mm"` string beside the existing
`salesOpen` verdict — a pure projection of a column `JdbcVenueCatalog` already selects, so
the whole backend change stays inside `venue` with no new port (the #793 `salesOpen`
precedent, repeated with the value). The frontend keys three sentences on the structured
value; **the value is display-copy key only — `salesOpen` remains the only open/closed
signal and no client time arithmetic appears** (#793 plan R-1, carried forward).

**Persistence:** JDBC only (invariant #1). No schema change — `venue.sales_close` exists
(V44); no migration in this slice.

**Source of intent:** GitHub issue #804 (follow-up to epic #790; builds on #791's
single-source copy and #793's per-request `salesOpen`). Maintainer decision recorded in
the issue (2026-08-29): remove the homepage note entirely.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
`clock-icon` orphaning and the irreparable `discovery-flow.e2e.ts:166` cross-surface
parity assertion) · `riviera-plan-doc` (this template — forced the behavior-parity
ledger below) · `tdd` (each phase red-first: failing IT / failing Vitest spec before the
change) · `riviera-review-overlay` (review gate — at PR ready-for-review) ·
`riviera-docs-freshness` (due at merge close-out — the slice retires a component three
substrate docs cite) · `grilling` (the intake interrogation itself) · `riviera-modulith`
(vocabulary-surface change; append the record component last, #793 R-3) ·
`riviera-java-conventions` (`"HH:mm"` string on the wire per the `VenueProfileResponse`
precedent; Javadoc states contract not history) · `riviera-frontend` (note lives inline
in the `venue/` feature; the `SalesCloseTime` union's home is `shared/venue-views.ts`,
never an operator import) · `riviera-tailwind` (attribute-component retirement mechanics:
eslint allowlist entry, inert-marker/test-id rules, NBSP precedent, ICON-2/4/6 for the
kept glyph) · `angular-developer` + angular-cli MCP (v22 `@switch` control flow, signals)
· `playwright-cli` (mocked-suite authoring; route mocks per spec) · `codebase-design`
(no new component: one call site is a hypothetical seam — D-1) · `domain-modeling` (copy
respects the CONTEXT.md *Sales close* vs *Cutoff* glossary split — the new sentences never
say "cutoff") · `riviera-local-debug` (loaded before the session's first build/test).

**Branch:** the session's designated remote branch `claude/riviera-sdlc-804-c4bi2f`
stands in for `feature/venue-sales-close-note` (cloud-session addendum, `riviera-sdlc`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue whose `sales_close` is `16:00` (and one at `00:01`), when the
  tourist venue-map read runs for any date, then the response carries `salesClose`
  (`"16:00"` / `"00:01"`) beside the existing `salesOpen` verdict, with no operator DTO
  reused and no new cross-module surface. *Pinned by:*
  `VenueReadControllerIT.mapCarriesSalesCloseValue`.
- [ ] **AC-2:** Given a loaded venue map, when `salesClose` is `23:59` / `16:00` / `00:01`,
  then the header note renders exactly the all-day / close-at-4-PM / advance-only sentence
  for that value — keyed on the structured value, never a client time comparison; absent
  `salesClose` renders no note. *Pinned by:* `venue-map.spec.ts` (four specs: three
  branches + absent).
- [ ] **AC-3:** Given a `00:01` venue, when any date (today or a future date) is selected,
  then the advance-only sentence renders, and for a future date with `salesOpen: true` the
  map's free sets stay bookable (regression). *Pinned by:* `venue-map.spec.ts` +
  `same-day-booking.e2e.ts`.
- [ ] **AC-4:** Given `salesOpen: false` for the selected date, when the map renders, then
  the #793 closed-for-today alert renders unchanged (`role="alert"`,
  `data-testid="map-sales-closed"`, today-vs-other-date copy). *Pinned by:* the existing
  `venue-map.spec.ts` closed-state specs, kept green unmodified in substance.
- [ ] **AC-5:** Given the homepage, when it renders, then no cutoff note appears; and
  `git grep -l appCutoffNote` over `frontend/src` returns nothing — the component, its
  spec, and its eslint allowlist entry are gone. *Pinned by:* `home.spec.ts` absence
  spec + the AC-5 sweep command recorded in the verification section.
- [ ] **AC-6:** Given the mocked Playwright suite, when it runs, then a `16:00` venue
  (discovery-flow) and a `00:01` venue (same-day-booking) are covered end-to-end with axe
  checks on the new copy, and the retired homepage-note pins (glyph-size on Discover,
  cross-surface parity, full-sentence load-failure regex) are removed/replaced. *Pinned
  by:* `discovery-flow.e2e.ts`, `same-day-booking.e2e.ts`.
- [ ] **AC-7:** Given the shipped diff, when the docs are read, then
  `docs/design/README.md`-convention divergence pointers exist on the two artboard note
  lines, and the substrate docs citing the retired component
  (`riviera-tailwind/SKILL.md`, `cancellation-terms-note.ts` TSDoc,
  `RESPONSIBILITIES.md` §`venue`) are trued in this PR; `riviera-docs-freshness` runs at
  close-out. *Pinned by:* the freshness pass record in Execution status.

## Non-goals

- No change to the sales-window rule, the `BOOKING_CLOSED` refusal contract, or
  `booking`'s `BookingCutoff` authority — the server stays the enforcement authority
  (invariant #4).
- No `salesClose` on the Discover list read (`VenueSummaryView`) — the #793 badge carries
  the list-surface signal.
- No new `venue.api`/`spi` surface; the `SalesWindow` port keeps returning only the verdict.
- No copy change to the closed-for-today alert, the Discover badge, or the operator
  console's sales-close control labels.
- No new shared note component (D-1) and no removal of `shared/clock-icon.ts` (it gains
  the venue note as its consumer).

## Behavior-parity ledger (retirement / replacement slices only)

The retiring surface is `shared/cutoff-note.ts` (`p[appCutoffNote]`) and its two call
sites (`pages/home/home.html:119-124`, `venue/venue-map.html:146`).

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Homepage renders the one-sentence lead-time explainer (glass pill, clock glyph, upsized `[&_svg]:size-[15px]`) | **dropped** | Maintainer decision (issue, 2026-08-29): it educated against a rule no live user ever saw. The date picker already offers today; the per-card Discover closed badge (#793) and the server `BOOKING_CLOSED` refusal carry the real signal. |
| Venue map renders the same generic sentence under the date trigger | **changed** | Replaced in place (same position, same `mt-2 text-[11.5px] text-riv-ink-faint` skin) by the venue-specific three-branch note keyed on `salesClose`. |
| One sentence, single-sourced across two surfaces; cross-surface parity pinned by `discovery-flow.e2e.ts:166` `toHaveText(discoverCutoff!)` | **dropped** | The surfaces intentionally diverge: the note is per-venue and the homepage has none. The parity assertion is deleted (irreparable — its capture source is gone), replaced by branch assertions on the map. |
| `data-testid="cutoff-note"` (queried by home/venue specs + e2e) | **changed** | New `data-testid="sales-close-note"` on the venue note; every old query site is updated or deleted in this slice — no inert marker needed because no spec keeps querying the old id. |
| Clock glyph beside the sentence (`aria-hidden` host + svg, `stroke=currentColor`) | **preserved** (map) / **dropped** (home, with the note) | The venue note renders `<app-clock-icon />` directly; `ClockIcon` moves from `cutoff-note.ts`'s imports to `venue-map.ts`'s. Rendered-size pin moves to the map e2e (ICON-4). |
| Display-only posture ("the server enforces the real cutoff", invariant #4) | **preserved** | Note copy keys on the structured value; `salesOpen` stays the only open/closed signal; no client time arithmetic (#793 R-1). |
| `4&nbsp;PM` NBSP (the #734 F-7 reviewable-entity precedent) | **preserved** | The `16:00` branch writes `4&nbsp;PM`; exact-string spec pin keeps the byte visible. |
| Host layout contract (`inline-flex items-center gap-1 leading-[1.35]`) so the glyph sits in the sentence's flex row | **preserved** | The same classes move onto the venue note `<p>` alongside its existing skin classes. |
| `eslint.config.js` attribute-selector allowlist entry for `cutoff-note.ts` | **dropped** | Component deleted; entry removed (the other four entries stay). |
| Past-close behavior: the note stays rendered while the #793 closed alert takes over the map area | **preserved** | The note is unconditional on `salesClose` presence; the alert remains keyed on `salesOpen === false` — both render, as today (AC-4). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The FE (or a later reader) treats `salesClose` as an open/closed signal and re-derives the fence client-side — the exact misuse #793's R-1 forbade | med | high | Copy keyed on value equality only; `salesClosed()` stays derived from `salesOpen`; Javadoc + TSDoc on both mirrors state "display copy key only, verdict is `salesOpen`"; AC-2 wording; review overlay checks | agent | open |
| R-2 | Copy pins scatter and drift (the #791 R-9 class) | med | med | Single call site: the three full sentences live only in `venue-map.html`; `venue-map.spec.ts` holds the one full-sentence pin per branch; e2e asserts clause-level (`'close at 4'`, `'in advance only'`) | agent | open |
| R-3 | The `VenueMapView` record change breaks constructions | low | med | Explore-verified single construction site (`JdbcVenueCatalog:168`); component appended last (#793 R-3); FE field optional so unfixtured mocks/specs stay green | agent | open |
| R-4 | `shared/clock-icon.ts` orphaned by the retirement | high (without action) | low | The venue note consumes it directly; `riviera-tailwind/SKILL.md` ICON wording trued in this PR | agent | open |
| R-5 | Deleting the e2e parity assertion silently loses the glyph rendered-size proof (ICON-4: jsdom can't see it) | med | low | A `toHaveCSS` size pin on the map note's glyph replaces the Discover one | agent | open |
| R-6 | Timezone/meaning drift: copy says "4 PM" for `16:00` — a hardcoded label, not formatting | low | low | Deliberate: label-per-branch, no time formatting; the three values are DB-CHECK-constrained (V44) so no fourth value can arrive | agent | open |
| R-7 | Contrast/a11y regressions on the reworked header line | low | med | Ink + classes unchanged (`text-riv-ink-faint` on the header glass, `venue-map.contrast.spec.ts` pin stays valid); axe specs extended with `salesClose` fixtures | agent | open |
| R-8 | Error contract | — | — | N/A — read-only additive response field; no new request DTO, no new error path (`riviera-java-conventions` §6b untouched) | agent | closed (N/A) |

## Open questions / Assumptions

- **Assumption:** `salesClose` rides the map read as a required (always-present) response
  field — the column is `NOT NULL` with a DB CHECK, so there is no absent case server-side;
  the FE types it optional purely for fixture/mock tolerance (the `salesOpen` precedent).
  — *Owner:* agent · *Resolves by:* Phase 1 (IT pins presence).
- **Assumption:** consolidating the FE `SalesCloseTime` union into `shared/venue-views.ts`
  with `operator/operator-console.model.ts` re-exporting it is in scope (single
  definition, legal feature→shared direction). If the operator model's consumers make the
  re-export noisy, the fallback is a standalone union in `shared/` and the operator keeps
  its own. — *Owner:* agent · *Resolves by:* Phase 2.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Display-only slice: no write path to
`availability(set_id, booking_date)` is touched; the reserve/claim mechanics, pool rule,
and the sales-window fence are all unchanged. The one adjacency: the `00:01` regression
(AC-3) pins that the *rendering* of bookable sets for future dates still keys on
`salesOpen`/`availability`, not on the new value.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | Owns the sales-close setting (CLAUDE.md module table) and the tourist catalogue read; the value is its own `venue.sales_close` column, already selected by `JdbcVenueCatalog.findVenueMap` |

**Cross-module named interfaces (`api/` ports):** none added or changed. `VenueCatalog`
(the `venue.api` read port) keeps its signature; only the `vocabulary/VenueMapView`
record it returns gains a component. The `venue.spi.SalesWindow` driven port is untouched
and keeps returning only the verdict.

**Domain events:** none touched.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Expose the venue's sales-close value on the tourist map read | `venue` | `venue` Job: the per-venue sales-close setting + the catalogue reads (`RESPONSIBILITIES.md` §`venue`); a pure projection of its own column. **Not** `booking`: deciding whether sales are *open* stays booking's rule behind `SalesWindow` — the value crosses no module boundary. All in `venue`, no boundary change. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` + `venue-map.ts` | existing | standalone component | `@switch` on the existing `venue` signal's `salesClose`; no new signals needed | none |
| FE-2 | `pages/home/home.html` + `home.ts` | existing | standalone component | note block + `CutoffNote` import removed | none |
| FE-3 | `shared/venue-views.ts` | existing | model | `SalesCloseTime` union + optional `salesClose` on `VenueMapView` | none |
| FE-4 | `shared/cutoff-note.ts` (+ spec) | **deleted** | attribute component | — | — |
| FE-5 | `operator/operator-console.model.ts` | existing | model | `SalesCloseTime` re-exported from `shared/venue-views` (single definition) | none |

**Standards:** standalone, signals, native `@switch`; the note is inline in
`venue-map.html` — **D-1: no new component.** One call site is a hypothetical seam
(`codebase-design`: the deletion test fails — deleting a wrapper component would move
three sentences, not complexity). The #791 single-source rule is satisfied by
construction: each sentence has exactly one template home, pinned once per branch in
`venue-map.spec.ts`.

## FE↔BE contract

- **Changed endpoint:** `GET /api/venues/{venueId}?date=` — response gains
  `salesClose: string` (`"00:01" | "16:00" | "23:59"`, `"HH:mm"`, the
  `VenueProfileResponse` wire precedent), additive beside `salesOpen`. Always present
  server-side; FE types it `salesClose?: SalesCloseTime` for mock tolerance.
- **Client typing:** hand-written `SalesCloseTime` union in `shared/venue-views.ts`
  (the backend-vocabulary mirror home; `venue` feature is editor of record). No `as any`.
- **Semantics on the wire:** a copy key, not a timestamp — clients must not compare it
  with the clock (R-1); `salesOpen` remains the verdict.

## Execution status

**Stage pointer:** PR — marking ready for review; review + Sonar gates next

**Next action:** mark PR #805 ready for review; run the review gate per
`riviera-sdlc references/pr-gates.md` §1, then the Sonar gate (§2).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | 1a59f0b; PR #805 (draft) |
| 1 — BE: `salesClose` on the map read | ✅ | (this commit) |
| 2 — FE: model + three-branch venue note | ✅ | (this commit) |
| 3 — FE: homepage note removed, `cutoff-note` retired | ✅ | (this commit) |
| 4 — e2e: mocked-suite rework + a11y | ✅ | (this commit) — full mocked suite 294/295 locally; the one failure (`customer-password.e2e.ts:47`) is a pre-existing parallel-run flake untouched by this diff (passes alone and file-scoped single-worker); CI arbitrates |
| 5 — Docs truing (in-PR) + close-out | ⏳ | docs truing (this commit); close-out finalization at merge |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/venue-sales-close-note.md` — this plan.
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — `salesClose` component appended last + Javadoc.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — format `v.salesClose()` as `"HH:mm"` into the view.
- `platform/src/test/java/ai/riviera/platform/venue/VenueReadControllerIT.java` — AC-1 pin.
- `frontend/src/app/shared/venue-views.ts` — `SalesCloseTime` union + `salesClose?` on `VenueMapView`.
- `frontend/src/app/operator/operator-console.model.ts` — re-export the union from `shared/venue-views` (drop the local duplicate).
- `frontend/src/app/venue/venue-map.html` — replace the `appCutoffNote` line with the inline three-branch note.
- `frontend/src/app/venue/venue-map.ts` — swap the `CutoffNote` import for `ClockIcon`.
- `frontend/src/app/venue/venue-map.spec.ts` — replace the mount spec with the four branch specs; closed-state specs kept.
- `frontend/src/app/venue/venue-map.a11y.spec.ts` — fixture gains `salesClose`; axe over the new copy.
- `frontend/src/app/pages/home/home.html` — note block removed.
- `frontend/src/app/pages/home/home.ts` — `CutoffNote` import + `imports` entry removed.
- `frontend/src/app/pages/home/home.spec.ts` — mount spec replaced by an absence pin.
- `frontend/src/app/pages/home/home.contrast.spec.ts` — stale doc-comment reference trued.
- `frontend/src/app/shared/cutoff-note.ts` — **deleted**.
- `frontend/src/app/shared/cutoff-note.spec.ts` — **deleted**.
- `frontend/src/app/booking/cancellation-terms-note.ts` — TSDoc precedent pointer re-aimed (comment-only).
- `frontend/eslint.config.js` — allowlist entry removed.
- `frontend/e2e/discovery-flow.e2e.ts` — homepage-note pins removed; map note (16:00) + glyph-size pin + axe.
- `frontend/e2e/same-day-booking.e2e.ts` — 00:01 advance-only journey + axe; closed-path pins kept.
- `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` — #804 divergence pointers on the two note lines.
- `docs/design/2026-07-02-liquid-glass-redesign-note.md` — #804 pointer on the intake-table cutoff row.
- `docs/plans/availability-calendar-ui.md` — as-built pointer where it pins the `appCutoffNote` position.
- `docs/plans/checkout-legal-links.md` — F-3 note: #804 ships the per-venue close display.
- `RESPONSIBILITIES.md` — §`venue`: the map read now also carries the venue's own close value (display copy).
- `.claude/skills/riviera-tailwind/SKILL.md` — cutoff-note citations re-aimed (attribute-component example, ICON precedent reach, `[&_svg]` worked example).

---

## Phase 1 — BE: `salesClose` on the tourist map read

**Files:** Modify `VenueMapView.java`, `JdbcVenueCatalog.java` · Test `VenueReadControllerIT.java`

- [ ] **Step 1: failing test** — `mapCarriesSalesCloseValue`: seeded venue 1 (16:00) →
  `jsonPath("$.salesClose").value("16:00")`; the opt-out helper venue → `"00:01"`;
  assert `salesOpen` still present beside it.
- [ ] **Step 2: run red** — `./gradlew test --tests "*VenueReadControllerIT*"` (Docker-gated;
  in this cloud session per `riviera-local-debug` — if the daemon is absent the IT skips,
  then rely on compile + CI for the red/green evidence and say so honestly).
- [ ] **Step 3: minimal implementation** — append `String salesClose` to `VenueMapView`
  (Javadoc: three values, display copy key, verdict stays `salesOpen`, invariant #4);
  format at the one construction site (`HH:mm`, constant `DateTimeFormatter`).
- [ ] **Step 4: run green** — same scoped command; plus `./gradlew compileJava compileTestJava`.
- [ ] **Step 5: generalization audit** — population: every `VenueMapView` construction
  (`git grep -n "new VenueMapView"`); expect exactly one + record.
- [ ] **Step 6: commit** — `Expose the venue's sales-close value on the tourist map read (#804)`.
- [ ] **Step 7: execution status update** (same window).

## Phase 2 — FE: model + the three-branch venue note

**Files:** Modify `venue-views.ts`, `operator-console.model.ts`, `venue-map.html`, `venue-map.ts` · Test `venue-map.spec.ts`, `venue-map.a11y.spec.ts`

- [ ] **Step 1: failing specs** — four `venue-map.spec.ts` specs (23:59 / 16:00 with
  `4 PM` exact string / 00:01 on today AND tomorrow with sets bookable / absent →
  no note; query `data-testid="sales-close-note"`).
- [ ] **Step 2: red** — `npm test -- venue-map` (scoped).
- [ ] **Step 3: implement** — union + optional field (TSDoc: copy key only, R-1);
  `@switch (v.salesClose)` note in `venue-map.html` at the old line with the merged
  classes `mt-2 inline-flex items-center gap-1 leading-[1.35] text-[11.5px]
  text-riv-ink-faint`, `<app-clock-icon />` inside each branch's flex row (glyph
  `aria-hidden`, ICON-6); `ClockIcon` into `venue-map.ts` imports.
- [ ] **Step 4: green** — scoped run + `venue-map.a11y` with a `salesClose` fixture.
- [ ] **Step 5: generalization audit** — population: every consumer of the operator
  `SalesCloseTime` union (`git grep -n "SalesCloseTime" frontend/src`); re-point to the
  single shared definition.
- [ ] **Step 6: commit** — `Venue map states the venue's own sales-close rule (#804)`.
- [ ] **Step 7: execution status update.**

## Phase 3 — FE: homepage note removed, `cutoff-note` retired

**Files:** Modify `home.html`, `home.ts`, `home.spec.ts`, `home.contrast.spec.ts`, `eslint.config.js`, `cancellation-terms-note.ts` · Delete `cutoff-note.ts`, `cutoff-note.spec.ts`

- [ ] **Step 1: failing spec** — `home.spec.ts` absence pin (no `cutoff-note`/
  `sales-close-note` testid on the homepage).
- [ ] **Step 2–4:** remove the block + imports; delete the component + spec; drop the
  eslint allowlist entry; re-aim the `cancellation-terms-note.ts` TSDoc pointer (another
  live attribute component, e.g. `p[appAdminForbidden]`); scoped `npm test -- home`,
  then `npm run lint` + `npm run format:check`.
- [ ] **Step 5: generalization audit** — population: every reference to the retired
  selector/testid (`git grep -nE "appCutoffNote|cutoff-note" frontend docs .claude`);
  judge each hit (code → removed, docs → Phase 5).
- [ ] **Step 6: commit** — `Retire the generic cutoff note and its homepage call site (#804)`.
- [ ] **Step 7: execution status update.**

## Phase 4 — e2e: mocked-suite rework + a11y

**Files:** Modify `discovery-flow.e2e.ts`, `same-day-booking.e2e.ts`

- [ ] `discovery-flow`: `VENUE_MAP` gains `salesClose: '16:00'`; drop the Discover glyph
  pin (113-119), the parity assertion (166), the load-failure full-sentence regex
  (244-246 — the note no longer exists on that surface); assert the map note clause
  (`close at 4`) + glyph `toHaveCSS` size pin + axe via `expectNoSeriousAxeViolations`.
- [ ] `same-day-booking`: the deep-link closed-venue test's mock gains
  `salesClose: '00:01'`; assert the advance-only clause on today AND on the recovered
  tomorrow (sets bookable — AC-3) + axe; closed-alert pins unchanged (AC-4).
- [ ] Run the mocked suite: `npm run test:e2e:a11y` (scoped to the two files if supported).
- [ ] Commit — `Cover the 16:00 and 00:01 venue notes in the mocked e2e suite (#804)`;
  execution status update.

## Phase 5 — Docs truing (in-PR) + close-out

- [ ] Divergence pointers (`docs/design/README.md` convention): the two artboard note
  lines in `riviera-sunbeds-liquid-glass-v3.dc.html` (+ the redesign-note intake row);
  as-built pointers in `availability-calendar-ui.md` and `checkout-legal-links.md`.
- [ ] Substrate truing: `riviera-tailwind/SKILL.md` (three citation sites),
  `RESPONSIBILITIES.md` §`venue` (one sentence: the map read also carries the venue's own
  close value as display copy; the spi port still returns only the verdict).
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc staged).
- [ ] Commit; finalize Execution status **before merge** (`merged via PR #NN` at close-out).
- [ ] At merge close-out: `riviera-docs-freshness` over the merge range (the counting
  sweep matters here: the attribute-component population shrinks from five to four).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-29 | Phase 1 (record component added) | every `VenueMapView` construction — call-site mechanism, whole repo incl. `adapter/out` (gitignore-blind path confirmed via `git ls-files`) | `git grep -n "new VenueMapView" -- '*.java'` + `git ls-files '*/adapter/out/*.java' \| xargs grep -ln VenueMapView` | 1 (`JdbcVenueCatalog:171`) | fixed at the one site; `WebSliceStubs` returns `Optional.empty()`, unaffected |
| 2026-08-29 | Phase 2 (union moved to `shared/`) | every consumer of the `SalesCloseTime` union — import mechanism | `grep -rn "SalesCloseTime" frontend/src` | 1 definition (shared) + operator model re-export + `venue-tab.ts` via the model | operator consumers untouched (re-export keeps their import path); no second definition remains |
| 2026-08-29 | Phase 3 (component retired) | every reference to the retired selector/component/testid — token mechanism across code, e2e, skills, docs | `git grep -nE "appCutoffNote\|cutoff-note\|CutoffNote" -- frontend .claude docs *.md` | `frontend/src`: only the deliberate absence pin; `frontend/e2e`: discovery-flow pins (Phase 4); `riviera-tailwind/SKILL.md` ×4 + `availability-calendar-ui.md` + `cutoff-sentence-single-source.md` standing claims (Phase 5); other plan docs are historical narrative, no standing claim broken — left as-is | code swept now; e2e Phase 4; docs Phase 5 |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*VenueReadControllerIT*"` → green (or CI when
  Docker absent locally). Verified at commit `<sha>`.
- [ ] **AC-2/AC-3:** `npm test -- venue-map` → green. Verified at `<sha>`.
- [ ] **AC-4:** closed-state specs in the same run, unmodified in substance. Verified at `<sha>`.
- [ ] **AC-5:** `git grep -l appCutoffNote -- frontend/src` → empty; `npm test -- home` →
  green. Verified at `<sha>`.
- [ ] **AC-6:** `npm run test:e2e:a11y` → green. Verified at `<sha>`.
- [ ] **AC-7:** pointer/truing diff present; freshness pass recorded at close-out.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A; no concurrency surface touched (invariant #2).
- [ ] Pool + cutoff rules honored — display only, server authority unchanged (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: no client time arithmetic added; the value is a copy key (invariant #6 posture).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change; no migration (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** (`merged via PR #NN`).
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
