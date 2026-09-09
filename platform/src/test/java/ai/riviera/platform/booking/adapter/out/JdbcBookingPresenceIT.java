package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The four {@code venue.spi.BookingPresence} probes and the two different questions they answer.
 * The venue- and set-scoped {@code hasBookings} count a booking of <em>any</em> status, including
 * terminal history, because any booking pins its set through the RESTRICT {@code booking.set_id}
 * FK — that is the delete guard. {@code hasLiveBookings} counts only non-terminal ones — the edit
 * guard, where finished history strands nobody. Scope matters too: a sibling set on the same venue
 * is not claimed by its neighbour's booking. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class JdbcBookingPresenceIT {

	@Autowired
	BookingPresence presence;

	@Autowired
	JdbcClient jdbc;

	@Test
	void aTerminalBookingClaimsItsOwnSetButNotItsNeighbour() {
		long venueId = insertVenue("Presence Venue");
		long booked = insertSet(venueId, 1);
		long free = insertSet(venueId, 2);
		insertBooking("PRES0001", venueId, booked, "CANCELLED");

		assertTrue(presence.hasBookings(new SetId(booked)),
				"a long-terminal booking still pins its set through the RESTRICT FK");
		assertFalse(presence.hasBookings(new SetId(free)),
				"the probe must be set-scoped: a sibling set on the same venue is unclaimed");
		assertTrue(presence.hasBookings(new VenueId(venueId)),
				"the venue-scoped probe the bulk replace uses is unchanged");
	}

	@Test
	void aVenueWithNoBookingsClaimsNeitherScope() {
		long venueId = insertVenue("Pristine Venue");
		long setId = insertSet(venueId, 1);

		assertFalse(presence.hasBookings(new SetId(setId)));
		assertFalse(presence.hasBookings(new VenueId(venueId)));
	}

	/**
	 * The edit guard's narrower question. Every terminal status must read as not-live, so a set
	 * whose whole history is finished stays repositionable — the freeze the any-status probe would
	 * otherwise make permanent.
	 */
	@Test
	void everyTerminalStatusReadsAsNotLive() {
		long venueId = insertVenue("Terminal Venue");
		int position = 0;
		for (BookingStatus status : BookingStatus.values()) {
			if (status.canStillBeHonoured()) {
				continue;
			}
			long setId = insertSet(venueId, ++position);
			insertBooking("TERM" + String.format("%04d", position), venueId, setId, status.name());

			assertFalse(presence.hasLiveBookings(new SetId(setId)),
					() -> status + " is terminal, so it must not block a reposition");
			assertTrue(presence.hasBookings(new SetId(setId)),
					() -> status + " still pins the row through the RESTRICT FK, so a delete stays refused");
		}
	}

	@Test
	void everyNonTerminalStatusReadsAsLive() {
		long venueId = insertVenue("Live Venue");
		int position = 0;
		for (BookingStatus status : BookingStatus.values()) {
			if (!status.canStillBeHonoured()) {
				continue;
			}
			long setId = insertSet(venueId, ++position);
			insertBooking("LIVE" + String.format("%04d", position), venueId, setId, status.name());

			assertTrue(presence.hasLiveBookings(new SetId(setId)),
					() -> status + " can still be honoured, so moving the set would strand a guest");
		}
	}

	/**
	 * The read the owner's beach map pins a locked cell with: per set, the earliest date a guest may
	 * still turn up on. Finished history never answers, a set whose whole history is finished is
	 * absent, and a neighbour's booking never bleeds across.
	 */
	@Test
	void nearestLiveBookingsAnswersTheEarliestHonourableDatePerSet() {
		long venueId = insertVenue("Nearest Venue");
		long twiceBooked = insertSet(venueId, 1);
		long finishedOnly = insertSet(venueId, 2);
		long neverBooked = insertSet(venueId, 3);
		insertBooking("NEAR0001", venueId, twiceBooked, "CANCELLED", LocalDate.of(2027, 6, 10));
		insertBooking("NEAR0002", venueId, twiceBooked, "CONFIRMED", LocalDate.of(2027, 6, 22));
		insertBooking("NEAR0003", venueId, twiceBooked, "PENDING_REQUEST", LocalDate.of(2027, 6, 25));
		insertBooking("NEAR0004", venueId, finishedOnly, "COMPLETED", LocalDate.of(2027, 6, 1));

		assertEquals(Map.of(new SetId(twiceBooked), LocalDate.of(2027, 6, 22)),
				presence.nearestLiveBookings(List.of(
						new SetId(twiceBooked), new SetId(finishedOnly), new SetId(neverBooked))),
				"the earliest non-terminal date; the cancelled one before it and the finished set are absent");
		assertEquals(Map.of(), presence.nearestLiveBookings(List.of()),
				"an empty input answers empty without a query");
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
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

	private void insertBooking(String code, long venueId, long setId, String status) {
		insertBooking(code, venueId, setId, status, LocalDate.of(2027, 8, 10));
	}

	private void insertBooking(String code, long venueId, long setId, String status, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status)
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.param("status", status).update();
	}
}
