package ai.riviera.platform.itinerary.application;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.SetAvailabilityFacts;
import ai.riviera.platform.itinerary.domain.StayFit;
import ai.riviera.platform.itinerary.domain.StayVerdict;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueStayFacts;

/**
 * One map read for every venue's online sets and maximum stay, one availability read for every
 * set's taken days over the span, then {@link StayFit} per venue. {@link SetBookingFacts} answers
 * for any venue, hence the caller's visibility fence.
 */
@Service
class StayVerdictsService implements StayVerdicts {

	private final SetBookingFacts venues;
	private final SetAvailabilityFacts availability;

	StayVerdictsService(SetBookingFacts venues, SetAvailabilityFacts availability) {
		this.venues = venues;
		this.availability = availability;
	}

	@Override
	@Transactional(readOnly = true)
	public Map<VenueId, StayVerdict> forCoast(Collection<VenueId> venueIds, StaySpan span) {
		Map<VenueId, VenueStayFacts> facts = venues.stayFactsOf(venueIds);
		List<SetId> onlineSets = facts.values().stream().flatMap(venue -> venue.onlineSets().stream()).toList();
		var takenDays = availability.takenDaysBetween(onlineSets, span.firstDay(), span.lastDay());
		return facts.entrySet().stream().collect(Collectors.toUnmodifiableMap(Map.Entry::getKey,
				entry -> StayFit.verdict(span, entry.getValue().onlineSets(), takenDays,
						entry.getValue().maxStayDays())));
	}
}
