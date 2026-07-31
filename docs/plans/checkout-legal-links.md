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
`riviera-docs-freshness` (ran pre-merge over `origin/main...HEAD` via the review gate —
1 finding: this branch's own improvement-plan D5 annotation said Slice 3 was "remaining"
while this PR ships it; patched in-PR) · `riviera-frontend` (placement: `pages/legal/`,
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

- [x] **AC-1:** Given the guest-checkout dialog on the Review step (either INSTANT or
  REQUEST mode), when the step renders, then an agreement notice is visible naming the
  Terms of Service and Privacy Policy as links to `/legal/terms` and `/legal/privacy`
  that open in a new tab (`target="_blank"` + `rel="noopener"`), adjacent to the primary
  action. *Pinned by:* `booking-dialog.spec.ts` ("review step shows the legal agreement
  links", both modes).
- [x] **AC-2:** Given the Instant payment page with a payable booking, when the pay
  summary renders, then the same agreement notice with both links is visible with the Pay
  button. *Pinned by:* `booking-pay.spec.ts` ("shows the legal agreement links with the
  pay action").
- [x] **AC-3:** Given navigation to `/legal/privacy` and `/legal/terms`, when each page
  loads (lazily, with a route `title`), then the document renders with (a) a prominent
  draft-status banner and (b) the erasure/rights section pointing at the shipped
  self-service flows. *Pinned by:* `privacy-policy.spec.ts`, `terms-of-service.spec.ts`,
  `app.routes.spec.ts` (route registration).
- [x] **AC-4:** Given the shared shell footer, when any chrome renders it, then Privacy
  and Terms links are present. *Pinned by:* `app.spec.ts` ("footer carries the legal links").
- [x] **AC-5:** Both legal pages pass the axe + contrast a11y gates. *Pinned by:*
  `privacy-policy.a11y.spec.ts`, `terms-of-service.a11y.spec.ts`, and the shared
  `legal-pages.contrast.spec.ts` (one spec — the two pages share one surface recipe).
- [x] **AC-6:** e2e (CI-safe mocked suite): from a venue map, opening the booking dialog
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
| R-1 | Draft legal text is mistaken for a real, counsel-approved policy | med | med | Prominent "Draft — pending legal review" banner on both pages + bracketed `[…]` entity placeholders; #101 stays open for the swap | agent | closed — banner + placeholders pinned by both page specs; F-5 tightened the retention sentence |
| R-2 | In-modal navigation to a legal page destroys checkout state | med | med | Links open in a new tab (`target="_blank"` `rel="noopener"`) from dialog and pay page | agent | closed — extended to BOTH footers after review F-6/F-8; asserted in unit + e2e |
| R-3 | Terms copy contradicts server-enforced rules (cutoff #4, refunds #10) | low | med | Copy states the rules generically and defers to the booking view's server-computed values | agent | closed — review F-2/F-3 removed the shown-at-booking promise and added the partial-refund branch |
| R-4 | New SCSS written for new pages against the Tailwind go-forward | low | low | `riviera-tailwind` loaded before styling; pages styled with Tailwind classes only | agent | closed — no new `.scss` in the diff |
| R-5 | Axe false-fail on animated surfaces in e2e | low | low | House axe helper + `getAnimations().finished` rule (riviera-frontend e2e notes) | agent | closed — every audit preceded by `settle(page)` |

## Open questions / Assumptions

(empty)

### Resolved

- **Adjacent-notice (no checkbox)** — recorded as the shipped pattern; counsel can reverse in
  one small slice (#101 remainder carries it). Resolved at the review gate, merged via PR #464.
- **Draft documents wanted** — endorsed by the maintainer 2026-07-31 and shipped with the
  draft banner + bracket placeholders pinned by specs. Merged via PR #464.

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

**Stage pointer:** sonar gate (post review-fix round) → merge close-out.

**Next action:** confirm CI + Sonar on the review-fix head (pull the API issue list,
false-clean check), then merge close-out (epic tick, #319 close, #101 comment).

| Phase | Status | Commits |
|-------|--------|---------|
| P — plan doc committed, draft PR opened | ✅ | `6aea54a`, PR #464 (draft) |
| 0 — legal pages + routes (+unit/a11y/contrast specs) | ✅ | this commit — red run (module-not-found), then 6 files / 19 tests green scoped |
| 1 — checkout notice lines (dialog, pay) + footer links (+specs) | ✅ | this commit — red first, then full suite 126 files / 979 tests + lint green locally |
| R — review gate (5-agent fan-out + overlay) + fix round F-2..F-12 | ✅ | this commit — 12 findings, all fixed in-PR; lint + 979 unit + 12 e2e green |
| 2 — e2e mocked spec + local verification (lint, unit, build) | ✅ | this commit — 4 e2e pass in real Chromium (`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`); lint + full unit suite + prod build green |

Note (FE-1/FE-2 drift): the pages use external `.html` templates, not inline — the content
is long-form; `riviera-frontend` sanctions external templates at that size.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run 30624512347, phase-0 push) | `app.spec.ts` #134 legacy-surface sweep expects every tourist route not on `RESTYLED_PATHS` to be flagged legacy — the new `/legal/*` glass routes weren't allowlisted (scoped-run blind spot; the full suite now runs locally before push) | fixed in phase-1 commit |
| F-2 | review (RV-FE-3, score 75) | Terms said flatly "non-refundable" after cutoff — the server supports a per-venue partial late-cancel refund (`RefundPolicy`, `late_cancel_refund_bps`) | fixed in review-fix commit |
| F-3 | review (RV-FE-3, score 75) | Terms promised "the exact closing time is shown while you book" — the tourist UI shows only a display default ("6 PM"), the per-venue cutoff is never rendered; TSDoc made the same claim | fixed in review-fix commit |
| F-4 | review (copy accuracy, score 75) | Privacy said "a single session cookie" — the XSRF-TOKEN CSRF cookie also ships (`SecurityConfig`) | fixed in review-fix commit |
| F-5 | review (copy accuracy, score 75) | Privacy stated the retention sweep as running — it ships disabled pending counsel's window | fixed in review-fix commit (conditional wording + bracket placeholder) |
| F-6 | review (history/#390+#137, score 100) | Footer `routerLink`s render on `/booking/pay` — in-app nav unmounts the Stripe Payment Element, contradicting this PR's own new-tab rule | fixed: footer links now `target="_blank" rel="noopener"`; unit + e2e assert it |
| F-7 | review (history/#462, score 75) | Operator console's own footer (#462) not brought to parity — console operators had no route to the documents | fixed: same links in `operator-console.html` footer |
| F-8 | review (history/#462, score 100) | Shell footer under operator chrome navigated in-app to a tourist-chrome page ("Sign in / Register" to a signed-in admin — the #462 bug class) | fixed by the same new-tab change as F-6 |
| F-9 | review (glass-tokens TSDoc, score 70) | New contrast spec hand-copied card-glass constants against the "ONE test-side mirror" rule | fixed: constants promoted into `glass-tokens.ts`, spec imports them (4 pre-existing copies left as-is — pre-existing, candidate follow-up) |
| F-10 | review (comment accuracy, score 75) | e2e header TSDoc overstated coverage ("both themes" — only privacy toggles) | fixed: comment narrowed |
| F-11 | review (prior-PR #438/#362 class) | Improvement-plan D5 line (added on this branch) said Slice 3 "remaining" — false the moment this PR merges; plan doc's `riviera-docs-freshness` N/A was therefore wrong | fixed: D5 reworded to "shipped as drafts via PR #464"; freshness line now records the ran-with-findings outcome |
| F-12 | review (plan-doc discipline, #438 class) | Plan File structure omitted the two docs files on the branch and named two contrast specs where one combined spec shipped (AC-5 too) | fixed: File structure + AC-5 corrected |

---

## File structure

- `frontend/src/app/pages/legal/privacy-policy.ts`/`.html` (+`.spec.ts`, `.a11y.spec.ts`) — draft privacy policy page
- `frontend/src/app/pages/legal/terms-of-service.ts`/`.html` (+`.spec.ts`, `.a11y.spec.ts`) — draft terms page
- `frontend/src/app/pages/legal/legal-pages.contrast.spec.ts` — shared contrast maths for both pages
- `frontend/src/testing/glass-tokens.ts` — card-glass constants promoted (review-gate F-9)
- `frontend/src/app/booking/booking-dialog.ts` / `.spec.ts` — Review-step agreement notice
- `frontend/src/app/booking/booking-pay.ts` / `.spec.ts` — pay-summary agreement notice
- `frontend/src/app/app.html` + `app.spec.ts` — tourist/operator shell footer links (new tab)
- `frontend/src/app/operator/operator-console.html` — console footer parity (review-gate F-7)
- `frontend/src/app/app.routes.ts` + `app.routes.spec.ts` — `/legal/privacy`, `/legal/terms`
- `frontend/e2e/legal-pages.e2e.ts` — mocked-suite coverage (AC-6)
- `docs/architecture/improvement-plan.md`, `docs/adr/ADR-0007-package-structure.md` — the epic
  #93 remaining-scope review annotations (#319/#463), on this branch ahead of the slice

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

- [x] AC-1..AC-6: verified — full Vitest suite (979 tests, incl. the six pinning specs) and
  the 4-test `legal-pages.e2e.ts` run green at the review-fix commit; merged via PR #464.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc (the *content's* bracketed entity
  placeholders are the deliverable, not a doc gap).
- [x] Frontend standards met; no `as any`; no new SCSS.
- [x] Execution status at HEAD matches reality; risk rows closed; Open Questions empty or deferred with issue #.
- [x] Close-out written in THIS PR, citing `merged via PR #464`.
- [x] The review gate ran in full — `code-review` plugin workflow via the Skill rung (5-agent fan-out + confidence scoring) + `riviera-review-overlay` frontend bank; findings F-2..F-12 fixed in-PR.
