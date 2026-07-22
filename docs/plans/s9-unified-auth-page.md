# S9 — Unified sign-in / register page Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed)
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Replace the five scattered auth surfaces with **one** audience-aware Liquid Glass
page at `account/sign-in` covering four flows (tourist sign-in · tourist register · operator
sign-in · operator register), and land each principal correctly afterwards — tourist → home,
operator → their console, resolved from a new operator-session-scoped owned-venues read.

**Architecture:** The single most significant decision is that this stays a **presentation**
unification: D-2's backend separation is untouched — two principal types, two login endpoints,
login machinery at the edge (RV-BE-11). The page carries an explicit **audience toggle** that
picks the client service (`CustomerAuth` → `/api/auth/customer/login`, `OperatorAuth` →
`/api/auth/operator/login`); there is no single credential endpoint and no new enumeration
surface. The one backend addition — `GET /api/venues/mine` — lands in **`venue/adapter/in`**,
not the platform edge: `venue` already grants `operator::api` + `operator::vocabulary`, so it
can ask `VenueOwnership.ownedVenues` and join names locally. Putting the controller in
`operator` instead would need `operator → venue::api` and cycle against the existing
`venue → operator::api` (the exact cycle `operator.vocabulary.VenueRef` exists to prevent).

**Persistence:** JDBC only (invariant #1). **No migration** — the read joins existing
`operator_venue` (owned by `operator`) and `venue` rows. Next free Flyway number stays **V30**
for whoever needs it first.

**Source of intent:** GitHub issue **#277** (epic **#108**, slice S9); design mock
`docs/design/riviera-sign-in.dc.html` (commit `231f931`); auth decisions
`docs/architecture/auth-signin-register.md` (D-1, D-2, D-5, D-8).

**Skills consulted:**
- `riviera-sdlc` — drove the loop; its issue-intake gate produced the drift table below.
- `riviera-plan-doc` — this document's structure + the behavior-parity ledger.
- `riviera-modulith` — **changed the design**: moved the owned-venues controller out of the
  platform edge and out of `operator` into `venue/adapter/in`, because only `venue` can hold
  both halves without a module cycle; confirmed no new `api`/`spi` surface is needed.
- `riviera-java-conventions` — records for the view types, package-private `@Service` +
  package-private controller, `Optional`/typed outcomes, text-block SQL, no Lombok.
- `riviera-frontend` — **changed the design**: the owned-venues client service must live in
  `core/` (not `operator/`), because `auth/` may not import another feature folder; the route
  guard likewise belongs in `core/`, applied in `app.routes.ts`.
- `riviera-tailwind` — **changed the design**: the audience/mode toggles, outcome cards and
  field styling are extracted as **shared reusable primitives** (component + directives), never
  `@apply`; surface directives carry no `border-radius`; keep old class names as inert test hooks.
- `angular-developer` + **angular-cli MCP** (`get_best_practices`, `search_documentation` on
  Signal Forms models/conditional rules and `CanActivate`) — v22 APIs: `input()`/`output()`/
  `model()`, Signal Forms for the one form, no `@HostBinding`, guard returns a `UrlTree`.
- `playwright-cli` — the mocked-suite e2e shape for the four flows + the multi-venue landing.
- `postgres` — **N/A**, no migration and no new index (the read is a PK-set lookup).

**Branch:** `feature/s9-unified-auth-page` — created off `main` at `e3d885e`.

---

## Issue drift (resolved at the intake grill, 2026-07-22)

The issue's ACs describe the **mock**; the mock and the shipped backend disagree. Recorded here
because the ACs below deliberately deviate from the issue text.

| Issue / mock says | Reality | Plan's resolution |
|---|---|---|
| tourist sign-in → `POST /api/auth/login` | `/api/auth/customer/login` | use the real path |
| tourist register = name + email + password | `{email, password}` only | **ship today's field set** (user decision) |
| operator register = venue name + name + email + password | `{username, password, contactEmail}` | **ship today's field set**; landed copy becomes "Registration submitted for approval" |
| operator signs in with **Email** | operator logs in with **username** (`contactEmail` is informational, non-unique, unverified) | operator tab labels the field **Username** (user decision) |
| "Venue submitted for approval" landed card naming a venue | no venue exists at registration — it is created later, creator-owns-on-create (#115) | pending card names no venue |
| four surfaces to retire | **five** — `venue-admin/venue-editor.ts` has its own inline operator sign-in | all five retired |
| open Q: `GET /api/me/venues` | `/api/me/**` is `hasRole(CUSTOMER)` — an operator gets 403 there | `GET /api/venues/mine`, `hasRole(OPERATOR)` |
| open Q: operator with 0 owned venues | — | lands on `/operator` → forwards to `/venue-admin` (folding creation in is the **follow-up issue**) |
| open Q: keep old routes? | — | **redirect for one release** (user decision) |

`VenueOwnership.ownedVenues` returns `Set<VenueRef>` — **ids only**, so the picker needs names
joined server-side; that is what makes this a fullstack slice rather than a pure FE one.

## Acceptance criteria (testable)

- [ ] **AC-1 (owned-venues read):** Given operator `O` owns venues `{12, 15}` and operator `P`
      owns `{20}`, when the owned-venues read is invoked for `O`, then it returns exactly the
      summaries for `12` and `15` — never `20` — ordered by name. *Pinned by:*
      `VenueAdminServiceTest.ownedByReturnsOnlyTheOperatorsOwnVenues`
- [ ] **AC-2 (BOLA-safe by construction):** Given an authenticated operator session, when
      `GET /api/venues/mine` is called, then the venue set is derived **solely** from the session
      principal (no id in the path or query), and an anonymous call is `401`, a customer session
      `403`. *Pinned by:* `MyVenuesControllerTest.deniesAnonymousAndCustomerSessions` +
      `MyVenuesIT.returnsOnlyOwnVenuesAgainstRealSchema`
- [ ] **AC-3 (audience routing):** Given the page in sign-in mode, when the audience is *Tourist*
      and the form is submitted, then `CustomerAuth.signIn` is called and `OperatorAuth` is not;
      when the audience is *Venue operator*, the reverse. *Pinned by:*
      `auth-page.spec.ts › routes sign-in by audience`
- [ ] **AC-4 (generic, non-enumerating failures):** Given a failed sign-in on either audience,
      when the response is `401` or `429`, then the card shows the existing generic message for
      that principal type (`customerSignInMessage` / `signInFailureMessage`) and never reveals
      whether the account exists. *Pinned by:* `auth-page.spec.ts › shows only generic failures`
- [ ] **AC-5 (tourist register):** Given audience *Tourist* in register mode with a valid email
      and an 8+ character password, when submitted, then `CustomerAuth.register` runs and a
      `registered` outcome navigates to `/`; an `exists` outcome shows the existing
      `customerRegisterMessage` and stays put. *Pinned by:* `auth-page.spec.ts › tourist register`
- [ ] **AC-6 (operator register):** Given audience *Venue operator* in register mode, when
      submitted, then `OperatorAuth.register` runs, **no session is established**, and the card
      switches to the pending-approval outcome state (PENDING, S6 #115) — identical for a fresh
      and an already-taken username. *Pinned by:* `auth-page.spec.ts › operator register lands pending`
- [ ] **AC-7 (post-sign-in landing):** Given a signed-in operator, when landing is resolved, then
      exactly one owned venue navigates to `/operator/:id`, more than one renders the picker, and
      zero forwards to venue onboarding; a present `returnUrl` **wins over all three**. *Pinned by:*
      `auth-landing.spec.ts › landingRouteFor` (all four cases)
- [ ] **AC-8 (console redirects, no bounce while restoring):** Given an unauthenticated visit to
      `/operator/:venueId`, when the operator-session guard runs, then it returns a `UrlTree` to
      `/account/sign-in?audience=operator&returnUrl=…`; and given a session restore still in
      flight, the guard **awaits** it and does not redirect a signed-in operator on reload.
      *Pinned by:* `operator-session.guard.spec.ts › awaits restore before deciding`
- [ ] **AC-9 (role separation preserved):** Given a customer session, when `/operator/:venueId` is
      opened, then the guard redirects to the operator audience (a tourist session grants no
      operator surface); and given an operator session, `GET /api/me/bookings` stays `403`.
      *Pinned by:* `operator-session.guard.spec.ts` + existing `AuthSessionIT` (unchanged, re-run)
- [ ] **AC-10 (a11y):** Given the card, when axe runs in both modes and both audiences, then there
      are no serious violations; the audience toggle exposes `role="radiogroup"` with roving
      tabindex and arrow-key movement, errors are `role="alert"`, and focus moves to the first
      field on load **and** on every audience/mode switch. *Pinned by:* `auth-page.a11y.spec.ts` +
      `segmented-control.spec.ts › keyboard semantics`
- [ ] **AC-11 (glass contrast):** Given the card's translucent surface over the theme's worst-case
      gradient stops, when composited, then every ink pair is ≥ AA. *Pinned by:*
      `auth-page.contrast.spec.ts`
- [ ] **AC-12 (e2e, mocked suite):** Given the mocked backend, when each of the four flows runs
      end-to-end plus the multi-venue operator landing, then each reaches its landed state.
      *Pinned by:* `frontend/e2e/unified-auth.e2e.ts`
- [ ] **AC-13 (guest checkout untouched):** Given a guest with no account, when the booking flow
      runs, then it is byte-for-byte the pre-slice behavior. *Pinned by:* existing
      `booking-flow.e2e.ts` + `request-to-book.e2e.ts`, unchanged and green
- [ ] **AC-14 (structure):** `ModularityTests`, `PackageShapeArchitectureTests`,
      `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` and
      `ErrorContractArchitectureTests` all pass. *Pinned by:* those classes

## Non-goals

- **Merging the two login endpoints / a single credential store** — explicitly rejected; preserves
  D-2 and avoids an enumeration surface.
- **Operator SSO** (→ **#276**). This slice ships SSO **tourist-only**; the operator tab is laid
  out so #276 lights up its buttons with no rework.
- **Operator self-service password reset** — customer-only today; "Forgot password?" stays
  tourist-only.
- **Folding venue creation into the console / deleting `/venue-admin`** — split out to **#278**
  (filed 2026-07-22, blocked by this slice). This slice only removes that page's *sign-in card* and
  forwards the 0-venue case to it.
- **Restyling the create-venue form** to Liquid Glass — same follow-up (#278).
- Adding display names, venue-name-at-registration, or any `customer_account`/`operator` column.
- Any change to guest checkout, the booking-code flow, or `/admin` (the platform-admin surface).

## Behavior-parity ledger

> Five surfaces are retired. Every behavior below is enumerated from the current code, not assumed.

**`auth/sign-in.ts` (customer sign-in)**

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| email + password, client gate on non-empty → "Enter your email and password." | preserved | same gate in `AuthPage.onSubmit`, tourist branch |
| generic failure copy via `customerSignInMessage` (401/429/other) | preserved | same function, unchanged |
| success → `router.navigate(['/'])` | preserved | tourist landing = `/` (or `returnUrl`) |
| SSO buttons (Google/Apple) | preserved | `<app-sso-buttons>` with the new `audience` input = `tourist` |
| link → `/account/forgot` | preserved | rendered on the tourist audience only |
| link → `/account/register` | changed | becomes the in-card **mode toggle** ("New here? Create an account") |
| first-input autofocus on load | preserved | `afterNextRender` focus, **plus** re-focus on toggle switch (AC-10) |
| `role="alert"` error paragraph | preserved | one alert region, shared by all four flows |
| submit disabled + "Signing in…" while in flight | preserved | `submitting()` signal, label per mode |

**`auth/register.ts` (customer register)**

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| email + password, non-empty gate | preserved | register mode, tourist audience |
| client min-length gate → `PASSWORD_LENGTH_MESSAGE` | preserved | same constant, same message |
| `registered` → navigate `/`; `exists` → message, stay | preserved | same `CustomerRegisterResult` switch |
| `wasSignedIn` guard so a taken email doesn't read as a new account (review F3) | preserved | untouched — it lives in `CustomerAuth.register` |
| register-while-signed-in edge (#252) | changed | the page now **observes** an existing session and shows the landed state instead of a blank form; #252 stays open for the backend edge |
| autofocus, `role="alert"`, submitting label | preserved | as above |

**`operator/operator-register.ts` (operator self-registration)**

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| username + contact email + password, non-empty gate | preserved | operator audience, register mode |
| min-length gate → `OPERATOR_PASSWORD_LENGTH_MESSAGE` | preserved | same constant |
| `submitted` → pending-approval notice, **no navigation, no session** | preserved | `OutcomeCard` in `pending` tone |
| pending copy explains admin review | preserved | wording kept; **venue name removed** (never existed) |
| link → operator sign-in (`/venue-admin`) | changed | "Back to sign-in" returns to the card's sign-in mode |
| porcelain theme host attribute | changed | the unified page is the tourist glass theme for both audiences (one card, per the mock); the console stays porcelain |
| autofocus, `role="alert"`, submitting label | preserved | as above |

**`operator/operator-console.*` (inline sign-in card)**

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| `restoring()` → "Checking your session…" before deciding | **preserved — critical** | the guard awaits `whenReady()`; without this a signed-in operator is bounced on every reload |
| signed-out → inline sign-in form | changed | guard redirects to `/account/sign-in?audience=operator&returnUrl=…` |
| `runOperatorSignIn` (no-op while blank/in-flight, clears password, generic message) | preserved | the same rules now live in `AuthPage`; the helper itself is deleted (single remaining caller) |
| "New operator? Register" link | changed | the unified card's mode toggle |
| invalid `:venueId` → "Venue not found" state | preserved | untouched |
| post-sign-in `effect` loading venue name + requests badge | preserved | untouched — it keys off `signedIn()`, which the redirect return satisfies |
| sign-out clears password/venue/badge state | preserved | untouched (`onSignOut`) |

**`venue-admin/venue-editor.ts` (inline sign-in card)**

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| "Checking your session…" restoring state | preserved | same guard |
| inline username/password sign-in + generic error | changed | guard redirect |
| sign-out button | preserved | kept on the page |
| create-venue Signal Form + its validation/errors | preserved | untouched this slice (restyle is the follow-up) |
| reachable from the console header | preserved | link unchanged |

**Retired e2e coverage** — `customer-auth.e2e.ts`, `operator-registration.e2e.ts`,
`operator-sign-in.e2e.ts`, `sso-sign-in.e2e.ts` and their page objects target the old DOM. Verdict:
**rewritten, not deleted** — each flow's assertions move into `unified-auth.e2e.ts` (or the page
object is repointed), so no flow silently loses coverage.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Guard bounces a signed-in operator to sign-in because the `/me` restore hasn't settled | high | high | guard awaits `SessionAuth.whenReady()` (promoted from `CustomerAuth` to the base) before deciding; AC-8 pins it | Ivo | open |
| R-2 | `GET /api/venues/mine` is shadowed by `GET /api/venues/{id}` and 400s on `"mine"` | med | med | literal segments outrank path variables in Spring's pattern comparator; `MyVenuesControllerTest` asserts the literal route resolves | Ivo | open |
| R-3 | The new `GET /api/venues/mine` falls through to the public `GET /api/venues/**` `permitAll` rule | med | **high** (leaks ownership) | its `hasRole(OPERATOR)` matcher is placed **above** the public rule, matching the payout-ledger / profile / takings precedent; AC-2 pins anonymous → 401 | Ivo | open |
| R-4 | A new controller breaks `@WebMvcTest` slices (missing bean) or `@ApplicationModuleTest` | high | med | recurring in this repo — add the stub to `WebSliceStubs`; run the module tests in the same phase, not at CI | Ivo | open |
| R-5 | Retiring four surfaces silently drops a behavior (the O6 #176 failure mode) | med | high | the behavior-parity ledger above is enumerated from code; each `preserved` row names its new home | Ivo | open |
| R-6 | Audience toggle leaks credentials across principal types (a tourist password posted to the operator endpoint) | low | **high** | the toggle picks the *service*, never a shared endpoint; separate submit paths, no shared credential state; password field cleared on audience switch | Ivo | open |
| R-7 | Focus/ARIA regression on the toggles (radiogroup semantics, roving tabindex) | med | med | `SegmentedControl` is a shared primitive with its own keyboard spec; axe in both modes × both audiences | Ivo | open |
| R-8 | Glass card contrast drifts from the AA-proven token set | low | med | reuse `CardGlass` + `--riv-*` tokens only, no palette literals; `auth-page.contrast.spec.ts` composites the maths | Ivo | open |
| R-9 | The mode/audience state and `returnUrl` desync across a full-page SSO redirect | med | med | audience + mode + `returnUrl` live in query params, so the SSO return re-enters with the same state | Ivo | open |
| R-10 | Flyway collision | **none** | — | no migration in this slice; V30 stays free | Ivo | closed |

## Open questions / Assumptions

- **Assumption:** `GET /api/venues/mine` returns `{id, name, beach}` — enough for a picker row —
  and no availability/pricing data. *Owner:* Ivo · *Resolves by:* Phase 0.
- **Assumption:** the operator audience shows no SSO buttons at all (rather than disabled ones)
  until #276; the layout slot is reserved so #276 is additive. *Owner:* Ivo · *Resolves by:* Phase 3.
- **Open question:** does the tourist landing honor `returnUrl` too (e.g. a deep-linked
  `my-bookings` hit while signed out)? Assumed **yes**, same helper for both audiences.
  *Owner:* Ivo · *Resolves by:* Phase 2.

### Resolved

- **Register field set** → ship today's fields; no Name / Venue-name, no migration (user decision,
  2026-07-22).
- **Operator credential label** → "Username" on the operator tab; "Email" on the tourist tab (user
  decision, 2026-07-22).
- **Scope split** → creation-into-console + `/venue-admin` deletion is **#278** (filed 2026-07-22);
  #277 ships auth unification + the owned-venues read + the `/operator` home (user decision,
  2026-07-22).
- **Old routes** → redirect for one release with audience/mode preselected (user decision,
  2026-07-22).
- **Endpoint path** → `GET /api/venues/mine`, not `/api/me/venues` (which is CUSTOMER-gated) and
  not `/api/auth/me` (stays identity-only) — settled at the intake grill against `SecurityConfig`.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice adds no write path of any kind: the one new
endpoint is a read over `operator_venue` + `venue`, and no code touches
`availability(set_id, booking_date)`, the booking lifecycle, the pool flag (#3) or the cutoff (#4).
Guest checkout is untouched (AC-13 re-runs the existing booking e2e as the proof).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | it owns venue identity/names **and** already grants `operator::api`, so it can answer "which venues does this operator own, and what are they called" without a new grant or a cycle |
| M-2 | `operator` | existing, **unchanged** | `Operator` | already publishes `VenueOwnership.ownedVenues`; consumed as-is, no new method |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `VenueOwnership#ownedVenues(OperatorId)` — **existing, unchanged** | `VenueRef`, `OperatorId` | `venue` (already granted) |

**No new published surface.** The new read is an *internal* driving port in
`venue/application/` (`ListOwnedVenues`), following the module's existing role-split shape
(`OnboardVenue`, `EditBeachMap`, `EditVenueProfile`, `ViewVenueProfile`), implemented by the
package-private `VenueAdminService`. Nothing is added to `venue.api`, so `VenueApiRoleSplitTests`
stays green.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published or consumed.` This slice announces no state change.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| "list the venues this operator owns, with names" | `venue` | `venue` Job: owns venue profiles and their names; it already consults `operator::api` for ownership on every venue-scoped edit. Not `operator` — its Job is the ownership *mapping* and answering the authorization question, **not** assembling venue read models (and `operator → venue` would cycle). |
| "resolve the authenticated principal to an `OperatorId`" | platform edge (`CurrentOperator`) | existing edge glue; reading the Spring Security context is not `operator` domain (RV-BE-11) |
| "decide where a signed-in principal lands" | frontend (`core/` + `shared/`) | pure client-side routing; no backend opinion, no new endpoint |
| "authenticate either principal type" | platform edge (`AuthController`) | unchanged — login machinery stays at the edge (D-2 / RV-BE-11) |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, written, refunded, or displayed; the payout ledger
and Stripe surfaces are untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/auth-page.ts` | new | standalone component (the unified card) | signals + `computed` for mode/audience | Signal Forms (`form()` + `[formField]`) |
| FE-2 | `shared/segmented-control.ts` | **new, reusable** | standalone component, `variant: 'pill' \| 'card'` | `model()` two-way value, roving tabindex | — |
| FE-3 | `shared/outcome-card.ts` | **new, reusable** | standalone component, `tone: 'success' \| 'pending'` + `ng-content` CTA slot | inputs only, stateless | — |
| FE-4 | `shared/field-glass.ts` | **new, reusable** | attribute directive `[appFieldGlass]` (host `class` string, no radius — `riviera-tailwind` rule 3) | none | pairs with `[formField]` |
| FE-5 | `auth/sso-buttons.ts` | existing, extended | standalone component | new `audience` input; renders nothing for `operator` until #276 | — |
| FE-6 | `core/owned-venues.ts` | new | `@Service()` singleton | signal-cached list, `HttpClient` | — |
| FE-7 | `core/operator-session.guard.ts` | new | functional `CanActivate` guard | awaits `whenReady()`, returns `UrlTree` | — |
| FE-8 | `shared/auth-landing.ts` | new | pure function `landingRouteFor(...)` | none — pure, unit-tested in isolation | — |
| FE-9 | `operator/operator-home.ts` | new | standalone component at `/operator` | `OwnedVenues` → 0 / 1 / N states | — |
| FE-10 | `core/session-auth.ts` | existing, extended | abstract base | `whenReady()` promoted from `CustomerAuth` so both principals expose it | — |
| FE-11 | `operator/operator-console.*`, `venue-admin/venue-editor.*` | existing, reduced | — | inline sign-in removed; guard owns the gate | — |
| FE-12 | `auth/sign-in.ts`, `auth/register.ts`, `operator/operator-register.ts` | **deleted** | — | replaced by FE-1; routes become redirects | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()`
signal APIs, no `@HostBinding`/`@HostListener` (host object instead), no `ngClass`/`ngStyle`.
Tailwind v4 only on new surfaces — **no `@apply`**, sharing happens at the component/directive
layer (`riviera-tailwind` rule 1). `auth/auth.scss` stays for the four recovery pages this slice
does not retire; the new page uses no SCSS.

## FE↔BE contract

- **New endpoint:** `GET /api/venues/mine` → `200 [{ "id": 12, "name": "Miramar Beach Club",
  "beach": "Dhërmi" }]`, `hasRole(OPERATOR)`; anonymous → `401 UNAUTHENTICATED`, customer session
  → `403`. Empty ownership → `200 []`, never `404`.
- **Client typing:** hand-written typed service `core/owned-venues.ts` with an exported
  `OwnedVenue` interface; no `as any`.
- **Money/date on the wire:** none in this contract.
- **Unchanged:** `/api/auth/customer/login`, `/api/auth/operator/login`,
  `/api/auth/customer/register`, `/api/auth/operator/register`, `/api/auth/me`, `/api/auth/logout`,
  `/api/auth/sso/**` — all consumed exactly as today.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session,
> or whenever unsure where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window as the change
> it records — at every phase boundary AND every SDLC stage transition.

**Stage pointer:** `plan — complete; ready to implement (Phase 0 not started)`

**Next action:** Start **Phase 0** (owned-venues read, backend). Load `riviera-local-debug` before
the session's first `./gradlew`. The plan's two GitHub writes are **done**: #277's acceptance
criteria were patched to the corrected reality, and the creation-into-console follow-up is filed as
**#278** (both 2026-07-22).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Owned-venues read (backend) | | |
| 1 — Shared Tailwind primitives | | |
| 2 — Session/landing plumbing (`core/`) | | |
| 3 — The unified auth page + route redirects | | |
| 4 — Operator surfaces behind the guard + `/operator` home | | |
| 5 — e2e, a11y/contrast, substrate docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what
the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`)**

- `venue/application/ListOwnedVenues.java` — new public driving port: `List<OwnedVenueView> ownedBy(OperatorId)`
- `venue/application/OwnedVenueView.java` — new record `(long id, String name, String beach)`
- `venue/application/VenueAdminService.java` — implements `ListOwnedVenues`; asks `VenueOwnership.ownedVenues`, then `Venues.findSummaries`
- `venue/application/Venues.java` — new method `List<OwnedVenueView> findSummaries(Collection<VenueId> ids)`
- `venue/adapter/out/JdbcVenues.java` — text-block SQL, `WHERE id IN (:ids) ORDER BY name`
- `venue/adapter/in/MyVenuesController.java` — package-private `@RestController`, `GET /api/venues/mine`
- `SecurityConfig.java` — `MY_VENUES_PATH` matcher, `hasRole(OPERATOR)`, **above** the public `GET /api/venues/**`

**Backend tests** — `VenueAdminServiceTest` (extend), `MyVenuesControllerTest` (new),
`MyVenuesIT` (new, Testcontainers), `WebSliceStubs` (add the bean — R-4)

**Frontend (`frontend/src/app/`)**

- `shared/segmented-control.ts` + `.spec.ts` — reusable toggle (pill + card variants)
- `shared/outcome-card.ts` + `.spec.ts` — reusable landed/pending card
- `shared/field-glass.ts` + `.spec.ts` — reusable input-surface directive
- `shared/auth-landing.ts` + `.spec.ts` — pure `landingRouteFor`
- `core/owned-venues.ts` + `.spec.ts` — typed read client
- `core/operator-session.guard.ts` + `.spec.ts` — restore-aware redirect guard
- `core/session-auth.ts` — promote `whenReady()`
- `auth/auth-page.ts` + `.spec.ts` + `.a11y.spec.ts` + `.contrast.spec.ts` — the unified card
- `auth/sso-buttons.ts` — `audience` input
- `operator/operator-home.ts` + `.spec.ts` + `.a11y.spec.ts` — `/operator` (0 / 1 / N)
- `app.routes.ts` — `/operator` route, guards, three redirect rows
- **Deleted:** `auth/sign-in.ts`, `auth/register.ts`, `operator/operator-register.ts` (+ their
  `.spec.ts` / `.a11y.spec.ts`), `runOperatorSignIn` + its specs, the console and venue-editor
  sign-in blocks

**e2e (`frontend/e2e/`)** — `unified-auth.e2e.ts` (new); `support/pages/customer-auth.page.ts` +
`support/pages/operator-sign-in.page.ts` repointed; `customer-auth.e2e.ts`,
`operator-registration.e2e.ts`, `operator-sign-in.e2e.ts`, `sso-sign-in.e2e.ts` rewritten onto the
new DOM

---

## Phase 0 — Owned-venues read (backend)

**Files:** Create `venue/application/ListOwnedVenues.java`, `venue/application/OwnedVenueView.java`,
`venue/adapter/in/MyVenuesController.java` · Modify `venue/application/VenueAdminService.java`,
`venue/application/Venues.java`, `venue/adapter/out/JdbcVenues.java`, `SecurityConfig.java`,
`WebSliceStubs.java` · Test `VenueAdminServiceTest`, `MyVenuesControllerTest`, `MyVenuesIT`

- [ ] **Step 1: Write the failing test**

```java
@Test
void ownedByReturnsOnlyTheOperatorsOwnVenues() {
	OperatorId operator = new OperatorId(7);
	when(ownership.ownedVenues(operator)).thenReturn(Set.of(new VenueRef(12), new VenueRef(15)));
	when(venues.findSummaries(Set.of(new VenueId(12), new VenueId(15))))
			.thenReturn(List.of(new OwnedVenueView(12, "Miramar Beach Club", "Dhërmi"),
					new OwnedVenueView(15, "Sereno", "Jal")));

	List<OwnedVenueView> owned = service.ownedBy(operator);

	assertEquals(List.of(12L, 15L), owned.stream().map(OwnedVenueView::id).toList());
	verify(venues, never()).findSummaries(argThat(ids -> ids.contains(new VenueId(20))));
}

@Test
void ownedByReturnsEmptyWithoutHittingTheRepositoryWhenNothingIsOwned() {
	OperatorId operator = new OperatorId(9);
	when(ownership.ownedVenues(operator)).thenReturn(Set.of());

	assertEquals(List.of(), service.ownedBy(operator));
	verifyNoInteractions(venues);
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueAdminServiceTest*"` →
      FAIL: `cannot find symbol: method ownedBy(OperatorId)`

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation**

```java
public interface ListOwnedVenues {

	/**
	 * The venues {@code operator} owns, as picker summaries, ordered by name. Ownership is the
	 * explicit {@code operator_venue} mapping (invariant #13; the owns-all bootstrap is retired,
	 * #115), so this is session-scoped by construction — there is no id to tamper with. An
	 * operator that owns nothing gets an empty list, never {@code null}.
	 */
	List<OwnedVenueView> ownedBy(OperatorId operator);
}
```

```java
// VenueAdminService — implements ListOwnedVenues alongside the existing role-split ports.
@Override
public List<OwnedVenueView> ownedBy(OperatorId operator) {
	Set<VenueId> ids = ownership.ownedVenues(operator).stream()
			.map(ref -> new VenueId(ref.value()))
			.collect(Collectors.toSet());
	return ids.isEmpty() ? List.of() : venues.findSummaries(ids);
}
```

```java
// JdbcVenues
private static final String FIND_SUMMARIES = """
		SELECT id, name, beach
		  FROM venue
		 WHERE id IN (:ids)
		 ORDER BY name
		""";

@Override
public List<OwnedVenueView> findSummaries(Collection<VenueId> ids) {
	return jdbc.sql(FIND_SUMMARIES)
			.param("ids", ids.stream().map(VenueId::value).toList())
			.query(OwnedVenueView.class)
			.list();
}
```

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueAdminServiceTest*"` → PASS
- [ ] **Step 5: Add the controller + its slice test** (`MyVenuesControllerTest`): the literal route
      resolves (R-2), anonymous → 401, customer session → 403, operator session → own venues only.
      Register the stub in `WebSliceStubs` (R-4).
- [ ] **Step 6: Add the `SecurityConfig` matcher above the public `GET /api/venues/**`** (R-3) and
      `MyVenuesIT` against the real schema.
- [ ] **Step 7: Run the structural net** — `./gradlew test --tests "*ModularityTests*" --tests
      "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests
      "*VenueApiRoleSplitTests*"` → PASS
- [ ] **Step 8: Generalization-audit pass** — search for other reads that derive a venue set from
      the session rather than a path id; record the decision below.
- [ ] **Step 9: Commit** — `git commit -m "Add operator-session-scoped owned-venues read (#277)"`
- [ ] **Step 10: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Shared Tailwind primitives

**Files:** Create `shared/segmented-control.ts`, `shared/outcome-card.ts`, `shared/field-glass.ts`
(+ specs)

Built **before** the page so the page composes them rather than growing its own markup — and so
each primitive is unit-testable on its own (`riviera-tailwind` rule 1: share at the component /
directive layer, never `@apply`).

- [ ] **Step 1: Write the failing keyboard/ARIA spec** for `SegmentedControl`

```ts
it('exposes radiogroup semantics and moves selection with arrow keys', async () => {
  const fixture = TestBed.createComponent(SegmentedControlHost);
  await fixture.whenStable();
  const group = fixture.nativeElement.querySelector('[role="radiogroup"]');
  const options = [...group.querySelectorAll('[role="radio"]')] as HTMLElement[];

  expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  expect(options.map((o) => o.tabIndex)).toEqual([0, -1]); // roving tabindex

  options[0].focus();
  options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await fixture.whenStable();

  expect(options[1].getAttribute('aria-checked')).toBe('true');
  expect(document.activeElement).toBe(options[1]);
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- segmented-control` → FAIL (no component)
- [ ] **Step 3: Minimal implementation** — `model<T>()` for the two-way value (per the angular-cli
      MCP's Signal-Forms model guidance), `input()` for options + variant, host object for
      `role="radiogroup"`, arrow/Home/End handling, `variant` switching pill vs card markup. Host
      `class` strings hold the Tailwind utilities; **no `border-radius` in a shared surface
      directive** (rule 3) — each consumer sets its own.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- segmented-control` → PASS
- [ ] **Step 5: Repeat red→green for `OutcomeCard`** (tone + projected CTA) and `FieldGlass`
      (directive host class only; a spec asserting the class string is applied and that consumers
      may override radius).
- [ ] **Step 6: Commit** — `git commit -m "Add reusable segmented control, outcome card and field surface (#277)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Session/landing plumbing (`core/`)

**Files:** Modify `core/session-auth.ts` · Create `core/owned-venues.ts`,
`core/operator-session.guard.ts`, `shared/auth-landing.ts` (+ specs)

- [ ] **Step 1: Write the failing landing spec**

```ts
describe('landingRouteFor', () => {
  it('honors returnUrl above every venue-count rule', () => {
    expect(landingRouteFor([{ id: 12, name: 'A', beach: 'X' }], '/operator/15/payouts'))
      .toEqual('/operator/15/payouts');
  });

  it('sends a single-venue operator straight into that console', () => {
    expect(landingRouteFor([{ id: 12, name: 'A', beach: 'X' }], undefined)).toEqual('/operator/12');
  });

  it('sends a multi-venue operator to the picker', () => {
    expect(landingRouteFor([{ id: 12, ... }, { id: 15, ... }], undefined)).toEqual('/operator');
  });

  it('sends an operator with no venue to onboarding', () => {
    expect(landingRouteFor([], undefined)).toEqual('/venue-admin');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- auth-landing` → FAIL
- [ ] **Step 3: Minimal implementation** — the pure function, plus `OwnedVenues` (`@Service()`,
      typed `OwnedVenue`), plus `whenReady()` promoted onto `SessionAuth` so `OperatorAuth` has it.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- auth-landing owned-venues` → PASS
- [ ] **Step 5: Red→green the guard** — `operator-session.guard.spec.ts` proves it **awaits**
      `whenReady()` before deciding (R-1, AC-8), returns a `UrlTree` carrying
      `audience=operator&returnUrl=…`, and lets a signed-in operator through untouched.
- [ ] **Step 6: Generalization-audit pass** — does any other surface make a redirect decision
      before the restore settles? Record the search below.
- [ ] **Step 7: Commit** — `git commit -m "Add owned-venues client, landing resolver and restore-aware operator guard (#277)"`
- [ ] **Step 8: Update plan-doc execution status.**

---

## Phase 3 — The unified auth page + route redirects

**Files:** Create `auth/auth-page.ts` (+ 3 specs) · Modify `auth/sso-buttons.ts`, `app.routes.ts` ·
Delete `auth/sign-in.ts`, `auth/register.ts`, `operator/operator-register.ts` (+ their specs)

- [ ] **Step 1: Write the failing audience-routing spec** (AC-3) — assert `CustomerAuth.signIn` is
      called and `OperatorAuth.signIn` is not, then flip the toggle and assert the reverse; assert
      the password field is cleared on audience switch (R-6).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- auth-page` → FAIL
- [ ] **Step 3: Minimal implementation** — one `CardGlass` card composing `SegmentedControl`
      (audience, pill variant / role picker, card variant), Signal Forms `form()` over
      `{ identifier, email, password, contactEmail }` with the audience-conditional field set, one
      `role="alert"` region, `OutcomeCard` for the three landed states, focus moved to the first
      field on load and on every switch (AC-10).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- auth-page` → PASS
- [ ] **Step 5: Red→green the remaining flows** — tourist register (AC-5), operator register
      pending (AC-6), generic failures (AC-4), already-signed-in observation (#252 row).
- [ ] **Step 6: Routes** — `account/sign-in` → `AuthPage`; redirect rows for `account/register` and
      `operator/register` with audience/mode preselected; delete the three components and their specs.
- [ ] **Step 7: a11y + contrast specs** (AC-10, AC-11).
- [ ] **Step 8: Commit** — `git commit -m "Replace the four auth surfaces with one audience-aware page (#277)"`
- [ ] **Step 9: Update plan-doc execution status.**

---

## Phase 4 — Operator surfaces behind the guard + `/operator` home

**Files:** Create `operator/operator-home.ts` (+ specs) · Modify `app.routes.ts`,
`operator/operator-console.ts`/`.html`, `venue-admin/venue-editor.ts`/`.html`,
`core/operator-auth.ts` (delete `runOperatorSignIn`)

- [ ] **Step 1: Write the failing `/operator` home spec** — 0 venues redirects to `/venue-admin`,
      1 redirects to `/operator/:id`, N renders a picker list with names (AC-7).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- operator-home` → FAIL
- [ ] **Step 3: Minimal implementation** — `OperatorHome` consuming `OwnedVenues` + `landingRouteFor`.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- operator-home` → PASS
- [ ] **Step 5: Strip the two inline sign-in cards**, apply the guard to `/operator`,
      `/operator/:venueId` and `/venue-admin`, and delete `runOperatorSignIn` + its specs. Walk the
      behavior-parity ledger row by row and confirm each `preserved` row still holds — especially
      the `restoring()` state and the console's post-sign-in `effect` (R-5).
- [ ] **Step 6: Run the operator suite** — `npm test -- operator venue-editor` → PASS
- [ ] **Step 7: Commit** — `git commit -m "Route operators through the unified page and add the /operator home (#277)"`
- [ ] **Step 8: Update plan-doc execution status.**

---

## Phase 5 — e2e, a11y/contrast, substrate docs

**Files:** Create `frontend/e2e/unified-auth.e2e.ts` · Modify the four old e2e specs + both page
objects · Modify `CLAUDE.md`, `RESPONSIBILITIES.md` (if the read changes a stated fact)

- [ ] **Step 1: Author the mocked-suite spec** — four flows + the multi-venue landing, mocking
      `/api/auth/*` and `/api/venues/mine` via `page.route`; axe through
      `expectNoSeriousAxeViolations`, awaiting `getAnimations().finished` first (the card animates).
- [ ] **Step 2: Run it** — `npm run test:e2e:a11y` → PASS (the mocked suite CI runs; **not**
      `test:e2e`, which is the real-backend one)
- [ ] **Step 3: Repoint the retired specs** so no flow loses coverage (parity ledger).
- [ ] **Step 4: Full local gate** — `npm run lint`, `npm test`, `npm run build`, then the backend
      module tests.
- [ ] **Step 5: Substrate freshness** — load `riviera-docs-freshness`; update `CLAUDE.md`'s epic
      #108 paragraph and `RESPONSIBILITIES.md` if the owned-venues read changes a stated fact.
- [ ] **Step 6: Commit + open the PR**, then run the Review gate → Sonar gate → merge close-out
      (`riviera-sdlc/references/pr-gates.md`).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*VenueAdminServiceTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-2:** `./gradlew test --tests "*MyVenuesControllerTest*" --tests "*MyVenuesIT*"` → PASS.
- [ ] **AC-3 … AC-6:** `npm test -- auth-page` → PASS.
- [ ] **AC-7:** `npm test -- auth-landing operator-home` → PASS.
- [ ] **AC-8, AC-9:** `npm test -- operator-session.guard` + `./gradlew test --tests "*AuthSessionIT*"` → PASS.
- [ ] **AC-10, AC-11:** `npm run test:a11y` + `npm test -- auth-page.contrast` → PASS.
- [ ] **AC-12:** `npm run test:e2e:a11y` → PASS.
- [ ] **AC-13:** the booking e2e specs pass **unmodified**.
- [ ] **AC-14:** the structural net passes.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified `N/A` — no write path added (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new
      published surface; `operator` unchanged (invariant #11).
- [ ] **Payment/payout** `N/A` and genuinely untouched (invariants #5, #8, #9).
- [ ] Per-venue authorization intact: the new read is session-scoped with no id to tamper with,
      and every existing `assertOwns` path is unchanged (invariant #13).
- [ ] No Flyway migration added; V30 still free (invariant #12).
- [ ] **Frontend** standards met; reusable primitives extracted rather than duplicated markup; no
      `@apply`; no `as any` on the contract.
- [ ] Behavior-parity ledger walked row by row against the final diff.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
