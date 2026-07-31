# Checkout Legal Links (Privacy + Terms) Implementation Plan — #101 Slice 3

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest committing to a booking (Review step, both modes; the Instant pay
action) sees and can open the platform's Privacy Policy and Terms of Service, hosted as
in-app pages; the footer carries the standing links.

**Architecture:** Two new static legal pages under `pages/legal/` (the `riviera-frontend`
home for domain-logic-free routes), lazily routed at `/legal/privacy` and `/legal/terms`.
The checkout surfaces add an agreement line adjacent to the commit action (no checkbox —
the standard adjacent-notice pattern for Art 6(1)(b) contract terms), opening the pages in
a new tab so modal/payment state is never lost. **The document texts ship as clearly
marked DRAFTS with bracketed entity placeholders** — the final texts are #101's
counsel-gated remainder; swapping them in is a copy-only follow-up on the same issue.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no tables or migrations.

**Source of intent:** GitHub issue #101 ("Privacy policy + terms surfaced at checkout
(FE links + hosted documents)"), Slice 3 per the Slice-2 close-out comment; parent epic #93 (D5).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the issue's "naming the sh.p.k. controller + Paysera/Hetzner processors" AC is
unsatisfiable today: entities pending, current processors are Stripe/Render/Neon → drafts
with placeholders, drift recorded below) · `riviera-plan-doc` (this template — forced the
draft-vs-real risk row and the parity N/A check) · `tdd` (component specs written first,
red→green per phase) · `riviera-review-overlay` (review gate — after ready-for-review) ·
`riviera-docs-freshness` (N/A — no substrate doc states anything this slice changes; the
#101 issue comment is the close-out record) · `riviera-frontend` (placement: `pages/legal/`,
flat lazy routes in `app.routes.ts`, e2e-suite split) · `riviera-tailwind` (loaded at
implement, before styling the new pages — Tailwind v4 go-forward, no new SCSS) ·
`angular-developer` (loaded at implement — v22 idioms) · angular-cli MCP (driven over
stdio — its tools aren't in the session registry, so `get_best_practices` +
`search_documentation` were called via a scratchpad MCP client; confirmed per-route
`title` + standalone/inline idioms) · `playwright-cli` (loaded at the
e2e phase — mocked CI-safe spec authoring) · `riviera-local-debug` (loaded before the
session's first `npm` — scoped Vitest runs, CI owns the full suite).

**Branch:** `claude/epic-93-remaining-review-r6a7c4` — the session's designated remote
branch stands in for `feature/checkout-legal-links` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the guest-checkout dialog on the Review step (either INSTANT or
  REQUEST mode), when the step renders, then an agreement notice is visible naming the
  Terms of Service and Privacy Policy as links to `/legal/terms` and `/legal/privacy`
  that open in a new tab (`target="_blank"` + `rel="noopener"`), adjacent to the primary
  action. *Pinned by:* `booking-dialog.spec.ts` ("review step shows the legal agreement
  links", both modes).
- [ ] **AC-2:** Given the Instant payment page with a payable booking, when the pay
  summary renders, then the same agreement notice with both links is visible with the Pay
  button. *Pinned by:* `booking-pay.spec.ts` ("shows the legal agreement links with the
  pay action").
- [ ] **AC-3:** Given navigation to `/legal/privacy` and `/legal/terms`, when each page
  loads (lazily, with a route `title`), then the document renders with (a) a prominent
  draft-status banner and (b) the erasure/rights section pointing at the shipped
  self-service flows. *Pinned by:* `privacy-policy.spec.ts`, `terms-of-service.spec.ts`,
  `app.routes.spec.ts` (route registration).
- [ ] **AC-4:** Given the shared shell footer, when any chrome renders it, then Privacy
  and Terms links are present. *Pinned by:* `app.spec.ts` ("footer carries the legal links").
- [ ] **AC-5:** Both legal pages pass the axe + contrast a11y gates. *Pinned by:*
  `privacy-policy.a11y.spec.ts`, `terms-of-service.a11y.spec.ts`,
  `privacy-policy.contrast.spec.ts`, `terms-of-service.contrast.spec.ts`.
- [ ] **AC-6:** e2e (CI-safe mocked suite): from a venue map, opening the booking dialog
  to Review shows the agreement links; following the terms link lands on the terms page;
  both legal pages pass `expectNoSeriousAxeViolations`. *Pinned by:* `e2e/legal-pages.e2e.ts`.

## Non-goals

- The **final legal texts** (counsel, dual Albanian/GDPR framing) and naming the real
  controller/processors — the drafts use bracketed placeholders; #101 keeps that AC.
- DPAs, backups/PITR, Hetzner hosting, retention-window setting — #101's other remainder.
- A consent **checkbox** or stored consent record — adjacent-notice is the deliberate
  pattern (recorded below); revisit only if counsel asks.
- i18n / Albanian translations; cookie-consent banner (no third-party/analytics cookies
  exist — the session cookie is strictly necessary).
- Any backend change; any change to booking behavior or copy outside the notice line.

## Behavior-parity ledger

N/A — new behavior, replaces nothing (the checkout surfaces gain one notice line each;
no existing behavior is retired).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Draft legal text is mistaken for a real, counsel-approved policy | med | med | Prominent "Draft — pending legal review" banner on both pages + bracketed `[…]` entity placeholders; #101 stays open for the swap | agent | open |
| R-2 | In-modal navigation to a legal page destroys checkout state | med | med | Links open in a new tab (`target="_blank"` `rel="noopener"`) from dialog and pay page | agent | open |
| R-3 | Terms copy contradicts server-enforced rules (cutoff #4, refunds #10) | low | med | Copy states the rules generically ("the evening before, as shown at booking"; refunds server-computed) and defers to the booking view's server-computed values | agent | open |
| R-4 | New SCSS written for new pages against the Tailwind go-forward | low | low | `riviera-tailwind` loaded before styling; pages styled with Tailwind classes only | agent | open |
| R-5 | Axe false-fail on animated surfaces in e2e | low | low | House axe helper + `getAnimations().finished` rule (riviera-frontend e2e notes) | agent | open |

## Open questions / Assumptions

- **Assumption:** adjacent-notice (no checkbox) is sufficient for contract-terms
  acceptance at checkout — standard marketplace pattern; reversible in one small slice if
  counsel disagrees. — *Owner:* agent · *Resolves by:* counsel review (#101 remainder)
- **Assumption:** shipping clearly-marked draft documents now is wanted — endorsed by the
  maintainer 2026-07-31 ("go ahead with #101 Slice 3" after the draft-placeholder caveat
  was stated). — *Owner:* maintainer · *Resolves by:* merge

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no booking/claim path changes; copy + static pages only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope (the pay page gains a notice line; the flow is untouched).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/legal/privacy-policy.ts` | new | standalone component, inline-template-free (own `.html`? no — inline; long content, still static) | none (static) | none |
| FE-2 | `pages/legal/terms-of-service.ts` | new | standalone component | none (static) | none |
| FE-3 | `booking/booking-dialog.ts` | modify | notice line + links on Review step | existing signals untouched | existing |
| FE-4 | `booking/booking-pay.ts` | modify | notice line + links in pay summary | existing signals untouched | none |
| FE-5 | `app.html` (shell footer) | modify | two `routerLink`s | none | none |
| FE-6 | `app.routes.ts` | modify | two lazy routes with titles | — | — |
| FE-7 | `e2e/legal-pages.e2e.ts` | new | CI-safe mocked Playwright spec | — | — |

**Standards:** standalone components, `inject()`, native control flow, Tailwind classes
(no new SCSS), route `title` on both routes, literal `legal/*` segments (no param-order
hazard). Deviation: none planned.

## FE↔BE contract

N/A — no contract change (no API calls added; legal pages are static).

## Execution status

> Session-recovery anchor — re-read after compaction; update in the same commit window
> as the change it records.

**Stage pointer:** PR — mark ready for review, then the Review + Sonar gates.

**Next action:** merge latest `origin/main`, mark PR #464 ready, run `/code-review` per the
invocation ladder + `riviera-review-overlay`, then the Sonar API issue-list pull.

| Phase | Status | Commits |
|-------|--------|---------|
| P — plan doc committed, draft PR opened | ✅ | `6aea54a`, PR #464 (draft) |
| 0 — legal pages + routes (+unit/a11y/contrast specs) | ✅ | this commit — red run (module-not-found), then 6 files / 19 tests green scoped |
| 1 — checkout notice lines (dialog, pay) + footer links (+specs) | ✅ | this commit — red first, then full suite 126 files / 979 tests + lint green locally |
| 2 — e2e mocked spec + local verification (lint, unit, build) | ✅ | this commit — 4 e2e pass in real Chromium (`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`); lint + full unit suite + prod build green |

Note (FE-1/FE-2 drift): the pages use external `.html` templates, not inline — the content
is long-form; `riviera-frontend` sanctions external templates at that size.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run 30624512347, phase-0 push) | `app.spec.ts` #134 legacy-surface sweep expects every tourist route not on `RESTYLED_PATHS` to be flagged legacy — the new `/legal/*` glass routes weren't allowlisted (scoped-run blind spot; the full suite now runs locally before push) | fixed in phase-1 commit |

---

## File structure

- `frontend/src/app/pages/legal/privacy-policy.ts` (+`.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`) — draft privacy policy page
- `frontend/src/app/pages/legal/terms-of-service.ts` (+`.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`) — draft terms page
- `frontend/src/app/booking/booking-dialog.ts` / `.spec.ts` — Review-step agreement notice
- `frontend/src/app/booking/booking-pay.ts` / `.spec.ts` — pay-summary agreement notice
- `frontend/src/app/app.html` + `app.spec.ts` — footer links
- `frontend/src/app/app.routes.ts` + `app.routes.spec.ts` — `/legal/privacy`, `/legal/terms`
- `frontend/e2e/legal-pages.e2e.ts` — mocked-suite coverage (AC-6)

---

## Phase 0 — Legal pages + routes

- [ ] Red: `privacy-policy.spec.ts` / `terms-of-service.spec.ts` (draft banner, headline,
  rights section naming erasure) + `app.routes.spec.ts` route rows → run scoped Vitest → FAIL
- [ ] Green: the two components (Tailwind, static, standalone) + two lazy routes
- [ ] a11y/contrast specs per the house `pages/home` pattern → PASS
- [ ] Commit (`#101`), update Execution status

## Phase 1 — Checkout + footer links

- [ ] Red: dialog spec (both modes, Review step, `target`/`rel` asserted), pay spec,
  app spec (footer) → FAIL
- [ ] Green: notice line in `booking-dialog.ts` step-2 block; notice in `booking-pay.ts`
  summary aside; footer links in `app.html`
- [ ] Commit (`#101`), update Execution status

## Phase 2 — e2e + verification

- [ ] `e2e/legal-pages.e2e.ts` (mocked suite): dialog→Review links visible; legal pages
  render; `expectNoSeriousAxeViolations` on both
- [ ] `npm run lint` + scoped `npm test` runs + `npm run build` (riviera-local-debug discipline)
- [ ] Commit (`#101`), update Execution status, mark PR ready for review

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-6: scoped Vitest + Playwright runs listed per phase; verified at the
  commits recorded in Execution status.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc (the *content's* bracketed entity
  placeholders are the deliverable, not a doc gap).
- [ ] Frontend standards met; no `as any`; no new SCSS.
- [ ] Execution status at HEAD matches reality; risk rows closed; Open Questions empty or deferred with issue #.
- [ ] Close-out written in THIS PR, citing `merged via PR #NN`.
- [ ] The review gate ran in full (invocation ladder + `riviera-review-overlay`).
