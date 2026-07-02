---
name: riviera-frontend
description: The Angular frontend STRUCTURE authority for riviera-sunbed-booking — which folder a file belongs in (core/ vs feature vs shared/ vs pages/), the import-direction rules between them, the flat lazy-route convention in app.routes.ts, where interceptors/guards/auth state live, the DI-token adapter-swap pattern for external services, environment-config rules, and the two-suite e2e split. Load BEFORE creating or modifying ANY file under frontend/src or frontend/e2e — which folder a file lands in is this skill's call. Pairs with angular-developer (HOW to write it) and frontend/.claude/CLAUDE.md (language idioms); the review bank (RV-FE-*) checks the result.
---

# Riviera frontend structure

This is the **frontend counterpart of `riviera-modulith`**: it owns the *where*,
not the *how*. `angular-developer` (+ the angular-cli MCP `get_best_practices`)
owns component/service/routing/signals technique; `frontend/.claude/CLAUDE.md`
owns the language idioms (standalone, signals, Signal Forms, `@Service`,
`inject()`); `riviera-review-overlay` RV-FE-* checks the result. Load this skill
whenever a file is created or moved under `frontend/` — placement mistakes are
cheap here and expensive at review.

## Folder taxonomy (`frontend/src/app/`)

| Folder | Owns | May import from | Examples today |
|---|---|---|---|
| `core/` | **Stateful cross-cutting singletons**: auth state, HTTP interceptors, route guards, current-principal service | `shared/` only — never a feature | `operator-auth.ts`, `operator-auth.interceptor.ts` |
| `shared/` | **Pure, stateless utilities and presentational primitives**: no HTTP, no app state | nothing app-internal | `money.ts` |
| `pages/` | **Static/marketing routes** with no domain logic | `core/`, `shared/` | `pages/home/` |
| Feature folders (`booking/`, `venue/`, `venue-admin/`, `staff/`, …) | One user-facing domain area: its components, its models, its HTTP service | `core/`, `shared/` — **never another feature folder** | `booking/booking-view.ts`, `venue/venue.service.ts` |
| `environments/` | `apiBaseUrl` + public config (e.g. `stripePublishableKey`) | — | see Environment rules |

**Import direction is one-way:** features → `core`/`shared`; `core` → `shared`;
`shared` → nothing. When two features need the same thing, promote it: pure →
`shared/`, stateful/HTTP → `core/` (or question whether it is really one
feature). A feature importing from another feature is the FE version of a
Modulith boundary violation — flag it, don't ship it.

**New feature = new folder.** The upcoming auth epic (#108) adds e.g. `auth/`
(sign-in/register pages, account pages) as a feature folder; the session/CSRF
machinery it uses lives in `core/`, mirroring the backend rule that login
machinery sits at the platform edge, not in a domain module (RV-BE-11).

## Files inside a feature

Colocate everything the feature owns, flat (no `components/`/`services/`
subfolders at this app size):

- `<name>.ts` — the component (inline template if small; else `<name>.html` +
  `<name>.scss` next to it).
- `<name>.spec.ts` — unit spec, always.
- `<name>.a11y.spec.ts` / `<name>.contrast.spec.ts` — axe + contrast specs for
  any user-facing surface (the pattern in `booking/` and `venue/`).
- `<domain>.model.ts` — the feature's request/response types.
- `<domain>.service.ts` — the feature's HTTP service (`@Service()`, signals).

## Routing

- **All routes live in `app.routes.ts`** — one flat array, no per-feature route
  files until the app outgrows it (it hasn't).
- Every route is **lazy** (`loadComponent: () => import(...)`) and carries a
  `title`.
- Order matters for parameterized paths (`booking/confirmation` before
  `booking/:code`) — keep literal segments above `:param` siblings.
- Route guards are cross-cutting → they live in `core/` and are applied in
  `app.routes.ts` (`canActivate`/`canMatch`), not inside feature components.

## `app.config.ts` (the composition root)

The only place providers are wired:

- **Interceptors** via `provideHttpClient(withInterceptors([...]))`.
- **External-service adapters behind a DI token** — the established pattern is
  `StripePaymentGateway` (abstract class token) with `StripeJsPaymentGateway`
  (real) vs `FakeStripePaymentGateway` (deterministic, no third-party JS),
  swapped by a factory reading a `window.__RIVIERA_FAKE_*__` flag that only the
  Playwright e2e sets. **Reuse this exact shape** for any new external
  dependency the FE grows (e.g. an SSO redirect helper): abstract token +
  real/fake adapters + factory in `app.config.ts`; unit specs override the
  token directly.

## Environment rules

- `environments/environment.ts` (dev, `localhost:8080`) /
  `environment.prod.ts` (deploy target), swapped by `fileReplacements`.
- Only **public** values (API base URL, `pk_…` publishable keys). Never a
  secret — the bundle is world-readable. Deploy-time values are rewritten by CD
  from repo **variables**, not committed edits (`docs/deploy/cd-pipeline.md`).
- Empty-by-default keys fail loudly in-app rather than silently.

## e2e split (placement only — authoring belongs to `playwright-cli`)

- `frontend/e2e/*.e2e.ts` — **CI-safe suite**: real browser, API mocked via
  `page.route`, includes axe checks. Every user-facing slice ships coverage
  here.
- `frontend/e2e/real-backend/` — **local-only suite** against a running
  backend (+ its `support/` helpers). Never wired into CI.
- Which suite a new spec belongs in, and what RV-FE-E2E checks, is defined in
  `riviera-review-overlay` — consult it when placing a spec.

## When NOT to apply

- Generated files (`angular.json`, CI workflows) — devops conventions rule there.
- The *content* of components/services — that's `angular-developer` +
  `frontend/.claude/CLAUDE.md`.

## Integration

- **`riviera-sdlc`** routes any frontend change here (Skill-routing gate) along
  with `angular-developer` + the angular-cli MCP + `playwright-cli`.
- **`riviera-review-overlay`** RV-FE-* verifies the outcome; a placement this
  skill forbids is a review finding.
- Backend structure questions → `riviera-modulith`; this skill is its mirror on
  the Angular side.
