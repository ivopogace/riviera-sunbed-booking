package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.spi.BookingPresence;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The {@code venue.spi.BookingPresence} probes: the venue-scoped one guarding the bulk layout
 * replace, and the set-scoped one guarding the per-set edit/remove. Both count a booking of any
 * status, including terminal history, because any booking pins its set through the RESTRICT
 * {@code booking.set_id} FK. The set-scoped probe must isolate to its own set — a sibling set on
 * the same venue is not claimed by its neighbour's booking. Testcontainers; skipped where Docker
 * is absent.
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
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status)
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", LocalDate.of(2027, 8, 10))
				.param("status", status).update();
	}
}
