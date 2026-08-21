# Cutoff sentence — one source, the rest are pins Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cutoff rule's sentence exists **once** in the source. Discover and the beach
map mount the same shared note, so a copy edit cannot leave one surface stale while both
suites stay green — the failure #733 was meant to repair and did not. **And, at the
maintainer's direction, the same for every other sentence in that defect class**: the slice's
own generalization audit enumerated seven more, and #738's population is fixed here rather
than deferred.

**Architecture:** The one significant decision is the **shape of the seam**, which #735
leaves open (exported constant vs `<app-cutoff-note>`). Decided below (D-1): a **component
with an attribute selector on the native element**, `p[appCutoffNote]`, in `shared/`. It
deduplicates the sentence *and* the note's shape (test id, glyph, `<span>`, flex layout),
keeps the copy in a **template** rather than a string literal, and leaves both call sites'
`<p>` element and skin classes exactly where they are — so there is no visual or a11y diff
to argue about.

**Persistence:** N/A — frontend-only, no tables and no migrations.

**Source of intent:** GitHub issue #735 (raised as finding **F-3** on PR #734 and deferred
there on purpose); predecessor #733 / PR #734 and its plan doc
`docs/plans/discover-cutoff-note-parity.md`; the wording itself comes from #703 / PR #732.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the gate is
what surfaced that `.cutoff-note` is a **dead** marker class and that the in-flight set is
all Dependabot, so no shared-file or Flyway collision exists) · `riviera-plan-doc` (this
template — its behavior-parity ledger is what forced the `[&_svg]` scope-widening row and
the `<p>`-element row, neither of which is visible in the diff) · `tdd` (each phase writes
the failing spec first; `cutoff-note.spec.ts` is written before the component, and D-2's
mutation check is a deliberate falsification, not a green run) · `riviera-review-overlay`
(review gate — due at ready-for-review; register below) · `riviera-docs-freshness`
(**ran** over `04a5575..HEAD` — **5 findings, all patched**, all in `riviera-tailwind`: rule 1's
two-branch taxonomy, ICON-1's "the one place … is forced" (a counting-sweep hit — this slice makes
it two), ICON-4's worked example (the size override moved off `<app-clock-icon>`), ICON-5's "each
call site", and the glyph's call-site parenthetical. Swept `CLAUDE.md`, `CONTEXT.md`,
`RESPONSIBILITIES.md`, `docs/adr/`, `docs/agents/`, `docs/architecture/`, `docs/design/` and the
`riviera-*` skills; re-ran both sweeps after the fix round per #373. `docs/design/` states the
cutoff *copy*, which this slice does not change — whether it joins the map is #736's question) · `riviera-frontend` (**decided the folder**: `shared/` is the only stratum both
`pages/home/` and `venue/` may import from, so the seam lands there and creates no
cross-feature edge — the identical argument `clock-icon.ts` was placed on) ·
`riviera-tailwind` (**rule 1** — a reused *element* is a component, which is the branch this
slice is on; **rule 2** — the marker class `.cutoff-note` is protected only if a test queries
it, and none does; **rule 3** — the host carries no `border-radius`, so Discover keeps its own
`rounded-full`; **ICON-4** — a call-site descendant variant compiles to a global `… svg` rule,
which is what lets the 15 px override survive moving up one element) · `angular-developer` +
angular-cli MCP (v22: `search_documentation` for *component attribute selector host element*
returned the a11y guide's **"Augmenting native elements"**, which endorses exactly this shape —
"create a component that uses an attribute selector with a native element … can be used with
many other types of element". That citation is what settled D-1's variant question on framework
guidance rather than taste) · `playwright-cli` (the cross-surface parity assertion in the
mocked suite — captured from the page, never re-typed) · `riviera-local-debug` (cloud-session
recipe: `ng test --include=…` scoped, and `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`
for the mocked e2e)

**Branch:** `claude/dedupe-cutoff-sentence-oo12cg` — the cloud session's designated remote
branch stands in for `feature/cutoff-sentence-single-source` (`riviera-sdlc` §Remote/cloud
session addendum).

---

## The distinction this slice is built on

#735 counts **five** copies of the sentence and asks for them to be deduplicated. Not all
five are the same thing, and collapsing them all would delete the copy-review gate:

- A **duplicate** is a copy that stays **green** when a *sibling* copy changes. It hides
  drift. Today's two templates are duplicates of each other, and — the sharper half of the
  diagnosis — so are the two unit specs: each pins its own template, so both passed for
  three commits while the two surfaces said different things.
- A **pin** is a copy that goes **red** when the source changes. It cannot hide drift; it
  forces a human to confirm a copy edit. That is a feature.

So the target is not "one copy". It is **one source, and every remaining copy a pin**:

| Site | Today | After | Kind |
|---|---|---|---|
| `pages/home/home.html` | the sentence | mounts the shared note | — |
| `venue/venue-map.html` | the sentence | mounts the shared note | — |
| `shared/cutoff-note.ts` | — | **the sentence** | source |
| `pages/home/home.spec.ts` | re-types it | asserts the note mounted | — |
| `venue/venue-map.spec.ts` | re-types it | asserts the note mounted | — |
| `shared/cutoff-note.spec.ts` | — | re-types it | **pin** (unit) |
| `e2e/discovery-flow.e2e.ts` | re-types it | re-types it | **pin** (browser) |

Five copies → one source and two pins, and AC-2 **falsifies** the claim rather than asserting
it: mutate the source and exactly the two pins go red, no site stays silently green.

## Acceptance criteria (testable)

- [x] **AC-1:** Given the whole `frontend/` tree, when swept for the cutoff sentence's
  distinguishing clause, then exactly **three** files match — `shared/cutoff-note.ts`,
  `shared/cutoff-note.spec.ts`, `e2e/discovery-flow.e2e.ts` — and neither template nor
  either surface spec matches. *Pinned by:* AC-verification command
  `grep -rln "sales close at 6" frontend/src frontend/e2e`
- [x] **AC-2:** Given the sentence is edited in `shared/cutoff-note.ts` alone, when the
  frontend unit suite and the mocked e2e suite run, then **both** pins fail and **no**
  surface spec passes-while-stale. *Pinned by:* the deliberate mutation run recorded in
  *Acceptance-criteria verification*; reverted after.
- [ ] **AC-3:** Given a user walks Discover → a venue's beach map, when both cutoff notes
  render, then the map's note text **equals the text captured from Discover's note** —
  compared page-to-page, never against a re-typed literal. *Pinned by:*
  `discovery-flow.e2e.ts` › `discovery → filter → venue map is accessible end-to-end`
- [ ] **AC-4:** Given both surfaces after the change, when computed styles are read in a real
  browser, then Discover's glyph is 15 × 15 px and the map's 13 × 13 px, each stroke resolves
  to its own note's ink (`--riv-card-ink-soft` / `--riv-ink-faint`), and Discover's note keeps
  its glass pill — all unchanged from before the change. *Pinned by:* the existing
  `discovery-flow.e2e.ts` `toHaveCSS` assertions + the no-drift probe recorded below
- [ ] **AC-5:** Given either surface, when the note renders, then it is a `<p>` element
  carrying `data-testid="cutoff-note"` and an `aria-hidden` `<svg>`, and axe reports no
  serious violations. *Pinned by:* `home.spec.ts`, `venue-map.spec.ts`,
  `cutoff-note.spec.ts`, and `expectNoSeriousAxeViolations` in the mocked suite
- [x] **AC-7:** Given the whole `frontend/src` tree, when every **≥25-char** text run rendered from
  a `.html` file or an inline `template:` is grouped by normalized text, then **no group spans more
  than one file**. The threshold is the AC's boundary, not an implementation detail: shorter strings
  are out of population by the recorded judgement below, so this AC deliberately says nothing about
  them. *Pinned by:* the AC-verification sweep below
- [x] **AC-6:** Given `shared/cutoff-note.ts`, when it renders standalone, then its host
  static classes merge with (rather than replace) a class written at the call site, and its
  text is the exact sentence including the non-breaking space in `6&nbsp;PM`. *Pinned by:*
  `cutoff-note.spec.ts`

## Non-goals

- **The cancellation-policy copy** in `booking/booking-dialog.ts` and `booking/booking-view.ts`
  ("Free cancellation until the evening before"). A **different** rule (invariant #10) that
  merely shares an instant. #734's generalization audit enumerated and excluded it; re-verified
  by this slice's own audit, which re-runs the same mechanism sweep.
- **The legal pages** (`pages/legal/terms-of-service.html`) — the rule in legal register,
  deliberately naming no clock time. Same exclusion, same reason.
- **`admin/admin-commissions.ts`** — explains to an admin why today's commissions already
  accrued. Different audience, not a point-of-sale invitation.
- **Re-wording anything.** The sentence ships byte-for-byte as #703 wrote it. This slice moves
  it; it does not edit it.
- **An i18n / message-catalogue layer.** One sentence, one locale. `$localize` would be a
  build-config change and a second indirection for a single string; revisit if the app grows
  a second language.
- **Any change to date fencing** — the `min` clamp, `defaultBookingDate`, and the server-side
  cutoff are untouched. Invariant #4 appears here only as display copy.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Both notes are `<p>` elements | **preserved** | the attribute selector `p[appCutoffNote]` binds to the existing `<p>` and only fills its content — the tag never changes. This is D-1's whole reason for the attribute form over `<app-cutoff-note>`, and `home.spec.ts`/`venue-map.spec.ts` pin `tagName === 'P'` so a later switch to an element selector goes red |
| Both notes carry `data-testid="cutoff-note"` | **preserved**, and *strengthened* | the id moves to the component host, so after this slice it exists in exactly one file — which makes the surface specs' existing `[data-testid="cutoff-note"]` query **proof that the shared note mounted**, with no new assertion needed |
| Discover: glass pill (`appCardGlass`, `rounded-full`, padding, backdrop filters, `--riv-card-ink-soft`, `mx-[2px] mt-3`, `text-[13px]`) | **preserved** | all of it stays at the call site on the same `<p>`; only the four shared layout utilities (`inline-flex items-center gap-1 leading-[1.35]`) move to the host. Per `riviera-tailwind` rule 3 the host carries **no** `border-radius`, so Discover's `rounded-full` has nothing to race |
| Map: bare header-glass line (`mt-2`, `text-[11.5px]`, `--riv-ink-faint`) | **preserved** | same — call-site skin, untouched |
| Discover: `[&_svg]:size-[15px]` written on `<app-clock-icon>` | **changed** | the glyph now lives inside the component's template, so the override moves up one element onto the `<p>`. It compiles to the same global descendant rule (`… svg`) per ICON-4, so the rendered box is identical — but its nominal scope widens from "this glyph" to "any svg in this note". The note has exactly one glyph, and `discovery-flow.e2e.ts`'s `toHaveCSS` still measures it |
| Map: glyph at its 13 px presentation-attribute default (no override) | **preserved** | unchanged — the component adds no size of its own |
| Both: `<app-clock-icon />` then `<span>sentence</span>` inside a `gap-1` flex row | **preserved** | moves verbatim into the component's template; the host keeps `inline-flex items-center gap-1`, so the glyph's `display: contents` wrapper and `shrink-0` behave exactly as today (ICON-5) |
| Both: the `<!-- Cutoff explainer (invariant #4 — display only; the server enforces the cutoff) -->` comment | **changed** | consolidated into the component's TSDoc. It is a sixth statement of the same rule, and leaving one copy per template would re-create in comments precisely the drift this slice removes from markup |
| Discover: `.cutoff-note` marker class | **dropped** | swept `frontend/src frontend/e2e` — **no** test queries it (specs query the test id) and no stylesheet, `home.scss` included, references it. `riviera-tailwind` rule 2 protects a marker class only when a test queries it; this is the same call #733's ledger made for `.cutoff-icon`, applied to the one it did not examine |
| Both surface specs assert the exact sentence | **changed** | they assert the shared note **mounted** and the surface's own concerns; the words are pinned once in `cutoff-note.spec.ts`. Keeping them would be keeping the duplicate that let #703's drift pass green — the defect, not the coverage |
| `discovery-flow.e2e.ts` asserts the sentence in the load-failure state | **preserved** | kept verbatim as the browser-level copy pin (the "pins vs duplicates" table above), and joined by AC-3's parity assertion |
| **#738 —** the seven admin pages' access-denied line, each with its own test id | **preserved** | one component, `testId` as its input; all seven specs keep asserting their own id, unedited |
| **#738 —** both outboxes' load-error copy, identical and naming neither outbox | **changed** | the mail page now says "the email outbox" and the refund page "the refund outbox". A **copy fix, not a dedupe**: every other admin page names its own subject ("the audit trail", "the venue list", "operators"), so these two were the family's odd ones out. Deduplicating a wrong string would have frozen the ambiguity |
| **#738 —** the operator nav cluster's markup, mirrored in both headers | **preserved** | one component on a `display: contents` host, so each header's own flex container and gap still lay the items out. The test-id prefix is an input (`opc-` / `oc-`) and **sign-out is an output**, because the two headers genuinely tear down differently — the chrome parks focus on `<main>` first, the console additionally resets the venue, map and request stores |
| **#738 —** the console's `oc-create-venue` / `oc-signed-in-as` marker classes | **dropped** | swept `src` and `e2e`: no stylesheet and no spec queries them (the specs query the test ids), so `riviera-tailwind` rule 2 does not protect them |
| **#738 —** the venue booking-mode and cutoff fields, in both forms | **preserved** | one component each. Deliberately **two field components, not one fieldset**: the create card pairs booking-mode with payout currency and puts the cutoff in a different grid, so an extracted "booking fields" block would have had to move the create card's layout |
| `venue-create-card.spec.ts` swept its fields via `label.field span` | **changed** | the two extracted labels carry no `.field` marker, so the sweep now walks `label` directly and takes each one's first `span`. This asserts the same seven names in the same order without depending on an inert marker class — which the earlier grep for `.field` missed, because the query spells it `label.field span` |
| `venue-create-card.ts` typed its form model by inference, casting `m.bookingMode as BookingMode` on submit | **changed** | the shared field's `Field<BookingMode>` input would not accept the inferred `string`. The model now has an explicit `VenueDraft` type and the submit-path cast is gone — the console's venue tab already typed its own model this way |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An attribute-selector **component** is new here (the repo has 11 attribute *directives* and 0 attribute components), so it fails to compile, or silently doesn't match, on a `<p>` | low | high | Angular supports it as a first-class shape and the v22 a11y guide names it the recommended way to reuse a native element; pinned by `cutoff-note.spec.ts` rendering a host `<p>` and asserting the projected content, written **before** the component | claude | **closed** `b3a64e8` — it compiles and matches; the spec was red on the missing component first, and the lint rule that did *not* expect this shape became D-3 |
| R-2 | The call-site `class` replaces the component's host `class` (or vice versa), silently dropping `inline-flex`/`gap-1` and collapsing the note's layout | low | med | Angular merges host metadata classes with the template's static class — the exact behavior `clock-icon.spec.ts` already pins; re-pinned here as AC-6 rather than assumed, and the rendered box is re-measured in a browser | claude | **closed** `b3a64e8` — the merge case passes: the host's `inline-flex`/`gap-1` and the call site's `text-[11.5px]`/`[&_svg]:size-[15px]` all survive on one element |
| R-3 | Moving `[&_svg]:size-[15px]` from the glyph element up to the `<p>` silently drops Discover's glyph to 13 px | med | low | ICON-4: the descendant variant compiles to a global `… svg` rule that matches through the `display: contents` host, so the move is inert; the pre-existing `toHaveCSS` 15 px assertion is the executable proof | claude | **closed** — CI's run of the mocked suite exercises that assertion. The review also surfaced the doc half of this risk: `clock-icon.ts` still told the next author to use the child combinator, which the extra wrapper makes unmatchable (F-3, fixed) |
| R-9 | An extracted component renders markup that depends on a class defined in the **caller's** encapsulated stylesheet, so the class silently stops applying | med | high | *(added at the review gate — it had already happened.)* Keep such an element in the caller's view (attribute selector) rather than moving it into the component. Enumerate by mechanism, not by eye: sweep every extracted component's own template for class names declared in any `styleUrl` stylesheet, plus any `[class]` bound from a caller | claude | **closed** `abc46dc` — F-1 fixed; the sweep confirms `manage-booking-link` was the only instance of eight |
| R-4 | The `&nbsp;` in `6&nbsp;PM` is lost in the move, letting the note wrap between "6" and "PM" — invisible to a normalized string compare, which is exactly how it went unasserted before #734's F-7 | med | med | the copy moves as an HTML **entity** into an HTML **template**, not into a TS string literal where it would become an invisible byte or a ` ` escape (a stated reason for D-1); `cutoff-note.spec.ts` pins `6 PM` separately from the normalized compare, inheriting F-7's fix | claude | open |
| R-5 | The two surface specs stop asserting the copy, and the copy ends up pinned **nowhere** — a dedupe that quietly deletes the coverage | med | high | AC-2 is a **mutation** check, not an assertion: edit the source sentence and confirm the suites go red. A dedupe that removed the gate would show up as a green run | claude | **closed** — the mutation run turned exactly the unit pin red (2 failures) and left no surface stale; recorded under AC-2 |
| R-6 | The mocked e2e is not run in this cloud session, so a real-browser-only break (the parity assertion, the glyph size) ships | med | med | run it per `riviera-local-debug`; **the local run was declined in this session**, so CI's own run of the same suite is the proof and the risk stays open until that run is green. One ambiguity the local run would have settled was removed by construction instead: the captured text is normalized in the spec rather than left to `toHaveText`, which would otherwise collapse the U+00A0 in `6 PM` on only one side of the compare | claude | open — awaiting CI |
| R-8 | A guard-violating edit slips past the local `PostToolUse` hooks because the file was written from a shell heredoc rather than an editing tool, so it is caught only by CI | med | low | run the five `scripts/check-*.mjs` guards **by hand** before every push, not just the one the hook happens to fire on — the whole set takes seconds | claude | **closed** — this is exactly how the phase-2 push went red (two 2-line comments in the surface specs, written via heredoc). Fixed, and the full guard set now runs locally before each push |
| R-7 | AC-3's parity assertion is vacuously true — e.g. both locators resolve to the same element, or both texts are empty | low | med | the captured text is asserted truthy before the compare, and the two reads run against different URLs (`/`, then `/venues/1`, after a `toHaveURL` gate) | claude | **closed** — the two locators cannot resolve to one element across a navigation, and an empty capture fails the truthy assertion before the compare |

## Open questions / Assumptions

*(empty — D-1 and D-2 are decided below, which is what #735 asked the plan doc to do.)*

### Resolved

- **D-1 (the call #735 delegates to this plan): shared constant, or `<app-cutoff-note>`?**
  → **A component, `p[appCutoffNote]`, in `shared/`.** Three reasons, in order of weight:

  1. **The constant's stated cost is real, and the component does not pay it.** #735's own
     objection to the constant is that it "moves user-visible copy out of the templates, where
     it is currently greppable and reviewable in place". A component keeps the copy **in a
     template** — one template instead of two. Concretely: in a template `6&nbsp;PM` stays a
     visible, reviewable HTML entity; in a TS constant it becomes either an invisible U+00A0
     byte or a ` ` escape. Given that this exact non-breaking space was asserted **nowhere**
     until PR #734's F-7, moving it somewhere less reviewable is the wrong direction (R-4).
  2. **The sentence is not the only thing duplicated.** The test id, the `<app-clock-icon />`,
     the `<span>`, the four flex utilities and the invariant-#4 comment are duplicated too, and
     each can drift on its own (an `aria-live` added to one note, a `gap` changed on the other).
     A constant dedupes one of six; the component dedupes all six. `riviera-tailwind` rule 1
     puts this on its "a reused **element** is a component" branch — the same branch
     `retry-button.ts` sits on.
  3. **The constant leaves the call sites longer, not shorter.** Each surface would gain a
     component field *and* keep its whole `<p>` scaffold, for one deduplicated string.

  **#735's objection to the component — "two uses styled quite differently" — does not survive
  enumeration.** The two call sites' classes partition cleanly, with no overlap to resolve:
  shared → `inline-flex items-center gap-1 leading-[1.35]` (host); Discover-only → the glass
  pill, type scale, ink and margins; map-only → `mt-2 text-[11.5px] text-(--riv-ink-faint)`.
  That is a presentational primitive with a call-site skin — the shape `card-glass.ts`,
  `panel-glass.ts` and `field-glass.ts` already have here.

  **Attribute selector, not element selector** (`p[appCutoffNote]`, not `<app-cutoff-note>`):
  an element selector would replace the `<p>` with a custom element, dropping paragraph
  semantics and forcing every call-site skin class onto a host that is not the painted box.
  Angular's v22 a11y guide states the rule directly — "instead of creating a custom element …
  create a component that uses an attribute selector with a native element … can be used with
  many other types of element". So the DOM after this slice is byte-identical apart from one
  added attribute, which is why the ledger has no "changed" row for either surface's rendering.

- **D-2 (the sub-question #735 raises): should the specs assert against the shared source?**
  → **No — and that is the point.** If every spec asserted against the shared source, nothing
  would pin the *words*: a bad copy edit would pass everywhere, which is a worse failure than
  the one being fixed. The resolution is the **pin/duplicate distinction** above: the two
  surface specs stop re-typing the sentence (they were duplicates — each pinned its own
  template, which is precisely how #703's drift stayed green in both suites), while
  `cutoff-note.spec.ts` and the mocked e2e keep re-typing it deliberately, because those copies
  go **red** on an edit instead of hiding one. AC-2 falsifies this rather than asserting it.
  The e2e keeps its own literal for the further reason that `frontend/e2e/` imports nothing from
  `frontend/src` (verified: zero such imports today) — the black-box boundary is deliberate, and
  a shared constant reaching into it would be the more expensive mistake.

- **D-3 (surfaced at phase 0, not at plan time): the lint rule had encoded the old taxonomy.**
  `@angular-eslint/component-selector` was configured `type: 'element'`, so the first
  attribute-selector component in the repo fails the lint. The rule cannot express both forms
  in one entry — `type` accepts an array but `style` does not, and an element selector is
  kebab-case while an attribute selector is camelCase. Resolved with a **file-scoped override**
  that runs the same rule in `type: 'attribute'` mode, rather than widening the global rule
  (which would stop catching a component that should have been an element) or writing an
  inline `eslint-disable` (which would stop checking the selector at all). Falsified: renaming
  the selector to `p[cutoffNote]` still fails the lint on the missing prefix.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No `availability(set_id, booking_date)` row is read or
written and no reservation path is touched. Invariant **#4** appears only as **display copy**:
both notes describe the 18:00 `Europe/Tirane` close, the server remains authoritative, and the
comment saying so survives the move (into the component's TSDoc). The fencing itself — the
`min` attribute from `defaultBookingDate`, the pay-deadline clamp and the server-side close —
is explicitly a non-goal.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved. The frontend-side equivalent is
recorded under *Angular* below: the note is a pure presentational primitive, so `shared/` owns
it (`riviera-frontend`), and no cross-feature import is created.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/cutoff-note.ts` | new | standalone component, **attribute selector** `p[appCutoffNote]`, inline template | none — pure presentational, zero API surface | none |
| FE-2 | `pages/home/home.html` + `home.ts` | existing | standalone component | unchanged | unchanged |
| FE-3 | `venue/venue-map.html` + `venue-map.ts` | existing | standalone component | unchanged | unchanged |

**Standards:** standalone (no `standalone: true`), no explicit `OnPush` (v22 default), host
bindings in the `host` object (never `@HostBinding`), Tailwind utilities for all styling, no
new `.scss`. No `input()`/`output()`/signals — like `clock-icon.ts`, the component has
deliberately no API surface: the cascade gives each call site full control of ink, type scale
and spacing, and the one thing a call site overrides (glyph size) it does with a plain class.

**Placement:** `shared/` — the only stratum both `pages/home/` and `venue/` may import from,
so the seam creates no cross-feature edge and does not touch `riviera-frontend`'s frozen
five-edge table.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or client typing is touched.

## Execution status

**Stage pointer:** `CLOSE-OUT — review gate ran (11 findings, all resolved); CI + Sonar gates outstanding`

**Next action:** confirm CI green on `abc46dc` — the mocked e2e run there is the only proof for
AC-3/AC-4 and the last thing holding R-6 open — then pull the Sonar new-issue and duplication
lists from the API and clear every entry. Merge is the maintainer's call; this session was not
asked to merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the shared cutoff-note seam | ✅ | `b3a64e8` |
| 1 — both surfaces adopt it; the specs stop re-typing the copy | ✅ | `03757fe` |
| 2 — the cross-surface parity assertion in the mocked e2e | ✅ | `281b5ae` |
| 3 — close-out (docs freshness, review + Sonar gates, final state) | ⏳ | `b814964` (freshness) |
| 4 — #738's population, folded in at the maintainer's direction (D-4) | ✅ | `e6f7f0c` |
| 5 — review-gate fixes (11 findings, incl. the F-1 regression) | ✅ | `abc46dc` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

Review gate ran on PR #737 via the `code-review` workflow (rung 1 of the invocation ladder), with
`riviera-review-overlay`'s bank layered on. **11 findings, one of them a real shipped regression.**
Every fix re-entered at Implement through the frontend routing row.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review | **`ManageBookingLink` silently stripped both call sites' styling.** `.btn-primary`/`.link` are declared in each page's `styleUrl` stylesheet, so emulated encapsulation compiles them to `.btn-primary[_ngcontent-<page>]`; an anchor rendered from the component's own template carries the component's stamp and matches neither rule. A genuine visual regression that no spec or e2e covered — and the exact trap the ICON-4 text *edited in this same PR* describes | **fixed** — the anchor goes back into the caller's view via an attribute selector, so the page's own rules apply; the `skin` input is gone (it was a false abstraction too — the two pages' `.btn-primary` genuinely differ, and each page styles other buttons with the same class). `elements-content` is taught about the directive through its **`allowList` option**, not silenced per file — falsified by removing the entry, which produces 3 errors. **A mechanism sweep over all eight extracted components** (caller-scoped class names appearing inside an extracted template, plus any `[class]` bound from a caller) confirms this was the only instance |
| F-2 | review | AC-7's claim was **false as written**: "Sign out" still renders from `app.html` as well as the shared cluster, and the enumerator's 25-char threshold structurally cannot see it, so the re-run was vacuous for the short members | **fixed as a claim** — AC-7 now states what was actually verified (sentences ≥25 chars) and the tourist chrome's own "Sign out" is recorded as an explicit out-of-population decision, not an oversight |
| F-3 | review | `clock-icon.ts`'s TSDoc still prescribed the **child** combinator `[&>svg]`, which this slice's extra wrapper makes unmatchable — in the file the skill names as the precedent to read before adding a glyph | **fixed** — prescribes the descendant form. The freshness sweep missed it because it grepped docs, not source TSDoc, which the skill's own map lists as in scope |
| F-4 | review | The extracted labels dropped the `field` marker, narrowing `venue-create-card.spec.ts`'s `setField()` helper to the fields that kept it — a latent, confusing failure for the next spec that sets either field | **fixed** — the helper walks `label` directly, matching the sweep already changed for the same reason |
| F-5 | review | The two rewritten outbox strings were pinned by nothing, leaving the one member fixed *as copy* free to drift straight back | **fixed** — each spec now asserts its own page's phrase |
| F-6 | review | The surface specs' `not.toBe('')` passes for any text, so nothing in the unit suite proved a surface mounts the **right** note; the only cross-surface pin was an e2e the session could not run | **fixed** — each surface pins the clause `sales close at`: enough to identify the note, short of re-typing the sentence |
| F-7 | review | Every new component's TSDoc was written as changelog and decision history with issue numbers, which `frontend/.claude/CLAUDE.md` forbids (`states the contract, not the changelog`) | **fixed** — all eight rewritten as contracts. F-3 is the standing demonstration of why: narrated history goes stale the moment it stops being current |
| F-8 | review | `booking-pay.scss` / `booking-confirmation.scss` were touched without migration or a recorded deferral — only `app.scss` got one | **fixed** — #739 extended to name all three stylesheets, applying the deferral rationale the maintainer already granted for the identical situation |
| F-9 | review | Unconstrained `string` inputs re-opened by type the drift the extraction closed by markup | **partially fixed** — `LegalConsent.lead` is now the union `ConsentLead`; `ManageBookingLink.skin` is gone entirely with F-1. The test-id inputs stay `string` deliberately: they are identifiers, not a closed vocabulary, and a union of them would have to be edited by every new call site |
| F-10 | review | The attribute-selector exemption is a hand-maintained list of file paths, so a future attribute component fails with an error pointing at the selector rather than the allowlist | **accepted, not fixed** — the list is the deliberate choice recorded in D-3: a glob would have to key on a naming convention the repo does not have, and widening the rule globally would stop it catching a component that *should* have been an element. `riviera-tailwind` rule 1 now names the override explicitly so the next author is pointed at it rather than at an inline disable |
| F-11 | review | `testId()` was a plain method behind five template bindings in a sticky header, re-allocating five strings on every change-detection pass | **fixed** — one `computed()` record |

---

## File structure

- `docs/plans/cutoff-sentence-single-source.md` — this plan
- `frontend/src/app/shared/cutoff-note.ts` — the shared note component (new)
- `frontend/src/app/shared/cutoff-note.spec.ts` — its unit spec, and the copy pin (new)
- `frontend/src/app/pages/home/home.ts|.html` — Discover mounts the shared note
- `frontend/src/app/pages/home/home.spec.ts` — the cutoff case stops re-typing the sentence
- `frontend/src/app/venue/venue-map.ts|.html` — the map mounts the shared note
- `frontend/src/app/venue/venue-map.spec.ts` — same, keeping its unrelated `min` assertion
- `frontend/e2e/discovery-flow.e2e.ts` — the cross-surface parity assertion (AC-3)
- `frontend/eslint.config.js` — a file-scoped override so `component-selector` checks the
  attribute-selector components in attribute mode (see D-3)

**The #738 population, folded in at the maintainer's direction (D-4):**

- `frontend/src/app/admin/admin-forbidden.ts|.spec.ts` — the access-denied line, ×7 → 1 (new)
- `frontend/src/app/admin/{admin-audit,admin-commissions,admin-mail-outbox,admin-operators,admin-privacy,admin-refund-outbox,admin-venue-photos}.ts` — the seven call sites; the two outboxes also get the copy fix
- `frontend/src/app/booking/legal-consent.ts|.spec.ts` — the consent sentence + both document links, ×2 → 1 (new)
- `frontend/src/app/booking/manage-booking-link.ts|.spec.ts` — the manage-booking link, ×2 → 1 (new)
- `frontend/src/app/booking/{booking-dialog,booking-pay,booking-confirmation}.ts` — their call sites
- `frontend/src/app/shared/legal-footer.ts|.spec.ts` — the footer notice, ×2 → 1 (new)
- `frontend/src/app/app.ts|.html` — the tourist chrome's footer call site
- `frontend/src/app/operator/operator-actions.ts|.spec.ts` — the operator nav cluster, ×2 → 1 (new)
- `frontend/src/app/operator/{operator-chrome.ts,operator-console.ts,operator-console.html}` — the two headers' call sites + the console footer
- `frontend/src/app/operator/booking-mode-field.ts|.spec.ts`, `booking-cutoff-field.ts|.spec.ts` — the two venue form fields, ×2 → 1 each (new)
- `frontend/src/app/operator/{venue-create-card.ts,venue-create-card.html,venue-tab.ts,venue-tab.html}` — their call sites; the create card's form model gains an explicit type
- `frontend/src/app/operator/venue-create-card.spec.ts` — its field sweep and `setField` helper stop keying on an inert marker class
- `frontend/src/app/admin/admin-mail-outbox.spec.ts`, `admin-refund-outbox.spec.ts` — each pins its page's own error copy (review finding F-5)
- `frontend/src/app/shared/clock-icon.ts` — its TSDoc prescribed the child combinator `[&>svg]`, which this slice's extra wrapper makes unmatchable (review finding F-3)
- `.claude/skills/riviera-tailwind/SKILL.md` — rule 1's taxonomy gains the third branch this
  slice introduces (attribute-selector component over a native element)

---

## Phase 0 — The shared cutoff-note seam

**Files:** Create `frontend/src/app/shared/cutoff-note.ts` · Test `frontend/src/app/shared/cutoff-note.spec.ts`

- [ ] **Step 1:** Write `cutoff-note.spec.ts` **first**, red — a host `<p appCutoffNote>` in a
  test component renders the exact sentence (normalized compare **and** a separate `6 PM`
  assertion, per R-4), carries `data-testid="cutoff-note"`, contains an `aria-hidden` `<svg>`
  and no `⏰`, and merges its host classes with a call-site class (AC-6).
- [ ] **Step 2:** Write the component: `selector: 'p[appCutoffNote]'`, host
  `class: 'inline-flex items-center gap-1 leading-[1.35]'` + `data-testid`, template
  `<app-clock-icon /><span>…</span>`, TSDoc carrying the invariant-#4 statement the two
  template comments used to hold.
- [ ] **Step 3:** `npx ng test --watch=false --include="src/app/shared/cutoff-note.spec.ts"` → green.

## Phase 1 — Both surfaces adopt it; the specs stop re-typing the copy

**Files:** Modify `home.html|.ts`, `venue-map.html|.ts` · Test `home.spec.ts`, `venue-map.spec.ts`

- [ ] **Step 1:** Rewrite both surface specs' cutoff cases red — assert the note mounted
  (`[data-testid="cutoff-note"]` now exists only via the component), that it is still a `<p>`,
  and each surface's own concerns; delete the re-typed sentences.
- [ ] **Step 2:** Swap both templates to `<p appCutoffNote class="…skin…" …></p>`, moving
  Discover's `[&_svg]:size-[15px]` onto the `<p>` and dropping the dead `.cutoff-note` marker
  and the two duplicated comments; update both `imports:` arrays.
- [ ] **Step 3:** `npx ng test --watch=false --include="src/app/pages/home/**/*.spec.ts" --include="src/app/venue/venue-map*.spec.ts"` → green, contrast specs unedited.
- [ ] **Step 4:** Generalization-audit pass — enumerate by **mechanism** (surfaces stating the
  cutoff rule in prose), not by resemblance, and record the command in the log below.

## Phase 2 — The cross-surface parity assertion

**Files:** Modify `frontend/e2e/discovery-flow.e2e.ts`

- [ ] **Step 1:** In the Discover → map walk, capture the Discover note's text, assert it is
  non-empty and matches the sentence's shape, then after landing on `/venues/1` assert the map
  note's text **equals the captured value** (AC-3, R-7).
- [ ] **Step 2:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.

## Phase 3 — Close-out

**Files:** Modify `.claude/skills/riviera-tailwind/SKILL.md`, this plan doc

- [ ] **Step 1:** Run AC-2's mutation check and revert it.
- [ ] **Step 2:** `riviera-docs-freshness` over the slice's range, incl. the counting sweep.
- [ ] **Step 3:** `node scripts/check-plan-file-structure.mjs --diff origin/main` with this doc staged.
- [ ] **Step 4:** Review gate, Sonar gate, final Execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | Phase 1 | **Surfaces stating the cutoff rule in prose**, keyed by *wording* rather than by the `cutoff-note` test id — re-running #734's sweep to confirm this slice's Non-goals still describe reality | `grep -rniE "6\s*(&nbsp;\|\xc2\xa0\| )?PM\|evening before\|day before\|same.day\|closes? (the )?(evening\|day)" frontend/src frontend/e2e --include=*.html --include=*.ts` | 8, all previously enumerated: `booking/booking-dialog.ts`, `booking/booking-view.ts`, `admin/admin-commissions.ts`, the three `pages/legal/terms-of-service.*`, `e2e/legal-pages.e2e.ts`, `e2e/discovery-flow.e2e.ts` | **None.** Unchanged from #734 — the two `booking/` hits state the **cancellation** policy (invariant #10), `admin-commissions` explains accrual to an admin, the legal pages state the rule in legal register with no clock time, and the `discovery-flow` hit is this slice's own browser pin. Non-goals verified against the tree, not recalled |
| 2026-08-21 | Phase 1 | **The real mechanism: any user-facing sentence rendered from more than one template** — *not* "places that mention the cutoff". Keying on the cutoff would have returned clean and hidden the population, which is #641's lesson exactly. Enumerated by extracting every ≥25-char text run from every tracked `.html` and inline `template:` and grouping by normalized text | a throwaway script over `git ls-files 'frontend/src/**/*.html' 'frontend/src/**/*.ts'`, grouping `/>([^<>{}@]{25,})</g` matches by normalized text (recorded in the follow-up issue; it is a rough enumerator, not a guard — it also matches TS generics) | **7 further members** beyond this slice's: "You don't have access to this page." ×**7** (`admin/*.ts`), "Sign out" ×3, "Booking cutoff (Europe/Tirane)" ×2 (`operator/venue-create-card.html`, `venue-tab.html`), "Something went wrong loading the outbox." ×2, "View or manage this booking" ×2, "and acknowledge our" ×2, "© Riviera Sunbed Booking ·" ×2 | **All — the rest fixed here too, at the maintainer's direction (D-4).** Originally raised as #738; Each carries the identical failure mode (per-template specs, so a copy edit to one sibling leaves the others green and stale), but the maintainer chose to fix them in this PR rather than defer. Both judgements the enumeration raised held up: the outbox pair was indeed a **copy bug** (fixed as copy, not deduplicated), and two entries were tips of structural duplications whose real seams were extracted instead of their bare words |
| 2026-08-21 | Phase 4 (fix round) | **Re-run of the same enumerator over the finished tree** — #373's rule that a fix round can create its own staleness, applied to the audit's own population | the same script | 11 hits, **all** TypeScript false positives (generics and spec boilerplate between `>` and `<`); zero real template copy | **None needed.** The population is empty, which is AC-7 |
| 2026-08-21 | Close-out (review F-2) | **The tourist chrome's own "Sign out"** — `app.html` renders it twice (desktop and mobile nav) and the operator cluster renders it once, so the string still spans two templates after the fix | `grep -rn "Sign out" frontend/src` | `app.html` ×2, `operator-actions.ts` ×1 | **Out of population, deliberately — and stated rather than left implied.** The tourist chrome signs out a **customer session**; the operator cluster an **operator session**. They are two different actions that share a two-word label, and a shared primitive would couple two chromes that are deliberately separate for no drift benefit — a copy edit to one is not an edit the other wants. The two inside `app.html` are one template's desktop and mobile nav, not a cross-file duplicate. This is the same call the 8-char run below makes for short labels generally |
| 2026-08-21 | Phase 4 | **The threshold's own blind spot** — the enumerator keys on runs of ≥25 chars, so shorter repeated strings are invisible to it. Re-run at 8 chars to see what the cutoff hid | the same script with `{8,}` | dozens: "Booking code" ×5, "New password" ×3, "Email address" ×2, "Back to home" ×2, "All beaches" ×2, … | **Out of population, deliberately.** These are short field labels and button captions — normal UI vocabulary, not drifting prose, and sharing them would couple unrelated features for no drift benefit. The 25-char threshold is a reasonable proxy for "sentence"; recording the 8-char run is what makes that a judgement rather than an accident of the cutoff |

---

## Acceptance-criteria verification (final)

> The commands `#735` implies use bare `npx vitest`, which **cannot** run this repo's specs —
> the setup file is registered in `vitest-base.config.ts` and applied by the
> `@angular/build:unit-test` builder, so a bare run dies with `describe is not defined`
> (ADR-0014 / #663). Go through `ng test` instead.

- [x] **AC-1:** `grep -rln "sales close at 6" frontend/src frontend/e2e` → exactly three:
  `shared/cutoff-note.ts`, `shared/cutoff-note.spec.ts`, `e2e/discovery-flow.e2e.ts`. Before the
  swap the same command returned seven. Verified at `03757fe`.
- [x] **AC-2:** mutation run — the source sentence changed to "7 PM" and nothing else. Result:
  **2 failures, both in `cutoff-note.spec.ts`** (the exact-sentence compare and the no-break-space
  pin); 160 other tests passed. Critically, **both surfaces rendered "7 PM"** — no site stayed on
  the old copy, which is the property the five duplicates could not give. Reverted; `git diff`
  clean against HEAD. The **unit** half is executed; the e2e pin's redness is established by
  inspection only — its regex asserts `sales close at 6\s+PM` literally, so "7 PM" cannot match —
  because the browser suite could not be run in this session (R-6).
- [ ] **AC-3/AC-4:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.
- [ ] **AC-5:** the surface specs + the mocked suite's axe checks.
- [x] **AC-6:** `npx ng test --watch=false --include="src/app/shared/cutoff-note.spec.ts"` →
  7 passed, including the host/call-site class merge and the `6&nbsp;PM` pin. Verified at `b3a64e8`.
- [x] **AC-7 (as scoped — see the finding F-2 correction):** the enumerator re-run over the finished
  tree → **zero** groups
  spanning more than one file once TypeScript false positives are excluded (the regex also matches
  generics between `>` and `<`, e.g. `input.required<string>` and `let params$: BehaviorSubject<…>`;
  those 11 residual hits are all `.ts` code, not template copy). Before the slice it returned 8
  real groups — this one plus #738's seven.
- [x] **Whole-suite proof for the folded-in work:** `npm test` → **1591 passed / 175 files**,
  `npx ng lint` → clean, `npm run format:check` → clean, `npm run build` → succeeded. The seven
  admin specs, both booking specs that assert the legal links, and both operator header specs are
  **unedited** and still green, which is what proves the extractions preserved behavior.
- [ ] **No-drift proof** (`riviera-tailwind`'s hard rule — computed styles, not class lists):
  a throwaway Playwright probe reads `getComputedStyle` on both notes and both glyphs before
  and after the change; deleted after the run.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #4 appears as display copy only.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — no fencing behavior changed.
- [ ] **Modulith** section filled (N/A — frontend-only).
- [ ] **Payment/payout** section filled (N/A).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — the `Europe/Tirane` clamp is untouched.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met; no `as any`; folder placement per `riviera-frontend`.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing its PR number.
- [ ] **The review gate ran in full** — the `code-review` workflow, with
      `riviera-review-overlay` layered on, not the overlay alone.
