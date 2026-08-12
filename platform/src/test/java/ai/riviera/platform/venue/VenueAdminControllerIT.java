package ai.riviera.platform.venue;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import java.time.LocalDate;
import java.time.ZoneId;

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

import static org.junit.jupiter.api.Assertions.assertEquals;
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

	/**
	 * The one {@code SET_IN_USE} detail, asserted wherever this class provokes it — the remove
	 * guard's hold and terminal-booking arms, and the edit guard's live hold. Why the wording names
	 * no arm, and why it must stay true of a set held only by a long-cancelled booking:
	 * {@code riviera-java-conventions} {@code references/error-contract.md}.
	 */
	private static final String SET_IN_USE_DETAIL = "This set has a booking or a current hold.";

	/**
	 * The profile {@code STALE_WRITE} detail. Its token is {@code venue.version} (V22), kept
	 * distinct from the set-writes' {@code set_version} (V23) on purpose, so this wording may name
	 * the profile where {@code VenueRepriceIT}/{@code BeachMapReplaceIT}'s shared one may not.
	 */
	private static final String STALE_PROFILE_DETAIL =
			"The venue profile has changed since the version this request carries.";

	@Autowired
	MockMvc mvc;

	@Autowired
	org.springframework.jdbc.core.simple.JdbcClient jdbc;

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

	/**
	 * A full widened venue-profile PATCH body: the editable core is fixed
	 * and the amenity array + distance vary per test. The write REPLACES the whole profile, so every
	 * field is required (except description/distance) — a partial body no longer suffices — and it
	 * carries the required optimistic-concurrency {@code expectedVersion} the tab loaded.
	 */
	private static String profileBody(String name, String mode, String cutoff, String amenitiesJson,
			String distanceJson, long expectedVersion) {
		return """
				{"name":"%s","beach":"Ksamil","region":"Riviera","description":"edited",
				 "bookingMode":"%s","bookingCutoff":"%s","amenities":%s,"distanceToWaterM":%s,
				 "expectedVersion":%d}
				""".formatted(name, mode, cutoff, amenitiesJson, distanceJson, expectedVersion);
	}

	/** The venue's current optimistic-concurrency token, read from the owner profile endpoint. */
	private long currentVersion(long venueId) throws Exception {
		MvcResult result = mvc.perform(get("/api/venues/{v}/profile", venueId).cookie(operatorSession))
				.andExpect(status().isOk())
				.andReturn();
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.version").toString());
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
	void dailyAvailabilityReturnsPerSetStatesForTheOwner() throws Exception {
		// AC-2/AC-4: the state-aware read splits hold vs walk-in; the free third set is absent.
		long venue = createVenue("States Club");
		long onlineHeld = addSet(venue, setBody("A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));
		long staffMarked = addSet(venue, setBody("A", 2, "STANDARD", "ONLINE", 3000, "EUR", 2, 1));
		addSet(venue, setBody("A", 3, "STANDARD", "WALK_IN", 2500, "EUR", 3, 1));
		String date = "2026-09-14";
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:id, :date::date, 'BOOKED_ONLINE')")
				.param("id", onlineHeld).param("date", date).update();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:id, :date::date, 'STAFF_MARKED')")
				.param("id", staffMarked).param("date", date).update();

		mvc.perform(get("/api/venues/{v}/availability", venue).cookie(operatorSession)
						.param("date", date))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].setId").value(onlineHeld))
				.andExpect(jsonPath("$[0].state").value("BOOKED_ONLINE"))
				.andExpect(jsonPath("$[1].setId").value(staffMarked))
				.andExpect(jsonPath("$[1].state").value("STAFF_MARKED"));

		// Another day is untouched — an all-free day is an empty list, not a 404.
		mvc.perform(get("/api/venues/{v}/availability", venue).cookie(operatorSession)
						.param("date", "2026-09-15"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void dailyAvailabilityRequiresOperator() throws Exception {
		// AC-4: gated OPERATOR ahead of the public venue GET — the hold split never serves publicly.
		mvc.perform(get("/api/venues/{v}/availability", MIRAMAR).param("date", "2026-09-14"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void dailyAvailabilityRejectsAMissingOrMalformedDate() throws Exception {
		long venue = createVenue("Dateless Club");
		mvc.perform(get("/api/venues/{v}/availability", venue).cookie(operatorSession))
				.andExpect(status().isBadRequest());
		mvc.perform(get("/api/venues/{v}/availability", venue).cookie(operatorSession)
						.param("date", "not-a-date"))
				.andExpect(status().isBadRequest());
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

	/**
	 * The hold is dated tomorrow rather than today because this test reads its own clock while the
	 * guard reads the application's: a midnight rollover between the two would turn a today-dated
	 * hold into history and flip the expected 409 to a 204. The inclusive today edge is pinned
	 * where the clock is controlled — {@code AvailabilityLookupIT} on the SQL predicate,
	 * {@code VenueAdminServiceTest} on the date the guard passes.
	 */
	@Test
	void removeSetKeepsAStaffHoldAndAnswers409() throws Exception {
		long venue = createVenue("Held Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "WALK_IN", 3000, "EUR", 1, 1));
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :day, 'STAFF_MARKED')")
				.param("set", setId)
				.param("day", LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(1))
				.update();

		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("SET_IN_USE"))
				.andExpect(jsonPath("$.detail").value(SET_IN_USE_DETAIL));

		assertEquals(1, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set")
						.param("set", setId).query(Integer.class).single(),
				"the walk-in hold must survive the refused delete (invariant #2)");
	}

	@Test
	void removeSetDropsAPastStaffHoldWithTheSet() throws Exception {
		long venue = createVenue("Last Season Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "WALK_IN", 3000, "EUR", 1, 1));
		// Inserted directly: the staff-mark endpoint refuses a past date, which is how history accrues.
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :day, 'STAFF_MARKED')")
				.param("set", setId)
				.param("day", LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(400))
				.update();

		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());

		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set")
						.param("set", setId).query(Integer.class).single(),
				"a hold describing a day that is gone goes with the set (CASCADE)");
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(0));
	}

	@Test
	void removeSetOnABookedSetAnswers409NotAServerError() throws Exception {
		long venue = createVenue("Booked Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('booked-club@example.com', 'Guest', '+355600') RETURNING id")
				.query(Long.class).single();
		// CANCELLED: long-terminal, yet the RESTRICT FK still pins the set — the 500 the guard pre-empts.
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES ('BOOKCLB1', :venue, :set, :cust, DATE '2027-07-01', 3000, 'EUR', 'CANCELLED')
				""")
				.param("venue", venue).param("set", setId).param("cust", customer).update();

		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SET_IN_USE"))
				.andExpect(jsonPath("$.detail").value(SET_IN_USE_DETAIL));
	}

	@Test
	void editSetKeepsAClaimedSetInItsPoolButStillTakesAPriceChange() throws Exception {
		long venue = createVenue("Repool Club");
		long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1));
		// Relative to today: the edit guard only counts holds from today onwards.
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :day, 'BOOKED_ONLINE')")
				.param("set", setId)
				.param("day", LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(30))
				.update();

		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "WALK_IN", 3000, "EUR", 1, 1)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SET_IN_USE"))
				.andExpect(jsonPath("$.detail").value(SET_IN_USE_DETAIL));

		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "PREMIUM", "ONLINE", 4200, "EUR", 1, 1)))
				.andExpect(status().isNoContent());

		assertEquals("ONLINE", jdbc.sql("SELECT pool FROM set_position WHERE id = :set")
				.param("set", setId).query(String.class).single());
		assertEquals(4200L, jdbc.sql("SELECT price_minor FROM set_position WHERE id = :set")
				.param("set", setId).query(Long.class).single());
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
	void addSetToUnownedVenueIs403() throws Exception {
		// Owns-all retired: a venue-scoped edit asserts ownership FIRST (invariant #13), so a
		// venue the operator does not own — including one that doesn't exist — is 403 before any
		// existence check, never a 404 that would leak whether the venue exists to a non-owner.
		mvc.perform(post("/api/venues/{v}/sets", 999_999L).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 1, "STANDARD", "ONLINE", 3000, "EUR", 1, 1)))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
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
		// AC-6: PATCH the venue profile, then the U1 read API reflects it. Amenities are
		// sent OUT of catalogue order (WIFI, BEACH_BAR) and come back catalogue-ordered; a second
		// edit REPLACES the set and clears the distance (proves replace + nullable-distance).
		long venue = createVenue("Amenities Club");

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Amenities Club", "INSTANT", "18:00",
								"[\"WIFI\",\"BEACH_BAR\"]", "20", 0)))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.distanceToWaterM").value(20))
				.andExpect(jsonPath("$.amenities").value(
						org.hamcrest.Matchers.contains("BEACH_BAR", "WIFI")));

		// The first PATCH bumped the version, so the second edit must load it afresh (mirrors the
		// FE load-then-save) — re-using the stale 0 would now be rejected as a stale write.
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Amenities Club", "INSTANT", "18:00", "[\"SHOWERS\"]", "null",
								currentVersion(venue))))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.amenities").value(Matchers.contains("SHOWERS")))
				.andExpect(jsonPath("$.distanceToWaterM").value(Matchers.nullValue()));
	}

	@Test
	void widenedProfileEditPersistsCoreFieldsAndReadsBack() throws Exception {
		// AC-1/AC-2/AC-6: the widened write persists name/beach/region/description/mode/cutoff.
		// The tourist read reflects the new name + mode; the owner profile read reflects the cutoff too.
		long venue = createVenue("Before Name");

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("After Name", "REQUEST", "12:30", "[\"WIFI\"]", "35", 0)))
				.andExpect(status().isNoContent());

		// Tourist surface re-renders the edited name + mode (live read).
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.name").value("After Name"))
				.andExpect(jsonPath("$.bookingMode").value("REQUEST"));

		// Owner profile read carries the full edited profile, cutoff as "HH:mm".
		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("After Name"))
				.andExpect(jsonPath("$.beach").value("Ksamil"))
				.andExpect(jsonPath("$.region").value("Riviera"))
				.andExpect(jsonPath("$.description").value("edited"))
				.andExpect(jsonPath("$.bookingMode").value("REQUEST"))
				.andExpect(jsonPath("$.bookingCutoff").value("12:30"))
				.andExpect(jsonPath("$.distanceToWaterM").value(35))
				.andExpect(jsonPath("$.amenities").value(Matchers.contains("WIFI")));
	}

	@Test
	void getProfileReturnsCommissionAndPayoutCurrency() throws Exception {
		// AC-2: the owner profile read exposes the read-only display fields the form shows —
		// commission (bps) + payout currency — which the PUBLIC tourist read must NOT carry (AC-3).
		long venue = createVenue("Commission Club"); // created with 1500 bps / EUR

		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.commissionBps").value(1500))
				.andExpect(jsonPath("$.payoutCurrency").value("EUR"));

		// The public tourist read must not leak commission / payout currency.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.commissionBps").doesNotExist())
				.andExpect(jsonPath("$.payoutCurrency").doesNotExist());
	}

	@Test
	void profileReadCarriesVersion() throws Exception {
		// AC-3: the owner profile read carries the row's optimistic-concurrency token. A fresh
		// venue starts at version 0 (the V22 column DEFAULT); the FE echoes it back on the next PATCH.
		long venue = createVenue("Versioned Club");

		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void profileWriteWithCurrentVersionSucceedsAndBumps() throws Exception {
		// AC-4: a PATCH echoing the loaded version applies (204) and bumps the row's version, so a
		// subsequent read shows version = V+1 with the edited values.
		long venue = createVenue("Bump Club");

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Bump Club", "REQUEST", "17:00", "[\"WIFI\"]", "12", 0)))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.version").value(1))
				.andExpect(jsonPath("$.bookingMode").value("REQUEST"))
				.andExpect(jsonPath("$.bookingCutoff").value("17:00"));
	}

	@Test
	void staleVersionPatchIs409() throws Exception {
		// AC-5: the venue moved to V+1 (a first PATCH), then a second PATCH still carrying the
		// stale V=0 is 409 STALE_WRITE — and booking_mode/booking_cutoff are left at the winner's values,
		// never clobbered back (the exact auto-charge-reversal scenario).
		long venue = createVenue("Stale Club");

		// The venue is switched to REQUEST at version 0 → now at version 1.
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Stale Club", "REQUEST", "18:00", "[]", "null", 0)))
				.andExpect(status().isNoContent());

		// A stale tab (still at version 0) tries to save back INSTANT → rejected, not applied.
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Stale Club", "INSTANT", "18:00", "[]", "null", 0)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_PROFILE_DETAIL));

		// The safety fields survive at the winner's values — the stale INSTANT never landed.
		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(jsonPath("$.bookingMode").value("REQUEST"))
				.andExpect(jsonPath("$.version").value(1));
	}

	@Test
	void patchMissingExpectedVersionIs400() throws Exception {
		// AC-6: a body without expectedVersion is 400 INVALID_REQUEST — it is never treated as 0
		// (which would match a fresh venue and re-open the last-write-wins hole).
		long venue = createVenue("No Version Club");

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"No Version Club","beach":"Ksamil","region":"Riviera","description":"x",
								 "bookingMode":"INSTANT","bookingCutoff":"18:00","amenities":[],
								 "distanceToWaterM":null}
								"""))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void replaceWithoutVersionIs400() throws Exception {
		// AC-5: a beach-map replace body without expectedVersion is 400 INVALID_REQUEST — never
		// treated as 0 (which would match a fresh venue and re-open the last-write-wins hole), mirroring
		// the profile PATCH. ExpectedVersion.require throws before the write.
		long venue = createVenue("No Layout Version Club");

		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"sets":[{"rowLabel":"A","positionNo":1,"tier":"PREMIUM","pool":"ONLINE",
								 "price":{"minorUnits":3500,"currency":"EUR"},"gridX":1,"gridY":1}]}
								"""))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void repriceWithoutVersionIs400() throws Exception {
		// AC-5: a per-row reprice body without expectedVersion is 400 INVALID_REQUEST — never a
		// silent 0. ExpectedVersion.require throws before venue/row existence or the price command.
		long venue = createVenue("No Reprice Version Club");

		mvc.perform(put("/api/venues/{v}/rows/{r}/price", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"price\":{\"minorUnits\":4200,\"currency\":\"EUR\"}}"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void profileWriteLeavesSetVersion() throws Exception {
		// AC-4 (token independence): a profile PATCH bumps the profile version but leaves set_version
		// untouched — a profile/amenity edit must NOT falsely stale an open layout or pricing tab.
		long venue = createVenue("Independent Profile Club");
		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(jsonPath("$.version").value(0));
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.setVersion").value(0));

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Independent Profile Club", "INSTANT", "18:00", "[\"WIFI\"]", "15", 0)))
				.andExpect(status().isNoContent());

		// Profile version bumped to 1; set_version still 0.
		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(jsonPath("$.version").value(1));
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.setVersion").value(0));
	}

	@Test
	void setWriteLeavesProfileVersion() throws Exception {
		// AC-4 (token independence): a beach-map replace bumps set_version but leaves the profile
		// version untouched — the two optimistic locks are independent counters.
		long venue = createVenue("Independent Layout Club");
		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(jsonPath("$.version").value(0));

		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"sets":[{"rowLabel":"A","positionNo":1,"tier":"PREMIUM","pool":"ONLINE",
								 "price":{"minorUnits":3500,"currency":"EUR"},"gridX":1,"gridY":1}],
								 "expectedVersion":0}
								"""))
				.andExpect(status().isNoContent());

		// set_version bumped to 1; the profile version is untouched (still 0).
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.setVersion").value(1));
		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void getProfileRequiresOperatorAuth() throws Exception {
		// AC-3: the profile read is gated to role OPERATOR (above the public GET), so an
		// unauthenticated caller is 401 — commission never leaks to an anonymous request.
		long venue = createVenue("Auth Profile Club");
		mvc.perform(get("/api/venues/{v}/profile", venue))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void patchIgnoresReadOnlyCommissionAndCurrency() throws Exception {
		// AC-5: commission + payout currency are read-only. Even if a crafted body carries
		// them, the write cannot touch them (the DTO/command has no such field, so they are ignored).
		long venue = createVenue("Read Only Club"); // 1500 bps / EUR

		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"Still Mine","beach":"Ksamil","region":"Riviera","description":"x",
								 "bookingMode":"INSTANT","bookingCutoff":"18:00","amenities":[],
								 "distanceToWaterM":null,"commissionBps":9999,"payoutCurrency":"USD",
								 "expectedVersion":0}
								"""))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(jsonPath("$.commissionBps").value(1500))   // unchanged
				.andExpect(jsonPath("$.payoutCurrency").value("EUR")) // unchanged
				.andExpect(jsonPath("$.name").value("Still Mine"));   // editable field did change
	}

	@Test
	void unknownAmenityCodeIs400() throws Exception {
		// AC-7: an off-catalogue code is rejected at the DTO edge → 400 (error contract §6b).
		long venue = createVenue("Bad Amenity Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Bad Amenity Club", "INSTANT", "18:00", "[\"PING_PONG\"]", "null", 0)))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void nonPositiveDistanceIs400() throws Exception {
		// AC-7: distance must be a positive integer when present.
		long venue = createVenue("Bad Distance Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Bad Distance Club", "INSTANT", "18:00", "[]", "0", 0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void blankNameIs400() throws Exception {
		// The widened write requires a non-blank name — a blank one is 400 (error contract §6b).
		long venue = createVenue("Blank Name Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("   ", "INSTANT", "18:00", "[]", "null", 0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void malformedBookingModeIs400() throws Exception {
		// An unknown booking mode is rejected at the command edge → 400.
		long venue = createVenue("Bad Mode Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Bad Mode Club", "MAYBE", "18:00", "[]", "null", 0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void malformedCutoffIs400() throws Exception {
		// A non-time cutoff is rejected at the DTO edge → 400.
		long venue = createVenue("Bad Cutoff Club");
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Bad Cutoff Club", "INSTANT", "not-a-time", "[]", "null", 0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void profileEditUnownedVenueIs403() throws Exception {
		// Owns-all retired: ownership is asserted before existence (invariant #13), so editing a
		// venue the operator does not own — even a non-existent one — is 403, not a 404 existence leak.
		mvc.perform(patch("/api/venues/{v}", 999_999L).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(profileBody("Ghost", "INSTANT", "18:00", "[]", "null", 0)))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}
}
