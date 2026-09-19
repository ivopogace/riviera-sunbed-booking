# PROTOTYPE — Q · Shore: where the riviera map goes on a phone

**Throwaway prototype on its spike branch (`claude/map-design-prototype-417sh1`, PR #1155 open
for review, not merged); not production code and never promoted as is.** Q is the layout for the
riviera map on Discover, phone first (390 × 844, one hand, glare, 4G, the shipped tab bar on
screen), built from what the reference products are measured to do rather than from what they
were remembered to do. Sixteen earlier layouts were built across six rounds and cut; their code,
screenshots and verdicts are in this branch's history (commit 2e53109 and before —
`git log --diff-filter=D -- 'frontend/src/app/pages/prototype-map/'`). What they established and
Q rests on is in § _What Q rests on_. Round 7 (§ _Round 7_) improved Q on the phone and the
desktop before the decision whether to implement it; round 8 (§ _Round 8_) replaced the desktop's
whole-coast opening with a region under a coast-line chooser. The verdict and the first slices
are at the end.

```
npm start           # from frontend/
open http://localhost:4200/prototype/map
node src/app/pages/prototype-map/shoot.mjs            # the shots + the cost/geometry log
node src/app/pages/prototype-map/shoot.mjs --posters  # re-render the still posters
```

Every state is in the URL: `?sheet=peek` (the sheet pulled down to the map), `?sheet=full`,
`?here=19.641,40.147` (the tourist standing on Dhërmi beach), `?region=SARANDE`, `?beach=DHERMI`,
`?now=16:30` (the clock, for the sales-close state), `?live=1` (the live map from the first paint,
for the cost row), `?head=subtitle` (round 7's other head), `?pane=free` (round 7's other desktop
pane), `?desk=line` (round 8's desktop: a region in the pane, the coast as a line over the panel). Venues come from `prototype-venues.ts` (26 fixtures on the real shoreline — snapped there in
round 7), so no backend is needed; the map is the real `app-riviera-map` against the real
`platform/map` tiles, which `./gradlew bootRun` serves at `/map/**` (the driver serves them from
disk).

## The question

The shipped Discover page wastes the map. At 390 × 844 the first screen is a hero and three
selects — no map, no venue, no card; at 1440 × 900 the map is a 430 × 560 pane whose top edge sits
below the fold, in a page capped at 1,080 px. The thing the product is _for_ — "pick the exact
spot on a visual map" — is the smallest, last-seen element on the page. The phone is the design
target; the desktop is the adaptation.

## The research

The reference products were measured off their pages at 390 × 844 through the same
`playwright-core` driver, and read from primary sources where the page could not be reached. The
raw reports are in `research/` (`round-6-measured-references.md`: every response's bytes by host
and type, the geometry of every screen; `round-6-web-research.md`: the written research with every
URL, and a § of claims that could not be verified). Four reference screenshots are in
`shots/ref-*.png`.

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

### What the products do

**Airbnb, mobile web, measured** (`ref-airbnb-phone.png`, `-list`, `-pin`). The one finding that
outranks the rest: **Airbnb's search is not a list with a Map switch. It is a map with a sheet.**

| Screen          | What is on it (CSS px at 390 × 844)                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| first paint     | a fixed top bar 0–134 (search pill 237 × 55, a filter icon 40 × 40, a chips row 34 tall at y 90); the Google map full-viewport under everything; the **sheet resting at y ≈ 441** (grabber at 449, "Over 1,000 homes" at 461); the first card 342 × 380 at y 515; the tab bar 776–844 |
| the map band    | 134 → 441 = **307 px** of map on the first screen, price pills ≈ 57 × 27, white with black text, the selected one inverted                                                                                                                                                            |
| sheet pulled up | the same sheet is the list: the top bar shrinks to 82, the tab bar goes, cards are 358 wide with a 343 px photo, and a black **`Map` pill 90 × 40 at (150, 781)** — centred, 23 px above the bottom edge — is the way back                                                            |
| pin tap         | one fixed card **358 × 343 at y 485** (16 px above the bottom, a 201 px photo, an × top-right) **replaces the sheet and the tab bar**; the map keeps 134–485 = 351 px; no carousel — one card container in the DOM                                                                    |
| cost            | **195 requests, 14.8 MB** (11.5 MB of script; the Google map 1.9 MB), 6.6 MB before `load`; the Map pill tap costs 107 kB more; a pin tap costs nothing                                                                                                                               |

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
0.8–2 MB and 35–40 requests before it is readable; a static image is one request. On this map,
measured: 341 kB of style and glyphs plus ~100 kB of tiles plus one WebGL context, per live map.

### What fits a tourist standing on the riviera with one hand, glare and a tab bar — and what does not

Fits:

1. **The sheet over the map** (Airbnb, Google Maps, Apple Maps, the HIG, M3). Three resting
   heights, a grabber, the map never traded away, the thumb setting the split. Nobody learns it;
   everyone already knows it.
2. **Where and when before which** (spiagge.it, SunEasy, Booking): the query — a place, a day —
   is visible in every state, because on this product the day decides what is still for sale
   (invariant #4).
3. **The beach as the step between the town and the club** (SunEasy): a chip rail of the region's
   beaches with counts.
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
3. **Two screens and a switch**: "where is this row on the map" should be a glance, not a mode
   change.
4. **A fixed split**: the right split at 10:30 scanning the list is not the right split at 15:30
   hunting a pin.
5. **A carousel over the map**: Airbnb does not do it either; one card, or the sheet.
6. **A live vector map on the first paint** when a still one will do: 341 kB and a context on 4G
   for a picture nobody has touched yet.

## Q · Shore — _the map is the ground, the list is a sheet, the first map is a poster_

```
  half (opens here)                 peek (the map)                     full (the list)
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Riviera            glass hdr │  │ Riviera                      │  │ Riviera                      │
│ ░░ POSTER, one JPEG ░░░░░░░░ │  │ ░░ LIVE MAP, full window ░░░ │  │ ░ sliver of map (44 px) ░░░░ │
│ (3 beaches from €22 · 6)     │  │   (3 beaches from €22 · 6)   │  │ ═══ grabber                  │
│     (Jalë & Livadhi 3)       │  │           (Jalë & Livadhi 3) │  │ Himarë ▾      [⛱ 6] [Today ▾] │
│ ~~~ sea ~~~  (Borsh 2)       │  │  ~~~~~~~~~ sea ~~~~~ (Borsh) │  │ 8 of 11 selling today        │
│ [◎ Near me]                  │  │                              │  │ Palasë            2 venues   │
├══ grabber ═══════════════════┤  │                              │  │ ▦ Palasa Sands   €26  11/26  │
│ Himarë ▾      [⛱ 6] [Today ▾] │  │ [◎ Near me]                  │  │ ▦ Palasa Pine    €22  24/28  │
│ 8 of 11 selling today        │  ├══ grabber ═══════════════════┤  │ Drymades          1 venue    │
│ Palasë            2 venues   │  │ Himarë ▾      [⛱ 6] [Today ▾] │  │ ▦ Drymades Dune  Closed today│
│ ▦ Palasa Sands   €26  11/26  │  │ 8 of 11 selling today        │  │ Dhërmi            3 venues   │
│ ▦ Palasa Pine    €22  24/28  │  ├──────────────────────────────┤  │ ▦ …          [ ⌖ Map ]       │
│ Drymades          1 venue    │  │                              │  ├──────────────────────────────┤
│ Beaches · My bookings · Menu │  │ Beaches · My bookings · Menu │  │ Beaches · My bookings · Menu │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
```

What it is, in the order it was decided:

- **The ground is the map, under the shipped glass header** — the design system's backdrop
  material finally has something to blur. The sheet is `appPanelGlass` over it.
- **Three resting heights**, Airbnb's and Google's: **half** (the sheet's top at y 380: 312 px of
  map under the 68 px header — Airbnb rests at 441 with a 134 px bar, so its band is 307), **peek**
  (the place row alone, 80 px above the tab bar: the map fills 68 → 703), **full** (the top at
  112: a 44 px sliver of map stays, Google's rule, and a `Map` pill at the foot is Airbnb's way
  back). The tab bar stays in every state, because this product has one; Airbnb hides its own.
- **The sheet is two CSS scroll-snap scrollers, not a pointer-drag** (Tailwind's `snap-y
snap-mandatory`, `snap-start`, `snap-always`): the OUTER holds a transparent spacer over the
  map with the peek and half rest points as zero-height snap targets, then the sheet itself,
  exactly one snapport tall, snapping at full — so a flick raises the sheet and _stops_ at full.
  The INNER is the list: a scroller at full, `overflow: clip` below it, so a touch on the list at
  half goes to the outer and moves the sheet, and at full a pull from the list's top lowers it —
  the browser's own scroll latching, no drag arithmetic. The container starts at the full line, so
  nothing it holds paints over the map's sliver; `motion-safe:scroll-smooth` glides the
  programmatic moves; a grabber tap cycles half and full, and peek is a drag's only. (Round 6's
  single scroller let a flick run 700 px into the list; § _Round 7_ has the numbers.)
- **The first screen's map is a poster** (`prototype-poster.ts`): the region's fitted camera
  rendered once by the real map (`shoot.mjs --posters` opens `?poster=<key>` and screenshots
  440 × 380 at 2×; 22 JPEGs, 10–129 kB, Himarë 38 kB) and served from `public/prototype-posters/`.
  The shipped pin layer draws over it through a `MapHandle` whose `project` is Mercator arithmetic
  for that camera, so the pins crowd, price and press exactly as on the live map. The first thing
  that has to _move_ the camera — a crowd press, a finger on the ground, the sheet pulled down to
  peek, Near me — swaps the live map in at the same camera, aimed at the window the sheet leaves,
  and the poster fades under it. Measured: the live map's pins land where the poster's were, to
  the pixel (348 × 219 at 24, 120 in both).
- **The sheet's head is one row, 78 px at every height, and carries the query**: the place
  (press → the coast picker) over the sentence `8 of 11 selling today` (invariant #4 as the map's
  light: a venue whose sales for today have closed wears dusk on its pin and on its row), the
  region's beaches gathered into one chip (`⛱ 6`, lit with the beach's own count when one is
  chosen), and the day (`Today ▾`). A press on either chip opens its rail of chips under the row,
  with the lit chip scrolled into view, and a pick closes it. The rail enters through Tailwind's
  `starting:` variant (`@starting-style`) and leaves through Angular's `animate.leave` class
  binding, which holds the element until its transition ends; both are `motion-safe`. Airbnb's
  collapsed header is ~80; round 6's two-row head was 122 and put the first row 40 px lower.
- **The row is the preview**: a pin press raises the sheet to half if it was down and brings the
  venue's own row to the top of the list, lit, until the map is tapped clear — no copy of it in
  the head, no card over the map (Airbnb's replaces the sheet). Below full the list cannot scroll,
  so the lift is a translate, clamped as a scroller would clamp it, and handed to the list's real
  scroll position on arrival at full (and back again on the way down), so the rows never jump. On
  the desktop the same press lights the card and centres it in the panel.
- **A region, never the coast, on a phone**: the tourist's own when located, Himarë otherwise;
  north up always — with the split the thumb's, a tall region (Sarandë) simply gets a taller
  window at peek. The whole coast lives in the coast picker (`prototype-coast-picker.ts`): a
  150 px ribbon down a sheet's left edge with the coast index beside it as 44 px rows, each beach
  tied to its dot by a leader — the one phone screen on which all sixteen beaches are legible,
  and a second WebGL context paid only on demand.
- **Near me sits at the map's foot at half** (y 324, right — the coast and its pins run down
  the left) — mid-screen, the thumb's natural zone, not the bottom edge Hoober measures at
  12 mm. It hides at full.
- **Desktop from `lg`**: the sheet is the left panel, pinned open, with the same head; the map is
  the rest, sized by the set's own shape (`prototype-aspect.ts`) — the pane takes the width the
  set needs (360 px for the whole coast, 864 for Himarë at 1440) and the panel keeps the rest:
  one row column below 600 px, two row columns to 900, a card grid above (two columns, three
  from 1,000, four from 1,400). Under 560 px of pane the pins are **dots with a label gutter** down
  the pane's right edge — each crowd's name, from-price and count as a 44 px row tied to its dot
  by a leader, under the zoom column and above Near me — because at 360 px the ADR-0022 fence
  pins the camera to zoom 7 and a pill has nowhere to hang. The desktop opens on the whole coast,
  which its column can frame.

## Measured: geometry and cost

Phone, 390 × 844, by `shoot.mjs` (photos are SVG stand-ins — judge mass, not pictures):

| State                  | Map on it                                          | First row                                   | Map requests / bytes               | Tiles / bytes | Contexts |
| ---------------------- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------- | ------------- | -------- |
| **half** (first paint) | 68–380 (312 px); Himarë's three pills at y 126–339 | **y 493**, two whole rows + a third's title | **0 / 0 + one poster JPEG, 37 kB** | **0 / 0**     | **0**    |
| full                   | 68–112, a sliver                                   | y 199, 6 rows                               | 0 / 0                              | 0 / 0         | 0        |
| peek                   | 68–705 (637 px), live                              | under the head                              | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| lone pin press at half | the pin inverted                                   | the venue's row at y 467, lit               | 0 / 0                              | 0 / 0         | 0        |
| crowd press at half    | separated inside the window                        | —                                           | 6 / 326 kB                         | 6 / 57 kB     | 1        |
| the picker open        | poster + the ribbon                                | —                                           | 6 / 336 kB                         | 6 / 124 kB    | 1        |
| `live=1` (the control) | 68–380 live, pins where the poster's are           | y 493                                       | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| the shipped page       | none                                               | none                                        | 0 / 0                              | 0 / 0         | 0        |
| Airbnb (measured)      | 134–441 (307 px)                                   | y 515, one card                             | 195 requests, 14.8 MB (map 1.9 MB) | —             | —        |

430 × 932: the same layout; the poster's 440 px width covers it with a 5 px crop, the first row is
still at y 493 and the tall phone gets its extra 88 px as list (`Q-shore-tall.png`); at peek the
window is 68 → 793 (`Q-shore-tall-peek.png`). Desktop: panel 1,056 + map 360 at 1440 (whole
coast, dots and the gutter, three card columns); panel 552 + map 864 at Himarë (pins 829 × 514,
one row column); panel 1,536 + map 360 at 1920 (four columns); the 1024–1300 range is in
§ _Round 7_.

## Q's faults, the honest list

Round 6 listed six; round 7 closed five of them (§ _Round 7_ says how) and found three more.

1. **The poster is a real backend cost.** A shipped version renders one image per region and
   beach server-side from the same extract (ADR-0022 keeps the map first-party), at 2× and 3×,
   invalidated with the extract. The prototype's 22 JPEGs (~1 MB) are that job done by the
   screenshot driver. _Open._
2. **A venue pin's placement accuracy is a product requirement** once the map is the ground. The
   fixture is now on the shoreline (round 7 snapped it there by sampling the map's own water
   fill), which is exactly the snap the operator's pin placer wants; the real venues' pins are as
   good as their operators placed them. _Open — a slice of its own._
3. **A short list lifted to its chosen row shows the row at the bottom of the window, not the
   top** (Sarandë's four rows: the lift is clamped like a scroller, so `Pasqyra Blue` lights at
   y 685 instead of 467). Correct, and what every scroller does; a two-row region will always
   look like this.
4. **The merged-crowd rule is a demonstration, not the layer's own behaviour.** The pill wears the
   union's name and count through classes and `attr()`; its press still separates only its own
   members. The real change is one line in `crowdPins` (§ _Round 7_ § 3), with a spec.
5. **A hard fling from full closes to peek, not half.** Mandatory snapping with `snap-always` on
   the half target holds an upward fling from peek at half but lets a downward fling from full
   pass it (measured; Chromium). A slow drag rests at half. Airbnb behaves the same way; noted,
   not fixed.
6. **The dusk pin is greyed by three classes on the shipped button, one with `!`**
   (`bg-riv-solid-btn-hover!`): a prototype's reach into the layer. Shipped, the layer takes a
   `dusk` input and paints it itself — and decides a crowd's dusk per crowd (all members closed),
   where the classes follow the pill's face member (`Q-shore-phone-1630.png`: `3 beaches` is
   greyed while some of its six still sell).
7. **At full the poster's lower edge shows through the glass** at y 380
   (`Q-shore-phone-flick-up.png`: the first two rows sit on the poster's tone, the rest on the
   pane's flat fill), because the ground under the sheet is a 380 px still over a solid. Shipped,
   the poster is rendered at the pane's height, or the sheet's body is opaque below its head.

## What to ship, and why

**Q, with the poster, as round 7 left it.** It is the Airbnb pattern as measured — a sheet over a
map, one screen — and it is a phone first screen with a map, a venue and a row on it for the
price of one image. Its port cost is small and named: a two-scroller scroll-snap sheet with three
heights (CSS, no library, no pointer arithmetic — and one translate for the preview below full),
a `MapHandle` over a still image (`project` only), a fit that aims at the window the sheet leaves
(`fitUnderHeader`, and the same aim on a crowd press), a poster renderer on the backend, the
desktop pane rule with the dots-and-gutter form under 560 px, and two one-line changes to the
pin layer (a `dusk` input; the crowd test against the crowd's mean). The shipped tab bar, header,
card tokens and picker are used as they are. Without the poster Q's first screen costs what any
live map does (341 kB + tiles + a context), and a list-first page would be the cheaper first
paint; with it, that argument is over.

## What Q rests on

Four findings from the earlier rounds, kept because Q is built on them; the measurements are in
the branch history.

1. **The camera has to be derived from the pane and the result set** (`prototype-camera.ts`).
   `RIVIERA_MAP_OPTIONS`' fixed zoom 8.6 was tuned for the shipped 430 × 560 pane; at any other
   size the extra area is inland Albania. Two numbers inside it are findings of their own: the
   world is `512 · 2^zoom` px because `style.json` declares no `tileSize` and MapLibre defaults a
   vector source to 512, and the fit is capped at zoom 14 because three venues 20 m apart would
   otherwise fit at the ceiling of 16, which shows driveways and no sea.
2. **The whole coast cannot be framed in a scroll column at 390 px.** The ADR-0022 fence is 2.2°
   of longitude wide, so pane width sets a zoom floor; a north-up pane under ~520 px deep is
   fence-bound at 390 wide. So a phone opens on a region, or on Near me, and the whole coast is a
   chooser (the picker's ribbon), never the first screen.
3. **The result set has its own aspect ratio, and no fixed pane shape is right twice**
   (`prototype-aspect.ts`): 4.51 for the whole coast, 2.07 for Sarandë, 0.60 for Himarë. On the
   phone the sheet gives the window's height to the thumb; on the desktop the pane's width follows
   the set.
4. **What a first screen costs**: every live map pays ~341 kB of style and glyph ranges plus tiles
   plus one WebGL context, and the browser keeps at most 16 contexts; a still poster pays one
   image. Measured with `shoot.mjs`, whose cost columns are the map's own requests, so the poster
   (served from `public/`) is counted by hand.

## Round 7 — Q improved on the phone and the desktop

Everything below was measured with `shoot.mjs` and a scratch probe on the same wiring
(`playwright-core`, the image's Chromium, 390 × 844 at 1× unless said, touch through CDP
`Input.dispatchTouchEvent`). "Round 6" means the branch at `5b1d6de`.

### 1. The open faults

- **The preview row was a copy.** Replaced by highlight-and-scroll: the pin's row lights and
  goes to the top of the list, no head copy, no card (Airbnb's one-card treatment was tried on
  paper only: it replaces the sheet, which on this product replaces the query). Measured at
  half: `Pasqyra Blue` lit at y 467, 8 px under the head at 459; at peek the press raises the
  sheet to half and does the same. The desktop does the same into the panel's middle
  (`Q-shore-1440-pin.png`). Chromium mechanics that decided the shape: the list at half must
  not be a scroll container (an `overflow: hidden` box is one, and every flick on it died there —
  the sheet did not move at all), so it is `overflow: clip`; a clipped box cannot be scrolled, so
  the lift is a translate, clamped as a scroller clamps, and becomes the list's real `scrollTop`
  on arrival at full — Durrës: a lift of 166 at half became `scrollTop` 166 at full; a list
  scrolled 300 at full came down as a lift of 181 (its scroll maximum). The rows never jump.
- **`Whole coast` on a phone.** Hidden below `lg` (`hidden lg:inline-flex`); the phone's widest
  frame is a region (finding 2 in § _What Q rests on_).
- **The fixture pins were inland** — and, measured, some were at sea. Every pin was snapped to
  the shoreline by sampling the map's own water fill (`rgb(158, 189, 255)` from `style.json`) in
  the rendered beach poster at 2×: the nearest shore pixel, then 4 CSS px onto the sand; a pin
  already in the water went to the nearest land the same way; Palasë and Borsh had no water in
  their beach poster's frame and took a first pass off the region poster (53 m/px) and a second
  off their re-rendered beach posters (2.8 m/px). Moves: Palasë 1.6 km, Borsh 1.5, Cape Rodon 1.4
  (offshore), Velipoja 1.1 (offshore), Drymades 0.94, Qerret 0.93, Dhërmi 0.5–0.63, Golem
  0.26–0.57 (offshore), Currila 0.42; the rest under 0.25. The 22 posters were re-rendered
  after each pass. `Q-shore-phone-beach.png` now shows Dhërmi's three pins on Dhërmi beach.

### 2. The sheet's feel

- **The head is 78 px at every height** (round 6: 80 at peek, 122 at half and full): one row —
  the place with `8 of 11 selling today` under it, the beach chip `⛱ 6`, the day `Today ▾`. The
  first row is at **y 493** (round 6: 533): two whole rows and the third's title above the tab
  bar. The subtitle fits without truncation in every state at 390 and 430 (128 px of 157–239
  available; round 6's `11 venues · 8 selling today` needed 169 of 157 and truncated to
  `8 selling t…`, so the sentence was rewritten, not the chip shrunk). The place and the located
  state are no longer repeated in the subtitle: the title and the accent glyph carry them.
- **The chip in the row vs the beach in the subtitle** (`?head=subtitle`,
  `Q-shore-phone-subtitle.png`): both are 78 px and put the first row at 493; the subtitle form
  reads `All beaches · 8 of 11 selling today` (212 of 244 px) and loses the beach rail — the
  SunEasy town → beach step (finding 3) — to the picker. **Keep the chip.** With a beach chosen
  the chip lights and shows the beach's count while the title names the beach.
- **The grabber's tap cycles half ↔ full only**; peek is a drag's. From the shots: at full a tap
  bringing the list to half (the map back, the rows still there) reads as "less" and matches
  the Map pill; round 6's tap to peek threw the list away. Kept.
- **A real flick, measured.** Round 6's single scroller: a 400 px flick up from half in 150 ms
  ended at `scrollTop` 1297 — full is 591, so **706 px of list** went by under a finger that
  meant "open the list"; the row the tourist was looking at was gone. Round 7's two scrollers:
  the same flick ends at 593, full exactly, the list at its top
  (`Q-shore-phone-flick-up.png`); a 350 px flick down from full with the list at its top ends
  at peek (`Q-shore-phone-flick-down.png`); a slow 250 px drag down from full rests at half; a
  flick up from peek rests at half (mandatory snapping with `snap-always` on the half target
  holds an upward fling there, and lets a downward one pass — fault 5); a slow drag up from peek
  rests at half. At full a drag on a list scrolled inside scrolls the list (300 → 48 for a 200 px
  drag) and never the sheet.

### 3. The pins at 390

The fault was two faults, neither the crowd rule's:

- **The "member discs" were the prototype's own dusk classes.** `opacity-45` toggled on every
  `[data-pin]` reached the crowd members, whose shipped `opacity-0` it beat by stylesheet order;
  a dusk member painted as a grey numbered disc under its pill (venue 10's `2` under
  `Palasë & Drymades`). Fixed: the dusk classes skip `map-crowd-member`.
- **Dhërmi's crowd had collapsed to a bare `3` disc** because its full pill fitted nowhere clear
  of `Palasë & Drymades` (24–216 × 120–164) and `Jalë & Livadhi`, and the compact fallback is
  placed without a collision test: 63–107 × 157–201, 7 px into the Palasë pill. Replayed offline
  from the same projection: hanging the pill up or down fails too (both neighbours are within
  44 px), and a shorter name (`Palasë +1`, 133 px) fails, because the overlap is vertical.
  **The smallest change that fixes it is one line in `crowdPins`: test a pin against its crowd's
  running mean and widest member, not against its first member.** The crowd's pill is drawn at
  the mean, so the grouping then agrees with the drawing; at the inland fixture Palasë,
  Drymades and Dhërmi become one crowd of 6 at 44–177 × 139–183, clear of Jalë & Livadhi
  (207–251), and a press separates them. Prototyped as classes on the rendered buttons, as the
  dusk state is: a compact disc whose box lands on a pill is `invisible`, and that pill's title,
  from-line and count are repainted through `attr()` with the union's — first and last beach in
  coast order (`Palasë – Dhërmi`; the shipped `placeName` would say `3 beaches`), the lower
  price, the summed count (`Q-shore-phone-pins-inland-merged.png`, taken on round 6's fixture).
  **With the shoreline fixture no collision remains at 360, 375, 390, 412 or 430 in any region**
  (Himarë crowds into `3 beaches · 6`, `Jalë & Livadhi · 3`, `Borsh · 2` by the shipped rule),
  so the demonstration is dormant on the committed fixture and the rule change is the proposal.

### 4. Glare

Shot at half in `porcelain`, `riviera` and `dark`, and every text run on the map chrome and the
head measured (its computed ink over the pixel beside it, whole-button opacity folded in):

- **The head was white on white in `riviera`** (`Himarë` at 1:1): it sat on `--riv-pop-surface`,
  a console-only token the riviera theme never declares, so the base white came through under
  white ink. Now `--riv-tabbar-glass`, declared in all three themes.
- **The chips were 2.7:1 in `riviera`** (`Today` white on `#909fa8`): `text-riv-ink` on
  `bg-riv-field-fill` — the shipped field skin pairs that fill with `text-riv-card-ink`, which
  stays dark on the light fill under white page ink. Now the shipped pairing.
- **A dusk pin was 1.2–1.4:1 in every theme** (`Borsh from €15` at 45 % over the map). Dusk is
  now desaturation on the fixed hover fill with the price struck, ink untouched: 7.5:1. The dusk
  row likewise (its name was 2.2:1 at 60 %): flat and desaturated, `Closed today` carries it.
- After the three fixes, at half and at peek (the live map's chrome, the credit), in all three
  themes, and in the desktop gutter: **nothing under 4.5:1** except the decorative `★` glyph
  beside a rating (aria-hidden, 1.3–2.0:1), which is the shipped row's.

### 5. The whole-coast pane at 360 px

At 360 wide the ADR-0022 fence pins the camera to zoom 7.09 and the coast to x 78–200 of the
pane; no inset can move it (a left gutter was tried first: the fit shifted the centre west, the
fence clamped it back, and the labels sat on the dots). So the gutter is on the **right**,
172 px, from under the zoom column (y 118) to above Near me (h − 64): one 44 px row per crowd —
its name, from-price and count, the place pill's skin without its count disc so a two-beach name
fits at 12.5 px — placed at its dot's height and pushed down, then up, only as far as its
neighbours need; a leader to a 12 px dot on the pin layer's own crowd geometry (`crowdPins`,
`separationZoom` imported from the shipped `pin-crowding.ts`, so a press zooms exactly as the
pill's would). Pills return from 560 px of pane. **1440**: 8 rows in 626 px of gutter, none
truncated, none on the zoom column, the dots and rows spanning 47 % × 91 % of the pane.
**1920**: 10 rows, 59 % × 93 %. **1024**: 6 rows, 39 % × 90 %. Judged from the shots, it reads
better than round 6's pills at this width: every crowd is named, nothing is cut by the pane's
edge, and the coast is a coast.

### 6. The panel

| Window | Panel    | Round 6                              | Round 7                          |
| ------ | -------- | ------------------------------------ | -------------------------------- |
| 1024   | 640 px   | one row column (rows 614 wide)       | **two row columns**              |
| 1100   | 716 px   | one row column (rows 690 wide)       | **two row columns**              |
| 1200   | 816 px   | two card columns (2 venues a screen) | **two row columns** (4 a screen) |
| 1300   | 914 px   | two card columns                     | two card columns                 |
| 1440   | 1,056 px | three card columns                   | three card columns               |
| 1920   | 1,536 px | four card columns                    | four card columns                |

A row is happy between ~300 and ~400 px wide and a card needs ~340; round 6's 760 px card
threshold put two 389 px cards, 410 px tall, where two 395 px rows show twice the venues. **Cards
from 900 px** (a 1,284 px window and up); rows in two columns from 600. The 3 → 4 column step at
1,400 px of panel (a 1,784 px window) holds: at 1920 the cards are 369 wide. The preview on the
desktop is highlight-and-scroll into the panel's middle, the same mechanism as the phone's.

### 7. The pane sized by the set in both axes

`?pane=free`: when the 60 % width cap decides the pane's width (a set wider than its column),
the height follows the set too. Himarë at 1440: **864 × 808** at the column's height, the pins
spanning 96 % × 64 %; **864 × 547** free, 96 % × 94 % — and 261 px of empty column under the
pane (`Q-shore-1440-himare-free.png`). The whole coast is unaffected (its 360 px pane is
height-bound: 47 % × 91 %). **Keep the column's height**: the "wasted" 36 % shows Qeparo and
Borsh below the set, which is context a tourist choosing at Himarë uses, and nothing else can use
the column. The fill numbers are the driver's `fill` column from now on.

### What round 7 keeps, and where it disagrees with round 6

Keep: the one-row head at 78 (chip form), the two-scroller sheet, highlight-and-scroll as the
preview on both surfaces, the grabber's half ↔ full, the shoreline fixture, the dusk and merge
classes, the right-hand gutter under 560 px, cards from 900, the column's height.

Disagree: (1) round 6's "one finger raises the sheet, keeps scrolling the list" was a fling
overshooting full by 706 px, not a feature; (2) the crowd rule was never the fault at 390 — the
prototype's dusk classes and an inland fixture were; (3) the head copy of the row was the wrong
preview on a phone with two rows on screen; (4) `11 venues · 8 selling today` did not fit beside
two chips and `8 of 11 selling today` says the same in 128 px; (5) cards from 760 px show fewer
venues than rows at the widths where the panel is narrowest; (6) `--riv-pop-surface` was never a
tourist-side token.

## Round 8 — the desktop opens on a region, and the coast is a line

Round 7's desktop still opened on the whole coast (`Q-shore-1440.png`), and that screen was
disliked for a reason the numbers already gave: 26 venues across 300 km are an index, not a
choice, and no pane frames them. At 360 px the fence pins the camera to zoom 7 with the coast a
line down the pane's left edge and the rest inland Albania; a full 1440 × 808 pane fits the set
at zoom 7.7 with the coast about 200 px wide. The label gutter was a second list beside the first
and the two-column rows left half of every single-venue group empty. So round 8 (`?desk=line`)
removes the state rather than restyling it:

- **The desktop opens on a region, as the phone does** — Himarë by default, the located region
  after Near me — so the pane always holds a set it can frame. The pane's width still follows the
  set's aspect between the 60 % cap and a floor, and the floor is now **40 % of the window** on
  this desk (a two-pin region on one meridian would otherwise ask for the 360 px column).
- **The whole coast is a line over the panel** (`prototype-coast-line.ts`): the sixteen beaches as
  dots on one rule in the catalogue's north-to-south order, Velipojë at the left and Ksamil at
  the right, grouped into six region runs — each a 44 px button with the name, the venue count
  and the from-price, growing with its beach count from a floor a name fits in; the chosen run is
  lit, a chosen beach lights its dot. A press focuses the region in the pane below. The picker
  stays for the full index and loses its `Whole coast` on this desk; the title never reads
  `The whole coast`.
- **The gutter is kept for a region's crowds under 560 px of pane** only; it never carries the
  coast.

Measured (`Q-shore-*-line*.png`):

| Window                         | Panel · pane               | Line: run widths, truncation | Panel form                                                | Pins in the pane                                                                              |
| ------------------------------ | -------------------------- | ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1024                           | 420 · 580                  | 55–71 px, none               | one row column                                            | Himarë's three pills; the north end crowds and the merge classes fire (`Palasë – Dhërmi · 6`) |
| 1200                           | 456 · 720                  | 60–78 px, none               | one row column                                            | 96 % × 64 %                                                                                   |
| 1440                           | 552 · 864                  | 68–97 px, none               | one row column, first row at y 266 (the line costs 77 px) | 96 % × 64 %                                                                                   |
| 1440, Sarandë / Vlorë / Durrës | 840 · 576 (the 40 % floor) | —                            | two row columns                                           | 46 / 48 / 45 % × 96 %, pills, no gutter                                                       |
| 1920                           | 744 · 1,152                | 80–169 px, none              | two row columns                                           | 97 % × 69 %                                                                                   |

The merge demonstration needed one more mechanism to show here: the pin layer re-groups on its
own resize tick, which no map move announces, so the classes are now applied from a
`MutationObserver` on the layer's buttons (its own mutations discarded with `takeRecords`) — at
1024 the pass had been running before the layer's final grouping and missing it.

**Verdict: the line desk replaces the whole-coast desk.** Every desktop screen is now a region
with a wide map (40–60 % of the window), the panel's groups are two to eleven venues, the coast
stays one glance away in a 77 px strip that never truncates down to 1024, and the desktop is
the phone's own logic with more room rather than a second design. What it costs: 77 px of panel
height, and the "26 venues from Velipojë to Ksamil" overview, which the line's counts and
from-prices carry instead. The `?desk=line` flag is only so the two can be shot side by side;
implemented, it is the desktop.

## Screenshots

`shots/` holds the set these notes are written from, captured by `shoot.mjs`: `playwright-core`
from `node_modules`, the image's Chromium at `/opt/pw-browsers/chromium` (never `playwright
install`), `platform/map/` served from disk with the archive range-sliced as the backend does, and
every fixture photo answered with a ~1.4 kB SVG stand-in — judge photo mass, not the pictures. The
driver logs each shot's first-screen cost (map style/sprite/glyph requests, tile ranges, live WebGL
contexts) and the geometry the notes argue from; `--json` keeps the raw numbers. Phone shots are
390 × 844 at 1×.

| File                                                                                                  | What                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ref-airbnb-phone.png` · `ref-airbnb-phone-list.png` · `ref-airbnb-phone-pin.png`                     | the reference: Airbnb's mobile search at Himarë — the sheet on the map; pulled up; a pin                                       |
| `ref-spiagge-phone.png`                                                                               | spiagge.it's first screen: where, when, Cerca — no map                                                                         |
| `Q-shore-phone.png` · `Q-shore-phone-himare.png`                                                      | the first paint: the Himarë poster, the sheet at half, the one-row head (the default, and asked for by region)                 |
| `Q-shore-phone-subtitle.png`                                                                          | round 7's other head: the beach in the subtitle, no chip (`?head=subtitle`)                                                    |
| `Q-shore-phone-riviera.png` · `Q-shore-phone-dark.png`                                                | the same first paint in the `riviera` and `dark` themes (glare)                                                                |
| `Q-shore-phone-flick-up.png` · `Q-shore-phone-flick-down.png`                                         | a real touch flick: 400 px up from half rests at full; 350 px down from full rests at peek                                     |
| `Q-shore-phone-full.png` · `Q-shore-phone-full-scrolled.png`                                          | the sheet at full: the sliver, the Map pill; and scrolled 700 px inside                                                        |
| `Q-shore-phone-peek.png` · `Q-shore-phone-peek-pin.png`                                               | the sheet at peek: the live map fills the window; a crowd press at peek                                                        |
| `Q-shore-phone-pin.png` · `Q-shore-phone-pin-lone.png`                                                | a crowd press at half (the north end separates inside the window); a lone pin press lifts its row, lit                         |
| `Q-shore-phone-pins-inland-merged.png`                                                                | round 6's inland fixture with the merged-crowd classes firing: the compact Dhërmi disc gone, `Palasë – Dhërmi · 6`             |
| `Q-shore-phone-here.png` · `Q-shore-phone-here-pin.png`                                               | located at Dhërmi: nearest first, `You are here`; a crowd press while located                                                  |
| `Q-shore-phone-sarande.png` · `Q-shore-phone-beach.png`                                               | a tall region north up on the poster; one beach (Dhërmi) at the zoom cap — on the shoreline now                                |
| `Q-shore-phone-1630.png` · `Q-shore-phone-day.png` · `Q-shore-phone-picker.png`                       | dusk at 16:30 (legible now); the day chips; the coast picker without `Whole coast`                                             |
| `Q-shore-phone-beaches.png` · `Q-shore-phone-beach-chosen.png`                                        | the beach chip opened into its rail; the same with Dhërmi chosen, its chip lit and in view                                     |
| `Q-shore-phone-live.png`                                                                              | the control: the live map from the first paint, pins where the poster's were                                                   |
| `Q-shore-tall.png` · `Q-shore-tall-peek.png`                                                          | 430 × 932, half and peek                                                                                                       |
| `Q-shore-1024.png` · `Q-shore-1100.png` · `Q-shore-1200.png`                                          | the narrowest panels: two row columns beside the 360 px pane with dots and the gutter                                          |
| `Q-shore-1440.png` · `Q-shore-1440-here.png` · `Q-shore-1920.png`                                     | the desktop: the whole coast (360 px pane, dots and the gutter, three columns); located; 1920 (four columns)                   |
| `Q-shore-1440-himare.png` · `Q-shore-1440-himare-free.png` · `Q-shore-1440-pin.png`                   | Himarë's 864 px pane at the column's height and at the set's own (`?pane=free`); a lone pin press lights and centres its row   |
| `Q-shore-1440-line.png` · `Q-shore-1920-line.png` · `Q-shore-1200-line.png` · `Q-shore-1024-line.png` | round 8: the line desk — Himarë in the pane under the coast line, at four widths (the merge classes fire at 1024)              |
| `Q-shore-1440-line-sarande.png` · `Q-shore-1440-line-beach.png` · `Q-shore-1440-line-picker.png`      | round 8: a narrow region on the 40 % floor with two row columns; Dhërmi chosen (its dot lit); the picker without `Whole coast` |

## Files

| File                                                 | What                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                              | the host: fixture data, the filters and the tourist's position from the URL                                                                     |
| `variant-shore.ts`                                   | Q: the ground, the two-scroller sheet, the poster/live swap, the dusk and merged-crowd classes, the desktop panel rule, the dots and the gutter |
| `prototype-poster.ts`                                | the still poster: its box, its camera, and the `MapHandle` over an image the pin layer draws through                                            |
| `prototype-coast-picker.ts`                          | the coast as a chooser: the ribbon + the index as a sheet (a popover from `lg`)                                                                 |
| `prototype-coast-line.ts`                            | round 8: the coast as a line over the desktop panel — six region runs, sixteen beach dots, a press focuses the region                           |
| `prototype-venue-row.ts` · `prototype-venue-card.ts` | the phone row (the pin's preview) and the desktop card                                                                                          |
| `prototype-place.ts`                                 | the tourist's position, distances, the beach grouping                                                                                           |
| `prototype-aspect.ts`                                | the result set's own aspect ratio — the number the desktop pane is sized from                                                                   |
| `prototype-camera.ts`                                | fit the camera to the pane and the pins                                                                                                         |
| `prototype-days.ts`                                  | the fixture's time: each venue's sales close, and the seven days the day chips offer                                                            |
| `prototype-coast.ts`                                 | the coast as an index: regions, beaches, counts, from-prices                                                                                    |
| `prototype-venues.ts`                                | 26 fixture venues, on the shoreline: round 7 snapped each to the map's own water edge (§ _Round 7_ § 1)                                         |
| `shoot.mjs`                                          | the screenshot + cost/geometry driver (themes, CDP touch flicks, the pane's pin fill), and the poster renderer (`--posters`)                    |
| `research/`                                          | the two raw research reports: the measured references (bytes by host, geometry) and the web research                                            |
| `../../../../public/prototype-posters/*.jpg`         | the 22 still posters, one per region and beach with venues — rendered, not drawn                                                                |

## Recommendation

**Implement Q with round 7's changes and round 8's desktop**, not as round 6 left it and not
another round: the two
open questions that would justify more prototyping — whether a sheet over a poster can be the
first paint for the price of one image, and whether the sheet's feel survives a real thumb — are
answered by measurement (0 map requests, 0 contexts, 37 kB; a flick that rests where it should),
and what is left is engineering with named seams. The first three slices, each a tracer bullet
through the shipped Discover page behind a flag, test-first: **(1) the sheet** — the
two-scroller scroll-snap sheet with its three heights, the 78 px head, the grabber, the Map pill
and highlight-and-scroll, with a Playwright e2e that flicks through CDP and asserts the rest
positions; **(2) the poster** — a backend renderer for one still per region and beach at 2× and
3× from the map extract, the `MapHandle` over an image, `fitUnderHeader`, and the live map's
swap-in at the poster's camera, with the first-paint cost asserted (0 map requests, 0 contexts);
**(3) the pin layer and the desktop** — a `dusk` input on the layer, the one-line crowd-mean rule
with its spec, and round 8's desktop: region-first, the coast line over the panel, the pane rule
between 40 and 60 % of the window, the panel's column steps, the gutter for a region's crowds
under 560 px, no whole-coast state anywhere. A fourth, a product requirement rather than a slice
of Q: a shoreline snap in the operator's pin placer, because the map is the ground now.

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If Q ships
it gets rebuilt test-first through the normal loop — do not promote this code.
