---
name: riviera-frontend
description: The Angular frontend STRUCTURE authority for riviera-sunbed-booking — which folder a file belongs in (core/ vs feature vs shared/ vs pages/), the import-direction rules between them plus the ledger of known cross-feature-import debt (why the shipped operator/→venue/ and shared/→venue/ edges are grandfathered debt tracked by #489, not a sanctioned exception — consult it before citing an existing cross-feature import as precedent), the flat lazy-route convention in app.routes.ts, where interceptors/guards/auth state live, the DI-token adapter-swap pattern for external services, environment-config rules, and the two-suite e2e split. Load BEFORE creating or modifying ANY file under frontend/src or frontend/e2e — which folder a file lands in is this skill's call. Pairs with angular-developer (HOW to write it) and frontend/.claude/CLAUDE.md (language idioms); the review bank (RV-FE-*) checks the result.
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
| `shared/` | **Pure, stateless utilities and presentational primitives**: no HTTP, no app state | nothing app-internal | `money.ts` |
| `pages/` | **Static/marketing routes** with no domain logic | `core/`, `shared/` | `pages/home/` |
| Feature folders (`booking/`, `venue/`, `venue-admin/`, `operator/`, `auth/`, `admin/`, …) | One user-facing domain area: its components, its models, its HTTP service | `core/`, `shared/` — **never another feature folder** | `booking/booking-view.ts`, `venue/venue.service.ts` |
| `environments/` | `apiBaseUrl` + public config (e.g. `stripePublishableKey`) | — | see Environment rules |

**Import direction is one-way:** features → `core`/`shared`; `core` → `shared`;
`shared` → nothing. When two features need the same thing, promote it: pure →
`shared/`, stateful/HTTP → `core/` (or question whether it is really one
feature). A feature importing from another feature is the FE version of a
Modulith boundary violation — flag it, don't ship it.

### That rule is violated today — known debt, not a carve-out (#488)

**Before you cite an existing cross-feature import as precedent: it isn't one.**
Thirty-three non-spec imports across twenty-one files cross a feature boundary
right now, in both directions, and two of them break `shared` → nothing. They
are grandfathered **debt with a target state** — don't add to them, and don't
read the table as permission. The review gate checks this as
**`riviera-review-overlay` RV-FE-8**: a *new* edge is a Major finding (Blocker
if it is `shared/`- or `core/`-directed), a pre-existing one moved or
consolidated is not. Shrink the table in the same PR that shrinks the code — a
stale count reads as licence.

| Edge | Files | What crosses |
|---|---|---|
| `operator/` → `venue/` | 12 | `venue.model`, `booking-date`, `photo-url`; `venue.service` (×3) |
| `booking/` → `venue/` | 3 | `venue.model` |
| `venue-admin/` → `venue/` | 2 | `venue.model` |
| `pages/home` → `venue/` | 1 | `venue.model`, `booking-date`; `venue.service` (`pages/` may take only `core`/`shared`) |
| `shared/{money,availability-grid}` → `venue/` | 2 | `venue.model` |
| `venue/venue-map` → `booking/` | 1 | `booking-dialog` — the reverse edge |

**The diagnosis is misplacement, not a missing exception.** Twenty-eight of the
thirty-three import only types and pure functions — `venue/venue.model.ts`
(`MoneyView`, `SetView`, `Tier`, `Pool`, `BookingMode`, `VenueMapView`,
`VenueSummary`), `venue/booking-date.ts`, `venue/photo-url.ts`. That file set is
the platform's **published API-view vocabulary** wearing a feature's address: it
is consumed by three other features, by `pages/`, *and* by `shared/` — which is
exactly why the one edge no exception could ever absolve (`shared` → a feature)
exists at all.

**The backend met this shape twice, and gave two _different_ answers — don't
collapse them.** #95 kept ownership where it was and split the *published
surface* by kind, so a module's value types live in its own `vocabulary/` and
peers import `<module>::vocabulary` under an explicit `allowedDependencies`
grant. #371 did the opposite for a different problem: it *extracted* a Shared
Kernel from a package doing two jobs with opposite dependency directions — and
that kernel is deliberately **reserved for technical shared code**, admission
requiring "no business logic" and explicitly "not a home for code used in more
than one place" (`CLAUDE.md`). Those two shapes point at different fixes here,
and which one fits is genuinely open:

- The **#95 shape** — `venue/` keeps `venue.model.ts` and it becomes an
  acknowledged published surface others may import — is the better fit for the
  venue-owned read models (`VenueMapView`, `VenueSummary`, `CoverPhotoView`).
- The **#371 shape** — promotion into `shared/` — is the better fit for the
  genuinely cross-cutting pieces: `booking-date.ts` and `photo-url.ts` are pure
  helpers, and `MoneyView` is already consumed by `shared/money.ts`.

**Target state (#489):** get that vocabulary to a correct address, **splitting
by kind rather than moving the three files wholesale** — the choice above is
#489's to make, and this section deliberately does not pre-decide it. Whatever
it picks must clear `booking/`, `venue-admin/` and above all `shared/` of
feature-directed imports; those account for twenty-eight of the thirty-three.
What survives is the genuine set of five: `operator/` (×3) and `pages/home`
reaching `venue.service`, and `venue/venue-map` reaching
`booking/booking-dialog` — real feature-to-feature coupling, to be argued one at
a time rather than absorbed into a blanket rule.

**Why this is recorded as debt instead of codified as an exception.** Note what
the #95 shape means for issue #488's option 1: "a feature may import another
feature's published surface" is *not* alien to this architecture — it is close
to what the backend actually does. Two things still make it the wrong thing to
write down **today**. First, it cannot absolve `shared/` → `venue/`: `shared` is
this app's kernel-analogue, and a kernel that depends on a feature reintroduces
the cycle the one-way rule exists to prevent — a carve-out its own worst case
escapes leaves the next reader with a false answer, just a different one.
Second, the backend's version of that rule is only safe because
`allowedDependencies` + `ModularityTests` **enforce** it per named surface; the
frontend has no equivalent (no ESLint boundary rule today), so the same sentence
here would be an unenforced honour system that reads as blanket permission.
Fix the placement first (#489), then decide whether a published-surface rule is
worth stating with something to check it. Nothing here is a runtime defect;
every listed import works and is tested.

**Why the table is here rather than in a review transcript.** These edges have
surfaced four times and been actioned zero:

- **O1 (#170)** shipped the first `operator/` → `venue/` edges and review
  **passed** them — O2's plan doc records "O1 shipped and passed review with
  those". Not a deferral; nobody flagged it.
- **O2 (#171)** hit it as risk R-6 and deferred it with reasons, promising a
  ticket: "The `venue/`-as-shared-read-layer cleanup is a separate,
  codebase-wide change — filed as a follow-up rather than smuggled into O2.
  R-6 stands relaxed: no *new* cross-feature edge is added."
  **No follow-up was ever filed.**
- **#226** listed "retiring the pre-existing `operator/` → `venue/` model
  coupling" under out-of-scope: "Out of scope; noted only."
- **#487's** review gate reached O2's verdict again on O2's reasoning — *no
  **new** cross-feature edge is added* — and became #488, this section.

The reasoning is correct every time and converges never, which is the tell: it
needed a durable record and a ticket rather than a fifth sound deferral. **#489
is the follow-up O2 promised.** Note the first bullet is a different animal from
the other three — a silent pass, not a reasoned deferral — and it is the one
this table is really aimed at, since an unflagged edge is how the count grew
without anyone deciding it should.

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
