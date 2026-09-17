# Prototype — overlapping venue pins (#1134)

**Throwaway.** Nothing in this folder merges to `main`. It holds the answer that graduated from
five: the **place pill hybrid**, chosen by the maintainer on 2026-09-17. The four it beat — A stack
& fan, B stack sheet, C tethered fan, D named pins — were deleted from this branch once the choice
was made; every one of them, with its screenshots and the measurements that judged it, is one commit
back (`6517fe95` on this branch, the five side by side), and the two earlier passes are the branches
`claude/prototype-1134-tailwind-angular-cd32pp` (A–C) and `claude/prototype-1134-variant-d-z5i3v1`
(A–D). The _decision_ is what graduates, rebuilt test-first through the normal loop.

> **The question:** when several venue pins crowd the same spot, how does the tourist reach any of
> them? On the real Discover page, over the real riviera map.

## Run it

```bash
cd frontend && npm run prototype:1134          # the dev server, no backend
cd frontend && npm run prototype:1134:shots    # against it: the screenshots + measurements below
```

No backend, no Postgres, no Docker. The script links `platform/map` into `public/` and the
`prototype` build configuration swaps `apiBaseUrl` to empty, so the dev server serves the real
MapLibre tiles itself; the venue list is `crowd-fixture.ts`, so no `/api` call is made at all.

| URL                         | What it opens on                                     |
| --------------------------- | ---------------------------------------------------- |
| `localhost:4200/?variant=E` | riviera-wide — the map's own opening view (zoom 8.6) |
| `…&at=19.6394,40.1483,16`   | **Dhërmi**: 3 venues ~20 m apart, at `maxZoom`       |
| `…&at=19.719,40.108,13`     | **Jale**: 5 venues along one bay                     |
| `…&at=20.0027,39.7674,14`   | **Ksamil**: a pair                                   |

`?variant=E` is what puts the page in prototype mode; the key is the one the hybrid grew from.

## The answer: a crowd is a place

`variant-place-pill.ts`, on the plumbing in `pin-crowding-prototype.ts` and the geometry in
`pin-crowding.ts`.

- **The crowd's pin says the place.** One pill in the map chrome's own skin — the priced pin's
  shape grown a name and a count — reading the beach (`Dhërmi`, `Jale & Livadh`, `3 beaches`), the
  crowd's own from-price (the least of its members', the same fact a lone pin carries) and, in an
  inverted disc, how many are there. A lone venue is production's priced pin, untouched.
- **Press a place to go there.** The camera eases (a cut under reduced motion) to the smallest zoom
  at which no two members bury each other, capped by `maxZoom` and by the box, and when every member
  is on one beach the **Beach filter follows**: the list beside the map — the List tab on a phone —
  becomes that beach's venues, the count block reads `5 venues`, and a `Jale ×` crumb on the map is
  the one press back to all of them. Where the members separate they are then ordinary priced pins,
  prices side by side. Where the crowd spans beaches (the nine at the opening view) the camera goes
  to the coast and the beaches come apart into their own places; a second press continues. Each
  press replaces the zoom levels the tourist would otherwise pinch through, and lands exactly.
- **Where there is nowhere closer, press through the venues.** At Dhërmi the members are 25 px apart
  at `maxZoom`; the pill knows (the separation zoom is where the camera already is), inverts, and
  reads `See each venue`. Its press narrows the filter to the beach and opens the first venue's
  preview at once — the same card a lone pin opens — and the pill becomes that venue's: its name,
  its price, `1/3`. Pressing again walks to the next venue at the spot, wrapping; the card carries
  the app's own dot-rail stepper doing the same. The map never leaves the screen.
- **Pills declutter by hanging, not hiding.** A pill sits centred on its place; one that would run
  over another pill, a lone pin or the box's edge hangs off its point to the right, then the left,
  and only then shows its count alone.
- **Keyboard parity is kept.** A crowd stays n real buttons in feed order, keyed by pin: the pill is
  the face member's button (the open one while a card is open, else the first), the others are
  invisible at the same spot until focused, and each opens its venue's preview directly. One element
  per member whatever it currently shows, so a press that changes its kind keeps focus — measured
  through a fit, a re-group and a filter narrowing.

Beneath the seam the map port carries three prototype additions — `project`, `onMove`, `easeTo` —
each ~6 lines per adapter. Above it, the page's `VenuePreviewCard` has an optional `stack` input
and a `stepped` output for the stepper, and `home.ts` owns the filter set, the crumb and ~40 lines
of wiring.

### Why this, in one paragraph

The opening view is where every tourist starts, and at production's pin width it is one blob of
nine venues across three beaches. A stack-and-fan spreads nine prices into a circle; a sheet lists
nine rows with three in view; a permanent fan recreates the overlap and lies about position by ten
kilometres; a press-again chip walks nine cards across the coast. Treating the crowd as a place and
going there is the only answer that fits that view, and it costs nothing the page did not have. At
a crowd no zoom can separate, the press-again chip was the best thing on a phone — one press to a
real card, the map still there — so the hybrid keeps exactly that, where and only where the camera
has nowhere closer to go. On a desktop the same press also leaves the list beside the map narrowed
to the beach: the chooser with every deciding fact, sets free included.

### The design pass, recorded

The `frontend-design` two-pass process, run before the first line of template.

**Plan.** _Subject:_ the riviera as a tourist first meets it — a coast of beaches, then a beach of
venues. _Colour:_ the map chrome's fixed pair only, `--riv-solid-btn-fill` / `-ink` / `-border`
(theme-invariant, on imagery), inverted for the "here" state exactly as `main` inverts a selected
pin; no accent on the map — the accent belongs to the glass surfaces and the list's selected outline.
_Type:_ the system stack; beach name 12.5 px / 600 (the card's location line); the from-price
11 px / 800 tabular — the pin badge's own weight one step down, so it reads as the same fact; the
count 12.5 px / 700 in a 26 px disc. _Layout:_ a single 44 px two-line pill centred on the place,
`Dhërmi` over `from €18`, the count disc at its right. _Principle:_ the crowd pill is the priced
pin's own shape grown a name; the memorable thing is the camera going where the tourist pressed.

**Review against the brief.** The generic answer to overlapping markers is a numbered cluster disc
whose press zooms in one step. Three things in the plan were that default and were changed: the disc
became a pill that names the place and its price; the zoom step became the _separation_ zoom,
computed per crowd, because a fixed step at Dhërmi zooms to nothing; and an end state was added for a
crowd zoom cannot separate, because the default has none. Cut in review: a tether or coin marking the
exact point (the fit makes it moot) and an extra glyph for the "here" state (the inverted skin plus
the copy carries it).

**Self-critique, after the first screenshots, and what it changed.** A pill at the box's edge
collapsed to a bare count — it now hangs off its point instead. The fit padded for pins, not pills,
and left a pill under the edge — the margin grew. The Beach filter set from the map had no way back
on the map — the crumb. And the first draft's end state at an inseparable crowd handed over to the
List tab, which on a phone left the map; the maintainer chose the press-again card there instead,
which is the hybrid.

## The evidence

`screenshots/`, all from the real map with the real riviera tiles, taken by `screenshots.mjs`. The
phone shots are 390 × 844 with the Map tab open.

| Shot                                                | What it shows                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `riviera-desktop.png`, `riviera-phone.png`          | the opening view: one lone priced pin (Radhimë) and three place pills — `3 beaches · from €16 · 9`, `Borsh & Qeparo`, `Ksamil` |
| `riviera-pressed-phone.png`                         | one press on the nine: the coast, `Dhërmi 3` and `Jale & Livadh · from €16 · 6` apart, Borsh and Qeparo alone                  |
| `jale-narrowed-phone.png`                           | three presses from the opening view: Beach = Jale, the crumb, five priced pins 69 px apart, the map kept                       |
| `jale-card-phone.png`                               | the fourth press: Blue Bay Jale's preview, production's own card                                                               |
| `jale-phone.png` → `jale-pressed-phone.png`         | the Jale case (zoom 13) before and after one press                                                                             |
| `ksamil-phone.png` → `ksamil-pressed-phone.png`     | the Ksamil pair (zoom 14) before and after one press: two priced pins 71 px apart                                              |
| `ksamil-desktop.png` → `ksamil-pressed-desktop.png` | the same on a desktop: after the press the list beside the map is the two venues                                               |
| `dhermi-phone.png`                                  | Dhërmi at `maxZoom`: the inverted `Dhërmi · See each venue · 3`                                                                |
| `dhermi-open-phone.png`                             | its first press: the crumb, the pill now `Havana Beach · from €24 · 1/3`, the card with its stepper                            |
| `dhermi-stepped-phone.png`                          | walked with the card's stepper: `Folie Marine · 2/3`                                                                           |
| `dhermi-open-desktop.png`                           | the same first press on a desktop: the card over the map, the list beside it narrowed to the three Dhërmi cards                |

Measured, not eyeballed (`npm run prototype:1134:shots` prints them):

| Measurement                                                        | Value                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A pin's rendered box (production's classes)                        | 57 × 44 for a two-digit euro price, 67 × 44 for three digits, 44 × 44 bare                                                                                         |
| The crowding rule (`crowds` in `pin-crowding.ts`)                  | the pills overlap: across, closer than half their widths together; down, closer than 44 px                                                                         |
| Dhërmi three at `maxZoom` 16, projected pin-to-pin                 | 25.5 px, 29.9 px, 37.1 px — under one finger and under half a pill; zoom 17 would separate them, the map stops at 16                                               |
| Opening view, 14 venues                                            | 3 crowds (`9`, `2`, `2`) and **1** solo pin: 13 of 14 venues crowded, nine in one blob spanning three beaches                                                      |
| Pills at the opening view, phone                                   | `3 beaches · from €16 · 9` 126 × 44; `Ksamil · from €21 · 2` 111 × 44, hung off its point at the edge; `Borsh & Qeparo · from €14 · 2` 166 × 44; Radhimë 57 × 44   |
| One press on the nine                                              | camera at the coast; `Dhërmi 3`, `Jale & Livadh 6`, Borsh and Qeparo alone; filter untouched (three beaches); **focus kept** on the pressed pill                   |
| Three presses from the opening view (`9` → `6` → `Jale 5`)         | Beach = Jale, `5 venues`, the `Jale ×` crumb, five priced pins, closest **68.7 px**; focus kept on the pressed pill, now Jale Beach Bar's pin                      |
| Opening view → a chosen Jale venue's card                          | 4 presses                                                                                                                                                          |
| The crumb                                                          | one press: Beach = all, `14 venues`, the crumb gone, focus on Near me                                                                                              |
| Ksamil (zoom 14), one press                                        | Beach = Ksamil, two priced pins **70.6 px** apart, focus kept; the card is the 2nd press, the funnel the 3rd                                                       |
| Dhërmi (`maxZoom`), first press, phone                             | Beach = Dhërmi, `3 venues`, Havana Beach's card open (**33 %** of the map), the pill now `Havana Beach · from €24 · 1/3`, focus on the card; the funnel is press 2 |
| Dhërmi, the pill's press-again, three times                        | Havana Beach → Folie Marine → Dhërmi Sun Club → Havana Beach; the card's `‹` steps the same way                                                                    |
| Dhërmi, first press, desktop                                       | Beach = Dhërmi, `3 venues`: the card over the map and the list beside it narrowed to the three cards                                                               |
| Focus on the `9` crowd's control, then a wheel zoom that splits it | same element, still focused, now reading `5 venues at Jale, from €16`                                                                                              |

## What the five looked like side by side, and why four went

Recorded here because the deleted code cannot say it. All numbers at production's pin width.

|                    | At the opening view (nine venues, three beaches, one blob)                                  | At Dhërmi (three venues, 20 m, inseparable)                            | Verdict                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A** stack & fan  | a fan of nine price pills in a circle, no names, a press at every zoom                      | a fan of three, never dissolves                                        | dropped                                                                                     |
| **B** stack sheet  | nine pills smeared under one count; a sheet of nine rows, three in view, half the phone map | the sheet: name, sets free, price side by side                         | dropped; its case was an inseparable crowd of four or more, which the fixture does not have |
| **C** tethered fan | a nine-pill ring around Himarë, 32 px from the next ring, ~10 km from the truth             | three pills tethered to the point — the nicest picture of the case     | dropped; a refinement, not an answer                                                        |
| **D** named pins   | `1/9 · Havana Beach` and a stepper over the whole coast                                     | one press to a real card, press again to walk, 33 % of the map covered | kept **as the hybrid's second half**, exactly where the camera has nowhere closer to go     |
| **E** place pill   | one press: the coast, beaches apart                                                         | first draft: `Open the list`, leaving the map on a phone               | kept as the frame; its end state replaced by D's                                            |

The second pass's own claims — the port's two additions, the flat pin-keyed loop, the opening
view's counts, Dhërmi's pixels, B's and D's coverage, C's rings — were checked one by one at the new
width in commit `6517fe95`'s README; every measurement held, the verdict (build D) did not, and the
flat-loop claim gained a clause: one element per pin **across its states**, or a pill turning into
a pin drops focus to `<body>`.

## What to settle when this is rebuilt test-first

1. **The crowd's order.** "First" and "press again" are feed order; the tourist would sort by sets
   free, then price. Decide once, in `pages/home/`, and the pill, the card's stepper and the list
   agree.
2. **The port's three additions** (`project`, `onMove`, `easeTo`) are the whole ask of the seam;
   the overlay owns the pins in light DOM and the engine draws none — so `MapPin.badge` and the
   engine's own venue-pin layer become the fallback, or go.
3. **The Beach filter as a map side effect.** The crumb makes it reversible on the map; the
   select still shows it. Decide whether a multi-beach crowd's press (no filter set) should set the
   Region instead.
4. **Sets free on the preview card**, the one deciding fact the list card has and the card lacks;
   worth doing whatever this issue does.

_Decision recorded on issue #1134._
