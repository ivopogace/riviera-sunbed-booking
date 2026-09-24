package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.checkin.CheckInBooking;
import ai.riviera.platform.booking.application.checkin.CheckInResult;
import ai.riviera.platform.booking.application.checkin.CompletedCheckIn;
import ai.riviera.platform.booking.application.checkin.MarkNoShows;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Attendance as a per-night record over a booking with several nights — inserted directly, since no
 * range reserve exists yet. The single-night suites ({@code CheckInFlowIT}, {@code CheckInConcurrencyIT},
 * {@code NoShowSweepIT}, {@code JdbcBookingTransitionTableIT}) are the equivalence oracle and stay
 * untouched; this class covers only what a stay adds: a check-in per night, "already checked in
 * today" scoped to a night, missed nights, and a stay outcome written once its last night resolves.
 *
 * <p>The date-stepping cases drive the {@code Bookings} seam, whose service date is a parameter; the
 * today-bound cases drive {@code CheckInBooking} and {@code MarkNoShows} with nights laid out around
 * today in {@code Europe/Tirane}. Every case drains the sweep first, as {@code NoShowSweepIT} does,
 * and removes its stays afterwards so no live multi-night fixture lingers for another suite's count.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class MultiNightAttendanceIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	/** Far from every other suite's fixtures, so the date-stepping sweep selects only this stay. */
	private static final LocalDate FIRST_NIGHT = LocalDate.of(2003, 6, 10);

	@Autowired
	Bookings bookings;

	@Autowired
	CheckInBooking checkInBooking;

	@Autowired
	MarkNoShows markNoShows;

	@Autowired
	JdbcClient jdbc;

	private long venueId;
	private long setId;
	private OperatorId operator;

	@BeforeEach
	void seedOwnedVenueAndDrain() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Stay Club', 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", uniqueCode("stay-op-")).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		operator = new OperatorId(operatorId);
		markNoShows.sweep();
	}

	@AfterEach
	void removeStays() {
		jdbc.sql("DELETE FROM booking WHERE code LIKE 'STAY%'").update();
		jdbc.sql("DELETE FROM customer WHERE email LIKE 'STAY%'").update();
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	/** A {@code CONFIRMED} stay whose first night the trigger writes and whose later nights are added here. */
	private long insertStay(String code, LocalDate firstNight, int nights) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", firstNight)
				.query(Long.class).single();
		for (int i = 1; i < nights; i++) {
			jdbc.sql("INSERT INTO booking_night (booking_id, night) VALUES (:id, :night)")
					.param("id", id).param("night", firstNight.plusDays(i)).update();
		}
		return id;
	}

	private void attend(long bookingId, LocalDate night) {
		jdbc.sql("UPDATE booking_night SET attended_at = now() WHERE booking_id = :id AND night = :night")
				.param("id", bookingId).param("night", night).update();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private Instant completedAtOf(long bookingId) {
		return jdbc.sql("SELECT completed_at FROM booking WHERE id = :id")
				.param("id", bookingId).query(Instant.class).optional().orElse(null);
	}

	private List<LocalDate> nightsWhere(long bookingId, String predicate) {
		return jdbc.sql("SELECT night FROM booking_night WHERE booking_id = :id AND " + predicate
						+ " ORDER BY night")
				.param("id", bookingId).query(LocalDate.class).list();
	}

	private List<LocalDate> attendedNights(long bookingId) {
		return nightsWhere(bookingId, "attended_at IS NOT NULL");
	}

	private List<LocalDate> missedNights(long bookingId) {
		return nightsWhere(bookingId, "missed_at IS NOT NULL");
	}

	private Optional<CompletedCheckIn> scan(String code, LocalDate day) {
		return bookings.completeConfirmed(code, new VenueId(venueId), day, Instant.now());
	}

	@Test
	void eachNightIsCheckedInOnItsOwnDayAndTheLastResolvesTheStay() {
		String code = uniqueCode("STAY3");
		long stay = insertStay(code, FIRST_NIGHT, 3);

		assertTrue(scan(code, FIRST_NIGHT).isPresent(), "night 1");
		assertEquals("CONFIRMED", statusOf(stay), "two nights remain");
		assertTrue(scan(code, FIRST_NIGHT).isEmpty(), "a second scan on night 1 moves nothing");

		assertTrue(scan(code, FIRST_NIGHT.plusDays(1)).isPresent(), "night 2");
		assertEquals("CONFIRMED", statusOf(stay), "one night remains");

		CompletedCheckIn last = scan(code, FIRST_NIGHT.plusDays(2)).orElseThrow();
		assertEquals(stay, last.bookingId());
		assertEquals(setId, last.setId().value());
		assertEquals(FIRST_NIGHT, last.bookingDate(), "the facts name the stay's first night, as today");
		assertEquals("COMPLETED", statusOf(stay), "the last night resolves the stay");
		assertNotNull(completedAtOf(stay), "completed_at is when the stay resolved");
		assertEquals(List.of(FIRST_NIGHT, FIRST_NIGHT.plusDays(1), FIRST_NIGHT.plusDays(2)),
				attendedNights(stay));
		assertEquals(List.of(), missedNights(stay));
	}

	@Test
	void aNightOutsideTheStayIsRefused() {
		String code = uniqueCode("STAYOUT");
		long stay = insertStay(code, FIRST_NIGHT, 2);

		assertTrue(scan(code, FIRST_NIGHT.minusDays(1)).isEmpty(), "the eve of the stay");
		assertTrue(scan(code, FIRST_NIGHT.plusDays(2)).isEmpty(), "the day after the stay");
		assertEquals("CONFIRMED", statusOf(stay));
		assertEquals(List.of(), attendedNights(stay));
	}

	@Test
	void secondScanOnTheSameDayAnswersAlreadyCheckedIn() {
		String code = uniqueCode("STAYTWICE");
		long stay = insertStay(code, today().minusDays(1), 3);
		attend(stay, today().minusDays(1));
		VenueId venue = new VenueId(venueId);

		CheckInResult first = checkInBooking.checkIn(operator, venue, code);
		CheckInResult second = checkInBooking.checkIn(operator, venue, code);

		assertInstanceOf(CheckInResult.CheckedIn.class, first);
		assertInstanceOf(CheckInResult.AlreadyCheckedIn.class, second,
				"today's night is attended, so the stay reads as checked in today");
		assertEquals("CONFIRMED", statusOf(stay), "tomorrow's night keeps the stay live");
		assertEquals(List.of(today().minusDays(1), today()), attendedNights(stay));
	}

	@Test
	void aStayThatHasNotReachedTodayNamesItsFirstNight() {
		String code = uniqueCode("STAYSOON");
		insertStay(code, today().plusDays(2), 2);

		CheckInResult result = checkInBooking.checkIn(operator, new VenueId(venueId), code);

		assertEquals(new CheckInResult.WrongServiceDate(today().plusDays(2)), result);
	}

	@Test
	void partlyAttendedStayResolvesOnlyAfterItsLastNight() {
		String code = uniqueCode("STAYPART");
		long stay = insertStay(code, FIRST_NIGHT, 3);
		attend(stay, FIRST_NIGHT);

		assertEquals(0, bookings.markPastConfirmedAsNoShow(FIRST_NIGHT.plusDays(2), 500),
				"the last night is still ahead: nothing resolves");
		assertEquals(List.of(FIRST_NIGHT.plusDays(1)), missedNights(stay), "night 2 passed unattended");
		assertEquals("CONFIRMED", statusOf(stay));
		assertNull(completedAtOf(stay));

		assertEquals(1, bookings.markPastConfirmedAsNoShow(FIRST_NIGHT.plusDays(3), 500),
				"the last night has passed: the stay resolves");
		assertEquals(List.of(FIRST_NIGHT.plusDays(1), FIRST_NIGHT.plusDays(2)), missedNights(stay));
		assertEquals("COMPLETED", statusOf(stay), "a stay with an attended night completed");
		assertNotNull(completedAtOf(stay));
		assertEquals(0, bookings.markPastConfirmedAsNoShow(FIRST_NIGHT.plusDays(3), 500),
				"a resolved stay is never resolved again");
	}

	@Test
	void guestWhoStopsTurningUpGetsMissedNightsAndCompletes() {
		String code = uniqueCode("STAYLEFT");
		long stay = insertStay(code, today().minusDays(4), 4);
		attend(stay, today().minusDays(4));
		attend(stay, today().minusDays(3));

		assertEquals(1, markNoShows.sweep());

		assertEquals(List.of(today().minusDays(2), today().minusDays(1)), missedNights(stay));
		assertEquals("COMPLETED", statusOf(stay));
		assertNotNull(completedAtOf(stay));
	}

	@Test
	void stayNobodyAttendedResolvesToNoShow() {
		String code = uniqueCode("STAYNONE");
		long stay = insertStay(code, today().minusDays(3), 3);

		assertEquals(1, markNoShows.sweep());

		assertEquals(List.of(today().minusDays(3), today().minusDays(2), today().minusDays(1)),
				missedNights(stay));
		assertEquals("NO_SHOW", statusOf(stay));
		assertNull(completedAtOf(stay), "a no-show carries no stamp on the booking, as today");
	}

	@Test
	void aLiveStayKeepsItsPastNightsMarkedWithoutResolving() {
		String code = uniqueCode("STAYLIVE");
		long stay = insertStay(code, today().minusDays(2), 4);

		assertEquals(0, markNoShows.sweep(), "tonight and tomorrow are still ahead");

		assertEquals(List.of(today().minusDays(2), today().minusDays(1)), missedNights(stay));
		assertEquals("CONFIRMED", statusOf(stay));
		assertTrue(scan(code, today()).isPresent(), "a guest who turns up late is still checked in");
	}
}
