# Semantic vs descriptive tourist chips — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On both tourist surfaces, the two chips that make a promise — the booking-mode
chip ("Instant Book" / "Request to Book") and the "New" (no-reviews-yet) chip — wear one
shared, deliberately distinct pill that no amenity or to-water chip can be mistaken for,
with their AA guarantee strengthened rather than preserved.

**Architecture:** A third shared chip **variant directive**, `shared/semantic-chip.ts`,
joining `amenity-chip.ts` and `status-chip.ts` — the single decision worth naming is that
it carries **only the distinction** (opaque accent fill, white ink, weight, radius, border
presence) and **no geometry**: every one of the four call sites keeps its own padding,
font size and positioning, which is what makes "no layout shift" provable by inspection
rather than by measurement. The fill is an **opaque solid** (`#0a5f74`, the `--riv-cta-grad`
dark stop), following the css:S7924 treatment the two sibling chips already use — so the
treatment is theme-independent, surface-independent, and proven once by a single ink/fill
assertion instead of per-surface composited maths.

**Persistence:** N/A — frontend-only, no schema, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #705 (2026-08-19 design critique, finding 7); visual
context: the "Beach Map Refinement" design canvas linked from the issue.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
"New" chip is a *trust* signal, not a booking-mechanics one, and that the four chips all sit
**outside** the amenity chip rows, which reframes AC-3 from wrap behaviour to per-call-site box
metrics) · `riviera-plan-doc` (this template — forced the behaviour-parity ledger that pinned
the two contrast proofs about to lose their subject) · `tdd` (each phase writes the failing
contrast/unit spec before the directive exists) · `riviera-review-overlay` (review gate — runs at
ready-for-review) · `riviera-docs-freshness` (`N/A — no substrate doc states the chip treatment;
the `--riv-mode-chip-glass` token comment in `styles.scss` does, and is corrected in phase 2 as
part of the diff`) · `riviera-frontend` (placement: a stateless presentational primitive → `shared/`,
never a feature folder; both consumers already reach `shared/` legally) · `riviera-tailwind`
(rule 1 forced a **directive** over any `@apply`; rule 2 kept `.mode-chip` / `.new-chip` /
`semantic-chip` as inert markers; rule 3's radius-order trap is why the directive owns
`rounded-full` and the call sites drop theirs; the no-drift rule added the e2e computed-style pin)
· `angular-developer` + angular-cli MCP (`get_best_practices` → host bindings in the `host` object,
never `@HostBinding`, and no explicit `standalone`/`OnPush`; `search_documentation` v22 → confirmed
the `Directive#host` attribute-selector contract the three chip directives share) · `playwright-cli`
(mocked-suite placement for the computed-style pin)

**Branch:** `claude/tailwind-angular-mcp-search-bvfshb` — the cloud session's designated
remote branch **stands in for** `feature/semantic-chips` (`riviera-sdlc` §Remote/cloud
session addendum); the literal `feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the shared semantic-chip recipe, when its ink and fill are read, then
  the pair meets WCAG AA (≥ 4.5:1) as an opaque solid — no compositing, no theme term.
  *Pinned by:* `semantic-chip.contrast.spec.ts` → "the semantic-chip ink meets AA on its solid fill".
- [ ] **AC-2:** Given the semantic-chip fill, when it is compared with both descriptive-chip
  fills (`amenity-chip` neutral and `--water`), then it differs from each by at least a 3:1
  ratio — the "distinguishable at a glance" claim stated as a number rather than an opinion.
  *Pinned by:* `semantic-chip.contrast.spec.ts` → "the semantic fill is a different family from every descriptive fill".
- [ ] **AC-3:** Given a Discover card and a beach-map header for the same venue, when both
  render, then the mode chip and the New chip on each carry the `semantic-chip` marker and the
  amenity/to-water chips do not. *Pinned by:* `home.spec.ts` and `venue-map.spec.ts`.
- [ ] **AC-4:** Given the Discover mode chip over an arbitrary cover photo, when its
  background is read, then it is fully opaque — the photo cannot reach the ink at all, which is
  strictly stronger than the 0.85 glass backing it replaces. *Pinned by:*
  `semantic-chip.spec.ts` → "the fill is opaque, so no cover photo can reach the ink".
- [ ] **AC-5:** Given both themes in a real browser, when Discover and the beach-map header
  render, then the four semantic chips report the same computed `background-color` and `color`
  on both surfaces, and axe reports no serious violations. *Pinned by:* `discovery-flow.e2e.ts`.
- [ ] **AC-6:** Given the four call sites, when the directive is applied, then each chip's
  padding, font size, tracking and positioning classes are unchanged from before —
  the box metrics that decide layout are not touched. *Pinned by:* review of the diff plus
  the existing `home.contrast.spec.ts` scrim-geometry assertions, which read the same boxes.

## Non-goals

- Restyling the descriptive chip family (`amenity-chip`, its `--water` variant) — the issue
  explicitly freezes it, and the to-water chip keeps its teal tint.
- Touching the operator console's chips, the booking `status-chip`, or the app-header /
  hero chips — "tourist surfaces" is Discover and the beach-map header, nothing else.
- Adding an icon to either semantic chip — the issue names the accent as **icon-free**.
- Retiring `--riv-mode-chip-glass`: the slideshow step chips (both hosts) still wear it.
- Any new design token. The treatment reuses the existing accent family, so `styles.scss`
  gains nothing; only the stale sentence in the `--riv-mode-chip-glass` comment is corrected.

## Behavior-parity ledger

> The slice replaces the styling of four existing chips. Every behaviour of the old surfaces,
> marked preserved / changed / dropped.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Discover mode chip renders `card.modeLabel` over the cover photo, top-left | preserved | same element, same `absolute top-[14px] left-[14px]`, same binding |
| Discover mode chip is AA over **any** photo via `--riv-mode-chip-glass` (0.85 white) | **changed → strengthened** | the fill is now opaque, so photo colour cannot reach the ink at all; AC-4 pins the opacity, AC-1 the ratio |
| Discover mode chip carries `backdrop-blur-[10px]` | **dropped** | a backdrop filter under a fully opaque background paints nothing; keeping it would be a dead style claiming an effect |
| Discover mode chip keeps the `.mode-chip` marker class | preserved | emitted by the call site as before (no spec queries it today, but `riviera-tailwind` rule 2 keeps markers inert-not-deleted) |
| Discover New chip renders only when `!card.isRated`, with `data-testid="new-chip"` | preserved | `@else` branch and testid untouched; `home.spec.ts:189` still passes |
| Discover New chip sits inside the `card-meta` flex row, inheriting `13.5px` | preserved | font size stays at the call site; the directive sets no `text-*` |
| Map-header mode chip renders `v.modeLabel` as a block `<p>` above the title | preserved | same element, same `inline-block … mb-[13px]` |
| Map-header New chip carries `aria-label="No reviews yet"` + `data-testid="new-chip"` | preserved | both attributes untouched; `discovery-flow.e2e.ts:275` still passes |
| Both map-header chips are AA via `--riv-chip-bg` composited over the panel glass over each gradient stop, per theme | **changed → simplified** | an opaque fill removes the composite and the theme term; the per-theme proof in `venue-map.contrast.spec.ts` **moves** to `semantic-chip.contrast.spec.ts` (it is not dropped — AC-1 is its stronger successor) |
| `home.contrast.spec.ts` proves `--riv-accent-ink` on `--riv-mode-chip-glass` over any photo at **AA_NORMAL** | preserved → **repointed** | Discover's own slideshow step chips (`home.html:280,294`) wear exactly that pair; the assertion is byte-identical and keeps the 4.5:1 bar that `photo-slideshow.contrast.spec.ts` only holds at 3:1 — the test is renamed to name its real subject, not deleted |
| Amenity / to-water chip rows on both surfaces | preserved | not touched; they are separate elements from all four semantic chips |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A contrast proof loses its subject and is silently deleted rather than moved, weakening the a11y net | med | high | the ledger above names both at-risk assertions and their successors; each spec keeps a comment pointing at the new home | claude | open |
| R-2 | Adding display/padding utilities in the directive shifts a chip's box (AC-3/AC-6 regression) | med | med | the directive carries **no** `display`, `padding` or `text-*`; all four call sites already have a 1px border, so swapping only its colour keeps widths identical | claude | open |
| R-3 | The saturated accent pill reads as a **button** and invites a tap that does nothing | low | med | no shadow, no hover/`cursor` change, `rounded-full` at chip scale; the CTA is a large gradient button — a different object at a different size. Revisit if the e2e a11y run or a later critique flags affordance | claude | open |
| R-4 | On the dark map-header glass a dark fill reads as *receding* next to the pale amenity pills, inverting the hierarchy | med | med | the pill takes a **lighter** accent rim (`#2f7d92`) so its shape reads as a solid object on the dark panel; AC-2 states the family separation as a ratio against both descriptive fills | claude | open |
| R-5 | Tailwind's stylesheet-order radius trap (`riviera-tailwind` rule 3) if a call site keeps its own `rounded-full` | low | low | the directive owns the radius and every call site drops its duplicate; all four were `rounded-full`, so there is no competing value to resolve | claude | open |
| R-6 | The plan-doc file-structure guard passes because the doc is unstaged | med | low | `git add` the plan doc, then run `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing | claude | open |

## Open questions / Assumptions

- **Assumption:** "designer's choice within the Liquid Glass token system" in the issue
  delegates the *choice of accent* to the implementer, so no `AskUserQuestion` is due; the
  choice made is the inverted accent pill described in **Architecture**, and the fill is an
  existing system colour (`--riv-cta-grad`'s dark stop), not a new one. — *Owner:* claude ·
  *Resolves by:* review gate, where the maintainer sees it rendered.
- **Assumption:** grouping the "New" chip with the mode chip is deliberate on the issue's
  part even though "New" describes *trust*, not *booking mechanics*; both are read as
  platform-authored claims rather than venue-authored descriptions, which is the line the
  treatment actually draws. — *Owner:* claude · *Resolves by:* review gate.

## Availability & concurrency (invariant #2)

N/A — presentation only. The slice writes no `availability(set_id, booking_date)` row, reads
no booking state, and changes no call into `AvailabilityClaim`. The mode chip *reports* a
venue's booking mode; it does not decide one.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

### Module ownership (§4a)

N/A — frontend-only; no backend capability added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/semantic-chip.ts` | new | standalone attribute **directive** (`[appSemanticChip]`) | none — a static host `class` string, no `input()`, no `computed()` | none |
| FE-2 | `pages/home/home.html` + `home.ts` | existing | standalone component | unchanged | none |
| FE-3 | `venue/venue-map.html` + `venue-map.ts` | existing | standalone component | unchanged | none |

**Standards:** host bindings in the `host` object (never `@HostBinding`), no explicit
`standalone: true`, no explicit `OnPush` — both are the v22 defaults per the angular-cli MCP's
`get_best_practices`. The directive has **no variant input**, so — unlike `amenity-chip.ts`,
which needs a `computed()` for its `water` variant — a static `host: { class: … }` is enough
and no signal is introduced.

## FE↔BE contract

N/A — no contract change. `bookingMode` and the rating fields already arrive on the venue
views; only their presentation changes.

## Execution status

**Stage pointer:** `implement (phase 1)`

**Next action:** apply `appSemanticChip` on the two Discover chips and repoint the `MODE_CHIP_GLASS` assertion.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the shared directive + its proofs | ✅ | phase-0 commit |
| 1 — apply on Discover | ⏳ | |
| 2 — apply on the beach-map header + move the displaced proofs | | |
| 3 — e2e no-drift pin + gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/semantic-chips.md` — this plan
- `frontend/src/app/shared/semantic-chip.ts` — the new variant directive (distinction only, no geometry)
- `frontend/src/app/shared/semantic-chip.spec.ts` — marker + opaque-fill unit proof
- `frontend/src/app/shared/semantic-chip.contrast.spec.ts` — the single home of the AA + family-separation proof
- `frontend/src/app/pages/home/home.ts` — import the directive
- `frontend/src/app/pages/home/home.html` — Discover mode chip + New chip
- `frontend/src/app/pages/home/home.spec.ts` — assert the marker on both Discover chips
- `frontend/src/app/pages/home/home.contrast.spec.ts` — repoint the `MODE_CHIP_GLASS` assertion to Discover's step chips
- `frontend/src/app/venue/venue-map.ts` — import the directive
- `frontend/src/app/venue/venue-map.html` — map-header mode chip + New chip
- `frontend/src/app/venue/venue-map.spec.ts` — assert the marker on both header chips
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — retire the mode-pill composite proof, pointing at its successor
- `frontend/src/styles.scss` — correct the now-stale "Discover mode chip" sentence in the `--riv-mode-chip-glass` comment
- `frontend/e2e/discovery-flow.e2e.ts` — computed-style no-drift pin across both surfaces

---

## Phase 0 — The shared directive and its proofs

**Files:** Create `frontend/src/app/shared/semantic-chip.ts` · Test
`frontend/src/app/shared/semantic-chip.contrast.spec.ts`, `frontend/src/app/shared/semantic-chip.spec.ts`

- [x] **Step 1: Write the failing contrast spec** — the ink/fill AA pair (AC-1) and the
      family separation against both descriptive fills (AC-2), mirroring `amenities.contrast.spec.ts`.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/shared/semantic-chip*.spec.ts"` → FAIL (`Could not resolve "./semantic-chip"`).
- [x] **Step 3: Minimal implementation** — the directive with a static host `class`.
- [x] **Step 4: Run it, verify it passes** — same command → 7 passed (2 files).
- [ ] **Step 5: Generalization-audit pass** — population: every chip recipe on a tourist
      surface that is neither `amenity-chip` nor `status-chip`.
- [ ] **Step 6: Commit** — `git commit -m "A shared semantic-chip recipe for the promise-making chips (#705)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Apply on Discover

**Files:** Modify `home.ts`, `home.html` · Test `home.spec.ts`, `home.contrast.spec.ts`

- [ ] **Step 1:** Assert the marker on both Discover chips (red).
- [ ] **Step 2:** Apply `appSemanticChip`, drop the replaced colour/glass/blur/radius/border
      utilities, keep every geometry class.
- [ ] **Step 3:** Repoint the `MODE_CHIP_GLASS` assertion to Discover's step chips.
- [ ] **Step 4:** the Discover specs → PASS. Commit + status.

## Phase 2 — Apply on the beach-map header, move the displaced proof

**Files:** Modify `venue-map.ts`, `venue-map.html`, `styles.scss` · Test `venue-map.spec.ts`,
`venue-map.contrast.spec.ts`

- [ ] **Step 1:** Assert the marker on both header chips (red).
- [ ] **Step 2:** Apply the directive; retire the mode-pill composite proof with a comment
      naming its successor; correct the `--riv-mode-chip-glass` comment.
- [ ] **Step 3:** the beach-map specs → PASS. Commit + status.

## Phase 3 — e2e no-drift pin and the gates

**Files:** Modify `frontend/e2e/discovery-flow.e2e.ts`

- [ ] **Step 1:** Pin the computed `background-color`/`color` of the mode chip and the New
      chip on both surfaces (the `riviera-tailwind` no-drift rule — contrast specs are maths
      and cannot see a wrong-but-still-AA colour).
- [ ] **Step 2:** `npm run lint`, `npm run format:check`, `npm test`,
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`,
      `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 3:** Commit + status; push; open the draft PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 / AC-2:** `npx ng test --watch=false --include="src/app/shared/semantic-chip*.spec.ts"` → PASS.
- [ ] **AC-3:** `npx ng test --watch=false --include="src/app/pages/home/home*.spec.ts" --include="src/app/venue/venue-map*.spec.ts"` → PASS.
- [ ] **AC-4:** `npx ng test --watch=false --include="src/app/shared/semantic-chip*.spec.ts"` → PASS.
- [ ] **AC-5:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS.
- [ ] **AC-6:** diff review — no padding/font-size/tracking/position class changed at any call site.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (N/A justified — presentation only; invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, untouched.
- [ ] **Modulith** section filled (N/A justified; invariant #11).
- [ ] **Payment/payout** section filled (N/A justified; invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A, untouched.
- [ ] Timezone correct (invariant #6) — N/A, untouched.
- [ ] Booking codes unguessable (invariant #7) — N/A, untouched.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per `riviera-sdlc` `references/pr-gates.md` §1 plus
      `riviera-review-overlay`.
