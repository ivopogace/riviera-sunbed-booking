# Near me — client-side geolocation on the riviera map — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A "Near me" control on the riviera map centres it on the visitor's position with a
"you are here" marker after the browser's own permission prompt, shows a short inline message and
leaves the view untouched on every other outcome, is absent when the browser has no Geolocation
API — and the position is consumed in the browser only: no request, no query parameter, no
storage, no log.

**Architecture:** The Geolocation API sits behind a `GeolocationGateway` abstract-class DI token
with one browser adapter and a test fake — the same seam shape as `MapEngine`, `QrScanner` and
`StripePaymentGateway` — so Vitest drives all five outcomes with no real prompt. The control is
**map chrome inside `shared/riviera-map.ts`**, behind an opt-in `nearMe` input: it drives the
map's own camera through the existing `MapHandle` and owns its own marker, so neither consumer
learns anything about geolocation beyond setting one attribute. Nothing above the seam ever sees
a coordinate leave the component.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only slice; no table, no migration, no
backend file.

**Source of intent:** GitHub issue #1100 (sub-issue of epic #806, user stories 7, 8 and the
geolocation half of 18). Blocked by #1098 — **verified merged on `main`** (PR #1102, squash
`ceb53387`, confirmed an ancestor of `origin/main`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that #1099
merged since the issue was written and reshaped the map seam, that `RivieraMap` carries exactly
one pin so "you are here" is a *second* marker, and that AC-4's "phone and fold projects" is
stale) · `riviera-plan-doc` (this template — forced the off-riviera fifth outcome into the ACs
instead of leaving it as a surprise at implement time) · `tdd` (every phase red-green at the
seams named below; no test at an unconfirmed seam) · `riviera-review-overlay` (review gate — runs
at ready-for-review, per `pr-gates.md` §1) · `riviera-docs-freshness` (**runs** at close-out over
`origin/main..HEAD`; the privacy-policy paragraph ships in this slice, not after it) ·
`riviera-frontend` (placement: the gateway is `shared/`-admissible — a browser capability behind a
token, like `MapEngine`; the fake is test-only so it lives in `src/testing/`, not `shared/`;
wiring goes in `app.config.ts`) · `riviera-tailwind` (the theme-invariant `--riv-solid-btn-*`
family for chrome over imagery, the 44 px floor via `[appTouchTarget]`, no `@apply`, the control
column replacing a magic-offset overlay) · `angular-developer` + angular-cli MCP
(`get_best_practices` v22: signals, `input()`, no `standalone`/`OnPush`, host object;
`search_documentation` + the `PendingTasks` API page — read to decide *against* wrapping the
locate call, since a user-initiated prompt is not app stability and a pending fake would hang
`whenStable()`) · Tailwind v4 docs (`aria-*` and `motion-reduce` variant syntax, for the busy
state's `aria-disabled:` utility) · `playwright-cli` (the two-suite split and how the granted
path is driven: `context.grantPermissions(['geolocation'])` + `setGeolocation`) ·
`riviera-local-debug` (scoped Vitest/Playwright runs in a cloud session; `PW_CHROMIUM_EXECUTABLE`
for the mocked suite; the clone was unshallowed before any history claim).

**Branch:** `claude/issue-1100-near-me-tcai84` — the cloud session's designated remote branch
stands in for `feature/near-me-geolocation` (`riviera-sdlc` § Remote/cloud addendum). Exists,
even with `origin/main` at `7eaef545`.

---

## Acceptance criteria (testable)

> Each AC names the seam it observes through. For this frontend-only slice the seams are: the
> `GeolocationGateway` token's contract, the rendered `app-riviera-map` region (the component's
> public DOM + the `MapEngine` seam it drives), and the two Playwright suites.

- [ ] **AC-1:** Given a browser whose `navigator.geolocation` answers with a position, when the
  gateway's `locate()` is called, then it resolves `{ kind: 'located', at }` in lng/lat degrees;
  given `PERMISSION_DENIED` / `POSITION_UNAVAILABLE` / `TIMEOUT` it resolves `denied` /
  `unavailable` / `timeout` respectively — never rejects; and given no `navigator.geolocation` at
  all, `supported()` is `false`. *Seam:* `shared/geolocation.ts`'s `GeolocationGateway` token ·
  *Pinned by:* `geolocation.spec.ts` ("maps each browser outcome", "reports an absent API")
- [ ] **AC-2:** Given a map with `nearMe` on and a gateway reporting the API absent, when the map
  renders, then no near-me control exists in the region (and with `nearMe` off it is absent
  whatever the gateway says; with both on it is present, labelled "Near me" and keyboard
  reachable). *Seam:* the rendered `app-riviera-map` region · *Pinned by:*
  `riviera-map.spec.ts` ("hides the control when the browser has no Geolocation API")
- [ ] **AC-3:** Given a map showing the riviera and a gateway that will answer `located` at a
  riviera position, when the near-me control is activated, then the engine's view is set to that
  position at zoom 12 and a non-focusable `role="img"` marker labelled "You are here" is on the
  map; activating it again after panning re-centres and moves the same marker rather than adding a
  second. *Seam:* the rendered region + the `MapEngine` seam (`FakeMapHandle.view()` /
  `markers()`) · *Pinned by:* `riviera-map.spec.ts` ("centres on the visitor and marks the spot",
  "re-centres on a second press")
- [ ] **AC-4:** Given a gateway that will answer `denied`, `unavailable` or `timeout`, when the
  control is activated, then the matching short message is shown in an alert region, the engine's
  view is byte-for-byte the pre-press view, no marker was added, and the control remains
  activatable for a retry — a retry that succeeds clears the message. *Seam:* as AC-3 ·
  *Pinned by:* `riviera-map.spec.ts` ("reports each failure without moving the map", "clears the
  message on a successful retry")
- [ ] **AC-5:** Given a gateway that answers `located` **outside the map's `maxBounds`** (e.g.
  Munich, 48.14 / 11.58), when the control is activated, then the off-riviera message is shown,
  the view is unchanged and no marker is added — the camera is never handed a position its own
  fence would clamp. *Seam:* as AC-3 · *Pinned by:* `riviera-map.spec.ts` ("refuses a position
  off the riviera")
- [ ] **AC-6:** Given the locate call has not yet answered, when the control is pressed again,
  then it carries `aria-disabled="true"` and the second press reaches no handler (one gateway call
  in total), and focus stays on the control. *Seam:* the rendered region · *Pinned by:*
  `riviera-map.spec.ts` ("is busy, not disabled, while locating")
- [ ] **AC-7:** Given the console's pin placer, when near-me answers `located` and the operator
  then presses *Place pin at map centre*, then the venue location is set to that position — the
  map's own control and the placer's keyboard twin compose, with the here-marker and the venue pin
  both on the map and a tap on the here-marker **not** re-placing the venue pin. *Seam:* the
  rendered `app-venue-location-field` + its `location` model · *Pinned by:*
  `venue-location-field.spec.ts` ("places the pin where near-me centred the map", "a tap on the
  you-are-here marker leaves the venue pin alone")
- [ ] **AC-8:** Given the mocked Playwright suite with `geolocation` granted at a fixed riviera
  position, when Discover's map view is opened and Near me is pressed, then the "you are here"
  marker is visible; and with permission cleared, then the denied message is visible and the map
  view is unchanged. *Seam:* `frontend/e2e/discover-map.e2e.ts` (mocked suite) · *Pinned by:*
  `discover-map.e2e.ts` ("centres on a granted position", "reports a declined permission")
- [ ] **AC-9:** Given the **real** MapLibre adapter on Discover with a granted, distinctive
  position, when Near me is pressed and the map settles, then every request the page made is
  same-origin, and no request URL, request header or request body, no `localStorage` /
  `sessionStorage` entry and no console message contains either coordinate — the #1098 guard
  extended to the granted path. *Seam:* `discover-map.e2e.ts` (real-engine describe) ·
  *Pinned by:* `discover-map.e2e.ts` ("a granted near-me sends the position nowhere")
- [ ] **AC-10:** Given the operator console's venue tab with geolocation granted, when Near me is
  pressed and then *Place pin at map centre*, then the read-out shows the granted coordinates and
  saving persists them. *Seam:* `frontend/e2e/operator-venue-location.e2e.ts` (mocked suite) ·
  *Pinned by:* `operator-venue-location.e2e.ts` ("near me centres the placer, the pin follows")
- [ ] **AC-11:** Given the map region with the near-me control present and with its message shown,
  when axe audits it, then there are no violations; the control clears the 44 px floor on the
  tourist and console sweeps; and its label and message ink clear AA over the solid-button fill,
  with the here-marker's dot clearing 3:1 (WCAG 1.4.11) against the ring it sits in. *Seam:* the
  rendered region (`riviera-map.a11y.spec.ts`), pure maths (`riviera-map.contrast.spec.ts`), the
  measured box (`touch-targets-tourist.e2e.ts`, `touch-targets.e2e.ts`) · *Pinned by:*
  `riviera-map.a11y.spec.ts` ("with the near-me control and a message"),
  `riviera-map.contrast.spec.ts`, the two sweeps
- [ ] **AC-12:** Given the privacy-policy page, when its map section is read, then it states that
  Near me is optional, asks permission, is handled only in the visitor's browser, and is never
  sent to us, stored or logged. *Seam:* the rendered `privacy-policy` page · *Pinned by:*
  `privacy-policy.spec.ts` ("says the map's geolocation never leaves the browser")

## Non-goals

- **No distance sorting, no "venues near me" ranking, no server proximity** — the epic's
  out-of-scope list; this slice centres the camera and nothing else.
- **No accuracy circle, no heading, no watch/live tracking** — one `getCurrentPosition` per press.
- **No permission pre-flight via the Permissions API** (`navigator.permissions.query`): it would
  add a second capability to fake for no behavior the tourist can see, and Safari has never
  supported it for geolocation. The control's presence answers "is the API there", the outcome
  answers everything else.
- **No persistence of the last position** — deliberately, and pinned by AC-9.
- **No new venue pins on the Discover map** — that is #1101, still open and unstarted.
- **No change to the map's `maxBounds`, default view, zoom limits or attribution.**
- **No backend file, no API call, no query parameter.**

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. The near-me control is additive map chrome; the skip
control, zoom group, attribution and pin behave exactly as they do on `main` (the zoom group
gains a wrapping control column, which moves no rendered box: same `top-3 right-3` anchor, same
`gap-2` stack, asserted by the existing narrowest-phone and mobile-zoom cases).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A coordinate leaks off the device through a request, a storage entry or a log line — the one risk the whole slice exists to avoid (story 8, DSGVO) | low | high | The position lives in a component signal and the engine handle only; AC-9 extends #1098's real-engine guard to URLs, headers, bodies, both storages and console output with a distinctive fixture coordinate | plan | closed in phase 3 — and the guard was mutation-tested twice (a probe request and a probe storage write each failed it), so it is known to have teeth rather than assumed to |
| R-2 | `RivieraMap` now requires a `GeolocationGateway`, so the six existing specs that mount it (directly or through `VenueLocationField`) fail with `NullInjectorError` | high | low | Each gains one provider line stating its geolocation posture — `supported: false` where near-me is not the subject, the fake where it is; caught by the first scoped Vitest run in phase 1 | plan | closed — it was 5 configs across 5 files (60 tests), all green again |
| R-3 | The here-marker mounts inside the surface both engines read map clicks from, so a tap on it would re-place the operator's venue pin — exactly the defect #1099's review caught for the venue pin (up to ~6 km, then saved) | med | high | The here-marker is built by the same factory path and stops click propagation; AC-7 pins it on the console surface | plan | closed in phase 1 — pinned by `riviera-map.spec.ts` "keeps a tap on the you-are-here marker off the map underneath"; AC-7 adds the console leg |
| R-4 | A granted position outside the Albania fence clamps the camera to a corner with the marker unreachable | med | med | AC-5: bounds-checked above the seam, message instead of a move | plan | closed in phase 1 — pinned by `riviera-map.spec.ts` "refuses a position off the riviera" |
| R-5 | Playwright's denied path behaves differently than assumed (no prompt in headless ⇒ possibly `PERMISSION_DENIED`, possibly a hang) | med | low | Phase 3 measures it before asserting it; if clearing permissions hangs rather than denying, the denied e2e leg falls back to the fake gateway posture and the plan records the substitution — the Vitest specs already own all five outcomes | plan | closed in phase 3 — it hangs, and `--deny-permission-prompts` in the suite config gives a genuine denial instead; no fake was needed (measurement in phase 3 step 3) |
| R-6 | #1101 (venue pins) will touch the same marker code on `RivieraMap`; both slices change `syncPin`'s neighbourhood | med | low | #1101 is open and unstarted, this slice merges first and keeps the here-marker on its own id with no change to `PIN_ID`'s handling; whoever merges second rebases | plan | closed — `syncPin` is untouched; the here-marker is additive |
| R-7 | The new control is map chrome over imagery of unknown luminance, so a themed token would drift light-on-light | low | med | It wears the theme-invariant `--riv-solid-btn-*` family already proven by the zoom buttons; AC-11 pins the ratios | plan | closed in phase 1 — the control wears the pill skin, and the here-dot's ring is cut from the same opaque fill so its 3:1 pair is internal to the graphic |
| R-8 | Turning near-me on in the console (maintainer's call, beyond the issue text) widens the slice to a second surface's sweeps | — | low | AC-7/AC-10 cover it; the console's sweep (`touch-targets.e2e.ts`, "operator venue tab") already measures whatever the tab renders | maintainer | closed at the review gate — and it cost more than the sweeps: F-2 and F-3 are both second-surface findings the Discover-only slice would never have had |

## Open questions / Assumptions

- **Assumption:** Chromium under Playwright answers `getCurrentPosition` with `PERMISSION_DENIED`
  when the permission was never granted (no prompt can be shown headless). — *Owner:* plan ·
  *Resolves by:* phase 3, by running it (R-5 names the fallback).
- **Assumption:** zoom 12 is the right "sensible zoom" for "where I am" on a map fenced to
  minZoom 7 / maxZoom 16 — town-scale, not street-scale, because the venue set a tourist is
  looking for is a beach away, not a doorway away. — *Owner:* plan · *Resolves by:* phase 1 (a
  named constant; trivially re-tuned).
- **Assumption:** a 10 s timeout with `enableHighAccuracy: false` and a 60 s `maximumAge` is the
  right ask — a map centring wants a quick coarse fix, not a GPS-grade one, and a cached minute-old
  position is still "here". — *Owner:* plan · *Resolves by:* phase 0.

### Resolved

- **Where does the control live?** → Inside `RivieraMap` behind an opt-in `nearMe` input, not on
  the Discover page. Maintainer's answer at the plan gate: it is map chrome, it drives the map's
  own camera, and the alternative puts map chrome outside the map and needs a `viewChild` +
  `setView` reach-through.
- **A position outside the map's fence?** → A fifth outcome: short message, view unchanged, no
  marker (AC-5). Maintainer's answer at the plan gate.
- **Does the operator console's pin placer get near-me too?** → **Yes** (maintainer's answer at
  the plan gate, widening the issue's Discover-only scope): an operator standing at their venue
  centres on themselves and presses *Place pin at map centre*. Covered by AC-7 and AC-10.
- **Copy** → as proposed at the plan gate: button "Near me"; denied "Location permission was
  declined. The map hasn’t moved."; unavailable "Your location isn’t available right now.";
  timeout "Finding your location took too long. Try again."; off-riviera "You don’t seem to be on
  the Albanian riviera — the map hasn’t moved."; marker label "You are here".

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice writes nothing, reads no booking or set, and makes
no HTTP request at all; `set_availability` is not in its reach and no sales-close or pool rule is
in play.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file, no module, no port, no event, no table.

### Module ownership (§4a)

N/A — no backend behavior added or moved. The one placement decision is a frontend-folder one and
belongs to `riviera-frontend`: `shared/geolocation.ts` sits beside `shared/map-engine.ts` because
it is a browser capability behind a DI token whose consumers span features, and `shared/`'s "no
HTTP" bar means no `HttpClient`/API state — not no I/O behind a seam (the same reading that
admitted the MapLibre adapter). The fake is test-only, so it lives in `src/testing/`, not
`shared/`, and never reaches the app bundle.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money, no ledger, no Stripe surface touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/geolocation.ts` | new | abstract-class DI token + browser adapter | none — a `Promise`-returning capability | — |
| FE-2 | `src/testing/fake-geolocation.ts` | new | test double | a queued/deferred outcome | — |
| FE-3 | `shared/riviera-map.ts` + `.html` | existing | standalone component | signals: `locating`, `problem`, + a `nearMe` input; message `computed()` | — |
| FE-4 | `pages/home/home.html` | existing | template | `[nearMe]="true"` on the map | — |
| FE-5 | `operator/venue-location-field.ts` | existing | standalone component | `[nearMe]="true"` on the map | — |
| FE-6 | `pages/legal/privacy-policy.html` | existing | static template | — | — |
| FE-7 | `app.config.ts` | existing | composition root | `{ provide: GeolocationGateway, useClass: BrowserGeolocationGateway }` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs.
Deviations documented: (a) the locate call is **not** wrapped in `PendingTasks.run()` — unlike the
map's boot, a user-initiated permission prompt is not application stability, and wrapping it would
make `fixture.whenStable()` hang on the deliberately-pending fake that AC-6 needs; (b) the
here-marker element is built imperatively with `createElement`, following the venue pin's
established path, because the engine seam takes an `HTMLElement` the caller owns.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or query parameter is added, changed or called; AC-9
is the machine proof that the wire is untouched.

## Execution status

**Stage pointer:** `phase 4 — review gate run, five findings fixed; re-verifying, then merge close-out`

**Next action:** push the review-fix commit, re-resolve the range and re-walk the overlay for what
the fixes touched, re-check CI + Sonar on the new head.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The geolocation gateway seam + app wiring | ✅ | (this commit) |
| 1 — The near-me control on the map component | ✅ | (this commit) |
| 2 — The two surfaces + the privacy paragraph | ✅ | (this commit) |
| 3 — e2e: the granted/denied flows and the extended no-leak guard | ✅ | (this commit) |
| 4 — Integration, CI green, review + Sonar gates, close-out | ⏳ | CI green on `4ea879f2`; Sonar clean (0 issues, 0 duplication, 90.6% new-code coverage); review gate run, F-2…F-6 fixed in this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (frontend job, run 35185427051) | `venue-tab.a11y.spec.ts` mounts the pin placer transitively, so it needed the gateway provider too — a spec my phase-1 search by symbol name never listed | fixed in `4ea879f2`; the full local suite (3290 tests) is now the enumerator, not a grep |
| F-2 | Review gate (history reviewer + overlay reviewer, independently) | **The decorative dot outranked the draggable pin.** Neither engine orders markers (MapLibre sets no `z-index`; grep count 0), so DOM order decided, and the here-dot is added last — an operator pressing Near me at their already-pinned venue got a 20 px dead zone over the pin's centre, where a drag fell through to the map and panned it. Confirmed with a browser probe (`elementFromPoint` returned `map-here` at the pin's centre), not reasoned about | fixed in this commit: the markers name a paint order (`z-[2]`/`z-[1]`, both far below the chrome's `z-10`), pinned by `operator-venue-location.e2e.ts` "keeps the venue pin on top when the you-are-here dot lands on it" — red before the fix, green after |
| F-3 | Review gate (comment-contract reviewer) | **The privacy paragraph was false for the console.** It said the Near-me position "is never sent to us" without qualification, while this same PR lets an operator commit that position as their venue's pin and save it — the flow AC-10 itself asserts. The seam's TSDoc overclaimed the same way | fixed in this commit: the paragraph now says what reaches us when an operator places and saves a pin from Near me, and the TSDoc scopes its promise to the seam. Pinned by `privacy-policy.spec.ts` "says what reaches us when an operator pins their venue from Near me" |
| F-4 | Review gate (prior-PR reviewer) | The console renders the same map chrome as Discover, but the console's double-tap sweep (`mobile-zoom.e2e.ts`) covered no map control at all — the CSS was right, the surface unproven, which is the coverage half of the #1063/#1102 lesson | fixed in this commit: `mobile-zoom.e2e.ts` gains "venue tab — the pin placer's map controls keep their double-tap", covering near-me and both zoom buttons (closing the pre-existing zoom gap in the same assertion) |
| F-5 | Review gate (overlay, RV-STYLE-1) | Provenance (`#1098`) in a doc comment the diff added — a shape the comment guard's regex does not catch, so a clean guard run was not the answer | fixed in this commit: the comment names the guard instead of the issue |
| F-6 | Review gate (overlay, observation) | The new contrast test asserted the same constant pair as the zoom-glyph test byte for byte — documentation, not proof, and a duplicate block for Sonar to find | fixed in this commit: one assertion now names both positions, with the dot's 1.4.11 case in its doc comment |

---

## File structure

- `frontend/src/app/shared/geolocation.ts` — the `GeolocationGateway` token, the five-outcome
  union, and `BrowserGeolocationGateway` (the only code in the tree that touches
  `navigator.geolocation`).
- `frontend/src/app/shared/geolocation.spec.ts` — the adapter against a stubbed
  `navigator.geolocation`: every outcome mapping, the absent-API case, the options it asks for.
- `frontend/src/testing/fake-geolocation.ts` — the deterministic fake: a queued outcome, a
  deliberately pending call for the busy state, a call count, a `supported` flag.
- `frontend/src/app/shared/riviera-map.ts` — the `nearMe` input, the control's state and handler,
  the bounds check, the here-marker.
- `frontend/src/app/shared/riviera-map.html` — the control column (near-me above the existing zoom
  fieldset) and the message.
- `frontend/src/app/shared/riviera-map.spec.ts` — AC-2 … AC-6.
- `frontend/src/app/shared/riviera-map.a11y.spec.ts` — the axe audit with the control and a
  message present.
- `frontend/src/app/shared/riviera-map.contrast.spec.ts` — the label/message ink and the
  here-marker's non-text contrast.
- `frontend/src/app/app.config.ts` — the provider.
- `frontend/src/app/app.config.spec.ts` — the token resolves to the browser adapter.
- `frontend/src/app/pages/home/home.html` — `[nearMe]="true"` on the Discover map.
- `frontend/src/app/pages/home/home.spec.ts` — the provider + Discover turns the control on.
- `frontend/src/app/pages/home/home.a11y.spec.ts` — the provider.
- `frontend/src/app/operator/venue-location-field.ts` — `[nearMe]="true"` on the placer's map.
- `frontend/src/app/operator/venue-location-field.spec.ts` — AC-7.
- `frontend/src/app/operator/venue-tab.spec.ts` — the provider (it mounts the placer).
- `frontend/src/app/operator/venue-tab.a11y.spec.ts` — the provider; it mounts the placer
  transitively, which a search by symbol name missed and CI caught (F-1).
- `frontend/playwright.a11y.config.ts` — `--deny-permission-prompts`, so an ungranted permission
  is a real `PERMISSION_DENIED` instead of a hang.
- `scripts/check-focus-posture.mjs` — `locating` joins `BUSY_STEMS`, so the guard can catch a
  future `[disabled]="locating()"` (the sanctioned move for a novel busy-flag name).
- `frontend/src/app/pages/legal/privacy-policy.html` — the geolocation sentence in the map section.
- `frontend/src/app/pages/legal/privacy-policy.spec.ts` — AC-12.
- `frontend/e2e/discover-map.e2e.ts` — AC-8 and AC-9.
- `frontend/e2e/operator-venue-location.e2e.ts` — AC-10.
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the map-view sweep asserts the control is on
  screen before measuring, so it cannot silently stop covering it.
- `frontend/e2e/mobile-zoom-tourist.e2e.ts` — the control joins the double-tap-opt-out selector
  list beside the zoom buttons.
- `frontend/e2e/mobile-zoom.e2e.ts` — the same proof on the console surface, which rendered the map
  chrome but swept none of it (F-4).
- `frontend/e2e/legal-pages.e2e.ts` — checked in phase 2: it asserts no map copy, so it is
  untouched. The paragraph's own proof is `privacy-policy.spec.ts`.
- `CONTEXT.md` — only if the close-out's freshness sweep finds the glossary needs the near-me
  behaviour (the **Venue location** entry already says geolocation "is the visitor's own position,
  which never leaves their browser").
- `docs/plans/near-me-geolocation.md` — this plan; deleted at the next close-out after merge.

---

## Phase 0 — The geolocation gateway seam + app wiring

**Files:** Create `frontend/src/app/shared/geolocation.ts`, `frontend/src/app/shared/geolocation.spec.ts`,
`frontend/src/testing/fake-geolocation.ts` · Modify `frontend/src/app/app.config.ts`,
`frontend/src/app/app.config.spec.ts`

- [ ] **Step 1: Write the failing test** — `geolocation.spec.ts`: with a stubbed
  `navigator.geolocation` whose `getCurrentPosition` invokes the success callback,
  `locate()` resolves `{ kind: 'located', at: { lng, lat } }`; with the error callback and
  `code` 1 / 2 / 3 it resolves `denied` / `unavailable` / `timeout` and never rejects; with the
  property absent, `supported()` is `false` and `locate()` resolves `unavailable`; the options
  passed carry a finite `timeout` (there is no timeout outcome without one). Plus
  `app.config.spec.ts`: the configured application resolves `GeolocationGateway` to a
  `BrowserGeolocationGateway`.
- [ ] **Step 2: Run it, verify it fails** —
  `npx vitest run src/app/shared/geolocation.spec.ts src/app/app.config.spec.ts` → FAIL
  (module not found).
- [ ] **Step 3: Minimal implementation** — the token, the union, the adapter (bare-global
  `navigator` guarded, the house pattern `CameraQrScanner` uses), the fake, the provider.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — done, logged below: the seam matches `SsoRedirect`'s
  `useClass` shape (a real adapter the e2e drives directly), not the three `useFactory` ones that
  need a `globalThis` fake flag. No other site to change.
- [ ] **Step 6: Commit** — `git commit -m "Put the Geolocation API behind a gateway seam (#1100)"`
- [ ] **Step 7: Open the draft PR** (CI fires on `pull_request` only) and update the execution
  status in the same commit window.

---

## Phase 1 — The near-me control on the map component

**Files:** Modify `frontend/src/app/shared/riviera-map.ts|.html|.spec.ts|.a11y.spec.ts|.contrast.spec.ts` ·
Modify `frontend/src/app/pages/home/home.spec.ts`, `frontend/src/app/pages/home/home.a11y.spec.ts`,
`frontend/src/app/operator/venue-location-field.spec.ts`, `frontend/src/app/operator/venue-tab.spec.ts`
(the provider only, R-2)

- [ ] **Step 1: Write the failing tests** — AC-2 … AC-6 in `riviera-map.spec.ts`, driving the
  fake gateway: hidden/shown, granted → `setView` at zoom 12 + one labelled marker, the four
  failure messages with a byte-identical view and no marker, the off-riviera refusal, the busy
  second press, the retry that clears the message, and a second success that *moves* the marker.
  Plus the a11y audit with control + message, and the contrast pair.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/riviera-map` → FAIL.
- [ ] **Step 3: Minimal implementation** — the `nearMe` input, `locating`/`problem` signals and
  the message table, the handler (early-return when no live handle, exactly as the zoom buttons
  do; re-entrancy guarded by `[appBusy]` plus a guard in the handler), the bounds check, the
  here-marker (own id, `role="img"`, `aria-label="You are here"`, click propagation stopped —
  R-3), and the control column in the template.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/shared/ src/app/pages/home src/app/operator/venue-location-field.spec.ts src/app/operator/venue-tab.spec.ts`
  → PASS.
- [x] **Step 5: Generalization-audit pass** — done, logged below: both production marker builders
  stop click propagation; the rest of the population is spec fixtures.
- [ ] **Step 6: Commit** — `git commit -m "Centre the riviera map on the visitor with a Near me control (#1100)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The two surfaces + the privacy paragraph

**Files:** Modify `frontend/src/app/pages/home/home.html`, `frontend/src/app/pages/home/home.spec.ts`,
`frontend/src/app/operator/venue-location-field.ts|.spec.ts`,
`frontend/src/app/pages/legal/privacy-policy.html|.spec.ts`

- [ ] **Step 1: Write the failing tests** — Discover renders the control (AC-2's positive leg on
  the real consumer); AC-7 on the placer (near-me → *Place pin at map centre* sets the location;
  a tap on the here-marker leaves it alone); AC-12 on the policy page.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/pages src/app/operator/venue-location-field.spec.ts`
  → FAIL.
- [ ] **Step 3: Minimal implementation** — one attribute per consumer; the policy sentence.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — done, logged below: both call sites take the control.
- [ ] **Step 6: Commit** — `git commit -m "Offer Near me on Discover and the pin placer, and say so in the privacy policy (#1100)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — e2e: the granted/denied flows and the extended no-leak guard

**Files:** Modify `frontend/e2e/discover-map.e2e.ts`, `frontend/e2e/operator-venue-location.e2e.ts`,
`frontend/e2e/touch-targets-tourist.e2e.ts`, `frontend/e2e/mobile-zoom-tourist.e2e.ts`

- [ ] **Step 1: Write the failing tests** — AC-8 (fake engine: granted marker, denied message),
  AC-9 (real engine: the #1098 guard plus URL/header/body/storage/console coordinate sweeps with a
  distinctive fixture position), AC-10 (console), plus the two sweep touch-ups.
- [ ] **Step 2: Run it, verify it fails** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts discover-map` → FAIL.
- [x] **Step 3: Minimal implementation** — no app change was needed, but R-5 **did** materialize and
  the measurement is worth keeping: headless Chromium shows no permission prompt, so an ungranted
  `getCurrentPosition` never calls either callback — it hangs, and the W3C `timeout` option does not
  run while a prompt is pending (the spec excludes that wait). `clearPermissions()` and a CDP
  `Browser.setPermission` denial both hang; Chromium's `--deny-permission-prompts` produces a real
  `PERMISSION_DENIED` ("User denied Geolocation"), which an explicit `grantPermissions` still
  overrides per test. The flag went into the mocked suite's config, where a hang is the worst
  failure mode any spec can have.
- [ ] **Step 4: Run it, verify it passes** — the discover-map, operator-venue-location,
  touch-targets-tourist and mobile-zoom-tourist specs → PASS.
- [x] **Step 5: Generalization-audit pass** — done, logged below (two passes: the request-watching
  specs, and the spec population a symbol-name grep had mis-enumerated in phase 1).
- [ ] **Step 6: Commit** — `git commit -m "Prove a granted Near me sends the position nowhere (#1100)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Integration, CI green, review + Sonar gates, close-out

- [ ] **Step 1:** `git fetch origin main` and merge it in with full phase discipline (routing gate
  for whatever the integration touches, scoped tests, honest commit message).
- [ ] **Step 2:** Full frontend check locally — `npm run lint`, `npm run format:check`,
  `npm test`, the mocked e2e — then mark the PR **ready for review**.
- [ ] **Step 3:** Review gate — `/code-review` per `pr-gates.md` §1 with
  `riviera-review-overlay`; every finding re-enters at Implement.
- [ ] **Step 4:** Sonar gate — pull the reported new-issue + duplication list from the API and
  clear every entry (the control column duplicates no zoom-button block: check it).
- [ ] **Step 5:** `riviera-docs-freshness` over `origin/main..HEAD`; run
  `node scripts/check-plan-file-structure.mjs --diff origin/main`; write the close-out into the
  PR's **last code-touching commit**.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-17 | phase 3 — F-1's miss | every spec whose component tree contains `app-riviera-map`, transitively — the mechanism is "the injector must supply `GeolocationGateway`", which a search for `RivieraMap`/`VenueLocationField` by name cannot enumerate (`venue-tab.a11y.spec.ts` names neither) | the full suite itself: `npm test` (268 files, 3289 tests) | 6 spec configs across 6 files | all 6 provide the gateway; the lesson recorded here is that the enumerator for an injector requirement is the suite, not a grep |
| 2026-09-17 | phase 3 — a leak guard | every mocked-suite spec that watches the page's own request set | `grep -rln "page.on('request'\|page.on('response'" frontend/e2e` | 3: `discover-map` (origin + position guard), `customer-password` and `operator-set-editing` (both count one endpoint's calls for idempotence) | only `discover-map` guards what leaves the page; the other two watch a single endpoint on surfaces with no position in play, so neither gains an assertion |
| 2026-09-17 | phase 2 — a new map input | every `app-riviera-map` call site, since a per-consumer opt-in is only right if each consumer was judged | `grep -rn "app-riviera-map" frontend/src --include=*.html --include=*.ts` | 2: `pages/home/home.html` (Discover) and `operator/venue-location-field.ts` (the pin placer) | both take `[nearMe]="true"` — Discover per the issue, the placer per the maintainer's plan-gate answer; no third site exists to judge |
| 2026-09-17 | phase 1 — a second marker element | every marker element the app mounts into the surface an engine reads map clicks from (#1099's ~6 km mis-placement mechanism) | `grep -rn "addMarker(" frontend/src frontend/e2e` | 2 production call sites (`PIN_ID`, `HERE_MARKER`), both in `riviera-map.ts`; the other 5 are `fake-map-engine.spec.ts` fixtures | none — both builders already stop click propagation (`riviera-map.ts:234`, `:293`); the here-marker was written that way for this reason |
| 2026-09-17 | phase 0 — a new capability seam | every abstract-class DI token over an external capability, and how each is wired | `grep -rn "^export abstract class" frontend/src/app --include=*.ts` + `grep -n "provide:" frontend/src/app/app.config.ts` | 6 tokens: `MapEngine`, `QrScanner`, `StripePaymentGateway`, `SessionAuth`, `SsoRedirect`, + the new `GeolocationGateway` | none — the three `useFactory` ones need a `globalThis` fake flag because their real adapter cannot run under the e2e; geolocation's can (Playwright grants the permission), so it takes `SsoRedirect`'s `useClass` shape. No existing site changes. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-7, AC-11 (unit), AC-12:** `npm test` → all green. Verified at commit `<sha>`.
- [ ] **AC-8 … AC-11 (e2e):** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`
  → all green. Verified at commit `<sha>`.
- [ ] **All:** the PR's CI run green. Verified at commit `<sha>`.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
