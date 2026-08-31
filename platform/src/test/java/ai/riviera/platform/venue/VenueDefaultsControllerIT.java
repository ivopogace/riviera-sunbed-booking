package ai.riviera.platform.venue;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The operator-facing venue-creation defaults read (issue #692): serves the same configured
 * platform commission the create path stamps, so the form's disclosure can never drift from the
 * stamped rate. Gated to role OPERATOR — the path is deliberately outside the {@code long}-bound
 * {@code /api/venues/{venueId}} space and outside the public tourist reads.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"riviera.operator.password=defaults-test-pw",
		"riviera.venue.creation.default-commission-bps=650"
})
@AutoConfigureMockMvc
class VenueDefaultsControllerIT {

	@Autowired
	MockMvc mvc;

	@Test
	void servesConfiguredDefaultToOperators() throws Exception {
		// A non-500 override proves the endpoint reads configuration, not a literal (AC-5).
		Cookie session = SessionLoginSupport.operatorSession(mvc, "operator", "defaults-test-pw");

		mvc.perform(get("/api/venue-defaults").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.commissionBps").value(650));
	}

	@Test
	void rejectsAnonymous() throws Exception {
		mvc.perform(get("/api/venue-defaults"))
				.andExpect(status().isUnauthorized());
	}
}
