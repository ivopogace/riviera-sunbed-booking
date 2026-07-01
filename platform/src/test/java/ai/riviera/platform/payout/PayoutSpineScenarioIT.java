package ai.riviera.platform.payout;

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
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-6 (issue #9): the write-side spine completes end-to-end against real Postgres through the
 * Modulith {@link Scenario} DSL — a {@code BookingConfirmed} is published inside a transaction (so
 * the registry persists it and the {@code AFTER_COMMIT} listener fires), and the {@code payout}
 * module asynchronously accrues exactly one ledger entry. This exercises the full async path the
 * Event Publication Registry backs (publish → persist → deliver → accrue → complete), distinct from
 * {@code PayoutAccrualIT}'s direct-publish view. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@EnableScenarios
class PayoutSpineScenarioIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	JdbcClient jdbc;

	private record Ref(long bookingId, long venueId, long setId) {
	}

	private Ref insertConfirmedBooking(String code) {
		var set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new long[] {rs.getLong("id"), rs.getLong("venue_id")}).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set[1]).param("set", set[0])
				.param("cust", customer).param("date", LocalDate.of(2029, 8, 1))
				.query(Long.class).single();
		return new Ref(booking, set[1], set[0]);
	}

	private long accrualRows(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	@Test
	void confirmationAccruesPayoutThroughTheRegistry(Scenario scenario) {
		Ref b = insertConfirmedBooking("SPINE00001");
		BookingConfirmed event = new BookingConfirmed(new BookingId(b.bookingId()),
				new VenueId(b.venueId()), new SetId(b.setId()), LocalDate.of(2029, 8, 1), 4500L, "EUR");

		scenario.publish(event)
				.andWaitAtMost(WAIT)
				.forStateChange(() -> accrualRows(b.bookingId()), (Long rows) -> rows == 1L)
				.andVerify(rows -> assertEquals(1L, rows,
						"the confirmed booking accrues exactly one payout ledger entry (async, via the registry)"));
	}
}
