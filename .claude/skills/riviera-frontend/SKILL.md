---
name: riviera-frontend
description: The Angular frontend STRUCTURE authority for riviera-sunbed-booking — which folder a file belongs in (core/ vs feature vs shared/ vs pages/), the import-direction rules between them plus the ledger of shipped cross-feature-import debt (grandfathered, not sanctioned — check it before citing an existing cross-feature import as precedent), the flat lazy-route convention in app.routes.ts, where interceptors/guards/auth state live, the DI-token adapter-swap pattern for external services, environment-config rules, and the two-suite e2e split. Load BEFORE creating or modifying ANY file under frontend/src or frontend/e2e — which folder a file lands in is this skill's call. Pairs with angular-developer (HOW to write it) and frontend/.claude/CLAUDE.md (language idioms); the review bank (RV-FE-*) checks the result.
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
| `core/` | **Stateful cross-cutting singletons**: auth state, HTTP interceptors, route guards, current-principal service, theme state | `shared/` only — never a feature | `operator-auth.ts`, `api-session.interceptor.ts`, `theme.ts` |
| `shared/` | **Pure, stateless utilities and presentational primitives**: no HTTP, no app state — including the published API-view vocabulary (backend-vocabulary mirrors like `venue-views.ts`, `amenities.ts`, `booking-status.ts`) | nothing app-internal (`environments/` is config, not app code — see note below) | `money.ts`, `venue-views.ts` |
| `pages/` | **Static/marketing routes** with no domain logic | `core/`, `shared/` | `pages/home/` |
| Feature folders (`booking/`, `venue/`, `venue-admin/`, `operator/`, `auth/`, `admin/`, …) | One user-facing domain area: its components, its models, its HTTP service | `core/`, `shared/` — **never another feature folder** | `booking/booking-view.ts`, `venue/venue.service.ts` |
| `environments/` | `apiBaseUrl` + public config (e.g. `stripePublishableKey`) | — | see Environment rules |

**Import direction is one-way:** features → `core`/`shared`; `core` → `shared`;
`shared` → nothing. When two features need the same thing, promote it: pure →
`shared/`, stateful/HTTP → `core/` (or question whether it is really one
feature). A feature importing from another feature is the FE version of a
Modulith boundary violation — flag it, don't ship it.

**`environments/` sits beneath the taxonomy, not inside it.** It is public
build-time config, not app code: any stratum — including `shared/` (worked
example: `shared/photo-url.ts` resolving against `apiBaseUrl`) — may read
`environments/environment`. That does not loosen `shared/`'s purity: frozen
config is not app state, and `shared/` stays stateless and HTTP-free.
(Clarified by #489, which `photo-url.ts` forced: it is pure and cross-cutting
but config-dependent, so without this note it had no legal address at all.)

### The residual cross-feature imports — five, behavioral, frozen (#489)

**The placement debt is paid.** #488 recorded thirty-three cross-feature imports
across twenty-one files; #489 moved the published API-view vocabulary that caused
twenty-eight of them out of `venue/` (decision + rationale:
`docs/plans/vocabulary-out-of-venue.md`). The split by kind it chose:

- **`shared/venue-views.ts`** (was `venue/venue.model.ts`) — the venue-owned
  API-view vocabulary, the FE mirror of the backend's `venue::vocabulary`
  published surface (the #95 shape in spirit). The `venue` feature remains its
  **editor of record** — changes ride venue API slices — following the exact
  precedent of `amenities.ts`/`booking-status.ts`, both already
  backend-vocabulary mirrors living in `shared/`.
- **`MoneyView` → `shared/money.ts`** — platform money vocabulary (invariant #5)
  colocated with its renderer/parser, the one home of the euros↔minor boundary
  (the #371 kernel shape).
- **`shared/booking-date.ts`**, **`shared/photo-url.ts`** — genuinely
  cross-cutting pure helpers (#371 shape).

On the frontend the #95-vs-#371 distinction **collapses at the address level**:
there is no `allowedDependencies` analogue, and the one-way rule leaves `shared/`
as the only stratum every consumer may import — so the split is expressed in file
grain and documented ownership, not folder taxonomy.

**What remains — frozen by `riviera-review-overlay` RV-FE-8** (a *new* edge is a
Major finding, Blocker if `shared/`- or `core/`-directed; a pre-existing edge
moved or consolidated is not; shrink this table in the same PR that shrinks the
code):

| Edge | Files | What crosses |
|---|---|---|
| `operator/` → `venue/` | 3 | `venue.service` (`console-venue-map.ts`, `daily-view-tab.ts`, `layout-editor.ts`) |
| `pages/home` → `venue/` | 1 | `venue.service` (`pages/` may take only `core`/`shared`) |
| `venue/venue-map` → `booking/` | 1 | `booking-dialog` — the reverse edge, the one feature→feature *component* import |

These five carry **behavior, not vocabulary** — a shared HTTP service and a
component edge — and each needs its own argument on its merits (e.g. promoting
`VenueService` to `core/`, or inverting the dialog edge); never a blanket
"features may import features" rule, which could not absolve the `pages/` edge
anyway. With the set this small, mechanical ESLint pinning is the natural
follow-up (deliberately not added by #489). History: #488 (the diagnosis), PR
#490 (the review record), #489 (the move).

**New feature = new folder.** The auth epic (#108) added `auth/` as a feature
folder: **one audience-aware sign-in card** (`auth/auth-page.ts` at
`/account/sign-in`, S9 #277 — the old `auth/sign-in`, `auth/register` and
`operator/operator-register` pages are deleted; redirect routes remain for one
release), plus the S8 forgot/reset/verify/set-password pages and the #326
`operator-password.ts` at `/account/operator-password`. The session/CSRF
machinery they use lives in `core/`, mirroring the backend rule that login
machinery sits at the platform edge, not in a domain module (RV-BE-11).

## Files inside a feature

Colocate everything the feature owns, flat (no `components/`/`services/`
subfolders at this app size):

- `<name>.ts` — the component (inline template if small; else `<name>.html` next
  to it, styled with Tailwind classes — a colocated `<name>.scss` only for the
  grandfathered cases; see `riviera-tailwind`).
- `<name>.spec.ts` — unit spec, always.
- `<name>.a11y.spec.ts` / `<name>.contrast.spec.ts` — axe + contrast specs for
  any user-facing surface (the pattern in `booking/` and `venue/`).
- `<domain>.model.ts` — the feature's request/response types.
- `<domain>.service.ts` — the feature's HTTP service (`@Service()`, signals).

## Routing

- **All routes live in `app.routes.ts`** — one array, no per-feature route
  files until the app outgrows it (it hasn't). Mostly flat; the **operator
  console** (`/operator/:venueId`, #170) is the one **nested child-route tree** —
  a layout component with a child route per tab so each tab is deep-linkable and
  each O3–O8 slice owns its tab route. Follow that shape for further tabbed sub-apps.
- Every route is **lazy** (`loadComponent: () => import(...)`) and carries a
  `title`.
- Order matters for parameterized paths (`booking/confirmation` before
  `booking/:code`) — keep literal segments above `:param` siblings.
- **Child routes do NOT inherit the parent's params** under the default
  `emptyOnly` strategy — a non-empty child (e.g. an `/operator/:venueId` tab) reads
  `:venueId` from `route.parent`, not its own snapshot (O1 review finding).
- Route guards are cross-cutting → they live in `core/` and are applied in
  `app.routes.ts` (`canActivate`/`canMatch`), not inside feature components. The
  worked example is `core/operator-session.guard.ts` (S9 #277): restore-aware — it
  awaits `SessionAuth.whenReady()` before deciding — and applied on `/operator`,
  `/operator/:venueId`, `/venue-admin` and `/account/operator-password`.

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

## Theming & design tokens (Liquid Glass, epic #133)

- **Themes are CSS custom properties** (`--riv-*`) scoped by `data-riv-theme` on
  `<html>`, declared per theme in `src/styles.scss`. The **document-level**
  attribute is written **only** by `core/theme.ts` (`ThemeService`: signal +
  localStorage + `prefers-color-scheme` fallback; the theme registry lives there
  as data). **Exception — a subtree may pin its own theme** by setting
  `data-riv-theme` on its own host element (the attribute selector re-scopes the
  `--riv-*` tokens for that subtree): the **operator console** (#170) is always
  porcelain via a `host: { 'data-riv-theme': 'porcelain' }` binding, which does
  **not** touch the document attribute / `ThemeService`, so the tourist theme
  choice is preserved. Local pinning like this is fine; writing the **document**
  attribute stays `ThemeService`-only.
- **The token registry lives in two places, and only two**: a palette change is
  one CSS block in `styles.scss` + one registry row in `core/theme.ts`, zero
  component edits. The theme set is fixed at two — one dark, one light (#143
  closed not-planned 2026-08-01). Restyle slices add page-surface tokens there (e.g. the T2
  `--riv-card-*` card-glass set) so later slices reuse them.
- **HOW to consume the tokens** — token-first styling, the `:host-context`
  escape hatch, and the composited-contrast proofs (helpers in
  `src/testing/contrast.ts`) — is `riviera-tailwind`'s call.
- **Reduced-motion guards live in the same stylesheet as the animation they
  guard** (component styles' emulated-encapsulation attribute beats a global
  guard's specificity — the #134 lesson).

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
  here. The one axe policy is `frontend/e2e/support/axe.ts`
  (`expectNoSeriousAxeViolations`) — use it, don't hand-roll an AxeBuilder per
  spec; an axe run after opening an **animated** surface must first await
  `getAnimations().finished` (mid-fade opacity reads as a false contrast fail).
- `frontend/e2e/real-backend/` — **local-only suite** against a running
  backend (+ its `support/` helpers). Never wired into CI.
- Which suite a new spec belongs in, and what RV-FE-E2E checks, is defined in
  `riviera-review-overlay` — consult it when placing a spec.

## External reference

[Ismaestro/angular-example-app](https://github.com/Ismaestro/angular-example-app)
uses the same `core/`/`shared/`/feature taxonomy. Two deliberate deltas: **adopt
its `features/` wrapper only past ~8–10 top-level feature folders** (mechanical
move; update this skill then); and do **not** import its JWT-auth pattern — the
auth decision is ADR'd (`docs/architecture/auth-signin-register.md` D-1).

## When NOT to apply

- Generated files (`angular.json`, CI workflows) — devops conventions rule there.
- The *content* of components/services — `angular-developer` + `frontend/.claude/CLAUDE.md` own the how.

## Integration

- **`riviera-sdlc`** routes any frontend change here (Skill-routing gate), alongside `angular-developer` + the angular-cli MCP + `playwright-cli`.
- **`riviera-review-overlay`** RV-FE-* verifies the outcome; a placement this skill forbids is a review finding.
- Backend structure questions → `riviera-modulith`; this skill is its Angular-side mirror.
