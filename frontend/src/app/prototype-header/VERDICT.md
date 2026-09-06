# Tourist header spike — verdict

**Question:** what should the tourist header do, and what earns permanent bar space?

**Answer: variant H, "Two destinations"** (`header-variant-h.ts`). Rebuild issues:
[#1002](https://github.com/ivopogace/riviera-sunbed-booking/issues/1002) (the bar) and
[#1003](https://github.com/ivopogace/riviera-sunbed-booking/issues/1003) (the phone bottom bar).

Nothing on this branch merges. It is kept as the primary source behind those two issues.

## How the candidates were judged

`shoot.mjs` renders the landing page, where a header floats over an empty hero and every
candidate flatters equally. `shoot-pages.mjs` renders the four surfaces that discriminate — the
beach map, the find-a-booking modal, sign-in, and `/booking/pay` — and that is where the
candidates separated:

| Variant              | What the transactional pages showed                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `current`            | Hierarchy inverted: `Signed in as <email>` is the widest, boldest element and the theme chip the most button-like — the two loudest are the two lowest-value |
| `b` Pill tabs        | Gradient `Sign in` sits above the sign-in card's own `Sign in`, and beside `Pay €45`; the phone's second nav row pushes venue content down on every screen   |
| `c` App bar          | Survives all four surfaces — the runner-up, and H's starting point                                                                                           |
| `d` Editorial        | Quiet enough, but a centred masthead reads as a brochure, and tracked uppercase nav scans slowly                                                             |
| `e` Floating capsule | Same duplicated-CTA problem as `b`; the glass island disappears against a white page                                                                         |
| `f` Search-first     | A global `Where to?` renders on the payment page and on the venue already open — it invites the guest to leave mid-payment                                   |
| `g` Side rail        | Spends 88px of width on the one page whose content is a horizontal grid                                                                                      |

## The four decisions H encodes

Phone-first · theme kept as a bare swatch · `Find a booking` demoted to a menu row · phone nav as
an always-visible bottom tab bar. So primary nav carries only the two real destinations, and the
account menu holds the rest.

Demoting `Find a booking` costs the guest a second tap, which is affordable because the
confirmation mail already deep-links to `<base>/booking/<code>`
(`notification/application/BookingLinks.java`): the modal is a lost-the-email recovery path, not
the normal way in.

## Corrections from the second page pass

Three faults in H as first drawn, each the same objection that had eliminated another candidate,
fixed on the branch and re-shot:

1. **The tab bar never had a selected tab** on the beach map, the booking view or the pay page:
   it matched exact paths, like the desktop links. It now lights by section — Beaches for `/` and
   `/venues/**`, My bookings for `/my-bookings` and `/booking/**`, Account for `/account/**` when
   signed in. The desktop links keep exact matching.
2. **The signed-out trigger said `Sign in` and opened a menu** on both form factors. Desktop now
   has a plain `Sign in` link (current-marked on the sign-in page, like the shipped header) and a
   separate round menu button holding `Create an account` and `Find a booking`. The phone's third
   tab is `Menu` when signed out and `Account` (avatar) when signed in; the sheet leads with the
   real `Sign in` row.
3. **The tab bar stayed up under `Pay €45`**, the very objection that had removed F. It is hidden on
   `/booking/pay`, and the shell drops its bottom padding there. The prototype keys this on the URL;
   the rebuild should carry it as route data, the way the operator console goes chromeless.

Also fixed for every candidate: the variant hosts were inline elements, so no prototype header had
ever actually stuck on scroll. The hosts are now `display: contents`.

## Corrections from the adversarial review (third pass)

A review set out to break H rather than ratify it: every view in all three themes and both auth
states, plus the surfaces the page pass never shot (`/my-bookings` empty and populated,
`/booking/:code` with the pending banner, `/booking/confirmation`, the booking dialog over the
bar, sign-in at 390×420 with the keyboard up, 844×390 landscape, 320px), the keyboard and
screen-reader order, every focus leg of the sheet and the find modal, and the composited contrast
of every ink and fill in the bar and the sheet (`prototype-shots/review-h-*.mjs`). Nine faults,
each fixed in `header-variant-h.ts` and re-shot; one needed an eight-line hook in the shell.

4. **The selected tab was invisible in riviera and dark** (`map-phone-riviera-in`,
   `map-phone-dark-in`). The marker was a 0.12 accent tint behind the icon plus full-vs-soft ink,
   which measure 1.10–1.22:1 and 1.22–2.54:1 against the bar — under 1.4.11's 3:1 in every theme,
   and in the white-ink themes indistinguishable by eye. No tint the token set offers reaches 3:1
   on the bar (the 0.18 chip fill is 1.15–1.36:1; `--riv-accent-ink` as a fill is 1.09:1 on the
   riviera glass, the #984 problem again). The marker is now a **shape cue in full ink**: a 3px bar
   at the tab's top edge and a 1.5px ring round the icon pill, 6.7:1 at worst (riviera), plus the
   full-ink label it already had.
5. **The theme swatch had no boundary** (every bar). The swatch is 1.00–2.8:1 against the bar it
   sits on, and its white inset ring vanished on porcelain — a control whose only affordance is the
   swatch had nothing 1.4.11 could count. It now carries a 1.5px ring in `--riv-ink-soft`
   (5.4 / 5.5 / 11.6:1 on the three bars).
6. **The sheet stranded focus.** Opening it left focus on the tab; a backdrop tap closed it and
   dropped focus on `<body>` (Escape only "worked" because focus had never moved). Focus now lands
   on the first row on open and returns to the third tab on Escape, backdrop and row click — every
   leg `review-h-focus.mjs` walks.
7. **`Find a booking` from the sheet or the desktop popover dismissed to `<body>`**, both
   breakpoints. `App.openFind(false)` looked for the shipped header's `#findButton`, which no
   variant renders, so `findReturn` was `null`. H now emits the persistent trigger (the Menu tab,
   or the desktop menu/account button — the row itself is gone by the time the modal closes) and
   the shell's `openFindFrom` records it. This is the one shell change.
8. **The theme popover's backdrop did not cover the tab bar** on phones: the backdrop lives inside
   the sticky header's stacking context (`z-20`), and the bar is a later `z-20` sibling, so a tab
   tap navigated with the popover still open. The bar is now rendered _before_ the header in the
   DOM, which the header's context then covers. Side effect, deliberate: the primary nav is first
   in tab order below `sm` (Beaches, My bookings, Menu, brand, swatch). Note the premise the review
   started from was wrong — the bar was never last in the DOM; it sat between the header and
   `<main>`.
9. **Safe area.** The bar padded by `env(safe-area-inset-bottom)` but the sheet
   (`bottom-[76px]`) and the shell padding (`68px`) did not, so on a 34px home-indicator phone the
   sheet's last row sat under the bar and the page's last 34px were occluded. Both are now
   `calc(… + env(safe-area-inset-bottom))`. Code-verified only: Chromium cannot emulate an inset.
10. **The translucent bar over dense content** (open item 2, `map-phone-*`, `booking-pending-*`):
    the availability strip and `← Back home` bled through. The bar now stacks a second layer of the
    header glass (0.84 opaque in porcelain, 0.92 in riviera and dark) — token-clean for a spike; the
    rebuild should give the bar surface its own token rather than double-paint.
11. **The 57px phone top bar** (open item 1, `scrolled-*`): it is now `max-sm:relative` and scrolls
    away, so the tab bar is the only sticky chrome below `sm` — 61px instead of 118. `relative`,
    not `static`: the glass is an absolute pseudo-element and needs the header's own box. The cost
    is that the swatch is reachable only at the top of the page, which for a control used once is
    the right trade.
12. Every `<a>` in the bar, the popovers and the sheet now declares `appTouchTarget`; the guard
    never judges links, and the rule is every control.

### Checked and not faulted

- **Keyboard and screen-reader order**: brand, swatch, then the page above `sm`; below `sm` the
  three tabs, brand, swatch, then the page (after fix 8). The sheet is a disclosure (`aria-expanded`
  on the tab), not a dialog, matching the shipped mobile menu.
- **Landscape 844×390** renders the desktop bar (≥ `sm`) — 57px of chrome and no tab bar.
- **320px**: brand + swatch fit; the three labels fit; the sheet truncates the email.
- **Sign-in with the keyboard up (390×420)**: the bar covers the bottom 61px of the visible form.
  On iOS Safari and Chrome Android ≥ 108 the layout viewport does not shrink for the keyboard
  (`interactive-widget` is unset), so the fixed bar goes _behind_ the keyboard; the simulation
  overstates it. Not fixed. Hiding the bar on `focusin` of a text field is a maintainer's call.
- **`/my-bookings`** empty and populated, **`/booking/:code`** with the pending banner,
  **`/booking/confirmation`**, the **booking dialog** (`z-60` sits over the bar, which dims under its
  backdrop): the section rule lights `My bookings` on all of them; `Pay €45` stays the only page
  with no bar.
- **Every text ink in the bar and the sheet is AA** in all three themes at the worst gradient stop
  (`review-h-contrast.mjs`): tab labels 5.43 / 5.49 / 11.61:1, sheet rows 13.2–15.8:1, the
  `Sign in` accent row 5.14–10.3:1, the email 5.33–9.28:1, the avatar initial 5.56:1 on the
  lightest CTA stop.

### Left as noted

- The third tab reads `Menu` until the session restore resolves, then flips to `Account` — the
  shipped header hides its auth controls behind `restoring()` instead; the rebuild should too.
- The desktop popovers keep the shipped disclosure posture (focus stays on the trigger on open);
  only the sheet moves focus in, per #1003 AC 8.
- The prototype switcher overlaps the theme popover on phones — tooling, not the design.

### Variant I — not built

Nothing found needed a structural alternative: every fault fitted inside H's structure, the one
shell hook included. So the ranking is **H, corrected** and no I.

## What H does not settle

- Whether `Find a booking` deserves the third phone tab instead of a sheet row, if the recovery
  path turns out to be commoner than the deep link implies (for a guest without the mail it is
  now tab, row, code).
- Whether `booking/confirmation` and `booking/requested` should also hide the bar; the spike
  tested pay only (the section rule lights `My bookings` on both).
- Whether the bar should hide while a text field has focus — see _Checked and not faulted_.

## Issue ACs that need editing

**#1002**

- AC 2: `App.findReturn` is set by the opener, not resolved from a `viewChild` — the row that opens
  the modal sits in a popover that closes, so the return target is that popover's persistent
  trigger (the menu/account button). Seam: `app.spec.ts` asserting `document.activeElement` after
  dismiss in both auth states.
- AC 3: add — the swatch carries a 1.5px `--riv-ink-soft` ring, its 1.4.11 boundary, ≥ 3:1 on
  every bar. Seam: `app.contrast.spec.ts` compositing the ring over the header glass at the worst
  stop of each theme.
- AC 8: extend to links — every `<a>` in the bar declares `appTouchTarget`; the guard judges
  buttons only, the sweep measures both.

**#1003**

- AC 2: replace "at 56px" with: below `sm` the top bar is `relative`, not sticky — it scrolls away
  and the tab bar is the only sticky chrome (61px). Seam: `app.spec.ts` at phone width reading the
  header's computed `position`.
- AC 4: the sheet's bottom offset takes `env(safe-area-inset-bottom)` too, not just the shell
  padding.
- AC 7: replace "full ink plus a fill behind the icon" with "a shape cue in full ink — a 3px bar at
  the tab's top edge plus a 1.5px ring round the icon pill — and the full-ink label"; no tint in
  the token set reaches 3:1 on the bar, so a fill would need a new token pair. Seam: the
  composited contrast of `--riv-ink` against the bar per theme, plus `current-page-marker.e2e.ts`
  as written.
- AC 8: add the backdrop-tap leg, and that dismissing the find modal opened from the sheet returns
  focus to the third tab (both auth states).
- New AC: the bottom `nav` precedes the `header` in the DOM, so the header popovers' backdrop
  covers it and the primary nav is first in tab order below `sm`. Seam: `app.spec.ts` on
  `compareDocumentPosition`.
- New AC: the bar's surface is near-opaque — a `--riv-tabbar-glass` token at ≈ 0.85 / 0.92,
  declared per theme — not the header glass. Seam: an e2e on `/venues/1` at 390px reading the
  computed background.
- Out of scope: drop the two "follow-ups" (the pinned top bar and the opaque bar are both settled
  above); keep the _Watch out_.
