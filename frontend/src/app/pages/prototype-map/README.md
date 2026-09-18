# Desktop map-design spike: where does the riviera map belong on Discover?

**Throwaway.** Route `/prototype/map-desktop?variant=a|b|c|d`, lazy, on this spike branch only.
Nothing here merges to `main`; the validated _decision_ graduates through the normal loop.

Run it: `cd frontend && npm start`, open `http://localhost:4200/prototype/map-desktop?variant=b`.
The fixture is in `fixture.ts` (27 venues on 19 of the 36 catalogued beaches, coast order). Tiles
come from `/map/**` on the API origin, so `./gradlew bootRun` (or any static server for
`platform/map/` that honours `Range`) gives real imagery; without one the map reports
`unavailable` and the layouts still stand. Every state is in the URL: `date`, `beach`, `venue`,
`bay` (C), `zoomed` (B), `sheet=peek|half|full` (D). The magenta-and-yellow switcher is on purpose.

## The question, with measurements

The shipped page caps at 1080 px, spends the first screen on a headline, and gives the map 42 %
of the grid below the fold. On a phone the first screen is a headline and three selects.

The subject decides the shape. The coast is **a tall thin strip**: the fixture's pins span
0.65° of longitude by 2.08° of latitude, an aspect of about **1 : 4.5** on screen. The map's
fence (`RIVIERA_MAP_OPTIONS.maxBounds`, ADR-0022) is 2.2° wide, MapLibre clamps the viewport
against it, and `minZoom` is 7. Two consequences, both measured live by `coast-frame.ts` and
printed in the switcher's readout (`shots/readouts.json` keeps every value):

1. **A pane's width sets a zoom floor.** `floor = log2(width / (2.2° in world px))`, never below 7. At the floor the coast's pins are `3.9 × 2^zoom` px tall, so a pane can hold the whole coast
   only while it is **taller than about 0.8 × its width**.
2. **The honest fit of a wide pane lands on nothing.** Fitting all pins into a landscape pane
   clamps to the floor, and the pins' mid-point is inland Albania with no venue in view (first
   screenshot pass of A). So a pane that cannot hold the coast opens on the **stretch of coast
   that holds the most pins** at its floor (`bestStretch`), and says how many it holds.

| Pane (variant, viewport)                   | Floor | Fit → used        | Pins on screen | Coast shown              |
| ------------------------------------------ | ----- | ----------------- | -------------- | ------------------------ |
| A, 1440 × 900: 1424 × 566                  | z8.83 | z6.91 → **z8.83** | 399 × 1782 px  | 26 %, best stretch 19/27 |
| A, 1920 × 1080: 1904 × 746                 | z9.25 | z7.38 → **z9.25** | 533 × 2382 px  | 27 %, best stretch 19/27 |
| B, 1440: spine 490 × 811                   | z7.29 | z7.56 → z7.56     | 165 × 739 px   | **whole coast**          |
| B, 1920: spine 653 × 991                   | z7.71 | z7.88 → z7.88     | 206 × 919 px   | **whole coast**          |
| C, any: one bay                            | —     | z15 → capped z14  | one bay        | the bay only             |
| D, 1440: 1004 × 803                        | z8.33 | z7.53 → **z8.33** | 281 × 1256 px  | 58 %, best stretch 21/27 |
| D, 1920: 1484 × 983                        | z8.89 | z7.85 → **z8.89** | 416 × 1857 px  | 49 %, best stretch 21/27 |
| Phone 390 × 844, full-bleed (D): 390 × 783 | z7.00 | z7.49 → z7.49     | 157 × 703 px   | **whole coast**          |
| Phone, map above controls (A): 374 × 502   | z7.00 | z6.70 → z7.00     | 112 × 501 px   | 81 %                     |
| Phone, half-height pane (B): 435 × 399     | z7.12 | z6.38 → z7.12     | 122 × 544 px   | 60 %                     |

Read across: **a wider pane sees less coast.** At 1920 the wide chart shows 27 % of it; the
portrait spine shows all of it at 653 px wide, with the remaining 1250 px free for the venues.
The whole coast fits a 390 × 783 phone at z7.49 but not a 1424 × 566 desktop pane. Only the
whole-coast ambition is fenced: a bay at z14 is never clamped, whatever the pane.

One more number from the phone: at z7 the coast strip is **112 px wide** on a 374 px pane. The
fence forbids centring it (the centre can move only 0.03° at that zoom), so two-thirds of a
whole-coast phone map is inland Albania. The sea is on the left, as on any map of the country,
and the place pills hang right into the empty part, which reads fine; a phone map that wants to
be _useful_ rather than _complete_ should open on the best stretch (25/27 pins at 81 %).

## The four answers

Every variant reuses `app-riviera-map` (its `handle` for `project`/`easeTo`),
`app-venue-pin-layer`, `app-venue-preview-card`, `appCardGlass`, `appFieldGlass`,
`appSemanticChip`, `appAmenityChip`, `appTouchTarget`, `app-sets-free`, `app-photo-slideshow`,
and consumes the `--riv-*` tokens. B also reuses `app-beach-map-canvas`. All controls keep the
44 px floor; the header and the phone tab bar are the shell's. Photos are eight generated SVG
masses in `public/prototype-map/` so a card's photo weight can be judged without a picture.

### A — Wide chart + shelf (desktop-first; the expected shape, measured)

```
┌ day ▾  beach ▾ ····························· 27 venues · one set, the whole day ┐
│ Velipojë ‖ Shëngjin ┆┆┆ Durrës ‖ … ▓Palasë▓Dhërmi▓Jalë▓Himarë▓…▓Ksamil▓          │ ← coast scrubber
│┌──────────────────────────────────────────────────────────────────────────────┐│
││  sea                 [3 beaches ⑥]                                  Near me   ││
││                           [④]  Himarë                                 + −     ││
││                               [€12]                                           ││
││                                        [Sarandë ②]                            ││
││                                          [Pasqyra & Ksamil ④]                 ││
│└──────────────────────────────────────────────────────────────────────────────┘│
│ [▣ Bora Bora €12][▣ Rana €15][▣ Iliria €10][▣ Vollga €9][▣ Golem €14] ▸▸▸       │ ← shelf
└─────────────────────────────────────────────────────────────────────────────────┘
```

The map is the headline: one slim bar (day, beach, count), then a landscape pane as wide as the
window, then a shelf of compact rows in coast order. Because the pane cannot hold the coast,
the coast is drawn a second time as the **scrubber**: the 36 beaches north→south as one strip,
the ones with venues pressable, the stretch the camera covers tinted. Selecting a pin scrolls
the shelf; selecting a row opens nothing over the map (the preview is for pins).

_Argument:_ this is what a tourist expects a map page to look like, and the measurement is the
argument against it. At 1440 the pane is 1424 px wide and the pins occupy 399 px of it: the
right two-thirds is Greece and the Pindus. It opens on Palasë→Ksamil (19 of 27 pins) and never
shows the north. The scrubber is a patch for a pane shape the subject does not want.

### B — Coast spine (desktop-first; the one you would not find elsewhere)

```
┌────────────┬───────────────────────────────────────┬──────────────────────┐
│ N ↑ Velipojë│ day ▾           27 venues on 19 beaches│ ┌ Folie Marine  × ┐ │
│  [€12]      │ ○ Velipojë  Shkodër · 1 · from €12    │ │ ★4.7 · from €45  │ │
│   [€15]     │ │ ┌▣ Bora Bora Velipojë ······ €12 ┐  │ │ [View beach map] │ │
│             │ │ └─────────────────────────────────┘  │ └──────────────────┘ │
│ [3 beaches④]│ ○ Shëngjin  Lezhë · 1 · from €15      │ Sunbeds at Folie…    │
│             │ │ ┌▣ Rana Beach Club ·········· €15 ┐  │ ▲ FACING THE SEA     │
│             │ │ └─────────────────────────────────┘  │ A [A1][A2][A3] €45+10│
│ [Vlorë ②]   │ ○ Durrës  Durrës · 2 · from €9        │ B [B1][B2][B3] €45   │
│             │ │ ┌▣ Iliria Lido ·············· €10 ┐  │ C [C1][C2][C3]       │
│ ── Dhërmi ──│ │ └─────────────────────────────────┘  │ ▼ PROMENADE          │
│  [⑫] [€12]  │ │ ┌▣ Vollga Sunbeds ············ €9 ┐  │ [   Pick a set    ]  │
│ [3 beaches⑥]│ │ └─────────────────────────────────┘  │                      │
│ S ↓ Ksamil  │ ○ Golem …                              │                      │
└────────────┴───────────────────────────────────────┴──────────────────────┘
   spine          itinerary (north → south)              the pick (xl only)
```

The map is a **portrait strip**, its width derived from the row's height (the widest pane that
still frames the coast, capped at a third of the window: 490 px at 1440, 653 px at 1920). North
is at the top and south at the bottom, labelled. Beside it the venues are an **itinerary**: a
rail with a stop per beach, in the order the coast reads, the venues under each stop. Scrolling
the list draws a "reading here" line across the spine at that beach's latitude; a stop's name
flies the camera to its bay and a crumb brings the whole coast back; a pin scrolls the list to
its venue. From `xl` the third column is **the pick**: the preview card plus the venue's sunbed
grid drawn with the shipped canvas, so desktop shows the sunbeds before the tourist leaves.

_Argument:_ the coast is one-dimensional, so the page is too. The map, the list and the scroll
position are the same axis, and the map's shape is the subject's shape. The spine holds the
whole coast at every desktop size with the majority of the width left over, which is exactly
the width the shipped page could not find for the map. The pick column is the one thing only a
desktop can afford, and it is the thing the tourist came for.

### C — Bay by bay (desktop-first)

```
┌──────────┬──────────────────────────────────────────┬────────────────────┐
│ Shkodër  │ ↑ Drymades   Dhërmi 3 venues   Gjipe ↓   │ ┌▣▣▣ Havana Beach┐ │
│ Velipojë │                              day ▾       │ │ ★4.8 · 212     │ │
│ Lezhë    │ ┌──────────────────────────────────────┐ │ │ 5m to water …  │ │
│ Shëngjin │ │   Gjilek        [€40]                │ │ │ from €40 / set │ │
│  Tale    │ │            Dhërmi                    │ │ │ [Choose a set] │ │
│  Patok   │ │                    [€32]             │ │ └────────────────┘ │
│ Durrës   │ │  sea                       [€28]     │ │ ┌▣▣▣ Blue Cave   ┐ │
│ Durrës 2 │ │                                      │ │ │ …              │ │
│ Golem    │ └──────────────────────────────────────┘ │ └────────────────┘ │
│ …        │                                          │                    │
│ ▓Dhërmi▓ │                                          │                    │
│ Gjipe    │                                          │                    │
└──────────┴──────────────────────────────────────────┴────────────────────┘
   the coast, as words    one bay at z14 (never fenced)    the bay's venues
```

The map never tries to be the coast. The coast is a **text rail** of all 36 beaches, region by
region, north→south, the 19 with venues pressable with their count and lowest price; the map
shows **one bay** at the scale where its pins separate (fit, capped at z14); the bay's venues
are full cards beside it. Arrows either side of the bay's name walk the coast.

_Argument:_ the tourist's real decision is "which bay", and 36 named beaches in order are a
better picker for that than 27 pins on a strip. The map earns its place at the scale where it
says something a name cannot: where on the bay the venue sits, and how far from the water.
Never fenced, at any pane. The cost is that the whole coast is never seen as a map, and that a
tourist who does not yet know the names is choosing blind.

### D — Thumb sheet (mobile-first, then grown up)

Phone, 390 × 844:

```
┌──────────────────────────┐
│ Riviera (shell header)   │
│ [Velipojë & Shëngjin ②]  │ ← whole coast, z7.49
│                Near me   │
│      [3 beaches ④]  + −  │
│                          │
│                          │
│  sea   [Vlorë & Radhimë②]│
│           [⑨] [⑬]        │
│ ┌═══ (handle) ══════════┐│ ← sheet, peek 236 px
│ │[day ▾][beach ▾]    27 ││
│ │[▣ Folie Marine  €45  ]││ ← one row per screen, snapping
│ └───────────────────────┘│
│ Beaches · Bookings · Menu│ ← shell tab bar
└──────────────────────────┘
```

Desktop, from `md`:

```
┌──────────────────────────────────────────────┬──────────────────────┐
│                                              │[day ▾][beach ▾]  27  │
│  sea                    [3 beaches ⑥]        │ ▣ Bora Bora …   €12  │
│                          [④] Himarë          │ ▣ Rana Beach …  €15  │
│                              [€12]           │ ▣ Iliria Lido   €10  │
│                     [Sarandë ②]              │ ▣ Vollga …       €9  │
│                       [Pasqyra & Ksamil ④]   │ ▣ Golem Sands   €14  │
│                                              │ ▣ …                  │
└──────────────────────────────────────────────┴──────────────────────┘
        the map, best stretch (58 % at 1440)      the sheet as a column
```

Designed at 390 × 844 with a thumb. The map is the page and fills the screen between the
shell's header and tab bar; a **sheet** rides up from the bottom with the day, the beach and
the count on its first row and a **carousel** of compact rows under them, one per screen,
snapping. The settled row is the selected pin and the camera eases to it; a pin press selects
its row and opens the shipped preview over the map. The handle cycles peek → half → full, all
in the thumb's reach; half is a vertical list over the map, full is the list alone. Grown to
desktop the sheet unfolds into a 400 px column beside the map and the carousel becomes the
list, with the same selection sync. It replaces the shipped List/Map toggle: the first screen
has the map, the controls and at least one venue, at every size.

_Argument:_ one selection, two views of it, and the thumb never leaves the bottom third. It is
the only variant whose first phone screen holds the whole coast **and** a venue. Grown up, its
map is a landscape pane and inherits A's measurement: 58 % of the coast at 1440, 49 % at 1920.

## Judged on the same screenshots, both ways

`shots/` holds every variant at 1440 × 900, 1920 × 1080 and 390 × 844, plus the phone's second
screen (`*-open.png`: a venue open, or the sheet at half) and the desktop's (a venue open).

**Desktop-first three against the mobile-first one, on desktop.** D's desktop is A without the
scrubber: the same landscape pane, the same partial coast, a column instead of a shelf. B beats
both on the only measurement that matters here (the whole coast, with more room for venues),
and its third column uses the desktop's width for something a phone cannot do. C is the most
legible page of the four but the map is a supporting illustration, and a tourist who does not
know the names loses the map's one job: showing where the beaches are relative to each other.

**The mobile-first one against the desktop-first three, on the phone.** D wins outright: map,
controls and a venue on the first screen, whole coast, thumb reach. A's phone puts the
controls above the map and shows 81 % of the coast with the first venue below the fold. B's
phone halves the screen and shows 60 % of the coast above a list that scrolls in its own box,
which is two scroll regions on one screen. C's phone is a horizontal strip of names, a two-row
bay header and a 331 px map, then cards in a row: four stacked bands, none of them the map.

**Photo mass.** The compact rows (A's shelf, D's sheet) carry a 96 px mass that reads as "has a
photo" without dominating; B's 132 px band does the same with the mode chip on it; C's full
cards give the photo 3:2 and the page becomes a photo grid with a map beside it. C is the only
variant where the photos outweigh the map, which is the shipped page's problem restated.

## What I would ship

**Desktop: B, the coast spine.** The map goes on the left as a portrait strip whose width is
derived from the viewport height (the fit that frames the whole coast, capped at a third of the
window), never a constant. The list is the itinerary in coast order with the beach stops as
the grouping, and the "reading here" line ties the two. The pick column is the `xl`-only
extra, worth its own slice: the preview card plus the shipped canvas with the venue's real
rows would need the venue read API, which the fixture fakes.

**Phone: D, the thumb sheet.** The map is the page, the sheet carries the controls and one
venue at peek, and the settled carousel row is the selected pin. The List/Map toggle goes.
Open on the best stretch rather than the whole coast: 81 % of the coast with 25 of 27 pins
beats 100 % of it with the coast squeezed into the left third.

**Can one answer serve both?** Yes, and it is not a single layout but a single _model_: the
venues in coast order, one selection shared by the map and the list, and a pane whose camera is
derived from its box and the pins. B and D already share that model; what differs is where the
list sits. Below `md` the list is D's sheet over a full-bleed map; from `md` it is B's
itinerary beside a spine whose width the height decides. The two things not to carry across
are the ones each side is wrong about: a landscape pane on desktop (A and D-grown-up both lose
half the coast to it) and a two-pane split on a phone (B's phone halves both). The breakpoint
where the sheet becomes the spine is the one place a rule has to be written down, and the
measurement says where: the spine needs about 0.8 × the row's height in width and a list beside
it, so it is viable from roughly 900 px wide and wins from `md`.

## Findings that came out of the build, for the slice that graduates

- `fitView` must clamp to the pane's floor **and** then re-centre on the best stretch; a
  clamped fit centred on the pins' mean shows no pin (A, first pass).
- The pin layer and the map host both carry `rounded-[26px] overflow-hidden`; a full-bleed pane
  has to override both (`rounded-none!`).
- The sheet must stack above the pin layer's `z-[4]`, or place pills float over the cards.
- `appPanelGlass` is the dark header glass: white ink on it is invisible in porcelain. Stop
  labels and empty states take `appCardGlass` with the card ink.
- The shell header is sticky only from `sm`; the page measures it and sizes to the rest of the
  viewport (`--proto-top`), and adds the tab bar's 61 px below `sm`.
- `scrollIntoView` on a row also scrolls the window; reveal on the rail's own axis instead.
- `app.routes.spec.ts` counts lazy targets: 34 → 35 for this route. It comes back down when
  the branch is thrown away.
