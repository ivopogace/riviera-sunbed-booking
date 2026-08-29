# Operator sales-close control + daily-view kill switch — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Make the per-venue sales-close setting (`00:01`/`16:00`/`23:59`, read-only since
#791) venue-editable end-to-end: it joins the venue-profile full-replace PATCH and the
create request, the venue settings tab gets the standing three-choice control, the daily
view gets a one-tap "close today's online sales now", and the evening-before cutoff field
is relabeled to its remaining meaning (free-cancellation deadline).

**Architecture:** No new endpoint and no new port — the kill switch writes the **same
standing setting through the same profile GET + full-replace PATCH** (optimistic `version`
guards the read-modify-write), because AC-1 pins the setting to the profile PATCH and the
epic rejects a per-day override. The three-value concept gets its domain type: a
`SalesClose` enum in `venue/domain/` whose three constants carry their wall-clock times —
the write path speaks the choice (invalid values unrepresentable past the edge parse),
the V44 CHECK stays the DB floor, and the published carriers to `booking` keep speaking
`LocalTime` (the fence does time arithmetic; the three-ness is venue's write concern) —
see *Domain model* below. No read-side change: #793 already projects `salesOpen` per
request and nothing on the venue→booking path caches, so a write is effective on the
next reserve attempt.

**Persistence:** JDBC only (invariant #1). **No migration** — `V44__venue_sales_close.sql`
already ships the column, the three-value CHECK, and the 16:00 default/backfill; this
slice only extends `JdbcVenues`' UPDATE SET clause and INSERT column list. V45 stays free
(no open feature PRs claim it — checked 2026-08-28; only Dependabot PRs are open).

**Source of intent:** issue #794 (epic #790, design spec
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` §13). Predecessors:
`docs/plans/same-day-sales-close.md` (#791), `docs/plans/request-pay-deadline-fences.md`
(#792), `docs/plans/discover-sales-open.md` (#793).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
#791–#793 merged with close-outs, no Flyway/in-flight collisions, and surfaced the two
recorded assumptions below) · `riviera-plan-doc` (this template — forced the parity
ledger for the relabel and the daily-view race into the risk register) · `tdd` (each
phase opens with a failing edge/IT test, per the phase steps) · `riviera-review-overlay`
(review gate — due at ready-for-review) · `riviera-docs-freshness` (run at implement close-out over `origin/main..HEAD`: the §`venue` read-only sentence patched, the operator-console artboard's cutoff label flagged `as-built diverges — see #794`, counting sweep clean — `venue.spi` stays three; re-run due at merge close-out) · `grilling` (issue-intake pass over #794) ·
`riviera-modulith` (no new port/module needed; write stays in `venue`'s existing
application service; ownership via `operator::api` unchanged; `SalesClose` placed in
`domain/`, not `vocabulary/` — no sibling consumes it) · `domain-modeling` (CONTEXT.md's
"Sales close" entry — a choice among three fixed values — drove the `SalesClose` domain
type; no glossary change, no ADR: reversible) · `codebase-design` (contained the type to
`venue`'s write path; cross-module carriers stay `LocalTime`, so no published-seam
ripple) · `riviera-java-conventions`
(enum-over-validator §5/§6a, edge error contract §6b `InvalidApiRequestException.parsing`)
· `postgres` (confirmed CHECK-over-enum shape of V44; no migration due) ·
`riviera-frontend` (field lands in `operator/` models/service, not `shared/`; frozen
cross-feature edges not widened) · `angular-developer` + angular-cli MCP (v22: Signal
Forms preferred; `search_documentation` confirmed `FormValueControl` lets
`SegmentedControl` bind via `[formField]`, and model-signal two-way binding) ·
`riviera-tailwind` (reuse `SegmentedControl` + `[appTouchTarget]`; docs-checked
`min-h-11` = 44px and built-in `aria-*` variants; no new tokens, no SCSS) ·
`playwright-cli` (mocked-suite authoring; stateful `page.route` mock pattern) ·
`riviera-local-debug` (cloud build recipe; scoped-test discipline through phases 0–2).

**Branch:** `claude/sdlc-794-implement-lbvxb6` (implement session, started from
`claude/sdlc-794-plan-review-jh1h77`) — the session's designated remote branch stands in
for `feature/operator-sales-close-control` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1 (PATCH carries the setting):** Given a venue at `16:00` and its owner's
  full-replace PATCH carrying `salesClose: "00:01"` and the current `version`, when
  `EditVenueProfile.updateProfile` applies it, then the outcome is `APPLIED`, the profile
  read returns `00:01`, and `version` is bumped; a stale token stays `STALE_WRITE`/409
  with no field landing. *Pinned by:* `VenueAdminControllerIT.patchUpdatesSalesClose`
  (+ existing `staleVersionPatchIs409` extended to assert `salesClose` did not land).
- [x] **AC-2 (fixed vocabulary):** Given a PATCH or create request whose `salesClose` is
  anything but the three fixed values (`"12:00"`, `"garbage"`, null on PATCH), when the
  edge parses it, then the response is `400 INVALID_REQUEST` per the §6b contract and
  nothing is written. *Pinned by:* `VenueAdminControllerIT.invalidSalesCloseIs400`,
  `SalesCloseTest.fromTimeRejectsAnythingButTheThreeValues`.
- [x] **AC-3 (create):** Given a create request without `salesClose`, when the venue is
  onboarded, then its profile reads `16:00`; given one carrying `"23:59"`, it reads
  `23:59`. *Pinned by:* `VenueAdminControllerIT.createDefaultsSalesCloseAndProfileReturnsIt`
  (extended) + `VenueAdminControllerIT.createAcceptsExplicitSalesClose`.
- [x] **AC-4 (kill switch is effective immediately):** Given an online-pool set bookable
  today at a `23:59` venue, when the owner's PATCH sets `salesClose` to `00:01` and a
  tourist reserve for today follows, then the reserve outcome is
  `Rejected(BOOKING_CLOSED)` (422 at the edge). *Pinned by:*
  `BookingControllerIT.reserveRefusedAfterOwnerClosesSalesForToday`.
- [x] **AC-5 (re-open is immediate too):** Given a venue past its `16:00` close today
  (clock mid-afternoon), when the owner's PATCH sets `23:59` and a tourist reserve for
  today follows, then the reserve succeeds. *Pinned by:*
  `BookingControllerIT.reserveSucceedsAfterOwnerReopensSalesForToday`.
- [x] **AC-6 (ownership, invariant #13):** Given an authenticated `OPERATOR` who does not
  own the path venue, when they PATCH the profile (sales-close included), then the
  application service rejects with 403 before any write. *Pinned by:* existing
  `VenueAdminControllerIT.profileEditUnownedVenueIs403` (body now carries `salesClose`).
- [x] **AC-7 (settings-tab control):** Given the loaded venue tab, when the operator picks
  a sales-close choice and saves, then the PATCH wire body carries the chosen value with
  every other profile field (full replace), and the relabeled "Free-cancellation deadline
  (Europe/Tirane)" field still round-trips the cutoff. *Pinned by:* `venue-tab.spec.ts`
  (save body), `operator-venue.e2e.ts` (wire assertion via the stateful mock).
- [x] **AC-8 (daily-view kill switch):** Given the daily view on today, when the operator
  taps "Close today's online sales now" and confirms, then the profile PATCH body carries
  `salesClose: "00:01"` and the notice states it persists for future days until changed
  back. *Pinned by:* `daily-view-tab.spec.ts`, `operator-daily.e2e.ts`.
- [x] **AC-9 (a11y):** Both new/changed surfaces pass axe (unit `*.a11y.spec.ts` + in-spec
  e2e axe), every new control declares `[appTouchTarget]` (guard TT-1) and measures ≥44px
  in the touch-target sweep. *Pinned by:* `venue-tab.a11y.spec.ts`,
  `daily-view-tab.a11y.spec.ts`, `touch-targets.e2e.ts` (existing sweep, venue + daily tabs).
- [x] **AC-10 (docs):** `RESPONSIBILITIES.md` §`venue`'s sales-close bullet no longer says
  "read-only this slice"; it names the owner-editable write path. *Verified by:* the
  `riviera-docs-freshness` close-out run + review gate (not a test class).

## Non-goals

- **No per-day override table or schedule** — the kill switch writes the standing setting
  (epic decision; its copy says so).
- **No arbitrary close times** — exactly the three fixed values.
- **No cancellation-policy change** — the evening-before cutoff keeps its cancellation
  role untouched; this slice only *relabels* it.
- **No read-side/tourist change** — `salesOpen` projection (#793) and the reserve fence
  (#791/#792) already exist; no booking-module code changes.
- **No new endpoint** for the kill switch; no venue-create-card control (the console
  exposes the setting twice, per the issue).
- **No component/file rename** of `booking-cutoff-field.ts` — copy relabel only; testIds
  (`venue-cutoff`, `venue-create-cutoff`) stay stable.

## Behavior-parity ledger

`N/A — new behavior, replaces nothing.` The one surface *changed* (not replaced) is the
cutoff field's label copy; its behavior (Signal Forms `required`, `Europe/Tirane` note in
the label, both consumer surfaces) is preserved verbatim and re-asserted by the existing
specs — see R-2.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Daily-view kill switch's GET→PATCH read-modify-write races a concurrent profile edit (or double-tap) and clobbers/409s | med | med | Optimistic `version` token makes the race lose loudly (409); on 409 the notice says "couldn't close — try again" and re-reads; no auto-retry loop | impl | closed — shipped as designed: the fresh GET's `version` guards the PATCH, a 409 shows "try again" + re-reads (pinned by `daily-view-tab.spec.ts` "a lost 409 race"), `closeSalesBusy` gates the double-tap |
| R-2 | Relabel misses a consumer — `booking-cutoff-field` is shared by the venue tab AND the create card (incl. their two "required" validation messages) | med | low | Relabel inside the shared component once; update both message strings (`venue-tab.ts`, `venue-create-card.ts`); both surfaces' specs assert the new copy | impl | closed — relabeled once inside the shared component; both consumers' "required" messages updated; `booking-cutoff-field.spec.ts` + `venue-create-card.spec.ts` + `venue-tab.spec.ts` assert the new copy |
| R-3 | FE sends `salesClose` but a naming mismatch lets Jackson silently drop it (no `FAIL_ON_UNKNOWN_PROPERTIES`) → "saved" without effect | low | high | AC-1 IT round-trips through the read API; e2e asserts the wire body key; one wire token set (`"HH:mm"`, same `CUTOFF` formatter as the read) | impl | closed — `patchUpdatesSalesClose` round-trips through the read API; `operator-venue.e2e.ts` + `operator-daily.e2e.ts` assert the wire key; one `"HH:mm"` token set both directions |
| R-4 | #791's pin `VenueAdminControllerIT.patchCannotReachSalesClose` contradicts the new behavior if left standing | high | low | Phase 0 step explicitly inverts it (becomes `patchUpdatesSalesClose`); `patchIgnoresReadOnlyCommissionAndCurrency` stays (commission asymmetry survives) | impl | closed — inverted in phase 0; `patchIgnoresReadOnlyCommissionAndCurrency` stays (its body gained the required field, F-2) |
| R-5 | The Java mirror drifts from the V44 CHECK (invariant #4 vocabulary) | low | med | The `SalesClose` enum is the **single** Java mirror (no separate validator set); `SalesCloseTest` pins its three `time()` values against the CHECK tokens; `SalesCloseMigrationIT.checkRejectsAnyOtherTime` keeps pinning the DB side | impl | closed — `SalesClose` is the single mirror; `SalesCloseTest` pins the three times against the CHECK tokens; `SalesCloseMigrationIT` untouched |
| R-6 | New busy-flag name trips `check-focus-posture.mjs` BUSY-1, or the confirm flow skips a focus leg (FOCUS-1) | med | low | Copy the payouts weather-refund inline two-step verbatim (`[appBusy]`, `focusMover()` on all three legs); add the flag stem to `BUSY_STEMS` only if no existing stem fits | impl | closed — `closeSalesBusy` carries the existing `busy` stem (no `BUSY_STEMS` edit); all three `focusAfterRender` legs shipped; guards green |
| R-7 | Full PATCH from the daily view re-serializes a profile field wrongly (e.g. amenity codes, photos excluded) → silent profile corruption | low | high | One mapping helper `toProfileUpdate(view)` in `operator-console.model.ts`, unit-tested against the venue-tab save shape; e2e asserts untouched fields survive the kill switch | impl | closed — `toProfileUpdate(view)` shared by the venue tab and the kill switch; `operator-daily.e2e.ts` asserts untouched fields survive (name + expectedVersion on the wire) |
| R-8 | Error contract drift on the new 400 (raw `IllegalArgumentException` → 500, issue #118 class) | low | med | Parse inside `InvalidApiRequestException.parsing(...)` exactly like `PhotoSlots`/`parseCode`; `invalidSalesCloseIs400` asserts `$.code == INVALID_REQUEST` | impl | closed — both edges parse inside `InvalidApiRequestException.parsing`; `invalidSalesCloseIs400` + `createRejectsOffVocabularySalesClose` assert `$.code == INVALID_REQUEST` |

## Open questions / Assumptions

- **Assumption (create surface):** the create *API* accepts `salesClose` optionally
  (absent → `16:00`), but the console's create card gets **no** control — the issue says
  the console "exposes it twice" (settings tab + daily view) and AC-2 says "default 16:00
  on create". — *Owner:* maintainer review of this plan · *Resolved:* held through phase 0 (create API optional, no create-card control).
- **Assumption (kill-switch transport):** reuse profile GET + full-replace PATCH; no
  dedicated endpoint. AC-1 pins the setting to the PATCH; a second write path would be a
  new surface the issue doesn't ask for. — *Owner:* maintainer review · *Resolved:* held through phase 2 (GET→PATCH via `closeOnlineSalesNow`; no new endpoint).
- **Assumption (control copy):** the three choices carry human labels, e.g. "00:01 — no
  same-day sales" / "16:00 — mid-afternoon (default)" / "23:59 — all day", with
  `Europe/Tirane` noted once on the group label (mirroring the cutoff field's precedent).
  Final copy is an implement-time call. — *Owner:* impl · *Resolved:* shipped as "00:01 — no same-day sales" / "16:00 — mid-afternoon" (blurb names it the default) / "23:59 — all day", group label "Same-day sales close (Europe/Tirane)".

## Availability & concurrency (invariant #2)

The slice writes **no** `availability(set_id, booking_date)` row and changes **no** claim
path — it edits a `venue` column that `booking`'s existing fence *reads*.

- **Write paths to `availability`:** none touched. The reserve path's claim mechanics
  (`AvailabilityClaim`, `INSERT … ON CONFLICT`) are upstream-gated by the fence but
  unchanged.
- **Uniqueness guarantee / concurrency strategy:** unchanged (V-constraint + atomic claim).
- **Pool rule (#3):** unchanged.
- **Cutoff rule (#4) — the section that matters here:** the fence's one home stays
  `booking/application/BookingCutoff.isBookable(salesClose, date, now)`; the value
  arrives per request via `venue.api.SetBookingFacts` (a `JOIN venue` in
  `SET_BOOKING_INFO_SELECT`) and **nothing on that path caches** (verified: zero
  `@Cacheable`/`CacheManager`/memoization hits in `platform/src/main`), so an owner's
  write is effective on the very next reserve attempt — that's the whole mechanism behind
  "effective immediately", and AC-4/AC-5 pin it end-to-end.
- **Profile-write concurrency:** the venue row's own optimistic `version`
  (`UPDATE … WHERE id = :id AND version = :version`), already raced by
  `VenueProfileConcurrencyIT.exactlyOneWriteWins` — the new column rides the same guarded
  UPDATE, so no new test shape is needed there.
- **Pinning test:** existing `ConcurrentReservationIT` untouched;
  `BookingControllerIT.reserveRefusedAfterOwnerClosesSalesForToday` pins the fence read.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | owns the sales-close setting (CLAUDE.md module table; RESPONSIBILITIES §venue) — this slice adds only its write path |
| M-2 | `booking` | existing — **no code change** | `Booking` | its `BookingCutoff` fence and `BookingControllerIT` host the effective-immediately ITs; the rule itself is untouched |
| M-3 | `operator` | existing — **no code change** | `Operator` | `VenueOwnership.assertOwns` already guards `updateProfile` (first statement) |

**Cross-module named interfaces (`api/` ports)** — none added or changed.
`venue.api.SetBookingFacts` keeps carrying `salesClose` to `booking`; `operator.api.VenueOwnership`
keeps guarding. The `venue.spi` port inventory stays at three (no fourth — the #793
close-out's counting-sweep warning doesn't fire).

**Domain events** — none touched (the five-event inventory is unchanged).

### Domain model (the modeling decision this slice makes)

CONTEXT.md's glossary already defines **Sales close** as *"a per-venue setting fixed at
one of three wall-clock values"* — the domain concept is a **choice**, not an arbitrary
time. This slice makes the code speak that language on the write path:

- **`venue/domain/SalesClose`** — an enum of the three choices, each carrying its
  wall-clock `time()` (`DAY_START` 00:01 · `MID_AFTERNOON` 16:00, the default ·
  `DAY_END` 23:59; constant names are an implement-time call, the glossary meanings are
  not). `fromTime(LocalTime)` is the one conversion in, throwing `IllegalArgumentException`
  for anything off-vocabulary — invalid states are unrepresentable past the edge parse,
  and the enum replaces the separately-planned `SALES_CLOSE_TIMES` validator set
  entirely. Its unit test pins the three `time()` values against the V44 CHECK tokens.
- **Placement: `domain/`, not `vocabulary/`.** No sibling module consumes the choice —
  `booking`'s fence wants a *time* (it computes `date.atTime(salesClose)` and is
  indifferent to the three-ness, which is venue's write constraint). Publishing a type
  nothing external uses is the hypothetical-seam smell; it graduates to `vocabulary/`
  the day a sibling needs the choice itself.
- **The published carriers deliberately keep `LocalTime`** — `SetBookingInfo`,
  `venue.spi.SalesWindow`, `BookingCutoff` are three merged slices' seams and their
  interface is the honest one for the rule they serve. Boundary: commands and the
  aggregate write speak `SalesClose`; the value crosses module seams as its time.
- **No CONTEXT.md change** (the entry is accurate; the glossary carries no
  implementation detail) and **no ADR** — the decision is easily reversible, so it
  fails the ADR bar (hard-to-reverse ∧ surprising ∧ real trade-off); this section and
  RESPONSIBILITIES.md §`venue` at close-out are its record.
- **Revisit trigger:** the moment any *server-side* code branches on the choice
  (per-option behavior, not just storage), the enum is already there to switch on —
  exhaustively, no `default`.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Validate + persist the sales-close choice (PATCH + create) | `venue` | §`venue` Job: owns "the per-venue sales-close setting"; the write joins the existing profile full-replace in `VenueAdminService`/`OnboardVenueService`. Not `booking`'s (its Not-My-Job: stores no venue settings) |
| Decide whether a date is bookable after the change | `booking` | unchanged — §`booking`: `BookingCutoff` is the single cutoff authority; `availability` §Not-My-Job explicitly rejects it |
| Verify the actor owns the venue | `operator` (consulted) | invariant #13 via `operator.api.VenueOwnership`, already the first statement of `updateProfile` |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; commission/payout untouched (and the PATCH
keeps ignoring `commissionBps`/`payoutCurrency` — `patchIgnoresReadOnlyCommissionAndCurrency`
stays green).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-tab.ts/.html` | modify | standalone component | signals | Signal Forms — `salesClose` joins `VenueDetailsModel` + `form()`; `SegmentedControl` binds via `[formField]` (it already satisfies `FormValueControl`: a `value` model signal). Fallback if binding friction appears: side signal like `amenityDraft` |
| FE-2 | `operator/booking-cutoff-field.ts` | modify (copy only) | shared field component | — | label → "Free-cancellation deadline (Europe/Tirane)"; both consumers' "required" messages updated |
| FE-3 | `operator/daily-view-tab.ts/.html` | modify | standalone component | signals; inline two-step confirm (payouts weather-refund pattern: `[appBusy]`, `focusMover()` three legs, `aria-live` notice) | none |
| FE-4 | `operator/operator-console.model.ts` + `operator-console.service.ts` | modify | model + `@Service()` | — | `salesClose: SalesCloseTime` on `VenueProfileView`/`VenueProfileUpdate` (`type SalesCloseTime = '00:01' \| '16:00' \| '23:59'`); `toProfileUpdate(view)` helper; service `closeOnlineSalesNow(venueId)` composing GET→PATCH |
| FE-5 | `shared/segmented-control.ts` | reuse (expected zero change) | shared control | radiogroup semantics, roving tabindex, `[appTouchTarget]` per option | consumed via `[formField]` |

**Standards:** v22 — standalone (no `standalone: true`), no explicit OnPush, signals +
`computed()`, `input()`/`output()`/`model()`, native `@if/@for`, `@Service()`, `inject()`,
no `ngClass`/`ngStyle`. The tab stays in `operator/` (feature-owns-its-models); nothing
new enters `shared/` and no frozen cross-feature edge widens (the daily view's existing
`venue.service` edge is grandfathered — the kill switch uses `operator-console.service`,
adding no new edge). Styling is Tailwind-only: reuse `SegmentedControl`'s existing
classes and the amber confirm block's tokens; no new tokens, no SCSS
(`riviera-tailwind` — new literal colors would need contrast-spec stops; avoid by reusing
tokens).

## FE↔BE contract

- **Changed endpoints:**
  - `PATCH /api/venues/{venueId}` — request gains **required** `salesClose: "00:01" | "16:00" | "23:59"`
    (full replace: the form always re-sends it). Missing/other → `400 INVALID_REQUEST`;
    stale `expectedVersion` → `409 STALE_WRITE` (unchanged).
  - `POST /api/venues` — request gains **optional** `salesClose` (absent → `16:00`).
  - `GET /api/venues/{venueId}/profile` — already returns `salesClose` as `"HH:mm"` (#791); unchanged.
- **Client typing:** hand-written union `SalesCloseTime` in `operator-console.model.ts`;
  no `as any`. The wire keeps the `"HH:mm"` shape both directions (the read's `CUTOFF`
  formatter), so the FE never parses times.
- **Money/date on the wire:** N/A — no money; the setting is a wall-clock token,
  `Europe/Tirane` semantics stated in copy (invariant #6 reasoning stays server-side).

## Execution status

> **This section is the session-recovery anchor** — see the template blockquote; update in
> the same commit window as the change it records.

**Stage pointer:** `implement complete — PR #802 ready for review (session 2026-08-29); review gate + Sonar gate pending, run in a separate session; merge close-out (merged via PR #NN citation + freshness re-check) after that`

**Next action:** run the review gate (`/code-review` per the pr-gates invocation ladder +
`riviera-review-overlay`) and the Sonar gate against PR #802 — a separate session's job.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend write path (PATCH + create + vocabulary) | ✅ | "Make the sales-close setting venue-editable via profile PATCH and create (#794)" |
| 1 — Settings tab control + cutoff relabel | ✅ | "Add the sales-close control to the venue settings tab and relabel the cancellation deadline (#794)" |
| 2 — Daily-view kill switch | ✅ | "Add the one-tap close-today kill switch to the daily view (#794)" |
| 3 — Docs + close-out (RESPONSIBILITIES.md, freshness run, self-review) | ✅ | "Record the owner-editable sales close in the substrate docs and close out the plan (#794)" |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | impl (phase 0) | AC-5's step-4 note said "mocked clock mid-afternoon"; `BookingControllerIT` has no fixed-clock context, so the test uses the file's own R-5 boundary trick instead (00:01 stands in for a lapsed 16:00, re-opened to 23:59) — deterministic except within a minute of Tirane midnight, same residual as the #791 tests | closed (deviation recorded) |
| F-2 | impl (phase 0) | `patchIgnoresReadOnlyCommissionAndCurrency` kept its commission pin but its raw body needed the now-required `salesClose` field (R-4's "stays" meant the asymmetry, not the byte-identical body) | closed |
| F-3 | impl (phase 0) | `BookingControllerIT` gained `riviera.operator.password=test-operator-pw` for the owner PATCH; the property pair matches `CheckInFlowIT`/`StaffBookingControllerIT` exactly, so it joins their cached Spring context rather than forking a new one | closed |
| F-4 | impl (phase 1) | The `[formField]` binding makes `salesClose` load-bearing at render time: `operator-venue-photos.e2e.ts`'s profile fixture lacked it and the tab's render crashed mid-cycle (`model.required` read while unset), timing out three photo tests. Fixture completed; enumerated every other fixture (`git grep -rln bookingCutoff frontend/e2e` ∖ `salesClose`) — none left | closed |
| F-5 | impl (phase 1) | `operator-venue.e2e.ts`'s stale-write test raced `bump()` against the profile load (latent; exposed when F-4 slowed the run) — the test now waits for the seeded form before bumping, so version 7 is provably loaded first | closed |
| F-6 | CI (phase 0 push) | `check-plan-file-structure` flagged three touched-but-unlisted paths; File structure updated (commit "List every phase-0-touched path…") | closed |
| F-7 | CI (phase 0 full suite) | Four ITs outside the scoped set (`CrossVenueDenialIT` ×2, `AdminVenueCommissionIT`, `BookingModeSwitchIT`) PATCH the profile with raw bodies that lacked the now-required `salesClose` → 400. Bodies completed; the `"distanceToWaterM"`-body sweep confirms none remain (create bodies are exempt — the field is optional there) | closed |

---

## File structure

- `docs/plans/operator-sales-close-control.md` — this plan.
- `platform/src/main/java/ai/riviera/platform/venue/domain/SalesClose.java` — the three-choice enum: `time()`, `fromTime(LocalTime)`, `DEFAULT`.
- `platform/src/test/java/ai/riviera/platform/venue/domain/SalesCloseTest.java` — pins the three times against the V44 CHECK tokens; rejects off-vocabulary input.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileCommand.java` — `SalesClose salesClose` component (required).
- `platform/src/main/java/ai/riviera/platform/venue/application/NewVenueCommand.java` — `salesClose`, null → `SalesClose.DEFAULT`.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueFieldValidation.java` — `requireSalesClose` (presence-only; the vocabulary lives in the type).
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileView.java` — TSDoc/Javadoc "read-only display this slice" note updated.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/UpdateVenueProfileRequest.java` — wire field + parse (`InvalidApiRequestException.parsing`).
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/CreateVenueRequest.java` — optional wire field + parse.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — Javadoc "display-only" sentence updated.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — UPDATE SET `sales_close = :salesClose`; INSERT column.
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — invert `patchCannotReachSalesClose` → `patchUpdatesSalesClose`; `invalidSalesCloseIs400`; `createAcceptsExplicitSalesClose`; extend `createDefaultsSalesCloseAndProfileReturnsIt`, `staleVersionPatchIs409`, the `profileBody(...)` helper and round-trip tests.
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueProfileCommandTest.java` — `nullSalesCloseIsRejected` (the off-vocabulary case lives in `SalesCloseTest`).
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — command construction sites thread the new component.
- `platform/src/test/java/ai/riviera/platform/venue/VenueProfileConcurrencyIT.java` — same threading; the guarded-UPDATE race shape is unchanged.
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` · `venue/AdminVenueCommissionIT.java` · `venue/BookingModeSwitchIT.java` — their raw profile-PATCH bodies gain the now-required `salesClose` (F-7).
- `platform/src/test/java/ai/riviera/platform/booking/BookingControllerIT.java` — `reserveRefusedAfterOwnerClosesSalesForToday`, `reserveSucceedsAfterOwnerReopensSalesForToday` (reuse `onlineSetAtSalesClose`).
- `frontend/src/app/operator/operator-console.model.ts` — `SalesCloseTime`, `salesClose` on `VenueProfileView`/`VenueProfileUpdate`, `toProfileUpdate(view)`.
- `frontend/src/app/operator/operator-console.service.ts` — PATCH doc update; `closeOnlineSalesNow(venueId)`.
- `frontend/src/app/operator/venue-tab.ts` · `.html` · `.spec.ts` · `.a11y.spec.ts` · `.contrast.spec.ts` — the three-choice control + save wiring + specs (a11y `PROFILE` constant gains `salesClose`).
- `frontend/src/app/operator/booking-cutoff-field.ts` · `.spec.ts` — label + TSDoc relabel; the spec pins the new copy.
- `frontend/src/app/operator/venue-create-card.ts` · `.spec.ts` — "required" message copy for the relabeled field; the spec's label inventory follows.
- `frontend/e2e/operator-venue-photos.e2e.ts` — profile fixture gains `salesClose` (a fixture without it crashes the tab's render — see F-4).
- `frontend/src/app/operator/daily-view-tab.ts` · `.html` · `.spec.ts` · `.a11y.spec.ts` · `.contrast.spec.ts` — kill switch + confirm + notice + specs (the contrast spec re-pins the payouts amber pattern per file).
- `frontend/e2e/operator-venue.e2e.ts` — control save + wire-body assertions; mock gains `salesClose`.
- `frontend/e2e/operator-daily.e2e.ts` — kill-switch journey incl. axe.
- `frontend/e2e/support/operator-console.mocks.ts` — `profile()` fixture gains `salesClose`.
- `RESPONSIBILITIES.md` — §`venue` sales-close bullet: write path replaces "read-only this slice".
- `docs/design/riviera-operator-console-v2.dc.html` — the artboard's "Booking cutoff" label gains the standard `as-built diverges — see #794` note (freshness run).
- `scripts/check-focus-posture.mjs` — only if a novel busy-flag stem is unavoidable (`BUSY_STEMS`).

---

## Phase 0 — Backend write path (PATCH + create + vocabulary)

**Files:** Create `venue/domain/SalesClose.java` · Modify `VenueProfileCommand.java`,
`NewVenueCommand.java`, `UpdateVenueProfileRequest.java`, `CreateVenueRequest.java`,
`JdbcVenues.java`, `VenueProfileResponse.java`, `VenueProfileView.java` · Test
`SalesCloseTest.java`, `VenueAdminControllerIT.java`, `VenueProfileCommandTest.java`,
`BookingControllerIT.java`

- [x] **Step 1: Write the failing tests** — invert #791's pin and add the new edge cases:

```java
@Test
void patchUpdatesSalesClose() {
    // replaces patchCannotReachSalesClose (#791's read-only pin — deliberately inverted here)
    var venueId = createVenue();
    patchProfile(venueId, profileBody("Miramar", "INSTANT", "18:00", "00:01", List.of(), null, currentVersion(venueId)))
        .andExpect(status().isNoContent());
    getProfile(venueId).andExpect(jsonPath("$.salesClose").value("00:01"));
}

@Test
void invalidSalesCloseIs400() {
    var venueId = createVenue();
    patchProfile(venueId, profileBody("Miramar", "INSTANT", "18:00", "12:00", List.of(), null, currentVersion(venueId)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    getProfile(venueId).andExpect(jsonPath("$.salesClose").value("16:00"));
}
```

and at the domain level:

```java
@Test
void fromTimeRejectsAnythingButTheThreeValues() {
    assertThrows(IllegalArgumentException.class, () -> SalesClose.fromTime(LocalTime.of(12, 0)));
    assertThrows(IllegalArgumentException.class, () -> SalesClose.fromTime(null));
}

@Test
void theThreeChoicesMirrorTheV44CheckTokens() {
    assertEquals(LocalTime.of(0, 1), SalesClose.DAY_START.time());
    assertEquals(LocalTime.of(16, 0), SalesClose.MID_AFTERNOON.time());
    assertEquals(LocalTime.of(23, 59), SalesClose.DAY_END.time());
    assertEquals(SalesClose.MID_AFTERNOON, SalesClose.DEFAULT);
}
```

(`profileBody` gains a `salesClose` parameter — thread it through every existing call site.)

- [x] **Step 2: Run, verify FAIL** — `./gradlew test --tests "*VenueAdminControllerIT*" --tests "*VenueProfileCommandTest*"` (load `riviera-local-debug` first; Docker ITs skip cleanly without a daemon — run what the sandbox allows and lean on CI for the rest, honestly noted in the commit).

- [x] **Step 3: Minimal implementation** — the domain type (see *Domain model* above):

```java
/** The venue's sales-close choice — invariant #4; times mirror venue_sales_close_check (V44). */
public enum SalesClose {
    DAY_START(LocalTime.of(0, 1)), MID_AFTERNOON(LocalTime.of(16, 0)), DAY_END(LocalTime.of(23, 59));

    public static final SalesClose DEFAULT = MID_AFTERNOON;
    private final LocalTime time;

    SalesClose(LocalTime time) { this.time = time; }

    public LocalTime time() { return time; }

    public static SalesClose fromTime(LocalTime time) {
        return Arrays.stream(values()).filter(c -> c.time.equals(time)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("salesClose must be one of 00:01, 16:00, 23:59"));
    }
}
```

Then: `SalesClose` components on both commands (`NewVenueCommand` normalizes null →
`SalesClose.DEFAULT`; `VenueProfileCommand` requires it), wire fields on both request
records parsed as `LocalTime` then `SalesClose.fromTime(...)` inside the existing
`InvalidApiRequestException.parsing(...)` boundary, `JdbcVenues.updateVenueProfile` SET
clause gains `sales_close = :salesClose` bound from `command.salesClose().time()`,
`insertVenue` gains the column, and the two stale "display-only / no PATCH field"
Javadoc sentences on `VenueProfileView` / `VenueProfileResponse` are updated (the read
model keeps `LocalTime` — it only displays).

- [x] **Step 4: Run, verify PASS** — same scoped commands; then the cross-module ITs
  (`BookingControllerIT.reserveRefusedAfterOwnerClosesSalesForToday` /
  `reserveSucceedsAfterOwnerReopensSalesForToday`: owner PATCH via the edge, tourist
  reserve today via the edge, mocked clock mid-afternoon).

- [x] **Step 5: Generalization-audit pass** — population: *every write statement that
  persists `venue` profile columns* → enumerate
  `git grep -n "UPDATE venue\|INSERT INTO venue\b" platform/src/main` → confirm exactly
  the two statements in `JdbcVenues` carry the column and no other writer exists. Append
  to the log.

- [x] **Step 6: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` (backend structure touched, even without new packages).

- [x] **Step 7: Commit** — `Make the sales-close setting venue-editable via profile PATCH and create (#794)` — and open the **draft PR** (CI fires on `pull_request` only).

- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Settings tab control + cutoff relabel

**Files:** Modify `operator-console.model.ts`, `operator-console.service.ts`,
`venue-tab.ts/.html`, `booking-cutoff-field.ts`, `venue-create-card.ts` · Test
`venue-tab.spec.ts`, `venue-tab.a11y.spec.ts`, `venue-tab.contrast.spec.ts`,
`operator-venue.e2e.ts` (+ its mock)

- [x] **Step 1: Failing unit spec** — the save body carries the chosen value:

```ts
it('sends the chosen sales close with the full-replace PATCH', async () => {
  await loadTab({ salesClose: '16:00' });
  pickSalesClose('00:01');            // click the segmented option
  save();
  const req = httpMock.expectOne(r => r.method === 'PATCH');
  expect(req.request.body.salesClose).toBe('00:01');
  expect(req.request.body.expectedVersion).toBe(7);
});

it('labels the cutoff as the free-cancellation deadline', async () => {
  await loadTab({});
  expect(label('venue-cutoff')).toContain('Free-cancellation deadline (Europe/Tirane)');
});
```

- [x] **Step 2: Run, verify FAIL** — `npm test -- venue-tab` (scoped).

- [x] **Step 3: Minimal implementation** —
  - `VenueDetailsModel` gains `salesClose: SalesCloseTime`; `form()` schema unchanged
    beyond the field (all three values valid ⇒ no validator; `required` implicit in the
    union + seed). Template:

```html
<app-segmented-control
  [formField]="detailsForm.salesClose"
  [options]="SALES_CLOSE_OPTIONS"
  variant="card"
  ariaLabel="Sales close for online bookings (Europe/Tirane)"
  data-testid="venue-sales-close" />
```

  (per the v22 custom-controls doc, `SegmentedControl`'s `value` model satisfies
  `FormValueControl`; if the binding fights the generic `T`, fall back to the
  `amenityDraft`-style side signal merged in `onSave()` — decide in this step, note the
  outcome here. **Outcome: `[formField]` bound cleanly** — the generic inferred
  `SalesCloseTime` from the options input; no fallback, zero `SegmentedControl` changes.
  One consequence: a profile fixture *without* `salesClose` now crashes the tab's render
  (`model.required` read while unset) — how F-4 surfaced.)
  - Options with human labels per the copy assumption; group label carries the
    `Europe/Tirane` note.
  - `booking-cutoff-field.ts` label span → `Free-cancellation deadline (Europe/Tirane)`;
    TSDoc updated; `venue-tab.ts` message → `'Free-cancellation deadline is required'`,
    `venue-create-card.ts` → same copy.
  - `onSave()` includes `salesClose` in the `VenueProfileUpdate`; `seed()` seeds it.
  - a11y spec `PROFILE` constant gains `salesClose: '16:00'`; contrast spec: no new
    literal colors expected (token reuse) — add stops only if any appear.

- [x] **Step 4: Run, verify PASS** — `npm test -- venue-tab` · `npm run lint` ·
  `npm run format:check`; e2e: extend `operator-venue.e2e.ts` (mock profile gains
  `salesClose`, save asserts wire body, axe re-run on the tab) — `npm run test:e2e:a11y -- operator-venue`.

- [x] **Step 5: Generalization-audit pass** — population: *every FE construction site of
  `VenueProfileUpdate` or profile fixture* → enumerate
  `git grep -ln "VenueProfileUpdate\|salesClose" frontend/src frontend/e2e` → all send /
  fixture the field; decision recorded.

- [x] **Step 6: Commit** — `Add the sales-close control to the venue settings tab and relabel the cancellation deadline (#794)`.

- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Daily-view kill switch

**Files:** Modify `daily-view-tab.ts/.html`, `operator-console.service.ts`,
`operator-console.model.ts` · Test `daily-view-tab.spec.ts`, `daily-view-tab.a11y.spec.ts`,
`operator-daily.e2e.ts`, `support/operator-console.mocks.ts`

- [x] **Step 1: Failing unit spec:**

```ts
it('closes today via the standing setting after confirm', async () => {
  await loadDaily();                       // frozen clock: today
  click('daily-close-sales');              // trigger → inline confirm appears
  expect(text('daily-close-sales-confirm-panel')).toContain('stays closed for future days');
  click('daily-close-sales-confirm');
  httpMock.expectOne(r => r.method === 'GET' && r.url.endsWith('/profile')).flush(PROFILE);
  const patch = httpMock.expectOne(r => r.method === 'PATCH');
  expect(patch.request.body.salesClose).toBe('00:01');
  expect(patch.request.body.name).toBe(PROFILE.name);   // full replace, faithfully mapped
  patch.flush(null, { status: 204, statusText: 'No Content' });
  expect(text('daily-notice')).toContain('closed');
});
```

- [x] **Step 2: Run, verify FAIL** — `npm test -- daily-view-tab`.

- [x] **Step 3: Minimal implementation** —
  - `toProfileUpdate(view: VenueProfileView): VenueProfileUpdate` in the model (photos
    dropped, `expectedVersion` from `view.version`) — unit-tested; `venue-tab.onSave()`
    reuses it where it fits.
  - Service: `closeOnlineSalesNow(venueId)` = GET profile → PATCH
    `{...toProfileUpdate(view), salesClose: '00:01'}`; errors narrowed via the existing
    `venueProfileErrorOf`.
  - Daily view header card (`daily-view-tab.html` date/summary strip): the trigger button
    (shown only when the selected date is today and the map read's `salesOpen !== false`),
    inline two-step confirm copied from the payouts weather-refund shape — amber block,
    explanatory sentence stating **it persists for future days until changed back in
    Venue & commodities**, `[appBusy]` confirm + Cancel, `focusMover()` on all three
    legs, `[appTouchTarget]` on all three controls. Outcome lands in the existing
    `daily-notice` `aria-live` output; on success re-run `load()` so `salesOpen` and the
    button state reconcile; on `STALE_WRITE`/error the notice says try again.
  - When today is already closed (`salesOpen === false`), render the static "Online sales
    for today are closed" line instead of the button (the map read already carries the
    verdict per date).
- [x] **Step 4: Run, verify PASS** — `npm test -- daily-view-tab` · lint/format · e2e:
  `operator-daily.e2e.ts` journey (tap → confirm copy → wire body → notice; axe after
  settle) + `operator-console.mocks.ts` `profile()` gains `salesClose`;
  `npm run test:e2e:a11y -- operator-daily touch-targets`.
- [x] **Step 5: Generalization-audit pass** — population: *every surface that renders a
  sales-window state to the operator* → enumerate `git grep -ln "salesOpen" frontend/src`
  → decide per site whether the kill switch's state change must reconcile it (today:
  daily view reconciles via `load()`; tourist surfaces re-read per request).
- [x] **Step 6: Commit** — `Add the one-tap close-today kill switch to the daily view (#794)`.
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Docs + close-out

**Files:** Modify `RESPONSIBILITIES.md`, this plan doc.

- [x] **Step 1:** Rewrite §`venue`'s sales-close bullet: the setting is owner-editable via
  the profile PATCH/create (edge validation mirroring the CHECK), the commission
  write-proof asymmetry now names sales-close as the exception it no longer mirrors.
- [x] **Step 2:** `riviera-docs-freshness` over the slice's range (the #793 close-out's
  count-sites list: `venue.spi` inventory unchanged at three — verify, don't assume).
- [x] **Step 3:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged first), `node scripts/check-inline-comments.mjs --diff origin/main`,
  `node scripts/check-touch-target.mjs --all` — all green before ready-for-review.
- [x] **Step 4:** Finalize Execution status (stage pointer, phase rows with commits, ACs
  verified, risks closed, `merged via PR #NN` at close-out — never a merge SHA); run the
  Self-review checklist; mark the PR ready for review → Review gate (`/code-review` per
  the invocation ladder) + Sonar gate per `references/pr-gates.md`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-29 | phase 0 commit | Every write statement persisting venue profile columns | `git grep -n "UPDATE venue\b\|INSERT INTO venue\b" platform/src/main` | 4 Java sites in `JdbcVenues` + V3 seed | `insertVenue` + `updateVenueProfile` carry `sales_close`; `updateLiveRate` (commission) and the `set_version` bump touch other columns by design; the V3 seed takes the 16:00 DEFAULT. No other writer exists — no action |
| 2026-08-29 | phase 1 commit | Every FE construction site of `VenueProfileUpdate` or profile fixture | `git grep -ln "VenueProfileUpdate\|salesClose" frontend/src frontend/e2e` | venue-tab save + `toProfileUpdate` (send it); 5 operator fixtures (carry it); tourist `salesOpen` sites are the #793 read projection, untouched by design | fixtures completed (F-4); no other action |
| 2026-08-29 | phase 2 commit | Every surface rendering a sales-window state to the operator or tourist | `git grep -ln "salesOpen" frontend/src` | daily view (the kill switch's own surface — reconciles via `load()` after either outcome); tourist home + venue-map read `salesOpen` per request (#793) and need no reconcile | no action beyond the daily view's own reload |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-6:** `./gradlew test --tests "*VenueAdminControllerIT*" --tests "*VenueProfileCommandTest*" --tests "*BookingControllerIT*"` → all pass. Verified locally at commit `fa66cd8` (+ `28f064a` for the widened IT bodies); CI full suite green at run 2897.
- [x] **AC-7..AC-9:** `npm test` (1973) · a11y/contrast specs · `npm run test:e2e:a11y` (venue 6, daily 8, touch-targets 33) → all pass. Verified locally at commit `62f3319`.
- [x] **AC-10:** RESPONSIBILITIES.md §`venue` rewritten (owner-editable write path; commission now the only mirrored write-proof field); freshness run recorded below.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section filled; concurrency posture stated (invariant #2 untouched, #4 is the live one).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event changes (invariant #11).
- [x] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [x] Refund policy untouched server-side (invariant #10).
- [x] Timezone correct: the setting stays a `Europe/Tirane` wall-clock token; fence math unchanged (invariant #6).
- [x] Booking codes untouched (invariant #7).
- [x] No schema change ⇒ no migration; V44's CHECK still the DB-side pin (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
