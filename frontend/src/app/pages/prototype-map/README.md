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
whole-coast opening with a region, round 9 (§ _Round 9_) cut the coast-line strip it had put
over the panel and the two-column rows, round 10 (§ _Round 10_) is a design critique of the
desktop taken to code (a list instead of cards, the panel clamped to the row's width), and
round 11 (§ _Round 11_) measures the shipped chrome instead of assuming it — the tab bar that is
not there from `sm`, the header that is 73 px and not 68 — gives the header the page's edges on
this route, and closes three of the open faults, and round 12 (§ _Round 12_) settles what a
desktop row says and what the selected one says. The verdict and the first slices are at the end.

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
pane), `?dense=30` (round 8's density question: Himarë padded to 30 venues), and round 11's
`?hdr=shell|wide|wide,lower|wide,noeyebrow|wide,menu` (the header treatment; `shell` is the
shipped header untouched), `?seam=glass|opaque|tone` (what the sheet's glass sits on),
`?cap=15` (one beach fitted at zoom 15) and `?rows=flat` (the phone's rows as the desktop's list). Venues come from `prototype-venues.ts` (26 fixtures on the real shoreline — snapped there in
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
  the pixel (370 × 213 at 3, 129 in both). The poster is one 440 px still, so it covers a phone
  and nothing wider: above 440 the ground is the live map from the first paint (round 11).
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
- **Tablet (640 to 1023)**: the sheet layout with no tab bar under it, the ground live (the
  poster cannot cover it) and the list in two row columns — 371 px a row at 768, 397 at 820,
  inside round 7's happy 300–400 (round 11).
- **Desktop from `lg`**: the sheet is the left panel, pinned open, with the same head, and the
  map is everything else. The panel is clamped to the row's own width (38 % of the window between
  420 and 540 px — measured 420 at 1024, 456 at 1200, 540 at 1440 and 1920), the rows are a list on it — a hairline under each, the beach as a small
  running head, a 72 px availability bar beside its number — and the pane takes the rest (876 px
  at 1440, 1,356 at 1920). The desktop opens on a region as the phone does — the whole coast is
  an index no pane can frame — and the coast picker under the place button is its chooser. Under 560 px of pane the pins are **dots
  with a label gutter** down the pane's right edge — each crowd's name, from-price and count as a
  44 px row tied to its dot by a leader, under the zoom column and above Near me — for a narrow
  region's crowds on a small window.

## Measured: geometry and cost

Phone, 390 × 844, by `shoot.mjs` (photos are SVG stand-ins — judge mass, not pictures):

| State                  | Map on it                                          | First row                                   | Map requests / bytes               | Tiles / bytes | Contexts |
| ---------------------- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------- | ------------- | -------- |
| **half** (first paint) | 73–380 (307 px); Himarë's three pills at y 129–342 | **y 493**, two whole rows + a third's title | **0 / 0 + one poster JPEG, 38 kB** | **0 / 0**     | **0**    |
| full                   | 73–117, a 44 px sliver                             | y 230, rows at 230 · 328 · 468 · 608        | 0 / 0                              | 0 / 0         | 0        |
| peek                   | 73–705 (632 px), live                              | y 818, under the head                       | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| lone pin press at half | the pin inverted                                   | the lit row at y 685 (Sarandë, fault 3)     | 0 / 0                              | 0 / 0         | 0        |
| crowd press at half    | separated inside the window                        | —                                           | 5 / 262 kB                         | 4 / 38 kB     | 1        |
| the picker open        | poster + the ribbon                                | —                                           | 6 / 336 kB                         | 6 / 124 kB    | 1        |
| `live=1` (the control) | 73–380 live, pins where the poster's are           | y 493                                       | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| the shipped page       | none                                               | none                                        | 0 / 0                              | 0 / 0         | 0        |
| Airbnb (measured)      | 134–441 (307 px)                                   | y 515, one card                             | 195 requests, 14.8 MB (map 1.9 MB) | —             | —        |

Tablet, by the same driver (round 11). The tab bar is `sm:hidden`, so the sheet reserves nothing
for it and the `Map` pill sits 12 px off the bottom edge; the 440 px poster cannot cover the
window, so the ground is live and the first paint costs what a live map costs:

| State           | Map on it                 | First row | Map pill | Map requests / bytes | Tiles / bytes | Contexts |
| --------------- | ------------------------- | --------- | -------- | -------------------- | ------------- | -------- |
| 768 × 1024 half | 73–380, live, two columns | **y 493** | —        | 6 / 336 kB           | 8 / 128 kB    | 1        |
| 768 × 1024 full | 73–117, a sliver          | y 230     | y 968    | 6 / 336 kB           | 8 / 128 kB    | 1        |
| 768 × 1024 peek | 73–946 (873 px)           | y 1059    | —        | 6 / 336 kB           | 6 / 108 kB    | 1        |
| 820 × 1180 half | 73–380, live, two columns | **y 493** | —        | 6 / 336 kB           | 10 / 135 kB   | 1        |
| 820 × 1180 full | 73–117, a sliver          | y 230     | y 1124   | 6 / 336 kB           | 10 / 135 kB   | 1        |
| 820 × 1180 peek | 73–1102 (1,029 px)        | y 1215    | —        | 5 / 262 kB           | 11 / 125 kB   | 1        |

430 × 932: the same layout; the poster's 440 px width covers it with a 5 px crop, the first row is
still at y 493 and the tall phone gets its extra 88 px as list (`Q-shore-tall.png`); at peek the
window is 73 → 793 (`Q-shore-tall-peek.png`). Desktop (Himarë, the opening region), measured this
round: panel 540 + map 876 × 803 at 1440, the first row at y 192; panel 540 + map 1,356 × 983 at
1920; panel 456 + map 720 at 1200; panel 420 + map 580 at 1024. Sarandë gets the same panel and
the same 876 px of bay. Rounds 7 to 11 for how the desktop got here.

## Q's faults, the honest list

Round 6 listed six; round 7 closed five of them (§ _Round 7_ says how) and found three more;
round 11 closed 6 and 7 and turned 4 from a broken demonstration into a working one.

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
   members. The real change is one line in `crowdPins` (§ _Round 7_ § 3), with a spec. _Open, but
   the demonstration is honest now_: round 11 made the repainted pill grow to its new name
   (`text-[0px]!` on the old face, so the flex row measures the `::after`, not an absolute overlay)
   and re-place itself, since the layer sized it before the repaint.
5. **A hard fling from full closes to peek, not half.** Mandatory snapping with `snap-always` on
   the half target holds an upward fling from peek at half but lets a downward fling from full
   pass it (measured; Chromium). A slow drag rests at half. Airbnb behaves the same way; noted,
   not fixed.
6. ~~**A crowd's dusk follows its face member.**~~ **Closed, round 11.** Dusk is decided per
   CROWD — the buttons sharing one `left`/`top` are the crowd, so the DOM names the membership —
   and a pill greys only when every member's sales have closed. At 16:30 `3 beaches · from €22`
   keeps its colour while four of its six still sell, and `Borsh` greys because both of its two
   have closed (`Q-shore-phone-1630.png`). The classes are still the prototype's reach into the
   layer; shipped, the layer takes a `dusk` input per crowd and paints it itself.
7. ~~**At full the poster's lower edge shows through the glass** at y 380.~~ **Closed, round 11.**
   Measured in the sheet's own 8 px gutter, the step across y 380 was **ΔRGB 15.3** (215,227,247 →
   228,236,246). Two fixes were built and measured: the sheet's body on the head's near-opaque
   token (`?seam=opaque`) leaves **ΔRGB 2.9** — the token is 0.85 alpha, so 15 % of the step still
   comes through — and the pane filled with the poster's own bottom-edge colour, sampled from the
   JPEG (`?seam=tone`, the default now), leaves **ΔRGB 0.3**: there is nothing to step to, and the
   glass stays glass. Shipped, the poster is rendered at the pane's height and neither is needed.

8. **On the phone, `Near me` can sit on a pin.** It rests at the map's foot on the right
   (y 324 at half) because the coast runs down the left; at Himarë the `Borsh` pill lands at
   y 300–345 and the two overlap (`Q-shore-phone.png`, `-1630`). Round 10 fixed the desktop twin
   of this by moving the control (it was under the map's credit), but no place on a 390 px map is
   always free. The real fix is the one `layoutPills` already has for the zoom column: the layer's
   box has to exclude the page's chrome, so a pill is never placed under it. _Open — found in
   round 11, not fixed._

## What to ship, and why

**Q, with the poster, as round 7 left it.** It is the Airbnb pattern as measured — a sheet over a
map, one screen — and it is a phone first screen with a map, a venue and a row on it for the
price of one image. Its port cost is small and named: a two-scroller scroll-snap sheet with three
heights (CSS, no library, no pointer arithmetic — and one translate for the preview below full),
a `MapHandle` over a still image (`project` only), a fit that aims at the window the sheet leaves
(`fitUnderHeader`, and the same aim on a crowd press), a poster renderer on the backend, the
desktop pane rule with the dots-and-gutter form under 560 px, and two one-line changes to the
pin layer (a `dusk` input; the crowd test against the crowd's mean). The shipped tab bar,
card tokens and picker are used as they are — and the header takes one route flag
(`data-wide:max-w-none`) plus two decisions of its own (round 11). Without the poster Q's first screen costs what any
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

Measured (the line shots were cut with the strip in round 9; they are in the branch's history at
`259c9454`):

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

### Density: Himarë at 30 venues

`?dense=30` pads Himarë from 11 to 30 by interpolating clones between its pins in coast order,
so the bounding box and the poster's camera are the real fixture's (`Q-shore-phone-dense*.png`, `Q-shore-1440-dense*.png`):

- **The phone's first paint holds.** Still 0 map requests and 0 contexts, the first row at 493,
  and four pills with no collision — but the names give way to counts: `3 beaches · from €15 ·
16`, `3 beaches · from €16 · 9`, `Borsh & Livadhi · 4`, one lone `€19`. The head says
  `23 of 30 selling today`. A press on the 16 drills to `Palasë · 5`, `Drymades & Palasë · 3`
  and `Dhërmi & Drymades · 8` inside the window, the rest of the region off-screen; at this
  density the beach chip and its rail are the real way in, not the pins.
- **The list is 5.4 screens at full** (3,208 px for 30 rows); the beach group titles scroll
  away, which argues for sticky group titles once a region has more than ~15 venues.
- **The desktop at 1440 shows one nameless disc**: `Palasë · 6`, `Dhërmi & Drymades · 10` (the
  merge classes firing), `Borsh · 3`, four lone prices — and a bare `6` (Jalë & Livadhi) whose
  pill fits nowhere and collides with nothing, the layer's compact fallback rather than the
  collision the mean rule fixes. The next smallest change for that case is a vertical anchor
  (a pill hung above or below its point), which the shipped layout never tries. The merged
  pill's repainted name also overruns a pill that cannot grow — a limit of the class
  demonstration, not of the rule.
- **A beach with 9 venues stays crowded at the zoom cap**: Dhërmi shows `Dhërmi · 5`,
  `Dhërmi · 2` and two lone prices at zoom 14 (3.7 m/px: venues 50 m apart are 14 px apart),
  and a press on the 5 walks its previews one by one — the shipped behaviour. Real venues sit
  that close, so a beach with more than four or five needs either a cap of 15 at the beach
  level (a 700 m window, the sea still on one side) or the list as the only way in.

**Verdict, as round 8 left it: the line desk replaces the whole-coast desk.** Every desktop
screen is now a region with a wide map (40–60 % of the window), the panel's groups are two to
eleven venues, and the desktop is the phone's own logic with more room rather than a second
design. Round 9 kept the region-first opening and cut the strip itself (§ _Round 9_); its shots
live in the branch's history at `259c9454`.

## Round 9 — the coast line cut, one venue a row

Two maintainer calls on round 8's desktop, both taken: the coast-line strip over the panel is
gone, and rows are one venue wide everywhere. What stays from round 8 is the part the numbers
argued for — the desktop opens on a region, the pane is 40–60 % of the window, and the whole
coast is never a map — and the coast picker under the place button (the ribbon and the index,
`Q-shore-1440-picker.png`) is now the desktop's only coast chooser, as it is the phone's. The
picker no longer offers `Whole coast` at all, and the `desk=line` flag and `prototype-coast-line.ts`
are deleted rather than kept as an option.

Measured against round 8: the first row is back at y 185 at every desktop width (the strip had
cost 77 px); 1440 shows six rows, 1920 seven; a row is 526 px wide beside Himarë's 864 px pane
at 1440 and 814 wide beside Sarandë's 576 px pane, where round 8 had put two 395 px rows side
by side. Cards remain only from 900 px of panel (a window of about 1,540 px beside a 40 % pane),
which on this desk is rare and is where a card grid earns its columns. Everything else measured
in rounds 7 and 8 holds: the phone is untouched, and the density findings apply as written.

## Round 10 — the desktop under the design critique

Round 9's Himarë and Sarandë screens were put to the `frontend-design` skill's questions —
where is the one memorable thing, what is structure and what is decoration, which defaults are
the templated tells — and five findings were taken to code (`Q-shore-1440.png`,
`Q-shore-1440-sarande.png`, `Q-shore-1920.png`; the round-9 versions are in the history at
`14d38152`):

1. **The rows were the SaaS-card tell.** Every venue was an identical white rounded card with the
   same soft shadow on a glass panel on a page — three nested rounded surfaces (22, 18, 12 px),
   with the card edge doing the work of telling a beach title from a venue name (both 16 px
   bold). On the desktop the row is now `flat` (`prototype-venue-row.ts`): photo, name, price,
   one line of facts, a hairline under it, a hover fill, no background and no shadow of its own;
   the beach becomes a 13 px semibold running head in soft ink with a rule. The phone keeps the
   card, because on the sheet the rows are the only surfaces and the sheet's edge needs them.
2. **The availability bar was sized like the first fact.** It ran the row's width — 330 px at
   1440, 620 beside a stretched Sarandë row — and turned the panel into a bar chart for a
   third-rank number. It is 72 px now, after `11 of 26 free`, on both screens.
3. **The pane rule was the wrong invariant.** Rounds 7–9 sized the pane from the set's aspect and
   gave the panel the remainder, which stretched a four-venue region's rows to 814 px beside a
   576 px bay. The row is the thing with a natural width (photo, name, price, one line: 480–540
   px), so the **panel is clamped to it** — 38 % of the window between 420 and 540 — and the map
   takes everything else: 876 px at 1440 for Himarë _and_ Sarandë, 1,356 at 1920, 580 at 1024.
   The card grid can no longer occur on the desktop; the `?pane=free` flag is kept only for the
   record.
4. **`⛱ 6` was cryptic where there is room.** From a 480 px panel the chip reads
   `⛱ All beaches 6 ▾`, or the beach's name lit when one is chosen; at 1024 (a 420 px panel)
   and on the phone it keeps the short form, because the spelled-out chip squeezed the
   subtitle to `8 of 11 selling …`. The `⌖` glyph before the place, faint and meaningless to a
   tourist, is gone; the accent `◎` still marks the located state.
5. **A defect, not taste:** Near me at the pane's bottom right sat under the map's attribution
   line and was clipped. It is at the bottom left now; measured, the two boxes no longer
   intersect (Near me 576–693 × 837–881, the credit 1115–1428 × 855–881 at 1440).

Not taken: a footer under a short list naming the neighbouring regions with counts (round 9's
strip in another place), and the shipped header's tracked-out `ALBANIAN COAST` eyebrow, which
is the design system's, not this prototype's.

## Round 11 — the chrome measured, the header on the page's edges, three faults closed

Rounds 6 to 10 wrote the shipped chrome into constants: `TAB_BAR = 61`, `HEADER_H = 68`. Both were
wrong somewhere, and the tablet is where it shows. Everything below is `shoot.mjs` and a scratch
probe on the same wiring, at 390, 430, **768, 820**, 1024, 1200, 1440 and 1920.

### 1. The tablet gap — one defect that was three

The shipped tab bar is `sm:hidden` (`app.ts`: `riv-tab-bar … sm:hidden`, and the shell pads for it
`max-sm:` only), and the sheet layout runs to `lg`. So from 640 to 1023 px the sheet reserved 61 px
for a bar that is not there. Measured at 768 × 1024 before the fix: the `Map` pill floated **73 px**
off the bottom edge (61 + 12), and the sheet asked for `?sheet=half` and **opened at full**
(`scrollTop` 773 = the scroller's maximum). The rest was computed from the assumed viewport, the
DOM had not yet been re-laid-out at the measured one, so `scrollTo` clamped against the old content
and mandatory snapping carried the clamp to the end.

Three changes, each measured:

- **The tab bar is measured, never assumed**: `document.querySelector('.riv-tab-bar')`'s rendered
  height — 61 on a phone, **0** at 768, 820 and above. The sheet's `peek`, its height, the `Map`
  pill's offset and the preview's clamp all read it. After: the pill is 12 px off the bottom at
  768 (y 968) and 820 (y 1124), the same 12 px the phone's is above its bar.
- **The rest is taken again once the geometry has reached the DOM**: the scroll is repeated on the
  next frame when the first one did not land. After: **the first row is at y 493 at 390, 430, 768
  and 820** — one number for every phone and tablet, and the sheet rests at half everywhere.
- **The ground goes live above 440 px.** The poster is one 440 px still: at 768 it sat centred with
  328 px of flat pane fill either side of it, which reads as a broken screen, and the pins fitted
  a 390 px frame. Above `POSTER_W` the live map is the ground from the first paint. It costs the
  tablet what a live map costs (**6 / 336 kB + 8 tile ranges / 128 kB + one WebGL context**) and
  the phone's 0/0/0 first paint is untouched. Shipped, the poster renderer cuts a width bucket too.

And one thing the shots then argued for: at 768 a row ran **742 px** wide. The sheet is the window
wide, unlike the desktop panel, which round 10 clamped to the row. So the tablet takes round 7's
**two row columns** — 371 px a row at 768, 397 at 820, inside the 300–400 a row is happy in — and
the beach chip spells itself out (`⛱ All beaches 6 ▾`) as it does on a panel from 480 px.
`Q-shore-768.png`, `-peek`, `-full`, `Q-shore-820*.png`.

### 2. The header is 73, not 68

The same mistake, one piece of chrome over. Measured at 390, 768 and 1440: the shipped header is
**73 px** (a 72 px inner row and its hairline), not the 68 rounds 6–10 assumed. So the map band at
half is 380 − 73 = **307 px** — which is _exactly_ Airbnb's measured band, a coincidence worth
recording — and the sliver at full was 39 px, not the 44 the notes claimed. `HEADER_H` is 73 now,
the poster's box is stated as 73 + 307, the desktop column is `100dvh − 73`, and the 22 posters
were re-rendered (`--posters`). The pins still land where the poster's are, to the pixel:
370 × 213 at (3, 129) on the poster and on `?live=1`.

### 3. The header on the map route

Round 10 left this as a critique, not code. At 1440 the header's inner wrapper is
`mx-auto max-w-[1080px]`, so measured: the wrapper runs **180 → 1260**, the brand sits at
**x 204** and the account controls end at 1236 — over a panel that starts at x 12 and a map that
runs to 1440. At 1920 it is worse: the wrapper is 420 → 1500 and the brand at **x 444**, floating
over the middle of a 540 px panel. The header reads as belonging to a narrower page than the one
under it.

The shell's header is shared, so this is prototyped as a **page-scoped treatment of the rendered
header** (`prototype-header.ts`) — Tailwind utilities toggled on shipped DOM, the idiom the dusk
and merge states already use — never an edit to `app.html`. Shipped it is a `data.wide` route flag
and `data-wide:max-w-none` on the wrapper (verified against the Tailwind v4 docs: a bare
`data-<name>:` variant is the boolean form; `data-[size=large]:` is the value form). Three things,
each shot before and after:

| Treatment                     | Measured                                                       | Verdict                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `max-w-none` on the map route | wrapper 0 → 1440, brand **x 24**, controls end at 1416         | **Keep.** The brand lands 12 px inside the panel's own left edge and the controls sit over the map's right edge: the header is the page's, not a card on it. |
| eyebrow as 12.5 px lowercase  | brand block 166 → **142 px** wide                              | **Keep.** `ALBANIAN COAST` at 10 px / `tracking-[0.24em]` is 2.4× Tailwind's `tracking-widest` — the tracked-out all-caps eyebrow is the templated tell.     |
| eyebrow removed               | brand block **126 px**                                         | No. Quieter still, but it throws away the one line that says where this is, and the brand then differs between this route and every other.                   |
| swatch → a labelled menu row  | row 220 px inside a 236 px popover, `Colour theme · Porcelain` | **Keep.** An unlabelled 22 px colour circle between `My bookings` and `Sign in` reads as decoration; in the menu it is a named setting showing its value.    |

`Q-shore-1440-hdr-shell.png` and `Q-shore-1920-hdr-shell.png` are the before;
`Q-shore-1440.png`, `Q-shore-1920.png`, `-hdr-wide`, `-hdr-lower`, `-hdr-noeyebrow`,
`Q-shore-1440-menu.png` and `-menu-shell` are the after and the alternatives.

### 4. The open faults a class could close

- **The poster's seam at full (fault 7).** Measured in the sheet's 8 px left gutter, where no row's
  text interferes: across y 380 the glass stepped **ΔRGB 15.3**. `?seam=opaque` (the body on the
  head's `--riv-tabbar-glass`) → **2.9**; `?seam=tone` (the pane filled with the poster's own
  bottom-edge colour, sampled from the JPEG through a 1 × 1 canvas) → **0.3**. Tone is the default:
  it is the only one that removes the edge rather than hiding it, and it keeps the glass, which is
  the design system's material. `Q-shore-phone-full.png`.
- **A crowd's dusk (fault 6).** It followed the pill's face member. Now the pass groups the
  rendered buttons by the `left`/`top` the layer writes — that IS the crowd — and greys a pill only
  when every member has closed. At `?now=16:30`: `3 beaches · from €22 · 6` keeps its colour (four
  of its six still sell), `Borsh` greys (both closed). `Q-shore-phone-1630.png`.
- **The merged pill's name overran a pill that could not grow.** The repaint painted the union's
  name into an `after:absolute` overlay, so the pill kept the old face's width: at `?dense=30` and
  1440, `Dhërmi & Drymades` was drawn into a **111 px** pill and ran out of both ends and under the
  count disc. The old face is zeroed with `text-[0px]!` now — two font-size utilities on one
  element resolve by stylesheet order, not class order, so the `!` is load-bearing — and the
  `::after` is an ordinary inline box the flex row measures. The pill grows to **202 px** and says
  `Dhërmi & Drymades · from €17 · 10`.

### 5. Density, round 8's follow-ups

- **Sticky beach heads past ~15 venues.** Round 8 measured 30 venues as 5.4 screens with the beach
  titles scrolling away. Each head is `sticky top-0` once the region has more than 15, on both
  surfaces. Measured at `?dense=30`, the list scrolled 900 px: on the phone at full `Drymades ·
3 venues` is pinned at the list's top with the rows passing under it; on the 1440 panel the
  stuck head keeps its hairline and reads exactly as the running head it is.
  `Q-shore-phone-dense-full-scrolled.png`, `Q-shore-1440-dense-scrolled.png`. (Every earlier head
  stacks at the same spot and the last one drawn wins — which is the current group. Correct.)
- **A vertical pill anchor.** `layoutPills` tries centred, hung right, hung left, then collapses to
  a bare count: at `?dense=30` and 1440 that left a nameless **`6`** that collided with nothing.
  The pass now re-places every pill over the rendered DOM with **above and below** (and the four
  diagonals) added, gives a collapsed disc its face back from the label the layer wrote, and puts
  it back to a disc if nothing fits. Result: the `6` is `Jalë · from €16 · 6`, hung below-left of
  its point, clear of `€20` and `€19` — **every pin on that screen is named now**. The same pass
  re-places the grown merged pill, which had landed on `€32` at 1440 (`Q-shore-1440-dense.png`,
  `Q-shore-1440.png`).
- **A beach ceiling of 15 instead of 14 — rejected, on the numbers.** `?cap=15&live=1&beach=DHERMI`.
  At 14 the three Dhërmi pins span 126 px; at 15 they span 209. The sea is still on one side, but
  it is down from about half the frame to about a third and the frame becomes a street map with
  POI icons competing with the pins (`Q-shore-phone-beach-cap15.png` vs `-beach-live.png`). That
  would be a fair trade if it bought separation — it does not. At zoom 15 the scale is **1.83 m/px**,
  so two venues 50 m apart are **27 px** apart against the pins' 44 px floor: they still crowd, and
  the crowd pill is still the way in. Ending the crowding would need zoom ≈ **15.7**. And in the
  case that raised it — a beach with nine venues — the cap never binds: the pane's own fit is
  tighter, and `?dense=30&beach=DHERMI` measures **identically** at 14 and 15 (pins 362 × 212 on
  the phone, 849 × 510 at 1440). **The list stays the way into a dense beach**, as round 8's other
  option had it.

### 6. The two desktop calls

- **The group head's count.** Round 10's review is right that `2 venues` in the same soft ink as
  the beach name makes two things compete. Giving it the name's ink makes it _louder_ than the
  name (shot: `text-riv-ink` at the row's right edge is the first thing the eye lands on), which
  is wrong for a third-rank fact. Dropping it reads best on the desktop. But the rule that falls
  out of the two shots is better than either: **the count appears where the group cannot be seen
  whole** — always on the phone's sheet, where two rows are visible, and on the desktop panel only
  once the heads go sticky (> 15 venues), which is exactly when the group is longer than the panel.
- **The phone's rows: cards or the desktop's flat list?** Shot both ways at half and full, with
  the hairline given to the flat form so the comparison is fair (`Q-shore-phone-flat.png`,
  `-flat-full.png` against `Q-shore-phone.png`, `-full.png`). **Keep the cards** — but for a
  better reason than round 10 gave. Round 10 said the sheet's edge needs them; it does not, the
  sheet has a rounded top, a shadow and a grabber. The real reason is the ground: the sheet's
  glass now carries the map's own tone (§ 4), and a hairline on that is far fainter than the same
  hairline on the desktop's opaque panel — at 390 the flat rows run together, while each card is
  unambiguously one tappable thing under a thumb. Row density is a wash (both reach the fifth row
  at full).

### What round 11 keeps, and where it disagrees with round 10

Keep: the measured tab bar and the 73 px header; the re-taken rest; the live ground above 440 px;
two row columns and the spelled-out chip on a tablet; `data-wide:max-w-none` with the lowercase
eyebrow and the swatch as a menu row; `seam=tone`; dusk per crowd; the grown and re-placed merged
pill; the vertical anchor; sticky heads past 15; the count only where the group cannot be seen
whole; the phone's cards.

Disagree with round 10: (1) "the phone keeps the card because on the sheet the rows are its only
surfaces" is the wrong reason — the cards win on the hairline's contrast against a tinted glass,
not on the sheet's edge; (2) the shipped header's eyebrow was called "the design system's, not
this prototype's" and left alone — it is the one piece of the shipped chrome this page is measured
against, and 10 px at 0.24em is the templated tell, so this round changed it and says so; (3)
round 10's five desktop findings were taken as the desktop's whole critique, but the header above
the panel was never in the frame and it is the first thing on the screen; (4) `TAB_BAR` and
`HEADER_H` were carried from round 6 unexamined through five rounds of "measure, don't assume".

## Round 12 — what a desktop row says, and what the selected one says

A design question after round 11: should the panel's rows carry more, and be taller for it? The
panel is already 1.8 screens at 1440 for an 11-venue region (736 px of body, 6 rows visible; 916
and 7 at 1920), and every round that put weight back into a row has been reversed — round 7 cut
cards for rows because two 395 px rows showed twice the venues, round 10 cut the availability bar
from 330 px to 72. So the answer is not a taller row everywhere. Two changes instead, both of
which the view model already supported:

- **The review count, on every desktop row.** `VenueCard.reviewsLabel` existed and only the card
  rendered it. A 4.6 from 3 reviews is not a 4.6 from 300, and in the fixture the spread is real:
  Lori Beach is `★ 4.0 · 15 reviews`, Ksamil Three Islands `★ 4.6 · 511 reviews`, Dhërmi Sun Club
  `★ 3.8 · 9 reviews`. It costs no height — it joins the facts line the row already had. Only the
  514 px desktop row takes it; the phone's 364 px card keeps `★ 4.6 · 20 m to water`, which the
  distance chip already fills.
- **The selected row expands, and only it.** The row IS the pin's preview — that is the spine of
  the design on both surfaces — so the panel spends the height on the one venue being decided on:
  the amenity chips (`prototype-venue-row.ts` has had a `chips` input all along, off everywhere)
  plus the booking mode. `Q-shore-1440-sarande-pin.png` is the clearest of the three:
  `Pasqyra Blue` lit, with `Request to Book · Snorkelling · Quiet bay` under its facts.

**The mode chip appears only when the mode is not the default.** `Instant Book` on twenty rows of
twenty-six is noise; `Request to Book` is the fact a tourist needs, and it is the exception (6 of
26 in the fixture). If a real venue population is mostly request-mode, the rule inverts — it is
the exception that gets named, not one particular value.

Measured, at 1440 × 900 and 1920 × 1080:

|                           | Nothing selected | One row selected                                |
| ------------------------- | ---------------- | ----------------------------------------------- |
| Row height                | 92 px            | **118 px** (the selected one; the rest stay 92) |
| List height               | 1,342 px         | 1,368 px (**+1.9 %**)                           |
| Rows visible, 1440 / 1920 | 6 / 7            | **6 / 7 — unchanged**                           |
| Screens to scroll, 1440   | 1.82             | 1.86                                            |

One build defect, found in the shots and fixed: the chips were first rendered as a sibling AFTER
the row's `<a>`, so they fell outside the selected row's outline and read as belonging to the next
beach group. They live inside the anchor's text column now, aligned with the name, and the outline
contains them.

**Not taken, held for evidence:** a uniformly taller row driven by a 96–112 px photo (72 × 72 is a
thumbnail, and for a beach club the picture is much of the decision). It would take 6 visible rows
to 5 and 1.8 screens to 2.1–2.3. Worth doing only if the rows still read thin with the review
count on them — from these shots they do not. **Noted, not fixed:** the facts line is now three
items chained by middle dots (`★ 4.6 · 143 reviews · 20 m to water`), which is on the
`frontend-design` skill's list of generated-page tells. It is load-bearing here rather than
decorative — it is the row's whole fact set — but a tighter form (`★ 4.6 (143)`, the map-listing
convention) would need the raw count, and the shipped view model deliberately exposes only the
agreed-noun label.

## Screenshots

`shots/` holds the set these notes are written from, captured by `shoot.mjs`: `playwright-core`
from `node_modules`, the image's Chromium at `/opt/pw-browsers/chromium` (never `playwright
install`), `platform/map/` served from disk with the archive range-sliced as the backend does, and
every fixture photo answered with a ~1.4 kB SVG stand-in — judge photo mass, not the pictures. The
driver logs each shot's first-screen cost (map style/sprite/glyph requests, tile ranges, live WebGL
contexts) and the geometry the notes argue from; `--json` keeps the raw numbers. Phone shots are
390 × 844 at 1×.

| File                                                                                                                                                   | What                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref-airbnb-phone.png` · `ref-airbnb-phone-list.png` · `ref-airbnb-phone-pin.png`                                                                      | the reference: Airbnb's mobile search at Himarë — the sheet on the map; pulled up; a pin                                                                      |
| `ref-spiagge-phone.png`                                                                                                                                | spiagge.it's first screen: where, when, Cerca — no map                                                                                                        |
| `Q-shore-phone.png` · `Q-shore-phone-himare.png`                                                                                                       | the first paint: the Himarë poster, the sheet at half, the one-row head (the default, and asked for by region)                                                |
| `Q-shore-phone-subtitle.png`                                                                                                                           | round 7's other head: the beach in the subtitle, no chip (`?head=subtitle`)                                                                                   |
| `Q-shore-phone-riviera.png` · `Q-shore-phone-dark.png`                                                                                                 | the same first paint in the `riviera` and `dark` themes (glare)                                                                                               |
| `Q-shore-phone-flick-up.png` · `Q-shore-phone-flick-down.png`                                                                                          | a real touch flick: 400 px up from half rests at full; 350 px down from full rests at peek                                                                    |
| `Q-shore-phone-full.png` · `Q-shore-phone-full-scrolled.png`                                                                                           | the sheet at full: the 44 px sliver, the Map pill, no seam where the poster ends; and the list scrolled 700 px inside                                         |
| `Q-shore-phone-flat.png` · `Q-shore-phone-flat-full.png`                                                                                               | round 11's comparison: the phone's rows as the desktop's flat list (`?rows=flat`), at half and at full                                                        |
| `Q-shore-phone-peek.png` · `Q-shore-phone-peek-pin.png`                                                                                                | the sheet at peek: the live map fills the window; a crowd press at peek                                                                                       |
| `Q-shore-phone-pin.png` · `Q-shore-phone-pin-lone.png`                                                                                                 | a crowd press at half (the north end separates inside the window); a lone pin press lifts its row, lit                                                        |
| `Q-shore-phone-here.png` · `Q-shore-phone-here-pin.png`                                                                                                | located at Dhërmi: nearest first, `You are here`; a crowd press while located                                                                                 |
| `Q-shore-phone-sarande.png` · `Q-shore-phone-beach.png`                                                                                                | a tall region north up on the poster; one beach (Dhërmi) at the zoom cap — on the shoreline now                                                               |
| `Q-shore-phone-1630.png` · `Q-shore-phone-day.png` · `Q-shore-phone-picker.png`                                                                        | dusk at 16:30 (legible now); the day chips; the coast picker without `Whole coast`                                                                            |
| `Q-shore-phone-beaches.png` · `Q-shore-phone-beach-chosen.png`                                                                                         | the beach chip opened into its rail; the same with Dhërmi chosen, its chip lit and in view                                                                    |
| `Q-shore-phone-live.png`                                                                                                                               | the control: the live map from the first paint, pins where the poster's were                                                                                  |
| `Q-shore-tall.png` · `Q-shore-tall-peek.png`                                                                                                           | 430 × 932, half and peek                                                                                                                                      |
| `Q-shore-768.png` · `-768-peek` · `-768-full` · `Q-shore-820.png` · `-820-peek` · `-820-full`                                                          | round 11's tablet band (768 × 1024, 820 × 1180): no tab bar to reserve, the ground live, two row columns                                                      |
| `Q-shore-1024.png` · `Q-shore-1200.png`                                                                                                                | the narrowest windows: Himarë in a 40–60 % pane, one venue a row (the merge classes fire at 1024)                                                             |
| `Q-shore-1440.png` · `Q-shore-1440-here.png` · `Q-shore-1920.png`                                                                                      | the desktop: Himarë, the opening region, at 1440; located; 1920 — with round 11's header                                                                      |
| `Q-shore-1440-hdr-shell.png` · `Q-shore-1920-hdr-shell.png`                                                                                            | the before: the shipped header's 1,080 px clamp over a page that runs to the window's edges                                                                   |
| `Q-shore-1440-hdr-wide.png` · `-hdr-lower` · `-hdr-noeyebrow`                                                                                          | the header treatments one at a time: the page's edges; the 12.5 px lowercase eyebrow; the eyebrow gone                                                        |
| `Q-shore-1440-menu.png` · `Q-shore-1440-menu-shell.png`                                                                                                | the theme swatch as a labelled menu row, and the shipped menu beside it                                                                                       |
| `Q-shore-1440-free.png` · `Q-shore-1440-pin.png` · `Q-shore-1920-pin.png`                                                                              | Himarë's 864 px pane at the set's own height (`?pane=free`); a lone pin press lights and centres its row, and the lit row expands (round 12)                  |
| `Q-shore-1440-sarande-pin.png`                                                                                                                         | round 12's clearest case: `Pasqyra Blue` lit, `Request to Book · Snorkelling · Quiet bay` under its facts                                                     |
| `Q-shore-1440-sarande.png` · `Q-shore-1440-beach.png` · `Q-shore-1440-picker.png`                                                                      | a narrow region on the 40 % floor; Dhërmi chosen; the coast picker, the desktop's chooser                                                                     |
| `Q-shore-phone-dense.png` · `Q-shore-phone-dense-pin.png` · `Q-shore-phone-dense-full.png` · `Q-shore-1440-dense.png` · `Q-shore-1440-dense-beach.png` | round 8's density question: Himarë padded to 30 (`?dense=30`) at half, after a crowd press, at full; the desktop at 1440 and its Dhërmi beach at the zoom cap |
| `Q-shore-phone-dense-full-scrolled.png` · `Q-shore-1440-dense-scrolled.png`                                                                            | round 11's sticky beach heads: the list scrolled 900 px, the current beach pinned at the top of the phone's sheet and of the desktop panel                    |
| `Q-shore-phone-beach-live.png` · `Q-shore-phone-beach-cap15.png`                                                                                       | one beach at the fit's own ceiling of 14 and at 15 (`?cap=15`), both live — the rejected cap                                                                  |
| `Q-shore-phone-dense-beach.png` · `Q-shore-phone-dense-beach-cap15.png`                                                                                | the nine-venue beach at 14 and at 15: identical, because the pane's fit binds first                                                                           |

## Files

| File                                                 | What                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                              | the host: fixture data, the filters and the tourist's position from the URL                                                                                                                                                              |
| `variant-shore.ts`                                   | Q: the ground, the two-scroller sheet, the poster/live swap, the dusk and merged-crowd classes, the desktop panel rule, the dots and the gutter                                                                                          |
| `prototype-poster.ts`                                | the still poster: its box, its camera, and the `MapHandle` over an image the pin layer draws through                                                                                                                                     |
| `prototype-coast-picker.ts`                          | the coast as a chooser: the ribbon + the index as a sheet (a popover from `lg`) — the desktop's only way to another region                                                                                                               |
| `prototype-header.ts`                                | round 11's page-scoped treatment of the SHELL's header (`?hdr=`): the page's edges, the eyebrow, the theme swatch as a menu row — never an `app.html` edit                                                                               |
| `prototype-venue-row.ts` · `prototype-venue-card.ts` | the row (the pin's preview): a card on the phone's sheet, a flat list entry on the desktop panel that carries the review count and expands when it is the selected one (round 12); and the card grid, no longer reachable on the desktop |
| `prototype-place.ts`                                 | the tourist's position, distances, the beach grouping                                                                                                                                                                                    |
| `prototype-aspect.ts`                                | the result set's own aspect ratio — the number the desktop pane is sized from                                                                                                                                                            |
| `prototype-camera.ts`                                | fit the camera to the pane and the pins                                                                                                                                                                                                  |
| `prototype-days.ts`                                  | the fixture's time: each venue's sales close, and the seven days the day chips offer                                                                                                                                                     |
| `prototype-coast.ts`                                 | the coast as an index: regions, beaches, counts, from-prices                                                                                                                                                                             |
| `prototype-venues.ts`                                | 26 fixture venues, on the shoreline: round 7 snapped each to the map's own water edge (§ _Round 7_ § 1)                                                                                                                                  |
| `shoot.mjs`                                          | the screenshot + cost/geometry driver (themes, CDP touch flicks, the pane's pin fill), and the poster renderer (`--posters`)                                                                                                             |
| `research/`                                          | the two raw research reports: the measured references (bytes by host, geometry) and the web research                                                                                                                                     |
| `../../../../public/prototype-posters/*.jpg`         | the 22 still posters, one per region and beach with venues — rendered, not drawn                                                                                                                                                         |

## Recommendation

**Implement Q as rounds 7 to 11 leave it** — not as round 6 left it, and not another round. The
two open questions that would have justified more prototyping were answered by measurement rounds
ago (a sheet over a poster is a first paint for **0 map requests, 0 WebGL contexts and one 38 kB
JPEG**; a real CDP flick rests where it should), and round 11 spent itself on defects and
finishes rather than on the shape: the shape did not move. What is left is engineering with named
seams, and the one genuinely open design question — whether a beach with nine venues needs
anything beyond the list — has an answer now (no: the zoom cap that was proposed does not bind,
and 50 m is 27 px even at 15). The first three slices, each a tracer bullet through the shipped
Discover page behind a flag, test-first:

1. **The sheet, on measured chrome.** The two-scroller scroll-snap sheet with its three heights,
   the 78 px head, the grabber, the `Map` pill and highlight-and-scroll — with the tab bar's and
   header's heights **measured at runtime, never constants** (round 11: the bar is `sm:hidden`, so
   the tablet band reserves nothing, and the header is 73 px, not 68). A Playwright e2e flicks
   through CDP and asserts the rest positions at 390, 430, **768 and 820**, where the first row
   lands at y 493 in all four.
2. **The poster.** A backend renderer for one still per region and beach from the map extract, at
   2× and 3× **and per width bucket** — above 440 px the 440 px still cannot cover the window, and
   the fallback (the live map from the first paint) is what the tablet pays today. The
   `MapHandle` over an image, `fitUnderHeader`, the live map's swap-in at the poster's camera, the
   first-paint cost asserted (0 map requests, 0 contexts), and the pane rendered at the sheet's
   full height so the seam round 11 measured at ΔRGB 15.3 cannot exist.
3. **The pin layer and the desktop.** A `dusk` input on the layer, decided **per crowd** (all
   members closed) and not per face member; the one-line crowd-mean rule in `crowdPins`; a
   **vertical anchor** in `layoutPills` (above and below, then the diagonals) before it collapses
   a pill to a bare count, which is what named the last nameless disc at `?dense=30`; and the
   desktop as rounds 8 to 11 left it — region-first with the picker as the chooser, the panel
   clamped to the row's width (38 %, 420–540) with the map taking the rest, the rows a flat list
   with the beach as a running head, sticky past 15 venues, the gutter for a region's crowds under
   560 px of pane, and no whole-coast state anywhere. The row carries its review count, and the
   SELECTED row — the pin's preview — expands to its amenities and its booking mode when that is
   not the default (round 12: 26 px on one row, no visible rows lost).

Then two smaller pieces of the same work, neither a slice of the sheet: **the header on the map
route** — a `data.wide` route flag and `data-wide:max-w-none` on `app.html`'s inner wrapper, the
eyebrow as 12.5 px `tracking-wide` in its own case, and the theme swatch moved into the menu as a
labelled row (this one is a shell change and wants its own issue, because it touches every route);
and **a shoreline snap in the operator's pin placer**, a product requirement rather than a slice,
because the map is the ground now.

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If Q ships
it gets rebuilt test-first through the normal loop — do not promote this code.
