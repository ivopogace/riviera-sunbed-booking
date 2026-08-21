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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the display-only per-row rename
 * ({@code PUT /api/venues/{id}/rows/{rowLabel}/name}) end to end against Testcontainers
 * Postgres, through the real {@code JdbcVenues} adapter. Pins:
 * <ul>
 *   <li><strong>AC-1</strong>: a venue that has already sold can still rename a row — the write the
 *       bulk replace ({@code LAYOUT_IN_USE}) and {@code editSet} ({@code SET_IN_USE}) both refuse.
 *       The booking, its {@code set_id}, the set's hold, pool, position and price all survive, and
 *       the tourist map read speaks the new name.</li>
 *   <li><strong>AC-2</strong>: renaming onto a label another row already carries is
 *       {@code 409 ROW_NAME_TAKEN} — and the two rows' {@code (row_label, position_no)} pairs are
 *       chosen so the UNIQUE index alone would <em>not</em> have caught it.</li>
 *   <li><strong>AC-4/AC-5</strong>: a stale token is {@code 409 STALE_WRITE}; an unknown row is
 *       {@code 404 NO_SUCH_ROW}, neither advancing {@code set_version}.</li>
 *   <li><strong>AC-7</strong>: an over-long label is {@code 400 INVALID_REQUEST} at the edge (§6b).</li>
 * </ul>
 * The cross-venue {@code 403} (invariant #13) lives in the {@code CrossVenueDenialIT} matrix.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class VenueRowRenameIT {

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

	private static String cell(String rowLabel, int positionNo, String pool, int gridX, int gridY) {
		return """
				{"rowLabel":"%s","positionNo":%d,"tier":"STANDARD","pool":"%s",
				 "price":{"minorUnits":2000,"currency":"EUR"},"gridX":%d,"gridY":%d}
				""".formatted(rowLabel, positionNo, pool, gridX, gridY);
	}

	/** The rename body: the new label plus the required optimistic-concurrency token. */
	private static String nameBody(String newLabel, long expectedVersion) {
		return "{\"newLabel\":\"%s\",\"expectedVersion\":%d}".formatted(newLabel, expectedVersion);
	}

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
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andReturn();
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}

	/**
	 * Row A at positions 1–2 and row B at positions 3–4. The disjoint position numbers are the point:
	 * renaming B to A would leave every {@code (row_label, position_no)} pair unique, so
	 * {@code set_position_cell_uniq} would accept the merge that {@code ROW_NAME_TAKEN} refuses.
	 */
	private long seedVenue(String name) throws Exception {
		long venue = createVenue(name);
		String layout = "{\"sets\":[" + String.join(",",
				cell("A", 1, "ONLINE", 1, 1),
				cell("A", 2, "ONLINE", 2, 1),
				cell("B", 3, "ONLINE", 1, 2),
				cell("B", 4, "WALK_IN", 2, 2)) + "],\"expectedVersion\":0}";
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(layout))
				.andExpect(status().isNoContent());
		return venue;
	}

	private List<Long> setIdsOfRow(long venueId, String rowLabel) {
		return jdbc.sql("""
				SELECT id FROM set_position WHERE venue_id = :v AND row_label = :r ORDER BY position_no
				""").param("v", venueId).param("r", rowLabel).query(Long.class).list();
	}

	private void seedBooking(long venueId, long setId) {
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:e, 'Guest', '+355000') RETURNING id
				""").param("e", "rename-guest-" + venueId + "@example.test").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, DATE '2035-07-01', 2000, 'EUR', 'CONFIRMED')
				""")
				.param("code", "RN-" + venueId + "-" + setId)
				.param("v", venueId).param("s", setId).param("c", customerId)
				.update();
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, DATE '2035-07-01', 'BOOKED_ONLINE')
				""").param("s", setId).update();
	}

	@Test
	void renamesARowOnAVenueThatHasSold() throws Exception {
		long venue = seedVenue("Sold Rename Club");
		long b3 = setIdsOfRow(venue, "B").getFirst();
		seedBooking(venue, b3);

		// The venue now answers LAYOUT_IN_USE to a replace and SET_IN_USE to a move; the rename still works.
		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "B").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(nameBody("Back row", currentSetVersion(venue))))
				.andExpect(status().isNoContent());

		// Every B set reads the new name; row A is untouched. Read order is (grid_y, grid_x).
		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[0].rowLabel").value("A"))
				.andExpect(jsonPath("$.sets[1].rowLabel").value("A"))
				.andExpect(jsonPath("$.sets[2].rowLabel").value("Back row"))
				.andExpect(jsonPath("$.sets[3].rowLabel").value("Back row"))
				.andExpect(jsonPath("$.sets[3].pool").value("WALK_IN"));

		// Nothing a claim depends on moved: same set id, same booking, same hold, same position/price.
		assertEquals(List.of(b3), List.of(setIdsOfRow(venue, "Back row").getFirst()));
		assertEquals(1L, jdbc.sql("SELECT COUNT(*) FROM booking WHERE set_id = :s")
				.param("s", b3).query(Long.class).single());
		assertEquals(1L, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", b3).query(Long.class).single());
		assertEquals(3, jdbc.sql("SELECT position_no FROM set_position WHERE id = :s")
				.param("s", b3).query(Integer.class).single());
		assertEquals(2000L, jdbc.sql("SELECT price_minor FROM set_position WHERE id = :s")
				.param("s", b3).query(Long.class).single());
	}

	@Test
	void refusesANameAnotherRowAlreadyCarries() throws Exception {
		long venue = seedVenue("Merge Rename Club");
		long before = currentSetVersion(venue);

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "B").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(nameBody("A", before)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("ROW_NAME_TAKEN"));

		// Both rows keep their labels and the token is untouched, so the acting tab can correct and retry.
		assertEquals(2, setIdsOfRow(venue, "A").size());
		assertEquals(2, setIdsOfRow(venue, "B").size());
		assertEquals(before, currentSetVersion(venue));
	}

	@Test
	void allowsARenameToTheRowsOwnLabel() throws Exception {
		long venue = seedVenue("Idempotent Rename Club");
		long before = currentSetVersion(venue);

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "B").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(nameBody("B", before)))
				.andExpect(status().isNoContent());

		assertEquals(2, setIdsOfRow(venue, "B").size());
		// A write of nothing must not stale the other tabs' token.
		assertEquals(before, currentSetVersion(venue));
	}

	@Test
	void refusesAStaleRename() throws Exception {
		long venue = seedVenue("Stale Rename Club");
		long stale = currentSetVersion(venue);

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(nameBody("Front row", stale)))
				.andExpect(status().isNoContent());

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "B").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(nameBody("Back row", stale)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("STALE_WRITE"));

		assertEquals(2, setIdsOfRow(venue, "B").size()); // the loser's rename never landed
	}

	@Test
	void refusesAnUnknownRow() throws Exception {
		long venue = seedVenue("Unknown Rename Club");
		long before = currentSetVersion(venue);

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "Z").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(nameBody("Back row", before)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_ROW"));

		// A rejected rename must not advance the token, or the acting tab's next write would be stale.
		assertEquals(before, currentSetVersion(venue));
	}

	@Test
	void refusesAddingASetUnderAnotherGridRowsLabel() throws Exception {
		// The rename's one-label-per-row rule, enforced on the path that could otherwise seed a split.
		long venue = seedVenue("Split Add Club");

		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(cell("A", 9, "ONLINE", 3, 2)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ROW_NAME_TAKEN"));

		assertEquals(2, setIdsOfRow(venue, "A").size());
	}

	@Test
	void allowsAddingASetToItsOwnGridRow() throws Exception {
		// The control: extending a row along its own grid row is the ordinary case, not a split.
		long venue = seedVenue("Wide Add Club");

		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(cell("A", 9, "ONLINE", 3, 1)))
				.andExpect(status().isCreated());

		assertEquals(3, setIdsOfRow(venue, "A").size());
	}

	@Test
	void refusesMovingASetOntoAnotherGridRowsLabel() throws Exception {
		long venue = seedVenue("Split Edit Club");
		long b3 = setIdsOfRow(venue, "B").getFirst();

		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, b3).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(cell("A", 3, "ONLINE", 1, 2)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ROW_NAME_TAKEN"));
	}

	@Test
	void overlongNewLabelIs400() throws Exception {
		long venue = seedVenue("Overlong Rename Club");

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(nameBody("x".repeat(41), currentSetVersion(venue))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void missingExpectedVersionIs400() throws Exception {
		long venue = seedVenue("Tokenless Rename Club");

		mvc.perform(put("/api/venues/{v}/rows/{r}/name", venue, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"newLabel\":\"Front row\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}
}
