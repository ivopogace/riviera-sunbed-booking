# Where does the riviera map belong on Discover?

Spike branch `claude/riviera-map-desktop-spike-o30wyv`. Route:
`/prototype/map-desktop?variant=<a|b|c|d>&venue=<id>&date=<iso>`. Fixture: 26 venues placed a few
hundred metres off the real catalogue beach centres (`shared/beaches.ts`), Velipojë to Ksamil.
Nothing here ships; it answers one design question and gets torn down.

## 1. The question, with real measurements

The shipped Discover page (`pages/home/home.html`) caps at **1080px**, gives the map **42%** of
that width below a headline hero, and on phone drops the map entirely behind a List/Map toggle —
the first screen is a headline and three `<select>`s, no map, no venue.

The riviera coast itself is not a blob you can frame with one rectangle: it is a **230km ribbon**
running roughly north–south, with a jog east around Durrës. Measuring the fixture's own 26-pin
bounding box (`camera.ts`'s `pinBounds`) gives **lng 19.398–20.008 (0.61°) × lat 39.772–41.849
(2.08°)** — a box more than **3× taller than it is wide**. That mismatch, not any styling choice,
turns out to be the single biggest fact this spike surfaced. Measured pane sizes and the zoom
`fitBounds` (Web-Mercator tile math, `camera.ts`) derives for each, using MapLibre's own
"never crop" rule (the smaller of the two axis zooms wins):

| Pane                                  | Measured box (getBoundingClientRect) | zoom if fit by width | zoom if fit by height               | zoom used                |
| ------------------------------------- | ------------------------------------ | -------------------- | ----------------------------------- | ------------------------ |
| Variant A/D map pane, 390×844         | 390×844                              | 9.62                 | 8.67                                | **8.67**                 |
| Variant A/D map pane, 1440×900        | 1440×900                             | 11.65                | 8.77                                | **8.77**                 |
| Variant A/D map pane, 1920×1080       | 1920×1080                            | 12.08                | 9.05                                | **9.05**                 |
| Variant B coastal strip, 390px wide   | 342×220                              | 9.40                 | 6.46 → clamped to **7** (`minZoom`) | **7**                    |
| Variant B coastal strip, ≥1024px wide | 1352×220                             | 11.55                | 6.46 → clamped to **7**             | **7**                    |
| Variant C wall, any width             | 4400×(pane height)                   | 13+                  | 8–9                                 | fit per column (see §3c) |

Two things fell out of actually measuring this instead of copying `RIVIERA_MAP_OPTIONS.view`
(zoom 8.6, hand-authored for the shipped page's own 58/42 pane):

- **A wide pane does not buy you a _tighter_ view of the coast — it buys you more of Albania.**
  Because the coast's own box is tall and narrow, fitting it into anything wider than ~0.3:1
  (height:width) is height-constrained, and the _spare_ width is filled with real map content —
  inland Albania (Elbasan, Fier, Berat all show up at 1440×900) — not blank space. Going from
  1440×900 to 1920×1080 barely changes the zoom (8.77 → 9.05) because both are height-bound by
  the same 2.08° of latitude; the extra width just shows more Tirana-ward interior.
- **A short, wide "coastal strip" pane (variant B) is the worst-shaped pane for this coast.** At
  220px tall, the height-driven zoom for the pins' own box (6.46) is _below_ the map's own
  `minZoom: 7` fence (ADR-0022) — the fence itself becomes the binding constraint, not the pane.
  The strip is forced one notch wider than the pins need, and shows _more_ inland relative to its
  own height than either variant A/D pane does. A short-and-wide pane is fighting the coast's
  actual shape, not framing it.
- **Variant C's wall — long and thin, matching the coast's own aspect — is the only pane shape
  measured here that does NOT force this tradeoff.** A 4400px-wide, page-height column lets the
  fit be width-bound in short local segments instead of height-bound across the whole coast, so
  each visible slice zooms in close enough to actually separate individual venues (confirmed by
  screenshot: the Shkodër/Lezhë opening screen shows real coastline and two venue clusters, not a
  regional highway map).

None of this shows up by _reading_ `RIVIERA_MAP_OPTIONS` — it only shows up by fitting the actual
pin set through the actual measured pane, which is what `camera.ts`'s `fitBounds` does for every
variant here instead of importing the shipped constant.

## 2. Four variants

### Variant A — "Map canvas" (desktop-first)

```
┌───────────────────────────────────────────┬──────────┐
│                                     [date] │ Velipojë │
│                                    capsule │ Shëngjin │
│                MAP, full bleed             │ Patok    │
│                (100% of viewport)          │ Lalëz    │
│                                             │ Durrës   │
│                                             │  ...     │
└───────────────────────────────────────────┴──────────┘
```

The inversion of shipped: no hero, no headline, the map IS the page from the first pixel. The
list becomes a 380px glass rail floating over the map's right edge. **Argument:** a tourist who
already decided to go to the beach doesn't need to be sold the beach again with a headline — they
need the map, immediately, at full size. The rail's cards are the same weight as shipped's cards,
just narrower.

### Variant B — "Coastal ledger" (desktop-first)

```
┌─────────────────────────────────────────────────────┐
│  The Albanian riviera, coast to coast                │
│  26 venues · 2026-07-15                              │
├─────────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓ coastal strip, 220px tall ▓▓▓▓▓▓▓▓▓▓▓▓  │
├──────┬────────────────────┬───────┬──────┬───────────┤
│ photo│ Venue              │ Beach │ From │ Free│Mode  │
│ ...  │ (dense ledger rows)│       │      │     │      │
└──────┴────────────────────┴───────┴──────┴───────────┘
```

The map demoted to an **orientation strip**; the actual comparison work happens in a dense,
scannable table. **Argument:** once you've decided "the beach," picking _which venue_ is a
comparison task (price, availability, mode) that a spatial UI is bad at and a table is good at —
this is the "map answers where, table answers which" split, and per §1 it is also the worst-shaped
pane for this particular coast, which the screenshots confirm (more inland per pixel of height
than any other variant).

### Variant C — "The wall map" (desktop-first, the swing)

```
┌──────────────────────────────────────────────────────┐
│ The riviera, unrolled          Scroll to travel →     │
├──────────────────────────────────────────────────────┤
│ SHKODËR   LEZHË   DURRËS   VLORË   HIMARË   SARANDË   │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  one continuous 4400px-wide map, venues at their real  │
│  spot on it — scroll horizontally to travel the coast  │
└──────────────────────────────────────────────────────┘
```

No list. No table. Not even a synced rail — the page **is** a coastal atlas poster, the length of
the coastline rather than the shape of a viewport. Region names are the only wayfinding device,
plain labels over the map rather than a nav bar. **Argument:** this is the one shape that actually
matches what §1 measured about the coast's own geometry, and it is deliberately not what any
map-search product does — closer to a printed coastal chart than a results page. The cost: a
WebGL canvas 4400px wide logged "canvas larger than maxCanvasSize" on this browser/GPU
combination — a real constraint a shipped version would need to solve (segment the canvas, or
virtualize which stretch is mounted) rather than one huge `<canvas>`.

### Variant D — "Pocket coast" (**mobile-first**)

**Phone wireframe (390×844, designed first):**

```
┌─────────────────┐
│                 │ ← map fills the screen behind everything
│       MAP       │
│                 │
│   ╭───────────╮ │
│   │  ▬ (drag) │ │ ← rail, bottom 38% of screen
│   │ 26 venues │ │
│   │ [ph][ph]→ │ │ ← horizontal snap-scroll filmstrip
│   ╰───────────╯ │
└─────────────────┘
```

**Desktop wireframe (grown up, never shrunk down):**

```
┌──────────┬────────────────────────────┐
│ Velipojë │                            │
│ Shëngjin │           MAP              │
│ Patok    │      (majority of the      │
│ Lalëz    │       viewport width)      │
│  ...     │                            │
└──────────┴────────────────────────────┘
```

Designed at 390×844 first: map fills the whole screen, a glass rail is docked to the bottom third
as a **horizontally snap-scrolling filmstrip** — no List/Map toggle, nothing to switch, map AND at
least one venue card both on the very first screen (confirmed by screenshot). A drag-handle button
expands the rail to a full vertical list (the second screen state, also screenshotted) without
ever hiding the map. **Grown to desktop:** the exact same rail becomes a left-docked vertical
column and the map — one instance, never duplicated — just gets the room a wide viewport can spare
via `lg:flex-row-reverse`, matching variant A's map-first instinct but arrived at from the phone
outward rather than the desktop inward.

## 3. What the screenshots actually showed

Screenshots: `1440×900`, `1920×1080`, `390×844` for all four, plus variant D's expanded second
screen, all with real MapLibre + pmtiles rendering (`scripts/serve-map-tiles.mjs`, `platform/map/`).

- **§1's finding is visible, not theoretical.** Every desktop screenshot of variants A and D shows
  roughly the western third of the frame as sea + coast with venue pins, and the eastern two-thirds
  as inland Albania (Elbasan, Fier, Berat, Gramsh all legible at 1440×900). This is not a bug in
  the fixture — it is what fitting this coast's real bounding box into a 16:10-ish pane produces,
  confirmed identically at both 1440×900 and 1920×1080.
- **Variant B's strip is the visually weakest surface of the four.** At 220px tall it shows the
  _most_ inland proportionally (per §1, its own height-driven zoom is below the map's `minZoom`
  fence, so the fence — not the pins — sets the camera). The ledger below it is the strongest part
  of that screen; the strip reads as decoration more than orientation.
- **Variant C's opening screen is the most legible "this is a coastline" image of the four** — the
  Shkodër/Lezhë stretch at the fit-per-segment zoom shows real coast shape, a lagoon, two
  place-pills. It is also the only variant whose screenshot could not exist as a single static
  image — its whole premise is the horizontal scroll, which a screenshot can only sample one frame
  of.
- **Variant A fails completely at 390×844**, exactly as expected for a desktop-first design not
  built for the width: the 380px fixed-width rail consumes the entire phone viewport, leaving a
  sliver of map down the left edge. This is the deliberate "judge the desktop-first variants on
  phone screenshots too" check working as intended — it demonstrates _why_ mobile needs its own
  answer rather than a shrunk desktop one.
- **Variant D is the only variant that looks intentional at all three sizes without modification**
  — 390×844 shows map + two card edges on the very first paint; the expanded second screen shows a
  full vertical list with the map still visible above it; grown to 1440×900 and 1920×1080 it reads
  as a calmer, wider-mapped cousin of variant A rather than a different product.
- **The theme-invariant "solid button" skin (`--riv-solid-btn-*`) matters more than expected.**
  The first pass used `appPanelGlass` + `text-white` for floating chrome over the map (variant A's
  date capsule, variant C's header/region pills, variant D's rail) — `appPanelGlass` is a LIGHT
  frosted glass in the default `porcelain` theme (only dark in `riviera`/`dark`), so white text on
  it was invisible in every screenshot until switched to the theme-invariant solid-button pair
  riviera-map's own chrome already uses for exactly this reason.

## 4. What to ship

**Desktop:** variant A's inversion (map-first, list-as-rail) is the strongest default — it is the
one both closest to "already decided to go to the beach, now show me where" and the one that reads
as intentional rather than compromised at both measured widths. Variant C is the more interesting
answer to "what would this look like if we designed from the coast's real shape instead of a
generic map-search template," and is worth prototyping further as an alternate _entry point_
(a "browse the coast" mode) rather than the default — its horizontal-scroll-only navigation and
the WebGL canvas-size ceiling are real costs a one-shot spike doesn't have to solve but a shipped
version would. Variant B's ledger is a genuinely good comparison surface but should keep its table
and drop the strip — a plain regional map (variant A's shape, smaller) serves the "where" question
better than a short, badly-shaped strip does.

**Phone:** variant D, close to as built. It is the only one of the four that treats the phone as
the real target rather than a squeezed desktop, and it directly satisfies the brief's phone
requirement (map + venue both on screen one, no List/Map toggle) that the shipped page fails today.

**One answer for both, or diverge?** They should diverge, but from a **shared spine**: one map
instance that fills whatever space it's given, one venue-card shape, one camera-fitting function
(`camera.ts`) — and then let the _rail's position and shape_ be the one thing that's genuinely
different per breakpoint (right-docked overlay on desktop's variant A, bottom-docked filmstrip on
phone's variant D), exactly as variant D's own "grown to desktop" section demonstrates. That is a
smaller change than it sounds: variant D's desktop layout and variant A's are already the same
map-first shape: the two variants have effectively already converged on one answer, arrived at
from opposite ends.
