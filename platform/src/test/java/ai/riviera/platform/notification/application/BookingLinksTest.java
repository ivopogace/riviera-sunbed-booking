package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The links this module builds, on an origin {@code BookingLinkProperties} already validated: no doubled or missing
 * slash, and a code that survives into the path unmangled.
 */
class BookingLinksTest {

	private static final BookingLinks LINKS = new BookingLinks("https://riviera.example");

	@Test
	void buildsTheCodeGatedBookingUrl() {
		assertEquals(URI.create("https://riviera.example/booking/K7Q2M9XR"), LINKS.forBooking("K7Q2M9XR"));
	}

	@Test
	void encodesACodeAsOnePathSegment() {
		assertEquals(URI.create("https://riviera.example/booking/a%2Fb%20c%3F"), LINKS.forBooking("a/b c?"));
	}

	@Test
	void keepsAPercentEscapedOriginPathAsEncoded() {
		assertEquals(URI.create("https://riviera.example/my%20app/booking/K7Q2M9XR"),
				new BookingLinks("https://riviera.example/my%20app").forBooking("K7Q2M9XR"));
	}

	@Test
	void buildsEveryLinkOnAnUnderscoredOrigin() {
		BookingLinks onComposeHost = new BookingLinks("http://riviera_backend:8080");

		assertEquals(URI.create("http://riviera_backend:8080/booking/K7Q2M9XR"), onComposeHost.forBooking("K7Q2M9XR"));
		assertEquals(URI.create("http://riviera_backend:8080/venues/7?date=2026-07-01"),
				onComposeHost.forVenueMap(new VenueId(7), LocalDate.parse("2026-07-01")));
		assertEquals(URI.create("http://riviera_backend:8080/?date=2026-07-01"),
				onComposeHost.forDiscovery(LocalDate.parse("2026-07-01")));
	}
}
