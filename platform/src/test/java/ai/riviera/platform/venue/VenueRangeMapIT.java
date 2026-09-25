package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.SetView;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The beach map read for a stay: each set is free on every day, on none, or on some — with the
 * days it is not free on named — sourced per {@code (set, date)} from {@code set_availability}
 * (invariant #2). A one-day read keeps answering {@code FREE} / {@code TAKEN} only.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueRangeMapIT {

	private static final String FIXTURE = "range map fixture venue";

	@Autowired
	VenueCatalog catalog;

	@Autowired
	JdbcClient jdbc;

	private VenueId venue;

	@BeforeEach
	void seed() {
		clearFixtures();
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", FIXTURE).query(Long.class).single();
		for (int i = 1; i <= 3; i++) {
			jdbc.sql("""
					INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
					                          price_minor, price_currency, grid_x, grid_y)
					VALUES (:venue, 'A', :no, 'STANDARD', 'ONLINE', 2500, 'EUR', :no, 1)
					""").param("venue", id).param("no", i).update();
		}
		long owner = jdbc.sql("""
				INSERT INTO operator (username, status, contact_email)
				VALUES ('rangemap-owner', 'ACTIVE', 'rangemap-owner@example.test') RETURNING id
				""").query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)")
				.param("venue", id).param("operator", owner).update();
		venue = new VenueId(id);
	}

	@AfterEach
	void clearFixtures() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN "
				+ "(SELECT id FROM venue WHERE name = :name)").param("name", FIXTURE).update();
		jdbc.sql("DELETE FROM venue WHERE name = :name").param("name", FIXTURE).update();
		jdbc.sql("DELETE FROM operator WHERE username = 'rangemap-owner'").update();
	}

	private List<Long> setIds() {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id")
				.param("v", venue.value()).query(Long.class).list();
	}

	private void hold(long setId, LocalDate date, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, :state)")
				.param("id", setId).param("date", date).param("state", state).update();
	}

	private Map<Long, SetView> read(StaySpan stay) {
		return catalog.findVenueMap(venue, stay).orElseThrow().sets().stream()
				.collect(Collectors.toMap(SetView::id, Function.identity()));
	}

	@Test
	void rangeStatesPerSet() {
		List<Long> sets = setIds();
		long free = sets.get(0);
		long partly = sets.get(1);
		long taken = sets.get(2);
		LocalDate first = LocalDate.of(2027, 7, 10);
		LocalDate last = first.plusDays(2);
		hold(partly, first.plusDays(1), "BOOKED_ONLINE");
		hold(taken, first, "BOOKED_ONLINE");
		hold(taken, first.plusDays(1), "STAFF_MARKED");
		hold(taken, last, "BOOKED_ONLINE");
		hold(free, last.plusDays(1), "BOOKED_ONLINE");

		Map<Long, SetView> range = read(new StaySpan(first, last));

		assertEquals("FREE", range.get(free).availability());
		assertEquals(3, range.get(free).freeDays());
		assertEquals(List.of(), range.get(free).takenDates(), "a day past the stay does not count");
		assertEquals("PARTLY_FREE", range.get(partly).availability());
		assertEquals(2, range.get(partly).freeDays());
		assertEquals(List.of(first.plusDays(1)), range.get(partly).takenDates());
		assertEquals("TAKEN", range.get(taken).availability());
		assertEquals(0, range.get(taken).freeDays());
		assertEquals(List.of(first, first.plusDays(1), last), range.get(taken).takenDates());
	}

	@Test
	void oneDayReadStillAnswersFreeOrTaken() {
		List<Long> sets = setIds();
		LocalDate day = LocalDate.of(2027, 7, 20);
		hold(sets.get(1), day, "BOOKED_ONLINE");

		Map<Long, SetView> map = read(StaySpan.oneDay(day));

		assertEquals("FREE", map.get(sets.get(0)).availability());
		assertEquals(1, map.get(sets.get(0)).freeDays());
		assertEquals(List.of(), map.get(sets.get(0)).takenDates());
		assertEquals("TAKEN", map.get(sets.get(1)).availability());
		assertEquals(0, map.get(sets.get(1)).freeDays());
		assertEquals(List.of(day), map.get(sets.get(1)).takenDates());
	}
}
