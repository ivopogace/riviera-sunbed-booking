# Operator Console Negative-Ink Token — Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Register `--riv-console-negative-ink` (`#a3372a`, declared once) as the operator
console's negative ink and move the three plain `text-[#a3372a]` positions under
`frontend/src/app/operator/` onto its named utility, leaving the `/opacity` tints on the same
element (#852's) and the outline button's `--riv-solid-btn-danger-ink` (#851's) untouched.

**Architecture:** The ticket's two open questions are settled here. **(1) Name and family:**
the token joins `--riv-console-accent-ink` as a two-member `--riv-console-*-ink` **naming**
family — same host (the porcelain-pinned `operator-console`), same surface (card glass), same
theme-invariance ground — but *not* a shared declaration and *not* a shared guard: each token
is declared once, and each needs its own role-distinctness argument (`#0a6e85` has three roles,
`#a3372a` has the button ink plus the `/opacity` tint half). The pole word is **`negative`,
deliberately not `danger`**: `danger` is already the outline button's word in
`--riv-solid-btn-danger-ink` — the exact token this ticket refuses to widen — and `--riv-danger-*`
/`--riv-error-ink` are the tourist-side alert families, so naming this one `danger` would leave
the two confusable roles one hyphen apart and rebuild the confusion the ticket exists to prevent.
`negative` names what the three sites actually share: a negative *outcome* — a reversed accrual,
a refused check-in, a reversal's reason. The readability test the ticket names is
`payouts-tab.ts:135`, which becomes
`reversal ? 'text-riv-console-negative-ink' : 'text-riv-console-accent-ink'` — one axis, two poles.
**(2) Why not the coincidental token:** `#a3372a` already equals `--riv-solid-btn-danger-ink`
and that token is even theme-invariant, so on a porcelain-pinned host the substitution would
resolve correctly and look free. It is not: `@theme inline` resolves a utility **at the point of
use**, so these console inks would run through the variable the outline-button skin owns, and
Angular's emulated encapsulation gives no scoping that would keep the two apart — the identical
fork #848 settled, whose answer is precedent to follow rather than re-derive. Declared **once**,
no dark override: all three consumers are children of `operator-console`, whose host pins
porcelain, so a dark branch is unreachable by construction and a dark value would be an
unverifiable claim — which is why the single-declaration guard, the only thing able to see a
later override, is a first-class deliverable rather than a nicety.

**Persistence:** N/A — frontend-only styling slice, no schema, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue **#864** (class **R**), cut from **#836** via
`docs/design/colour-literal-token-audit.md`, and re-cut by **#865** so that the two
inks-over-their-own-fixed-fill positions (`shared/failure-panel.ts:27`, `booking/booking-pay.ts:210`)
belong to **#858**. Re-enumerated against merged `main` `47744b1`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the three
consequences the ticket does not list: `solid-btn-tokens.contrast.spec.ts`'s `OUT_OF_FAMILY`
guard breaks the moment two of its five files stop painting the literal, `payout-statement.spec.ts`
carries `text-[#a3372a]` as a fixture, and the ticket's "independent of #858 — no shared files"
claim is wrong, since #858 edits the same guard array) · `riviera-plan-doc` (this template — forced
the behavior-parity ledger that pinned "computed colour identical before and after" as a claim to
verify, not assume) · `tdd` (guard-spec-first at the four named seams; each phase red before green)
· `riviera-review-overlay` (review gate — RV-FE-E2E placed the render proof in the CI-run mocked
suite; ran at ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main..HEAD` at phase 3 — **0 findings**: nothing
was renamed, and the counting sweep's only live candidate, `riviera-tailwind`'s "#848 adds a third
ground", counts *grounds* for theme-invariance, not instances of one, so a second member of that
ground falsifies nothing) · `riviera-tailwind` (token-first styling: a new token is one
base-block declaration + one `@theme inline` row consumed through its named utility, and a
theme-invariant token is a decision written at the declaration, never an omission) ·
`riviera-frontend` (placement: the token registry is `tailwind.css`, the mirror is
`src/testing/glass-tokens.ts`, and the console's porcelain subtree pin is host-level, never the
document attribute) · `angular-developer` + `frontend/.claude/CLAUDE.md` (class bindings over
`ngClass`; the ternary at `payouts-tab.ts:135` stays a computed string) · `playwright-cli`
(mocked-suite spec authored to best practice: test-id locators, web-first `toHaveCSS`, per-test
route overrides, no fixed sleeps) · `riviera-local-debug` (scoped Vitest + the
`PW_CHROMIUM_EXECUTABLE` recipe for the cloud session's pre-installed Chromium).

**Branch:** `claude/sdlc-864-xidldv` — the cloud session's designated remote branch **stands in
for** `feature/console-negative-ink-token` (`riviera-sdlc` §Remote/cloud addendum). Cut from
`main` at `47744b1`; the literal `feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms**, never the Angular button, the Stripe
> redirect, or the HTTP status alone.
>
> **These ACs ARE the pre-agreed seams — `tdd` writes no test at an unconfirmed seam.**

- [ ] **AC-1:** Given `src/tailwind.css` as the token registry, when the stylesheet is read as
      text, then `--riv-console-negative-ink` is declared **exactly once**, in the base
      `:root, [data-riv-theme='porcelain']` block, with the value the test mirror carries, and a
      `--color-riv-console-negative-ink: var(--riv-console-negative-ink);` row exists in
      `@theme inline`. *Seam:* `src/tailwind.css` read as text (the `core/theme-boot.spec.ts`
      drift-guard pattern) · *Pinned by:*
      `operator/console-negative-token.contrast.spec.ts` — "declares the token exactly once",
      "declares the token in the base block", "declares the value this test mirror carries",
      "maps the token in `@theme inline`".
- [ ] **AC-2:** Given the porcelain background stops the console renders over, when
      `#a3372a` is measured against each raw stop, then every ratio clears WCAG AA for normal
      text (worst case `#cfeaf2`, 5.32:1). *Seam:* `src/testing/contrast.ts`'s `contrastRatio`
      over `PORCELAIN_STOPS` · *Pinned by:*
      `operator/console-negative-token.contrast.spec.ts` — "clears AA over every porcelain stop
      the console paints it on".
- [ ] **AC-3:** Given the reversal reason chip's own `#a3372a`@0.12 tint composited over the
      card glass over each porcelain stop — the **lowest**-contrast pair of the three sites, and
      lower than any raw stop, so AC-2 does not cover it — when the ink is measured against it,
      then every ratio clears AA (worst case 5.05:1), and the constant is read from
      `src/testing/glass-tokens.ts` rather than restated as a literal. *Seam:* `composite` +
      `surfaceOver` over `PORCELAIN_CARD_GLASS` · *Pinned by:*
      `operator/payouts-tab.contrast.spec.ts` — "the reason-chip text
      (`--riv-console-negative-ink`) meets AA over its own @0.12 tint on the card glass".
- [ ] **AC-4:** Given every `.ts`/`.html` source under `frontend/src/app/operator/`, when swept
      for the **plain ink role** `text-[#a3372a]` (matched by role, never by bare value — a value
      sweep would demand the `/opacity` tints change too), then no file matches. *Seam:* the
      `operator/` source tree read from disk · *Pinned by:*
      `operator/console-negative-token.contrast.spec.ts` — "leaves no console file painting the
      ink as a literal".
- [ ] **AC-5:** Given `operator/payouts-tab.html`'s reversal reason chip, when the same sweep
      runs, then `border-[#a3372a]/28` and `bg-[#a3372a]/12` are **still present** — the positive
      half proving the migration did not overreach into #852. *Seam:* `payouts-tab.html` read from
      disk · *Pinned by:* `operator/console-negative-token.contrast.spec.ts` — "leaves #852's
      `/opacity` tints on the reason chip untouched".
- [ ] **AC-6:** Given `--riv-solid-btn-danger-ink` carries the identical value in a different
      role, when both tokens are read from the stylesheet, then the two values are equal **and**
      each is a separate single declaration — the coincidence asserted rather than left to luck,
      and the button token neither widened nor renamed. *Seam:* `src/tailwind.css` read as text
      · *Pinned by:* `operator/console-negative-token.contrast.spec.ts` — "shares a value with the
      outline button's danger ink while staying a separate declaration".
- [ ] **AC-7:** Given the two themed reds a reviewer might reach for instead
      (`--riv-error-ink`/`--riv-danger-ink`, both resolving `#ffa9a1` in dark), when measured over
      the console's card glass, then every ratio is **below** AA (worst 1.84:1) — the reason this
      role cannot take a themed token, kept in the tree so the decision survives. *Seam:*
      `contrastRatio` over `PORCELAIN_CARD_GLASS` · *Pinned by:*
      `operator/console-negative-token.contrast.spec.ts` — "stays theme-invariant: the themed reds
      would not clear AA on the console's own surface".
- [ ] **AC-8:** Given a rendered payouts tab whose ledger carries a REVERSAL row, when the net
      cell is read, then it carries the `text-riv-console-negative-ink` class **and** its computed
      `color` is `rgb(163, 55, 42)` — the one failure no unit spec can see, a utility consumed
      without its `@theme inline` row ever generating it. *Seam:* the rendered
      `/operator/1/payouts` route, `[data-testid="ledger-net"]` · *Pinned by:*
      `e2e/console-negative-ink.e2e.ts` — "the reversal net resolves to the registered token value".
- [ ] **AC-9:** Given a **forced `dark` document theme**, when the same payouts net and the
      daily-view check-in error notice are read, then `html[data-riv-theme="dark"]` holds and both
      still compute `rgb(163, 55, 42)` — the subtree-pinning proof. Mutation-checked: adding a dark
      override for the token must turn this red. *Seam:* the rendered console routes under
      `localStorage['riviera-theme'] = 'dark'` · *Pinned by:* `e2e/console-negative-ink.e2e.ts` —
      "the console keeps its porcelain negative ink under a dark document theme".
- [ ] **AC-10:** Given `booking/solid-btn-tokens.contrast.spec.ts`'s `OUT_OF_FAMILY` guard, which
      today asserts all **five** listed files still paint `#a3372a`, when this slice removes the
      literal from two of them, then the array is narrowed to the three files that still paint it
      and the guard passes — the downstream consequence the ticket does not list. *Seam:* the
      `OUT_OF_FAMILY` file list read from disk · *Pinned by:*
      `booking/solid-btn-tokens.contrast.spec.ts` — "leaves the out-of-family #a3372a sites
      untouched".
- [ ] **AC-11:** Given `docs/design/colour-literal-token-audit.md`'s class-R row, when the PR is
      read, then the row's status is `done — #864, PR #NN` and its "Why not that token" cell
      records the settled name/family answer. *Seam:* the ledger document · *Pinned by:* review-gate
      inspection (a documentation AC; no automated test claims it).

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **The `/opacity` `#a3372a` tints** — `border-[#a3372a]/28` and `bg-[#a3372a]/12` on
  `payouts-tab.html:236`, and the tint population in `daily-view-tab`. They are **#852's**, and
  AC-5 asserts they survive this PR rather than trusting it.
- **`--riv-solid-btn-danger-ink` and its own sites** — not widened, not renamed, not repointed.
  `e2e/solid-btn-token-skin.e2e.ts`'s `'--riv-solid-btn-danger-ink': '#a3372a'` pin stays as-is.
- **The two class-F `#a3372a` inks over their own fixed fills** (`shared/failure-panel.ts:27`,
  `booking/booking-pay.ts:210`) — **#858's** since the #865 re-cut.
- **`daily-view-tab.html:355`'s `ok` branch** (`text-riv-accent-ink`). It is the *themed*
  `--riv-accent-ink` (`#085a6e`) — a different value in a different family, resolving porcelain
  here. Whether the console's positive notice should read `--riv-console-accent-ink` instead is a
  real question and not this ticket's; noted, not changed.
- **`operator/set-editor.contrast.spec.ts:29`'s cross-reference comment** ("the payouts refund-red
  is `#a3372a`"). It states a *value*, which stays true, in a file this diff otherwise never opens;
  rewriting it would be widening. The AC's "constant pinning `#a3372a`" clause does not reach it —
  the file has no such constant.
- **`daily-view-tab.contrast.spec.ts`** — its header never enumerated this ink, so nothing there
  goes stale. The daily-view site's AA is proven by AC-2's stop loop in the token's own guard.
- **Any visual change.** `--riv-console-negative-ink` **is** `#a3372a`; every computed colour is
  identical before and after (see the Behavior-parity ledger).

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface.** A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified**.

The slice replaces a **literal** with a **token utility** at three positions. Nothing is retired,
but the "no behavior change" claim is exactly the kind this ledger exists to distrust — the
substitution has one silent failure mode (a utility whose `@theme inline` row was never written
lands in the markup and `color` quietly keeps its inherited value), which is why every row below
names how it is *verified* rather than assumed.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Reversal net renders `#a3372a` on the payouts card glass | **preserved** | `text-riv-console-negative-ink` → `var(--riv-console-negative-ink)` = `#a3372a`. Verified as a *computed* colour, not a class list: AC-8 |
| Reason chip renders `#a3372a` text on its own `@0.12` tint | **preserved** | Same utility; the chip's `border`/`bg` `/opacity` positions are untouched (AC-5), so the composite is byte-identical |
| Check-in error notice renders `#a3372a` on the arrivals card glass | **preserved** | Same utility, same host (`appCardGlass` under the porcelain-pinned console). Verified under a forced dark theme too: AC-9 |
| Check-in `ok` notice renders `--riv-accent-ink` | **preserved, untouched** | Not this ticket's branch — the ternary's other arm is edited only in its negative half |
| `payouts-tab.ts`'s `netClass` is a plain string chosen by `reversal` | **preserved** | Still one computed string, one ternary; only the truthy arm's value changes |
| `PayoutStatement` receives `netClass` verbatim from its `rows` input | **preserved** | The component never parses the class; its spec fixture is updated to the token utility so the fixture keeps mirroring what the producer emits |
| `OUT_OF_FAMILY` asserts five files still paint `#a3372a` | **changed** | Narrowed to the three that still do. The guard's *claim* (this family did not overreach) is preserved exactly; only its population moved, because this slice legitimately migrated two of the five |

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A value-blind `#a3372a` sweep migrates the reason chip's `/opacity` tints too, silently doing #852's work and breaking its slice | med | med | Match **by role** (`/text-\[#a3372a\]/i`), the pattern #850 established and #848 reused; AC-5 asserts the two tints positively, so an overreach fails a test rather than reaching review | agent | open |
| R-2 | The `@theme inline` row is forgotten: `text-riv-console-negative-ink` lands in the markup, never generates, and `color` silently inherits — invisible to every unit spec and to a class-list assertion | med | high | AC-1 asserts the row as text (a unit test *names* the missing line); AC-8/AC-9 assert the resolved computed colour in a real render | agent | open |
| R-3 | A later slice adds a dark override for the token; nothing notices, because inside the porcelain-pinned subtree every ratio still passes and no render can tell a themed token from an unthemed one | low | high | The single-declaration guard (AC-1) is the only thing able to see it, and the reason is written at the declaration; AC-7 keeps the "why not a themed red" measurement in the tree | agent | open |
| R-4 | `booking/solid-btn-tokens.contrast.spec.ts` goes red on the phase-1 push — its `OUT_OF_FAMILY` guard asserts five files still paint the literal, and two stop | **high** | med | Found by the intake grill, not by CI: AC-10 makes the narrowing part of phase 1's own red→green, so the guard never sees a broken intermediate | agent | open |
| R-5 | `operator/payout-statement.spec.ts`'s `netClass: 'text-[#a3372a]'` fixture drifts from what `payouts-tab.ts` now emits — the spec keeps passing while mirroring a string nothing produces | **high** | low | Found by the intake grill; updated in the same phase as the producer (phase 1) | agent | open |
| R-6 | Merge conflict with **#858**, which edits the same `OUT_OF_FAMILY` array (removing `shared/failure-panel.ts` and `booking/booking-pay.ts`) — the ticket's "independent of #858: no shared files" is wrong | med | low | No PR is open for #858 today, so the collision is not live. **Whichever merges second re-narrows the array** and re-runs the guard; this plan leaves the array one entry per line so the second edit is a clean deletion, not a rewrite | agent | open |
| R-7 | The dark-theme e2e passes **vacuously** — the token is declared once, so it could not resolve differently even if the pin failed, and the test would stay green against a broken pin | med | med | Stated honestly in the spec's header (what it does and does not prove, mirroring `console-accent-ink.e2e.ts`), and **mutation-checked**: a temporary dark override must turn AC-9 red before the spec is trusted; the log records the run | agent | open |
| R-8 | Naming the token `--riv-console-danger-ink` would sit one hyphen from `--riv-solid-btn-danger-ink`, the token this slice exists to *not* widen | low | med | Settled at plan time: the pole word is `negative`, and the reason is recorded at the declaration and in the ledger's class-R row | agent | **closed** — decided in *Architecture* |
| R-9 | Invariant #5/#9 blast radius: `payouts-tab.ts` is edited, and it renders payout money | low | high | The edit changes **one class string** in the `netClass` ternary. No money arithmetic, no sign, no currency, no ledger call is touched — `money()`, `sign`, `netMinor` are untouched lines, and the server's `netOwedMinor` is still rendered as-is | agent | open |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

*(none open — both of the ticket's questions were the slice's own to settle, and both are
resolved below rather than parked.)*

### Resolved

- **Open question (issue #864, Q1): does the console's refund-red belong with
  `--riv-console-accent-ink` as a family, or as a second standalone token?** — **Resolved at plan
  time: a family in *naming*, not in declaration or guard.** They share a host (the porcelain-pinned
  `operator-console`), a surface (card glass) and a theme-invariance ground, and the
  `payouts-tab.ts:135` ternary reads as one axis with two poles only if they are named as a pair.
  They do **not** share a declaration (each is declared once — that is the whole guard) nor a guard
  spec: the accent token's distinctness argument is about `#0a6e85`'s three roles, this one's is
  about the button ink plus #852's tint half, and merging them would produce one file with two
  unrelated halves. *Recorded in:* the `tailwind.css` declaration + the ledger's class-R row.
- **Open question (issue #864, Q2): what name reads naturally beside the accent token at
  `payouts-tab.ts:135`?** — **Resolved: `--riv-console-negative-ink`.** `danger` is rejected on
  collision grounds (see *Architecture*), not taste. *Recorded in:* the same two places.
- **Assumption, verified: all three sites sit on the porcelain card glass.** Checked, not assumed —
  `payouts-tab.html`'s ledger table and `daily-view-tab.html`'s Arrivals section are both
  `appCardGlass` hosts under `operator-console`'s porcelain pin. This is what makes AC-2's stop
  loop cover the daily-view site without a second per-tab spec.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes three CSS class strings and adds one CSS
custom property; no booking, beach-map, or `availability(set_id, booking_date)` write path is
reachable from any file in the diff, and no server code is touched at all.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in the diff; no module, `api/` port, or event changes.

### Module ownership (§4a)

N/A — frontend-only; no backend behavior is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `payouts-tab.ts` is edited, but only the `netClass` ternary's truthy
arm: no amount, sign, currency, commission, or ledger call changes, and the "Owed to you" figure
is still the server's `netOwedMinor` rendered as-is (invariant #9). Recorded as R-9 because the
file's *name* invites a money review that its diff does not warrant.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | token registry | — (CSS custom property + `@theme inline` row) | — |
| FE-2 | `operator/payouts-tab.ts` | existing | standalone component | `computed()` `rows` — one ternary arm re-pointed | — |
| FE-3 | `operator/payouts-tab.html` | existing | template | class binding `[class]="row.netClass"`; static class on the reason chip | — |
| FE-4 | `operator/daily-view-tab.html` | existing | template | `[class]` ternary on the check-in `<output>` | — |
| FE-5 | `src/testing/glass-tokens.ts` | existing | test mirror | — | — |
| FE-6 | `operator/console-negative-token.contrast.spec.ts` | **new** | unit spec (declaration guard) | — | — |
| FE-7 | `e2e/console-negative-ink.e2e.ts` | **new** | mocked-suite Playwright spec | — | — |

**Standards:** class bindings, never `ngClass`; the token is consumed through its **named
utility** (`text-riv-console-negative-ink`), never a raw `var(--riv-*)` — `riviera-tailwind`'s
token-first rule. No component branches on `data-riv-theme`; the console's porcelain pin is
host-level and untouched. One `data-testid="ledger-net"` is added to the ledger's net cell
(the e2e's only stable locator — the cell has none today).

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or wire shape is touched.

## Execution status

> **This section is the session-recovery anchor.** Update it in the SAME commit window as the
> change it records, at every phase boundary and SDLC stage transition.

**Stage pointer:** `PR — marking ready for review; review gate due`

**Next action:** Mark PR #866 ready for review, then run the review gate per `riviera-sdlc`
`references/pr-gates.md` §1, followed by the Sonar gate. Finalize this section, the AC-verification
table and the self-review checklist in this PR's last commit before merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Register the token, its mirror, and its declaration guard | ✅ | `56e1fd8` |
| 1 — Migrate the three sites and reconcile the downstream guards | ✅ | `ba07e59` |
| 2 — Prove the render and the porcelain pin (mocked e2e) | ✅ | `5f9443d` |
| 3 — Ledger class-R row + close-out | ⏳ | `<phase-3>` — row landed; close-out finalizes pre-merge |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

> Every path in the diff, including the one-line ones — machine-checked by
> `node scripts/check-plan-file-structure.mjs --diff origin/main`.

- `docs/plans/console-negative-ink-token.md` — this plan.
- `docs/design/colour-literal-token-audit.md` — the class-R row moves to `done` with the settled
  name/family reason (AC-11), and the header's landed-slices line gains #864.
- `frontend/src/tailwind.css` — the `--riv-console-negative-ink` declaration in the base block
  (with its reason) + the `@theme inline` mapping row.
- `frontend/src/testing/glass-tokens.ts` — `CONSOLE_NEGATIVE_INK`, the one test-side mirror.
- `frontend/src/app/operator/console-negative-token.contrast.spec.ts` — **new**: the declaration
  guard (AC-1, AC-2, AC-4, AC-5, AC-6, AC-7).
- `frontend/src/app/operator/payouts-tab.ts` — the `netClass` ternary's reversal arm.
- `frontend/src/app/operator/payouts-tab.html` — the reason chip's `text-` position; plus
  `data-testid="ledger-net"` on the net cell for the e2e locator.
- `frontend/src/app/operator/payouts-tab.contrast.spec.ts` — the `#a3372a` constant reads
  `CONSOLE_NEGATIVE_INK` from the mirror; docblock and both test titles stop naming the literal.
- `frontend/src/app/operator/payout-statement.spec.ts` — the reversal row fixture's `netClass`.
- `frontend/src/app/operator/daily-view-tab.html` — the check-in notice ternary's error arm.
- `frontend/src/app/booking/solid-btn-tokens.contrast.spec.ts` — `OUT_OF_FAMILY` narrowed from
  five files to three, and the docblock's "five other homes" prose corrected (AC-10).
- `frontend/e2e/console-negative-ink.e2e.ts` — **new**: the mocked-suite render + dark-theme proof
  (AC-8, AC-9).

---

## Phase 0 — Register the token, its mirror, and its declaration guard

**Files:** Create `frontend/src/app/operator/console-negative-token.contrast.spec.ts` ·
Modify `frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`

- [ ] **Step 1: Write the failing test** — `console-negative-token.contrast.spec.ts`, copied in
      shape from `console-accent-token.contrast.spec.ts` (the AC's named worked example): the
      `baseBlock()` / `declarationsOf()` / `themeRow()` helpers, the AC-2 stop loop, the AC-6
      same-value-separate-declaration pair against `SOLID_BTN_DANGER_INK`, and the AC-7
      themed-reds-would-fail proof. The AC-4/AC-5 sweep tests are **deliberately deferred to
      phase 1**, where their red→green is the migration itself.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- console-negative-token` → FAIL:
      `--riv-console-negative-ink declarations` expected length 1, received 0.
- [ ] **Step 3: Minimal implementation** — declare the token once in `tailwind.css`'s
      `:root, [data-riv-theme='porcelain']` block with the reason at the declaration (its role,
      why not `--riv-solid-btn-danger-ink`, why no dark counterpart, the proofs, and
      `docs/plans/console-negative-ink-token.md` + issue #864), add the
      `--color-riv-console-negative-ink` row to `@theme inline` beside the accent token's, and
      export `CONSOLE_NEGATIVE_INK` from `glass-tokens.ts` with the family note.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- console-negative-token` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every registered token whose value
      coincides with another registered token's* (the mechanism this whole ledger class is about),
      enumerated by grepping the declaration block for duplicate values rather than by listing the
      ones already in mind. Append to the log.
- [ ] **Step 6: Commit** — `git commit -m "Register the operator console's negative ink as its own token (#864)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Migrate the three sites and reconcile the downstream guards

**Files:** Modify `frontend/src/app/operator/payouts-tab.ts:135`,
`frontend/src/app/operator/payouts-tab.html:236`,
`frontend/src/app/operator/daily-view-tab.html:355`,
`frontend/src/app/operator/console-negative-token.contrast.spec.ts`,
`frontend/src/app/operator/payouts-tab.contrast.spec.ts`,
`frontend/src/app/operator/payout-statement.spec.ts`,
`frontend/src/app/booking/solid-btn-tokens.contrast.spec.ts`

- [ ] **Step 1: Write the failing test** — add AC-4 ("leaves no console file painting the ink as a
      literal", sweeping `operator/` for `/text-\[#a3372a\]/i` **by role**) and AC-5 ("leaves
      #852's `/opacity` tints on the reason chip untouched", asserting `border-[#a3372a]/28` and
      `bg-[#a3372a]/12` are still present in `payouts-tab.html`) to the guard spec.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- console-negative-token` → FAIL: the sweep
      returns `['daily-view-tab.html', 'payouts-tab.html', 'payouts-tab.ts']`, expected `[]`.
- [ ] **Step 3: Minimal implementation** — repoint the three `text-` positions to
      `text-riv-console-negative-ink`, leaving both `/opacity` positions on the chip element
      untouched; then reconcile the three downstream files the sweep does not itself fix:
      `payouts-tab.contrast.spec.ts` (constant from the mirror, titles and docblock naming the
      token), `payout-statement.spec.ts` (the reversal fixture's `netClass`), and
      `solid-btn-tokens.contrast.spec.ts` (`OUT_OF_FAMILY` narrowed to the three files still
      painting the literal, one entry per line, and the docblock's "five other homes" corrected).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- console-negative-token payouts-tab payout-statement solid-btn-tokens`
      → PASS, then `npm run lint && npm run format:check`.
- [ ] **Step 5: Generalization-audit pass** — population: *every file in the tree that restates
      `#a3372a`, in code or in prose*, enumerated with one tree-wide grep (not a list of the files
      the ticket named) and judged one by one against whose ticket each occurrence is. Append to
      the log.
- [ ] **Step 6: Commit** — `git commit -m "Move the console's three refund-red inks onto the negative-ink token (#864)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Prove the render and the porcelain pin (mocked e2e)

**Files:** Create `frontend/e2e/console-negative-ink.e2e.ts` ·
Modify `frontend/src/app/operator/payouts-tab.html` (the `data-testid="ledger-net"` locator)

- [ ] **Step 1: Write the failing test** — the mocked-suite spec (RV-FE-E2E: render/computed-style
      proofs belong in `frontend/e2e/`, which CI runs): the token-declared-and-utility-generated
      test, the payouts reversal net (a per-test `page.route` override of
      `/api/venues/1/payout-ledger` adding a REVERSAL entry on top of `mockWholeConsole`), the
      daily-view check-in error notice (driven client-side by submitting a malformed booking code —
      no route needed), and the forced-`dark` subtree-pinning test. Header states plainly what the
      dark test does and does **not** prove (R-7).
- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- console-negative-ink`
      → FAIL: `getByTestId('ledger-net')` resolves to 0 elements.
- [ ] **Step 3: Minimal implementation** — add `data-testid="ledger-net"` to the ledger's net
      `<td>` in `payouts-tab.html`.
- [ ] **Step 4: Run it, verify it passes** — the same command → PASS.
- [ ] **Step 5: Mutation-check (R-7, and the AC-9 requirement)** — temporarily add
      `--riv-console-negative-ink: #ff8a7a;` to `tailwind.css`'s `[data-riv-theme='dark']` block;
      confirm the dark-theme e2e turns **red** *and* the guard spec's single-declaration test turns
      red; revert. Record both outcomes in the Generalization-audit log — an unmutated
      absence-of-change assertion passes vacuously.
- [ ] **Step 6: Commit** — `git commit -m "Prove the console's negative ink resolves from the registry under both themes (#864)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Ledger class-R row + close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`, `docs/plans/console-negative-ink-token.md`

- [ ] **Step 1** — move the class-R row's status to `done — #864, PR #NN`, replace its "Why not
      that token" cell with the settled answer (own token, `negative` over `danger` and why, family
      in naming only), and add #864 to the header's landed-slices line.
- [ ] **Step 2** — run `node scripts/check-plan-file-structure.mjs --diff origin/main` with the
      plan doc **staged** (merely written, the guard short-circuits and passes).
- [ ] **Step 3** — finalize Execution status, the AC-verification table, and the self-review
      checklist **in this PR's last commit**, citing `merged via PR #NN`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-31 | phase 0 (new pattern: a second token registered for a value another token already carries) | **Every registered token whose declared value coincides with another token's** — the mechanism the whole class-R question is about. Enumerated by extracting every `--riv-*: #hex;` declaration and asking which hex values appear more than once, rather than by listing the coincidences already in mind | `grep -oP '^\s*--riv-[a-z0-9-]+:\s*\K#[0-9a-f]{3,8}' src/tailwind.css \| sort \| uniq -d` | 13 duplicated values. Three are **role** coincidences inside one theme and each already has a distinctness guard: `#0a6e85` (#848), `#a3160e` (#850 + #854), and `#a3372a` — this slice's. Six are the same token declared once per theme block (`#7cd7e8`, `#ffa9a1`, `#f2f7fa`, `#8fd6e2`, `#ffffff`, `#0a2a33`), not coincidences at all. **Two are unguarded role coincidences**: `#0a4f5e` (`--riv-solid-btn-ink` / `--riv-back-ink` / `--riv-map-rail-ink`) and `#0f7d8c` (`--riv-tile-available-ink` / `--riv-tile-focus`) | **No action in this slice.** Both unguarded pairs are pre-existing, already-tokenised positions — nothing in this diff creates or widens them, and neither is class R's (whose row is the plain-literal `#a3372a` ink form). Fixing them here would be a second family in one slice. Recorded so the audit's finding is not lost |
| 2026-08-31 | phase 1 (migration sweep) | **Every file in the tree that restates the literal `#a3372a`, in code or in prose** — the mechanism a role-scoped migration can leave behind, enumerated tree-wide over `src` + `e2e` rather than from the three files the ticket named. This is what surfaced `payout-statement.spec.ts`'s fixture and `solid-btn-tokens.contrast.spec.ts`'s `OUT_OF_FAMILY` guard, neither of which the issue lists | `grep -rn 'a3372a' src e2e \| sed 's/:.*//' \| sort \| uniq -c \| sort -rn` | 9 files after the migration | **Every remaining restatement has a named owner, so none is orphaned:** `tailwind.css` ×2 (the two declarations, asserted to stay two by AC-6) · `glass-tokens.ts` ×3 (one `hexToRgb` per token, by design) · `console-negative-token.contrast.spec.ts` ×3 (a *role* sweep must name the literal it excludes) · `solid-btn-tokens.contrast.spec.ts` ×5 (#851's guard — narrowed by this slice, AC-10) · `payouts-tab.html` ×1 (#852's `/opacity` tints, asserted present by AC-5) · `failure-panel.ts` ×2 + `booking-pay.ts` ×1 (#858's class-F medallions) · `solid-btn-token-skin.e2e.ts` ×1 (the button token's own pin, untouched by design) · `set-editor.contrast.spec.ts` ×1 (a true *value* statement in an otherwise-untouched file — declined as widening, recorded in Non-goals). No action |
| 2026-08-31 | phase 2 (mutation check — R-7, AC-9) | **The two claims an absence-of-change assertion can make vacuously**: that the single-declaration guard can see a dark override, and that the dark-theme e2e can see a broken porcelain pin. Enumerated as the two mutations that would make each assertion false, applied one at a time rather than reasoned about | `--riv-console-negative-ink: #ff8a7a;` added to the `[data-riv-theme='dark']` block, then `operator-console.ts`'s host pin flipped `porcelain` → `riviera`; both reverted | 2 mutations | **Both assertions are live, and the result sharpened R-7's wording.** The override alone turned the guard spec red (`expected [ '#a3372a', '#ff8a7a' ] to have a length of 1`) but left the e2e **green** — correctly, because the porcelain pin holds, which is the property that test exists to prove, not a vacuous pass. Flipping the pin as well turned it red (`Received: "rgb(255, 138, 122)"`). So the two guards see different failures, as designed, and neither is redundant |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1..AC-7:** Run `npm test -- console-negative-token payouts-tab` → all PASS.
- [ ] **AC-8, AC-9:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- console-negative-ink`
      → PASS, and the phase-2 mutation check recorded red-on-override.
- [ ] **AC-10:** Run `npm test -- solid-btn-tokens` → PASS.
- [ ] **AC-11:** `grep -n 'class-R\|#864' docs/design/colour-literal-token-audit.md` → the row reads `done`.
- [ ] **Merge grep (the ticket's own check):**
      `grep -rn 'a3372a' frontend/src/app/operator/` → exactly two hits, both `/opacity` tints on
      `payouts-tab.html:236`, and zero `text-[#a3372a]`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path touched.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9) — R-9 records why
      `payouts-tab.ts` in the diff is not a money change.
- [ ] Refund policy enforced server-side (invariant #10) — N/A, no refund logic touched.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met: token consumed through its named utility, no component branches
      on a theme, class bindings not `ngClass`, the e2e in the CI-run mocked suite.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
