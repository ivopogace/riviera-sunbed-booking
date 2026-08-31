# Operator Console Accent-Ink Token — Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Register `--riv-console-accent-ink` (`#0a6e85`, declared once) as the operator
console's accent ink and move the twelve plain `text-[#0a6e85]` positions across eight
`operator/` files onto its named utility, so the console's accent ink stops being a literal
and stops coinciding, unnamed, with two tokens that mean something else.

**Architecture:** The single decision is the ticket's A/B fork, and it is settled as **A —
its own token**, on mechanical grounds rather than taste. Tailwind's `@theme inline` (the
form this registry uses) makes `text-riv-pop-accent` emit `var(--riv-pop-accent)` and resolve
**at the point of use** — that is precisely what makes the porcelain subtree pinning work, and
it is also what would make Option B a permanent coupling: the console's ink would resolve
through the same variable the `[data-riv-theme]` blocks override for the popover family, so
retuning popover chrome would silently move console prices and payout figures. Angular supplies
the other half — under emulated encapsulation "global styles defined outside of a component may
still affect elements inside a component", so custom properties cross the component boundary and
**no framework-side scoping will separate the two roles; only naming will.** The token is declared
**once**, with no dark counterpart: all twelve sites live under `operator-console`, whose host pins
`data-riv-theme="porcelain"` ("Always porcelain" — `operator-console.ts:49`), so a dark branch
would be unreachable by construction — an unverifiable claim shipped as CSS, whose value
(`#7cd7e8`, borrowed from the popover family) has never been contrast-checked against any console
surface. This is the same call `--riv-solid-btn-*`, `--riv-form-error-*` and `--riv-solid-fill-*`
made, and it differs from T-1's reuse of the **themed** `--riv-error-ink` for a reason worth
writing down: that token also paints tourist surfaces, so its dark branch is reachable — just not
from the console.

**Persistence:** N/A — frontend-only styling slice, no schema, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue **#848** (T-2), cut from **#836** via
`docs/design/colour-literal-token-audit.md`. Re-enumerated against merged `main` `7539e5c`
(the ticket was re-cut against `0d9c7bf`; #859, #860 and #862 have landed since — see
*Open questions → Resolved*, OQ-C).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill caught
that the ticket's third AC is **stale**: it asks for a merge-time grep proving four
`bg-[#0a6e85]` fills survive, and #854/#860/#862 tokenised all four, so the tree contains none;
AC-3 below restates the non-overreach proof in the form that still exists. The grill also found
the red this slice actually owns — `shared/solid-fill-tokens.contrast.spec.ts`'s `SURVIVORS`
list asserts *positively* that these eight files still carry the literal) · `riviera-plan-doc`
(this template — its Behavior-parity ledger is what turns "byte-identical substitution" from a
claim into a per-position verdict across twelve sites and three painted-on surfaces) · `tdd`
(at the plan's named seams — and it is what made phase 2 honest: unlike T-1, this slice has a
**genuine red**, the `SURVIVORS` guard, so the phase order is driven by it rather than by a
staged one) · `riviera-review-overlay` (review gate — due at ready-for-review; RV-FE-E2E owns
the phase-4 spec's suite placement) · `riviera-docs-freshness` (**pending** — due at merge
close-out over `origin/main..HEAD`; the counting sweep matters here because this slice makes
the **fourth** declared-once token family, and the registry comment block names them) ·
`riviera-tailwind` (token-first styling: a new token gets its `@theme inline` row or the utility
silently never generates; the **named** utility once registered; "a theme-invariant token is a
decision to write down, never an omission", which is why the declaration carries its reason and
phase 2 adds the guard that can see a later dark override) · `riviera-frontend` (placement: the
registry is the two-place `tailwind.css` + `core/theme.ts` pair, and this slice needs **no**
`core/theme.ts` row — that registry carries only what the switcher UI lists, not tokens; the new
e2e goes in the CI-safe mocked suite) · `angular-developer` + angular-cli MCP (`list_projects` →
`styleLanguage: css`, so migrate-on-touch is moot; `search_documentation` + angular.dev's
*Styling components § Style scoping* supplied the Architecture section's second half — emulated
encapsulation does not scope custom properties, which is the mechanical case for Option A) ·
`playwright-cli` (phase 4 — a web-first `toHaveCSS` against a real render is the only thing that
separates a working token from a class whose utility was never generated) · `riviera-local-debug`
(cloud-session recipe: scoped Vitest runs, `PW_CHROMIUM_EXECUTABLE` for the mocked Playwright
suite — never `playwright install`)

**Branch:** `claude/sdlc-848-sj742n` — **cloud-session substitution** for
`feature/console-accent-ink-token`, per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

> No colour value moves in this slice, so the unit specs' job is *identity* (the token is what
> the specs think it is, and stays singly-declared) and the e2e's job is *plumbing* (the utility
> generated and resolves). The one genuine red is AC-3's guard.

- [ ] **AC-1:** Given `src/tailwind.css`, when `--riv-console-accent-ink` is looked up, then it
      is declared **exactly once**, in the `:root, [data-riv-theme='porcelain']` base block, with
      value `#0a6e85` — and no `[data-riv-theme]` block overrides it. The failure this discriminates
      is a later dark override, which would leave every contrast assertion in the tree still passing.
      *Seam:* `src/tailwind.css` read as text (the `core/theme-boot.spec.ts` drift-guard pattern,
      as `solid-btn-tokens.contrast.spec.ts` already applies it).
      *Pinned by:* `operator/console-accent-token.contrast.spec.ts` › `the token is declared exactly once, in the base block`
      and › `the declared value matches the test-side mirror`.
- [ ] **AC-2:** Given the porcelain surfaces the console accent ink lands on (the bare porcelain
      background stops — the worst case, since both the card glass and the `--riv-chip-bg` tint
      composite *lighter* than the darkest stop), when `#0a6e85` is painted on each, then every
      pair meets WCAG AA 4.5:1.
      *Seam:* the `CONSOLE_ACCENT_INK` constant exported by `src/testing/glass-tokens.ts` — the
      token registry's test-side mirror, not any component.
      *Pinned by:* the **six existing** operator `*.contrast.spec.ts` files that already assert this
      per tab (`set-editor`, `layout-editor`, `pricing-tab`, `payouts-tab`, `requests-tab`,
      `venue-tab`), now reading the value from the mirror. A seventh consolidated spec is
      deliberately **not** added — it would restate six passing assertions, which the Sonar
      duplication bar rejects and reuse-over-addition rejects anyway (T-1's OQ-E, same finding).
- [ ] **AC-3:** Given `shared/solid-fill-tokens.contrast.spec.ts`'s `SURVIVORS` list, when this
      slice removes the twelve literals, then the eight `#0a6e85`-ink rows are removed **with the
      migration, in the same phase**, and the remaining rows (`#0a5f74` inks/rings/gradient stops,
      `#a3160e` `/opacity` tints) still pass unchanged — the half that proves this sweep did not
      overreach into #852's or another slice's population.
      **This is the slice's genuine red:** those eight rows assert *positively* that these files
      still carry the literal, so the migration turns the spec red before the list is corrected.
      *Seam:* `shared/solid-fill-tokens.contrast.spec.ts`'s `SURVIVORS` table.
      *Pinned by:* `Solid fill token family (WCAG AA + theme invariance, #854)` › the survivors test.
      > **The ticket's own AC-3 is stale and this supersedes it.** It asks for a merge-time grep
      > proving the four `bg-[#0a6e85]` solid fills are still present; #854 (PR #860) tokenised
      > them and #861 (PR #862) merged the family onto one teal, so
      > `grep -rn 'bg-\[#0a6e85\]' frontend/src` returns **nothing** on `main` `7539e5c` and the
      > AC as written can never pass. `SURVIVORS` is where that non-overreach claim actually lives
      > today.
- [ ] **AC-4:** Given the six operator contrast specs that restate `#0a6e85` as a local constant
      or an inline literal, when each is read, then it imports the value from `glass-tokens.ts`
      rather than restating it — **in prose as well as in code**: no spec title, `describe` name or
      header comment still names the literal where it means the token. A title still naming the old
      literal was a review finding on #855 and applies identically here.
      *Seam:* `src/testing/glass-tokens.ts`'s export surface.
      *Pinned by:* the phase-3 verification grep, recorded in *Acceptance-criteria verification*.
      > Two uses of `#0a6e85` in these specs are **not** this token and must keep their own
      > constants: `payouts-tab.contrast.spec.ts`'s white-on-teal solid buttons (that is
      > `SOLID_FILL_BRAND`) and `app.contrast.spec.ts`'s popover accent (that is
      > `--riv-pop-accent`). Same value, three roles — the whole point of the slice.
- [ ] **AC-5:** Given a running app, when each migrated console surface is rendered, then its
      computed `color` equals `rgb(10, 110, 133)` and its class list carries
      `text-riv-console-accent-ink`. The error mode this catches is a token declared without its
      `@theme inline` row: the class stays in the markup, the paint silently does not change, and
      no unit spec can see it.
      *Seam:* the rendered operator console at `/operator/:venueId/**` (mocked e2e).
      *Pinned by:* `console-accent-ink.e2e.ts` › `the token is declared and its utility is generated`,
      › `the payouts owed figure resolves to the registered token value`,
      › `the pricing projected figure resolves to the registered token value`.
- [ ] **AC-6:** Given the document theme forced to `dark`, when a migrated console surface is
      rendered, then its ink **still** resolves `rgb(10, 110, 133)` — the subtree-pinning proof.
      *Seam:* the same rendered console, with `localStorage` seeded to the `dark` theme.
      *Pinned by:* `console-accent-ink.e2e.ts` › `the console keeps its porcelain accent ink under a dark document theme`.
      **Mutation-check required:** flipping the expected value to `rgb(124, 215, 232)` (the popover
      family's dark value, the ink this token would have inherited under Option B) must fail the
      test — so the assertion discriminates rather than passing vacuously.
- [ ] **AC-7:** Given `main` at merge time, when
      `grep -rn 'text-\[#0a6e85\]' frontend/src/app/operator` is run, then it returns nothing.
      Scoped to the migrated **form** and folder, not the value: `#0a6e85` legitimately survives as
      `--riv-solid-fill-brand`'s and `--riv-pop-accent`'s declared value, and as `app.html`'s
      popover accent.
      *Seam:* the working tree.
      *Pinned by:* the phase-5 verification command, recorded in *Acceptance-criteria verification*.
- [ ] **AC-8:** Given `docs/design/colour-literal-token-audit.md`, when a reader asks "is the
      `#0a6e85` operator family settled?", then the class-T row reads `done` with this PR, records
      **why Option A won**, and carries the corrected count (12 inks, not 16 — four were fills and
      left with #854).
      *Seam:* the ledger file.
      *Pinned by:* review (the ledger is prose; no test asserts it).

## Non-goals

- **The four `bg-[#0a6e85]` solid fills.** Already gone: #854 (PR #860) moved them to
  `--riv-solid-fill-*` and #861 (PR #862) merged the family onto one teal. Nothing to exclude.
- **Anything carrying an `/opacity` modifier** (`#0c2a33/·`, `#a3160e/·`, `#2bb8d4/·` in these
  same files) → **#852**. Tokenising those compiles to `color-mix()` and changes the computed
  value; this slice is byte-identical by construction and must stay so.
- **`--riv-pop-accent` and `--riv-accent-ink` are not retuned, renamed or widened.** Option B is
  rejected, not deferred.
- **The five plain `text-[#a3372a]` positions** — including the one sharing an expression with a
  migrated site at `payouts-tab.ts:135`. Different value, different role, no ledger row; see the
  Generalization-audit log.

## Behavior-parity ledger

> "Styling only" is not self-justifying. Every position is `text-[#0a6e85]` →
> `text-riv-console-accent-ink`, and `--riv-console-accent-ink` is `#0a6e85` in the base block
> with no override — so each is byte-identical **provided the host resolves the base block**.
> The right-hand column is that proviso checked per site, which is the only way this table earns
> its place: all twelve resolve through `operator-console`'s porcelain pin.

| # | Position | Painted-on surface | Verdict |
|---|---|---|---|
| 1 | `set-editor.html:254` — per-set saved notice | card glass (console pin) | preserved |
| 2 | `set-editor.html:481` — saved notice | card glass (console pin) | preserved |
| 3 | `payout-statement.ts:110` — statement net cell | card glass (console pin) | preserved |
| 4 | `layout-editor.html:372` — saved notice | card glass (console pin) | preserved |
| 5 | `requests-tab.html:118` — request price | card glass (console pin) | preserved |
| 6 | `pricing-tab.html:46` — per-row saved notice | card glass (console pin) | preserved |
| 7 | `pricing-tab.html:80` — projected take | card glass (console pin) | preserved |
| 8 | `payouts-tab.ts:135` — accrual row net class | card glass (console pin) | preserved |
| 9 | `venue-tab.html:129` — commission `<output>` | **`--riv-chip-bg` tint** over card glass | preserved — the chip tint composites *lighter* than the darkest bare stop AC-2 measures, so the existing proof still bounds it |
| 10 | `venue-tab.html:157` — saved `<output>` | card glass (console pin) | preserved |
| 11 | `payouts-tab.html:100` — owed figure (34px) | card glass (console pin) | preserved |
| 12 | `payouts-tab.html:268` — period owed cell | card glass (console pin) | preserved |

One **test-side** mirror moves with them: `payout-statement.spec.ts:26` asserts the
`netClass` string, so it changes from `'text-[#0a6e85]'` to `'text-riv-console-accent-ink'`
(preserved — it pins the class the component emits, and the component's output changed).

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | The `@theme inline` row is forgotten, so `text-riv-console-accent-ink` never generates: the class lands in the markup and the ink silently falls back to inherited `color`. No unit spec can see this. | Medium | High — twelve wrong inks in prod | AC-5's e2e asserts the utility's rule exists **and** the computed colour, against a real render |
| R-2 | A later slice adds a `[data-riv-theme='dark']` override for the token, and the console un-pins porcelain or a site is reused outside it — light teal on slate. | Low | High | AC-1's single-declaration guard fails on any second declaration; the reason is written at the declaration itself |
| R-3 | The sweep over-reaches into the `/opacity` forms (#852) or the surviving `#0a5f74`/`#a3160e` roles in the same files. | Medium — eight of these files are in #852's population | Medium | AC-3's `SURVIVORS` list asserts the survivors positively; the migration is a scoped `text-[#0a6e85]` replacement, never a value-wide one |
| R-4 | #852 starts concurrently and conflicts — eight files overlap. | Low (the ticket sequences #852 after this) | Medium | Sequencing recorded on #848; merge `main` before the PR |
| R-5 | A spec keeps `#0a6e85` where it means `--riv-solid-fill-brand` or `--riv-pop-accent`, and a later token change desynchronises it — or, worse, AC-4's sweep "fixes" it onto the wrong mirror. | Medium | Medium | AC-4 names both exceptions explicitly; phase 3 re-points only the six ink specs |
| R-6 | The e2e passes vacuously (the surface never renders, or `toHaveCSS` reads an unstyled node). | Low | Medium | AC-6's mutation-check against `rgb(124, 215, 232)`, recorded in the verification section |

## Open questions / Assumptions

### Resolved

- **OQ-A — the ticket's A/B fork: a console-accent token, or widen `--riv-pop-accent`?**
  **Resolved: Option A**, escalated to the maintainer (the ticket is `ready-for-human`) and
  settled on their instruction to ground it in the Angular and Tailwind documentation. The
  deciding facts are mechanical, not stylistic: (1) Tailwind's `@theme inline` — "the utility
  class will use the theme variable *value* instead of referencing the actual theme variable" —
  is what makes a token resolve at the point of use, so under Option B the console's ink would
  resolve through the variable the popover family's `[data-riv-theme]` blocks override, and
  popover retuning would move console prices and payout figures; (2) angular.dev *Styling
  components § Style scoping* — "global styles defined outside of a component may still affect
  elements inside a component with emulated encapsulation" — so no framework-side scoping keeps
  the roles apart and naming is the only separator. Corroborated in-repo: `--riv-pop-accent` has
  exactly **one** ink consumer today (`app.html:204`), and #854/#861 already refused the same
  token as a *fill* on the same class-R reasoning. Recorded in the ledger's T-2 row (AC-8).
- **OQ-B — should the new token theme, or be declared once?**
  **Resolved: declared once, theme-invariant.** Tailwind's documented multi-theme pattern
  declares a per-scope override only where the value varies, so a base-block-only token is
  well-formed. All twelve sites resolve under `operator-console`'s porcelain pin, so a dark
  branch is unreachable by construction — note that **the e2e cannot distinguish the two
  options**, since a themed token also resolves `#0a6e85` inside a pinned subtree, which is
  exactly why a dark value here would be an unverifiable claim. `#7cd7e8` has never been
  contrast-checked against any console surface. Consistent with `--riv-solid-btn-*`,
  `--riv-form-error-*` and `--riv-solid-fill-*`; distinguished from T-1's reuse of the themed
  `--riv-error-ink`, whose dark branch *is* reachable from tourist surfaces.
- **OQ-C — is the ticket current against `main`?** **No, in one place.** It was re-cut against
  `0d9c7bf`; `main` is `7539e5c`, with #859, #860 and #862 landed. Its AC-3 (a merge-time grep
  proving four `bg-[#0a6e85]` fills survive) can never pass — those fills are now
  `bg-riv-solid-fill-brand`. AC-3 above restates the non-overreach proof against `SURVIVORS`,
  which is where it actually lives. The twelve-site `text-` population is otherwise unchanged;
  re-verified by grep at `7539e5c`.
- **OQ-D — does the new token need a `core/theme.ts` registry row?** **No.** That registry
  "only carries what the switcher UI needs" (`theme.ts:8`); tokens live in `tailwind.css`. The
  two-place rule in `riviera-frontend` is about *palette* changes across themes, and this token
  has one declaration.

### Open

*(none — both forks closed above; AC-8's ledger wording is the only remaining judgement and is a
review-gate item, not a blocker.)*

## Availability & concurrency (invariant #2)

**N/A — no booking, availability, or beach-map *state* is touched.** The slice edits static
`class` attributes in operator templates and one class-name string in a `.ts`; `layout-editor`
and `set-editor` appear only as *files*, and only in their saved-notice markup. No reservation
path, no `availability` row, no concurrency surface.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend Java, no module boundary, no event, no `api/` or `spi/`
port. Invariant #11 untouched.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves.** Payout *figures* are recoloured (`payouts-tab`, `payout-statement`),
but nothing reads, computes or renders a different amount: the ledger, commission arithmetic and
Stripe surfaces are untouched. Invariant #5's integer-minor-units rule is not in play — no
arithmetic changes.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | global stylesheet | — (CSS custom property + `@theme inline` row) | — |
| FE-2 | `src/testing/glass-tokens.ts` | existing | test-side token mirror | — | — |
| FE-3 | the eight `operator/` templates + `.ts` class strings | existing | standalone components | unchanged | unchanged |
| FE-4 | `operator/console-accent-token.contrast.spec.ts` | **new** | Vitest unit spec | — | — |
| FE-5 | `e2e/console-accent-ink.e2e.ts` | **new** | mocked Playwright spec | — | — |

**Standards:** no Angular API is touched — every edit is a static `class` attribute in a
template, or a class-name string literal in an inline template / a computed row object. No
component, signal, form, control-flow or DI surface changes, so the v22 posture is a no-op here.

## FE↔BE contract

**N/A — no contract change.** No endpoint, DTO, or wire shape is touched.

## Execution status

**Stage pointer:** `plan — authored, awaiting phase 0`

**Next action:** commit this plan doc on `claude/sdlc-848-sj742n`, then run phase 0.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Register the token + the test-side mirror | | |
| 1 — Declaration + identity guard spec | | |
| 2 — Migrate the twelve sites (drives AC-3's red green) | | |
| 3 — Re-point the six contrast specs onto the mirror | | |
| 4 — Mocked e2e computed-colour proof | | |
| 5 — Ledger row + verification sweep | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

- `docs/plans/console-accent-ink-token.md` — this plan.
- `docs/design/colour-literal-token-audit.md` — the T-2 row to `done` with the Option-A reason.
- `frontend/src/tailwind.css` — the token declaration (base block, with its reason) + the
  `@theme inline` row that generates the utility.
- `frontend/src/testing/glass-tokens.ts` — the `CONSOLE_ACCENT_INK` mirror.
- `frontend/src/app/operator/console-accent-token.contrast.spec.ts` — **new**: the
  single-declaration + identity guard.
- `frontend/src/app/operator/{set-editor,layout-editor,requests-tab,pricing-tab,venue-tab,payouts-tab}.html`
  — the migrated `class` attributes.
- `frontend/src/app/operator/{payouts-tab,payout-statement}.ts` — the migrated class strings.
- `frontend/src/app/operator/payout-statement.spec.ts` — the `netClass` expectation.
- `frontend/src/app/operator/{set-editor,layout-editor,pricing-tab,venue-tab,requests-tab,payouts-tab}.contrast.spec.ts`
  — read the mirror instead of restating the literal, prose included.
- `frontend/src/app/shared/solid-fill-tokens.contrast.spec.ts` — the eight `#0a6e85` ink rows
  leave `SURVIVORS`.
- `frontend/e2e/console-accent-ink.e2e.ts` — **new**: the computed-colour + dark-theme proof.

---

## Phase 0 — Register the token + the test-side mirror

**Files:** Modify `frontend/src/tailwind.css` · Modify `frontend/src/testing/glass-tokens.ts`

- [ ] **Step 1:** Declare `--riv-console-accent-ink: #0a6e85;` in the `:root, [data-riv-theme='porcelain']`
      base block, beside the other declared-once families, with a comment carrying: the role, the
      porcelain-pin reason it does not theme, why `--riv-pop-accent` and `--riv-solid-fill-brand`
      are not the answer despite the identical value, the guard that protects it, and
      `Rationale: docs/plans/console-accent-ink-token.md, issue #848`.
- [ ] **Step 2:** Add `--color-riv-console-accent-ink: var(--riv-console-accent-ink);` to the
      `@theme inline` block — without it the utility never generates (R-1).
- [ ] **Step 3:** Export `CONSOLE_ACCENT_INK` from `glass-tokens.ts` with a doc comment
      distinguishing it from `SOLID_FILL_BRAND` (same value, fill role) and `DARK_POP_ACCENT`.
- [ ] **Step 4:** No `core/theme.ts` row (OQ-D).

## Phase 1 — Declaration + identity guard spec

**Files:** Create `frontend/src/app/operator/console-accent-token.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — assert `--riv-console-accent-ink` is declared exactly
      once, that the sole declaration is in the base block, and that its value equals
      `CONSOLE_ACCENT_INK`. Follow `solid-btn-tokens.contrast.spec.ts`'s `declarationsOf` /
      base-block-assertion pattern rather than re-implementing it.
- [ ] **Step 2: Verify it fails first** by temporarily adding a dark override — the guard must go
      red on it, then green when removed. Record the mutation in *Acceptance-criteria verification*.
- [ ] **Step 3:** `npx vitest run src/app/operator/console-accent-token.contrast.spec.ts`

## Phase 2 — Migrate the twelve sites

**Files:** the eight `operator/` files · `payout-statement.spec.ts` ·
`shared/solid-fill-tokens.contrast.spec.ts`

- [ ] **Step 1:** Replace `text-[#0a6e85]` with `text-riv-console-accent-ink` at the twelve
      positions **only** — never a value-wide replace (R-3). Leave every `/opacity` form,
      `#0a5f74`, `#a3160e` and `#a3372a` untouched.
- [ ] **Step 2:** Update `payout-statement.spec.ts:26`'s expected `netClass`.
- [ ] **Step 3: Watch AC-3 go red** — `SURVIVORS` asserts these eight files still carry the
      literal. Run `npx vitest run src/app/shared/solid-fill-tokens.contrast.spec.ts` and record
      the failure before fixing it; this is the slice's one genuine red.
- [ ] **Step 4:** Remove the eight `#0a6e85` ink rows from `SURVIVORS`, leaving a comment that
      #848 tokenised them (so a later reader does not read the shrunk list as #854 having
      over-reached). Leave the `#0a5f74` and `#a3160e` rows untouched. Re-run → green.

## Phase 3 — Re-point the six contrast specs onto the mirror

**Files:** the six `operator/*.contrast.spec.ts`

- [ ] **Step 1:** Replace each local `TEAL` / `ACCENT_TEAL` constant and inline `'#0a6e85'` with
      `rgbToHex(CONSOLE_ACCENT_INK)` from the mirror.
- [ ] **Step 2:** Purge the literal from **prose** too — `it(...)` titles and header comments that
      name `#0a6e85` where they mean the token (the #855 review finding, AC-4).
- [ ] **Step 3:** Leave `payouts-tab.contrast.spec.ts`'s white-on-teal solid-button assertion on
      `SOLID_FILL_BRAND` and `app.contrast.spec.ts`'s popover assertion alone (R-5).
- [ ] **Step 4:** `npx vitest run src/app/operator` → green.

## Phase 4 — Mocked e2e computed-colour proof

**Files:** Create `frontend/e2e/console-accent-ink.e2e.ts`

- [ ] **Step 1:** Mirror `operator-error-ink.e2e.ts`: the declared-value + utility-generated test,
      then two migrated surfaces via existing test ids (`payout-owed`, `pricing-projected`), then
      the forced-`dark` document theme test.
- [ ] **Step 2:** Two tabs are driven deliberately — the tabs are separately lazy-loaded, so one
      passing is not evidence about the other. Unlike T-1 there is one host, since all twelve sites
      are console children; the plan says so rather than driving `operator-home`, which carries none.
- [ ] **Step 3: Mutation-check** — flip the expectation to `rgb(124, 215, 232)`; both the plain and
      the dark-theme test must fail. Record it (AC-6).
- [ ] **Step 4:** `npx playwright test e2e/console-accent-ink.e2e.ts` with the
      `riviera-local-debug` chromium recipe.

## Phase 5 — Ledger row + verification sweep

**Files:** `docs/design/colour-literal-token-audit.md` · this plan

- [ ] **Step 1:** Update the class-T `#0a6e85` row to `done — #848, PR #NN`, correct `n` 16 → 12
      with the reason, and record **why Option A won** (AC-8).
- [ ] **Step 2:** Add #848 to the ledger header's "prior slices" list.
- [ ] **Step 3:** Run the AC verification commands and fill *Acceptance-criteria verification*.
- [ ] **Step 4:** `node scripts/check-plan-file-structure.mjs --diff origin/main` with this doc
      **staged** — unstaged, the guard short-circuits and passes whatever this section says.

## Generalization-audit log

> Population enumerated by **mechanism**, not resemblance: "a plain (non-`/opacity`) colour
> literal in a `text-` position inside a porcelain-pinned operator surface, whose value equals or
> neighbours a registered token".

| # | Search that found the population | Finding | Decision |
|---|---|---|---|
| G-1 | `grep -rn 'text-\[#a3372a\]' frontend/src` → **5 hits** (`shared/failure-panel.ts`, `operator/payouts-tab.ts:135`, `operator/payouts-tab.html:236`, `operator/daily-view-tab.html:355`, `booking/booking-pay.ts:210`) | The refund-red **plain ink** form has no ledger row and no issue: the ledger covers `#a3372a` only as the outline-button danger ink (class F, done #851) and as `/opacity` tints (class O, open #852). One of the five shares an expression with a migrated site. | **Out of scope** — different value, different role, and folding it in would make this a two-family slice. File a follow-up issue at close-out and add the family to the ledger. |
| G-2 | `grep -rn 'text-\[#0a6e85\]' frontend/src` at `7539e5c` → 13 hits (12 source + 1 spec mirror) | The population is exactly the ticket's, plus `payout-statement.spec.ts`'s `netClass` expectation the ticket does not mention. | In scope — the spec mirror moves with the component (Behavior-parity ledger). |
| G-3 | `grep -rn '0a6e85' frontend/src` → the `SURVIVORS` list and six contrast specs | The literal is asserted in **eight** places beyond the twelve sites, two of which mean a *different* token. | In scope, split per AC-3/AC-4/R-5. |

## Acceptance-criteria verification (final)

*(filled at phase 5 — each AC's command/test and its result)*

## Self-review checklist (before merge / PR)

- [ ] Every AC has a named, passing test (or a recorded reason it is review-verified).
- [ ] AC-3's red was **observed before** it was fixed, and the observation is recorded.
- [ ] AC-6's mutation-check was run and recorded.
- [ ] `grep -rn 'text-\[#0a6e85\]' frontend/src/app/operator` is empty; the `/opacity`,
      `#0a5f74`, `#a3160e` and `#a3372a` forms in those files are untouched.
- [ ] No spec names `#0a6e85` in prose where it means the token; the two non-token uses keep theirs.
- [ ] `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e:a11y` green.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` green **with this doc staged**.
- [ ] Ledger T-2 row `done` with the PR and the Option-A reason.
- [ ] Execution status finalized, Open Questions empty, `merged via PR #NN` recorded.
- [ ] G-1's follow-up issue filed.
