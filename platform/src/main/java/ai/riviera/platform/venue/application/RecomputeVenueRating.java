package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The recompute-a-venue's-rating use case — the inbound port this module's event listener calls.
 * Internal to {@code venue} (in {@code application}), not cross-module {@code api/}: its only caller
 * is venue's own {@code adapter/in}.
 */
public interface RecomputeVenueRating {

	/** Re-derive this venue's stored rating from the reviews it currently has. */
	void recompute(VenueId venue);
}
