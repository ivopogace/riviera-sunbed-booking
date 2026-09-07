# Console nav 3/7 — the venue name becomes the venue switcher Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** In the venue console header the current venue's name renders at title weight beside
the brand; for an operator who owns more than one venue it is a disclosure button whose popover
(`Your venues`) lists the owned venues with the current one `aria-current="page"`, each row
keeping the open tab on the other venue, and a foot row `Add another venue` that leaves the
account chip; with one venue it is plain text; signed out it renders nothing; and the owned list
is loaded on a deep-linked console, not only on the landing.

**Architecture:** One new component, `operator/operator-venue-switch.ts`
(`app-operator-venue-switch`), mounted by the console header in place of the 10px caption. It
follows the account chip's disclosure contract exactly (a `<button aria-expanded aria-haspopup>`,
the `shared/popover-skin.ts` recipes, Escape / backdrop / row activation return focus to the
button, a navigation elsewhere or a click outside closes without moving it) and reads the
session-scoped `core/owned-venues.ts` store itself — it is the one console consumer of that list,
so it is also the one that triggers the read on a deep link (the store dedupes and caches, so the
landing's and the auth page's reads stay one request). The console passes it the venue id, the
best-effort name and the **current tab path** (parsed from `shared/current-url.ts`; default
`beach-map`, the console's index redirect), so a row links to `/operator/<id>/<same tab>` and the
router reuses the console instance — the reactive `venueId` reload the console already has is what
re-reads the title, strip, badge and tab. The popover anchors to the header row (the switcher's
nearest positioned ancestor), not to the name, so it cannot overhang a narrow viewport.

**Persistence:** JDBC only (invariant #1). No backend change — the read is the existing
`GET /api/venues/mine`; nothing new on the wire.

**Source of intent:** GitHub issue #1009 (parent epic #1006, decisions 11 and 12 in the spike's
`VERDICT.md` on `claude/operator-admin-nav-prototype-727vnz`; `proto-venue-switch.ts` there is the
layout reference, not code to copy).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that the
in-place switch already has a real-route harness seam, `console-venue-switch.spec.ts`, to extend
rather than a new one; that `Create a venue` has five call sites to drop, not one; that #1008's
plan doc is still in `docs/plans/` and retires at this close-out; and that the header row, not the
name, is the safe popover anchor at 344px) · `riviera-plan-doc` (this template — forced the seam
per AC and the behavior-parity ledger for the caption and the chip row it replaces) · `tdd` (each
phase red first at the named seam, scoped Vitest runs) · `riviera-review-overlay` (review gate —
runs at ready-for-review) · `riviera-docs-freshness` (**pending** — runs at close-out over
`origin/main..HEAD`; the substrate states nothing about the console header's venue caption, so 0
findings expected) · `grilling` (the intake questions answered from the code, decisions flagged
`← confirm?` below rather than auto-filled) · `riviera-local-debug` (unshallowed the clone; scoped
`npx vitest run <files>`; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e)
· `riviera-frontend` (a new feature component lands flat in `operator/`; `core/owned-venues.ts`
is consumed, never moved; the e2e belongs to the mocked suite) · `riviera-tailwind` (the popover,
backdrop and row recipes reused from `shared/popover-skin.ts`, no `@apply`; `appTouchTarget` on
the name button and every row; tokens only — `text-riv-ink`, the `--riv-pop-*` family incl. the
already-declared `border-riv-pop-divider`) · `angular-developer` + angular-cli MCP (loaded at
phase 1 — `input()`/`computed()`/`effect()` + `untracked` for the load, `viewChild.required` for
the focus target, `host` bindings for the document listeners) · `playwright-cli` (loaded at phase
3 — the two-venue console case, the touch-target sweep with the popover open).

**Branch:** `claude/venue-name-switcher-hm26td` (the session's designated remote branch stands in
for `feature/console-nav-venue-switcher`, per the `riviera-sdlc` cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in operator who owns two venues, when the console for venue 1
  renders, then the header shows `Miramar Beach Club` as a `<button>` with `aria-haspopup` and
  `aria-expanded="false"`, and opening it shows a popover headed `Your venues` listing both venues
  (name over beach) with venue 1's row `aria-current="page"`, plus `Add another venue`; given one
  owned venue, the name is plain text and no such button exists; given a signed-out session, the
  switcher renders nothing. *Seam:* the console template through `data-testid="oc-venue-title"` /
  `oc-venue-menu`, with `GET /api/venues/mine` flushed through `HttpTestingController` ·
  *Pinned by:* `operator-console.spec.ts` › `shows the venue name as the switcher for two owned venues (#1009)`,
  `… › renders the venue name as plain text for one owned venue (#1009)`;
  `operator-venue-switch.spec.ts` › `renders nothing signed out and never reads the list`.
- [ ] **AC-2:** Given the console at `/operator/1/daily` with venue 1's title, strip and a
  Requests badge of 3, when the operator chooses venue 2 in the popover, then the URL is
  `/operator/2/daily`, the console instance is reused, the title reads venue 2's name, the badge
  reads venue 2's count, every tab link carries `/operator/2/…`, and nothing of venue 1 remains
  rendered. *Seam:* the real route table via `RouterTestingHarness` (unit) and the routed SPA over
  `page.route` mocks (e2e) · *Pinned by:*
  `console-venue-switch.spec.ts` › `switches venue from the header popover, keeping the tab and reusing the shell (#1009)`;
  `operator-console.e2e.ts` › `switches venue from the header, keeping the tab and leaving nothing of the old venue (#1009)`.
- [ ] **AC-3:** Given a direct visit to `/operator/1/daily` (the guard's `returnUrl` round trip, no
  landing page), when the console renders, then the switcher is populated from `GET /api/venues/mine`
  fired by the console itself; a reload on that URL populates it again. *Seam:* the mocked route +
  the switcher's `OwnedVenues.load()` call · *Pinned by:* the same e2e case (deep-link entry +
  reload); `operator-venue-switch.spec.ts` › `loads the owned list once on mount when signed in`.
- [ ] **AC-4:** Given the popover is open, when `Add another venue` is chosen, then the app
  navigates to `/operator?create=1`; and the account chip's popover no longer holds `Create a venue`
  on either header. *Seam:* the switcher's foot row `href`; the chip's row set through
  `oc-account-menu` / `opc-account-menu` · *Pinned by:*
  `operator-venue-switch.spec.ts` › `links the foot row to the create state`;
  `operator-account-chip.spec.ts` › `opens the popover: identity block, Change password, Sign out — no Create a venue, no Admin console for a non-admin (#1009)`;
  `operator-console.spec.ts` › `moves Create a venue out of the account chip and under the venue name (#1009)`;
  `operator-chrome.spec.ts` (the first case, asserting `opc-create-venue` absent).
- [ ] **AC-5:** Given the popover is open with a row focused, when Escape is pressed or the
  backdrop is clicked, then the popover closes and focus is on the name button; every row and the
  button measure ≥ 44 × 44 CSS px at 390px; the console with the popover open has no serious axe
  violation. *Seam:* the component's DOM + `document.activeElement` (unit); `expectTouchTargets` and
  `expectNoSeriousAxeViolations` (e2e) · *Pinned by:*
  `operator-venue-switch.spec.ts` › `closes on Escape and returns focus to the name button`,
  `… › closes on backdrop click and returns focus to the name button`;
  `touch-targets.e2e.ts` › `operator console — daily view, venue switcher open (#1009)`;
  the `operator-console.e2e.ts` case above (axe with the popover open).
- [ ] **AC-6:** Given porcelain, the venue name at title weight (`--riv-ink`, α 1) composites
  ≥ 4.5:1 on the header glass over every porcelain stop; the popover rows (`--riv-pop-ink`), the
  beach line and `Your venues` heading (`--riv-pop-ink-soft`) and the current row
  (`--riv-pop-accent` on `--riv-pop-hover`) composite ≥ 4.5:1 on the pop surface. *Seam:* the
  token mirrors in `src/testing/glass-tokens.ts` · *Pinned by:*
  `operator-console.contrast.spec.ts` › `header venue name (title weight, full ink) meets AA on the header glass`;
  `operator-venue-switch.contrast.spec.ts` (three cases).

## Non-goals

- The shell's section row, `Your venues` on admin/plain pages, the retirement of
  `app-operator-chrome` and the console's own header (#1011, slice 4).
- The phone rail, the Fold 344px pass and the section row hiding on scroll (#1012, slice 5).
- The ⌘K palette's venue rows (#1013).
- A retry control in the bar for a failed owned-venues read (the `/operator` landing keeps its
  retry card; the bar degrades to the plain name).
- Any change to `core/owned-venues.ts`, the `/operator` picker, or the backend.
- Hoisting the disclosure mechanics the chip and the switcher now share into a directive — two
  copies of a 20-line pattern; the palette (slice 6) is the third disclosure and the point to
  extract.

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces the header's venue caption and moves one chip row.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Caption renders the venue name from the best-effort venue read, `Your venue` while loading / on failure | preserved | the switcher's `venueName` input, same fallback string, same `data-testid="oc-venue-title"` |
| Caption drops to `Your venue` the moment the param changes, before venue 2 loads | preserved | the console still clears `venueName` on each `load(id)`; the switcher only renders the input |
| Caption styled 10px tracked uppercase `--riv-ink-faint` under the wordmark | changed (issue: the most legible word in the bar, invariant #13) | 17px bold `--riv-ink` beside the brand, truncating; contrast row re-pinned at α 1 |
| Header row wraps (`flex-wrap`) | changed | `flex-nowrap` so the name truncates instead of pushing the chip to a second row (the #1008 one-row e2e stays green) |
| Account chip row `Create a venue` → `/operator?create=1`, closes the popover and returns focus to the chip | changed (moved) | the switcher's foot row `Add another venue`, same target, same close + focus return; absent from both chips |
| `Create a venue` reachable from the thin chrome (`/operator` picker, password page, `/admin`) | dropped for this slice (issue: "leaves the account chip in this slice") | the picker's own `Add another venue` link stays; slice 4 mounts the switcher on those pages as `Your venues` |
| The chip's `oc-create-venue` / `opc-create-venue` test ids | dropped | replaced by `oc-venue-add` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Every console spec now leaves `GET /api/venues/mine` outstanding and `httpMock.verify()` goes red across the folder (`operator-console.spec.ts`, `.a11y.spec.ts`, `console-venue-switch.spec.ts`) | high | low | a `flushOwned()` helper in each spec's mount path, run the three files before committing phase 2 | agent | open |
| R-2 | The longer name pushes the phone header onto two rows or the page wider than the viewport (390px / 344px) | med | med | brand `shrink-0`, `Operator` hidden below `sm`, the name `min-w-0 truncate`, row `flex-nowrap`; the popover anchored to the header row with `max-w-[calc(100%-3rem)]`; e2e asserts no page overflow with the popover open at 344px | agent | open |
| R-3 | Two disclosures in one header each own a document-level Escape and click listener | low | low | each no-ops while closed (the chip's `dismiss()` pattern); unit case: opening the switcher does not touch the chip | agent | open |
| R-4 | A venue switch leaves venue 1's data on screen (invariant #13) | low | high | the console's epoch guard already discards superseded reads; the e2e pins title, strip tile, badge and tile count for venue 2 and asserts venue 1's tile count is gone | agent | open |
| R-5 | The other console e2e specs never mock `/api/venues/mine`; the switcher's read errors and the bar shows the plain name | high | none | best-effort by design; no existing assertion reads the switcher; the console e2e's `mockConsole` mocks it (default one venue) | agent | open |
| R-6 | `aria-haspopup="true"` announces a menu while the popover is a list of links | low | low | the issue's AC names the attribute; the chip omits it — flagged for the maintainer below (`← confirm?`) | maintainer | open |
| R-7 | Focus returns to the name button after a row activation, but a switch re-renders the button when the name input changes | low | med | the button element is stable (`@if` on the venue count, not the name); unit case asserts `document.activeElement` after activation and the harness case asserts it after the real navigation | agent | open |

## Open questions / Assumptions

- **Assumption:** `aria-haspopup="true"` on the name button, as the issue's AC and the spike have it
  (the chip deliberately omits it; a link popover is not a `menu`) — `← confirm?` at review.
  *Owner:* maintainer · *Resolves by:* review gate.
- **Assumption:** the popover anchors to the header row (left-aligned with the brand, `top-full`),
  not to the name, so it never overhangs at 344px — the spike anchored it under the name. `← confirm?`
  *Owner:* maintainer · *Resolves by:* review gate.
- **Assumption:** a failed owned-venues read renders the plain name (the one-venue form), never an
  empty popover, and is not retried from the bar. *Owner:* agent · *Resolves by:* phase 1.
- **Assumption:** the `oc-venue-title` test id stays on the name in both forms (button and plain
  text) so every existing spec and e2e that reads the title keeps working. *Owner:* agent ·
  *Resolves by:* phase 2.
- **Assumption:** the thin chrome offers no create-venue entry until slice 4 (the issue's "leaves the
  account chip in this slice"). *Owner:* agent · *Resolves by:* phase 0.

### Resolved

- The seam for the in-place switch already exists: `console-venue-switch.spec.ts` (#180) proves the
  router reuses the shell on a param-only navigation over the real routes — extended, not
  duplicated (intake gate, plan commit).
- The next Flyway version is irrelevant: no migration in scope (intake gate).
- #1008's close-out is complete (issue closed via PR #1015, epic comment posted); its plan doc
  `docs/plans/console-nav-account-chip.md` retires in this PR's close-out (intake gate).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the slice reads the owned-venue list and navigates between
consoles; no `set_availability` write path, no booking.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. The one read, `GET /api/venues/mine`, is the existing session-scoped
`venue` endpoint; no port, event or controller changes.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| In-app venue switching from the console header | frontend `operator/` | a console surface; the owned-venue read stays `venue`'s (session-scoped, owner-asserted server-side — invariant #13 needs no client check) |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-venue-switch.ts` | new | standalone component | `input()` ×3, `signal` open state, `computed` venues/current, `effect` + `untracked` for the load, `viewChild.required` focus target | none |
| FE-2 | `operator/operator-console.ts` + `.html` | existing | layout component | adds `section = computed(currentUrl)`; header row restructured | none |
| FE-3 | `operator/operator-account-chip.ts` | existing | component | drops the `Create a venue` row and its id | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. No deviation.

## FE↔BE contract

N/A — no contract change (`GET /api/venues/mine` → `OwnedVenue[]`, unchanged).

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** phase 2 — flush `/api/venues/mine` in the console specs and red the two-venue header state.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `Create a venue` leaves the account chip | ✅ | 4887e86e |
| 1 — `OperatorVenueSwitch` + its unit and contrast specs | ✅ | phase-1 commit |
| 2 — the console mounts it; host, a11y, contrast and harness specs | | |
| 3 — mocked e2e: the two-venue case, the touch-target sweep, the chip row lists | | |
| 4 — merge `origin/main`, ready for review, review + Sonar gates, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/console-nav-venue-switcher.md` — this plan.
- `docs/plans/console-nav-account-chip.md` — #1008's plan doc, retired at this close-out.
- `frontend/src/app/operator/operator-venue-switch.ts` — the switcher component.
- `frontend/src/app/operator/operator-venue-switch.spec.ts` — its disclosure contract, the three states, the load.
- `frontend/src/app/operator/operator-venue-switch.contrast.spec.ts` — the popover's AA proofs.
- `frontend/src/app/operator/operator-console.ts` — the current-tab signal, the switcher import.
- `frontend/src/app/operator/operator-console.html` — the header row: brand + switcher + chip.
- `frontend/src/app/operator/operator-console.spec.ts` — the owned flush, the three states, the moved row.
- `frontend/src/app/operator/operator-console.a11y.spec.ts` — the owned flush; axe with the popover open.
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — the title row at α 1.
- `frontend/src/app/operator/console-venue-switch.spec.ts` — the owned flush; the popover-driven switch over the real routes.
- `frontend/src/app/operator/operator-account-chip.ts` — drops `Create a venue`.
- `frontend/src/app/operator/operator-account-chip.spec.ts` — row sets and ids without it.
- `frontend/src/app/operator/operator-chrome.spec.ts` — asserts the row is gone from the thin chrome.
- `frontend/e2e/operator-console.e2e.ts` — `mockConsole` mocks `/api/venues/mine` + venue 2; the two-venue case; the chip row list.
- `frontend/e2e/operator-chrome.e2e.ts` — the chip row list.
- `frontend/e2e/touch-targets.e2e.ts` — the sweep with the venue popover open.

---

## Phase 0 — `Create a venue` leaves the account chip

**Files:** Modify `operator-account-chip.ts`, `operator-account-chip.spec.ts`,
`operator-chrome.spec.ts`, `operator-console.spec.ts`; e2e `operator-console.e2e.ts:287`,
`operator-chrome.e2e.ts:36`.

- [ ] **Step 1: Write the failing test** — in `operator-account-chip.spec.ts` the row-set cases
  become `['Change password', 'Sign out']` / `['Admin console', 'Change password', 'Sign out']`, the
  id list drops `create-venue`, and a new assertion pins `oc-create-venue` absent; the console spec's
  `exposes a reachable create-venue link` case inverts to assert the chip has no such row (the
  switcher's `oc-venue-add` joins it in phase 2); the chrome spec asserts `opc-create-venue` null.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/operator/operator-account-chip.spec.ts src/app/operator/operator-chrome.spec.ts` → FAIL on the row set.
- [ ] **Step 3: Minimal implementation** — remove the `<a … Create a venue>` block and the
  `createVenue` id from `operator-account-chip.ts`; TSDoc row list updated.
- [ ] **Step 4: Run it, verify it passes** — same command + `operator-console.spec.ts` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every reference to the chip's create row
  → `grep -rn "create-venue\|Create a venue" frontend/src frontend/e2e` → the two e2e row lists
  (`operator-console.e2e.ts`, `operator-chrome.e2e.ts`) updated in this phase; the landing's own
  `operator-home-add-venue` and the `?create=1` deep links stay.
- [ ] **Step 6: Commit** — `Move Create a venue out of the account chip (#1009)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 1 — `OperatorVenueSwitch` + its unit and contrast specs

**Files:** Create `operator-venue-switch.ts`, `operator-venue-switch.spec.ts`,
`operator-venue-switch.contrast.spec.ts`.

- [ ] **Step 1: Write the failing tests** — a host `<app-operator-venue-switch [venueId]="1"
  venueName="Miramar Beach Club" section="daily" />` with `OperatorAuth` stubbed (`signedIn`
  signal) and `OwnedVenues` stubbed (`venues` signal + `load` spy), under `provideRouter` with
  blank pages for `/operator`, `/operator/:venueId/daily`:

```ts
it('renders the name as a disclosure for two venues, closed', () => {
  expect(button().getAttribute('aria-haspopup')).toBe('true');
  expect(button().getAttribute('aria-expanded')).toBe('false');
  expect(button().textContent).toContain('Miramar Beach Club');
  expect(menu()).toBeNull();
});
it('opens: Your venues, name over beach, the current row aria-current, rows keep the tab', () => {
  open();
  expect(menu()!.textContent).toContain('Your venues');
  expect(rowHrefs()).toEqual(['/operator/1/daily', '/operator/2/daily', '/operator?create=1']);
  expect(currentRows()).toEqual(['Miramar Beach Club']);
});
```

  plus: one venue → `oc-venue-title` is not a button and no `aria-haspopup`; signed out → host
  empty and `load` not called; signed in → `load` called once; `Your venue` fallback without a
  name; Escape / backdrop / row activation close and focus the button; navigation elsewhere and an
  outside click close without moving focus; a click inside stays open.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/operator/operator-venue-switch.spec.ts` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — the component per the Architecture paragraph:

```ts
@Component({
  selector: 'app-operator-venue-switch',
  imports: [RouterLink, TouchTarget],
  host: {
    class: 'flex min-w-0 items-center',
    '(document:keydown.escape)': 'dismiss()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `@if (operator.signedIn()) { @if (venues().length > 1) { <button #name appTouchTarget … aria-haspopup="true" [attr.aria-expanded]="open()" data-testid="oc-venue-title" (click)="toggle()">…</button> @if (open()) { backdrop + popover } } @else { <span data-testid="oc-venue-title">…</span> } }`,
})
export class OperatorVenueSwitch {
  readonly venueId = input.required<number>();
  readonly venueName = input<string | undefined>(undefined);
  readonly section = input.required<string>();
  …
  constructor() {
    effect(() => { if (this.operator.signedIn()) { untracked(() => void this.owned.load()); } });
    inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.open.set(false));
  }
}
```

- [ ] **Step 4: Run it, verify it passes** — the spec + the contrast spec → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: header disclosures (`grep -rln "aria-expanded" frontend/src/app --include=*.ts --include=*.html`) → `app.html` (tourist ×3), `operator-account-chip.ts`, the new switcher; decision: no extraction at two operator copies (Non-goals).
- [ ] **Step 6: Commit** — `Add the venue switcher disclosure with its unit and contrast specs (#1009)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — the console mounts it

**Files:** Modify `operator-console.ts`, `operator-console.html`, `operator-console.spec.ts`,
`operator-console.a11y.spec.ts`, `operator-console.contrast.spec.ts`, `console-venue-switch.spec.ts`.

- [ ] **Step 1: Write the failing tests** — `flushOwned(httpMock, venues)` added to every mount
  helper (R-1); the two AC-1 states in the host spec; the moved row (`oc-venue-add` present,
  `oc-create-venue` absent); the harness case in `console-venue-switch.spec.ts`: at
  `/operator/1/daily` open the popover, click venue 2's row → `router.url === '/operator/2/daily'`,
  same shell instance, title `Second Venue`, badge `1`, tab links `/operator/2/…`, focus on the
  name button; the a11y spec's popover-open case; the contrast row at α 1.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/operator/operator-console.spec.ts src/app/operator/console-venue-switch.spec.ts` → FAIL (no button, unflushed `mine`).
- [ ] **Step 3: Minimal implementation** — `section = computed(() => /^\/operator\/\d+\/([^/?#]+)/.exec(this.url())?.[1] ?? 'beach-map')` over `currentUrl(this.router)`; header row `relative flex-nowrap` with `Riviera <span class="max-sm:hidden">Operator</span>` `shrink-0` and `<app-operator-venue-switch [venueId]="venueId()!" [venueName]="venueName()" [section]="section()" />`.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/operator/` → PASS; `npm run lint`, `npm run format:check`.
- [ ] **Step 5: Generalization-audit pass** — population: specs that mount the console and call `httpMock.verify()` → `grep -rln "OperatorConsole" frontend/src/app --include=*.spec.ts` → the three files above; all flushed.
- [ ] **Step 6: Commit** — `Mount the venue switcher in the console header (#1009)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — mocked e2e

**Files:** Modify `e2e/operator-console.e2e.ts`, `e2e/touch-targets.e2e.ts`.

- [ ] **Step 1: Write the failing test** — `mockConsole(page, …, venues)` mocks
  `/api/venues/mine` (default one venue) and, for two, venue 2's five reads with a 3-set map and a
  1-request queue; the case: deep link `/operator/1/daily` → sign in → the button, popover rows,
  hrefs, `aria-current`, axe; Escape → focus; choose venue 2 → URL, title, `oc-stat-free` `1 / 3`,
  badge `1`, three `daily-tile`s, no `/operator/1/…` tab link; reload → still populated; at 344px
  the popover open leaves no page overflow. The touch sweep: `daily` with the venue popover open.
- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts operator-console touch-targets.e2e` → FAIL before phase 2's build is served… (the case is written against the built app; red is the pre-phase-2 tree if run there, else the assertion on the popover).
- [ ] **Step 3/4: Run to green** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: e2e specs that render the console shell (`grep -rln "oc-header" frontend/e2e`) → none other asserts the switcher; R-5 stands.
- [ ] **Step 6: Commit** — `Prove the venue switch end to end: deep link, same tab, no stale venue (#1009)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 4 — integrate, review, close out

- [ ] Merge `origin/main`, re-run the scoped specs, push; open the PR (draft first, then ready).
- [ ] Review gate per `references/pr-gates.md` §1; Sonar list cleared; findings re-enter at Implement.
- [ ] Close-out in the last code-touching commit: retire `console-nav-account-chip.md`, finalize this section, epic comment on #1006.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 0 | every reference to the chip's create row (test id or label) | `grep -rn "create-venue\|Create a venue" frontend/src frontend/e2e` | the chip + its spec, the console and chrome specs, two e2e row lists; the landing's `operator-home-add-venue` and the `?create=1` deep links are the landing's own | all five call sites updated; the landing untouched |
| 2026-09-07 | phase 1 | header disclosures (a button with `aria-expanded` opening a popover) | `grep -rln "aria-expanded" frontend/src/app --include=*.ts --include=*.html` | `app.html` (tourist ×3), `operator-account-chip.ts`, the new switcher | no extraction at two operator copies (Non-goals); the palette is the third and the point to extract |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-6:** filled at close-out with the verifying commands and commit.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
