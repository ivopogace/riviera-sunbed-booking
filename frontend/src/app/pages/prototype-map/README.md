# PROTOTYPE — where the riviera map goes on desktop

**Throwaway. Spike branch only (`claude/map-design-prototype-417sh1`); nothing here merges to
`main`.** Four desktop layouts for the riviera map on Discover, on one route, so they can be
judged against each other and against what ships today.

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

## Screenshots

`shots/` holds the set these notes are written from (1440 × 900 unless stated), captured against
the real tiles with the fixture venues:

| File                                                | What                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `00-shipped-1440.png` · `00-shipped-phone.png`      | what ships today, for comparison                               |
| `A-shoreline-1440.png` · `A-shoreline-1920.png`     | A, whole coast; 1920 shows 3 card columns                      |
| `B-charttable-1440.png` · `B-charttable-phone.png`  | B at region scale, where its camera works; and the phone sheet |
| `C-coastindex-1440.png` · `C-coastindex-dhermi.png` | C, whole coast and with a beach chosen from the rail           |
| `D-bothmaps-1440.png`                               | D with a venue open, beach map inline                          |

## Files

| File                                                                                                  | What                                                                 |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `prototype-map-page.ts`                                                                               | the host: fixture data, filters from the URL, the `?variant=` switch |
| `variant-shoreline.ts` · `variant-chart-table.ts` · `variant-coast-index.ts` · `variant-both-maps.ts` | A · B · C · D — no shared layout, on purpose                         |
| `prototype-camera.ts`                                                                                 | fit the camera to the pane and the pins — the finding above          |
| `prototype-filter-bar.ts`                                                                             | the selects, shared by A, B and D (C replaces them)                  |
| `prototype-venues.ts` · `prototype-sets.ts`                                                           | 26 fixture venues; a plausible set grid for D                        |
| `prototype-switcher.ts`                                                                               | the floating bar — deliberately ugly, so it reads as scaffolding     |

Written under prototype rules: no tests, no error handling, no a11y or contrast specs. If a
variant wins it gets rebuilt test-first through the normal loop — do not promote this code.
