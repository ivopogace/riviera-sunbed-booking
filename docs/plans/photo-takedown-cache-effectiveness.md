# Make a photo takedown actually stick — revalidating cache + existence-checked 304

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a photo's variant rows are gone, it stops being served to **every** class of
requester — new ones, clients holding the ETag, and shared caches — instead of surviving for up to
a year behind `Cache-Control: immutable` and an existence-blind `304`.

> **Precisely scoped, on purpose.** "Once the variant rows are gone" is doing real work in that
> sentence: a takedown is **slot-scoped**, and ADR-0013's accepted R-3 caveat still holds — if the
> same image occupies two slots of one venue, removing one slot leaves the other publishing
> byte-identical variants under the same content hash, so `exists` legitimately still answers
> `true`. That is inherited, documented behaviour (`venue_photo_variant_serving_idx` is
> deliberately non-unique, #142 F-2), **not** something this slice changes or regresses. This slice
> fixes the *cache* half only: given a removal that did happen, no cache and no ETag holder
> outlives it.

**Architecture:** The single most significant decision is **adding a blob-free existence check
to the conditional-GET path** rather than reusing `loadBytes`. The `304` branch currently answers
from the URL path alone; making it honest could be done by calling `serve(...)` and discarding
the bytes, but under a revalidating `Cache-Control` that would read the `bytea` column on *every*
view — precisely what ADR-0008's serving discipline forbids. A new `PhotoStorage#exists`, keyed on
the existing `venue_photo_variant_serving_idx (venue_id, content_hash)` index, keeps revalidation
off the blob path, which is what makes the header change affordable at all.

**Persistence:** JDBC only (invariant #1). **No migration** — the existence query reuses
`venue_photo_variant_serving_idx (venue_id, content_hash)` from `V24__venue_photo.sql` and selects
no new column. No `V<n>` is claimed, so no Flyway collision is possible.

**Source of intent:** GitHub issue #508 (its option 2, corrected — see the grill findings below);
ADR-0008 (the `immutable` header it mandates), ADR-0013 / #230 (the moderation guarantee at stake),
#504 risk R-7 (where this was first deferred).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — **overturned the
issue's premise**: it caught that `*.onrender.com` is already Cloudflare-fronted, that the edge is
Render's zone and therefore unpurgeable by us, and that a green test *pinned* the 304 hole) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger, which is what turned "flip a
header" into "flip a header **and** fix the 304 branch") · `tdd` (each phase red-first: the
takedown-then-revalidate IT failed with `304` before the fix) · `riviera-review-overlay` (review
gate — 6 findings, all fixed) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD` —
**10 stale statements, all patched, but only 4 of them by this sweep**: it caught CLAUDE.md's
`venue` row, ADR-0013's cache-deficiency bullet (two of whose stated premises were false),
`VenuePhotos`' "two of the three" method count and `PhotoServingUrls`' javadoc — and **missed six
more** that the review gate then found, because I grepped phrases (`immutable cache`) instead of
the bare keyword (`immutable`). Full accounting + the lesson: the audit note below) · `riviera-modulith` (kept `exists` as a module-internal driven-port method on
`PhotoStorage` in `application/` — **not** a new published `api/` surface, since only `venue`'s own
adapter calls it; same "purposeful conversation" as persist/serve/delete rather than a fifth port) ·
`riviera-java-conventions` (`Optional`-free `boolean` typed outcome, package-private adapter,
text-block SQL with named params, one-line-or-no comments — its §6c is what the review gate then
caught me violating in three test comments) · `codebase-design` (**loaded late, at the review gate's
RV-PROC-1 finding** — its deletion test is what justifies the shape: delete `PhotoStorage#exists`
and the complexity reappears at the caller as either a blob read or the bug, so it earns its keep;
it also names `VenuePhotos#exists` honestly as a **pass-through** that earns its keep structurally,
not by depth — without it the controller would have to reach past the inbound port to the driven
one) · `domain-modeling` (**also loaded late, same finding** — and it changed the diff: my
`CONTEXT.md` fix had put `Cache-Control: public, no-cache` into the *glossary*, which the skill
forbids outright ("totally devoid of implementation details… a glossary and nothing else"), so the
entry was rewritten in domain language. It also confirms amending ADR-0008/0013 was right rather
than minting a new ADR) · `postgres` (confirmed the existence
query is index-only on the **existing** `(venue_id, content_hash)` index — no new index, no
migration; `EXISTS(SELECT 1 …)` over `COUNT(*)`) · `riviera-local-debug` (scoped
`gradle test --tests` recipe for this session's runs)

**Branch:** `claude/sdlc-508-dr9vx8` — the cloud session's designated remote branch, standing in
for `bugfix/photo-takedown-cache-effectiveness` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a stored variant, when a client revalidates with a matching `If-None-Match`,
      then the response is `304` and no blob is read. *Pinned by:*
      `VenuePhotoServingIT.matchingIfNoneMatchIs304WhileTheVariantExists`
- [x] **AC-2:** Given a photo that has since been removed (owner delete or admin takedown), when a
      client revalidates with the still-matching `If-None-Match`, then the response is **`404`,
      not `304`** — the removal reaches the client that already holds the bytes. *Pinned by:*
      `VenuePhotoServingIT.revalidationAfterRemovalIs404`
- [x] **AC-3:** Given any successful serve, then the response carries a **revalidating** cache
      directive (`no-cache`, `public`) plus the strong `ETag`, and carries neither `immutable` nor
      `max-age=31536000`. *Pinned by:* `VenuePhotoServingIT.servesBytesWithRevalidatingCacheAndStrongEtag`
- [x] **AC-4:** Given a venue and a content hash, when `PhotoStorage#exists` is asked, then it
      answers `true` while any variant row carries that `(venue_id, content_hash)` and `false`
      once the photo is deleted — without selecting the `bytea` column. *Pinned by:*
      `JdbcPhotoStorageIT.existsTracksTheVariantRowWithoutReadingBytes`

## Non-goals

- **Building a CDN purge / invalidation outbox** (#508 option 1). There is no CDN we own: the
  edge in front of production today is **Render's** Cloudflare zone — we hold no zone id and no
  API token, so there is nothing we could call. It stays the right answer for a *future,
  self-owned* CDN in front of an object store, and moves to ADR-0008's flip threshold as a
  precondition of that migration.
- **The object-storage migration itself** (ADR-0008's deferred scale-out path).
- **Changing what a takedown does at the origin** — #504/#511 already delete metadata + bytes in
  one statement; only the *cache-facing* half is in scope.
- **Report intake / moderation queue** (#510) — a separate slice.
- **Any frontend change.** The Angular consumers feed these URLs to `NgOptimizedImage`, which adds
  no caching semantics of its own; freshness is purely the server header.

## Behavior-parity ledger (retirement / replacement slices only)

Applies: this slice **replaces** the serving endpoint's caching contract.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `200` serves bytes with strong `ETag` | **preserved** | unchanged — same `ETag` (`"<hash>"`), same body, same content type |
| Matching `If-None-Match` → `304` with no blob read | **preserved** | still `304`, still no `bytea` read — now gated on the blob-free `PhotoStorage#exists` |
| Matching `If-None-Match` → `304` **even after the rows are deleted** | **changed → now `404`** | this *was* the defect, and `VenuePhotoServingIT.matchingIfNoneMatchIs304WithoutABlobRead` asserted it explicitly. The old assertion is rewritten, not deleted — see AC-2 |
| Unknown / non-hex hash → `404` with no lookup | **preserved** | the `ContentHash` hex guard is untouched (path-traversal / SSRF safe) |
| `Cache-Control: public, max-age=31536000, immutable` | **changed → `no-cache, public`** | a year-long `immutable` TTL outlives a takedown at any shared cache; `no-cache` still lets the client **store** the bytes and reuse them on a `304`, so bandwidth economics survive — only the zero-RTT window is traded away |
| DB hit ≈once per image, not per view (ADR-0008 intent) | **preserved** | revalidation resolves on the blob-free `exists` index probe; the `bytea` column is still read only on a genuine `200` |
| A replaced photo mints a new hash → a new URL | **preserved** | content-addressing is untouched; this slice only changes what happens on *removal* |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Revalidation traffic on the tourist hot path.** `no-cache` means every image on every view issues a conditional request, where `immutable` issued none | high (by design) | low | The `304` path is blob-free (AC-1/AC-4) — an index-only probe on `venue_photo_variant_serving_idx`, no `bytea`, no join — and returns an empty body. ADR-0008's stated intent ("keep Neon out of the tourist hot path") is preserved; what is traded is one cheap RTT per image per view, at a Phase-1 catalogue of a handful of venues | claude | **closed** — accepted, and cheaper than planned: the `304` returns an empty body off an index probe, so the traded cost is one RTT, not a DB read |
| R-2 | **The header alone would not have fixed anything.** #508's option-2 rationale ("revalidation against a deleted variant naturally 404s") is false in this codebase — the `304` is answered before any lookup | certain (verified) | high | This is why the slice ships **both** halves; AC-2 is the pin. Recorded as a correction on #508 at close-out | claude | **closed** — both halves shipped in `4174dfb`; AC-2 is the regression pin |
| R-3 | Shared-kernel / boundary drift from a new port method | low | med | `exists` is added to the **existing module-internal** `PhotoStorage` port in `application/` (invariant #11), not to a published `api/` surface — no `allowedDependencies` change, no new named interface. `ModularityTests` + `PackageShapeArchitectureTests` re-run | claude | **closed** — no published surface touched; the structural net is green |
| R-4 | Test doubles drift out of sync with the widened ports (`InMemoryPhotoStorage`, `WebSliceStubs`) | med | low | Both are updated in the same commit as the port change; the compiler enforces it for the fake, and `EndpointRoleGateCoverageTest` for the stub | claude | **closed** — `InMemoryPhotoStorage` and `WebSliceStubs` updated in `4174dfb`; `EndpointRoleGateCoverageTest` green |
| R-5 | Flyway version collision | none | — | **No migration in this slice** — the existence query reuses `V24`'s existing index. No `V<n>` claimed | claude | closed at plan time |
| R-6 | The `304`-path blob-freeness (AC-1) is guaranteed by construction (the controller calls `exists`, never `serve`) rather than asserted at runtime | low | low | Same standard already applied to `PhotoStorage#listMetadata`, whose blob-freeness is likewise carried by explicit SQL + javadoc. Adapter-level correctness **is** pinned (AC-4); a runtime "never read bytes" assertion would need a spy bean wrapping a `@Transactional` proxy, which buys less than it risks | claude | **closed** — accepted; AC-4 pins the adapter, and the controller's `304` branch calls `exists` and never `serve` |

## Open questions / Assumptions

*(Empty — both entries resolved below.)*

### Resolved

- **Open question: is #508 relevant at all, given a planned move to Hetzner?** — raised by the
  maintainer at the decision point. **Resolved: yes, and mostly host-independently.** The `304`
  defect is application logic (`VenuePhotoController` answers from the URL path, never checking
  existence) and migrates with the app to any host, CDN or not. The header half is host-*dependent*
  but not host-*eliminated*: leaving Render drops Render's Cloudflare, but `public, max-age=1yr,
  immutable` licenses **any** shared cache, a Hetzner deployment normally gains a reverse proxy or
  Cloudflare of its own, and ADR-0008's own flip threshold plans an object store + CDN. Fixing it
  now de-risks that move rather than depending on it.
- **Open question: which cache posture?** — **Resolved by the maintainer: `public, no-cache` +
  `ETag`.** Chosen over a short `max-age` (bounded-but-nonzero residual, arbitrary window) and over
  keeping `immutable`. Recorded as an amendment on ADR-0008 in phase 1, as #508 requires.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches only the venue-photo serving path
(`venue_photo` / `venue_photo_variant`). It writes no `availability(set_id, booking_date)` row,
reads none, publishes no event, and moves no money. The only new statement is a read-only `EXISTS`
probe. A removal racing a revalidation is benign in both orders: the client gets either the last
`304` or the first `404`, and no `200` can outlive the row it reads.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | It owns venue photos end-to-end (#142, ADR-0008) — storage, serving, and both moderation operations. The cache contract *is* the serving contract |

**Cross-module named interfaces (`api/` ports)**

`N/A — no cross-module surface changes.` `PhotoStorage` and `VenuePhotos` are both
module-internal ports in `venue/application/` (invariant #11); `exists` is added to each. Nothing
outside `venue` calls either, so no `@NamedInterface` and no `allowedDependencies` grant changes.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published or consumed.` A photo removal deliberately publishes nothing (#504).

### Module ownership (§4a)

All in `venue`, no boundary change. `venue`'s **Job** covers venue photos including the serving
endpoint and both ownership-free moderation operations; the HTTP caching contract of that endpoint
is part of it. It is on no other module's **Not My Job** list — `shared` would be wrong (this is
module-owned behavior, not technical shared code, and the admission bar is ownership, never reuse).

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.`

## Angular — frontend surfaces touched

`N/A — backend-only.` The Angular consumers pass these URLs to `NgOptimizedImage`, which adds no
caching semantics; nothing in the client needs to change for a header swap. No `frontend/` file is
touched, so no Playwright spec is due (`playwright-cli` not loaded — recorded here deliberately so
the omission reads as a decision, not a miss).

## FE↔BE contract

`N/A — no contract change.` Same route, same DTO, same status codes for existing states. The one
observable difference is a response **header**, plus `404` (instead of `304`) on revalidation of a
removed photo — which is the fix, and which every HTTP client already handles.

## Execution status

**Stage pointer:** `review + sonar gates run; all 6 findings fixed — awaiting the fix round's CI/Sonar re-run, then merge`

**Next action:** Confirm CI + Sonar green on the fix commit, then merge PR #514 and close #508 with
the premise-correction comment (close-out step 3).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Existence-checked 304 + revalidating cache header | ✅ | `4174dfb` |
| 1 — ADR-0008 amendment + substrate-doc refresh | ✅ | `9247692` |
| 2 — Review-gate fix round (F-1, F-3…F-6) | ✅ | `bf7c7c8` + *(this commit)* |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (CLAUDE.md-compliance reviewer) | `CONTEXT.md:43` still defined a **photo variant** as served "at an immutable, long-cached public URL" — a stated present-tense fact this slice falsifies. **My own docs-freshness sweep missed it**: the grep patterns were `immutable cache` / `immutable URLs`, and the actual wording is `immutable, long-cached` | **fixed** — CONTEXT.md now states the revalidated contract; the lesson is that a substring grep for a *phrase* is weaker than one for the bare keyword (`immutable`), which is what caught it |
| F-2 | sonar gate | Quality gate passed; list pulled from the API per gate step 2 rather than trusted from the badge: `new_lines: 65` (so the analysis really ran — not a false-clean zero), issues `total: 0`, `new_duplicated_blocks: 0`, `new_coverage: 100.0` | **closed — nothing to fix** |
| F-3 | review gate (**RV-PROC-1**, overlay reviewer) | *Skills consulted* named only `riviera-modulith` for a diff touching an application service, a JDBC adapter and a controller — the routing table's backend-structure row also requires **`codebase-design`** and **`domain-modeling`**, and two ADR amendments are `domain-modeling`'s own trigger | **fixed** — both skills **loaded** (not just listed) and the line records what each actually changed. `domain-modeling` changed the diff: it forced the `CONTEXT.md` entry back to glossary language after my F-1 fix had put HTTP header syntax into it |
| F-4 | review gate (**RV-STYLE-1**, flagged independently by the comment reviewer *and* the prior-PR reviewer) | Three new two-line inline `//` comments in the ITs, violating `riviera-java-conventions` §6c. Precedent: PR #512 fixed this same class one day earlier in this same feature area | **fixed** — each shortened to one line |
| F-5 | review gate (comment reviewer) | Five Javadocs **outside the diff** still asserted the `immutable` cache contract: `ContentHash`, `StoredBytes`, `CoverPhotoView`, `PhotoUploadResponse`, `VariantMeta`. `ContentHash` quoted the exact header ADR-0008 had just been amended to change | **fixed** — all five; folded into the docs-freshness audit above, which now reports 10 findings, not 4 |
| F-6 | review gate (prior-PR reviewer) | This plan's Goal claimed a removal "stops being served to **every** class of requester" without cross-referencing ADR-0013's still-true R-3 caveat — a takedown is **slot-scoped**, so the same image in a second slot keeps the hash servable. Not a regression (inherited #142 F-2 behaviour), but the framing overclaimed | **fixed** — the Goal is now explicitly scoped to "once the variant rows are gone", with the caveat named |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/application/PhotoStorage.java` — `exists` on the storage port
- `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotos.java` — `exists` on the inbound port
- `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotoService.java` — delegates (public read, no ownership check)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcPhotoStorage.java` — the blob-free `EXISTS` probe
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenuePhotoController.java` — revalidating header + existence-gated `304`
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoServingIT.java` — AC-1/2/3
- `platform/src/test/java/ai/riviera/platform/venue/JdbcPhotoStorageIT.java` — AC-4
- `platform/src/test/java/ai/riviera/platform/venue/application/InMemoryPhotoStorage.java` — fake keeps parity
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — web-slice stub keeps parity
- `docs/adr/ADR-0008-venue-photo-storage.md` — the amendment #508 asks for
- `CLAUDE.md` — the `venue` row's #508 clause

---

## Phase 0 — Existence-checked 304 + revalidating cache header

**Files:** Modify `PhotoStorage.java` · `VenuePhotos.java` · `VenuePhotoService.java` ·
`JdbcPhotoStorage.java` · `VenuePhotoController.java` · Test `VenuePhotoServingIT.java` ·
`JdbcPhotoStorageIT.java` · `InMemoryPhotoStorage.java` · `WebSliceStubs.java`

- [x] **Step 1: Write the failing tests** — rewrite the two `VenuePhotoServingIT` cases (AC-1/2/3),
      add the `JdbcPhotoStorageIT` case (AC-4).
- [x] **Step 2: Run them, verify they fail** — `gradle test --tests "*VenuePhotoServingIT*"` →
      FAIL: revalidation after removal returned `304`, and the header still carried `immutable`.
- [x] **Step 3: Minimal implementation** — `exists` down the port/adapter chain; controller gates
      the `304` on it and swaps `IMMUTABLE` for `REVALIDATE`.
- [x] **Step 4: Run them, verify they pass** — scoped venue-photo + structural tests green.
- [x] **Step 5: Generalization-audit pass** — see the log below.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — ADR-0008 amendment + substrate-doc refresh

**Files:** Modify `docs/adr/ADR-0008-venue-photo-storage.md` · `CLAUDE.md` · this plan doc

- [x] **Step 1:** Amend ADR-0008's serving-discipline bullet and add the #508 amendment section —
      the decision, the Cloudflare finding, and the purge clause moved onto the flip threshold.
- [x] **Step 2:** Refresh the `venue` module row in `CLAUDE.md` (it cites #508 as a *future*
      CDN-purge requirement).
- [x] **Step 3:** Commit; finalize the execution status in this PR.

---

## Docs-freshness audit (close-out step 5)

Range `origin/main...HEAD`. **10 stale statements in total — 4 found by my sweep, 6 more found
afterwards by the review gate.** All patched; none flagged for a human, because none re-decided
anything: each was a stated fact the diff falsified. The 4-vs-6 split is the honest headline and is
recorded below rather than smoothed over — it repeats #447's shape almost exactly (six found by
reading the change, ten more only by grepping the substrate).

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `CLAUDE.md` `venue` row | "the CDN-purge it will require as #508" — an open future item | #508's removal-effectiveness half is closed here; the purge is now a precondition on ADR-0008's flip | patched |
| `docs/adr/ADR-0013:90-96` | "ADR-0008's serving GET returns `…immutable`"; "there is no CDN in front of the API"; "#508 records the two acceptable answers" | the header changed; `*.onrender.com` **is** Cloudflare-fronted (#286); purge was never available for Render's zone | patched — the deficiency is marked CLOSED, and both false premises are named rather than quietly deleted |
| `VenuePhotos` javadoc | "**Two of the three** are venue-scoped writes" | the port now has **four** methods (`exists` added) — the counting sweep's exact class | patched → "the two writes … the two reads" |
| `PhotoServingUrls` javadoc | "with the **immutable** cache headers (ADR-0008)" | the directive is now `public, no-cache` | patched |

### The six my sweep missed (found by the review gate, patched in the fix round)

| Doc:line | Stated fact | Action |
|---|---|---|
| `CONTEXT.md:43` | a photo variant is served "at an **immutable, long-cached** public URL" | patched (twice — see the lesson below) |
| `ContentHash.java:5` | "the cache key in the immutable serving URL (ADR-0008: `Cache-Control: immutable` + `ETag`)" — quotes the exact header ADR-0008 was just amended to change | patched → content-addressed |
| `StoredBytes.java:11` | "The controller returns these with an **immutable** `Cache-Control`" | patched → revalidating |
| `CoverPhotoView.java:6` | "**immutable** per ADR-0008" | patched → content-addressed |
| `PhotoUploadResponse.java:12` | "(**immutable** per ADR-0008)" | patched → content-addressed |
| `VariantMeta.java:9` | "build the **immutable** serving URL" | patched → content-addressed |

**Why they survived a sweep that was actually run — two distinct causes, both worth keeping:**

1. **A phrase grep is weaker than a keyword grep.** I grepped `immutable cache` and `immutable URLs`.
   The live wording was `immutable, long-cached`, `immutable per ADR-0008`, `an immutable
   Cache-Control`, `Cache-Control: immutable`. Prose varies; the keyword does not. **Grep the bare
   keyword (`immutable`) and read the hits** — the skill's own step 2b says exactly this ("grep the
   **words**, not the new identifier"), and I narrowed too early.
2. **Worse: five of the six were in my very first survey's output**, in the opening grep of the
   session, and I read past them because I was hunting the header constant. Seeing a hit is not
   triaging it.

The counting-sweep finding (`VenuePhotos`, "two of the three") is worth recording for the opposite
reason: `git diff` **could not** have shown it — the sentence sits above the method the slice added,
so reviewing the changed hunks reads correctly.

**Deliberately not patched:** `docs/plans/admin-photo-takedown.md` R-7, which recorded this as
deferred — historical plan docs are records, not living docs (skill §Scope discipline). Likewise
`V24__venue_photo.sql`'s comment: a historical migration must not be edited.

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-04 | Phase 0 — existence-blind conditional response | Any other endpoint answering `304`/`If-None-Match` or setting a long-lived `Cache-Control` without checking the resource still exists | `grep -rn "IF_NONE_MATCH\|NOT_MODIFIED\|CacheControl" --include=*.java platform/src/main` | `VenuePhotoController` **only** — it is the repo's single conditional-GET and single `Cache-Control` site | No other site to fix. The `ETag`-shaped mistake cannot recur elsewhere today; if a second cached read model lands, this plan is the precedent |

---

## Acceptance-criteria verification (final)

Red-first was verified for real, not asserted: the pre-fix `VenuePhotoController` was stashed and
the suite re-run, failing exactly the three controller-level ACs (`revalidationAfterRemovalIs404`,
`servesBytesWithRevalidatingCacheAndStrongEtag`, `matchingIfNoneMatchIs304WhileTheVariantExists`)
while the three untouched cases stayed green — `6 tests completed, 3 failed`.

- [x] **AC-1:** `gradle test --tests "*VenuePhotoServingIT*"` → `matchingIfNoneMatchIs304WhileTheVariantExists` PASS (phase 0).
- [x] **AC-2:** same run → `revalidationAfterRemovalIs404` PASS — failed with `304` before the fix (phase 0).
- [x] **AC-3:** same run → `servesBytesWithRevalidatingCacheAndStrongEtag` PASS (phase 0).
- [x] **AC-4:** `gradle test --tests "*JdbcPhotoStorageIT*"` → `existsTracksTheVariantRowWithoutReadingBytes` PASS (phase 0).

Also green in the same scoped runs: `VenuePhotoServiceTest`, `AdminPhotoTakedownIT`,
`AdminPhotoModerationIT`, `VenuePhotoReadModelIT`, plus the structural net (`ModularityTests`,
`JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
`PublishedSurfacePlacementArchitectureTests`) and `EndpointRoleGateCoverageTest` (the web-slice
stub). CI owns the full suite.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified `N/A`); no availability write path touched (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — not in scope, unaffected.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event payload changed (invariant #11).
- [x] **Payment/payout** section filled (`N/A`) (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — untouched.
- [x] Booking codes unguessable (invariant #7) — untouched; no code appears in this path.
- [x] Flyway migration present for schema changes (invariant #12) — **none needed**, no schema change.
- [x] **Frontend** standards met or deviation documented — `N/A — backend-only`, recorded above.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR** — this section is finalized here; **merged via PR #514** (no docs-only follow-up needed).
- [x] **The review gate ran in full** — `/code-review`'s subagent fan-out (human-authorized, per
      the ladder's note that a standing no-subagents instruction is not grounds to skip) — CLAUDE.md
      compliance, shallow bug scan, git-history context, prior-PR comments, comment/Javadoc
      compliance — **plus** a dedicated `riviera-review-overlay` bank walk, not the overlay alone.
      6 findings, all fixed (see the findings register); the fix round re-entered at Implement.
