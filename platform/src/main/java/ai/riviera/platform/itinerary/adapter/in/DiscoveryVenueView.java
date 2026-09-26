package ai.riviera.platform.itinerary.adapter.in;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * One discovery entry: the venue summary flattened onto the wire exactly as the one-day list
 * serves it, plus {@code stay} for a range read and absent otherwise.
 */
record DiscoveryVenueView(@JsonUnwrapped VenueSummaryView summary,
		@JsonInclude(JsonInclude.Include.NON_NULL) StayVerdictView stay) {
}
