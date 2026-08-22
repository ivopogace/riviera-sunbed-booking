package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.util.List;

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
import ai.riviera.platform.venue.vocabulary.AvailabilitySummary;
import ai.riviera.platform.venue.vocabulary.DailyAvailability;
import ai.riviera.platform.venue.vocabulary.SetView;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The calendar read at the {@link VenueCatalog} seam (Testcontainers Postgres): every day in the
 * window comes back, days nobody has touched read {@code free == total}, and the count for a day
 * equals what the single-day map read reports for that same day — invariant #2's single source of
 * truth, asserted rather than assumed.
 *
 * <p>Seeds its own venue and sets, so neither the shared demo map nor another test's holds can
 * decide a count here.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueAvailabilityCalendarIT {

	private static final int TOTAL_SETS = 4;
	private static final String FIXTURE = "avcal fixture venue";

	@Autowired
	VenueCatalog catalog;

	@Autowired
	JdbcClient jdbc;

	private VenueId venue;

	@BeforeEach
	void seed() {
		clearFixtures();
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Avcal Beach', 'Avcal Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", FIXTURE).query(Long.class).single();
		for (int i = 1; i <= TOTAL_SETS; i++) {
			jdbc.sql("""
					INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
					                          price_minor, price_currency, grid_x, grid_y)
					VALUES (:venue, 'A', :no, 'STANDARD', 'ONLINE', 2500, 'EUR', :no, 1)
					""").param("venue", id).param("no", i).update();
		}
		// An ACTIVE owner, or the #693 fence hides the venue from every tourist read.
		long owner = jdbc.sql("""
				INSERT INTO operator (username, status, contact_email)
				VALUES ('avcal-owner', 'ACTIVE', 'avcal-owner@example.test') RETURNING id
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
		jdbc.sql("DELETE FROM operator WHERE username = 'avcal-owner'").update();
	}

	private List<Long> setIds() {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id")
				.param("v", venue.value()).query(Long.class).list();
	}

	private void hold(long setId, LocalDate date, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
				+ "VALUES (:id, :date, :state)")
				.param("id", setId).param("date", date).param("state", state).update();
	}

	@Test
	void countsEveryDayInTheWindowIncludingUntouchedOnes() {
		List<Long> sets = setIds();
		LocalDate from = LocalDate.of(2027, 3, 1);
		hold(sets.get(0), from.plusDays(1), "BOOKED_ONLINE");
		hold(sets.get(1), from.plusDays(1), "STAFF_MARKED");
		hold(sets.get(2), from.plusDays(3), "BOOKED_ONLINE");

		List<DailyAvailability> days = catalog.availabilityBetween(venue, from, from.plusDays(4))
				.orElseThrow();

		assertEquals(List.of(
				new DailyAvailability(from, new AvailabilitySummary(4, TOTAL_SETS)),
				new DailyAvailability(from.plusDays(1), new AvailabilitySummary(2, TOTAL_SETS)),
				new DailyAvailability(from.plusDays(2), new AvailabilitySummary(4, TOTAL_SETS)),
				new DailyAvailability(from.plusDays(3), new AvailabilitySummary(3, TOTAL_SETS)),
				new DailyAvailability(from.plusDays(4), new AvailabilitySummary(4, TOTAL_SETS))),
				days,
				"every day in the inclusive window, ascending; untouched days read free == total");
	}

	@Test
	void agreesWithTheSingleDayMapRead() {
		List<Long> sets = setIds();
		LocalDate from = LocalDate.of(2027, 4, 1);
		hold(sets.get(0), from, "BOOKED_ONLINE");
		hold(sets.get(1), from.plusDays(2), "STAFF_MARKED");
		hold(sets.get(2), from.plusDays(2), "BOOKED_ONLINE");

		List<DailyAvailability> days = catalog.availabilityBetween(venue, from, from.plusDays(2))
				.orElseThrow();

		for (DailyAvailability day : days) {
			long freeOnTheMap = catalog.findVenueMap(venue, day.date()).orElseThrow().sets().stream()
					.map(SetView::availability)
					.filter("FREE"::equals)
					.count();
			assertEquals(freeOnTheMap, day.sets().free(),
					"the calendar and the map must not derive 'free' differently on " + day.date());
		}
	}

	@Test
	void singleDayWindowIsOneEntry() {
		LocalDate day = LocalDate.of(2027, 5, 1);

		assertEquals(List.of(new DailyAvailability(day, new AvailabilitySummary(TOTAL_SETS, TOTAL_SETS))),
				catalog.availabilityBetween(venue, day, day).orElseThrow(),
				"from == to is a legal one-day window, not an empty one");
	}

	@Test
	void widestWindowIsCountedWithoutOverflowing() {
		LocalDate from = LocalDate.of(2027, 7, 1);

		List<DailyAvailability> days = catalog.availabilityBetween(venue, from, from.plusDays(61))
				.orElseThrow();

		assertEquals(62, days.size(), "the edge's widest legal window is served whole");
		assertEquals(from.plusDays(61), days.getLast().date());
	}

	@Test
	void anInvertedWindowIsACallerBug() {
		LocalDate day = LocalDate.of(2027, 8, 1);

		assertThrows(IllegalArgumentException.class,
				() -> catalog.availabilityBetween(venue, day, day.minusDays(1)),
				"the port states the precondition; it must not answer an impossible window");
	}

	@Test
	void unknownVenueIsEmpty() {
		assertTrue(catalog.availabilityBetween(new VenueId(-1L),
				LocalDate.of(2027, 6, 1), LocalDate.of(2027, 6, 2)).isEmpty(),
				"no such venue is absent, not an empty day list");
	}
}
