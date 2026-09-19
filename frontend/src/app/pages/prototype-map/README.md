# PROTOTYPE — where the riviera map goes, phone first

**Throwaway. Spike branch only (`claude/map-design-prototype-417sh1`); nothing here merges to
`main`.** Six rounds built seventeen layouts for the riviera map on Discover, on one route, so
they could be judged against each other and against what ships today. Rounds 1–4 were
desktop-first; round 5 flipped the target to a 390 × 844 phone; **round 6 researched the reference
products first — measured, not remembered — and built Q from that.** **Q is what is left**: the
maintainer took the recommendation and the other sixteen were cut, code and screenshots; § _Tried
and cut_ says what each of them proved and why it went, so nothing has to be re-derived. Their code is in this
branch's history (`git log --diff-filter=D -- 'frontend/src/app/pages/prototype-map/variant-*.ts'`).

The findings below are kept in full and are the point of the spike: the camera fit, the rotated
band's fence, the result set's own aspect ratio, what a phone's first screen costs (round 5), and
what the reference products actually do on a phone (round 6).

```
npm start           # from frontend/
open http://localhost:4200/prototype/map
node src/app/pages/prototype-map/shoot.mjs            # the shots + the cost/geometry log
node src/app/pages/prototype-map/shoot.mjs --posters  # re-render Q's still posters
```

The route was `/prototype/map-desktop` until round 5; the phone is the design target now, so the
path stopped saying otherwise. The `?variant=` switch and its floating bar went with the last
cut. Every state is in the URL: `?sheet=peek` (the sheet pulled down to the map), `?sheet=full`,
`?here=19.641,40.147` (the tourist standing on Dhërmi beach), `?region=SARANDE`, `?beach=DHERMI`,
`?now=16:30` (the clock, for the sales-close state), `?live=1` (the live map from the first
paint, for the cost row). The `variant=Q` in the shot names and the URLs below is accepted and
ignored.
Venues come from `prototype-venues.ts` (26 fixtures along the real coast), so no backend is
needed; the map itself is the real `app-riviera-map` against the real `platform/map` tiles, which
`./gradlew bootRun` serves at `/map/**` (the driver serves them from disk).

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

Sixteen layouts were built, shot, argued over and then cut — eight after round 4, two on a phone in round 5, five after round 6, and P once Q was taken. Each is here in two or
three lines so a later round does not rebuild one by accident — and so the findings below, which
still cite them by letter, keep making sense. **Their screenshots went with them**, so where a
finding names an `A-…png` or `E-…png` the claim itself is recorded in the prose, not in a file.

| Cut                 | What it was                                                                                                             | What it proved, and why it went                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** · Shoreline   | Two full-bleed panes, list left, map right — the expected pattern with the shipped page's faults fixed                  | Measured at 1440: the pins are 286 × 823 px in a 610 × 808 pane, so 47 % of the width is used and the coast runs 15 px off the foot. It is the right idea at the wrong width; **K's column is this pane sized by measurement**.                                                                                                                                                                                                                                                                                              |
| **C** · Coast index | Three columns, the left one the coast itself: region by region, every beach with its count and from-price               | The rail was the strongest single idea in round 1 and still is — it **survives as K's label gutter**, drawn on the coast instead of beside it at a quarter of the width. The three-column geometry was the weakest.                                                                                                                                                                                                                                                                                                          |
| **D** · Both maps   | The riviera map and the venue's own beach map side by side, so picking a set costs no page change                       | Its own screenshot was the argument against it: a ~520 px panel panning a 12–20-set beach with "drag to see the rest" doing real work. **Round 3 replaced it with I**, which puts both scales on one camera.                                                                                                                                                                                                                                                                                                                 |
| **E** · Horizon     | The map turned so the coast runs left → right with the sea at the foot; a full-width band, cards below                  | The orientation is right and is **kept — it is K's band shape, and `prototype-band.ts` is E as a component**. E's own band was 414 px deep where the turned set measures 272; round 4 computes the depth instead of choosing it.                                                                                                                                                                                                                                                                                             |
| **F** · Callouts    | The venues drawn on the chart as a column of callouts, each anchored to its spot by a leader line                       | "The inland waste is the label field" is a real insight and **survives vertically in K's gutter**. F itself is one scale, not a page: it can only open on a region, and the column caps at about eleven callouts.                                                                                                                                                                                                                                                                                                            |
| **G** · Verdict     | Round 1's verdict (A's panes with C's rail) built as a control rather than argued                                       | Did exactly its job: rendered, it is C with a smaller list and A's mostly-inland map. Round 1's verdict is disproven, so the control has nothing left to control for. The practice is what to keep — **build the verdict**.                                                                                                                                                                                                                                                                                                  |
| **H** · Tide table  | The coast × seven days: one bar per venue per day, drawn in the sea under its own pin, the row the date control         | The biggest idea in the spike, and not a layout question. It needs a backend read that does not exist (a week of availability per venue), its 594 px band cannot be sticky, and it reads only at region scale. **Worth its own issue with the read in it.**                                                                                                                                                                                                                                                                  |
| **L** · Map mode    | A desktop List / Map toggle: list with no map at all, or B's full-bleed map with the rail                               | Its **list state is the best list page in the spike** — four columns at 1440 with nothing stealing the width — and that argument is carried into round 4's verdict. Its map state at whole-coast scale is 55 % of the coast off-screen and six pins behind the rail.                                                                                                                                                                                                                                                         |
| **I** · Dive        | Round 3: one continuous zoom from the whole riviera to one lounger, on E's turned band, a depth gauge on the left       | Cut in round 5, on a phone. `I-dive-phone.png`: at 390 px its coast view is inland Albania with the pins 782 px wide in a 390 px pane (measured: −248 … 534), no scroll column and no list; its gauge is `lg`-only. The **idea** — one camera from coast to lounger — is a product decision that still stands (round 3), and its costs (the lens seam, the pin-accuracy requirement) are unchanged; as a page it was a desktop instrument, which round 3 said.                                                               |
| **J** · Sundial     | Round 3: today hour by hour, sales close as the light on the coast, a day line in the sea                               | Cut in round 5 as a **layout**, kept as an **instrument**. `J-sundial-phone.png`: a 420 px band at the coast bearing on a 390 px phone puts the pins at −105 … 438, the day line is `lg`-only, and 26 shipped cards under it make a 10,855 px page. What survives is the per-pin, per-row "closed for today" state and the sentence "8 of 11 still take a booking for today" — round 5's strip and rows carry both, because a tourist on the beach at half past three is exactly who J was for.                              |
| **B** · Chart table | Round 1: the map is the page, one glass rail over it; on a phone, a sheet over the full-bleed map                       | Cut in round 6 — because it **won**. Its phone form (a sheet over the map) is what Airbnb's mobile search measures as in 2026 and what Q is; its two faults in round 5 (southern pins under the sheet, the credit under the tab bar) were the fit not knowing about the sheet, and Q's camera fits into the window the sheet leaves. Its material argument — glass over the coast — is Q's sheet and the header. Nothing left that Q does not say better.                                                                    |
| **K** · Locator     | Round 4: the map's box is the result set's own shape; a 344 px coast column with a label gutter, or a turned band       | Cut as a variant in round 6; it lives twice. Its ribbon is the coast picker (the one phone screen on which the whole coast is legible); its column rule sizes Q's desktop map pane (360 px for the coast, 864 for Himarë at 1440). As a page it never had a phone form (`K-locator-phone`, round 5: the grid 2 px wide).                                                                                                                                                                                                     |
| **M** · Ledger      | Round 4: the beach is the unit — one card per beach with its own small map of its stretch                               | Cut in round 6. The beach as the unit is Q's list (grouped by beach, captioned with distance) and Q's chip rail (the region's beaches with counts); sixteen maps never survived round 5's cost table (2.8 MB, nine contexts, a 7,146 px scroll starting 200 km from the riviera).                                                                                                                                                                                                                                            |
| **N** · Here        | Round 5: the phone opens where you are; a full-width map band at the head whose depth is the set's shape, rows under it | Cut in round 6; Q keeps everything in it but the band. The opening rule (a region, never the coast; nearest first when located), the row as the pin's preview, J's sentence and dusk, the picker — all in Q. The band is Q's half detent when the thumb cannot move it: N chose the split (263 px) and the tourist had to live with it; Q's sheet gives the split to the thumb. The maintainer rejected N on sight, and the shots agree it read as a dashboard: a date `<input>` dressed as a pill, a strip, a band, a list. |
| **O** · Thumb       | Round 5: N with the map fixed at the foot, every pin in the thumb's arc                                                 | Cut in round 6. What O wanted — the pins in reach — is Q at peek (the map fills the window, the head sits in the thumb's zone) without O's cost (324 px of permanent chrome letterboxing a 390 px list). Rejected on sight in round 5; superseded now.                                                                                                                                                                                                                                                                       |
| **P** · Search      | Round 5: the Airbnb pattern from memory — list first, a `Map` pill, a full-bleed map with a snapping carousel           | Kept through round 6 as the control Q was judged against, then cut when the maintainer took Q. It was the right instinct (Airbnb) with the wrong structure: measured, Airbnb is a sheet on a map, the pill exists only once the sheet is up, and a pin tap is one card, not a carousel (round 6 § _The research_). Its one lasting number: a list-only first paint costs nothing, which Q matches with the poster.                                                                                                           |

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

## Round 6 — measured, not remembered

Round 5 built P as "the Airbnb pattern" from memory because the reference sites were blocked. Round
6 opens with the network fixed, spends its first hour looking at what the best mobile products
actually do — measured off their pages at 390 × 844 through the same `playwright-core` driver, and
read from primary sources where the page could not be reached — and builds **Q** from that. The
raw reports are in `research/` (`round-6-measured-references.md`: every response's bytes by host and
type, the geometry of every screen; `round-6-web-research.md`: the written research with every URL,
and a § of claims that could not be verified). Four reference screenshots are in `shots/ref-*.png`.

### What was reachable, and what was not

| Site                                   | Reached?                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| airbnb.com + a0.muscache.com (its CDN) | **Yes, both** — the page rendered with its own CSS and JS, so its screenshots and cost numbers are whole. Prices in USD (the proxy's egress).                      |
| booking.com                            | No — `403 … detected as a robot`, 1.1 kB. Its map is described from Baymard's and the GIS&T Body of Knowledge's published tests, marked as such.                   |
| spiagge.it                             | Home page yes; every results, city and venue page renders its SPA error because the proxy refuses its data backend (`…railway.app`). Product facts from its copy.  |
| apps.apple.com (spiagge.it)            | Page yes (desktop UA; the iPhone UA is redirected into the App Store app); every screenshot image host (`mzstatic.com`) blocked, so no app screenshots.            |
| mobbin.com + its image hosts           | Site yes; search and every app flow behind a login wall. No Airbnb iOS flow was reachable.                                                                         |
| google.com/maps, maps.gstatic.com      | No — blocked at the proxy. Google Maps is described from 9to5Google's redesign coverage (2024–25) and the M3 / androidx sources. `maps.googleapis.com` is allowed. |
| m3.material.io                         | Connects but renders nothing without JS; the numbers come from the Material Components Android docs and the androidx Compose source that implement it.             |
| developer.apple.com (HIG)              | Yes, via its JSON endpoints.                                                                                                                                       |
| dribbble.com / behance.net             | Empty challenge / 403. Concepts are search-snippet only and are not relied on.                                                                                     |

### The research

**Airbnb, mobile web, measured** (`ref-airbnb-phone.png`, `-list`, `-pin`). The one finding that
outranks the rest: **Airbnb's search is not a list with a Map switch. It is a map with a sheet.**

| Screen          | What is on it (CSS px at 390 × 844)                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| first paint     | a fixed top bar 0–134 (search pill 237 × 55, a filter icon 40 × 40, a chips row 34 tall at y 90); the Google map full-viewport under everything; the **sheet resting at y ≈ 441** (grabber at 449, "Over 1,000 homes" at 461); the first card 342 × 380 at y 515; the tab bar 776–844 |
| the map band    | 134 → 441 = **307 px** of map on the first screen, price pills ≈ 57 × 27, white with black text, the selected one inverted                                                                                                                                                            |
| sheet pulled up | the same sheet is the list: the top bar shrinks to 82, the tab bar goes, cards are 358 wide with a 343 px photo, and a black **`Map` pill 90 × 40 at (150, 781)** — centred, 23 px above the bottom edge — is the way back                                                            |
| pin tap         | one fixed card **358 × 343 at y 485** (16 px above the bottom, a 201 px photo, an × top-right) **replaces the sheet and the tab bar**; the map keeps 134–485 = 351 px; no carousel — one card container in the DOM                                                                    |
| cost            | **195 requests, 14.8 MB** (11.5 MB of script; the Google map 1.9 MB), 6.6 MB before `load`; the Map pill tap costs 107 kB more; a pin tap costs nothing                                                                                                                               |

So P got the structure wrong in two ways: the list and the map are one screen with a draggable
sheet, not two screens with a switch (the pill exists only once the sheet is up); and a pin tap
shows one card that replaces the sheet, not a carousel.

**Booking.com** (not measured — blocked). Its search is a form first (place, dates, guests), then
a long card list; the map is a **link at the top of the results**, which Baymard's testers had
trouble finding and Hoober's reach data puts in the worst place for a thumb; on the map, price
markers with a property card at the foot. The GIS&T BoK holds it up as Shneiderman's "overview
first, zoom and filter, details on demand" done right: constrain the query, then map.

**Google Maps** (not measured — blocked; 9to5Google 2024-02 → 2025-04). Every list is a sheet
over the map with three resting heights; **even at full a sliver of the map stays visible at the
top**; the sheet's × is in its own top-right corner ("aids reachability"); the minimised sheet
docks onto a three-tab bottom bar with the map fully usable above it; the transport-mode row was
moved to the bottom "for improved reach". Material 3 (from the androidx source): peek 56 dp, half
= 0.5, a 32 × 4 dp handle inside a 48 dp target, sheets up to 640 dp wide, a 64 dp navigation bar.
Apple's HIG: `medium` (about half) and `large` detents, a grabber ("tap to cycle through the
detents"), nonmodal sheets so "people use its functionality to affect the parent view without
dismissing the sheet", place cards as sheets that "keep the location on your map visible".

**spiagge.it** (home measured, `ref-spiagge-phone.png`; inner pages blocked). A real B2C product —
"più di 2400 stabilimenti", 47.6 MB app, 4.6 ★ from 346 — and the same company's B2B software
runs the venues. Its first screen is a search card: **where** ("Dove vuoi andare?"), **when** (a
date, tomorrow by default), a full-width `Cerca`. No map on the home page and no map toggle; the
flow is destination → date → a paged, date-scoped results list per town → the venue → "scegli
dalla mappa della spiaggia l'ombrellone" → card payment. The map in this category is the
**venue's** umbrella plan, not the coast. Home page: 71 requests, 3.4 MB (1.75 MB of images).

**SunEasy** (App Store fetched; site snippets) is the direct competitor on this coast: 86 MB app,
"browse beaches near you, see real photos, live availability", destination pages per beach
(Ksamil, Dhërmi, Sarandë, Vlorë, Himarë, Qerret, Durrës) with day-price ranges, then "pick your
sunbed or umbrella on the interactive beach map, choose your date, and confirm". Town → beach →
club → set. Every other sunbed product found (Plazz, MySunbed, Ombrellone.it, Beacharound, Find
Sunbed, BeachDibs, Lettini, Sandbeds, the B2B tools) has the same shape; a coast map is at most a
secondary "map view". Dribbble/Behance concepts could not be viewed; the snippets describe
per-venue plans and calendars, not coast maps.

**The thumb** (Hoober 2013/2017, via secondary sources — the primaries are blocked): 49 % hold the
phone one-handed and 75 % of touches are the thumb's; touch accuracy is 7 mm at the screen's
centre, 11 mm at the top, **12 mm at the bottom edge** — the bottom band is reachable but the
least precise. On a 390 × 844 pt phone the comfortable band above the tab bar is roughly
y 506–761; targets there want 60–70 pt, not 44.

**Glare**: a 200-nit LCD reads under 2 : 1 in direct sun; positive polarity (dark on light) wins
above ≈ 1,500 lux and its advantage grows as text gets smaller; the HIG says test "outside on a
sunny day" and avoid Light/Thin weights.

**4G**: the 2025 median mobile page is 2.2 MB with 646 kB of script (Web Almanac). A MapLibre
first view is ≈ 200 kB of library plus style, sprite, ≈ 100 kB per glyph range and ≈ 30 tiles —
0.8–2 MB and 35–40 requests before it is readable; a static image is one request. Round 5's own
table said the same on this map: 341 kB of style and glyphs plus tiles plus a context, per map.

### What fits a tourist standing on the riviera with one hand, glare and a tab bar — and what does not

Fits:

1. **The sheet over the map** (Airbnb, Google Maps, Apple Maps, the HIG, M3). Three resting
   heights, a grabber, the map never traded away, the thumb setting the split. Nobody learns it;
   everyone already knows it.
2. **Where and when before which** (spiagge.it, SunEasy, Booking): the query — a place, a day —
   is visible in every state, because on this product the day decides what is still for sale
   (invariant #4).
3. **The beach as the step between the town and the club** (SunEasy, M): a chip rail of the
   region's beaches with counts.
4. **A price on the pin and the venue's facts in the sheet** (Airbnb): the row is the preview.
5. **Primary controls between y ≈ 500 and the tab bar, but not on the bottom edge** (Hoober):
   the sheet's head at half sits at y 380–496 — the thumb's natural zone, above the imprecise
   edge.
6. **Dark ink on light glass, 44 px pins, nothing under 12.5 px, nothing thin** (glare).
7. **A first screen that costs one image, not a WebGL context** (the cost tables).

Does not fit:

1. **Map-first with no query** (Google Maps): its job is wayfinding; ours is choosing among a
   region's ten venues for one day.
2. **A Map link at the top of the results** (Booking): unreachable and, per Baymard, unfound.
3. **Two screens and a switch** (P): "where is this row on the map" should be a glance, not a
   mode change.
4. **A fixed split** (N, O): the right split at 10:30 scanning the list is not the right split at
   15:30 hunting a pin.
5. **A carousel over the map** (P): Airbnb does not do it either; one card, or the sheet.
6. **A live vector map on the first paint** when a still one will do: 341 kB and a context on 4G
   for a picture nobody has touched yet.

### Q · Shore — _the map is the ground, the list is a sheet, the first map is a poster_

```
  half (opens here)                 peek (the map)                     full (the list)
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Riviera            glass hdr │  │ Riviera                      │  │ Riviera                      │
│ ░░ POSTER, one JPEG ░░░░░░░░ │  │ ░░ LIVE MAP, full window ░░░ │  │ ░ sliver of map (44 px) ░░░░ │
│  (Palasë & Drymades 3)       │  │      (Palasë & Drymades 3)   │  │ ═══ grabber                  │
│     (Jalë & Livadhi 3)       │  │           (Jalë & Livadhi 3) │  │ Himarë ▾          [📅 Today ▾] │
│ ~~~ sea ~~~  (Borsh 2)       │  │  ~~~~~~~~~ sea ~~~~~ (Borsh) │  │ 11 venues · 8 selling today  │
│ [◎ Near me]                  │  │                              │  │ [All 11][Palasë 2][Drymades… │
├══ grabber ═══════════════════┤  │                              │  │ Palasë            2 venues   │
│ Himarë ▾          [📅 Today ▾] │  │ [◎ Near me]                  │  │ ▦ Palasa Sands   €26  11/26  │
│ 11 venues · 8 selling today  │  ├══ grabber ═══════════════════┤  │ ▦ Palasa Pine    €22  24/28  │
│ [All 11][Palasë 2][Drymades… │  │ Himarë ▾          [📅 Today ▾] │  │ Drymades          1 venue    │
│ Palasë            2 venues   │  │ 11 venues · 8 selling today  │  │ ▦ Drymades Dune  Closed today│
│ ▦ Palasa Sands   €26  11/26  │  │ [All 11][Palasë 2][Drymades… │  │ ▦ …          [ ⌖ Map ]       │
│ ▦ Palasa Pine    €22  24/28  │  ├──────────────────────────────┤  ├──────────────────────────────┤
│ Beaches · My bookings · Menu │  │ Beaches · My bookings · Menu │  │ Beaches · My bookings · Menu │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
```

What it is, in the order it was decided:

- **The ground is the map, under the shipped glass header** (B's material argument, finally
  earned: the header blurs the coast). The sheet is `appPanelGlass` over it.
- **Three resting heights**, Airbnb's and Google's: **half** (the sheet's top at y 380: 312 px of
  map under the 68 px header — Airbnb rests at 441 with a 134 px bar, so its band is 307), **peek**
  (the head only, 132 px above the tab bar: the map fills 68 → 651), **full** (the top at 112: a
  44 px sliver of map stays, Google's rule, and a `Map` pill at the foot is Airbnb's way back).
  Drag the head, or anything on the sheet below full; tap the grabber to cycle. The tab bar stays
  in every state, because this product has one; Airbnb hides its own.
- **The first screen's map is a poster** (`prototype-poster.ts`): the region's fitted camera
  rendered once by the real map (`shoot.mjs --posters` opens `?variant=Q&poster=<key>` and
  screenshots 440 × 380 at 2×; 22 JPEGs, 10–129 kB, Himarë 38 kB) and served from
  `public/prototype-posters/`. The shipped pin layer draws over it through a `MapHandle` whose
  `project` is Mercator arithmetic for that camera, so the pins crowd, price and press exactly as
  on the live map. The first thing that has to _move_ the camera — a crowd press, a finger on
  the ground, the sheet pulled down to peek, Near me — swaps the live map in at the same camera,
  aimed at the window the sheet leaves, and the poster fades under it. Measured: the live map's
  pins land where the poster's were, to the pixel (348 × 219 at 24, 120 in both).
- **The sheet's head carries the query and stays visible at every height**: the place (press → the
  coast picker), J's sentence (`11 venues · 8 selling today`), the day (a pill; press → seven day
  chips in the same rail), and the region's beaches as chips with counts (SunEasy's step, C's
  index). The head is 132 px; Airbnb's collapsed header is about 80 — ours carries the query, by
  decision.
- **The row is the preview** (N): a pin press raises the sheet to half if it was down and scrolls
  the row to the sheet's top, lit. No card over the map (Airbnb's replaces the sheet; here the
  sheet is the card).
- **A region, never the coast, on a phone** (rounds 4–5): the tourist's own when located, Himarë
  otherwise; north up always — with the split the thumb's, a tall region (Sarandë) simply gets a
  taller window at peek, so N's turning is gone.
- **Near me sits at the map's foot at half** (y 324, left) — mid-screen, the thumb's natural
  zone, not the bottom edge Hoober measures at 12 mm. It hides at full.
- **Desktop from `lg`**: the sheet is the left panel, pinned open, with the same head; the map is
  the rest, sized by round 4's rule — the pane takes the width the set's shape needs (360 px for
  the whole coast, 864 for Himarë at 1440) and the panel keeps the rest, rows below 760 px, a card
  grid above (three columns at 1440, four at 1920). The desktop opens on the whole coast, which
  its column can frame.

### Measured: geometry and cost

Phone, 390 × 844, by `shoot.mjs` (photos are SVG stand-ins — judge mass, not pictures):

| State                    | Map on it                                                       | First row                       | Map requests / bytes               | Tiles / bytes | Contexts |
| ------------------------ | --------------------------------------------------------------- | ------------------------------- | ---------------------------------- | ------------- | -------- |
| **Q half** (first paint) | 68–380 (312 px); Himarë pins 348 × 219 at 24, 120               | y 533, two whole rows + a group | **0 / 0 + one poster JPEG, 38 kB** | **0 / 0**     | **0**    |
| Q full                   | 68–112, a sliver                                                | y 265, 5 rows                   | 0 / 0                              | 0 / 0         | 0        |
| Q peek                   | 68–651 (583 px), live                                           | under the head                  | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| Q pin press at half      | crowd separated inside the window (Dhërmi's three at y 135–325) | lit, scrolled                   | 6 / 326 kB                         | 6 / 57 kB     | 1        |
| Q with the picker open   | poster + K's ribbon                                             | —                               | 6 / 336 kB                         | 6 / 124 kB    | 1        |
| Q `live=1` (the control) | 68–380 live, pins at 24, 120                                    | y 533                           | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| P list (round 5)         | none                                                            | y 139, 1½ cards                 | 0 / 0                              | 0 / 0         | 0        |
| P map                    | 0–783 full bleed, carousel 613–717                              | —                               | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| N (round 5)              | 92–355 band                                                     | y 463                           | 6 / 341 kB                         | 4 / 83 kB     | 1        |
| M (round 5)              | Velipojë, 260 px                                                | y ≈ 600                         | 50 / 2,795 kB                      | 16 / 214 kB   | 9        |
| Airbnb (measured)        | 134–441 (307 px)                                                | y 515, one card                 | 195 requests, 14.8 MB (map 1.9 MB) | —             | —        |

430 × 932: the same layout; the poster's 440 px width covers it with a 5 px crop, the first row is
still at y 533 and the tall phone gets its extra 88 px as list (`Q-shore-tall.png`); at peek the
window is 68 → 739 (`Q-shore-tall-peek.png`). Desktop: panel 1,080 + map 360 at 1440 (whole coast,
pins 311 × 765 in 360 × 816, three card columns); panel 576 + map 864 at Himarë (pins 827 × 509);
panel 1,536 + map 360 at 1920 (four columns).

### Judged from the shots

**Q against the six**, from the same phone shots:

- **against P** (the maintainer's reference): P's list screen is one card and a half; Q's opening
  screen has the map, three place pills, the query and two whole venue rows, for a 38 kB image.
  P's map screen is Q at peek, without the switch to get there and without the head. P's pin press
  slides a carousel card in; Q's lights the row. Where P still wins: its list-only first paint is
  the cheapest possible, and it is the smallest change from what ships.
- **against N**: the same rows, the same rule, the same instrument — and no fixed 263 px band.
  N's date `<input>` is a pill; N's strip, band and list were three surfaces, Q is two (ground,
  sheet).
- **against O**: Q at peek is what O wanted — the pins in the thumb's arc — without O's 324 px of
  permanent chrome.
- **against B**: B's phone sheet with its faults fixed. The pins are never under the sheet
  (`Q-shore-phone-sarande.png`: Sarandë's two pills at y 84–355, the sheet at 380), and the credit
  sits in the top-right under the header.
- **against K and M**: K is inside Q twice (the picker, the desktop pane rule); M's unit is Q's
  grouping and chip rail.

**Q's own faults**, the honest list:

1. **The poster is a real backend cost.** A shipped version renders one image per region and
   beach server-side from the same extract (ADR-0022 keeps the map first-party), at 2× and 3×,
   invalidated with the extract. The prototype's 22 JPEGs (956 kB) are that job done by the
   screenshot driver.
2. **The pin layer still crowds at 390 px** — Himarë's "Palasë & Drymades" pill overlaps its
   own member discs, as it did in N and P. Shipped behaviour, unchanged; the crowd rule is not
   this spike's.
3. **Near me at the map's foot sits among the pins at beach scale** (`Q-shore-phone-pin.png`:
   next to a €30). It wants the map's bottom-right at beach zoom, or to hide while a beach is
   chosen.
4. **The desktop whole-coast column at 360 px** puts a place pill over the zoom buttons —
   round 4's argument for K's dots and gutter at that width, not built here.
5. **Body drag at full does not lower the sheet**; only the head does. Airbnb and Google lower it
   when the list is scrolled to its top. A shipped sheet does that.
6. **The fixture pins are inland** (the Dhërmi poster is the village, `You are here` at 0.4 km):
   rounds 3, 4 and 5's pin-accuracy finding, once more.
7. **Whole coast is not a phone state**: the picker's `Whole coast` falls back to the default
   region below `lg`. Round 5's rule, kept; it should be hidden there.

### What I would ship, and why

**Q.** It is the first layout in six rounds built from what the reference products are measured
to do rather than from what they were remembered to do, and it beats the two things the
maintainer asked for by name: it is the Airbnb pattern (the real one — a sheet over a map, one
screen), and it is the first phone first-screen in the spike with a map, a venue and a row on it
for the price of one image. Its port cost is small and named: a sheet with three heights (no
library), a `MapHandle` over a still image (`project` only), a fit that aims at the window the
sheet leaves (`fitUnderHeader`, and the same aim on a crowd press), a poster renderer on the
backend, and the desktop pane rule from round 4. The shipped tab bar, header, pin layer, card
tokens and picker are used as they are.

**Not P**, which was the right instinct and the wrong structure — and not because the maintainer
rejected N and O, but because the measured Airbnb is Q.

**Ship the poster with it, not later.** Without it Q's first screen costs what N's did (341 kB +
tiles + a context) and P's list-first argument stands. With it, the argument is over.

### Where round 6 disagrees with rounds 1–5, with the shots that say so

- **Round 5: "the sheet is the wrong container for the list on a phone whose page can simply
  scroll; it asks a thumb to learn a detent."** Airbnb (`ref-airbnb-phone.png`), Google Maps and
  Apple Maps all rest a sheet on a map; the HIG and M3 specify the heights. The detent is the one
  gesture on a phone map that needs no learning. What round 5 measured against B — southern
  pins under the sheet, the credit under the tab bar — was B's fit not knowing where the sheet
  was, and it is fixed by fitting into the window (`Q-shore-phone-sarande.png`).
- **Round 5's P: "the Airbnb pattern".** From memory it was list-first with a switch and a
  carousel. Measured, Airbnb's first screen is a 307 px map band under a sheet; the pill appears
  only once the sheet is up; a pin tap shows one card that replaces the sheet. P is a plausible
  design; it is not the Airbnb pattern.
- **Round 5's cost table** made "keep the map off the first screen" (P) the only route to a cheap
  first paint. A poster with live pins is the other route, and it keeps the map.
- **Round 5's N: "a tall region is turned."** With the split the thumb's, north-up frames Sarandë
  at half (193 × 271) and gets a 583 px window at peek. Turning was the band's need, not the
  phone's.
- **Round 4: "the phone wants the column."** The phone wants a window whose height the thumb
  sets. Round 4's rule survives on the desktop, where Q sizes the pane by it.
- **Rounds 1–2: "on a phone the rail becomes B's sheet."** They were right; round 5 dropped it for
  two fixable bugs. Q is that sentence built.
- **Round 3: "J's day line."** Still the instrument that matters on a phone, and still not a
  line: it is the head's sentence and the dusk on pins and rows, as round 5 said.
- **Rounds 1–4's desktop-first order.** The desktop is the phone's sheet pinned open beside the
  map — N said so in round 5 and Q keeps it (`Q-shore-1440-here.png` is the best desktop shot in
  the spike); desktop is the second question, and it was answered by the phone.

## Screenshots

`shots/` holds the set these notes are written from, captured by `shoot.mjs` (rounds 5–6) or its
predecessors (rounds 2–4): `playwright-core` from `node_modules`, the image's Chromium at
`/opt/pw-browsers/chromium` (never `playwright install`), `platform/map/` served from disk with the
archive range-sliced as the backend does, and every fixture photo answered with a ~1.4 kB SVG
stand-in — judge photo mass, not the pictures. The driver logs each shot's first-screen cost (map
style/sprite/glyph requests, tile ranges, live WebGL contexts) and the geometry the notes argue
from; `--json` keeps the raw numbers. Phone shots are 390 × 844 at 1×; the cut variants'
screenshots went with them (P's, and round 5's I/J evidence, with the last cut), and the claims
about them are recorded in the prose.

| File                                                                                          | What                                                                                            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `00-shipped-1440.png` · `00-shipped-phone.png`                                                | what ships today, for comparison                                                                |
| `ref-airbnb-phone.png` · `ref-airbnb-phone-list.png` · `ref-airbnb-phone-pin.png`             | round 6's reference: Airbnb's mobile search at Himarë — the sheet on the map; pulled up; a pin  |
| `ref-spiagge-phone.png`                                                                       | spiagge.it's first screen: where, when, Cerca — no map                                          |
| `Q-shore-phone.png` · `Q-shore-phone-himare.png`                                              | Q's first paint: the Himarë poster, the sheet at half (the default, and asked for by region)    |
| `Q-shore-phone-full.png` · `Q-shore-phone-full-scrolled.png`                                  | the sheet at full: the sliver, the Map pill; and scrolled 700 px inside                         |
| `Q-shore-phone-peek.png` · `Q-shore-phone-peek-pin.png`                                       | the sheet at peek: the live map fills the window; a crowd press at peek                         |
| `Q-shore-phone-pin.png` · `Q-shore-phone-pin-lone.png`                                        | a crowd press at half (Dhërmi separates inside the window); a lone pin press lights its row     |
| `Q-shore-phone-here.png` · `Q-shore-phone-here-pin.png`                                       | located at Dhërmi: nearest first, `You are here`; a crowd press while located                   |
| `Q-shore-phone-sarande.png` · `Q-shore-phone-beach.png`                                       | a tall region north up on the poster; one beach (Dhërmi) at the zoom cap                        |
| `Q-shore-phone-1630.png` · `Q-shore-phone-day.png` · `Q-shore-phone-picker.png`               | dusk at 16:30; the day chips; the coast picker                                                  |
| `Q-shore-phone-live.png`                                                                      | the control: the live map from the first paint, pins where the poster's were                    |
| `Q-shore-tall.png` · `Q-shore-tall-peek.png`                                                  | Q at 430 × 932, half and peek                                                                   |
| `Q-shore-1440.png` · `Q-shore-1440-himare.png` · `Q-shore-1440-here.png` · `Q-shore-1920.png` | the desktop: the whole coast (360 px pane, three columns); Himarë; located; 1920 (four columns) |

## Files

| File                                                 | What                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                              | the host: fixture data, filters from the URL, the `?variant=` switch                                 |
| `variant-shore.ts`                                   | Q — round 6: the ground, the three-height sheet, the poster/live swap, the desktop panel rule        |
| `prototype-poster.ts`                                | the still poster: its box, its camera, and the `MapHandle` over an image the pin layer draws through |
| `prototype-coast-picker.ts`                          | the coast as a chooser: K's ribbon + C's index as a sheet (a popover from `lg`)                      |
| `prototype-venue-row.ts` · `prototype-venue-card.ts` | the phone row (the pin's preview) and the desktop card                                               |
| `prototype-place.ts`                                 | the tourist's position, distances, the beach grouping                                                |
| `prototype-aspect.ts`                                | the result set's own aspect ratio — round 4's finding, and the number the desktop pane is sized from |
| `prototype-camera.ts`                                | fit the camera to the pane and the pins — round 1's finding                                          |
| `prototype-days.ts`                                  | the fixture's time: each venue's sales close (J's instrument, now the head's sentence and the dusk)  |
| `prototype-coast.ts`                                 | the coast as an index: regions, beaches, counts, from-prices                                         |
| `prototype-venues.ts`                                | 26 fixture venues                                                                                    |
| `shoot.mjs`                                          | the screenshot + cost/geometry driver, and the poster renderer (`--posters`)                         |
| `research/`                                          | round 6's two raw reports: the measured references (bytes by host, geometry) and the web research    |
| `../../../../public/prototype-posters/*.jpg`         | Q's 22 still posters, one per region and beach with venues — rendered, not drawn                     |

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If a
variant wins it gets rebuilt test-first through the normal loop — do not promote this code.
