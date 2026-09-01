---
name: riviera-frontend
description: >-
  The Angular frontend STRUCTURE authority for riviera-sunbed-booking — folder taxonomy
  (core/ vs feature vs shared/ vs pages/), import direction + the cross-feature-import debt
  ledger, the flat lazy-route convention, interceptor/guard/auth-state placement, the
  DI-token adapter-swap pattern, environment config, and the two-suite e2e split. Load
  BEFORE creating or modifying ANY file under frontend/src or frontend/e2e — which folder a
  file lands in is this skill's call. Pairs with angular-developer (HOW to write it) and
  frontend/.claude/CLAUDE.md (language idioms); RV-FE-* checks the result.
---

# Riviera frontend structure

The frontend counterpart of `riviera-modulith`: it owns the *where*, not the *how*.
`angular-developer` (+ the angular-cli MCP: `get_best_practices` for the version posture,
`search_documentation` for API truth when behavior is uncertain) owns
component/service/routing/signals technique; `frontend/.claude/CLAUDE.md` owns the
language idioms; `riviera-review-overlay` RV-FE-* checks the result.

## Folder taxonomy (`frontend/src/app/`)

| Folder | Owns | May import from | Examples |
|---|---|---|---|
| `core/` | **Stateful cross-cutting singletons**: auth state, HTTP interceptors, route guards, current-principal service, theme state | `shared/` only — never a feature | `operator-auth.ts`, `api-session.interceptor.ts`, `theme.ts` |
| `shared/` | **Pure, stateless utilities and presentational primitives**: no HTTP, no app state — including the published API-view vocabulary (backend-vocabulary mirrors like `venue-views.ts`, `amenities.ts`, `booking-status.ts`) | nothing app-internal (`environments/` is config, not app code — see below) | `money.ts`, `venue-views.ts` |
| `pages/` | **Static/marketing routes** with no domain logic | `core/`, `shared/` | `pages/home/` |
| Feature folders (`booking/`, `venue/`, `operator/`, `auth/`, `admin/`, …) | One user-facing domain area: its components, its models, its HTTP service | `core/`, `shared/` — **never another feature folder** | `booking/booking-view.ts`, `venue/venue.service.ts` |
| `environments/` (at `frontend/src/environments/`, a sibling of `app/`) | `apiBaseUrl` + public config (e.g. `stripePublishableKey`) | — | see Environment rules |

**Import direction is one-way:** features → `core`/`shared`; `core` → `shared`; `shared` →
nothing. When two features need the same thing, promote it: pure → `shared/`,
stateful/HTTP → `core/` (or question whether it is really one feature). A feature
importing from another feature is the FE version of a Modulith boundary violation.

**`environments/` sits beneath the taxonomy, not inside it.** It is public build-time
config, not app code: any stratum — including `shared/` (`shared/photo-url.ts` resolving
against `apiBaseUrl`) — may read `environments/environment`. That does not loosen
`shared/`'s purity: frozen config is not app state.

### The residual cross-feature imports — frozen

The published API-view vocabulary lives in `shared/` (`venue-views.ts`, `money.ts`,
`booking-date.ts`, `photo-url.ts`); the `venue` feature remains editor of record for its
mirror, per the `amenities.ts`/`booking-status.ts` precedent
(`docs/plans/vocabulary-out-of-venue.md`). What remains is frozen by
`riviera-review-overlay` RV-FE-8 (a *new* edge is a Major finding, Blocker if `shared/`-
or `core/`-directed; a pre-existing edge moved or consolidated is not; shrink this table in
the same PR that shrinks the code):

| Edge | Files | What crosses |
|---|---|---|
| `operator/` → `venue/` | 3 | `venue.service` (`console-venue-map.ts`, `daily-view-tab.ts`, `layout-editor.ts`) |
| `pages/home` → `venue/` | 1 | `venue.service` (`pages/` may take only `core`/`shared`) |
| `venue/venue-map` → `booking/` | 1 | `booking-dialog` — the reverse edge, the one feature→feature *component* import |

These five carry behavior, not vocabulary — a shared HTTP service and a component edge —
and each needs its own argument on its merits (e.g. promoting `VenueService` to `core/`,
or inverting the dialog edge); never a blanket "features may import features" rule. No
ESLint rule pins this today.

**New feature = new folder.** `auth/` holds the audience-aware sign-in card
(`auth/auth-page.ts` at `/account/sign-in`; redirect routes for the retired
`auth/sign-in`, `auth/register`, `operator/operator-register` pages remain for one
release), the forgot/reset/verify/set-password pages, and `operator-password.ts` at
`/account/operator-password`. The session/CSRF machinery they use lives in `core/`,
mirroring the backend rule that login machinery sits at the platform edge, not in a domain
module.

## Files inside a feature

Colocate everything the feature owns, flat (no `components/`/`services/` subfolders):

- `<name>.ts` — the component (inline template if small; else `<name>.html` next to it,
  styled with Tailwind classes — see `riviera-tailwind`).
- `<name>.spec.ts` — unit spec, always.
- `<name>.a11y.spec.ts` / `<name>.contrast.spec.ts` — axe + contrast specs for any
  user-facing surface (the pattern in `booking/` and `venue/`).
- `<domain>.model.ts` — the feature's request/response types.
- `<domain>.service.ts` — the feature's HTTP service (`@Service()`, signals).

## Routing

- **All routes live in `app.routes.ts`** — one array, no per-feature route files. Mostly
  flat; the operator console (`/operator/:venueId`) is the one nested child-route tree — a
  layout component with a child route per tab so each tab is deep-linkable. Follow that
  shape for further tabbed sub-apps.
- Every route is lazy (`loadComponent: () => import(...)`) and carries a `title`.
- Order matters for parameterized paths (`booking/confirmation` before `booking/:code`) —
  keep literal segments above `:param` siblings.
- **Child routes do NOT inherit the parent's params** under the default `emptyOnly`
  strategy — a non-empty child (an `/operator/:venueId` tab) reads `:venueId` from
  `route.parent`, and reads it **reactively** via `shared/parent-venue-id.ts`'s signal
  helpers: the router reuses the component instance when only the param changes, so a
  constructor snapshot read pins the old venue.
- Route guards are cross-cutting → they live in `core/` and are applied in
  `app.routes.ts` (`canActivate`/`canMatch`), not inside feature components. Worked
  example: `core/operator-session.guard.ts` — restore-aware (awaits
  `SessionAuth.whenReady()` before deciding), applied on `/operator` (incl. its create
  state), `/operator/:venueId` and `/account/operator-password`.

## `app.config.ts` (the composition root)

The only place providers are wired:

- Interceptors via `provideHttpClient(withInterceptors([...]))`.
- External-service adapters behind a DI token — the established pattern is
  `StripePaymentGateway` (abstract class token) with `StripeJsPaymentGateway` (real) vs
  `FakeStripePaymentGateway` (deterministic, no third-party JS), swapped by a factory
  reading a `window.__RIVIERA_FAKE_*__` flag that only the Playwright e2e sets. Reuse this
  exact shape for any new external dependency: abstract token + real/fake adapters +
  factory in `app.config.ts`; unit specs override the token directly.

## Theming & design tokens (Liquid Glass)

- **Themes are CSS custom properties** (`--riv-*`) scoped by `data-riv-theme` on `<html>`,
  declared per theme in `src/tailwind.css`. At runtime the document-level attribute is
  written only by `core/theme.ts` (`ThemeService`: signal + localStorage +
  `prefers-color-scheme` fallback, followed live on OS flips when no choice is stored; the
  theme registry lives there as data). The one non-runtime writer is the `index.html`
  inline seed, which pre-paints the same value before Angular boots with the same
  resolution order — drift-pinned by `core/theme-boot.spec.ts`; extend `ThemeService`'s
  resolution only together with the seed. **A subtree may pin its own theme** by setting
  `data-riv-theme` on its own host element: the operator console is always porcelain via a
  `host: { 'data-riv-theme': 'porcelain' }` binding, which does not touch the document
  attribute / `ThemeService`. Writing the document attribute stays `ThemeService`-only.
- **The token registry lives in two places, and only two**: a palette change is one CSS
  block in `tailwind.css` + one registry row in `core/theme.ts`, zero component edits. A
  new token additionally gets a `@theme inline` mapping in `tailwind.css`, which makes it a
  first-class utility (`bg-riv-…`/`text-riv-…`). The theme set is three — `porcelain`
  (light, the default and the `:root` base block), `riviera` (branded dark teal,
  switcher-only), and `dark` (neutral slate, the OS-dark resolution). Restyle slices add
  page-surface tokens there (e.g. the `--riv-card-*` card-glass set) so later slices reuse them.
- How to consume the tokens — token-first styling, the `:host-context` escape hatch, the
  composited-contrast proofs (`src/testing/contrast.ts`) — is `riviera-tailwind`'s call.
- Reduced-motion guards live in the same stylesheet as the animation they guard (component
  styles' emulated-encapsulation attribute beats a global guard's specificity).

## Environment rules

- `environments/environment.ts` (dev, `localhost:8080`) / `environment.prod.ts` (deploy
  target), swapped by `fileReplacements`.
- Only public values (API base URL, `pk_…` publishable keys). Never a secret — the bundle
  is world-readable. Deploy-time values are rewritten by CD from repo variables, not
  committed edits (`docs/deploy/cd-pipeline.md`).
- Empty-by-default keys fail loudly in-app rather than silently.

## e2e split (placement only — authoring belongs to `playwright-cli`)

- `frontend/e2e/*.e2e.ts` — CI-safe suite: real browser, API mocked via `page.route`,
  includes axe checks. Every user-facing slice ships coverage here. The one axe policy is
  `frontend/e2e/support/axe.ts` (`expectNoSeriousAxeViolations`) — don't hand-roll an
  AxeBuilder per spec; an axe run after opening an animated surface must first await
  `getAnimations().finished` (mid-fade opacity reads as a false contrast fail).
- `frontend/e2e/real-backend/` — local-only suite against a running backend (+ its
  `support/` helpers). Never wired into CI.
- Which suite a new spec belongs in, and what RV-FE-E2E checks, is in `riviera-review-overlay`.

## External reference

[Ismaestro/angular-example-app](https://github.com/Ismaestro/angular-example-app) shares
this taxonomy. Two deliberate deltas: adopt its `features/` wrapper only past ~8–10
top-level feature folders, and never its JWT-auth pattern
(`docs/architecture/auth-signin-register.md` D-1).

## When NOT to apply

- Generated files (`angular.json`, CI workflows).
- The content of components/services — `angular-developer` + `frontend/.claude/CLAUDE.md` own the how.
