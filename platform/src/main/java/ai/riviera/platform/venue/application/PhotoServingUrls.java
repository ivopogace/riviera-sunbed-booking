package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.ContentHash;

/**
 * The one place the photo serving-URL format lives: the public content-addressed path
 * {@code /api/venues/{venueId}/photos/{hash}} served by {@code VenuePhotoController} under a
 * strong {@code ETag} and a revalidating cache directive (ADR-0008). Read-model
 * adapters and the upload response both build their URLs here so the route can never drift apart
 * from its consumers.
 */
public final class PhotoServingUrls {

	private PhotoServingUrls() {
	}

	public static String servingUrl(long venueId, ContentHash hash) {
		return "/api/venues/" + venueId + "/photos/" + hash.value();
	}
}
