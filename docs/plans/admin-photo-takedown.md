# Admin Photo Takedown Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give the platform admin a role-gated `DELETE /api/admin/venues/{venueId}/photos/{slot}`
that removes **any** venue's photo — metadata + every variant, one statement — so the "remove" half
of the report-and-remove moderation stance (#230) exists without asking the operator or hand-running SQL.

**Architecture:** The single significant decision is **a separate one-method driving port,
`VenuePhotoTakedown`, rather than a fourth method on `VenuePhotos`.** `VenuePhotos`'s interface
carries a promise — *its two writes assert per-venue ownership first* (invariant #13) — and an
ownership-free `takedown` hung off it would make that promise per-method, i.e. something every future
caller has to re-read rather than rely on. The takedown is also a genuinely different conversation
(Cockburn): platform moderation by an actor who owns nothing, versus a venue managing its own
profile. Both ports are implemented by the existing `VenuePhotoService` and both funnel into the one
`PhotoStorage#delete`, so the deletion logic exists exactly once.

**Persistence:** JDBC only (invariant #1). **No schema change and no Flyway migration** —
`venue_photo_variant.photo_id REFERENCES venue_photo (id) ON DELETE CASCADE` (V24) already makes the
existing single-statement `DELETE FROM venue_photo WHERE venue_id = :v AND slot = :s` erase metadata
and every variant blob together.

**Source of intent:** GitHub issue #504 (child of #230; reuses #142 / ADR-0008).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
bootstrap `operator` carries **both** ADMIN and OPERATOR, so a plain second operator must be
provisioned to prove the 403; and that the "serving URLs 404" AC has a duplicate-hash exception,
R-3) · `riviera-plan-doc` (this template — forced the Module-ownership table and the parity ledger
that pinned "the operator delete stays byte-for-byte") · `tdd` (each phase is a failing test first:
port-level unit spec before the service method, IT before the controller) ·
`riviera-review-overlay` (review gate — ran at ready-for-review, backend bank + the wire-shape half
of the contract bank; 2 findings, both fixed — see the findings register and the review-gate note) ·
`riviera-docs-freshness` (**ran** pre-merge over `origin/main...HEAD`, folded into this PR rather
than a docs-only follow-up: rename grep clean, counting sweep clean (18 hits read, every "two/three"
a different subject), **2 findings from the top-down walk, both patched** — see the docs-freshness
note) · `riviera-modulith` (placed the new port in `venue/application/` not `api/` — no sibling
module calls it — and the controller in `venue/adapter/in/`, the #391 host-it-in-the-module
precedent; confirmed no `allowedDependencies` change) · `riviera-java-conventions` (package-private
controller + constructor injection, `ApiProblem.response` for the 404 rather than a per-controller
`@ExceptionHandler`, one-line comments) · `codebase-design` (the port-split decision above — the
deletion test: collapsing `VenuePhotoTakedown` into `VenuePhotos` removes one interface but pushes
"which methods authorize?" into every caller, so the seam earns its keep) · `postgres` —
`N/A — no migration, no schema change, no new query` (the existing `PhotoStorage#delete` statement is
reused verbatim) · `riviera-frontend` / `angular-developer` / `playwright-cli` —
`N/A — API-only at Phase 1, no frontend surface (issue #504 Out of scope)`; the **angular-cli MCP**
was nonetheless consulted at close-out (`list_projects` → v22, `search_documentation` →
`NgOptimizedImage`) to check the frontend consumers of the photo URLs, which is what surfaced R-7:
the components feed these URLs to `NgOptimizedImage`, which adds no caching semantics of its own, so
a taken-down image's persistence is purely the server's `immutable` header · `riviera-local-debug`
(scoped `gradle test --tests` recipe for this session's runs)

**Branch:** `claude/sdlc-504-fm0ah8` — the cloud session's designated remote branch, standing in for
`feature/admin-photo-takedown` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue holding a photo in a slot, when the platform admin drives
      `VenuePhotoTakedown#takedown(venueId, slot)`, then the port answers `true`, the slot's metadata
      is gone and every variant of it is gone — with **no ownership consulted at all**.
      *Pinned by:* `VenuePhotoServiceTest.takedownRemovesAPhotoWithoutConsultingOwnership`
- [x] **AC-2:** Given a venue whose photo an admin has taken down, when the public serving read is
      driven for that photo's variant hash, then it is absent; and the venue's tourist read models
      (Discover card + beach-map banner) carry no cover.
      *Pinned by:* `AdminPhotoTakedownIT.takenDownPhotoStopsServingAndDropsOutOfTheTouristReads`
- [x] **AC-3:** Given a venue the admin does **not** own, when the admin takes its photo down, then it
      succeeds — the `/api/admin/**` surface is exempt from the per-venue ownership check (invariant
      #13), so no `NOT_VENUE_OWNER` is raised.
      *Pinned by:* `AdminPhotoTakedownIT.adminTakesDownAPhotoOfAVenueItDoesNotOwn`
- [x] **AC-4:** Given a plain ACTIVE operator (`is_admin` false), when it calls the takedown endpoint,
      then `403`; given no session at all, then `401`.
      *Pinned by:* `AdminPhotoTakedownIT.takedownIsAdminOnly`
- [x] **AC-5:** Given an empty slot, an unknown venue, or a venue with no photos, when the admin takes
      it down, then a single RFC-7807 `404 NO_SUCH_PHOTO` — one answer for all three, so the surface
      never distinguishes "no such venue" from "no such photo", and never a `500`.
      *Pinned by:* `AdminPhotoTakedownIT.takedownOfSomethingThatIsNotThereIs404`
- [x] **AC-6:** Given an unknown slot name in the path, when the admin calls the endpoint, then
      `400 INVALID_REQUEST` from the shared advice (not a `500`, not an enum-parse stack trace).
      *Pinned by:* `AdminPhotoTakedownIT.unknownSlotIs400` at the HTTP edge, and — after review
      finding F-2 — `PhotoSlotsTest` at the shared parser's own seam, which is what covers the
      operator endpoints that route through the same rule.
- [x] **AC-7:** Given the operator's own delete/replace flow, when this slice ships, then it is
      unchanged — a non-owner operator `DELETE /api/venues/{v}/photos/{slot}` is still `403
      NOT_VENUE_OWNER` (denied before the slot is looked at), and the owner's delete still `204`s.
      *Pinned by:* existing `CrossVenueDenialIT.photoDeleteByNonOwnerIs403` +
      `CrossVenueDenialIT.ownerCanUploadAndDeleteItsOwnPhoto`, unmodified.
- [x] **AC-8:** Given the new endpoint, when the endpoint inventory is probed by a principal holding a
      role the application grants nobody, then the filter chain rejects it — i.e. the endpoint has an
      explicit `SecurityConfig` rule and is not on the declared-reachable list.
      *Pinned by:* existing `EndpointRoleGateCoverageTest.everyMappedEndpointIsGated` (no edit to its
      `DECLARED_REACHABLE` set).
- [x] **AC-9:** Given the structural net, when the slice is built, then `ModularityTests`,
      `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
      `PublishedSurfacePlacementArchitectureTests` and `ErrorContractArchitectureTests` stay green.
      *Pinned by:* those classes.
- [x] **AC-10:** `RESPONSIBILITIES.md` §`venue` names the admin takedown surface, and `CONTEXT.md`
      defines **photo takedown** as domain vocabulary.
      *Pinned by:* review (docs), not a test.

## Non-goals

- ADR-0013 / the moderation stance document — that stays with #230.
- Any approval queue, `moderation_state` column, pre-publication gating, or soft-delete/undo.
- A tourist-facing "report this photo" UI; reports stay out-of-band at Phase 1.
- Notifying the operator that a photo was taken down.
- An operator-console or admin UI for takedown — API-only.
- An **audit log / takedown record**. No admin surface in this repo logs its action today
  (`AdminErasureController`, `AdminOperatorController`, `AdminMailOutboxController` all silent), and
  inventing one here would be a lone precedent rather than a policy. Called out explicitly because a
  destructive irreversible admin action is exactly where one would eventually be wanted — see
  Open questions.
- Cascading a takedown across *other* slots holding the same image (R-3).
- Changing the operator's own delete/replace flow in any way (AC-7).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Operator `DELETE /api/venues/{v}/photos/{slot}` — asserts ownership first, `403 NOT_VENUE_OWNER` for a non-owner | **preserved, untouched** | The slice adds a second port beside `VenuePhotos`; `VenuePhotos#delete` and its controller method are not edited. AC-7 pins both directions with the pre-existing `CrossVenueDenialIT` cases. |
| `VenuePhotoController.parseSlot` — lower-case REST slot → `PhotoSlot`, unknown → `400` via the advice | **changed (moved, same behavior) — now pinned** | Extracted verbatim to a package-private `PhotoSlots.parse` in the same package, now shared by both controllers. Same `InvalidApiRequestException.parsing` call, same `Locale.ROOT`, same `400`. Review finding F-2 caught that this row was *asserted, not proven* — no test anywhere covered the unknown-slot `400` on the operator path — so `PhotoSlotsTest` now pins the rule at the seam all three endpoints share. |

> Nothing else is retired or replaced: this slice is additive. The ledger is filled rather than
> `N/A`'d because the plan *does* move one existing private method, and "just extracting a helper" is
> precisely the claim the ledger exists to make someone verify.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An ownership-free delete on the photo port gets called from the **operator** adapter (now or later), silently bypassing invariant #13 | med | high | The ownership-free path is its own port, `VenuePhotoTakedown`, named for what it is; `VenuePhotos` keeps its uniform "asserts ownership first" contract. The operator controller depends only on `VenuePhotos`. `CrossVenueDenialIT` (AC-7) pins the operator path from the outside, so a mis-wiring fails a test rather than a review read. | claude | **closed** — shipped as designed. Containment is stronger than planned: `application/` is not a named interface, so Modulith confines the ownership-free port to the `venue` module outright — no sibling can reach it even though it must be `public` for `adapter/in`. |
| R-2 | The new endpoint has no explicit `SecurityConfig` rule and falls through to `anyRequest().authenticated()` — the #316/#317/#328 defect class, where *any* authenticated principal (a signed-in tourist included) passes | med | high | Explicit `.requestMatchers(HttpMethod.DELETE, ADMIN_VENUE_PHOTO_PATH).hasRole(ADMIN_ROLE)`, and `EndpointRoleGateCoverageTest` fails the build if it is missing (AC-8). AC-4 checks the gate from the outside with a real plain-operator session. | claude | **closed** — matcher shipped; `EndpointRoleGateCoverageTest` green with `DECLARED_REACHABLE` unmodified, and AC-4 passes with a genuinely non-admin session. CSRF also verified enforced (the `ignoringRequestMatchers` list covers only the four stateless booking/webhook paths). |
| R-3 | **Duplicate-hash survival:** the pipeline is deterministic, so one image uploaded to two slots yields byte-identical variants sharing `(venue_id, content_hash)`, and the serving read is `LIMIT 1` over that pair (V24's deliberate non-unique index, #142 F-2). Taking down one slot therefore leaves the bytes servable from the surviving slot's row — so AC-2's "the URL 404s" is true only when no other slot still holds that image | low | med | Correct behavior, not a defect: the surviving slot is still a *published* photo, and un-publishing it is its own takedown. Documented on `VenuePhotoTakedown`'s javadoc and in `CONTEXT.md`, and AC-2's IT seeds a single-slot photo so the assertion is honest about what it proves. Cascading is a Non-goal; if moderation ever needs "remove these bytes everywhere", that is a follow-up issue, not a silent widening here. | claude | **closed** — documented on the port, in `CONTEXT.md`, and in the PR's scope notes; AC-2's IT seeds a single-slot photo so its assertion proves what it claims. |
| R-4 | Error-contract drift — a hand-rolled `{"error": …}` body or a per-controller `@ExceptionHandler` on the new controller | low | med | `ApiProblem.response(NOT_FOUND, "NO_SUCH_PHOTO", …)` only, mirroring `VenuePhotoController`; the unknown-slot path rides the shared advice via `InvalidApiRequestException`. `ErrorContractArchitectureTests` forbids the per-controller handler (AC-9); AC-5/AC-6 assert the wire shape. | claude | **closed** — `ApiProblem` only, no per-controller handler; `ErrorContractArchitectureTests` green and both wire-shape ACs pass. |
| R-5 | The `@WebMvcTest` slice (`EndpointRoleGateCoverageTest`) fails to start because the new controller's port has no bean | med | low | Add a `VenuePhotoTakedown` stub bean to `WebSliceStubs` beside the existing `VenuePhotos` one, returning `false` (inert not-found), in the same commit as the controller. | claude | **closed** — stub added in phase 1; `EndpointRoleGateCoverageTest` green |
| R-6 | Flyway version collision | none | — | **No migration in this slice** (V24's cascade already does the work), so no `V<n>` is claimed and nothing can collide. The only open PRs are Dependabot bumps — none touch `db/migration`. | claude | closed at plan time |
| R-7 | **A takedown does not un-cache an already-served image.** The serving GET returns `Cache-Control: public, max-age=31536000, immutable` — safe for a *replace* (a new hash mints a new URL, ADR-0008) but a takedown mints nothing, and `immutable` suppresses revalidation entirely. Surfaced late, while checking the frontend consumers of these URLs (they feed `NgOptimizedImage`, which adds no caching semantics of its own — freshness is purely the server header) | low today, **med once a CDN lands** | med | **Bounded today, not fixed here.** The tourist read models drop `coverPhoto` immediately, so the URL stops being advertised and a new requester gets `404`; what survives is a client that already holds the bytes, and there is no CDN in front of the API today (the backend serves the SPA same-origin, #110). ADR-0008 defers object storage + CDN behind the `PhotoStorage` port, and on that day a year-long `immutable` TTL would keep a taken-down image served **to new requesters** until purged — the exact failure a moderation feature exists to prevent. | claude | **closed — deferred with a home.** Not a defect in this slice as scoped (origin removal and read-model removal both work, pinned by `AdminPhotoTakedownIT`); it is a stance-level choice. Propagated to **#230** ([comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/230#issuecomment-5166200914)) alongside the audit-log question, flagged to pair a CDN with an explicit purge step or reconsider `immutable` for this route. |

## Open questions / Assumptions

*(Empty — both entries resolved below.)*

### Resolved

- **Assumption (resolved, `c0ac3d1`):** `403` for a plain operator and `404 NO_SUCH_PHOTO` for a
  missing photo satisfy the issue's "clean, non-enumerating client error". **Outcome: held, and
  shipped stronger than assumed** — the endpoint returns the *same* `404 NO_SUCH_PHOTO` for an empty
  slot, a photo-less venue, and a venue id that does not exist, so it distinguishes none of them.
  Pinned by `AdminPhotoTakedownIT.takedownOfSomethingThatIsNotThereIs404`, which drives a real and a
  nonexistent venue through one loop and asserts an identical response for both (AC-5).
- **Open question (resolved — deferred with a home):** should a destructive platform-admin action
  leave an audit record? **Outcome: out of scope for this slice, and now written down where the
  decision belongs rather than only here.** No admin surface in this repo logs its action today
  (`AdminErasureController`, `AdminOperatorController`, `AdminMailOutboxController` are all silent),
  so inventing an audit policy inside a photo slice would create a lone precedent instead of a
  policy. Carried to the parent moderation-stance issue **#230 / ADR-0013**, which is where the
  report-and-remove posture — and therefore whether takedowns need an audit trail — is actually
  decided. **Written onto #230** per close-out step 3
  ([comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/230#issuecomment-5166200914)),
  together with R-7, rather than left in a review transcript for the next session to lose.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches only `venue_photo` / `venue_photo_variant`.
It writes no `availability(set_id, booking_date)` row, reads none, and publishes no event; a photo is
profile media with no bearing on whether a set is holdable. The only concurrency question in scope is
takedown-vs-replace on the same `(venue, slot)`, and it is already answered by #142's design: the
takedown is the single statement `DELETE FROM venue_photo WHERE venue_id = :v AND slot = :s`, atomic
on its own and cascading to the variants, while `replace` is an `INSERT … ON CONFLICT DO UPDATE`
holding that same row's lock. Whichever commits second wins, and neither can leave an orphaned blob
or a half-deleted photo. Two admins taking down the same slot concurrently is likewise safe: one
`DELETE` reports 1 row (`204`), the loser reports 0 (`404 NO_SUCH_PHOTO`) — the same
already-shipped semantics as two operators racing their own delete.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | `venue` owns venue photos end-to-end (#142, ADR-0008) — upload/replace/delete, processing, `bytea` storage behind the module-internal `PhotoStorage` port, and the public serving read. A takedown is a photo deletion; it is the same behavior with a different actor. |

Root package (`SecurityConfig`) is edited for the role gate only — the composition root already hosts
every `/api/admin/**` gate; no module depends on it (`CompositionRootDisciplineTests` unaffected).

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | **none added** | — | — |

`VenuePhotoTakedown` is a **driving port for this module's own adapter**, so per ADR-0007 it stays an
interface in `venue/application/` beside `VenuePhotos` — it is not published to `api/` (no sibling
module calls it) and not `spi/` (no other module implements it). `venue/package-info.java`'s
`allowedDependencies` is unchanged: the slice adds no cross-module edge, and notably does **not**
reach for `operator::api` — the admin's authority is a role at the edge, not venue ownership.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none** | — | — | — | — | — |

No event is published. Nothing downstream reacts to a photo removal today (the tourist reads are
queries over the same tables, so they are correct the moment the rows are gone), and "notify the
operator" is an explicit Non-goal. Publishing an unsubscribed event would add an Event Publication
Registry row with no listener and a permanent outstanding-publication signal.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Remove any venue's photo by `(venue, slot)`, ownership-free | `venue` | `venue` **Job**: "Own venue profiles …, venue photos (#142: per-slot upload/replace/delete, processing, `bytea` storage behind the module-internal `PhotoStorage` port …)". Deleting a photo is squarely that. Not on any other module's **Not My Job** list; no other module claims photos. |
| Deciding *who* may call it (platform-admin role) | root (`SecurityConfig`) | Role gating for `/api/admin/**` is edge machinery, not module logic (RV-BE-11 / #115 precedent). `operator` **Job** covers the `is_admin` flag and the account, and it is consulted only by the existing `OperatorUserDetailsService` when granting `ROLE_ADMIN` at login — this slice adds nothing there. |
| Hosting the admin endpoint | `venue/adapter/in` | The #391/#405/#454 precedent: a module-owned admin surface lives in the module's driving-adapter package, not at the composition root (only `AdminOperatorController`/`AdminErasureController` sit at the root, because their behavior *is* edge behavior). |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves: no charge, refund, commission, or payout-ledger entry.
A photo carries no price and no booking.

## Angular — frontend surfaces touched

`N/A — backend-only.` API-only at Phase 1 per issue #504's Out-of-scope list; no component, route,
service, or e2e spec changes. `frontend/` is untouched by this slice.

## FE↔BE contract

`N/A — no contract change` for the SPA: the new endpoint has no frontend client (see above). For the
record, the surface added is:

- **New endpoint:** `DELETE /api/admin/venues/{venueId}/photos/{slot}` — no request body; `204 No
  Content` on success; `404 NO_SUCH_PHOTO`, `400 INVALID_REQUEST`, `403`, `401` as RFC-7807
  `application/problem+json`. CSRF token required, like every write. Path mirrors the operator's
  `DELETE /api/venues/{venueId}/photos/{slot}` exactly, differing only by the `/api/admin` prefix
  that carries the authorization posture — so the two surfaces read as the same operation under
  different authority, which is what they are.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting.

**Stage pointer:** `merge close-out — all gates run; awaiting merge of PR #506`

**Next action:** Merge PR #506. Post-merge, only two GitHub-side items remain (no repo commit):
confirm #504 closed, and note the slice on parent epic #230.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The takedown port + service method | ✅ | `23f3a76` |
| 1 — The admin endpoint + role gate | ✅ | `c0ac3d1` |
| 2 — Substrate docs (RESPONSIBILITIES.md, CONTEXT.md) | ✅ | `1353a94` |
| 3 — Review-gate fixes + docs-freshness patches + close-out | ✅ | (this commit) |

**Merged via PR #506.**

**Gate results:** CI green (backend build+test, frontend, CodeQL — all `success`). Testcontainers
ITs **ran, not skipped** — proven by Sonar reporting 100% new-code coverage on
`AdminVenuePhotoController.java` (51 new lines, 0 uncovered), a class reachable only from
`AdminPhotoTakedownIT`. Sonar gate green **and its list pulled and empty**: 0 new issues, 0 bugs,
0 vulnerabilities, 0 code smells, 0 duplicated blocks, new-code coverage 88.2% (≥80% bar; every
changed file has **0 uncovered new lines** — the aggregate is the line-vs-branch mix). The zero is
real, not the false-clean read: `new_lines: 143` is populated and the `SonarCloud Code Analysis`
check-run concluded `success`. Review gate ran **degraded** — see the review-gate note.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-STYLE-1) | Two inline comments added by the slice run to 2 and 3 lines — `AdminPhotoTakedownIT.adminTakesDownAPhotoOfAVenueItDoesNotOwn` and `VenuePhotoServiceTest.takedownReachesAVenueTheCallerCouldNeverOwn`. The bank is one line or none; the long form belongs in Javadoc, which is exempt. | **fixed** — the first shortened to one line, the second promoted to a method Javadoc (where the reasoning is discoverable rather than buried mid-body). |
| F-2 | review | `PhotoSlots`, the helper this slice extracts, had **no test at its own seam**: its contract was pinned only incidentally through `AdminPhotoTakedownIT.unknownSlotIs400`, and a repo-wide grep found no test anywhere asserting the operator photo path's unknown-slot `400`. So the Behavior-parity ledger's "moved, same behavior" row was *asserted, not proven* — exactly the claim the ledger exists to make someone verify. | **fixed** — added `PhotoSlotsTest` (every slot name round-trips, case-insensitivity, unknown + empty → `InvalidApiRequestException`), so the one parse rule serving three endpoints is pinned where it lives. Parity ledger row updated from asserted to pinned. |
| F-3 | review (RV-PROC-1 self-check) | The *Skills consulted* line stated `riviera-docs-freshness` "ran at merge close-out" while the run had not happened — a forward-dated claim reads identically to a completed one in a diff. | **fixed** — the parenthesis now records the actual run: range, mode, and findings. |

**Docs-freshness note** — run pre-merge over `origin/main...HEAD` (`riviera-sdlc` close-out step 5,
folded into this PR per its "nothing here is inherently post-merge any more" rule).

- *Step 2a, rename/removal grep:* **clean.** The one identifier that moved (`parseSlot`, private)
  is cited by no substrate doc.
- *Step 2b, counting sweep:* **clean.** This slice does make the Nth of several things (admin
  surface, venue-module driving port), so the sweep was run: 18 hits on the count phrasings
  narrowed to photo/admin/port vocabulary, each read. Every one has a different subject and stays
  true — `PhotoSlot`'s "three designed slots", `JdbcVenueCatalog`'s "three role-split read ports"
  (this slice publishes no `api/` port), `AdminEmailSuppressionController`'s "two admin surfaces
  that take an address" (this one takes venue + slot).
- *Step 3, top-down walk:* **2 findings, both patched.**
  - `docs/adr/ADR-0008-venue-photo-storage.md:95` — stated "Upload/replace/delete are
    **venue-scoped** … `assertOwns` runs first". Contradicted: deletion now has a second,
    ownership-free caller. Patched as an explicit **"Amended by #504"** clause rather than a
    rewrite — the ADR's actual decision (bytea behind a swappable port) is untouched, and step 4
    forbids silently rewriting a decision's substance.
  - `CLAUDE.md:158` — the `venue` module row enumerates the module's surfaces down to individual
    endpoints, so a new write surface with an unusual authorization posture belongs in it. Patched
    with a short clause naming the endpoint and the separate port.
- *Step 6, graph refresh:* skipped — `graphify-out/` is absent in this cloud clone (gitignored,
  regenerable), so there is no graph to refresh and nothing to commit.

**Review-gate note.** Run at ready-for-review over `origin/main...HEAD` with
`riviera-review-overlay` layered on. **The `/code-review` subagent fan-out did not run** — this
session carries a standing instruction withholding the Agent tool, so the invocation ladder's
rung 3 applied and the review ran inline (`/review 506`) as a **declared degraded mode**. Stated in
the PR, and the PR's review checkbox is left **unticked** accordingly (`references/pr-gates.md` §1:
never tick a box for a review that did not fully run). Banks walked: the generic correctness pass
plus `references/backend-conventions.md` (backend scope) and the wire-shape half of
`references/fe-be-contract.md` (a new endpoint). Blocker items with a touched domain: **RV-BE-9**
(authorization) — checked and clean, see the AC-3/AC-4/AC-7 pins; **RV-BE-1** and **RV-BE-7** have
no touched domain here. Verified along the way: CSRF is enforced on the new `DELETE` (the
`ignoringRequestMatchers` list covers only the four stateless booking/webhook paths), a
non-numeric `venueId` lands on the framework's `INVALID_REQUEST` mapping rather than a 500, and
`VenuePhotoTakedown`'s blast radius is confined to the `venue` module by Modulith, since
`application/` is not a named interface — no sibling module can reach the ownership-free port even
though it must be `public` for the adapter package.

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotoTakedown.java` — **new.**
  The one-method ownership-free driving port; its javadoc carries *why* it is separate and the R-3
  duplicate-hash caveat.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotoService.java` — **modify.**
  `implements VenuePhotos, VenuePhotoTakedown`; add `takedown`, delegating to the same
  `PhotoStorage#delete` the operator path uses.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/PhotoSlots.java` — **new.** Package-private
  slot-parsing helper extracted from `VenuePhotoController`, now shared by both controllers.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenuePhotoController.java` — **modify.**
  Use `PhotoSlots.parse`; nothing else changes.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenuePhotoController.java` — **new.**
  Package-private `@RestController` at `/api/admin/venues`, one `DELETE` mapping.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — **modify.** The
  `ADMIN_VENUE_PHOTO_PATH` constant + its `hasRole(ADMIN_ROLE)` matcher.
- `platform/src/test/java/ai/riviera/platform/venue/application/VenuePhotoServiceTest.java` — **modify.**
  Phase-0 unit specs.
- `platform/src/test/java/ai/riviera/platform/venue/application/InMemoryPhotoStorage.java` — reused as-is.
- `platform/src/test/java/ai/riviera/platform/venue/AdminPhotoTakedownIT.java` — **new.** The
  end-to-end proof: real Postgres, real sessions, serving + read-model assertions, the role matrix.
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — **modify.** The inert
  `VenuePhotoTakedown` bean (R-5).
- `RESPONSIBILITIES.md` — **modify.** §`venue` names the admin takedown surface (AC-10).
- `CONTEXT.md` — **modify.** Glossary entry for **photo takedown** (AC-10).

---

## Phase 0 — The takedown port + service method

**Files:** Create `venue/application/VenuePhotoTakedown.java` · Modify
`venue/application/VenuePhotoService.java` · Test
`venue/application/VenuePhotoServiceTest.java`

- [x] **Step 1: Write the failing test** — appended to `VenuePhotoServiceTest`. The class's existing
      fixture wires `FakeVenueOwnership(OPERATOR, VENUE)`, so "a venue the caller does not own" is
      simply any other venue id: the fake throws `NotVenueOwnerException` for it, which is exactly
      what makes the second test a real proof that ownership is never consulted.

```java
	@Test
	void takedownRemovesAPhotoWithoutConsultingOwnership() throws IOException {
		service.upload(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER, jpeg(1600, 1200));

		assertTrue(service.takedown(new VenueId(VENUE), PhotoSlot.COVER), "a photo was there");
		assertTrue(storage.listMetadata(new VenueId(VENUE)).isEmpty(), "metadata + variants are gone");
	}

	@Test
	void takedownReachesAVenueTheCallerCouldNeverOwn() throws IOException {
		// The platform-admin case (#504): the fake ownership port throws for any venue but VENUE, so a
		// takedown of OTHER_VENUE succeeding IS the proof that no ownership check runs (invariant #13's
		// /api/admin/** exemption). The operator path over the same venue still throws — pinned below.
		VenueId other = new VenueId(VENUE + 1);
		storage.replace(other, PhotoSlot.BAR, processedJpeg());

		assertTrue(service.takedown(other, PhotoSlot.BAR));
		assertTrue(storage.listMetadata(other).isEmpty());
		assertThrows(NotVenueOwnerException.class,
				() -> service.delete(new OperatorId(OPERATOR), other, PhotoSlot.BAR));
	}

	@Test
	void takedownOfAnEmptySlotIsFalse() {
		assertFalse(service.takedown(new VenueId(VENUE), PhotoSlot.SUNBEDS), "nothing to remove");
	}
```

> `processedJpeg()` is a tiny local helper building a one-variant `ProcessedPhoto` (the same shape
> `VenuePhotoServingIT` seeds with); add it beside the existing `jpeg(...)` helper if the class has no
> equivalent. Read the class's existing helpers first and reuse rather than duplicate.

- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*VenuePhotoServiceTest*"` →
      FAIL: `cannot find symbol: method takedown(VenueId, PhotoSlot)`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation**

`venue/application/VenuePhotoTakedown.java`:

```java
package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The platform-admin photo takedown (#504) — the "remove" half of the report-and-remove moderation
 * stance (#230). Deliberately a <strong>separate port from {@link VenuePhotos}</strong> rather than a
 * fourth method on it: {@code VenuePhotos} promises that its writes assert per-venue ownership first
 * (invariant #13), and an ownership-free method hung off it would turn that promise into a
 * per-method detail every caller has to re-read. It is also a different conversation — platform
 * moderation by an actor who owns nothing, not a venue managing its own profile. The driving adapter
 * is {@code AdminVenuePhotoController}, gated to the {@code ADMIN} role in {@code SecurityConfig}:
 * that role gate is the <em>whole</em> authorization for this port, which is why nothing else may
 * depend on it. Implemented by {@code VenuePhotoService}, so the deletion runs through the one
 * {@link PhotoStorage#delete} the operator path uses — no duplicated delete logic.
 *
 * <p><strong>Scope is one slot, not one image.</strong> The variant pipeline is deterministic, so the
 * same source image uploaded into two slots of a venue yields byte-identical variants sharing a
 * {@code (venue, content_hash)}, and the content-addressed serving read takes any one of them. Taking
 * down one slot therefore leaves those bytes reachable while another slot still publishes them; each
 * published slot is its own takedown. Removing an image everywhere is not this port's job.
 */
public interface VenuePhotoTakedown {

	/**
	 * Remove the photo in {@code slot} of {@code venueId} — metadata and every variant, one
	 * statement — <strong>without any ownership check</strong>. Returns {@code true} if a photo was
	 * there, {@code false} if the slot was empty or the venue has none (→ {@code 404}); an unknown
	 * venue is indistinguishable from an empty slot, deliberately.
	 */
	boolean takedown(VenueId venueId, PhotoSlot slot);
}
```

`VenuePhotoService` — add the interface and the method (the class javadoc gains one sentence naming
the second port and why it skips ownership):

```java
	@Override
	public boolean takedown(VenueId venueId, PhotoSlot slot) {
		// No ownership check by design (#504): the ADMIN role gate is this path's whole authorization
		// (invariant #13's /api/admin/** exemption). Same single cascading DELETE as the owner's delete.
		return storage.delete(venueId, slot);
	}
```

- [x] **Step 4: Run it, verify it passes** — `gradle test --tests "*VenuePhotoServiceTest*"` → PASS.

> Scope (end-of-phase regression): `gradle test --tests "*venue*"` plus
> `--tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"`.

- [x] **Step 5: Generalization-audit pass** — search for any other place a `/api/admin/**` surface
      reuses a venue-scoped application service, to check none of them took the "add an unauthorized
      method to the scoped port" shortcut this phase deliberately avoided.
      `grep -rn "api/admin" platform/src/main/java --include=*.java -l` → inspect each controller's port.
      Append the result to the Generalization-audit log.

- [x] **Step 6: Commit** — `git commit -m "Add the ownership-free venue-photo takedown port (#504)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The admin endpoint + role gate

**Files:** Create `venue/adapter/in/PhotoSlots.java`, `venue/adapter/in/AdminVenuePhotoController.java`,
`test/.../venue/AdminPhotoTakedownIT.java` · Modify `venue/adapter/in/VenuePhotoController.java`,
`SecurityConfig.java`, `test/.../WebSliceStubs.java`

- [x] **Step 1: Write the failing test** — `AdminPhotoTakedownIT`. It seeds a venue + a
      single-slot cover through the real `PhotoStorage` adapter (the `VenuePhotoServingIT` pattern),
      provisions a plain non-admin operator through the real `OperatorProvisioning` (the
      `PerOperatorLoginIT` pattern), and drives the endpoint over MockMvc against Testcontainers
      Postgres. The bootstrap `operator` account is the platform admin (`is_admin`, V29), so its
      session is the ADMIN one; a **separate** provisioned operator is what proves the `403`, since
      the bootstrap principal carries both roles.

```java
	@Test
	void takenDownPhotoStopsServingAndDropsOutOfTheTouristReads() throws Exception {
		VenueId venue = newVenueWithCover(CARD_HASH, BANNER_HASH);

		mvc.perform(delete("/api/admin/venues/{v}/photos/{slot}", venue.value(), "cover")
						.cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), CARD_HASH))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/venues/{v}", venue.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.coverPhoto").doesNotExist());
	}

	@Test
	void takedownIsAdminOnly() throws Exception {
		VenueId venue = newVenueWithCover("aa01", "aa02");

		mvc.perform(delete("/api/admin/venues/{v}/photos/{slot}", venue.value(), "cover").with(csrf()))
				.andExpect(status().isUnauthorized());
		mvc.perform(delete("/api/admin/venues/{v}/photos/{slot}", venue.value(), "cover")
						.cookie(plainOperatorSession()).with(csrf()))
				.andExpect(status().isForbidden());
		// The gate held: the photo is still there for the admin to remove.
		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "aa01"))
				.andExpect(status().isOk());
	}

	@Test
	void adminTakesDownAPhotoOfAVenueItDoesNotOwn() throws Exception {
		// The point of the slice: no operator_venue row ties the admin to this venue, and the
		// /api/admin/** surface is exempt from invariant #13 — so this is 204, never NOT_VENUE_OWNER.
		VenueId unowned = newVenueWithCover("bb01", "bb02");

		mvc.perform(delete("/api/admin/venues/{v}/photos/{slot}", unowned.value(), "cover")
						.cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());
	}

	@Test
	void takedownOfSomethingThatIsNotThereIs404() throws Exception {
		VenueId venue = newVenueWithCover("cc01", "cc02");

		// An empty slot of a real venue, and a venue id that does not exist, answer identically.
		for (String path : List.of("/api/admin/venues/" + venue.value() + "/photos/bar",
				"/api/admin/venues/" + (venue.value() + 9_999) + "/photos/cover")) {
			mvc.perform(delete(path).cookie(adminSession()).with(csrf()))
					.andExpect(status().isNotFound())
					.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
					.andExpect(jsonPath("$.code").value("NO_SUCH_PHOTO"));
		}
	}

	@Test
	void unknownSlotIs400() throws Exception {
		mvc.perform(delete("/api/admin/venues/{v}/photos/{slot}", 1L, "lobby")
						.cookie(adminSession()).with(csrf()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}
```

> Confirm `INVALID_REQUEST` is the code `ApiErrorHandler` maps `InvalidApiRequestException` to before
> writing the assertion, and confirm the tourist venue read's cover field name (`coverPhoto`) against
> `VenueMapView` — both are one grep each, and a guessed literal is a false-green waiting to happen.

- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*AdminPhotoTakedownIT*"` →
      FAIL: `404` on the admin path (no such mapping) / the class does not compile.

- [x] **Step 3: Minimal implementation**

`venue/adapter/in/PhotoSlots.java` — the extracted parser (behavior identical to the private method it
replaces; see the parity ledger):

```java
package ai.riviera.platform.venue.adapter.in;

import java.util.Locale;

import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/** Maps the lower-case REST slot segment to {@link PhotoSlot}; an unknown value → 400 via the advice. */
final class PhotoSlots {

	private PhotoSlots() {
	}

	static PhotoSlot parse(String slot) {
		return InvalidApiRequestException.parsing(() -> PhotoSlot.valueOf(slot.toUpperCase(Locale.ROOT)));
	}
}
```

`venue/adapter/in/AdminVenuePhotoController.java`:

```java
package ai.riviera.platform.venue.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.venue.application.VenuePhotoTakedown;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The platform-admin photo takedown surface (#504) — the "remove" half of the report-and-remove
 * moderation stance (#230). Driving adapter depending only on the module's {@link VenuePhotoTakedown}
 * port; hosted in the module rather than at the composition root, like the other module-owned admin
 * surfaces (#391/#405/#454).
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> {@code /api/admin/**} is exempt from invariant
 * #13 by design, and this endpoint is the reason the exemption matters here: a reported photo belongs
 * to a venue the admin does not own, so the ownership check that guards
 * {@code DELETE /api/venues/{venueId}/photos/{slot}} would refuse exactly the case moderation exists
 * for. The {@code ADMIN} gate in {@code SecurityConfig} is the whole authorization — a plain
 * {@code OPERATOR} is {@code 403}, anonymous is {@code 401}.
 *
 * <p>The path deliberately mirrors the operator's, differing only by the {@code /api/admin} prefix
 * that carries the authorization posture: same operation, different authority. Errors are the one
 * RFC-7807 contract (issue #97) — an empty slot, a venue with no photos, and an unknown venue all
 * answer {@code 404 NO_SUCH_PHOTO}, so the surface distinguishes none of them.
 */
@RestController
@RequestMapping("/api/admin/venues")
class AdminVenuePhotoController {

	private final VenuePhotoTakedown takedown;

	AdminVenuePhotoController(VenuePhotoTakedown takedown) {
		this.takedown = takedown;
	}

	@DeleteMapping("/{venueId}/photos/{slot}")
	ResponseEntity<?> remove(@PathVariable long venueId, @PathVariable String slot) {
		return takedown.takedown(new VenueId(venueId), PhotoSlots.parse(slot))
				? ResponseEntity.noContent().build()
				: ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_PHOTO", "No photo in this slot.");
	}
}
```

`SecurityConfig` — the constant beside the other admin paths, and the matcher in the admin block
(above `GET /api/venues/**`, though the prefix makes ordering moot — keep it with its siblings):

```java
	/**
	 * Platform-admin photo takedown (#504) — the same ADMIN gate and the same {@code /api/admin/**}
	 * exemption from invariant #13 as the operator-approval surface. It exists precisely to reach a
	 * venue the admin does NOT own, which the operator-gated {@code /api/venues/*/photos/*} DELETE
	 * refuses. Two single-segment wildcards: venue id, then slot.
	 */
	private static final String ADMIN_VENUE_PHOTO_PATH = "/api/admin/venues/*/photos/*";
```

```java
						// Platform-admin photo takedown (#504) — ADMIN only, reaches any venue.
						.requestMatchers(HttpMethod.DELETE, ADMIN_VENUE_PHOTO_PATH).hasRole(ADMIN_ROLE)
```

`WebSliceStubs` — beside the existing `venuePhotos()` bean (R-5):

```java
	/** #504: the takedown port {@code AdminVenuePhotoController} registers with — inert not-found. */
	@Bean
	VenuePhotoTakedown venuePhotoTakedown() {
		return (_, _) -> false;
	}
```

- [x] **Step 4: Run it, verify it passes** — `gradle test --tests "*AdminPhotoTakedownIT*"` → PASS
      (or a clean Docker-absent skip; then rely on CI for this class — say so in the commit).

> Scope (end-of-phase regression): `gradle test --tests "*venue*" --tests "*EndpointRoleGateCoverageTest*"
> --tests "*CrossVenueDenialIT*" --tests "*ErrorContractArchitectureTests*" --tests "*ModularityTests*"`.
> `CrossVenueDenialIT` is in that list on purpose: it is AC-7's proof that the operator path is untouched.

- [x] **Step 5: Generalization-audit pass** — the `PhotoSlots` extraction is the new pattern; search
      for other enum-from-path parsers that inline the same `valueOf(upper)` idiom
      (`grep -rn "valueOf(.*toUpperCase" platform/src/main/java --include=*.java`) and decide whether
      they warrant the same treatment or are single-call-site. Append to the log.

- [x] **Step 6: Commit** — `git commit -m "Expose the admin photo takedown endpoint under /api/admin (#504)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Substrate docs

**Files:** Modify `RESPONSIBILITIES.md` (§`venue`) · `CONTEXT.md` (glossary)

- [x] **Step 1** — `RESPONSIBILITIES.md` §`venue` **Job**: extend the photo clause so it names the
      admin takedown as a second, role-gated writer of the same deletion, and says the module owns it
      because it owns photos while the *authority* is the edge's role gate. Keep the Not-My-Job list
      unchanged — nothing moved out.
- [x] **Step 2** — `CONTEXT.md`: add **photo takedown** after the **Photo slot** entry — the
      platform-admin removal of any venue's photo by `(venue, slot)`, role-gated on `is_admin` and
      exempt from per-venue ownership; same single-transaction erase as the operator's delete; scoped
      to one slot, not one image (R-3).
- [x] **Step 3: Commit** — `git commit -m "Document the admin photo takedown in the substrate docs (#504)"`
- [x] **Step 4: Update plan-doc execution status** in the same commit window.

> `riviera-docs-freshness` runs at merge close-out over this slice's range and may add more — these
> two are the ones the slice's own ACs require (AC-10).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-03 | Phase 0 — introduced "a separate unscoped port beside the venue-scoped one" | Other `/api/admin/**` controllers reusing a venue-scoped application service, i.e. taking the "add an unauthorized method to the scoped port" shortcut this phase avoided | `grep -rn "api/admin" platform/src/main/java --include=*.java -l`, then each controller's injected port | 6 admin controllers. Five (`AdminErasureController`, `AdminOperatorController`, `AdminMailDeliveryController`, `AdminEmailSuppressionController`, `AdminMailOutboxController`, `AdminRefundOutboxController`) operate on platform-wide state with no venue-scoped sibling port to short-cut. `AdminPayoutBatchController` is the one that *could* have: `payout` owns both venue-scoped services (`PayoutLedgerQueryService`, `DailyTakingsService` — both `assertOwns`) and the cross-venue batch report, and it already keeps them apart behind a distinct `PayoutReport` port. | **Skip — nothing to fix.** The separate-port shape is existing precedent rather than a new pattern, which strengthens the R-1 mitigation: #504 follows the house answer instead of inventing one. |
| 2026-08-03 | Phase 1 — extracted `PhotoSlots`, an edge helper turning a path segment into an enum with `400` on unknown | Other enum-from-path parsers inlining the same `valueOf(upper)` idiom, which would want the same treatment | `grep -rn "valueOf(.*toUpperCase" platform/src/main/java --include=*.java` | 2 — the new `PhotoSlots`, and `SsoProviders` (root package, `google`/`apple` slug → `SsoProvider`), which is the *same* shape already: package-private final helper, static `parse`, unknown → `InvalidApiRequestException` → `400 INVALID_REQUEST`. | **Skip — nothing to fix.** `PhotoSlots` conforms to an existing house pattern rather than introducing one. `SsoProviders` hand-rolls the try/catch where `PhotoSlots` uses the newer `InvalidApiRequestException.parsing` helper, but the two are behavior-equivalent and `SsoProviders` carries a custom message; rewriting it is unrelated churn in a slice that must leave the auth edge alone. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-7 (service half):** `gradle test --tests "*VenuePhotoServiceTest*"` → PASS
      (`takedownRemovesAPhotoWithoutConsultingOwnership`, `takedownReachesAVenueTheCallerCouldNeverOwn`,
      `takedownOfAnEmptySlotIsFalse`), verified at `c0ac3d1` and re-run after the F-1/F-2 fixes.
- [x] **AC-2 / AC-3 / AC-4 / AC-5 / AC-6:** `gradle test --tests "*AdminPhotoTakedownIT*"` → PASS,
      locally against Testcontainers Postgres **and** in CI (proven un-skipped by the 100%
      new-code coverage on `AdminVenuePhotoController`). Verified at `c0ac3d1`.
- [x] **AC-6 (parser seam, added by finding F-2):** `gradle test --tests "*PhotoSlotsTest*"` → PASS.
- [x] **AC-7:** `gradle test --tests "*CrossVenueDenialIT*"` → PASS, and `git diff origin/main...HEAD
      --stat` shows the class is **not in the diff** — the operator path is proven unchanged by a test
      this slice did not touch.
- [x] **AC-8:** `gradle test --tests "*EndpointRoleGateCoverageTest*"` → PASS with
      `DECLARED_REACHABLE` unmodified in the diff.
- [x] **AC-9:** `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"
      --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"
      --tests "*ErrorContractArchitectureTests*"` → PASS, plus the full suite green in CI.
- [x] **AC-10:** `RESPONSIBILITIES.md` §`venue` and the `CONTEXT.md` **photo takedown** entry shipped
      in `1353a94`; the docs-freshness run then added the ADR-0008 amendment and the `CLAUDE.md`
      module-row clause.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.
      → **Deliberately left unticked.** The ladder's rung 1 probe *succeeded* (the
      `code-review` workflow loaded), but the workflow is a subagent fan-out and this session
      carries a standing instruction withholding the Agent tool, so rung 3 applied: the review
      ran inline via `/review 506` with the overlay layered on, as a **declared degraded mode**.
      Two findings, both fixed (F-1, F-2). Ticking this box would make the PR record claim a
      fan-out that did not happen — the exact failure of PR #353/#355. Stated in the PR body too.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
