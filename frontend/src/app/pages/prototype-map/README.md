# PROTOTYPE — where the riviera map goes on desktop

**Throwaway. Spike branch only (`claude/map-design-prototype-417sh1`); nothing here merges to
`main`.** Seven desktop layouts for the riviera map on Discover, on one route, so they can be
judged against each other and against what ships today: round 1's four (A–D, below) and round 2's
three (E–G, § _Round 2_), which start from what round 1's screenshots showed.

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

## Screenshots

`shots/` holds the set these notes are written from (1440 × 900 unless stated), captured against
the real tiles with the fixture venues. Round 2 was shot by a `playwright-core` driver serving
`platform/map/riviera.pmtiles` from disk with range slicing and answering the fixture photo paths
with generated SVG stand-ins — judge photo mass, not the pictures:

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

## Files

| File                                                                                                  | What                                                                                         |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                                                                               | the host: fixture data, filters from the URL, the `?variant=` switch                         |
| `variant-shoreline.ts` · `variant-chart-table.ts` · `variant-coast-index.ts` · `variant-both-maps.ts` | A · B · C · D — no shared layout, on purpose                                                 |
| `variant-horizon.ts` · `variant-callouts.ts` · `variant-verdict.ts`                                   | E · F · G — round 2                                                                          |
| `prototype-camera.ts`                                                                                 | fit the camera to the pane and the pins — round 1's finding                                  |
| `prototype-raw-map.ts`                                                                                | past the port: bearing, the rotated-frame fit, the rotation-aware fence — round 2's findings |
| `prototype-coast.ts` · `prototype-venue-card.ts`                                                      | the coast as an index (regions, beaches, counts, from-prices); the card E and G share        |
| `prototype-filter-bar.ts`                                                                             | the selects, shared by A, B and D (C replaces them)                                          |
| `prototype-venues.ts` · `prototype-sets.ts`                                                           | 26 fixture venues; a plausible set grid for D                                                |
| `prototype-switcher.ts`                                                                               | the floating bar — deliberately ugly, so it reads as scaffolding                             |

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If a
variant wins it gets rebuilt test-first through the normal loop — do not promote this code.
