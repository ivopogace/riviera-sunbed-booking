/**
 * Rating helpers shared by the home venue card and the venue-map header (issue #154). A venue with
 * no reviews yet is "new / unrated", never "rated 0.0" — `isRated` gates that decision in one place
 * so the two surfaces can't drift. Score is carried on the wire as tenths of a star (no float).
 */

/** The rating fields both `VenueSummary` and `VenueMapView` expose (score in tenths + review count). */
export interface RatingView {
  readonly ratingTenths: number;
  readonly reviewsCount: number;
}

/** True once a venue has at least one review; a zero-review venue is "New", not "rated 0.0". */
export function isRated(venue: RatingView): boolean {
  return venue.reviewsCount > 0;
}

/** The star score as a one-decimal display string (48 → "4.8"); only meaningful when `isRated`. */
export function ratingScore(ratingTenths: number): string {
  return (ratingTenths / 10).toFixed(1);
}
