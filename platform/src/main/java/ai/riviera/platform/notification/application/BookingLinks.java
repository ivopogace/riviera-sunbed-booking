package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.shared.EmailedLinkOrigin;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The links a booking mail points at: the code-gated view {@code <base>/booking/<code>} and two
 * rebook links, {@code <base>/venues/<id>?date=…} and {@code <base>/?date=…} ({@link RebookLinks}
 * picks). The first is a bearer URL, code in the path per ADR-0006: never log it (invariant #7). Not
 * {@code /booking/pay}: that resumes in-memory hand-off state and dead-ends from an inbox. It formats
 * a code already read, minting nothing ({@code RESPONSIBILITIES.md} §notification). Validated at
 * construction by {@link EmailedLinkOrigin}, so a bad origin fails at boot rather than mailing an unusable link.
 */
public record BookingLinks(String baseUrl) {

	/**
	 * A segment, not a {@code "/booking/"} literal: parts encode the code and satisfy java:S1075. Not a
	 * tunable — it must match {@code app.routes.ts}, or every mailed link breaks.
	 */
	private static final String BOOKING_SEGMENT = "booking";

	/** The tourist map route, and the query param both rebook links carry; both match {@code app.routes.ts}. */
	private static final String VENUES_SEGMENT = "venues";
	private static final String DATE_PARAM = "date";

	public BookingLinks {
		baseUrl = EmailedLinkOrigin.require("riviera.notification.booking-link.base-url",
				"RIVIERA_RECOVERY_LINK_BASE_URL", baseUrl);
	}

	/** The code-gated view for this booking — where an accepted request's guest goes to pay. */
	public URI forBooking(String bookingCode) {
		return UriComponentsBuilder.fromUriString(baseUrl)
				.pathSegment(BOOKING_SEGMENT, bookingCode)
				.build()
				.encode()
				.toUri();
	}

	/** That venue's beach map for the day the guest lost — where the same spot is rebooked. */
	public URI forVenueMap(VenueId venueId, LocalDate date) {
		return UriComponentsBuilder.fromUriString(baseUrl)
				.pathSegment(VENUES_SEGMENT, String.valueOf(venueId.value()))
				.queryParam(DATE_PARAM, date)
				.build()
				.encode()
				.toUri();
	}

	/** The discovery list for the day — where a guest goes when that venue cannot sell it. */
	public URI forDiscovery(LocalDate date) {
		return UriComponentsBuilder.fromUriString(baseUrl)
				.path("/")
				.queryParam(DATE_PARAM, date)
				.build()
				.encode()
				.toUri();
	}
}
