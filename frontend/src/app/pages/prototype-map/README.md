# Where the riviera map belongs on Discover — a desktop design spike

Throwaway. Branch `claude/riviera-map-desktop-spike-iwi5f0`, never merged. Four candidate answers
on one route, plus the measurements that decide between them.

```bash
cd frontend
npm start                                     # the SPA on :4200
node src/app/pages/prototype-map/tiles.mjs    # stand-in backend on :8080 (real /map/** tiles)
open 'http://localhost:4200/prototype/map-desktop?variant=a'
```

Twenty-eight fixture venues on the real coast, so no backend is needed for data. `tiles.mjs`
serves `platform/map/` by byte range and answers the fixture's photo paths with generated SVGs;
`./gradlew bootRun` serves the same `/map/**` for real and can replace it. Without either, the
map boots and stays blank — everything else still lays out.

Variants: `?variant=a|b|c|d`, arrows or `←`/`→` on the ugly magenta switcher. Every piece of
state is in the URL (`beach`, `venue`, `date`, `at`, `sheet`, `bay`), so each screenshot below is
a link. The switcher prints the live measurement — pane box, the zoom floor the fence imposes on
a box that shape, the camera's actual zoom, the coast in shot — so every screenshot carries its
own evidence.

---

## 1. The question, and the thing that answers it

> Where does the riviera map belong on Discover, on desktop, and what should the page be for
> once it is there?

I expected this to be a hierarchy argument. It is mostly a geometry one, and the geometry is
decisive enough that it picks the layouts rather than merely constraining them.

### The subject

A 230 km coast with the sea on one side. Thirty-six catalogued beaches in a fixed north-to-south
order (`shared/beaches.ts`). One product: a set — two loungers and an umbrella — for one whole
day. A from-price and a per-date free count per venue, and a sales close that lands on the day
itself, per venue (invariant #4). The tourist has already decided to go to the beach. The page
only helps them choose **where**, and "where" on this coast is a point on a line.

### The fence (ADR-0022), measured

`RIVIERA_MAP_OPTIONS.maxBounds` is 2.2° of longitude by 3.3° of latitude; `minZoom` is 7.
MapLibre lays the world out as a square of `512 × 2^zoom` CSS px and refuses any camera whose
viewport would leave the fenced box, scaling up until the box covers the pane on **both** axes.
So the fence is not a pan limit. It is a **zoom floor that rises with pane width**:

```
zoomFloor(pane) = max(7, log2(max(paneW / fenceW, paneH / fenceH) / 512))
```

The catalogued coast runs 39.770 N (Ksamil) to 41.848 N (Velipojë) — **231 km** — across 0.65°
of longitude. In Mercator its box is **0.237 as wide as it is tall**: a 1 : 4.2 vertical sliver
inside a fence that is 1 : 2. Solving the floor against that sliver gives the one number this
whole spike turns on:

> **A pane can frame the whole catalogued coast if and only if its width is at most
> 0.801 × its height.** Wider than that, no camera exists that shows the riviera.

Everything below is measured on the real panes, at the camera's own latitude (Mercator stretches
away from the equator — measuring a pane's coverage around 0° overstates it at 40.8 N by ~24%,
which is a mistake this spike made and corrected; `frameOf` now takes the camera, not just a
zoom).

| pane                                     | W×H      | W:H  | zoom floor | km of coast at that floor | coast?      |
| ---------------------------------------- | -------- | ---- | ---------- | ------------------------- | ----------- |
| **shipped** Discover map pane @1440×900  | 433×680  | 0.64 | 7.11       | 291                       | fits        |
| **shipped** Discover map pane @1920×1080 | 433×720  | 0.60 | 7.11       | 308                       | fits        |
| A bay theatre @1440                      | 1340×745 | 1.80 | 8.74       | 103                       | **cropped** |
| A bay theatre @1920                      | 1820×925 | 1.97 | 9.18       | 94                        | **cropped** |
| A bay theatre @390                       | 290×628  | 0.46 | 7.00       | 291                       | fits        |
| B drive south @1440                      | 946×811  | 1.17 | 8.24       | 159                       | **cropped** |
| B drive south @1920                      | 1426×991 | 1.44 | 8.83       | 129                       | **cropped** |
| B drive south @390                       | 374×305  | 1.23 | 7.00       | 141                       | **cropped** |
| C gazetteer chart @1440                  | 430×768  | 0.56 | 7.10       | 331                       | fits        |
| C gazetteer chart @1920                  | 430×948  | 0.45 | 7.25       | 369                       | fits        |
| C gazetteer chart @390                   | 374×204  | 1.83 | 7.00       | 94                        | **cropped** |
| D thumb coast @390                       | 390×710  | 0.55 | 7.00       | 329                       | fits        |
| D thumb coast @1440                      | 645×811  | 0.80 | 7.69       | 233                       | fits        |
| D thumb coast @1920                      | 785×991  | 0.79 | 7.97       | 234                       | fits        |

Widest pane that still holds the coast, by height — the number a layout argument actually needs:

| pane height   | 305 | 628 | 710 | 745 | 768 | 811 | 925 | 948 | 991 |
| ------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **max width** | 244 | 503 | 569 | 597 | 615 | 650 | 741 | 760 | 794 |

### What the shipped page does, measured

At 1440×900 (`shots/shipped-1440x900.png`): hero 328 px tall, filter bar 112 px, map pane
**433×680 with its top edge 614 px down a 900 px viewport** — 286 px of it on the first screen.
433 px is 42% of the 1032 px content column inside the 1080 px cap.

At 390×844: no map at all. The first screen is the headline (366 px) and the three selects
(356 px); the first venue card starts past 869 px.

Two findings fall straight out:

- **The shipped pane is one of the few shapes that _could_ hold the whole coast, and doesn't.**
  At 433×680 its floor is z7.11, good for 291 km. It opens at `RIVIERA_MAP_OPTIONS.view.zoom`
  = 8.6, which frames **104 km**. The constant, not the container, is what loses the riviera.
- **The obvious fix — give the map the width — is the one thing that cannot work.** A full-bleed
  1440×900 map frames 103 km; at 1920×1080, 94 km. More pixels, less coast.

---

## 2. The four answers

### A — Bay theatre (`?variant=a`) · desktop-first

The page _is_ the map. Premise taken straight from the table: a wide desktop pane cannot show
the riviera whatever it does, so stop trying and commit to the other end — **one bay, as large
as the screen allows**, at the scale a sunbed is actually chosen at. What the map cannot say, the
chrome says, at the two scales above the bay.

```
┌──────┬────────────────────────────────────────────────────────┐
│ SHK  │ Velipojë  Shëngjin  Durrës …[DHËRMI]… Jalë  Livadhi →  │  76  beach dial
│ LEZ  ├────────────────────────────────────────────────────────┤
│ DUR  │ ┌──────────┐                     €30                   │
│      │ │ Dhërmi   │            €45                            │
│ VLO  │ │ 3 venues │                       ●€32                │
│      │ └──────────┘    ~~~sea~~~              €28             │
│ HIM  │                                          €26           │
│      │      ┌──────────┐ ┌──────────────┐                     │
│ SAR  │      │ preview  │ │ ▲ the sea    │                     │
│      │      │  card    │ │  A ▢▢▢▢      │  ← the venue's own  │
│  76  │      └──────────┘ │ ▼ promenade  │    beach map        │
└──────┴────────────────────────────────────────────────────────┘
  region ruler                       map 1340×745, 3 km in shot
  (heights weighted by
   each region's latitude)
```

**Argument.** Region → beach → venue: three controls for the three zoom regimes the fence carves
out (coast · stretch · bay). The ruler down the left is the 231 km the map is _forbidden_ from
showing, drawn as a scale rather than as a map, with each region's block sized by the latitude it
actually covers. The dial is the catalogue's own north-to-south order with counts and
from-prices on it — no select, no hero, no search box.

The second claim is the dock: what you are buying is a _set_, so opening a venue shows the
venue's actual beach map — the shipped `app-beach-map-canvas`, sea banner at the top, promenade
at the bottom — on the discovery page, beside the preview card. Nothing else in the spike puts
the product on the page at all.

**Screenshots:** `a-1440`, `a-1920`, `a-390`, `a-390-open`.

**What they show.** The bay reads beautifully at 1440 and 1920 — the coastline diagonal with the
sea on the left is the most characteristic image in the whole spike, and the set grid landing
under it is the strongest single idea here. Three failures:

1. The first version centred the camera on the venue centroid and spent two thirds of a 1340 px
   pane on empty hillside. Fixed by biasing the frame seaward (finding 4) — that fix is now in
   `prototype-camera.ts` and applies to any variant with a bay camera.
2. The dock is large. Preview card plus a four-column set grid is 780 px of the 1340, and the
   grid only fits four columns; a real venue with eight rows would need its own scroller.
3. Shrunk to 390 it collapses (`a-390`): the ruler takes 76 of 390 px, the dial shows three
   beaches, the map is 290 px wide and the bay header covers most of it.

### B — Drive south (`?variant=b`) · desktop-first, and the one I have not seen elsewhere

The coast is a 230 km road with the sea on one side, and the tourist is already on it. So the
page does not ask where they want to go. **It drives.**

```
┌────────────────┬──┬───────────────────────────────────────────┐
│ Jalë    km 193 │  │                                           │
│ ▢ Jale Bar €29 │ ·│   ┌───────────────┐    ~~~sea~~~          │
│                │ ·│   │ Livadhi       │                       │
│ Livadhi km 194 │ ─│   │ km 143 of 231 │   €29                 │
│ ▢ Lounge   €25 │ ·│   └───────────────┘       €25             │
│                │143                         [Himarë 2]        │
│ Himarë  km 195 │ ·│                                           │
│ ▢ Potami   €27 │ ·│                                           │
│ ▢ Himara   €21 │ ·│                                           │
│        ↕       │ ↑│           946×811, 13 km in shot          │
└────────────────┴──┴───────────────────────────────────────────┘
   scrolling the rail  odometer
   IS the camera       (a readout, not a control)
```

Scrolling the venue rail moves the camera, continuously, from Velipojë to Ksamil, interpolating
between one beach's centre and the next. Nothing is hijacked: the rail is an ordinary scroller
with an ordinary scrollbar and ordinary keyboard paging, and **tabbing through the venue list
drives the camera too**, because focusing a card scrolls it into view. The zoom is derived from
the pane so that 13 km of coast is in shot whatever the window — which is exactly the regime
where the fence is nowhere near binding, so a travelling camera may be wide where a static one
may not. There is no preview card on purpose: the rail already carries every fact one would
repeat. The odometer down the middle is the 231 km a camera at this scale can never show.

**Screenshots:** `b-1440`, `b-1920`, `b-390`, `b-390-scrolled`.

**What they show.** It is the most _pleasurable_ of the four and the only one whose interaction
model is specific to this coast rather than portable to any map product. It also survives the
phone better than the other two desktop-first answers (`b-390`) — thumb-scrolling a list is
already the phone's native gesture, so "scroll = travel" costs nothing there.

Honest costs: there is no way to jump — reaching Ksamil from Velipojë means travelling the whole
list, which is romantic for browsing and wrong for "I'm staying in Sarandë"; the sticky beach
headings stack two-deep at the boundaries; and a scroll-driven camera is a screen-reader user's
worst case, since the map moves on an event they have no reason to associate with movement.

### C — Coast gazetteer (`?variant=c`) · desktop-first

Three columns: the index, the chart, the venues. The chart is a **printed coastal chart** — it is
fitted once to all 36 catalogued beaches and then left alone. It does not pan and does not zoom
of its own accord.

```
┌──────────────┬──────────────┬─────────────────────────────────┐
│ SHKODËR      │ NORTH        │ Dhërmi   3 venues · Fri 18 Sept │
│ Velipojë €12 │  ┌────────┐  │ ┌───────────┐ ┌───────────┐     │
│ LEZHË        │  │  ②     │  │ │ ▨ photo   │ │ ▨ photo   │     │
│ Shëngjin €15 │  │    ③   │  │ │ Havana    │ │ Bay Club  │     │
│ DURRËS       │  │  ⑪     │  │ │ ★4.3  €32 │ │ ★4.1  €28 │     │
│ Durrës   €14 │  │ ──Dhërmi──ᐨ│ └───────────┘ └───────────┘     │
│ Golem    €20 │  │    ⑥   │  │ ┌───────────┐                   │
│ …            │  └────────┘  │ │ Luna Rossa│                   │
│ ▸Dhërmi  €26 │  SOUTH       │ └───────────┘                   │
│  268 px      │  430×768     │  whatever width is left         │
└──────────────┴──────────────┴─────────────────────────────────┘
   the index IS      never panned,    everything needed to decide,
   the filter        never zoomed     nothing needed to search
```

**Argument.** The map column is exactly the measurement made visible: at 1440 it may be at most
615 px wide (768 px tall), so the map here is a **column, not a canvas**, and the width either
side of it is what the width is for. No hero, no selects: the 36-beach catalogue in its own
order, with prices and free-set bars on it, _is_ the filter — and a list of places with prices on
it is the one thing this product has that a generic search page does not. The chart marks the
index's focus with a bracket at that beach's latitude. Pressing a place pill is the one thing
that moves the camera, and a "Whole coast" control puts it back.

**Screenshots:** `c-1440`, `c-1920`, `c-390`, `c-390-scrolled`.

**What they show.** The densest and fastest of the four, and the only one where price comparison
across the coast is a glance rather than a journey. The chart genuinely reads as a chart.

Two real costs. First, **the chart always carries inland Albania**: at 430×768 it frames 1.79° of
longitude where the venues occupy 0.65°, so 64% of the column is Tirana, Berat and Korçë. This
cannot be cropped away — a narrower column raises nothing and simply shows _less coast_, because
the fence sets the floor from the width. Second, shrunk to 390 it is the worst of the four
(`c-390`): the chart becomes 374×204, frames 94 km of inland Albania with no riviera in it at
all, and the bracket label escapes onto the heading.

### D — Thumb coast (`?variant=d`) · mobile-first, designed at 390×844

The measurement makes this mobile-_first_ rather than mobile-too: a pane holds the coast only
while W ≤ 0.801 × H, so **the phone is the only device in this spike whose full-bleed map can
hold all 231 km.** 390×710 frames 329 km with room to spare, where a full-bleed 1340×745 desktop map frames 103. The
phone therefore gets the thing the desktop is denied, and the shipped List/Map toggle goes —
there is no screen here without both a map and a venue on it.

```
 phone 390×844                          desktop 1440×900
┌─────────────────────────┐   ┌──────────┬───────────────┬──────────────────┐
│ Riviera            ☀    │73 │ Velipojë1│ ┌───────────┐ │ Dhërmi  3 · Fri  │
├─────────────────────────┤   │ Shëngjin1│ │    ②      │ │ [pick|three|all] │
│           ~~~  ┌──┐     │   │ Durrës  2│ │      ③    │ │ ▢ Bay Club  €28  │
│  [② Velipojë]  │  │  +  │   │ Golem   1│ │  ~~ ⑩     │ │ ▢ Havana    €32  │
│                │  │  −  │   │ …        │ │      ④    │ │ ▢ Luna Rossa€26  │
│  [③ Durrës]    │══│     │   │ ▸Dhërmi 3│ │        ⑥  │ │                  │
│                │▓▓│←thumb│  │ Jalë    1│ └───────────┘ │                  │
│      [Dhërmi ⌕]│  │     │   │ …        │               │                  │
│                │  │     │   │  210 px  │  645×811      │  the rest        │
│  [③ beaches]   │  │     │   └──────────┴───────────────┴──────────────────┘
├────────╌╌╌──────────────┤      scrubber becomes     sheet steps become
│ Dhërmi  3 venues · Fri  │      a labelled rail      density, not height
│ ▢ Dhërmi Bay Club   €28 │
│   ★4.1   23 of 30 free  │   map column = 0.78 × its own height, always —
├─────────────────────────┤   sized by the coast's aspect ratio, never by
│ Beaches  Bookings  Menu │61 a share of the window
└─────────────────────────┘
   map 390×710, 256 km in shot      peek 244 · half 390 · full 560
```

**Argument.** One control, under the right thumb: a **coast scrubber**, 56 px wide and as tall as
the map allows, one notch per catalogued beach in the catalogue's own order. Dragging it moves
the focus along the coast while the chart stays whole; the pill it carries names where the thumb
is and, pressed, drops into that bay. The venue sheet below steps peek → half → full and never
leaves the screen. No toggle, because there is no state without both.

Grown up, the three parts re-arrange rather than reflow: the scrubber becomes a labelled rail,
the map takes the middle, and the sheet becomes a column whose three steps turn into _density_ —
one pick, three, or the lot — rather than height.

**Screenshots:** `d-390`, `d-390-bay`, `d-1440`, `d-1920`.

**What they show.** The phone screen is the best first screen in the spike: whole coast, priced
crowd pills, a named beach under the thumb and a venue card, with no hero and no selects. The
grown-up version holds the coast at both 1440 (645×811) and 1920 (785×991) because the map
column is sized from the coast's aspect ratio rather than from a fraction of the window — see
finding 3, which is where the earlier `flex-1` version lost it.

Costs: the desktop version has no equivalent of C's bracket, so the focused beach is unmarked on
the chart; the inland-Albania waste of C applies here too; and the scrubber's travel shortens as
the sheet rises, so scrubbing really wants the sheet down.

---

## 3. Findings

All measured on the running prototype, not reasoned about.

1. **The fence gives the map an aspect ratio, not a size.** `W ≤ 0.801 × H`, or the riviera
   cannot be framed at any camera. This is the single most useful number to come out of the
   spike and it belongs in `RIVIERA_MAP_OPTIONS`' own documentation whatever ships.
2. **More pixels, less coast.** Full-bleed: 1440×900 → 103 km; 1920×1080 → 94 km. Widening a map
   pane on this product actively destroys its subject. Nothing in the codebase says so today.
3. **A map column should be sized from the coast, not from the window.** `width: calc(height ×
0.78)` holds at every viewport; `flex-1` broke at 1920 (1118×991, 14 km lost off each end)
   while passing at 1440. A percentage-width map column is a latent bug that only appears on
   wide screens.
4. **The sea is always on one side, so a coastal camera is not centred on its pins.** Fitting a
   bay to its venue centroid spent two thirds of a 1340 px pane on hillside. Biasing the frame
   0.16 pane-widths seaward puts the water in shot. (`nudged` in `prototype-camera.ts`.)
5. **A fit must fit the _visible_ map, not the pane.** With a sheet or dock floating over the
   map's lower half, a camera fitted to the whole pane puts half its pins underneath it — two of
   Ksamil's three venues were invisible until the fit was given the strip above the sheet and the
   frame was raised by half the sheet's height.
6. **Floating chrome is a zoom floor, and on the phone it binds by 21 px.** A 390 px-wide map
   needs ≥ 487 px of height to hold the coast. The phone's content box is 710 px, so a sheet that
   takes _layout_ height may take at most 223 px — and the peek step is 244 px. That 21 px is the
   whole reason D floats the sheet over a full-bleed map instead of sitting beside it.
7. **Crowding is what makes a coast-scale map readable, and it already works.** At the chart's
   own zoom the 28 fixture venues resolve to **6 place pills and 0 lone pins** (C@1440, D@1440,
   D@390); at bay scale, 28 lone priced pins; at B's 13 km travel scale, 7 pills and 12 pins.
   `app-venue-pin-layer` needed no changes for any of it.
8. **The shipped map pane is capable of the coast and opens at a tenth of it.** 433×680 floors at
   z7.11 (291 km) and opens at the shipped z8.6 (104 km). Deriving the camera from the pane and
   the pins is a smaller change than any layout here and is worth doing on its own.
9. **The map's own chrome owns both right-hand corners.** `app-riviera-map` puts Near-me/zoom at
   `top-3 right-3` and the required attribution at `right-3 bottom-3`. A right-edge thumb control
   collides with the first, and a bottom sheet buries the second — which is a licence problem,
   not a cosmetic one. Shipping D means giving `app-riviera-map` an inset or a side for its
   chrome. The prototype dodges it (scrubber starts 116 px down, sheet paints over the credit)
   and that dodge is not shippable.
10. **The touch floor survives all four.** Measured `getBoundingClientRect()` over every control
    in every variant at 1440 and 390: **0 controls under 44×44** other than the two attribution
    links inside the shipped map component, which are the "inline link in a sentence" exemption.
    The two continuous controls — A's region ruler and D's scrubber — reach the floor by being
    _one_ large control with a decorative scale inside, not 22 small ones.
11. **The chart always carries inland Albania.** At 430×768 the column frames 1.79° of longitude
    for a coast 0.65° wide: 64% of it is not coast, and narrowing the column makes it worse, not
    better. Any "the map is a column" layout has to accept that or mask it in the style.
12. **The phone tab bar is 61 px, not 76.** 60 px of tabs plus its top border; the 76 px figure
    in `app.ts` is the mobile menu's clearance above the bar. The header is 73 px at every width.

---

## 4. What I would ship

### Desktop: **C, the coast gazetteer** — with A's dock

C is the only desktop answer where the first screen answers the actual question. The tourist has
decided to go to the beach; what they need is _which beach, at what price, with room today_, and
C puts all three on one screen with no hero, no selects and no scrolling. The index replaces the
Beach and Region dropdowns with something strictly better — the same catalogue, in the same
order, carrying the prices and free counts the dropdowns hide — and the chart earns its column
by being the one thing that makes a list of 36 Albanian place names legible to someone who has
never been.

I would take one thing from A: the **dock's set grid**. Discover's job ends at "which venue", but
showing the actual beach map — front row, promenade, what is free — is the single strongest
argument in the spike that this is not a hotel search, and it costs one column that C already
has.

I would not ship A. It is the best-_looking_ screen here and it answers the wrong question: it is
excellent once you know which bay, and Discover's whole job is the step before that. It also
spends 1440 px on 3 km of coast, which is the exact failure mode finding 2 names.

B I would keep and not ship — as a second view, or a "browse the coast" entry, not as Discover.
Its cost is real (no way to jump, and a camera that moves on scroll is hostile to assistive
tech), and its pleasure is real too. It deserves to exist somewhere; it does not deserve to be
the page a tourist lands on with a date in mind.

### Phone: **D, thumb coast**

Not a close call. It is the only one designed at 390 rather than folded down to it, and the
measurement says the phone is where the map is at its best rather than where it is tolerated. It
replaces the List/Map toggle with something that never has to choose, and its first screen has a
map, a named place, a price and a venue on it where the shipped page has a headline and three
selects.

### Can one answer serve both?

**Yes — D is that answer, and it is the recommendation if only one thing can be built.**

Grown up, D lands very close to C: an index rail on the left, a coast column in the middle,
venues on the right. That convergence is not a coincidence — both are obeying finding 1, and once
the map has to be a tall column there are only so many places for the other two things to go.
The differences that survive are real but small, and each has a clear winner:

|                         | C (desktop-first)                       | D (mobile-first, grown)                       |
| ----------------------- | --------------------------------------- | --------------------------------------------- |
| left column             | discrete beach index, keyboard-walkable | continuous scrubber → labelled rail           |
| focus mark on the chart | bracket at the beach's latitude         | none — **C wins**                             |
| venue column            | fixed cards                             | density steps: one / three / all — **D wins** |
| map column width        | fixed 430 px                            | `0.78 × height` — **D wins** (finding 3)      |
| phone                   | collapses (94 km, no riviera)           | is where it was designed — **D wins**         |

So: ship **D's skeleton at every width**, and fold C's two better ideas into it — the focus
bracket on the chart, and the index's prices and free-set bars on the rail rows (D's rail
currently carries only a count). Keep C's three-column desktop _proportions_, since D arrives at
them anyway. That leaves one page, one mental model, and a phone layout that is not an apology.

The thing I would build first, before any of this and independently of which layout wins, is
finding 8: **derive the map's opening camera from its pane and its pins instead of from
`RIVIERA_MAP_OPTIONS.view`**. It is small, it is testable, it makes the shipped page show 291 km
instead of 104, and every layout above depends on it.

---

## 5. What this spike does not settle

- **Load.** Every variant is fed a synchronous fixture. The shipped page defers the map chunk
  until the venue request settles, and C's and D's charts want the map on the _first_ screen —
  which is a 1.4 MB MapLibre chunk on the critical path. That trade is not measured here.
- **Assistive tech.** No axe run, no screen-reader pass (prototype rules). B's scroll-driven
  camera and D's slider are the two that most need one.
- **Real photos.** Judged as mass, not as pictures; the stand-ins are flat gradients and a real
  cover photo may change the balance of C's and D's venue columns.
- **The date.** Every variant shows the selected day and none of them lets you change it. On a
  product where sales close per venue on the day, the date control's placement is its own
  question and it is dodged throughout.
- **Venue counts at scale.** 28 fixture venues. At 300 the index becomes a scroll problem C and D
  both have to answer, and the crowd pills stop being 6.

## 6. Files

| file                                                                            | what                                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `prototype-camera.ts`                                                           | the fence solved for the pane: `zoomFloor`, `fitView`, `nudged`, `frameOf`, `widestCoastPane` — where every measurement above comes from |
| `prototype-fixture.ts`                                                          | 28 venues on the real coast, projected into the shipped `VenueCard`                                                                      |
| `prototype-state.ts`                                                            | all URL state, so every screen is a link                                                                                                 |
| `prototype-pane.ts`                                                             | measures a pane before the map is created — `app-riviera-map` reads its options once, at boot                                            |
| `prototype-switcher.ts`                                                         | the ugly switcher and the live measurement readout                                                                                       |
| `variant-bay.*` / `variant-drive.*` / `variant-gazetteer.*` / `variant-thumb.*` | A / B / C / D                                                                                                                            |
| `tiles.mjs`                                                                     | stand-in backend: `/map/**` by byte range, `/proto-photo/**` as generated SVG                                                            |
| `shots/`                                                                        | 16 screenshots at 1440×900, 1920×1080 and 390×844, plus the shipped page for comparison                                                  |

Prototype rules: no tests, no error handling, no a11y or contrast specs. `npx eslint`,
`npm run format:check` and `npx tsc --noEmit` are clean. `app.routes.spec.ts`'s lazy-route count
goes 34 → 35 for the one throwaway route.
