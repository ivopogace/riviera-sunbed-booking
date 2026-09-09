package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the bulk beach-map save ({@code PUT /api/venues/{id}/beach-map}) end to end against
 * Testcontainers Postgres, through the real {@code JdbcVenues}, {@code JdbcBookingPresence} and
 * {@code JdbcSetAvailabilityLookup} adapters. The save is a diff keyed by grid cell: a kept cell is
 * updated in place under its own id, a new cell inserted, an absent cell's set retired (with booking
 * history) or deleted (without). Pins: the whole grid round-trips through the U1 read with row A
 * priced front-row premium and the {@code WALK_IN} pool preserved; a regenerate keeps the ids of the
 * cells it keeps; adding a row, and repainting, renaming and repricing a booked set, all save on a
 * trading venue; and — the highest-stakes case — a save that would remove a set with a live booking
 * or a hold dated today or later is refused {@code 409 SETS_IN_USE} naming those sets, leaving the
 * layout <em>and</em> the hold untouched (invariant #2: the {@code set_availability} CASCADE must
 * never silently fire). A hold whose day has gone does not freeze its set — it goes with it.
 *
 * <p>The save is optimistic-locked on the venue's {@code set_version}: every body carries the
 * required {@code expectedVersion} the tab loaded from the map read, and a stale token is rejected
 * 409 {@code STALE_WRITE} without clobbering the current layout ({@link #staleReplaceIs409StaleWrite}).
 * The version is read under the venue row lock before the invariant-#2 set locks and bumped only on
 * the success path, so a refused save leaves the token untouched. The races live in
 * {@link BeachMapDiffConcurrencyIT}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class BeachMapReplaceIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane"); // the zone the guard's cutoff reads

	/**
	 * The row reprice shares this {@code STALE_WRITE} detail, because every token-guarded set-write turns on the
	 * single {@code venue.set_version} token (V23) — either can lose to the other, so the wording
	 * may attribute the change to neither. Production owns one constant
	 * ({@code VenueAdminController.STALE_SETS_DETAIL}); this literal and VenueRepriceIT's are two views of
	 * it, so a change that updates only one of them fails here rather than drifting silently.
	 */
	private static final String STALE_SETS_DETAIL =
			"This venue's sets have changed since the version this request carries.";

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

	/**
	 * The versioned replace body: the sets array plus the required optimistic-concurrency token
	 * ({@code expectedVersion} = the {@code setVersion} the tab loaded from the map read).
	 */
	private static String layout(long expectedVersion, String... cells) {
		return "{\"sets\":[" + String.join(",", cells) + "],\"expectedVersion\":" + expectedVersion + "}";
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
				 "bookingMode":"INSTANT","payoutCurrency":"EUR","bookingCutoff":"18:00"}
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

	/** The active sets' ids in read order — a retired set is absent. */
	private List<Long> setIds(long venueId) {
		return jdbc.sql("SELECT id FROM active_set_position WHERE venue_id = :v ORDER BY grid_y, grid_x")
				.param("v", venueId).query(Long.class).list();
	}

	private boolean retired(long setId) {
		return jdbc.sql("SELECT retired_at IS NOT NULL FROM set_position WHERE id = :s")
				.param("s", setId).query(Boolean.class).single();
	}

	private long holdsOn(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", setId).query(Long.class).single();
	}

	private void seedHold(long setId, LocalDate day, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, :state)")
				.param("s", setId).param("d", day).param("state", state).update();
	}

	@Test
	void replaceThenTouristMapReflectsGrid() throws Exception {
		long venue = createVenue("Generate Club");

		// A 2x3 grid: row A (sea-facing) priced front-row premium, row B standard. One PUT off the fresh
		// venue's set_version (0).
		putLayout(venue, layout(0,
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
	void descriptiveRowLabelRoundTrips() throws Exception {
		// #723 AC-2: a row name at the 40-character bound round-trips to the tourist map read.
		long venue = createVenue("Named Rows Club");
		String atBound = "Under the pines · far from the beach bar";

		putLayout(venue, layout(0, cell(atBound, 1, "STANDARD", "ONLINE", 3000, 1, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[0].rowLabel").value(atBound));
	}

	@Test
	void overlongRowLabelIs400() throws Exception {
		// #723 AC-1: a 41-character row name is refused at the command edge (§6b), before the V43 CHECK.
		long venue = createVenue("Overlong Row Club");

		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(0, cell("x".repeat(41), 1, "STANDARD", "ONLINE", 3000, 1, 1))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void regenerateReplacesThePreviousLayout() throws Exception {
		long venue = createVenue("Regenerate Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1)), 204);

		long a1 = setIds(venue).getFirst();

		// Regenerate to a smaller grid: the cell that stays keeps its id, the cell that goes is deleted.
		// The first save bumped set_version to 1, so this one must load it afresh (a stale 0 would be 409).
		putLayout(venue, layout(currentSetVersion(venue), cell("A", 1, "PREMIUM", "ONLINE", 4000, 1, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(1))
				.andExpect(jsonPath("$.sets[0].id").value(a1))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(4000));
	}

	@Test
	void staleReplaceIs409StaleWrite() throws Exception {
		// AC-6: two tabs both loaded set_version 0; the first replace bumps it to 1, then a second
		// replace still carrying the stale 0 is 409 STALE_WRITE (RFC-7807, code STALE_WRITE) — the winner's
		// layout survives, never clobbered by the stale tab.
		long venue = createVenue("Stale Layout Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1)), 204); // set_version 0 -> 1

		// A stale tab (still at 0) tries to overwrite with a different, smaller layout — rejected.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(0, cell("A", 1, "PREMIUM", "ONLINE", 9999, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_SETS_DETAIL));

		// The winner's two-set layout survives untouched — the stale single-cell replace never landed, and
		// the token is unchanged (a rejected stale write does not bump).
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(2))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(3500))
				.andExpect(jsonPath("$.setVersion").value(1));
	}

	@Test
	void poolFlagPersistsAndReadsBack() throws Exception {
		long venue = createVenue("Pool Club");

		// AC-4: an ONLINE and a WALK_IN set in one layout — both pools round-trip distinctly.
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "WALK_IN", 2000, 2, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[0].pool").value("ONLINE"))
				.andExpect(jsonPath("$.sets[1].pool").value("WALK_IN"));
	}

	@Test
	void addsARowOnAVenueWithALiveBooking() throws Exception {
		long venue = createVenue("Trading Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		List<Long> rowA = setIds(venue);
		seedBooking(venue, rowA.getFirst());

		// Row A stays at its cells, row B is new: the booked set is never disturbed, so nothing refuses.
		long tokenBefore = currentSetVersion(venue);
		putLayout(venue, layout(tokenBefore,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1),
				cell("B", 1, "STANDARD", "ONLINE", 1500, 1, 2),
				cell("B", 2, "STANDARD", "ONLINE", 1500, 2, 2)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(4))
				.andExpect(jsonPath("$.sets[0].id").value(rowA.get(0)))
				.andExpect(jsonPath("$.sets[1].id").value(rowA.get(1)))
				.andExpect(jsonPath("$.sets[2].rowLabel").value("B"))
				.andExpect(jsonPath("$.setVersion").value((int) tokenBefore + 1));
	}

	@Test
	void repaintsRenamesAndRepricesABookedSetInPlace() throws Exception {
		long venue = createVenue("Repaint Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1)), 204);
		long a1 = setIds(venue).getFirst();
		seedBooking(venue, a1);
		seedHold(a1, LocalDate.of(2035, 7, 1), "BOOKED_ONLINE"); // the booked date's own availability row

		// Price, tier, pool and row label are always editable — on a booked set too (RESPONSIBILITIES.md §venue).
		putLayout(venue, layout(currentSetVersion(venue),
				cell("Front", 1, "STANDARD", "WALK_IN", 1500, 1, 1),
				cell("Front", 2, "PREMIUM", "ONLINE", 3500, 2, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets[0].id").value(a1))
				.andExpect(jsonPath("$.sets[0].rowLabel").value("Front"))
				.andExpect(jsonPath("$.sets[0].tier").value("STANDARD"))
				.andExpect(jsonPath("$.sets[0].pool").value("WALK_IN"))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").value(1500));
		assertEquals(1L, holdsOn(a1), "an in-place update keeps the booked date claimed (invariant #2)");
	}

	@Test
	void refusesRemovingBookedOrHeldSetsNamingThem() throws Exception {
		long venue = createVenue("Refused Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1),
				cell("A", 3, "STANDARD", "ONLINE", 2000, 3, 1)), 204);
		List<Long> rowA = setIds(venue);
		seedBooking(venue, rowA.get(0));
		LocalDate heldOn = LocalDate.now(TIRANE).plusDays(30);
		seedHold(rowA.get(2), heldOn, "STAFF_MARKED"); // deliberately the LAST set: the probe must cover every removal

		// A layout that drops all of row A: the two claimed sets refuse the whole save, nothing is written.
		long tokenBefore = currentSetVersion(venue);
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(tokenBefore, cell("B", 1, "STANDARD", "ONLINE", 2000, 1, 2))))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("SETS_IN_USE"))
				.andExpect(jsonPath("$.detail").value("Sets this save would remove are booked or held."))
				.andExpect(jsonPath("$.sets.length()").value(2))
				.andExpect(jsonPath("$.sets[0].setId").value(rowA.get(0)))
				.andExpect(jsonPath("$.sets[0].rowLabel").value("A"))
				.andExpect(jsonPath("$.sets[0].positionNo").value(1))
				.andExpect(jsonPath("$.sets[0].bookedOn").value("2035-07-01"))
				.andExpect(jsonPath("$.sets[0].heldOn").doesNotExist())
				.andExpect(jsonPath("$.sets[1].setId").value(rowA.get(2)))
				.andExpect(jsonPath("$.sets[1].positionNo").value(3))
				.andExpect(jsonPath("$.sets[1].bookedOn").doesNotExist())
				.andExpect(jsonPath("$.sets[1].heldOn").value(heldOn.toString()));

		// The three sets are untouched, the hold survives (the CASCADE never fired), and the refusal
		// did not advance set_version, so the acting tab's retry off the same token still works.
		assertEquals(rowA, setIds(venue));
		assertEquals(1L, holdsOn(rowA.get(2)));
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.setVersion").value((int) tokenBefore));
	}

	@Test
	void retiresARemovedSetWithHistoryAndDeletesOneWithout() throws Exception {
		long venue = createVenue("History Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		List<Long> rowA = setIds(venue);
		seedBooking(venue, rowA.get(0), "CANCELLED"); // finished history: the FK pins the row, nobody is still coming

		putLayout(venue, layout(currentSetVersion(venue), cell("B", 1, "STANDARD", "ONLINE", 2000, 1, 2)), 204);

		assertTrue(retired(rowA.get(0)), "a set with booking history is retired, never deleted (ADR-0019)");
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM set_position WHERE id = :s").param("s", rowA.get(1))
				.query(Long.class).single(), "a set with no booking is deleted");
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(1))
				.andExpect(jsonPath("$.sets[0].rowLabel").value("B"));

		// The retired set's cell and row/position are free for a new set (the V50 partial indexes).
		putLayout(venue, layout(currentSetVersion(venue),
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("B", 1, "STANDARD", "ONLINE", 2000, 1, 2)), 204);
		assertEquals(2, setIds(venue).size());
		assertFalse(retired(setIds(venue).getFirst()), "the new A1 is a fresh active row");
	}

	@Test
	void replacesTheLayoutOfAWalkInOnlyVenueWhoseHoldsAreAllPast() throws Exception {
		long venue = createVenue("Last Season Club");
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "WALK_IN", 2000, 1, 1),
				cell("A", 2, "STANDARD", "WALK_IN", 2000, 2, 1)), 204);
		long heldSet = setIds(venue).getLast();
		// Inserted directly: the staff-mark endpoint refuses a past date, which is how history accrues.
		seedHold(heldSet, LocalDate.now(TIRANE).minusDays(400), "STAFF_MARKED");

		// A2 leaves the map; its only hold is last season's, so nothing refuses and the set is deleted.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(currentSetVersion(venue),
								cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1))))
				.andExpect(status().isNoContent());

		assertEquals(0L, holdsOn(heldSet), "a hold describing a day that is gone goes with its set (CASCADE)");
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(1));
	}

	@Test
	void rejectsEmptyLayout() throws Exception {
		long venue = createVenue("Empty Club");
		// Token present (0) so the request passes the required-token check and reaches the EMPTY_LAYOUT
		// rule — proving the empty-layout guard, not the missing-token 400.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"sets\":[],\"expectedVersion\":0}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("EMPTY_LAYOUT"));
	}

	@Test
	void rejectsDuplicateCellWithinTheBatch() throws Exception {
		long venue = createVenue("Dup Club");
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(0,
								cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
								cell("B", 2, "STANDARD", "ONLINE", 2000, 1, 1)))) // same grid cell (1,1)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CELL_TAKEN"));
	}

	@Test
	void rejectsRowLabelSharedByTwoGridRows() throws Exception {
		long venue = createVenue("Split Club");
		// The #728 reproducer: gap-cell numbering keeps every (row_label, position_no) pair unique.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(0,
								cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1),
								cell("A", 3, "PREMIUM", "ONLINE", 3500, 3, 1),
								cell("A", 1, "STANDARD", "ONLINE", 2000, 1, 2))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ROW_NAME_TAKEN"));
		assertEquals(List.of(), setIds(venue), "a refused replace must write nothing");
	}

	private void seedBooking(long venueId, long setId) {
		seedBooking(venueId, setId, "CONFIRMED");
	}

	private void seedBooking(long venueId, long setId, String status) {
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:e, 'Guest', '+355000') RETURNING id
				""").param("e", "guest-" + venueId + "@example.test").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, DATE '2035-07-01', 2000, 'EUR', :status)
				""")
				.param("code", "BK-" + venueId + "-" + setId)
				.param("v", venueId).param("s", setId).param("c", customerId).param("status", status)
				.update();
	}
}
