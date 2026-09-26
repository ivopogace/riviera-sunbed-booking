import { environment } from '../../environments/environment';

import { CoverPhotoView, PhotoView } from './venue-views';

/**
 * Prefix an API photo path with the API origin — a no-op same-origin in prod, but in dev an
 * unprefixed `<img src>` hits the Angular dev server and 404s. Apply once, at the HTTP-service
 * boundary; everything downstream treats photo URLs as opaque.
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
 * Letterboxed `sizes`, approximating the PAINTED photo; BANNER@1 fits if `boxHeight × DPR ≤ 480`
 * (held for 3:2–16:9 at DPR ≤ 2; ADR-0008). No bare `px` length (`RuntimeError 2952`); `px` in
 * `min()` passes only by a regex gap that `photo-slideshow.spec.ts` guards.
 */
export const CONTAIN_SIZES = {
  /** The band: 1098 × 264 above 1280, 730 × 264 down to 1024, 150 tall below in a box that narrows
   *  with the viewport under 780 — painting 396 and 225 CSS px at 3:2, 469 and 267 at 16:9. Only the
   *  264px box can need retina, at DPR 2, and BOTH clauses over it stay large enough to buy it. */
  band: '(min-width: 1280px) 36vw, (min-width: 1024px) 45vw, 35vw',
  /** Hero: 731 × 360 above 1280, 485 × 360 to 1024 (must buy retina at DPR 2), 220 tall below —
   *  capped at a 3:2 upload's 330 paint, since no bare `vw` both reaches DPR 3 and keeps DPR 2 on
   *  the baseline. */
  galleryHero: '(min-width: 1280px) 35vw, (min-width: 1024px) 45vw, min(330px, 66vw)',
  /** Side tile: 361 × 176 above 1280, 239 × 176 to 1024, 106 tall below — no retina at DPR 1–2.
   *  Chromium ignores this (lazy tiles take its `auto` prefix) and may buy retina at DPR 2. */
  gallerySideTile: '(min-width: 1280px) 18vw, 22vw',
} as const;

/**
 * A width-descriptor `srcset` (paired with `sizes`, so the browser picks against the laid-out box),
 * or `null` with fewer than two candidates, where `src` already says it all.
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
