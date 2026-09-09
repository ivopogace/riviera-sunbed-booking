package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The reserve fence for a venue closed for the season, at {@code POST /api/bookings}: a closed
 * date is refused {@code 422 VENUE_CLOSED} before any claim, on an Instant-Book venue and a
 * Request-to-Book one alike; with the opt-in, a date on or after the reopen day reserves normally
 * while one before it is still refused; a hidden venue keeps answering {@code NO_SUCH_SET}. Real
 * clock: every date lies a year out, so only the closure decides.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@AutoConfigureMockMvc
class SeasonClosureReserveIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();

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
	}

	private static LocalDate reopen() {
		return LocalDate.now(TIRANE).plusYears(1);
	}

	private String body(long setId, LocalDate date) {
		return """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "season-reserve@example.com", "fullName": "Season Guest", "phone": "+355699"}}
				""".formatted(setId, date);
	}

	private org.springframework.test.web.servlet.ResultActions reserve(long setId, LocalDate date) throws Exception {
		return mvc.perform(post("/api/bookings")
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body(setId, date)));
	}

	@Test
	void aClosedVenueRefusesEveryDateBeforeAnyClaim() throws Exception {
		long set = onlineSetOf(closedVenue("Season Reserve Closed IT", "INSTANT", reopen(), false));

		reserve(set, reopen().plusDays(30))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("VENUE_CLOSED"))
				.andExpect(jsonPath("$.detail").value("The venue is closed for the season on this date."));
		Integer claims = jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", set).query(Integer.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(0, claims, "the fence runs before the claim");
	}

	@Test
	void aClosedRequestVenueIsRefusedTheSameWay() throws Exception {
		long set = onlineSetOf(closedVenue("Season Reserve Request IT", "REQUEST", null, false));

		reserve(set, reopen().plusDays(30))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VENUE_CLOSED"));
	}

	@Test
	void theOptInReservesDatesOnOrAfterTheReopenDayOnly() throws Exception {
		long set = onlineSetOf(closedVenue("Season Reserve Ahead IT", "INSTANT", reopen(), true));

		reserve(set, reopen().minusDays(1))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VENUE_CLOSED"));
		reserve(set, reopen())
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("CONFIRMED"));
	}

	@Test
	void aHiddenClosedVenueStillReadsAsNoSuchSet() throws Exception {
		long venue = closedVenue("Season Reserve Hidden IT", "INSTANT", null, false);
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venue).update();

		reserve(onlineSetOf(venue), reopen().plusDays(30))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	private long closedVenue(String name, String mode, LocalDate reopenOn, boolean advanceSales) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   closed_at, reopen_on, advance_sales)
				VALUES (:name, 'Season reserve beach IT', 'Season region IT', :mode, 1500, 'EUR',
				        :closedAt, :reopenOn, :advanceSales)
				RETURNING id
				""")
				.param("name", name).param("mode", mode)
				.param("closedAt", java.time.Instant.now().atOffset(ZoneOffset.UTC))
				.param("reopenOn", reopenOn).param("advanceSales", advanceSales)
				.query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				""").param("venue", id).update();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		venues.add(id);
		return id;
	}

	private long onlineSetOf(long venue) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venue).query(Long.class).single();
	}
}
