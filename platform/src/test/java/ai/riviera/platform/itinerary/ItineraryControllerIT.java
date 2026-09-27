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
 * {@code GET /api/venues/{venueId}/itinerary?date&lastDate[&anchorSetId]}: the plan on the wire with
 * its budget, stretches, moves and total; {@code plan: null} when none fits; {@code 404} for a hidden
 * venue; {@code 400} for a bad span or a foreign anchor. Fixtures isolated on
 * {@link IsolationBeaches#STAY_PLAN_IT_BEACH}; {@code PlanItineraryIT} is the port-level oracle.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ItineraryControllerIT {

	private static final String BEACH = IsolationBeaches.STAY_PLAN_IT_BEACH;
	private static final LocalDate D1 = LocalDate.of(2026, 7, 10);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private long venue;
	private long a1;
	private long b1;
	private long hidden;

	@BeforeEach
	void seedFixtures() {
		venue = insertVenue("Wire Beach", true);
		a1 = insertSet(venue, "A", 1, 1);
		b1 = insertSet(venue, "B", 1, 2);
		take(a1, D1.plusDays(2));
		take(a1, D1.plusDays(3));
		take(b1, D1);
		hidden = insertVenue("Hidden Wire Beach", false);
		insertSet(hidden, "A", 1, 1);
	}

	@AfterEach
	void cleanup() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (SELECT id FROM venue WHERE beach = :b)")
				.param("b", BEACH).update();
		jdbc.sql("DELETE FROM venue WHERE beach = :b").param("b", BEACH).update();
	}

	@Test
	void answersThePlanWithBudgetStretchesMovesAndTotal() throws Exception {
		mvc.perform(get("/api/venues/{id}/itinerary", venue)
						.param("date", D1.toString()).param("lastDate", D1.plusDays(3).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.maxMoves").value(3))
				.andExpect(jsonPath("$.anchor").doesNotExist())
				.andExpect(jsonPath("$.plan.moves").value(1))
				.andExpect(jsonPath("$.plan.stretches.length()").value(2))
				.andExpect(jsonPath("$.plan.stretches[0].setId").value(a1))
				.andExpect(jsonPath("$.plan.stretches[0].rowLabel").value("A"))
				.andExpect(jsonPath("$.plan.stretches[0].positionNo").value(1))
				.andExpect(jsonPath("$.plan.stretches[0].gridY").value(1))
				.andExpect(jsonPath("$.plan.stretches[0].tier").value("STANDARD"))
				.andExpect(jsonPath("$.plan.stretches[0].firstDate").value(D1.toString()))
				.andExpect(jsonPath("$.plan.stretches[0].lastDate").value(D1.plusDays(1).toString()))
				.andExpect(jsonPath("$.plan.stretches[0].days").value(2))
				.andExpect(jsonPath("$.plan.stretches[0].pricePerDay.minorUnits").value(2500))
				.andExpect(jsonPath("$.plan.stretches[0].amount.minorUnits").value(5000))
				.andExpect(jsonPath("$.plan.stretches[1].setId").value(b1))
				.andExpect(jsonPath("$.plan.moves").value(1))
				.andExpect(jsonPath("$.plan.movesBetween[0].onDate").value(D1.plusDays(2).toString()))
				.andExpect(jsonPath("$.plan.movesBetween[0].rowsAway").value(1))
				.andExpect(jsonPath("$.plan.movesBetween[0].positionsAway").value(0))
				.andExpect(jsonPath("$.plan.movesBetween[0].towardSea").value(false))
				.andExpect(jsonPath("$.plan.total.minorUnits").value(10000))
				.andExpect(jsonPath("$.plan.total.currency").value("EUR"));
	}

	@Test
	void anAnchorNamesItsRole() throws Exception {
		mvc.perform(get("/api/venues/{id}/itinerary", venue)
						.param("date", D1.toString()).param("lastDate", D1.plusDays(3).toString())
						.param("anchorSetId", String.valueOf(b1)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.anchor").value("END"));
	}

	@Test
	void noPlanWithinTheBudgetIsANullPlan() throws Exception {
		take(b1, D1.plusDays(2));
		mvc.perform(get("/api/venues/{id}/itinerary", venue)
						.param("date", D1.toString()).param("lastDate", D1.plusDays(3).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.maxMoves").value(3))
				.andExpect(jsonPath("$.plan").value(org.hamcrest.Matchers.nullValue()));
	}

	@Test
	void aHiddenVenueIs404() throws Exception {
		mvc.perform(get("/api/venues/{id}/itinerary", hidden)
						.param("date", D1.toString()).param("lastDate", D1.plusDays(3).toString()))
				.andExpect(status().isNotFound());
	}

	@Test
	void aBadSpanOrAForeignAnchorIs400() throws Exception {
		mvc.perform(get("/api/venues/{id}/itinerary", venue)
						.param("date", D1.toString()).param("lastDate", D1.minusDays(1).toString()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(get("/api/venues/{id}/itinerary", venue).param("date", D1.toString()))
				.andExpect(status().isBadRequest());
		mvc.perform(get("/api/venues/{id}/itinerary", venue)
						.param("date", D1.toString()).param("lastDate", D1.plusDays(3).toString())
						.param("anchorSetId", "-1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	private long insertVenue(String name, boolean visible) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency)
				VALUES (:name, :beach, 40, 1, 'INSTANT', 1500, 'EUR')
				RETURNING id
				""")
				.param("name", name).param("beach", BEACH)
				.query(Long.class).single();
		if (visible) {
			OwnershipFixtures.grantToBootstrap(jdbc, id);
		}
		return id;
	}

	private long insertSet(long venueId, String row, int positionNo, int gridY) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, :row, :pos, 'STANDARD', 'ONLINE', 2500, 'EUR', :pos, :y)
				RETURNING id
				""")
				.param("v", venueId).param("row", row).param("pos", positionNo).param("y", gridY)
				.query(Long.class).single();
	}

	private void take(long setId, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", setId).param("date", date).update();
	}
}
