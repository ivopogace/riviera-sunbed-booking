# Stay picker Apply step Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** in stay mode the shared date picker holds a picked range until **Apply**, so a wrong
second tap no longer reloads the page; day mode keeps its one-tap close.

**Architecture:** `shared/availability-calendar.ts` swaps its `pendingFirst` for a pending range
(first, then last) and emits `chosen` only from Apply (or "Just this day"). Nothing is emitted on
Escape or an outside tap, so the hosts need no code change: both already read `selectedLastDate`
into the picker, which opens in stay mode when the page shows a stay.

**Source of intent:** #1534; owner decisions relayed by the wave orchestrator (2026-10-10).

**Branch:** `bugfix/stay-picker-apply-1534`

## Acceptance criteria

- [x] **AC-1:** Given stay mode, when a first and a last day are tapped, then nothing is emitted
  and the footer shows the range and its length (`formatStay`, e.g. "Wed 14 Oct – Fri 16 Oct ·
  3 days") with a primary Apply. *Seam:* the component's DOM + `chosen` output · *Pinned by:*
  `availability-calendar.spec.ts` › stay mode.
- [x] **AC-2:** Given a pending range, when Apply is pressed, then `chosen` emits `{first, last}`
  once. *Pinned by:* same.
- [x] **AC-3:** Given a pending range, when another day is tapped, then the pick restarts from it
  (the Apply step hides until a last day is tapped again). *Pinned by:* same.
- [x] **AC-4:** Given a pending range, when Escape or an outside tap arrives, then `dismissed`
  fires and `chosen` never does. *Pinned by:* same.
- [x] **AC-5:** Given day mode, when a day is tapped, then `chosen` emits at once (unchanged).
  *Pinned by:* existing "keeps the one-tap pick in day mode".
- [x] **AC-6:** Given a host showing a stay (home and the venue page), when the picker reopens,
  then it is in "Several days" mode with that stay highlighted. *Seam:* host DOM · *Pinned by:*
  `home.spec.ts`, `venue-map.spec.ts`.
- [x] **AC-7:** Both hosts commit a stay only through Apply. *Pinned by:* host specs +
  `e2e/discovery-stay.e2e.ts`, `e2e/range-booking.e2e.ts`.
- [x] **AC-8:** Apply meets the touch floor and its boundary clears 3:1 against the popover in
  every theme (non-text-contrast rule 1). *Pinned by:* `availability-calendar.contrast.spec.ts`.

## Non-goals

- What the home "Several days…" chip opens in when the page shows one day (it opens in day mode
  today; the e2e pins it). Not part of the owner's decisions.
- A compact same-month range label ("Wed 14 – Fri 16 Oct"): `formatStay` is the app's stay label.

## Risks

- **R-1:** a keyboard user loses the commit step → Apply is a real `<button>` in the dialog's
  focus trap; the range summary is in the existing `aria-live` hint.
- **R-2:** the stay ceiling (#4 display side, `MAX_STAY_DAYS`) must still cap the last tap and
  must not block a restart tap → the ceiling applies only while the last day is awaited.

## Execution status

- [x] Phase 1 — calendar: pending range + Apply (unit + contrast specs).
- [x] Phase 2 — hosts: specs for Apply commit + reopen in stay mode; e2e updated.
