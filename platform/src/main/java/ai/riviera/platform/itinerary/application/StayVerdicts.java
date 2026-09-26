package ai.riviera.platform.itinerary.application;

import java.util.Collection;
import java.util.Map;

import ai.riviera.platform.itinerary.domain.StayVerdict;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The whole-coast stay verdict (design D11): one verdict per venue for a span, a snapshot and never
 * a hold (invariant #2). The caller hands in ids it has already fenced for visibility.
 */
public interface StayVerdicts {

	/** One verdict per known venue in {@code venueIds}; an unknown id is absent, empty in gives empty out. */
	Map<VenueId, StayVerdict> forCoast(Collection<VenueId> venueIds, StaySpan span);
}
