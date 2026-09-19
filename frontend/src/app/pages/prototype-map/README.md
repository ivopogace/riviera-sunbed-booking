# PROTOTYPE — Q · Shore: where the riviera map goes on a phone

**Throwaway. Spike branch only (`claude/map-design-prototype-417sh1`); nothing here merges to
`main`.** Q is the layout for the riviera map on Discover, phone first (390 × 844, one hand,
glare, 4G, the shipped tab bar on screen), built from what the reference products are measured to
do rather than from what they were remembered to do. Sixteen earlier layouts were built across six
rounds and cut; their code, screenshots and verdicts are in this branch's history (commit 2e53109
and before — `git log --diff-filter=D -- 'frontend/src/app/pages/prototype-map/'`). What they
established and Q rests on is in § _What Q rests on_.

```
npm start           # from frontend/
open http://localhost:4200/prototype/map
node src/app/pages/prototype-map/shoot.mjs            # the shots + the cost/geometry log
node src/app/pages/prototype-map/shoot.mjs --posters  # re-render the still posters
```

Every state is in the URL: `?sheet=peek` (the sheet pulled down to the map), `?sheet=full`,
`?here=19.641,40.147` (the tourist standing on Dhërmi beach), `?region=SARANDE`, `?beach=DHERMI`,
`?now=16:30` (the clock, for the sales-close state), `?live=1` (the live map from the first paint,
for the cost row). Venues come from `prototype-venues.ts` (26 fixtures along the real coast), so
no backend is needed; the map is the real `app-riviera-map` against the real `platform/map` tiles,
which `./gradlew bootRun` serves at `/map/**` (the driver serves them from disk).

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

- **The ground is the map, under the shipped glass header** — the design system's backdrop
  material finally has something to blur. The sheet is `appPanelGlass` over it.
- **Three resting heights**, Airbnb's and Google's: **half** (the sheet's top at y 380: 312 px of
  map under the 68 px header — Airbnb rests at 441 with a 134 px bar, so its band is 307), **peek**
  (the place row alone, 80 px above the tab bar: the map fills 68 → 703), **full** (the top at
  112: a 44 px sliver of map stays, Google's rule, and a `Map` pill at the foot is Airbnb's way
  back). The tab bar stays in every state, because this product has one; Airbnb hides its own.
- **The sheet is a CSS scroll-snap container, not a pointer-drag** (Tailwind's `snap-y
snap-mandatory`, `snap-start`, `snap-always`): a transparent spacer over the map holds the peek
  and half rest points as zero-height snap targets, the sheet itself snaps at full, and past full
  the sheet covers the snapport, which the spec lets rest anywhere — so one finger raises the
  sheet, keeps scrolling the list, and lowers the sheet again by pulling the list down. The
  container starts at the full line, so nothing it holds paints over the map's sliver. Native
  inertia, no drag arithmetic, `motion-safe:scroll-smooth` for the programmatic moves, a grabber
  tap cycles. The head is `sticky` at the sheet's top, on the popover surface over the list.
- **The first screen's map is a poster** (`prototype-poster.ts`): the region's fitted camera
  rendered once by the real map (`shoot.mjs --posters` opens `?poster=<key>` and screenshots
  440 × 380 at 2×; 22 JPEGs, 10–129 kB, Himarë 38 kB) and served from `public/prototype-posters/`.
  The shipped pin layer draws over it through a `MapHandle` whose `project` is Mercator arithmetic
  for that camera, so the pins crowd, price and press exactly as on the live map. The first thing
  that has to _move_ the camera — a crowd press, a finger on the ground, the sheet pulled down to
  peek, Near me — swaps the live map in at the same camera, aimed at the window the sheet leaves,
  and the poster fades under it. Measured: the live map's pins land where the poster's were, to
  the pixel (348 × 219 at 24, 120 in both).
- **The sheet's head carries the query and stays visible at every height**: the place (press → the
  coast picker), the sentence `11 venues · 8 selling today` (invariant #4 as the map's light: a
  venue whose sales for today have closed wears dusk on its pin and on its row), the day, and the
  beach. **The rails are gathered into buttons**: the day is a pill (`📅 Today ▾`) and the region's
  beaches one chip (`⛱ All beaches · 6 ▾`, or the chosen beach, lit); a press opens the rail of
  chips in place, with the lit chip scrolled into view, and a pick closes it. The rail enters
  through Tailwind's `starting:` variant (`@starting-style`) and leaves through Angular's
  `animate.leave` class binding, which holds the element until its transition ends; both are
  `motion-safe`. At peek the head is the place row alone (80 px — Airbnb's collapsed header is
  about the same); at half and full the beach chip joins it (122 px).
- **The row is the preview**: a pin press raises the sheet to half if it was down and the venue's
  row joins the head, lit, above the list, until the map is tapped clear. No card over the map
  (Airbnb's replaces the sheet; here the sheet's head is the card).
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
  set needs (360 px for the whole coast, 864 for Himarë at 1440) and the panel keeps the rest,
  rows below 760 px, a card grid above (three columns at 1440, four at 1920). The desktop opens on
  the whole coast, which its column can frame.

## Measured: geometry and cost

Phone, 390 × 844, by `shoot.mjs` (photos are SVG stand-ins — judge mass, not pictures):

| State                  | Map on it                                                       | First row                       | Map requests / bytes               | Tiles / bytes | Contexts |
| ---------------------- | --------------------------------------------------------------- | ------------------------------- | ---------------------------------- | ------------- | -------- |
| **half** (first paint) | 68–380 (312 px); Himarë pins 348 × 219 at 24, 120               | y 533, two whole rows + a group | **0 / 0 + one poster JPEG, 38 kB** | **0 / 0**     | **0**    |
| full                   | 68–112, a sliver                                                | y 213, 6 rows                   | 0 / 0                              | 0 / 0         | 0        |
| peek                   | 68–703 (635 px), live                                           | under the head                  | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| pin press at half      | crowd separated inside the window (Dhërmi's three at y 135–325) | lit, scrolled                   | 6 / 326 kB                         | 6 / 57 kB     | 1        |
| the picker open        | poster + the ribbon                                             | —                               | 6 / 336 kB                         | 6 / 124 kB    | 1        |
| `live=1` (the control) | 68–380 live, pins at 24, 120                                    | y 533                           | 6 / 333 kB                         | 6 / 108 kB    | 1        |
| the shipped page       | none                                                            | none                            | 0 / 0                              | 0 / 0         | 0        |
| Airbnb (measured)      | 134–441 (307 px)                                                | y 515, one card                 | 195 requests, 14.8 MB (map 1.9 MB) | —             | —        |

430 × 932: the same layout; the poster's 440 px width covers it with a 5 px crop, the first row is
still at y 533 and the tall phone gets its extra 88 px as list (`Q-shore-tall.png`); at peek the
window is 68 → 791 (`Q-shore-tall-peek.png`). Desktop: panel 1,080 + map 360 at 1440 (whole coast,
pins 311 × 765 in 360 × 816, three card columns); panel 576 + map 864 at Himarë (pins 827 × 509);
panel 1,536 + map 360 at 1920 (four columns).

## Q's faults, the honest list

1. **The poster is a real backend cost.** A shipped version renders one image per region and
   beach server-side from the same extract (ADR-0022 keeps the map first-party), at 2× and 3×,
   invalidated with the extract. The prototype's 22 JPEGs (956 kB) are that job done by the
   screenshot driver.
2. **The pin layer still crowds at 390 px** — Himarë's "Palasë & Drymades" pill overlaps its
   own member discs. Shipped behaviour, unchanged; the crowd rule is not this spike's.
3. **The desktop whole-coast column at 360 px** puts a place pill over the zoom buttons; that
   width wants dots and a label gutter instead of pills.
4. **The preview row is a copy**: the venue's row appears in the head and stays in the list. Airbnb
   replaces the sheet with the card; a shipped version could dim the list's copy.
5. **The fixture pins are inland** (the Dhërmi poster is the village, `You are here` at 0.4 km):
   a venue pin's placement accuracy is a product requirement once the map is the ground, and the
   operator's pin placer wants a shoreline snap.
6. **Whole coast is not a phone state**: the picker's `Whole coast` falls back to the default
   region below `lg`; it should be hidden there.

## What to ship, and why

**Q, with the poster.** It is the Airbnb pattern as measured — a sheet over a map, one screen —
and it is a phone first screen with a map, a venue and a row on it for the price of one image.
Its port cost is small and named: a scroll-snap sheet with three heights (CSS, no library, no
pointer arithmetic), a `MapHandle` over a still image (`project` only), a fit that aims at the
window the sheet leaves (`fitUnderHeader`, and the same aim on a crowd press), a poster renderer
on the backend, and the desktop pane rule.
The shipped tab bar, header, pin layer, card tokens and picker are used as they are. Without the
poster Q's first screen costs what any live map does (341 kB + tiles + a context), and a
list-first page would be the cheaper first paint; with it, that argument is over.

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

## Screenshots

`shots/` holds the set these notes are written from, captured by `shoot.mjs`: `playwright-core`
from `node_modules`, the image's Chromium at `/opt/pw-browsers/chromium` (never `playwright
install`), `platform/map/` served from disk with the archive range-sliced as the backend does, and
every fixture photo answered with a ~1.4 kB SVG stand-in — judge photo mass, not the pictures. The
driver logs each shot's first-screen cost (map style/sprite/glyph requests, tile ranges, live WebGL
contexts) and the geometry the notes argue from; `--json` keeps the raw numbers. Phone shots are
390 × 844 at 1×.

| File                                                                                          | What                                                                                            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ref-airbnb-phone.png` · `ref-airbnb-phone-list.png` · `ref-airbnb-phone-pin.png`             | the reference: Airbnb's mobile search at Himarë — the sheet on the map; pulled up; a pin        |
| `ref-spiagge-phone.png`                                                                       | spiagge.it's first screen: where, when, Cerca — no map                                          |
| `Q-shore-phone.png` · `Q-shore-phone-himare.png`                                              | the first paint: the Himarë poster, the sheet at half (the default, and asked for by region)    |
| `Q-shore-phone-full.png` · `Q-shore-phone-full-scrolled.png`                                  | the sheet at full: the sliver, the Map pill; and scrolled 700 px inside                         |
| `Q-shore-phone-peek.png` · `Q-shore-phone-peek-pin.png`                                       | the sheet at peek: the live map fills the window; a crowd press at peek                         |
| `Q-shore-phone-pin.png` · `Q-shore-phone-pin-lone.png`                                        | a crowd press at half (Dhërmi separates inside the window); a lone pin press lights its row     |
| `Q-shore-phone-here.png` · `Q-shore-phone-here-pin.png`                                       | located at Dhërmi: nearest first, `You are here`; a crowd press while located                   |
| `Q-shore-phone-sarande.png` · `Q-shore-phone-beach.png`                                       | a tall region north up on the poster; one beach (Dhërmi) at the zoom cap                        |
| `Q-shore-phone-1630.png` · `Q-shore-phone-day.png` · `Q-shore-phone-picker.png`               | dusk at 16:30; the day chips; the coast picker                                                  |
| `Q-shore-phone-beaches.png` · `Q-shore-phone-beach-chosen.png`                                | the beach chip opened into its rail; the same with Dhërmi chosen, its chip lit and in view      |
| `Q-shore-phone-live.png`                                                                      | the control: the live map from the first paint, pins where the poster's were                    |
| `Q-shore-tall.png` · `Q-shore-tall-peek.png`                                                  | 430 × 932, half and peek                                                                        |
| `Q-shore-1440.png` · `Q-shore-1440-himare.png` · `Q-shore-1440-here.png` · `Q-shore-1920.png` | the desktop: the whole coast (360 px pane, three columns); Himarë; located; 1920 (four columns) |

## Files

| File                                                 | What                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `prototype-map-page.ts`                              | the host: fixture data, the filters and the tourist's position from the URL                          |
| `variant-shore.ts`                                   | Q: the ground, the three-height sheet, the poster/live swap, the desktop panel rule                  |
| `prototype-poster.ts`                                | the still poster: its box, its camera, and the `MapHandle` over an image the pin layer draws through |
| `prototype-coast-picker.ts`                          | the coast as a chooser: the ribbon + the index as a sheet (a popover from `lg`)                      |
| `prototype-venue-row.ts` · `prototype-venue-card.ts` | the phone row (the pin's preview) and the desktop card                                               |
| `prototype-place.ts`                                 | the tourist's position, distances, the beach grouping                                                |
| `prototype-aspect.ts`                                | the result set's own aspect ratio — the number the desktop pane is sized from                        |
| `prototype-camera.ts`                                | fit the camera to the pane and the pins                                                              |
| `prototype-days.ts`                                  | the fixture's time: each venue's sales close, and the seven days the day chips offer                 |
| `prototype-coast.ts`                                 | the coast as an index: regions, beaches, counts, from-prices                                         |
| `prototype-venues.ts`                                | 26 fixture venues                                                                                    |
| `shoot.mjs`                                          | the screenshot + cost/geometry driver, and the poster renderer (`--posters`)                         |
| `research/`                                          | the two raw research reports: the measured references (bytes by host, geometry) and the web research |
| `../../../../public/prototype-posters/*.jpg`         | the 22 still posters, one per region and beach with venues — rendered, not drawn                     |

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If Q ships
it gets rebuilt test-first through the normal loop — do not promote this code.
