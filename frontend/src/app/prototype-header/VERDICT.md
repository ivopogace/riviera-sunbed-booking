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

## What H does not settle

- Whether the account tab or `Find a booking` deserves the third phone tab, if the recovery path
  turns out to be commoner than the deep link implies.
- The desktop signed-out affordance: H shows a bordered `Sign in` chip that opens the menu.
  A plain link tested no worse, and no candidate tested a two-control split.
