package ai.riviera.platform.itinerary;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
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
import ai.riviera.platform.venue.IsolationBeaches;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The discovery list with a stay ({@code GET /api/venues?date&lastDate}): every entry keeps the
 * one-day shape and gains a {@code stay} verdict; without {@code lastDate} no entry has one; an
 * inverted or over-wide span is {@code 400}. Testcontainers Postgres, fixtures isolated on
 * {@link IsolationBeaches#STAY_VERDICT_IT_BEACH}; {@code VenueListControllerIT} stays the one-day oracle.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class DiscoveryListControllerIT {

	private static final String BEACH = IsolationBeaches.STAY_VERDICT_IT_BEACH;
	private static final LocalDate D1 = LocalDate.of(2026, 7, 10);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void seedFixtures() {
		long hosts = insertVenue("Hosts Beach", null);
		long h1 = insertSet(hosts, 1);
		insertSet(hosts, 2);
		take(h1, D1.plusDays(1));

		long cannot = insertVenue("Cannot Beach", null);
		long c1 = insertSet(cannot, 1);
		take(c1, D1.plusDays(2));

		long tooLong = insertVenue("Too Long Beach", 2);
		insertSet(tooLong, 1);
	}

	@AfterEach
	void cleanup() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (SELECT id FROM venue WHERE beach = :b)")
				.param("b", BEACH).update();
		jdbc.sql("DELETE FROM venue WHERE beach = :b").param("b", BEACH).update();
	}

	@Test
	void rangeListCarriesAVerdictPerVenue() throws Exception {
		mvc.perform(get("/api/venues").param("beach", BEACH)
						.param("date", D1.toString()).param("lastDate", D1.plusDays(3).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[?(@.name=='Hosts Beach')].stay.verdict").value("SAME_SET"))
				.andExpect(jsonPath("$[?(@.name=='Hosts Beach')].stay.sameSetCount").value(1))
				.andExpect(jsonPath("$[?(@.name=='Hosts Beach')].stay.longestRunDays").value(4))
				.andExpect(jsonPath("$[?(@.name=='Hosts Beach')].availability.free").value(2))
				.andExpect(jsonPath("$[?(@.name=='Hosts Beach')].fromPrice.minorUnits").value(2500))
				.andExpect(jsonPath("$[?(@.name=='Cannot Beach')].stay.verdict").value("CANNOT_HOST"))
				.andExpect(jsonPath("$[?(@.name=='Cannot Beach')].stay.longestRunDays").value(2))
				.andExpect(jsonPath("$[?(@.name=='Too Long Beach')].stay.verdict").value("CANNOT_HOST"))
				.andExpect(jsonPath("$[?(@.name=='Too Long Beach')].stay.maxStayDays").value(2));
	}

	@Test
	void oneDayListIsUnchanged() throws Exception {
		mvc.perform(get("/api/venues").param("beach", BEACH).param("date", D1.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].stay").doesNotExist())
				.andExpect(jsonPath("$[?(@.name=='Hosts Beach')].availability.free").value(2));
	}

	@Test
	void aOneDayLastDateIsAOneDayList() throws Exception {
		mvc.perform(get("/api/venues").param("beach", BEACH)
						.param("date", D1.toString()).param("lastDate", D1.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].stay").doesNotExist());
	}

	@Test
	void invertedRangeIs400() throws Exception {
		mvc.perform(get("/api/venues").param("date", D1.toString()).param("lastDate", D1.minusDays(1).toString()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(get("/api/venues").param("date", D1.toString()).param("lastDate", D1.plusDays(62).toString()))
				.andExpect(status().isBadRequest());
	}

	private long insertVenue(String name, Integer maxStayDays) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency, max_stay_days)
				VALUES (:name, :beach, 40, 1, 'INSTANT', 1500, 'EUR', :max)
				RETURNING id
				""")
				.param("name", name).param("beach", BEACH).param("max", maxStayDays)
				.query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return id;
	}

	private long insertSet(long venueId, int positionNo) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2500, 'EUR', :pos, 1)
				RETURNING id
				""")
				.param("v", venueId).param("pos", positionNo)
				.query(Long.class).single();
	}

	private void take(long setId, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", setId).param("date", date).update();
	}
}
