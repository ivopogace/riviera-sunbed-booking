# Clear all open SonarCloud code smells on `main` (single PR) — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Drive the SonarCloud **Overall-Code open-issue list to 0** (14 code smells today; 0 bugs/vulns, 0 duplication) with real, in-code fixes that honour the project invariants — verified via `api/issues/search`, not the gate conclusion (the #159 rule).

**Architecture:** Pure quality cleanup, no behaviour change. S7059: move the operator-session restore kickoff out of the `OperatorAuth` **constructor body** into a **private field initializer** (`private readonly restoreOnStartup = this.restore();`) — a valid Angular injection context, listed distinctly from the constructor (angular.dev/guide/di/dependency-injection-context), so the async op leaves the constructor that `no-async-constructor` flags **while behaviour is byte-for-byte preserved**: restore still fires only when `OperatorAuth` is first injected (lazily — anonymous tourist pages issue no `/me` call). *(An earlier draft used `provideAppInitializer`; the review gate flagged that it fires `/me` on every anonymous page — a real behaviour change — so it was reverted to the field initializer, which is what issue #157 lists first.)* The 9 `css:S7924` are static false-positives on translucent Liquid Glass — fixed the T3 `_glass.scss` `failure-icon` way (swap translucent fill → solid composited fill so the analyser computes the real colour). The 3 `java:S1075` are API route patterns, not filesystem URIs — resolved by a justified `sonar-project.properties` suppression.

**Persistence:** JDBC only (invariant #1). N/A — no DB, no migration, no SQL in this slice.

**Source of intent:** GitHub issue **#157** (per-item fix guidance + line numbers); parent epic **#152**.

**Skills consulted (Skill-routing gate — fullstack):**
- `riviera-plan-doc` — plan discipline (this doc).
- `riviera-frontend` — confirmed all edits are **in-place** (no folder moves); `app.config.ts` is the composition root; `provideAppInitializer` + DI-token patterns; Liquid Glass token/contrast-spec rules (composited-math proof, solid-fill for static analysis).
- `angular-developer` + angular-cli MCP (`get_best_practices` + `search_documentation`, v22) — confirmed a **field initializer is a valid injection context, distinct from the constructor** (angular.dev DI context) → the S7059 fix; `String.fromCodePoint` for S7758. Also checked the skill's Tailwind reference: N/A — the booking surfaces use component SCSS + `--riv-*` tokens (0 Tailwind utility classes), and the project's Tailwind is already v4-correct (`.postcssrc.json`, no `tailwind.config.js`).
- `riviera-modulith` / `riviera-java-conventions` — consulted for the backend item: it is **config-only** (`sonar-project.properties`); **no Java authored**, so `ModularityTests` / `JdbcOnlyArchitectureTests` / no-JPA / no-Lombok are untouched. `SecurityConfig`/`RateLimitFilter` are root-package app-level classes, not Modulith modules.
- `riviera-local-debug` — scoped-test discipline (run the touched spec classes, not the bare suites) before the first `npm`.
- `playwright-cli` / `riviera-review-overlay` — at the review/e2e gate (no user-facing **behaviour** changes, so e2e authoring isn't triggered; the a11y e2e is a regression check only).

**Branch:** `chore/sonar-code-smells-157` (created off `main`).

---

## Acceptance criteria (testable)

Each AC = one specific SonarCloud issue (or group) cleared + its guarding spec/arch test green. The Overall list reaching 0 is verified at the Sonar gate via `api/issues/search`.

- [ ] **AC-1 (S7758):** Given `rowCode`, when `venue-map.ts:52` uses `String.fromCodePoint(65 + n%26)` instead of `fromCharCode`, then output is identical for A–Z and the rule clears. *Pinned by:* `venue-map.spec.ts` › `rowCode` (`A/Z/AA/AB`).
- [ ] **AC-2 (S7059):** Given `OperatorAuth`, when the restore kickoff moves from the constructor **body** to a **field initializer**, then the async op leaves the constructor (rule clears) and behaviour is preserved exactly — restore still fires on first injection (lazy scope: no `/me` on anonymous pages), `restoring` stays honest. *Pinned by:* the **unchanged** `operator-auth.spec.ts` + the 4 `venue-editor`/`staff-daily` specs (all still green with no edits — the field initializer fires `/me` on construction exactly as the old constructor did, so the behaviour they assert is identical).
- [ ] **AC-3 (S1075 ×3):** Given `SecurityConfig.java` / `RateLimitFilter.java` HTTP route-pattern constants, when a justified `sonar.issue.ignore.multicriteria` suppression scoped to those files is added (mirroring the existing `S4032` `e1`), then the 3 `java:S1075` no longer appear in the reported list and the existing `S4032` suppression is preserved. *Pinned by:* Sonar gate (`api/issues/search` shows 0 `S1075`); no code/behaviour change.
- [ ] **AC-4 (S7924 ×9):** Given the four Liquid Glass booking surfaces, when each flagged translucent fill is swapped for its **solid composited equivalent** (ink at ≥4.5:1 outright), then all 9 `css:S7924` clear and every `*.contrast.spec.ts` stays green in **both** themes. *Pinned by:* the four `booking-*.contrast.spec.ts` (green) + Sonar gate (0 `S7924`).
- [ ] **AC-5 (list→0):** Given the PR, when `api/issues/search?...&pullRequest=<PR#>&resolved=false` is pulled, then it returns **0** open issues, the new-code gate is green, and new-code coverage ≥ 80%.

## Non-goals

- Externalising the route patterns to configuration (they are API contract, not filesystem URIs — invariant of the fix, not a change).
- Changing the new-code gate thresholds.
- The optional DRY tidy of the duplicated `LOGIN_PATH` constant (won't clear S1075; adds cross-file coupling for no gate benefit).
- Any change to booking/availability/money/auth **behaviour**. The S7059 refactor is behaviour-preserving.
- Scattered `//NOSONAR` (banned by the issue).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The S7059 refactor changes **when/whether** `restore()` runs, or leaves `restoring` dishonest (surfaces hang or flash signed-out) | med | high | **Final fix (field initializer)** preserves the exact construction-time, lazy trigger → behaviour byte-for-byte identical; the unchanged `operator-auth.spec.ts` + the 4 operator component specs stay green with no edits, which is the regression proof | agent | **resolved** (field-init commit) |
| R-2 | The S7059 refactor changes the **scope** of when `/me` fires (e.g. an app initializer would fire it on every anonymous page, not just operator routes) | med | high | **Materialised** in the earlier `provideAppInitializer` draft — the review gate (finding 1, CONFIRMED ×4) caught that it added a `GET /api/auth/me` to every tourist page (`app.ts` never injects `OperatorAuth`). **Reverted** to the field initializer (issue #157's first option), which keeps the original lazy scope → no `/me` on anonymous pages | agent | **resolved** (field-init commit) |
| R-3 | A chosen solid badge/error fill fails the S7924 analyser threshold or drifts a `contrast.spec.ts` | med | med | Every solid value's ink contrast is pre-computed ≥4.5:1 (table below); contrast specs assert the exact new pairs; follows the already-shipped `_glass.scss failure-icon` / `booking-pay .fail-badge` precedent that cleared S7924 in T3 | agent | open |
| R-4 | S1075 suppression too broad (hides a real future hardcoded-URI smell) or too narrow (misses a file) | low | med | Scope by rule **and** resource: one entry per file (`**/RateLimitFilter.java`, `**/SecurityConfig.java`), with a rationale comment; keep `S4032` `e1` intact | agent | open |
| R-5 | Green Sonar gate but non-empty issue list (the #159 trap) | low | high | Definition of done pulls `api/issues/search` for the PR and drives it to literally 0, not the gate conclusion | agent | open |

## Open questions / Assumptions

- **Assumption:** The `css:S7924` analyser ignores rgba alpha (computes ink vs the fill's opaque base rgb) — so a solid opaque fill makes it compute the intended colour. *Basis:* issue #157 + the shipped `_glass.scss failure-icon` fix that already cleared identical flags in T3. *Resolves by:* PR Sonar gate (0 `S7924`).
- **Assumption:** `sonar.issue.ignore.multicriteria` resourceKey uses wildcard globs (no brace alternation), so two files need two entries (`e2`, `e3`). *Resolves by:* PR Sonar gate (0 `S1075`).
- **Assumption:** No other spec/e2e boots the app via `appConfig.providers` in a way that an unmocked bootstrap `/me` would break. *Resolves by:* grep during Phase 1 (R-2).

### Resolved
- **Assumption (no app-boot spec breaks):** partially wrong for the *app-initializer draft* — 4 operator component specs relied on construction firing `/me`. Moot after the pivot to the field initializer (construction fires `/me` again, so those specs are unchanged). *Resolved: field-init commit.*
- **Sonar gate red on `new_coverage` (50%) — first PR-160 analysis (app-initializer draft):** the issue list reached **0** (all 14 cleared) but the gate failed its single `new_coverage ≥ 80%` condition — the `app.config.ts` initializer line was the 1 uncovered new line. This was **superseded** by the review-driven pivot: the field-initializer fix has **no `app.config` change at all**, and its one new line (`restoreOnStartup = this.restore()`) is covered by every `OperatorAuth` construction in the existing specs → new-code coverage back to ~100% with no extra spec. Confirms the #159 lesson in reverse: read the gate *conditions*, not just pass/fail.

## Review-gate findings (PR #160, `code-review` high-effort + `riviera-review-overlay`)

Three CONFIRMED findings; all re-entered at Implement (skill-routing re-run: FE → `angular-developer` + angular-cli MCP incl. `search_documentation`).

1. **`app.config.ts` — behaviour change (dominant, ×4 confirmations).** The `provideAppInitializer` draft fired `GET /api/auth/me` at every boot on **every** route, incl. anonymous tourist pages that (verified: `app.ts` never injects `OperatorAuth`) previously made no auth call. **Fix:** reverted the app-initializer machinery; used issue #157's first option — a **field initializer** in `OperatorAuth` (Angular-documented valid injection context), preserving the exact lazy scope. Coincidentally removes the coverage gap.
2. **`booking-dialog.scss` — chips flattened.** The close (white-0.16) and step-num (white-0.24) chips were both set to one darker `#2c7789`, losing the two distinct frosted looks. **Fix:** distinct composites — close → its true `#31798a` (white 4.96:1); step-num kept `#2c7789` (its true 0.24 composite `#458595` is too light for AA white text, 4.16:1, so darkened), each commented.
3. **`sonar-project.properties` — S1075 file-wide scope + inaccurate comment.** The comment named only `LOGIN_PATH`/`LOGOUT_PATH` (SecurityConfig has ~13 route constants). **Fix:** corrected the comment and justified the file scope — these two classes hold *only* HTTP route-pattern constants by nature, so S1075 is a false positive throughout them and the file scope is correct, not overly broad (kept the issue-#157-prescribed properties approach over a per-constant `@SuppressWarnings`, which would silence the same false positives while needing re-adding as routes grow).

Refuted (1): "construction is no longer self-triggering" — moot after the field-initializer pivot (construction self-triggers again).

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No write path to `availability(set_id, booking_date)`; no booking-lifecycle, pool, or cutoff logic touched. The `venue-map.ts` change is a pure display-string helper (`rowCode`); the `OperatorAuth` change is session-restore plumbing.

## Spring Modulith — modules, interfaces, events

**N/A — no module logic changes.** The only backend edit is `sonar-project.properties` (a build-config suppression). No Java is created, moved, or modified; no `api/`/`spi/` surface, no event, no adapter. `SecurityConfig`/`RateLimitFilter` are root-package app-level web classes (documented as such in their Javadoc), not Modulith modules, and are not edited. `ModularityTests` / `JdbcOnlyArchitectureTests` are unaffected (invariants #1, #11 hold trivially).

### Module-ownership table
All-in-config; no capability added or moved between modules — no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No Stripe, charge, refund, commission, or ledger code touched.

## Angular — frontend surfaces touched

> All edits are **in-place** (`riviera-frontend`: no folder moves). No new component/service/route.

| # | Surface | Existing/new | Change |
|---|---|---|---|
| FE-1 | `venue/venue-map.ts:52` | existing | `fromCharCode` → `fromCodePoint` (S7758) |
| FE-2 | `core/operator-auth.ts` | existing | remove constructor async kickoff; add `init()` (S7059) |
| FE-3 | `app.config.ts` | existing | `provideAppInitializer(() => inject(OperatorAuth).init())` (S7059 composition-root kickoff) |
| FE-4 | `booking/booking-confirmation.scss`, `booking/request-confirmation.scss`, `booking/booking-dialog.scss`, `booking/booking-pay.scss` | existing | translucent fill → solid composited fill on 9 flagged pairs (S7924) |
| FE-5 | `booking/booking-dialog.contrast.spec.ts`, `booking/booking-pay.contrast.spec.ts` | existing | assert `.form-error` red on the new solid pink fill; note the badge fills went solid |
| FE-6 | `core/operator-auth.spec.ts` | existing | new "no-HTTP-on-construction" test; `serviceWithRestore` calls `init()` |

**Standards:** `@Service`, `inject()`, signals, `provideAppInitializer` (Angular v22, per angular-cli MCP). No `as any`, no behaviour change on the contract.

### Solid-fill colour table (S7924 — every value pre-verified ≥ 4.5:1)

| Selector(s) | Was (translucent) | Solid fill | Ink | Analyser contrast |
|---|---|---|---|---|
| `.badge` / `.done-badge` (✓/✉, teal) | bg `rgba(43,184,212,.18)`, ink `#0a6e85` | `#d9f2f7` | `#0a5f74` | 6.2:1 |
| `.badge.warn` / `.done-badge.warn` (⏳, amber) | bg `rgba(240,170,46,.18)`, ink `#a86a12` | `#fcf0d9` | `#8a5410` | 5.5:1 |
| `.dialog-close` (✕, white on teal) | bg `rgba(255,255,255,.16)`, ink `#fff` | `#31798a` | `#ffffff` | 4.96:1 |
| inactive `.step-num` (white on teal) | bg `rgba(255,255,255,.24)`, ink `#fff` | `#2c7789` | `#ffffff` | 5.1:1 |
| `.form-error` (both files) | bg `rgba(163,22,14,.1)`, ink `#a3160e` | `#f6e8e7` | `#a3160e` | 6.6:1 |

Group A (badges/chips) are `aria-hidden` decorative glyphs — the heading/label carries the meaning (WCAG 1.4.11-exempt) and the `*.contrast.spec.ts` never asserted them, so they stay green trivially. Group B (`.form-error`) is real error text — its spec assertion moves from "red on the panel/card glass" to "red on the solid `#f6e8e7` fill".

## FE↔BE contract

**N/A — no contract change.** No endpoint, DTO, or wire shape changes. `OperatorAuth` still calls the same `GET /api/auth/me` at the same time (first injection); only the *syntactic* location of the kickoff moves (constructor body → field initializer).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc | ✅ | b070d28 |
| 1 — S7059 operator-auth app-initializer refactor (test-first) | ✅ | (this commit) |
| 2 — S7758 venue-map `fromCodePoint` | ✅ | (this commit) |
| 3 — S7924 solid composited fills + contrast-spec updates | ✅ | (this commit) |
| 4 — S1075 justified suppression | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `docs/plans/sonar-code-smells-157.md` — this plan.
- `frontend/src/app/core/operator-auth.ts` — remove ctor kickoff, add `init()`.
- `frontend/src/app/core/operator-auth.spec.ts` — new no-HTTP-on-construction test; `init()` in helper.
- `frontend/src/app/app.config.ts` — `provideAppInitializer(OperatorAuth.init)`.
- `frontend/src/app/venue/venue-map.ts` — `fromCodePoint`.
- `frontend/src/app/booking/{booking-confirmation,request-confirmation,booking-dialog,booking-pay}.scss` — solid fills.
- `frontend/src/app/booking/{booking-dialog,booking-pay}.contrast.spec.ts` — form-error solid-fill assertion + notes.
- `sonar-project.properties` — `S1075` suppression (`e2`,`e3`).

---

## Phase 1 — S7059: move the restore kickoff to the composition root (test-first)

**Files:** Modify `core/operator-auth.ts`, `core/operator-auth.spec.ts`, `app.config.ts`

1. **Write the failing test** in `operator-auth.spec.ts`: constructing the service issues **no** HTTP and leaves `restoring()===true` until `init()` runs.
2. **Run it → FAIL** (`npx vitest run operator-auth` → current constructor fires `/me`, `httpMock.verify()` throws).
3. **Refactor:** delete `constructor(){ void this.restore(); }`; add public `init(): void { void this.restore(); }`. Update `serviceWithRestore` to call `auth.init()` after inject. Wire `provideAppInitializer(() => { inject(OperatorAuth).init(); })` in `app.config.ts` (after the `ThemeService` initializer).
4. **Run it → PASS** (`npx vitest run operator-auth`).
5. **Generalization audit:** any other `@Service` firing async in a constructor? (grep `constructor()` in `core/`.)
6. **Commit** `refactor(fe): kick operator-session restore from an app initializer, not the constructor (#157)`.

## Phase 2 — S7758: `fromCodePoint`

**Files:** Modify `venue/venue-map.ts:52`

`fromCharCode` → `fromCodePoint`; `rowCode` spec stays green. Commit `fix(fe): use String.fromCodePoint in venue-map rowCode (#157)`.

## Phase 3 — S7924: solid composited fills

**Files:** Modify the four `.scss` + two `.contrast.spec.ts`

Apply the colour table. Update the two form-error spec assertions to the solid fill; add badge notes. Keep all four contrast specs green in both themes (`npx vitest run booking-confirmation.contrast request-confirmation.contrast booking-dialog.contrast booking-pay.contrast`). Commit `fix(fe): solid composited fills on Liquid Glass booking surfaces for static-analysis contrast (#157)`.

## Phase 4 — S1075: justified suppression

**Files:** Modify `sonar-project.properties`

Add `e2` (`**/RateLimitFilter.java`) + `e3` (`**/SecurityConfig.java`) `java:S1075` ignores with a rationale comment; keep `e1` (`S4032`). Commit `chore(sonar): suppress java:S1075 on API route-pattern constants with rationale (#157)`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-03 | Phase 1 (S7059) | other services firing an awaited async op in a constructor | grep `constructor()` in `frontend/src/app` + SonarCloud reported-issue list | only `operator-auth` (Sonar reported exactly 1 `S7059`); `venue-map`'s ctor uses an Observable `.subscribe()`, not an awaited async op, so it is not flagged | none needed — single site fixed |
| 2026-07-03 | Phase 3 (S7924) | other translucent glass fills whose ink ≈ the fill's base rgb (light-on-light / white-on-white / red-on-red) | SonarCloud reported list (analysed all of `frontend/src`) + review of sibling `.scss` tints | exactly the 9 flagged pairs (all `booking/`, added by T4/#158); sibling tints (`.info-box`, `.mode-note`, `.summary`, `.code-card`, `.pe-host`) carry DARK ink on light tints → sufficient contrast, not flagged; T3 surfaces already use the solid `failure-icon` pattern | none needed — the reported list is the full site set |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npx vitest run venue-map` → `rowCode` green. Sonar: 0 `S7758`.
- [ ] **AC-2:** `npx vitest run operator-auth` → all green incl. no-HTTP-on-construction. Sonar: 0 `S7059`.
- [ ] **AC-3:** Sonar `api/issues/search` → 0 `S1075`; `S4032` `e1` still present in `sonar-project.properties`.
- [ ] **AC-4:** `npx vitest run *.contrast` → four booking contrast specs green (both themes). Sonar: 0 `S7924`.
- [ ] **AC-5:** `api/issues/search?...&pullRequest=<PR#>&resolved=false` → **0**; new-code gate green; new-code coverage ≥ 80%.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test/gate.
- [ ] No placeholders / TODO / TBD.
- [ ] **No JPA / no Lombok** introduced (invariant #1) — N/A, no Java authored.
- [ ] Availability N/A justified (invariant #2).
- [ ] **Modulith** untouched; no cross-module imports; `ModularityTests` unaffected (invariant #11).
- [ ] Payment/payout N/A justified.
- [ ] **Frontend** standards met; no `as any`; behaviour preserved (S7059).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] Sonar issue list (not just the gate) verified 0 for the PR.
