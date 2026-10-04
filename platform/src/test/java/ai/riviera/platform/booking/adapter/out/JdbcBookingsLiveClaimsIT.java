package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.remodel.LiveClaim;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code Bookings#findLiveOnSets}: only bookings a guest may still turn up on, only on the named
 * sets, in service-date-then-id order, with the snapshotted amount and the stay a stretch belongs to;
 * an empty input costs no round-trip. {@code Bookings#findLiveStretchesOf}: the same rows for one stay,
 * whatever their sets. The status filter is the one {@code JdbcBookingPresence} derives, so the reads
 * cannot disagree on what "live" means.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class JdbcBookingsLiveClaimsIT {

	private static final LocalDate JULY_1 = LocalDate.of(2035, 7, 1);

	@Autowired
	Bookings bookings;

	@Autowired
	JdbcClient jdbc;

	@Test
	void answersTheLiveBookingsOnTheNamedSetsInDateThenIdOrder() {
		long venue = insertVenue("Live Claims Venue");
		long a1 = insertSet(venue, 1);
		long a2 = insertSet(venue, 2);
		long other = insertSet(venue, 3);
		long later = insertBooking(venue, a1, "CONFIRMED", JULY_1.plusDays(2));
		long pending = insertBooking(venue, a2, "PENDING_REQUEST", JULY_1);
		long awaiting = insertBooking(venue, a1, "AWAITING_PAYMENT", JULY_1);
		insertBooking(venue, a1, "CANCELLED", JULY_1);
		insertBooking(venue, a1, "COMPLETED", JULY_1.minusDays(30));
		insertBooking(venue, other, "CONFIRMED", JULY_1);

		List<LiveClaim> claims = bookings.findLiveOnSets(Set.of(new SetId(a1), new SetId(a2)));

		assertEquals(List.of(pending, awaiting, later), claims.stream().map(LiveClaim::bookingId).toList());
		assertEquals(BookingStatus.PENDING_REQUEST, claims.get(0).status());
		assertEquals(new SetId(a2), claims.get(0).setId());
		assertEquals(4500, claims.get(0).amountMinor());
		assertEquals("EUR", claims.get(0).currency());
		assertEquals(JULY_1.plusDays(2), claims.get(2).bookingDate());
	}

	@Test
	void aRefundedDayComesOffTheClaim() {
		// A 3-day stay whose stormy day already returned 1500 (#1210): the remodel refund is the 3000 that remain.
		long venue = insertVenue("Live Claims Storm Venue");
		long set = insertSet(venue, 1);
		long stay = insertBooking(venue, set, "CONFIRMED", JULY_1);
		jdbc.sql("UPDATE booking SET last_date = :last WHERE id = :id").param("last", JULY_1.plusDays(2)).param("id", stay)
				.update();
		jdbc.sql("INSERT INTO booking_day (booking_id, service_date, refunded_at, refund_minor, refund_reason) "
						+ "VALUES (:id, :day, NOW(), 1500, 'WEATHER')")
				.param("id", stay).param("day", JULY_1.plusDays(1)).update();

		LiveClaim claim = bookings.findLiveOnSets(Set.of(new SetId(set))).getFirst();

		assertEquals(4500, claim.amountMinor(), "the snapshotted price is untouched");
		assertEquals(1500, claim.dayRefundedMinor());
		assertEquals(3000, claim.remainingMinor());
	}

	@Test
	void anEmptySetListAnswersEmpty() {
		assertTrue(bookings.findLiveOnSets(List.of()).isEmpty());
	}

	@Test
	void answersAStaysLiveStretchesInDayOrderWhateverTheirSets() {
		long venue = insertVenue("Live Stretches Venue");
		long a1 = insertSet(venue, 1);
		long a2 = insertSet(venue, 2);
		long stay = insertStay(venue);
		long second = insertBooking(venue, a2, "AWAITING_PAYMENT", JULY_1.plusDays(2), stay);
		long first = insertBooking(venue, a1, "AWAITING_PAYMENT", JULY_1, stay);
		insertBooking(venue, a1, "CANCELLED", JULY_1.plusDays(4), stay);
		insertBooking(venue, a1, "AWAITING_PAYMENT", JULY_1);

		List<LiveClaim> stretches = bookings.findLiveStretchesOf(new StayId(stay));

		assertEquals(List.of(first, second), stretches.stream().map(LiveClaim::bookingId).toList(),
				"both live stretches, the cancelled one and the lone booking left out");
		assertEquals(List.of(new SetId(a1), new SetId(a2)), stretches.stream().map(LiveClaim::setId).toList());
		assertEquals(new StayId(stay), stretches.getFirst().stayId());
		assertEquals(BookingStatus.AWAITING_PAYMENT, stretches.getFirst().status());
		assertTrue(bookings.findLiveStretchesOf(new StayId(-1L)).isEmpty(), "an unknown stay has no stretches");
	}

	@Test
	void aLiveClaimOnASetNamesItsStayAndALoneOneNone() {
		long venue = insertVenue("Live Claims Stay Venue");
		long set = insertSet(venue, 1);
		long stay = insertStay(venue);
		long stretch = insertBooking(venue, set, "AWAITING_PAYMENT", JULY_1, stay);
		long lone = insertBooking(venue, set, "CONFIRMED", JULY_1.plusDays(1));

		List<LiveClaim> claims = bookings.findLiveOnSets(Set.of(new SetId(set)));

		assertEquals(List.of(stretch, lone), claims.stream().map(LiveClaim::bookingId).toList());
		assertEquals(new StayId(stay), claims.get(0).stayId());
		assertNull(claims.get(1).stayId());
	}

	private long insertStay(long venueId) {
		return jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :v, :first, :last) RETURNING id")
				.param("code", "LCS-" + System.nanoTime()).param("v", venueId).param("first", JULY_1)
				.param("last", JULY_1.plusDays(5)).query(Long.class).single();
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private long insertSet(long venueId, int positionNo) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", positionNo).query(Long.class).single();
	}

	private long insertBooking(long venueId, long setId, String status, LocalDate date) {
		return insertBooking(venueId, setId, status, date, null);
	}

	/** Codes and addresses unique across the suite: the full run shares one database with its siblings. */
	private long insertBooking(long venueId, long setId, String status, LocalDate date, Long stayId) {
		String code = "LC-" + System.nanoTime();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, stay_id)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status, :stay)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.param("status", status).param("stay", stayId, java.sql.Types.BIGINT).query(Long.class).single();
	}
}
