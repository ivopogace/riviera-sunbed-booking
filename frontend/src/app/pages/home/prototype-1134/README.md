# Prototype — overlapping venue pins (#1134)

**Throwaway.** Nothing in this folder merges to `main`. Two branches carry it: the first pass
(`claude/prototype-1134-tailwind-angular-cd32pp`, variants A–C and its verdict) and this second pass
(`claude/prototype-1134-variant-d-z5i3v1`), which re-ran the three, checked the first pass's claims,
added a fourth variant and re-judged all four. The _decision_ is what graduates, rebuilt test-first
through the normal loop.

> **The question:** when several venue pins crowd the same spot, how does the tourist reach any of
> them? Four variants, on the real Discover page, over the real riviera map.

## Run it

```bash
cd frontend && npm run prototype:1134          # the dev server, no backend
cd frontend && npm run prototype:1134:shots    # against it: the screenshots + measurements below
```

No backend, no Postgres, no Docker. The script links `platform/map` into `public/` and the
`prototype` build configuration swaps `apiBaseUrl` to empty, so the dev server serves the real
MapLibre tiles itself; the venue list is `crowd-fixture.ts`, so no `/api` call is made at all.

| URL                         | What it opens on                                     |
| --------------------------- | ---------------------------------------------------- |
| `localhost:4200/?variant=A` | riviera-wide — the map's own opening view (zoom 8.6) |
| `…&at=19.6394,40.1483,16`   | **Dhërmi**: 3 venues ~20 m apart, at `maxZoom`       |
| `…&at=19.719,40.108,13`     | **Jale**: 5 venues along one bay                     |
| `…&at=20.0027,39.7674,14`   | **Ksamil**: a pair                                   |

`←`/`→` or the floating bar walk the variants; the bar is gated out of production builds.

## The four

|                                 | Idea                                                                                                          | Primary affordance          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **A** `variant-stack-fan.ts`    | Merge the crowd into a counted disc; fan it open on a press                                                   | press the count             |
| **B** `variant-stack-sheet.ts`  | Leave every pin where it is; a press resolves to a _set_, answered by a list                                  | press the blob              |
| **C** `variant-tethered-fan.ts` | Push crowded pins apart permanently, tethered to their true point                                             | press the one you want      |
| **D** `variant-named-cycle.ts`  | Every pin says what is there; a crowd's press opens the first venue's card, and pressing again walks the rest | press the name, press again |

A, B and C occupy _merge_, _defer to a list_ and _displace_. D takes two axes none of them use —
**the pin itself** and **time**:

- **The pin is a chip, never an anonymous dot.** A coin sits exactly on the venue, in the map
  chrome's own solid skin, and a label lozenge tucks in behind it: the venue's name when alone, the
  beach and count when several share the spot (`Dhërmi 3`), or both beaches when the crowd spans two
  (`Borsh & Qeparo`). A crowd's coin wears an inner rim — a stack's silhouette before the numeral is
  read. The map informs before anyone presses. Labels declutter greedily, biggest crowd first: a
  lozenge that would run over another coin, an already-placed lozenge or the map's edge tries the
  other side, then yields; the coin — the control — never moves and never yields.
- **A press opens a venue, not a menu.** Pressing a crowd opens the first member's preview at once,
  the same card a lone pin opens; the coin flips to teal and reads `1/3`, the lozenge names the venue.
  Pressing the chip again walks to the next member (wrapping), and the card carries a glass stepper
  pill — the app's own dot rail between two chevrons, announcing each step politely — doing the
  same. Nothing on the map moves or merges away, and nothing covers the map beyond the card the page
  already has.
- **Keyboard parity is kept, not approximated.** A crowd stays n real buttons in feed order, exactly
  as production draws them: the chip is the current member's button, the others are invisible at the
  same spot until focused. The buttons are tracked by pin, never by crowd, which is what makes them
  survive a re-group (§ _claim 2_ below).

D touched one thing above the seam that the others did not: the page's `VenuePreviewCard` grew an
optional `stack` input and a `stepped` output. That is the chooser surface, in `pages/home/`, where
the issue says the choice may surface. It asked nothing further of the map port.

## The evidence

`screenshots/`, all from the real map with the real riviera tiles, taken by `screenshots.mjs`. The
phone shots are 390 × 844 with the Map tab open; the switcher bar is hidden in every shot.

| Shot                                               | What it shows                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `{a,b,c,d}-riviera-desktop.png`                    | the opening view, desktop: 14 venues collapse to `3` / `6` / `2` / `2` and **one** solo pin         |
| `{a,b,c,d}-{riviera,dhermi,jale,ksamil}-phone.png` | the four scales on a phone — the matrix every verdict below is judged on                            |
| `a-jale-fanned-phone.png`                          | A opened on Jale — five identical dots with nothing to choose between                               |
| `b-jale-sheet-phone.png`                           | B's sheet on Jale — the facts to choose, half the map gone, three of five rows in view              |
| `c-riviera-phone.png`                              | C at the opening view: adjacent fans overlapping, the defect recreated                              |
| `d-riviera-open-phone.png`                         | D at the opening view with the Dhërmi crowd open: the inverted chip, the card, its `1 of 3` stepper |
| `d-dhermi-open-phone.png`                          | D at Dhërmi, `maxZoom`, walked to the second venue: the chip names it, the card steps               |

Measured, not eyeballed (`npm run prototype:1134:shots` prints them):

| Measurement                                                                             | Value                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Dhërmi three at `maxZoom` 16, projected pin-to-pin                                      | 25.5 px, 29.9 px, 37.1 px — all under one 44 px finger                          |
| Opening view, 14 venues                                                                 | 4 crowds (`3`, `6`, `2`, `2`) and **1** solo pin: 13 of 14 venues crowded       |
| C at the opening view, closest pins from different crowds                               | 19.8 px (Riviera Sands ↔ Borsh Long Beach) — the defect, recreated              |
| B's sheet on a phone, Jale                                                              | 50 % of the map's height; 3 of 5 rows in view without scrolling                 |
| D's card on a phone, Dhërmi, crowd open                                                 | 35 % of the map's height (the production card plus one 32 px stepper row)       |
| D's chip press, then the card's `›` three times                                         | Havana Beach → Folie Marine → Dhërmi Sun Club → Havana Beach                    |
| Focus on the `6` crowd's control, then a wheel zoom that splits it (`6` → `5` + Livadh) | **B:** the button is rebuilt, focus is lost. **D:** same element, still focused |

## Since the first pass: `main` now writes the price on every pin (#1137)

The branch carries `main` as of #1137, merged after the verdicts below were written. That change
alters the premise the prototype started from, in three ways the verdicts should be read with:

- **The production pin is no longer an anonymous 44 px dot.** It is a 44 px-high pill wearing the
  venue's from-price (`€24`), widening with its text; `MapPin` gained an optional `badge`. A, B and
  C still draw the pre-#1137 disc (`MAP_CHROME_DISC` is that skin, lifted before the change), so
  their screenshots understate today's crowding: a pill 60–70 px wide overlaps its neighbour
  sooner than a 44 px disc does, and `CROWD_PX` would have to grow with the widest badge.
- **D's "pin itself" axis is now partly spent on `main`**, and in the direction of price rather
  than name. D's coin-and-lozenge is the natural home for both: the coin keeps the count, the
  lozenge can carry the venue's name and its from-price — which also closes D's "the card has no
  sets-free count" gap only if the card gains it too. That is a refinement of D, not a new variant.
- **B's one remaining advantage narrows.** With the price already on every pin, B's side-by-side
  price comparison is something the map now offers for free where pins do not crowd; the sheet's
  case rests on sets free and on crowds of four or more alone.

Nothing in this section was re-measured; it is the reading of a merge, and the next pass should
re-take the matrix with pins drawn at #1137's width before trusting any overlap number above 44 px.

## The first pass's claims, checked

Each line of the first pass's verdict was taken as a claim. Where the second pass disagrees, it says so.

**Claim 1 — the port needs exactly two additions, `project` and `onMove`, and nothing else.**
**Holds for the port.** D needed nothing more from it. But "nothing else" is wider than the port:
D needed the map box's size (a `ResizeObserver` the host already runs, now reporting its size) and a
`stack` input on the page's preview card. Neither touches the seam; both are above it.

**Claim 2 — the "re-adding a marker detaches its element" constraint dissolves, because
`@for … track` keeps each element across a re-group.** **Disagree, as written.** All three variants
nest the pin loop under `@for (cluster …; track cluster.key)`, and a cluster's key is its membership.
So a camera move that _keeps_ every membership keeps every element — but a move that re-groups a
crowd rebuilds that crowd's subtree, buttons and focus included. Measured: focus a crowd's control,
zoom until the crowd splits, and B has lost it. The claim is true only of a flat pin loop keyed by
pin id, which D is, and which is what should graduate. The constraint does dissolve in the overlay,
but not for free.

**Claim 3 — zoom-to-separate is refuted at `maxZoom` 16, the Dhërmi three still ~22 px apart.**
**Holds in substance; the number is off, and the refutation is of a fence, not of physics.** The
three project 25.5, 29.9 and 37.1 px apart — all under a finger, so the conclusion stands. But
`maxZoom` 16 is a setting in `RIVIERA_MAP_OPTIONS`, and MapLibre overzooms vector tiles: at 18 the
same three would sit 100–150 px apart. What actually rules zooming out is the opening view, where 13
of 14 venues are crowded and a pair would cost the tourist seven zoom levels. No variant should zoom;
the reason is the scale table in the issue, not the fence.

**Claim 4 — at the opening view, 14 venues yield 4 crowds and 4 reachable pins.** **Wrong on the
second number.** Four crowds, yes — and _one_ solo pin (Radhimë), because Livadh joins the Jale
crowd and Borsh joins Porto Palermo. The first pass's own `a-riviera-view.png` showed exactly this.
The corrected fact strengthens the point: crowding is the default rendering, 13 of 14.

**Claim 5 — build B, revisit C fenced, drop A.** **Half holds.** _Drop A_ and _C collapses at the
opening view_ are confirmed by measurement (A's fan is five identical dots; C's displaced pins land
19.8 px apart). _Build B_ is where the second pass disagrees — see the recommendation.

## Verdicts

**A — Stack & fan.** As the first pass found: honest before the press, never dissolves, and the fan
reveals five identical dots. Confirmed at all four scales and on the phone. Drop.

**B — Stack sheet.** The only variant that shows all of a crowd's deciding facts side by side —
name, sets free, price — and it touches no map geometry. Its costs are larger than the first pass
recorded: the sheet takes **half** the phone map and already scrolls at five rows (three in view),
the pins under it stay anonymous, a venue is three presses from the funnel, and its control is the
_crowd_, so it has no identity across a re-group and the keyboard order changes from n stops to one
plus a menu. Capping the sheet to a third, as the first pass proposed, leaves two rows in view.

**C — Tethered fan.** Best where the tourist actually is, and worst at the view every tourist starts
on: at the opening view its rings overlap at 19.8 px, the defect recreated. Confirmed. Fenced to small
isolated crowds it remains the nicest treatment of a pair at beach scale, but it is a refinement, not
an answer.

**D — Named pins, press again.** The strongest at the scale the report is about — a pair or a
triple: one press opens a venue's full card (photo, rating, price, the funnel link), one more flips
to the other, the pin said who was there before either press, and the map stays two-thirds visible. It is
also the only variant whose controls are the pins themselves, so nothing is rebuilt on a re-group
and the keyboard walks exactly what it walks today. Its costs are real and they grow with n: choosing
between five venues means five cards in sequence rather than one list, the preview card carries no
"sets free" count (the list card does), the first member of a crowd is feed order rather than
anything the tourist would sort by, and a label yields wherever it does not fit — on a phone at the
opening view the `6` and the Borsh pair show as bare counts.

### Recommendation

**Build D.** It answers the report as reported — "you cannot choose between those two if you have
bigger fingers" — with the least new surface, no new map geometry, no list, and a pin that informs.
Three things to settle when it is rebuilt test-first, all visible in the prototype:

1. **Order the crowd by something the tourist would choose by** (sets free, then price), so "the
   first" is a sensible default and "press again" is a real ranking, not feed order.
2. **Add the sets-free count to the preview card** — the one deciding fact B shows and the card does
   not. Independent of this issue and worth doing anyway.
3. **Keep the flat, pin-keyed loop.** It is the difference between claim 2 being true and false.

**The named hybrid, if crowds of four or more turn out common at beach scale:** D's chip stays the
control everywhere, and a press on a crowd of **n ≥ 4** answers with B's sheet instead of a card.
The chip already says `Jale 5` before the press, so the tourist can predict which they will get. In
the fixture only Jale reaches that at beach scale; the `6` at the opening view spans two beaches and
is a beach choice, not a venue choice. Measure real venue density before paying for two surfaces.

**Not built, worth noting:** at the opening view a crowd is really a _beach_, and the filter bar
already disambiguates beaches. A press that sets the Beach filter and fits the camera to it would
make the list beside the map the chooser at that scale — a fifth axis, left for a later pass.

_Verdict recorded on issue #1134._
