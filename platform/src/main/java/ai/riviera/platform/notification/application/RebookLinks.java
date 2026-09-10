package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import org.springframework.stereotype.Service;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.DailyAvailability;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Where a guest whose booking the venue itself cancelled goes to book again: that venue's map for
 * the same day when it can still sell it, and the discovery list for that day when it cannot —
 * closed for season, or past its sales close for the date. The sellability answer is
 * {@code venue}'s own per-date projection, read rather than recomputed, so a mail can never offer a
 * date the reserve path would refuse.
 *
 * <p>A venue that has vanished, or a day the projection cannot answer for, degrades the same way a
 * closed one does: the discovery list always works.
 */
@Service
public class RebookLinks {

	private final VenueCatalog venues;
	private final BookingLinks links;

	RebookLinks(VenueCatalog venues, BookingLinks links) {
		this.venues = venues;
		this.links = links;
	}

	public URI forDate(VenueId venueId, LocalDate date) {
		return sellsOn(venueId, date) ? links.forVenueMap(venueId, date) : links.forDiscovery(date);
	}

	private boolean sellsOn(VenueId venueId, LocalDate date) {
		return venues.availabilityBetween(venueId, date, date)
				.flatMap(days -> days.stream().findFirst())
				.map(DailyAvailability::salesOpen)
				.orElse(false);
	}
}
