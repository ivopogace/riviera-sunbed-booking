package ai.riviera.platform;

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

import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The session-revocation proof (AC-1, AC-2) against Testcontainers Postgres and the
 * real Spring Session JDBC store.
 *
 * <p>The revoke is one of two defences: the per-request credential stamp ({@code SessionCredentialStampIT},
 * {@code SessionCredentialRaceIT}) also ends a suspended operator's session, including one saved after the revoke.
 *
 * <p>{@link #aRevokedCookieCannotCreateAVenue} pins the sharpest role-gated surface that is not venue-scoped,
 * {@code POST /api/venues}, and shows the {@code 401} is the revocation by first creating a venue on the live session.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class OperatorSuspensionRevocationIT {

	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "bootstrap-pw";
	private static final String TARGET = "revoke-target";
	private static final String TARGET_PASSWORD = "revoke-pw-12345";
	private static final String ME_PATH = "/api/auth/me";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	private OperatorId targetId;

	@BeforeEach
	void provisionTarget() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", TARGET).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", TARGET).update();
		targetId = provisioning.provision(TARGET, encoder.encode(TARGET_PASSWORD));
	}

	@Test
	void suspendingAnOperatorKillsItsLiveSession() throws Exception {
		Cookie live = SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD);
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isOk());

		suspend(targetId).andExpect(status().isNoContent());

		// The cookie is unchanged; the server-side session it names is gone.
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isUnauthorized());
		assertEquals("SUSPENDED", statusOf(targetId));
	}

	@Test
	void aRevokedCookieCannotCreateAVenue() throws Exception {
		Cookie live = SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD);

		// Baseline: accepted while live, so the later 401 can only be the revocation.
		mvc.perform(createVenue("Pre-Suspension Venue").cookie(live).with(csrf()))
				.andExpect(status().isCreated());

		suspend(targetId).andExpect(status().isNoContent());

		mvc.perform(createVenue("Post-Suspension Venue").cookie(live).with(csrf()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void reinstatingLetsTheOperatorSignInAgainButDoesNotResurrectTheOldSession() throws Exception {
		Cookie live = SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD);
		suspend(targetId).andExpect(status().isNoContent());

		mvc.perform(post("/api/admin/operators/{id}/reinstate", targetId.value())
				.cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		// Reinstate restores the ACCOUNT, never the revoked session — the old cookie stays dead.
		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD)))
				.andExpect(status().isOk());
	}

	@Test
	void suspendingOneOperatorLeavesAnotherOperatorsSessionAlone() throws Exception {
		Cookie bystander = adminSession();
		Cookie live = SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD);

		suspend(targetId).andExpect(status().isNoContent());

		mvc.perform(get(ME_PATH).cookie(live)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(bystander)).andExpect(status().isOk());
	}

	@Test
	void anAdminCannotSuspendItself() throws Exception {
		OperatorId adminId = new OperatorId(jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", BOOTSTRAP_ADMIN).query(Long.class).single());
		Cookie admin = adminSession();

		mvc.perform(post("/api/admin/operators/{id}/suspend", adminId.value()).cookie(admin).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CANNOT_SUSPEND_SELF"));

		// Neither the account nor the calling session may be touched.
		assertEquals("ACTIVE", statusOf(adminId));
		mvc.perform(get(ME_PATH).cookie(admin)).andExpect(status().isOk());
	}

	private org.springframework.test.web.servlet.ResultActions suspend(OperatorId id) throws Exception {
		return mvc.perform(post("/api/admin/operators/{id}/suspend", id.value())
				.cookie(adminSession()).with(csrf()));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);
	}

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder createVenue(String name) {
		return post("/api/venues")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name": "%s", "beach":"KSAMIL",
						 "bookingMode": "INSTANT", "payoutCurrency": "EUR"}"""
						.formatted(name));
	}

	private String statusOf(OperatorId id) {
		return jdbc.sql("SELECT status FROM operator WHERE id = :id")
				.param("id", id.value())
				.query(String.class)
				.single();
	}
}
