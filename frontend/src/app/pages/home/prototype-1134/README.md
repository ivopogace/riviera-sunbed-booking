# Prototype — overlapping venue pins (#1134)

**Throwaway.** Nothing in this folder merges to `main`. It lives on `claude/prototype-1134-tailwind-angular-cd32pp`
so the variants stay a primary source; the _decision_ is what graduates, rebuilt test-first through
the normal loop.

> **The question:** when several venue pins crowd the same spot, how does the tourist reach any of
> them? Three variants, on the real Discover page, over the real riviera map.

## Run it

```bash
cd frontend && npm run prototype:1134
```

No backend, no Postgres, no Docker. The script links `platform/map` into `public/` and the
`prototype` build configuration swaps `apiBaseUrl` to empty, so the dev server serves the real
MapLibre tiles itself; the venue list is `crowd-fixture.ts`, so no `/api` call is made at all.

| URL                         | What it opens on                                     |
| --------------------------- | ---------------------------------------------------- |
| `localhost:4200/?variant=A` | riviera-wide — the map's own opening view (zoom 8.6) |
| `…&at=19.6394,40.1483,16`   | **Dhërmi**: 3 venues ~20 m apart, at `maxZoom`       |
| `…&at=19.719,40.108,13`     | **Jale**: 5 venues along one bay                     |
| `…&at=20.0027,39.7674,14`   | **Ksamil**: a pair                                   |

`←`/`→` or the floating bar walk the variants; the bar is gated out of production builds.

## The three

|                                 | Idea                                                                         | Primary affordance     |
| ------------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| **A** `variant-stack-fan.ts`    | Merge the crowd into a counted disc; fan it open on a press                  | press the count        |
| **B** `variant-stack-sheet.ts`  | Leave every pin where it is; a press resolves to a _set_, answered by a list | press the blob         |
| **C** `variant-tethered-fan.ts` | Push crowded pins apart permanently, tethered to their true point            | press the one you want |

## The evidence

`screenshots/`, all from the real map with the real riviera tiles:

| Shot                                 | What it shows                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `a-riviera-view.png`                 | the opening view: 14 venues collapse to `3` / `6` / `2` / `2` and four solo pins |
| `a-fanned.png`, `a-fanned-phone.png` | A opened — and five identical dots with nothing to choose between                |
| `b-riviera-view.png`                 | B: the untouched pins, smearing into each other, each crowd badged               |
| `b-sheet-phone.png`                  | B's sheet on a phone — the one variant that carries price and availability       |
| `c-riviera-view.png`                 | C at the opening view: adjacent fans overlapping, the defect recreated           |
| `c-dhermi-maxzoom.png`               | C at its best: the Dhërmi three, resolved inline, one press each                 |

## What the prototype settled

### 1. The engine port needs two things it does not have (and that is all it needs)

`project(lngLat) → {x, y}` and `onMove(handler)`, added here to `shared/map-engine.ts` and both
adapters. Roughly eight lines per adapter — MapLibre already has `map.project` and a `move` event.
No variant is possible without both: whether two pins crowd each other is a property of the camera,
not of the coordinates.

### 2. The "re-adding a marker detaches its element" constraint dissolves

The issue records it as a constraint any fix must answer. It does not have to be answered — it has
to be **left behind**. All three variants draw the pin layer as an ordinary Angular overlay in light
DOM at projected coordinates (`pin-crowding-prototype.ts`), handing the engine no markers at all.
`@for … track pin.id` then keeps a pin's element across every re-group, so focus and keyboard order
survive a camera move for free. The engine keeps the basemap, the camera and the gestures.

This also keeps `MapPin` free of venue vocabulary: the chooser lives in `pages/home/`, where the
`VenueCard` already is, and never reaches into `shared/riviera-map.ts`.

### 3. Zooming cannot fix this — confirmed, not assumed

At `maxZoom` 16 the three Dhërmi venues still project 22 px apart. A "press to zoom in" answer is
refuted by the map's own fence, which is why no variant uses one.

### 4. The scale is worse than the issue says

With 14 venues the opening view produces **4 crowds and 4 reachable pins**. Crowding is not an edge
case on this map, it is the default rendering.

## Verdicts

**A — Stack & fan.** Honest before the press: the count is visible, and the stacked-disc silhouette
reads as "more than one" before anyone parses the numeral. Works identically at every zoom. Two
faults, both structural: it **never dissolves** — standing on Dhërmi beach at `maxZoom` you still
get a `3` and still pay a second press — and the fanned pins are **five identical dots**, so the
press reveals rather than informs. The tourist still cannot choose; they can only look. Hanging
names or prices off the fanned pins collides at n ≥ 4.

**B — Stack sheet.** The only variant where the tourist can actually **decide**: name, sets free and
price sit side by side, at row heights a thumb cannot miss. It is also the only one with no map
geometry at all — nothing is moved, merged or re-added, so there is no focus problem, no jitter, and
no interaction with neighbouring crowds. It answers the report as reported. Cost: the sheet covers
about half the map on a phone, and the choice happens in a list — the surface the tourist opened the
map to get away from.

**C — Tethered fan.** Best in the world where the tourist actually is. Zoomed into one beach it is
excellent: five pins, one press each, tethers keeping the displacement honest, and the treatment
appears and disappears on its own as the crowd forms and breaks. At the riviera-wide view it
**collapses**: one fan pass does not know about the fan next to it, so adjacent crowds' rings
overlap and recreate the very defect — pins that cannot be pressed. Fixing that needs iterative
relaxation across all crowds at once, which is a large step up in cost and makes pins drift as the
camera moves.

### Recommendation

**Build B. Consider C later, fenced.**

B alone answers the reported defect, carries the facts a tourist needs to choose, and touches no map
geometry, so it can ship without the port's projection ever being wrong. C is the better experience
where it works, and it is worth revisiting as a refinement once B exists — but only fenced to a
crowd that is small (n ≤ 3) _and_ isolated (no other crowd within its ring), with B as the answer
everywhere else. A should be dropped: it charges a press at every zoom and still does not let anyone
choose.

Two things to fix when B is rebuilt properly, both visible in the prototype: cap the sheet's height
so it never takes more than about a third of the map on a phone, and give the crowd's hit target a
visible edge — the count badge alone does not say "this whole blob is one press".

_Verdict recorded on issue #1134._
