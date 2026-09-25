package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * A stay at an Instant venue through {@link CreateBooking}: one booking row spanning the days at
 * the stay's total, every day claimed (invariant #2), the guest cancel freeing every day for a
 * re-claim (D5), and a Request-to-Book venue refusing a range before any claim. Real Postgres
 * via Testcontainers, the stub gateway.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class RangeBookingIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final long PRICE = 4500L;
	private static final GuestContact GUEST = new GuestContact("stay@example.com", "Stay Guest", "+355699");

	@Autowired
	CreateBooking createBooking;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	ViewBooking viewBooking;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> jdbc.sql(
				"SELECT count(*) FROM event_publication WHERE completion_date IS NULL")
				.query(Long.class).single() == 0L);
		for (long venue : venues) {
			for (String dependent : List.of("booking_confirmation_mail_attempt", "payout_ledger_entry", "review")) {
				jdbc.sql("DELETE FROM " + dependent + " WHERE booking_id IN (SELECT id FROM booking WHERE venue_id = :v)")
						.param("v", venue).update();
			}
			jdbc.sql("DELETE FROM booking WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM set_availability WHERE set_id IN (SELECT id FROM set_position WHERE venue_id = :v)")
					.param("v", venue).update();
			jdbc.sql("DELETE FROM set_position WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM venue WHERE id = :v").param("v", venue).update();
		}
	}

	/** Ten days out: inside the guest's free cancellation window, so the cancel is admitted. */
	private static LocalDate firstDay() {
		return LocalDate.now(TIRANE).plusDays(10);
	}

	private SetId onlineSetOf(String mode) {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', :mode, 1500, 'EUR') RETURNING id
				""").param("name", "Range " + mode + " " + System.nanoTime()).param("mode", mode)
				.query(Long.class).single();
		venues.add(venue);
		long operator = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "range-op-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venue).param("o", operator).update();
		return new SetId(jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', :price, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venue).param("price", PRICE).query(Long.class).single());
	}

	private static CreateBookingCommand stay(SetId set, LocalDate first, int days) {
		return new CreateBookingCommand(set, first, first.plusDays(days - 1L), GUEST, null);
	}

	private long availabilityRows(SetId set, LocalDate first, LocalDate last) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s "
						+ "AND booking_date BETWEEN :first AND :last")
				.param("s", set.value()).param("first", first).param("last", last)
				.query(Long.class).single();
	}

	@Test
	void aRangeIsOneBookingAtTheTotal() {
		SetId set = onlineSetOf("INSTANT");
		LocalDate first = firstDay();

		BookingOutcome outcome = createBooking.create(stay(set, first, 3));

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertEquals(3 * PRICE, confirmed.confirmation().amount().minorUnits());
		assertEquals(first.plusDays(2), confirmed.confirmation().lastDate());
		List<String> rows = jdbc.sql("SELECT booking_date || '..' || last_date || '=' || amount_minor "
						+ "FROM booking WHERE set_id = :s").param("s", set.value()).query(String.class).list();
		assertEquals(List.of(first + ".." + first.plusDays(2) + "=" + 3 * PRICE), rows,
				"one row spanning the stay at the total");
		assertEquals(3L, availabilityRows(set, first, first.plusDays(2)), "every day is held");
		assertEquals(3L, jdbc.sql("SELECT count(*) FROM booking_day WHERE booking_id = "
						+ "(SELECT id FROM booking WHERE set_id = :s)").param("s", set.value())
				.query(Long.class).single(), "one service day per day of the stay");
	}

	@Test
	void cancellingFreesTheWholeRangeForReclaim() {
		SetId set = onlineSetOf("INSTANT");
		LocalDate first = firstDay();
		BookingOutcome.Confirmed booked = assertInstanceOf(BookingOutcome.Confirmed.class,
				createBooking.create(stay(set, first, 3)));

		CancelOutcome cancelled = cancelBooking.cancel(booked.confirmation().code());

		assertInstanceOf(CancelOutcome.Cancelled.class, cancelled);
		assertEquals(0L, availabilityRows(set, first, first.plusDays(2)), "every day is released");
		assertInstanceOf(BookingOutcome.Confirmed.class, createBooking.create(stay(set, first, 3)),
				"the same range is bookable again");
	}

	@Test
	void theCodeGatedViewCarriesTheSpan() {
		SetId set = onlineSetOf("INSTANT");
		LocalDate first = firstDay();
		BookingOutcome.Confirmed booked = assertInstanceOf(BookingOutcome.Confirmed.class,
				createBooking.create(stay(set, first, 4)));

		BookingDetail detail = viewBooking.byCode(booked.confirmation().code()).orElseThrow();

		assertEquals(first, detail.bookingDate());
		assertEquals(first.plusDays(3), detail.lastDate());
		assertEquals(4 * PRICE, detail.amount().minorUnits());
	}

	@Test
	void aRequestVenueRefusesARange() {
		SetId set = onlineSetOf("REQUEST");
		LocalDate first = firstDay();

		assertSame(BookingOutcome.Rejected.RANGE_NOT_OFFERED, createBooking.create(stay(set, first, 2)));
		assertEquals(0L, availabilityRows(set, first, first.plusDays(1)), "refused before any claim");
		assertEquals(ClaimOutcome.CLAIMED, availability.claim(set, first), "sanity: the day was never held");
	}
}
