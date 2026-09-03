package ai.riviera.platform;

import org.hamcrest.Matchers;
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
import org.springframework.test.web.servlet.ResultActions;

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
 * The admin approval surface (design D-5). The demoted bootstrap operator is the platform ADMIN
 * (is_admin via V29); it lists pending registrations and approves/rejects them under the role-gated,
 * NOT-venue-scoped {@code /api/admin/operators/**} surface (invariant #13's admin exemption). Approval
 * flips PENDING→ACTIVE (since #694 that gates tourist visibility — a PENDING operator already signs
 * in); reject flips PENDING→REJECTED and blocks login; a plain
 * OPERATOR (no ADMIN authority) is {@code 403}. Real Postgres via Testcontainers (full Flyway chain incl.
 * V29); each login carries a unique {@code X-Forwarded-For} so suite traffic never shares a rate bucket.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=admin-test-pw1")
@AutoConfigureMockMvc
class OperatorApprovalIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "admin-test-pw1";
	private static final String PENDING_PW = "pending-op-pw-123";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username LIKE 'appr-%')").update();
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'appr-%'").update();
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	/** Self-register a PENDING operator via the public endpoint and return its id. */
	private long registerPending(String username) throws Exception {
		mvc.perform(post("/api/auth/operator/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username":"%s","password":"%s","contactEmail":"%s@venue.example"}"""
						.formatted(username, PENDING_PW, username)))
				.andExpect(status().isAccepted());
		return jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", username).query(Long.class).single();
	}

	private ResultActions login(String username, String password) throws Exception {
		return mvc.perform(SessionLoginSupport.loginRequest("/api/auth/operator/login",
				"""
						{"username":"%s","password":"%s"}""".formatted(username, password)).with(csrf()));
	}

	@Test
	void approveKeepsLoginWorkingOnBothSides() throws Exception {
		long id = registerPending("appr-alice");
		login("appr-alice", PENDING_PW).andExpect(status().isOk()); // PENDING already signs in (#694)

		mvc.perform(post("/api/admin/operators/{id}/approve", id).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		login("appr-alice", PENDING_PW).andExpect(status().isOk()); // ACTIVE → login still works
	}

	@Test
	void rejectDisablesLogin() throws Exception {
		long id = registerPending("appr-bob");

		mvc.perform(post("/api/admin/operators/{id}/reject", id).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		login("appr-bob", PENDING_PW).andExpect(status().isUnauthorized());
		String status = jdbc.sql("SELECT status FROM operator WHERE id = :id")
				.param("id", id).query(String.class).single();
		assertEquals("REJECTED", status, "a rejected registration is terminal");
	}

	@Test
	void approveNonPendingConflictsAndUnknownIsNotFound() throws Exception {
		OperatorId active = provisioning.provision("appr-carol", encoder.encode("carol-store-pw1"));
		Cookie admin = adminSession();

		// An already-ACTIVE operator is not awaiting approval → 409 NOT_PENDING.
		mvc.perform(post("/api/admin/operators/{id}/approve", active.value()).cookie(admin).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("NOT_PENDING"));

		// No such operator → 404 NO_SUCH_OPERATOR.
		mvc.perform(post("/api/admin/operators/{id}/approve", 987_654L).cookie(admin).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_OPERATOR"));
	}

	@Test
	void plainOperatorIsForbiddenFromAdminSurface() throws Exception {
		// A plain ACTIVE operator (is_admin FALSE) has ROLE_OPERATOR but not ROLE_ADMIN → 403 on the
		// role-gated admin surface (authenticated, wrong role) — AC-5.
		provisioning.provision("appr-dave", encoder.encode("dave-store-pw-1"));
		Cookie plain = SessionLoginSupport.operatorSession(mvc, "appr-dave", "dave-store-pw-1");

		mvc.perform(get("/api/admin/operators").cookie(plain))
				.andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/operators/{id}/approve", 1).cookie(plain).with(csrf()))
				.andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/operators/{id}/reject", 1).cookie(plain).with(csrf()))
				.andExpect(status().isForbidden());

		// The suspend/reinstate surfaces are gated identically — a role-gated endpoint added without this
		// assertion is exactly how one silently ships open.
		mvc.perform(get("/api/admin/operators/accounts").cookie(plain))
				.andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/operators/{id}/suspend", 1).cookie(plain).with(csrf()))
				.andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/operators/{id}/reinstate", 1).cookie(plain).with(csrf()))
				.andExpect(status().isForbidden());
	}

	@Test
	void anonymousIsUnauthorizedOnTheSuspensionSurface() throws Exception {
		// No session at all → 401 from the entry point, before any role check.
		mvc.perform(get("/api/admin/operators/accounts")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/admin/operators/{id}/suspend", 1).with(csrf()))
				.andExpect(status().isUnauthorized());
		mvc.perform(post("/api/admin/operators/{id}/reinstate", 1).with(csrf()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void adminListsPendingWithContactEmail() throws Exception {
		registerPending("appr-erin");

		mvc.perform(get("/api/admin/operators").cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.username == 'appr-erin')].contactEmail")
						.value(Matchers.contains("appr-erin@venue.example")));
	}
}
