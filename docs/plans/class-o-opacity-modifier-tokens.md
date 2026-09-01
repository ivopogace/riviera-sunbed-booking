# Class O — `/opacity`-modifier colour positions become tokens

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle, once, how a `/opacity`-modifier colour literal becomes a `--riv-*` token —
**rule B: the modifier stays, the literal inside it becomes a token** — record the rule and its
evidence in `docs/design/colour-literal-token-audit.md`, and apply it to all 44 class-O positions
with zero pixel change.

**Architecture:** The single significant decision is **B over A**, and it rests on a measurement
rather than the ticket's premise. Tailwind compiles `bg-[#2bb8d4]/20` to
`color-mix(in oklab, #2bb8d4 20%, transparent)`; it compiles `bg-riv-x/20` to the *same expression*
with `var(--riv-x)` in the colour slot. So B is not a value change at all — it is the narrowest
possible substitution, and the computed-style **string** is preserved too, which A does not manage.
One token per base colour, theme-invariant, alpha left at the call site.

**Persistence:** N/A — frontend-only, no backend or schema change (invariant #1 untouched).

**Source of intent:** [#852](https://github.com/ivopogace/riviera-sunbed-booking/issues/852)
(class **O** of [#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836)); the ledger
is `docs/design/colour-literal-token-audit.md` § *Class O*.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill overturned
the ticket's central premise, see *Resolved* below, and turned up three class-O positions the
ledger's own table never listed) · `riviera-plan-doc` (this template — forced the behaviour-parity
ledger, which is what surfaced that three sibling specs assert these literals *present* and will go
red) · `tdd` (each family is red-green at the three seams named in the ACs: the stylesheet source,
the rendered class list, the composited paint) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (**ran** — phase 4, over the slice's own merge range;
the counting sweep matters here because sibling specs and the ledger both state "#852's" as
*pending* work) · `riviera-tailwind` (the `@theme inline` + per-theme-`:root` registration shape,
the theme-invariant-is-a-decision rule, and the #858 take-the-ternary-whole rule — which is what
widened the slice past the 44 positions onto three entangled skins) · `riviera-frontend` (token
registry lives in exactly two places — `tailwind.css` and `core/theme.ts`; specs colocate with the
feature as `<name>.contrast.spec.ts`) · `riviera-local-debug` (scoped Vitest/Playwright runs; the
`PW_CHROMIUM_EXECUTABLE` recipe for the mocked e2e suite) · `playwright-cli` (the mocked-suite
`toHaveCSS` proof, which is the only thing that catches a token registered without its `@theme
inline` row) · `angular-developer` + angular-cli MCP (`search_documentation` v22 — queried twice
for a position on colour tokens/contrast, **zero results** both times; recorded as evidence, not
skipped)

**Branch:** `claude/sdlc-852-6zjy5a` — **cloud session:** the designated remote branch stands in
for `feature/class-o-opacity-modifier-tokens` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

> Frontend slice — every AC names its seam explicitly, since "the inner hexagon" names none.
> Three seams carry this whole slice, and each catches a failure the others cannot:
> **(S1)** `src/tailwind.css` **as text** (`testing/stylesheet-tokens.ts`) — the only thing that
> can see a declaration that is single and theme-invariant, because jsdom maths would still pass
> if a dark override were added later; **(S2)** the **rendered class list** of the component under
> test — catches a site the sweep missed; **(S3)** the **composited paint** in a real browser
> (`toHaveCSS`, mocked e2e) — the only thing that catches a token declared without its
> `@theme inline` row, where the class stays in the markup and the paint silently does not change.

- [ ] **AC-1:** Given the eleven class-O base colours, when `src/tailwind.css` is read as text, then each token is declared **exactly once** and that declaration sits in the base block (`:root, [data-riv-theme='porcelain']`), and each carries its `@theme inline` row. *Seam:* S1 — `src/tailwind.css` via `stylesheet-tokens.ts` · *Pinned by:* `shared/class-o-tint-tokens.contrast.spec.ts` › "every class-O token is declared once, in the base block, with its @theme inline row"
- [ ] **AC-2:** Given the population command in `colour-literal-token-audit.md` § *The population*, when it is run over `frontend/src` excluding `*.spec.ts`, then **zero** results carry a `/opacity` modifier. *Seam:* S2 — the source tree, swept by the ledger's own command · *Pinned by:* `shared/class-o-tint-tokens.contrast.spec.ts` › "no `/opacity` colour literal survives in frontend/src"
- [ ] **AC-3:** Given a set-editor tier button in its selected state, when it renders in a real browser, then its `background-color` computes to exactly the value `bg-[#2bb8d4]/20` produced before this slice. *Seam:* S3 — `toHaveCSS` on the rendered element · *Pinned by:* `e2e/class-o-tint-tokens.e2e.ts` › "the selected tier button's tint is byte-identical to its pre-token paint"
- [ ] **AC-4:** Given the operator console pins porcelain and every class-O site sits inside it or on a fixed-white host, when the document theme is forced to `dark`, then every migrated position's computed colour is **unchanged** from its porcelain value. *Seam:* S3 — forced `data-riv-theme="dark"` on the document, `toHaveCSS` on the same elements · *Pinned by:* `e2e/class-o-tint-tokens.e2e.ts` › "the class-O tints hold under a forced dark document theme"
- [ ] **AC-5:** Given `beach-cell.ts`'s `CELL_CLASS` and `shared/confirm-panel.ts`'s tone palette are per-state maps whose other branches carry literals outside class O, when the slice lands, then **no branch of either map mixes a named utility with a hex literal**. *Seam:* S2 — the rendered class list of each variant · *Pinned by:* `beach-cell.spec.ts` › "every cell state paints from tokens only"; `confirm-panel.spec.ts` › "the warning surface paints from tokens only"
- [ ] **AC-6:** Given the ledger's class-O section, when the slice merges, then its four family rows read `done` with this PR, the section states rule **B** with the measurement behind it, and the three previously-unlisted positions (`#061e28`, `#b47814`, `#e0a03a`) appear as rows. *Seam:* the committed `docs/design/colour-literal-token-audit.md` · *Pinned by:* review-gate read (no automated pin — a docs assertion; `check-plan-file-structure.mjs` pins that the file is in the diff)

## Non-goals

- **Normalising the alphas (option C).** `#0c2a33` alone carries ten distinct alphas across
  seventeen sites (`/4 /5 /7 /10 /12 /14 /15 /20 /45 /55`) and the amber family is four distinct
  base colours. That is real drift, and it is a **deliberate visual change** with its own budget —
  it becomes a follow-up issue in phase 4, argued against tokens instead of literals, which is the
  cheaper argument. Settled with the maintainer at plan time.
- **Fixing `--riv-ink`'s two-unit gap.** `--riv-ink` is `#0a2a33` while its own siblings
  `--riv-ink-soft`/`--riv-ink-faint` are `rgba(12, 42, 51, …)` = `#0c2a33`. The gap is inside that
  family, not introduced by these sites; touching it would restyle every muted ink in the app.
- **The 48-member inset-highlight shadow ramp** (class R, still `open`) — not in class O's
  population command, and it wants a ramp named by depth, which is a palette pass.
- **Retiring the class-S per-state palettes** (`status-chip`, `booking-view`). `confirm-panel` is
  taken here only because one of its three positions is class O and the #858 rule forbids leaving
  half a map migrated; the other class-S components have no class-O position and stay put.
- **Widening the project's browserslist.** See R-4 — the Chrome-109 floor is a pre-existing
  inconsistency with Tailwind v4's own documented Chrome-111 floor, and is not this slice's to fix.

## Behavior-parity ledger

> The slice replaces a styling mechanism on 44 live positions, so the "no visual change" claim is
> exactly the kind that is aspirational until verified. Every row is a behaviour of the **outgoing**
> literal form.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Paints `color-mix(in oklab, <hex> α%, transparent)` | **preserved** | `bg-riv-x/α` compiles to the identical expression with `var(--riv-x)` in the colour slot — verified against the installed compiler, not assumed |
| Composites to a given pixel over any host | **preserved** | Measured: 29 (colour × alpha) pairs × 5 host colours = **145/145 byte-identical** in Chromium |
| Computed-style **string** reads `oklab(…)` | **preserved** | Same expression in, same computed value out. (Option A would have flipped it to `rgba(…)` and broken every `toHaveCSS` on these sites — one of the two reasons B won) |
| Emits **no** declaration outside `@supports (color: color-mix(…))`, so a non-supporting engine paints nothing | **changed** | The token form emits `background-color: var(--riv-x)` — the **fully opaque** colour — as a fallback. Traced in `tailwindcss/dist/lib.js`: an unresolvable `var()` inside `color-mix()` collapses to the base colour. Accepted: it only paints below `color-mix()` support, which is below Tailwind v4's own documented Chrome-111 floor (R-4) |
| `console-negative-token.contrast.spec.ts` asserts `border-[#a3372a]/28` + `bg-[#a3372a]/12` **present**, as an anti-overreach guard for #864 | **changed** | Those two positions are this slice's, so the guard inverts: it now asserts the two **token** forms present. The guard's purpose (that #864 did not reach into #852's half) is preserved by pinning the new form |
| `solid-fill-tokens.contrast.spec.ts`'s `(?!\/)` lookaheads exclude `bg-[#a3160e]/10` as "#852's, tokenising would change the computed value" | **changed** | The lookaheads stay correct and stay, but the stated reason is now false. The comment is corrected in the same PR (phase 2) |
| `beach-cell.spec.ts`'s `PRE_MOVE_CELL_CLASS` restates the four `CELL_CLASS` strings verbatim | **changed** | Restated in token form. The spec's purpose — that the #672 slice-2 move did not restyle the cells — is preserved |
| `confirm-panel.spec.ts` pins `bg-[#fff4e0]` + `border-[#e0a03a]/60` so the extraction cannot silently restyle either caller | **changed** | Same pin, token form, and widened to the third position (`text-[#7a4a08]`) since AC-5 takes the map whole |
| The gap cell's `/55` (not `/35`) border, 3:1 over the canvas wash, per the comment at `beach-cell.ts:26` | **preserved** | The alpha stays at the call site under rule B — which is precisely the case rule B handles better than A, since the comment explaining *why* stays adjacent to the number it explains |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A token is registered in the `:root` block but its `@theme inline` row is forgotten — the class stays in the markup and the paint silently does not change; no unit spec can see it | med | high | AC-1 asserts the `@theme inline` row per token from the stylesheet source (S1), and AC-3/AC-4 prove the real paint in a browser (S3). This is the documented failure mode of every prior token slice (#848, #858, #864) | claude | open |
| R-2 | The sweep reaches a position of the **same value but a different role** — `#a3160e` is also `--riv-solid-fill-danger` and light-theme `--riv-error-ink`; `#0e8aa8` is `--riv-accent-strong`; `#a3372a` is `--riv-solid-btn-danger-ink` | high | high | Match **by form, not by value**: every sweep regex requires the `]/α` modifier, which is class O's discriminator. The sibling specs' `(?!\/)` lookaheads are the mirror image of the same discipline and stay in place as a cross-check | claude | open |
| R-3 | A token *themes* by accident (declared outside the base block, or a later slice adds a dark override), flipping a hairline on a fixed-white host to near-invisible | low | high | Every host here is fixed: the console pins porcelain (`host: { 'data-riv-theme': 'porcelain' }`), `payout-statement`'s panel is `bg-white`. AC-1 pins single-declaration-in-base-block from the stylesheet **source** (jsdom maths cannot see this); AC-4 proves it against a forced dark document | claude | open |
| R-4 | The opaque `@supports` fallback paints on a browser inside the project's declared support window | low | med | The project's effective browserslist (Angular default, unoverridden) has **chrome 109** as its floor; `color-mix()` needs 111, which is also Tailwind v4's own documented floor ("designed for … Chrome 111"). So the two versions in the gap are already outside the framework's support, and every other v4 utility is equally undefined there. Recorded in the ledger; widening the browserslist is a Non-goal | claude | open |
| R-5 | Taking the entangled skins whole (AC-5) drags in positions that are class **S** (`confirm-panel`'s tone palette) or outside the population entirely (`beach-cell`'s two gradients), quietly widening the diff past the ticket | high | low | Deliberate and maintainer-approved. Bounded to exactly three skins — `beach-cell.CELL_CLASS`, `confirm-panel`'s warning surface, and the two selected/unselected ternaries in `set-editor.html`/`layout-editor.html` — each named in *File structure*, each because it has **at least one class-O position** in the same expression. No fourth skin is taken | claude | open |
| R-6 | The ledger's class-O row count (41 enumerated) disagrees with its own headline (44), so a family is migrated and the ledger still reads `open` | med | low | Phase 4 rewrites the section against the population command's live output, not against the existing rows; AC-6 pins the outcome. The three orphans are already identified: `#061e28/45`, `#b47814/40`, `#e0a03a/60` | claude | open |
| R-7 | No Flyway migration, no backend, no API shape change — the usual collision risks do not apply | — | — | N/A — no `V<n>` claimed; no open PR overlap (this is the only open branch) | claude | closed at plan time |

## Open questions / Assumptions

- **Assumption:** `#2bb8d4`/`#0e8aa8` selection chrome gets its **own** tokens rather than reusing
  `--riv-accent-*`, whose values it coincides with (`--riv-accent-strong` *is* `#0e8aa8`). Ground:
  role before value — `--riv-accent-*` is the tourist-side accent tint family (info panel, selected
  chip, pay spinner track); these are operator-console selection chrome on a porcelain-pinned host.
  The same fork #848, #858 and #864 each resolved the same way. — *Owner:* claude · *Resolves by:*
  phase 1 (the token's declaration comment carries the argument, as those three do)
- **Assumption:** `#a3372a`'s two class-O positions **do** reuse `--riv-console-negative-ink`
  rather than getting a token of their own — same value, same host, same element, and genuinely the
  same role (the reason chip's border and fill under that ink). This is a reuse the role rule
  *permits*, not a coincidence it forbids, and it is the one place rule B expresses something rule A
  could not. — *Owner:* claude · *Resolves by:* phase 2

### Resolved

- **Open question (the ticket's own A/B/C):** settled as **B now, C as a follow-up**, with the
  maintainer at plan time. The ticket's premise — "replacing the literal with a pre-composed
  `rgba()` token … changes the computed value" — is **false**, and so is its framing of B ("the
  computed value moves … to a `color-mix()` result"): the literal form *already* compiles to
  `color-mix()`. Evidence, all primary:
  - The installed compiler (`tailwindcss@4.3.3`): `bg-[#2bb8d4]/20` →
    `color-mix(in oklab, #2bb8d4 20%, transparent)`; `bg-riv-x/20` →
    `color-mix(in oklab, var(--riv-x) 20%, transparent)`.
  - Chromium, all 29 (colour × alpha) pairs over 5 host colours: `color-mix` and the pre-composed
    `rgba()` composite **byte-identically**, 145/145. Neither A nor B moves a pixel; only C does.
  - `tailwindcss/dist/lib.js`: the token form's extra fallback declaration outside
    `@supports (color: color-mix(in lab, red, red))` is an unresolvable-`var()` collapse to the
    base colour — the one real asymmetry, bounded by R-4.
- **Open question (docs first — the maintainer's ask):** Tailwind's docs never state what the
  opacity modifier compiles to (*Colors § Adjusting opacity* says only that it "sets the alpha
  channel"), and document `@theme inline` + per-scope `:root` overrides — this repo's exact
  pattern — with no caveat about combining the two. *Compatibility* gives the Chrome 111 /
  Safari 16.4 / Firefox 128 floor used by R-4. Angular's docs return **zero results** on v22 for
  colour-token and contrast queries, the same silence `docs/design/non-text-contrast.md` already
  recorded. **The documentation does not settle A vs B**; the compiler does.
- **Open question (is `#0c2a33` drift against `--riv-ink`'s `#0a2a33`?):** **No.** The ink family's
  own rgba members `--riv-ink-soft`/`--riv-ink-faint` are already `rgba(12, 42, 51, …)`, and
  `testing/glass-tokens.ts` names `CARD_INK = #0c2a33` "base of the rgba(12, 42, 51, …) muted-ink
  family". The seventeen sites match the shipped family; the two-unit gap is inside `--riv-ink`
  and is a Non-goal.

## Availability & concurrency (invariant #2)

N/A — a frontend styling change. It touches no booking, availability or beach-**map data** path;
`beach-cell.ts` is the map grid cell's *appearance* directive only ("Geometry … stays with the
consumer"), and no write path, pool rule or cutoff is in scope.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in the diff.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `payout-statement.ts` and `payouts-tab.html` are in the diff, but as
**display** surfaces only: the statement "computes no money and moves none" (its own header), and
this slice changes only how its hairlines and tints are declared.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | token registry (`:root` base block + `@theme inline`) | — | — |
| FE-2 | `operator/payout-statement.ts` | existing | standalone component (inline template) | signals (`input()`/`output()`) | — |
| FE-3 | `operator/beach-cell.ts` | existing | variant **directive** (`CELL_CLASS` per-state map) | — | — |
| FE-4 | `operator/set-editor.html`, `layout-editor.html` | existing | templates | — | — |
| FE-5 | `operator/daily-view-tab.{ts,html}`, `requests-tab.html`, `payouts-tab.html` | existing | templates + inline template | — | — |
| FE-6 | `shared/confirm-panel.ts` | existing | standalone component (`role="alertdialog"`) | signals | — |
| FE-7 | `shared/class-o-tint-tokens.contrast.spec.ts` | **new** | unit spec (stylesheet-source guard + sweep) | — | — |
| FE-8 | `e2e/class-o-tint-tokens.e2e.ts` | **new** | mocked Playwright spec (`toHaveCSS`, forced dark) | — | — |

**Standards:** no component API changes — every edit is a class string. The token registry stays in
the two places `riviera-frontend` allows (`tailwind.css` + `core/theme.ts`; `core/theme.ts` needs no
edit here, since these are not switcher-visible palette entries). Old semantic classes and
`data-testid`s are retained as inert markers (`riviera-tailwind` rule 2).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phase 1 done, phase 2 next)`

**Next action:** phase 2 — the red families (`#a3160e`, `#a3372a`), inverting
`console-negative-token.contrast.spec.ts`'s `CHIP_TINTS` guard to the token form.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the rule + the console-tint family (18 positions) | ✅ | `f3ed82c` |
| 1 — selection chrome, `#2bb8d4` + `#0e8aa8` (8 + 2 whole-ternary) | ✅ | next commit |
| 2 — the red families, `#a3160e` (7) + `#a3372a` (2) | | |
| 3 — amber + green tints (9) and the two entangled skins | | |
| 4 — ledger, the option-C follow-up issue, docs freshness | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/class-o-opacity-modifier-tokens.md` — this plan.
- `docs/design/colour-literal-token-audit.md` — the class-O verdict (rule B + its evidence), the
  four family rows to `done`, and the three previously-unlisted positions as rows.
- `frontend/src/tailwind.css` — the eleven class-O tokens: `:root` base-block declarations with
  their rationale comments, plus one `@theme inline` row each.
- `frontend/src/app/operator/payout-statement.ts` — 11 positions (the scrim, four fills, six borders).
- `frontend/src/app/operator/beach-cell.ts` — `CELL_CLASS` taken whole (4 class-O borders + the two
  gradients in the same map).
- `frontend/src/app/operator/beach-cell.spec.ts` — `PRE_MOVE_CELL_CLASS` restated in token form.
- `frontend/src/app/operator/daily-view-tab.ts|.html` — 7 positions (5 in the template, 2 in the
  inline-template `.ts`).
- `frontend/src/app/operator/requests-tab.html` — 6 positions.
- `frontend/src/app/operator/payouts-tab.html` — 5 positions.
- `frontend/src/app/operator/set-editor.html` — 8 positions (incl. the selected-tier ternary taken whole).
- `frontend/src/app/operator/layout-editor.html` — 3 positions (incl. the active-tool ternary taken whole).
- `frontend/src/app/operator/layout-editor.ts` — `SWATCH_CLASS.walkin`'s gradient stops, which the
  code calls a mirror of `beach-cell`'s cell variants (phase 1's generalization finding).
- `frontend/src/app/shared/confirm-panel.ts` — the warning surface taken whole (border + fill + ink).
- `frontend/src/app/shared/confirm-panel.spec.ts` — the pin restated in token form and widened to the ink.
- `frontend/src/app/operator/console-negative-token.contrast.spec.ts` — `CHIP_TINTS` inverted to the
  token form (behaviour-parity row 6).
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — the `(?!\/)` lookahead comment
  corrected: the reason it gave for excluding `bg-[#a3160e]/10` is the premise this slice disproved.
- `frontend/src/app/shared/class-o-tint-tokens.contrast.spec.ts` — **new.** The AC-1/AC-2 guard.
  In `shared/`, not `operator/`: the sweep is tree-wide and `shared/confirm-panel.ts` carries one of
  the 44 — same home, same reason, as `solid-fill-tokens.contrast.spec.ts` (`riviera-frontend`).
- `frontend/e2e/class-o-tint-tokens.e2e.ts` — **new.** The AC-3/AC-4 proof.
- `frontend/src/testing/glass-tokens.ts` — the new tint bases added to the one test-side mirror.

---

## Phase 0 — The rule, and the console-tint family (18 positions)

**Files:** Create `frontend/src/app/shared/class-o-tint-tokens.contrast.spec.ts` ·
Modify `frontend/src/tailwind.css`, `operator/payout-statement.ts`, `operator/beach-cell.ts`,
`operator/beach-cell.spec.ts`, `operator/daily-view-tab.ts|.html`, `operator/set-editor.html`,
`operator/layout-editor.html`, `src/testing/glass-tokens.ts`

Tokens registered this phase — both theme-invariant, both in the base block, each with the
rationale at the declaration (`riviera-tailwind`: a theme-invariant token is a decision, never an
omission):

| Token | Value | Role | Sites |
|---|---|---|---|
| `--riv-console-tint` | `#0c2a33` | the console's neutral tint base — hairlines, inset fills and one sheet backdrop, all on porcelain-pinned or fixed-white hosts. The rgba base of `--riv-ink-soft`/`-faint`, and deliberately **not** `--riv-ink` (`#0a2a33`, and it themes to white) | 17 |
| `--riv-console-scrim` | `#061e28` | the payout-statement modal backdrop | 1 |

- [ ] **Step 1: Write the failing test** — `class-o-tint-tokens.contrast.spec.ts`, at seam S1 +
      S2: both tokens declared exactly once, inside `baseBlock()`, each with its
      `--color-riv-*` `@theme inline` row; and the ledger's population command, run over
      `frontend/src` excluding `*.spec.ts`, returns **zero** `]/α` results for `#0c2a33`/`#061e28`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens` → FAIL
      (`--riv-console-tint` has 0 declarations; the sweep finds 18 surviving literals).
- [ ] **Step 3: Minimal implementation** — declare both tokens + their `@theme inline` rows;
      rewrite the 18 positions to `border-riv-console-tint/15` &c., alpha unchanged at every site.
      `beach-cell.ts`'s `CELL_CLASS` is taken **whole** per AC-5 (its two gradients too), and
      `beach-cell.spec.ts`'s `PRE_MOVE_CELL_CLASS` restated to match.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- class-o-tint-tokens beach-cell
      payout-statement daily-view-tab layout-editor set-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every colour position carrying
      Tailwind's `/opacity` modifier*, enumerated by the ledger's own command with the `]/[0-9.]+`
      suffix appended (**not** by listing the files this phase touched — that is the resemblance
      trap). Append the row and the command to the log.
- [ ] **Step 6: Commit** — `git commit -m "Settle class O on rule B and tokenise the console tint family (#852)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

> Scope: `npm test -- <names>` only. Never the bare suite (`riviera-local-debug`).

---

## Phase 1 — Selection chrome: `#2bb8d4` + `#0e8aa8` (8 class-O + 2 whole-ternary)

**Files:** Modify `frontend/src/tailwind.css`, `operator/set-editor.html`,
`operator/layout-editor.html`, `operator/payout-statement.ts`,
`shared/class-o-tint-tokens.contrast.spec.ts`

| Token | Value | Role |
|---|---|---|
| `--riv-select-tint` | `#2bb8d4` | the map/set-editor selection fill |
| `--riv-select-edge` | `#0e8aa8` | its boundary — **own token, not `--riv-accent-strong`**, whose value it shares; role before value, per #848/#858/#864 |

The two selected/unselected ternaries (`set-editor.html:182`, `layout-editor.html:38`) carry a
**plain** `border-[#0e8aa8]` beside the class-O fill in the same expression — class T by form, but
#858's take-the-ternary-whole rule makes it this phase's, since leaving it would put a named utility
beside a hex literal in one string.

- [ ] **Step 1: Write the failing test** — extend the guard: both tokens single + in the base block
      + `@theme inline`; the sweep returns zero for both values in **either** form (with or without
      the modifier), which is what proves the ternaries were taken whole.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens` → FAIL.
- [ ] **Step 3: Minimal implementation** — declare both, with the role-before-value argument at
      `--riv-select-edge`'s declaration; rewrite all 10 positions.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- class-o-tint-tokens set-editor layout-editor payout-statement` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every per-state class ternary or map that
      mixes a class-O position with a non-class-O sibling in one expression* (the mechanism AC-5
      exists for). Enumerate; judge each.
- [ ] **Step 6: Commit** — `git commit -m "Tokenise the console's selection chrome (#852)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The red families: `#a3160e` (7) + `#a3372a` (2)

**Files:** Modify `frontend/src/tailwind.css`, `operator/requests-tab.html`,
`operator/daily-view-tab.html`, `operator/payouts-tab.html`, `operator/set-editor.html`,
`operator/console-negative-token.contrast.spec.ts`,
`shared/solid-fill-tokens.contrast.spec.ts`, `shared/class-o-tint-tokens.contrast.spec.ts`

| Token | Value | Role |
|---|---|---|
| `--riv-alert-tint` | `#a3160e` | the request/urgency chrome's tint base — **own token**, not `--riv-solid-fill-danger` (a solid fill under fixed white ink) nor `--riv-error-ink` (an ink, and it themes) |
| *(reuse)* `--riv-console-negative-ink` | `#a3372a` | the reason chip's border and fill, under the ink that token already paints on the same element — a reuse the role rule permits |

The reuse inverts `console-negative-token.contrast.spec.ts`'s `CHIP_TINTS` guard, which today
asserts the two literals **present** to prove #864 did not overreach into #852's half. It now
asserts the token forms present — same guard, updated frontier (behaviour-parity row 6).
`solid-fill-tokens.contrast.spec.ts`'s lookahead comment is corrected in the same commit: its
`(?!\/)` discriminators stay (R-2 depends on them), but the reason it gives for them is this
slice's disproved premise.

- [ ] **Step 1: Write the failing test** — guard extended for `--riv-alert-tint`; `CHIP_TINTS`
      inverted to the token form.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens console-negative-token` → FAIL.
- [ ] **Step 3: Minimal implementation** — declare `--riv-alert-tint`; rewrite the 7 `#a3160e`
      positions and the 2 `#a3372a` positions; correct the two spec comments.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- class-o-tint-tokens console-negative-token solid-fill-tokens requests-tab payouts-tab daily-view-tab set-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every spec that pins a class-O literal
      as a present-tense guard*, enumerated by grepping the spec tree for the `]/α` form (this is
      how row 6 of the parity ledger was found, and it may have siblings).
- [ ] **Step 6: Commit** — `git commit -m "Tokenise the alert-red and console-negative tints (#852)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Amber + green tints (9), and the last entangled skin

**Files:** Modify `frontend/src/tailwind.css`, `operator/daily-view-tab.html`,
`operator/payouts-tab.html`, `operator/requests-tab.html`, `operator/beach-cell.ts`,
`shared/confirm-panel.ts`, `shared/confirm-panel.spec.ts`,
`shared/class-o-tint-tokens.contrast.spec.ts`

| Token | Value | Sites |
|---|---|---|
| `--riv-warn-tint` | `#d9861a` | 3 |
| `--riv-warn-fill-tint` | `#f0aa2e` | 2 |
| `--riv-premium-edge` | `#b47814` | 1 (beach-cell's premium border) |
| `--riv-notice-edge` | `#e0a03a` | 1 (confirm-panel) |
| `--riv-positive-tint` | `#0e6e46` | 2 |

**Four distinct ambers across seven sites is itself drift** — recorded here as the sharpest input to
the option-C follow-up (phase 4), not resolved here.

`shared/confirm-panel.ts`'s warning surface is taken **whole** per AC-5: its class-O border
(`#e0a03a/60`) sits in one host string with a class-S fill (`#fff4e0`) and ink (`#7a4a08`), so all
three become tokens (`--riv-notice-edge`, `--riv-notice-fill`, `--riv-notice-ink`) and
`confirm-panel.spec.ts`'s pin widens to the ink.

- [ ] **Step 1: Write the failing test** — guard extended for all five (plus the two whole-skin
      companions); the ledger's population command over `frontend/src` now returns **zero**
      `/opacity` results tree-wide (AC-2's final form).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens confirm-panel` → FAIL.
- [ ] **Step 3: Minimal implementation** — declare the tokens; rewrite the 9 positions and take the
      confirm-panel surface whole.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- class-o-tint-tokens confirm-panel beach-cell daily-view-tab payouts-tab requests-tab` → PASS, then the e2e:
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- class-o-tint-tokens`
      → AC-3 + AC-4 green (the only proof that catches a missing `@theme inline` row).
- [ ] **Step 5: Generalization-audit pass** — population: *every registered `--riv-*` token whose
      family has more than one base colour for one treatment* (the mechanism behind the four
      ambers), enumerated from `tailwind.css` rather than from memory. Feeds phase 4's issue.
- [ ] **Step 6: Commit** — `git commit -m "Tokenise the amber and green status tints (#852)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — Ledger, the option-C follow-up, docs freshness

**Files:** Modify `docs/design/colour-literal-token-audit.md`,
`docs/plans/class-o-opacity-modifier-tokens.md`

- [ ] **Step 1:** Rewrite the ledger's **class-O** section: state rule **B** and the three pieces of
      evidence behind it (compiler output, the 145/145 composite measurement, the `@supports`
      fallback and its Chrome-111 bound), all four family rows → `done` with this PR, and add rows
      for `#061e28`, `#b47814`, `#e0a03a` — the three positions the section's own table never listed
      (R-6). Update the head-of-file "prior slices" paragraph.
- [ ] **Step 2:** Open the **option-C** follow-up issue: normalise the alphas per treatment, now
      argued against tokens instead of literals. It cites this ledger section as the settled rule
      and carries the two sharpest inputs — `#0c2a33`'s ten alphas across seventeen sites, and the
      four amber base colours across seven.
- [ ] **Step 3:** Run **`riviera-docs-freshness`** over this slice's range. The counting sweep is
      the point: several sibling specs and the ledger describe class O as *pending* work
      ("#852's", "must survive this sweep untouched"), and `solid-fill-tokens.contrast.spec.ts`
      states the disproved premise as fact.
- [ ] **Step 4:** Finalize the Execution status **in this PR's last commit** — stage pointer DONE,
      phase rows ✅, Open Questions empty, risk rows closed, `merged via PR #NN` (never a merge SHA).

---

## Generalization-audit log

> Append-only. One row per phase. **Population** names the mechanism swept and how it was
> enumerated (mechanism-not-resemblance).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-01 | phase 1 | A `repeating-linear-gradient` painting a class-O base colour as RAW `rgba()` stops — enumerated as *class expressions naming a class-O token AND a raw literal of its own value*, not as "maps that look like `beach-cell`'s" | `grep -rnoE "'[^']*riv-console-tint[^']*'\|\"[^\"]*riv-console-tint[^\"]*\"" src/app --include=*.ts --include=*.html \| grep -v spec.ts \| grep -iE '#[0-9a-f]{3,8}\|rgba?\('` | 1 mixing (`daily-view-tab.ts:611`), + 3 siblings by construction (`daily-view-tab.html:287`, the legend swatch it mirrors; `layout-editor.ts:85`, `SWATCH_CLASS.walkin`, which the code calls a mirror of `beach-cell`'s cell variants) | All 4 tokenised. Leaving `layout-editor`'s declared mirror literal while `beach-cell`'s was tokenised would have introduced NEW drift, which is the trap this sweep exists to avoid. Measured first: 20 comparisons over 5 hosts, 0 pixel differences. Generalized into a standing test — *never named in the same class expression as a raw literal of its own value* — and that test was proven able to fail before being trusted. Recorded for option C: the two `walkin` gradients already disagree (`beach-cell` 30%/12% vs `layout-editor` 35%/12%) despite the mirror claim |
| 2026-09-01 | plan (issue-intake grill) | Every colour position carrying Tailwind's `/opacity` modifier — the mechanism, not the four families the ticket named | `grep -rnoE '(text\|bg\|border\|fill\|stroke\|shadow\|from\|to\|via)-\[(#[0-9a-fA-F]{3,8}\|rgba?\([^]]*\))\]/[0-9.]+' src --include=*.ts --include=*.html \| grep -v '\.spec\.ts'` | 44 (29 distinct colour × alpha pairs, 11 base colours) | Found the **three the ledger's own class-O table never listed** — `#061e28/45`, `#b47814/40`, `#e0a03a/60` (41 enumerated vs a 44 headline). Widened the population command past the ledger's own by adding the gradient-stop utilities (`from`/`to`/`via`) — it returned no extra members, so the ledger's narrower command was not under-counting for that reason |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npm test -- class-o-tint-tokens` → the declaration/`@theme inline` assertions pass. Verified at commit `<sha>`.
- [ ] **AC-2:** Run the ledger's population command with the `]/[0-9.]+` suffix over `frontend/src` → **0** results outside `*.spec.ts`. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- class-o-tint-tokens` → the `toHaveCSS` pre/post paint assertions pass. Verified at commit `<sha>`.
- [ ] **AC-4:** Same run → the forced-dark assertions pass. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `npm test -- beach-cell confirm-panel` → no branch mixes a named utility with a literal. Verified at commit `<sha>`.
- [ ] **AC-6:** Read `docs/design/colour-literal-token-audit.md` § *Class O* at HEAD. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2) — no write path in scope.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11) — no backend file in the diff.
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9) — display surfaces only.
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met: tokens registered in `tailwind.css` only, theme-invariance
      declared as a decision with its reason, inert marker classes and `data-testid`s retained,
      no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus*
      `riviera-review-overlay`, not the overlay alone.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` passes with the plan doc **staged**.
