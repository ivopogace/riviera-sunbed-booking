# Prototype — overlapping venue pins (#1134)

**Throwaway.** Nothing in this folder merges to `main`. Three branches carry it: the first pass
(`claude/prototype-1134-tailwind-angular-cd32pp`, variants A–C and its verdict), the second
(`claude/prototype-1134-variant-d-z5i3v1`, which re-ran the three, added D and re-judged all four),
and this third pass (`claude/prototype-1134-variant-e-w9clbm`), which re-baselined every pin to the
width `main` draws since #1137, re-ran A–D at that width, built a fifth variant and re-judged all
five. The _decision_ is what graduates, rebuilt test-first through the normal loop.

> **The question:** when several venue pins crowd the same spot, how does the tourist reach any of
> them? Five variants, on the real Discover page, over the real riviera map.

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

## The re-baseline: every pin at #1137's width

`main` now paints each venue's from-price on its pin as a 44 px-high pill that widens with the
text (`MapPin.badge`, `VENUE_PIN_CLASSES`). The first two passes drew the pre-#1137 44 px disc, so
their overlap numbers understated today's crowding. Before judging anything, this pass made the
prototype pins the production pins and re-took the matrix. What changed, measured:

| What                                                 | Before (44 px disc)                    | Now (#1137's pill)                                                                                           |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A pin's rendered box                                 | 44 × 44                                | **57 × 44** for a two-digit euro price (every fixture venue), 67 × 44 for three digits, 44 × 44 bare         |
| The crowding rule (`pin-crowding.ts`)                | centre distance < `CROWD_PX` (44)      | the pills **overlap**: across, closer than half their widths together; down, closer than 44                  |
| `CROWD_PX`                                           | 44, the finger                         | **stays 44** — the pin's height, the bare pin's width, the fan's minimum chord; the width is per pin         |
| Opening view, 14 venues                              | 4 crowds (`3`, `6`, `2`, `2`) + 1 solo | **3 crowds (`9`, `2`, `2`) + 1 solo** — Dhërmi, Jale and Livadh merge into one nine-venue, three-beach crowd |
| Venues crowded at the opening view                   | 13 of 14                               | 13 of 14 — the same count, in a bigger blob                                                                  |
| Dhërmi three at `maxZoom` 16, pin-to-pin             | 25.5 / 29.9 / 37.1 px                  | unchanged (positions do not move; the wider pill only buries more of each)                                   |
| A's fan at Jale                                      | five identical dots                    | **five price pills** (`€20 €26 €16 €31 €22`) — #1137 healed A's worst fault for free                         |
| C's closest pins from different crowds, opening view | 19.8 px                                | **32.0 px** — the ring grew with the chord; still under a finger, and the nine-ring now lies by ~10 km       |
| B's sheet on a phone, Jale                           | 50 %, 3 of 5 rows                      | unchanged; at the opening view it would list nine                                                            |
| D's card on a phone, Dhërmi                          | 35 %                                   | 33 %                                                                                                         |
| D's lone chip                                        | coin + name lozenge                    | **price pill + name lozenge** (`€17 · Radhimë Riva`, 181 px wide) — the #1137 refinement, built              |
| Focus across a re-group (`9` split by a wheel zoom)  | B lost, D kept                         | B lost, D kept, **E kept**                                                                                   |

Where the pill's width comes from: measured in the browser with production's own classes, and
reproduced per pin by a canvas text measurement (`pinWidth`), so a `€120` venue would crowd sooner
than a `€9` one, as it does on `main`. The fan chord (A, C) and B's hit blob grew to the crowd's
widest pill. Nothing else in A–D changed; each variant's screenshots and numbers below are at the
new width.

## The five

|                                 | Idea                                                                                                           | Primary affordance          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **A** `variant-stack-fan.ts`    | Merge the crowd into a counted disc; fan it open on a press                                                    | press the count             |
| **B** `variant-stack-sheet.ts`  | Leave every pin where it is; a press resolves to a _set_, answered by a list                                   | press the blob              |
| **C** `variant-tethered-fan.ts` | Push crowded pins apart permanently, tethered to their true point                                              | press the one you want      |
| **D** `variant-named-cycle.ts`  | Every pin says what is there; a crowd's press opens the first venue's card, and pressing again walks the rest  | press the name, press again |
| **E** `variant-place-pill.ts`   | A crowd is a _place_; its pill says which, and pressing it goes there — the camera and the Beach filter follow | press the place             |

A, B and C occupy _merge_, _defer to a list_ and _displace_; D takes _the pin itself_ and _time_;
`main` itself now spends "the pin carries a fact" on the price. E goes elsewhere: **scale, and the
page around the map**.

- **The crowd's pin is a place, not a stack.** At the opening view a crowd is a beach (or three);
  at beach scale it is a strip of sand. E's pill says so: one pill in the map chrome's own skin — the
  priced pin's shape grown a name and a count — reading the beach (`Dhërmi`, `Jale & Livadh`,
  `3 beaches`), the crowd's own from-price (`from €16`, the least of its members', the same fact the
  lone pin carries) and, in an inverted disc, how many are there. Pills declutter biggest place
  first: one that would run over another pill, a lone pin or the box's edge shows its count alone.
- **Pressing a place goes there.** The camera eases (a cut under reduced motion) to the smallest zoom
  at which no two members bury each other, capped by `maxZoom` and by the box, and when every member
  is on one beach the **Beach filter follows**, so the list beside the map — the List tab on a phone
  — becomes that beach's venues and the count block reads `5 venues`. Where the members separate
  they are then ordinary priced pins, prices side by side, exactly as `main` draws them. Where the
  crowd spans beaches (the nine) the camera goes to the coast and the beaches come apart into their
  own places; a second press continues. Each press replaces the zoom levels the tourist would
  otherwise pinch through and lands exactly.
- **Where no zoom separates them, the list is the chooser.** At Dhërmi the members are 25 px apart
  at `maxZoom`; the pill knows (the separation zoom is where the camera already is), inverts, and its
  second line reads `Open the list`. That press narrows the filter to the beach and hands over: on a
  desktop the list beside the map is now those three cards, first card focused; on a phone the page
  switches to the List tab, first card focused. Nothing is merged, displaced or opened over the map.
- **Keyboard parity is kept.** A crowd stays n real buttons in feed order, keyed by pin: the pill is
  the first member's button, the others are invisible at the same spot until focused, and each opens
  its venue's preview directly. One element per member whatever it currently shows (pill, priced pin,
  hidden member), so a press that changes its kind keeps focus — measured through a fit, a re-group
  and a filter narrowing.

E touched one thing beneath the seam that D did not: the map port gained a third prototype addition,
`easeTo(view)` (both adapters, ~6 lines each; the fake cuts). It touched nothing on the preview card.
The page's part — the filter set, the list switch, the focus move — is ~30 lines in `home.ts`.

### E's design pass, recorded

The `frontend-design` two-pass process, run before the first line of template.

**Plan.** _Subject:_ the riviera as a tourist first meets it — a coast of beaches, then a beach of
venues. _Colour:_ the map chrome's fixed pair only, `--riv-solid-btn-fill` / `-ink` / `-border`
(theme-invariant, on imagery), inverted for the "here" state exactly as `main` inverts a selected
pin; no accent on the map — the accent belongs to the glass surfaces and the list's selected outline.
_Type:_ the system stack; beach name 12.5 px / 600 (D's lozenge and the card's location line); the
from-price 11 px / 800 tabular — the pin badge's own weight one step down, so it reads as the same
fact; the count 12.5 px / 700 in a 26 px disc. _Layout:_ a single 44 px two-line pill centred on the
place, `Dhërmi` over `from €18`, the count disc at its right; `-50% -50%` translate so the place is
the pill's middle, as a priced pin's venue is. _Principle:_ the crowd pill is the priced pin's own
shape grown a name; the memorable thing is the camera going where the tourist pressed, not the pill.

**Review against the brief.** The generic answer to overlapping markers is a numbered cluster disc
whose press zooms in one step (Leaflet.markercluster's default). Three things in the plan were that
default and were changed: the disc became a pill that names the place and its price, because a bare
count is what A already showed and what the tourist cannot decide on; the zoom step became the
_separation_ zoom, computed per crowd, because a fixed step at Dhërmi zooms to nothing; and an end
state was added for a crowd zoom cannot separate, because the default has none — it just stops. Two
things were cut in review: a tether or coin marking the exact point (the fit makes it moot), and an
extra glyph for the "here" state (the inverted skin plus the copy `Open the list` carries it). The
first sketch was D's coin-and-lozenge with a price added; it was dropped for one pill so E is not
read as D with a different press.

**Self-critique, after the screenshots.** (1) A pill at the box's edge collapses to a bare count
(`2` at Ksamil on the phone's opening view) — D's tail-side flip would keep the name; worth taking.
(2) After the nine-press the Dhërmi `3` sits compact at the left edge, because the fit centres the
crowd's mean and pads for pins, not pills; padding for the widest pill would keep it whole. (3) The
Beach filter set as a side effect is honest on the page (the select shows `Dhërmi`, the count block
`3 venues`) but the other beaches' pins vanish from the map until `All beaches` — the existing
behaviour of the filter, now reachable from the map; a `Dhërmi ×` crumb on the map would make the
way back obvious. (4) Three presses from the opening view to Jale's five pins is the cost of a
nine-venue, three-beach blob; each press is a zoom the tourist would have made by hand.

## The evidence

`screenshots/`, all from the real map with the real riviera tiles, taken by `screenshots.mjs`. The
phone shots are 390 × 844 with the Map tab open; the switcher bar is hidden in every shot.

| Shot                                                      | What it shows                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `{a,b,c,d,e}-riviera-desktop.png`                         | the opening view, desktop: 14 venues collapse to `9` / `2` / `2` and **one** solo pin, at the pill's width              |
| `{a,b,c,d,e}-{riviera,dhermi,jale,ksamil}-phone.png`      | the four scales on a phone — the matrix every verdict below is judged on                                                |
| `a-jale-fanned-phone.png`                                 | A opened on Jale — five price pills on a ring, no names                                                                 |
| `b-jale-sheet-phone.png`                                  | B's sheet on Jale — the facts to choose, half the map gone, three of five rows in view                                  |
| `c-riviera-phone.png`                                     | C at the opening view: a nine-pill ring around Himarë, 32 px from the Borsh pair's ring, ~10 km from the truth          |
| `d-riviera-open-phone.png`                                | D at the opening view with the nine open: `1/9 · Havana Beach`, the card, a stepper over three beaches                  |
| `d-dhermi-open-phone.png`                                 | D at Dhërmi, `maxZoom`, walked to the second venue: the chip names it, the card steps                                   |
| `e-riviera-pressed-phone.png`                             | E after one press on the nine: the coast, `3` (Dhërmi) and `Jale & Livadh · from €16 · 6` apart, Borsh and Qeparo alone |
| `e-jale-narrowed-phone.png`                               | E after three presses from the opening view: Beach = Jale, five priced pins 69 px apart, the map kept                   |
| `e-jale-pressed-phone.png` / `e-ksamil-pressed-phone.png` | E from the Jale and Ksamil cases after one press: production's pins, separated                                          |
| `e-dhermi-list-phone.png`                                 | E at Dhërmi after one press: the List tab, Beach = Dhërmi, `3 venues`, focus on the first card                          |
| `e-dhermi-list-desktop.png`                               | the same on a desktop: the list beside the map is the three cards, the map keeps the inverted `Dhërmi · Open the list`  |

Measured, not eyeballed (`npm run prototype:1134:shots` prints them):

| Measurement                                                        | Value                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Dhërmi three at `maxZoom` 16, projected pin-to-pin                 | 25.5 px, 29.9 px, 37.1 px — all under one 44 px finger, and under half a pill                                                        |
| Opening view, 14 venues, at the pill's width                       | 3 crowds (`9`, `2`, `2`) and **1** solo pin: 13 of 14 venues crowded, nine of them in one blob spanning three beaches                |
| C at the opening view, closest pins from different crowds          | 32.0 px (Jale Beach Bar ↔ Borsh Long Beach) — the defect, recreated                                                                  |
| B's sheet on a phone, Jale                                         | 50 % of the map's height; 3 of 5 rows in view without scrolling                                                                      |
| D's card on a phone, Dhërmi, crowd open                            | 33 % of the map's height                                                                                                             |
| D's chip press, then the card's `›` three times                    | Havana Beach → Folie Marine → Dhërmi Sun Club → Havana Beach                                                                         |
| E's pills at the opening view, phone                               | `3 beaches · from €16 · 9` 126 × 44; `Borsh & Qeparo · from €14 · 2` 166 × 44; Ksamil compact `2` 44 × 44 (at the edge)              |
| E, one press on the nine                                           | camera at the coast; `Dhërmi 3`, `Jale & Livadh 6`, Borsh and Qeparo alone; filter untouched (three beaches); **focus kept**         |
| E, three presses from the opening view (`9` → `6` → `Jale 5`)      | Beach = Jale, `5 venues`, five priced pins, closest **68.7 px**; focus kept on the pressed pill, now Jale Beach Bar's pin            |
| E, opening view → a chosen Jale venue's card                       | 4 presses (D: 1 press opens Havana Beach's card; a chosen Jale venue is up to 9 presses of press-again)                              |
| E at Ksamil (zoom 14), one press                                   | Beach = Ksamil, two priced pins **70.6 px** apart; the card is the 2nd press, the funnel the 3rd (D: 1 / 2, and 2 / 3 for the other) |
| E at Dhërmi (`maxZoom`), one press, phone                          | List tab, Beach = Dhërmi, `3 venues`, focus on Havana Beach's card — which is the funnel link, so the funnel is press 2              |
| E at Dhërmi (`maxZoom`), one press, desktop                        | the list beside the map is the three cards, first focused; the map stays, 0 % covered                                                |
| Phone map covered while choosing at Dhërmi                         | B 50 %, D 33 %, **E: the List tab replaces the map**                                                                                 |
| Focus on the `9` crowd's control, then a wheel zoom that splits it | **B:** rebuilt, focus lost. **D:** same element, still focused. **E:** same element, still focused                                   |

## The second pass's claims, checked at the new width

Each line of the second pass's verdict was taken as a claim. Where this pass disagrees, it says so.

**Port needs exactly `project` + `onMove`; D needed nothing more.** _Holds for D, not as a general
statement._ E needed a third addition, `easeTo`, because a variant that moves the camera on the
tourist's behalf needs to move it visibly. Still ~6 lines per adapter.

**Only a flat pin-keyed loop keeps a crowd's buttons across a re-group (measured on B vs D).**
_Confirmed, and sharpened._ E kept focus through a camera fit, a re-group and a filter narrowing —
but only once each member had **one element whatever it shows**: E's first draft rendered the pill
and the priced pin as two `@if` branches, and the press that turned a pill into a pin dropped focus
to `<body>`. Keyed-by-pin is necessary; one element per pin across its states is the rest of it.

**Opening view: 4 crowds (`3`, `6`, `2`, `2`) and one solo; 13 of 14 crowded; expect worse at
#1137's width.** _Worse, as predicted, in shape rather than count:_ 3 crowds (`9`, `2`, `2`) and one
solo, still 13 of 14. The `3` and the `6` merged into a nine-venue crowd spanning three beaches,
which is the case every variant below is now judged on first.

**Dhërmi three at `maxZoom` 25.5 / 29.9 / 37.1 px; zooming is ruled out by the opening view; do not
build a zoom-to-separate variant.** _The numbers hold._ The instruction I read differently: what is
ruled out is asking the tourist to zoom by hand through seven levels to find a pair. E zooms _for_
them, in one press, to the zoom that separates the crowd — and it knows when no zoom does (Dhërmi)
and does something else. That is not the variant the second pass warned against; it is the reason
the warning was right.

**B's sheet covers 50 % of the phone map, 3 of 5 rows; D's card 33 %.** _Holds_ (D measured 33 %,
was 35 %). At the opening view B would now list nine rows, three in view.

**C's rings at the opening view land 19.8 px apart — the defect recreated.** _Holds, worse:_ 32.0 px
now (the chord grew to the pill), still under a finger, and the nine-ring's pills sit ~10 km from
the venues they stand for.

**Drop A.** _Agree, with one correction:_ #1137 fixed A's "five identical dots" — the fan is now five
prices. It still never dissolves, still costs a press at every zoom, still names nothing, and at the
opening view fans nine prices from three beaches into one circle.

**C a refinement.** _Agree._ At Dhërmi, C is still the nicest picture of three venues 20 m apart.

**Build D; B's sheet in reserve for n ≥ 4.** _Disagree at the new width — see the verdicts._ The `9`
turned D's press-again from a three-step walk into a nine-step walk across three beaches. B's reserve
case narrows: every n ≥ 4 crowd in the fixture separates in one E press (Jale), leaving only an
inseparable n ≥ 4 crowd, which the fixture does not have.

**D's known costs: sequential comparison for big crowds, no sets-free count on the card, feed
order, labels yield.** _All confirmed;_ the first is now the opening view's normal case.

**#1137 reading: D's "pin itself" axis is partly spent, in the direction of price; the lozenge is the
natural home for name + price; B's price comparison is now free on uncrowded pins.** _Agree on all
three, now measured:_ D's lone chip with the price coin is 181 px wide for `Radhimë Riva` and crowds
sooner than the pill alone. And E extends the third point: after one press a crowd's prices are side
by side on production's own pins, with nothing built.

## Verdicts

**A — Stack & fan.** Better than before (the fan now carries prices) and still not an answer: no
names, a press at every zoom, never dissolves, and the nine at the opening view fan into a circle of
prices from three beaches. Drop.

**B — Stack sheet.** Unchanged mechanism, worse premise: under the blob nine pills now smear into one
another (`b-riviera-phone.png`), and the sheet for it lists nine, three in view. It remains the only
variant that shows sets free, and the only one with no geometry. Its case is an inseparable crowd of
four or more, which the fixture does not contain.

**C — Tethered fan.** Best where the tourist is (Dhërmi), worst where every tourist starts: the
nine-ring is 32 px from its neighbour and 10 km from the truth. Confirmed, worse. A refinement.

**D — Named pins, press again.** Still the best treatment of an _inseparable_ crowd on a phone: one
press opens a real card, one more flips to the neighbour, the map stays two-thirds visible, the pin
said who was there. Its lone chip now says name and price. But its answer scales with n and with the
number of beaches in the crowd, and at the new width the opening view puts nine venues from three
beaches under one chip: `1/9 · Havana Beach` and a stepper over the whole coast. D is a beach-scale
answer being asked a riviera-scale question.

**E — Place pill.** The only variant with a sane answer at the opening view: one press and the coast
comes apart into its beaches, with prices on every place. At beach scale it costs one press more
than D to a first card and gives production's own pins, prices side by side, in return; the Beach
filter following the press makes the list beside the map the chooser on a desktop for free. Its
costs: three presses from the opening view to Jale's pins; the filter set as a side effect; a pill at
the box's edge losing its name; and, at an inseparable crowd on a phone, leaving the map for the
List tab — where D keeps it. It adds the least surface of the five (a pill, a camera fit, the
existing filter and list; no card change, no sheet) and one port method.

### Recommendation

**Build E.** It answers the report as reported — "you cannot choose between those two if you have
bigger fingers" — at every scale, and it answers the opening view, which is where 13 of 14 venues
sit and where D and B break at the new width. Its mechanism is the page's own: the camera, the Beach
filter, the list. Three things to settle when it is rebuilt test-first, all visible in the prototype:

1. **Decide the inseparable-crowd hand-over on a phone.** As built, `Open the list` leaves the map —
   defensible, because at Dhërmi the riviera map has nothing more to say and the list has every
   deciding fact. If the phone should stay on the map, the **named hybrid is E + D**: E's pill and
   travel everywhere, and at a place that cannot separate, D's press-again (first card at once, press
   again to walk) with the filter already narrowed. It costs D's stepper back on the card.
2. **Keep the way back visible.** The filter set from the map needs a `Dhërmi ×` crumb on the map
   (or the count block's beach name as a control) so `All beaches` is one press away from where the
   tourist is looking.
3. **Declutter by tail side, not collapse** (D's rule), so a pill at the box's edge keeps its name;
   and pad the fit for the widest pill, not the pin.

**Did the second pass's verdict hold at the new pin width?** No. _Build D_ rested on the opening
view being four crowds of at most six, and on the chip being D's own; at #1137's width the opening
view is one crowd of nine across three beaches, D's press-again walks all nine, and the pin already
carries the price E's pill aggregates. D keeps its beach-scale strengths and is the right half of the
hybrid above; it is no longer the answer on its own.

_Verdict recorded on issue #1134._
