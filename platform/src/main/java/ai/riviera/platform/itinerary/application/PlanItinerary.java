package ai.riviera.platform.itinerary.application;

import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The per-venue itinerary search (design D7): the stitched plan for a stay, anchored on a tapped set
 * when one is named. A snapshot, never a hold (invariant #2): the reserve claims each {@code (set, date)}.
 */
public interface PlanItinerary {

	/**
	 * Empty for an absent or hidden venue. An {@code anchor} that is not one of the venue's online sets
	 * throws {@link IllegalArgumentException}.
	 */
	Optional<StayItinerary> plan(VenueId venue, StaySpan span, Optional<SetId> anchor);
}
