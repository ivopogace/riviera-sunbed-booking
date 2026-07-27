package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The {@code booking.api.BookingNotificationFacts} read port (#371, Email S3): the two facts
 * {@code BookingConfirmed} deliberately does not carry — the arrival code (invariant #7) and the
 * guest-contact id the edge resolves an address from. Everything else the confirmation email needs
 * is either on the event payload or already published by {@code venue.api.SetBookingFacts}, which
 * is why this port stays two fields wide.
 *
 * <p>Deliberately <strong>not</strong> filtered by status: the listener fires on a published
 * confirmation fact, and a booking cancelled in the interim must still resolve (plan R-7).
 * Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcBookingNotificationFactsIT {

	@Autowired
	BookingNotificationFacts notificationFacts;

	@Autowired
	JdbcClient jdbc;

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long insertCustomer(String email) {
		return jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", email).query(Long.class).single();
	}

	private long insertBooking(String code, long customerId, String status) {
		SetRef set = onlineSet();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 2500, 'EUR', :status)
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("date", LocalDate.of(2027, 9, 4))
				.param("status", status).query(Long.class).single();
	}

	@Test
	void resolvesTheArrivalCodeAndTheContactIdToNotify() {
		long customerId = insertCustomer("notify-me@example.com");
		long bookingId = insertBooking("NOTIFY01", customerId, "CONFIRMED");

		BookingNotificationInfo info =
				notificationFacts.notificationInfo(new BookingId(bookingId)).orElseThrow();

		assertEquals("NOTIFY01", info.code(), "the arrival code the email must carry (invariant #7)");
		assertEquals(customerId, info.customerId().value(),
				"the guest-contact id the edge resolves the recipient address from");
	}

	@Test
	void resolvesABookingCancelledAfterConfirmation() {
		long customerId = insertCustomer("cancelled-late@example.com");
		long bookingId = insertBooking("NOTIFY02", customerId, "CANCELLED");

		assertTrue(notificationFacts.notificationInfo(new BookingId(bookingId)).isPresent(),
				"no status filter — a booking cancelled between confirmation and the async send "
						+ "must still resolve, so the listener never silently drops a published fact");
	}

	@Test
	void unknownBookingIsEmptyNotAnError() {
		Optional<BookingNotificationInfo> info =
				notificationFacts.notificationInfo(new BookingId(-1L));

		assertTrue(info.isEmpty(), "an absent booking is empty, never null and never an exception");
	}
}
