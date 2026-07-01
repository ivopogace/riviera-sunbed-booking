# FE — Automated AXE + WCAG-AA Contrast Audit in CI Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, routed via `riviera-sdlc`.
> The frontend phase pulls `angular-developer` + the angular-cli MCP. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine a11y guard to the frontend so a11y regressions fail the build,
not just human review: (a) an **axe-core** structural audit running inside the existing
Vitest/jsdom specs over the `VenueMap` beach map and the `Home` page, failing CI on any
critical/serious violation; and (b) a **deterministic WCAG-AA contrast check** over the
beach map's actual design-token colour pairs. Fix any token pair that fails AA.

**Architecture:** This is a **frontend-only, test/CI slice** — no backend, no DB, no API
shape change. The single significant decision: **contrast is verified by a pure-math
unit test over the documented token pairs, not by axe** — axe-core's `color-contrast`
rule cannot run under jsdom (no layout/rendering), so it is disabled in the axe run and
the contrast guarantee is moved to a deterministic `contrastRatio()` spec. axe-core in
jsdom covers the *structural* a11y (roles, names, ARIA validity, list structure); the
contrast spec covers the *visual* a11y the issue calls out. The two together satisfy
AC-8 of U1 (#4), which was implemented-and-unit-asserted but never machine-verified.

**Persistence:** N/A — no JDBC, no migration, no table (frontend-only slice).

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`
(§4.1 visual map) and **GitHub issue #38** (deferred from U1 #4, AC-8). See
`docs/plans/u1-venue-beach-map.md` → AC-8 + Open Questions (the tracked AXE follow-up).

**Skills consulted:** `riviera-sdlc` (routing — `area:frontend`), `to-issues` (confirmed
#38 is the slice; no new issue needed), `riviera-plan-doc` (this doc), **`angular-developer`**
+ **angular-cli MCP** (`get_best_practices`, `list_projects` — confirmed Vitest/jsdom
builder, zoneless Act-Wait-Assert test pattern, v22 a11y rules), `tdd` (red→green per
spec), `riviera-review-overlay` (review gate — RV-FE-* a11y bank + RV-PROC-1).

**Branch:** SDLC convention would be `feature/fe-axe-contrast-audit`; **this environment
mandates `claude/riviera-sdlc-fe-issue-jz3a45`** — develop and push there.

---

## Acceptance criteria (testable)

- [ ] **AC-1 (axe runs + fails on violations):** Given the `VenueMap` rendered in its
  loaded state, when the axe-core audit runs in a Vitest spec, then it reports **zero
  critical/serious violations**; a deliberately broken fixture would fail the spec.
  *Pinned by:* `venue-map.a11y.spec.ts`.
- [ ] **AC-2 (VenueMap covered, all states):** Given `VenueMap` in loaded, loading, and
  error states, when audited, then each is violation-free; set tiles expose accessible
  names and state is not colour-only (re-asserts the U1 names). *Pinned by:*
  `venue-map.a11y.spec.ts`.
- [ ] **AC-3 (app shell covered):** Given the `Home` page rendered, when audited, then it
  is violation-free. *Pinned by:* `home.a11y.spec.ts`.
- [ ] **AC-4 (WCAG-AA contrast of actual tokens):** Given the beach-map design-token
  colour pairs actually used in `venue-map.scss`, when each ratio is computed, then every
  pair meets its applicable AA threshold (4.5:1 normal text; 3:1 only where the text is
  genuinely large per WCAG). Any failing pair is fixed. *Pinned by:*
  `venue-map.contrast.spec.ts`.
- [ ] **AC-5 (runnable + documented):** A documented `npm` way to run the a11y audit
  locally exists, and the audit runs in the CI frontend job (it is part of the Vitest
  suite that `test:coverage` already executes). *Pinned by:* `frontend/README.md` + CI.
- [ ] **AC-6:** Lint, full Vitest suite, and production build are green.

## Non-goals

- No `@axe-core/playwright` / real-browser E2E audit. The issue allows "vitest-axe
  **and/or** playwright"; the Vitest/jsdom + deterministic-contrast combination satisfies
  every AC without standing up a Playwright job. (Recorded as an open option below.)
- No redesign of the beach map. The only visual change is darkening one failing token.
- No new screens, routes, or backend changes.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | axe-core's `color-contrast` rule returns "incomplete" under jsdom and is mistaken for coverage | high | med | Disable `color-contrast` in the axe run with an explicit comment; move the contrast guarantee to the deterministic `contrastRatio` spec (AC-4) | agent | mitigated by design |
| R-2 | axe flags page-level rules (`region`, landmark/heading-order) on an isolated component fragment → false failures | med | med | Scope axe to the component subtree; disable `region` (a component fragment is not a full-page landmark context) with a comment | agent | mitigated |
| R-3 | Hardcoded token table in the contrast spec drifts from `venue-map.scss` | med | med | Spec header documents it mirrors the SCSS; SCSS keeps the `AA contrast` comments next to each pair so a token edit prompts a spec edit; review-gate checks both move together | agent | open (accepted) |
| R-4 | New devDependency unavailable / breaks `npm ci` in CI | low | high | Pin `axe-core` in `package.json` + commit the updated `package-lock.json`; verify `npm ci` clean | agent | open |

## Open questions / Assumptions

- **Assumption:** Vitest/jsdom + a deterministic contrast spec is an acceptable
  realisation of "AXE-based audit … and/or @axe-core/playwright" in #38. The ACs are met
  without a browser; a Playwright audit can be added later if visual-render rules (focus
  ring, real computed contrast) become worth guarding. — *Owner:* Ivo · *Resolves by:* review gate.
- **Resolved:** Contrast finding — `#8a7a52` (`.row-head`, `.row-price`, `.promenade`) on
  the sandy map background is **3.2–3.6:1** as **12px bold** text (not WCAG-"large"), so it
  **fails AA**. Fixed by darkening to **`#6f5f2c`** (5.34:1 on the lightest map stop,
  4.81:1 on the darkest) — same muted-gold hue. The other annotated pairs already pass
  (4.8–13.7:1).

## Availability & concurrency (invariant #2)

N/A — frontend a11y/CI slice. No write path to `availability(set_id, booking_date)`, no
booking, no map *state* change (only a text-colour token darkened).

## Spring-Modulith / events

N/A — no backend module touched.

## Payment & payout

N/A — no money, Stripe, commission, or ledger.

## Plan of work

- **Phase 0 — Dep + helper.** Add `axe-core` devDependency; commit updated lockfile. Add
  `src/testing/axe.ts` (`expectNoAxeViolations(host)`: attach to `document.body`, run axe
  with `color-contrast`/`region` disabled, assert no critical/serious violations, format
  any found) and `src/testing/contrast.ts` (`contrastRatio(hexA, hexB)` per WCAG relative
  luminance).
- **Phase 1 — AXE specs (red→green).** `venue-map.a11y.spec.ts` (loaded/loading/error) and
  `home.a11y.spec.ts`. Reuse the U1 Miramar fixture.
- **Phase 2 — Contrast spec + fix.** `venue-map.contrast.spec.ts` with the documented
  token table asserting AA. Run it → watch `#8a7a52` rows fail → darken the token in
  `venue-map.scss` → green.
- **Phase 3 — Script + docs.** Add `test:a11y` npm script (filtered Vitest run) and a
  short "Accessibility audit" section in `frontend/README.md`. Confirm CI already runs the
  specs via `test:coverage`.
- **Phase 4 — Gate.** `npm run lint && npm run test:coverage && npm run build` green;
  commit; push; run the SDLC review gate (`riviera-review-overlay` + `/code-review`).

## Definition of done

Green CI (lint + Vitest + build) **and** review gate run with findings resolved/deferred
**and** AC-1…AC-6 verified. #38's five acceptance checkboxes each map to an AC above.

### Review note (SDLC review gate)

Review gate run on `origin/main...HEAD` (`riviera-review-overlay` + `/code-review`),
right-sized to the small frontend-test diff. **No Blocker/Major/Minor findings.**
- RV-FE-5 (accessible seat picker): **strengthened** — the map's a11y is now machine-guarded.
- RV-FE-1 (Angular standards): clean — `grep` for `standalone: true` / `OnPush` / `ngClass`
  / `ngStyle` / `@HostBinding` / `any` over the new files returns nothing.
- RV-FE-3 (money/date): untouched — contrast/token change does no money math.
- RV-PROC-1 (skill-routing): satisfied — the only area touched is the Angular frontend;
  *Skills consulted* lists `angular-developer` + angular-cli MCP. No migration/backend/payment.
- Contrast finding (`#8a7a52` → `#6f5f2c`) found and fixed within the slice.
- Decorative-only colours excluded from the contrast table by design: `★` (aria-hidden),
  `·` separators (`#94908a`), and border/background tokens — none are body text.

**Local verification:** `npm run lint` ✓ · `npm run test:coverage` (33 tests, 8 files) ✓ ·
`npm run build` ✓ · `npm run test:a11y` (16 tests) ✓.
