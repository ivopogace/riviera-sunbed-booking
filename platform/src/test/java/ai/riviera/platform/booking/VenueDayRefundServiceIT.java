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
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.booking.application.refund.RefundVenueDay;
import ai.riviera.platform.booking.application.refund.VenueDayRefundOutcome;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Issue #1275 (ADR-0027) at the {@link RefundVenueDay} seam against Testcontainers Postgres: a stay's day
 * is refunded at its own rate, stamped {@code VENUE} + released + actor, and its claim freed so the set is
 * sellable again (#2); a past day is refunded but keeps its claim; a lone one-day booking is cancelled whole
 * with reason {@code VENUE} in full whatever the cutoff (#10); a replay, an attended day and a weather day
 * are refused; a foreign code at an owned venue is not found. Every case uses its own dates and codes on
 * the shared container.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@RecordApplicationEvents
class VenueDayRefundServiceIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	RefundVenueDay refundVenueDay;

	@Autowired
	RefundForWeather refundForWeather;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	@Autowired
	OperatorDirectory operators;

	/** The bootstrap operator owns Miramar (V29). */
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
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' AND venue_id = :v ORDER BY id LIMIT :n")
				.param("v", venueId).param("n", n).query(Long.class).list();
	}

	/** A CONFIRMED span of {@code days} from {@code first}, every day held, with an accrual. */
	private Seeded confirmedStay(long venueId, long setId, LocalDate first, int days, String code, long amountMinor) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
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
			jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, 'BOOKED_ONLINE')")
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
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId).query(String.class).single();
	}

	private record DayStamp(Long refundMinor, String reason, boolean released, Long actor, boolean missed) {
	}

	private DayStamp day(long bookingId, LocalDate day) {
		return jdbc.sql("""
				SELECT refund_minor, refund_reason, released_at IS NOT NULL AS released, refunded_by_operator_id,
				       missed_at IS NOT NULL AS missed
				FROM booking_day WHERE booking_id = :id AND service_date = :d
				""")
				.param("id", bookingId).param("d", day)
				.query((rs, n) -> new DayStamp(rs.getObject("refund_minor", Long.class), rs.getString("refund_reason"),
						rs.getBoolean("released"), rs.getObject("refunded_by_operator_id", Long.class),
						rs.getBoolean("missed")))
				.single();
	}

	private long availabilityRows(long setId, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Long.class).single();
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	/** AC-1: day 3 of a 5-day stay, refunded at its rate, released, the claim re-claimable, the rest untouched. */
	@Test
	void aStaysDayIsRefundedReleasedAndTheStayContinues() {
		LocalDate first = today().plusDays(100);
		LocalDate dayThree = first.plusDays(2);
		long venueId = venueWithOnlineSets();
		Seeded stay = confirmedStay(venueId, onlineSets(venueId, 1).getFirst(), first, 5, "VDSTAY0001", 25000L);

		VenueDayRefundOutcome outcome = refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTAY0001", dayThree);

		assertEquals(new VenueDayRefundOutcome.DayRefunded(5000L, "EUR", true), outcome, "day 3's rate: 25000 over 5 days (#5)");
		assertEquals("CONFIRMED", status(stay.bookingId()), "the stay continues");
		DayStamp stamp = day(stay.bookingId(), dayThree);
		assertEquals(5000L, stamp.refundMinor());
		assertEquals("VENUE", stamp.reason());
		assertEquals(true, stamp.released());
		assertEquals(bootstrap().value(), stamp.actor(), "the actor is recorded, without a foreign key");
		assertEquals(4L, jdbc.sql("SELECT COUNT(*) FROM booking_day WHERE booking_id = :id AND refunded_at IS NULL")
				.param("id", stay.bookingId()).query(Long.class).single(), "days 1, 2, 4, 5 are untouched");
		assertEquals(0, availabilityRows(stay.setId(), dayThree), "the (set, day) claim is freed (#2)");
		assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(stay.setId()), dayThree), "and sellable again");
		for (int i : new int[] {0, 1, 3, 4}) {
			assertEquals(1, availabilityRows(stay.setId(), first.plusDays(i)), "every other day stays held");
		}
		List<BookingDayRefunded> published = events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == stay.bookingId()).toList();
		assertEquals(1, published.size());
		assertEquals(RefundReason.VENUE, published.getFirst().reason());
		assertEquals(true, published.getFirst().released());
		assertEquals(5000L, published.getFirst().refundMinor());
		assertNull(published.getFirst().stayId(), "a lone multi-day booking belongs to no stitched stay");
	}

	/** AC-2: a replay refunds nothing more; a checked-in day and a weather-held day are refused, the weather day keeping its claim. */
	@Test
	void aReplayAnAttendedDayAndAWeatherDayAreRefused() {
		LocalDate first = today().plusDays(120);
		long venueId = venueWithOnlineSets();
		Seeded stay = confirmedStay(venueId, onlineSets(venueId, 1).getFirst(), first, 4, "VDSTAY0002", 8000L);
		jdbc.sql("UPDATE booking_day SET attended_at = NOW() WHERE booking_id = :id AND service_date = :d")
				.param("id", stay.bookingId()).param("d", first).update();
		refundForWeather.refundForWeather(bootstrap(), new VenueId(venueId), first.plusDays(1));

		assertInstanceOf(VenueDayRefundOutcome.DayRefunded.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTAY0002", first.plusDays(2)));
		assertInstanceOf(VenueDayRefundOutcome.DayAlreadyRefunded.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTAY0002", first.plusDays(2)), "a replay");
		assertInstanceOf(VenueDayRefundOutcome.DayAttended.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTAY0002", first), "a checked-in day");
		assertInstanceOf(VenueDayRefundOutcome.DayAlreadyRefunded.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTAY0002", first.plusDays(1)),
				"a day the weather refund already gave back");

		assertEquals(1, events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == stay.bookingId() && e.reason() == RefundReason.VENUE).count(),
				"one venue refund, published once");
		DayStamp weatherDay = day(stay.bookingId(), first.plusDays(1));
		assertEquals("WEATHER", weatherDay.reason(), "the weather stamp stands (ADR-0026 §3)");
		assertEquals(false, weatherDay.released());
		assertEquals(1, availabilityRows(stay.setId(), first.plusDays(1)), "and the weather day keeps its set");
		assertEquals(0, availabilityRows(stay.setId(), first.plusDays(2)), "only the venue's day is freed");
	}

	/** AC-3: a past, missed day is refunded with reason {@code VENUE} but its claim is not freed (ADR-0027 §4). */
	@Test
	void aPastMissedDayIsRefundedButNotReleased() {
		LocalDate first = LocalDate.of(2021, 6, 1);
		LocalDate missed = first.plusDays(1);
		long venueId = venueWithOnlineSets();
		Seeded stay = confirmedStay(venueId, onlineSets(venueId, 1).getFirst(), first, 3, "VDSTAY0003", 9000L);
		jdbc.sql("UPDATE booking_day SET missed_at = NOW() WHERE booking_id = :id").param("id", stay.bookingId()).update();
		jdbc.sql("UPDATE booking SET status = 'NO_SHOW' WHERE id = :id").param("id", stay.bookingId()).update();

		VenueDayRefundOutcome outcome = refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTAY0003", missed);

		assertEquals(new VenueDayRefundOutcome.DayRefunded(3000L, "EUR", false), outcome);
		DayStamp stamp = day(stay.bookingId(), missed);
		assertEquals("VENUE", stamp.reason());
		assertEquals(false, stamp.released(), "a past day keeps its claim");
		assertEquals(true, stamp.missed(), "missed and refunded sit together");
		assertEquals(1, availabilityRows(stay.setId(), missed));
		assertEquals("NO_SHOW", status(stay.bookingId()), "the outcome stands");
		assertEquals(false, events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == stay.bookingId()).findFirst().orElseThrow().released());
	}

	/** AC-4: a lone one-day booking on a past date is cancelled whole, reason {@code VENUE}, refunded in full, its day freed. */
	@Test
	void aLoneOneDayBookingIsCancelledWholeWithReasonVenue() {
		LocalDate date = LocalDate.of(2021, 7, 1);
		long venueId = venueWithOnlineSets();
		Seeded lone = confirmedStay(venueId, onlineSets(venueId, 1).getFirst(), date, 1, "VDLONE0001", 4500L);

		VenueDayRefundOutcome outcome = refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDLONE0001", date);

		assertEquals(new VenueDayRefundOutcome.BookingCancelled(4500L, "EUR"), outcome, "full refund whatever the cutoff (#10)");
		assertEquals("CANCELLED", status(lone.bookingId()));
		assertEquals("VENUE", jdbc.sql("SELECT cancel_reason FROM booking WHERE id = :id").param("id", lone.bookingId())
				.query(String.class).single());
		assertEquals(4500L, jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id").param("id", lone.bookingId())
				.query(Long.class).single());
		assertEquals(0, availabilityRows(lone.setId(), date), "its day is released");
		assertNull(day(lone.bookingId(), date).refundMinor(), "the day leg is not taken: the cancellation carries the money");
		assertEquals(bootstrap().value(), day(lone.bookingId(), date).actor(), "the actor is recorded on its one service day");
		List<BookingCancelled> published = events.stream(BookingCancelled.class)
				.filter(e -> e.bookingId().value() == lone.bookingId()).toList();
		assertEquals(1, published.size(), "one BookingCancelled: one REVERSAL, one cancellation mail");
		assertEquals(RefundReason.VENUE, published.getFirst().reason());
		assertEquals(4500L, published.getFirst().refundMinor());
		assertInstanceOf(VenueDayRefundOutcome.NotFound.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDLONE0001", date),
				"a cancelled booking no longer happened; a replay finds nothing");
	}

	/** A stay's code names the stretch covering the date, so the day refunds at that stretch's rate. */
	@Test
	void aStitchedStayRefundsTheStretchsOwnRateByTheStaysCode() {
		LocalDate first = today().plusDays(140);
		long venueId = venueWithOnlineSets();
		List<Long> sets = onlineSets(venueId, 2);
		long stayId = jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES ('VDSTITCH01', :venue, :first, :last) RETURNING id")
				.param("venue", venueId).param("first", first).param("last", first.plusDays(3)).query(Long.class).single();
		Seeded cheap = confirmedStay(venueId, sets.get(0), first, 3, "VDSTITCH01-1", 6000L);
		Seeded dear = confirmedStay(venueId, sets.get(1), first.plusDays(3), 1, "VDSTITCH01-2", 5000L);
		jdbc.sql("UPDATE booking SET stay_id = :stay WHERE id IN (:a, :b)")
				.param("stay", stayId).param("a", cheap.bookingId()).param("b", dear.bookingId()).update();

		VenueDayRefundOutcome lastDay = refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTITCH01", first.plusDays(3));

		assertEquals(new VenueDayRefundOutcome.DayRefunded(5000L, "EUR", true), lastDay,
				"a one-day stretch is a day of the stay, never cancelled");
		assertEquals("CONFIRMED", status(dear.bookingId()));
		assertEquals(0, availabilityRows(dear.setId(), first.plusDays(3)), "its day is released");
		assertEquals(new StayId(stayId), events.stream(BookingDayRefunded.class)
				.filter(e -> e.bookingId().value() == dear.bookingId()).findFirst().orElseThrow().stayId());
		assertInstanceOf(VenueDayRefundOutcome.NotFound.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDSTITCH01-2", first.plusDays(3)),
				"a stretch's row code resolves nothing (ADR-0024)");
	}

	/** #2 (ADR-0027): a released day resold to another guest survives the first guest's later cancellation of the stay. */
	@Test
	void aLaterCancellationOfTheStayNeverFreesTheResoldDay() {
		LocalDate first = today().plusDays(180);
		LocalDate released = first.plusDays(1);
		long venueId = venueWithOnlineSets();
		Seeded stay = confirmedStay(venueId, onlineSets(venueId, 1).getFirst(), first, 3, "VDRESOLD01", 9000L);
		assertInstanceOf(VenueDayRefundOutcome.DayRefunded.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(venueId), "VDRESOLD01", released));
		assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(stay.setId()), released), "another guest takes the day");

		CancelOutcome outcome = cancelBooking.cancel("VDRESOLD01");

		assertInstanceOf(CancelOutcome.Cancelled.class, outcome);
		assertEquals("CANCELLED", status(stay.bookingId()));
		assertEquals(1, availabilityRows(stay.setId(), released), "the second guest's claim stands (invariant #2)");
		assertEquals(0, availabilityRows(stay.setId(), first), "the cancelled stay's own days are freed");
		assertEquals(0, availabilityRows(stay.setId(), first.plusDays(2)));
	}

	/** AC-5 at the service: a code from another venue at an owned venue reads as absent (#13, #7). */
	@Test
	void aForeignCodeAtAnOwnedVenueIsNotFound() {
		LocalDate date = today().plusDays(160);
		long owned = venueWithOnlineSets();
		long other = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Foreign Day Club', 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").query(Long.class).single();
		long foreignSet = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1) RETURNING id
				""").param("venue", other).query(Long.class).single();
		Seeded foreign = confirmedStay(other, foreignSet, date, 2, "VDFOREIGN1", 9000L);

		assertInstanceOf(VenueDayRefundOutcome.NotFound.class,
				refundVenueDay.refundDay(bootstrap(), new VenueId(owned), "VDFOREIGN1", date));

		assertEquals("CONFIRMED", status(foreign.bookingId()));
		assertNull(day(foreign.bookingId(), date).refundMinor());
		assertEquals(0, events.stream(BookingDayRefunded.class).filter(e -> e.bookingId().value() == foreign.bookingId()).count());
	}
}
