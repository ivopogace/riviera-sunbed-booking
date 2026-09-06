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

## What H does not settle

- Whether `Find a booking` deserves the third phone tab instead of a sheet row, if the recovery
  path turns out to be commoner than the deep link implies (for a guest without the mail it is
  now tab, row, code).
- The phone top bar still pins 57px carrying only the brand and the theme swatch; with the tab
  bar holding the nav, it could scroll away or hide on scroll (118px of sticky chrome today, 61px
  without it).
- The translucent tab bar over dense content (the availability strip on the map): near-opaque like
  the popover surface, or page padding.
