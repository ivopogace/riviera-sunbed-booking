package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import org.springframework.stereotype.Service;

import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Where a guest whose booking the venue itself cancelled goes to book again: that venue's map for
 * the same day when it can still sell it, and the discovery list for that day when it cannot —
 * closed for season, past its sales close for the date, or vanished. The sellability answer is
 * {@code venue}'s own per-date projection, read rather than recomputed, so a mail can never offer a
 * date the reserve path would refuse.
 */
@Service
public class RebookLinks {

	private final SetBookingFacts venues;
	private final BookingLinks links;

	RebookLinks(SetBookingFacts venues, BookingLinks links) {
		this.venues = venues;
		this.links = links;
	}

	public URI forDate(VenueId venueId, LocalDate date) {
		return venues.sellsOnlineOn(venueId, date)
				? links.forVenueMap(venueId, date)
				: links.forDiscovery(date);
	}
}
