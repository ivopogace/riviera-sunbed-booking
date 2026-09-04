package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.CurrentOperator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The same-day Request-to-Book lifecycle end-to-end (issue #792, AC-5): at a {@code 23:59}-close
 * venue a tourist requests a set for <strong>today</strong>, the venue accepts, and — on the stub
 * profile's synchronous collection — the booking reaches {@code CONFIRMED} on the service day
 * itself. The {@code 23:59} close is the R-4 boundary-venue trick: the request leg stays inside
 * the sales window at any run hour except the day's final minutes, which an assumption skips —
 * there "today" would close (or roll over) mid-test and the run would flake, not fail honestly.
 * Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-sameday-pw")
@AutoConfigureMockMvc
class SameDayRequestLifecycleIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	/** Mock only the identity seam (as in RequestAcceptPayIT); ownership + flow are real. */
	@MockitoBean
	CurrentOperator currentOperator;

	private long venueId;
	private long setId;
	private Cookie operatorSession;

	@BeforeEach
	void seedLateCloseRequestVenueWithOwner() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, "operator", "test-sameday-pw");
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   sales_close)
				VALUES ('Same-Day Club', 'Late Beach', 'Late Region', 'REQUEST', 1500, 'EUR', '23:59')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long operator = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES ('sameday-op-' || :v, 'ACTIVE') RETURNING id")
				.param("v", venueId).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator).update();
		when(currentOperator.require(any())).thenReturn(new OperatorId(operator));
	}

	@Test
	void sameDayRequestAcceptPayConfirms() throws Exception {
		// The one non-deterministic window: past 23:58 Tirane the 23:59 close (or midnight) crosses mid-test.
		Assumptions.assumeTrue(LocalTime.now(TIRANE).isBefore(LocalTime.of(23, 58)),
				"skipped in the day's final minutes — today would close or roll over mid-test");
		LocalDate today = LocalDate.now(TIRANE);
		String body = """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "sameday@e.com", "fullName": "Same Day Guest", "phone": "+355600"}}
				""".formatted(setId, today);

		String response = mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"))
				.andExpect(jsonPath("$.requestExpiresAt").isNotEmpty())
				.andReturn().getResponse().getContentAsString();
		String code = JsonPath.read(response, "$.code");
		long bookingId = jdbc.sql("SELECT id FROM booking WHERE code = :code")
				.param("code", code).query(Long.class).single();

		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueId, bookingId)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CONFIRMED"));

		assertEquals("CONFIRMED", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single(),
				"a same-day request at a 23:59-close venue confirms on the day itself (AC-5)");
	}
}
