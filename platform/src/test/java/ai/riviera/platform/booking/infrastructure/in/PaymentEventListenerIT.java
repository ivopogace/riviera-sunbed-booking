package ai.riviera.platform.booking.infrastructure.in;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.PaymentCanceled;
import ai.riviera.platform.payment.api.PaymentConfirmed;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * End-to-end proof of the {@code booking} reaction to verified payment events (issue #8,
 * AC-2/AC-6) against real Postgres: a {@link PaymentConfirmed} moves an {@code AWAITING_PAYMENT}
 * booking to {@code CONFIRMED} (idempotently); a {@link PaymentCanceled} cancels it and releases
 * the {@code (set, date)} availability claim so the set is re-bookable (invariant #2). Drives the
 * listener by publishing the events the verified webhook would. Testcontainers; skipped where
 * Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PaymentEventListenerIT {

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	JdbcClient jdbc;

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long insertAwaitingBooking(String code, SetRef set, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'AWAITING_PAYMENT')
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customer).param("date", date).query(Long.class).single();
	}

	private void claim(SetRef set, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE')")
				.param("set", set.setId()).param("date", date).update();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private long availabilityRows(SetRef set, LocalDate date) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :date")
				.param("set", set.setId()).param("date", date).query(Long.class).single();
	}

	@Test
	void confirmedMovesBookingToConfirmed() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 7, 1);
		long booking = insertAwaitingBooking("EVTCONF0001", set, date);

		publisher.publishEvent(new PaymentConfirmed(new BookingRef(booking), "pi_evt_conf"));

		assertEquals("CONFIRMED", statusOf(booking), "a verified payment confirms the booking");
	}

	@Test
	void confirmedIsIdempotent() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 7, 2);
		long booking = insertAwaitingBooking("EVTCONF0002", set, date);

		publisher.publishEvent(new PaymentConfirmed(new BookingRef(booking), "pi_evt_conf2"));
		publisher.publishEvent(new PaymentConfirmed(new BookingRef(booking), "pi_evt_conf2"));

		assertEquals("CONFIRMED", statusOf(booking), "a re-delivered confirmation is a safe no-op");
	}

	@Test
	void canceledCancelsBookingAndReleasesClaim() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 7, 3);
		long booking = insertAwaitingBooking("EVTCANC0001", set, date);
		claim(set, date);
		assertEquals(1L, availabilityRows(set, date), "precondition: the set is claimed");

		publisher.publishEvent(new PaymentCanceled(new BookingRef(booking)));

		assertEquals("CANCELLED", statusOf(booking), "a canceled payment cancels the booking");
		assertEquals(0L, availabilityRows(set, date),
				"the availability claim is released so the set is re-bookable (invariant #2)");
	}

	@Test
	void canceledAfterConfirmationDoesNotReleaseClaim() {
		// A stale cancel must not free a set whose booking already left AWAITING_PAYMENT.
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 7, 4);
		long booking = insertAwaitingBooking("EVTCANC0002", set, date);
		claim(set, date);
		publisher.publishEvent(new PaymentConfirmed(new BookingRef(booking), "pi_evt_conf3"));

		publisher.publishEvent(new PaymentCanceled(new BookingRef(booking)));

		assertEquals("CONFIRMED", statusOf(booking), "an already-confirmed booking is not cancelled");
		assertEquals(1L, availabilityRows(set, date), "and its claim is not released");
	}
}
