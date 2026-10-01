package ai.riviera.platform;

import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.auth.application.CredentialStamp;
import ai.riviera.platform.auth.application.SessionPrincipal;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * An admin erasure deletes the subject's stored sessions in the same request (#1334), so no
 * {@code SPRING_SESSION} row keeps the erased email in {@code PRINCIPAL_NAME} until the session's next request
 * or its expiry. The rows are counted straight after the admin's call, the subject making no request at all.
 * Annotated like {@code AdminAuditTrailIT}, so the two share one cached context.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=admin-test-pw1")
@AutoConfigureMockMvc
class AdminErasureSessionRevocationIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "admin-test-pw1";
	private static final String ERASURE_PATH = "/api/admin/erasure";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	FindByIndexNameSessionRepository<? extends Session> sessions;
	@Autowired
	SsoAccountProvisioning ssoAccounts;

	@Test
	void anAdminErasureDeletesTheSubjectsSessionRowsAtOnce() throws Exception {
		String email = uniqueEmail();
		register(email);
		assertEquals(1, sessionRowsOf(email));

		adminErases(email.toUpperCase(Locale.ROOT));

		assertEquals(0, sessionRowsOf(email));
	}

	/** A session left by an erasure that revoked nothing is still reached: the revoke keys on the email, not the live account. */
	@Test
	void aRepeatedAdminErasureDeletesASessionTheFirstLeftBehind() throws Exception {
		String email = uniqueEmail();
		CustomerAccountId account = ssoAccounts.resolveOrCreate(SsoProvider.GOOGLE, "erasure-it-" + System.nanoTime(), email);
		var authorities = AuthorityUtils.createAuthorityList("ROLE_CUSTOMER");
		SessionCredentialStampIT.storedSession(sessions, UsernamePasswordAuthenticationToken.authenticated(
				SessionPrincipal.erased(email, authorities, CredentialStamp.customer(account, null)), null, authorities));
		jdbc.sql("UPDATE customer_account SET email = 'erased+' || id || '@erased.invalid', erased_at = NOW() WHERE id = :id")
				.param("id", account.value()).update();
		assertEquals(1, sessionRowsOf(email));

		adminErases(email);

		assertEquals(0, sessionRowsOf(email));
	}

	private void adminErases(String email) throws Exception {
		mvc.perform(post(ERASURE_PATH).cookie(SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("""
								{"email": "%s"}""".formatted(email)))
				.andExpect(status().isNoContent());
	}

	private long sessionRowsOf(String principalName) {
		return jdbc.sql("SELECT COUNT(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME = :p")
				.param("p", principalName).query(Long.class).single();
	}

	private void register(String email) throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email": "%s", "password": "passphrase-123"}""".formatted(email)))
				.andExpect(status().isCreated());
	}

	private static String uniqueEmail() {
		return "erasure-it-" + System.nanoTime() + "@example.com";
	}
}
