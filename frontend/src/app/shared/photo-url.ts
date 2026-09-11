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
 * each value describes the PAINTED photo — `min(boxWidth, boxHeight × aspect)` — and not the
 * element it sits in. The lightbox states its own; its under-service is a different defect.
 *
 * <p>A BANNER rendition is fit within 1280 × 480, so a height-bound upload stores a baseline
 * `480 × aspect` wide and paints `boxHeight × aspect`. The aspect cancels: the baseline candidate
 * suffices exactly when `boxHeight × DPR ≤ 480`, whatever was uploaded. Each value below is that
 * painted width for a 3:2 upload — the pair the fixtures and `e2e/venue-photo-candidates.e2e.ts`
 * pin — and holds up to 16:9 and to viewports of ~2000px; past either it overstates, which costs a
 * candidate rather than correctness. A value is viewport-relative: a `px` LENGTH throws
 * `RuntimeError 2952` (the `px` inside a media condition is not a length).
 */
export const CONTAIN_SIZES = {
  /** The band: 1098 × 264 from the 1024px step up and 730 × 150 below, painting 396 and 225 CSS px
   *  at 3:2. Only the tall box can need the retina candidate, and only at DPR 2. */
  band: '(min-width: 1280px) 30vw, (min-width: 1024px) 45vw, 35vw',
  /** The gallery hero: 731 × 360 above 1280, 485 × 360 down to 1024, 485 × 220 below, painting 540,
   *  485 and 330. The two outer clauses share a number for opposite reasons — the widest caps a
   *  painted width that stops growing, the narrowest holds a box that can never need retina. */
  galleryHero: '(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, 35vw',
  /** A gallery side tile: 361 × 176 above 1280 and 239 × 106 below, painting 264 and 159. It never
   *  needs the retina candidate; the 1280px clause is what keeps a wide desktop from buying one. */
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
