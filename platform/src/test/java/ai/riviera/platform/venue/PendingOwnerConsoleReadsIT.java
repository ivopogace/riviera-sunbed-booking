package ai.riviera.platform.venue;

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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorProvisioning;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Approval gates tourist visibility, not console access (#1531, CONTEXT.md § Operator approval): a
 * {@code PENDING} operator's own beach-map read ({@code GET /api/venues/{id}/beach-map}) answers
 * while the tourist map read keeps hiding the venue, another operator is still {@code 403} before
 * any existence probe (invariant #13), and approval flips the tourist side only. Testcontainers
 * Postgres; skipped where Docker is absent (CI runs it).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class PendingOwnerConsoleReadsIT {

	private static final String PENDING_OWNER = "console-pending-owner";
	private static final String OTHER_OPERATOR = "console-other-op";
	private static final String OPERATOR_PW = "console-op-pw";
	private static final String BEACH_MAP = "/api/venues/{v}/beach-map";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	OperatorProvisioning provisioning;

	@Autowired
	PasswordEncoder encoder;

	private Cookie pendingOwnerSession;
	private long venue;

	@BeforeEach
	void aPendingOwnerCreatesAVenueWithOneSet() throws Exception {
		for (String username : List.of(PENDING_OWNER, OTHER_OPERATOR)) {
			jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
					+ "(SELECT id FROM operator WHERE username = :u)").param("u", username).update();
			jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
			provisioning.provision(username, encoder.encode(OPERATOR_PW));
		}
		jdbc.sql("UPDATE operator SET status = 'PENDING' WHERE username = :u").param("u", PENDING_OWNER).update();
		pendingOwnerSession = SessionLoginSupport.operatorSession(mvc, PENDING_OWNER, OPERATOR_PW);

		MvcResult created = mvc.perform(post("/api/venues").cookie(pendingOwnerSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"Pending Cove","beach":"KSAMIL","description":"on the shore",
								 "bookingMode":"INSTANT","payoutCurrency":"EUR","bookingCutoff":"18:00"}
								"""))
				.andExpect(status().isCreated())
				.andReturn();
		venue = Long.parseLong(com.jayway.jsonpath.JsonPath
				.read(created.getResponse().getContentAsString(), "$.id").toString());
		mvc.perform(post("/api/venues/{v}/sets", venue).cookie(pendingOwnerSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"rowLabel":"A","positionNo":1,"tier":"STANDARD","pool":"ONLINE",
								 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":1,"gridY":1}
								"""))
				.andExpect(status().isCreated());
	}

	@Test
	void pendingOwnerReadsItsOwnBeachMap() throws Exception {
		mvc.perform(get(BEACH_MAP, venue).cookie(pendingOwnerSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.map.id").value(venue))
				.andExpect(jsonPath("$.map.name").value("Pending Cove"))
				.andExpect(jsonPath("$.map.sets.length()").value(1))
				.andExpect(jsonPath("$.map.setVersion").isNumber())
				.andExpect(jsonPath("$.locks.length()").value(0));
	}

	@Test
	void touristReadsKeepTheFence() throws Exception {
		mvc.perform(get("/api/venues/{v}", venue))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/venues/{v}/availability-calendar", venue)
						.param("from", "2027-07-01").param("to", "2027-07-03"))
				.andExpect(status().isNotFound());
	}

	@Test
	void anotherOperatorIsDeniedBeforeExistence() throws Exception {
		Cookie other = SessionLoginSupport.operatorSession(mvc, OTHER_OPERATOR, OPERATOR_PW);

		mvc.perform(get(BEACH_MAP, venue).cookie(other))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
		mvc.perform(get(BEACH_MAP, Long.MAX_VALUE).cookie(other))
				.andExpect(status().isForbidden());
	}

	@Test
	void approvalShowsTheVenueToTouristsAndChangesNothingForTheOwner() throws Exception {
		jdbc.sql("UPDATE operator SET status = 'ACTIVE' WHERE username = :u").param("u", PENDING_OWNER).update();

		mvc.perform(get("/api/venues/{v}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets.length()").value(1));
		mvc.perform(get(BEACH_MAP, venue).cookie(pendingOwnerSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.map.sets.length()").value(1));
	}
}
