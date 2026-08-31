package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.hamcrest.Matchers.contains;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the discovery list API ({@code GET /api/venues?beach=&region=&date=}, issue #61):
 * filtering by beach/region, the rating-then-name sort, the per-{@code (set, date)} free/total
 * count sourced from {@code set_availability} (invariant #2), the "from" price in integer minor
 * units (invariant #5), the today-Europe/Tirane date default (invariant #6), empty results,
 * and public access. Testcontainers Postgres (runs in CI; skipped without Docker).
 *
 * <p>Fixtures are isolated under a marker {@code region} ({@link #IT_REGION}) and torn down in
 * {@link #cleanup()}, so the class is independent of the Miramar seed and of sibling ITs that
 * insert their own venues into the shared container.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class VenueListControllerIT {

	private static final String IT_REGION = "IT Discovery Riviera";
	private static final String BEACH_DHERMI = "Dhërmi IT";
	private static final String BEACH_PALASE = "Palasë IT";
	private static final String BEACH_SALES_CLOSE = "Sales Close IT";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private long aurora; // Dhërmi, rating 47, 3 sets @ 4500/3500/3000 → fromPrice 3000
	private long zephyr; // Palasë, rating 47 (name tie-break: Aurora before Zephyr)
	private long borsh;  // Palasë, rating 30 (sorts last)

	@BeforeEach
	void seedFixtures() {
		aurora = insertVenue("Aurora Bay", BEACH_DHERMI, 47);
		zephyr = insertVenue("Zephyr Cove", BEACH_PALASE, 47);
		borsh = insertVenue("Borsh Beach Club", BEACH_PALASE, 30);
		insertSet(aurora, 1, 4500);
		insertSet(aurora, 2, 3500);
		insertSet(aurora, 3, 3000);
		insertSet(zephyr, 1, 5000);
		insertSet(borsh, 1, 2000);
	}

	@AfterEach
	void cleanup() {
		// operator_venue has no cascade from venue, so drop the ownership rows first; then
		// ON DELETE CASCADE removes set_position, and set_availability cascades from set_position.
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN "
				+ "(SELECT id FROM venue WHERE region = :r)").param("r", IT_REGION).update();
		jdbc.sql("DELETE FROM venue WHERE region = :r").param("r", IT_REGION).update();
	}

	/** Owned by the bootstrap ACTIVE operator — the tourist list hides ownerless venues (#693). */
	private long insertVenue(String name, String beach, int ratingTenths) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency)
				VALUES (:name, :beach, :region, :rating, 10, 'INSTANT', 1500, 'EUR')
				RETURNING id
				""")
				.param("name", name).param("beach", beach).param("region", IT_REGION)
				.param("rating", ratingTenths)
				.query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return id;
	}

	private long insertSet(long venueId, int positionNo, long priceMinor) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', :price, 'EUR', :pos, 1)
				RETURNING id
				""")
				.param("v", venueId).param("pos", positionNo).param("price", priceMinor)
				.query(Long.class).single();
	}

	private void book(long setId, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
				+ "VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", setId).param("date", date).update();
	}

	private long firstSetOf(long venueId) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venueId).query(Long.class).single();
	}

	@Test
	void returnsAllVenuesSortedByRatingThenName() throws Exception {
		// AC-1: no filter ⇒ every venue, ordered rating desc then name asc. Asserted as a global
		// monotonic property (robust to seed/sibling venues), plus our fixtures must be present.
		String body = mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		List<Integer> ratings = JsonPath.read(body, "$[*].ratingTenths");
		List<String> names = JsonPath.read(body, "$[*].name");
		assertTrue(ratings.size() >= 4, "expected the seed + 3 fixtures");
		for (int i = 1; i < ratings.size(); i++) {
			int rp = ratings.get(i - 1);
			int rc = ratings.get(i);
			assertTrue(rp >= rc, "ratings must be non-increasing");
			if (rp == rc) {
				assertTrue(names.get(i - 1).compareTo(names.get(i)) <= 0,
						"equal ratings must be name-ascending");
			}
		}
	}

	@Test
	void filtersByRegionAndAppliesSort() throws Exception {
		// AC-1/AC-2: region filter isolates our 3 fixtures; order proves rating-desc + name-asc.
		mvc.perform(get("/api/venues").param("region", IT_REGION))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].name").value("Aurora Bay"))   // 47, name < Zephyr
				.andExpect(jsonPath("$[1].name").value("Zephyr Cove"))  // 47
				.andExpect(jsonPath("$[2].name").value("Borsh Beach Club")); // 30, last
	}

	@Test
	void filtersByBeach() throws Exception {
		// AC-2: a beach unique to one fixture returns exactly it.
		mvc.perform(get("/api/venues").param("beach", BEACH_DHERMI))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Aurora Bay"))
				.andExpect(jsonPath("$[0].beach").value(BEACH_DHERMI))
				.andExpect(jsonPath("$[0].region").value(IT_REGION));
	}

	@Test
	void combinesBeachAndRegionFilters() throws Exception {
		// AC-2: filters AND-combine — the shared beach narrowed by region returns both Palasë venues, sorted.
		mvc.perform(get("/api/venues").param("beach", BEACH_PALASE).param("region", IT_REGION))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].name").value("Zephyr Cove"))   // 47 before 30
				.andExpect(jsonPath("$[1].name").value("Borsh Beach Club"));
	}

	@Test
	void summaryCountsAndFromPrice() throws Exception {
		// AC-3: with no availability rows, free == total == set count; fromPrice is the cheapest set.
		mvc.perform(get("/api/venues").param("beach", BEACH_DHERMI).param("date", "2026-11-20"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].availability.total").value(3))
				.andExpect(jsonPath("$[0].availability.free").value(3))
				.andExpect(jsonPath("$[0].fromPrice.minorUnits").value(3000))
				.andExpect(jsonPath("$[0].fromPrice.currency").value("EUR"))
				.andExpect(jsonPath("$[0].ratingTenths").value(47))
				.andExpect(jsonPath("$[0].bookingMode").value("INSTANT"));
	}

	@Test
	void bookedSetLowersFreeCountForThatDateOnly() throws Exception {
		// AC-4: book one of Aurora's 3 sets for D → free 2 on D, still 3 on another date (invariant #2).
		LocalDate date = LocalDate.of(2026, 11, 21);
		LocalDate otherDate = LocalDate.of(2026, 11, 22);
		book(firstSetOf(aurora), date);

		mvc.perform(get("/api/venues").param("beach", BEACH_DHERMI).param("date", date.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].availability.total").value(3))
				.andExpect(jsonPath("$[0].availability.free").value(2));

		mvc.perform(get("/api/venues").param("beach", BEACH_DHERMI).param("date", otherDate.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].availability.free").value(3));
	}

	@Test
	void defaultsToTodayTirane() throws Exception {
		// AC-5: no date param ⇒ counts for today in Europe/Tirane.
		LocalDate today = LocalDate.now(TIRANE);
		book(firstSetOf(aurora), today);

		mvc.perform(get("/api/venues").param("beach", BEACH_DHERMI))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].availability.free").value(2));
	}

	@Test
	void unmatchedFilterReturnsEmptyArray() throws Exception {
		// AC-6: a filter that matches nothing is 200 + [], never 404.
		mvc.perform(get("/api/venues").param("region", "No Such Region IT"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void endpointIsPublic() throws Exception {
		// AC-7: no auth header → 200 (the tourist read endpoint is permitted).
		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk());
	}

	@Test
	void listCarriesAmenitiesAndDistance() throws Exception {
		// T7 (#140), AC-2: aurora (Dhërmi — a beach unique to one fixture) gains a distance + two
		// amenities inserted OUT of catalogue order (WIFI, BEACH_BAR); the list card carries them
		// back catalogue-ordered. Cleaned up by the region @AfterEach (venue_amenity cascades).
		jdbc.sql("UPDATE venue SET distance_to_water_m = 25 WHERE id = :v").param("v", aurora).update();
		for (String amenity : new String[] { "WIFI", "BEACH_BAR" }) {
			jdbc.sql("INSERT INTO venue_amenity (venue_id, amenity) VALUES (:v, :a)")
					.param("v", aurora).param("a", amenity).update();
		}

		mvc.perform(get("/api/venues").param("beach", BEACH_DHERMI))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].distanceToWaterM").value(25))
				.andExpect(jsonPath("$[0].amenities").value(contains("BEACH_BAR", "WIFI")));
	}

	/**
	 * A fresh visible venue at the given {@code sales_close} boundary value — the boundary-venue
	 * trick the reserve ITs use instead of clock mocking: a {@code 00:01} venue is closed for today
	 * at any run hour past the first minute, a {@code 23:59} venue open until the last.
	 */
	private long insertVenueAtSalesClose(String name, LocalTime salesClose) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency, sales_close)
				VALUES (:name, :beach, :region, 40, 10, 'INSTANT', 1500, 'EUR', :close)
				RETURNING id
				""")
				.param("name", name).param("beach", BEACH_SALES_CLOSE).param("region", IT_REGION)
				.param("close", salesClose)
				.query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return id;
	}

	/** Skip the midnight minutes where "today" or a boundary venue's verdict would flip mid-test. */
	private static void assumeAwayFromMidnightBoundaries() {
		LocalTime now = LocalTime.now(TIRANE);
		Assumptions.assumeTrue(now.isAfter(LocalTime.of(0, 2)) && now.isBefore(LocalTime.of(23, 58)),
				"skipped near midnight — today would roll over or a boundary venue's verdict flip mid-test");
	}

	@Test
	void listCarriesPerVenueSalesOpenForToday() throws Exception {
		// #793 AC-1: today's list carries per-venue verdicts — 00:01 closed, 23:59 open, one response.
		assumeAwayFromMidnightBoundaries();
		long closed = insertVenueAtSalesClose("Closed For Today IT", LocalTime.of(0, 1));
		long open = insertVenueAtSalesClose("Open Till Late IT", LocalTime.of(23, 59));

		mvc.perform(get("/api/venues").param("beach", BEACH_SALES_CLOSE)
						.param("date", LocalDate.now(TIRANE).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)].salesOpen".formatted(closed)).value(contains(false)))
				.andExpect(jsonPath("$[?(@.id == %d)].salesOpen".formatted(open)).value(contains(true)));
	}

	@Test
	void futureDatesAreOpenAtEveryVenue() throws Exception {
		// #793 AC-2: tomorrow is open at both boundary venues — the rule alone, no special-casing.
		assumeAwayFromMidnightBoundaries();
		long optOut = insertVenueAtSalesClose("Opt-Out Tomorrow IT", LocalTime.of(0, 1));
		long lateClose = insertVenueAtSalesClose("Late Tomorrow IT", LocalTime.of(23, 59));

		mvc.perform(get("/api/venues").param("beach", BEACH_SALES_CLOSE)
						.param("date", LocalDate.now(TIRANE).plusDays(1).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)].salesOpen".formatted(optOut)).value(contains(true)))
				.andExpect(jsonPath("$[?(@.id == %d)].salesOpen".formatted(lateClose)).value(contains(true)));
	}

	@Test
	void blankFilterParamIsTreatedAsUnfiltered() throws Exception {
		// `?region=` (empty) must mean "no constraint", not "match the empty string" → still lists all.
		String blank = mvc.perform(get("/api/venues").param("region", ""))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		String none = mvc.perform(get("/api/venues"))
				.andReturn().getResponse().getContentAsString();
		List<Object> blankList = JsonPath.read(blank, "$");
		List<Object> noneList = JsonPath.read(none, "$");
		assertEquals(noneList.size(), blankList.size(),
				"blank filter must return the same venues as no filter");
	}
}
