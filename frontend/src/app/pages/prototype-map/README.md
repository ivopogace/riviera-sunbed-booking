# PROTOTYPE — where the riviera map goes on desktop

**Throwaway. Spike branch only (`claude/map-design-prototype-417sh1`); nothing here merges to
`main`.** Ten desktop layouts for the riviera map on Discover, on one route, so they can be
judged against each other and against what ships today: round 1's four (A–D, below), round 2's
three (E–G, § _Round 2_), which start from what round 1's screenshots showed, and round 3's three
(H–J, § _Round 3_), which start from the subject instead of from a layout.

```
npm start           # from frontend/
open http://localhost:4200/prototype/map-desktop?variant=A
```

`←` / `→` or the floating bar cycles the variants. Every state is in the URL:
`?variant=C&beach=DHERMI`, `?variant=D&open=22`, `?variant=B&region=HIMARE&date=2026-09-20`.
Venues come from `prototype-venues.ts` (26 fixtures along the real coast), so no backend is
needed; the map itself is the real `app-riviera-map` against the real `platform/map` tiles, which
`./gradlew bootRun` serves at `/map/**`.

## The question

Desktop wastes the map. Measured on the shipped page at 1440 × 900 and 1920 × 1080:

|              | shipped                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| Container    | capped at `max-w-[1080px]` → **840 px of empty gutter at 1920**               |
| Map width    | 42 % of 1080 ≈ **430 px** on any screen ≥ 1080                                |
| Map top edge | y ≈ 845 px at 1440 × 900 — **below the fold**; a ~55 px sliver on first paint |
| Hero         | 640 px of the first screen for a headline, an intro and nothing else          |
| Card columns | 2, in a 620 px column, whatever the screen                                    |

So the thing the product is _for_ — "pick the exact spot on a visual map" — is the smallest,
last-seen element on the page. Mobile is not better: at 390 × 844 the first screen is hero +
filters, with no map, no venue and no card in it at all.

## What is fixed, and what each variant is free to change

The visual language is **not** the question and is not re-opened: the Liquid Glass tokens
(`--riv-*`), the type scale and the three themes are the brief. Every variant consumes the shipped
tokens and shipped primitives (`appCardGlass`, `appPanelGlass`, `appSemanticChip`,
`appAmenityChip`, `appTouchTarget`, `app-riviera-map`, `app-venue-pin-layer`,
`app-beach-map-canvas`) and adds no colour of its own.

What a variant may throw out: the page's width cap, the hero, where the map sits, what the
primary affordance is, and whether the filters stay a row of selects.

## The four

### A · Shoreline — _two panes, full bleed_

```
┌──────────────────────────────────────────────────────────────┐
│ header                                                       │
├────────────────────────────────────┬─────────────────────────┤
│ one-line hero + filter bar         │                         │
│ ┌───────────┐  ┌───────────┐       │   MAP, full height      │
│ │ card      │  │ card      │       │   own scroll context    │
│ └───────────┘  └───────────┘       │   clamp(520,44vw,900)   │
│ ┌───────────┐  ┌───────────┐       │                         │
│ │ card      │  │ card      │       │   [pins · place pills]  │
│ └───────────┘  └───────────┘       │                         │
│ … list scrolls, map does not …     │                         │
└────────────────────────────────────┴─────────────────────────┘
```

The expected pattern, with the three measured faults fixed: no width cap, the hero down to one
band so the map is above the fold, and each pane scrolling on its own. It claims nothing new about
hierarchy — list and map are peers. Its argument is cost: it is the smallest diff from today.
Map area goes from ~240 000 px² to ~527 000 px² at 1440.

### B · Chart table — _the map is the page_

```
┌──────────────────────────────────────────────────────────────┐
│ header (glass)                                               │
│ ░░░░░░░░░░░░░░ MAP, FULL BLEED, THE WHOLE PAGE ░░░░░░░░░░░░░ │
│ ┌────────────────────┐                                       │
│ │ glass rail         │      pins on the real coastline       │
│ │  headline          │                                       │
│ │  filters           │                                       │
│ │  ─────────────     │                                       │
│ │  ▦ venue row       │  ← the rail scrolls; the map never    │
│ │  ▦ venue row       │    moves out from under it            │
│ │  ▦ venue row       │                                       │
│ └────────────────────┘                                       │
└──────────────────────────────────────────────────────────────┘
```

The argument is the **material**. Liquid Glass is a backdrop material, and today
`backdrop-blur-[26px]` sits over a near-white page gradient — there is nothing to blur, so every
glass surface reads as flat translucent white. Put the real coast behind it and the design
language finally does the job it was chosen for. Cost: a 400 px rail forces a denser card (photo
at 76 px, one row per venue) — a real editorial loss.

On a phone the rail becomes a bottom sheet over the same full-bleed map, which is the mobile
suggestion: the map is never traded away by a List/Map toggle.

### C · Coast index — _the coast is the navigation_

```
┌──────────────────────────────────────────────────────────────┐
│ header                                                       │
├──────────┬────────────────────────────────┬──────────────────┤
│ NORTH ↓  │                                │ Dhërmi           │
│ Shkodër  │                                │ 3 venues · Fri…  │
│  Velipojë   €14  1 │        MAP           │ ┌──────────────┐ │
│ Lezhë    │      full height               │ │ ▦ venue      │ │
│  Shëngjin   €16  2 │                      │ ├──────────────┤ │
│ Durrës   │                                │ │ ▦ venue      │ │
│  Golem      €13  3 │                      │ └──────────────┘ │
│ Himarë   │                                │                  │
│ [Dhërmi]    €24  3 │  ← press: the map eases to that beach's │
│  Jalë       €23  2 │    own recorded camera, the list narrows│
│ ↓ SOUTH  │                                │                  │
└──────────┴────────────────────────────────┴──────────────────┘
```

The one that comes from the subject rather than from another product's map page. The riviera is
not a city — it is a ~200 km line, and `shared/beaches.ts` already declares its 36 beaches in
"the order a tourist reads the coast", north to south, each with a recorded camera. So the coast
itself becomes the instrument: region by region, every beach with its venue count and its
from-price, all visible at once — which a `<select>` can never show.

Two things go on purpose. The **hero headline**, because a sentence claiming "this is a coast,
pick a place on it" above an instrument that says it better is the label-above-content tell. And
the **Beach and Region selects**, because the rail is both of them.

Note this needs no new backend and no geocoding: pressing a rail row is the capability #1141
already shipped, with a better control on it.

### D · Both maps — _coast to exact sunbed, one page_

```
┌──────────────────────────────────────────────────────────────┐
│ header                                                       │
├──────────────────────────────┬───────────────────────────────┤
│ filter bar                   │ ← All venues                  │
│ ┌──────────────────────────┐ │ ▓▓ photo · Dhërmi Sun Club ▓▓ │
│ │                          │ │ Pick your set  19 of 22 free  │
│ │      RIVIERA MAP         │ │ ┌───────────────────────────┐ │
│ │      full height         │ │ │ ▲ FACING THE SEA          │ │
│ │                          │ │ │ A ▢▢▨▢▢▢   €43 front row  │ │
│ │      [pins]              │ │ │ C ▢▨▢▢▢▢   €31 middle     │ │
│ │                          │ │ │ F ▢▢▨▢▢▢   €24 promenade  │ │
│ └──────────────────────────┘ │ └───────────────────────────┘ │
│                              │ from €24/set  [See the beach] │
└──────────────────────────────┴───────────────────────────────┘
```

The only variant that changes what the page is _for_. The pitch is "pick the exact spot", and
today that costs a page change: riviera map on Discover, then the venue's beach map on
`/venues/:id`. On a phone that is right — there is only room for one map. On a 1440 desktop there
is room for both, so D spends the width on the funnel instead of on more cards: press a pin and
that venue's set grid opens beside the coast, with the price zones, the taken sets and the CTA.

Honest constraint, visible in the screenshot: a real beach runs 12–20 sets wide and the panel is
~520 px. `fitWidth` shrinks the tile to its clamp and then the grid pans — "drag or swipe to see
the whole beach" is doing real work there.

## The finding that outranks the layout choice

**The map pane has to be portrait — about 5 : 4 or taller — or the whole coast cannot be framed
at all.** Not a preference; it falls out of the app's own tile fence.

`RIVIERA_MAP_OPTIONS.maxBounds` (ADR-0022) is 2.2° of longitude wide. A pane cannot zoom out past
the point where its viewport would exceed that, so **pane width sets a zoom floor**, and that
floor sets how much latitude fits. The coast spans 2.08° of latitude. Solving
`h / (512 · 2^z) ≥ coastY` with `2^z = 360w / (512 · 2.2)`:

> **h / w ≥ 0.00762 · 360 / 2.2 ≈ 1.25**

Independent of viewport size. At 1440 × 900:

| Pane                   | w × h      | aspect   | fence floor z | latitude in frame | whole coast? |
| ---------------------- | ---------- | -------- | ------------- | ----------------- | ------------ |
| shipped (42 % of 1080) | 430 × 560  | 1.30     | 7.10          | 2.17°             | yes          |
| **A** two-pane         | 634 × 832  | **1.31** | 7.66          | 2.18°             | **yes**      |
| **D** map + spot panel | 790 × 734  | 0.93     | 7.98          | 1.55°             | no           |
| **C** coast index      | 830 × 832  | 1.00     | 8.05          | 1.67°             | no           |
| **B** full bleed       | 1440 × 832 | 0.58     | 8.85          | 0.96°             | no           |

So the shipped page's narrow map is the one thing about it that was _right_ — it was just far too
small. And "make the map bigger by making it wider" is the one move that cannot work here.

Consequences, in order of how much they should change the decision:

1. **A is the only variant that can keep a whole-coast default view.** B, C and D must open at
   region or `Near me` scale, or on a camera fitted to the result set.
2. That is probably fine, and arguably better: a tourist filters. Every variant looks its best
   filtered — compare `?variant=B` with `?variant=B&region=HIMARE`. The whole-coast view is a
   first-paint orientation shot, not where anyone books from.
3. **The fixed camera has to go regardless of which layout wins.** `RIVIERA_MAP_OPTIONS`' zoom 8.6
   on {19.75, 40.05} was tuned for the 430 × 560 pane; at any other size the extra area goes to
   inland Albania. `prototype-camera.ts` derives it from the pane and the pins instead, needing
   only `MapHandle.easeTo` — no port change. Two numbers in it are findings of their own: the
   world is `512 · 2^zoom` px because `style.json` declares no `tileSize` and MapLibre defaults a
   **vector** source to 512 (assuming 256 asks for a zoom exactly one level too tight), and the
   fit is capped at zoom 14 because three venues 20 m apart otherwise fit at the ceiling of 16,
   which shows driveways and no sea.
4. **At 1440, A's whole-coast view is fence-bound with ~24 px of vertical slack**, so a place pill
   at the far north or south grazes the frame. Either widen the ADR-0022 bbox, accept it, or open
   at region scale — which (2) argues for anyway.

## Verdict

**Ship A's geometry; ship C's instrument.** They are not rivals — A is a layout, C is a control,
and C's rail is the strongest thing in the prototype while its three-column geometry is the
weakest. A two-pane full-bleed page (A) whose left column leads with the coast rail (C) instead
of two selects keeps the only aspect ratio that frames the coast _and_ the navigation that suits
a 200 km line, and it gives up nothing but the Beach/Region dropdowns.

**B is the one to look at hardest before rejecting**, because it is the only variant that makes
the design system's own material make sense, and because it is the right answer on mobile whatever
happens on desktop. Its cost is the denser card and a camera that can never show the whole coast.

**D is a separate product decision, not a layout one.** Worth its own issue: it removes a page
change from the funnel, and nothing about A, B or C blocks it later.

**Mobile, since it was asked about:** replace the List/Map toggle with B's sheet over a full-bleed
map (peek → half → full). The toggle currently makes the map an either/or; the sheet makes it the
ground. Today's first phone screen contains no map, no venue and no card — that is the thing worth
fixing, not the toggle's styling.

## Round 2

Round 1's geometry and camera findings stand and are built on. Its verdict does not, and the
reason is in its own screenshots.

### What round 1 got wrong

**Every whole-coast frame is mostly not the coast.** In `A-shoreline-1440.png` and
`C-coastindex-1440.png` the pins hug the left edge and roughly two thirds of the pane is inland
Albania — Elbasan, Berat, Korçë, Pogradec. That is not the camera's fault (round 1 fixed the
camera); it is geometry: the coast is a **line**, a rectangle that contains a line is mostly not
the line, and a north-up line running nearly north–south fills a portrait rectangle's height while
leaving most of its width empty. At region scale the same thing happens diagonally
(`B-charttable-1440.png`: the Himarë coast crosses from top-left to bottom-right and the two
other corners are mountains and open sea).

So round 1's aspect-ratio finding is right but it was used backwards. "h/w ≥ 1.25 or the whole
coast cannot be framed" only says which panes can show the _orientation shot_ — and round 1 itself
concluded the orientation shot is not where anyone books from (its consequence 2). It then ranked
A first for being the one that can show it. A layout should not be chosen for the view that
matters least.

**The verdict was never rendered.** "A's geometry with C's rail" was argued in prose. Variant G
builds it (`G-verdict-1440.png`): the rail takes 224 px of the left column, which leaves two card
columns in 560 px at 1440; the rail's twenty-two rows do not fit a 900 px viewport (Sarandë is
below the fold) exactly as C's did not; and the map is A's, still two thirds inland. It is C's
weaknesses without C's third column. At 1920 it is fine — but so is everything at 1920.

**Nobody asked which way up the map should be.** Three of the four variants moved the map around
the page; none turned it. That is the axis round 2 spends its boldness on.

### E · Horizon — _the coast turned to run left → right_

```
┌──────────────────────────────────────────────────────────────────────────┐
│ header                                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Find your spot on the Riviera.  26 venues on [date]   [Whole coast][Shkodër 1][Lezhë 2] … │ glass strip
├──────────────────────────────────────────────────────────────────────────┤
│ ↖N        Tirana   Elbasan   Berat        Gjirokastra          [Near me] │
│  Shëngjin●  ●€21 ●€16  Golem&Qerret●4                    Borsh●2  ●Ksamil│ MAP BAND, full width
│ €14●                                          ●€24 ●€22   5 beaches●9    │ sea at the foot,
│ ~~~~~~~~~~~~~~~~~~~~~~~~~~~ sea ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ │ north on the left
├──────────────────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   five columns at 1440,     │
│ │ card │ │ card │ │ card │ │ card │ │ card │   six at 1920; the page     │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   scrolls, the band stays   │
└──────────────────────────────────────────────────────────────────────────┘
```

The map is rotated so the sea lies at the bottom and the coast runs left to right, north on the
left — the view from the water, which is how a riviera is pictured anyway. With the line
horizontal, a **landscape** pane is finally the right shape, and that frees the layout: the map
becomes a full-width band in the hero's slot (46 vh, 414 px at 1440 × 900) under a one-row glass
strip, both sticky under the header, with the cards taking the whole width below in five columns.
Nothing is a pane beside anything, so no column is squeezed to make room for the map.

The coast index (round 1's strongest idea) is drawn _on the geography_ instead of beside it: in
`E-horizon-1440.png` all twenty-six venues sit along one line as the shipped place pills —
Shëngjin, Velipojë, Lalëz, Durrës, Golem & Qerret, Vlorë, Himarë's five beaches, Borsh, Ksamil —
readable left to right in the catalogue's own order, and the strip's region chips move the camera
along it. The Beach select goes: a beach is a pill on the band, and pressing one narrows the list
as shipped (`E-horizon-preview.png` shows a pin's preview, glass over water, in the band's corner).

Per region the band turns to that stretch's own bearing (`REGION_BEARING` in
`prototype-raw-map.ts`: 84–90° on the Adriatic where the sea is west, 36° on the riviera proper
where it is south-west), so the sea is always at the foot. `E-horizon-himare.png` is the case that
matters: Palasë to Borsh across the full 1440 with the bay of Himarë in the middle, nothing wasted
on either corner.

What it costs, honestly:

- **North is not up.** A compass pill says so and every ease keeps the sea at the foot, so the
  rule is learnable in one glance — but it is a rule, and a tourist who reads maps by north will
  notice. This is the one thing to user-test before committing.
- **The port has to grow.** `MapView` needs a `bearing`; the handle needs a fit that works in the
  rotated frame and a rotation-aware fence (both findings below); `beaches.ts` needs a recorded
  bearing per region beside its recorded views. `prototype-raw-map.ts` reaches past the port for
  all three today. No engine change, no new dependency.
- **The band is sticky, and that has a price at 900 px tall**: strip + band take 470 px, so
  scrolled cards get about 360 px of window (`E-horizon-scrolled.png`, one row visible). A
  non-sticky band is the alternative — the map scrolls away like a hero would — at the cost of the
  hover-a-card-light-its-pin link.
- **A full-width band eats the page's wheel.** Scrolling over it zoomed the map instead of the
  page (the first `E-scrolled` shot was a zoomed-out map and unmoved cards). MapLibre's
  cooperative gestures fix it — ctrl/⌘ + wheel zooms, plain wheel scrolls — and E enables them.
  The shipped 42 % panel has the same problem in smaller form.
- **The whole coast is fence-bound at the west** (finding 3 below): at 1440 the band's rotated
  footprint pushes the camera about 60 px of coast lower than the fit asks, so the fit leaves the
  band's foot free. On a phone the fence plus `minZoom: 7` make the whole-coast band impossible,
  so the phone opens on a region.

### F · Callouts — _the map is the list_

```
┌──────────────────────────────────────────────────────────────┐
│ header                                                       │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────┐  MAP, FULL BLEED, north up    [Near me]        │
│ │ 11 venues  │       ○────────────────────  ▦ Palasa Sands €26│
│ │ Shkodër  1 │  Palasë ○──────────────────  ▦ Palasa Pine  €22│
│ │ Lezhë    2 │           ○────────────────  ▦ Drymades … €32 │
│ │ Durrës   6 │      Dhërmi ○──────────────  ▦ Aurora Bay  €30│
│ │ Vlorë    2 │                Jalë ○───────  ▦ Folie Marine   │
│ │[Himarë  11]│                      ○─────  ▦ Dhërmi Sun Club│
│ │ Sarandë  4 │   ~~~ sea ~~~      Himarë ○─  ▦ Jalë Cove      │
│ │ [date]     │                         Borsh ○ ▦ Borsh …      │
│ └────────────┘                                                │
└──────────────────────────────────────────────────────────────┘
```

Round 1's B without the rail: the venues are drawn on the chart as callouts, each a compact card
anchored to its spot by a leader line, stacked in one column on the land side where B's screenshot
showed only empty inland. That is how a nautical chart labels a shoreline, and it turns the
inland waste into the label field. The callouts are laid out in the anchors' top-to-bottom order
so no two leaders cross (`layoutCallouts` in `variant-callouts.ts`), and they shrink from 78 px
rows to fit — Himarë's eleven come out at 58 px at 900 tall (`F-callouts-1440.png`), 78 at 1080
(`F-callouts-1920.png`).

Where it stops: it is one scale, not a page. A north-up 1440-wide pane cannot frame the coast
(round 1's fence floor, inherited straight from B — built first with a whole-coast state whose
callouts were the regions, the camera pinned itself to the fence's centre with the coast off it),
so F opens on Himarë and the left rail moves between regions. The leaders get long at the ends of
a diagonal coast (Palasë's runs 900 px in `F-callouts-1440.png`), the column caps at about eleven
venues before rows lose their photo, and below `lg` there is no land side wide enough — the phone
would need round 1's sheet. Strong as the _region view_ of a map-first page; not the page.

### G · Verdict — _round 1's verdict, rendered_

A's two full-bleed panes with C's rail leading the left column, built as the control so the
verdict is judged by the same rule as everything else. Read above; `G-verdict-1440.png` and
`G-verdict-1920.png`.

### Findings (camera, all three measured)

1. **MapLibre's bounds fence ignores rotation.** `defaultConstrain` in
   `maplibre-gl/src/geo/projection/mercator_transform.ts` (6.9.1) clamps `this.size` — the
   unrotated width × height — against the lng/lat ranges whatever the bearing. So a rotated band is
   still held to the 2.2° fence by its 1440 px _width_, and the camera is pinned to the fence's
   centre longitude where the coast is not: the first `E-coast` shot was inland Albania with the
   coast under the chip row. `map.setTransformConstrain` (public API) takes a replacement;
   `constrainRotated` fences the rotated viewport's axis-aligned extent instead, which is what lets
   the band frame the coast at all. This is the one piece the shipped adapter would need to add.
2. **`fitBounds` with a bearing fits the wrong box.** It rotates the corners of the pins'
   _geographic_ bounding box, and for a diagonal coast those corners sit out at sea and inland, so
   the fit is limited by a spread the pins do not have — two zoom levels too wide, coast at the
   foot. `fitRotated` measures the extent in the rotated frame itself (every pin into the screen
   frame at the bearing, min/max there, zoom from that box, centre turned back); its output matches
   MapLibre's projection to the pixel, checked with `map.project` after the ease.
3. **The whole-coast band is fence-bound at the west even with (1).** The band's rotated
   footprint is 704 px wide east–west at 78° (mostly its 414 px height turned), and the coast's
   mean longitude is only ~0.6° inside the fence's west edge, so at 1440 the clamp moves the camera
   ~0.12° east — the coast lands ~60 px lower than asked. Absorbed by giving the fit more room at
   the foot (`bottom: 124`); on a 390 px phone at `minZoom: 7` it cannot be absorbed
   (`E-phone-coast` in the working set: camera at the fence centre, coast off the band). Widening
   the ADR-0022 bbox westward would remove it — into sea, so at tile cost only.

Two more, not camera: cooperative gestures are a must for any map that spans the page's scroll
column (E above); and Playwright runs the **last** registered `page.route` first, so a range-slicing
archive route registered before a catch-all `/map/**` route never runs — round 1's helper says
"registered last, so it wins" and means it.

### What I'd ship, and why

**E.** It is the only variant that gives the map the whole width _and_ the fold _and_ leaves the
cards their grid, and it does it with one move that comes from the subject: the riviera is a line
with the sea on one side, so draw it as one. It absorbs C (the coast index becomes the band's own
pills and the strip's chips), keeps B's material argument where it earns it (the preview card and
the strip are glass over water and over cards), and its costs are a compass, four port additions
and a user test on "north is left". Ship it non-sticky if the 900 px window test says so.

**Not A + C** (round 1's verdict): rendered, it is C with a smaller list, and its map is two
thirds inland on the very view it was chosen for.

**F is the region-scale mode to build next** once E is in — the callout column is the best
region view in either round — and it slots in without a layout change: at region scale E's band
could carry callouts instead of a card grid below. Not in this round.

**D stays a separate product decision**, as round 1 said.

**Mobile:** E's band on the phone (`E-horizon-phone.png`, 250 px band under a two-row strip) puts
the map and the first venue on the first screen with no List/Map toggle and no sheet gesture to
learn — the shipped phone's first screen has neither. Open on a region (the fence forbids the
whole coast at 390 px): Near me when granted, else Himarë. Round 1's sheet remains the alternative
if the band's 340 px of chrome on a 844 px phone tests as too much; the two are not exclusive
(sheet for the list, band for the map).

## Round 3

Rounds 1 and 2 answered "where does the map go". Round 3 takes E's orientation as settled — the
coast turned to run left → right, the sea at the foot — and asks what the band is _for_ once it
is there. The subject: a 230 km coast, one sunbed set for one day, a tourist who has already
decided to go to the beach and only needs to choose where. Three things a map of hotels never
needs, built on one shared band (`prototype-band.ts`, E as a component) so each is judged by the
same camera. Two are instruments in the sea; one is the zoom itself.

### H · Tide table — _the coast × the week, drawn in the sea_

```
┌──────────────────────────────────────────────────────────────────────────┐
│ header                                                                   │
│ Find your spot on the Riviera.  430 sets free at 26 venues on Fri 18 Sep │ glass strip
│                                        [Whole coast][Shkodër 1][Lezhë 2]…│
├──────────────────────────────────────────────────────────────────────────┤
│ ↖N   Shëngjin●2   €14   €21  Golem&Qerret●4        5 beaches●9  Ksamil●4 │ MAP BAND
│  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ sea ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ │ 66 vh
│ [Fri 18 Sep 430 free│10 close 16:00] ▆ ▆     █  █ ▆▆      ▆  █   ▆▆▆ ░ ▆ │
│ [Sat 19 Sep 152 free]               ▂ ▂     ▂  ▂ ▂▂      ▂  ▂   ▂▂▂   ▂ │ THE TIDE TABLE
│ [Sun 20 Sep 188 free]               ▂ ▂     ▃  ▂ ▂▂      ▃  ▂   ▂▂▂   ▂ │ in the water:
│ [Mon 21 Sep 572 free]               ▆ ▅     ▆  ▆ ▅▅      ▆  ▆   ▆▆▆   ▆ │ one bar per venue
│ [Tue 22 Sep 662 free]               ▇ ▆     ▇  ▇ ▆▆      ▇  ▇   ▇▇▇   ▇ │ under its own pin,
│ [Wed 23 Sep 749 free]               █ ▇     █  █ ▇▇      █  █   ███   █ │ seven days deep
│ [Thu 24 Sep 760 free]               █ █     █  █ ██      █  █   ███   █ │
├──────────────────────────────────────────────────────────────────────────┤
│ cards, five columns — the band scrolls away (not sticky)                 │
└──────────────────────────────────────────────────────────────────────────┘
```

Availability is per set **per date** (invariant #2), so the coast has a different shape every day
of the week, and no layout in rounds 1–2 could show more than one of them. H draws seven: in the
water under the pins, one row per day, one bar per venue at the venue's own x on the band, the
bar's height how much of it is still free that day. The columns are the map's x axis carried down
through the sea — the table pans and zooms with the map, and nothing has to say which bar is which
because it is under its pin (`H-tide-1440.png`; at Himarë, `H-tide-himare.png`). Venues too close
to draw apart merge into one bar exactly as their pins merge into one place pill.

The row is the date control. Press a day and the pins, the preview and the cards recount for it
(`H-tide-sunday.png`: Sunday chosen, 188 free against Friday's 430 — the weekend dip is the whole
point). The `<input type="date">` goes. Today's row carries the day's second fact (invariant #4):
venues whose online sales have already closed for today are hatched, and the label says when the
next ones close ("10 close 16:00").

What it costs, honestly:

- **A read that does not exist.** `/api/venues?date=` answers one day; the table needs seven. A
  week-at-once summary is a new backend read (one per venue per day, integers — small, but new).
  `prototype-days.ts` invents it.
- **The band is deep — 594 px at 1440 × 900 — and cannot be sticky.** Strip + band are 654 px
  under a 72 px header; a sticky version leaves the cards 174 px. So H scrolls the band away
  (`H-tide-scrolled.png`) and loses E's hover-a-card-light-its-pin link below the fold. At 1920 it
  is 712 px and fine (`H-tide-1920.png`).
- **The whole coast is a texture, not a table.** At coast scale Himarë's eleven venues are three
  merged bars; the instrument reads at region scale and up. That is E's own finding about the
  whole-coast view (an orientation shot, not where anyone books from) restated for the sea.

### I · Dive — _one continuous zoom from the whole riviera to one lounger_

```
┌──────────────────────────────────────────────────────────────────────────┐
│ header                                                                   │
│ ↖N        [Whole coast][Shkodër][Lezhë][Durrës][Vlorë][Himarë][Sarandë]  │ THE MAP IS THE
│ ┌────────────┐                                                           │ WINDOW; wheel zooms
│ │● The coast │                 ┌──────────────────────────┐              │
│ │            │                 │ Palasa Pine  24 of 28    │              │ past zoom 13 the
│ │○ A region  │                 │ H ▢▢▢▢▢▢▢▢▢▢             │              │ venue under the
│ │            │                 │ …                        │              │ camera unfolds its
│ │○ A beach   │                 │ C ▢▨▢▢▢▢▢▨▢▢  €29 Middle │              │ own grid from its
│ │            │                 │ B ▢▨▢▢▨▢▢▨▨▨             │              │ pin — front row at
│ │● Your set  │                 │ A ▨▨▨▨▨▨▢▨▨▨  €40 Front  │              │ the foot, on the
│ │ Scroll to  │                 │ ▼ the water   [Book A5]  │              │ water, because the
│ │ dive.      │                 └───────────┬──────────────┘              │ sea is down
│ └────────────┘                          (€22)                            │
│      DEPTH GAUGE                          ~~~~~~~~ sea ~~~~~~~~          │
└──────────────────────────────────────────────────────────────────────────┘
```

The riviera map and a venue's beach map are the same subject at two scales, and today the change
of scale is a page change. Round 1's D put the two maps side by side and its own screenshot showed
the cost (a 520 px panel panning a 12-set beach). I puts them on **one camera**: the map is the
window, the wheel zooms, and past beach scale the venue nearest the centre unfolds its set grid
from its pin — rows parallel to the shore, the front row at the foot, because the band is turned
with the sea at the foot so "facing the sea" is simply down (`I-dive-set.png`; mid-unfold at zoom
14, `I-dive-unfolding.png`). A depth gauge on the left names the four scales — the coast, a
region, a beach, your set — and shows where the camera is; press a stop to go there. A pin press
is a dive. The preview card goes; the grid is the preview.

What it costs, honestly:

- **It is a lens, not a projection — measured.** A sunbed set is ~2.5 m across; at the map's own
  ceiling (zoom 16, 512 px tiles, latitude 40°) a pixel is ~0.9 m, so a set to scale is three
  pixels. The grid holds a fixed screen size and grows into place between zoom 13 and 15. The zoom
  is continuous; the scale is not, and a tourist will feel the seam.
- **The venue pin's accuracy becomes a product requirement.** `I-dive-set.png` at zoom 15.2 shows
  no water at all: the fixture pin for Palasa Pine sits a few hundred metres inland of the OSM
  shoreline, as an operator's rough drop will. "Front row on the water" is only true if the pin is
  on the beach to ~10 m. The operator console's placer would need a shoreline snap, or the grid's
  anchor its own field.
- **A map that is the window has no scroll column** — so I is a region-and-beach mode, not
  Discover. Its coast view (`I-dive-1440.png`) is the orientation shot with nothing under it.

### J · Sundial — _today, hour by hour: sales close as the light on the coast_

```
┌──────────────────────────────────────────────────────────────────────────┐
│ header                                                                   │
│ Today on the Riviera.  At 15:30, 21 of 26 venues still take a booking    │ glass strip
│ for today.                    [Whole coast][Shkodër][Lezhë][Durrës]…     │
├──────────────────────────────────────────────────────────────────────────┤
│ ↖N  Shëngjin●2  €14  €21 (Golem&Qerret·4)   (Borsh·2)  Ksamil&Pasqyra●4  │ MAP BAND 54 vh
│         lit = still selling today   ( ) = dusk: closed, or advance only  │ darkens after 18:00
│ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ sea ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ │
│                        [10 close at 16:00]           [11 close at midnight] THE DAY LINE
│ 06 ━━━━━━━━━ 09 ━━━━━━━━━ 12 ━━━━━━━ 15 ☀───── 18 ────── 21 ────── 24   │ in the water; the
│                                        15:30 · now                       │ sun is draggable
├──────────────────────────────────────────────────────────────────────────┤
│ Still selling for today  21     cards …                                  │
│ Tomorrow onward  5 — closed for today, or selling in advance only        │
└──────────────────────────────────────────────────────────────────────────┘
```

A tourist already on the riviera at half past three has one question the shipped page cannot
answer at a glance: which of these still take a booking for **today**? Online sales close per
venue on the day itself — 16:00 by default, midnight for some, in advance only for a few
(invariant #4) — and the product keeps that in a note on the venue page. J makes it the map's
light. The sea holds the day as a line from 06:00 to midnight with every close marked and counted;
the sun sits on it at the hour and can be dragged; every venue whose close the sun has passed
drops into dusk on the map (`J-sundial-1630.png`: the 16:00 ten have gone grey, eleven remain),
and the band itself darkens toward evening (`J-sundial-2030.png`). The cards split the same way.

The one orchestrated moment: on load the sun rises from 06:00 to now in a second and a half and
the coast's pins go to dusk one close at a time as it passes them — the day so far, played once.
A cut under `prefers-reduced-motion`. It is the only motion in three rounds that is not a camera
ease, and it is there because it shows what the instrument does before anyone touches it.

What it costs, honestly: **nothing on the backend.** `VenueSummary` already carries `salesOpen`
and `salesClose`; the dusk state is a comparison of the venue's close with the clock, which the
shipped card already makes for its sales-closed chip. The shipped pin layer needs a per-pin state
(today it draws one kind of pin), and the band needs E's four port additions. The sun's clock is
the browser's, reasoned in Europe/Tirane (invariant #6) — the server still fences the pay path.

### Findings (measured)

1. **A deep band at the coast bearing loses the coast to the fence — and no padding absorbs it.**
   Round 2 measured the whole-coast band as fence-bound at the west by ~60 px on a 414 px band and
   absorbed it with a deeper foot. The rotated footprint's east–west width grows with the band's
   height (mostly the height turned through 78°): at 594 px it is ~900 px, and the ADR-0022 clamp
   then moves the camera so far east that the coast falls off the band's foot entirely — the first
   H, I and J shots were all inland Albania with the pins below the frame. So a band deep enough to
   hold an instrument in the sea needs the fence's **west edge at 18.0°, not 19.0°**
   (`WIDER_FENCE` in `prototype-band.ts`); with it the whole coast frames on any depth up to the
   window. Round 2's "into sea, at tile cost only" was right about the direction and wrong about
   the cost: the tiles end at 19.0° and beyond them the style paints its **grey** background — the
   corner at the foot of `I-dive-1440.png`. It cannot be painted water: in an OpenMapTiles style
   the land _is_ the background and water is a fill over it (tried; the whole map turned blue).
   The extract itself has to grow westward (`scripts/build-riviera-map.sh` BBOX 19.0 → 18.0; empty
   sea, a few kB of tiles). This is the change `RIVIERA_MAP_OPTIONS` needs whichever variant ships.
2. **The dive is a lens.** Three pixels per set at the zoom ceiling (I above). A continuous zoom
   to a lounger is a continuous _camera_ with a staged _scale_, and the venue pin's placement
   accuracy becomes the product's problem.
3. **A state per pin is one layer's job.** J first drew dusk venues as a second `app-venue-pin-layer`
   over the first; each layer crowded its own pins, and their pills overlapped. The state has to be
   a property of the one layer's pins (the prototype sets a class on the rendered buttons by
   `data-pin`); the shipped layer would take a per-pin `state`.
4. **The crowding rule is needed twice.** H's columns merge neighbours nearer than 14 px, which is
   the pin layer's own rule (`crowdPins`) re-derived for bars. An instrument under the pins should
   read the layer's crowds rather than recompute them.
5. **The band refits on a new result set, never on a new bearing.** I turns the band to an opened
   venue's stretch; a fit effect that also tracked the bearing undid every dive. `untracked` on the
   bearing, and `fitTo` for a variant whose pins change without the result set changing (J's
   scrub).
6. **The instruments are desktop instruments.** All three are `lg`-only; below `lg` H, I and J
   are E's band with E's phone verdict. Not shot this round.

### What I'd ship, and why

**J's day line into E's band, now.** It is the smallest of the three and the truest to the
product: invariant #4 is the one rule a tourist meets on the beach, it is already on the wire, and
J is the only variant in three rounds that changes what the map _says_ rather than where it sits.
Its cost is E's port work plus a pin state. If the moment tests as decoration, cut the sunrise and
keep the line — the instrument stands without it.

**H when the week read exists.** It is the biggest idea in the spike — the coast as a day-by-day
instrument is what "pick the exact spot for one day" looks like as a picture — and it needs one
new read and a non-sticky band. Worth its own issue with the read in it; not before.

**I replaces D as the product decision, and D should not be built.** Round 1 said D was "a
separate product decision"; round 2 agreed. Both were right that it is a product decision and wrong
about the form: `D-bothmaps-1440.png` is a 520 px panel panning a 12-set beach, and
`I-dive-set.png` is the same beach whole, on the same camera as the coast, with nothing beside it.
The lens seam and the pin-accuracy requirement are I's real costs, and they are the costs of the
_decision_, not of the layout — D has them too and hides the first behind a scroll hint. So the
issue that D was going to be should be I, and its first slice is the shoreline snap.

**Where round 3 disagrees with rounds 1 and 2, with the shots that say so:**

- Round 2: "ship E non-sticky if the 900 px window test says so." Round 3: any band that holds an
  instrument is non-sticky, no test needed — `H-tide-scrolled.png` is the only honest scrolled
  state at that depth, and J at 54 vh is the most a sticky band can carry.
- Round 2's finding 3 costed the wider fence at "tiles only." `I-dive-1440.png`'s grey corner says
  it costs the extract, and finding 1 above says why the style cannot paper over it.
- Round 1's "the map pane has to be portrait" and round 2's "the band is the right shape" are both
  now beside the point: with the fence widened, the band's depth is _free_, and the question is
  what the depth holds. Round 3's answer is the sea.
- Round 2's "F is the region-scale mode to build next." Round 3: region scale is a stop on I's
  gauge, not a mode; the callout column is a way to label a region view, and the lens is what the
  region view is _for_.

## Screenshots

`shots/` holds the set these notes are written from (1440 × 900 unless stated), captured against
the real tiles with the fixture venues. Rounds 2 and 3 were shot by a `playwright-core` driver
serving `platform/map/riviera.pmtiles` from disk with range slicing and answering the fixture photo
paths with generated SVG stand-ins — judge photo mass, not the pictures. Round 3's states are
URL-seeded: `?now=15:30` sets the day's clock, `&still` skips J's sunrise, `?open=23&depth=14`
dives I to a venue at a zoom:

| File                                                | What                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `00-shipped-1440.png` · `00-shipped-phone.png`      | what ships today, for comparison                               |
| `A-shoreline-1440.png` · `A-shoreline-1920.png`     | A, whole coast; 1920 shows 3 card columns                      |
| `B-charttable-1440.png` · `B-charttable-phone.png`  | B at region scale, where its camera works; and the phone sheet |
| `C-coastindex-1440.png` · `C-coastindex-dhermi.png` | C, whole coast and with a beach chosen from the rail           |
| `D-bothmaps-1440.png`                               | D with a venue open, beach map inline                          |
| `E-horizon-1440.png` · `E-horizon-1920.png`         | E, the whole coast on one band; 1920 shows six card columns    |
| `E-horizon-himare.png` · `E-horizon-preview.png`    | E at Himarë, the band turned to 36°; and a pin's preview open  |
| `E-horizon-scrolled.png` · `E-horizon-phone.png`    | E scrolled 700 px (the sticky cost); and the 390 × 844 phone   |
| `F-callouts-1440.png` · `F-callouts-1920.png`       | F at Himarë, eleven callouts at 58 px rows, then at 78         |
| `F-callouts-durres.png`                             | F at Durrës: short leaders where the coast runs straight       |
| `G-verdict-1440.png` · `G-verdict-1920.png`         | round 1's verdict rendered, at both widths                     |
| `H-tide-1440.png` · `H-tide-1920.png`               | H, the whole coast over seven days; at 1920, six card columns  |
| `H-tide-himare.png` · `H-tide-sunday.png`           | H at Himarë; and with Sunday chosen from the table             |
| `H-tide-scrolled.png`                               | H scrolled 700 px: the band gone, the cards the whole window   |
| `I-dive-1440.png` · `I-dive-himare.png`             | I at coast and region depth (note the grey corner: finding 1)  |
| `I-dive-unfolding.png` · `I-dive-set.png`           | I diving on Palasa Pine: the grid at zoom 14, then whole at 15 |
| `J-sundial-1440.png` · `J-sundial-1920.png`         | J at 15:30, at both widths                                     |
| `J-sundial-1630.png` · `J-sundial-2030.png`         | J after the 16:00 close (ten at dusk), and at 20:30 (evening)  |

## Files

| File                                                                                                  | What                                                                                         |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                                                                               | the host: fixture data, filters from the URL, the `?variant=` switch                         |
| `variant-shoreline.ts` · `variant-chart-table.ts` · `variant-coast-index.ts` · `variant-both-maps.ts` | A · B · C · D — no shared layout, on purpose                                                 |
| `variant-horizon.ts` · `variant-callouts.ts` · `variant-verdict.ts`                                   | E · F · G — round 2                                                                          |
| `variant-tide-table.ts` · `variant-dive.ts` · `variant-sundial.ts`                                    | H · I · J — round 3                                                                          |
| `prototype-band.ts`                                                                                   | E's turned band as one element H, I and J compose; the wider fence — round 3's finding 1     |
| `prototype-days.ts`                                                                                   | the fixture's time: free sets per venue per day, and each venue's sales close                |
| `prototype-camera.ts`                                                                                 | fit the camera to the pane and the pins — round 1's finding                                  |
| `prototype-raw-map.ts`                                                                                | past the port: bearing, the rotated-frame fit, the rotation-aware fence — round 2's findings |
| `prototype-coast.ts` · `prototype-venue-card.ts`                                                      | the coast as an index (regions, beaches, counts, from-prices); the card E and G share        |
| `prototype-filter-bar.ts`                                                                             | the selects, shared by A, B and D (C replaces them)                                          |
| `prototype-venues.ts` · `prototype-sets.ts`                                                           | 26 fixture venues; a plausible set grid for D                                                |
| `prototype-switcher.ts`                                                                               | the floating bar — deliberately ugly, so it reads as scaffolding                             |

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If a
variant wins it gets rebuilt test-first through the normal loop — do not promote this code.
