# The availability calendar adopts the popover treatment — dark glass, light inks, a dark day-cell palette

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Under the `dark` theme the availability calendar's `<dialog>` paints the same
near-opaque slate glass and light inks as every other overlay, its four day tints become a
dark opaque set with their own AA proofs, and the six pinned `--riv-calendar-{glass,ink,
ink-soft,ink-faint,ink-disabled,hover}` tokens retire into `--riv-pop-*` — while the two
light themes keep every day-cell colour they paint today.

**Architecture:** The single most significant decision is the maintainer's verdict
(2026-09-02, via `AskUserQuestion` at the issue-intake gate): **adopt fully**, not "stay
light" and not "theme the chrome, keep the pale tints". The chrome therefore stops being a
family of its own and consumes the existing `--riv-pop-*` family (surface, border, ink,
ink-soft, hover, shadow) plus one new member, `--riv-pop-ink-disabled`, because a popover
with `aria-disabled` controls needs a weakened ink and the account menu never had one. The
day cells are the coupling the issue warned about, and the answer keeps the property that
made the tints opaque in the first place: they stay **opaque**, but become **themed** — one
value in the base block for the light themes, one in the `dark` block — so each contrast
proof is still a plain pair, now proved once per palette (eight pairs) rather than once per
theme × background stop. Eight new `--riv-calendar-*` tokens carry that palette (four fills,
the accent, the chosen-day ring, the bar fill and track); nothing about them is pinned, and
`riviera` inherits the light set because its popovers are white glass.

**Persistence:** N/A — frontend-only, no backend code and no schema change (invariants #1,
#12 untouched).

**Source of intent:** [#888](https://github.com/ivopogace/riviera-sunbed-booking/issues/888)
(the decision ticket #849 / PR #886 parked), parent
[#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836) (closed; this is the
class-S design pass its "adjacent, deliberately not taken" note deferred). The recorded
intent it enforces: the 2026-08-25 theme restructure note in
`docs/design/2026-07-02-liquid-glass-redesign-note.md` — "the dark theme inverts the whole
surface family (dark cards/dialogs/popovers/fields, light inks)".

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — established
that only `dark` is affected because `riviera` redeclares no popover token, that the tint
coupling is eight plain pairs and not a per-theme × per-stop matrix, that nothing is in
flight, and put the verdict to the maintainer rather than deciding it) · `riviera-plan-doc`
(this template — forced the behaviour-parity ledger, which is where the light-theme chrome
deltas are enumerated instead of hidden under "adopt") · `tdd` (each palette's guard is
written red against the un-migrated markup and the not-yet-declared tokens before the
tokens exist) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (N/A at plan time — runs at close-out over the PR range; the
substrate this slice changes is the ledger and the design note's popover claim) ·
`grilling` (the intake interview: one round, one decision, the three options and the
render-first option offered with a recommendation) · `riviera-tailwind` (tokens do the
switching and components never name a theme; a token painted over a fixed fill pins, so
un-pinning the fill is what lets the ramp theme; `var(--riv-*)` is right inside a composite
arbitrary value, which is how the chosen-day ring reaches its token; the `@layer base`
focus ring is overridden by colour only) · `riviera-frontend` (the mirror stays in
`src/testing/`, the guard in the feature folder, the render proof in the CI-safe mocked
suite; the token registry is `tailwind.css` + `@theme inline`, no `core/theme.ts` row for a
per-token change) · `riviera-local-debug` (scoped Vitest and Playwright invocations for this
cloud session, the pre-installed Chromium path) · `angular-developer` + angular-cli MCP
(loaded at phase 0 — the diff is class strings and one constant record; re-vetted the
component against the v22 posture) · `playwright-cli` (loaded at phase 1 — the mocked e2e
forcing each document theme and reading computed styles) · `domain-modeling`'s ADR bar
(applied from `CLAUDE.md`: a token repaint is cheap to reverse and, once the dark-theme note
is read, not surprising — **no ADR**; the verdict is recorded in the ledger and here) ·
`postgres` — N/A, no table or migration.

**Branch:** `claude/sdlc-888-p0mn33` — the cloud session's designated remote branch stands
in for `feature/<slug>` per `riviera-sdlc`'s remote addendum.

---

## Acceptance criteria (testable)

Every AC observes through one of three seams, the same three #849 named because the same
three failures are possible: the **stylesheet source** (a token declared once where it must
now be declared twice, or a forgotten `@theme inline` row), the **contrast mirror** (the
maths, per palette), and the **computed style in a real render** (the cascade under a real
document theme, which no unit spec can see).

- [ ] **AC-1:** Given `src/tailwind.css` and `venue/availability-calendar.html`, when both
      are read as text, then none of `--riv-calendar-glass`, `-ink`, `-ink-soft`, `-ink-faint`,
      `-ink-disabled`, `-hover` is declared, mapped in `@theme inline`, or consumed, and the
      `<dialog>` paints `bg-riv-pop-surface`, `text-riv-pop-ink`, `border-riv-pop-border`,
      `shadow-riv-pop`, the weekday headers and footer note `text-riv-pop-ink-soft`, the
      month-step buttons `hover:bg-riv-pop-hover`, and every `aria-disabled` site
      `aria-disabled:text-riv-pop-ink-disabled`. *Seam:* the stylesheet + the template, read
      as text (`testing/stylesheet-tokens.ts`). *Pinned by:*
      `availability-calendar.contrast.spec.ts` › `the popover chrome` › `retires the pinned
      ramp and consumes the popover family` + `fixed-ink-tokens.contrast.spec.ts` › `the
      sites` › `venue/availability-calendar.html paints no migrated literal`
- [ ] **AC-2:** Given the popover chrome in each theme, when `--riv-pop-ink` and
      `--riv-pop-ink-soft` are composited on `--riv-pop-surface` over that theme's worst-case
      gradient stops (light values over `PORCELAIN_STOPS` and `RIVIERA_STOPS`, dark values
      over `DARK_STOPS`), then each clears AA, and `--riv-pop-ink-disabled` lands in the
      legible-but-weakened band (above 2:1, below 3:1, weaker than the primary ink) in each —
      so the `aria-disabled` exemption stays load-bearing in both directions. *Seam:* the
      `testing/glass-tokens.ts` mirror + `testing/contrast.ts`. *Pinned by:*
      `availability-calendar.contrast.spec.ts` › `the popover chrome over the %s background`
- [ ] **AC-3:** Given the eight `--riv-calendar-*` tokens and `--riv-pop-ink-disabled`, when
      `src/tailwind.css` is read as text, then each is declared **exactly twice** — once in
      the base block (`:root, [data-riv-theme='porcelain']`) and once in the
      `[data-riv-theme='dark']` block, never in `riviera`'s — each declaration equals the
      mirror's value for that palette, and each carries an `@theme inline` row. *Seam:*
      `testing/stylesheet-tokens.ts` (`declarationsOf`, `baseBlock`). *Pinned by:*
      `availability-calendar.contrast.spec.ts` › `the stylesheet contract`
- [ ] **AC-4:** Given each palette (light, dark), when every pair is measured as an opaque
      pair, then: the ink reads AA on each of the four fills; the focus ring (the accent) and
      the chosen-day ring each read ≥ 3:1 on each fill and differ from each other; the bar
      fill reads ≥ 3:1 on its track and the track ≥ 3:1 on each non-`unknown` fill; and the
      accent (the month-step glyphs) reads AA on the popover surface over that palette's
      stops. *Seam:* `testing/calendar-tints.ts` + `testing/glass-tokens.ts`. *Pinned by:*
      `availability-calendar.contrast.spec.ts` › `the %s palette`
- [ ] **AC-5:** Given `venue/day-availability.ts`, when `DAY_TINT_CLASS` and
      `DAY_SELECTED_CLASS` are compared with the mirror, then the tint record renders exactly
      the fill utilities the mirror's tokens name (a set, not a subset), every entry carries
      the accent focus ring, and the chosen-day ring is drawn from `--riv-calendar-selected-ring`
      through a `var()` inside the inset shadow. *Seam:* the exported constants. *Pinned by:*
      `day-availability.spec.ts` › `the tint mirror`
- [ ] **AC-6:** Given a real Chromium render of `/venues/:id` with the calendar open, when
      the document theme is forced **porcelain** and then **dark**, then the `<dialog>`'s
      `background-color`, the month heading's `color`, a weekday header's `color`, the
      footer note's `color`, a bookable `free` cell's `background-color`, a month-step glyph's
      `color`, its hovered `background-color`, a past cell's `color`, and the chosen cell's
      `box-shadow` each report that theme's value — different values under the two themes,
      which is the inverse of the claim #849's test made on the same box. *Seam:* the mocked
      route `/venues/:id` + `/api/venues/:id/availability-calendar`. *Pinned by:*
      `e2e/fixed-ink-token-recut.e2e.ts` › `the calendar popover follows the theme under
      ${theme} (#888)` + `the calendar disables past days in the theme's weakened ink (#888)`
- [ ] **AC-7:** Given the light palette, when its values are read, then the four fills, the
      accent, the chosen-day ring, and the bar pair are byte-identical to the literals the
      tree paints today (`#dff0e4`, `#fdeecc`, `#fae9e9`, `#ffffff`; `#0a3f4e`; `#085a6e`;
      `#0a3f4e` / `#6f8a91`) — the verdict retunes `dark`, and the light-theme movement is
      confined to the chrome deltas the parity ledger enumerates. *Seam:* the mirror ·
      *Pinned by:* `availability-calendar.contrast.spec.ts` › `the light palette keeps the
      cell colours the tree painted before it was themed` + AC-6's porcelain leg
- [ ] **AC-8 (documentation, no test):** `docs/design/colour-literal-token-audit.md` records
      the verdict against the "adjacent, deliberately not taken" note and the two class-S
      calendar rows (and the open `outline-[#0a3f4e]` row) as `done` with this PR; the same
      file gains the "three overlay families" fact under a heading a future sweep will find;
      the `--riv-pop-surface` declaration comment names the calendar as a consumer; and
      the design note's popover claim gains no pointer because the shipped app now matches it.
      Verified by diff inspection at the Self-review checklist and by
      `riviera-docs-freshness` at close-out.

### The palette these ACs are written from

Measured with `testing/contrast.ts`'s maths before a line was written; the spec re-measures
every row. Both palettes are opaque, so each cell proof is one pair.

| Role | Token | Light (base block; `riviera` inherits) | Dark |
|---|---|---|---|
| free fill | `--riv-calendar-free-fill` | `#dff0e4` (unchanged) | `#1f3f30` |
| low fill | `--riv-calendar-low-fill` | `#fdeecc` (unchanged) | `#4a3a16` |
| full fill | `--riv-calendar-full-fill` | `#fae9e9` (unchanged) | `#4d2429` |
| unknown fill | `--riv-calendar-unknown-fill` | `#ffffff` (unchanged) | `#1c2740` |
| accent — month-step glyphs + the cell focus ring | `--riv-calendar-accent` | `#0a3f4e` (unchanged) | `#9adde8` |
| chosen-day ring | `--riv-calendar-selected-ring` | `#085a6e` (unchanged) | `#7cd7e8` |
| bar fill | `--riv-calendar-bar-fill` | `#0a3f4e` (unchanged) | `#e6f4f8` |
| bar track | `--riv-calendar-bar-track` | `#6f8a91` (unchanged) | `#758a9a` |
| cell ink | `--riv-pop-ink` (existing) | `#0a2a33` | `#f2f7fa` |
| weakened ink | `--riv-pop-ink-disabled` (**new**) | `rgba(12, 42, 51, 0.4)` | `rgba(242, 247, 250, 0.32)` |

Dark measurements the spec pins (light ones are the tree's existing proofs): ink on the
fills 10.2–13.8:1; accent ring 7.3–9.8:1; chosen ring 6.7–9.0:1; bar fill on track 3.19:1;
track on free/low/full 3.23 / 3.07 / 3.66:1; accent on the popover surface ≥ 11.2:1;
weakened ink 2.77:1 over every dark stop (light: 2.33–2.39:1 over the 0.92 glass). The
track-on-low margin is the thinnest in either palette and is the reason `#758a9a` and not
the light track's `#6f8a91` (3.00:1 — on the line).

**Why the accent is not `--riv-accent-ink`.** The `@layer base` focus ring already paints
`--riv-accent-ink`, and its values (`#085a6e` light, `#7cd7e8` dark) would clear 3:1 on
every fill in both palettes — so the calendar *could* drop its ring override and take the
baseline. It does not, because the chosen-day ring is `#085a6e` in the light themes, and a
focused chosen cell would then wear one colour twice (a 3px outline and a 2px inset ring),
which is the distinguishability `availability-calendar.contrast.spec.ts` has asserted since
#761. The calendar keeps its own accent and the two rings stay distinct in both palettes.

## Non-goals

- **The `riviera` theme's popovers.** They are white glass by that theme's design (its cards
  keep the Liquid Glass); the calendar inherits the light palette there exactly as the
  account menu inherits `--riv-pop-surface`. No riviera block entry for any token here.
- **The other class-S per-state palettes** (`status-chip`, `booking-view`'s panels,
  `confirm-panel`, the beach-map tiles). This is the calendar's design pass only; the ledger's
  class-S table shrinks by the calendar's rows and nothing else.
- **`--riv-pop-*` retunes.** The family's values are consumed, not moved; the account menu
  and theme picker paint exactly what they painted (`app.contrast.spec.ts` keeps proving them).
- **The booking dialog and find-a-booking** (`--riv-dialog-glass`) — already themed, untouched.
- **A new e2e file.** The issue names `e2e/fixed-ink-token-recut.e2e.ts` as the file to
  extend; its calendar tests flip from "the same value under both themes" to "the theme's
  value under each", and its header records that the calendar has left the fixed-ink group.
- **An ADR.** The bar is applied and not met — see Open questions › Resolved.
- **`venue-map`'s date field and the map itself** (`--riv-map-*`): separate surfaces with
  their own night palette already.

## Behavior-parity ledger (retirement / replacement slices only)

The six `--riv-calendar-*` chrome tokens are retired and the calendar's paint is replaced
family by family. "No pixel moves" was #849's claim and is deliberately **not** this
slice's: the verdict is a repaint. What moves is enumerated so the light-theme deltas are a
decision and not a side effect.

| Old-surface paint position | Verdict | How the new surface does it, or what moved |
|---|---|---|
| `<dialog>` fill `--riv-calendar-glass` `rgba(255,255,255,0.97)` in all themes | **changed** | `bg-riv-pop-surface`: light `rgba(255,255,255,0.92)` (0.05 more translucent — the popover family's own value), dark `rgba(16,26,46,0.96)` |
| `<dialog>` border `border-[rgba(255,255,255,0.7)]` | **preserved** in light, changed in dark | `border-riv-pop-border`: light is the same `0.7` white; dark `rgba(255,255,255,0.16)` |
| `<dialog>` shadow `0 24px 58px rgba(6,30,40,0.42), inset 0 1px 0 rgba(255,255,255,0.85)` | **changed** | `shadow-riv-pop`: light `0 22px 54px rgba(6,30,40,0.4), inset … 0.85` (a 2px/4px/0.02 nudge onto the family's value), dark `0 22px 54px rgba(0,0,0,0.55), inset … 0.08` |
| primary ink `--riv-calendar-ink` `#0a2a33` (root + month heading + day cells) | **preserved** in light, changed in dark | `text-riv-pop-ink`: light `#0a2a33` (identical), dark `#f2f7fa` |
| footer note `--riv-calendar-ink-soft` `rgba(12,42,51,0.78)` | **changed** | `text-riv-pop-ink-soft`: light `0.7` (0.08 fainter, 5.35–5.71:1, AA holds), dark `rgba(242,247,250,0.75)` |
| weekday headers `--riv-calendar-ink-faint` `rgba(12,42,51,0.72)` | **changed** | `text-riv-pop-ink-soft`: light `0.7` (0.02 fainter), dark `0.75`. The `.72`/`.78` split had no recorded reason; the popover family has one soft ink |
| disabled ink `--riv-calendar-ink-disabled` `rgba(12,42,51,0.4)` | **preserved** in light, new in dark | `aria-disabled:text-riv-pop-ink-disabled`: light `0.4` (identical), dark `0.32` — the alpha that lands in the same 2–3:1 band |
| month-step hover `--riv-calendar-hover` `rgba(12,42,51,0.07)` | **changed** | `hover:bg-riv-pop-hover`: light `0.06` (0.01 fainter — the family's value), dark `rgba(255,255,255,0.08)` |
| month-step glyphs `text-[#0a3f4e]` | **preserved** in light, new in dark | `text-riv-calendar-accent` |
| day tints `bg-[#dff0e4]` / `bg-[#fdeecc]` / `bg-[#fae9e9]` / `bg-white` | **preserved** in light, new in dark | `bg-riv-calendar-{free,low,full,unknown}-fill` (AC-7) |
| cell focus ring `focus-visible:outline-[#0a3f4e]` ×4 | **preserved** in light, new in dark | `focus-visible:outline-riv-calendar-accent` on each tint entry (still one `outline-color` utility per element) |
| chosen-day ring `shadow-[inset_0_0_0_2px_#085a6e]` | **preserved** in light, new in dark | `shadow-[inset_0_0_0_2px_var(--riv-calendar-selected-ring)]` |
| bar track `bg-[#6f8a91]` / bar fill `bg-[#0a3f4e]` | **preserved** in light, new in dark | `bg-riv-calendar-bar-track` / `bg-riv-calendar-bar-fill` |
| `rounded-[22px]`, `max-w-[352px]`, the `riv-pop` animation, `backdrop-blur-[28px]`, the focus trap, `aria-modal`, the live region | **preserved** | untouched — layout and behaviour are not in scope; `riviera-tailwind` rule 3 keeps the radius the consumer's own |
| `e2e/availability-calendar.e2e.ts`'s "tints must paint and differ from each other" | **preserved** | computed-style assertion, theme-agnostic; passes on both palettes |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A new token is declared but its `@theme inline` row is forgotten — the utility never generates and the cell paints nothing (transparent over the popover) | med | high | AC-3's `@theme inline` guard **and** AC-6's rendered `background-color` on a `free` cell | agent | open |
| R-2 | A token is declared in the base block only — the light value leaks into `dark` and the mirror's dark proofs pass against a value the cascade never paints | med | high | AC-3 asserts **exactly two** declarations per token and reads the dark one back; AC-6's dark leg reads the box | agent | open |
| R-3 | The chosen-day ring's `var()` inside an arbitrary `shadow-[…]` does not compile, or Tailwind's extractor drops the class | low | med | AC-6 asserts the chosen cell's rendered `box-shadow` contains the ring colour; `riviera-tailwind` records `var(--riv-*)` inside a composite arbitrary value as the sanctioned form | agent | open |
| R-4 | The dark track-on-low margin (3.07:1) is thin; a later retune of either value drops it under 3:1 | med | med | AC-4 pins it; the palette table records why `#758a9a` and not the light track | agent | open |
| R-5 | `--riv-pop-ink-disabled` widens the popover family for one consumer, and a later slice reads it as unused | low | low | Declared beside `--riv-pop-ink-soft` with its consumer named; the mirror and AC-2 give it a proof of its own | agent | open |
| R-6 | The light-theme chrome deltas (glass 0.97→0.92, inks →0.7, hover →0.06, shadow) read as accidental drift at review | med | low | Enumerated in the parity ledger with the ratio each still clears; the ledger row states the verdict is a repaint | agent | open |
| R-7 | `availability-calendar.spec.ts` asserts class literals (`bg-[#dff0e4]`, `shadow-[inset_0_0_0_2px_#085a6e]`, `bg-[${CALENDAR_BAR.fill}]`) and goes red on the migration | certain | low | Re-pointed at the token utilities in phase 0, reading names from the mirror rather than restating them | agent | open |
| R-8 | `fixed-ink-tokens.contrast.spec.ts`'s calendar section asserts the very pinning this slice removes (single declaration, base block, the accent left literal) | certain | low | The calendar section leaves that file; its stylesheet-contract loop, `MIGRATED_LITERALS` sweep and "candidate tokens unchanged" assertions stay and still hold (`--riv-pop-ink` is consumed, not moved) | agent | open |
| R-9 | The `@layer base` focus ring (`--riv-accent-ink`) wins over the cell's colour override, or vice-versa, differently per theme | low | med | Utilities sit in a later layer than `base` (the #890 design); AC-6 does not assert the ring colour but `discover-photos.e2e.ts` already asserts the 3px width on this control, and the override is the same shape as before | agent | open |
| R-10 | The pop mirrors added to `glass-tokens.ts` diverge from `app.contrast.spec.ts`'s private copies | low | low | `app.contrast.spec.ts` drops its private `POPOVER`/`DARK_POPOVER`/`DARK_POP_INK` for the shared mirror (#835's R-5) | agent | open |

## Open questions / Assumptions

- **Assumption:** the dark tint hues (a green, an amber, a red, and a near-surface slate)
  are the right dark counterparts of the light set's meaning — chosen by the same semantic
  the light tints carry, at the darkness the proofs need. *Owner:* maintainer · *Resolves by:*
  the PR's review, where the rendered dark calendar is the thing to look at; a hue change is
  a value edit in two files (`tailwind.css` + the mirror) and re-runs the same proofs.
- **Assumption:** the light-theme chrome deltas in the parity ledger are acceptable under
  "adopt fully" — the calendar becomes a popover-family consumer in every theme, not only in
  `dark`. *Owner:* maintainer · *Resolves by:* the PR's review.

### Resolved

- **Decision (intake gate, `AskUserQuestion`, 2026-09-02):** adopt fully, recommended and
  chosen over "stay pinned light", "adopt chrome only, keep the pale tints", and "render both
  first". Recorded here and in the ledger.
- **Open question (grill):** is `riviera` affected? **No.** The riviera block
  (`tailwind.css` `[data-riv-theme='riviera']`) redeclares no `--riv-pop-*` token, so its
  popovers are the base block's white glass and the calendar inherits the light palette there.
- **Open question (grill):** does the tint coupling force a per-theme × per-stop proof
  matrix? **No.** Opaque tints stay plain pairs; two palettes double the pair count
  (4 → 8 fills) and nothing else. The `availability-calendar.contrast.spec.ts` docstring's
  reasoning still holds and is kept.
- **Open question (grill):** ADR? **No.** `domain-modeling`'s bar (hard-to-reverse AND
  surprising AND a real trade-off) — the change is a token repaint reversible by editing two
  files, and the design note already states the dark theme inverts popovers. The verdict
  belongs in the ledger, which is where the next sweep looks.
- **Open question (grill):** anything in flight? **No** — no open PRs, `#836` closed with all
  ten sub-issues completed, no Flyway number at stake.
- **Open question (grill):** could the cell focus ring take the `@layer base` baseline
  instead of a calendar token? **Measured yes, chosen no** — see "Why the accent is not
  `--riv-accent-ink`" above.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes CSS custom properties, class strings
and their guards; it reads and writes no booking, set or date, and touches no backend code.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/availability-calendar.html` (+ `.ts` unchanged) | existing | standalone component template | unchanged — the diff is class strings | none |
| FE-2 | `venue/day-availability.ts` | existing | exported constants (`DAY_TINT_CLASS`, `DAY_SELECTED_CLASS`) | none | none |

**Standards:** unchanged. The component keeps its signals, `@for` grid, focus trap and live
region; nothing about its TypeScript moves.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phases 0–1 committed; next: phase 2)`

**Next action:** Phase 2 step 1 — the ledger verdict, the class-S rows, and the overlay-families
section in `docs/design/colour-literal-token-audit.md`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the tokens, the migrated markup, the unit guards | ✅ | `432fb15` |
| 1 — the real-render proof under both themes | ✅ | the commit carrying this row |
| 2 — the ledger verdict and the overlay-families fact | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/calendar-popover-theming.md` — this plan
- `frontend/src/tailwind.css` — retire the six `--riv-calendar-*` chrome tokens (declarations
  + `@theme inline` rows); declare `--riv-pop-ink-disabled` beside the popover family in the
  base and dark blocks; declare the eight day-cell tokens in both blocks with their
  `@theme inline` rows; name the calendar at the `--riv-pop-surface` comment
- `frontend/src/app/venue/availability-calendar.html` — the `<dialog>`, header buttons,
  weekday headers, footer note, bar track/fill onto the tokens
- `frontend/src/app/venue/day-availability.ts` — `DAY_TINT_CLASS` and `DAY_SELECTED_CLASS`
  onto the tokens
- `frontend/src/testing/glass-tokens.ts` — the `--riv-pop-*` mirrors (surface, ink, ink-soft,
  ink-disabled, hover; light + dark), the six calendar chrome mirrors removed
- `frontend/src/testing/calendar-tints.ts` — the per-palette mirror (`CALENDAR_PALETTE`,
  `DARK_CALENDAR_PALETTE`, `CALENDAR_PALETTES`), each entry naming its token
- `frontend/src/testing/stylesheet-tokens.ts` — `themeBlock(theme)`, so a guard can assert a
  declaration sits in the `dark` block and not the `riviera` one
- `frontend/src/app/venue/availability-calendar.contrast.spec.ts` — the per-palette proofs,
  the stylesheet contract, the chrome proofs over each theme's stops
- `frontend/src/app/venue/day-availability.spec.ts` — the tint mirror as token utilities
- `frontend/src/app/venue/availability-calendar.spec.ts` — class assertions onto the token
  utilities
- `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` — the calendar section leaves
  (three families remain); docstring updated
- `frontend/src/app/app.contrast.spec.ts` — the private popover copies replaced by the mirror
- `frontend/e2e/fixed-ink-token-recut.e2e.ts` — the calendar tests flip to per-theme values;
  the registry and utilities lists shed the retired tokens
- `docs/design/colour-literal-token-audit.md` — the verdict, the class-S rows, the open
  `outline-[#0a3f4e]` row, the "three overlay families" fact, the header index

---

## Phase 0 — The tokens, the migrated markup, the unit guards

**Files:** Modify `frontend/src/tailwind.css` ·
`frontend/src/app/venue/availability-calendar.html` ·
`frontend/src/app/venue/day-availability.ts` · `frontend/src/testing/glass-tokens.ts` ·
`frontend/src/testing/calendar-tints.ts` · Test
`frontend/src/app/venue/availability-calendar.contrast.spec.ts` ·
`frontend/src/app/venue/day-availability.spec.ts` ·
`frontend/src/app/venue/availability-calendar.spec.ts` ·
`frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` ·
`frontend/src/app/app.contrast.spec.ts`

- [x] **Step 1: Write the failing guards** — the pop mirrors in `glass-tokens.ts` and the
      per-palette mirror in `calendar-tints.ts` first (the specs read from them), then: the
      calendar contrast spec's `the stylesheet contract` (two declarations per token, values,
      `@theme inline` rows, the six retired names absent), `the $name palette` (AC-4 per
      palette), `the popover chrome` (AC-1 consumption + AC-2 over stops), `the light palette`
      (AC-7); the day spec's mirror as token utilities (AC-5); the calendar spec's class
      assertions; `fixed-ink-tokens.contrast.spec.ts` without its calendar section;
      `app.contrast.spec.ts` on the shared mirror. `stylesheet-tokens.ts` gained
      `themeBlock(theme)` so the contract can say *which* block a declaration sits in.
- [x] **Step 2: Run them, verify they fail** — `cd frontend && npx ng test --watch=false
      --include=…` over the five specs → 32 failed: every `--riv-calendar-*` declaration list
      empty, the template not wearing `bg-riv-pop-surface`, both sources still painting
      `#0a3f4e`. (Bare `npx vitest run` bypasses the builder's setup and is not the command.)
- [x] **Step 3: Minimal implementation** — the token declarations in both blocks with the
      reason at the declaration, the `@theme inline` rows, the six retired declarations and
      rows removed, the template and the two constants onto the utilities.
- [x] **Step 4: Run them, verify they pass** — the same command → 173 passed; broadened to
      `--include="src/app/venue/*.spec.ts"` → 284 passed; Prettier + ESLint clean on every
      touched file; the three diff-scoped hygiene guards clean against `origin/main`.
- [x] **Step 5: Generalization-audit pass** — appended below: the overlay surfaces enumerated
      by mechanism; two themed families, the calendar un-pinned, two overlays outside the
      families for stated reasons.
- [x] **Step 6: Commit** — `432fb15`.
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The real-render proof under both themes

**Files:** Test `frontend/e2e/fixed-ink-token-recut.e2e.ts`

- [x] **Step 1: Write the assertions** — dropped the six calendar rows from `REGISTRY` and the
      four calendar utilities from `UTILITIES`; added the per-theme `CALENDAR` registry (the
      eight day-cell tokens + `--riv-pop-ink-disabled` at each theme's value) asserted at the
      document root under each theme; rewrote `the calendar popover paints the same fixed
      ramp under ${theme}` as `the calendar popover follows the theme under ${theme} (#888)`
      with each theme's expected computed values, the bar pair, the accent glyph, and the
      chosen cell's `box-shadow`; the disabled-day test runs per theme. The file header
      records that the calendar has left the fixed-ink group and stays here because this is
      the file that renders it in both themes.
- [x] **Step 2: Verify it fails the honest way** — with the dark block's
      `--riv-calendar-free-fill` declaration commented out, the dark leg read the light fill
      (`rgb(223, 240, 228)` where `rgb(31, 63, 48)` was expected) → FAIL; restored.
- [x] **Step 3: Run it, verify it passes** — `cd frontend &&
      PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
      --config=playwright.a11y.config.ts e2e/fixed-ink-token-recut.e2e.ts
      e2e/availability-calendar.e2e.ts` → 19 passed.
- [x] **Step 4: Commit** — `git commit -m "Prove the themed calendar popover on the rendered box under both themes (#888)"`
- [x] **Step 5: Update plan-doc execution status.**

---

## Phase 2 — The ledger verdict and the overlay-families fact

**Files:** Modify `docs/design/colour-literal-token-audit.md`

- [ ] **Step 1:** Rewrite the "adjacent, deliberately not taken" calendar note under class T-3
      to `done — #888, PR #NN` with the verdict; mark the two class-S calendar rows and the
      open `outline-[#0a3f4e]` row `done` the same way; append `#888` to the header's index.
- [ ] **Step 2:** Add a short section, `## The overlay surfaces — three families, all themed`,
      naming `--riv-pop-*` (menus + the calendar), `--riv-dialog-glass` (booking dialog,
      find-a-booking), and the retired pinned family, so the question is not rediscovered.
- [ ] **Step 3: Commit** — `git commit -m "Record the calendar popover verdict and the three overlay families (#888)"`
- [ ] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | phase 0 | **Every overlay surface in `frontend/src/app`, by the mechanism that makes one** — a `<dialog>`, a `role="dialog"`/`role="menu"` box, an `aria-modal`, or one of the two overlay-family fills — rather than by resembling the calendar | `grep -rn -E '<dialog\|role="dialog"\|role="menu"\|bg-riv-pop-surface\|bg-riv-dialog-glass\|aria-modal' frontend/src/app --include=*.html --include=*.ts \| grep -v spec.ts` | 6 surfaces in 6 files | **Two themed families, one pinned surface that this slice un-pins, and two overlays outside the families for stated reasons.** `app.ts` (the theme picker, account menu and mobile sheet) paints `--riv-pop-surface`; `booking/booking-dialog.ts` and `booking/find-booking.ts` paint `--riv-dialog-glass`; `venue/availability-calendar.html` painted the pinned `--riv-calendar-glass` and now paints `--riv-pop-surface` (this slice). `operator/payout-statement.ts` is `bg-white` under the console's porcelain-pinned host (`operator-console.ts` `data-riv-theme='porcelain'`; `app.ts` pins the operator shell the same way), so its dark branch is unreachable — the console's standing ground, not a fourth family. `shared/photo-lightbox.ts` is a fixed `rgba(4,18,24,0.86)` scrim over a photo, photo-proof by design like `--riv-photo-chrome`. Nothing else to migrate; the fact goes into the ledger (phase 2) so the next sweep starts from it |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5, AC-7:** Run `cd frontend && npx vitest run src/app/venue src/app/shared/fixed-ink-tokens.contrast.spec.ts src/app/app.contrast.spec.ts` → all passed. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `cd frontend && PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts e2e/fixed-ink-token-recut.e2e.ts e2e/availability-calendar.e2e.ts` → all passed. Verified at commit `<sha>`.
- [ ] **AC-8:** Verified by diff inspection (no test — stated as such in the AC).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-8 excepted, declared untested).
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
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
