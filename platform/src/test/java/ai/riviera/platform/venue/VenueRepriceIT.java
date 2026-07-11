package ai.riviera.platform.venue;

import java.util.List;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import jakarta.servlet.http.Cookie;
import org.hamcrest.Matchers;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the O4 per-row reprice ({@code PUT /api/venues/{id}/rows/{rowLabel}/price}, issue #174) end
 * to end against Testcontainers Postgres, through the real {@code JdbcVenues} adapter. Pins:
 * <ul>
 *   <li><strong>AC-1/AC-2/AC-8</strong>: a row edit fans out to <em>every</em> set in the row (both
 *       pools) and the new price round-trips through the U1 read API (so the tourist map + booking
 *       dialog reflect it); other rows are untouched.</li>
 *   <li><strong>Availability-untouched</strong> (the decisive contrast with the O3 layout replace):
 *       repricing a row whose set has a {@code set_availability} hold <em>succeeds</em> and leaves the
 *       hold and the set id intact — invariant #2 is never engaged (no delete, no cascade, no lock).</li>
 *   <li><strong>AC-5</strong>: an unknown row / venue is {@code 404}.</li>
 *   <li><strong>AC-4</strong>: a negative or non-numeric price is {@code 400 INVALID_REQUEST} (§6b).</li>
 * </ul>
 * The cross-venue {@code 403} (invariant #13) lives in the {@code CrossVenueDenialIT} matrix.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class VenueRepriceIT {

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

	private static String priceBody(long minor) {
		return "{\"price\":{\"minorUnits\":%d,\"currency\":\"EUR\"}}".formatted(minor);
	}

	private long createVenue(String name) throws Exception {
		String body = """
				{"name":"%s","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","commissionBps":1500,"payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""".formatted(name);
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andReturn();
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}

	/** Seed a venue with row A (two ONLINE + one WALK_IN, all 3500) and row B (one ONLINE, 2000). */
	private long seedVenue(String name) throws Exception {
		long venue = createVenue(name);
		// The seed replace runs off the fresh venue's set_version (0) and bumps it to 1 (#226); reprice
		// bodies below therefore load the current token rather than assume 0.
		String layout = "{\"sets\":[" + String.join(",",
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1),
				cell("A", 3, "PREMIUM", "WALK_IN", 3500, 3, 1),
				cell("B", 1, "STANDARD", "ONLINE", 2000, 1, 2)) + "],\"expectedVersion\":0}";
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(layout))
				.andExpect(status().isNoContent());
		return venue;
	}

	private List<Long> setIds(long venueId) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY grid_y, grid_x")
				.param("v", venueId).query(Long.class).list();
	}

	@Test
	void repricesEverySetInTheRowAndReadReflectsIt() throws Exception {
		long venue = seedVenue("Reprice Club");

		// AC-1: reprice row A to €42.00 — one PUT, applied to every A set (both pools).
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200)))
				.andExpect(status().isNoContent());

		// AC-2/AC-8: the U1 read (tourist map source) shows all three A sets at 4200, WALK_IN preserved,
		// and row B untouched. Read is ordered (grid_y, grid_x): A1,A2,A3 then B1.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[0].rowLabel").value("A"))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(4200))
				.andExpect(jsonPath("$.sets[1].price.minorUnits").value(4200))
				.andExpect(jsonPath("$.sets[2].price.minorUnits").value(4200))
				.andExpect(jsonPath("$.sets[2].pool").value("WALK_IN"))
				.andExpect(jsonPath("$.sets[3].rowLabel").value("B"))
				.andExpect(jsonPath("$.sets[3].price.minorUnits").value(2000));
	}

	@Test
	void repricingASetWithAnAvailabilityHoldSucceedsAndLeavesTheHold() throws Exception {
		// The decisive contrast with the O3 layout replace: re-pricing is non-destructive, so it is
		// allowed on a claimed set and never touches the availability hold or the set id (invariant #2
		// is not engaged).
		long venue = seedVenue("Held Reprice Club");
		long a1 = setIds(venue).getFirst();
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, DATE '2035-07-01', 'STAFF_MARKED')
				""").param("s", a1).update();

		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(5000)))
				.andExpect(status().isNoContent());

		// The hold survives, the set id is unchanged, and the price was updated.
		Long holds = jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", a1).query(Long.class).single();
		assertEquals(1L, holds);
		Long price = jdbc.sql("SELECT price_minor FROM set_position WHERE id = :s")
				.param("s", a1).query(Long.class).single();
		assertEquals(5000L, price);
	}

	@Test
	void unknownRowIsNotFound() throws Exception {
		long venue = seedVenue("Unknown Row Club");
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "Z").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200)))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_ROW"));
	}

	@Test
	void unknownVenueIsNotFound() throws Exception {
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", 999_999L, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_VENUE"));
	}

	@Test
	void rejectsNegativePrice() throws Exception {
		long venue = seedVenue("Negative Club");
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(-1)))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		// Nothing changed — the original price stands.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(3500));
	}

	@Test
	void rejectsNonNumericPrice() throws Exception {
		// A non-numeric minorUnits never reaches the command — Jackson rejects the body first.
		long venue = seedVenue("Non Numeric Club");
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"price\":{\"minorUnits\":\"abc\",\"currency\":\"EUR\"}}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rejectsNonIsoCurrency() throws Exception {
		long venue = seedVenue("Bad Currency Club");
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"price\":{\"minorUnits\":4200,\"currency\":\"ABC\"}}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value(Matchers.not(Matchers.containsString("ABC"))));
	}
}
