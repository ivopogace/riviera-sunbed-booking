# Admin Photo-Moderation Surface Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A platform admin can open the admin console's **Photos** tab, pick any venue, see
its three photo slots with previews, and take one down behind an inline confirmation that
names the venue and slot — making #504's already-shipped, already-authorized `DELETE` usable
without hand-crafting a cookie-jar `curl`.

**Architecture:** The single most significant decision is that **`VenuePhotoTakedown` becomes
`VenuePhotoModeration`, carrying both the read and the write**, rather than minting a second
ownership-free port beside it. #504 separated the takedown from `VenuePhotos` so that port's
"asserts ownership *first*" promise stayed uniform; the identical argument applies to the read,
and read-then-remove by the platform is **one purposeful conversation** with one actor, one
authorization posture (the `ADMIN` role gate is the whole authorization) and one reason to
change — Cockburn's "a small number, two, three or four ports". Renaming keeps the venue
module at one moderation port instead of two narrow ones, and makes the contract statable in a
single sentence: *every method here is ownership-free by design.* The read is backed by
`PhotoStorage#listMetadata`, which has been written and tested since #142 with no production
caller — this slice is its first.

**Persistence:** JDBC only (invariant #1). **No schema change and no Flyway migration** — the
read is `PhotoStorage#listMetadata`'s existing `venue_photo`/`venue_photo_variant` query, and
the write is #504's existing `PhotoStorage#delete` cascade. No `V<n>` claimed, so no
renumbering risk against any open PR.

**Source of intent:** GitHub issue #511 (agent brief); ADR-0013 (report-and-remove moderation
stance) and #504 (the takedown this makes operable).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
canvas's Privacy tab is scoped to GDPR data-subject erasure only, killing the issue's
"fold it into Privacy" alternative, and confirmed no Flyway number is at stake) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger that pinned the
`VenuePhotoTakedown` rename's blast radius, and the Module-ownership table) · `tdd` (every
phase is red→green: the backend port/controller ITs before the endpoint, the Vitest specs
before the component) · `riviera-review-overlay` (review gate — due at ready-for-review;
RV-FE-8 consulted at plan time, see the cross-feature-import decision below) ·
`riviera-docs-freshness` (N/A at plan time — **due at merge close-out step 5** over this
PR's range, and it is non-optional here because the rename invalidates stated facts in
`CLAUDE.md`, `CONTEXT.md` and `RESPONSIBILITIES.md`) · `riviera-modulith` (settled that the
moderation port stays **internal in `application/`**, not `api/`/`spi/` — no sibling module
calls it, `VenuePhotoService` implements it, `AdminVenuePhotoController` consumes it; also
supplied the "one purposeful conversation" rule behind the rename) · `riviera-java-conventions`
(records for the read DTOs, package-private controller, no Lombok, text-block-free since no new
SQL) · `codebase-design` (rejected a separate `AdminVenuePhotoRead` port as a hypothetical seam
— same actor, same posture, no independent reason to change) · `riviera-frontend` (placement in
`admin/`, and the RV-FE-8 constraint that `admin/` must **not** import `venue/venue.service` —
the picker fetches the public catalogue through the admin feature's own service) ·
`angular-developer` + **angular-cli MCP** (`list_projects` → confirmed frameworkVersion 22 /
Vitest; `get_best_practices` → `@Service`, `inject()`, signals, `@if`/`@for`, no explicit
`OnPush`, AXE/WCAG-AA mandatory; `search_documentation` v22 → `httpResource`/`resource`
reviewed and **deliberately not adopted**, see FE-2 note, plus `NgOptimizedImage` and the a11y
guide) · `riviera-tailwind` (porcelain-glass token usage for the new tab, no `@apply`) ·
`playwright-cli` (the CI-safe mocked e2e spec) · `riviera-local-debug` (scoped Gradle/Vitest
runs; system `gradle` + JDK-25 toolchain in this cloud session, never the bare `test` task) ·
`postgres` (**N/A — no migration, no new SQL**; the two statements this slice runs both
already exist and are already tested).

**Branch:** `claude/angular-mcp-search-frontend-96bwht` — the cloud session's **designated
remote branch stands in for `feature/admin-photo-moderation`** (`riviera-sdlc` Remote/cloud
session addendum). The literal `feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with a photo in `COVER` and none in `SUNBEDS`/`BAR`, when the
      platform-admin moderation read is asked for that venue's slots, then it answers all three
      slots in `PhotoSlot` declaration order, `COVER` carrying its PREVIEW serving URL and the
      other two carrying `null` — **with no ownership check anywhere on the path**.
      *Pinned by:* `VenuePhotoServiceTest.moderationReadListsEverySlotWithoutOwnershipCheck`
- [ ] **AC-2:** Given an admin session and a venue owned by **another** operator, when
      `GET /api/admin/venues/{venueId}/photos` is called, then it answers `200` with that
      venue's slots — the case the venue-scoped profile read answers `403 NOT_VENUE_OWNER`.
      *Pinned by:* `AdminPhotoModerationIT.adminReadsAnotherOperatorsVenuePhotos`
- [ ] **AC-3:** Given a plain `OPERATOR` session, when the same read is called, then it is
      `403`; given no session, `401`. *Pinned by:*
      `AdminPhotoModerationIT.readIsForbiddenForOperatorAndUnauthenticatedAnonymously`
- [ ] **AC-4:** Given an unknown venue id, when the read is called, then it answers `200` with
      three empty slots — an unknown venue is deliberately indistinguishable from a venue with
      no photos, matching #504's takedown, which answers `404 NO_SUCH_PHOTO` to both.
      *Pinned by:* `AdminPhotoModerationIT.unknownVenueReadsAsAllSlotsEmpty`
- [ ] **AC-5:** Given the full controller set, when `EndpointRoleGateCoverageTest` runs, then it
      is green with `DECLARED_REACHABLE` **unmodified** — the new GET is explicitly gated in
      `SecurityConfig`, not fallen through. *Pinned by:* `EndpointRoleGateCoverageTest.everyEndpointIsGated`
- [ ] **AC-6:** Given the backend structural net, when it runs, then `ModularityTests`,
      `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests` and
      `PublishedSurfacePlacementArchitectureTests` are all green. *Pinned by:* those four classes.
- [ ] **AC-7:** Given an admin on `/admin/photos` who has picked a venue, when the slots load,
      then each occupied slot renders its preview and each empty slot renders an empty state.
      *Pinned by:* `admin-venue-photos.spec.ts` › `renders every slot, occupied and empty`
- [ ] **AC-8:** Given a rendered occupied slot, when Remove is pressed once, then **nothing is
      sent** and an inline confirmation naming **both the venue and the slot** appears; when the
      confirm is pressed, then the `DELETE` fires and that slot switches to its empty state
      **without a re-fetch of the whole page**. *Pinned by:*
      `admin-venue-photos.spec.ts` › `requires a second, target-naming confirmation before removing`
- [ ] **AC-9:** Given a non-admin (signed-out, or signed-in without `ROLE_ADMIN`), when
      `/admin/photos` is opened, then the tab strip and the moderation surface are never
      rendered — the page self-gates exactly like `/admin/refunds`. *Pinned by:*
      `admin-venue-photos.spec.ts` › `self-gates on the admin session`
- [ ] **AC-10:** Given the Photos tab open with a venue selected and its confirmation showing,
      when axe runs, then there are no serious violations. *Pinned by:*
      `admin-venue-photos.a11y.spec.ts`
- [ ] **AC-11:** Given the CI-safe mocked e2e suite, when it drives pick-venue → remove →
      confirm, then the slot empties in the browser and `expectNoSeriousAxeViolations` passes.
      *Pinned by:* `frontend/e2e/admin-venue-photos.e2e.ts`

## Non-goals

- The tourist-facing report button and any report queue — that is **#510**, deliberately deferred.
- An audit record of the takedown — that is **#507**, platform-wide by design.
- A CDN purge on takedown — that is **#508** (the one-year immutable `Cache-Control` means a
  takedown does not un-cache an already-served image).
- Any change to the operator's own upload/replace/delete flow, or to `VenuePhotos`.
- Bulk takedown, multi-select, or moderation of anything other than venue photos.
- A dedicated admin **venue list** endpoint — the picker reuses the public `GET /api/venues`.
- Shipping the canvas's Commissions / Payouts / Privacy tabs.
- Restoring a taken-down photo (there is nothing to restore — the bytes are gone).

## Behavior-parity ledger

> This slice replaces no *user-facing* surface, but it **renames a shipped port**
> (`VenuePhotoTakedown` → `VenuePhotoModeration`), so the ledger is filled for that rename's
> blast radius rather than left `N/A`. A rename claimed as "mechanical, no behavior change" is
> aspirational until verified behavior-by-behavior — which is exactly what this table is for.

| Old-surface behavior (`VenuePhotoTakedown`, #504) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `takedown(VenueId, PhotoSlot)` removes metadata + every variant via one `PhotoStorage#delete` | preserved | Identical method, identical body, on the renamed interface; `VenuePhotoServiceTest` assertions carry over unchanged |
| Returns `false` for an empty slot **and** for an unknown venue (→ `404 NO_SUCH_PHOTO`, indistinguishable) | preserved | Untouched; `AdminPhotoTakedownIT` keeps pinning both cases |
| No ownership check on any path | preserved → **widened** | Now the *stated contract of the whole port*, not of one method — the read inherits it (AC-1/AC-2) |
| Implemented by `VenuePhotoService` (so one delete path, not two) | preserved | Same class implements the renamed port; the read joins it there |
| Consumed only by `AdminVenuePhotoController`, ADMIN-gated in `SecurityConfig` | preserved | Same controller, now with a second mapping under the same `/api/admin/venues` prefix |
| Port lives in `venue/application/` (internal, not `api/`/`spi/`) | preserved | Unchanged — still no sibling module depends on it |
| `AdminPhotoTakedownIT` (189 lines) pins the DELETE's authz + cascade | preserved | Kept as-is; the new read's cases go in a sibling `AdminPhotoModerationIT` rather than being bolted on |
| The port's TSDoc-equivalent Javadoc explains *why* it is separate from `VenuePhotos` | changed | Rewritten to justify the port by its **posture** (ownership-free platform moderation) rather than by its one action — the rename's whole point |
| `CONTEXT.md` / `RESPONSIBILITIES.md` / `CLAUDE.md` name `VenuePhotoTakedown` | changed | Updated in this PR; `riviera-docs-freshness` at close-out is the check that none was missed |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The rename misses a reference and the build breaks late (or worse, a doc keeps the old name and the next session trusts it) | med | low | Rename via a single grep-verified sweep across `main`+`test`+`docs`; `riviera-docs-freshness` at close-out is the second net | agent | open |
| R-2 | **BOLA inversion (invariant #13):** the new read is ownership-free *by design*, so a copy-paste of its controller into a `/api/venues/**` path would leak another operator's data | low | high | The endpoint lives **only** under `/api/admin/**` (the invariant-#13 exemption), is gated `hasRole(ADMIN)` by an explicit `SecurityConfig` matcher, and AC-3 pins `403`/`401`; `EndpointRoleGateCoverageTest` (AC-5) fails if it ever falls through | agent | open |
| R-3 | The new `GET /api/admin/venues/*/photos` accidentally shadows, or is shadowed by, #504's `DELETE /api/admin/venues/*/photos/*` matcher | low | high | Different segment count **and** different verb; both matchers are `HttpMethod`-qualified; AC-3 + the existing `AdminPhotoTakedownIT` run together | agent | open |
| R-4 | The picker's public `GET /api/venues` is a heavyweight read (per-venue availability join, cover photos, prices) used only for id+name | high | low | Accepted deliberately: it is public data, lists **every** venue with no publish filter, and costs zero new backend surface. Revisit only if a venue count makes it slow — noted in Open Questions | agent | open |
| R-5 | `admin/` importing `venue/venue.service` would create a **new** cross-feature edge — RV-FE-8 Major (Blocker if `shared/`-directed) | med | med | The admin feature's own service issues the catalogue request; only **types** are shared, via `shared/venue-views.ts`, which every stratum may import | agent | open |
| R-6 | A single misclick destroys bytes irreversibly (no undo, no audit until #507) | med | high | Two-step inline confirmation naming venue **and** slot (AC-8), reusing the `admin-operators` `confirmingId` precedent; no modal, so nothing to focus-trap | agent | open |
| R-7 | Error-contract drift — a per-controller `{"error": …}` body instead of the centralized RFC-7807 `ProblemDetail` (#97, `riviera-java-conventions` §6b) | low | med | The read's only non-200 outcomes are the filter-chain's `401`/`403`; it introduces **no** new error body. The DELETE's `404 NO_SUCH_PHOTO` is #504's, unchanged | agent | open |
| R-8 | The frozen Vitest clock (Mon 2026-06-15, `src/test-setup.ts`) trips a spec that assumes the real calendar | low | low | No date logic in this slice; the picker sends no `date` param and lets the server default to tomorrow-in-Tirane | agent | open |

## Open questions / Assumptions

- **Assumption:** The moderation read returns **all three slots** (empty ones as
  `previewUrl: null`), not "each occupied slot" as #511's desired-behavior text says. Rationale:
  it mirrors the already-shipped `PhotoSlotView` / `VenueProfileResponse.photos` contract, whose
  #142 review decision **F-11** was explicitly *"emptiness IS the null URL; a separate boolean
  would be derivable lock-step state"* — and it makes AC-8's "reflects the now-empty slot
  without a full reload" a one-line local update instead of a list splice. Deviation is
  deliberate and recorded here. — *Owner:* agent · *Resolves by:* phase 1 (review may overrule)
- **Assumption:** The venue picker may load the whole catalogue unpaginated (R-4). At the
  current venue count this is a non-issue; a search/paginate pass is a follow-up, not this
  slice. — *Owner:* agent · *Resolves by:* phase 4
- **Assumption:** The preview uses the **PREVIEW** surface variant (the operator-slot variant),
  not CARD or BANNER — it is the one sized for exactly this job. — *Owner:* agent · *Resolves by:* phase 1

### Resolved

- **Open question:** Standalone tab vs folding into the canvas's Privacy tab (#511's "one
  genuine design call"). — **Resolved: a standalone `Photos` tab.** The grill established that
  the canvas's Privacy tab is scoped entirely to GDPR **data-subject erasure**
  (`POST /api/admin/erasure`, "Erase a data subject") with nothing about content moderation.
  Erasing a person's data and removing content that harms others are different jobs, different
  actors and different triggers; folding them together is a category error. `AdminConsoleTabs`'
  own Javadoc already states the strip lists **what ships**, not what the canvas draws.
  Confirmed by the user at plan time.
- **Open question:** New port vs a method on the existing one. — **Resolved: rename
  `VenuePhotoTakedown` → `VenuePhotoModeration` and put both methods on it.** See Architecture.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice touches only `venue_photo` /
`venue_photo_variant`; it never reads or writes `availability(set_id, booking_date)`, creates
no booking, and holds no set. Invariants #3 (pool separation) and #4 (cutoff) are likewise
untouched — there is no bookable resource anywhere on this path. The only concurrency question
is two admins removing the same slot at once, which resolves harmlessly: `PhotoStorage#delete`
returns `true` for the winner and `false` for the loser, and the loser's UI shows the same
already-empty slot either way (#504's semantics, unchanged).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | `venue` owns venue photos end-to-end (#142, ADR-0008) including the platform-admin takedown (#504). The moderation **read** is the same data under the same authority — it belongs beside the write it exists to serve |

No other backend module is touched: no event is published or consumed, and no sibling module
learns anything new.

**Cross-module named interfaces (`api/` ports)**

**None added.** `VenuePhotoModeration` is a **driving port internal to `venue/application/`** —
`riviera-modulith`'s decision rule: others **call** it → `api/`; the module's **own** adapter
implements it → internal. Here `VenuePhotoService` (same module) implements it and
`AdminVenuePhotoController` (same module) calls it, so it is published nowhere. It is emphatically
**not** `spi/`: no *other* module implements it. `allowedDependencies` is unchanged, and no new
`@NamedInterface` appears — which is why `PublishedSurfacePlacementArchitectureTests` stays green
without edits (AC-6).

**Domain events (id-based payloads, invariant #11)**

**None.** A takedown publishes no event today (#504) and this slice does not add one — the audit
trail that would justify one is **#507**, explicitly out of scope. Nothing subscribes, so nothing
needs a Flyway `event_type` rewrite.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Read any venue's photo slots **without an ownership check**, for platform moderation | `venue` | `venue` **Job** already includes "venue photos (#142, ADR-0008) incl. the platform-admin takedown … the module's one **ownership-free** photo write". This adds the matching ownership-free *read* to the same module, on the same port. No other module claims photos; nothing on any **Not-My-Job** list covers it — `operator` owns the operator↔venue *mapping*, which is precisely what this path deliberately does not consult |
| Rename the ownership-free port to name its posture rather than its one action | `venue` | Internal to the module; no published surface moves, so no consumer outside `venue` can observe it |
| Serve the preview URL for a slot | `venue` | Same module already owns `PhotoServingUrls` + the content-addressed serving route; the admin read reuses both rather than minting a second URL convention |

All in `venue`; **no boundary change.**

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no amount is computed, displayed or stored, no
Stripe call is made, and the payout ledger is not read or written. Removing a photo has no
financial effect whatsoever.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-venue-photos.ts` | new | standalone component, lazy-routed at `/admin/photos` | Signals: `venues`, `selectedVenueId`, `slots`, `confirming`, `busy`, `notice`, `loadError`; `effect()` gated on `auth.restoring()`/`auth.isAdmin()` exactly like `AdminRefundOutbox` | none — a `<select>`-style picker + buttons, no form model |
| FE-2 | `admin/admin-venue-photos.service.ts` | new | `@Service()` HTTP client | stateless; `firstValueFrom` promises, component holds the state | — |
| FE-3 | `admin/admin-console-tabs.ts` | modified | standalone component | adds the 4th tab entry `{ path: '/admin/photos', label: 'Photos', testId: 'admin-tab-photos' }` | — |
| FE-4 | `app.routes.ts` | modified | route table | new lazy route `admin/photos` with a `title`, placed with the other `admin/*` routes | — |
| FE-5 | `admin/admin.model.ts` | modified | types | adds `AdminPhotoSlotView` / `AdminVenuePhotosView` + the `PhotoSlotKey` the tab uses | — |

**Standards:** standalone components (no `standalone: true` — default since v20), no explicit
`ChangeDetectionStrategy.OnPush` (default in v22), `inject()`, `@Service()`, signals +
`computed()`, `@if`/`@for` native control flow, `class`/`style` bindings (never `ngClass`/`ngStyle`),
Tailwind-only styling on the porcelain-glass tokens, and AXE/WCAG-AA as a hard gate (AC-10).
All confirmed against the angular-cli MCP's `get_best_practices` for this workspace
(frameworkVersion **22**, unit framework **Vitest**, via `list_projects`).

**Two documented deviations, both deliberate:**

1. **`httpResource`/`resource` not adopted.** The MCP's `search_documentation` (v22) surfaced
   `httpResource` (`angular.dev/guide/http/http-resource`) and the Resources API
   (`angular.dev/guide/signals/resource`) as the modern signal-native fetch. Every existing
   admin tab (`admin-operators`, `admin-mail-outbox`, `admin-mail-delivery`,
   `admin-refund-outbox`) instead uses `@Service` + `firstValueFrom` with component-held
   signals. Introducing a second data-loading idiom in the fourth tab of a four-tab console
   would make the console read as two codebases; consistency wins here, and a console-wide
   migration is a legitimate separate slice.
2. **`NgOptimizedImage` not used for the slot previews.** The best-practices guide says to use
   it "for all static images"; these are **dynamic, content-addressed** URLs whose dimensions
   vary per upload, rendered at most three at a time, below the fold, behind an admin gate —
   none of the LCP/preconnect/priority machinery applies, and `ngSrc` would demand
   `width`/`height` the read does not carry. The operator console's own photo slots (#142) made
   the same call. Plain `<img loading="lazy" alt="…">`.

## FE↔BE contract

- **New endpoint:** `GET /api/admin/venues/{venueId}/photos` → `200 application/json`

  ```jsonc
  {
    "venueId": 42,
    "photos": {                       // every slot, always — lower-case keys, PhotoSlot declaration order
      "cover":   { "previewUrl": "/api/venues/42/photos/9f3c…" },
      "sunbeds": { "previewUrl": null },   // null === empty slot (#142 review F-11)
      "bar":     { "previewUrl": null }
    }
  }
  ```

  Role-gated `ADMIN`, **no ownership check** (invariant #13's `/api/admin/**` exemption).
  `401` unauthenticated, `403` for a plain operator. An unknown venue answers `200` with three
  null slots — deliberately indistinguishable from a venue with no photos, matching #504's
  takedown behaviour. The key/shape deliberately mirrors `VenueProfileResponse.photos` so the
  two photo reads speak one vocabulary.
- **Existing endpoint reused unchanged:** `DELETE /api/admin/venues/{venueId}/photos/{slot}`
  (#504) — `204`, or `404 NO_SUCH_PHOTO`.
- **Existing endpoint reused unchanged:** `GET /api/venues` (public catalogue) as the venue
  picker's source. No new admin venue-list endpoint (Non-goals).
- **Client typing:** hand-written typed service (`admin-venue-photos.service.ts`) against
  interfaces in `admin.model.ts`; venue rows typed by `shared/venue-views.ts`. **No `as any`.**
  Preview paths are resolved through the existing `shared/photo-url.ts` `apiPhotoUrl()` at the
  service boundary (#142 review F-7) so components keep treating them as opaque strings.
- **Money/date on the wire:** none — this contract carries neither.

## Execution status

> **This section is the session-recovery anchor.** Long sessions get compacted
> (summarized) and lose fine-grained state; a fresh session starts with none.
> Everything a resuming session needs lives HERE, committed — never only in the
> conversation. After a context compaction, in a fresh session, or whenever unsure
> where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window
> as the change it records — at every phase boundary AND every SDLC stage
> transition (plan → implement → CI → PR → review → sonar → merge).

**Stage pointer:** `implement — phase 0 done, entering phase 1`

**Next action:** Phase 1 — write the failing
`VenuePhotoServiceTest.moderationReadListsEverySlotWithoutOwnershipCheck`, then add
`slotsOf(VenueId)` to the port backed by `PhotoStorage#listMetadata`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Rename the port to name its posture | ✅ | see "Rename VenuePhotoTakedown…" |
| 1 — The moderation read (service + port method) | ⏳ | |
| 2 — The admin GET endpoint + role gate | | |
| 3 — The Photos tab (service, component, tab, route) | | |
| 4 — a11y spec + CI-safe e2e | | |
| 5 — Docs freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend — `platform/src/main/java/ai/riviera/platform/`**

- `venue/application/VenuePhotoModeration.java` — **renamed** from `VenuePhotoTakedown.java`;
  gains `slotsOf(VenueId)` beside `takedown(VenueId, PhotoSlot)`. The ownership-free contract is
  restated as the port's, not one method's.
- `venue/application/VenuePhotoService.java` — implements the new read via
  `PhotoStorage#listMetadata` + `PhotoServingUrls`; `takedown` untouched.
- `venue/adapter/in/AdminVenuePhotoController.java` — adds the `@GetMapping("/{venueId}/photos")`.
- `venue/adapter/in/AdminVenuePhotosResponse.java` — **new** response record (slot-keyed map,
  mirroring `VenueProfileResponse.photos`).
- `SecurityConfig.java` — new `ADMIN_VENUE_PHOTOS_PATH = "/api/admin/venues/*/photos"` +
  a `HttpMethod.GET … hasRole(ADMIN_ROLE)` matcher beside #504's DELETE.

**Backend tests — `platform/src/test/java/ai/riviera/platform/`**

- `venue/application/VenuePhotoServiceTest.java` — modified: AC-1.
- `venue/AdminPhotoModerationIT.java` — **new**: AC-2, AC-3, AC-4.
- `venue/AdminPhotoTakedownIT.java` — modified only where it names the renamed port.
- `WebSliceStubs.java` — modified: the stub bean follows the rename.

**Frontend — `frontend/src/app/`**

- `admin/admin-venue-photos.service.ts` — **new**: catalogue read, slots read, takedown.
- `admin/admin-venue-photos.ts` — **new**: the Photos tab component.
- `admin/admin-venue-photos.spec.ts` — **new**: AC-7, AC-8, AC-9.
- `admin/admin-venue-photos.a11y.spec.ts` — **new**: AC-10.
- `admin/admin.model.ts` — modified: the two view types + `PhotoSlotKey`.
- `admin/admin-console-tabs.ts` — modified: the 4th tab.
- `admin/admin-console-tabs.spec.ts` — modified: asserts four tabs.
- `app.routes.ts` — modified: the `admin/photos` lazy route.

**Frontend e2e**

- `frontend/e2e/admin-venue-photos.e2e.ts` — **new** (CI-safe mocked suite): AC-11.

**Docs**

- `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md` — the rename + the new read.
- `docs/plans/admin-photo-moderation.md` — this file.

---

## Phase 0 — Rename the port to name its posture

**Files:** Rename `venue/application/VenuePhotoTakedown.java` → `VenuePhotoModeration.java` ·
Modify `VenuePhotoService.java`, `AdminVenuePhotoController.java`, `WebSliceStubs.java`,
`VenuePhotoServiceTest.java`, `AdminPhotoTakedownIT.java`

- [ ] **Step 1: Prove the pre-rename baseline is green** —
      `gradle test --tests "*VenuePhotoServiceTest*" --tests "*AdminPhotoTakedownIT*"` → PASS.
      A rename is only safe from a known-green start.
- [ ] **Step 2: Rename the type and rewrite its Javadoc** to justify the port by its ownership-free
      **posture** rather than by its single action, so the read that lands in phase 1 has a home
      whose contract already covers it.
- [ ] **Step 3: Sweep every reference** — `grep -rn "VenuePhotoTakedown" platform/ docs/ *.md` must
      return zero hits before proceeding.
- [ ] **Step 4: Re-run the same two classes** → PASS, unchanged assertions. Behavior parity for
      every row of the ledger above is exactly what this proves.
- [ ] **Step 5: Structural net** — `gradle test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "Rename VenuePhotoTakedown to VenuePhotoModeration (#511)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The moderation read

**Files:** Modify `VenuePhotoModeration.java`, `VenuePhotoService.java` · Test `VenuePhotoServiceTest.java`

- [ ] **Step 1: Write the failing test** — `moderationReadListsEverySlotWithoutOwnershipCheck`
      (AC-1): seed `InMemoryPhotoStorage` with a COVER photo only, assert three slots back in
      declaration order with only COVER carrying a URL, and assert the ownership port is never
      consulted (the existing test double already records calls).
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*VenuePhotoServiceTest*"` →
      FAIL (no such method).
- [ ] **Step 3: Minimal implementation** — `slotsOf` on the port; in the service, map
      `PhotoStorage#listMetadata` → PREVIEW variant → `PhotoServingUrls.servingUrl`, then project
      across `PhotoSlot.values()` so absent slots come back null. Reuse `PhotoSlotView`.
- [ ] **Step 4: Run it, verify it passes** → PASS.
- [ ] **Step 5: Generalization-audit pass** — search for other places that project
      "metadata list → all slots" (`JdbcVenues.slotPhotos` does the same shape). Decide whether
      to converge or leave them; record the decision in the log.
- [ ] **Step 6: Commit** — `git commit -m "Add the ownership-free venue-photo moderation read (#511)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The admin GET endpoint + role gate

**Files:** Modify `AdminVenuePhotoController.java`, `SecurityConfig.java` · Create
`AdminVenuePhotosResponse.java`, `AdminPhotoModerationIT.java`

- [ ] **Step 1: Write the failing tests** — `AdminPhotoModerationIT` covering AC-2 (admin reads a
      venue owned by another operator → 200), AC-3 (operator → 403; anonymous → 401), AC-4
      (unknown venue → 200, three nulls). Model it on `AdminPhotoTakedownIT`'s fixtures.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*AdminPhotoModerationIT*"` →
      FAIL (404, no mapping).
- [ ] **Step 3: Minimal implementation** — the `@GetMapping("/{venueId}/photos")` returning
      `AdminVenuePhotosResponse`, plus the `SecurityConfig` GET matcher.
- [ ] **Step 4: Run it, verify it passes**, then the gate guard —
      `gradle test --tests "*AdminPhotoModerationIT*" --tests "*EndpointRoleGateCoverageTest*" --tests "*AdminPhotoTakedownIT*" --tests "*CrossVenueDenialIT*"` → PASS with
      `DECLARED_REACHABLE` **unmodified** (AC-5), and #504's DELETE still green (R-3).
- [ ] **Step 5: Generalization-audit pass** — check the other `/api/admin/**` matchers for the
      same verb-qualification discipline.
- [ ] **Step 6: Commit** — `git commit -m "Expose GET /api/admin/venues/{venueId}/photos (#511)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — The Photos tab

**Files:** Create `admin-venue-photos.service.ts`, `admin-venue-photos.ts`,
`admin-venue-photos.spec.ts` · Modify `admin.model.ts`, `admin-console-tabs.ts`,
`admin-console-tabs.spec.ts`, `app.routes.ts`

- [ ] **Step 1: Write the failing specs** — `admin-venue-photos.spec.ts` for AC-7, AC-8, AC-9;
      extend `admin-console-tabs.spec.ts` to four tabs. Mock `HttpClient`; assert **no** DELETE
      fires on the first Remove press.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- admin-venue-photos admin-console-tabs` → FAIL.
- [ ] **Step 3: Minimal implementation** — the service (catalogue + slots + takedown, preview URLs
      through `apiPhotoUrl`), the component (self-gating branches copied from `AdminRefundOutbox`,
      picker, slot grid, `confirming` signal keyed by slot per the `admin-operators` precedent),
      the tab entry, the route.
- [ ] **Step 4: Run them, verify they pass**, then `npm run lint`.
- [ ] **Step 5: Generalization-audit pass** — the four admin tabs now share a self-gating
      preamble; decide whether to extract it or leave it (bias: leave, extraction is its own slice).
- [ ] **Step 6: Commit** — `git commit -m "Add the admin console's Photos moderation tab (#511)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — a11y spec + CI-safe e2e

**Files:** Create `admin-venue-photos.a11y.spec.ts`, `frontend/e2e/admin-venue-photos.e2e.ts`

- [ ] **Step 1: Write the failing specs** — the a11y spec (AC-10) with the confirmation **open**,
      since that state adds live-region and button semantics the closed state never exercises; the
      e2e (AC-11) driving pick → remove → confirm against `page.route` mocks, ending in
      `expectNoSeriousAxeViolations`.
- [ ] **Step 2: Run them, verify they fail** — `npm run test:a11y` and
      `npm run test:e2e:a11y -- admin-venue-photos` → FAIL.
- [ ] **Step 3: Minimal implementation** — fix whatever the axe/e2e runs surface (label
      association on the picker, `role="status"` on the notice, accessible names on the
      per-slot Remove/confirm buttons).
- [ ] **Step 4: Run them, verify they pass.**
- [ ] **Step 5: Generalization-audit pass** — if a violation class is found, check the other three
      admin tabs for the same defect and record the sweep.
- [ ] **Step 6: Commit** — `git commit -m "Cover the Photos moderation tab with a11y + e2e specs (#511)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — Docs freshness + close-out

**Files:** Modify `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, this plan doc

- [ ] **Step 1: Run `riviera-docs-freshness`** over this PR's range. It is **mandatory**, not
      discretionary: the phase-0 rename invalidates every doc naming `VenuePhotoTakedown`, and
      the counting sweep matters here — `venue` gains a **second** ownership-free photo
      operation, so any doc saying "the module's one ownership-free photo write" goes stale
      **outside the diff**.
- [ ] **Step 2: Patch every stale statement** it finds.
- [ ] **Step 3: Finalize the Execution status** — stage pointer DONE, every phase ✅ with its
      commit, Open Questions empty, every risk row closed, AC pin-names matching the tests that
      shipped, citing **`merged via PR #NN`** (never a merge SHA).
- [ ] **Step 4: Commit** — `git commit -m "Close out the admin photo-moderation slice (#511)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `gradle test --tests "*VenuePhotoServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2/3/4:** `gradle test --tests "*AdminPhotoModerationIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** `gradle test --tests "*EndpointRoleGateCoverageTest*"` → PASS, `DECLARED_REACHABLE` unmodified in the diff. Verified at commit `<sha>`.
- [ ] **AC-6:** `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7/8/9:** `npm test -- admin-venue-photos` → PASS. Verified at commit `<sha>`.
- [ ] **AC-10:** `npm run test:a11y` → PASS. Verified at commit `<sha>`.
- [ ] **AC-11:** `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A` — no availability row is read or written).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — vacuously; no bookable resource in scope.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new published surface (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`); no money in scope (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — no date arithmetic in scope.
- [ ] Booking codes unguessable (invariant #7) — no booking identifier on this surface.
- [ ] Flyway migration present for schema changes (invariant #12) — **none needed**, no schema change.
- [ ] **Invariant #13:** the new read is ownership-free **by design** and lives only under
      `/api/admin/**` behind an explicit `hasRole(ADMIN)` matcher; `CrossVenueDenialIT` still green.
- [ ] **Frontend** standards met; the two deviations (`httpResource`, `NgOptimizedImage`) are
      documented above with reasons; no `as any` on the contract.
- [ ] No **new** cross-feature import (RV-FE-8) — `admin/` takes types from `shared/`, never
      `venue/venue.service`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`, so no docs-only follow-up PR.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
