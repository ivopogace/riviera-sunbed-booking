package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The one link this module builds. Its guarantees are all boundary conditions: an absolute
 * origin, no doubled or missing slash, and a code that survives into the path unmangled.
 *
 * <p>Validation is at construction rather than per send, because the failure it prevents is a
 * deployment mistake — a {@code riviera.notification.booking-link.base-url} that is no http(s) origin — and a
 * mail path is the worst place to discover one: the send is asynchronous, the caller is long gone,
 * and the guest simply never receives a working link. Failing at boot is the same posture
 * {@code SmtpMailer} takes on a missing {@code riviera.mail.from}.
 */
class BookingLinksTest {

	private static final BookingLinks LINKS = new BookingLinks("https://riviera.example");

	@Test
	void buildsTheCodeGatedBookingUrl() {
		assertEquals(URI.create("https://riviera.example/booking/K7Q2M9XR"), LINKS.forBooking("K7Q2M9XR"));
	}

	@Test
	void toleratesATrailingSlashOnTheConfiguredOrigin() {
		assertEquals(URI.create("https://riviera.example/booking/K7Q2M9XR"),
				new BookingLinks("https://riviera.example/").forBooking("K7Q2M9XR"));
	}

	@Test
	void rejectsABlankOriginAtConstruction() {
		assertThrows(IllegalArgumentException.class, () -> new BookingLinks(" "));
	}

	@Test
	void rejectsARelativeOriginAtConstruction() {
		// The default 'http://localhost:4200' is absolute; a bare host would render an unusable link.
		assertThrows(IllegalArgumentException.class, () -> new BookingLinks("riviera.example"));
	}

	@Test
	void buildsEveryLinkOnAUnderscoredOrigin() {
		BookingLinks onComposeHost = new BookingLinks("http://riviera_backend:8080/");

		assertEquals(URI.create("http://riviera_backend:8080/booking/K7Q2M9XR"), onComposeHost.forBooking("K7Q2M9XR"));
		assertEquals(URI.create("http://riviera_backend:8080/venues/7?date=2026-07-01"),
				onComposeHost.forVenueMap(new VenueId(7), LocalDate.parse("2026-07-01")));
		assertEquals(URI.create("http://riviera_backend:8080/?date=2026-07-01"),
				onComposeHost.forDiscovery(LocalDate.parse("2026-07-01")));
	}

	@Test
	void rejectsAnOriginTheBookingPathWouldLandAfter() {
		IllegalArgumentException rejected = assertThrows(IllegalArgumentException.class,
				() -> new BookingLinks("https://riviera.example/?a=b"));

		assertTrue(rejected.getMessage().contains("riviera.notification.booking-link.base-url"));
		assertTrue(rejected.getMessage().contains("RIVIERA_RECOVERY_LINK_BASE_URL"));
	}
}
