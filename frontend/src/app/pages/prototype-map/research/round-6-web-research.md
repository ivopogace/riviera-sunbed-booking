# Web research: "browse a coast, pick a place on a map, for one day" on a phone

Date: 2026-09-19. Method: WebSearch + WebFetch only; repository untouched.
The session proxy blocked most secondary sources outright (Mobbin, Smashing, A List Apart,
UXmatters, Baymard, HTTP Archive, Dribbble, Behance, Figma, Medium, Mapbox docs, the
Italian/Greek/Albanian product sites, several news outlets). Where a fact comes from a
search-result snippet rather than a fetched page it is marked **[snippet]**; where I could
fetch the page it is marked **[fetched]**. Numbers I could not source are in § 9, not in the
body.

---

## 0. Ten-line summary

1. No large travel product starts on a map. Airbnb and Booking.com start with a query
   (place + dates) and a _list_; the map is one tap away and is entered from a control at
   the bottom (Airbnb) or the results header (Booking.com, per Baymard's test of the web).
2. Google Maps is the only product whose first screen _is_ the map, and even it now hides
   nothing under full-screen views: every list is a sheet that leaves "a sliver of the map"
   visible at the top, closes with an × in the sheet's top-right, and docks its rounded
   corners onto the bottom tab bar when minimised **[fetched, 9to5Google 2024-25]**.
3. Sheet mechanics are standardised: Apple = `.medium` (≈ half) and `.large` detents plus a
   grabber; Material 3 = peek 56 dp, half = 0.5 ratio, 32×4 dp drag handle inside a 48 dp
   touch target, sheet max width 640 dp **[fetched, HIG + androidx source]**.
4. Every real sunbed product I could find (Spiagge.it, Ombrellone.it, Beacharound, SunEasy,
   Plazz, MySunbed, Lettini, Find Sunbed, BeachDibs, Sandbeds) is _locality → list of clubs
   → per-club umbrella plan → day_. A coast map, if present at all, is secondary.
5. SunEasy already does exactly this for the Albanian riviera (Ksamil, Dhërmi, Saranda,
   Vlorë, Himarë, Durrës, Qerret), with per-beach price pages and an "interactive beach map"
   for the sunbed **[fetched App Store; snippets from suneasy.app]**.
6. Thumb data: 49 % one-handed grip, 75 % of touches by thumb; touch accuracy degrades from
   7 mm at the centre to 11 mm at the top and 12 mm at the _bottom_ edge, so the bottom
   band is reachable but not precise **[snippet, Hoober 2013/2017]**.
7. Sunlight: a 200-nit LCD drops below 2:1 contrast in direct sun; dark-on-light beats
   light-on-dark above ≈ 1,500 lux; Apple tells you to test "outside on a sunny day"
   **[snippet + fetched HIG]**.
8. Page weight: the 2025 median mobile page is 2,164 KB with 646 KB of JS **[fetched, Web
   Almanac source]**. A MapLibre map costs ≈ 200 KB gz of library before a single tile, then
   style + sprite + ≈ 100 KB per glyph range + ≈ 30 tiles per viewport (Mapbox guidance
   50 KB avg/tile), i.e. ≈ 1–1.5 MB for the first view **[snippets + fetched GitHub]**.
9. The three big apps weigh 357 MB (Airbnb), 484 MB (Booking.com), 86 MB (SunEasy) on
   iOS; they are native, so their map cost is amortised over an install we don't have.
10. Verdict (§ 8): list-first, day-first, _coast strip_ instead of a free map, static image
    for the coast, real map only inside a sheet on demand, all controls in the bottom 40 %.

---

## 1. Airbnb (iOS / Android)

**Sources**: Airbnb Newsroom 2023 Summer Release **[fetched]**; Newsroom 2024 Winter Release
and 2025 Summer Release **[fetched/snippet]**; Help Center articles 252 and 39 **[fetched]**;
Haldar, "Improving search ranking for Maps" (Airbnb Tech Blog / arXiv 2407.00091)
**[snippet only; Medium and arXiv blocked]**; Mobbin flow "Airbnb iOS Map view"
**[403, title + one-line description only]**; App Store listing **[fetched]**.

| Item                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First screen            | 2025 app: an "Explore" tab that is "an all-new homepage to discover homes in popular destinations, experiences… and services" **[fetched]**. Search → list of "rectangular cards containing listing images, prices, ratings" (Haldar) **[snippet]**.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Where the map is / size | Not in the first screen. Search results are list-first; the map is a separate full-screen state ("map-results") **[snippet]**. Fraction on the list screen: 0. On the map screen: full-bleed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| List ↔ map relation     | Switch, not one screen: "list-results" vs "map-results" are two result surfaces served by the same ranker; the Help Center warns "the listings that appear on the map may differ from those that appear in the list" and "you can zoom in or move around the map to find additional listings" **[fetched]**. Airbnb's 2023 release made pins "persistent … when zooming and panning" and returned "more results when searching"; third-party recaps add "mini-pins" and "faster refresh speed … while moving the map" **[fetched + snippet]**. 2024 Winter: "revamped maps to make it easier to pinpoint where a listing is in proximity to key attractions, parks and neighborhoods" **[snippet]**. |
| Pin style               | "oval pins on a map showing the listing price" (price pills); a second, smaller "mini-pin" class was added in 2023 so more listings fit without labels **[snippet]**. Ranking work found "too many pins" hurts and experimented with showing only the top ≈ 30–50 by booking likelihood **[snippet, third-party summary of the paper — treat the numbers as unverified]**.                                                                                                                                                                                                                                                                                                                           |
| Pin tap                 | A listing card appears at the bottom of the map with a photo carousel; tapping the card opens the listing **[snippet; Mobbin/60fps/banani pages themselves were blocked]**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Controls vs thumb       | Verified only indirectly: "hit the search button at the bottom of the screen" (Tom's Guide forum snippet). The floating black "Map"/"List" pill at bottom-centre that I remember from the app could not be confirmed from any fetchable page — see § 9.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4G cost                 | Native app, 357 MB install (v26.38.1) **[fetched]**; the mobile _web_ page weight could not be measured (WebPageTest blocked). The 2023 map rewrite was explicitly about "faster performance" — Airbnb itself treated map speed as a top complaint ("used by more than 80 percent of guests") **[fetched]**.                                                                                                                                                                                                                                                                                                                                                                                         |

Take-away for us: even Airbnb, with 80 % map usage, keeps the map _out_ of the first
paint and treats list and map as two states of one query rather than one screen.

## 2. Booking.com (app + mobile web)

**Sources**: App Store listing **[fetched]**; GIS&T Body of Knowledge, "Mobile Maps and
Responsive Design", Fig. 3 "Walkthrough of the Booking.com Mobile Map Design"
**[snippet; ResearchGate and gistbok blocked]**; Baymard "accommodations split view"
**[snippet; site blocked]**; Mobbin "Booking.com Web Map View" **[403]**; Mapbox showcase
"CityBook by Booking.com … Mobile Maps SDKs and the Static Images API" **[title only]**;
third-party how-to guides **[snippet]**.

| Item                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First screen            | A search form: destination, check-in/out, rooms/guests — "Booking.com first requires the user to configure search parameters that narrow the resulting spatial and temporal extent of the query … resulting in computational and visual efficiency", an application of Shneiderman's "overview first, zoom and filter, details on demand" **[snippet, GIS&T BoK]**. App copy: "Search for properties nearby, fill in a few details, and secure your reservation" **[fetched]**. |
| Where the map is / size | Results are a long-scrolling card list (photo, rating, nightly price, "booked N times") **[snippet]**. The map is entered from a control in the results header; Baymard observed users who "immediately redirected their attention to looking for a 'Map View'" and "a few had difficulty locating the 'Map View' link or button at the top of the search results page" **[snippet]**. On the map screen the map is full-bleed.                                                 |
| List ↔ map relation     | Switch (toggle) with the same query; users "bounce back and forth between the 2" **[snippet, Baymard]**. On desktop the map view shows a scrollable list beside it **[snippet]**.                                                                                                                                                                                                                                                                                               |
| Pin style               | Price markers; "some map markers have white dots and some have red dots, with red dots indicating a property that is sold out for your chosen dates"; "+/- buttons on the lower right side" for zoom **[snippet, third-party guide — web, not app]**.                                                                                                                                                                                                                           |
| Pin tap                 | Property card at the bottom of the map (web/app) — asserted by several guides, none fetchable; unverified detail in § 9. "Search this area"/search-on-move behaviour: not verifiable.                                                                                                                                                                                                                                                                                           |
| Controls vs thumb       | Map entry is at the _top_ of results (Baymard) — the one placement Baymard flags as hard to find. Zoom at lower-right.                                                                                                                                                                                                                                                                                                                                                          |
| 4G cost                 | Native app 484.4 MB (v69.8) **[fetched]**. Booking.com's own CityBook used Mapbox's _Static Images API_ alongside the SDKs — a hint that they reach for raster images where interactivity isn't needed **[title only]**.                                                                                                                                                                                                                                                        |

## 3. Google Maps "Explore" sheet, Material 3 sheets, Apple HIG sheets

### 3a. Google Maps (Android 2024-25, iOS 2025) — **[fetched, 9to5Google]**

- 2024-02-07: "locations are no longer fullscreen and reveal a sliver of the map background
  at the top"; sheets have "close and share buttons in the top-right corner"; the transport
  mode carousel "has been moved to the bottom. This is a nice reachability improvement on
  mobile".
- 2024-07-14 (Android 11.136): "more rounded corners"; close "with a new 'x' button in the
  top-right, or by swiping back from the left/right edge"; cost: "you're no longer able to
  swipe up on the search bar to just see the map".
- 2024-07-31: bottom bar "from five tabs to just three" — Explore, You, Contribute.
- 2025-01-21 (Android 25.04): Explore, You and Contribute all open as sheets; "When fully
  expanded, you still see a sliver of the map at the top of your display"; the sheet cannot
  be fully hidden except in Explore; when minimised "the Maps search bar appears up top";
  "The You tab can be made a half sheet, with the map visible in the background".
- 2025-03-07 (iPhone): the × "in the right corner of the sheet next to the share shortcut …
  should aid reachability and one-handed usage"; mode switcher "moved to the bottom for
  improved reach".
- 2025-04-24: minimised state = "the rounded corners of the sheet are docked with the bottom
  bar"; in that state "the map layer — including the search bar, filters, directions FAB,
  etc. — is fully visible and usable".
- Detents: three in practice (docked/peek, half, full). Google publishes no dp values; the
  two open-source clones of its behaviour use a mid "anchor" state — `STATE_ANCHOR_POINT`
  (miguelhincapie/CustomBottomSheetBehavior) and an anchor "at the default 16:9 ratio
  keyline" measured from the top, with `peekHeight` in px (reline/Google-Maps-BottomSheet)
  **[fetched]**. So: peek ≈ one header row, half ≈ the map keeps a 16:9 strip, full leaves a
  status-bar-height sliver.
- Pin tap: a place sheet slides up from the bottom with name/address and Directions / Save /
  Share actions; it can be swiped to half and full and dismissed with the × **[snippet +
  fetched]**.

### 3b. Material 3 — **[fetched: material-components-android BottomSheet.md; androidx

compose material3 source]** (m3.material.io itself is JS-rendered and returned no text)

- Standard sheets "co-exist with the screen's main UI region and allow for simultaneously
  viewing and interacting with both regions"; modal sheets "present a set of choices while
  blocking interaction with the rest of the screen" and "render a shadow on the content
  below". The M3 guideline example for a standard sheet is "location information over a
  map" **[snippet]**.
- `BottomSheetDragHandleView` "has a default min width and height of 48dp to conform to the
  minimum touch target requirement"; the visible handle is 32 × 4 dp
  (`DockedDragHandleWidth = 32.0.dp`, `DockedDragHandleHeight = 4.0.dp`) with 22 dp vertical
  padding.
- `behavior_peekHeight` default `auto`; `behavior_halfExpandedRatio` default 0.5 (only when
  `fitToContents=false`); states collapsed / half-expanded / expanded / hidden; corner
  `CornerExtraLargeTop` when docked, `CornerNone` when minimised; max width 640 dp.
- Compose defaults: `SheetPeekHeight = 56.dp`, `PositionalThreshold = 56.dp`,
  `VelocityThreshold = 125.dp`, `SheetMaxWidth = 640.dp`.
- Navigation bar `ContainerHeight = 64.0.dp` (tall variant 80 dp). FAB: `layout_margin=16dp`,
  `layout_gravity=bottom|end` in the MDC sample; FAB auto-hides "when covered by …
  BottomSheetBehavior".
- Drag-handle behaviour: "Selecting the drag handle should toggle through preset heights or
  close the sheet, while selecting the scrim should always close the bottom sheet" **[snippet]**.

### 3c. Apple HIG — **[fetched via the HIG JSON endpoints]**

- Sheets: "The system defines two detents: large is the height of a fully expanded sheet and
  medium is about half of the fully expanded height. Sheets can have one or more custom
  detent values." "Include a grabber in a resizable sheet … they can also tap it to cycle
  through the detents." "In an iPhone app, consider supporting the medium detent to allow
  progressive disclosure." Nonmodal sheets exist "in iOS and iPadOS … people use its
  functionality to affect the parent view without dismissing the sheet". "Support swiping to
  dismiss a sheet."
- WWDC21 "Customize and resize sheets in UIKit": "a medium detent, which is about half of a
  sheet's full height"; remove dimming with `smallestUndimmedDetentIdentifier` to get a
  Maps-like nonmodal sheet; `prefersScrollingExpandsWhenScrolledToEdge`;
  `prefersGrabberVisible` when "it might be less obvious that a sheet is resizable"
  **[fetched]**. SwiftUI `presentationDetents` since iOS 16.0; `.fraction`/`.height`/`.custom`
  are on the `PresentationDetent` page (not fetched).
- Maps: "The system presents the full callout style place card … as a sheet in iOS." "Keep
  the location on your map visible when displaying a place card … You can set an offset
  distance for your place card and point it to the selected location." "Cluster overlapping
  points of interest." "Make sure there's enough contrast between custom controls and the
  map … Consider using a thin stroke or light drop shadow." Padding for the Apple logo/legal
  link: 7 pt sides, 10 pt above/below; place them "10 points above the lowest resting
  position of the card".
- Accessibility: iOS default control size 44×44 pt, minimum 28×28 pt; "about 12 points of
  padding around elements that include a bezel … about 24 points … without a bezel";
  contrast 4.5:1 up to 17 pt, 3:1 at 18 pt or bold.
- Typography: iOS default 17 pt, minimum 11 pt; "avoid Ultralight, Thin, and Light font
  weights".
- Color: "Test your app's color scheme under a variety of lighting conditions. Colors can look
  different when you view your app outside on a sunny day … In bright surroundings, colors
  look darker and more muted."
- Tab bars: "A tab bar floats above content at the bottom of the screen" (iOS 26 Liquid
  Glass); it can "minimize the tab bar … when a person scrolls down". (The 49 pt UITabBar
  height is from third-party HIG summaries **[snippet]**, not the HIG text.)

## 4. Beach / sunbed booking products

Common shape first: **every** product below is _destination → list of beach clubs →
per-club umbrella/sunbed plan → date → pay_. Where a map exists it is (a) the per-club
plan, or (b) a secondary "map view" of clubs near you. None makes a map of the coast the
first screen.

| Product                                                                                                    | Real B2C?                                                                        | First screen                                                                                                      | Map of the coast?                                                                                                                                                                 | Per-beach plan?                                                                                                                                                                                       | Day pick                       | Notes                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spiagge.it** (IT, Zucchetti group; ex-YourBeach; Cocobuk merged in) **[fetched spiagge.it + App Store]** | Yes: "più di 2400 stabilimenti", app 47.6 MB, ≈ 250k iOS downloads **[snippet]** | Search box "Dove vuoi andare?" + a date (e.g. "20 set")                                                           | Not as primary; establishments are found by locality and filtered "in base ai servizi"                                                                                            | Yes — "Seleziona il posto direttamente in mappa"; the app "select[s] your preferred umbrella from the beach map and pay[s] directly with a credit card"; labels show "the distance between umbrellas" | Date in the search bar         | Also B2B "Spiagge PRO … Il gestionale numero 1 in Italia" — the same company runs the venue software. Food ordering to the umbrella.                                                           |
| **Ombrellone.it** (IT) **[snippet; site blocked]**                                                         | Yes                                                                              | List of establishments                                                                                            | Not evidenced                                                                                                                                                                     | Yes (direct booking) or a contact-form request to the manager                                                                                                                                         | Yes                            | Free cancellation "up to 23:59 the day before"; QR check-in; "ambassadors".                                                                                                                    |
| **Beacharound** (IT) **[snippet]**                                                                         | WebApp, "over 7,000 beach establishments"                                        | Search by area                                                                                                    | Not evidenced                                                                                                                                                                     | "choose your preferred spot on the beach if the establishment allows it"                                                                                                                              | Yes                            | Also books hotels and _free_ beaches.                                                                                                                                                          |
| **Cocobuk** (IT) **[snippet]**                                                                             | Merged into Spiagge.it                                                           | —                                                                                                                 | —                                                                                                                                                                                 | umbrellas, loungers, gazebos                                                                                                                                                                          | —                              | Reviews per club.                                                                                                                                                                              |
| **SunEasy** (AL — Albanian riviera) **[fetched App Store; snippets suneasy.app]**                          | Yes: v3.0.43, 86.1 MB, iOS 16+, App Store rating 5.0 from 3 ratings              | "Search and Select beaches" after account creation; "browse beaches near you, see real photos, live availability" | Not evidenced as first screen; destination pages exist per beach (Ksamil, Dhërmi, Saranda, Qerret, Durrës…) with price ranges (Ksamil 1000–1700 ALL/day; Dhërmi 800–4000 ALL/day) | Yes: "pick your sunbed or umbrella on the interactive beach map, choose your date, and confirm"                                                                                                       | Yes                            | "Sun path and sun-hours view" (What's New); food & drink ordering; no booking fee to the tourist; a separate SunEasy Business app. **This is the direct competitor and the closest analogue.** |
| **Plazz** (GR) **[fetched App Store]**                                                                     | Yes since 2016; v5.12.2, 46.3 MB, rating 2.8 (45)                                | "Find your favorite beach" with search + filters                                                                  | Yes, secondary: release notes cite "Improvements on the map view"                                                                                                                 | Yes: "beach map screen"/"venue map" — "Select your beach bed"                                                                                                                                         | "Select your time and arrival" | Steps: find beach → time/arrival → bed → pay.                                                                                                                                                  |
| **MySunbed** (EU beach clubs) **[fetched App Store]**                                                      | Yes; v1.2, 17.7 MB                                                               | Booking "with just a few taps"                                                                                    | "Geolocation of partner beaches"                                                                                                                                                  | not stated                                                                                                                                                                                            | Yes                            | Real-time availability, in-app payment.                                                                                                                                                        |
| **Find Sunbed / Vres Xaplostra** (GR) **[snippet]**                                                        | Yes                                                                              | by destination (Mykonos, Santorini, Zakynthos, Halkidiki)                                                         | not evidenced                                                                                                                                                                     | yes                                                                                                                                                                                                   | yes                            | —                                                                                                                                                                                              |
| **BeachDibs** (GR islands) **[snippet]**                                                                   | Yes                                                                              | list                                                                                                              | no                                                                                                                                                                                | beanbag sunbeds                                                                                                                                                                                       | yes                            | no penalty > 48 h before.                                                                                                                                                                      |
| **Lettini** (IT/GR/ES) **[snippet]**                                                                       | Launching                                                                        | destination                                                                                                       | not evidenced                                                                                                                                                                     | "choose your perfect sunbed location"                                                                                                                                                                 | "book for your desired date"   | —                                                                                                                                                                                              |
| **Sandbeds** (HR, e.g. Banje Beach Club Dubrovnik) **[snippet]**                                           | Request-based, not instant                                                       | club page                                                                                                         | no                                                                                                                                                                                | no — a form with date, people, type                                                                                                                                                                   | yes                            | Confirmation comes later from the club.                                                                                                                                                        |
| **Coral Beach Club Dubrovnik** (own site) **[snippet]**                                                    | Single venue                                                                     | date                                                                                                              | no                                                                                                                                                                                | "interactive map … clicking on red numbers"                                                                                                                                                           | yes                            | The single-venue pattern: numbered plan.                                                                                                                                                       |
| **Hoteligy / BookMySunbed / Tableo / Bookla** (B2B) **[snippet]**                                          | Venue software                                                                   | —                                                                                                                 | no                                                                                                                                                                                | Yes: "upload a photo and position sunbeds on a map", "drag-and-drop … umbrellas, pool areas, sun lounges"                                                                                             | yes                            | Confirms the industry's mental model: the "map" is a photo/plan of _one_ venue.                                                                                                                |
| **Tan-Tan Beach, Beachbooker, BeachBook, "Beach Loungers"**                                                | Not found by search — see § 9.                                                   |                                                                                                                   |                                                                                                                                                                                   |                                                                                                                                                                                                       |                                |                                                                                                                                                                                                |

Conclusion for § 4: the category convention is "pick the town, then the club, then the
bed". The coast-map-first idea has no precedent I could verify. Concept work (§ 5) and
SunEasy's _destination pages_ (a town → beaches → clubs hierarchy) both point the same way.

## 5. Concepts (Dribbble / Behance / Figma / 99designs) — all pages blocked; snippets only

- Dribbble "Beamer | Sunbed Booking Mobile App UI" (2023-03-04): exists; the fetch returned an
  empty page, so I cannot say whether it shows a map or a calendar.
- Dribbble tag "sunbed" (39 shots) includes "Book A Sunbeds / UI Design" (Ali Celebi); tag
  "beach-app" (100+). "Minimalistic Beach Map Designs" (Jeremy Basham) is a set of stylised
  _coast_ maps of Hilton Head — illustration, not UI.
- Figma Community "TUI (sun loungers)": "a luxury sun lounger reservation system that
  explores solving complex spatial mapping in a mobile TUI app … an interactive map view of
  the pool area and dynamic pricing based on zone/amenities" **[snippet]** — i.e. a per-venue
  plan with zone pricing, not a coast map.
- 99designs contest "Myspot interactive beach reservation app – revamp": brief says "browse
  nearby beaches with real photos, amenities, and live availability for sunbeds, umbrellas,
  and pick your exact spot on an interactive map" **[snippet]** — list of nearby beaches →
  per-beach plan.
- Behance: no specific "beach club app" or "sunbed booking" project surfaced; only generic
  booking/calendar UI kits.

## 6. Thumb reach, one-hand ergonomics, sunlight

**Hoober (2013, 1,333 street observations; UXmatters/A List Apart — both blocked, numbers
from snippets):** 49 % held the phone one-handed, 36 % cradled (one hand holds, the other
taps), 15 % two-handed; ≈ 75 % of interactions thumb-driven; only 67 % of one-handed grips
used the right hand. Reach is "a curved arc — not a rectangle"; primary actions "belong in
the bottom 40 % of the screen".

**Hoober (2017 "Design for Fingers, Touch, and People", UXmatters Parts 1–3 — blocked;
snippets):** touch accuracy "varies from 7 mm at the center of the screen to 12 mm at the
corners"; to avoid rage taps targets need "11 mm on the top of the screen, 12 mm at the
bottom of the screen, and as low as 7 mm in the center"; "the bottom of the screen was hard
to tap accurately"; list rows along the edges "at least 9 or 10 mm in height"; "10 mm is
better than 7 mm, and 4 mm is sort of a disaster"; "people look at the center of the screen
and prefer to center key actions".

**Translate to a 390 × 844 pt iPhone (≈ 6.1″, 0.156 mm/pt):**

- 7 mm ≈ 45 pt (centre), 11 mm ≈ 70 pt (top), 12 mm ≈ 77 pt (bottom). Apple's 44 pt default
  is therefore adequate only in the centre band; edge controls want ≈ 60–70 pt.
- Bottom 40 % = y ≥ 506 pt. Subtract the system tab bar (49 pt) + home indicator inset
  (34 pt) = 83 pt, and the comfortable _free_ band for our own controls is roughly
  y 506–761 pt: ≈ 255 pt tall, about 5 rows of 48 pt.
- Smashing's thumb-zone map (Hoober-derived) **[snippet]**: natural zone = bottom-centre and
  the side of the holding thumb; stretch = middle; hard = the top and the opposite top corner.
- Platform floors: Apple 44×44 pt default / 28 pt minimum, 12–24 pt padding **[fetched]**;
  Material 48 dp touch target (drag handle rule) **[fetched]**; WCAG 2.2 target size 24×24 CSS
  px minimum, 44×44 enhanced **[snippet; w3.org blocked]**.

**Sunlight / glare:**

- A "standard 200 nit LCD measured in a dark room has a contrast of 300:1, but will have
  less than 2:1 under strong direct sunlight" because glare adds > 200 nits to both black
  and white; the industrial "sunlight readable" threshold is ≥ 5:1 effective contrast, 10:1
  "well readable" **[snippet, display vendors]**. Sunlight-readable devices are specified at
  ≥ 10,000 lux **[snippet]**.
- Dobres et al. 2017 (Applied Ergonomics, "glance-like reading"): legibility is better under
  bright ambient light; positive polarity (dark text on light) wins, and the disadvantage of
  light-on-dark grows as text gets smaller **[snippet]**. A related study: users prefer
  negative polarity below ≈ 1,500 lux and positive polarity above it **[snippet]**. Ambient
  light is treated as a "situational impairment" in recent HCI work; the suggested
  interventions are content contrast first, then weight/size **[snippet]**.
- Apple HIG Color: "In bright surroundings, colors look darker and more muted"; test
  "outside on a sunny day" **[fetched]**. HIG Typography: avoid Light/Thin weights
  **[fetched]**. HIG contrast table 4.5:1 / 3:1 **[fetched]**; WCAG AAA "enhanced" is 7:1
  **[snippet]**.

## 7. 4G page-weight realities

**General baselines — Web Almanac source markdown [fetched from the HTTPArchive GitHub]:**

- 2025: median mobile home page 2,164 KB; JS 646 KB; images 911 KB (inner pages 354 KB);
  fonts 122 KB; p90 total 8,337 KB. "98.1 % of all pages make at least one request for a
  JavaScript file."
- 2024: median mobile 2,311 KB; JS 558 KB; images 900 KB; fonts 111 KB; p90 7,680 KB; the
  median mobile page grew 357 % (+1.8 MB) over 2014-24.
- Rule of thumb: on a real-world 4G link of ≈ 5–10 Mbit/s (the kind you get on a beach, not
  the lab figure), 1 MB ≈ 1–2 s of pure transfer before any latency; so the difference
  between a 150 KB and a 1.5 MB first view is the difference between "instant" and "did it
  break?" for someone in the sun. (The arithmetic is mine; the bandwidth assumption is
  stated, not sourced.)

**Airbnb / Booking.com mobile web weight:** not measurable here (WebPageTest, SpeedCurve,
DebugBear all blocked). Native app sizes: Airbnb 357 MB, Booking.com 484.4 MB, SunEasy
86.1 MB, Spiagge.it 47.6 MB, Plazz 46.3 MB, MySunbed 17.7 MB **[fetched App Store]** — they
pay the map's cost once at install; a web page pays it on every cold visit.

**What a MapLibre/Mapbox GL vector map costs on first load:**

- Library: maplibre-gl.js ≈ 196 kB + 8.87 kB CSS in MapLibre's own bundle-size report
  (PR #143, v1-era; the unit shown is the report's, most likely gzip) **[fetched]**; Leaflet
  "40 KB vs 220 KB" gzipped vs Mapbox GL (issue #59) **[fetched]**; react-map-gl's docs say
  the core is "~750 kB (gzipped) but only ~210 kB if you import just Map and
  NavigationControl" **[snippet — the 750 figure looks like _minified_, not gzipped; treat
  as unverified]**. MapLibre tracks size regressions with a 256-byte gzip quota per PR, i.e.
  the bundle is treated as large and closely watched **[fetched, test/build/min.test.ts]**.
- Style JSON: tens of KB (not measured). Sprite: one PNG + JSON (not measured).
- Glyphs: "if a client needs glyph number 78, it will download range 0-255.pbf which has
  maybe a size of 100 kB or so" — per font stack, per 256-codepoint range **[fetched,
  wipfli/about-text-rendering-in-maplibre]**. Latin labels typically need 1–2 ranges per
  font; each bold/regular pair doubles it.
- Tiles: Mapbox's guidance is "an average tile size of 50KB and a maximum tile size of 500KB"
  **[fetched, vt-optimizer README]**; "A full-screen map needs to download about 30 tiles,
  and at an average of 50KB per tile, this means almost 1.5MB worth of data to see the
  initial view" **[snippet, CycleMap blog]**; real-world z11 tiles averaged 88 KB, max 290 KB
  **[snippet]**. A single z14 tile compared PBF 35,206 bytes vs PNG 16,725 bytes — vector is
  _not_ automatically smaller per tile **[fetched, mapbox/vector-tile-spec #53]**.
- Rendering: WebGL required; GPU + shader compile on a hot phone in the sun is a further,
  unmeasured cost.
- **Total first view, honest estimate:** ≈ 200 KB library + ≈ 20–50 KB style/sprite +
  100–200 KB glyphs + 0.5–1.5 MB tiles ≈ **0.8–2 MB** and ≈ 35–40 requests before the map is
  readable, versus **one request** for a static raster.

**Static raster alternative:** Mapbox: "static maps load faster and consume fewer client and
network resources compared to loading an interactive map"; static images go up to
1280×1280 px and load in "100–425 ms" **[snippet; docs blocked]**. File size of a
390×600 @2x PNG/WebP coast image was not sourced — see § 9 — but it is one file, cacheable,
and can be pre-rendered per town at build time.

---

## 8. What fits a tourist on the riviera — and what does not — and why

Situation: one hand, sunglare, 4G, a tab bar already at the bottom, and the job is
"pick a venue on this coast for _one_ day, then a set". Opinionated verdicts:

**Fits — take these.**

1. **List-first, map-on-demand (Airbnb, Booking.com, every sunbed product).** The first
   paint should be the list of venues for the currently selected town/stretch and day, not a
   map. Airbnb's own 2023 release is proof that even an 80 %-usage map is best entered
   _after_ a query. The day and the stretch are the query.
2. **Day before venue.** Spiagge.it puts the date in the search bar; SunEasy and Plazz pick
   the date before the bed. Invariant #4 (sales close per day) makes this mandatory anyway:
   the list must be for a _day_ so "sold out"/"closed" states are truthful. Default = today
   (the tourist is standing on the beach), next chip = tomorrow.
3. **A coast _strip_, not a free map.** The riviera is effectively one-dimensional
   (Vlorë → Dhërmi → Himarë → Qeparo → Borsh → Lukovë → Sarandë → Ksamil). A horizontally
   scrollable, pre-rendered strip with venue pins — a static image per town, ≈ one request —
   gives 90 % of the "where is it" value of a MapLibre map at ≈ 5 % of the bytes and no WebGL.
   This is the SunEasy destination-page hierarchy (town → beaches → clubs) turned into one
   scrollable band.
4. **Sheet grammar from Google Maps / HIG / M3.** If a real map is shown at all, show it under
   a nonmodal sheet with three resting points: peek (56 dp / one header row), half (≈ 0.5,
   the map keeps a 16:9 strip), full (leave a sliver of map at the top). Grabber 32×4 dp in a
   48 dp target; × in the sheet's top-right _of the sheet_ (which, at half height, is
   mid-screen — reachable), swipe to dismiss. Tapping a pin never navigates: it swaps the
   card in the sheet (HIG: "keep the location on your map visible when displaying a place
   card").
5. **Pin tap = card in the bottom band, with the price on the pin.** Airbnb's price-pill pins
   and bottom card carousel are the right pattern for a venue: pin shows "€18", card shows
   photo, name, distance, "Sold out for Sat", one CTA. Cluster when zoomed out (HIG).
6. **All primary controls in y ≥ 506 pt but above the tab bar.** That band (≈ 255 pt) holds:
   the day chips row, the "Map/List" toggle pill (bottom-centre, over the content, above the
   tab bar — where Google Maps docks its sheet and where Airbnb's pill lives), and the
   venue card. Nothing the tourist must tap lives in the top third.
7. **Sun rules.** Dark text on light surfaces (positive polarity wins above ≈ 1,500 lux);
   body ≥ 17 pt, nothing below 13 pt on the coast strip, no Light/Thin weights; controls
   over the map get a stroke or shadow (HIG); pins ≥ 44 pt tall with ≥ 12 pt gaps and, near
   the bottom edge, 60–70 pt because accuracy there is 12 mm; never colour-only state
   (sold-out = strikethrough + label, not just grey).
8. **Budget.** First view of the venue list + coast strip ≤ 300 KB transfer, ≤ 10 requests;
   the interactive map is a lazy chunk that loads only on the "Map" tap and shows a
   skeleton, and it must be _skippable_ — the strip alone must let you book.

**Does not fit — do not copy.**

1. **Map-first (Google Maps).** Maps' first screen is a map because its job is wayfinding
   to an unknown place; ours is choosing among ≈ 10–40 venues on a known coast. The GIS&T
   analysis of Booking.com says exactly this: constrain first, then map.
2. **Free-pan "search as I move" with hundreds of pins (Airbnb web).** Airbnb itself found
   too many pins hurt and cut to the top ≈ 30–50; on a coast there are not hundreds of
   venues per view, and re-querying on every pan costs data and battery. Pan the strip,
   not the world.
3. **A full vector basemap for the coast (MapLibre/Mapbox GL).** ≈ 1–2 MB and WebGL for a
   view that is 80 % sea. Keep a real map only inside the venue sheet ("how do I get there")
   and even there prefer a static tile image with a "Open in Maps" deep link.
4. **Map entry at the top of results (Booking.com).** Baymard's testers struggled to find it;
   Hoober's data says it is the worst place for a one-handed thumb. Bottom-centre pill.
5. **Two-handed gestures.** Pinch-zoom on a coast map is a two-hand action; the strip
   scrolls with one thumb. Zoom, if any, is a tap on a town chip.
6. **Modal sheets that hide the day/venue context.** Every sheet must be nonmodal with the
   map/list still touchable, and the day chip must remain visible in every state so the
   tourist never books the wrong day (invariant #4 again).
7. **Per-venue "photo plan" as the _coast_ map (Spiagge.it, BookMySunbed).** That artefact is
   the right thing for the set-picking step _inside_ a venue; it is not a discovery surface.

## 9. Claims I could not verify

- Airbnb iOS/Android: the exact position and look of the floating "Map"/"List" pill
  (bottom-centre, above the tab bar), whether the 2024-25 iOS app shows a map "peeking"
  above the list (split view), the bottom-card carousel on pin tap, and the "top 30–50 pins"
  numbers. Mobbin flows returned 403; Airbnb Tech Blog (Medium), arXiv and the Pratt
  critique were blocked. The 2023 release text confirms only "faster performance,
  persistent pins … more results".
- Booking.com app: where the map button sits in the app (as opposed to the web), the
  bottom property card on marker tap, and any "search this area" control. Only web-oriented
  third-party guides and Baymard's web study were available, as snippets.
- Google Maps: exact peek height and half-height ratios; what the Explore sheet shows at
  peek (search bar + category chips is my recollection, not sourced); the "Latest in the
  area" feed.
- Apple HIG "Layout": the 44 pt rule was found in the Accessibility page, not Layout; the
  49 pt tab-bar height is from third-party summaries.
- Material 3 guideline prose (m3.material.io) could not be read; all M3 numbers come from
  the Android MDC docs and the androidx Compose source, which implement the spec. The
  56 dp FAB token file returned 404 (the 56 dp FAB is common knowledge but unsourced here).
- Beach products: whether Spiagge.it/SunEasy/Plazz show a map of _clubs_ as a first screen
  (App Store copy says "search"; release notes mention a "map view"). Beacharound, Cocobuk,
  Ombrellone.it, Find Sunbed, BeachDibs, Lettini, Sandbeds, Hoteligy, Tableo, Coral Beach
  Club: sites blocked; all facts are store/snippet level. "Tan-Tan Beach", "Beachbooker",
  "BeachBook", "Beach Loungers": no product found by search.
- Dribbble/Behance/Figma shots: could not view any image; descriptions are from search
  snippets only.
- Hoober: all primary articles blocked; the 49/36/15 %, 1,333, 7/11/12 mm, "bottom 40 %"
  figures are consistent across many secondary snippets but not read at source.
- Glare studies: the Dobres 2017 lux levels (one snippet says 70 lux vs 273 lux, which is a
  dim-vs-office range, not sunlight) — the "≥ 1,500 lux switch to positive polarity" comes
  from a different study's snippet. The 200-nit/"< 2:1 in sun" figure is from a display
  vendor, not a peer-reviewed source.
- Page weight of airbnb.com / booking.com mobile web: not measured. MapLibre's current
  gzipped size: the PR #143 figure is old (v1); the "~210 kB tree-shaken / ~750 kB" quote is
  a snippet. Static-map file size for a 390×600 @2x image: not sourced (my working estimate
  is 60–200 KB WebP/PNG; verify by rendering one).
- WCAG target-size and contrast pages (w3.org) were blocked; thresholds quoted from HIG and
  snippets.

## 10. Every source URL used (fetched or snippet)

Airbnb

- https://news.airbnb.com/2023-summer-release/
- https://news.airbnb.com/product-releases/airbnb-2023-summer-release/
- https://news.airbnb.com/wp-content/uploads/sites/4/2023/05/Airbnb-2023-Summer-Release-Media-Guide.pdf
- https://news.airbnb.com/airbnb-2024-winter-release
- https://news.airbnb.com/airbnb-2025-summer-release
- https://news.airbnb.com/2022-winter-release/
- https://www.airbnb.com/help/article/252
- https://www.airbnb.com/help/article/39
- https://apps.apple.com/us/app/airbnb/id401626263
- https://medium.com/airbnb-engineering/improving-search-ranking-for-maps-13b03f2c2cca (blocked; snippet)
- https://arxiv.org/html/2407.00091v1 (blocked; snippet)
- https://techscoop.substack.com/p/how-airbnb-made-map-search-smarter (blocked; snippet)
- https://mobbin.com/explore/flows/f4811f92-e5e8-4cda-9bff-18d817b5f64a (403)
- https://mobbin.com/explore/flows/1078069c-dffe-4aa0-9972-2e98ac4de94d (403)
- https://mobbin.com/explore/flows/dcb76285-6d4d-449b-a2a9-b73492ba1c92 (title only)
- https://www.banani.co/references/apps/airbnb (blocked; snippet)
- https://60fps.design/apps/airbnb (blocked; snippet)
- https://ixd.prattsi.org/2023/09/design-critique-airbnb-ios-app-2/ (blocked)
- https://www.hostaway.com/blog/airbnb-2023-summer-release/ (snippet)
- https://www.rentalscaleup.com/airbnb-2023-summer-release/ (snippet)

Booking.com

- https://apps.apple.com/us/app/booking-com-hotels-travel/id367003839
- https://play.google.com/store/apps/details?id=com.booking&hl=en_US (truncated)
- https://mobbin.com/explore/screens/1029ac77-5899-4f71-8bdb-bc441a16fbe6 (403)
- https://www.researchgate.net/figure/Walkthrough-of-the-Bookingcom-Mobile-Map-Design-Compared-to-general-purpose-searching_fig3_325559306 (snippet)
- https://www.researchgate.net/publication/325559306_Mobile_Maps_and_Responsive_Design (snippet)
- https://gistbok.ucgis.org/bok-topics/mobile-maps-and-responsive-design (blocked)
- https://baymard.com/blog/accommodations-split-view (blocked; snippet)
- https://www.mapbox.com/showcase/booking-com (blocked; title)
- https://upgradedpoints.com/travel/booking-com/ (blocked; snippet)
- https://overhere.eu/blog/ultimate-guide-to-making-reservations-at-booking-com/ (blocked; snippet)
- https://www.hardreset.info/devices/apps/apps-bookingcom/show-hotel-on-map/ (blocked)
- https://pageflows.com/ios/flows/booking-com/ (blocked)

Google Maps, Material 3, Apple HIG

- https://9to5google.com/2024/02/07/google-maps-directions-search-redesign/
- https://9to5google.com/2024/05/16/new-google-maps-bottom-bar/
- https://9to5google.com/2024/07/14/google-maps-android-redesign/
- https://9to5google.com/2024/07/31/google-maps-bottom-bar-redesign-rolling-out/
- https://9to5google.com/2025/01/21/google-maps-redesign-sheets/
- https://9to5google.com/2025/03/07/google-maps-iphone-sheet-redesign/
- https://9to5google.com/2025/04/24/google-maps-sheet-redesign-android/
- https://github.com/reline/Google-Maps-BottomSheet
- https://github.com/miguelhincapie/CustomBottomSheetBehavior
- https://m3.material.io/components/bottom-sheets/guidelines (JS-only; snippet)
- https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomSheet.md
- https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/FloatingActionButton.md
- https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SheetDefaults.kt
- https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SheetBottomTokens.kt
- https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt
- https://developer.apple.com/design/human-interface-guidelines/sheets (JSON: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/sheets.json)
- https://developer.apple.com/design/human-interface-guidelines/maps (JSON: …/maps.json)
- https://developer.apple.com/design/human-interface-guidelines/accessibility (JSON: …/accessibility.json)
- https://developer.apple.com/design/human-interface-guidelines/typography (JSON: …/typography.json)
- https://developer.apple.com/design/human-interface-guidelines/color (JSON: …/color.json)
- https://developer.apple.com/design/human-interface-guidelines/tab-bars (JSON: …/tab-bars.json)
- https://developer.apple.com/design/human-interface-guidelines/layout (JSON: …/layout.json)
- https://developer.apple.com/videos/play/wwdc2021/10063/
- https://developer.apple.com/documentation/swiftui/view/presentationdetents(_:)
- https://expo.dev/blog/how-to-create-apple-maps-style-liquid-glass-sheets (snippet)

Beach / sunbed products

- https://www.spiagge.it/
- https://apps.apple.com/it/app/spiagge-it-booking-spiaggia/id1269882377
- https://play.google.com/store/apps/details?id=com.anm22.yourbeach&hl=en_US (truncated)
- https://www.visitrimini.com/news/spiagge-it-con-lapp-e-piu-facile-prenotare-lombrellone/ (blocked; snippet)
- https://www.aranzulla.it/app-per-prenotare-ombrelloni-in-spiaggia-1475826.html (blocked; snippet)
- https://www.smartworld.it/guide/app-prenotare-ombrelloni-spiaggia.html (blocked; snippet)
- https://www.ombrellone.it/ (blocked; snippet)
- https://cocobuk.com/ (blocked; snippet) · https://play.google.com/store/apps/details?id=it.cocoapp.booking&hl=en_US (snippet)
- https://www.beacharound.com/ (blocked; snippet) · https://tech.fanpage.it/beacharound-lapp-per-prenotare-il-posto-in-spiaggia-anche-libera/ (blocked)
- https://apps.apple.com/us/app/suneasy/id6503435669
- https://suneasy.app/en · https://suneasy.app/en/client (blocked; snippets)
- https://web.suneasy.app/en/destination/ksamil-beach · …/dhermi-beach · …/saranda-beach · …/qerret-beach · …/ksamil-beach/prices (blocked; snippets)
- https://square.al/blog/suneasy-app (blocked; snippet)
- https://apps.apple.com/gr/app/plazz-reserve-your-beach-bed/id992163240
- https://plazz.com/en-US (blocked; snippet)
- https://apps.apple.com/us/app/mysunbed/id6747127352 · https://mysunbed.com/en/ (snippet)
- https://findsunbed.gr/ (blocked; snippet)
- https://www.beachdibs.com/ (blocked; snippet)
- https://lettini.app/ (blocked; snippet)
- https://sandbeds.com/en/beach_club/banje-beach-club/ (blocked; snippet)
- https://coral-beach-club.com/product/sunbeds-booking/ (blocked; snippet)
- https://hoteligy.com/en/modules/sunbed-booking/ · https://www.bookmysunbed.com/ · https://tableo.com/solutions/beach-club-software/ · https://bookla.com/en/business/beach-clubs-online-booking-system (blocked; snippets)
- https://news.gtp.gr/2017/01/30/going-greek-beach-book-sunbed-online/ · https://greekcitytimes.com/2024/01/31/cool-new-app-allows-you-to-book-sunbeds-at-beaches-around-greece-2/ (blocked; snippets)

Concepts

- https://dribbble.com/shots/20825515-Beamer-Sunbed-Booking-Mobile-App-UI (empty page)
- https://dribbble.com/tags/sunbed · https://dribbble.com/tags/beach-app · https://dribbble.com/shots/20750098-Minimalistic-Beach-Map-Designs (snippets)
- https://www.figma.com/community/file/1619365223378136582/tui-sun-loungers (blocked; snippet)
- https://en.99designs.pt/mobile-app-design/contests/myspot-interactive-beach-reservation-app-revamp-1341262 (blocked; snippet)
- https://www.behance.net/search/projects/booking%20app (snippet)

Ergonomics and sunlight

- https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php (blocked; snippet)
- https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php · …/2017/07/design-for-fingers-touch-and-people-part-3.php (blocked; snippets)
- https://alistapart.com/article/how-we-hold-our-gadgets/ (blocked)
- https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/ (blocked; snippet)
- https://www.4ourthmobile.com/publications/designing-for-touch (blocked)
- https://interactions.acm.org/archive/view/may-june-2015/fingers-thumbs-and-people (blocked)
- https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/ (snippet)
- https://pubmed.ncbi.nlm.nih.gov/28166901/ · https://www.sciencedirect.com/science/article/abs/pii/S0003687016302459 (blocked; snippets — Dobres et al. 2017)
- https://link.springer.com/chapter/10.1007/978-3-032-00815-2_27 · https://www.mdpi.com/1424-8220/24/11/3516 (snippets)
- https://dl.acm.org/doi/10.1145/3764687.3769905 (blocked; snippet)
- https://www.tdcommons.org/cgi/viewcontent.cgi?article=9697&context=dpubs_series (blocked; snippet)
- https://www.displaymodule.com/blogs/knowledge/sunlight-readable-tft-displays-nits-brightness-contrast-anti-glare · https://riverdi.com/blog/sunlight-readable-displays-the-most-important-parameters-of-outdoor-lcd-displays-you-need-to-know (snippets)
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html · https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (blocked)

Page weight and maps cost

- https://raw.githubusercontent.com/HTTPArchive/almanac.httparchive.org/main/src/content/en/2025/page-weight.md
- https://raw.githubusercontent.com/HTTPArchive/almanac.httparchive.org/main/src/content/en/2024/page-weight.md
- https://almanac.httparchive.org/en/2025/page-weight (blocked; same content)
- https://github.com/maplibre/maplibre-gl-js/pull/143
- https://github.com/maplibre/maplibre-gl-js/issues/59
- https://github.com/maplibre/maplibre-gl-js/issues/7255
- https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/test/build/min.test.ts
- https://visgl.github.io/react-map-gl/docs/whats-new (blocked; snippet)
- https://github.com/wipfli/about-text-rendering-in-maplibre
- https://github.com/ibesora/vt-optimizer
- https://github.com/mapbox/vector-tile-spec/issues/53
- https://blog.cyclemap.link/2020-02-02-optimizing-vectortiles/ (blocked; snippet)
- https://www.mdpi.com/2220-9964/9/2/101 (blocked)
- https://docs.mapbox.com/api/maps/static-images/ · https://docs.mapbox.com/help/dive-deeper/static-maps/ (blocked; snippets)
- https://github.com/sabman/versatiles-documentation/blob/main/basics/frontend.md
