# Beach Map Mode-Aware Copy Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The tourist beach map explains its own deal where the tap happens — a REQUEST
venue's footer says nothing is charged until the venue accepts, an INSTANT venue keeps
booking wording — while the cutoff note invites ("Book any day from tomorrow") instead of
forbidding, wears an SVG clock instead of the ⏰ emoji, and the pan hint shrinks to one
quiet line. Display only: every rule stays server-enforced.

**Architecture:** One decision — **where each string lives follows where its fact lives.**
The two footer variants are per-venue, so they stay in `venue-map.html` behind an `@if` on
the header view's existing `bookingMode` (no new component state, no new `VenueHeader`
field: the venue name the REQUEST line needs is already `v.name`). The pan hint is *shared
chrome*, so its one-line rewrite lands once in `beach-map-canvas.html` and reaches the two
other drag-pan surfaces (Daily view, per-set editor) — which is correct, not collateral:
the gesture and the overflow it describes are identical there. The clock icon is inlined
where it is used rather than promoted to `shared/` — one call site does not buy a seam.

**Persistence:** N/A — frontend-only copy slice; no table, no migration, no SQL
(invariant #1 untouched).

**Source of intent:** GitHub issue #703. Visual reference: the "Refined — mobile, request
venue" artboard on the Beach Map Refinement canvas (2026-08-19 design critique),
`https://claude.ai/code/artifact/464f8512-ec58-441f-aeca-284b484abe71` — the artboards
supplied the two footer strings verbatim; they render no header, so the cutoff copy is the
issue's own wording.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the pan hint lives in the *shared* canvas, not the tourist map, so the slice's blast radius
is three surfaces, and that "appears only when the grid overflows" is already today's
behavior) · `riviera-plan-doc` (this template — forced the behavior-parity ledger, which is
what turned "copy-only" into an enumerated per-string verdict) · `tdd` (each phase writes
the copy assertion red first, then edits the template) · `riviera-review-overlay` (review
gate — runs at ready-for-review) · `riviera-docs-freshness` (ran at close-out over the
slice's own range — see Execution status) · `riviera-frontend` (placement: the footer
strings stay in the `venue/` feature, the hint in `shared/`; no new file, no new
cross-feature edge) · `riviera-tailwind` (the SVG carries no colour of its own —
`stroke="currentColor"` under the note's existing `text-(--riv-ink-faint)`; `text-[11.5px]`
not `text-xs`; the hint keeps its `data-testid` marker) · `angular-developer` + angular-cli
MCP `get_best_practices` (v22 posture: native `@if` control flow for the mode branch, no
`ngIf`, no new decorator APIs) · `playwright-cli` (both mocked e2e specs already land on
`/venues/1` with the map rendered — the mode coverage is two assertions in existing tests,
not two new specs) · `riviera-local-debug` (scoped Vitest/Playwright runs; the cloud
sandbox cannot afford the full suite).

**Branch:** `claude/sdlc-703-x6vaaf` — **cloud-session substitution** for
`feature/beach-map-mode-aware-copy` (`riviera-sdlc` § Remote/cloud session addendum: the
designated remote branch stands in; the literal `feature/` branch is not created).

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests (Cockburn 2005). This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.

This slice's inner hexagon is the browser: it adds no backend behavior and no API call, so
every AC is a rendered-surface assertion by construction. Each names its pinning spec.

- [ ] **AC-1:** Given a venue whose `bookingMode` is `INSTANT`, when its map renders, then
  the map footer reads "Pick any free set to book it · prices are per set, full day." and
  contains neither the word "Tap" nor the word "request". *Pinned by:*
  `venue-map.spec.ts › 'the INSTANT footer names booking, device-neutrally'` and
  `booking-flow.e2e.ts › 'booking flow is accessible end-to-end'`.
- [ ] **AC-2:** Given a venue whose `bookingMode` is `REQUEST`, when its map renders, then
  the footer reads "Pick a set to request it — you pay only once Miramar Beach Club
  accepts." over a second line "Prices are per set, full day.", naming that venue.
  *Pinned by:* `venue-map.spec.ts › 'the REQUEST footer explains the no-charge deal at the
  tap, naming the venue'` and `request-to-book.e2e.ts › 'request-to-book: request dialog →
  202 PENDING_REQUEST → request-sent → pending view'`.
- [ ] **AC-3:** Given any tourist map, when the cutoff note renders, then its text states
  the rule positively — "Book any day from tomorrow — each day's sales close at 6 PM the
  evening before." — carries no ⏰ (or any emoji), and its leading glyph is an
  `aria-hidden="true"` inline `<svg>`, so the note's accessible text is the sentence alone.
  *Pinned by:* `venue-map.spec.ts › 'states the cutoff as an invitation, iconed by an
  aria-hidden SVG (no emoji)'`.
- [ ] **AC-4:** Given a map grid that overflows its viewport on either axis with drag-pan
  on, when the hint renders, then it is the single sentence "Drag or swipe to see the whole
  beach." with no decorative glyph; and given a grid that does not overflow, or a
  `dragPan`-off surface, then no hint renders at all. *Pinned by:*
  `beach-map-canvas.spec.ts › 'the pan hint is one plain line, no decorative glyph'` plus
  the six existing hint-gating cases in that file (unchanged).
- [ ] **AC-5:** Given the map after all copy changes, when the mocked e2e suite runs both
  modes, then `expectNoSeriousAxeViolations` passes on the beach map in each.
  *Pinned by:* `booking-flow.e2e.ts` + `request-to-book.e2e.ts` (existing axe calls, which
  now cover the changed copy).
- [ ] **AC-6:** Given the whole slice, when the diff is read, then no file under
  `frontend/src/app/venue/venue-map.ts`, `frontend/src/app/shared/beach-map-canvas.ts`, or
  any backend path changed — the date fence (`minDate()`/`defaultBookingDate`), the request
  flow and the payment flow are byte-identical. *Pinned by:* `git diff --stat` at the
  Acceptance-criteria verification step + the Behavior-parity ledger below.

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **The Discover page's own cutoff note** (`pages/home/home.html`, `data-testid="cutoff-note"`,
  still ⏰ + "Bookings close the evening before — book by 6 PM the day before. Today isn't
  available."). #703 scopes itself to the map; changing Discover's copy would also move
  `discovery-flow.e2e.ts:212`'s assertion. The divergence this slice knowingly ships — map
  positive + SVG, Discover negative + emoji — is recorded in Open questions as a follow-up
  candidate, not silently left.
- **Promoting the clock icon to a shared component.** One call site; the second caller
  (Discover, above) is out of scope, so the seam is not bought yet.
- **The ⏰ elsewhere in the app** (`operator/requests-tab.html`'s urgent time-left chip) —
  a different meaning (urgency, not a rule) on a different surface.
- **Any behavior change.** No fencing, no request-flow, no payment, no availability logic.
- Restyling the footer/hint beyond the copy and the glyph swap (sizes, colours, spacing
  stay as shipped).

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

Three existing strings are replaced, so the ledger is filled per string plus per behavior
the strings ride on.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Footer "Tap any free set to book it · prices are per set, full day." — one line, mode-blind | **changed** | INSTANT keeps the sentence with "Tap"→"Pick" (device-neutral); REQUEST gets its own two-line variant. Both branches keep the per-set/full-day fact — it is the tail of the INSTANT line and the second line of REQUEST |
| Footer is projected content (`canvasFooter`) owned by the tourist map | **preserved** | still one `<p canvasFooter>` in `venue-map.html`; the canvas's slot contract is untouched, so the three operator surfaces are unaffected by the footer change |
| Footer suppressed entirely on a zero-set venue (#717 — canvas drops legend+grid+footer together) | **preserved** | unchanged `@else`/`canvasEmpty` path in the canvas; `venue-map.spec.ts`'s #717 case is retargeted to the new string, not deleted |
| Cutoff note "Book by 6 PM the day before — today isn't bookable." | **changed** | positively reframed; states the same 6 PM evening-before rule. The *fact* is preserved, the framing is not |
| Cutoff note's ⏰ emoji, `aria-hidden`, with `&ngsp;` separating glyph from copy | **changed** | inline `<svg aria-hidden="true">` clock. The `&ngsp;` goes with it: it existed so the emoji's text node did not run into the sentence, and an `<svg>` contributes no text — the flex `gap-1` still does the visual spacing |
| Cutoff note is display-only; the picker's `min` is the real client fence and the server the real authority (invariant #4) | **preserved** | `[min]="minDate()"` and `defaultBookingDate` untouched; `venue-map.ts` not modified at all. The spec's `min` assertion stays in the same test |
| Cutoff note's `data-testid="cutoff-note"` + `text-(--riv-ink-faint)` on header glass | **preserved** | both kept — `venue-map.contrast.spec.ts:146` reads that token pairing and must keep passing |
| Pan hint "Drag or swipe to pan the map — this beach is bigger than your screen." with a ✦ glyph | **changed** | one plain sentence, "Drag or swipe to see the whole beach."; the ✦ (and its `&ngsp;`) drop as the "quieter" half of the ask |
| Pan hint gated on `(scrollHint() ‖ vScrollHint()) && dragPan()` — genuine overflow on **either** axis, never on a paint-gesture surface | **preserved** | condition untouched. AC-4's "appears only when the grid overflows" is today's behavior; reading it as "horizontal only" would regress a tall map, so the six gating specs stay as the guard |
| Pan hint renders above the projected footer | **preserved** | element order in `beach-map-canvas.html` unchanged (and it matches the artboard) |
| Pan hint copy is shared by the Daily view + per-set editor (layout editor is `dragPan=false`, so it never shows one) | **changed, deliberately** | both adopt the shorter line. Same gesture, same overflow, and #674 F-3's rule — never instruct a gesture the surface doesn't have — still holds, because "drag or swipe" is exactly what a `dragPan` surface offers |

> Case history — **O6 #176**: the plan said "restyle only," but the new Requests tab replaced
> StaffDaily's post-action **reconcile** with a local card removal — a *dropped* behavior that
> read as *preserved*. The workflow review found it plus 5 siblings (stale queue, frozen clock,
> badge races) as **14 findings**, ~40% of the build effort spent re-fixing. One ledger row at
> plan time would have pre-empted the whole class.

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.
> Fill before phase 0; use the `grilling` skill if risks aren't yet visible.

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The REQUEST footer states *when money moves* ("you pay only once {venue} accepts"). If the real flow ever charged earlier, the map would lie about payment on the surface where the tourist commits | low | high | Verified against the shipped flow before writing the string: `VenueMap.onRequested()` routes to the request-sent screen with nothing charged; the pay step is driven by `BookingPaymentDue` after the venue accepts (`CLAUDE.md` § booking). The string asserts no client-side rule — invariant #8 keeps the webhook authoritative | agent | closed — copy matches the shipped request flow |
| R-2 | "appears only when the grid overflows" (AC) misread as *horizontal* overflow, dropping `vScrollHint()` and stranding a tall map with no hint | med | med | The condition is not touched at all, and the six existing gating specs (incl. the vertical-only case) are left in place as the regression net | agent | closed by construction — `beach-map-canvas.ts` unmodified |
| R-3 | The pan-hint edit is in shared chrome; an operator surface's spec or e2e could assert the old sentence and go red | med | low | Enumerated by mechanism before editing: `grep -rn "scroll-hint\|Drag or swipe" src e2e` → only `beach-map-canvas.spec.ts` (presence/absence, no text) and `venue-map-pan.e2e.ts` (visibility only). No operator spec reads the copy | agent | closed — see Generalization-audit log |
| R-4 | The map's cutoff note is reframed while Discover's stays negative + emoji, shipping two voices for one rule | high | low | Deliberate and recorded (Non-goals + Open questions), not accidental; the map is the surface #703 scopes. A follow-up issue is offered at close-out | agent | open → Open questions Q-1 |
| R-5 | Copy assertions elsewhere break on the retired strings (the #717 zero-set case asserts `not.toContain('Tap any free set to book it')` — a *negative* assertion that keeps passing against the new string and so silently stops testing anything) | med | med | That exact case is retargeted to the new INSTANT string in Phase 0, not left to pass vacuously; `grep -rn "Tap any free set\|isn.t bookable"` re-run at the end of the slice must return zero | agent | closed in Phase 0 — retargeted, and the audit found a second site (the canvas spec's projection stub) | 
| R-6 | First inline `<svg>` in the app (`grep -rln "<svg" src/app` → none): an unsized or currentColor-less icon could break the note's line box or its AA contrast on header glass | low | med | Fixed `width`/`height` in px, `stroke="currentColor"` so it inherits `text-(--riv-ink-faint)` (the token the contrast spec already proves AA), `aria-hidden="true"`, `shrink-0` inside the existing `inline-flex` | agent | open → closes in Phase 1 |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Q-1 (open question):** Should Discover's cutoff note (`pages/home/home.html`) adopt the
  same positive framing + SVG clock, so one rule has one voice? Out of scope for #703 by
  its own ACs. — *Owner:* maintainer · *Resolves by:* close-out — raised in the PR/reply as
  a follow-up-issue offer; if declined, the divergence stands as recorded in Non-goals.

### Resolved

- **A-1 (assumption → resolved at plan time):** the artboard's pan hint reads **"Swipe to
  see the whole beach."**, but "swipe" is exactly the device-specific verb #703 is
  eliminating three lines above ("Tap" → "Pick", *"it's a click on desktop"*). Resolved by
  taking the artboard's shorter payoff clause and keeping the existing dual verb:
  **"Drag or swipe to see the whole beach."** — one line, honest on both pointer types.
- **A-2 (assumption → resolved at plan time):** the REQUEST footer is **two lines** (the
  artboard breaks "Prices are per set, full day." onto its own row) while INSTANT stays one
  line with the `·` separator. Both strings are taken verbatim from the artboard; the issue
  quoted only the REQUEST lead sentence.
- **A-3 (assumption → resolved at plan time):** the cutoff wording is **not** on the canvas
  (the artboards render only the map card — no header, no date picker), so the issue's own
  parenthetical is the reference and this plan pins the exact string.
- **A-4 (assumption → resolved at plan time):** no `VenueHeader`/`venue-map.ts` change is
  needed — `bookingMode` is already carried on the header view for the booking dialog, and
  `v.name` supplies the venue name the REQUEST line interpolates.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The slice changes rendered strings and one
decorative glyph on the tourist map plus the shared canvas's hint. It writes nothing, calls
no API, and touches no set state: `availability(set_id, booking_date)` has no write path in
this diff. The two invariants the copy *describes* are unmoved — the cutoff (#4) is still
fenced by `defaultBookingDate` client-side and by the server authoritatively, and the
REQUEST footer's payment claim rests on invariant #8 (webhook as truth), neither of which
this diff can reach: `venue-map.ts` and `beach-map-canvas.ts` are not modified (AC-6).

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend file is in scope; no module, port, or event is added,
moved, or consumed differently.

### Module ownership (§4a)

**N/A — frontend-only, and no behavior is added or moved.** The only placement decision is
Angular-side and belongs to `riviera-frontend`: the two per-venue footer strings stay in the
`venue/` feature (they read `venue`-owned view state), the pan hint stays in `shared/`
(chrome three surfaces share). No new file, and no new cross-feature import — so the five
frozen RV-FE-8 edges are unchanged.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves and no payment code is touched. One nuance
worth stating because the diff *mentions* payment: the REQUEST footer's "you pay only once
{venue} accepts" is a **description of the shipped flow**, not a new rule — the tourist is
charged only after the venue accepts and a `BookingPaymentDue` pay step follows, with the
signature-verified webhook remaining the only thing that confirms (invariant #8). No amount,
currency, or rounding appears in the new copy (invariant #5 not engaged).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` | existing | template of a standalone component | reads the existing `venueView()` computed (`bookingMode`, `name`); no new signal | none |
| FE-2 | `shared/beach-map-canvas.html` | existing | template of a standalone component | reads the existing `scrollHint()`/`vScrollHint()`/`dragPan()`; condition unchanged | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, `NgOptimizedImage` for new images. Document any deviation. (Full detail in the in-repo
`angular-developer` skill's `references/`.)

Deviations: none. The mode branch uses native `@if`; the icon is inline `<svg>`, not an
`<img>`, so `NgOptimizedImage` does not apply (it is a 14px decorative glyph, not a raster
asset — inlining also keeps it a zero-request, theme-following `currentColor` mark).

## FE↔BE contract

**N/A — no contract change.** `VenueMapView` is read exactly as before; `bookingMode` was
already on the wire and already consumed (the mode chip + the booking dialog).

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation.

**Stage pointer:** `implement (phase 1)`

**Next action:** Phase 1 step 1 — rewrite the cutoff case in
`frontend/src/app/venue/venue-map.spec.ts` red against the positive copy + `<svg aria-hidden>`,
keeping its `min` assertion.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Mode-aware footer + device-neutral verb | ✅ | `<phase-0-sha>` |
| 1 — Positive cutoff note + inline SVG clock | | |
| 2 — One-line quiet pan hint | | |
| 3 — Close-out (docs freshness, plan-doc final state) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/beach-map-mode-aware-copy.md` — this plan doc
- `frontend/src/app/venue/venue-map.html` — mode-aware footer; positive cutoff note + inline SVG clock
- `frontend/src/app/venue/venue-map.spec.ts` — REQUEST fixture + footer/cutoff copy assertions
- `frontend/src/app/shared/beach-map-canvas.html` — one-line pan hint, ✦ removed
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — pan-hint copy assertion
- `frontend/e2e/booking-flow.e2e.ts` — INSTANT footer assertion on the rendered map
- `frontend/e2e/request-to-book.e2e.ts` — REQUEST footer assertion on the rendered map

---

## Phase 0 — Mode-aware footer + device-neutral verb

**Files:** Modify `frontend/src/app/venue/venue-map.html:216-221` · Test
`frontend/src/app/venue/venue-map.spec.ts`, `frontend/e2e/booking-flow.e2e.ts`,
`frontend/e2e/request-to-book.e2e.ts`

- [ ] **Step 1: Write the failing test** — add a REQUEST fixture beside `miramar()` and two
      cases; retarget the #717 zero-set negative assertion (R-5) to the new string.

```ts
/** The same venue in Request-to-Book mode — the map footer is the one surface that branches on it. */
function requestMode(): VenueMapView {
  return { ...miramar(), bookingMode: 'REQUEST' };
}

function flushRequestVenue(): void {
  venueRequest().flush(requestMode());
}

it('the INSTANT footer names booking, device-neutrally', async () => {
  flushVenue();
  await fixture.whenStable();

  const footer = el().querySelector('[canvasFooter]')!;
  expect(footer.textContent).toContain('Pick any free set to book it');
  expect(footer.textContent).toContain('prices are per set, full day');
  expect(footer.textContent).not.toMatch(/tap|request/i);
});

it('the REQUEST footer explains the no-charge deal at the tap, naming the venue', async () => {
  flushRequestVenue();
  await fixture.whenStable();

  const footer = el().querySelector('[canvasFooter]')!;
  expect(footer.textContent).toContain(
    'Pick a set to request it — you pay only once Miramar Beach Club accepts.',
  );
  expect(footer.textContent).toContain('Prices are per set, full day.');
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- venue-map.spec.ts` → FAIL:
      `expected '…Tap any free set to book it · prices…' to contain 'Pick any free set to book it'`

> Scope: target ONE spec file. Not the full suite.

- [ ] **Step 3: Minimal implementation** — replace the single footer `<p>`'s body:

```html
<p
  canvasFooter
  class="text-center text-[12px] text-(--riv-card-ink-faint) mt-2.5 tracking-[0.02em]"
>
  @if (v.bookingMode === 'REQUEST') {
    Pick a set to request it — you pay only once {{ v.name }} accepts.<br />
    Prices are per set, full day.
  } @else {
    Pick any free set to book it · prices are per set, full day.
  }
</p>
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- venue-map.spec.ts` → PASS

> Scope (end-of-phase regression): `npm test -- venue-map` (the venue feature's specs).

- [ ] **Step 5: Generalization-audit pass** — population: *every place that asserts or
      renders the retired footer string*. Enumerate, don't guess. Append to the log.

- [ ] **Step 6: Add the two e2e mode assertions** — one line each, inside the existing
      map-rendered blocks (no new spec files):

```ts
// booking-flow.e2e.ts, after the beach-map axe check (INSTANT):
await expect(page.getByTestId('beach-grid')).toContainText('Pick any free set to book it');

// request-to-book.e2e.ts, after the map heading is visible (REQUEST):
await expect(page.getByTestId('beach-grid')).toContainText(
  'Pick a set to request it — you pay only once Miramar Beach Club accepts.',
);
```

- [ ] **Step 7: Commit** — `git commit -m "Beach map: the footer explains the venue's own booking mode (#703)"`

- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Positive cutoff note + inline SVG clock

**Files:** Modify `frontend/src/app/venue/venue-map.html:88-96` · Test
`frontend/src/app/venue/venue-map.spec.ts:623-632`

- [ ] **Step 1: Write the failing test** — rewrite the existing cutoff case (it already
      asserts the `min`, which must keep passing — AC-6):

```ts
it('states the cutoff as an invitation, iconed by an aria-hidden SVG (no emoji)', async () => {
  flushVenue();
  await fixture.whenStable();

  const note = el().querySelector('[data-testid="cutoff-note"]')!;
  // \s matches the non-breaking space in "6 PM", so the copy reads plainly here.
  expect(note.textContent).toMatch(/Book any day from tomorrow/);
  expect(note.textContent).toMatch(/sales close at 6\s+PM the evening before/);
  expect(note.textContent).not.toContain('⏰');
  const icon = note.querySelector('svg')!;
  expect(icon.getAttribute('aria-hidden')).toBe('true');

  const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
  expect(input.getAttribute('min')).toBe(defaultBookingDate(new Date())); // tomorrow, Europe/Tirane
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- venue-map.spec.ts` → FAIL:
      `expected '⏰ Book by 6 PM the day before — today isn't bookable.' to match /Book any day from tomorrow/`

- [ ] **Step 3: Minimal implementation**

```html
<!-- Cutoff explainer (invariant #4 — display only; the server enforces the real cutoff). -->
<p
  class="inline-flex items-center gap-1 mt-2 text-[11.5px] leading-[1.35] text-(--riv-ink-faint)"
  data-testid="cutoff-note"
>
  <svg
    aria-hidden="true"
    class="shrink-0"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
  <span>Book any day from tomorrow — each day’s sales close at 6&nbsp;PM the evening before.</span>
</p>
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- venue-map.spec.ts` → PASS, then
      `npm test -- venue-map` (picks up `venue-map.contrast.spec.ts`'s ink-faint case).

- [ ] **Step 5: Generalization-audit pass** — population: *every surface rendering the ⏰
      glyph for the cutoff rule*. Enumerate by mechanism, then decide per site.

- [ ] **Step 6: Commit** — `git commit -m "Beach map: state the cutoff as an invitation, not a refusal (#703)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — One-line quiet pan hint

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.html:78-86` · Test
`frontend/src/app/shared/beach-map-canvas.spec.ts`

- [ ] **Step 1: Write the failing test** — one added case; the six gating cases stay (R-2):

```ts
it('the pan hint is one plain line, no decorative glyph', async () => {
  const { host, component, detect, fixture } = render();
  seedGridWidth(host, 500);
  Object.defineProperty(viewport(host), 'clientWidth', { value: 100, configurable: true });
  component.rows.set([...ROWS]);
  detect();
  await fixture.whenStable();
  detect();

  const hint = host.querySelector('[data-testid="scroll-hint"]')!;
  expect(hint.textContent?.trim()).toBe('Drag or swipe to see the whole beach.');
  expect(hint.querySelector('[aria-hidden="true"]')).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- beach-map-canvas.spec.ts` → FAIL:
      `expected '✦ Drag or swipe to pan the map — this beach is bigger than your screen.' to be 'Drag or swipe to see the whole beach.'`

- [ ] **Step 3: Minimal implementation**

```html
@if ((scrollHint() || vScrollHint()) && dragPan()) {
  <p
    class="text-center text-[12px] font-semibold text-(--riv-accent-ink) mt-3"
    data-testid="scroll-hint"
  >
    Drag or swipe to see the whole beach.
  </p>
}
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- beach-map-canvas.spec.ts` → PASS,
      then `npm test -- beach-map-canvas venue-map` for the shared-chrome consumers.

- [ ] **Step 5: Generalization-audit pass** — population: *every spec or e2e reading the pan
      hint's text on any of the four canvas surfaces* (R-3's enumeration, re-run post-edit).

- [ ] **Step 6: Commit** — `git commit -m "Beach map: one quiet line of pan hint (#703)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Close-out

- [ ] **Step 1:** `npm run lint` + `npm run format:check` + `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc staged first).
- [ ] **Step 2:** `npm run test:e2e:a11y -- booking-flow request-to-book venue-map-pan` — the mocked suite, scoped.
- [ ] **Step 3:** `riviera-docs-freshness` over the slice's range; patch or record.
- [ ] **Step 4:** Finalize Execution status (stage DONE, phases ✅ with commits, Open
      questions empty or issue-referenced, `merged via PR #NN`) **in this PR's last commit**.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | plan (R-3, pre-edit) | Every file that reads the pan hint — by test id or by its sentence, not by "looks like a map spec" | `grep -rn "scroll-hint\|Drag or swipe" frontend/src frontend/e2e` | `beach-map-canvas.spec.ts` (presence/absence ×11), `venue-map-pan.e2e.ts` (visibility ×6), `beach-map-canvas.html` (the source) | No copy assertion anywhere → the hint rewrite is safe; Phase 2 adds the first one |
| 2026-08-21 | Phase 0 | Every site that *renders or asserts* the map footer — enumerated by the projection slot `canvasFooter` (the mechanism) as well as by the retired sentence, so a site that carries the copy without naming it is still caught | `grep -rn "canvasFooter\|Tap any free set\|free set to book it" frontend/src frontend/e2e` | `venue-map.html` (source), `venue-map.spec.ts` ×3, `beach-map-canvas.html`/`.ts` (the slot itself), **`beach-map-canvas.spec.ts:52`** — a *test-host projection stub* literally spelling the retired sentence | Retargeted the #717 vacuous negative **and** neutralized the stub to "Projected footer.". The stub is what resemblance-matching would have missed: it is a canvas spec, not a map spec, and its text is never asserted — but it kept `grep "Tap any free set"` returning a hit, which is how a retired string looks alive |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1:** Run `npm test -- venue-map.spec.ts` → the INSTANT footer case passes. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `npm test -- venue-map.spec.ts` → the REQUEST footer case passes. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `npm test -- venue-map.spec.ts` → the cutoff case passes (copy + `<svg aria-hidden>` + no ⏰ + `min` unchanged). Verified at commit `<sha>`.
- [ ] **AC-4:** Run `npm test -- beach-map-canvas.spec.ts` → the new copy case and all six gating cases pass. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `npm run test:e2e:a11y -- booking-flow request-to-book` → both pass, axe green. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `git diff --stat origin/main` → no `.ts` component file and no `platform/` path in the diff. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
