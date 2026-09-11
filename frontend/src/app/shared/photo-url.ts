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
 * The `sizes` every `object-contain` photo surface authors, kept together because not one of them
 * is readable at its call site. A contain-fitted element paints `boxHeight × sourceAspect` rather
 * than its own width, so each value below describes the LETTERBOXED image and was derived from
 * boxes measured in a real engine — a `sizes` describing the element instead bought the retina
 * candidate for images the baseline one already covered.
 *
 * <p>Two rules hold for anything added here. The length is viewport-relative: a `px` length throws
 * `RuntimeError 2952` from `NgOptimizedImage`'s dev-mode guard, which is live on these surfaces
 * because they supply `[attr.srcset]` rather than `ngSrcset` (the `px` inside a media condition is
 * not a length and is fine). And the value is constant per instance, which
 * `assertNoPostInitInputChange` requires. Which candidate each one buys is pinned in
 * `frontend/e2e/venue-photo-candidates.e2e.ts`.
 *
 * <p>Every clause aims at the painted width and, above all, inside the window the stored candidate
 * pair leaves: with only a 720w and a 1440w rendition, `360 < value ≤ 720` CSS px is what takes the
 * baseline at DPR 1 and the retina one at DPR 2, and `value ≤ 360` is what takes the baseline at
 * both. Tuned to a 16:9 upload and to viewports up to ~2000px; outside either the value overstates
 * again, which costs a candidate rather than correctness.
 */
export const CONTAIN_SIZES = {
  /** The beach-map band: 1098 × 264 above the 1024px step and 730 × 150 below, so a 16:9 photo
   *  paints ~470 CSS px and ~267 px respectively — never the ~1008 px its width claimed. */
  band: '(min-width: 1280px) 30vw, (min-width: 1024px) 45vw, 35vw',
  /** The gallery hero, two of three columns: ~640 CSS px painted in a 731px box above 1280, ~485 px
   *  in a 485px box below it, where the grid drops to the narrower breakout. */
  galleryHero: '(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, 55vw',
  /** A gallery side tile, one column: it paints under 360 CSS px at every viewport, so it wants the
   *  baseline candidate at both densities and one clause says so. */
  gallerySideTile: '22vw',
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
