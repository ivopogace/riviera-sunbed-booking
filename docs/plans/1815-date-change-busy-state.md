# The venue page says it is checking while other days load (#1815)

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** From an in-page date change until the read for the new days answers, the venue page
dims the old map, replaces the availability line with a loading message naming the new days, and
states nothing computed from the old read; the new line is announced even when the count is
unchanged.

**Architecture:** Everything keys on the existing `VenueMap.staleDays` window, so a same-days
re-read shows none of it. The availability line stays the one persistent live region and only
its content branches; the progress mark is a timer-set signal, outside the live region.

**Source of intent:** #1815 and its triage brief; the owner's three decisions of 2026-11-20.

**Branch:** `bugfix/1815-date-change-busy-state`

## Acceptance criteria

Seam for all: the rendered `VenueMap` page (DOM in jsdom, computed style and focus in Chromium).

- [ ] **AC-1:** Given a map on screen, when the visitor picks other days, then until the read answers the availability line reads "Checking availability for <new days>…" and holds no count. *Pinned by:* `venue-map-reload.spec.ts` › "the availability line says it is checking the new days, never the old count"
- [ ] **AC-2:** Given AC-1's window, when the read answers with the same count as before, then the line's text changed twice (loading, then count), in the same element. *Pinned by:* `venue-map-reload.spec.ts` › "an unchanged count is still a change of the line"; `venue-map-reload.e2e.ts` › "while other days load…"
- [ ] **AC-3:** Given AC-1's window, then the availability bar shows no proportion and the no-cover banner is not shown; both return with the answer. *Pinned by:* `venue-map-reload.spec.ts` › "the bar shows no proportion…", "takes the no-cover banner with it…"
- [ ] **AC-4:** Given AC-1's window, then the map card is at half opacity at both widths and back to full when the read answers or fails. *Pinned by:* `venue-map-reload.e2e.ts` › "while other days load…" (computed `opacity`)
- [ ] **AC-5:** Given AC-1's window, then no progress mark is shown before one second, one is shown after, and none once the read answers. *Pinned by:* `venue-map-reload.spec.ts` › "the progress mark" (fake timers, the threshold); `venue-map-reload.e2e.ts` (the mark arrives while the read is held, and goes)
- [ ] **AC-6:** The mark's arc reaches 3:1 on the card glass in all three themes; it does not spin under reduced motion. *Pinned by:* `venue-map.contrast.spec.ts` › "accent ink (free count, scroll hint, progress mark) meets AA on the card glass"; `venue-map-reload.e2e.ts` (reduced motion, `animation-name`)
- [ ] **AC-7:** `aria-busy` is on no inert element. *Pinned by:* `venue-map-reload.spec.ts` › "is inert until the read answers"
- [ ] **AC-8:** A same-days re-read (Retry, the #1809 refresh) changes neither the line nor the map's look. *Pinned by:* `venue-map-reload.spec.ts` › "stays usable through a re-read for the same days", "the map is not inert while that same-days read is in flight"
- [ ] **AC-9:** The new copy is translated in `sq`, `it`, `de`. *Pinned by:* the build (`npm run build` fails on a marked message without a target).

## Non-goals

- `refresh()`, `onDialogClose`, `BookingDismissal` (#1812 + #1817); `retry()`, the failure panel, the error arm of `load()` (#1816).
- The sales-closed and closed-for-season alerts, which also read the old venue during the window.
- The first load's skeleton and `app-load-announcer`.

## Decisions settled from the docs

- **Dim: `opacity: 0.5`, 150ms ease, no transition under reduced motion.** The card is `inert`, so it is an inactive component with no contrast requirement (WCAG 1.4.3, as the orchestrator read it; `w3.org` is blocked in this session); the HTML spec asks authors to mark inert parts clearly. Opacity is theme-independent, so one computed-style proof covers the three themes.
- **Mark: the pay page's ring** (`booking-pay.ts`, `pay-spin`, `motion-reduce:animate-none`), 14px, in `--riv-accent-ink`, beside the line and outside the live region so its arrival re-announces nothing. Accent ink is the count's own text ink on this card, so it clears 3:1.
- **Delay: a 1000ms timer** set by an effect on `staleDays`; unit specs prove the threshold on fake timers; the e2e only waits for the mark while the read is held.
- **No-cover banner: removed for the window, not dimmed.** Its sentence states the new days' count from the old read, which decision 2 rules out.
- **`aria-busy` removed** from the map card: inert nodes are not exposed to assistive technology (HTML spec § inert), and on the live region it would hold the announcement back (MDN `aria-busy`).
- **`aria-atomic="true"` on the line**, so a part that changes reads the whole status.

## Risks

- **R-1:** Siblings edit the same files → keep `load()` untouched; every new binding reads `staleDays`.
- **R-2:** Wrapping the line to seat the mark moves it → computed-box proof in the e2e before/after.
- **R-3:** Removing the banner strands focus on its button → `parkIfTaken` already lands lost focus on the date field; the existing spec keeps asserting it.

## Phases

- **Phase 0 — the line and what it takes with it:** AC-1, AC-2, AC-3, AC-7, AC-8.
- **Phase 1 — the look:** AC-4, AC-5, AC-6.
- **Phase 2 — copy and docs:** AC-9, RESPONSIBILITIES.md § Frontend.

## Execution status

**Stage pointer:** review — round 1 findings fixed (docs and tests only)

**Next action:** green CI on the fix push, Sonar measures, remove this plan, READY TO MERGE

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the line | ✅ | first commit |
| 1 — the look | ✅ | first commit |
| 2 — copy and docs | ✅ | first commit |
