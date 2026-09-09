package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The owner-asserted close/reopen endpoint at the HTTP seam: closing with or without a reopen
 * date answers the counts of what guests are still owed, reopening clears the state, a non-owner is
 * refused (invariant #13), a reopen date not after today is refused, and closing touches nothing
 * else — the staff walk-in mark, the daily view and every existing booking keep working.
 * Testcontainers Postgres; every venue seeded here is removed again, because a closed venue owned by
 * the bootstrap operator would otherwise surface in the tourist-list ITs.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw",
		"booking.no-show.enabled=false" })
@AutoConfigureMockMvc
class SeasonClosureControllerIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private Cookie operatorSession;
	private final List<Long> venues = new ArrayList<>();
	private final List<Long> operators = new ArrayList<>();

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	@AfterEach
	void removeFixtures() {
		for (long venue : venues) {
			jdbc.sql("DELETE FROM booking WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM set_availability WHERE set_id IN (SELECT id FROM set_position WHERE venue_id = :v)")
					.param("v", venue).update();
			jdbc.sql("DELETE FROM set_position WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM venue WHERE id = :v").param("v", venue).update();
		}
		for (long operator : operators) {
			jdbc.sql("DELETE FROM operator WHERE id = :o").param("o", operator).update();
		}
		jdbc.sql("DELETE FROM customer WHERE email LIKE 'season-%@example.com'").update();
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	private static String closure(LocalDate reopenOn, boolean advanceSales) {
		return """
				{"reopenOn": %s, "advanceSales": %s}
				""".formatted(reopenOn == null ? "null" : "\"" + reopenOn + "\"", advanceSales);
	}

	private static String path(long venue) {
		return "/api/venues/" + venue + "/season-closure";
	}

	@Test
	void closingWithAReopenDateAnswersTheCountsOfWhatGuestsAreStillOwed() throws Exception {
		long venue = ownedVenue("Season Counts Club");
		long set = insertSet(venue, 1);
		LocalDate reopen = today().plusYears(1);
		insertBooking("season-1", venue, set, "CONFIRMED", today().plusDays(10));
		insertBooking("season-2", venue, set, "AWAITING_PAYMENT", today().plusDays(15));
		insertBooking("season-3", venue, set, "PENDING_REQUEST", today().plusDays(12));
		insertBooking("season-4", venue, set, "CANCELLED", today().plusDays(20));
		insertBooking("season-5", venue, set, "CONFIRMED", today().minusDays(5));

		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(reopen, true)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.closedForSeason").value(true))
				.andExpect(jsonPath("$.reopenOn").value(reopen.toString()))
				.andExpect(jsonPath("$.advanceSales").value(true))
				.andExpect(jsonPath("$.futureBookings").value(2))
				.andExpect(jsonPath("$.pendingRequests").value(1));

		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.seasonClosure.closed").value(true))
				.andExpect(jsonPath("$.seasonClosure.reopenOn").value(reopen.toString()))
				.andExpect(jsonPath("$.seasonClosure.advanceSales").value(true));

		// Every booking keeps its status: closing is a venue setting, never a lifecycle act.
		int untouched = jdbc.sql("""
				SELECT COUNT(*) FROM booking WHERE venue_id = :v
				  AND status IN ('CONFIRMED', 'AWAITING_PAYMENT', 'PENDING_REQUEST', 'CANCELLED')
				""").param("v", venue).query(Integer.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(5, untouched);
	}

	@Test
	void closingWithoutAReopenDateHoldsUntilReopenedByHand() throws Exception {
		long venue = ownedVenue("Season Indefinite Club");

		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(null, false)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.closedForSeason").value(true))
				.andExpect(jsonPath("$.reopenOn").value(nullValue()))
				.andExpect(jsonPath("$.advanceSales").value(false))
				.andExpect(jsonPath("$.futureBookings").value(0))
				.andExpect(jsonPath("$.pendingRequests").value(0));

		mvc.perform(delete(path(venue)).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/venues/{v}/profile", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.seasonClosure.closed").value(false))
				.andExpect(jsonPath("$.seasonClosure.reopenOn").value(nullValue()))
				.andExpect(jsonPath("$.seasonClosure.advanceSales").value(false));
		Integer stillClosed = jdbc.sql("SELECT COUNT(*) FROM venue WHERE id = :v AND closed_at IS NOT NULL")
				.param("v", venue).query(Integer.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(0, stillClosed);
	}

	@Test
	void reopeningIsIdempotentAndClosingAgainReplacesTheClosure() throws Exception {
		long venue = ownedVenue("Season Replace Club");
		mvc.perform(delete(path(venue)).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());
		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(null, false)))
				.andExpect(status().isOk());
		LocalDate reopen = today().plusMonths(6);
		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(reopen, false)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reopenOn").value(reopen.toString()));
	}

	@Test
	void aNonOwnerIsRefusedOnBothVerbs() throws Exception {
		long venue = venueOwnedBySomeoneElse("Season Foreign Club");

		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(null, false)))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
		mvc.perform(delete(path(venue)).cookie(operatorSession).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
		Integer closed = jdbc.sql("SELECT COUNT(*) FROM venue WHERE id = :v AND closed_at IS NOT NULL")
				.param("v", venue).query(Integer.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(0, closed);
	}

	@Test
	void writesRequireAnOperatorSession() throws Exception {
		long venue = ownedVenue("Season Anonymous Club");
		mvc.perform(put(path(venue)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(null, false)))
				.andExpect(status().isUnauthorized());
		mvc.perform(delete(path(venue)).with(csrf()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void aReopenDateNotAfterTodayIsRefused() throws Exception {
		long venue = ownedVenue("Season Past Date Club");
		for (LocalDate notAfterToday : List.of(today(), today().minusDays(1))) {
			mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
							.contentType(MediaType.APPLICATION_JSON).content(closure(notAfterToday, false)))
					.andExpect(status().isUnprocessableEntity())
					.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
					.andExpect(jsonPath("$.code").value("REOPEN_DATE_PASSED"));
		}
	}

	@Test
	void theOptInWithoutAReopenDateIsMalformed() throws Exception {
		long venue = ownedVenue("Season Opt-in Club");
		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(null, true)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"reopenOn\": \"next spring\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void staffMarksAndTheDailyViewKeepWorkingWhileClosed() throws Exception {
		long venue = ownedVenue("Season Staff Club");
		long set = insertSet(venue, 1);
		LocalDate day = today().plusDays(3);
		insertBooking("season-6", venue, set, "CONFIRMED", day);
		long marked = insertSet(venue, 2);

		mvc.perform(put(path(venue)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(closure(null, false)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.futureBookings").value(1));

		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", venue, marked)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"date\": \"" + day + "\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("STAFF_MARKED"));
		mvc.perform(get("/api/venues/{v}/bookings", venue).cookie(operatorSession)
						.param("date", day.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1));
		mvc.perform(get("/api/venues/{v}/availability", venue).cookie(operatorSession)
						.param("date", day.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].setId").value(marked))
				.andExpect(jsonPath("$[0].state").value("STAFF_MARKED"));
	}

	private long ownedVenue(String name) {
		long id = insertVenue(name);
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return id;
	}

	private long venueOwnedBySomeoneElse(String name) {
		long id = insertVenue(name);
		long other = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "season-other-" + id).query(Long.class).single();
		operators.add(other);
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", id).param("o", other).update();
		return id;
	}

	private long insertVenue(String name) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Season Beach', 'Season Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
		venues.add(id);
		return id;
	}

	private long insertSet(long venueId, int positionNo) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", positionNo).query(Long.class).single();
	}

	private void insertBooking(String code, long venueId, long setId, String status, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status)
				""")
				.param("code", code.toUpperCase().replace("-", "")).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.param("status", status).update();
	}
}
