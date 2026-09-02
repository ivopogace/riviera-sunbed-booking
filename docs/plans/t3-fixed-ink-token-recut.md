# T-3 re-cut: the same-valued ink sites are fixed-fill and role-mismatch, not class T

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Retire every `#0a2a33` / `rgba(12,42,51,·)` ink and border literal that #849
enumerated onto a token chosen by the surface it is painted on — which, measured, is never one
of the three candidates the ticket proposed — and rewrite the ledger's T-3 row to record why
the class-T family is empty.

**Architecture:** The single most significant decision is a refusal: none of the surviving
sites may take `--riv-ink`, `--riv-card-ink` or `--riv-pop-ink`. Every one either sits on a
**fixed** fill (so a themed ink over it drifts light-on-light — class F's failure mode, the
`--riv-solid-btn-ink` precedent) or matches a token whose **role** is different (a popover
divider, a tourist shell chip — the fork #848, #858, #864 and #879 each resolved the same
way). So the slice registers four new theme-invariant families, each declared once in the base
block with its reason at the declaration, rather than assigning sites to existing tokens.

**Persistence:** N/A — frontend-only, no backend code and no schema change (invariants #1, #12
untouched).

**Source of intent:** [#849](https://github.com/ivopogace/riviera-sunbed-booking/issues/849)
(class **T** in `docs/design/colour-literal-token-audit.md`), parent
[#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
population is 8 and not 14, that #870/PR #873 consumed the entire `rgba(12,42,51,0.66)` family,
and that no surviving site is class T) · `riviera-plan-doc` (this template — forced the
surface-by-surface AC table and the Non-goals fence around #853's white ramps) · `tdd` (each
family's guard spec is written red against the un-migrated markup before the token exists) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(ran over `15c82d0..HEAD` at close-out — findings recorded in the Execution status) ·
`riviera-tailwind` ("a fixed fill pins every ink and border on it"; group by form, reject a
coincidental token on its role before its value; theme-invariant tokens declared once in the
base block with the reason at the declaration) · `riviera-frontend` (the family guard belongs
in `shared/`, the mirror in `testing/glass-tokens.ts`, the cross-theme render proof in the
CI-safe mocked suite) · `playwright-cli` (the mocked e2e forcing a `dark` document theme) ·
`riviera-local-debug` (scoped Vitest/Playwright invocations in this cloud session)

**Branch:** `claude/sdlc-849-njceh0` — the cloud session's designated remote branch stands in
for `feature/<slug>` per `riviera-sdlc`'s remote addendum.

---

## Acceptance criteria (testable)

Every AC below observes through one of three seams, because the three failures this slice can
have are each invisible to the other two: the **stylesheet source** (a dark override added
later — no ratio computed from a mirror can see it), the **contrast mirror** (the maths), and
the **computed style in a real render** (a token declared without its `@theme inline` row
generates no utility at all, and the class stays in the markup while the paint silently does
not change).

- [x] **AC-1:** Given each migrated family's fixed surface, when the ticket's candidate token is
      resolved at its **dark** value (`--riv-card-ink` → `#f2f7fa`, `--riv-ink` → `#ffffff`) and
      composited on that surface, then the ratio is **below AA** — so the candidates are refused
      on measurement, not on assertion. *Seam:* the `testing/glass-tokens.ts` mirror of
      `tailwind.css`. *Pinned by:*
      `fixed-ink-tokens.contrast.spec.ts` › `the ticket's candidate tokens would fail on every
      one of these surfaces`
- [x] **AC-2:** Given each migrated ink, when composited on the surface it actually sits on —
      the calendar's `rgba(255,255,255,0.97)` glass over **all three** themes' worst-case
      gradient stops, each opaque `CALENDAR_TINTS` fill, and each of the six fixed banner fills
      — then it clears AA (4.5:1 for body text; 3:1 for the disabled inks and the hairline
      borders under WCAG 1.4.11). *Seam:* the same mirror. *Pinned by:*
      `availability-calendar.contrast.spec.ts` (extended) + `booking-view.contrast.spec.ts`
      (extended) + `fixed-ink-tokens.contrast.spec.ts`
- [x] **AC-3:** Given the ten new tokens, when `src/tailwind.css` is read as text, then each is
      declared **exactly once**, that declaration is inside the base block
      (`:root, [data-riv-theme='porcelain']`), and each carries an `@theme inline` row mapping
      `--color-riv-*` to `var(--riv-*)`. *Seam:* `testing/stylesheet-tokens.ts`
      (`declarationsOf`, `baseBlock`). *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `declares
      each token exactly once, so no theme block can override it`
- [x] **AC-4:** Given the migrated sites, when each source file is swept, then **no** bare
      `#0a2a33` / `rgba(12,42,51,·)` literal in the migrated forms survives outside `*.spec.ts`,
      **and** each site positively matches its family's utility — the absence half alone passes
      vacuously on a mistyped path (#852's emptied-guard lesson). *Seam:* the source files, read
      as text. *Pinned by:* `fixed-ink-tokens.contrast.spec.ts` › `leaves no site painting a
      migrated literal` + `paints its family at every one of its sites`
- [x] **AC-5:** Given a real Chromium render, when the document theme is forced **porcelain** and
      then **dark**, then every one of the ten tokens resolves to its declared value at the
      document root, its utility generates, and the reachable consumers — the calendar popover on
      the venue map, the booking-view banner, the operator console's card and sign-out button —
      report the expected `color` / `border-color` via `toHaveCSS`. *Seam:* the mocked routes
      `/venues/:id`, `/booking/:code`, `/operator/:venueId`. *Pinned by:*
      `e2e/fixed-ink-token-recut.e2e.ts`
- [x] **AC-6:** Given `docs/design/colour-literal-token-audit.md`, when the T-3 rows are read,
      then they record `done` with this PR **and** the re-classification: the class-T family is
      empty, the surviving sites are filed under classes F and R with their surfaces named, and
      the `rgba(12,42,51,0.66)` family is recorded as consumed by #870. *Seam:* the ledger file.
      *Pinned by:* review (a doc AC — no test asserts prose).

### The surface table these ACs are written from

Every site, the surface it is actually painted on, and the verdict. This is step 1 of the
ledger's own "How to cut a slice" — the step whose omission is how #835's `#0a4f5e` would have
gone wrong.

| Site | Literal | Painted on | Themes it can take | Verdict → family |
|---|---|---|---|---|
| `availability-calendar.html:8` (dialog root ink, inherited by the month heading) | `#0a2a33` | its own `bg-[rgba(255,255,255,0.97)]` — **fixed** | all three | **F** → `--riv-calendar-ink` |
| `availability-calendar.html:81` (day-cell ink) | `#0a2a33` | the four **opaque** `CALENDAR_TINTS` fills | all three | **F** → `--riv-calendar-ink` |
| `availability-calendar.html:114,121` (footer note ×2) | `rgba(12,42,51,0.78)` | the same fixed glass | all three | **F** → `--riv-calendar-ink-soft` |
| `booking-view.ts:89` (banner strong ink) | `#0a2a33` | six **fixed** banner fills (`#f0f2f3`, `#ddf4f8`, `#fdf5e6`, `#faefec`, `#f0eef6`) | all three | **F** → `--riv-banner-strong-ink` |
| `operator-console.html:4,62` (sign-in card + active tab pill) | `rgba(12,42,51,0.1)` | `bg-white`, inside the porcelain-pinned console | porcelain only | **R** → `--riv-console-card-border` |
| `operator-actions.ts:54` (sign-out button) | `rgba(12,42,51,0.14)` | `bg-white`, porcelain-pinned on both hosts | porcelain only | **R** → `--riv-console-btn-border` |

**Why the two class-R rows are R and not T.** `--riv-pop-divider` has exactly one consumer in
the tree (`app.html:296`, a rule inside the account popover) and `--riv-chip-border` is the
tourist shell chip's border over the themed `--riv-chip-bg` (`app.html:161,219`,
`home.html:5`). Both resolve correctly under the console's porcelain pin today, so neither is a
rendering bug — the objection is #848's mechanical one: `@theme inline` makes the utility
resolve `var(--riv-*)` at the point of use, so retuning the popover or the tourist chip would
silently move the operator console's chrome. Value-correct, role wrong → its own token.

**Two positions carried in beyond the ticket's listed forms**, because the ledger's standing
check forbids leaving a named utility beside a raw literal of its own value in one class
expression (#852's third boundary check, #858's take-the-ternary-whole rule):

| Site | Literal | Why it must come | Family |
|---|---|---|---|
| `availability-calendar.html:58` (weekday column headers) | `rgba(12,42,51,0.72)` | the existing contrast spec's `CHROME_INKS` models it as one set with `0.78`; splitting the set across a token and a literal breaks the spec's own shape | `--riv-calendar-ink-faint` |
| `availability-calendar.html:20,81` (disabled nav arrow + disabled day) | `rgba(12,42,51,0.35)`, `rgba(12,42,51,0.4)` | `:81` would otherwise read `text-riv-calendar-ink … aria-disabled:text-[rgba(12,42,51,0.4)]` — a named utility beside a raw literal of its own family, in one expression | `--riv-calendar-ink-disabled` |
| `availability-calendar.html:20,40` (nav hover wash) | `rgba(12,42,51,0.07)` | same expression as the disabled arrow ink above | `--riv-calendar-hover` |
| `availability-calendar.html:8` (the dialog fill itself) | `rgba(255,255,255,0.97)` | the fill is what pins the whole ramp; a family whose anchor stays a literal is a claim nobody can guard | `--riv-calendar-glass` |
| `booking-view.ts:89,98` (banner body ink ×2) | `#334a52` | shares one class string with the strong ink at `:89`; maintainer-approved scope call, 2026-09-02 | `--riv-banner-body-ink` |

**One deliberate repaint.** The two disabled calendar inks are `0.35` (nav arrow) and `0.4`
(day cell) — 0.05 apart for no stated reason, the drift #879's ladder exists to collapse. They
merge at **`0.4`**, the higher-contrast of the two, so the one site that moves moves in the safe
direction and the other does not move at all (#879's own tie-break). Asserted as a comparison,
not as two thresholds.

## Non-goals

- **The white ramps in the same markup.** `availability-calendar.html:8`'s
  `border-[rgba(255,255,255,0.7)]` and its composite `inset_0_1px_0_rgba(255,255,255,0.85)`
  shadow belong to class R's `--riv-cta-border` neighbour rows (#853) and the 48-position
  inset-highlight ramp — both explicitly still open, and neither is this family.
- **`#0a3f4e`** (the calendar's nav arrows and every `CALENDAR_TINTS.ring`) and
  **`#6f8a91`/`#0a3f4e`** (`CALENDAR_BAR`). A different colour family, already pinned by
  `calendar-tints.ts`, with no token and no row.
- **The per-banner eyebrow palette** in `booking-view.ts:83–88` (`#0a5e7a`, `#8a5410`,
  `#8a3a2a`, `#5c5470`, `#4f5f67`). Six values across six states is class **S**'s shape — a
  palette design pass — and they sit in their own constants, not in `bannerBody`'s expression,
  so no take-the-whole rule reaches them.
- **The class-S calendar tint fills** (`#dff0e4`, `#fdeecc`, `#fae9e9`) — the `venue/availability-calendar.html`
  row of class S, a per-state palette.
- **Widening, merging or retuning any of the three candidate tokens.** They are refused, not
  changed; `--riv-ink`, `--riv-card-ink` and `--riv-pop-ink` end this slice byte-identical.
- **A lint rule for the whole population** (#836's step 4). Classes F and R are still live work.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced. The one intended visual movement in the whole slice is
the `0.35 → 0.4` disabled-arrow repaint above; every other position is byte-identical by
construction, which AC-5's `toHaveCSS` assertions are what prove.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The day-cell ink is mirrored in `testing/calendar-tints.ts` as a literal; tokenising the markup alone leaves the spec restating a value it no longer reads — #835's R-5, silent staleness | high | med | `CALENDAR_TINTS[].ink` reads the `glass-tokens.ts` mirror; `calendar-tints.ts`'s own doc comment already calls itself the one mirror | claude | closed — phase 0 |
| R-2 | The existing `availability-calendar.contrast.spec.ts` hard-codes `POPOVER_GLASS` and `CHROME_INKS` — the same restatement, one file over | high | med | both read the mirror; the spec keeps its three-theme composite, only its source of values changes | claude | closed — phase 0 |
| R-3 | Carrying `.72/.4/.35/.07` and the `0.97` fill beyond the ticket's listed forms grows the diff past what #849 describes | med | low | bounded to **one component's dark-ink ramp**, justified per position in the table above, recorded in the ledger as an `n corrected` note the way every sibling row does | claude | closed — ledger row reads `n corrected 5 → 10` |
| R-4 | `0.35 → 0.4` is a real repaint, and a repaint hidden inside a migration is how a slice loses trust | med | med | stated in the plan, asserted as a strict comparison in the guard spec, and named in the ledger row | claude | closed — phase 0 |
| R-5 | Ten new tokens is a large single-declaration surface; one added dark override later silently reverses a theme-invariance claim | med | high | AC-3's `declarationsOf(...)` length-1 assertion per token, plus the base-block assertion — the `stylesheet-tokens.ts` guard pattern | claude | closed — 10/10 asserted |
| R-6 | A token declared without its `@theme inline` row generates no utility: the class stays in the markup and the paint silently does not change, invisible to every unit spec | med | high | AC-5's mocked e2e `toHaveCSS` in a real render, both themes — the only seam that can see it | claude | closed — phase 3, 8 tests green |
| R-7 | In-flight collision on the shared files (`tailwind.css`, `testing/glass-tokens.ts`) | low | med | checked at intake: **zero open PRs** on the repo, `main` at `15c82d0`. No Flyway version to claim (frontend-only) | claude | closed — verified at intake |
| R-8 | The e2e's dark-theme leg for the operator families is unreachable through a real render (the console pins porcelain) | high | low | the #870 precedent: prove the declaration resolves at the **document root** under a forced dark theme, and prove the real porcelain render separately | claude | closed — phase 3 |

## Open questions / Assumptions

*(empty — every entry resolved below.)*

### Resolved

- **Assumption:** `OperatorActions` is porcelain-pinned at **both** of its hosts, so
  `--riv-console-btn-border`'s dark branch is unreachable by construction. — **Confirmed**:
  `operator-console.ts:72` pins its own host and `app.ts:50` pins the subtree for every
  `shellChrome() === 'operator'` route, which is what renders `operator-chrome.ts`. The e2e proves
  the document-root resolution under a forced dark theme regardless (phase 3).
- **Open question:** does #849's class-T framing survive contact with the code? — **No.** The
  population is 8, not 14 (#870/PR #873 consumed six, including the whole `0.66` family), and
  none of the 8 can take one of the three candidates. Re-cut approved by the maintainer,
  2026-09-02, together with pulling `booking-view.ts:89`'s `#334a52` pair into scope.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes colour tokens and the class strings that
consume them; no booking, beach-map or `availability` code path, no read or write of
`availability(set_id, booking_date)`, and no component logic at all. The one component whose
markup carries booking semantics (`availability-calendar.html`) keeps every binding, every
`aria-*` attribute and every handler untouched — only colour utilities change.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend code in scope.

### Module ownership (§4a)

N/A — frontend-only; no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/availability-calendar.html` | existing | template of a standalone component | unchanged | none |
| FE-2 | `booking/booking-view.ts` (the `CLS` recipe block) | existing | standalone component | unchanged | none |
| FE-3 | `operator/operator-console.html` | existing | template | unchanged | none |
| FE-4 | `operator/operator-actions.ts` | existing | standalone component (inline template) | unchanged | none |
| FE-5 | `shared/fixed-ink-tokens.contrast.spec.ts` | new | unit guard spec | — | — |

**Standards:** no component API, signal, binding or lifecycle change anywhere in the slice —
every edit is a class-string substitution plus the token declarations behind it. Styling follows
`riviera-tailwind` rule 1 (tokens do the switching; components stay theme-agnostic and never name
a theme).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `PR #886 (draft) — awaiting first CI run; review + Sonar gates next`

**Next action:** Check this push's CI run, then run the Review gate per
`riviera-sdlc` `references/pr-gates.md` §1, then the Sonar gate's issue list.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the calendar's fixed-glass ink ramp | ✅ | |
| 1 — the booking-view banner body pair | ✅ | |
| 2 — the two porcelain-pinned console borders | ✅ | |
| 3 — the cross-theme real-render proof (mocked e2e) | ✅ | |
| 4 — ledger re-cut + close-out | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate — RV-STYLE-1 (`check-inline-comments.mjs --diff origin/main`), independently confirmed by CI's `Repo hygiene (diff-scoped)` job failing on `9883e86` | Three multi-line inline comments written by this diff: two in `e2e/fixed-ink-token-recut.e2e.ts` and one in `booking-view.contrast.spec.ts`. Minor | fixed in `44b9c73` — the two e2e ones shortened to one line, the spec's promoted to TSDoc (exempt); guard re-run clean, e2e re-run 8/8 |

---

## File structure

- `docs/plans/t3-fixed-ink-token-recut.md` — this plan
- `docs/design/colour-literal-token-audit.md` — the T-3 rows rewritten to the re-cut; the #882
  row given the PR number (#885) its siblings all carry
- `docs/design/non-text-contrast.md` — the two console hairlines registered in rule 2's family
  table, with the "Venue not found" card's edge distinguished as outside 1.4.11 rather than exempt
  under it. Found by the `riviera-docs-freshness` pass: the slice NAMED two sub-3:1 chrome families
  that previously had no entry anywhere, and that file is the maintained home for exactly those
- `frontend/src/tailwind.css` — the ten new tokens in the base block + their `@theme inline` rows
- `frontend/src/testing/glass-tokens.ts` — the test-side mirror of the four new families
- `frontend/src/testing/calendar-tints.ts` — `CALENDAR_TINTS[].ink` reads the mirror
- `frontend/src/app/venue/availability-calendar.html` — the ink ramp migrated
- `frontend/src/app/venue/availability-calendar.contrast.spec.ts` — reads the mirror; keeps its
  three-theme composite
- `frontend/src/app/booking/booking-view.ts` — `bannerBody` + `confirmQOnBanner` migrated
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — reads the mirror
- `frontend/src/app/operator/operator-console.html` — the two card/pill borders migrated
- `frontend/src/app/operator/operator-actions.ts` — the sign-out button border migrated
- `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` — the four-family guard
- `frontend/e2e/fixed-ink-token-recut.e2e.ts` — the cross-theme real-render proof

---

## Phase 0 — the calendar's fixed-glass ink ramp

**Files:** Create `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` · Modify
`frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`,
`frontend/src/testing/calendar-tints.ts`, `frontend/src/app/venue/availability-calendar.html`,
`frontend/src/app/venue/availability-calendar.contrast.spec.ts`

- [x] **Step 1: Write the failing test** — the refusal proof and the single-declaration guard,
      before the tokens exist.
- [x] **Step 2: Run it, verify it fails** — `npm test -- --run fixed-ink-tokens` → FAIL
      (`--riv-calendar-ink declarations` receives `[]`).
- [x] **Step 3: Minimal implementation** — declare the six calendar tokens in the base block with
      the reason at the declaration, map them in `@theme inline`, migrate the markup, point the
      mirrors at them.
- [x] **Step 4: Run it, verify it passes** — `npm test -- --run fixed-ink-tokens availability-calendar`
- [x] **Step 5: Generalization-audit pass** — sweep by mechanism, not resemblance.
- [x] **Step 6: Commit** — `git commit -m "T-3: tokenise the calendar's fixed-glass ink ramp (#849)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — the booking-view banner body pair

**Files:** Modify `frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`,
`frontend/src/app/booking/booking-view.ts`,
`frontend/src/app/booking/booking-view.contrast.spec.ts`,
`frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts`

Same seven steps. The AA proof runs the pair over **all six** banner fills, not one.

## Phase 2 — the two porcelain-pinned console borders

**Files:** Modify `frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`,
`frontend/src/app/operator/operator-console.html`,
`frontend/src/app/operator/operator-actions.ts`,
`frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts`

Same seven steps. Borders are non-text chrome: the bar is WCAG 1.4.11's 3:1 against the white
fill they bound, and a sub-3:1 result is recorded under `docs/design/non-text-contrast.md`'s
rules rather than waved off.

## Phase 3 — the cross-theme real-render proof

**Files:** Create `frontend/e2e/fixed-ink-token-recut.e2e.ts`

The only seam that can see R-6 and a wrong cascade. Both themes; the operator families take the
#870 document-root treatment for their unreachable dark branch.

## Phase 4 — ledger re-cut + close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`, this plan

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | phase 0 | **A class expression naming a `--riv-calendar-*` utility beside a raw colour literal** — #852's third standing check, the half-migrated-ternary shape | `grep -rn 'riv-calendar' src/app --include=*.html --include=*.ts \| grep -E '\[(#\|rgba\()'` | 3 (`availability-calendar.html:8,20,40`) | **none of the three is a violation**: the literals beside the tokens are `rgba(255,255,255,·)` (#853's white border + inset-highlight ramps) and `#0a3f4e` (the nav-arrow / `CALENDAR_TINTS.ring` family). Different colour families, both fenced as Non-goals. The check is about a literal **of the token's own value**; recorded because a reader seeing three hits should not have to re-derive that |
| 2026-09-02 | phase 0 | **Any other surface painted a near-opaque white fill** — i.e. a sibling of the calendar popover that would want the same fill→ink pinning | `grep -rn '255,255,255,0\.9[0-9]\|255, 255, 255, 0\.9[0-9]' src/app src/tailwind.css` | 1 (`--riv-pop-surface`, `rgba(255,255,255,0.92)`) | **not folded in, and worth the note.** `--riv-pop-surface` is the account/theme popover's surface and it **themes** (dark: `rgba(16,26,46,0.96)`) with `--riv-pop-ink` on it. So the app already has a popover treatment that handles dark correctly, and the fair question is whether the calendar's `<dialog>` should adopt it rather than be pinned light forever. That is a **repaint** — it would turn the calendar dark in the dark theme — not a migration, so it is out of a slice whose whole claim is that no pixel moves. Filed as an adjacent-not-taken in the ledger so the next sweep does not read its absence as an oversight |
| 2026-09-02 | phase 2 | **A class expression naming a re-cut token beside a raw literal** — the same standing check, re-run over the two families added since phase 0 | `grep -rn 'riv-console-card-border\|riv-console-btn-border\|riv-banner-' src/app --include=*.html --include=*.ts \| grep -E '\[(#\|rgba\()'` | 1 (`operator-actions.ts:54`, `bg-[#eef1f2]`) | **not a violation, and found rather than assumed.** `#eef1f2` is the sign-out button's hover fill — a different value and a different role from the border beside it, so the check does not fire. It is a genuine class-R "no token at all" candidate with no row anywhere in the ledger, but it is not in #849's population (which is the `#0a2a33` / `rgba(12,42,51,·)` values), and inventing `--riv-console-btn-hover` for it would be widening the slice. Filed in the ledger as residue so the next sweep finds it written down |
| 2026-09-02 | phase 0 | **Any surviving literal of the migrated values, tree-wide** — the absence half of AC-4, run as a command rather than trusted to the site list | `grep -rnoE '(text\|bg\|border)-\[(#0a2a33\|rgba\(12,42,51,0\.(78\|72\|4\|35\|07)\))\]' src --include=*.ts --include=*.html \| grep -v '\.spec\.ts'` | 1 (`booking-view.ts:89`) | expected — that is phase 1's site. **Re-run at the end of phase 2 returned zero**, over the full migrated value set including the two border alphas |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `npm test -- --run fixed-ink-tokens` → the refusal assertions pass.
- [x] **AC-2:** Run `npm test -- --run fixed-ink-tokens availability-calendar booking-view` → AA per surface, per theme.
- [x] **AC-3:** Run `npm test -- --run fixed-ink-tokens` → single declaration, base block, `@theme inline`.
- [x] **AC-4:** Run `npm test -- --run fixed-ink-tokens` → the absence sweep and the positive list.
- [x] **AC-5:** Run `npm run test:e2e:a11y -- fixed-ink-token-recut` → both themes green.
- [x] **AC-6:** The ledger's T-3 rows read `done — #849, PR #886` with the re-classification.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified N/A — no availability code path).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking logic.
- [x] **Modulith** section filled (N/A — frontend-only).
- [x] **Payment/payout** section filled (N/A).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
