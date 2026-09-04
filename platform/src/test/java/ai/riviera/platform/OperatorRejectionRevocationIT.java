package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Session revocation around the PENDING side of the lifecycle. Once a PENDING operator can hold a
 * session, <strong>reject</strong> removes the right to it exactly as suspension does — so
 * it gets the same edge-orchestrated revocation bracket, and this class is its proof. It also pins
 * the adjacent regressions: approval keeps the live session (nothing is revoked on the way up), and
 * a session established while PENDING is still revoked by a later suspension.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class OperatorRejectionRevocationIT {

	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "bootstrap-pw";
	private static final String USERNAME = "reject-target";
	private static final String PASSWORD = "rejection-pw-12345";
	private static final String ME_PATH = "/api/auth/me";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", USERNAME).update();
	}

	@Test
	void rejectingAPendingOperatorKillsItsLiveSession() throws Exception {
		Cookie live = registerAndSignIn();
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isOk());

		adminPost("reject").andExpect(status().isNoContent());

		// The cookie is unchanged; the server-side session it names is gone.
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isUnauthorized());
		assertEquals("REJECTED", statusOfTarget());
	}

	@Test
	void aSessionEstablishedWhilePendingIsRevokedBySuspensionAfterApproval() throws Exception {
		Cookie live = registerAndSignIn();

		adminPost("approve").andExpect(status().isNoContent());
		// Approval revokes nothing: the PENDING-era session carries into the ACTIVE account.
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isOk());

		adminPost("suspend").andExpect(status().isNoContent());
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isUnauthorized());
	}

	/** Register (session-less 202) then sign in while PENDING — the phase-1 contract. */
	private Cookie registerAndSignIn() throws Exception {
		mvc.perform(post("/api/auth/operator/register").with(csrf())
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username": "%s", "password": "%s", "contactEmail": "reject@venue.example"}"""
								.formatted(USERNAME, PASSWORD)))
				.andExpect(status().isAccepted());
		return SessionLoginSupport.operatorSession(mvc, USERNAME, PASSWORD);
	}

	private ResultActions adminPost(String action) throws Exception {
		long id = jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", USERNAME).query(Long.class).single();
		Cookie admin = SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);
		return mvc.perform(post("/api/admin/operators/{id}/{action}", id, action)
				.cookie(admin).with(csrf()));
	}

	private String statusOfTarget() {
		return jdbc.sql("SELECT status FROM operator WHERE username = :u")
				.param("u", USERNAME).query(String.class).single();
	}
}
