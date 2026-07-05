package ai.riviera.platform.venue;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Verifies the U7 venue write API (issue #7) end to end against Testcontainers Postgres: a venue
 * is created and its beach map laid out via the operator endpoints, and the layout round-trips
 * unchanged through the U1 read API ({@code GET /api/venues/{id}}) — the core integration AC.
 * Also pins the operator auth gate (invariant: write requires an operator session cookie, read
 * stays public), the
 * editable pool split (invariant #3), integer-minor-unit money (invariant #5), and the
 * coordinate/position uniqueness rejections (invariant #12). The operator password is set per-test
 * so it never shadows the main {@code application.properties}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class VenueAdminControllerIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L; // seeded public venue (U1)

	@Autowired
	MockMvc mvc;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	private static String venueBody(String name, String mode, int commissionBps, String currency) {
		return """
				{"name":"%s","beach":"Ksamil","region":"Riviera","description":"on the shore",
				 "bookingMode":"%s","commissionBps":%d,"payoutCurrency":"%s","bookingCutoff":"18:00"}
				""".formatted(name, mode, commissionBps, currency);
	}

	private static String setBody(String rowLabel, int positionNo, String tier, String pool,
			long minor, String currency, int gridX, int gridY) {
		return """
				{"rowLabel":"%s","positionNo":%d,"tier":"%s","pool":"%s",
				 "price":{"minorUnits":%d,"currency":"%s"},"gridX":%d,"gridY":%d}
				""".formatted(rowLabel, positionNo, tier, pool, minor, currency, gridX, gridY);
	}

	/** Create a venue as the operator and return its id (parsed from the JSON body). */
	private long createVenue(String name) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(venueBody(name, "INSTANT", 1500, "EUR")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNumber())
				.andReturn();
		return idFrom(result);
	}

	private long addSet(long venueId, String body) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues/{v}/sets", venueId)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private static long idFrom(MvcResult result) throws Exception {
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}

	@Test
	void createsVenueThenReadable() throws Exception {
		long id = createVenue("Sunset Bar");

		// AC-1: the created venue is immediately readable via the U1 read API with no sets yet.
		mvc.perform(get("/api/venues/{id}", id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Sunset Bar"))
				.andExpect(jsonPath("$.bookingMode").value("INSTANT"))
				.andExpect(jsonPath("$.ratingTenths").value(0))
				.andExpect(jsonPath("$.reviewsCount").value(0))
				.andExpect(jsonPath("$.sets.length()").value(0));
	}

	@Test
	void addedSetsRoundTripThroughReadApi() throws Exception {
		long venue = createVenue("Round Trip Club");
		addSet(venue, setBody("Front row", 1, "PREMIUM", "ONLINE", 4500, "EUR", 1, 1));
		addSet(venue, setBody("Front row", 2, "STANDARD", "WALK_IN", 2500, "EUR", 2, 1));

		// AC-2: both sets appear in the read API with the exact field values entered, ordered for
		// rendering (grid_y, grid_x), and from-price is the cheapest.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets.length()").value(2))
				.andExpect(jsonPath("$.sets[0].rowLabel").value("Front row"))
				.andExpect(jsonPath("$.sets[0].tier").value("PREMIUM"))
				.andExpect(jsonPath("$.sets[0].pool").value("ONLINE"))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(4500))
				.andExpect(jsonPath("$.sets[1].pool").value("WALK_IN"))
				.andExpect(jsonPath("$.fromPrice.minorUnits").value(2500))
				.andExpect(jsonPath("$.fromPrice.currency").value("EUR"));
	}

	@Test
	void priceIsIntegerMinorUnits() throws Exception {
		long venue = createVenue("Money Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[?(@.id == %d)].price.minorUnits", setId).value(
						org.hamcrest.Matchers.contains(3000)))
				.andExpect(jsonPath("$.sets[?(@.id == %d)].price.currency", setId).value(
						org.hamcrest.Matchers.contains("EUR")));
	}

	@Test
	void poolSplitIsEditable() throws Exception {
		long venue = createVenue("Pool Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));

		// AC-3: move the set from the online to the walk-in pool; the read API reflects it.
		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "WALK_IN", 3000, "EUR", 1, 1)))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[?(@.id == %d)].pool", setId).value(
						org.hamcrest.Matchers.contains("WALK_IN")));
	}

	@Test
	void removeSetTakesItOffTheMap() throws Exception {
		long venue = createVenue("Remove Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));

		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(0));
	}

	@Test
	void rejectsUnknownPool() throws Exception {
		long venue = createVenue("Bad Pool Club");
		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "GOLD", 3000, "EUR", 1, 1)))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rejectsNonIsoCurrency() throws Exception {
		long venue = createVenue("Bad Currency Club");
		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "ABC", 1, 1)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rejectsNonPositiveCoordinate() throws Exception {
		long venue = createVenue("Bad Coord Club");
		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 0, 1)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void rejectsDuplicateGridCell() throws Exception {
		long venue = createVenue("Grid Club");
		addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 2, 1));

		// AC-5: a second set at the same (grid_x, grid_y) is 409 CELL_TAKEN. Different position_no/
		// row_label so only the grid-cell rule can trip.
		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row B", 9, "STANDARD", "ONLINE", 3000, "EUR", 2, 1)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("CELL_TAKEN"));
	}

	@Test
	void rejectsDuplicatePosition() throws Exception {
		long venue = createVenue("Position Club");
		addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));

		// Same (row_label, position_no), different cell → 409 DUPLICATE_POSITION.
		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 5, 5)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("DUPLICATE_POSITION"));
	}

	@Test
	void addSetToUnknownVenueIs404() throws Exception {
		mvc.perform(post("/api/venues/{v}/sets", 999_999L).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1)))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_VENUE"));
	}

	@Test
	void editUnknownSetIs404() throws Exception {
		long venue = createVenue("Edit 404 Club");
		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, 999_999L).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1)))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	@Test
	void writeRequiresOperatorAuth() throws Exception {
		// AC-6: no credentials → 401, and nothing is written. A valid CSRF token is supplied so the
		// rejection pins the auth gate (401 from the entry point), not the CsrfFilter's 403.
		mvc.perform(post("/api/venues").with(csrf()).contentType(MediaType.APPLICATION_JSON)
						.content(venueBody("No Auth Club", "INSTANT", 1500, "EUR")))
				.andExpect(status().isUnauthorized());

		// Wrong password → the session login itself is rejected with 401, so no cookie is ever issued.
		mvc.perform(post("/api/auth/operator/login").with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username": "%s", "password": "wrong"}""".formatted(OPERATOR)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void readStaysPublic() throws Exception {
		// AC-6: the U1 read endpoint is unaffected by the new auth — still public.
		mvc.perform(get("/api/venues/{id}", MIRAMAR)).andExpect(status().isOk());
	}

	@Test
	void profileEditRoundTripsThroughReadApi() throws Exception {
		// T7 (#140), AC-5: PATCH the venue profile, then the U1 read API reflects it. Amenities are
		// sent OUT of catalogue order (WIFI, BEACH_BAR) and come back catalogue-ordered; a second
		// edit REPLACES the set and clears the distance (proves replace + nullable-distance).
		long venue = createVenue("Amenities Club");

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"amenities\":[\"WIFI\",\"BEACH_BAR\"],\"distanceToWaterM\":20}"))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.distanceToWaterM").value(20))
				.andExpect(jsonPath("$.amenities").value(
						org.hamcrest.Matchers.contains("BEACH_BAR", "WIFI")));

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"amenities\":[\"SHOWERS\"],\"distanceToWaterM\":null}"))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.amenities").value(Matchers.contains("SHOWERS")))
				.andExpect(jsonPath("$.distanceToWaterM").value(Matchers.nullValue()));
	}

	@Test
	void unknownAmenityCodeIs400() throws Exception {
		// T7 (#140), AC-6: an off-catalogue code is rejected at the DTO edge → 400 (error contract §6b).
		long venue = createVenue("Bad Amenity Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"amenities\":[\"PING_PONG\"],\"distanceToWaterM\":null}"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void nonPositiveDistanceIs400() throws Exception {
		// T7 (#140), AC-6: distance must be a positive integer when present.
		long venue = createVenue("Bad Distance Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"amenities\":[],\"distanceToWaterM\":0}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void profileEditUnknownVenueIs404() throws Exception {
		mvc.perform(patch("/api/venues/{v}", 999_999L).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"amenities\":[],\"distanceToWaterM\":null}"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_VENUE"));
	}
}
