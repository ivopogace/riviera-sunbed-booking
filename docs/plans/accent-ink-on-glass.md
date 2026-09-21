# Accent ink on glass panels Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Give the accent ink — and the row hover it sits in — a value that survives the
riviera theme's dark panel glass, so the Discover sheet's and desktop panel's group-head
distances and the panel row's price can wear the accent again at AA in all three themes.

**Architecture:** Two new tokens rather than a riviera value on the existing ones. Both
`--riv-accent-ink` and `--riv-wash-hover` are *card*-surface tokens that riviera deliberately
leaves at their light-theme values, because riviera's card glass is white at 0.78 — the same
token is correct as dark teal on riviera's light card and must be light on its dark panel. A
riviera redeclaration would repaint every card consumer (and, for the wash, the two
light-surface buttons that pair it with dark inks). So the panel surface gets its own pair,
declared per theme and mapped in `@theme inline`.

**Persistence:** N/A — frontend-only; no table, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue [#1165](https://github.com/ivopogace/riviera-sunbed-booking/issues/1165)

**Skills consulted:** `riviera-sdlc` (intake gate caught that the issue's proposed riviera
value `#7cd7e8` reads 4.07:1 on its own target surface, failing its own AC, and that a second
token — `--riv-wash-hover` — has the identical defect one line away in the same file) ·
`riviera-plan-doc` (forced the generalization-audit population below: *every* ink on an
`appPanelGlass` subtree, not just the three sites the issue names) · `tdd` (contrast spec red
first against the unchanged `tailwind.css`, then the declarations) · `riviera-review-overlay`
(at the review gate) · `riviera-docs-freshness` (**ran** over `66c2954..HEAD`, 1 finding + 1
plan retirement, both fixed here) · `riviera-tailwind` (token per theme + `@theme inline` row +
the reason at the base declaration; the no-drift rule → the computed-style e2e) ·
`riviera-frontend` (the e2e belongs in the CI-safe mocked suite `frontend/e2e/`)

**Branch:** `claude/sdlc-1165-n73o33` (cloud session; stands in for `bugfix/accent-ink-on-glass`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the three theme blocks in `tailwind.css`, when `--riv-panel-accent-ink`
  is resolved, then it is declared exactly once per theme (`#085a6e` base, `#a8e8f2` riviera,
  `#7cd7e8` dark) and carries an `@theme inline` row.
  *Seam:* the `tailwind.css` source text, read the way the sibling token specs read it ·
  *Pinned by:* `home.contrast.spec.ts` › `declares --riv-panel-accent-ink once per theme block`

- [ ] **AC-2:** Given each theme's page-gradient stops, when `--riv-panel-accent-ink` is
  composited over the header glass, then it meets AA (≥ 4.5:1) over every stop, in all three
  themes — and the negative case "the accent ink would not clear AA on the header glass" is
  gone, replaced by this positive one.
  *Seam:* `expectAaOverStops(panelAccent, 1, headerGlass, stops)` ·
  *Pinned by:* `home.contrast.spec.ts` › `panel accent ink (group-head distance, row price) meets AA on the header glass`

- [ ] **AC-3:** Given a hovered desktop panel row, when `--riv-panel-wash-hover` coats the
  panel glass, then both the page ink and `--riv-panel-accent-ink` still meet AA over every
  stop, in all three themes.
  *Seam:* the same `expectAaOverStops` loop, over the hover surface ·
  *Pinned by:* `home.contrast.spec.ts` › `the row hover wash keeps both inks at AA on the panel glass`

- [ ] **AC-4:** Given the riviera theme in a real Chromium, when the Discover sheet's
  beach-group head, the desktop panel's group head and the panel row's price are rendered,
  then each computes to `rgb(168, 232, 242)` and the hovered row computes to the riviera wash
  — not the class list, the resolved value.
  *Seam:* the rendered page via `toHaveCSS` (`test:e2e:a11y`) ·
  *Pinned by:* `frontend/e2e/panel-glass-inks.e2e.ts`

- [ ] **AC-5:** Given the whole tree, when every element inside an `appPanelGlass` subtree is
  enumerated, then none paints `--riv-accent-ink` as an ink or a ring.
  *Seam:* the generalization-audit command below, recorded in the audit log ·
  *Pinned by:* the audit log row + `home.contrast.spec.ts`'s surviving card-glass cases

## Non-goals

- Retuning `--riv-accent-ink` or `--riv-wash-hover` themselves: every card-glass consumer of
  both is correct today and must render byte-identically after this slice.
- Porcelain and dark visual change of any kind. `--riv-panel-wash-hover` deliberately repeats
  those two themes' existing `--riv-wash-hover` values so only riviera moves.
- A CI guard script for AC-5. The population is small and closed; a `scripts/check-*.mjs`
  would be a new gate this issue did not ask for.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Sheet group-head distance in `--riv-ink` (#1159's workaround) | changed | Wears `--riv-panel-accent-ink`; the accent returns in all three themes, which is what the workaround cost. |
| Desk group-head distance in `--riv-ink` | changed | Same token, same reason. |
| Desk row price in `--riv-ink` | changed | Same token. The card price (`home.html:112`) stays on `--riv-accent-ink` — it is on card glass, a different surface. |
| Desk row hover = `--riv-wash-hover` | changed | `--riv-panel-wash-hover`. Porcelain and dark keep their exact values; riviera moves from a white 0.75 coat (which washed the dark panel to near-white under white ink, ~1.45:1) to a 0.45 second coat of its own header tint. |
| `home.contrast.spec.ts` › "the accent ink would not clear AA on the header glass" | dropped | It recorded the constraint this slice removes. Replaced by AC-2's positive case, which is strictly stronger. |
| Every `--riv-accent-ink` / `--riv-wash-hover` card-glass consumer | preserved | Untouched declarations; the e2e pins two of them unchanged. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A token declared without its `@theme inline` row generates no utility: the class stays in the markup and the paint silently does not change | Medium | High — a green unit suite over a surface that never repainted | The e2e asserts Tailwind *generated* the utility, the way `accent-token-inks.e2e.ts` does, not just that the property resolves | this slice | **closed** — negative control run: with both `@theme inline` rows deleted, 5 of the 6 e2e cases go red while the whole unit suite stays green, which is the trap exactly |
| R-2 | Lightening the riviera panel on hover looks like the obvious wash and fails: at *every* usable alpha the light-cyan accent drops under AA (white 0.06 → 4.23:1) | High | High — would ship the same class of bug the slice is fixing | The wash darkens in riviera (a second coat of its own header tint); AC-3 pins both inks over the hover surface in all three themes | this slice | **closed** — measured before choosing: white 0.06/0.08/0.10/0.12/0.16 give the accent 4.23/4.05/3.86/3.70/3.34:1, all under AA |
| R-3 | Riviera's margin is the thinnest in the slice (4.94:1 at the `#ffe2b0` stop, 0.44 over AA), so any later retune of a riviera gradient stop or of the header glass alpha can push it under | Medium | Medium | AC-2 loops every stop rather than a worst-case constant, so a stop retune fails the spec rather than shipping | this slice | **accepted** — 4.94:1 is the chosen margin (over `#a3e3f0`'s 4.72 and `#93e6f2`'s 4.73); the looping guard is the mitigation |
| R-4 | Repainting the group heads could drift the *rest* of the panel (position, weight) rather than only colour | Low | Medium | Only the colour utility on the distance `<span>` changes; the no-drift rule is discharged by the computed-style e2e | this slice | **closed** — the e2e's last case pins the card accent unmoved in the same theme |

## Open questions / Assumptions

_None open._

### Resolved

- **Assumption:** No ledger row is owed in `docs/design/colour-literal-token-audit.md`. —
  *Confirmed by the sweep:* that file tracks hex *literals in `frontend/src` wanting tokens*,
  row by row; this slice migrates no literal, it adds two declarations in the registry itself.
  Every `--riv-accent-ink` / `--riv-wash-hover` mention there is historical narrative about a
  past migration, and none states a present-tense fact this slice falsifies.

- **Open question:** The issue proposes riviera `#7cd7e8`, which measures 4.07:1 on the
  riviera header glass at the `#ffe2b0` stop — under AA, so the issue's own AC-2 cannot pass
  with it. Which value? — *Resolved:* `#a8e8f2` (4.94:1), chosen by `AskUserQuestion` over the
  two palette-native candidates `#a3e3f0` (4.72:1) and `#93e6f2` (4.73:1) on margin: these are
  composited values and 0.22 over AA leaves none.
- **Open question:** The desktop row's `hover:bg-riv-wash-hover` has the identical defect
  (a light-card token on the dark panel glass, ~1.45:1 for every row fact in riviera), unreported
  and shipped by #1159. In scope? — *Resolved:* yes, by `AskUserQuestion` — same defect class,
  same file, same spec, and it sits directly under the row price AC-4 repaints; proving the
  price at AA while its hover surface reads 1.45:1 would be hollow.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `(set, date)` row, booking, pool or cutoff is read or
written; the slice changes two CSS custom properties and four class attributes.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` is touched.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` The repainted price is a already-formatted display string
(`card().priceLabel`); no money value, currency or rounding is computed here.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` token registry | existing | stylesheet | none | none |
| FE-2 | `pages/home/home.html` — sheet + desk group-head distance | existing | template | `group.km` signal-derived | none |
| FE-3 | `pages/home/venue-row.html` — row price + row hover | existing | template | `card()` input signal | none |
| FE-4 | `testing/glass-tokens.ts` — the one test-side token mirror | existing | test helper | none | none |
| FE-5 | `e2e/panel-glass-inks.e2e.ts` | **new** | mocked Playwright spec | none | none |

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape moves.

## Execution status

**Stage pointer:** `review gate — findings fixed, re-verifying`

**Next action:** Push the finding fixes, then the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Tokens + contrast proof | ✅ | |
| 1 — Repaint the three sites + the row hover | ✅ | |
| 2 — Computed-style e2e | ✅ | |
| 3 — Generalization audit + close-out | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | Review gate (prior-PR agent) | The token's derivation was written out in full in four files (`tailwind.css`, `glass-tokens.ts`, `home.contrast.spec.ts`, the e2e). Reviewers trimmed this same class on #862, #871, #875, #878, #883, #885 and #886: full derivation in ONE place, a pointer elsewhere. Canonical home per `docs/design/README.md` is the token's comment in `tailwind.css`. | fixed — trimmed the other three to contract + `Rationale:` pointer |
| F-2 | Review gate (prior-PR agent) | Two ADDED lines carried provenance `#1165` (a `glass-tokens.ts` TSDoc, and the guard's `describe` title). RV-STYLE-1 gates added lines; `check-inline-comments.mjs` misses both by construction — a bare `#NNN` outside a citing position, and a `describe()` string is not a parsed comment. | fixed — both removed |
| F-3 | Review gate (bug-scan agent) | The new AC-2 test also re-asserted `heroInk` over the header glass, which its name does not mention and the pre-existing state-panel test already covers — inherited from the deleted test it replaces. | fixed — assertion dropped; coverage unchanged |
| F-4 | Review gate (history agent) | `--riv-header-glass` and the riviera stops were tuned once, for **white ink** only. A future retune for a white-ink reason could silently drop the panel accent (4.94:1, the set's thinnest margin) under AA. | accepted, guarded — this is R-3; AC-2 loops every stop, so such a retune fails the spec rather than shipping |
| F-5 | Review gate (own full-suite run) | `discover-sheet.a11y.spec.ts` › *has no serious violations at full, with the Map pill* fails intermittently (~1 run in 3, `expected null not to be null`). **Not this slice's:** reproduced on base `66c2954` with this branch's changes stashed out, and the diff touches neither that spec nor its subject. | out of scope → follow-up issue |

---

## File structure

- `docs/plans/accent-ink-on-glass.md` — this plan
- `frontend/src/tailwind.css` — the two token declarations per theme + their `@theme inline` rows
- `frontend/src/testing/glass-tokens.ts` — test-side mirrors of both tokens
- `frontend/src/app/pages/home/home.contrast.spec.ts` — AC-1/2/3; the negative case retired
- `frontend/src/app/pages/home/home.html` — sheet and desk group-head distance
- `frontend/src/app/pages/home/discover-head.ts` — the ◎ located glyph, found by the audit
- `frontend/src/app/pages/home/venue-row.html` — row price ink + row hover wash
- `frontend/e2e/panel-glass-inks.e2e.ts` — AC-4, the computed-style proof
- `.claude/skills/riviera-frontend/SKILL.md` — docs-freshness finding D-1
- `docs/plans/pin-layer-placement.md` — retired; its PR #1164 is merged

---

## Phase 0 — Tokens + contrast proof

**Files:** Modify `frontend/src/tailwind.css` · `frontend/src/testing/glass-tokens.ts` · Test `frontend/src/app/pages/home/home.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-1/2/3 cases in `home.contrast.spec.ts`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- home.contrast` → FAIL (token undeclared).
- [ ] **Step 3: Minimal implementation** — declare both tokens in the base, `riviera` and `dark` blocks with the reason at the base declaration; add both `@theme inline` rows; mirror in `glass-tokens.ts`.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- home.contrast` → PASS.
- [ ] **Step 5: Generalization-audit pass** — see the log; population = inks on an `appPanelGlass` subtree.
- [ ] **Step 6: Commit** — `git commit -m "Give the accent ink and row hover a panel-glass value (#1165)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 1 — Repaint the three sites + the row hover

**Files:** Modify `frontend/src/app/pages/home/home.html` · `frontend/src/app/pages/home/venue-row.html`

- [ ] **Step 1–4:** The existing `home.spec.ts` / `venue-row.spec.ts` stay green; the repaint's proof is Phase 2's computed-style e2e (contrast specs are pure maths and cannot see a template).
- [ ] **Step 5–7:** Audit, commit, status.

---

## Phase 2 — Computed-style e2e

**Files:** Create `frontend/e2e/panel-glass-inks.e2e.ts`

- [ ] **Step 1:** Assert Tailwind generated `text-riv-panel-accent-ink` and `bg-riv-panel-wash-hover` (R-1), then `toHaveCSS` on the sheet head, desk head, desk row price and hovered row under `riviera`.
- [ ] **Step 2–4:** `npm run test:e2e:a11y -- panel-glass-inks` red → green.
- [ ] **Step 5–7:** Audit, commit, status.

---

## Phase 3 — Generalization audit + close-out

- [ ] Run the audit command, record the population and every verdict.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] `riviera-docs-freshness` over the branch range; act on the two candidate findings.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-21 | AC-5, and the issue naming three sites by memory rather than by mechanism | **An ink or focus ring resolving `--riv-accent-ink` on an `appPanelGlass` subtree.** Enumerated in two passes: every ink/ring use of the token tree-wide, then every `appPanelGlass` host, then each host's subtree read for which of the first list it contains. Accent *fills* (`bg-riv-accent-ink` + `text-riv-on-accent-ink`) are a different mechanism — opaque, so the glass below never reaches the ink — and are excluded by construction. Console routes (`admin/`, `operator/`, the console `auth/` pages) are excluded too: they pin porcelain-or-dark and riviera is unreachable there. | `grep -rn "text-riv-accent-ink\|outline-riv-accent-ink\|riv-accent-ink)" src/app --include=*.html --include=*.ts \| grep -v "\.spec\.ts"` then `grep -rn "appPanelGlass" src/app` | 10 panel hosts, 4 carrying an accent ink | **Repainted (4):** `home.html` sheet group-head distance, `home.html` desk group-head distance, `venue-row.html` price, `discover-head.ts` ◎ located glyph. **Exempt, surface is card glass (7):** `home.html` card price + card-km + the three filter-select rings + the result count, `venue-preview-card.html` price, `venue-map.html` free count, `booking-pay.ts` ×4, `beach-map-canvas.html`, `photo-step-button.ts`, `segmented-control.ts`, `star-rating.ts`, `tab-rail.ts`, `popover-skin.ts`, `console-palette.ts`. **Exempt, ink on an opaque accent fill (4):** `discover-head.ts` chip + count disc, `coast-picker.ts` Near-me, `discover-sheet.ts` pill. **Exempt, console-pinned (14):** `admin/` ×7, `operator/` ×3, `auth/` ×4. |
| 2026-09-21 | The `◎` glyph is `aria-hidden`, which `home.contrast.spec.ts` excludes from AA as decoration | Whether the audit's fourth site is genuinely in the population | read of the spec's stated exclusion policy | 1 | **Repainted anyway.** The exclusion decides what owes a *ratio*, not what may wear a card token on a panel — AC-5 is about the token, and at 1.09:1 the glyph is invisible rather than decorative, which is a defect in a "you are located" affordance even where WCAG asks nothing. |

---

## Docs-freshness sweep

Range `66c2954..HEAD` (the slice's own diff, merge base fetched). One finding, one retirement.

- **D-1** `.claude/skills/riviera-frontend/SKILL.md:90` — states *"the token registry is two
  places only: a CSS block in `tailwind.css` + a row in `core/theme.ts`"*. Contradicted by this
  slice: two tokens were added and `core/theme.ts` needed no change, because it carries
  `THEME_OPTIONS` (id, name, swatch, light) — the **theme** switcher's rows, not token rows.
  The sentence is true of a theme and false of a token, and it misled #1165, which repeats
  "a row in `core/theme.ts`" in its own fix sketch. **Action:** split the two registries in
  place. Not a decision change, so patched rather than flagged.
- **Plan retirement** — `docs/plans/pin-layer-placement.md` (#1159, PR #1164) merged and was
  never deleted; a merged plan cannot be removed in its own PR, so this close-out does it.
  No citation of the path or the bare slug exists outside `docs/plans/`, so nothing to repoint,
  and nothing in it is rationale a later slice needs that is not already in the shipped code.
- **Counting sweep (2b):** triggered — the slice makes a second member of two token families.
  Every `\b(the|both|only) (two|three)\b` hit across the substrate docs, `docs/design/` and
  the skills is historical narrative about a past migration; none counts accent or wash tokens.
  Zero findings.

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/3:** `npm test -- home.contrast` → PASS.
- [ ] **AC-4:** `npm run test:e2e:a11y -- panel-glass-inks` → PASS.
- [ ] **AC-5:** audit log row, every candidate judged.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability N/A justified.
- [ ] Money untouched (#5); no cutoff, zone or code logic in scope (#4, #6, #7).
- [ ] Modulith N/A — frontend-only (#11).
- [ ] Payment N/A (#8, #9, #10).
- [ ] No Flyway migration owed (#12).
- [ ] Frontend standards met: token per theme + `@theme inline` row, reason at the base declaration, no `@apply`, no `dark:` variant, no theme named in a component.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full.
