package ai.riviera.platform.venue.vocabulary;

/**
 * The tourist-surfaced cover photo of a venue: the COVER slot's card (Discover card) and banner
 * (beach-map header) surfaces, each as a {@link PhotoView} carrying its baseline URL and every
 * density candidate. Carried by {@link VenueSummaryView} and {@link VenueMapView} as {@code null}
 * when the venue has no cover photo (the FE renders the gradient fallback).
 */
public record CoverPhotoView(PhotoView card, PhotoView banner) {
}
