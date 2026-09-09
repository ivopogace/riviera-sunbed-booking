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

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The remodel preview at the HTTP seam — the platform edge composing {@code venue}'s diff with
 * {@code booking}'s classification (ADR-0020): the five groups and the sets to keep for a save
 * that drops two booked sets, nothing written and the token untouched; every group empty for a
 * repaint; {@code 409 STALE_WRITE} for a stale token; no booking code anywhere on the wire
 * (invariant #7). Booking dates are relative to today in {@code Europe/Tirane} so the zones fall
 * where the default 24h / 96h windows put them (the exact boundaries are {@code RemodelZonesTest}'s).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class RemodelPreviewIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	/** One {@code set_version} token, one sentence: the preview answers a stale token in the save's words. */
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
	void classifiesEveryLiveClaimOnTheDroppedSetsIntoTheFiveGroupsWithoutWriting() throws Exception {
		long venue = createVenue("Remodel Club");
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "ONLINE", 2000, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1),
				cell("A", 3, "STANDARD", "ONLINE", 2000, 3, 1),
				cell("A", 4, "STANDARD", "WALK_IN", 2000, 4, 1),
				cell("B", 1, "PREMIUM", "ONLINE", 3500, 1, 2)));
		List<Long> ids = setIds(venue);
		long a1 = ids.get(0);
		long a2 = ids.get(1);
		long a3 = ids.get(2);
		long b1 = ids.get(4);
		LocalDate farOut = today.plusDays(10);
		LocalDate fullDay = today.plusDays(12);
		LocalDate declineDay = today.plusDays(13);
		LocalDate moveOnlyDay = today.plusDays(3);
		long moved = seedBooking(venue, a1, "CONFIRMED", farOut);
		long movedToPremium = seedBooking(venue, a2, "CONFIRMED", farOut);
		long refunded = seedBooking(venue, a1, "CONFIRMED", fullDay);
		long released = seedBooking(venue, a2, "AWAITING_PAYMENT", fullDay);
		long declined = seedBooking(venue, a1, "PENDING_REQUEST", declineDay);
		long frozen = seedBooking(venue, a1, "CONFIRMED", today.plusDays(1));
		long stranded = seedBooking(venue, a2, "CONFIRMED", moveOnlyDay);
		for (LocalDate full : List.of(fullDay, declineDay, moveOnlyDay)) {
			seedHold(a3, full, "STAFF_MARKED");
			seedHold(b1, full, "BOOKED_ONLINE");
		}
		seedHold(a2, today.plusDays(5), "STAFF_MARKED");
		long tokenBefore = currentSetVersion(venue);

		mvc.perform(post("/api/venues/{v}/beach-map/preview", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(tokenBefore,
								cell("A", 3, "STANDARD", "ONLINE", 2000, 3, 1),
								cell("A", 4, "STANDARD", "WALK_IN", 2000, 4, 1),
								cell("B", 1, "PREMIUM", "ONLINE", 3500, 1, 2))))
				.andExpect(status().isOk())
				.andExpect(content().string(not(containsString("\"code\""))))
				.andExpect(jsonPath("$.moves.length()").value(2))
				.andExpect(jsonPath("$.moves[0].bookingId").value(moved))
				.andExpect(jsonPath("$.moves[0].bookingDate").value(farOut.toString()))
				.andExpect(jsonPath("$.moves[0].amount.minorUnits").value(2000))
				.andExpect(jsonPath("$.moves[0].from.setId").value(a1))
				.andExpect(jsonPath("$.moves[0].from.rowLabel").value("A"))
				.andExpect(jsonPath("$.moves[0].to.setId").value(a3))
				.andExpect(jsonPath("$.moves[0].to.positionNo").value(3))
				.andExpect(jsonPath("$.moves[0].rowsAway").value(0))
				.andExpect(jsonPath("$.moves[0].positionsAway").value(2))
				.andExpect(jsonPath("$.moves[1].bookingId").value(movedToPremium))
				.andExpect(jsonPath("$.moves[1].to.setId").value(b1))
				.andExpect(jsonPath("$.moves[1].rowsAway").value(1))
				.andExpect(jsonPath("$.refunds.length()").value(1))
				.andExpect(jsonPath("$.refunds[0].bookingId").value(refunded))
				.andExpect(jsonPath("$.releases.length()").value(2))
				.andExpect(jsonPath("$.releases[0].bookingId").value(released))
				.andExpect(jsonPath("$.releases[0].kind").value("RELEASE"))
				.andExpect(jsonPath("$.releases[1].bookingId").value(declined))
				.andExpect(jsonPath("$.releases[1].kind").value("DECLINE"))
				.andExpect(jsonPath("$.staffHolds.length()").value(1))
				.andExpect(jsonPath("$.staffHolds[0].set.setId").value(a2))
				.andExpect(jsonPath("$.staffHolds[0].dates[0]").value(today.plusDays(5).toString()))
				.andExpect(jsonPath("$.blocks.length()").value(2))
				.andExpect(jsonPath("$.blocks[0].bookingId").value(frozen))
				.andExpect(jsonPath("$.blocks[0].reason").value("FROZEN"))
				.andExpect(jsonPath("$.blocks[1].bookingId").value(stranded))
				.andExpect(jsonPath("$.blocks[1].reason").value("NO_MOVE_CANDIDATE"))
				.andExpect(jsonPath("$.keep.length()").value(2))
				.andExpect(jsonPath("$.keep[0].setId").value(a1))
				.andExpect(jsonPath("$.keep[1].setId").value(a2))
				.andExpect(jsonPath("$.previewToken", org.hamcrest.Matchers.startsWith("v1.")));

		assertEquals(ids, setIds(venue), "a preview writes nothing");
		assertEquals(tokenBefore, currentSetVersion(venue), "a preview never spends the token");
	}

	@Test
	void aRepaintAnswersEveryGroupEmptyAndAStaleTokenIsRefused() throws Exception {
		long venue = createVenue("Repaint Club");
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "ONLINE", 2000, 1, 1),
				cell("A", 2, "STANDARD", "ONLINE", 2000, 2, 1)));
		seedBooking(venue, setIds(venue).get(0), "CONFIRMED", today.plusDays(1));
		long token = currentSetVersion(venue);
		String repaint = layout(token,
				cell("Front", 1, "PREMIUM", "WALK_IN", 9900, 1, 1),
				cell("Front", 2, "PREMIUM", "ONLINE", 9900, 2, 1));

		mvc.perform(post("/api/venues/{v}/beach-map/preview", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(repaint))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.moves.length()").value(0))
				.andExpect(jsonPath("$.refunds.length()").value(0))
				.andExpect(jsonPath("$.releases.length()").value(0))
				.andExpect(jsonPath("$.staffHolds.length()").value(0))
				.andExpect(jsonPath("$.blocks.length()").value(0))
				.andExpect(jsonPath("$.keep.length()").value(0));

		mvc.perform(post("/api/venues/{v}/beach-map/preview", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(token + 1, cell("A", 1, "STANDARD", "ONLINE", 2000, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_SETS_DETAIL));

		// The twin: the save it stands in for refuses the same stale token in the same words.
		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(token + 1, cell("A", 1, "STANDARD", "ONLINE", 2000, 1, 1))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("STALE_WRITE"))
				.andExpect(jsonPath("$.detail").value(STALE_SETS_DETAIL));

		mvc.perform(post("/api/venues/{v}/beach-map/preview", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"sets\":[{\"rowLabel\":\"A\",\"positionNo\":1,\"gridX\":1,\"gridY\":1}]}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	private static String cell(String rowLabel, int positionNo, String tier, String pool,
			long minor, int gridX, int gridY) {
		return """
				{"rowLabel":"%s","positionNo":%d,"tier":"%s","pool":"%s",
				 "price":{"minorUnits":%d,"currency":"EUR"},"gridX":%d,"gridY":%d}
				""".formatted(rowLabel, positionNo, tier, pool, minor, gridX, gridY);
	}

	private static String layout(long expectedVersion, String... cells) {
		return "{\"sets\":[" + String.join(",", cells) + "],\"expectedVersion\":" + expectedVersion + "}";
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

	private long seedBooking(long venueId, long setId, String status, LocalDate date) {
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:e, 'Guest', '+355000') RETURNING id
				""").param("e", "guest-" + venueId + "-" + System.nanoTime() + "@example.test")
				.query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, :date, 2000, 'EUR', :status)
				RETURNING id
				""")
				.param("code", "RM-" + venueId + "-" + System.nanoTime())
				.param("v", venueId).param("s", setId).param("c", customerId).param("date", date)
				.param("status", status)
				.query(Long.class).single();
	}
}
