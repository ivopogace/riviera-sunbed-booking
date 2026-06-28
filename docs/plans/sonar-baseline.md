# Clean SonarCloud + security baseline — Implementation Plan

> Small cleanup slice with one architectural decision (suppress, don't delete, the
> Modulith package markers). Riviera invariant sections are mostly `N/A` (no
> booking/availability/payment/money code). Steps use `- [ ]` tracking.

**Goal:** Clear the 8 SonarCloud code smells and triage the dev-only npm advisories so
the project starts from a verified-clean baseline, **without** violating the Spring
Modulith module structure (invariant #11).

**Architecture:** The 6 `java:S4032` "remove this package" smells are **false positives**
— they fire on the intentional `package-info.java` Modulith module markers. The single
significant decision: **suppress that rule on `**/package-info.java` via
`sonar-project.properties`** (not delete the files). The 2 `css:S4667` empty-stylesheet
smells are real → remove the empty `.scss` files + their `styleUrl` references.

**Persistence:** N/A — no DB/migration.

**Source of intent:** GitHub issue **#34**. Depends on **#3** (CI/Sonar wiring) ✅ merged.

**Branch:** `feature/sonar-baseline` ✅ off `main` (`4d9aff9`).

---

## Acceptance criteria (from #34)

- [ ] **AC-1:** 0 unresolved actionable code smells — 2 `css:S4667` fixed; 6 `java:S4032`
  excluded via `sonar-project.properties` (invariant-#11 rationale). Gate stays `OK`.
  *Pinned by:* next SonarCloud analysis on the PR + the `SonarCloud Code Analysis` check.
- [x] **AC-2 (revised):** `npm audit --omit=dev` = **0** (prod deps clean). All **3**
  advisories are **accepted** — `npm audit fix` changes nothing; the only fix is
  `--force`, which downgrades `@angular/build` 22→21 (breaking). Both are **dev/build-time
  and not applicable to our usage** (esbuild = `ng serve` on **Windows**; we ship prod
  builds on Linux. babel = build-time sourceMappingURL). Recorded here; maintainer may
  dismiss the Dependabot alerts as "vulnerable code not actually used."
- [ ] **AC-3:** 0 open CodeQL alerts on `main` (already clean — confirm).
- [ ] **AC-4:** 0 un-triaged Dependabot alerts (maintainer dismisses dev-only as needed).
- [ ] **AC-5:** Bugs/Vulns/Hotspots stay 0; coverage stays ≥ 80% (currently 86.5%).

## Non-goals
- **Deleting any `package-info.java` / module package** to satisfy `java:S4032` (invariant #11).
- `npm audit fix --force` (would downgrade `@angular/build` 22→21 — breaking).
- New features, refactors, or coverage-target changes.

## Risk register
| # | Risk | Mitigation |
|---|---|---|
| R-1 | Removing `styleUrl` breaks the component build | Remove the empty `.scss` file AND its `styleUrl` ref together; verify `npm run build`. |
| R-2 | "Fixing" S4032 by deleting `package-info.java` breaks Modulith (invariant #11) | Suppress via `sonar-project.properties`, never delete. Encoded as a Non-goal. |
| R-3 | `npm audit fix` bumps a transitive and breaks the build/tests | Run lint + test + build after; only the non-breaking esbuild fix, never `--force`. |

## Availability & concurrency / Payment & payout / Modulith
`N/A — no app domain code.` Invariant #11 is *protected* here (we keep the module
markers); no module boundary is crossed or added.

## Files
- `frontend/src/app/app.ts` — remove `styleUrl: './app.scss'`.
- `frontend/src/app/pages/home/home.ts` — remove `styleUrl: './home.scss'`.
- `frontend/src/app/app.scss`, `frontend/src/app/pages/home/home.scss` — delete (empty).
- `sonar-project.properties` — add scoped `java:S4032` ignore on `**/package-info.java`.
- `frontend/package-lock.json` (+ maybe `package.json`) — `npm audit fix` (esbuild).

## Execution status
| Phase | Status | Commits |
|---|---|---|
| 0 — Empty-SCSS smells (FE) | ✅ | (this commit) |
| 1 — S4032 Modulith-marker exclusion | ✅ | (this commit) |
| 2 — Dependency advisories (accepted) | ✅ | (this commit) |
| 3 — PR + verify gate | ✅ | PR #35 — all checks green; smells 8→0; coverage 91.4% |

## Phase 0 — remove empty stylesheets
Remove the two `styleUrl` refs + delete the two empty `.scss`; `npm run lint && npm run test:coverage && npm run build` green.

## Phase 1 — suppress S4032 on package-info
Add to `sonar-project.properties`:
```
sonar.issue.ignore.multicriteria=e1
sonar.issue.ignore.multicriteria.e1.ruleKey=java:S4032
sonar.issue.ignore.multicriteria.e1.resourceKey=**/package-info.java
```
(comment: intentional Spring Modulith module markers — invariant #11).

## Phase 2 — dependency advisories
`npm audit fix` (esbuild, non-breaking) in `frontend/`; re-verify lint/test/build; leave
`@babel/core` (accepted: dev-only, low; fix would downgrade `@angular/build`).

## Phase 3 — PR + verify
Push, open PR into `main`, let CI + the SonarCloud scan re-run; confirm the 6 S4032 +
2 S4667 issues close and the gate stays `OK`. Pause for maintainer approval before merge.

## Self-review checklist
- [ ] No `package-info.java` deleted (invariant #11 intact).
- [ ] No `--force` audit fix; `@angular/build` stays on 22.
- [ ] FE lint/test/build green; coverage ≥ 80%.
- [ ] No secrets; no app-domain behavior change.
