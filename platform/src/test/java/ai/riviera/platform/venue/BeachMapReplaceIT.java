package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.vocabulary.VenueId;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the bulk beach-map replace ({@code PUT /api/venues/{id}/beach-map}) end to
 * end against Testcontainers Postgres, through the real {@code JdbcVenues}, {@code JdbcBookingPresence},
 * and {@code JdbcSetAvailabilityLookup} adapters. Pins: the whole grid round-trips through the U1 read
 * API with row A priced front-row premium and the {@code WALK_IN} pool preserved (AC-1/AC-4/AC-7);
 * regenerate replaces the previous layout (AC-1); and — the highest-stakes case — the
 * reject-unless-unclaimed guard refuses a replace when the venue has a booking or an availability hold
 * dated today or later, leaving the existing layout <em>and</em> the hold untouched (AC-6, invariant #2
 * / R-1: the {@code set_availability} CASCADE must never silently fire). A hold whose day has gone does
 * not freeze the map — it goes with its set.
 *
 * <p>The replace is optimistic-locked on the venue's {@code set_version}: every replace body
 * carries the required {@code expectedVersion} the tab loaded from the map read, and a stale token is
 * rejected 409 {@code STALE_WRITE} without clobbering the current layout
 * ({@link #staleReplaceIs409StaleWrite}). The version is read under the venue row lock before the
 * invariant-#2 set locks (R-1) and bumped only on the success path, so the concurrent-hold scenarios
 * above still hold and a rejected replace leaves the token untouched.
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
	 * The one {@code LAYOUT_IN_USE} detail, asserted at both arms that raise it — a booking and a
	 * future-dated walk-in hold. Naming no arm is what keeps it true when the guards change; the
	 * operator-facing wording, including where to go instead, belongs to the console.
	 */
	private static final String LAYOUT_IN_USE_DETAIL = "This venue's layout is in use.";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	EditBeachMap editBeachMap;

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

	/** The venue's current {@code set_version} straight from the row (for the direct-service-call race). */
	private long setVersionOf(long venueId) {
		return jdbc.sql("SELECT set_version FROM venue WHERE id = :v")
				.param("v", venueId).query(Long.class).single();
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
	void regenerateReplacesThePreviousLayout() throws Exception {
		long venue = createVenue("Regenerate Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "PREMIUM", "ONLINE", 3500, 2, 1)), 204);

		// AC-1: regenerate to a smaller grid replaces (not appends) — the old sets are gone. The first
		// replace bumped set_version to 1, so this one must load it afresh (a stale 0 would be 409).
		putLayout(venue, layout(currentSetVersion(venue), cell("A", 1, "PREMIUM", "ONLINE", 4000, 1, 1)), 204);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(1))
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
				.andExpect(jsonPath("$.code").value("STALE_WRITE"));

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
	void rejectsWhenVenueHasBooking() throws Exception {
		long venue = createVenue("Booked Club");
		putLayout(venue, layout(0,
				cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		long bookedSet = setIds(venue).getFirst();
		seedBooking(venue, bookedSet);

		// AC-6/AC-8: a venue with a booking is locked — the replace is 409 LAYOUT_IN_USE and nothing changes.
		// The token is current (not stale), so the reject is LAYOUT_IN_USE — the in-use guard, not STALE_WRITE.
		long tokenBefore = currentSetVersion(venue);
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(tokenBefore, cell("A", 1, "PREMIUM", "ONLINE", 9999, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("LAYOUT_IN_USE"))
				.andExpect(jsonPath("$.detail").value(LAYOUT_IN_USE_DETAIL));

		// The original two sets are untouched (no partial delete), and the LAYOUT_IN_USE
		// reject did NOT advance set_version (no spurious bump), so the acting tab's token still matches and
		// a retry after the lock clears would not falsely 409 STALE_WRITE.
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(2))
				.andExpect(jsonPath("$.setVersion").value((int) tokenBefore));
	}

	@Test
	void rejectsWhenVenueHasWalkInHoldAndHoldSurvives() throws Exception {
		long venue = createVenue("Held Club");
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "WALK_IN", 2000, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		long heldSet = setIds(venue).getLast(); // deliberately NOT the first: the probe must cover every locked set
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, :d, 'STAFF_MARKED')
				""").param("s", heldSet).param("d", LocalDate.now(TIRANE).plusDays(30)).update();

		// AC-6/AC-8 / R-1: the guard consults availability BEFORE any delete, so the CASCADE never fires.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(currentSetVersion(venue), cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("LAYOUT_IN_USE"))
				.andExpect(jsonPath("$.detail").value(LAYOUT_IN_USE_DETAIL));

		// The hold row still exists — it was not silently cascade-deleted.
		Long holds = jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", heldSet).query(Long.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(1L, holds);
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(2));
	}

	@Test
	void replacesTheLayoutOfAWalkInOnlyVenueWhoseHoldsAreAllPast() throws Exception {
		long venue = createVenue("Last Season Club");
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "WALK_IN", 2000, 1, 1),
				cell("A", 2, "STANDARD", "WALK_IN", 2000, 2, 1)), 204);
		long heldSet = setIds(venue).getFirst();
		// Inserted directly: the staff-mark endpoint refuses a past date, which is how history accrues.
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, :d, 'STAFF_MARKED')
				""")
				.param("s", heldSet)
				.param("d", LocalDate.now(TIRANE).minusDays(400))
				.update();

		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(currentSetVersion(venue),
								cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1))))
				.andExpect(status().isNoContent());

		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
						.param("s", heldSet).query(Long.class).single(),
				"a hold describing a day that is gone goes with its set (CASCADE)");
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

	/**
	 * Invariant #2 (RV-BE-1): a walk-in mark committed concurrently with a regenerate must never be
	 * silently lost. The replace locks the venue's {@code set_position} rows {@code FOR UPDATE} before
	 * probing availability, so the mark's FK {@code FOR KEY SHARE} blocks until the replace ends — the
	 * two can never both succeed. Without the lock, a mark landing in the check→delete window would be
	 * {@code ON DELETE CASCADE}-swept while staff believe the set is held. Repeated to exercise both
	 * interleavings; passes reliably with the lock, can fail without it.
	 */
	@RepeatedTest(4)
	void concurrentWalkInMarkAndReplaceNeverSilentlyLoseTheHold(RepetitionInfo info) throws Exception {
		long venue = createVenue("Race Club " + info.getCurrentRepetition());
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "ONLINE", 2000, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)), 204);
		long setX = setIds(venue).getFirst();
		// The venue was created via POST as the bootstrap session, so creator-owns-on-create
		// already made the bootstrap its owner — drive the replace as that owner (no second grant, which
		// would violate the one-owner-per-venue PK).
		OperatorId owner = new OperatorId(jdbc.sql("SELECT id FROM operator WHERE username = 'operator'")
				.query(Long.class).single());
		// The seed replace bumped set_version to 1; the racing replace loads it so it passes the token gate
		// and exercises the invariant-#2 lock path (not STALE_WRITE — the mark never touches set_version).
		long loadedSetVersion = setVersionOf(venue);
		LocalDate date = LocalDate.now(TIRANE).plusYears(2).plusDays(info.getCurrentRepetition());

		CountDownLatch gate = new CountDownLatch(1);
		Callable<Boolean> mark = () -> {
			gate.await();
			try {
				jdbc.sql("""
						INSERT INTO set_availability (set_id, booking_date, state)
						VALUES (:s, :d, 'STAFF_MARKED')
						""").param("s", setX).param("d", date).update();
				return true; // the hold committed
			} catch (DataIntegrityViolationException deletedByReplace) {
				return false; // the set was replaced out from under the mark — a clean loss, not a silent one
			}
		};
		Callable<ReplaceLayoutOutcome> replace = () -> {
			gate.await();
			return editBeachMap.replaceLayout(owner, new VenueId(venue), loadedSetVersion, new LayoutCommand(
					List.of(new SetCommand("A", 1, "STANDARD", "ONLINE", 2000, "EUR", 1, 1))));
		};

		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<Boolean> heldF = pool.submit(mark);
			Future<ReplaceLayoutOutcome> replacedF = pool.submit(replace);
			gate.countDown();
			boolean held = heldF.get(20, TimeUnit.SECONDS);
			boolean replaced = replacedF.get(20, TimeUnit.SECONDS)
					instanceof ReplaceLayoutOutcome.Replaced;

			assertFalse(held && replaced,
					"a committed walk-in hold was silently lost by a concurrent layout replace (invariant #2)");
			if (held) {
				// The hold committed ⇒ the replace must have seen it and been rejected, so it survives.
				Long holds = jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
						.param("s", setX).query(Long.class).single();
				assertEquals(1L, holds);
			}
		}
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
