package ai.riviera.platform.venue.vocabulary;

/**
 * The tourist-surfaced cover photo of a venue: the content-addressed serving URLs of the
 * COVER slot's card (Discover card) and banner (beach-map header) variants. URLs are opaque
 * strings the client feeds to {@code NgOptimizedImage} — content-addressed per ADR-0008, so a
 * replaced photo changes the URL, never the bytes behind an old one. Carried by {@link VenueSummaryView}
 * and {@link VenueMapView} as {@code null} when the venue has no cover photo (the FE renders the
 * gradient fallback).
 */
public record CoverPhotoView(String card, String banner) {
}
