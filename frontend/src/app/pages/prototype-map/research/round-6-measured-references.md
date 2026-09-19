# Reference mobile layouts: "browse places along a coast, then pick one on a map"

Measured 2026-09-19 with Playwright (playwright-core 1.62.1, bundled Chromium 1194) through the session's agent proxy.
Emulation: 390×844 CSS px, DPR 3, iPhone 17.5 Safari UA, `isMobile`, `hasTouch`, locale en-GB. All coordinates below are **CSS px** (screenshots are 1170×2532 device px; divide by 3).
Scripts, per-page cost JSON (`*-cost.json`, includes every response), geometry JSON (`*-geometry.json`), text dumps and screenshots are all in this folder.

Byte counts are **response-body bytes as received by the browser** (`response.body().length`; falls back to `content-length`), so cached/304 and streamed bodies may be under-counted. "Before load" = responses that arrived before the `load` event; "after load" = responses during the following 8 s idle window.

## Summary

| Target                          | Reachable?                                                                                                                                                                                                                | What was measured                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Airbnb mobile web (Himarë)      | **Yes** (200)                                                                                                                                                                                                             | list/sheet screen, expanded list, Map pill, map screen, pin tap → card. Prices render in USD for this proxy's egress location. |
| Booking.com search results      | **No** — 403 "detected as a robot" (1.1 KB body)                                                                                                                                                                          | only the block page                                                                                                            |
| spiagge.it                      | **Partly** — home page 200; every results / city / venue page renders the SPA error "Oops, qualcosa è andato storto" because the proxy rejects its data backend `spiaggefrontend-production.up.railway.app` (CONNECT 403) | home page, destination picker; results URL shape; product evidence from copy                                                   |
| App Store page (Spiagge.it app) | **Partly** — iOS UA is redirected to `itms-appss://` (ERR_ABORTED); Mac/Android UA get 200; **all `is1-ssl.mzstatic.com` images blocked by the proxy** (CONNECT 403 → ERR_TUNNEL_CONNECTION_FAILED)                       | description text, metadata; screenshots NOT obtainable (0 downloaded)                                                          |
| Mobbin                          | **Partly** — home and `/explore/...` pages are public (200, images from `bytescale.mobbin.com`); `/search/apps?q=…` redirects to the login wall; no Airbnb app/flow page reachable unauthenticated                        | public explore/flow pages                                                                                                      |
| Google Maps                     | **No** — `www.google.com` CONNECT rejected by proxy (ERR_TUNNEL_CONNECTION_FAILED, status 000)                                                                                                                            | —                                                                                                                              |

Proxy denial log (`/__agentproxy/status`) during this run: `is1-ssl.mzstatic.com`, `www.google.com`, `www.googletagmanager.com`, `maps.gstatic.com`, `spiaggefrontend-production.up.railway.app`, `cdn.iubenda.com`, `cs.iubenda.com`, `dev.visualwebsiteoptimizer.com`, `*.ingest.us.sentry.io`, plus ad/analytics hosts. Note `maps.googleapis.com` and `mapsresources-pa.googleapis.com` are **allowed** (Airbnb's Google map loaded); `maps.gstatic.com` is not.

---

## 1. Airbnb mobile web — `https://www.airbnb.com/s/Himare--Albania/homes`

Reachability: 200 on both URLs (without and with `?checkin=2026-09-26&checkout=2026-09-27&adults=2`). No bot challenge. A one-time "Now you'll see one price for your trip, all fees included — Got it" modal covers the first paint (`airbnb-list-firstpaint.png`); it was dismissed before measuring. A second interstitial, "Find it faster in the app / Use the app" (a bottom sheet ≈ y 685–844), appears after the first map interaction on some runs (`airbnb-map.png`).

### 1a. First screen = map + bottom sheet (not a list) — `airbnb-list.png`, `airbnb-list-dates.png`

What is on screen, top to bottom (CSS px):

| element                                                          | measured                                                                                                                                       | note                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| fixed top bar                                                    | 0,0 390×134 (`position:fixed`)                                                                                                                 | contains search pill + filter icon + chips row                                                                          |
| search pill "Homes in Himare / Any week • Add guests"            | ≈ x 76–313, y 13–68 (≈ 237×55)                                                                                                                 | read from screenshot; the text node had a 0×0 box                                                                       |
| filter icon button ("Show filters")                              | 326,21 40×40                                                                                                                                   | right of pill                                                                                                           |
| filter chips row (Washer, Free parking, Allows pets, Hot tub, …) | y 90, h 34; chips 68/95/90/69 wide, 9 px apart, starts x 16                                                                                    | horizontally scrollable pills                                                                                           |
| map (`.gm-style`, Google Maps JS)                                | **0,0 390×844 — full viewport, under everything**                                                                                              | the visible map band is from the bottom of the top bar (y 134) to the sheet top (≈ y 441): **≈ 307 px tall × 390 wide** |
| price pins                                                       | text 31–41 × 18; pill ≈ 57×27 for "$1,061"                                                                                                     | white rounded pill, black text; selected pin inverts to black                                                           |
| bottom sheet                                                     | top edge ≈ y 441 (drag handle ≈ y 449); header "Over 1,000 homes" text at y 461, h 19; "Descriptions are based on details hosts provide" below | sheet is white, rounded top corners, sits over the map                                                                  |
| first card in sheet                                              | 24,515 342×380 (photo 291×291 at y 488 in the DOM measure; visually a 358-wide rounded photo carousel with heart icon, 5 dots)                 | only the photo of the first card is visible above the tab bar at rest                                                   |
| bottom tab bar (Explore / Wishlists / Log in)                    | items at y 790, 76×44 each; bar ≈ y 776–844 (≈ 68 px, 0 px gap)                                                                                | present only in the collapsed-sheet state                                                                               |

With dates (`airbnb-list-dates.png`): identical layout; pill subtitle becomes "Sep 26 – 27 • 2 guests"; chips change (Free parking, Hot tub, Self check-in, 1+ bathrooms); pins show per-stay prices ($38–$105).

Note: the geometry heuristic's "map canvas 291×291" row is a Google Maps tile canvas that moves as the map pans — not the map container. The map container is `.gm-style` at 390×844.

Viewport 390×844 CSS px. "gap" = distance from element bottom to viewport bottom.

| element                            | tag    | x   | y   | w   | h   | gap  | position | text                                          |
| ---------------------------------- | ------ | --- | --- | --- | --- | ---- | -------- | --------------------------------------------- |
| fixed/sticky top element           | div    | 0   | 0   | 390 | 134 | 710  | fixed    | Homes in Himare Any week • Add guests Current |
| map canvas                         | canvas | 62  | 197 | 291 | 291 | 356  | absolute |                                               |
| map library root                   | div    | 0   | 0   | 390 | 844 | 0    | absolute | Home in Himarë, $1,061 $1,061 Home in Himarë, |
| map container (parent of lib root) | div    | 0   | 0   | 390 | 844 | 0    | absolute | Home in Himarë, $1,061 $1,061 Home in Himarë, |
| map [data-testid]                  | div    | 0   | 0   | 390 | 844 | 0    | relative | Google map Showing 20 stays. Home in Himarë,  |
| filter: Show filters               | button | 326 | 21  | 40  | 40  | 783  | relative | Show filters                                  |
| toggle: Show map                   | button | 152 | 737 | 86  | 38  | 69   | static   | Show map                                      |
| first card                         | div    | 24  | 515 | 342 | 380 | -50  | static   | Photo 1 of 23 Home in Himarë Sea-view balcony |
| first image                        | img    | 62  | 488 | 291 | 291 | 65   | static   |                                               |
| fixed-bottom/2                     | div    | 353 | 488 | 291 | 291 | 65   | absolute |                                               |
| fixed-bottom/3                     | div    | 353 | 779 | 291 | 291 | -226 | absolute |                                               |
| fixed-bottom/4                     | div    | 62  | 779 | 291 | 291 | -226 | absolute |                                               |

| metric                                         | value           |
| ---------------------------------------------- | --------------- |
| requests (responses recorded)                  | 195             |
| failed requests (no response)                  | 30              |
| total bytes (response bodies)                  | 14831.9 KB      |
| bytes before `load` (load at t=3289 ms)        | 6581.6 KB       |
| bytes after `load` until idle end (t=11291 ms) | 8250.3 KB       |
| statuses                                       | 200×174, 204×21 |

| host (top 10)                   | bytes      |
| ------------------------------- | ---------- |
| a0.muscache.com                 | 10202.8 KB |
| www.airbnb.com                  | 2397.0 KB  |
| maps.googleapis.com             | 1916.1 KB  |
| d0a7e.airbnb.com                | 115.6 KB   |
| fonts.googleapis.com            | 82.1 KB    |
| mapsresources-pa.googleapis.com | 73.0 KB    |
| fonts.gstatic.com               | 36.6 KB    |
| (data:/blob:)                   | 8.7 KB     |

| type       | bytes      | count |
| ---------- | ---------- | ----- |
| script     | 11497.5 KB | 125   |
| stylesheet | 1689.4 KB  | 3     |
| document   | 762.3 KB   | 2     |
| fetch      | 396.1 KB   | 17    |
| image      | 258.6 KB   | 18    |
| font       | 102.9 KB   | 2     |
| other      | 89.4 KB    | 4     |
| xhr        | 35.8 KB    | 24    |

Blocked / failed hosts (count): www.google.com ×10; www.googletagmanager.com ×1; ad.doubleclick.net ×3; tr.snapchat.com ×1; ct.pinterest.com ×1; js.adsrvr.org ×1; www.facebook.com ×2; d34r8q7sht0t9k.cloudfront.net ×1; www.googleadservices.com ×4; googleads.g.doubleclick.net ×2; maps.gstatic.com ×4

Dates variant (separate load):

| metric                                         | value           |
| ---------------------------------------------- | --------------- |
| requests (responses recorded)                  | 207             |
| failed requests (no response)                  | 42              |
| total bytes (response bodies)                  | 14960.0 KB      |
| bytes before `load` (load at t=2201 ms)        | 7021.4 KB       |
| bytes after `load` until idle end (t=10202 ms) | 7938.6 KB       |
| statuses                                       | 200×185, 204×22 |

| host (top 10)                   | bytes      |
| ------------------------------- | ---------- |
| a0.muscache.com                 | 10550.7 KB |
| www.airbnb.com                  | 2108.5 KB  |
| maps.googleapis.com             | 1953.7 KB  |
| d0a7e.airbnb.com                | 115.6 KB   |
| mapsresources-pa.googleapis.com | 104.1 KB   |
| fonts.googleapis.com            | 82.1 KB    |
| fonts.gstatic.com               | 36.6 KB    |
| (data:/blob:)                   | 8.7 KB     |

| type       | bytes      | count |
| ---------- | ---------- | ----- |
| script     | 11986.2 KB | 127   |
| stylesheet | 1689.4 KB  | 3     |
| document   | 787.5 KB   | 2     |
| image      | 165.8 KB   | 28    |
| font       | 102.9 KB   | 2     |
| other      | 89.4 KB    | 4     |
| xhr        | 77.6 KB    | 26    |
| fetch      | 61.1 KB    | 15    |

Blocked / failed hosts (count): www.airbnb.com ×10; a0.muscache.com ×3; www.google.com ×5; ad.doubleclick.net ×3; ct.pinterest.com ×1; www.facebook.com ×2; tr.snapchat.com ×1; js.adsrvr.org ×1; d34r8q7sht0t9k.cloudfront.net ×1; www.googleadservices.com ×2; googleads.g.doubleclick.net ×1

### 1b. Sheet swiped up → full-height list with a floating "Map" pill — `airbnb-list-sheet-up.png`, `airbnb-list-scroll600.png`

Swiping the sheet handle up turns the sheet into a full-screen scrolling list (`window.scrollY` becomes the list scroll; document height 8665 px). The map is no longer visible, the top bar shrinks to 82 px (chips row hidden while scrolling), and the bottom tab bar disappears. Cards are 358 wide (16 px gutters): photo carousel ≈ 358×343 rounded, then title, subtitle, "n bedrooms · n beds · n baths", dates, struck old price + price "for 5 nights", rating at right, optional "Free cancellation" chip.

Floating **"Map" pill**: `Map` + map icon, dark (black) pill, **150,781 90×40** → horizontally centred (centre x = 195), **23 px above the bottom edge**, `position:fixed`. (In the collapsed state the same button measured at 152,737 86×38 as "Show map" but is hidden behind the tab bar.)

Viewport 390×844 CSS px. "gap" = distance from element bottom to viewport bottom.

| element                            | tag    | x   | y   | w   | h   | gap  | position | text                                          |
| ---------------------------------- | ------ | --- | --- | --- | --- | ---- | -------- | --------------------------------------------- |
| fixed/sticky top element           | div    | 0   | 0   | 390 | 82  | 762  | fixed    | Homes in Himare Any week • Add guests Current |
| map canvas                         | canvas | 62  | 197 | 291 | 291 | 356  | absolute |                                               |
| map library root                   | div    | 0   | 0   | 390 | 844 | 0    | absolute | Home in Himarë, $1,061 $1,061 Home in Himarë, |
| map container (parent of lib root) | div    | 0   | 0   | 390 | 844 | 0    | absolute | Home in Himarë, $1,061 $1,061 Home in Himarë, |
| map [data-testid]                  | div    | 0   | 0   | 390 | 844 | 0    | relative | Google map Showing 20 stays. Home in Himarë,  |
| filter: Show filters               | button | 326 | 21  | 40  | 40  | 783  | relative | Show filters                                  |
| toggle: Map Show map               | button | 150 | 781 | 90  | 40  | 23   | static   | Map                                           |
| first card                         | div    | 24  | 50  | 342 | 380 | 415  | static   | Photo 1 of 23 Home in Himarë Sea-view balcony |
| first image                        | img    | 62  | 488 | 291 | 291 | 65   | static   |                                               |
| fixed-bottom/2                     | div    | 353 | 488 | 291 | 291 | 65   | absolute |                                               |
| fixed-bottom/3                     | div    | 353 | 779 | 291 | 291 | -226 | absolute |                                               |
| fixed-bottom/4                     | div    | 62  | 779 | 291 | 291 | -226 | absolute |                                               |

### 1c. "Map" pill tapped → full-screen map — `airbnb-map-t1s.png`, `airbnb-map-t4s.png`, `airbnb-map.png`, `airbnb-list-expanded.png`

Tapping the pill animates the sheet back down (the 1 s / 4 s / 9 s screenshots caught the transition; the sheet collapses to the bottom). The search pill re-titles to **"Homes in map area"** once the map is panned, and the chips row is replaced by two dropdown chips, **"Price ▾"** (≈ x 93–167, y 90, h 34) and **"Type of place ▾"** (≈ x 176–297). The `.gm-style` map stays 390×844. On this run the "Find it faster in the app" upsell sheet (≈ y 685–844, with an X at top-right) covered the lower part of the map, so the collapsed sheet's rest height in the pure map state could not be measured cleanly; from `airbnb-map-t4s.png`/`airbnb-map.png` the collapsed sheet header sits at ≈ y 170–210 during the animation and the Google attribution bar sits at y ≈ 822–844.

The Map/List switch on Airbnb mobile web is therefore **one screen with a draggable sheet**, not two routes: collapsed sheet = map, expanded sheet = list, plus a floating pill to jump back.

| metric                                         | value        |
| ---------------------------------------------- | ------------ |
| requests (responses recorded)                  | 9            |
| failed requests (no response)                  | 0            |
| total bytes (response bodies)                  | 107.0 KB     |
| bytes before `load` (load at t=14367 ms)       | 107.0 KB     |
| bytes after `load` until idle end (t=14367 ms) | 0.0 KB       |
| statuses                                       | 200×3, 204×6 |

| host (top 10)    | bytes    |
| ---------------- | -------- |
| www.airbnb.com   | 106.7 KB |
| d0a7e.airbnb.com | 0.2 KB   |
| a0.muscache.com  | 0.0 KB   |

| type  | bytes    | count |
| ----- | -------- | ----- |
| fetch | 106.7 KB | 2     |
| xhr   | 0.2 KB   | 2     |
| other | 0.0 KB   | 5     |

### 1d. Price pin tapped → single listing card over the map — `airbnb-map-pin-firstscreen.png`

Tapping the "$861" pin (touch at 161,285) on the map+sheet screen:

- the tapped pin turns **black with white text** (selected); other pins stay white;
- the bottom sheet and the tab bar are **replaced by one fixed card**: **16,485 358×343** (`position:fixed`; 16 px side gutters; **bottom edge at y 828 → 16 px above the viewport bottom**);
- card = photo carousel **358×201** (rounded, with "Guest favorite" badge top-left, heart and **X close** buttons top-right, 5 dots), then "Home in Himarë", subtitle, "Oct 1 – 6", "~~$995~~ **$861** for 5 nights", "Free cancellation" chip, rating "5.0 (23)" at right;
- the map remains fully visible above the card (map band ≈ y 134–485 = ~351 px), Google attribution at the very bottom.

It is a **single card, not a carousel** (only one listing shown; the DOM has one card container). No extra network cost was recorded for the tap (all listing data already loaded).

Viewport 390×844 CSS px. "gap" = distance from element bottom to viewport bottom.

| element                            | tag    | x   | y   | w   | h   | gap  | position | text                                          |
| ---------------------------------- | ------ | --- | --- | --- | --- | ---- | -------- | --------------------------------------------- |
| fixed/sticky top element           | div    | 0   | 0   | 390 | 134 | 710  | fixed    | Homes in Himare Any week • Add guests Current |
| map canvas                         | canvas | -77 | 282 | 279 | 279 | 283  | absolute |                                               |
| map library root                   | div    | 0   | 0   | 390 | 844 | 0    | absolute | Home in Himarë, $861 $861 selected, visited H |
| map container (parent of lib root) | div    | 0   | 0   | 390 | 844 | 0    | absolute | Home in Himarë, $861 $861 selected, visited H |
| map [data-testid]                  | div    | 0   | 0   | 390 | 844 | 0    | relative | Photo 1 of 14 Top guest favorite Guest favori |
| filter: Show filters               | button | 326 | 21  | 40  | 40  | 783  | relative | Show filters                                  |
| first card                         | div    | 16  | 485 | 358 | 343 | 16   | relative | Photo 1 of 14 Top guest favorite Guest favori |
| pin card (positioned, img + price) | div    | 0   | 485 | 390 | 343 | 16   | fixed    | Photo 1 of 14 Top guest favorite Guest favori |
| first image                        | img    | 16  | 485 | 358 | 201 | 158  | static   |                                               |
| fixed-bottom/2                     | div    | 202 | 561 | 279 | 279 | 4    | absolute |                                               |
| fixed-bottom/6                     | div    | 202 | 840 | 279 | 279 | -275 | absolute |                                               |

Filter chips row (first screen): 4 visible chips at y 90 h 34: `Washer` 16→84, `Free parking` 93→188, `Allows pets` 197→287, `Hot tub` 296→365, fifth chip clipped at the right edge (row scrolls horizontally).

---

## 2. Booking.com — `https://www.booking.com/searchresults.html?ss=Himare&checkin=2026-09-26&checkout=2026-09-27&group_adults=2`

**Blocked: HTTP 403, 1.1 KB HTML, no redirect.** Body: "403 Access Forbidden — You have been detected as a robot accessing the site in violation of our terms of service … include the word 'robot' and an email address … REF: 271a4a8b-…". The page has no viewport meta (reported viewport 980×2121). No map, list or pin could be measured; `booking-map.png` / `booking-map-pin.png` are the same block page. Screenshots: `booking-list.png`, `booking-list-full.png`.

| metric                                        | value  |
| --------------------------------------------- | ------ |
| requests (responses recorded)                 | 1      |
| failed requests (no response)                 | 0      |
| total bytes (response bodies)                 | 1.1 KB |
| bytes before `load` (load at t=775 ms)        | 1.1 KB |
| bytes after `load` until idle end (t=8777 ms) | 0.0 KB |
| statuses                                      | 403×1  |

| host (top 10)   | bytes  |
| --------------- | ------ |
| www.booking.com | 1.1 KB |

| type     | bytes  | count |
| -------- | ------ | ----- |
| document | 1.1 KB | 1     |

---

## 3. spiagge.it — `https://www.spiagge.it/`

Reachability: home 200 (one 307 on `www.spiagge.it`). Third-party hosts blocked by the proxy: `spiaggefrontend-production.up.railway.app` (their frontend/data backend — **this is what breaks every inner page**), `cdn.iubenda.com`/`cs.iubenda.com` (cookie banner, so no banner appeared), `www.googletagmanager.com`, `dev.visualwebsiteoptimizer.com`, `sentry.io`. `/spiagge/`, `/mappa`, `/rimini`, `/spiagge/rimini/` → **404**. Real URL scheme found in the nav: `/stabilimenti-balneari/<city|region|area>/` (e.g. `/stabilimenti-balneari/rimini/`), venue pages `/stabilimenti-balneari/<id>-<slug>/` (e.g. `/stabilimenti-balneari/12035-bagno-silvano-123/`), pools `/piscine/<id>-<slug>/`, an `experiences.spiagge.it` sub-site, and a B2B `/gestionale-spiaggia/` ("Sei un gestore?").

### 3a. Home — `spiagge-home.png`, `spiagge-home-full.png`, `spiagge-home-scroll600.png`

- Fixed yellow header **0,0 390×64** (logo 183×32 at 16,16; account icon; hamburger).
- Hero (y 64–333, 390×269, aerial beach photo): H1 "Prenota il tuo posto in spiaggia"; a white search card with two rows — location **"Dove vuoi andare?"** (text at 64,152, 130×24, with a pin icon) and date **"20 Set"** (calendar icon) — then a full-width blue **"Cerca"** button **16,253 358×48**.
- Below: "I vantaggi di spiagge.it" 3-step list — _Trova la spiaggia perfetta / Confronta fra più di 2400 stabilimenti_, **"Scegli il tuo ombrellone / Seleziona il posto direttamente in mappa"**, _Paga in totale sicurezza / Puoi pagare con carta di credito_; then horizontal carousels (cards 144×180, 16 px gap) "Stabilimenti in evidenza", "Piscine e Parchi acquatici", "Spiagge.it Experience", "Destinazioni popolari" (Rimini, Riccione, Ravenna, Cervia, Milano Marittima, Cesenatico, Pietrasanta), "Esplora le regioni", "Località in primo piano" (Salento, Versilia, Costiera amalfitana, …). A blue chat FAB sits bottom-right (≈ 56 px, ≈ 16 px from bottom/right).
- **No map on the home page.** No "mappa" toggle anywhere on the home page.

Viewport 390×844 CSS px. "gap" = distance from element bottom to viewport bottom.

| element          | tag    | x   | y    | w   | h   | gap   | position | text                                          |
| ---------------- | ------ | --- | ---- | --- | --- | ----- | -------- | --------------------------------------------- |
| top bar / header | header | 0   | 0    | 390 | 64  | 780   | fixed    |                                               |
| first image      | img    | 16  | 16   | 183 | 32  | 796   | static   |                                               |
| fixed-bottom/0   | img    | 16  | 750  | 144 | 180 | -86   | absolute |                                               |
| fixed-bottom/3   | img    | 176 | 750  | 144 | 180 | -86   | absolute |                                               |
| fixed-bottom/4   | div    | 176 | 830  | 144 | 100 | -86   | absolute | Animalido Dog Beach Fano, Marche              |
| fixed-bottom/6   | img    | 336 | 750  | 144 | 180 | -86   | absolute |                                               |
| fixed-bottom/7   | div    | 336 | 834  | 144 | 96  | -86   | absolute | Bagno 112 Rimini, Emilia-Romagna              |
| sheet-like/0     | div    | 0   | 64   | 390 | 269 | 511   | relative | Prenota il tuo posto in spiaggia Dove vuoi an |
| bottom tab bar   | div    | 16  | 3441 | 358 | 48  | -2645 | static   | Stabilimenti in Italia Stabilimenti per regio |
| carousel/0       | div    | 0   | 750  | 390 | 180 | -86   | relative | Zen Beach Gallipoli, Puglia Animalido Dog Bea |
| carousel/1       | div    | 16  | 750  | 358 | 180 | -86   | relative | Zen Beach Gallipoli, Puglia Animalido Dog Bea |

| metric                                         | value         |
| ---------------------------------------------- | ------------- |
| requests (responses recorded)                  | 71            |
| failed requests (no response)                  | 10            |
| total bytes (response bodies)                  | 3414.5 KB     |
| bytes before `load` (load at t=4504 ms)        | 2803.2 KB     |
| bytes after `load` until idle end (t=12507 ms) | 611.4 KB      |
| statuses                                       | 200×70, 307×1 |

| host (top 10)  | bytes     |
| -------------- | --------- |
| img.spiagge.it | 1713.6 KB |
| www.spiagge.it | 1700.9 KB |

| type       | bytes     | count |
| ---------- | --------- | ----- |
| image      | 1751.0 KB | 37    |
| script     | 1143.2 KB | 26    |
| document   | 371.1 KB  | 2     |
| stylesheet | 111.6 KB  | 3     |
| font       | 36.6 KB   | 1     |
| other      | 0.9 KB    | 1     |
| fetch      | 0.0 KB    | 1     |

Blocked / failed hosts (count): spiaggefrontend-production.up.railway.app ×1; cdn.iubenda.com ×2; cs.iubenda.com ×1; www.google.com ×1; www.googletagmanager.com ×1; dev.visualwebsiteoptimizer.com ×2; o4504712775008256.ingest.us.sentry.io ×1; www.spiagge.it ×1

### 3b. Search entry — `spiagge-search-focus.png`, `spiagge-search-typed.png`, `spiagge-search-picked.png`

Tapping "Dove vuoi andare?" opens a **full-screen modal "Seleziona la tua destinazione"** (X at top-right) with a text field; typing "Rimini" shows a highlighted **Cerca "Rimini"** free-text row plus **"10 risultati"** typed as _Provincia_, _Città_ (Rimini, Emilia-Romagna) and _Stabilimento_ rows (La Community 27, Sabbia Bianca Rimini 144-145, Beach 33, Bagno Tiki 26, Bagno Arcobaleno 20, Le Spiagge (53-54-55)…), each with an icon and a 60-ish px row height. Choosing "Rimini – Città" and pressing Cerca navigates to:

`https://www.spiagge.it/stabilimenti-balneari/rimini/?se=1&page=1&sid=<uuid>&from=2026-09-20&to=2026-09-20&type=city`

(the empty-location search goes to `/stabilimenti-balneari/?se=1&page=1&sid=…&from=…&to=…`). So results are date-scoped (`from`/`to`, default = tomorrow) and paged.

### 3c. Results / city / venue pages — **could not be rendered**

`spiagge-results.png`, `spiagge-search.png`, `spiagge-city-rimini.png`, `spiagge-venue.png` all show "Oops, qualcosa è andato storto" (SPA error boundary) — the document itself returns 200 (2.4–2.8 MB of JS/CSS from `www.spiagge.it`) but the data call to `spiaggefrontend-production.up.railway.app` is rejected by the proxy. **Therefore: whether the results screen has a map, how it relates to the list, and per-day prices were not observable in this session.**

| metric                                        | value                |
| --------------------------------------------- | -------------------- |
| requests (responses recorded)                 | 44                   |
| failed requests (no response)                 | 13                   |
| total bytes (response bodies)                 | 2825.9 KB            |
| bytes before `load` (load at t=2740 ms)       | 2825.0 KB            |
| bytes after `load` until idle end (t=8741 ms) | 0.9 KB               |
| statuses                                      | 200×42, 304×1, 404×1 |

| host (top 10)  | bytes     |
| -------------- | --------- |
| www.spiagge.it | 2825.9 KB |

| type       | bytes     | count |
| ---------- | --------- | ----- |
| script     | 1545.7 KB | 32    |
| document   | 1087.8 KB | 1     |
| stylesheet | 119.5 KB  | 5     |
| font       | 36.6 KB   | 1     |
| image      | 35.3 KB   | 4     |
| other      | 0.9 KB    | 1     |

Blocked / failed hosts (count): o4504712775008256.ingest.us.sentry.io ×4; www.google.com ×1; cdn.iubenda.com ×2; spiaggefrontend-production.up.railway.app ×1; cs.iubenda.com ×1; www.googletagmanager.com ×1; dev.visualwebsiteoptimizer.com ×2; www.spiagge.it ×1

### 3d. Is it a real sunbed/umbrella pre-booking product? — **Yes.**

Evidence (all from live copy captured here):

- Home page: "Prenota il tuo posto in spiaggia", "Confronta fra più di 2400 stabilimenti", **"Scegli il tuo ombrellone — Seleziona il posto direttamente in mappa"**, "Paga in totale sicurezza — Puoi pagare con carta di credito"; date field in the search card; venue-level URLs; a B2B management product for operators ("gestionale spiaggia").
- App Store description (below): "Prenota il tuo ombrellone"; "scegli **dalla mappa della spiaggia** l'ombrellone che preferisci e pagalo direttamente con carta di credito"; "Prenotando online hai più possibilità di trovare posto in prima fila"; ordering food to the **lettino**; seasonal umbrella sharing.
- Mobile flow as far as observed: home → destination picker (typed suggestions incl. individual stabilimenti) → date → Cerca → date-scoped results list per city (`?from=&to=&type=city&page=`) → venue page → **beach-map seat picker** (per copy) → card payment. The results-level map (city map of venues) is not confirmed; the venue-level map is a **beach plan (umbrella grid)**, per the copy.

---

## 4. App Store — `https://apps.apple.com/it/app/spiagge-it-booking-spiaggia/id1269882377`

Reachability:

- **iPhone UA:** the page immediately redirects to `itms-appss://…` → Chromium `net::ERR_ABORTED`, blank page (`appstore.png` from the first run is blank).
- **Mac Safari UA** (`appstore.png`, `appstore-full.png`) and **Android Chrome UA** (`appstore-android.png`, `appstore-android-full.png`): 200, 18 requests, 3.9 MB, all from `apps.apple.com`. Every image (`is1-ssl.mzstatic.com`, 23 requests) plus `xp.apple.com` and `www.apple.com` failed with `ERR_TUNNEL_CONNECTION_FAILED` (proxy CONNECT rejected). Direct downloads via the request API returned **403 from the proxy** (status recorded as 403 in `appstore-downloads.json` for four featured-shelf URLs; screenshot images: **000 / not attempted because no URL is exposed**).

Screen: App Store header; yellow hero with title "Spiagge.it - Booking spiaggia", tagline **"Prenota il tuo ombrellone"**, "Gratis · Progettata per iPad"; stats 346 valutazioni / 4,6; a horizontal **screenshot shelf of 3+ portrait cards ≈ 144×313 CSS px each** rendered as yellow placeholders (image bytes blocked); "iPhone, iPad" device switcher; then the description.

Metadata: category Viaggi, developer Spiagge srl, language EN, size 47.6 MB, age 4+, rating 4.6 (346). Reviews mention "Yourbeach" (former name) and booking in Rimini and Puglia.

**Screenshot image URLs: none found.** The server HTML contains no non-icon `mzstatic` URL (the shelf is filled client-side; only the app icons and a 128×128 `Placeholder.mill` were present in `<picture>` sources). So the `<picture>` sources for the screenshots could not be extracted, and 0 of 4 screenshots were downloaded. Files: `appstore-android-page.html`, `appstore-data.json`, `appstore-screenshot-urls.txt` (empty of screenshots).

Description (full text, from `appstore-text.txt`):

> La tua spiaggia a portata di click!
> Spiagge.it è l'applicazione che ti permette di prenotare il tuo posto al mare e, una volta in spiaggia, di ordinare da mangiare sotto l'ombrellone senza doversi alzare dal lettino.
>
> 1. CERCA LA SPIAGGIA — Grazie alla collaborazione con Ombrellove sono presenti le schede di centinaia di stabilimenti e puoi filtrarli in base ai servizi che cerchi. Particolare attenzione anche alle strutture accessibili e alle spiagge attrezzate per gli animali domestici.
> 2. PRENOTA DIRETTAMENTE DALL'APP — Una volta trovato lo stabilimento più adatto a te scegli dalla mappa della spiaggia l'ombrellone che preferisci e pagalo direttamente con carta di credito. RICORDA: Prenotando online hai più possibilità di trovare posto in prima fila!
> 3. ORDINA DA MANGIARE SDRAIATO SUL LETTINO — Il relax in vacanza è fondamentale! Trova il ristorante di spiaggia più vicino a te e quando l'icona è colorata significa che è attivo il servizio di consegnare del pranzo o dell'aperitivo sotto l'ombrellone.
> 4. CONDIVIDI IL TUO OMBRELLONE — Hai un ombrellone stagionale? … puoi rendere disponibile il tuo ombrellone quando non vai in spiaggia, in cambio di sconti o consumazioni. Oppure puoi gestire dall'app le tessere prepagate o sconto…
>    Scarica subito l'app Spiagge.it! Scopri di più sul mondo Spiagge.it: https://www.spiagge.it

| metric                                         | value     |
| ---------------------------------------------- | --------- |
| requests (responses recorded)                  | 18        |
| failed requests (no response)                  | 47        |
| total bytes (response bodies)                  | 3928.9 KB |
| bytes before `load` (load at t=1480 ms)        | 3898.1 KB |
| bytes after `load` until idle end (t=12026 ms) | 30.8 KB   |
| statuses                                       | 200×18    |

| host (top 10)  | bytes     |
| -------------- | --------- |
| apps.apple.com | 3928.9 KB |

| type       | bytes     | count |
| ---------- | --------- | ----- |
| script     | 2896.8 KB | 11    |
| document   | 602.7 KB  | 1     |
| stylesheet | 388.0 KB  | 1     |
| fetch      | 29.4 KB   | 1     |
| font       | 9.2 KB    | 1     |
| other      | 1.4 KB    | 1     |
| image      | 1.4 KB    | 2     |

Blocked / failed hosts (count): www.apple.com ×2; is1-ssl.mzstatic.com ×23; xp.apple.com ×5

---

## 5. Mobbin — `https://mobbin.com/`

| URL                                                                                                                                                                                            | result                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                                                                                                            | 200 — marketing home (`mobbin-home.png`); nav: Pricing, MCP, Log in, Join for free, Explore, Glossary, Awards…                                                                                                                                                                                                                                              |
| `/search/apps?q=airbnb`, `?q=beach`, `?q=booking`, `/search/ios/apps?q=airbnb`                                                                                                                 | 200 but **redirected to `/?redirect_to=%2Fsearch%2Fapps%3Fq%3D…`** — the search is behind login; the rendered page is the home page (`mobbin-search-airbnb.png`, `mobbin-search-beach.png`, `mobbin-search-booking.png`)                                                                                                                                    |
| `/apps?q=airbnb`, `/apps/airbnb`, `/apps/airbnb-ios`, `/explore/apps/ios`                                                                                                                      | **404** (`mobbin-apps-airbnb.png` …)                                                                                                                                                                                                                                                                                                                        |
| `/explore` → `/explore/mobile`                                                                                                                                                                 | 200 public: "Explore mobile app designs", Mobile/Web/Sites toggle, "Browse by category" (Categories, Screens, Flows, UI elements…) (`mobbin-explore.png`)                                                                                                                                                                                                   |
| `/explore/mobile/flows/searching-finding`, `/explore/mobile/flows/booking-reserving`, `/explore/mobile/app-categories/travel-transportation`, `/explore/mobile/app-categories/maps-navigation` | 200 public, **flow screenshots visible without login** as phone-frame cards (≈ 208×420 CSS, two per row) with per-flow blurbs; images served from **`bytescale.mobbin.com`** (`…/image/mobbin.com/prod/content/app_screens/<uuid>.png?f=webp&w=1920&q=85…`); a Google One-Tap "Sign in to Mobbin with Google / Continue" sheet overlays the bottom ≈ 130 px |
| `/sitemap.xml`                                                                                                                                                                                 | 200, 517 KB; contains `explore/*` (1310), `colors/*` (1563), glossary, blog — **no `/apps/…` or `/flows/…` URLs**, and the only Airbnb URL is `colors/brand/airbnb`                                                                                                                                                                                         |

**Conclusion:** no Airbnb iOS Search/Explore/Map flow page is reachable unauthenticated; none of the public explore pages that were opened listed an Airbnb entry (checked img alt/links on 4 pages). Flow screenshots on the public category pages are visible and hosted on `bytescale.mobbin.com` (allowed by the proxy). Screenshots: `mobbin-flow-searching.png`, `mobbin-flow-booking.png`, `mobbin-cat-travel.png`, `mobbin-cat-maps.png` (+ `-full` versions).

| metric                                        | value           |
| --------------------------------------------- | --------------- |
| requests (responses recorded)                 | 133             |
| failed requests (no response)                 | 14              |
| total bytes (response bodies)                 | 19812.6 KB      |
| bytes before `load` (load at t=4115 ms)       | 19808.2 KB      |
| bytes after `load` until idle end (t=9116 ms) | 4.4 KB          |
| statuses                                      | 200×123, 206×10 |

| host (top 10)        | bytes      |
| -------------------- | ---------- |
| bytescale.mobbin.com | 11491.9 KB |
| mobbin.com           | 7726.9 KB  |
| accounts.google.com  | 529.9 KB   |
| fonts.gstatic.com    | 53.9 KB    |
| (data:/blob:)        | 10.1 KB    |

| type       | bytes      | count |
| ---------- | ---------- | ----- |
| other      | 10542.7 KB | 6     |
| script     | 4742.3 KB  | 67    |
| fetch      | 1933.4 KB  | 26    |
| document   | 1278.5 KB  | 2     |
| image      | 953.6 KB   | 22    |
| stylesheet | 212.2 KB   | 7     |
| font       | 149.9 KB   | 2     |
| xhr        | 0.1 KB     | 1     |

Blocked / failed hosts (count): r.wdfl.co ×1; cdn.growthbook.io ×3; js.stripe.com ×1; connect.facebook.net ×1; s.pinimg.com ×1; assets.churnkey.co ×1; bytescale.mobbin.com ×5; www.googletagmanager.com ×1

| metric                                        | value     |
| --------------------------------------------- | --------- |
| requests (responses recorded)                 | 6         |
| failed requests (no response)                 | 63        |
| total bytes (response bodies)                 | 1267.7 KB |
| bytes before `load` (load at t=2369 ms)       | 1213.8 KB |
| bytes after `load` until idle end (t=8373 ms) | 53.9 KB   |
| statuses                                      | 200×6     |

| host (top 10)       | bytes    |
| ------------------- | -------- |
| mobbin.com          | 683.9 KB |
| accounts.google.com | 529.9 KB |
| fonts.gstatic.com   | 53.9 KB  |

| type       | bytes    | count |
| ---------- | -------- | ----- |
| document   | 946.7 KB | 2     |
| script     | 266.4 KB | 1     |
| font       | 53.9 KB  | 1     |
| stylesheet | 0.7 KB   | 1     |
| xhr        | 0.1 KB   | 1     |

Blocked / failed hosts (count): framerusercontent.com ×28; www.googletagmanager.com ×1; events.framer.com ×1

---

## 6. Google Maps — `https://www.google.com/maps`

**Blocked at the proxy:** `net::ERR_TUNNEL_CONNECTION_FAILED` (CONNECT rejected with 403 by the gateway; recorded as status 000, 0 bytes, 2 failed document requests). `gmaps.png` shows Chromium's "This site can't be reached" page. Note that Airbnb's embedded Google map **did** load because it uses `maps.googleapis.com` (allowed) — only `www.google.com` and `maps.gstatic.com` are rejected.

| metric                                        | value  |
| --------------------------------------------- | ------ |
| requests (responses recorded)                 | 0      |
| failed requests (no response)                 | 2      |
| total bytes (response bodies)                 | 0.0 KB |
| bytes before `load` (load at t=124 ms)        | 0.0 KB |
| bytes after `load` until idle end (t=3129 ms) | 0.0 KB |
| statuses                                      | —      |

| host (top 10) | bytes |
| ------------- | ----- |

| type | bytes | count |
| ---- | ----- | ----- |

Blocked / failed hosts (count): www.google.com ×2

---

## Screenshot index (all in this folder)

Airbnb: `airbnb-list-firstpaint.png` (with "Got it" modal), `airbnb-list.png`, `airbnb-list-full.png`, `airbnb-list-dates.png`, `airbnb-list-sheet-up.png`, `airbnb-list-scroll600.png`, `airbnb-list-expanded.png` ("Homes in map area" state), `airbnb-map-t1s.png`, `airbnb-map-t4s.png`, `airbnb-map.png`, `airbnb-map-pin-firstscreen.png` (**pin tap → card**), `airbnb-map-pin.png` (centre tap, no pin hit).
Booking: `booking-list.png`, `booking-list-full.png`, `booking-list-dismissed.png`, `booking-list-scroll600.png`, `booking-map.png`, `booking-map-pin.png` (all the 403 page).
spiagge.it: `spiagge-home-firstpaint.png`, `spiagge-home.png`, `spiagge-home-full.png`, `spiagge-home-scroll600.png`, `spiagge-cta.png`, `spiagge-search-focus.png`, `spiagge-search-typed.png`, `spiagge-search-picked.png`, `spiagge-search-picked2.png`, `spiagge-search.png`, `spiagge-search-full.png`, `spiagge-results.png`, `spiagge-results-full.png`, `spiagge-city-rimini.png`, `spiagge-city-rimini-full.png`, `spiagge-venue.png`, `spiagge-venue-full.png`, `spiagge-spiagge.png`, `spiagge-mappa.png`, `spiagge-rimini.png`, `spiagge-spiagge-rimini.png` (404s).
App Store: `appstore.png` (Mac UA), `appstore-full.png`, `appstore-android.png`, `appstore-android-full.png`.
Mobbin: `mobbin-home.png`, `mobbin-search-airbnb.png`, `mobbin-search-ios.png`, `mobbin-search-beach.png`, `mobbin-search-booking.png`, `mobbin-apps-q.png`, `mobbin-apps-airbnb.png`, `mobbin-apps-airbnb-ios.png`, `mobbin-explore.png`, `mobbin-explore-ios.png`, `mobbin-login.png`, `mobbin-flow-searching.png`, `mobbin-flow-booking.png`, `mobbin-cat-travel.png`, `mobbin-cat-maps.png` (each with a `-full.png`).
Google Maps: `gmaps.png`.
