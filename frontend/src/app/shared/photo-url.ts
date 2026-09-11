import { environment } from '../../environments/environment';

import { CoverPhotoView, PhotoView } from './venue-views';

/**
 * Resolve a photo serving path from the API (`/api/venues/{id}/photos/{hash}`) against the API
 * origin. The backend hands out root-relative paths; in production the app is
 * served same-origin (`apiBaseUrl` is `''`) so this is a no-op — but in local dev the API
 * lives on another origin (`localhost:8080`), and an unprefixed `<img src>` would resolve against
 * the Angular dev server and 404. Applied once, at the HTTP-service boundary, so components and
 * templates keep treating photo URLs as opaque strings.
 */
export function apiPhotoUrl(path: string): string {
  return environment.apiBaseUrl + path;
}

/** {@link apiPhotoUrl} over every candidate of a photo, baseline URL included. */
export function apiPhotoView(photo: PhotoView): PhotoView {
  return {
    url: apiPhotoUrl(photo.url),
    sources: photo.sources.map((source) => ({ ...source, url: apiPhotoUrl(source.url) })),
  };
}

/** {@link apiPhotoView} over a summary/map view's cover pair; `null`/absent passes through. */
export function resolveCoverPhoto(cover: CoverPhotoView | null | undefined): CoverPhotoView | null {
  return cover ? { card: apiPhotoView(cover.card), banner: apiPhotoView(cover.banner) } : null;
}

/**
 * The `sizes` the beach-map band and the gallery grid state. Both letterbox (`object-contain`), so
 * each value approximates the PAINTED photo — `min(boxWidth, boxHeight × aspect)` — rather than the
 * element it sits in. The lightbox states its own; its under-service is a different defect.
 *
 * <p>A BANNER rendition is fit within 1280 × 480 at scale 1 and 2560 × 960 at scale 2, each tier
 * into its OWN box — so the retina width is not the baseline doubled, and a 3:2 upload stores
 * 720w/1440w where a 16:9 one stores 853w/1707w. Where the box is height-bound the paint is
 * `boxHeight × aspect`, the aspect cancels, and the baseline candidate suffices exactly when
 * `boxHeight × DPR ≤ 480`; where it is width-bound the paint is narrower again, so that test is
 * safe there rather than tight.
 *
 * <p>The bound these values are measured to hold to: aspects 3:2 through 16:9, viewports to
 * 2560px, DPR 1 and 2 on every surface, and DPR 3 as well on the gallery hero below its
 * `min-[1024px]` step. Three things sit outside that bound. Past 8:3 both tiers are width-bound
 * at 1280w/2560w, stop following the aspect, and the rule stops holding. The hero's 360px box at
 * DPR 3 is ladder-limited — a 3:2 upload is 1% short from 1024 and 11% short from 1280, reachable
 * only by a wider stored rendition, which #1070 weighs. And narrower than 3:2 the hero's cap buys
 * a wider candidate than DPR 1 or DPR 2 needs (a 2:3 portrait upload takes its retina candidate
 * from 540px viewports at DPR 1), which is an unavoidable trade rather than a mistuning: covering
 * 3:2 at DPR 3 needs more than 240 CSS px above a 240px viewport, and leaving 1:1 alone at DPR 2
 * needs 240 or less up to 686 — the two cannot both hold in one aspect-blind value.
 *
 * <p>No bare `px` LENGTH: one opening a value, or following `") "` or `", "`, throws
 * `RuntimeError 2952`. A `px` in a media condition is not a length at all, and one inside a CSS
 * math function passes only because that guard's regex never looks just after `(` — a gap in the
 * regex, not a promise in the API, and `photo-slideshow.spec.ts` is what turns red if a later
 * release closes it.
 */
export const CONTAIN_SIZES = {
  /** The band: 1098 × 264 above 1280, 730 × 264 down to 1024, 150 tall below in a box that narrows
   *  with the viewport under 780 — painting 396 and 225 CSS px at 3:2, 469 and 267 at 16:9. Only the
   *  264px box can need retina, at DPR 2, and BOTH clauses over it stay large enough to buy it. */
  band: '(min-width: 1280px) 36vw, (min-width: 1024px) 45vw, 35vw',
  /** The gallery hero: 731 × 360 above 1280, 485 × 360 down to 1024, 220 tall below in a box that
   *  narrows with the viewport under 780 — painting 540, then 485 width-bound, then a 3:2 upload's
   *  330 (220 × 1.5). The widest clause caps a box that stops growing at the 1100px breakout; the
   *  middle one holds a box that cannot need retina at DPR 2. The narrowest is capped at the PAINT,
   *  because below 1024 the paint stops at 330 while a `vw` keeps climbing, and no bare coefficient
   *  both reaches DPR 3 and leaves DPR 2 on the baseline. 330 is the 3:2 figure; a 16:9 upload
   *  paints 391 in the same box and is still covered, because its own baseline is 853w rather than
   *  720w — not because 330 describes it. The cap's price: from roughly 364 to 412 CSS px at DPR 3
   *  a 3:2 upload takes 1440w where 720w covered its 240 CSS px paint. */
  galleryHero: '(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, min(330px, 66vw)',
  /** A gallery side tile: 361 × 176 above 1280, 239 × 176 down to 1024, 106 tall below and narrower
   *  with the viewport under 780. At DPR 1 and 2 it never needs the retina candidate, and the
   *  1280px clause is what says so — to the engines that read it. Chromium is not one: the tiles
   *  are lazy, so its `auto` prefix wins and it sizes against the 361px box, which asks 723 device
   *  px at DPR 2 and so buys retina off a 3:2 upload's 720w baseline, though not off a wider
   *  upload's. */
  gallerySideTile: '(min-width: 1280px) 18vw, 22vw',
} as const;

/**
 * A photo's candidates as an HTML `srcset` with width descriptors, or `null` with fewer than two —
 * a one-candidate `srcset` says nothing `src` does not, and the attribute is then better absent.
 *
 * Width descriptors rather than `1x`/`2x`: the browser pairs them with `sizes` (which
 * `NgOptimizedImage` fills as `auto, 100vw` on a lazy `fill` image) and picks against the box it
 * actually laid out, which is the only thing that can size an `auto-fill` grid correctly.
 */
export function photoSrcset(photo: PhotoView): string | null {
  return photo.sources.length > 1
    ? photo.sources.map((source) => `${source.url} ${source.width}w`).join(', ')
    : null;
}

/**
 * A tourist surface's photos: the view's `photos` when present, else the chosen cover
 * surface alone (older payloads/doubles omit `photos` — a compatibility shim), else empty — the
 * gradient placeholder renders instead. The Discover card picks `card`, the venue page `banner`.
 */
export function slideshowPhotos(
  view: { readonly photos?: readonly PhotoView[]; readonly coverPhoto?: CoverPhotoView | null },
  coverSurface: keyof CoverPhotoView,
): readonly PhotoView[] {
  if (view.photos?.length) {
    return view.photos;
  }
  return view.coverPhoto ? [view.coverPhoto[coverSurface]] : [];
}
