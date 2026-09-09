package ai.riviera.platform;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

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

import com.jayway.jsonpath.JsonPath;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The remodel commit at the HTTP seam — the platform edge composing {@code venue}'s gated write with
 * {@code booking}'s moves (ADR-0020): an all-move commit applies the layout and every move in one
 * transaction and answers the receipt; a token that no longer covers the claims is
 * {@code 409 STALE_PREVIEW} with the fresh picture and writes nothing; a token covering a vanished
 * claim commits; a picture with a refund is {@code 409 REMODEL_REFUSED}; a staff hold is stale; a
 * stale {@code set_version} answers in the save's words; no booking code anywhere (invariant #7).
 * Dates are relative to today in {@code Europe/Tirane} so the zones fall where the default windows
 * put them.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class RemodelCommitIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final String STALE_SETS_DETAIL =
			"This venue's sets have changed since the version this request carries.";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private Cookie operatorSession;
	private LocalDate today;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		today = LocalDate.now(TIRANE);
	}

	@Test
	void anAllMoveCommitAppliesTheLayoutAndEveryMoveAndAnswersTheReceipt() throws Exception {
		long venue = createVenue("Commit Club");
		putLayout(venue, layout(0, cell("A", 1, 1), cell("A", 2, 2), cell("A", 3, 3)));
		List<Long> ids = setIds(venue);
		long a1 = ids.get(0);
		long a2 = ids.get(1);
		LocalDate farOut = today.plusDays(10);
		String code = "CMT-" + System.nanoTime();
		long booking = seedBooking(venue, a1, code, "CONFIRMED", farOut);
		seedHold(a1, farOut, "BOOKED_ONLINE");
		long token = currentSetVersion(venue);
		String body = layout(token, cell("A", 2, 2), cell("A", 3, 3));
		String previewToken = previewToken(venue, body);

		MvcResult result = mvc.perform(commit(venue, body, previewToken))
				.andExpect(status().isOk())
				.andExpect(content().string(not(containsString("\"code\""))))
				.andExpect(jsonPath("$.receiptId").isNumber())
				.andExpect(jsonPath("$.committedAt").isString())
				.andExpect(jsonPath("$.moves.length()").value(1))
				.andExpect(jsonPath("$.moves[0].bookingId").value(booking))
				.andExpect(jsonPath("$.moves[0].from.setId").value(a1))
				.andExpect(jsonPath("$.moves[0].to.setId").value(a2))
				.andExpect(jsonPath("$.moves[0].positionsAway").value(1))
				.andReturn();
		long receipt = ((Number) JsonPath.read(result.getResponse().getContentAsString(), "$.receiptId")).longValue();

		assertEquals(a2, setOf(booking), "the booking names its new set");
		assertNotNull(movedAt(booking), "the move is stamped");
		assertEquals(code, jdbc.sql("SELECT code FROM booking WHERE id = :id").param("id", booking)
				.query(String.class).single(), "the code survives the move");
		assertEquals(1, holds(a2, farOut), "the new row is claimed");
		assertEquals(0, holds(a1, farOut), "the old row is free");
		assertTrue(retired(a1), "the removed set the guest left is retired, so its label keeps resolving");
		assertEquals(List.of(a2, ids.get(2)), setIds(venue), "the layout is applied");
		assertEquals(token + 1, currentSetVersion(venue), "the save spent the token once");
		assertEquals(1, jdbc.sql("SELECT COUNT(*) FROM remodel_receipt_move WHERE receipt_id = :r")
				.param("r", receipt).query(Integer.class).single(), "the receipt is persisted with its move");

		mvc.perform(get("/api/venues/{v}/bookings", venue).param("date", farOut.toString()).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].setId").value(a2));
		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rowLabel").value("A"))
				.andExpect(jsonPath("$.positionNo").value(2))
				.andExpect(jsonPath("$.status").value("CONFIRMED"));
	}

	@Test
	void aTokenThatNoLongerCoversTheClaimsIsStaleAndWritesNothingWhileAVanishedClaimStillCommits() throws Exception {
		long venue = createVenue("Stale Preview Club");
		putLayout(venue, layout(0, cell("A", 1, 1), cell("A", 2, 2), cell("A", 3, 3)));
		List<Long> ids = setIds(venue);
		long a1 = ids.get(0);
		LocalDate day1 = today.plusDays(10);
		LocalDate day2 = today.plusDays(11);
		long first = seedBooking(venue, a1, "STL1-" + System.nanoTime(), "CONFIRMED", day1);
		seedHold(a1, day1, "BOOKED_ONLINE");
		long token = currentSetVersion(venue);
		String body = layout(token, cell("A", 2, 2), cell("A", 3, 3));
		String previewedOne = previewToken(venue, body);

		long second = seedBooking(venue, a1, "STL2-" + System.nanoTime(), "CONFIRMED", day2);
		seedHold(a1, day2, "BOOKED_ONLINE");
		mvc.perform(commit(venue, body, previewedOne))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(content().string(not(containsString("\"code\":\"STL"))))
				.andExpect(jsonPath("$.code").value("STALE_PREVIEW"))
				.andExpect(jsonPath("$.preview.moves.length()").value(2))
				.andExpect(jsonPath("$.preview.moves[1].bookingId").value(second))
				.andExpect(jsonPath("$.preview.previewToken", startsWith("v1.")));
		assertEquals(a1, setOf(first));
		assertEquals(a1, setOf(second));
		assertEquals(token, currentSetVersion(venue), "a refusal spends no token");
		assertEquals(ids, setIds(venue), "a refusal writes no layout");
		assertEquals(0, receiptsOf(venue), "a refusal leaves no receipt");

		String previewedBoth = previewToken(venue, body);
		jdbc.sql("UPDATE booking SET status = 'CANCELLED', cancelled_at = now() WHERE id = :id").param("id", second).update();
		jdbc.sql("DELETE FROM set_availability WHERE set_id = :s AND booking_date = :d").param("s", a1).param("d", day2).update();
		mvc.perform(commit(venue, body, previewedBoth))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.moves.length()").value(1))
				.andExpect(jsonPath("$.moves[0].bookingId").value(first));
		assertEquals(ids.get(1), setOf(first));
		assertEquals(a1, setOf(second), "a cancelled booking is left where it was");
	}

	@Test
	void aPictureWithARefundIsRefusedAndAStaffHoldIsStale() throws Exception {
		long venue = createVenue("Refused Club");
		putLayout(venue, layout(0, cell("A", 1, 1), cellWalkIn("A", 2, 2)));
		List<Long> ids = setIds(venue);
		long a1 = ids.get(0);
		LocalDate farOut = today.plusDays(10);
		long refunded = seedBooking(venue, a1, "RFS-" + System.nanoTime(), "CONFIRMED", farOut);
		seedHold(a1, farOut, "BOOKED_ONLINE");
		long token = currentSetVersion(venue);
		String body = layout(token, cellWalkIn("A", 2, 2));
		String previewToken = previewToken(venue, body);

		mvc.perform(commit(venue, body, previewToken))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REMODEL_REFUSED"))
				.andExpect(jsonPath("$.preview.refunds.length()").value(1))
				.andExpect(jsonPath("$.preview.refunds[0].bookingId").value(refunded));
		assertEquals(a1, setOf(refunded));
		assertEquals(token, currentSetVersion(venue));

		long held = createVenue("Held Club");
		putLayout(held, layout(0, cell("A", 1, 1), cell("A", 2, 2)));
		long h1 = setIds(held).get(0);
		seedHold(h1, today.plusDays(5), "STAFF_MARKED");
		String heldBody = layout(currentSetVersion(held), cell("A", 2, 2));
		mvc.perform(commit(held, heldBody, "v1"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("STALE_PREVIEW"))
				.andExpect(jsonPath("$.preview.staffHolds.length()").value(1))
				.andExpect(jsonPath("$.preview.staffHolds[0].set.setId").value(h1))
				.andExpect(jsonPath("$.preview.keep[0].setId").value(h1));
		assertFalse(retired(h1));
		assertEquals(2, setIds(held).size());
	}

	@Test
	void theSavesOwnRejectionsAnswerInTheSavesWordsAndAMalformedBodyIs400() throws Exception {
		long venue = createVenue("Rejections Club");
		putLayout(venue, layout(0, cell("A", 1, 1), cell("A", 2, 2)));
		long token = currentSetVersion(venue);

		mvc.perform(commit(venue, layout(token + 1, cell("A", 1, 1)), "v1"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_SETS_DETAIL));
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(layout(token + 1, cell("A", 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_SETS_DETAIL));

		mvc.perform(commit(venue, "{\"sets\":[],\"expectedVersion\":" + token + ",\"previewToken\":\"v1\"}", null))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("EMPTY_LAYOUT"));
		mvc.perform(commit(venue, layout(token, cell("A", 1, 1)), "garbage"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(commit(venue, "{\"sets\":[{\"rowLabel\":\"A\",\"positionNo\":1,\"tier\":\"GOLD\",\"pool\":\"ONLINE\","
				+ "\"price\":{\"minorUnits\":2000,\"currency\":\"EUR\"},\"gridX\":1,\"gridY\":1}],\"expectedVersion\":"
				+ token + ",\"previewToken\":\"v1\"}", null))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		assertEquals(token, currentSetVersion(venue));
	}

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder commit(long venue, String body,
			String previewToken) {
		String content = previewToken == null ? body
				: body.substring(0, body.length() - 1) + ",\"previewToken\":\"" + previewToken + "\"}";
		return post("/api/venues/{v}/beach-map/commit", venue).cookie(operatorSession).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(content);
	}

	private String previewToken(long venue, String body) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues/{v}/beach-map/preview", venue).cookie(operatorSession)
						.with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.previewToken", startsWith("v1")))
				.andReturn();
		return JsonPath.read(result.getResponse().getContentAsString(), "$.previewToken");
	}

	private static String cell(String rowLabel, int positionNo, int gridX) {
		return """
				{"rowLabel":"%s","positionNo":%d,"tier":"STANDARD","pool":"ONLINE",
				 "price":{"minorUnits":2000,"currency":"EUR"},"gridX":%d,"gridY":1}
				""".formatted(rowLabel, positionNo, gridX);
	}

	private static String cellWalkIn(String rowLabel, int positionNo, int gridX) {
		return cell(rowLabel, positionNo, gridX).replace("\"ONLINE\"", "\"WALK_IN\"");
	}

	private static String layout(long expectedVersion, String... cells) {
		return "{\"sets\":[" + String.join(",", cells) + "],\"expectedVersion\":" + expectedVersion + "}";
	}

	private long currentSetVersion(long venueId) throws Exception {
		MvcResult result = mvc.perform(get("/api/venues/{id}", venueId)).andExpect(status().isOk()).andReturn();
		return Long.parseLong(JsonPath.read(result.getResponse().getContentAsString(), "$.setVersion").toString());
	}

	private long createVenue(String name) throws Exception {
		String body = """
				{"name":"%s","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""".formatted(name + " " + System.nanoTime());
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andReturn();
		return Long.parseLong(JsonPath.read(result.getResponse().getContentAsString(), "$.id").toString());
	}

	private void putLayout(long venueId, String body) throws Exception {
		mvc.perform(put("/api/venues/{v}/beach-map", venueId).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isNoContent());
	}

	private List<Long> setIds(long venueId) {
		return jdbc.sql("SELECT id FROM active_set_position WHERE venue_id = :v ORDER BY grid_y, grid_x")
				.param("v", venueId).query(Long.class).list();
	}

	private void seedHold(long setId, LocalDate date, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, :state)")
				.param("s", setId).param("d", date).param("state", state).update();
	}

	private long seedBooking(long venueId, long setId, String code, String status, LocalDate date) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355000') RETURNING id")
				.param("e", "commit-" + System.nanoTime() + "@example.test").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :v, :s, :c, :date, 2000, 'EUR', :status, now())
				RETURNING id
				""")
				.param("code", code).param("v", venueId).param("s", setId).param("c", customerId)
				.param("date", date).param("status", status)
				.query(Long.class).single();
	}

	private long setOf(long bookingId) {
		return jdbc.sql("SELECT set_id FROM booking WHERE id = :id").param("id", bookingId).query(Long.class).single();
	}

	private Object movedAt(long bookingId) {
		return jdbc.sql("SELECT moved_at FROM booking WHERE id = :id").param("id", bookingId)
				.query(java.sql.Timestamp.class).optional().orElse(null);
	}

	private int holds(long setId, LocalDate date) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Integer.class).single();
	}

	private boolean retired(long setId) {
		return jdbc.sql("SELECT retired_at IS NOT NULL FROM set_position WHERE id = :id").param("id", setId)
				.query(Boolean.class).single();
	}

	private int receiptsOf(long venueId) {
		return jdbc.sql("SELECT COUNT(*) FROM remodel_receipt WHERE venue_id = :v").param("v", venueId)
				.query(Integer.class).single();
	}
}
