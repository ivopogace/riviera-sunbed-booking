# [F2] Scaffold the Angular frontend — Implementation Plan

> **For agentic workers:** implement with `angular-new-app` (scaffold) + `angular-developer`
> (standards) + the Angular MCP. This is a foundational scaffold, not a spine feature —
> the riviera invariant sections are honestly `N/A`. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Stand up a buildable, lintable, testable Angular app skeleton under `frontend/`
that serves a placeholder home route — the shell CI's frontend job will build/lint/test.

**Architecture:** Standalone-component Angular app (latest CLI), routing on, SCSS, Tailwind
via `ng add`. No real screens — a base layout + one placeholder home route. The single
significant decision is **test-runner choice** (see Risk R-1): the issue AC assumes Karma
(`--browsers=ChromeHeadless`), but the current CLI may scaffold a different default.

**Persistence:** N/A — frontend-only, no backend/DB/migration in scope (invariant #1 untouched).

**Source of intent:** GitHub issue **#2** ([F2] Scaffold the Angular frontend). Blocks **#3** (CI/CD).

**Branch:** `feature/scaffold-frontend` ✅ exists and is checked out.

---

## Acceptance criteria (testable)

> From issue #2. These are scaffold-level gates (build/lint/test/serve), not behavior specs.

- [ ] **AC-1:** Given a clean checkout of `frontend/`, when I run `npm ci && npm run build`,
  then the **production** build completes with exit 0 and emits `dist/`.
  *Pinned by:* CI frontend `build` step / local `npm run build`.
- [ ] **AC-2:** Given the scaffold, when I run the project's default headless unit-test
  command (the **current CLI's modern runner** — NOT Karma/`--browsers=ChromeHeadless`,
  which is outdated; exact command recorded in phase 4), then it runs and **passes** with exit 0.
  *Pinned by:* the default root-component spec.
- [ ] **AC-3:** Given the scaffold, when I run `npm run lint`, then it completes with exit 0
  and no errors. *Pinned by:* `ng lint` over the project.
- [ ] **AC-4:** Given `npm start` (dev server), when I GET `http://localhost:4200/`, then the
  **placeholder home route** renders (HTTP 200, the home component's marker text present).
  *Pinned by:* manual serve check + the home component spec.

## Non-goals

- No real product screens (beach map, booking flow, venue editor) — those are U1/U3/U7.
- No FE↔BE API wiring or generated client — there is no endpoint to consume yet.
- No auth, no i18n, no state-management library.
- No CI workflow file — that's issue #3 (F3); this issue only makes the app *buildable* so #3 can wire it.
- No SSR (see Open Question Q-2 — defaulting to client-side only for the shell).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Issue AC's `--browsers=ChromeHeadless` (Karma) is outdated; the current CLI scaffolds a modern runner. | — | — | **Resolved (decision):** drop the Karma command entirely; use the CLI's default modern test runner and record its exact headless command in phase 4 for issue #3 to reuse. | Ivo | resolved (planning) |
| R-2 | `npm run lint` script absent — `ng new` doesn't add ESLint by default. | high | low | Run `ng add @angular-eslint/schematics`, which wires the `lint` target + `npm run lint`. | Claude | open |
| R-3 | Node 26 / latest CLI version skew vs CI's pinned Node LTS (#3 says "Node LTS"). Build green locally, red in CI on a different Node. | med | med | Record the exact Node + CLI + Angular versions in this doc and `frontend/package.json` engines; #3 pins CI Node to a version that builds this scaffold. | Ivo | open |
| R-4 | Tailwind v4 `ng add` changes build/styles wiring in a way that breaks the prod build. | low | med | Run `npm run build` immediately after `ng add tailwindcss`; fix per Tailwind v4 upgrade guide before proceeding. | Claude | open |

## Open questions / Assumptions

- **Assumption:** App lives at repo-root `frontend/` (sibling of `platform/`), matching issue #2 ("under `frontend/`") and #3's frontend job cwd. — *Owner:* Ivo · *Resolves by:* phase 0.
- **Q-1 (style):** SCSS vs CSS for the stylesheet format. — *Owner:* Claude (I'll pick **SCSS**) · *Resolves by:* phase 0.
- **Q-3 (style):** SCSS chosen.

### Resolved

- **Q-2 (SSR):** **No SSR** — client-side only. Decided 2026-06-27; scaffold overhead not justified for a shell with no public pages yet; cheap to re-scaffold if SEO/first-paint matters later.
- **R-1 (test runner):** Use the current CLI's **default modern runner**, not Karma `--browsers=ChromeHeadless`. Decided 2026-06-27 per user; exact command to be recorded in phase 4.
- **Q-3:** `--ai-config` value — defaulting to **`claude`** (drops a `frontend/CLAUDE.md` with Angular best practices that auto-loads when working in `frontend/`). — *Owner:* Claude · *Resolves by:* phase 0.

## Availability & concurrency (invariant #2)

N/A — frontend scaffold; writes no `availability` row, touches no booking/map logic.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend code in scope.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves; no Stripe code.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `app` root (`app.ts` / `app.html`) | new | standalone root component | none (static shell) | none |
| FE-2 | base layout (header/shell wrapper in root template) | new | template + Tailwind | none | none |
| FE-3 | `home` route component | new | standalone component | none (placeholder) | none |

**Standards:** standalone components, `inject()`, `@if`/`@for` control flow, signal
`input()`/`output()` where any inputs appear, new-project naming (no `.component` suffix on
class if CLI default). Defer to the in-repo `angular-developer` skill + Angular MCP
`get_best_practices` for the version-specific conventions.

## FE↔BE contract

N/A — no API contract change; no endpoint consumed by the shell.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `ng new` scaffold (routing, scss, ai-config) | ✅ | this commit |
| 1 — Tailwind via `ng add` | ✅ | this commit |
| 2 — ESLint via `ng add` (the `lint` script) | ✅ | this commit |
| 3 — base layout + placeholder home route | ✅ | this commit |
| 4 — reconcile test runner (R-1) + verify all ACs | ✅ | this commit |

> **Versions (R-3, for issue #3 to pin CI):** Angular **22.0**, `@angular/cli` 22.0.4,
> Node **26.0.0**, npm 11.12.1, TypeScript 6.0, Tailwind 4.3.1, Vitest 4.1.9.
> **Test runner = Vitest** via `@angular/build:unit-test`; the CI test command is
> **`npm test`** (runs once, jsdom, no watch, no `--browsers` flag).

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window.

---

## File structure

> Most files are CLI-generated; this maps the ones we author/touch.

- `frontend/` — the Angular workspace (CLI-generated).
- `frontend/src/app/app.ts` / `app.html` — root standalone component + base layout.
- `frontend/src/app/app.routes.ts` — routing; `''` → home.
- `frontend/src/app/pages/home/` — placeholder home component (generated).
- `frontend/package.json` — `build` / `test` / `lint` scripts; `engines` (Node).
- `frontend/CLAUDE.md` — generated Angular AI config (from `--ai-config=claude`).
- `.gitignore` — ensure `frontend/node_modules`, `frontend/dist`, `.angular/` ignored.

---

## Phase 0 — `ng new` scaffold

**Files:** Create `frontend/**` via CLI.

- [ ] **Step 1:** Confirm CLI: `npx ng version` (or `gcm ng`). Use `npx ng new` if no global CLI.
- [ ] **Step 2:** Scaffold:
  `npx ng new frontend --style=scss --routing --ssr=false --ai-config=claude --interactive=false`
  (adjust `--routing`/standalone to whatever the current CLI names them; standalone is the default).
- [ ] **Step 3:** `cd frontend && npm run build` → PASS (baseline prod build green before adding anything).
- [ ] **Step 4:** Commit — `git commit -m "scaffold Angular app under frontend/ (#2)"`.
- [ ] **Step 5:** Mark phase 0 ✅ in the Execution-status table (same commit window).

## Phase 1 — Tailwind

- [ ] `cd frontend && npx ng add tailwindcss` (accept defaults; Tailwind v4).
- [ ] `npm run build` → PASS (R-4 gate). Add one Tailwind class to the shell to prove it applies.
- [ ] Commit — `git commit -m "add Tailwind CSS to frontend (#2)"`; mark phase 1 ✅.

## Phase 2 — ESLint / the `lint` script (R-2)

- [ ] `cd frontend && npx ng add @angular-eslint/schematics`.
- [ ] `npm run lint` → PASS (exit 0). Fix any default findings.
- [ ] Commit — `git commit -m "add ESLint + npm run lint to frontend (#2)"`; mark phase 2 ✅.

## Phase 3 — base layout + placeholder home route

- [ ] `npx ng generate component pages/home`.
- [ ] Wire `app.routes.ts`: `''` → `Home`. Add a minimal base layout (header + `<router-outlet>`) in the root template, Tailwind-styled.
- [ ] Put a stable marker in the home template (e.g. `Riviera — coming soon`) for AC-4.
- [ ] `npm run build` → PASS; `npm start` and GET `/` → home renders (AC-4).
- [ ] Commit — `git commit -m "add base layout + placeholder home route (#2)"`; mark phase 3 ✅.

## Phase 4 — reconcile test runner + verify ACs (R-1)

- [ ] Inspect generated test config; determine runner + its headless command.
- [ ] Run the headless test command → PASS (AC-2). Record the **exact** command in this doc and note it for issue #3.
- [ ] If the runner isn't Karma, update AC-2's command above and add a `### Resolved` note for Q/R-1.
- [ ] Run the full AC verification block below; mark phase 4 ✅.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `cd frontend && npm run build` (prod) → exit 0, `dist/frontend` emitted; `home` lazy chunk present. Verified this commit.
- [x] **AC-2:** `cd frontend && npm test` → Vitest, 2 files / 5 specs passed, exit 0 (runs once, no watch). Verified this commit.
- [x] **AC-3:** `cd frontend && npm run lint` → "All files pass linting", exit 0. Verified this commit.
- [x] **AC-4:** `npm start` + browser GET `/` → HTTP 200, rendered DOM shows `<h1>Riviera — coming soon`, header "Riviera", `app-home` mounted via router-outlet, page title "Riviera — Sunbed Booking". Verified this commit.

> Note: `npm ci` (AC-1's literal form) is a clean-install variant of the install used here;
> CI will run `npm ci` from a committed lockfile. `package-lock.json` is committed.

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying command and a passing result.
- [ ] No placeholders / TODO / TBD left in this doc (test-runner command is concrete).
- [ ] **No JPA / no backend** touched (invariant #1) — frontend-only confirmed.
- [ ] Availability / Modulith / Payment sections justified N/A (no spine code).
- [ ] Frontend standards met (standalone, `inject()`, control flow) or deviation documented; no `as any`.
- [ ] `.gitignore` excludes `frontend/node_modules`, `frontend/dist`, `.angular/`.
- [ ] Node/CLI/Angular versions recorded (R-3) for issue #3 to pin CI.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
