# Per-photo width ladder for venue photos

Venue photos stay modelled as **renditions into named per-surface boxes**
(`CARD`, `BANNER`, `PREVIEW`, keyed with a density `scale`). They will not be
collapsed into a single per-photo ladder of widths.

## What was proposed

Stop modelling "a variant per UI surface" and model "a ladder of widths per photo"
instead. The browser already picks by width from a `srcset`, so the surface looks like
a backend concept the tourist path no longer needs. It would have deleted
`JdbcVenueCatalog`'s `CARD_SLIDESHOW` / `BANNER_SLIDESHOW` preference lists, `coverOf`'s
complete-pair guard, and the `(surface, scale)` key itself.

## Why this is out of scope

**The simplification it claims does not follow.** The case for the ladder was that four
venue-page consumers — the beach-map band, the gallery hero, the gallery tile and the
lightbox — span 356 px to 1100 px while sharing one server-chosen variant. They share a
candidate *list*, and the browser already picks per rendered box from it. A ladder is also
one shared list picked by width. The behaviour is identical under both models.

What actually goes wrong on that band is that its `sizes` attribute describes the band
rather than the `object-contain` image painted inside it. That bug is present under either
model and is fixed on its own in #1069.

**The one real defect it would have fixed is cheaper to fix directly.** Ladder rungs
preserve the source aspect, whereas a fixed box clamps on its binding axis — which is a
genuine advantage, and the reason this was not a trivial rejection. `BANNER` is 1280 x 480,
so a 2:3 portrait upload is stored at 640 x 960 and then stretched almost 2x across the
lightbox at DPR 2. A near-square `LIGHTBOX` surface of 2200 x 1800 wins exactly the same
pixels: 2200 x 1467 for landscape, 1200 x 1800 for portrait, both an exact DPR-2 match.

The two routes to that outcome are not comparable in cost:

| | Ladder remodel | `LIGHTBOX` surface (#1070) |
|---|---|---|
| Portrait lightbox at DPR 2 | fixed | fixed |
| Files touched | every photo read model, both view records, the frontend mirror, a migration | one migration, one processor constant, one read-model line |
| Other surfaces disturbed | all of them | none |
| Rendered pixels changed by the remodel itself | none | n/a |

Both are equally un-backfillable, since ADR-0008 discards the full-res original at upload.

**The remodel changes no rendered pixel on its own.** Stripped of the two arguments above
it is a rename plus a rewrite of both view records and every read model, paid for by
deleting two constants and one null guard.

```java
// The whole simplification the ladder would have bought, in JdbcVenueCatalog:
private static final List<PhotoSurface> CARD_SLIDESHOW =
        List.of(PhotoSurface.CARD, PhotoSurface.PREVIEW);
private static final List<PhotoSurface> BANNER_SLIDESHOW =
        List.of(PhotoSurface.BANNER, PhotoSurface.CARD, PhotoSurface.PREVIEW);
```

## What would reopen this

Surfaces multiplying past the point where the preference lists stay readable. One new
surface (`LIGHTBOX`) is a vocabulary entry; four more would be a ladder wearing names, and
the balance above flips. ADR-0008's object-storage flip would also change the arithmetic,
since an on-demand resizer behind a CDN makes rung count nearly free and would make
`IMAGE_LOADER` the right seam after all.

## Prior requests

- #1059: "Decide whether photo surfaces should collapse into one per-photo width ladder"
  (deferred out of the #1041 review gate, closed after the intake grill measured it)
