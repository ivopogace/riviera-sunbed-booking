package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin-issued operator reset end to end (#1737) against Testcontainers Postgres and the real Spring Session
 * JDBC store: an admin issues a link over HTTP, the operator redeems it anonymously, and every session the operator
 * held is gone. Passwords are checked with {@code matches(raw, storedHash)}, never re-encoded (bcrypt re-salts).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class OperatorPasswordResetIT {

	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "test-operator-pw";
	private static final String TARGET = "reset-target";
	private static final String OLD_PASSWORD = "reset-old-pw-12345";
	private static final String NEW_PASSWORD = "reset-new-pw-67890";
	private static final String ME_PATH = "/api/auth/me";
	private static final String ISSUE_PATH = "/api/admin/operators/{id}/reset-link";
	private static final String REDEEM_PATH = "/api/auth/operator/reset-password";
	private static final String INVALID_TOKEN = "INVALID_OR_EXPIRED_TOKEN";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;
	@Autowired
	Clock clock;

	private OperatorId targetId;

	@BeforeEach
	void provisionTarget() {
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", TARGET).update();
		jdbc.sql("DELETE FROM admin_audit_record WHERE path LIKE '/api/admin/operators/%/reset-link'").update();
		targetId = provisioning.provision(TARGET, encoder.encode(OLD_PASSWORD));
	}

	@Test
	void resetSetsTheNewPasswordAndRevokesEverySession() throws Exception {
		Cookie laptop = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		Cookie phone = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		mvc.perform(get(ME_PATH).cookie(laptop)).andExpect(status().isOk());

		String token = issue(targetId);
		redeem(token, NEW_PASSWORD).andExpect(status().isNoContent());

		assertTrue(encoder.matches(NEW_PASSWORD, storedHash()));
		assertFalse(encoder.matches(OLD_PASSWORD, storedHash()));
		mvc.perform(get(ME_PATH).cookie(laptop)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(phone)).andExpect(status().isUnauthorized());
		assertEquals(0, sessionsOf(TARGET));
		mvc.perform(get(ME_PATH).cookie(SessionLoginSupport.operatorSession(mvc, TARGET, NEW_PASSWORD)))
				.andExpect(status().isOk());
	}

	@Test
	void aSecondIssueRetiresTheFirstLink() throws Exception {
		String first = issue(targetId);
		String second = issue(targetId);

		redeem(first, NEW_PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(INVALID_TOKEN));
		redeem(second, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void usedExpiredAndUnknownTokensAreRefusedIdentically() throws Exception {
		String used = issue(targetId);
		redeem(used, NEW_PASSWORD).andExpect(status().isNoContent());
		String expired = issue(targetId);
		jdbc.sql("UPDATE operator_password_reset_token SET expires_at = :lapsed WHERE token_hash = :h")
				.param("lapsed", Timestamp.from(clock.instant().minus(Duration.ofMinutes(1))))
				.param("h", sha256(expired)).update();
		String hashBefore = storedHash();

		List<String> bodies = List.of(
				redeem(used, "yet-another-pw-1").andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString(),
				redeem(expired, "yet-another-pw-2").andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString(),
				redeem("never-issued-token", "yet-another-pw-3").andExpect(status().isBadRequest()).andReturn().getResponse()
						.getContentAsString());

		assertEquals(1, bodies.stream().distinct().count(), "one indistinguishable answer");
		assertEquals(INVALID_TOKEN, JsonPath.read(bodies.getFirst(), "$.code"));
		assertEquals(hashBefore, storedHash());
	}

	@Test
	void aSuspendedOperatorGetsNoLinkAndAPreSuspensionLinkStaysDead() throws Exception {
		String preSuspension = issue(targetId);
		mvc.perform(post("/api/admin/operators/{id}/suspend", targetId.value()).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(post(ISSUE_PATH, targetId.value()).cookie(adminSession()).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("WRONG_STATUS"));
		redeem(preSuspension, NEW_PASSWORD).andExpect(status().isBadRequest());

		mvc.perform(post("/api/admin/operators/{id}/reinstate", targetId.value()).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());
		redeem(preSuspension, NEW_PASSWORD).andExpect(status().isBadRequest());
		assertTrue(encoder.matches(OLD_PASSWORD, storedHash()));
	}

	@Test
	void theBootstrapAdminCannotBeIssuedALink() throws Exception {
		OperatorId bootstrap = new OperatorId(jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", BOOTSTRAP_ADMIN).query(Long.class).single());

		mvc.perform(post(ISSUE_PATH, bootstrap.value()).cookie(adminSession()).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOTSTRAP_CREDENTIAL_MANAGED"));
	}

	@Test
	void onlyTheHashIsStoredAndTheAuditRowNamesTheTarget(CapturedOutput output) throws Exception {
		String token = issue(targetId);

		List<String> storedHashes = jdbc.sql("SELECT token_hash FROM operator_password_reset_token WHERE operator_id = :id")
				.param("id", targetId.value()).query(String.class).list();
		assertEquals(List.of(sha256(token)), storedHashes);
		List<String> auditPaths = jdbc.sql("SELECT path FROM admin_audit_record WHERE path LIKE '%/reset-link'")
				.query(String.class).list();
		assertEquals(List.of("/api/admin/operators/" + targetId.value() + "/reset-link"), auditPaths);
		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM admin_audit_record WHERE path LIKE :t OR reason LIKE :t")
				.param("t", "%" + token + "%").query(Integer.class).single());

		redeem(token, NEW_PASSWORD).andExpect(status().isNoContent());
		assertFalse(output.getAll().contains(token), "the raw token never reaches a log");
	}

	private String issue(OperatorId id) throws Exception {
		String body = mvc.perform(post(ISSUE_PATH, id.value()).cookie(adminSession()).with(csrf()))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.token");
	}

	private ResultActions redeem(String token, String newPassword) throws Exception {
		return mvc.perform(post(REDEEM_PATH)
				.with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"" + token + "\",\"newPassword\":\"" + newPassword + "\"}"));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);
	}

	private String storedHash() {
		return jdbc.sql("SELECT password_hash FROM operator WHERE id = :id")
				.param("id", targetId.value()).query(String.class).single();
	}

	private int sessionsOf(String principal) {
		return jdbc.sql("SELECT COUNT(*) FROM spring_session WHERE principal_name = :p")
				.param("p", principal).query(Integer.class).single();
	}

	private static String sha256(String raw) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
	}
}
