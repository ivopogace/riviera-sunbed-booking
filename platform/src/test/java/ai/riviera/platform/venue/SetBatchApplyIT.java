package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;

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

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The set batch apply at the HTTP seam ({@code PATCH /api/venues/{venueId}/sets}): price, tier and
 * pool applied to every named set in one transaction, booked sets included and their holds
 * untouched; the whole batch refused on a stale {@code setVersion}, on a set that is not the
 * venue's, on a body touching nothing, and for a non-owner (invariant #13).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class SetBatchApplyIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L; // the seeded venue: a source of set ids that are not ours
	/** The shared {@code STALE_WRITE} detail every {@code set_version}-guarded write answers. */
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

	@Test
	void appliesToBookedSetsAndKeepsTheirHolds() throws Exception {
		long venue = createVenue("Batch Club");
		long a = addSet(venue, 1);
		long b = addSet(venue, 2);
		long c = addSet(venue, 3);
		holdOn(a);
		holdOn(b);
		long version = currentSetVersion(venue);

		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d,%d,%d]".formatted(a, b, c),
								"\"tier\":\"PREMIUM\",\"pool\":\"WALK_IN\","
										+ "\"price\":{\"minorUnits\":4000,\"currency\":\"EUR\"},", version)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.updated").value(3));

		for (long set : new long[] { a, b, c }) {
			assertEquals("PREMIUM WALK_IN 4000", jdbc.sql(
							"SELECT tier || ' ' || pool || ' ' || price_minor FROM set_position WHERE id = :s")
					.param("s", set).query(String.class).single());
		}
		assertEquals(2, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id IN (:a, :b)")
						.param("a", a).param("b", b).query(Integer.class).single(),
				"the booked dates stay claimed by their own rows (invariant #2)");
		assertEquals(version + 1, currentSetVersion(venue), "the token advances once, on success");
	}

	@Test
	void appliesOnlyTheTouchedField() throws Exception {
		long venue = createVenue("Price Only Club");
		long a = addSet(venue, 1);
		long version = currentSetVersion(venue);

		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d]".formatted(a),
								"\"price\":{\"minorUnits\":4500,\"currency\":\"EUR\"},", version)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.updated").value(1));

		assertEquals("STANDARD ONLINE 4500", jdbc.sql(
						"SELECT tier || ' ' || pool || ' ' || price_minor FROM set_position WHERE id = :s")
				.param("s", a).query(String.class).single(), "tier and pool keep the set's own values");
	}

	@Test
	void staleVersionRefusesTheWholeBatch() throws Exception {
		long venue = createVenue("Stale Batch Club");
		long a = addSet(venue, 1);
		long stale = currentSetVersion(venue);
		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d]".formatted(a), "\"tier\":\"PREMIUM\",", stale)))
				.andExpect(status().isOk());

		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d]".formatted(a), "\"pool\":\"WALK_IN\",", stale)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_SETS_DETAIL));

		assertEquals("ONLINE", jdbc.sql("SELECT pool FROM set_position WHERE id = :s")
				.param("s", a).query(String.class).single());
	}

	@Test
	void aForeignSetIdRefusesTheWholeBatch() throws Exception {
		long venue = createVenue("Foreign Set Club");
		long own = addSet(venue, 1);
		long foreign = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", MIRAMAR).query(Long.class).single();
		long version = currentSetVersion(venue);

		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d,%d]".formatted(own, foreign), "\"tier\":\"PREMIUM\",", version)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));

		assertEquals("STANDARD", jdbc.sql("SELECT tier FROM set_position WHERE id = :s")
				.param("s", own).query(String.class).single(), "nothing is written on a refused batch");
		assertEquals(version, currentSetVersion(venue));
	}

	@Test
	void rejectsAnEmptyBatchAndAMissingToken() throws Exception {
		long venue = createVenue("Empty Batch Club");
		long a = addSet(venue, 1);
		long version = currentSetVersion(venue);

		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d]".formatted(a), "", version)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[]", "\"tier\":\"PREMIUM\",", version)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"setIds\":[%d],\"tier\":\"PREMIUM\"}".formatted(a)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void nonOwnerIsForbidden() throws Exception {
		// A venue owned by another operator: the acting session is denied before any read or write (invariant #13).
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Someone Else''s Club', 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR') RETURNING id
				""").query(Long.class).single();
		long other = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES ('batch-other-owner-' || :v, 'ACTIVE') RETURNING id")
				.param("v", venue).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venue).param("o", other).update();
		long set = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'STANDARD', 'ONLINE', 3000, 'EUR', 1, 1) RETURNING id
				""").param("v", venue).query(Long.class).single();

		mvc.perform(patch("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(batch("[%d]".formatted(set), "\"tier\":\"PREMIUM\",", 0)))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));

		assertEquals("STANDARD", jdbc.sql("SELECT tier FROM set_position WHERE id = :s")
				.param("s", set).query(String.class).single());
	}

	private static String batch(String ids, String fields, long expectedVersion) {
		return "{\"setIds\":" + ids + "," + fields + "\"expectedVersion\":" + expectedVersion + "}";
	}

	private void holdOn(long setId) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :day, 'BOOKED_ONLINE')")
				.param("set", setId)
				.param("day", LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(30))
				.update();
	}

	private long currentSetVersion(long venueId) throws Exception {
		MvcResult result = mvc.perform(get("/api/venues/{id}", venueId))
				.andExpect(status().isOk()).andReturn();
		return Long.parseLong(com.jayway.jsonpath.JsonPath
				.read(result.getResponse().getContentAsString(), "$.setVersion").toString());
	}

	private long createVenue(String name) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"%s","beach":"Ksamil","region":"Riviera","description":"on the shore",
								 "bookingMode":"INSTANT","payoutCurrency":"EUR","bookingCutoff":"18:00"}
								""".formatted(name)))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private long addSet(long venue, int positionNo) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"rowLabel":"Row A","positionNo":%d,"tier":"STANDARD","pool":"ONLINE",
								 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":%d,"gridY":1}
								""".formatted(positionNo, positionNo)))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private static long idFrom(MvcResult result) throws Exception {
		return Long.parseLong(com.jayway.jsonpath.JsonPath
				.read(result.getResponse().getContentAsString(), "$.id").toString());
	}
}
