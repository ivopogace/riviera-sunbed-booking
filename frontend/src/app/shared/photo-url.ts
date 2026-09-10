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
 * A tourist surface's slideshow photos: the view's `photos` when present, else the chosen cover
 * surface alone (older payloads/doubles omit `photos` — a compatibility shim), else empty — the
 * gradient placeholder renders instead. The Discover card picks `card`, the beach-map band `banner`.
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
