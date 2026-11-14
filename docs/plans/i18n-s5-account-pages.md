# i18n S5 — the not-found, page-load-failed and account pages in Albanian and Italian

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** under `/sq/` and `/it/` the `**` not-found page, the page-load-failed card, the sign-in/register
card, forgot/reset/verify password, Your account and My bookings read in that language, and an SSO sign-in
started in a locale returns to that locale.

**Architecture:** copy is marked per ADR-0030 (`i18n` / `$localize`, `npm run i18n:sync`, an `sq` and an `it`
target per unit). The SSO return stays client-side, so neither `auth` nor `web` changes: `CustomerAuth.startSso`
leaves a one-shot `sessionStorage` note of the running build's locale, and `index.html`'s root seed, which
already owns every load of `/` (the callback's fixed `302 /`), consumes it ahead of the stored choice. The server
never reads a locale, so there is nothing to tamper with server-side; the seed only ever redirects to `/` plus an
allow-listed id.

**Source of intent:** issue #1772 and its triage Agent Brief; ADR-0030 §4–5.

**Branch:** `claude/1772-i18n-pages-02c584` (the wave's worktree branch stands in for `feature/<slug>`).

## Acceptance criteria

- [ ] **AC-1:** Given the `sq` or `it` build, when the not-found, page-load-failed, sign-in/register, forgot,
  reset (both audiences), verify, Your account or My bookings page renders, then no user-visible copy on it is
  unmarked and every unit has an `sq` and an `it` target. *Seam:* the production build
  (`i18nMissingTranslation: error`) · *Pinned by:* `npm run build`, and review for unmarked literals.
- [ ] **AC-2:** Given a guest on the `it` build, when they start an SSO sign-in, then the round trip's landing
  on `/` is sent to `/it/`; given the English build, it stays at `/` even with a stored `sq` choice. *Seam:*
  `CustomerAuth.startSso` + `index.html`'s seed · *Pinned by:* `customer-auth.spec.ts` (the note is written),
  `locale-boot.spec.ts` (the seed consumes it), `locales.e2e.ts` (the round trip against the production build).
- [ ] **AC-3:** Given an absent, unknown or tampered note (`//evil.example`, `https:`, `../x`), when `/` loads,
  then the seed falls back to the stored choice / browser / English and never redirects off-origin, and the
  note is consumed either way. *Seam:* the seed vs `firstVisitLocale` · *Pinned by:* `locale-boot.spec.ts`.
- [ ] **AC-4:** Given the `sq` build, when the not-found page and the sign-in page load by deep link, then
  their titles and copy are the translation file's and axe finds nothing serious. *Seam:* the served build ·
  *Pinned by:* `locales.e2e.ts`.

## Non-goals

- Emailed links to account pages (#1770), server `ApiProblem` text (#1771), German (#1773).
- The operator password page and the consoles (#1769): S2 keeps `operatorPasswordChangeMessage` and
  `SESSION_EXPIRED_MESSAGE`.

## Risks

- **R-1:** the SSO return becomes an open redirect → the server's redirect stays the literal `/`; the seed
  builds its target only from an allow-listed id (AC-3).
- **R-2:** a stale note (an abandoned provider page) redirects a later `/` load in that tab → the note is
  per-tab, consumed by the first `/` load, and names a locale the guest was just using.
- **R-3:** shared message sources (`password-policy.ts`, `customer-auth.ts`, `operator-auth.ts`'s two auth-card
  messages) also render on S2's pages → marked here once; ownership noted in the wave's shared notes.
- **R-4:** siblings edit the same xlf files → translations kept as `{id: target}` JSON per locale; on conflict
  take main's xlf and `npm run i18n:sync -- --fill`.

## Open questions

### Resolved

- Server-carried locale vs client-side → client-side (orchestrator's preference, ADR-0030 §5's seed already
  owns `/`); no `auth`/`web` change, so the slice is Behaviour tier.

## Phases

- **Phase 0 — SSO return:** the note on `startSso`, the seed consuming it, `firstVisitLocale` mirroring it ·
  red tests in `customer-auth.spec.ts` and `locale-boot.spec.ts`.
- **Phase 1 — mark the pages:** not-found, page-load-failed, auth card + SSO buttons, forgot/reset/verify,
  Your account, My bookings, their route titles and shared messages · `npm run build`.
- **Phase 2 — translations + locale e2e:** `sq` and `it` targets, `locales.e2e.ts` cases (AC-2, AC-4).
- **Phase 3 — docs:** ADR-0030 §5 and its translated-so-far line.

## Execution status

- [x] Phase 0 — SSO return note + seed, red on the old seed then green
- [ ] Phase 1
- [ ] Phase 2
- [ ] Phase 3
