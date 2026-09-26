---
name: riviera-frontend
description: >-
  Angular structure authority for frontend/: folder taxonomy (core/shared/pages/features),
  import direction, routing, app.config wiring, theming ownership, the two-suite e2e
  split. Load BEFORE creating or modifying any file under frontend/src or frontend/e2e —
  which folder a file lands in is this skill's call.
---

# Riviera frontend structure

Owns the *where*. Technique: `angular-developer` + the angular-cli MCP (`get_best_practices`,
`search_documentation`); idioms: `frontend/.claude/CLAUDE.md`; review: RV-FE-*.

## Folder taxonomy (`frontend/src/app/`)

| Folder | Owns | May import from |
|---|---|---|
| `core/` | stateful cross-cutting singletons: auth state, interceptors, guards, current principal, theme (`operator-auth.ts`, `api-session.interceptor.ts`, `theme.ts`) | `shared/` only |
| `shared/` | pure, stateless utilities and presentational primitives; no `HttpClient`, no app state; includes the API-view vocabulary mirrors (`venue-views.ts`, `money.ts`, `booking-date.ts`, `photo-url.ts`, `amenities.ts`, `booking-status.ts`) | nothing app-internal |
| `pages/` | static/marketing routes | `core/`, `shared/` |
| feature folders (`booking/`, `venue/`, `operator/`, `auth/`, `admin/`, …) | one domain area: components, models, HTTP service | `core/`, `shared/` — never another feature |
| `environments/` (sibling of `app/`) | `apiBaseUrl` + public config; any stratum may read it | — |

Two features needing the same thing → promote it: pure → `shared/`, stateful/HTTP → `core/`.
An adapter that does its own I/O (`shared/maplibre-map-engine.ts` fetching MapLibre tiles) is still
`shared/`-admissible; "no HTTP" means no `HttpClient`/API state.

**Frozen cross-feature edges** (RV-FE-8: a *new* edge is Major, Blocker if `shared/`- or
`core/`-directed; shrink this table with the code):

| Edge | What crosses |
|---|---|
| `operator/` → `venue/` (`console-venue-map.ts`, `daily-view-tab.ts`) | `venue.service` |
| `pages/home` → `venue/` | `venue.service` |
| `venue/venue-map` → `booking/` | `booking-dialog` (the one component edge) |

`auth/` holds the sign-in card (`auth-page.ts` at `/account/sign-in`), forgot/reset/verify/
set-password, `operator-password.ts`; its session/CSRF machinery lives in `core/` (login is an
edge concern, as on the backend).

## Files inside a feature

Flat, no `components/`/`services/` subfolders: `<name>.ts` (inline template if small, else
`<name>.html`), `<name>.spec.ts` always, `<name>.a11y.spec.ts` + `<name>.contrast.spec.ts` for
user-facing surfaces, `<domain>.model.ts`, `<domain>.service.ts` (`@Service()`, signals).

## Routing

- All routes in `app.routes.ts`, every one lazy (`loadComponent`) with a `title`; literal
  segments above `:param` siblings. `app.routes.spec.ts` resolves every lazy target, so a new
  route needs no per-component deep-link spec for coverage.
- The operator console (`/operator/:venueId`) and admin console (`/admin`) are nested
  child-route trees, one child per tab; follow that shape. A route with `data.console`
  (`venue` · `admin` · `plain`) wears the root-level `console-shell.ts` (root-level because it
  composes `operator/` and `admin/`).
- Child routes do not inherit parent params: a tab reads `:venueId` from `route.parent`
  **reactively** via `shared/parent-venue-id.ts` (the router reuses the instance on a param
  change, so a constructor snapshot pins the old venue).
- Param validity is the route's job (ADR-0023): the console helpers return `Signal<number>`
  and throw; no console template has an invalid-id arm. A new id-carrying route gets a guard
  plus one page owning the answer. `routeIdParam` stays optional for an ungated route.
- Guards live in `core/`, applied in `app.routes.ts`. Order on `/operator/:venueId` is
  load-bearing: `core/venue-id.guard.ts` first (malformed `:venueId` → `/operator/venue-not-found`),
  then `core/operator-session.guard.ts` (awaits `SessionAuth.whenReady()`; on `/operator`,
  `/operator/:venueId`, `/operator/venue-not-found`, `/account/operator-password`).

## `app.config.ts` (composition root)

Interceptors via `provideHttpClient(withInterceptors([...]))`. External services behind a DI
token: `StripePaymentGateway` (abstract class) with `StripeJsPaymentGateway` vs
`FakeStripePaymentGateway`, swapped by a factory reading a `window.__RIVIERA_FAKE_*__` flag
only the e2e sets — reuse for any dependency **the e2e cannot drive for real**
(`booking/stripe-payment.gateway.ts`, `operator/qr-scanner.ts`, `shared/map-engine.ts`). When
the e2e can drive it (`SsoRedirect`, `shared/geolocation.ts`), keep the token + unit-spec fake
but a plain `useClass` and no flag. Unit specs override the token directly.

## Theming (Liquid Glass)

- Themes are `--riv-*` custom properties scoped by `data-riv-theme` on `<html>`, declared per
  theme in `src/tailwind.css`. Three themes: `porcelain` (light, default, the `:root` block),
  `riviera` (branded dark teal, switcher-only), `dark` (neutral slate, OS-dark).
- Only `core/theme.ts` (`ThemeService`) writes the document attribute at runtime; the
  `index.html` inline seed pre-paints it with the same resolution (`core/theme-boot.spec.ts`
  pins them together — extend both or neither).
- A subtree may pin its own theme via `data-riv-theme` on its host: every operator/admin route
  wears the console theme (porcelain or dark, never `riviera`) via `app.ts`'s host binding
  reading `core/console-theme.ts` (`ConsoleTheme`, storage key `riviera-console-theme`, no OS
  follow); it never touches `ThemeService`.
- The **theme** registry is three places: a CSS block in `tailwind.css`, a row in
  `core/theme.ts` (`THEME_OPTIONS` — id, name, swatch, light; the switcher's, not a token's) and
  the id allow-list in `index.html`'s pre-paint seed, which resets any id it does not list.
  A **token** is `tailwind.css` alone: a declaration per theme block plus a `@theme inline`
  mapping (→ `bg-riv-…`/`text-riv-…`), and nothing in `core/theme.ts`.
- Consuming tokens is `riviera-tailwind`'s call. Reduced-motion guards live in the same
  stylesheet as the animation.

## Environment

`environment.ts` (dev, `localhost:8080`) / `environment.prod.ts` via `fileReplacements`. Public
values only (`pk_…`), never a secret; deploy-time values are rewritten by CD
(`docs/deploy/cd-pipeline.md`). Empty keys fail loudly.

## e2e split (authoring: `playwright-cli`; placement: RV-FE-E2E)

`frontend/e2e/*.e2e.ts` — CI-safe, API mocked via `page.route`, axe via
`frontend/e2e/support/axe.ts` (`expectNoSeriousAxeViolations`; await
`getAnimations().finished` before an axe run on an animated surface). Every user-facing slice
ships coverage here. `frontend/e2e/real-backend/` — local-only, never in CI.

Adopt a `features/` wrapper only past ~8–10 feature folders; never a JWT-auth pattern
(`docs/architecture/auth-signin-register.md` D-1).
