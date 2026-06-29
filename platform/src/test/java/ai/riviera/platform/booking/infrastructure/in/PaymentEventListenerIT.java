package ai.riviera.platform.booking.infrastructure.in;

import java.time.Duration;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.test.EnableScenarios;
import org.springframework.modulith.test.Scenario;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.PaymentCanceled;
import ai.riviera.platform.payment.api.PaymentConfirmed;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * End-to-end proof of the {@code booking} reaction to verified payment events (issue #8, PR #53)
 * now that the listener is an <strong>async</strong> {@code @ApplicationModuleListener}: a
 * {@link PaymentConfirmed} moves an {@code AWAITING_PAYMENT} booking to {@code CONFIRMED}; a
 * {@link PaymentCanceled} cancels it and releases the {@code (set, date)} availability claim
 * (invariant #2). Driven through the Modulith {@link Scenario} DSL — it publishes inside a
 * transaction (so the {@code AFTER_COMMIT} listener fires) and waits for the asynchronous state
 * change. Testcontainers + the Event Publication Registry (V8); skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@EnableScenarios
class PaymentEventListenerIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

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
	void confirmedMovesBookingToConfirmed(Scenario scenario) {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 7, 1);
		long booking = insertAwaitingBooking("EVTCONF0001", set, date);

		scenario.publish(new PaymentConfirmed(new BookingRef(booking), "pi_evt_conf"))
				.andWaitAtMost(WAIT)
				.forStateChange(() -> statusOf(booking), "CONFIRMED"::equals)
				.andVerify(status -> assertEquals("CONFIRMED", status,
						"a verified payment confirms the booking (async, via the registry)"));
	}

	@Test
	void canceledCancelsBookingAndReleasesClaim(Scenario scenario) {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 7, 3);
		long booking = insertAwaitingBooking("EVTCANC0001", set, date);
		claim(set, date);
		assertEquals(1L, availabilityRows(set, date), "precondition: the set is claimed");

		scenario.publish(new PaymentCanceled(new BookingRef(booking)))
				.andWaitAtMost(WAIT)
				.forStateChange(() -> availabilityRows(set, date), (Long rows) -> rows == 0L)
				.andVerify(rows -> {
					assertEquals(0L, rows, "the availability claim is released (invariant #2)");
					assertEquals("CANCELLED", statusOf(booking), "and the booking is cancelled");
				});
	}
}
