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
 * <p>A BANNER rendition is fit within 1280 × 480, so an upload no wider than 8:3 stores a baseline
 * `480 × aspect`. Where the box is height-bound the paint is `boxHeight × aspect`, the aspect
 * cancels, and the baseline candidate suffices exactly when `boxHeight × DPR ≤ 480`; where it is
 * width-bound the paint is narrower again, so that test is safe there rather than tight. Each
 * value buys the right candidate from 3:2 to 16:9, to ~2000px viewports, and at DPR 1 and 2.
 * Narrower or shorter it over-fetches, costing bytes; wider it under-fetches, costing sharpness;
 * past 8:3 the baseline caps at 1280 and the rule stops holding; and DPR 3 wants a rendition ladder
 * finer than two, which the tracker carries as its own slice. Viewport-relative only: a `px` LENGTH
 * throws `RuntimeError 2952` (the `px` in a media condition is not a length).
 */
export const CONTAIN_SIZES = {
  /** The band: 1098 × 264 above 1280, 730 × 264 down to 1024, 730 × 150 below — painting 396 and
   *  225 CSS px at 3:2, 469 and 267 at 16:9. Only the 264px box can need the retina candidate, and
   *  only at DPR 2, which is what the widest clause stays large enough to buy for a 16:9 upload. */
  band: '(min-width: 1280px) 36vw, (min-width: 1024px) 45vw, 35vw',
  /** The gallery hero: 731 × 360 above 1280, 485 × 360 down to 1024, 485 × 220 below — painting
   *  540, then 485 width-bound, then 330. The two outer clauses share a number for opposite
   *  reasons: the widest caps a box that stops growing, the narrowest holds one that cannot need
   *  retina. */
  galleryHero: '(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, 35vw',
  /** A gallery side tile: 361 × 176 above 1280, 239 × 176 down to 1024, 239 × 106 below. It never
   *  needs the retina candidate, and the 1280px clause is what says so — to the engines that read
   *  it. Chromium is not one: the tiles are lazy, so its `auto` prefix wins and it sizes against
   *  the 361px box, which asks 723 device px at DPR 2 and so buys retina off a 3:2 upload's 720w
   *  baseline, though not off a wider upload's. */
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
