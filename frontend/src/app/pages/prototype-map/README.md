# PROTOTYPE — where the riviera map goes, phone first

**Throwaway. Spike branch only (`claude/map-design-prototype-417sh1`); nothing here merges to
`main`.** Five rounds built fifteen layouts for the riviera map on Discover, on one route, so
they could be judged against each other and against what ships today. Rounds 1–4 were
desktop-first; **round 5 flips the target to a 390 × 844 phone** and judges everything from
phone screenshots. **Six are left** — B, K, M and round 5's N, O and P — and the other ten were
cut; § _Tried and cut_ says what each of them proved and why it went, so nothing has to be
re-derived. Their code is in this branch's history
(`git log --diff-filter=D -- 'frontend/src/app/pages/prototype-map/variant-*.ts'`).

The findings below are kept in full and are the point of the spike: the camera fit, the rotated
band's fence, the result set's own aspect ratio, and (round 5) what a phone's first screen costs.

```
npm start           # from frontend/
open http://localhost:4200/prototype/map?variant=P
```

The route was `/prototype/map-desktop` until round 5; the phone is the design target now, so the
path stopped saying otherwise. `←` / `→` or the floating bar cycles the variants. Every state is
in the URL: `?variant=P&mode=map` (P's map screen), `?variant=N&here=19.641,40.147` (the tourist
standing on Dhërmi beach),
`?variant=N&region=SARANDE`, `?variant=N&now=16:30` (the clock, for the sales-close state),
`?variant=K&beach=DHERMI`, `?variant=B&region=HIMARE`.
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

## Tried and cut

Ten layouts were built, shot, argued over and then cut — eight after round 4, two on a phone in round 5. Each is here in two or
three lines so a later round does not rebuild one by accident — and so the findings below, which
still cite them by letter, keep making sense. **Their screenshots went with them**, so where a
finding names an `A-…png` or `E-…png` the claim itself is recorded in the prose, not in a file.

| Cut                 | What it was                                                                                                       | What it proved, and why it went                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** · Shoreline   | Two full-bleed panes, list left, map right — the expected pattern with the shipped page's faults fixed            | Measured at 1440: the pins are 286 × 823 px in a 610 × 808 pane, so 47 % of the width is used and the coast runs 15 px off the foot. It is the right idea at the wrong width; **K's column is this pane sized by measurement**.                                                                                                                                                                                                                                                                 |
| **C** · Coast index | Three columns, the left one the coast itself: region by region, every beach with its count and from-price         | The rail was the strongest single idea in round 1 and still is — it **survives as K's label gutter**, drawn on the coast instead of beside it at a quarter of the width. The three-column geometry was the weakest.                                                                                                                                                                                                                                                                             |
| **D** · Both maps   | The riviera map and the venue's own beach map side by side, so picking a set costs no page change                 | Its own screenshot was the argument against it: a ~520 px panel panning a 12–20-set beach with "drag to see the rest" doing real work. **Round 3 replaced it with I**, which puts both scales on one camera.                                                                                                                                                                                                                                                                                    |
| **E** · Horizon     | The map turned so the coast runs left → right with the sea at the foot; a full-width band, cards below            | The orientation is right and is **kept — it is K's band shape, and `prototype-band.ts` is E as a component**. E's own band was 414 px deep where the turned set measures 272; round 4 computes the depth instead of choosing it.                                                                                                                                                                                                                                                                |
| **F** · Callouts    | The venues drawn on the chart as a column of callouts, each anchored to its spot by a leader line                 | "The inland waste is the label field" is a real insight and **survives vertically in K's gutter**. F itself is one scale, not a page: it can only open on a region, and the column caps at about eleven callouts.                                                                                                                                                                                                                                                                               |
| **G** · Verdict     | Round 1's verdict (A's panes with C's rail) built as a control rather than argued                                 | Did exactly its job: rendered, it is C with a smaller list and A's mostly-inland map. Round 1's verdict is disproven, so the control has nothing left to control for. The practice is what to keep — **build the verdict**.                                                                                                                                                                                                                                                                     |
| **H** · Tide table  | The coast × seven days: one bar per venue per day, drawn in the sea under its own pin, the row the date control   | The biggest idea in the spike, and not a layout question. It needs a backend read that does not exist (a week of availability per venue), its 594 px band cannot be sticky, and it reads only at region scale. **Worth its own issue with the read in it.**                                                                                                                                                                                                                                     |
| **L** · Map mode    | A desktop List / Map toggle: list with no map at all, or B's full-bleed map with the rail                         | Its **list state is the best list page in the spike** — four columns at 1440 with nothing stealing the width — and that argument is carried into round 4's verdict. Its map state at whole-coast scale is 55 % of the coast off-screen and six pins behind the rail.                                                                                                                                                                                                                            |
| **I** · Dive        | Round 3: one continuous zoom from the whole riviera to one lounger, on E's turned band, a depth gauge on the left | Cut in round 5, on a phone. `I-dive-phone.png`: at 390 px its coast view is inland Albania with the pins 782 px wide in a 390 px pane (measured: −248 … 534), no scroll column and no list; its gauge is `lg`-only. The **idea** — one camera from coast to lounger — is a product decision that still stands (round 3), and its costs (the lens seam, the pin-accuracy requirement) are unchanged; as a page it was a desktop instrument, which round 3 said.                                  |
| **J** · Sundial     | Round 3: today hour by hour, sales close as the light on the coast, a day line in the sea                         | Cut in round 5 as a **layout**, kept as an **instrument**. `J-sundial-phone.png`: a 420 px band at the coast bearing on a 390 px phone puts the pins at −105 … 438, the day line is `lg`-only, and 26 shipped cards under it make a 10,855 px page. What survives is the per-pin, per-row "closed for today" state and the sentence "8 of 11 still take a booking for today" — round 5's strip and rows carry both, because a tourist on the beach at half past three is exactly who J was for. |

## Round 1

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

**Every whole-coast frame is mostly not the coast.** In A's and C's whole-coast shots (both cut)
the pins hugged the left edge and roughly two thirds of the pane was inland
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
builds it (G, cut): the rail takes 224 px of the left column, which leaves two card
columns in 560 px at 1440; the rail's twenty-two rows do not fit a 900 px viewport (Sarandë is
below the fold) exactly as C's did not; and the map is A's, still two thirds inland. It is C's
weaknesses without C's third column. At 1920 it is fine — but so is everything at 1920.

**Nobody asked which way up the map should be.** Three of the four variants moved the map around
the page; none turned it. That is the axis round 2 spends its boldness on.

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

**Mobile:** E's band on the phone (cut; a 250 px band under a two-row strip) puts
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
same camera: two instruments in the sea and one that is the zoom itself. **H, the first of the
two instruments, was cut** — § _Tried and cut_ — so what is left here is J's instrument and I's
zoom.

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
about the form: D's shot (cut) was a 520 px panel panning a 12-set beach, where
`I-dive-set.png` is the same beach whole, on the same camera as the coast, with nothing beside it.
The lens seam and the pin-accuracy requirement are I's real costs, and they are the costs of the
_decision_, not of the layout — D has them too and hides the first behind a scroll hint. So the
issue that D was going to be should be I, and its first slice is the shoreline snap.

**Where round 3 disagrees with rounds 1 and 2, with the shots that say so:**

- Round 2: "ship E non-sticky if the 900 px window test says so." Round 3: any band that holds an
  instrument is non-sticky, no test needed — H scrolled (cut) was the only honest scrolled
  state at that depth, and J at 54 vh is the most a sticky band can carry.
- Round 2's finding 3 costed the wider fence at "tiles only." `I-dive-1440.png`'s grey corner says
  it costs the extract, and finding 1 above says why the style cannot paper over it.
- Round 1's "the map pane has to be portrait" and round 2's "the band is the right shape" are both
  now beside the point: with the fence widened, the band's depth is _free_, and the question is
  what the depth holds. Round 3's answer is the sea.
- Round 2's "F is the region-scale mode to build next." Round 3: region scale is a stop on I's
  gauge, not a mode; the callout column is a way to label a region view, and the lens is what the
  region view is _for_.

## Round 4

Round 4 starts from a question rather than from a layout. The maintainer, looking at
`B-charttable-1440.png`, asked:

> a map button like in mobile, and when we switch to map show the whole map like this —
> otherwise the venues as the left panel already shows them.

Three variants: **L** was that proposal, built, so it could be judged from a picture rather than
from my prose (round 2 did the same to round 1's verdict with G, and it was the most useful thing
in round 2) — **L has since been cut, and § _Tried and cut_ carries its verdict**. **K** is the
counter-proposal and **M** is round 4's own idea; both are below.

### The finding that outranks all four rounds' layouts

Round 1 measured the **fence floor** — `h/w ≥ 1.25`, or the camera cannot zoom out far enough to
frame the coast at all — and ranked the layouts by it. That answers _can this pane show the
coast_. Every screenshot in rounds 1–3 was complaining about a different question: _how much of
this pane does the coast use_. Nobody measured that one. It is arithmetic
(`prototype-aspect.ts`):

**The 26 venues' own bounding box is 1 : 4.51 (w : h) in Mercator, north up.**

A pane fills in both axes only at exactly that aspect. Anywhere else the pane spends the
difference on padding, and on this coast the padding is inland Albania. Measured off the live
pages (the pins' rendered bounding box against the map canvas, by the same throwaway
`playwright-core` driver that took the shots):

| pane                 | w × h      | pane h:w | pins w × h | what happens                                                                                   |
| -------------------- | ---------- | -------- | ---------- | ---------------------------------------------------------------------------------------------- |
| shipped              | 430 × 560  | 1.30     | —          | coast uses **29 %** of the width                                                               |
| **A / G** two-pane   | 610 × 808  | 1.33     | 286 × 823  | 47 % of the width; 15 px off the foot                                                          |
| **B / L** full bleed | 1440 × 832 | 0.58     | 440 × 1833 | **the coast is 1833 px tall — 55 % of it is off-screen**, and 6 of 26 pins are behind the rail |
| **E** band (78°)     | 1440 × 414 | 0.29     | 1369 × 281 | 95 % of the width, 68 % of the depth — ~130 px too deep                                        |
| **K** column         | 344 × 761  | 2.21     | 161 × 694  | 100 % of the pin field, 91 % of the height                                                     |
| **K** band at Himarë | 1440 × 311 | 0.22     | 1338 × 198 | 93 % of the width, 64 % of the depth                                                           |

Two consequences, and they settle arguments rather than joining them:

1. **The set's aspect swings by a factor of seven with the filters** — 4.51 for the whole coast,
   2.07 for Sarandë, 0.60 for Himarë. So **no fixed pane shape is right twice**, and every round
   so far has been picking one and living with it.
2. **A column and a band are not rival layouts.** Round 1's A/C/G and round 2–3's E/H/I/J are the
   same layout at two aspects. Which one a page should wear is a measurement, not a taste.

### K · Locator — _the map is the shape of the answer_

```
   whole coast, 4.51 : 1                     Himarë, 0.60 : 1
┌────────┬──────────────────────┐    ┌──────────────────────────────────┐
│ ~~~~░░ │ Find your spot…      │    │ ↖N   Palasë  Dhërmi  Jalë  Borsh │ band, 311 px,
│ ~~░░Velipojë €14 ①            │    │ ~~~~~~~~~~ sea ~~~~~~~~~~~~~~~~~ │ turned to 36°
│ ~~░░Shëngjin €16 ②            │    ├──────────────────────────────────┤
│ ~~░░   │ [coast][Shkodër]…    │    │ Himarë.  11 venues  [coast][…]   │
│ ~~░░Lalëz  €21 ①  ┌────┐┌────┐│    │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│ ~~░░Currila€16 ①  │card││card││    │ │card │ │card │ │card │ │card │  │
│ ~~░░Golem  €13 ③  └────┘└────┘│    │ └─────┘ └─────┘ └─────┘ └─────┘  │
│ ~~░░   ⋮                      │    │  four columns, the whole width   │
│ ~~░░Ksamil €21 ③              │    └──────────────────────────────────┘
└────────┴──────────────────────┘
  344 px            3 columns          Sarandë (2.07) is the same column at 556 px, 3 columns
```

No mode, because a map only needs one if it is the wrong shape. The column runs the window's
full height and takes the **width that shape needs** — 344 px for the whole coast, 556 for
Sarandë — and when the set goes wider than 1.3 the map leaves the column and becomes round 2's
turned band instead, at the depth the turned set measures (311 px at Himarë, where E used 414).
The card grid gains and loses a column as you narrow, which is the layout _saying_ you narrowed.

The width the ribbon does not spend on geography it spends on **labels, not padding**: every
beach with a venue gets a leader into the right-hand gutter with its count and its from-price,
two-pass de-overlapped. That is round 1's coast index (C) drawn on the coast instead of beside
it, at a quarter of C's width — and at 1920 the whole instrument is 21 % of the page
(`K-locator-1920.png`, four card columns).

Pins are dots here, not the shipped pills: a 161 px pin field cannot wear a 90 px price pill,
and the gutter is carrying the text anyway. Cost: the map stops being a pan-and-zoom surface at
this size (K hides its zoom column), and the licence credit has to move — it wraps to two lines
in a 344 px pane and lands on Borsh and Ksamil, so K draws its own in the open sea top-left.

### M · Ledger — _the beach is the unit_

```
┌──────────────────────────────────────────────────────────────────┐
│ 16 beaches on Sat 19 Sept.   The coast north to south, 26 venues │
├──────────────┬──────────────┬──────────────┬─────────────────────┤
│ ░ stretch ░░ │ ░ stretch ░░ │ ░ stretch ░░ │  each map is that   │
│ ░ of coast ░ │ ░ of coast ░ │ ░ of coast ░ │  beach's own shape  │
│ Palasë  €22  │ Drymades €32 │ Dhërmi  €24  │                     │
│ 2 venues·35  │ 1 venue · 3  │ 3 venues·26  │                     │
│ ▦ Palasa Sa… │ ▦ Drymades … │ ▦ Aurora Bay │                     │
│ ▦ Palasa Pi… │              │ ▦ Folie Mar… │                     │
└──────────────┴──────────────┴──────────────┴─────────────────────┘
```

If no single pane can be the right shape for every set, stop having a single pane. The coast
becomes a grid of beach cards, north to south, each carrying a small map of its own stretch at
that stretch's own aspect — so **every map on the page is full of coast**, which no single map
in four rounds manages.

It also changes what the page is a list _of_, and that is the part I would defend hardest. A
tourist does not choose between Palasa Sands and Aurora Bay first; they choose Dhërmi or Jalë or
Borsh — different water, different drive, different crowd — and only then a venue on it. Today's
Discover asks them to scan 26 venue cards across sixteen beaches with no sense of which beach is
which, and hides the beach in a `<select>`. `M-ledger-himare.png` is the case for it: six
portraits, and Palasë's valley, Drymades' straight sand, Dhërmi's village and Jalë's bay are
immediately different places.

**And it is already the phone layout.** `M-ledger-phone.png` needed no responsive work at all:
the beach card is the natural phone unit, map and first venue on the first screen, no List/Map
toggle and no sheet gesture to learn. It is the only variant in four rounds whose desktop
layout is its phone layout.

Costs, measured:

- **The browser keeps exactly 16 WebGL contexts.** Asked for 40 in this Chromium (a bare
  `about:blank` page, 300 × 300 canvases): 16 alive, 24 already lost, silently, oldest first. Sixteen beaches at whole-coast scale sits exactly on the
  cliff, so M draws nine live and the rest as stills; a shipped version needs an intersection
  observer, and that is a real constraint on the idea, not a detail.
- **The licence credit is per map.** Sixteen maps would carry sixteen OpenMapTiles/OpenStreetMap
  pills. M hides them and carries one for the page, which is the honest answer and which the
  shipped `app-riviera-map` cannot currently express.
- **A one-venue beach has no stretch to measure**, so it falls back to the catalogue's own
  recorded camera — and at that zoom the fixtures' rough pins frame open water (Velipojë, Lalëz
  in `M-ledger-1440.png`; Palasë and Dhërmi at Himarë show no sea at all). Round 3 met this as
  "the venue pin's accuracy becomes a product requirement" at zoom 15; it bites at zoom 12 too.

### What I would ship, and why

**K, and it is not close.** It answers the actual question — _where does the map go on desktop_ —
with a rule instead of a preference, and the rule is measured off data the page already has.
It is the only variant in four rounds where the map is never the wrong shape, never below the
fold, never in the way, and never absent; the list still gets three to four columns; and C's
coast index, the strongest single idea in round 1, finally has somewhere to live that costs
21–24 % of the page instead of a third of it. Its port cost is round 2's (bearing, the rotated
fit, the rotation-aware fence) plus a per-pin "dot" rendering on the pin layer. Ship the column
first; the band is E, which round 2 already costed.

**Not L's toggle — but take L's list.** The toggle's list state is better than the list in every
other variant here, and the reason is simply that nothing is stealing its width. K is the way to
get that without paying a mode: at 344 px the map takes less from the grid than A, C, G, E, H or
J do, so the list keeps almost everything the toggle would have given it. If the toggle ships
anyway, it must open on the result set and never on the whole coast: measured, that frame holds
45 % of the coast with six more pins behind the rail, and no amount of styling fixes that.

**M is a separate product decision and a better one than D or I.** Round 1 parked D ("a separate
product decision"), round 3 replaced it with I. M is smaller than both, needs no new backend read
and no new camera, and changes the funnel in the direction the catalogue already points (#1141
made beach a fixed catalogue with its region derived). Worth its own issue, with the WebGL budget
and the page-level credit written into it. Its first slice is the same as I's: a shoreline snap
on the operator's pin placer, because a beach portrait is only a portrait if the pin is on the
beach.

**Where round 4 disagrees with round 3, with the shots that say so:**

- Round 3 shipped **J's day line** into E's band. J's own coast shot does not support it:
  `J-sundial-1440.png` puts the day line across the frame at y ≈ 535, and for most of its length
  it is over Vlora, Gjirokastra and inland mountains, not "in the water" — the sea is only the
  bottom-left corner at that camera. And the dusk treatment costs the pins their legibility:
  in `J-sundial-1630.png` Shëngjin's pill is grey on grey and "Golem & Qerret from €13" is
  barely readable. The instrument is good; it reads at **region** scale, where the sea is
  actually at the foot — which is K's band, and which is where round 4 would put it.
- Round 3's "any band that holds an instrument is non-sticky, no test needed" was derived from
  bands 414–594 px deep. Measured, the whole coast wants 272 px at 1440 and Himarë wants 198;
  E and H were deep because the depth was chosen, not computed. A computed band at ~310 px can
  stay sticky and still hold J's line.
- Round 1's "A is the only variant that can keep a whole-coast default view" is nearly right and
  slightly wrong: measured, A's pins are 823 px tall in an 808 px pane — 15 px off the foot, not
  24 px of slack.
- Round 2's "F is the region-scale mode to build next" and round 3's "region scale is a stop on
  I's gauge" are both answered by the rule instead: region scale is not a mode or a stop, it is
  the same page with a different set, and the layout follows the set.

**Mobile:** M as it stands, with no changes (`M-ledger-phone.png`). If the ledger is not the
page, then K's rule says a 390 × 780 phone is 2.0 h:w against a 4.51 coast — the closest any
viewport gets to the coast's own shape, and far better than 1440 × 832's 0.58 — so the phone
wants the **column**, not the band and not a toggle. `K-locator-phone.png` shows the ribbon
alone filling a phone screen with all sixteen beaches legible; the work K does not do is the
responsive half, where the ribbon becomes a short header strip with the cards under it.

## Round 5 — the phone is the target

Rounds 1–4 designed for 1440 × 900 and wrote mobile as a closing paragraph, on four phone
screenshots in total. Round 5 starts from the phone: 390 × 844, one hand, glare, 4G, the shipped
tab bar taking the last 61 px, and a tourist who is very often already standing on the riviera.
Every judgement below is from a screenshot at that size or a number measured off the live page,
never from the desktop shots or the earlier prose.

### What the earlier rounds said about the phone, checked

- **"The whole coast is impossible to frame at 390 px."** Half right. It is impossible for the
  _turned band_ — round 2's finding 3, confirmed: `I-dive-phone.png` and `J-sundial-phone.png`
  both show the fence pushing the camera inland with the pins off both edges. North up it frames
  fine on a portrait pane: `B-charttable-phone-coast.png` measures the 26 pins at 306 × 733 in a
  390 × 776 pane at zoom 7.49, well above the `minZoom: 7` floor. The real limit is depth: any
  pane under ~520 px is fence-bound at 390 wide, so a whole-coast map **in a scroll column** is
  impossible and a whole-coast map **as the page** is not. Either way round 1's own consequence
  2 holds harder on a phone: nobody books from the orientation shot.
- **"On a phone the rail becomes B's sheet over the full-bleed map"** (rounds 1, 2). Rendered,
  the sheet's peek plus the tab bar cover the foot from y ≈ 600, the fit does not know it, and
  the southern pins (Sarandë, Ksamil, bottom edge at y = 827) sit behind the sheet with the
  licence credit under the tab bar. Fixable bugs, not the design — but the design costs the page
  its scroll and asks a thumb to learn a detent, and its peek carries two 188 px cards and no
  filter. At region scale (`B-charttable-phone.png`) the map itself is the best-looking phone map
  in the spike, which is why N keeps its pills.
- **"K's ribbon alone fills a phone screen with all sixteen beaches legible"** (round 4). True,
  and the only phone screen in four rounds on which the whole coast is readable — but its labels
  are 22 px tall (sixteen controls under the 44 px floor), and the column state's responsive
  half is not "undone", it is broken: at 390 px the aside is 396 px wide and the card grid is
  squeezed off the right edge (the card links measure **2 px** wide; `K-locator-phone.png`,
  `K-locator-tall.png` shows the chips peeking in). Its Himarë state switches to the band and a
  two-column grid of the desktop card, which at 166 px per card wraps every name and stacks
  three chips deep (`K-locator-phone-himare.png`). The ribbon is a chooser, not a page.
- **"M is already the phone layout; it needed zero responsive work"** (round 4). A coincidence
  of stacking, not a signal. `M-ledger-phone.png`: the first screen is a heading panel, one
  260 px map of **Velipojë** — the northernmost beach, 200 km from most tourists — and one
  venue row at y ≈ 600. The whole coast is a **7,146 px** scroll in geographic order, so a
  tourist at Dhërmi scrolls ~4,500 px to reach their beach. Nine of the sixteen beaches have one
  venue, so nine of the sixteen "portraits" are the catalogue's fallback camera framing open
  water or a village. And the cost below is the highest on the page by an order of magnitude.

### What a first screen costs on 4G (measured)

Served from disk by the screenshot driver, counted per page load at 390 × 844: the style,
sprites and glyphs (`map`), the tile ranges (`tiles`), and live WebGL contexts (`canvases`).

| First screen                  | map requests / bytes | tiles / bytes | canvases | map on it? | first venue on it? |
| ----------------------------- | -------------------- | ------------- | -------- | ---------- | ------------------ |
| shipped Discover              | 0 / 0                | 0 / 0         | 0        | no         | no                 |
| **B** at Himarë               | 6 / 341 kB           | 6 / 110 kB    | 1        | yes        | two peek cards     |
| **K** whole coast             | 6 / 344 kB           | 6 / 127 kB    | 1        | ribbon     | no (off-screen)    |
| **M** whole coast             | **50 / 2,795 kB**    | 16 / 214 kB   | **9**    | Velipojë   | one row            |
| **N** near Dhërmi (or Himarë) | 6 / 341 kB           | 4 / 83 kB     | 1        | yes        | three rows         |
| N with the coast picker open  | 12 / 685 kB          | 8 / 184 kB    | 2        | —          | —                  |

The 341 kB every map pays is mostly glyph ranges and the 75 kB style — the tiles are the cheap
part. M pays it nine times over. The picker's second context is paid only when it is opened,
which is the argument for keeping the whole-coast map out of the first screen.

### Verdict on the five, as phone designs

**I and J die** (their rows in § _Tried and cut_). **K dies as a page** and lives as a chooser.
**M dies as a page**: the beach as the unit is right and is kept as the list's grouping; sixteen
maps are not. **B survives at region scale as a map** and dies as a page structure: the sheet is
the wrong container for the list on a phone whose page can simply scroll.

### N · Here — _the phone opens where you are_

```
┌──────────────────────────────┐
│ ◎ Dhërmi                 [📅]│  the strip: where (press → the coast picker), when
│   Near you · Himarë · nearest│  J's sentence: 8 of 11 still take a booking for today
├──────────────────────────────┤
│  MAP, full width, 236–400 px │  depth = the set's own shape (K's rule on the phone's one
│  shipped pills · [You're here]│  free axis); a tall region is turned (Sarandë, Durrës);
├──────────────────────────────┤  one finger scrolls the page, two move the map
│ Dhërmi · 0.4 km      3 venues│  the beach as the unit (M), captioned with distance
│ ▦ Aurora Bay   €30  5 free   │  the row IS the pin's preview — a pin press scrolls to
│ ▦ Dhërmi Sun…  €24 19 free   │  it and lights it; no card floats over a 260 px map
│ Drymades · 1.5 km    1 venue │
│ ▦ Drymades D… [Closed today] │  J's state on the row and on its pin
├──────────────────────────────┤
│ Beaches · My bookings · Menu │  the shipped tab bar
└──────────────────────────────┘
```

Opens on a region, never the coast: the tourist's own when located, Himarë (11 of the 26 venues,
the riviera proper) otherwise, with **Near me** bottom-left in the map — the thumb's corner, not
the shipped top-right. The whole coast lives one press away in the **coast picker**
(`N-here-phone-picker.png`): K's ribbon down the sheet's left edge and C's index beside it as
44 px rows, each beach tied to its dot by a leader — the one place the whole coast is legible on
a phone, paid for on demand.

Measured on the first screen (`N-here-phone.png`): strip 92 px, map 263 px, the first row at
y = 470 and three rows above the tab bar; 11 venues make a 1,846 px page. The map's depth is
the set's own: 263 for Himarë (0.60), 236 for a turned Sarandë or Durrës, 236 for one beach
whose three venues are one pill. The credit moves to the map's top-right below `lg` so the foot
is Near me's.

**Desktop** (`N-here-1440.png`, `N-here-1920.png`): the phone's map pane becomes the left
column at the phone's own width, 390 px, the strip above it and the region's coast index under
it when the set leaves room; the rows become the shipped-style card grid, grouped by beach, two
columns at 1440 and three at 1920. At the whole coast the column takes the full height and
frames all 26 pins (295 × 664 in 390 × 706 at 1440; 325 × 842 in 390 × 886 at 1920) with the
shipped pills crowding them into readable places — no dots, no gutter. Desktop is the phone plus
a list beside it, not a second page.

### O · Thumb — _the same page with the map at the foot_

Built to answer one question from a picture: do the pins belong in the thumb's arc? The map is
fixed above the tab bar and the list scrolls between the strip and it (`O-thumb-phone.png`,
`O-thumb-phone-scrolled.png`). Measured: the map plus the tab bar are **324 px of permanent
chrome**, the scrolling list window is ~390 px, and the map never leaves — every scroll is
letterboxed between two fixed bands. It reads as a docked widget, not as the ground. The pins
are reachable; the rows, which are the primary act, lose half their screen for it.

### P · Search — _the Airbnb pattern, copied on purpose_

Built after the maintainer rejected N and O on sight and asked for a design worth copying. The
reference sites are blocked from this session's network, so P is the pattern from memory —
Airbnb's mobile search, the most-tested answer to "browse places, then pick one on a map" — and
a later session with the domains allowed should check it against the real screens.

```
  list screen (opens here)            map screen (the Map pill)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ [⌕ Himarë · Sat 19 · 11 ▾]   │    │ [⌕ Himarë · Sat 19 · 11 ▾]   │  the same bar, floating
│ ┌──────────────────────────┐ │    │ ░░ MAP, FULL BLEED ░░░░░░░░░ │
│ │ photo 3:2                │ │    │   (Palasë & Drymades 3)      │  the shipped price pills
│ │ Palasë · Himarë          │ │    │      (Jalë & Livadhi 3)      │
│ │ Palasa Sands  ★4.6       │ │    │ ~~~~~~~ sea ~~~~~~~~   (◎)   │  locate, bottom-right
│ │ from €26   11 of 26 free │ │    │ ┌──────────────┐┌──────────  │  the carousel: one card
│ └──────────────────────────┘ │    │ │▦ Palasa Sands ││▦ Drymade  │  per pin, snapping; a
│ ┌──────────────────────────┐ │    │ │  ★4.6 11 free ││          │  pill press slides its
│ │ photo   [ ✦ Map ]        │ │    │ └──────────────┘└──────────  │  card in, a swipe
│ └──────────────────────────┘ │    │          [ ☰ List ]          │  lights its pin
├──────────────────────────────┤    ├──────────────────────────────┤
│ Beaches · My bookings · Menu │    │ Beaches · My bookings · Menu │
└──────────────────────────────┘    └──────────────────────────────┘
```

Two screens and one cheap switch, and neither screen tries to hold the other — which is the
thing N and O both tried and both lost on 390 px. The list screen is the shipped-style card at
full width with no hero and **no map at all**: the first screen pays for no WebGL context and no
tiles (the table above), which no other variant in five rounds can say. The Map pill is the
shipped List / Map toggle moved to where a thumb is and given one word. The map screen is B's
region-scale map, the one phone map in the spike that read well, with the carousel doing what
B's peek sheet and the shipped preview card did — without a detent to learn and without covering
half the map. `P-search-phone-map-pin.png`: a pill press separates the Dhërmi crowd and the
carousel stays on the nearest card.

Opens on a region (the fence rule), the tourist's own when located — `P-search-phone-here.png`,
nearest first, distances on the carousel cards. The coast picker is the same sheet N uses.

Measured: list screen, bar 44 px and the first card whole at y = 140 … 545, a second card's
photo under it; map screen, the 11 pins at y = 211 … 430 in a 390 × 783 pane with the carousel at
613 … 717 and the pill at 727 … 771, nothing overlapping the tab bar. Desktop
(`P-search-1440.png`, `P-search-1920.png`): Airbnb's desktop is the shipped page's own shape —
grid left, map sticky right — with the hero and the 1080 px cap gone and the map held to a
400 px column (round 4's aspect finding) rather than the shipped 42 %; at 1920 the whole coast's
26 pins are 314 × 944 in 400 × 980, the southern pill 28 px under the fold, so the column wants
the header's height back.

### What I would ship, and where the trades are

**P on the phone, as of the maintainer's call; N was this round's own answer before it.** The
trades in P, stated: the map and the list never share a screen, so "where is this card on the
map" is a switch, not a glance; the carousel shows one card and a sliver, so browsing on the map
is a swipe per venue; and the list screen's first paint is one card and a half, as Airbnb's is.
Against that: zero map cost on the first screen, a pattern tourists already know, and the
smallest change from what ships — the toggle moves, the hero goes, the carousel is new.

N's trades, for the record:

- The map is 236–400 px and scrolls away. It is an orientation instrument, not the surface the
  booking happens on; the row is. A thumb that wants the map flicks once to the top.
- Pins are the shipped pills, so a crowd is one press away from separating (the shipped
  behaviour); on a 390 px map that is often a two-step. Dots were the alternative and are
  untouchable at 44 px.
- No preview card. The row already carries every fact the card did; a second card over a
  260 px map covered half of it.
- The whole coast is never the first screen on a phone. It is in the picker, at a second WebGL
  context's cost, when asked for.
- Two-finger panning on the in-page map (cooperative gestures). One-finger panning on a 260 px
  map inside a scroll column captures the page's scroll, which is worse.
- **Round 5's own status:** N and O are under review by the maintainer, who did not like either
  on first sight; the phone verdicts on B, I, J, K and M and the cost table above are measured
  and stand regardless.

**Where round 5 disagrees with rounds 1–4, with the shots that say so:**

- Round 1 and 2: "the sheet over B's full-bleed map is the phone answer." The sheet hides the
  southern pins and the credit (`B-charttable-phone-coast.png`), and the page loses its scroll.
- Round 4: "M as it stands, with no changes, is the phone." `M-ledger-phone.png` is one beach
  200 km away at the head of a 7,146 px scroll, nine contexts deep.
- Round 4: "the phone wants the column, not the band." The phone wants neither as a page: a
  full-width pane whose depth follows the set, turned only when the set is tall.
- Round 3: "the instruments are desktop instruments." J's is the one that matters more on a
  phone; only its band was a desktop instrument.

## Screenshots

`shots/` holds the set these notes are written from (1440 × 900 unless stated), captured against
the real tiles with the fixture venues. Rounds 2, 3 and 4 were shot by a `playwright-core` driver
serving `platform/map/riviera.pmtiles` from disk with range slicing and answering the fixture photo
paths with generated SVG stand-ins — judge photo mass, not the pictures. Round 3's states are
URL-seeded: `?now=15:30` sets the day's clock, `&still` skips J's sunrise, `?open=23&depth=14`
dives I to a venue at a zoom:

| File                                                                              | What                                                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `00-shipped-1440.png` · `00-shipped-phone.png`                                    | what ships today, for comparison                                                  |
| `B-charttable-1440.png` · `B-charttable-phone.png`                                | B at region scale, where its camera works; and the phone sheet                    |
| `B-charttable-phone-coast.png`                                                    | B's phone at the whole coast: the sheet over the southern pins                    |
| `I-dive-phone.png` · `J-sundial-phone.png`                                        | round 5's evidence for the two cuts: inland Albania, pins off-frame               |
| `K-locator-1440.png` · `K-locator-1920.png`                                       | K, whole coast: a 344 px column, three card columns; then four                    |
| `K-locator-sarande.png` · `K-locator-himare.png`                                  | K's rule at 2.07 (a 556 px column) and at 0.60 (the band)                         |
| `K-locator-phone.png` · `K-locator-phone-himare.png`                              | K on a phone: the ribbon (the grid is off the right edge); the band + 2-col cards |
| `M-ledger-1440.png` · `M-ledger-1920.png`                                         | M, sixteen beach portraits; at 1920 the same grid, wider                          |
| `M-ledger-himare.png` · `M-ledger-phone.png`                                      | M at Himarë, six stretches side by side; and the phone, unchanged                 |
| `M-ledger-phone-scrolled.png`                                                     | M's phone 900 px down: Shëngjin, Lalëz, still 5,000 px from Himarë                |
| `N-here-phone.png` · `N-here-phone-default.png`                                   | N located at Dhërmi (nearest first); and with nothing granted (Himarë)            |
| `N-here-phone-1630.png`                                                           | N at 16:30: the 16:00 closers at dusk on pins and rows                            |
| `N-here-phone-beach.png` · `N-here-phone-sarande.png` · `N-here-phone-durres.png` | one beach (shallow, north up); two tall regions, turned                           |
| `N-here-phone-picker.png` · `N-here-phone-pin.png`                                | the coast picker; a pill press separating a crowd                                 |
| `N-here-tall.png`                                                                 | N at 430 × 932                                                                    |
| `N-here-1440.png` · `N-here-1440-himare.png` · `N-here-1440-here.png`             | N's desktop: the coast column; Himarë with the index; located                     |
| `N-here-1920.png` · `N-here-1440-picker.png`                                      | N at 1920 (three card columns); the picker as a popover                           |
| `O-thumb-phone.png` · `O-thumb-phone-scrolled.png` · `O-thumb-phone-sarande.png`  | O: the map docked at the foot, first paint and scrolled                           |

## Files

| File                                                     | What                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                                  | the host: fixture data, filters from the URL, the `?variant=` switch                         |
| `variant-chart-table.ts`                                 | B — round 1's survivor; no shared layout with the rest, on purpose                           |
| `variant-locator.ts` · `variant-ledger.ts`               | K · M — round 4                                                                              |
| `variant-here.ts` · `variant-thumb.ts`                   | N · O — round 5; O is N with the map at the foot, and is N from `lg` up                      |
| `prototype-here-map.ts`                                  | round 5's map pane: depth from the set, turned when tall, Near me bottom-left, dusk pins     |
| `prototype-place-strip.ts` · `prototype-coast-picker.ts` | the strip (where, when, still selling) and the picker (K's ribbon + C's index as a sheet)    |
| `prototype-venue-row.ts` · `prototype-place.ts`          | the phone row card; the tourist's position, distances, the beach grouping                    |
| `prototype-aspect.ts`                                    | the result set's own aspect ratio — round 4's finding, and the number K is built from        |
| `prototype-band.ts`                                      | E's turned band as one element H, I and J compose; the wider fence — round 3's finding 1     |
| `prototype-days.ts`                                      | the fixture's time: each venue's sales close (J's instrument, now N's rows and pins)         |
| `prototype-camera.ts`                                    | fit the camera to the pane and the pins — round 1's finding                                  |
| `prototype-raw-map.ts`                                   | past the port: bearing, the rotated-frame fit, the rotation-aware fence — round 2's findings |
| `prototype-coast.ts` · `prototype-venue-card.ts`         | the coast as an index (regions, beaches, counts, from-prices); the card J and K share        |
| `prototype-filter-bar.ts`                                | the beach/region/date selects; B keeps them, K and M replace them                            |
| `prototype-venues.ts`                                    | 26 fixture venues                                                                            |
| `prototype-switcher.ts`                                  | the floating bar — deliberately ugly, so it reads as scaffolding                             |

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If a
variant wins it gets rebuilt test-first through the normal loop — do not promote this code.
