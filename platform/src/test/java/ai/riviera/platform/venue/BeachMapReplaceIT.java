package ai.riviera.platform.venue;

import java.util.List;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the O3 bulk beach-map replace ({@code PUT /api/venues/{id}/beach-map}, issue #172) end to
 * end against Testcontainers Postgres, through the real {@code JdbcVenues}, {@code JdbcBookingPresence},
 * and {@code JdbcSetAvailabilityLookup} adapters. Pins: the whole grid round-trips through the U1 read
 * API with row A priced front-row premium and the {@code WALK_IN} pool preserved (AC-1/AC-4/AC-7);
 * regenerate replaces the previous layout (AC-1); and — the highest-stakes case — the
 * reject-unless-unclaimed guard refuses a replace when the venue has a booking or an availability hold,
 * leaving the existing layout <em>and</em> the hold untouched (AC-6, invariant #2 / R-1: the
 * {@code set_availability} CASCADE must never silently fire).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class BeachMapReplaceIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	private static String cell(String rowLabel, int positionNo, String tier, String pool,
			long minor, int gridX, int gridY) {
		return """
				{"rowLabel":"%s","positionNo":%d,"tier":"%s","pool":"%s",
				 "price":{"minorUnits":%d,"currency":"EUR"},"gridX":%d,"gridY":%d}
				""".formatted(rowLabel, positionNo, tier, pool, minor, gridX, gridY);
	}

	private static String layout(String... cells) {
		return "{\"sets\":[" + String.join(",", cells) + "]}";
	}

	private long createVenue(String name) throws Exception {
		String body = """
				{"name":"%s","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","commissionBps":1500,"payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""".formatted(name);
		MvcResult result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
						.post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andReturn();
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}

	private void putLayout(long venueId, String body, int expectedStatus) throws Exception {
		mvc.perform(put("/api/venues/{v}/beach-map", venueId).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().is(expectedStatus));
	}

	private List<Long> setIds(long venueId) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY grid_y, grid_x")
				.param("v", venueId).query(Long.class).list();
	}

	@Test
	void replaceThenTouristMapReflectsGrid() throws Exception {
		long venue = createVenue("Generate Club");

		// A 2x3 grid: row A (sea-facing) priced front-row premium, row B standard. One PUT.
		putLayout(venue, layout(
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1),
				cell("A", 3, "PREMIUM", "ONLINE", 3500, 3, 1),
				cell("B", 1, "STANDARD", "ONLINE", 2000, 1, 2),
				cell("B", 2, "STANDARD", "ONLINE", 2000, 2, 2),
				cell("B", 3, "STANDARD", "ONLINE", 2000, 3, 2)), 204);

		// AC-1/AC-7: the whole grid round-trips through the U1 read API, ordered (grid_y, grid_x).
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets.length()").value(6))
				.andExpect(jsonPath("$.sets[0].rowLabel").value("A"))
				.andExpect(jsonPath("$.sets[0].tier").value("PREMIUM"))
				.andExpect(jsonPath("$.sets[0].pool").value("ONLINE"))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(3500))
				.andExpect(jsonPath("$.sets[5].rowLabel").value("B"))
				.andExpect(jsonPath("$.sets[5].tier").value("STANDARD"))
				.andExpect(jsonPath("$.fromPrice.minorUnits").value(2000));
	}

	@Test
	void regenerateReplacesThePreviousLayout() throws Exception {
		long venue = createVenue("Regenerate Club");
		putLayout(venue, layout(
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1)), 204);

		// AC-1: regenerate to a smaller grid replaces (not appends) — the old sets are gone.
		putLayout(venue, layout(cell("A", 1, "PREMIUM", "ONLINE", 4000, 1, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(1))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(4000));
	}

	@Test
	void poolFlagPersistsAndReadsBack() throws Exception {
		long venue = createVenue("Pool Club");

		// AC-4: an ONLINE and a WALK_IN set in one layout — both pools round-trip distinctly (#3).
		putLayout(venue, layout(
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "WALK_IN", 2000, 2, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[0].pool").value("ONLINE"))
				.andExpect(jsonPath("$.sets[1].pool").value("WALK_IN"));
	}

	@Test
	void rejectsWhenVenueHasBooking() throws Exception {
		long venue = createVenue("Booked Club");
		putLayout(venue, layout(
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		long bookedSet = setIds(venue).getFirst();
		seedBooking(venue, bookedSet);

		// AC-6: a venue with a booking is locked — the replace is 409 LAYOUT_IN_USE and nothing changes.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(cell("A", 1, "PREMIUM", "ONLINE", 9999, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("LAYOUT_IN_USE"));

		// The original two sets are untouched (no partial delete).
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(2));
	}

	@Test
	void rejectsWhenVenueHasWalkInHoldAndHoldSurvives() throws Exception {
		long venue = createVenue("Held Club");
		putLayout(venue, layout(
				cell("A", 1, "STANDARD", "WALK_IN", 2000, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		long heldSet = setIds(venue).getFirst();
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, DATE '2035-07-01', 'STAFF_MARKED')
				""").param("s", heldSet).update();

		// AC-6 / R-1: the guard consults availability BEFORE any delete, so the CASCADE never fires.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("LAYOUT_IN_USE"));

		// The hold row still exists — it was not silently cascade-deleted.
		Long holds = jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", heldSet).query(Long.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(1L, holds);
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(2));
	}

	@Test
	void rejectsEmptyLayout() throws Exception {
		long venue = createVenue("Empty Club");
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"sets\":[]}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("EMPTY_LAYOUT"));
	}

	@Test
	void rejectsDuplicateCellWithinTheBatch() throws Exception {
		long venue = createVenue("Dup Club");
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(
								cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
								cell("B", 2, "STANDARD", "ONLINE", 2000, 1, 1)))) // same grid cell (1,1)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CELL_TAKEN"));
	}

	private void seedBooking(long venueId, long setId) {
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:e, 'Guest', '+355000') RETURNING id
				""").param("e", "guest-" + venueId + "@example.test").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, DATE '2035-07-01', 2000, 'EUR', 'CONFIRMED')
				""")
				.param("code", "BK-" + venueId + "-" + setId)
				.param("v", venueId).param("s", setId).param("c", customerId)
				.update();
	}
}
