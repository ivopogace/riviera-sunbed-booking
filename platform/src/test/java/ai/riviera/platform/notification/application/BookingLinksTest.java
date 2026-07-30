package ai.riviera.platform.notification.application;

import java.net.URI;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The one link this module builds (#373). Its guarantees are all boundary conditions: an absolute
 * origin, no doubled or missing slash, and a code that survives into the path unmangled.
 *
 * <p>Validation is at construction rather than per send, because the failure it prevents is a
 * deployment mistake — a blank or relative {@code riviera.notification.booking-link.base-url} — and a
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
}
