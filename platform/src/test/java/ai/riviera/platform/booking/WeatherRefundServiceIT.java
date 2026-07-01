package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.api.RefundReason;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-4 (issue #12): the admin weather refund fully refunds <strong>every</strong> {@code CONFIRMED}
 * booking for a venue+date <em>regardless of the cutoff</em> (invariant #10), records reason
 * {@code WEATHER}, frees each {@code (set, date)} (invariant #2), and publishes one
 * {@link BookingCancelled} per booking. Seeds confirmed bookings directly on a <strong>past</strong>
 * date (after the cutoff, when a tourist cancel would refund nothing) to prove the cutoff is ignored.
 * Drives the real {@link RefundForWeather} port against Testcontainers Postgres. Each test uses its
 * own past date so the per-(venue, date) counts are deterministic on the shared container.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@RecordApplicationEvents
class WeatherRefundServiceIT {

	@Autowired
	RefundForWeather refundForWeather;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	@Autowired
	OperatorDirectory operators;

	/** The interim bootstrap operator (owns every venue) — resolves the ownership guard (#73). */
	private OperatorId bootstrap() {
		return operators.operatorFor("operator").orElseThrow();
	}

	private record Seeded(long bookingId, long setId, long amountMinor) {
	}

	private long venueWithOnlineSets() {
		return jdbc.sql("SELECT venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY venue_id LIMIT 1")
				.query(Long.class).single();
	}

	private List<Long> onlineSets(long venueId, int n) {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' AND venue_id = :v "
						+ "ORDER BY id LIMIT :n")
				.param("v", venueId).param("n", n).query(Long.class).list();
	}

	/** Insert a CONFIRMED booking on {@code date} with a held (set, date) row and an accrual. */
	private Seeded confirmedBooking(long venueId, long setId, LocalDate date, String code, long amountMinor) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long bookingId = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, :amount, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date).param("amount", amountMinor)
				.query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE')")
				.param("set", setId).param("date", date).update();
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (:v, :b, 'ACCRUAL', :gross, 0, :gross, 'EUR')
				""")
				.param("v", venueId).param("b", bookingId).param("gross", amountMinor).update();
		return new Seeded(bookingId, setId, amountMinor);
	}

	private String status(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).single();
	}

	private long availabilityRows(long setId, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Long.class).single();
	}

	@Test
	void fullRefundRegardlessOfCutoff() {
		LocalDate day = LocalDate.of(2020, 7, 1); // past → after cutoff → policy would refund 0
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 2);
		Seeded a = confirmedBooking(venueId, sets.get(0), day, "WX00000001", 4500L);
		Seeded b = confirmedBooking(venueId, sets.get(1), day, "WX00000002", 3500L);
		assertEquals(1, availabilityRows(a.setId(), day), "set A is held before the weather refund");
		assertEquals(1, availabilityRows(b.setId(), day), "set B is held before the weather refund");

		WeatherRefundOutcome outcome = refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), day);

		assertEquals(2, outcome.refundedCount(), "both confirmed bookings are refunded");
		assertEquals(8000L, outcome.totalRefundedMinor(), "full refund of 4500 + 3500");
		assertEquals("EUR", outcome.currency());

		for (Seeded s : List.of(a, b)) {
			assertEquals("CANCELLED", status(s.bookingId()), "booking is cancelled");
			assertEquals(s.amountMinor(), jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id")
					.param("id", s.bookingId()).query(Long.class).single(),
					"full refund regardless of cutoff (invariant #10)");
			assertEquals("WEATHER", jdbc.sql("SELECT cancel_reason FROM booking WHERE id = :id")
					.param("id", s.bookingId()).query(String.class).single(), "reason is WEATHER");
			assertEquals(0, availabilityRows(s.setId(), day), "the set is freed (invariant #2)");
		}

		List<BookingCancelled> published = events.stream(BookingCancelled.class)
				.filter(e -> e.bookingDate().equals(day)).toList();
		assertEquals(2, published.size(), "one BookingCancelled per refunded booking");
		assertEquals(RefundReason.WEATHER, published.getFirst().reason(), "event carries the weather reason");
	}

	@Test
	void rerunRefundsNothingNew() {
		LocalDate day = LocalDate.of(2020, 7, 2);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 1);
		confirmedBooking(venueId, sets.get(0), day, "WX00000003", 4500L);

		assertEquals(1, refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), day).refundedCount(),
				"first run refunds the confirmed booking");
		assertEquals(0, refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), day).refundedCount(),
				"a re-run refunds nothing already cancelled (idempotent at booking level)");
	}

	@Test
	void noConfirmedBookingsIsANoOp() {
		long venueId = venueWithOnlineSets();

		WeatherRefundOutcome outcome =
				refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), LocalDate.of(2019, 1, 1));

		assertEquals(0, outcome.refundedCount(), "no confirmed bookings → nothing refunded");
		assertEquals(0L, outcome.totalRefundedMinor());
	}
}
