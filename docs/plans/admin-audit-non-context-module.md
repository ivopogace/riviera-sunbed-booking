# Admin audit log → the closed non-context module `audit` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move the admin audit *mechanism* — the `AdminAuditLog` port, its JDBC adapter (the
only writer of `admin_audit_record`) and the `GET /api/admin/audit` read — out of the root
package into a closed non-context module `ai.riviera.platform.audit`, leaving the *fence*
(`AdminAuditFilter`, `AdminAuditReasons`, the `SecurityConfig` route policy) at the edge, with
no behaviour, HTTP-contract, schema or frontend change.

**Architecture:** ADR-0017's second instance, built by copying its first (`challenge`, PR #916).
The single most significant decision is that the module is **thin** by the `riviera-modulith`
assignment rule — `JdbcAdminAuditLog` implements the published `api/` port directly, and
inventing an application service between them would be the hypothetical seam `codebase-design`
warns against — so the module is the first thin one to own a driving adapter (`adapter/in`, the
controller). The rule that makes the move worth doing is machine-checked, not prose: once the
writer has a module name, `ResponsibilitiesArchitectureTests` can express "only `audit` touches
`admin_audit_record`", which ADR-0017 Context 2 records as impossible while the writer sits at
the root.

**Persistence:** JDBC only (invariant #1). `admin_audit_record` (V38) changes owner, not shape —
**no Flyway migration**, no SQL edit; the two statements in `JdbcAdminAuditLog` move byte-identical.

**Source of intent:** GitHub issue #914; ADR-0017 Decision 6 (which names this slice and leaves
the three placement calls below to it).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the #913
blocker landed as PR #916, and caught the sibling's unretired plan doc, R-8) · `riviera-plan-doc`
(this template — forced the behaviour-parity ledger on what looked like a pure relocation, and the
Module-ownership table that split fence from mechanism) · `tdd` (the sole-writer net is written
first and is **red against the root**, which is ADR-0017 Context 2 restated as a failing test;
the move is what turns it green) · `riviera-review-overlay` (review gate — due at
ready-for-review; RV-BE-11/RV-BE-12/RV-BE-3c are the live items) · `riviera-docs-freshness`
(<**ran** over `<range>`, N findings — **or** `N/A — <reason>`; due at close-out, phase 2,
pre-seeded with the counting-sweep sites in *Docs counting sweep* below>) · `riviera-modulith`
(the thin-vs-full assignment rule → `audit` is thin; the published-surface kinds → `Entry` cannot
stay nested in the port; the moved-bean checklist item → `PayoutModuleTest`) ·
`codebase-design` (rejected an empty application service; kept `append` + `latest` as one port,
the `ProofOfWorkChallenges` precedent) · `riviera-java-conventions` (visibility: only
`api`/`vocabulary` types public, adapters package-private; `{@link}` → `{@code}` for root types
a module may not name) · `postgres` (`N/A — no schema, index or SQL change; the table moves owner,
not shape`) · `riviera-local-debug` (before the session's first `./gradlew`).

**Branch:** `claude/session-2t7d1a` — the cloud session's designated remote branch stands in for
`feature/admin-audit-non-context-module` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the production bytecode, when the sole-writer scan looks for the whole-word
      token `admin_audit_record`, then every class carrying it is inside module `audit`. *Seam:*
      the module boundary as seen by the ArchUnit production import · *Pinned by:*
      `ResponsibilitiesArchitectureTests.adminAuditTableIsTouchedOnlyInsideTheAuditModule`
- [ ] **AC-2:** Given a fixture class outside the module carrying that SQL, when the same collector
      runs over the fixture tree, then it is reported as a violation. *Seam:* the parameterized
      violation collector · *Pinned by:*
      `ResponsibilitiesArchitectureTests.adminAuditTableTouchedOutsideTheAuditModuleIsRejected`
- [ ] **AC-3:** Given the production import, when the scan runs, then at least one `audit` class
      does carry the token — the rule is not vacuously green. *Seam:* same · *Pinned by:*
      `ResponsibilitiesArchitectureTests.theAuditModuleItselfWritesTheTable`
- [ ] **AC-4:** Given the composition root, when its dependencies are inspected, then the only
      `audit` surface it reaches is `audit::api` — never `vocabulary`, `application` or `adapter`.
      *Seam:* `CompositionRootDisciplineTests.GRANTED_SURFACES` · *Pinned by:*
      `CompositionRootDisciplineTests.rootTouchesOnlyGrantedModuleSurfaces`
- [ ] **AC-5:** Given the `audit` module's classes, when the module→root rule runs, then none
      depends on a type sitting directly in `ai.riviera.platform`. *Seam:* the same test's second
      rule · *Pinned by:* `CompositionRootDisciplineTests.noModuleReachesTheRoot`
- [ ] **AC-6:** Given `allowedDependencies = {}`, when Spring Modulith verifies the structure, then
      `audit` depends on no other module and no module depends on it. *Seam:*
      `ApplicationModules.of(PlatformApplication.class).verify()` · *Pinned by:*
      `ModularityTests.verifiesModularStructure`
- [ ] **AC-7:** Given the module's published surface, when the placement rules run, then `api/`
      holds only the plain interface `AdminAuditLog` and the entry record sits in `vocabulary/`.
      *Seam:* the `@NamedInterface` packages · *Pinned by:*
      `PublishedSurfacePlacementArchitectureTests.portsSurfacesHoldOnlyNonSealedInterfaces` and
      `.vocabularySurfacesHoldNoPorts`
- [ ] **AC-8:** Given an authenticated platform admin, when a mutating `/api/admin/**` call carrying
      `X-Audit-Reason` completes past the gate, then exactly one row is appended with the actor,
      method, path, real outcome status and the sanitized reason — unchanged from before the move.
      *Seam:* the `/api/admin/**` request path through `AdminAuditFilter` → the `AdminAuditLog`
      port · *Pinned by:* `AdminAuditTrailIT` (existing, unmodified assertions)
- [ ] **AC-9:** Given recorded actions, when `GET /api/admin/audit` is called by an ADMIN, then the
      latest entries come back newest-first and the route stays ADMIN-gated from its new home.
      *Seam:* the HTTP route `/api/admin/audit` · *Pinned by:* `AdminAuditTrailIT` +
      `AdminSurfaceRoleGateTest`
- [ ] **AC-10:** Given the web slices, when any `@Import(WebSliceStubs.class)` test runs, then the
      inert `AdminAuditLog` stub still satisfies the filter chain and the controller. *Seam:* the
      `WebSliceStubs` bean · *Pinned by:* `AdminSurfaceRoleGateTest` (a representative slice)

## Non-goals

- **No schema change and no Flyway migration.** `admin_audit_record` and its index are untouched;
  V38 is byte-identical. Retention/pruning stays the named #507 Phase-1 non-goal.
- **No scheduled sweep, no `@ConfigurationProperties`, no application service** — the three shape
  differences from `challenge` the issue lists; none is introduced to force symmetry.
- **No HTTP-contract change:** same path, same `AuditEntryView` shape, same `X-Audit-Reason`
  header, same ADMIN gate. The frontend is not touched.
- **`AdminAuditFilter` stays in the root** (it is the fence), and so does `AdminAuditReasons`
  (decided below, Q-2).
- **`RateLimitFilter` still stays in the root** — ADR-0017 Decision 5, reaffirmed, not revisited.
- **No third ADR.** ADR-0017 already settles the rule; this slice updates its Status line only.

## Behavior-parity ledger

> A relocation, not a retirement — but "refactor only" is aspirational until verified, so every
> behaviour of the surface being moved is listed and checked.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Every mutating `/api/admin/**` call past the gate appends one row | preserved | `AdminAuditFilter` is untouched; only the injected port's package changes |
| Reads (`GET`) are never audited | preserved | `MUTATING_METHODS` set unchanged in the untouched filter |
| Anonymous / unauthenticated requests leave no row | preserved | the filter's principal check is untouched |
| An exception unwinding past the advice is recorded as 500 | preserved | untouched filter `catch` branch |
| A failed audit insert never fails the admin action (logged at ERROR) | preserved | untouched filter `catch` around `append` |
| `X-Audit-Reason` is sanitized: control runs → single space, trimmed, blank → `null`, capped at 500 | preserved | `AdminAuditReasons` stays at the root, unmodified, still called by the filter before `append` |
| `occurred_at` written as a UTC instant off the injected `Clock` (invariant #6) | preserved | `JdbcAdminAuditLog` moves byte-identical, `Clock` is a JDK type the module may inject |
| `GET /api/admin/audit` returns newest-first, `limit` default 50 clamped to 1..200 | preserved | `AdminAuditController` moves with its constants and DTO name intact |
| The route is ADMIN-gated by `SecurityConfig` | preserved | `ADMIN_AUDIT_PATH` literal stays in `SecurityConfig`, the `ChallengeController` precedent |
| `AdminAuditLog` is package-private, root-internal | **changed** | becomes `public` in `audit.api` — the point of the slice; visibility widens to a *published port*, and `CompositionRootDisciplineTests` now bounds who may reach it, which nothing did before |
| `AdminAuditLog.Entry` is a nested record | **changed** | becomes top-level `audit.vocabulary.AdminAuditEntry` — a record may not live in a ports surface (AC-7) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `PayoutModuleTest` (the repo's only `@ApplicationModuleTest`) loses the `AdminAuditLog` bean once it belongs to a non-bootstrapped module, failing with `NoSuchBeanDefinitionException` | high | med | Add `@MockitoBean AdminAuditLog` beside the `ProofOfWorkChallenges` one #916 added, with the same comment; `riviera-modulith` checklist item covers exactly this | this slice | closed — mitigated **and falsified**: removing the `@MockitoBean` reproduces `NoSuchBeanDefinitionException`, restoring it is green |
| R-2 | The 30 `@Import(WebSliceStubs.class)` slices break: the stub's anonymous `AdminAuditLog` cannot be written from the root once the type is in another package unless the interface **and** its entry type are `public` | high | med | Phase 1 makes the port and `AdminAuditEntry` public and adds the import; a representative slice run is the phase's green check | this slice | closed — port + `AdminAuditEntry` are public, `WebSliceStubs` imports them; `AdminSurfaceRoleGateTest` green |
| R-3 | A nested `Entry` record left inside the `api/` port silently violates RV-BE-3c | med | med | Decided up front: `Entry` → top-level `audit.vocabulary.AdminAuditEntry` (AC-7 pins it; the net inspects nested types, per its own `SealedOutcomeInPorts.Ok` comment) | this slice | closed — `AdminAuditEntry` is top-level in `vocabulary`; the placement net is green |
| R-4 | `audit` is the **first thin module with an `adapter/in`** — the documented thin template lists `api` + `vocabulary` + `adapter/out` only, so a reviewer may read the controller as off-template | med | low | The net keys on the module-agnostic union set, so it passes; phase 2 adds the clause to `riviera-modulith`'s thin template rather than leaving the tree contradicting the doc | this slice | open |
| R-5 | Javadoc inside the moved classes links root types (`{@link AdminAuditFilter}`, `{@link SecurityConfig}`) that are package-private and in another package — broken links, and prose implying a dependency the module→root rule forbids | high | low | Convert those to `{@code ...}` in phase 1; AC-5 covers the bytecode half | this slice | closed — the three root links in the moved Javadoc are `{@code}` now |
| R-6 | The docs counting sweep misses a site — every "two non-context modules" sentence becomes false | med | med | The site list is pre-enumerated below (*Docs counting sweep*) from a repo-wide inventory, and `riviera-docs-freshness` runs over the branch range at close-out as the independent check | this slice | open |
| R-7 | Flyway version collision with an in-flight PR | n/a | n/a | **No migration in this slice** — no `V<n>` is claimed, so no renumbering can be owed | — | closed (no migration) |
| R-8 | Sibling close-out debt: `docs/plans/challenge-non-context-module.md` is still present although PR #916 merged; by `riviera-docs-freshness` § *Plan-doc retirement* it dies at the next close-out, which is this slice's | certain | low | Phase 2 deletes it together with this plan doc's own retirement note | this slice | open |
| R-9 | The sole-writer token `admin_audit_record` false-positives on the module's own package string | low | low | Cannot: the package is `audit`, not `admin_audit_record`; the same reasoning ADR-0017 recorded for `challenge_registry`. AC-3's vacuity guard is the counter-check | this slice | closed (by construction) |

## Open questions / Assumptions

- **Assumption:** No open PR touches `SecurityConfig`, `WebSliceStubs`, `PayoutModuleTest` or the
  four ArchUnit nets this slice edits. — *Owner:* this slice · *Resolves by:* re-checked at the
  merge-from-main before ready-for-review.

### Resolved

- **Q-1 — the module name.** `audit` (`ai.riviera.platform.audit`, display name *Admin audit
  trail*). Single word, the `challenge` precedent — ADR-0017 rejected `proofofwork` partly as the
  only multi-word package name in the tree — and the word the code already uses
  (`/api/admin/audit`, `X-Audit-Reason`, the console's Audit tab). The admin scoping stays on the
  types (`AdminAuditLog`, `admin_audit_record`), so a second trail would need no package rename.
  `adminaudit` rejected as multi-word; `accountability` as a word appearing nowhere in the tree.
  *Decided by the maintainer at the plan gate, 2026-09-03.*
- **Q-2 — `AdminAuditReasons`.** Stays whole at the root. ADR-0017's stated default
  ("header/sanitizer wherever the fence needs it"); the filter is its only production caller, and
  an HTTP header name is transport policy — the category ADR-0017 Decision 1 assigns to the edge.
  Consequence: the root's grant row is `audit → {api}` (like `notification`), not
  `{api, vocabulary}` as the issue predicted, because the root never names a published `audit`
  value type. Accepted cost, recorded here so a later reader does not re-derive it: the 500-char
  cap mirrors the column comment yet lives outside the module owning the column, and the port
  trusts its caller to have neutralized client text. *Decided by the maintainer at the plan gate,
  2026-09-03.*
- **Q-3 — `AdminAuditController`.** Moves to `audit/adapter/in`. ADR-0017's stated default and an
  exact `ChallengeController` copy: a read over the mechanism's own table is a driving adapter of
  the mechanism. `SecurityConfig` keeps role-gating `/api/admin/audit` by its own literal, as it
  does for every other module-owned endpoint. *Decided by the maintainer at the plan gate,
  2026-09-03.*

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches no booking, beach-map or
`availability` code path; `admin_audit_record` is append-only with deliberately no unique
constraint (V38: "two identical actions really did happen twice"), so it has no claim semantics
to protect. No table but `admin_audit_record` is read or written, and its statements move
unchanged.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `audit` | **new** (non-context, closed, thin, `allowedDependencies = {}`) | none — it owns table-backed state, not an aggregate | ADR-0017 Decision 1 + 6: a port-fronted mechanism owning a table, that no bounded context owns, is a non-context module. The `/api/admin` namespace spans six modules and the root, so the accountability record over the whole namespace has no bounded context to live in — the fact `AdminAuditLog`'s own Javadoc already states |
| M-2 | root (not a module) | existing | — | keeps the **fence**: `AdminAuditFilter`, `AdminAuditReasons`, the route policy and role gate in `SecurityConfig` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `audit.api` | `AdminAuditLog#append(String actor, String method, String path, int status, String reason)` and `#latest(int limit)` | `audit.vocabulary.AdminAuditEntry` | the composition root (`SecurityConfig` → `AdminAuditFilter`) calls `append`; the module's own `AdminAuditController` calls `latest` |

One port, not two: appending an action and reading back the latest actions are the same
conversation about the same trail — the `ProofOfWorkChallenges` precedent (ADR-0017 Decision 2
keeps `enabled`/`issue`/`verify` on one port although the root and the module's own controller
use different subsets). `latest` is published although only the module calls it today; splitting
it into an unpublished second port would buy least-privilege on a two-method interface at the
cost of a hypothetical seam.

**Domain events (id-based payloads, invariant #11)**

`N/A — the module publishes and consumes no events.` It is closed
(`allowedDependencies = {}`) and, like `challenge`, no bounded-context module knows it exists.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Appending and storing one row per audited admin action; sole writer of `admin_audit_record` | `audit` | New § in `RESPONSIBILITIES.md` (Job). Not the root's: ADR-0017 Decision 1 makes a port-fronted, table-owning mechanism a module. Not a bounded context's: the audited namespace spans six of them, so none can claim it — the ADR-0017 Context 3 argument |
| Reading back the latest recorded actions (`GET /api/admin/audit`) | `audit` | A driving adapter over the module's own table (Q-3). Not `operator`'s, whose Job is operator accounts and ownership, not a namespace-wide action record |
| Deciding **which** requests are audited (the `/api/admin/` prefix, the mutating-method set) and **when** (after `AuthorizationFilter`) | root (platform edge) | `RESPONSIBILITIES.md` § *Platform edge*: the fence — filter, ordering, route policy — is the edge's. ADR-0017 Decision 1, restated |
| Reading and sanitizing the `X-Audit-Reason` header | root (platform edge) | Q-2: an HTTP header is transport policy, the same category as the fenced-route set. It is on no module's Job list |
| Role-gating `/api/admin/audit` to ADMIN | root (platform edge) | Invariant #13's `/api/admin/**` exemption is a `SecurityConfig` matcher; `review`'s Not-My-Job list already sends "the ADMIN role gate" to the edge |

**A correction this table forces:** `RESPONSIBILITIES.md` §`review`'s Not-My-Job line currently
reads "the ADMIN role gate and **the admin audit record** → the platform **edge**". The role gate
stays the edge's; the *record* becomes `audit`'s. Phase 2 splits that line — a docs-freshness
finding this slice creates and must therefore close.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money, no ledger, no Stripe surface is read or written.

## Angular — frontend surfaces touched

`N/A — backend-only.` `frontend/src/app/admin/admin-audit.service.ts` calls
`/api/admin/audit`, and five admin services send `X-Audit-Reason`; the path, the header and the
`AuditEntryView` shape are all unchanged, so no frontend file changes. The one frontend comment
naming a backend type (`admin.model.ts`: "mirrors the backend `AdminAuditController.AuditEntryView`")
stays true — the controller keeps its simple name and its nested DTO.

## FE↔BE contract

`N/A — no contract change.` Same method, path, query parameter, response shape and status codes;
same request header. Verified behaviour-by-behaviour in the parity ledger above.

## Docs counting sweep

> Pre-enumerated so phase 2 is a checklist, not a search. Every site below states a count or an
> ownership fact this slice makes false. `riviera-docs-freshness` runs over the branch range at
> close-out as the independent check that the list was complete.

- `CLAUDE.md` — the non-context paragraph under the module table ("And **`challenge`**, the second
  non-context module") gains `audit`; the § *Platform edge* summary line gains the audit mechanism.
- `RESPONSIBILITIES.md` — new § `audit` (not a bounded context), after § `challenge`; § *Platform
  edge* names the audit fence/mechanism split; §`review`'s Not-My-Job line split (above); the
  fitness-function table gains the `admin_audit_record` sole-writer row.
- `.claude/skills/riviera-modulith/SKILL.md` — "plus two non-context modules" → three; "all nine
  … are full, and so is the non-context `challenge`" → `audit` is thin; the thin template gains
  the `adapter/in` clause (R-4).
- `.claude/skills/riviera-modulith/references/boundaries.md` — "the two non-context ones" → three.
- `docs/architecture/domain-model.md` — "the two non-context modules, `shared` and `challenge`,
  collaborate with nobody and are not drawn" → three.
- `README.md` — "plus `shared`, a non-context Shared Kernel" (already stale after #916) → both
  siblings named.
- `docs/adr/ADR-0017-…md` — Status line: the second instance is implemented by this PR; Decision 6
  records what this plan decided (name, controller moved, reasons stayed).
- `platform/src/test/java/ai/riviera/platform/ModularityTests.java` and
  `PackageShapeArchitectureTests.java` — Javadoc module counts.
- `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java` — the anchor Javadoc
  ("the application **root** plus `venue`, `review`, …") now that `/api/admin/audit` is
  module-owned.
- `docs/research/2026-09-03-non-context-modules-….md` — "over the ten module trees" (a stated
  count in a historical note; correct in place or leave with a dated note, docs-freshness's call).

---

## File structure

**Created — production**

- `platform/src/main/java/ai/riviera/platform/audit/package-info.java` — `@ApplicationModule(displayName = "Admin audit trail", allowedDependencies = {})`
- `platform/src/main/java/ai/riviera/platform/audit/api/package-info.java` — `@NamedInterface("api")`
- `platform/src/main/java/ai/riviera/platform/audit/api/AdminAuditLog.java` — the one published port (`append`, `latest`)
- `platform/src/main/java/ai/riviera/platform/audit/vocabulary/package-info.java` — `@NamedInterface("vocabulary")`
- `platform/src/main/java/ai/riviera/platform/audit/vocabulary/AdminAuditEntry.java` — the published entry record (was `AdminAuditLog.Entry`)
- `platform/src/main/java/ai/riviera/platform/audit/adapter/in/AdminAuditController.java` — `GET /api/admin/audit`
- `platform/src/main/java/ai/riviera/platform/audit/adapter/out/JdbcAdminAuditLog.java` — the only writer of `admin_audit_record`

**Deleted — production (moved into the module)**

- `platform/src/main/java/ai/riviera/platform/AdminAuditLog.java`
- `platform/src/main/java/ai/riviera/platform/AdminAuditController.java`
- `platform/src/main/java/ai/riviera/platform/JdbcAdminAuditLog.java`

**Modified — production**

- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — imports the port from the module; the `ADMIN_AUDIT_PATH` / `ADMIN_AUDIT_NAMESPACE` literals and the filter registration stay
- `platform/src/main/java/ai/riviera/platform/AdminAuditFilter.java` — imports the port; Javadoc `{@link}` → `{@code}` for the types that left the package
- `CLAUDE.md` — the non-context-module paragraph + the platform-edge line
- `RESPONSIBILITIES.md` — new § `audit`; § *Platform edge*; §`review` Not-My-Job split; the fitness-function table row
- `README.md` — the module-count sentence
- `docs/architecture/domain-model.md` — the non-context-module parenthesis
- `docs/adr/ADR-0017-non-context-module-for-edge-mechanisms.md` — Status + Decision 6 outcome
- `docs/research/2026-09-03-non-context-modules-generic-subdomains-and-cohesive-mechanisms.md` — the module-tree count, if docs-freshness rules it a stated fact rather than a dated finding
- `.claude/skills/riviera-modulith/SKILL.md` — the counts + the thin template's `adapter/in` clause
- `.claude/skills/riviera-modulith/references/boundaries.md` — the count

**Created — tests**

- `platform/src/test/java/ai/riviera/responsibilityfixture/rogue/adapter/out/RogueAdminAuditWriter.java` — the sole-writer violation (AC-2)
- `platform/src/test/java/ai/riviera/responsibilityfixture/audit/adapter/out/FixtureJdbcAdminAuditLog.java` — the exclusion path (the fixture module that may carry the token)

**Modified — tests**

- `platform/src/test/java/ai/riviera/platform/ResponsibilitiesArchitectureTests.java` — rule 7: `admin_audit_record` sole-writer, its vacuity guard and its negative proof
- `platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java` — `GRANTED_SURFACES` gains `audit → {api}`; the class Javadoc kept in lockstep
- `platform/src/test/java/ai/riviera/platform/ModularityTests.java` — Javadoc count
- `platform/src/test/java/ai/riviera/platform/PackageShapeArchitectureTests.java` — Javadoc count + the thin-module note
- `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java` — the anchor Javadoc's owner list
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — imports the port + entry from the module
- `platform/src/test/java/ai/riviera/platform/payout/PayoutModuleTest.java` — `@MockitoBean AdminAuditLog` (R-1)
- `platform/src/test/java/ai/riviera/platform/review/ReviewSubmitFlowIT.java` — the sibling Javadoc's `@MockitoBean` count, if it names one
- `platform/src/test/java/ai/riviera/platform/AdminAuditTrailIT.java` — imports only; assertions unchanged (AC-8/AC-9 depend on them staying unchanged)

**Deleted — docs (retirement)**

- `docs/plans/challenge-non-context-module.md` — the sibling's overdue retirement (R-8)
- `docs/plans/admin-audit-non-context-module.md` — this plan, retired at the close-out after its own PR merges

---

## Phase 0 — The sole-writer net, red against the root

> ADR-0017 Context 2 says the sole-writer rule *cannot* be written while the writer sits at the
> root. Phase 0 writes it anyway and watches it fail on `JdbcAdminAuditLog` — the argument for
> the whole slice, executable. This phase's commit is a deliberate red-TDD commit (`riviera-sdlc`
> CI-gate row exempts it); phase 1 turns it green.

**Files:** Modify `platform/src/test/java/ai/riviera/platform/ResponsibilitiesArchitectureTests.java` · Create the two `responsibilityfixture` classes

- [x] **Step 1: Write the failing test** — add `ADMIN_AUDIT_TABLE = "admin_audit_record"` and
      `AUDIT_MODULE = "audit"`, a `adminAuditTableViolations(JavaClasses, base)` collector cloned
      from `challengeRegistryViolations`, and the three tests of AC-1/AC-2/AC-3, plus rule 7 in
      the class Javadoc.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*ResponsibilitiesArchitectureTests*"`
      → FAIL, 21 tests / 2 failed, exactly the pair predicted:
      `adminAuditTableIsTouchedOnlyInsideTheAuditModule` reports
      `ai.riviera.platform.JdbcAdminAuditLog references the 'admin_audit_record' table`, and
      `theAuditModuleItselfWritesTheTable` fails because no `audit` module exists yet.
- [x] **Step 3: Minimal implementation** — none in this phase; the fixtures are what make AC-2 pass.
      AC-2 (`adminAuditTableTouchedOutsideTheAuditModuleIsRejected`) was green in the same run —
      the collector rejects `RogueAdminAuditWriter` and spares `FixtureJdbcAdminAuditLog` (`--tests "*ResponsibilitiesArchitectureTests.adminAuditTableTouchedOutsideTheAuditModuleIsRejected*"`).
- [x] **Step 4: Commit the red net** — `git commit -m "Add the admin_audit_record sole-writer net, red against the root (#914)"`
- [x] **Step 5: Update plan-doc execution status** in the same commit window.

## Phase 1 — The move (module in, fence stays)

**Files:** the Created/Deleted/Modified production and test lists above, minus the docs entries

- [x] **Step 1: Create the module skeleton** — the three `package-info.java` files, copying
      `challenge`'s Javadoc shape: what the module is (a Cohesive Mechanism, ADR-0017), why it is
      closed, and that the fence is not here.
- [x] **Step 2: Move the four types** — `AdminAuditLog` → `audit.api` (`public interface`),
      `Entry` → `audit.vocabulary.AdminAuditEntry` (`public record`), `AdminAuditController` →
      `audit.adapter.in` (package-private), `JdbcAdminAuditLog` → `audit.adapter.out`
      (package-private). Convert every Javadoc `{@link}` naming a root type to `{@code}` (R-5).
- [x] **Step 3: Re-point the edge and the tests** — `SecurityConfig` + `AdminAuditFilter` imports;
      `WebSliceStubs` import + the anonymous stub's `AdminAuditEntry`; `PayoutModuleTest`'s
      `@MockitoBean` (R-1); `AdminAuditTrailIT` import.
- [x] **Step 4: Grant the root exactly `audit::api`** — `CompositionRootDisciplineTests`
      `GRANTED_SURFACES` + the class Javadoc's list, kept in lockstep as its own comment demands.
- [x] **Step 5: Run the structural net + the behaviour proofs** —
      `./gradlew test --tests "*ModularityTests*" --tests "*ResponsibilitiesArchitectureTests*" --tests "*CompositionRootDisciplineTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"`
      → all PASS (phase 0's red is now green: AC-1…AC-7). Then the behaviour set:
      `--tests "*AdminAudit*" --tests "*AdminSurfaceRoleGateTest*" --tests "*PayoutModuleTest*"`
      → PASS (AC-8, AC-9, AC-10, R-1, R-2).
- [x] **Step 6: Generalization-audit pass** — population: *every root-package type that is a
      port-fronted mechanism rather than a fence* (the ADR-0017 Decision 1 test), enumerated with
      a command over the root package's classes, not by resemblance. Record the verdict for each
      candidate in the log below; ADR-0017 Decision 5 already settles `RateLimitFilter`.
- [x] **Step 7: Commit** — `git commit -m "Move the admin audit mechanism into the closed non-context module audit (#914)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

## Phase 2 — Docs, ADR status, plan retirement

**Files:** the docs entries in the File-structure section + the two plan-doc deletions

- [ ] **Step 1: Work the *Docs counting sweep* checklist** — every site, including the §`review`
      Not-My-Job split the Module-ownership table forced.
- [ ] **Step 2: Write § `audit` in `RESPONSIBILITIES.md`** on the § `challenge` template: Job
      (record every mutating admin action past the gate; serve the newest-first read; sole writer
      of `admin_audit_record`), Not-my-job (which requests are audited, the filter and its
      ordering, the `X-Audit-Reason` header and its sanitizer, the ADMIN role gate — all the
      root's fence), and the published-surface line.
- [ ] **Step 3: Run `riviera-docs-freshness`** over `origin/main..HEAD` and close every finding
      it raises (R-6).
- [ ] **Step 4: Retire both plan docs** — the sibling's (R-8) and this one, at the close-out.
- [ ] **Step 5: Reconcile the File-structure section** — `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [ ] **Step 6: Commit + finalize the execution status** (stage pointer DONE, `merged via PR #NN`).

---

## Execution status

**Stage pointer:** `implement (phases 0–1 done, all ACs green locally); phase 2 (docs) next`

**Next action:** Phase 2 — the docs counting sweep, § `audit` in `RESPONSIBILITIES.md`, the
ADR-0017 status line, and the two plan-doc retirements. Then push, open the draft PR, mark ready
for review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the sole-writer net, red against the root | ✅ (deliberately red; phase 1 greens it) | (this phase's commit) |
| 1 — the move (module in, fence stays) | ✅ | (this phase's commit) |
| 2 — docs, ADR status, plan retirement | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-03 | phase 1 (the move) | Every remaining root-package type that is a **port-fronted mechanism** rather than a fence — ADR-0017 Decision 1's own test. Enumerated by the four mechanisms that make something one, not by resemblance: carries SQL, is a `@Component`/`@Service` bean, owns a `@Scheduled` job, or is implemented behind a root-declared port | over `platform/src/main/java/ai/riviera/platform/*.java`: `grep -E '(INSERT INTO\|SELECT .* FROM\|UPDATE \|DELETE FROM)'`, `grep -lE '^@(Component\|Service\|Repository)'`, `grep -l '@Scheduled'`, `grep -n '^interface '` | `MoneyPathAlertCheck` + `ObservabilityConfig` (SQL); 13 root beans; `MoneyPathAlertCheck` (job); `SsoProviderClient` (root port) | **No further instance.** `MoneyPathAlertCheck`/`ObservabilityConfig` read `event_publication` — Modulith's registry table, which they do not own — behind no port, so they are self-checks, not mechanisms. The SSO gateways, `CustomerRecovery` and `RecoveryTokens` are login machinery, which § *Platform edge* pins at the edge by a settled rule this slice does not reopen. `RateLimitFilter` is ADR-0017 Decision 5 and `ScheduledQueryTimeout` is named in Decision 4; both stay. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3:** `./gradlew test --tests "*ResponsibilitiesArchitectureTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4, AC-5:** `./gradlew test --tests "*CompositionRootDisciplineTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** `./gradlew test --tests "*ModularityTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** `./gradlew test --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-8, AC-9:** `./gradlew test --tests "*AdminAuditTrailIT*" --tests "*AdminSurfaceRoleGateTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-10:** `./gradlew test --tests "*AdminSurfaceRoleGateTest*" --tests "*PayoutModuleTest*"` → PASS. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified); no availability code path touched (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `allowedDependencies = {}` verified (invariant #11).
- [ ] **Payment/payout** section filled (N/A justified) (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: `occurred_at` still a UTC instant off the injected `Clock` (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No Flyway migration needed and none added; V38 byte-identical (invariant #12).
- [ ] **Frontend** untouched; no contract change.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (Q-1..Q-3 resolved).
- [ ] **Close-out written in THIS PR** — this doc's final state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
