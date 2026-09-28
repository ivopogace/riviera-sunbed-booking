package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
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
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * AC-4 (issue #12): the admin weather refund fully refunds <strong>every</strong> lone one-day
 * booking for a venue+date <em>regardless of the cutoff</em> (invariant #10), records reason
 * {@code WEATHER}, frees each {@code (set, date)} (invariant #2), and publishes one
 * {@link BookingCancelled} per booking; a stay's day is refunded at its own rate while the stay continues
 * (issue #1210), publishing one {@link BookingDayRefunded}. Seeds confirmed bookings directly on a <strong>past</strong>
 * date (after the cutoff, when a tourist cancel is refused outright) to prove the cutoff is ignored.
 * That past-date seeding also pins the guest-cancel fence's scope: the operator path stays open once
 * the service day has passed, because a post-storm refund returns the venue's own money.
 * Drives the real {@link RefundForWeather} port against Testcontainers Postgres. Each test uses its
 * own past date so the per-(venue, date) counts are deterministic on the shared container.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
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

	@Autowired
	ai.riviera.platform.booking.application.checkin.MarkNoShows markNoShows;

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
		return confirmedStay(venueId, setId, date, 1, code, amountMinor);
	}

	/** Insert a CONFIRMED stay of {@code days} from {@code first}, every day held, with an accrual. */
	private Seeded confirmedStay(long venueId, long setId, LocalDate first, int days, String code, long amountMinor) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long bookingId = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("first", first).param("last", first.plusDays(days - 1))
				.param("amount", amountMinor)
				.query(Long.class).single();
		for (int i = 0; i < days; i++) {
			jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
							+ "VALUES (:set, :date, 'BOOKED_ONLINE')")
					.param("set", setId).param("date", first.plusDays(i)).update();
		}
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

	private void attend(long bookingId, LocalDate day) {
		jdbc.sql("UPDATE booking_day SET attended_at = NOW() WHERE booking_id = :id AND service_date = :d")
				.param("id", bookingId).param("d", day).update();
	}

	private Long dayRefund(long bookingId, LocalDate day) {
		return jdbc.sql("SELECT refund_minor FROM booking_day WHERE booking_id = :id AND service_date = :d")
				.param("id", bookingId).param("d", day).query(Long.class).optional().orElse(null);
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

	/**
	 * The no-show sweep must not silently close the post-storm refund window. It marks every past-day
	 * {@code CONFIRMED} booking {@code NO_SHOW} within the hour, and a washed-out day is precisely
	 * where those rows come from — the guests who stayed home because of the weather.
	 */
	@Test
	void refundsSweptNoShowsOnAPastDate() {
		LocalDate day = LocalDate.of(2020, 7, 9);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 2);
		Seeded stayedHome = confirmedBooking(venueId, sets.get(0), day, "WX00000009", 4500L);
		Seeded alsoStayedHome = confirmedBooking(venueId, sets.get(1), day, "WX00000010", 3500L);

		markNoShows.sweep();
		assertEquals("NO_SHOW", status(stayedHome.bookingId()), "the sweep ran on this day");
		assertEquals("NO_SHOW", status(alsoStayedHome.bookingId()));

		WeatherRefundOutcome outcome =
				refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), day);

		assertEquals(2, outcome.refundedCount(), "a swept no-show is still weather-refundable");
		assertEquals(8000L, outcome.totalRefundedMinor(), "full refund of 4500 + 3500");
		for (Seeded s : List.of(stayedHome, alsoStayedHome)) {
			assertEquals("CANCELLED", status(s.bookingId()));
			assertEquals(s.amountMinor(), jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id")
					.param("id", s.bookingId()).query(Long.class).single());
			assertEquals("WEATHER", jdbc.sql("SELECT cancel_reason FROM booking WHERE id = :id")
					.param("id", s.bookingId()).query(String.class).single());
			assertEquals(0, availabilityRows(s.setId(), day), "the set is freed (invariant #2)");
		}
		assertEquals(2, events.stream(BookingCancelled.class)
				.filter(e -> e.bookingDate().equals(day)).count(),
				"one BookingCancelled per booking, so payout reverses exactly once (invariant #9)");
	}

	/** AC-1: a storm on day 8 of a 14-day booking refunds day 8's rate, the stay continues and keeps its set. */
	@Test
	void aStaysUnattendedDayIsRefundedAndTheStayContinues() {
		LocalDate first = LocalDate.of(2020, 8, 1);
		LocalDate storm = first.plusDays(7);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 1);
		Seeded stay = confirmedStay(venueId, sets.getFirst(), first, 14, "WXSTAY0001", 42000L);

		WeatherRefundOutcome outcome = refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), storm);

		assertEquals(0, outcome.refundedCount(), "no one-day booking on the date");
		assertEquals(1, outcome.dayRefundCount(), "one stay had its day refunded");
		assertEquals(3000L, outcome.dayRefundedMinor(), "day 8's rate: 42000 over 14 days (invariant #5)");
		assertEquals("EUR", outcome.currency());
		assertEquals(List.of(), outcome.notRefunded());
		assertEquals("CONFIRMED", status(stay.bookingId()), "the stay continues");
		assertEquals(3000L, dayRefund(stay.bookingId(), storm), "the day carries its refund");
		assertEquals(13L, jdbc.sql("SELECT COUNT(*) FROM booking_day WHERE booking_id = :id AND refunded_at IS NULL")
				.param("id", stay.bookingId()).query(Long.class).single(), "the other thirteen days are untouched");
		assertNull(jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id").param("id", stay.bookingId())
				.query(Long.class).optional().orElse(null), "the booking's own refund column is the cancellation's");
		for (int i = 0; i < 14; i++) {
			assertEquals(1, availabilityRows(stay.setId(), first.plusDays(i)), "every day stays held (invariant #2)");
		}
		List<BookingDayRefunded> published = events.stream(BookingDayRefunded.class)
				.filter(e -> e.serviceDate().equals(storm)).toList();
		assertEquals(1, published.size(), "one BookingDayRefunded");
		assertEquals(new BookingId(stay.bookingId()), published.getFirst().bookingId());
		assertEquals(3000L, published.getFirst().refundMinor());
		assertEquals(0, events.stream(BookingCancelled.class).filter(e -> e.bookingId().value() == stay.bookingId())
				.count(), "nothing is cancelled");
	}

	/** AC-2: a day the guest checked into keeps its money, and the outcome names the booking. */
	@Test
	void aCheckedInDayIsNotRefundedAndIsNamed() {
		LocalDate first = LocalDate.of(2020, 8, 20);
		LocalDate storm = first.plusDays(1);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 1);
		Seeded stay = confirmedStay(venueId, sets.getFirst(), first, 3, "WXSTAY0002", 9000L);
		attend(stay.bookingId(), storm);

		WeatherRefundOutcome outcome = refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), storm);

		assertEquals(0, outcome.dayRefundCount());
		assertEquals(List.of(new BookingId(stay.bookingId())), outcome.notRefunded(), "named by id, never by code");
		assertEquals("CONFIRMED", status(stay.bookingId()));
		assertNull(dayRefund(stay.bookingId(), storm), "the attended day is not refunded");
		assertEquals(0, events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == stay.bookingId()).count());
	}

	/** AC-3: a day the sweep marked missed is refunded, on a live stay and on one already COMPLETED. */
	@Test
	void aMissedDayIsRefundedWhateverTheStayOutcome() {
		LocalDate first = LocalDate.of(2020, 9, 1);
		LocalDate storm = first.plusDays(1);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 2);
		Seeded live = confirmedStay(venueId, sets.get(0), first, 3, "WXSTAY0003", 9000L);
		Seeded completed = confirmedStay(venueId, sets.get(1), first, 3, "WXSTAY0004", 9000L);
		attend(completed.bookingId(), first);
		markNoShows.sweep();
		assertEquals("NO_SHOW", status(live.bookingId()), "swept: no day attended");
		assertEquals("COMPLETED", status(completed.bookingId()), "swept: day 1 attended");

		WeatherRefundOutcome outcome = refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), storm);

		assertEquals(2, outcome.dayRefundCount(), "both stays' missed storm day is refunded");
		assertEquals(6000L, outcome.dayRefundedMinor());
		assertEquals(3000L, dayRefund(live.bookingId(), storm));
		assertEquals(3000L, dayRefund(completed.bookingId(), storm));
		assertEquals("NO_SHOW", status(live.bookingId()), "the outcomes stand");
		assertEquals("COMPLETED", status(completed.bookingId()));
		assertEquals(1L, jdbc.sql("SELECT COUNT(*) FROM booking_day WHERE booking_id = :id AND service_date = :d "
						+ "AND missed_at IS NOT NULL AND refunded_at IS NOT NULL")
				.param("id", live.bookingId()).param("d", storm).query(Long.class).single(),
				"missed and refunded sit together on the day");
	}

	/** AC-4: a stitched stay refunds the rate of the stretch that covers the date, a one-day stretch included. */
	@Test
	void aStitchedStayRefundsTheStretchsOwnRate() {
		LocalDate first = LocalDate.of(2020, 9, 10);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 2);
		long stayId = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date)
				VALUES ('WXSTITCH01', :venue, :first, :last) RETURNING id
				""").param("venue", venueId).param("first", first).param("last", first.plusDays(3))
				.query(Long.class).single();
		Seeded cheap = confirmedStay(venueId, sets.get(0), first, 3, "WXSTITCH01-1", 6000L);
		Seeded dear = confirmedStay(venueId, sets.get(1), first.plusDays(3), 1, "WXSTITCH01-2", 5000L);
		jdbc.sql("UPDATE booking SET stay_id = :stay WHERE id IN (:a, :b)")
				.param("stay", stayId).param("a", cheap.bookingId()).param("b", dear.bookingId()).update();

		WeatherRefundOutcome dayTwo = refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId),
				first.plusDays(1));
		WeatherRefundOutcome lastDay = refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId),
				first.plusDays(3));

		assertEquals(2000L, dayTwo.dayRefundedMinor(), "the cheap stretch's rate: 6000 over 3 days");
		assertEquals(5000L, lastDay.dayRefundedMinor(), "the dear stretch's rate, its one day");
		assertEquals(0, lastDay.refundedCount(), "a one-day stretch is a day of the stay, never cancelled");
		assertEquals("CONFIRMED", status(dear.bookingId()));
		assertEquals(1, availabilityRows(dear.setId(), first.plusDays(3)), "and keeps its set");
		assertEquals(new StayId(stayId), events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == dear.bookingId()).findFirst().orElseThrow().stayId(),
				"the event names the stay, so the mail can");
	}

	/** AC-5: a second run on the same date refunds nothing more; another storm date refunds another day. */
	@Test
	void twoStormDatesRefundTwoDaysAndARerunNone() {
		LocalDate first = LocalDate.of(2020, 10, 1);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 1);
		Seeded stay = confirmedStay(venueId, sets.getFirst(), first, 5, "WXSTAY0005", 15000L);
		VenueId venue = new VenueId(venueId);

		assertEquals(1, refundForWeather.refundForWeather(bootstrap(), venue, first.plusDays(1)).dayRefundCount());
		assertEquals(0, refundForWeather.refundForWeather(bootstrap(), venue, first.plusDays(1)).dayRefundCount(),
				"a re-run refunds nothing more");
		assertEquals(1, refundForWeather.refundForWeather(bootstrap(), venue, first.plusDays(2)).dayRefundCount(),
				"another storm date is another day");

		assertEquals(6000L, jdbc.sql("SELECT SUM(refund_minor) FROM booking_day WHERE booking_id = :id")
				.param("id", stay.bookingId()).query(Long.class).single(), "two days, refunded once each");
		assertEquals(2, events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == stay.bookingId()).count());
	}

	@Test
	void rerunRefundsNothingNew() {
		LocalDate day = LocalDate.of(2020, 7, 2);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 1);
		confirmedBooking(venueId, sets.getFirst(), day, "WX00000003", 4500L);

		assertEquals(1, refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), day).refundedCount(),
				"first run refunds the confirmed booking");
		assertEquals(0, refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), day).refundedCount(),
				"a re-run refunds nothing already cancelled (idempotent at booking level)");
	}

	@Test
	void reachesASameDayBooking() {
		// AC-11 (#791): a distinct set offset avoids colliding with other same-day fixtures.
		LocalDate today = LocalDate.now(ZoneId.of("Europe/Tirane"));
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 3);
		Seeded booking = confirmedBooking(venueId, sets.get(2), today, "WXTODAY001", 4500L);

		WeatherRefundOutcome outcome =
				refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), today);

		assertEquals(1, outcome.refundedCount(), "the same-day booking is refunded");
		assertEquals(4500L, outcome.totalRefundedMinor());
		assertEquals("CANCELLED", status(booking.bookingId()));
		assertEquals(0, availabilityRows(booking.setId(), today), "the set is freed (invariant #2)");
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
