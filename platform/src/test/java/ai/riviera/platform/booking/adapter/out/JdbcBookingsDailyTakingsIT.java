package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.DailyTakings;
import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The {@code booking.api.DailyTakings} SQL aggregate (#171, O2): gross of a venue's
 * {@code CONFIRMED}-or-{@code COMPLETED} online bookings for one service date, summed in the query
 * (invariant #1, no JPA). Pins that the sum counts only the target venue + date +
 * {@code CONFIRMED}/{@code COMPLETED} statuses — a checked-in booking still counts, so a scan never
 * shrinks the day — and that an empty day is {@code (0, "EUR")}. Testcontainers; skipped where
 * Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class JdbcBookingsDailyTakingsIT {

	@Autowired
	DailyTakings dailyTakings;

	@Autowired
	ai.riviera.platform.booking.application.checkin.MarkNoShows markNoShows;

	@Autowired
	JdbcClient jdbc;

	private record SetRef(long setId, long venueId) {
	}

	/**
	 * A venue of this test's own, with one online set.
	 *
	 * <p>Deliberately not the shared seed venue. {@code grossOnlineTakings} sums <em>every</em>
	 * {@code CONFIRMED} booking for a {@code (venue_id, booking_date)} — no set filter — and this class
	 * deletes nothing, so booking against a venue other tests also use makes the expected total a
	 * function of test order and of the real calendar (several ITs date bookings
	 * {@code LocalDate.now().plusYears(1).plusDays(N)}). Owning the venue makes the sum contain only
	 * this test's rows, whatever else the suite does.
	 */
	private SetRef ownVenueWithOnlineSet(String name) {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", "Takings " + name).query(Long.class).single();
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		return new SetRef(setId, venueId);
	}

	private void insertBooking(String code, long venueId, long setId, LocalDate date,
			long amountMinor, String status) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, :amount, 'EUR', :status)
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date).param("amount", amountMinor)
				.param("status", status).update();
	}

	private void insertStay(String code, long venueId, long setId, LocalDate first, LocalDate last,
			long amountMinor, String status) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', :status)
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("first", first).param("last", last)
				.param("amount", amountMinor).param("status", status).update();
	}

	private long insertSecondVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Takings Decoy Venue', 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	@Test
	void sumsConfirmedAndCheckedInOnlineForVenueAndDate() {
		SetRef target = ownVenueWithOnlineSet("Sum Venue");
		LocalDate day = LocalDate.of(2027, 8, 10);

		// Two CONFIRMED + one COMPLETED (checked-in) booking on the day: gross = 11000.
		insertBooking("TAKE0001", target.venueId(), target.setId(), day, 4000, "CONFIRMED");
		insertBooking("TAKE0002", target.venueId(), target.setId(), day, 4000, "CONFIRMED");
		insertBooking("TAKE0003", target.venueId(), target.setId(), day, 3000, "COMPLETED");

		// Decoys that must NOT be counted:
		insertBooking("TAKE0004", target.venueId(), target.setId(), day, 5000, "AWAITING_PAYMENT"); // status
		insertBooking("TAKE0005", target.venueId(), target.setId(), day.minusDays(1), 6000, "CONFIRMED"); // date
		long otherVenue = insertSecondVenue();
		insertBooking("TAKE0006", otherVenue, target.setId(), day, 7000, "CONFIRMED"); // venue

		OnlineTakings takings = dailyTakings.grossOnlineTakings(new VenueId(target.venueId()), day);

		assertEquals(11000L, takings.grossMinor(), "sums CONFIRMED + COMPLETED bookings for the venue + date");
		assertEquals("EUR", takings.currency());
	}

	@Test
	void noShowSweepDoesNotChangeTakings() {
		SetRef target = ownVenueWithOnlineSet("No-Show Venue");
		LocalDate past = LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(3);

		insertBooking("TAKE0007", target.venueId(), target.setId(), past, 4000, "CONFIRMED");
		insertBooking("TAKE0008", target.venueId(), target.setId(), past, 3000, "COMPLETED");

		OnlineTakings before = dailyTakings.grossOnlineTakings(new VenueId(target.venueId()), past);
		markNoShows.sweep();
		OnlineTakings after = dailyTakings.grossOnlineTakings(new VenueId(target.venueId()), past);

		assertEquals("NO_SHOW", jdbc.sql("SELECT status FROM booking WHERE code = 'TAKE0007'")
				.query(String.class).single(), "the sweep must actually have run on this row");
		assertEquals(7000L, before.grossMinor());
		assertEquals(before.grossMinor(), after.grossMinor(),
				"a paid no-show is not refunded (invariant #10), so the venue's day must not shrink");
	}

	/**
	 * Design D4: a stay counts on each day it serves, its amount split by {@code DayShare}, never
	 * whole on its arrival day; a one-day booking beside it still counts whole on its day.
	 */
	@Test
	void aStayCountsOnEachDayItServes() {
		SetRef target = ownVenueWithOnlineSet("Stay Venue");
		LocalDate first = LocalDate.of(2027, 8, 20);
		insertStay("TAKE0009", target.venueId(), target.setId(), first, first.plusDays(2), 9000, "CONFIRMED");
		insertBooking("TAKE0010", target.venueId(), target.setId(), first.plusDays(1), 4000, "CONFIRMED");
		VenueId venue = new VenueId(target.venueId());

		assertEquals(3000L, dailyTakings.grossOnlineTakings(venue, first).grossMinor(),
				"the arrival day carries one third, not the whole stay");
		assertEquals(7000L, dailyTakings.grossOnlineTakings(venue, first.plusDays(1)).grossMinor(),
				"the middle day carries the stay's third plus the one-day booking");
		assertEquals(3000L, dailyTakings.grossOnlineTakings(venue, first.plusDays(2)).grossMinor());
		assertEquals(0L, dailyTakings.grossOnlineTakings(venue, first.plusDays(3)).grossMinor(),
				"the day after the stay ends is empty");
	}

	/** #1210: a day a storm gave back is not the venue's takings; the stay's other days still are. */
	@Test
	void aRefundedDayIsExcluded() {
		SetRef target = ownVenueWithOnlineSet("Storm Venue");
		LocalDate first = LocalDate.of(2027, 9, 1);
		insertStay("TAKE0011", target.venueId(), target.setId(), first, first.plusDays(2), 9000, "CONFIRMED");
		jdbc.sql("""
				UPDATE booking_day SET refunded_at = NOW(), refund_minor = 3000
				WHERE booking_id = (SELECT id FROM booking WHERE code = 'TAKE0011') AND service_date = :d
				""").param("d", first.plusDays(1)).update();
		VenueId venue = new VenueId(target.venueId());

		assertEquals(3000L, dailyTakings.grossOnlineTakings(venue, first).grossMinor());
		assertEquals(0L, dailyTakings.grossOnlineTakings(venue, first.plusDays(1)).grossMinor(),
				"the refunded day carries nothing");
		assertEquals(3000L, dailyTakings.grossOnlineTakings(venue, first.plusDays(2)).grossMinor());
	}

	@Test
	void emptyDayYieldsZeroInEur() {
		SetRef target = ownVenueWithOnlineSet("Empty Venue");
		OnlineTakings takings =
				dailyTakings.grossOnlineTakings(new VenueId(target.venueId()), LocalDate.of(2099, 1, 1));

		assertEquals(0L, takings.grossMinor(), "a day with no confirmed bookings is zero, not an error");
		assertEquals("EUR", takings.currency(), "empty day falls back to the v1 collection currency");
	}
}
