# For venues page Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a public `/for-venues` page tells a beach-venue owner what Riviera gives them, what it
costs (under ADR-0029), how guests pay, and how to start, and ends in the existing operator
registration; the tourist menus and the tourist footer link to it.

**Architecture:** a static, lazy page under `pages/` (no feature owns it, like the legal pages),
reusing the card-glass surface and token inks the legal pages already prove AA, and the shared
`appPrimaryCta` skin for the registration link. The footer link is an opt-in on the shared
`LegalFooter`, switched on only for the tourist chrome, so the console footer stays as it is.

**Source of intent:** issue #1736 and the owner's decision comment of 2026-11-14 (copy source);
ADR-0029 decision 2.

**Branch:** `feature/for-venues-page`

## Acceptance criteria

- [x] **AC-1:** Given a visitor on `/for-venues`, then the page states what a venue gets (own
  beach map with online pre-booking, daily view with walk-in marking and QR check-in,
  request-to-book), the price terms verbatim from the owner's comment, the money mechanics under
  an "At launch" label, and the four start steps. *Seam:* the `ForVenues` component ·
  *Pinned by:* `for-venues.spec.ts`
- [x] **AC-2:** Given the page, then it names no commission rate, no payout and no payment
  provider, and links to nothing under the operator console (no Payouts tab, no commission text).
  *Seam:* `ForVenues` rendered text + links · *Pinned by:* `for-venues.spec.ts`
- [x] **AC-3:** Given the page, when the visitor follows its call to action, then they land on
  the operator registration card (`/account/sign-in?audience=operator&mode=register`).
  *Seam:* router · *Pinned by:* `for-venues.spec.ts` (href) + `e2e/for-venues.e2e.ts` (click → card)
- [x] **AC-4:** Given the tourist chrome, then "For venues" is a row in the phone sheet and in both
  desktop popover branches, and a link in the footer; the console chrome's footer has no such link.
  *Seam:* `App` shell · *Pinned by:* `app.spec.ts`
- [x] **AC-5:** The route is lazy with a title and no tab section. *Seam:* `app.routes.ts` ·
  *Pinned by:* `app.routes.spec.ts`
- [x] **AC-6:** The page is axe-clean in all three themes and every control meets the touch
  floor. *Seam:* real render · *Pinned by:* `for-venues.a11y.spec.ts`, `e2e/for-venues.e2e.ts`

## Non-goals

- Retiring the console's "after 15% commission" text and Payouts tab (#284).
- Albanian translation (the issue's first translation batch).
- Naming a payment provider (#284, #1693).

## Risks

- **R-1:** copy drifts from the owner's decision (a commission or payout mention creeps in) →
  AC-2's negative assertions pin it.
- **R-2:** the page claims a mechanic the app does not run yet → the money paragraph carries the
  "At launch" label with a test id #284 can find and remove.
- **R-3:** merge conflict with #1735 (Help row + route beside ours) → merge `origin/main`, keep
  both rows and both routes.

## Phases

- **Phase 0 — page + route:** AC-1/2/3/5/6 · red `for-venues.spec.ts`
- **Phase 1 — shell links:** AC-4 · red `app.spec.ts`
- **Phase 2 — e2e:** `e2e/for-venues.e2e.ts` (menu → page → CTA → card; axe in three themes)

## Execution status

**Stage pointer:** CI + review

**Next action:** open the PR, mark ready, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — page + route | ✅ | (first commit) |
| 1 — shell links | ✅ | (first commit) |
| 2 — e2e | ✅ | (first commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
