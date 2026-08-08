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
 * Verifies the per-row reprice ({@code PUT /api/venues/{id}/rows/{rowLabel}/price}) end
 * to end against Testcontainers Postgres, through the real {@code JdbcVenues} adapter. Pins:
 * <ul>
 *   <li><strong>AC-1/AC-2/AC-8</strong>: a row edit fans out to <em>every</em> set in the row (both
 *       pools) and the new price round-trips through the U1 read API (so the tourist map + booking
 *       dialog reflect it); other rows are untouched.</li>
 *   <li><strong>Availability-untouched</strong> (the decisive contrast with the layout replace):
 *       repricing a row whose set has a {@code set_availability} hold <em>succeeds</em> and leaves the
 *       hold and the set id intact — invariant #2 is never engaged (no delete, no cascade, no lock).</li>
 *   <li><strong>AC-5</strong>: an unknown row / venue is {@code 404}.</li>
 *   <li><strong>AC-4</strong>: a negative or non-numeric price is {@code 400 INVALID_REQUEST} (§6b).</li>
 *   <li><strong>Optimistic locking</strong>: the reprice is optimistic-locked on the venue's {@code set_version} — every
 *       body carries the required {@code expectedVersion} the tab loaded, and a stale token is 409
 *       {@code STALE_WRITE} without clobbering the current prices ({@link #staleRepriceIs409StaleWrite}).</li>
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

	/** The reprice body: the price plus the required optimistic-concurrency token. */
	private static String priceBody(long minor, long expectedVersion) {
		return "{\"price\":{\"minorUnits\":%d,\"currency\":\"EUR\"},\"expectedVersion\":%d}"
				.formatted(minor, expectedVersion);
	}

	/** The venue's current layout token, read from the public map read (mirrors the FE load-then-save). */
	private long currentSetVersion(long venueId) throws Exception {
		MvcResult result = mvc.perform(get("/api/venues/{id}", venueId))
				.andExpect(status().isOk()).andReturn();
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.setVersion").toString());
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
		// The seed replace runs off the fresh venue's set_version (0) and bumps it to 1; reprice
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

		// AC-1: reprice row A to €42.00 — one PUT, applied to every A set (both pools). Loads the current
		// set_version (the seed replace bumped it to 1).
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200, currentSetVersion(venue))))
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
		// The decisive contrast with the layout replace: re-pricing is non-destructive, so it is
		// allowed on a claimed set and never touches the availability hold or the set id (invariant #2
		// is not engaged).
		long venue = seedVenue("Held Reprice Club");
		long a1 = setIds(venue).getFirst();
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, DATE '2035-07-01', 'STAFF_MARKED')
				""").param("s", a1).update();

		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(5000, currentSetVersion(venue))))
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
	void staleRepriceIs409StaleWrite() throws Exception {
		// AC-6: two tabs both loaded set_version V (post-seed); the first reprice bumps it to V+1,
		// then a second reprice still carrying the stale V is 409 STALE_WRITE (RFC-7807, code STALE_WRITE)
		// — the winner's prices survive, never clobbered by the stale tab.
		long venue = seedVenue("Stale Reprice Club");
		long stale = currentSetVersion(venue); // the loaded token (= 1 after the seed replace)

		// First reprice off the loaded token succeeds and bumps set_version.
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200, stale)))
				.andExpect(status().isNoContent());

		// A stale tab still at the old token tries to reprice to 9999 — rejected, prices unchanged.
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(9999, stale)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("STALE_WRITE"));

		// The winner's 4200 survives (row A, first rendered set) — the stale 9999 never landed.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(4200));
	}

	@Test
	void unknownRowIsNotFound() throws Exception {
		long venue = seedVenue("Unknown Row Club");
		// Token is current (loaded from the map) so the request passes the version gate and reaches the
		// NO_SUCH_ROW rule — proving the unknown-row path, not a stale-write.
		long tokenBefore = currentSetVersion(venue);
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "Z").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200, tokenBefore)))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_ROW"));

		// A NO_SUCH_ROW reject must NOT advance set_version (no spurious bump), so the
		// acting tab's next edit of a real row off the same loaded token still works.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.setVersion").value((int) tokenBefore));
	}

	@Test
	void unownedVenueIsForbidden() throws Exception {
		// Owns-all retired: ownership is asserted before existence (invariant #13), so repricing a
		// venue the operator does not own — even a non-existent one — is 403 before the bump, not a 404
		// existence leak (the token value is immaterial).
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", 999_999L, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(4200, 0)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void rejectsNegativePrice() throws Exception {
		long venue = seedVenue("Negative Club");
		// Token present (current) so the request reaches the price validation — proving the negative-price
		// rejection, not the missing-token 400.
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(priceBody(-1, currentSetVersion(venue))))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		// Nothing changed — the original price stands.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(3500));
	}

	@Test
	void rejectsNonNumericPrice() throws Exception {
		// A non-numeric minorUnits never reaches the command — Jackson rejects the body first (the
		// expectedVersion is irrelevant here: binding fails before any of our validation).
		long venue = seedVenue("Non Numeric Club");
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"price\":{\"minorUnits\":\"abc\",\"currency\":\"EUR\"},\"expectedVersion\":0}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rejectsNonIsoCurrency() throws Exception {
		long venue = seedVenue("Bad Currency Club");
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"price\":{\"minorUnits\":4200,\"currency\":\"ABC\"},\"expectedVersion\":0}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value(Matchers.not(Matchers.containsString("ABC"))));
	}
}
