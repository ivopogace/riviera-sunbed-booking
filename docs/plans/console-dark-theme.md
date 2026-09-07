# Console nav 7/7 — the dark console theme Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator picks `Porcelain` or `Dark` in the account chip and every console route (the
six venue tabs, the eight admin tabs, the landing and the password page) repaints in that theme with
every control AA against its surface — the console host's `data-riv-theme` flips, the document
attribute and the tourist theme do not, the choice survives a reload, and the `riviera` tourist theme
never reaches the console — after a restyle in which every console token gains a dark value and no
console tab paints a colour literal.

**Architecture:** Two halves in one slice, in order. First the **restyle**: the console content's
light literals (about ninety `bg-white/NN` inset fills, four hex inks and rings, two amber banners,
the sea banner's gradient) become tokens, and every token whose only ground for lacking a dark branch
was "its whole population sits under the porcelain pin" (`--riv-console-*`, `--riv-select-*`,
`--riv-alert-tint`, `--riv-positive-tint`, `--riv-premium-*`) gets one in the `dark` block — the
single-declaration guards flip to a two-declaration contract, the fifteen console contrast specs
composite both themes off one shared table (`testing/console-themes.ts`), and the porcelain values
stay byte-identical. Only then the **switch**: `core/console-theme.ts` (a `porcelain | dark` signal
with its own storage key that never writes the document attribute) replaces the app shell's literal
`'porcelain'` pin, and the account chip gains a `Console theme` group of two `aria-pressed` rows.
The one new token family is `--riv-console-inset` (class-O rule B: the alpha stays at the call site),
`#ffffff` in porcelain and a slate near-black in dark, so a `bg-white/60` field becomes
`bg-riv-console-inset/60` with no porcelain drift and a dark field that sits *below* the dark card
the way the tourist dark theme's own fields do.

**Persistence:** JDBC only (invariant #1). No backend change; nothing new on the wire. The console
theme is `localStorage` (`riviera-console-theme`) behind `shared/safe-storage.ts`.

**Source of intent:** GitHub issue #1010 (parent epic #1006, grill answer 14: two console themes,
porcelain and dark, chosen in the console, never the tourist theme and never `riviera`). Spike
reference, not code to copy: `prototype-console-theme.ts` (the switch's shape) and the `*-themes`
contact sheets under `frontend/prototype-shots/console/` on `claude/operator-admin-nav-prototype-727vnz`
— `sheet-daily-themes`, `sheet-beach-map-themes`, `sheet-requests-phone-themes` show exactly what
the restyle fixes: the date field, the sales-close and Decline outline buttons, the tool chips and
the standard tiles painting `bg-white/NN` as grey slabs, the walk-in hatch (console-tint at 30%/10%
over the night sand) vanishing, `text-[#0c2a33]` numerals on dark tiles.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that the
issue's "light literals" are mostly not hex at all: the ledger's population command matches
`-[#…]`/`-[rgba(…` only, and the console's grey slabs are ~90 `bg-white/NN` and six
`border-white/NN` positions it never counted, so this plan widens the population and the ledger
records the new class; that the map's tiles already have a themed `--riv-tile-*` family but the
console's cells and the daily view paint their own `bg-white/85` + base-only tokens; that the issue's
"eight admin tabs" are seven routed tabs plus the mail-delivery card inside Email (the Payouts slot
is still reserved, `admin-console-tabs.ts:24`); that `theme-shell.e2e.ts`'s porcelain-pin case is
the direct guard the switch renegotiates; that #1013's close-out is complete (PR #1019, the epic
comment, 6/7) and its plan doc retires here; zero open PRs, no Flyway number in play) ·
`riviera-plan-doc` (this template — forced a seam per AC, the reversible-decision register and the
population-by-mechanism audit rows) · `tdd` (each phase red first at the named seam: the
two-declaration guards, the dark contrast rows, the sweep, the service spec, the chip spec) ·
`riviera-review-overlay` (review gate — pending, due at ready-for-review) · `riviera-docs-freshness`
(pending — due at close-out over the PR's range: `riviera-tailwind` § *Styling across the themes*'
third theme-invariant case names `--riv-console-accent-ink` as the example of a pinned-subtree
token, which this slice ends; the ledger's rows; the class-O and console-token spec headers that say
"declared once") · `grilling` (the intake questions answered from the code; the maintainer was not
present, so every product call is recorded under *Open questions* as reversible) ·
`riviera-local-debug` (the clone unshallowed; the proxy CA bundle carried two corrupt PEM blocks,
so git reads a repaired copy via `http.sslCAInfo` in the local config; scoped
`npx ng test --watch=false --include <file>`; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`
for the mocked e2e) · `riviera-frontend` (the theme state is a stateful cross-cutting singleton →
`core/console-theme.ts` beside `core/theme.ts`; the document attribute stays `ThemeService`'s only;
the pin stays on the app shell's host, the one console host since #1011; the shared per-theme table
is test-side → `src/testing/`; the e2e is the mocked suite) · `riviera-tailwind` (§ *Styling across
the themes* rule 1: tokens do the switching and components never name a theme, so the restyle is
tokens only and no `:host-context`; the third theme-invariant exemption ends for the console set;
class-O rule B for `--riv-console-inset`; rule 4 `appTouchTarget` on the two rows; rule 6 no
`outline-none`; the fixed-fill rule keeps `text-white` on the solid fills and pins the premium
numeral's ink over the gold) · `angular-developer` + angular-cli MCP (`get_best_practices` v22:
`@Service`, `inject()`, signals, `input()`; `search_documentation` at implement time for the host
attribute binding and the `@Service` decorator) · `playwright-cli` (a per-project `storageState`
seeding the console key for the `console-dark` project; `toHaveCSS` against a probe paint for
`color-mix()` results, the `class-o-tint-tokens.e2e.ts` pattern; role/test-id locators; axe after
`getAnimations().finished`).

**Branch:** `claude/dark-console-theme-pgm8y6` (the session's designated remote branch stands in for
`feature/console-dark-theme`, per the `riviera-sdlc` cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (tokens):** Given `src/tailwind.css` read as text, when the console token set —
  `--riv-console-accent-ink`, `--riv-console-negative-ink`, `--riv-console-tint`,
  `--riv-console-scrim`, `--riv-console-card-border`, `--riv-console-inset` (new),
  `--riv-select-tint`, `--riv-select-edge`, `--riv-alert-tint`, `--riv-positive-tint`,
  `--riv-premium-edge`, `--riv-premium-grad` — is looked up, then each is declared exactly twice, once
  in the base block and once in the `dark` block, with the values the test mirror carries and (for
  the colours) an `@theme inline` row; `--riv-walkin-hatch` stays one declaration (it themes through
  `--riv-console-tint`) and `--riv-premium-ink` (new, the numeral over the fixed gold) exactly once.
  *Seam:* the stylesheet as text through `testing/stylesheet-tokens.ts` · *Pinned by:*
  `operator/console-accent-token.contrast.spec.ts`, `operator/console-negative-token.contrast.spec.ts`,
  `shared/class-o-tint-tokens.contrast.spec.ts`, `shared/fixed-ink-tokens.contrast.spec.ts` — each
  guard's "declared exactly once" case becomes "declared in the base block and in the dark block,
  nowhere else, the dark value the mirror's".
- [ ] **AC-2 (no literal):** Given the console sources (`operator/`, `admin/`, `console-shell.ts`,
  and the `shared/` primitives the console renders: `beach-grid-frame`, `stat-tile`,
  `confirm-with-reason`, `console-palette`), when swept for a colour utility carrying a hex, `rgb()`
  or the named `white`/`black` colour in a fill, border, ink, ring or gradient position, then the
  only hits are the recorded residue: `text-white` / `outline-white` over a solid fill (the fixed-ink
  family), the camera preview's `bg-black/80` letterbox (a photo surface, not themed), and
  `shared/status-chip.ts`'s class-S palette. *Seam:* the component sources as text · *Pinned by:*
  `operator/console-literal-sweep.spec.ts` › `paints no colour literal outside the recorded residue`,
  and the ledger `docs/design/colour-literal-token-audit.md` § *Class N* listing none.
- [ ] **AC-3 (dark AA):** Given each console tab's inks, fills and edges composited over the dark
  card glass over every dark background stop (and the porcelain rows unchanged), when the ratios are
  computed, then the Daily view's date field ink over its inset, the sales-close button, the Requests
  tab's Accept and Decline pair, the layout editor's tool rail (idle, hover, armed), the standard,
  walk-in and taken tiles' numerals over their fills on the night sand (the walk-in numeral over the
  hatch's dense band), the premium numeral over the gold, the payouts figures, the admin fields and
  pills each reach AA (4.5:1 text, 3:1 non-text chrome that carries meaning). *Seam:* the token
  mirror (`testing/glass-tokens.ts` + `testing/console-themes.ts`) through the compositing maths ·
  *Pinned by:* `describe.each(CONSOLE_THEMES)` rows in `operator/daily-view-tab.contrast.spec.ts`,
  `requests-tab.contrast.spec.ts`, `layout-editor.contrast.spec.ts`, `set-editor.contrast.spec.ts`,
  `pricing-tab.contrast.spec.ts`, `venue-tab.contrast.spec.ts`, `payouts-tab.contrast.spec.ts`,
  `venue-create-card.contrast.spec.ts`, `console-stats-strip.contrast.spec.ts`,
  `operator-console.contrast.spec.ts`, `admin/admin-console.contrast.spec.ts` (the console-wide admin
  pairs), `shared/console-palette.contrast.spec.ts`.
- [ ] **AC-4 (dark render):** Given the mocked suite's `console-dark` project (the console key seeded
  `dark` through the project's `storageState`), when `/operator/1/daily`, `/operator/1/requests` and
  `/operator/1/beach-map` render, then `app-root` carries `data-riv-theme="dark"`, the date field, the
  sales-close button, the Decline button, the armed tool chip and a standard tile each paint the dark
  token's composite (a `color-mix()` probe, never a pinned string) where the `chromium` project reads
  porcelain's, the walk-in tile's hatch image is present, and axe reports no serious violation; the
  same three tests under `chromium` prove the porcelain values unchanged. *Seam:* the routed SPA ·
  *Pinned by:* `operator-daily.e2e.ts` › `paints the console theme: the date field, the sales-close control and the tiles under porcelain and dark console (#1010, + axe)`,
  `operator-requests.e2e.ts` › `paints the console theme: the Accept / Decline pair under porcelain and dark console (#1010, + axe)`,
  `layout-editor.e2e.ts` › `paints the console theme: the tool rail and the tiles under porcelain and dark console (#1010, + axe)`.
- [ ] **AC-5 (the switch):** Given a signed-in operator with the chip open, when the popover renders,
  then after `Change password` it carries a `Console theme` group of two buttons, `Porcelain`
  (`aria-pressed="true"`) and `Dark` (`aria-pressed="false"`), each at the 44px floor; pressing `Dark`
  sets `ConsoleTheme.theme()` to `dark`, writes `riviera-console-theme=dark`, closes the popover and
  returns focus to the chip; the app shell's host then carries `data-riv-theme="dark"` on every console
  route (`/operator/1/daily`, `/admin`, `/operator`, `/account/operator-password`) and
  `document.documentElement`'s attribute is untouched; a tourist route carries no host attribute.
  *Seam:* the service's public signal + storage (unit), the chip's DOM (unit), the app shell over the
  real routes (unit), the routed SPA (e2e) · *Pinned by:* `core/console-theme.spec.ts` ›
  `defaults to porcelain, remembers a stored choice, and never touches the document attribute`;
  `operator/operator-account-chip.spec.ts` › `the Console theme rows: aria-pressed marks the choice, a press selects, closes and hands focus back (#1010)`;
  `app.spec.ts` › `the console host wears the console theme, the tourist chrome none (#1010)`;
  `theme-shell.e2e.ts` › `the account chip's Dark row flips the console host only, survives a reload, and Porcelain flips it back (#1010)`.
- [ ] **AC-6 (no leak):** Given a tourist who stored `riviera` (or `dark`), when a console route
  renders with the console choice `porcelain` and then `dark`, then `html[data-riv-theme]` is the
  tourist's value and `app-root[data-riv-theme]` the console's — never `riviera` — and the console's
  paint under a `riviera` document equals its paint under a `porcelain` document. *Seam:* the routed
  SPA · *Pinned by:* `theme-shell.e2e.ts` › the amended
  `every console route renders its own console theme under a dark and a riviera tourist theme, with no seam`.
- [ ] **AC-7 (the chrome in dark):** Given the dark header glass over every dark stop, when the
  rail's current marker, the section row's inks, the chip's avatar disc and the chip's popover rows
  are composited, then each clears 3:1 (non-text) or AA (text). *Seam:* the token mirror through the
  compositing maths · *Pinned by:* `console-shell.contrast.spec.ts`,
  `operator/operator-account-chip.contrast.spec.ts`, `operator/operator-venue-switch.contrast.spec.ts`
  — each gains its dark rows.

## Non-goals

- Shadow literals (`shadow-[0_8px_22px_rgba(11,120,150,0.35)]` and its family, ~25 positions): a
  shadow cannot drift light-on-light and #836's population never counted them — recorded in the
  ledger as a class of their own, not migrated here.
- The tourist chrome and `shared/popover-skin.ts`'s `POP_BACKDROP` (`rgba(6,30,40,0.2)`): the
  tourist shell shares it, #1006 puts the tourist chrome out of scope, and a dark scrim is right in
  both themes.
- `shared/status-chip.ts`'s nine-state palette (class S of the ledger): opaque fixed fill + ink pairs,
  legible in both themes by construction; the ledger's own verdict stands.
- Following the OS scheme for the console default, or seeding the console theme from the tourist
  choice: the default is porcelain until the operator chooses (grill answer 14, story 21).
- The `riviera` theme in the console — two themes only.
- An admin Payouts tab (still reserved, not a tab) and any backend change.
- Rewriting the `.dc.html` artboards; a pointer only where the depicted console diverges.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. (The restyle is a value-preserving rewrite in porcelain: every
porcelain composite the contrast specs held before this slice is held after it, in the same spec, at
the same number, which is the parity proof for the half that touches shipped paint.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Chromium serializes a `color-mix(in oklab, …)` paint as `oklab(…)` with unstable float digits, so a dark-vs-porcelain e2e that pins strings flakes | certain if pinned | med | the `class-o-tint-tokens.e2e.ts` probe: render the expected expression on a probe element and compare computed to computed | agent | open |
| R-2 | The rewrite moves a porcelain pixel (`bg-white/60` → `bg-riv-console-inset/60` must compile to the same `color-mix()`) | low | high | porcelain rows of every contrast spec unchanged; the AC-4 tests under `chromium` assert porcelain's values; the rims that move (`border-white/95`/`/70` → `--riv-card-border`, the sheet backdrop `console-tint/45` → `console-scrim/45`, `text-[#0c2a33]` → `--riv-card-ink`) are listed under *Open questions* as bounded moves with their ratios re-proven | agent | open |
| R-3 | The walk-in numeral (`--riv-card-ink`, white in dark) over the hatch's dense band (console-tint at 30% over the night sand) falls under AA | med | high | the dark row in `daily-view-tab.contrast.spec.ts` / `set-editor.contrast.spec.ts` composites the band; if it fails, the dark block declares its own `--riv-walkin-hatch` at a lighter band (the tourist dark map runs its hatch at 0.14 for this reason) | agent | open |
| R-4 | The premium cell's numeral is the shared `text-riv-card-ink`, white in dark, over the gold gradient | certain | high | `--riv-premium-ink` (fixed `#0a2a33`, the fixed-fill rule: a fixed fill pins its ink) carried by `beach-cell.ts`'s premium variant; the set-editor and layout-editor numerals drop their element-level `text-[#0c2a33]` | agent | open |
| R-5 | The set-editor's phone sheet backdrop is `bg-riv-console-tint/45` — a white haze once the tint themes to white | certain | med | it is a scrim, the statement backdrop's role and alpha: `bg-riv-console-scrim/45` (porcelain moves `#0c2a33`→`#061e28` at 45%, invisible on a backdrop) | agent | open |
| R-6 | `theme-shell.e2e.ts`'s porcelain-pin case asserts `app-root[data-riv-theme="porcelain"]` under every tourist theme | certain | low | amended to assert the console's own choice, run for both console themes; the "no seam" paint diff kept | agent | open |
| R-7 | The payout statement's fixed `bg-white` panel keeps themed inks (`--riv-card-ink-soft`, `--riv-accent-ink`) → white on white in dark | certain | high | the panel takes the opaque `bg-riv-console-inset` (white in porcelain, byte-identical) and its hairlines follow `--riv-console-tint`; `payouts-tab.contrast.spec.ts`'s statement rows run in both themes | agent | open |
| R-8 | axe composites translucent dark fills over an assumed white page (the S7924 posture) and flags dark inks | med | med | the inset base is a slate near-black at ≥ 0.45, dark on the white fiction too, as `--riv-card-glass`'s 0.86 was chosen; the AC-4 axe runs are the proof | agent | open |
| R-9 | Fifteen contrast specs each re-declare a per-theme table → Sonar duplicated blocks | high | med | one `testing/console-themes.ts` table, `describe.each` over it in every spec | agent | open |
| R-10 | The chip's two new rows push the popover past 390px height or off the touch floor | low | low | `appTouchTarget` on both; the chip e2e's touch sweep at 390/344 already opens the popover | agent | open |
| R-11 | `check-touch-target.mjs` TT-1 on the two new `<button>`s; `check-inline-comments.mjs` on rationale comments | low | low | the hooks run on save; comments stay at the declaration in `tailwind.css` where the file's own convention keeps them | agent | open |

## Open questions / Assumptions

None open. The reversible calls below were decided by the agent (the maintainer was not present at
the intake gate) and are each recorded so the maintainer can reverse them on the PR:

### Resolved

- **Decided:** the inset family's dark base is `#020a16` (the rgb of the tourist dark theme's
  `--riv-field-fill`), so a console field or button sits *below* its dark card as the tourist dark
  fields do, and hover (`/85`) deepens rather than lightens. The alternative — pointing the console's
  standard tiles at the themed `--riv-tile-available-fill` (light glass in dark) — was rejected
  because its porcelain alpha is 0.75 against the console's 0.85: a drift the restyle owes no one.
- **Decided:** dark values — `--riv-console-accent-ink: #7cd7e8` (the accent family's dark ink, AA
  on the dark card), `--riv-console-negative-ink: #ffa9a1` (the themed error red's dark value; the
  base comment's "1.84:1" was measured over the *porcelain* card), `--riv-console-tint: #ffffff`
  (hairlines, insets and the hatch are white-at-alpha in dark, as the tourist `--riv-card-border`
  family is), `--riv-console-scrim: #020a16`, `--riv-console-card-border: rgba(255,255,255,0.16)`
  (the dark `--riv-card-border`), `--riv-select-tint: #7cd7e8` / `--riv-select-edge: #9adde8`,
  `--riv-alert-tint: #ff8a7a` (the dark danger family's rgb), `--riv-positive-tint: #7fd8ac`,
  `--riv-premium-edge: #c8ab62` (the tourist dark premium border), `--riv-premium-grad:
  linear-gradient(180deg, #f2d48c, #d9a640)` — a deeper night gold; every value AA-proven in the
  specs before it ships, and any that fails is retuned there, not here.
- **Decided:** bounded porcelain moves, each re-proven: the admin pill and field rims
  `border-white/95` / `/70` → `border-riv-card-border` (white/0.6 in porcelain — a rim is the card
  border's role, and a `/95` white base would be a hard ring in dark); the layout editor's CTA
  `border-white/40` → `border-riv-cta-border` (byte-identical); the tile numerals `text-[#0c2a33]` →
  `text-riv-card-ink` (`#0a2a33`); the sheet backdrop per R-5; the two amber banners
  (`#d97706`/`#f59e0b` and `rgba(240,170,46,·)`) → `--riv-warn-edge` at the ladder alphas (`/55`,
  `/15`), the #879 merge finishing; the sea banner's `#0e7a89→#0c6675` gradient → one image token
  `--riv-sea-grad`, theme-invariant under its fixed white ink.
- **Decided (phase 2, from the maths):** the dark premium cell is a dusk gold
  (`linear-gradient(180deg, #6b5324, #4a3916)`) under a light numeral (`--riv-premium-ink` themes:
  `#0a2a33` / `#f2d48c`), not the day gold deepened a shade: the light selection ring reads 1.14:1
  over a bright gold, and no single ring colour clears 3:1 over both a bright tile and the night
  sand. The tourist dark map made the same call (a dim gold glass, light gold ink).
- **Decided (phase 3, from the maths):** the console chip's avatar disc keeps the fixed brand
  fill and gains `ring-1 ring-riv-console-avatar-ring` — `transparent` in porcelain (byte-identical
  paint), white at 0.55 in dark, where the disc alone reads 2.61:1 on the header glass and the
  ring is the 3:1 boundary. Console-only: the tourist chrome's disc is decorative.
- **Decided:** `--riv-walkin-hatch` stays one declaration and themes through `--riv-console-tint`;
  a dark declaration is added only if R-3's proof needs a lighter band.
- **Decided:** the residue AC-2 records: `text-white`/`outline-white` over solid fills and the CTA
  gradient (the fixed-ink family), the camera preview's `bg-black/80` (a video is a photo surface),
  `status-chip`'s class-S palette. The ledger gains a class **N** row (named-colour utilities) with
  the population command and this residue.
- **Decided:** `ConsoleTheme` lives in `core/console-theme.ts`, key `riviera-console-theme`,
  default `porcelain`, no OS follow, `select()` persists through `writeStorage`; the app shell binds
  `shellChrome() === 'console' ? consoleTheme.theme() : null` and the `porcelain` computed retires.
- **Decided:** the chip rows are `<button type="button" aria-pressed>` under an uppercase
  `Console theme` label (the spike's draw), after `Change password`, before `Sign out`; a press
  selects, closes and returns focus to the chip like every other row (the tourist picker closes on a
  pick too); test ids `oc-theme-porcelain` / `oc-theme-dark`; the swatch dot is `aria-hidden` and
  carries the option's `swatch` gradient by `[style.background]`, the tourist picker's shape.
- **Decided:** the `console-dark` Playwright project runs only the three AC-4 files, filtered by
  `grep: /dark console/`, seeded through `storageState` (origins → localStorage), at the desktop
  viewport; the same tests run under `chromium` and assert porcelain's values, so one test proves
  both "differs" and "unchanged".
- **Fact:** zero open PRs at intake; no Flyway version in play; no other branch touches the shell,
  the stylesheet, the e2e config or the skills.
- **Fact:** #1013 closed via PR #1019 (merged); the epic's sub-issues read 6/7; the close-out comment
  is on #1006. Its plan doc `console-nav-palette.md` retires in this PR.
- **Fact:** module ownership is not in play — frontend only.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: styling and a theme choice; no booking, no `set_availability`
write path.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The console theme choice (state + storage) | frontend `core/` (`console-theme.ts`) | a stateful cross-cutting singleton, beside `core/theme.ts`; never a feature folder |
| The pin on the console host | frontend app root (`app.ts`) | the one console host since #1011; the document attribute stays `ThemeService`'s |
| The two rows | `operator/operator-account-chip.ts` | the chip is the switch's home (#1008, grill answer 14) |
| The per-theme test table | `src/testing/console-themes.ts` | test-side mirror, the `glass-tokens.ts` home |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/console-theme.ts` | new | `@Service` | `signal<ConsoleThemeId>`, `theme` read-only, `select()` | none |
| FE-2 | `app.ts` | existing | root component | host `[attr.data-riv-theme]` reads `ConsoleTheme.theme()` under the console chrome | none |
| FE-3 | `operator/operator-account-chip.ts` | existing | standalone component | two `aria-pressed` buttons off `ConsoleTheme.theme()`; the existing close/focus-return path | none |
| FE-4 | the six venue tabs, `beach-cell.ts`, `set-editor`, the admin components, `shared/beach-grid-frame.ts` | existing | templates | class strings only | none |
| FE-5 | `src/tailwind.css` | existing | the token registry | the dark block; `--riv-console-inset`, `--riv-premium-ink`, `--riv-sea-grad` | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()` signal APIs, `@Service`.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phase 4)`

**Next action:** phase 4 — `core/console-theme.ts` (spec red first), then the app shell's pin reads it.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 69818edb |
| 1 — tokens: the dark block, `--riv-console-inset` / `--riv-premium-ink` / `--riv-sea-grad`, the mirrors, the four guards flipped | ✅ | d6c8b6a8 |
| 2 — the console restyle (venue tabs AND the admin components, the sweep covers both): literals → tokens, `beach-cell`'s per-state ink, the banners, the statement; `testing/console-themes.ts`; the nine venue-console contrast specs in both themes; the literal sweep spec | ✅ | 4f6a38be |
| 3 — the chrome in both themes: `console-shell`, chip, switcher and palette contrast specs; the dark avatar ring | ✅ | (this commit) |
| 4 — `core/console-theme.ts` + the pin (`app.ts`, `app.spec.ts`) | | |
| 5 — the chip's `Console theme` rows (spec, a11y, contrast) | | |
| 6 — e2e: the `console-dark` project, the three tabs' cases, `theme-shell.e2e.ts`'s console cases | | |
| 7 — contract: lint, format, unit, the mocked e2e, the guards, the ledger, docs-freshness, #1013's plan retired; PR, CI, review gate, Sonar gate, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/console-dark-theme.md` — this plan.
- `docs/plans/console-nav-palette.md` — #1013's plan doc, retired at this close-out (deleted).
- `docs/design/colour-literal-token-audit.md` — class N (named-colour utilities), the console token rows, the shadow class.
- `docs/design/riviera-operator-console-v2.dc.html` · `docs/design/riviera-admin-console.dc.html` — as-built pointers for the theme rows.
- `.claude/skills/riviera-tailwind/SKILL.md` — § *Styling across the themes*: the third theme-invariant case (docs-freshness).
- `.claude/skills/riviera-frontend/SKILL.md` — § *Theming*: the console pin reads the console choice (docs-freshness).
- `frontend/src/tailwind.css` — the dark block for the console set; `--riv-console-inset`, `--riv-premium-ink`, `--riv-sea-grad`; the `@theme inline` rows; the retuned declaration comments.
- `frontend/src/testing/glass-tokens.ts` — the dark mirrors; `CLASS_O_TINTS` gains the dark column and the inset row.
- `frontend/src/testing/console-themes.ts` — the two-row per-theme table the console contrast specs iterate.
- `frontend/src/app/core/console-theme.ts` · `.spec.ts` — the console theme service.
- `frontend/src/app/app.ts` · `app.spec.ts` — the pin.
- `frontend/src/app/operator/operator-account-chip.ts` · `.spec.ts` · `.contrast.spec.ts` — the rows.
- `frontend/src/app/operator/operator-account-chip.spec.ts` — the row set, `aria-pressed`, the close leg.
- `frontend/src/app/operator/console-accent-token.contrast.spec.ts` · `console-negative-token.contrast.spec.ts` — the two-declaration contract, the dark AA row.
- `frontend/src/app/operator/console-literal-sweep.spec.ts` — AC-2's sweep.
- `frontend/src/app/operator/beach-cell.ts` · `beach-cell.spec.ts` — the inset tile, the premium numeral ink.
- `frontend/src/app/operator/daily-view-tab.html` · `daily-view-tab.ts` · `daily-view-tab.contrast.spec.ts`
- `frontend/src/app/operator/requests-tab.html` · `requests-tab.contrast.spec.ts`
- `frontend/src/app/operator/layout-editor.html` · `layout-editor.ts` · `layout-editor.contrast.spec.ts`
- `frontend/src/app/operator/set-editor.html` · `set-editor.contrast.spec.ts`
- `frontend/src/app/operator/pricing-tab.html` · `pricing-tab.contrast.spec.ts`
- `frontend/src/app/operator/venue-tab.html` · `venue-tab.contrast.spec.ts`
- `frontend/src/app/operator/venue-create-card.html` · `venue-create-card.contrast.spec.ts`
- `frontend/src/app/operator/payouts-tab.html` · `payouts-tab.contrast.spec.ts` · `payout-statement.ts`
- `frontend/src/app/operator/console-stats-strip.contrast.spec.ts`
- `frontend/src/app/operator/operator-console.html` · `operator-console.contrast.spec.ts`
- `frontend/src/app/operator/operator-home.ts`
- `frontend/src/app/operator/operator-venue-switch.contrast.spec.ts`
- `frontend/src/app/operator/booking-mode-field.ts` · `booking-cutoff-field.ts` · `stale-write-banner.ts` · `pending-approval-banner.ts`
- `frontend/src/app/admin/admin-mail-delivery.ts` · `admin-mail-outbox.ts` · `admin-refund-outbox.ts` · `admin-commissions.ts` · `admin-privacy.ts` · `admin-reviews.ts` · `admin-venue-photos.ts` · `admin-console.contrast.spec.ts`
- `frontend/src/app/shared/beach-grid-frame.ts` · `confirm-with-reason.ts` · `class-o-tint-tokens.contrast.spec.ts` · `fixed-ink-tokens.contrast.spec.ts` · `console-palette.contrast.spec.ts`
- `frontend/src/app/console-shell.contrast.spec.ts`
- `frontend/playwright.a11y.config.ts` — the `console-dark` project.
- `frontend/e2e/operator-daily.e2e.ts` · `operator-requests.e2e.ts` · `layout-editor.e2e.ts` · `theme-shell.e2e.ts`
- `frontend/e2e/support/shell.ts` — `expectThemedPaint(page, locator, property, porcelain, dark)` if the three files would otherwise repeat the probe.

---

## Phase 1 — the tokens

**Files:** Modify `frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`,
`frontend/src/app/operator/console-accent-token.contrast.spec.ts`,
`console-negative-token.contrast.spec.ts`, `frontend/src/app/shared/class-o-tint-tokens.contrast.spec.ts`,
`fixed-ink-tokens.contrast.spec.ts`.

- [x] **Step 1: Write the failing tests** — each guard: `declares the token in the base block and in the dark block, nowhere else`; `declares the values this test mirror carries, porcelain then dark`; the dark AA row over `DARK_CARD_GLASS` × `DARK_STOPS`; `CLASS_O_TINTS` gains `dark` per row and the `--riv-console-inset` row; the dark card border measured on the dark inset.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include 'src/app/operator/console-accent-token.contrast.spec.ts' --include 'src/app/operator/console-negative-token.contrast.spec.ts' --include 'src/app/shared/class-o-tint-tokens.contrast.spec.ts' --include 'src/app/shared/fixed-ink-tokens.contrast.spec.ts'` → 17 FAIL (`expected [ '#0a6e85' ] to have a length of 2`, `--riv-console-inset in the base block`, …).
- [x] **Step 3: Minimal implementation** — the dark block's twelve declarations; `--riv-console-inset`, `--riv-premium-ink`, `--riv-sea-grad`; the two `@theme inline` rows; the declaration comments retold (the "declared once, unreachable" ground ends).
- [x] **Step 4: Run it, verify it passes** — the four guards + `warn-token-skin`, `solid-fill-tokens`, `theme-boot` → 130/130 PASS (one measured ratio corrected on the way: the dark border on the dark inset reads 1.51, not the guessed 1.6).
- [x] **Step 5: Generalization-audit pass** — the log's phase-1 row.
- [x] **Step 6: Commit** — `Give every console token a dark value and flip the guards to two declarations (#1010)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — the venue console restyle

**Files:** the six tabs, `beach-cell.ts`, `set-editor.html`, the two banners, `payout-statement.ts`,
`operator-console.html`, `operator-home.ts`, the two field components, `shared/beach-grid-frame.ts`;
create `testing/console-themes.ts`, `operator/console-literal-sweep.spec.ts`; the tabs' contrast specs.

- [x] **Step 1: Write the failing tests** — the sweep (`console-literal-sweep.spec.ts`) and the nine venue-console contrast specs' `describe.each(CONSOLE_THEMES)` rows.
- [x] **Step 2: Run it, verify it fails** — the sweep: 61 unique literals (`expected [ …(61) ] to deeply equal []`); the maths: one real red — the light selection ring over the day gold reads 1.14:1 in dark, which retuned the dark premium gradient to a dusk gold with a themed light numeral (`--riv-premium-ink` now two declarations; recorded under *Open questions*).
- [x] **Step 3: Minimal implementation** — the class strings across `operator/`, `admin/`, `shared/beach-grid-frame.ts`, `shared/confirm-with-reason.ts`; `beach-cell`'s ink per state; the sheet backdrop onto the scrim.
- [x] **Step 4: Run it, verify it passes** — `src/app/operator/**`, `src/app/admin/**`, the class-O guard, the frame and canvas specs → 88 files / 1033 PASS.
- [x] **Step 5: Generalization-audit pass** — the log's phase-2 row.
- [x] **Step 6: Commit** — `Restyle the console onto themed tokens, proven in both themes (#1010)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — the admin console and the shell

**Files:** the admin components, `admin-console.contrast.spec.ts`, `console-shell.contrast.spec.ts`,
`operator-account-chip.contrast.spec.ts`, `operator-venue-switch.contrast.spec.ts`,
`console-palette.contrast.spec.ts`, `shared/confirm-with-reason.ts`.

- [x] **Steps 1–4** — the four chrome specs' `describe.each(CONSOLE_THEMES)` rows (the admin components were rewritten in phase 2, under the same sweep). One real red: the chip's avatar disc — the fixed brand teal, the chip's 3:1 boundary since #1008 — reads 2.61:1 on the dark header glass. Fixed with `--riv-console-avatar-ring` (`transparent` in porcelain, white at 0.55 in dark, the `--riv-hero-scrim` treatment-off shape) on the console chip's disc only; the tourist chrome's disc is decorative and untouched. Then 21 files / 322 PASS.
- [x] **Step 5: Generalization-audit pass** — population: every contrast spec whose header says "always porcelain" / "porcelain-pinned" → `grep -rln "always porcelain\|porcelain-pinned\|ALWAYS porcelain" frontend/src/app --include=*.contrast.spec.ts` — twelve files (the four chrome specs, six tab specs, the admin console, the two map specs); every header retold.
- [x] **Step 6: Commit** — `Prove the console chrome in both themes; ring the dark avatar (#1010)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 4 — the service and the pin

**Files:** Create `core/console-theme.ts`, `core/console-theme.spec.ts`; modify `app.ts`, `app.spec.ts`.

- [ ] **Step 1: Write the failing tests** — AC-5's service and app-shell cases.
- [ ] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include src/app/core/console-theme.spec.ts --include src/app/app.spec.ts` → FAIL (TS2307).
- [ ] **Step 3: Minimal implementation.**
- [ ] **Step 4: Run it, verify it passes** — plus `core/theme.spec.ts`, `core/theme-boot.spec.ts` (the document writer unchanged).
- [ ] **Step 5: Generalization-audit pass** — population: every writer of `data-riv-theme` → `grep -rn "rivTheme\|data-riv-theme" frontend/src/app --include=*.ts --include=*.html | grep -v spec`.
- [ ] **Step 6: Commit** — `Add the console theme service and pin the console host to its choice (#1010)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 5 — the chip rows

**Files:** `operator-account-chip.ts`, `.spec.ts`, `.contrast.spec.ts`; `console-shell.spec.ts` if the row set is pinned there.

- [ ] **Steps 1–4** — AC-5's chip case red (no rows), then the rows.
- [ ] **Step 5: Generalization-audit pass** — population: every spec that pins the chip's row set → `grep -rln "Change password.*Sign out\|'Sign out'\]" frontend/src/app frontend/e2e --include=*.ts`.
- [ ] **Step 6: Commit** — `Offer Porcelain and Dark in the account chip (#1010)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 6 — e2e

**Files:** `playwright.a11y.config.ts`, the three tab files, `theme-shell.e2e.ts`, `support/shell.ts`.

- [ ] **Steps 1–4** — AC-4 and AC-6 cases; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts operator-daily operator-requests layout-editor theme-shell`.
- [ ] **Step 5: Generalization-audit pass** — population: every e2e that asserts `app-root`'s theme attribute or seeds `riviera-theme` → `grep -rln "data-riv-theme\|riviera-theme" frontend/e2e`.
- [ ] **Step 6: Commit** — `Prove the dark console in the mocked e2e: a seeded project, the switch, no tourist leak (#1010)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 7 — contract

- [ ] **Steps 1–4:** `npm run lint`, `npm run format:check`, `npm test`, the whole mocked e2e; `node scripts/check-plan-file-structure.mjs --diff origin/main` and the other guards; the ledger; `riviera-docs-freshness` over the PR's range; #1013's plan deleted; the Tailwind and Angular doc checks recorded under *Skills consulted*.
- [ ] **Step 5: Generalization-audit pass** — the counting sweep.
- [ ] **Step 6: Commit** — `Record the dark console in the ledger and the skills; retire #1013's plan (#1010)`; push; draft PR.
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 2 | every `bg-white`/`border-white` position in `frontend/src/app` outside the console sources — the same mechanism on tourist surfaces | `grep -rnoE '\b(bg\|border)-(white\|black)(/[0-9]+)?' frontend/src/app --include=*.ts --include=*.html \| grep -v spec \| grep -v "operator/\|admin/"` | `shared/photo-slideshow.ts` (4), `shared/photo-lightbox.ts` (3), `pages/home/home.html` (2), `booking/booking-qr.ts`, `booking/booking-dialog.ts`, `app.html` (1 each) — photo chrome, the QR's print-white, the tourist shell | none to migrate here: photo surfaces and the tourist chrome, out of this slice's scope; recorded in the ledger's class N |
| 2026-09-07 | phase 1 | every stylesheet comment whose ground is the porcelain pin — the claim the dark console falsifies | `grep -n "pins porcelain\|porcelain pin\|porcelain-pinned\|Declared ONCE" frontend/src/tailwind.css` | 11 lines: the two console inks, the class-O header, the alert tint, the map palette (retold); the fixed-fill families, the subtree-host mechanism notes and `--riv-accent-*` (true as written) | five retold, six left true |
| 2026-09-07 | intake | every colour position the console paints that has no dark branch — the grey-slab mechanism: a light literal or a base-only token under the pin | `grep -rnoE '\b(bg\|border\|text\|from\|to\|via\|ring\|outline\|shadow\|divide)-(white\|black)(/[0-9]+)?' frontend/src/app/{operator,admin,shared} frontend/src/app/console-shell.ts` + the ledger's population command + the once-declared token list from `tailwind.css` | ~90 `bg-white/NN`, 6 `border-white/NN`, 3 opaque `bg-white`, 1 `bg-black/80`; 4 hex inks/rings, 2 amber banners, 1 gradient; 12 base-only tokens under the pin | the plan's phases 1–3; the residue recorded in AC-2 |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-7:** pending.

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
