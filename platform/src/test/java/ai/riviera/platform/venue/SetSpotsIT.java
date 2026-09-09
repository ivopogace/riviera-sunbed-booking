package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.Tier;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The two spot reads the remodel classification takes off {@code venue.api.SetBookingFacts}: the
 * active map with tier and pool (a retired set is not a spot), and the free online sets on a date
 * (a taken set, a walk-in set and a retired set are never candidates).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetSpotsIT {

	private static final LocalDate DATE = LocalDate.of(2035, 7, 1);

	@Autowired
	SetBookingFacts facts;

	@Autowired
	JdbcClient jdbc;

	@Test
	void theActiveMapCarriesPlacementTierAndPoolAndForgetsARetiredSet() {
		long venue = insertVenue("Spots Venue");
		long a1 = insertSet(venue, "A", 1, 1, "PREMIUM", "ONLINE");
		long a2 = insertSet(venue, "A", 2, 1, "STANDARD", "WALK_IN");
		long retired = insertSet(venue, "B", 1, 2, "STANDARD", "ONLINE");
		jdbc.sql("UPDATE set_position SET retired_at = NOW() WHERE id = :id").param("id", retired).update();

		List<SetSpot> spots = facts.activeSetsOf(new VenueId(venue));

		assertEquals(List.of(new SetId(a1), new SetId(a2)), spots.stream().map(SetSpot::setId).toList());
		assertEquals(Tier.PREMIUM, spots.get(0).tier());
		assertEquals(Pool.WALK_IN, spots.get(1).pool());
		assertEquals("A", spots.get(1).placement().rowLabel());
		assertEquals(2, spots.get(1).placement().positionNo());
		assertEquals(1, spots.get(1).placement().gridY());
	}

	@Test
	void theFreeOnlineSetsOnADateExcludeTakenWalkInAndRetiredSets() {
		long venue = insertVenue("Free Spots Venue");
		long free = insertSet(venue, "A", 1, 1, "STANDARD", "ONLINE");
		long taken = insertSet(venue, "A", 2, 1, "STANDARD", "ONLINE");
		insertSet(venue, "A", 3, 1, "STANDARD", "WALK_IN");
		long retired = insertSet(venue, "A", 4, 1, "STANDARD", "ONLINE");
		long freeOtherDay = insertSet(venue, "A", 5, 1, "STANDARD", "ONLINE");
		jdbc.sql("UPDATE set_position SET retired_at = NOW() WHERE id = :id").param("id", retired).update();
		insertHold(taken, DATE, "STAFF_MARKED");
		insertHold(freeOtherDay, DATE.plusDays(1), "BOOKED_ONLINE");

		List<SetId> ids = facts.freeOnlineSetsOn(new VenueId(venue), DATE).stream().map(SetSpot::setId).toList();

		assertEquals(List.of(new SetId(free), new SetId(freeOtherDay)), ids);
		assertTrue(facts.freeOnlineSetsOn(new VenueId(venue + 1_000_000), DATE).isEmpty());
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private long insertSet(long venueId, String row, int positionNo, int gridY, String tier, String pool) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, :row, :pos, :tier, :pool, 4500, 'EUR', :pos, :gridY)
				RETURNING id
				""").param("venue", venueId).param("row", row).param("pos", positionNo).param("tier", tier)
				.param("pool", pool).param("gridY", gridY).query(Long.class).single();
	}

	private void insertHold(long setId, LocalDate date, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, :state)")
				.param("set", setId).param("date", date).param("state", state).update();
	}
}
