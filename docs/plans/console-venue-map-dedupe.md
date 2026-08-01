# Operator console — share one venue-map read across the shell and its tabs

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening the operator console on the Requests or Pricing tab issues **one**
`GET /api/venues/{id}?date=…`, not two, without turning any needed refresh into a cache hit.

**Architecture:** A single-slot, **time-bounded** console-scoped snapshot cache
(`operator/console-venue-map.ts`) that coalesces the shell's and the tabs' identical
`(venueId, today)` read into one shared in-flight request. The 30s window is what keeps it a
*coalescing* cache rather than a session-lifetime one (review F-3). The one significant decision is that the cache is **opt-in per call site**,
not a transparent layer inside `VenueService`: three of the six `getVenueMap` callers want a
shared snapshot, and the other three (`DailyViewTab`, `LayoutEditor`, the tourist `VenueMap`)
want server truth — a transparent cache would silently break them, and their freshness is the
harder-to-restore property.

**Persistence:** N/A — frontend-only, no backend, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #486 (follow-up split out of the #179 staleness review;
parent epic #141, closed).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced the
`setVersion` recovery hazard the issue does not mention, R-1/AC-6) · `riviera-plan-doc` (this
template — forced the Behavior-parity ledger, which is what turned "3 call sites" into the
6-call-site preserved/changed table) · `tdd` (each phase red-first; the request-count assertions
are written before the cache exists) · `riviera-review-overlay` (review gate — ran on PR #487 alongside `/code-review`'s 6-agent fan-out; contributed RV-STYLE-1, which caught F-1, and passed RV-PROC-1 / RV-FE-E2E)
· `riviera-docs-freshness` (`N/A — no substrate doc states the console's fetch count; the module
table, CONTEXT.md and the ADRs are all backend-facing and this slice is frontend-only`) ·
`riviera-frontend` (placement: `operator/` root `@Service()`, **not** `core/` — the
`PendingRequestsStore` precedent, "both consumers are the same feature, so this is intra-feature
shared state, not a cross-cutting singleton"; also ruled out `core/`, which may not import a
feature's `VenueService`) · `angular-developer` + angular-cli MCP (`get_best_practices` → `@Service()`
over `@Injectable({providedIn:'root'})` for new singletons, `inject()`, signals; `search_documentation`
→ confirmed route-scoped `Route.providers` exists as an alternative and was rejected, see Resolved Q-1) ·
`playwright-cli` (the mocked-suite route counter for AC-1/AC-2, verified non-vacuous by
restoring the pre-fix tab and watching it report `Received: 2`)

**Branch:** `claude/angular-mcp-search-doc-nfkm6j` — **cloud session:** the designated remote
branch substitutes for `feature/console-venue-map-dedupe` (`riviera-sdlc` §Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in operator whose console shell has loaded the venue map, when the
  Requests tab renders under that shell, then exactly **one** `GET /api/venues/{id}?date=<today>`
  has been issued in total. *Pinned by:* `ConsoleVenueMap.'coalesces two concurrent loads of the same key into one request'`
  + `RequestsTab.'reuses the shell snapshot instead of re-fetching the venue map (#486)'`
  + `operator-requests.e2e.ts 'opens the Requests tab on ONE venue-map read, not two (#486)'` (route counter).
- [ ] **AC-2:** Same for the Pricing tab: the rows and the `setVersion` token come from the shared
  snapshot and no second request is issued. *Pinned by:* `PricingTab.'reuses the shell snapshot instead of re-fetching the venue map (#486)'`
  + `operator-pricing.e2e.ts 'opens the Pricing tab on ONE venue-map read, not two (#486)'` (route counter).
- [ ] **AC-3:** Given a warm snapshot for `(venue, today)`, when `DailyViewTab` changes the selected
  date **or** reconciles after a tap-to-mark, and when `LayoutEditor` loads or reloads, then each
  still issues its own request to the server. *Pinned by:*
  `DailyViewTab.'never serves the console snapshot — its reads are excluded from the shared cache (#486 AC-3)'`
  (covers the opening read **and** the post-tap-to-mark reconcile, both on the warm key) and the existing
  `DailyViewTab.'reloads and clears optimistic overrides when the date changes'` +
  `LayoutEditor.'keeps edits and offers Reload on a 409 STALE_WRITE, then Reload re-seeds from the server'`,
  which both `expectOne` a real request and so fail if either path ever became a cache consumer.
- [ ] **AC-4:** Given a warm snapshot, when a layout save (`replaceLayout`) or a row reprice
  (`repriceRow`) succeeds, then the snapshot is dropped and the next tab to ask receives the **new**
  sets from the server. *Pinned by:* `ConsoleVenueMap.'refetches after reset — the invalidation edge a layout or pricing save uses'`
  + `LayoutEditor.'drops the shared console snapshot after a successful save (#486 AC-4)'`
  + `PricingTab.'drops the shared snapshot after a successful reprice so other tabs see the new price (#486 AC-4)'`.
- [ ] **AC-5:** Given the venue-map read fails, when any of the three consumers asks, then each
  degrades to its existing fallback (`Your venue` title, `Set {id}` / `Standard` labels, the pricing
  load-error card), the failure is **not** cached, and the next ask re-issues the request.
  *Pinned by:* `ConsoleVenueMap.'does not retain a failure — the next caller retries against the server'`
  + `RequestsTab.'still degrades to the Set-{id} fallback when the shared map read fails (#486 AC-5)'`
  + the existing `PricingTab.'shows a load-error message (not a false empty state) when the venue read fails'`.
- [ ] **AC-6:** *(grill addition — not in the issue)* Given a reprice lost the `409 STALE_WRITE` race,
  when the operator hits Reload, then the recovery read reaches the **server** and re-seeds a fresh
  `setVersion`, never the stale cached snapshot that caused the conflict.
  *Pinned by:* `PricingTab.'bypasses the shared snapshot on stale-write recovery (#486 AC-6)'`.

- [ ] **AC-7:** *(review F-2)* Given a read is in flight when a write resets the slot, and a second
  read for the **same** `(venue, date)` supersedes it and succeeds, when the first read finally fails,
  then the newer snapshot survives — the orphan cannot invalidate its own replacement.
  *Pinned by:* `ConsoleVenueMap.'does not let a superseded fetch drop the snapshot that replaced it (review F-2)'`.
- [ ] **AC-8:** *(review F-3)* Given a snapshot older than `SNAPSHOT_TTL_MS`, when a tab is revisited,
  then the read reaches the server — a revisit stays as fresh as it was before this cache existed,
  while two loads inside the window still coalesce.
  *Pinned by:* `ConsoleVenueMap.'refetches once the snapshot ages out — a tab revisit stays a fresh read (review F-3)'`
  + `ConsoleVenueMap.'still coalesces two loads inside the snapshot window'`.

## Non-goals

- No API change. `getVenueMap` is the right read; only the number of calls changes (issue: "no API
  change is needed or wanted").
- No new endpoint, no `If-None-Match`/HTTP-cache work, no service-worker caching.
- Not making the cache transparent inside `VenueService` — see Architecture.
- Not fixing #207 (walk-ins over-count in the same stats strip) — a correctness bug, independent.
- Not caching the tourist `venue/venue-map.ts` read; it is a different feature with its own lifecycle.

## Behavior-parity ledger

> The slice changes *where* three call sites get their data, so every existing behavior of the six
> `getVenueMap` callers is enumerated and verdicted. This is what keeps "just dedupe it" from
> silently dropping a refresh.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `OperatorConsole` reads `(venue, today)` for header name + stats strip, best-effort | preserved | now via `ConsoleVenueMap.load()`; same signal writes, same silent-error swallow |
| `OperatorConsole` clears `venue`/`venueName` on sign-out | preserved + **extended** | also calls `ConsoleVenueMap.reset()`, so the next operator on this device cannot inherit a snapshot |
| **Every activation of `RequestsTab`/`PricingTab` re-read the map** (they are lazily-routed children, destroyed and recreated on each navigation, with no other refresh mechanism) | **changed — ledger row added at the review gate (F-3)** | The first draft made a revisit a cache hit for the whole session, hiding another device's edits until a write or sign-out. `SNAPSHOT_TTL_MS` (30s) bounds the snapshot so the console-open burst still coalesces but any real revisit is a fresh read again. This row is the one the first ledger pass missed — exactly the O6 #176 failure mode the ledger exists to catch |
| `RequestsTab` reads `(venue, today)` for set labels/tiers, best-effort, once | changed | same data, served from the shared snapshot; its own comment already says the read is date-independent and load-once |
| `RequestsTab` degrades to `Set {id}` / `Standard` on failure | preserved | the failure still propagates to the subscriber; failures are not cached |
| `PricingTab` reads `(venue, today)` for rows + `setVersion`, owns its load-error card | changed | served from the shared snapshot; error card path unchanged |
| `PricingTab.reloadAfterStale()` re-reads after `409 STALE_WRITE` | **preserved deliberately (must not cache)** | resets the snapshot first, then loads → always hits the server (AC-6). Serving this from cache would make a 409 unrecoverable |
| `PricingTab` reprice success advances the row price locally | preserved + **extended** | also resets the snapshot so other tabs see the new price (AC-4) |
| `DailyViewTab` re-reads per selected date | preserved | keeps calling `VenueService` directly — never registered as a cache consumer |
| `DailyViewTab` re-reads to reconcile after a tap-to-mark | preserved | same; a cached reconcile would show a set the operator just marked as still free |
| `LayoutEditor.loadExisting()` reads to seed the grid + capture `setVersion` | preserved | keeps calling `VenueService` directly |
| `LayoutEditor.reloadAfterStale()` re-reads after a conflict | preserved | direct call, plus a `reset()` so the tabs don't serve the pre-conflict snapshot |
| `LayoutEditor` save success bumps its local token | preserved + **extended** | also resets the snapshot (AC-4) |
| Tourist `venue/venue-map.ts` reads per selected date | preserved | untouched, different feature |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The `setVersion` staleness widening (#226).** `PricingTab` uses `venue.setVersion` as its optimistic-concurrency token. Served from a console-mount snapshot instead of a tab-open fetch, the token can be older, so a reprice is likelier to lose a `409 STALE_WRITE` race | med | med | The existing recovery path is kept and made cache-bypassing (AC-6): `reset()` then load, so Reload always reaches the server. A write by *this* console (layout or reprice) resets the snapshot, so the widened window only covers edits from another device — which is exactly what #226's token exists to catch | this slice | **closed** — bounded by `SNAPSHOT_TTL_MS` (F-3 fix); the window is now ~the console-open moment, not the session |
| R-2 | A transparent cache silently staling `DailyViewTab`'s post-mark reconcile (operator marks a walk-in, grid still shows it free) | low | high | Opt-in by call site: `DailyViewTab` and `LayoutEditor` never touch the cache. Pinned by AC-3, which asserts they still fetch | this slice | **closed** — AC-3 pins both exclusions; reviewers #2 and the overlay independently re-verified the two paths still call `VenueService` directly |
| R-3 | Snapshot outliving its operator — the next sign-in on a shared device sees the previous venue's map | low | med | `reset()` on sign-out (shell), plus the single-slot design: a different `(venueId, date)` key evicts the previous entry outright | this slice | **closed** — single-slot key eviction + `reset()` on sign-out, pinned by `operator-console.spec.ts` |
| R-4 | Coalescing races the shell against a lazy tab route — whichever subscribes first must create the entry and the other must join the *same* in-flight request, not start a second | med | med | `shareReplay({bufferSize:1, refCount:false})` over one stored observable: creation is on first `load()`, subscription joins. Order-independent; AC-1's spec asserts one request with the tab loading *before* and *after* the shell | this slice | **closed** — `shareReplay({refCount:false})` verified against the RxJS source by review agent #2; order-independence pinned by the coalescing spec |
| R-5 | Date rollover at midnight during a long console session serves yesterday's snapshot | low | low | The key includes the booking date, so the first post-midnight `load()` misses and refetches | this slice | **closed** — the key carries the booking date, pinned by the key-change eviction spec |

## Open questions / Assumptions

- **Assumption:** the operator console is the only consumer that wants a shared `(venue, today)`
  snapshot; no other surface should be registered later without re-checking its freshness needs.
  *Owner:* this slice · *Resolves by:* phase 1 (enforced by the opt-in design, documented in the TSDoc).

### Resolved

- **Q-1: route-scoped provider (`Route.providers` on `operator/:venueId`) vs. a root singleton with
  `reset()`?** → **Root singleton in `operator/`.** The angular-cli MCP confirms route providers
  would scope the lifetime automatically, but the router **reuses** the route injector when only
  `:venueId` changes, so a venue switch would still need key-based eviction — the automatic-cleanup
  benefit does not actually cover the case that motivates it. `PendingRequestsStore` (same folder,
  same shell+tab consumer pair) already established the root-`@Service()`-plus-explicit-`reset()`
  shape, so this follows the precedent rather than introducing a second lifetime model in one folder.
- **Q-2: `Map` keyed cache vs. single slot?** → **Single slot.** All three consumers ask for the same
  `(venueId, today)` key inside one console session; a single slot bounds memory, evicts on venue
  switch and on date rollover for free (R-3, R-5), and has no eviction policy to get wrong.
- **Q-3: should the shell keep its `requests.reset()`-style reset on console mount?** → **No.**
  A mount-time cache reset would drop an entry a lazily-routed tab had already created moments
  earlier, re-issuing the second request this slice exists to remove. Reset is bound to sign-out and
  to successful writes only.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path to `availability(set_id, booking_date)` is
touched: this slice changes only how many times a **read** (`GET /api/venues/{id}`) is issued from
the operator console. The one adjacent concern is that the cached snapshot carries per-date
availability counts, which the shell's stats strip renders — but that tile is already a mount-time
snapshot today, so its freshness is unchanged. The two surfaces whose freshness *does* gate a
correctness decision — `DailyViewTab`'s post-tap-to-mark reconcile and `LayoutEditor`'s
reject-unless-unclaimed reload — are excluded from the cache by design (R-2, AC-3).

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file changes; no module, port, or event is touched.

### Module ownership (§4a)

`N/A — frontend-only`, no backend capability added or moved. The Angular-side equivalent is recorded
under *Skills consulted* / Resolved Q-1: the new service lands in the `operator/` feature folder, not
`core/`, per `riviera-frontend`'s taxonomy.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; `PricingTab` edits a venue's list prices, which is a
`venue`-module write that already exists and is unchanged by this slice.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/console-venue-map.ts` | **new** | `@Service()` singleton | one stored `Observable` + `shareReplay`; no signal state (consumers own theirs) | — |
| FE-2 | `operator/operator-console.ts` | existing | standalone component | unchanged signals; swaps its read source, adds `reset()` on sign-out | — |
| FE-3 | `operator/requests-tab.ts` | existing | standalone component | unchanged; swaps its read source | — |
| FE-4 | `operator/pricing-tab.ts` | existing | standalone component | unchanged; swaps its read source, resets on reprice success + before stale recovery | unchanged |
| FE-5 | `operator/layout-editor.ts` | existing | standalone component | reads unchanged (direct); adds `reset()` after save success + before stale recovery | unchanged |

**Standards:** `@Service()` (not `@Injectable({providedIn:'root'})`) per the angular-cli MCP best
practices for new v22 singletons; `inject()`; no `any` on the contract — the cache is typed
`Observable<VenueMapView>` end to end. No template or a11y surface changes, so the existing
`*.a11y.spec.ts` / `*.contrast.spec.ts` files are untouched.

## FE↔BE contract

`N/A — no contract change.` Same endpoint, same query parameter, same DTO; strictly fewer calls.

## Execution status

**Stage pointer:** `review gate — findings fixed, re-verification pushed`

**Next action:** Confirm CI + Sonar green on the fix commit, then merge PR #487 and run the
close-out (epic tick N/A — #141 is closed and fully ticked; file the F-5 follow-up issue).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `ConsoleVenueMap` service + spec | ✅ 5/5 green | `4dde56e` |
| 1 — Wire the three consumers + the two invalidation edges | ✅ 1030/1030 unit green, lint clean | (this commit) |
| 2 — e2e route counters (mocked suite) | ✅ 24/24 operator e2e green | `76d2615` |
| 3 — Review-gate fixes (F-1..F-4) | ✅ lint clean, 1033 unit + 15 e2e green | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (`/code-review` agent #1 + overlay agent, RV-STYLE-1) | 12 new multi-line inline `//` comments; `frontend/.claude/CLAUDE.md` says "Inline comments are one line, or they are not written" (TSDoc exempt) | fixed — all collapsed to one line; a final sweep over `git diff origin/main` reports 0 multi-line added `//` runs |
| F-2 | review gate (agent #4, prior-PR comment context) | `console-venue-map.ts` guarded failure-invalidation with **string key equality**, so an orphaned in-flight read that fails after a `reset()` + re-`load()` of the same `(venue, date)` reset the newer, successful snapshot — the "late response overwrites fresher state" class #482/#484 already swept for | fixed — guard is now a monotonic `generation` (identity, not value). Regression test verified red against the pre-fix code (`expected undefined to be 'Fresh'`) |
| F-3 | review gate (agent #3, git-history context) | The snapshot lived for the whole session, so **revisiting** Pricing/Requests became a cache hit — but a tab activation was previously their only refresh, so another device's edit stayed invisible until a write or sign-out. A ledger row was missing for it | fixed — `SNAPSHOT_TTL_MS` (30s) bounds the snapshot; ledger row added; R-1 closed. The reviewer's suggested fix (reset on tab construction) was **not** taken: it would re-issue the duplicate request AC-1 forbids |
| F-4 | review gate (agent #5, code-comment guidance) | Advisory: the class TSDoc said `LayoutEditor` "reloads precisely because it mutated the map", but its direct reads are the *initial* seed and the *conflict* recovery | fixed — reworded to "seeds its grid from the server and re-reads to escape a write conflict" |
| F-5 | review gate (overlay agent) | Advisory, **not fixed here**: `riviera-frontend`'s taxonomy forbids feature→feature imports, but every file in `operator/` already imports `venue/`. This slice consolidates that edge rather than creating it | deferred → follow-up issue (skill and codebase are out of sync; a per-file change here would be wrong) |

---

## File structure

- `frontend/src/app/operator/console-venue-map.ts` — **new.** The single-slot shared snapshot of
  `(venueId, date)` → `VenueMapView`, with `load()` and `reset()`.
- `frontend/src/app/operator/console-venue-map.spec.ts` — **new.** Coalescing, failure-not-cached,
  reset, key-change eviction.
- `frontend/src/app/operator/operator-console.ts` — read via the cache; `reset()` on sign-out.
- `frontend/src/app/operator/requests-tab.ts` — read via the cache.
- `frontend/src/app/operator/pricing-tab.ts` — read via the cache; `reset()` after a successful
  reprice and before the stale-write recovery read.
- `frontend/src/app/operator/layout-editor.ts` — reads stay direct; `reset()` after a successful save
  and before the stale-write recovery read.
- `frontend/src/app/operator/{operator-console,requests-tab,pricing-tab,layout-editor,daily-view-tab}.spec.ts`
  — request-count assertions per the ACs.
- `frontend/e2e/{operator-requests,operator-pricing}.e2e.ts` — `page.route` counters for AC-1/AC-2.

---

## Phase 0 — `ConsoleVenueMap`: one snapshot, shared

**Files:** Create `operator/console-venue-map.ts` · Test `operator/console-venue-map.spec.ts`

- [ ] **Step 1: Write the failing spec** — two `load()` calls for the same key flush exactly one
  request and both subscribers receive the value; a failed load is not retained; `reset()` forces a
  refetch; a different `(venueId, date)` key evicts the previous slot.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- console-venue-map` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — the single-slot `shareReplay` cache.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- console-venue-map` → PASS.
- [ ] **Step 5: Generalization-audit pass** — search every `getVenueMap` caller and record which are
  registered as consumers and why the rest are not (the Behavior-parity ledger is the output).
- [ ] **Step 6: Commit** — `git commit -m "Share one operator-console venue-map read (#486)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Wire the consumers and the invalidation edges

**Files:** Modify `operator-console.ts`, `requests-tab.ts`, `pricing-tab.ts`, `layout-editor.ts` + their specs

- [ ] **Step 1: Write the failing specs** — AC-1..AC-6 assertions in the four component specs
  (`expectNone` on the venue URL for a warm cache; `expectOne` for the excluded paths).
- [ ] **Step 2: Run them, verify they fail** — `npm test -- operator` → FAIL.
- [ ] **Step 3: Implementation** — swap the three read sources; add `reset()` at the two write-success
  sites and the two stale-recovery sites and sign-out.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- operator` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** · **Step 7: Update execution status.**

## Phase 2 — e2e route counters

**Files:** Modify `frontend/e2e/operator-requests.e2e.ts`, `frontend/e2e/operator-pricing.e2e.ts`

- [ ] **Step 1: Add a `page.route` counter** on `**/api/venues/1?*` and assert it is `1` after the tab
  renders (currently `2` → red).
- [ ] **Step 2: Run** — `npm run test:e2e:a11y -- operator-requests operator-pricing` → PASS after phase 1.
- [ ] **Step 3: Commit** · **Step 4: Update execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | Phase 0 (new sharing pattern) | every `getVenueMap` call site, to decide consumer vs. excluded | `grep -rn "getVenueMap" --include=*.ts frontend/src/app \| grep -v spec` | 6 (shell, requests, pricing, daily-view, layout-editor ×2, tourist venue-map) | Registered 3 as consumers; excluded 3 for freshness and recorded every one in the Behavior-parity ledger with its reason — the audit is what produced that table |
| 2026-08-01 | Phase 1 (new invalidation edge) | every site that **writes** the beach map, since each one stales the snapshot | `grep -rn "replaceLayout\|repriceRow" --include=*.ts frontend/src/app` | 2 writes (`LayoutEditor.onSave`, `PricingTab.commit`) + 2 stale-write recovery reads | All four reset the snapshot. The two recovery reads were the non-obvious half: they *read*, but they read precisely because the token they hold lost a race, so a cache hit there is unrecoverable (AC-6) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1** · [ ] **AC-2** · [ ] **AC-3** · [ ] **AC-4** · [ ] **AC-5** · [ ] **AC-6**
  — each verified by the named spec at the commit recorded in the phase table.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled with a justified N/A; the two freshness-critical read paths are
      excluded from the cache and pinned (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section justified N/A (frontend-only); no backend file in the diff (invariant #11).
- [ ] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: the cache key uses `todayBookingDate(new Date())`, the same `Europe/Tirane` booking
      date the callers already compute — no new date arithmetic (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No Flyway migration needed (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `references/pr-gates.md` §1
      plus `riviera-review-overlay`.
