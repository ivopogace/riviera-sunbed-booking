# Accent Teal Ink & Tint Token Sweep — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every hardcoded `#0a4f5e` teal ink and every `rgba(43,184,212,…)` /
`rgba(14,138,168,…)` tint under `frontend/src/app` is replaced by a registered `--riv-*`
token, so the admin console's *positive* state paints from the registry exactly as #829
made its *negative* state do — with each site's colour movement proven per surface by
maths and by a real render, not eyeballed.

**Architecture:** The sweep's central finding is that `#0a4f5e` is **not one role**, and
neither the issue's "collapse onto `--riv-accent-ink`" nor its "register a second ink"
option is right on its own — the sites split by **what they are painted on**, which is a
distinction the repo has already settled once. Nine sites sit on the **porcelain-pinned**
admin/operator consoles, where every token resolves light, so they collapse onto the
existing `--riv-accent-ink`. Three sit on a **fixed `#f4f6f7` fill that does not theme**,
where `booking-view.contrast.spec.ts`'s own pinned rule — *"a themed ink over a FIXED
banner fill drifts between themes"* — forbids a themed token; they get a deliberately
**theme-invariant** ink token instead. The tint family follows #829's danger-family shape:
pre-composed `rgba()` tokens, normalised per *treatment* (panel / chip / spinner-track), so
accidental alpha drift stops being encoded as design intent.

**Persistence:** N/A — frontend-only styling slice, no schema, no migration (invariant #1
untouched).

**Source of intent:** GitHub issue #835 (deferred from #829 / PR #833, recorded there as a
Non-goal: "not red, not in #829's mechanism; a separate accent-ink sweep"). Enumerated
against merged `main` `f8cbdce`. Two of the issue's own premises are factually wrong; both
corrections are recorded under *Open questions → Resolved* (OQ-A, OQ-B) and were
re-confirmed with the maintainer before planning.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — split the
issue's flat 13-site list into three populations by painted-on surface, which is what
turned an unanswerable "one token or two?" into three separate answers; also caught the
14th site the issue's grep cannot see) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what converts "styling only" from a claim into a
per-site verdict, and the Non-goals that fence #834 and #836 off) · `tdd` (phase 0 writes
the contrast spec red against `glass-tokens.ts` constants that do not exist yet, so every
token value is gated by AA maths before a single component moves) · `riviera-review-overlay`
(review gate — due at ready-for-review; RV-FE-E2E owns the suite placement of the phase-4
spec) · `riviera-docs-freshness` (**due at merge close-out step 5** over this slice's own
merge range, and it has a real target: `grep -rln '0a4f5e\|2bb8d4' docs/` returns four
`docs/design/*.dc.html` exports plus five prior plan docs. The design exports are the
design *source* and are not restated by this slice; the prior plan docs are their own
slices' historical records and are not rewritten. What the audit must actually check is
the **counting sweep** — this slice makes `--riv-accent-*` a family of six where the
registry previously had one accent token, so any doc saying "the accent ink" in the
singular goes stale outside the diff) · `riviera-tailwind` (token-first styling: the named
utility once a token is registered, the rejection of Tailwind's `/opacity` modifier because
it compiles to `color-mix()` and changes the computed value — R-3 — and the
no-visual-drift computed-style rule that shapes AC-6) · `riviera-frontend` (placement: the
registry stays the two-place `tailwind.css` + `core/theme.ts` pair and needs **no**
`core/theme.ts` row, since that registry carries only what the switcher UI shows; the new
contrast spec is colocated per-feature) · `angular-developer` + angular-cli MCP
(`get_best_practices` v22 — confirmed no Angular API is touched: every edit is a `class`
string in an inline template or a `.html`, and the global `tailwind.css` reaches them
because emulated encapsulation scopes only a component's own `styles`) · `playwright-cli`
(phase 4 — `toHaveCSS` against a real render is the only thing that separates a working
token from a class that generated no utility)

**Branch:** `claude/sdlc-835-pt3bat` — **cloud-session substitution** for
`feature/accent-teal-token-sweep`, per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

> Each AC is written at the boundary that can actually observe it: the token *values* are
> gated by pure maths in a unit contrast spec, the token *plumbing* only by a real render.

- [x] **AC-1:** Given the porcelain page stops and the porcelain card glass, when
      `--riv-accent-ink` (`#085a6e`) is painted on every surface the nine migrated console
      sites use (bare stop, card glass, the `white/85` pill, the accent fill), then every
      pair meets WCAG AA 4.5:1. *Pinned by:*
      `accent-tokens.contrast.spec.ts` › `the accent ink meets AA on every console surface it lands on`
- [x] **AC-2:** Given the same surfaces, when the accent ink after migration is compared
      with the `#0a4f5e` it replaces, then the ratio falls but stays ≥ 4.5:1 on every
      surface — the drop is bounded and asserted, not discovered later. *Pinned by:*
      `accent-tokens.contrast.spec.ts` › `the migration lowers contrast but never below AA`
- [x] **AC-3:** Given the theme-invariant `--riv-solid-btn-ink`, when it is painted on the
      fixed `#f4f6f7` fill and its `#e7ebec` hover, then both meet AA — and the token has
      **no** dark-theme override, so the value is identical in all three themes.
      *Pinned by:* `accent-tokens.contrast.spec.ts` › `the solid-button ink is theme-invariant and meets AA on both fixed fills`
- [x] **AC-4:** Given the normalised `--riv-accent-border`, when its non-text boundary
      ratio is measured against both adjacent colours (the card glass outside, the accent
      fill inside), then the spec records the measured value and asserts it is **not
      lowered** by the normalisation — 1.4.11 compliance itself is #834's, and this AC
      pins that this slice does not make it worse. *Pinned by:*
      `accent-tokens.contrast.spec.ts` › `normalising the panel border does not lower its non-text ratio`
- [x] **AC-5:** Given a running app, when each migrated family is rendered, then its
      computed style equals the registered token value — the error mode this catches is a
      token declared without its `@theme inline` row, which leaves the class in place and
      the paint unchanged. *Pinned by:* `accent-token-inks.e2e.ts`
- [x] **AC-6:** Given the document theme forced to `dark`, when the admin console and the
      operator console are rendered, then their migrated inks still resolve to the
      porcelain value — the subtree pinning `@theme inline` buys is what makes AC-1's
      porcelain-only proof sufficient. *Pinned by:*
      `accent-token-inks.e2e.ts` › `the consoles keep their porcelain accent ink under a dark document theme`
- [x] **AC-7:** Given `main` at merge time, when
      `grep -rn '#0a4f5e\|rgba(43, *184, *212\|rgba(14, *138, *168' frontend/src/app` is
      run, then it returns **only** contrast-spec constants, all of which belong to tokens
      deliberately out of scope (`--riv-back-ink`, `--riv-map-rail-ink` — R-6). The
      `booking-dialog.ts:326` site does not appear under this pattern at all, which is the
      point of the widened grep in the audit log. *Pinned by:* the phase-5 verification command, recorded in
      *Acceptance-criteria verification*.

## Non-goals

- **WCAG 1.4.11 compliance for the accent panel border.** No alpha of the current teal
  reaches 3:1 (`rgba(14,138,168,0.75)` tops out at 2.77:1); clearing it needs a different,
  much darker hue and is a visible design change on two tourist surfaces. #834 owns the
  danger twin's boundary and should raise both together. This slice **preserves** the
  weight and asserts it does not regress (AC-4) — exactly #829's posture.
- **The `#f4f6f7` / `#e7ebec` / `rgba(255,255,255,0.7)` solid-button skin itself.** Only
  its teal *ink* is in scope here; the fill, hover and border literals are #836's, and the
  whole family should move as one.
- **`booking-dialog.ts:326`'s `rgba(10,79,94,0.45)` hover border** (OQ-C) — the 14th site,
  which the issue's grep cannot see. It is a latent dark-theme defect, not a tokenisation
  candidate; filed as **#839**.
- **Making the tint family theme-aware.** Every new tint token is deliberately
  theme-invariant so computed styles stay byte-identical (R-2). Whether these brand tints
  *should* follow the theme is a real question and a separate one.
- Any behaviour, wire format, endpoint, or invariant. Styling only.

## Behavior-parity ledger

> The slice replaces the *paint* of existing surfaces, so the ledger is per painted
> position rather than per feature. "Preserved" means byte-identical computed value.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| Admin tab pill / outbox pills / delivery field ink `#0a4f5e` (9 sites) | **changed** | → `--riv-accent-ink` `#085a6e`. Deliberate (OQ-A): removes a near-duplicate teal. Contrast 9.16→7.78:1 on the pill, worst case 5.95:1, AA holds (AC-1/AC-2) |
| Admin delivery field `focus-visible` border `#0a4f5e` | **changed** | → same token; moves with the ink it belongs to, so the field's focus ring cannot drift from its text |
| Erasure **success** panel fill `rgba(43,184,212,0.12)` + border `rgba(14,138,168,0.35)` | **preserved** | → `--riv-accent-fill` / `--riv-accent-border`, whose normalised values are exactly this panel's, so the console — the issue's subject — is byte-identical |
| `request-confirmation` panel `0.30`/`0.10` | **changed** | → the normalised pair `0.35`/`0.12`. Sub-perceptual, and the drift it removes was accidental (three twins, three alphas) |
| `booking-dialog` mode-note `0.34`/`0.12` | **changed** | → the normalised pair; fill byte-identical, border `0.34`→`0.35` |
| `outcome-card` chip fill `0.18` | **preserved** | → `--riv-accent-chip-fill`, whose value is this one |
| `segmented-control` selected fill `0.16` / border `0.75` | **changed** (fill) / **preserved** (border) | → the chip pair; fill `0.16`→`0.18` |
| `venue-tab` active amenity chip fill `0.22` / border `#0e8aa8` opaque / ink `#0a4f5e` | **changed** | → chip pair + `--riv-accent-ink`. The largest single movement in the slice; `venue-tab.contrast.spec.ts`'s two pinned constants move with it |
| `payout-statement` chip ink `#0a4f5e` | **changed** | → `--riv-accent-ink` |
| `booking-view` / `review-panel` outline-button ink, `my-bookings` Retry ink | **preserved** | → `--riv-solid-btn-ink`, theme-invariant by design (AC-3). A themed token here would flip the ink light-on-light in dark mode |
| `booking-pay` spinner track `0.25` + head `#0e8aa8` | **preserved** | → `--riv-accent-track` / `--riv-accent-strong`, both byte-identical |
| Every `hover:` / `focus-visible:` / `aria-[current=page]:` variant on the touched classes | **preserved** | The migration substitutes the colour token inside the existing variant; no variant is added or removed |
| The `.amenity-chip` / `.mode-note` / `.btn-back` marker classes specs query | **preserved** | Retained as inert markers (`riviera-tailwind` rule 2) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A migrated console component is rendered **outside** its porcelain-pinned host (a portal/overlay), so a themed token resolves dark and the ink flips light-on-white | low | high | Both hosts verified inline in the subtree (`admin-console.ts:84`, `payouts-tab.html:285`); AC-6 pins it against a forced `dark` document theme in a real render | claude | closed |
| R-2 | A new tint token given a dark-theme value would silently change computed styles on the themeable tourist surfaces | med | med | Every tint token is declared **once**, in the base block only, with a registry comment stating why; AC-5 asserts the computed value in a real render | claude | closed |
| R-3 | A token consumed via Tailwind's `/opacity` modifier compiles to `color-mix()` and changes the computed value | med | med | Tokens are **pre-composed `rgba()`**, matching `--riv-danger-*` and `--riv-field-border`; no `/opacity` on any of them (`riviera-tailwind`) | claude | closed |
| R-4 | A token declared in `tailwind.css` without its `@theme inline` row generates no utility — the class stays, the paint silently does not change | med | high | AC-5's `toHaveCSS` in a real render is exactly this detector; the unit specs cannot see it | claude | closed |
| R-5 | The three contrast specs pinning `#0a4f5e` (`venue-tab`, `venue-map`, `booking-*`, `my-bookings`) drift from the tokens after migration | med | med | Phase 0 moves every pinned constant into `glass-tokens.ts` first, so the specs read the token values rather than restating them | claude | closed |
| R-6 | `venue-map.contrast.spec.ts` pins `#0a4f5e` for the **map rail** (`--riv-map-rail-ink`), a different token that merely shares the value — migrating it would be wrong | med | med | The map family is out of scope and stays on `--riv-map-rail-ink`; phase 0 renames only the spec constants that belong to the migrated sites | claude | closed |

## Open questions / Assumptions

_None open._

- **Assumption (accepted, not open):** the tint family stays theme-invariant (R-2) so
  computed styles stay byte-identical. Whether these brand tints *should* follow the theme
  is a separate question, recorded as a Non-goal rather than left unresolved here.


### Resolved

- **OQ-A — the issue's central question, "one token or two?"** Neither: **three**
  populations, split by painted-on surface. (1) Nine porcelain-pinned console sites →
  collapse onto `--riv-accent-ink`. (2) Three sites on a fixed `#f4f6f7` fill →
  a theme-invariant token, because `booking-view.contrast.spec.ts:90` already pins the
  rule that a themed ink over a fixed fill drifts between themes. (3) The tint family →
  its own normalised pairs. `--riv-back-ink` is **not** the answer to (1): it is themed
  ink on a *themed* wash (`.btn-back` on `--riv-wash-fill`), a genuinely different role
  whose light value merely coincides. Confirmed with the maintainer.
- **OQ-B — the issue's premise "contrast rises slightly, `#085a6e` is darker" is wrong.**
  `#085a6e` (8,90,110) is *lighter* than `#0a4f5e` (10,79,94); the collapse **lowers**
  contrast — 9.16:1 → 7.78:1 on the `white/85` pill, worst case 5.95:1 across all four
  porcelain stops. AA (4.5:1) holds everywhere with margin, so the decision stands on its
  real ground (removing a near-duplicate), not on the stated one. Re-confirmed with the
  maintainer after correction. AC-2 pins the bound.
- **OQ-D — is the 1.4.11 fix in scope?** No. Measured: the current border is 1.29–1.56:1
  and no alpha of the current hue clears 3:1. Deferred to #834, which owns the danger
  twin; see Non-goals. Confirmed with the maintainer.
- **OQ-C — `booking-dialog.ts:326`'s `rgba(10,79,94,0.45)` hover border.** `#0a4f5e` at 45%
  on a `.btn-back` whose ink is the **themed** `--riv-back-ink`, so in dark mode a pale ink
  sits inside a near-black hairline. Tokenising the literal as-is would encode the mismatch
  in the registry rather than remove it, and `/45` on a token compiles to `color-mix()`.
  Filed as **#839** with the decision it needs stated; out of scope here.
- **OQ-E — in-flight collision check.** The 20 open PRs are all Dependabot bumps; none
  touches `frontend/src/app` or `tailwind.css`. No Flyway number to claim (frontend-only).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice changes only colour values in `class`
strings and the token registry. No booking, beach-map, or `availability` code path is
read or written; no request is issued.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file is touched, so no module, `api/` port, `spi/` port,
or event changes; `ModularityTests` is unaffected.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` `booking-pay.ts` is touched, but only its spinner's two
colour literals; no PaymentIntent, webhook, refund, ledger, or money value is read.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | token registry | — | — |
| FE-2 | `admin/admin-console-tabs.ts`, `admin-mail-outbox.ts`, `admin-refund-outbox.ts`, `admin-mail-delivery.ts`, `admin-privacy.ts` | existing | inline templates | unchanged | unchanged |
| FE-3 | `operator/payout-statement.ts`, `operator/venue-tab.html` | existing | template | unchanged | unchanged |
| FE-4 | `booking/review-panel.ts`, `booking-view.ts`, `my-bookings.ts`, `request-confirmation.ts`, `booking-dialog.ts`, `booking-pay.ts` | existing | class-string constants + templates | unchanged | unchanged |
| FE-5 | `shared/outcome-card.ts`, `shared/segmented-control.ts` | existing | inline templates | unchanged | unchanged |
| FE-6 | `testing/glass-tokens.ts`, `admin/accent-tokens.contrast.spec.ts` | modify / new | test substrate + unit spec | — | — |
| FE-7 | `e2e/accent-token-inks.e2e.ts` | new | Playwright spec (CI-safe mocked suite) | — | — |

**Standards:** no Angular API is touched — every production edit is a `class` string. No
component gains or loses an `input()`, signal, or lifecycle hook, so the existing unit and
a11y specs stand unchanged except for the pinned colour constants (R-5).

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire value is read or written.

## Execution status

**Stage pointer:** `review gate — PR #838 ready for review`

**Next action:** run the review gate per `riviera-sdlc` `references/pr-gates.md` §1, then
the Sonar gate; fix findings through the re-entry rule.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The token set + its contrast proof | ✅ | |
| 1 — The nine console ink sites → `--riv-accent-ink` | ✅ | |
| 2 — The fixed-fill trio → `--riv-solid-btn-ink` | ✅ | |
| 3 — The tint family → the accent tint tokens | ✅ | |
| 4 — Computed-style verification + the e2e pin | ✅ | |
| 5 — Mechanism re-grep, follow-up issue, close-out | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/accent-teal-token-sweep.md` — this plan
- `frontend/src/tailwind.css` — the seven new tokens + their `@theme inline` rows
- `frontend/src/testing/glass-tokens.ts` — the new token constants the specs read
- `frontend/src/app/admin/accent-tokens.contrast.spec.ts` — the AA/non-text proof (new)
- `frontend/src/app/admin/admin-console-tabs.ts` — active tab pill ink
- `frontend/src/app/admin/admin-mail-outbox.ts` — pill-button ink
- `frontend/src/app/admin/admin-refund-outbox.ts` — pill-button ink
- `frontend/src/app/admin/admin-mail-delivery.ts` — field ink + focus border, two pill buttons
- `frontend/src/app/admin/admin-privacy.ts` — erasure success panel fill/border/heading
- `frontend/src/app/operator/payout-statement.ts` — statement chip ink
- `frontend/src/app/operator/venue-tab.html` — active amenity chip fill/border/ink
- `frontend/src/app/operator/venue-tab.contrast.spec.ts` — its two pinned constants
- `frontend/src/app/booking/review-panel.ts` — outline-button ink
- `frontend/src/app/booking/review-panel.contrast.spec.ts` — pinned constant
- `frontend/src/app/booking/booking-view.ts` — outline-button ink
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — pinned constant
- `frontend/src/app/booking/my-bookings.ts` — Retry ink
- `frontend/src/app/booking/my-bookings.contrast.spec.ts` — pinned constant
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — `BACK_INK` comment only
- `frontend/src/app/booking/request-confirmation.ts` — panel fill/border
- `frontend/src/app/booking/booking-dialog.ts` — mode-note panel fill/border
- `frontend/src/app/booking/booking-pay.ts` — spinner track + head
- `frontend/src/app/shared/outcome-card.ts` — chip fill
- `frontend/src/app/shared/segmented-control.ts` — selected chip fill/border
- `frontend/e2e/accent-token-inks.e2e.ts` — the computed-style pin (new)

---

## Phase 0 — The token set + its contrast proof

**Files:** Modify `frontend/src/tailwind.css` · Modify `frontend/src/testing/glass-tokens.ts` ·
Create `frontend/src/app/admin/accent-tokens.contrast.spec.ts`

The token set, all seven declared in the **base** block only (no dark override — R-2):

| Token | Value | Treatment it carries |
|---|---|---|
| `--riv-accent-fill` | `rgba(43, 184, 212, 0.12)` | the three info panels' tint |
| `--riv-accent-border` | `rgba(14, 138, 168, 0.35)` | their boundary |
| `--riv-accent-chip-fill` | `rgba(43, 184, 212, 0.18)` | the selected-chip tint |
| `--riv-accent-chip-border` | `rgba(14, 138, 168, 0.75)` | its boundary |
| `--riv-accent-track` | `rgba(43, 184, 212, 0.25)` | the pay spinner's track |
| `--riv-accent-strong` | `#0e8aa8` | its moving head |
| `--riv-solid-btn-ink` | `#0a4f5e` | ink on the fixed `#f4f6f7` solid-button fill |

- [x] **Step 1: Write the failing test** — `accent-tokens.contrast.spec.ts`, importing
      `ACCENT_FILL`, `ACCENT_CHIP_FILL`, `ACCENT_BORDER`, `SOLID_BTN_INK`, `SOLID_BTN_FILL`,
      `SOLID_BTN_HOVER` from `../../testing/glass-tokens` — none of which exist yet — and
      asserting AC-1 through AC-4 against `PORCELAIN_STOPS` / `PORCELAIN_CARD_GLASS` via
      the existing `surfaceOver` helper.
- [x] **Step 2: Run it, verify it fails** — `npm test -- accent-tokens.contrast` → FAIL
      with an unresolved-import error, then, once the constants land, on the AA assertions.

> Scope: this one spec file. Not the suite.

- [x] **Step 3: Minimal implementation** — add the seven `--riv-*` declarations to the base
      block in `tailwind.css` **with a block comment stating why the family is
      theme-invariant**, add the seven matching `--color-riv-*` rows to `@theme inline`
      (R-4), and add the constants to `glass-tokens.ts`.
- [x] **Step 4: Run it, verify it passes** — `npm test -- accent-tokens.contrast` → PASS
- [x] **Step 5: Generalization-audit pass** — see the log.
- [x] **Step 6: Commit** — `git commit -m "Register the accent teal ink and tint tokens (#835)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The nine console ink sites → `--riv-accent-ink`

**Files:** Modify `admin/admin-console-tabs.ts:80` · `admin/admin-mail-outbox.ts:87` ·
`admin/admin-refund-outbox.ts:74` · `admin/admin-mail-delivery.ts:67,73,133` ·
`admin/admin-privacy.ts:202` · `operator/payout-statement.ts:45` ·
`operator/venue-tab.html:286` · `operator/venue-tab.contrast.spec.ts`

- [x] **Step 1** Replace each `text-[#0a4f5e]` / `focus-visible:border-[#0a4f5e]` /
      `aria-[current=page]:text-[#0a4f5e]` with the `riv-accent-ink` named utility.
- [x] **Step 2** Point `venue-tab.contrast.spec.ts`'s `ACTIVE_CHIP_INK` at
      `glass-tokens.ts`'s `ACCENT_INK` and its tint at `ACCENT_CHIP_FILL`; update the
      TSDoc, which names the old value in prose.
- [x] **Step 3** Run `npm test -- venue-tab.contrast admin-` → PASS
- [x] **Step 4: Commit** — `git commit -m "Paint the console's teal ink from --riv-accent-ink (#835)"`
- [x] **Step 5** Update execution status.

---

## Phase 2 — The fixed-fill trio → `--riv-solid-btn-ink`

**Files:** Modify `booking/review-panel.ts:49` · `booking/booking-view.ts:101` ·
`booking/my-bookings.ts:205` · their three `*.contrast.spec.ts` pinned constants

- [x] **Step 1** Replace `text-[#0a4f5e]` with `text-riv-solid-btn-ink` at the three sites.
- [x] **Step 2** Point each spec's pinned ink at `glass-tokens.ts`'s `SOLID_BTN_INK`, and
      add a one-line comment on each recording **why this token does not theme** — the
      fill it sits on does not either.
- [x] **Step 3** Run `npm test -- booking-view.contrast review-panel.contrast my-bookings.contrast` → PASS
- [x] **Step 4: Commit** — `git commit -m "Give the fixed-fill outline buttons a theme-invariant ink token (#835)"`
- [x] **Step 5** Update execution status.

---

## Phase 3 — The tint family → the accent tint tokens

**Files:** Modify `admin/admin-privacy.ts:200` · `booking/request-confirmation.ts:20` ·
`booking/booking-dialog.ts:281` · `shared/outcome-card.ts:63` ·
`shared/segmented-control.ts:166` · `booking/booking-pay.ts:197`

- [x] **Step 1** Panels → `bg-riv-accent-fill border-riv-accent-border`.
- [x] **Step 2** Chips → `bg-riv-accent-chip-fill` (+ `border-riv-accent-chip-border` where
      the site has a border).
- [x] **Step 3** Spinner → `border-riv-accent-track border-t-riv-accent-strong`.
- [x] **Step 4** Run `npm test -- outcome-card segmented-control request-confirmation booking-dialog booking-pay admin-privacy` → PASS
- [x] **Step 5: Commit** — `git commit -m "Paint the accent tint family from the token registry (#835)"`
- [x] **Step 6** Update execution status.

---

## Phase 4 — Computed-style verification + the e2e pin

**Files:** Create `frontend/e2e/accent-token-inks.e2e.ts`

Placement is the **CI-safe mocked suite** (`frontend/e2e/`, not `real-backend/`): the spec
needs a real browser for `getComputedStyle` but no live API — the same call
`admin-token-inks.e2e.ts` made for #829, and what RV-FE-E2E expects.

- [x] **Step 1** Reachable elements carry the real-render proof (console accent ink; the
      success panel's fill, border and heading). For the families whose only site is
      expensive to drive — the selected chip, the outline-button ink, the spinner track —
      R-4 is covered instead by asserting Tailwind **generated the utility**, walking the
      emitted rules recursively (they sit inside v4's `@layer` blocks). Verified to fail:
      deleting one `@theme inline` row turns the test red naming that utility.
- [x] **Step 2** AC-6's dark-document-theme test. Scoped to the **admin** console: both
      consoles pin porcelain through the same `data-riv-theme` host binding and the same
      `@theme inline` resolution, so one is the proof of the mechanism; the operator
      console's own pinning is already covered by `operator-chrome.e2e.ts`.
- [x] **Step 3** Run `npm run test:e2e:a11y -- accent-token-inks` → PASS
- [x] **Step 4: Commit** — `git commit -m "Pin the accent tokens against a real render (#835)"`
- [x] **Step 5** Update execution status.

---

## Phase 5 — Mechanism re-grep, follow-up issue, close-out

- [x] **Step 1** Re-run AC-7's grep; every remaining hit is a spec constant or the
      documented OQ-C site.
- [x] **Step 2** File the OQ-C follow-up issue (the `.btn-back` hover-border dark-theme
      mismatch) and link it from Non-goals — filed as **#839**.
- [x] **Step 3** `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean
      (plan doc staged first — merely written, the guard short-circuits and passes).
- [x] **Step 4** `npm run lint && npm run format:check` → clean.
- [x] **Step 5** Finalize execution status in the PR's own last commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | plan / grill gate | Every literal spelling of the `#0a4f5e` teal — **including the `rgba()` form the issue's hex-only grep structurally cannot see** | `grep -rn '#0a4f5e\|rgba(10, *79, *94\|rgba(14, *138, *168\|rgba(43, *184, *212' frontend/src` | 14 production sites — the issue's 13, **plus** `booking-dialog.ts:326` | 13 migrated; the 14th is a latent dark-theme defect, not a tokenisation candidate → OQ-C follow-up |
| 2026-08-30 | phase 3 | Widened once more to the **bare brand-teal hexes**, since the tint family is written three ways (`rgba(…)`, `#hex`, and Tailwind's `/opacity` modifier) and only the first two were swept | `grep -rn '#2bb8d4\|#0e8aa8' frontend/src/app` | 8 further production sites: `set-editor.html` ×5, `layout-editor.html`, `payout-statement.ts:105`, `app.html:312` | **Not migrated — deliberately.** All are the `/opacity` modifier form on the map/editor selection chrome: a different treatment, a different compile path (`color-mix()`), and the issue routes them to **#836** ("the app-wide literal residue this is one named sub-population of"). Recorded rather than silently absorbed |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 – AC-4:** Run `npm test -- accent-tokens.contrast` → PASS. Verified at commit `<sha>`.
- [x] **AC-5, AC-6:** Run `npm run test:e2e:a11y -- accent-token-inks` → PASS. Verified at commit `<sha>`.
- [x] **AC-7:** Run `grep -rn '#0a4f5e\|rgba(43, *184, *212\|rgba(14, *138, *168' frontend/src/app`
      → only spec constants + `booking-dialog.ts:326`. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A.
- [x] **Frontend** standards met: token-first styling, no `/opacity` on a token (R-3),
      every new token has its `@theme inline` row (R-4), marker classes retained.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
