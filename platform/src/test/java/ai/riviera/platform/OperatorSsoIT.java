package ai.riviera.platform;

import java.net.URI;
import java.util.UUID;

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
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Operator SSO end to end against the mock IdP, Testcontainers Postgres and the real Spring Session store (#276):
 * link-only (a password-proven link from a signed-in operator, never the bootstrap admin), a non-enumerating sign-in
 * that never creates a row or a session, the audience fixed by the session-held record, and an SSO session ending on
 * suspend, unlink and reset. The mock IdP asserts one Google identity for every audience.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class OperatorSsoIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String ME_PATH = "/api/auth/me";
	private static final String SSO_PATH = "/api/auth/operator/sso";
	private static final String PASSWORD = "sso-operator-pw-12345";
	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "test-operator-pw";
	private static final String GOOGLE_SUBJECT = "google-mock-subject-001";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	private String username;
	private OperatorId operatorId;

	@BeforeEach
	void provisionOperator() {
		jdbc.sql("DELETE FROM operator_sso_identity WHERE subject = :s").param("s", GOOGLE_SUBJECT).update();
		username = "sso-op-" + UUID.randomUUID().toString().substring(0, 8);
		operatorId = provisioning.provision(username, encoder.encode(PASSWORD));
	}

	@Test
	void anUnknownIdentityCreatesNoRowAndNoSession() throws Exception {
		int operatorsBefore = count("SELECT count(*) FROM operator");

		SsoResult result = operatorSignIn("google");

		assertEquals("/account/sign-in?audience=operator&sso=failed", result.location());
		mvc.perform(get(ME_PATH).cookie(result.session())).andExpect(status().isUnauthorized());
		assertEquals(operatorsBefore, count("SELECT count(*) FROM operator"));
		assertEquals(0, count("SELECT count(*) FROM operator_sso_identity WHERE subject = '" + GOOGLE_SUBJECT + "'"));
	}

	@Test
	void suspendedAndRejectedGetTheUnknownAnswer() throws Exception {
		String unknown = operatorSignIn("google").location();
		linkGoogle(SessionLoginSupport.operatorSession(mvc, username, PASSWORD)).andExpect(redirectedUrl(
				"/account/operator-password?sso=linked"));

		for (String status : new String[] {"SUSPENDED", "REJECTED"}) {
			jdbc.sql("UPDATE operator SET status = :s WHERE id = :id").param("s", status)
					.param("id", operatorId.value()).update();
			SsoResult result = operatorSignIn("google");

			assertEquals(unknown, result.location(), status + " answers like an unknown identity");
			mvc.perform(get(ME_PATH).cookie(result.session())).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void aLinkedIdentitySignsInAsItsOperator() throws Exception {
		jdbc.sql("UPDATE operator SET status = 'PENDING' WHERE id = :id").param("id", operatorId.value()).update();
		linkGoogle(SessionLoginSupport.operatorSession(mvc, username, PASSWORD))
				.andExpect(redirectedUrl("/account/operator-password?sso=linked"));

		SsoResult signedIn = operatorSignIn("google");

		assertEquals("/operator", signedIn.location());
		mvc.perform(get(ME_PATH).cookie(signedIn.session()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value(username))
				.andExpect(jsonPath("$.principalType").value("OPERATOR"));
		mvc.perform(get(SSO_PATH).cookie(signedIn.session()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].provider").value("google"));
	}

	@Test
	void linkingWithoutTheCurrentPasswordIsRefused() throws Exception {
		Cookie session = SessionLoginSupport.operatorSession(mvc, username, PASSWORD);

		startLink(session, "{}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"));
		startLink(session, "{\"currentPassword\":\"not-the-password\"}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
		mvc.perform(post(SSO_PATH + "/google/link").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(linkBody()).header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void theBootstrapAdminCannotLink() throws Exception {
		Cookie admin = SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);

		startLink(admin, "{\"currentPassword\":\"" + BOOTSTRAP_PASSWORD + "\"}")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOTSTRAP_CREDENTIAL_MANAGED"));
	}

	@Test
	void aLinkCallbackOnASessionNowHoldingAnotherOperatorLinksNothing() throws Exception {
		String other = "sso-other-" + UUID.randomUUID().toString().substring(0, 8);
		provisioning.provision(other, encoder.encode(PASSWORD));
		Cookie session = SessionLoginSupport.operatorSession(mvc, username, PASSWORD);
		String ip = SessionLoginSupport.uniqueClientIp();
		URI idp = authorizeUrlOf(startLink(session, linkBody()).andExpect(status().isOk()).andReturn());
		Cookie switched = mvc.perform(SessionLoginSupport.loginRequest("/api/auth/operator/login",
				"{\"username\":\"" + other + "\",\"password\":\"" + PASSWORD + "\"}").cookie(session).with(csrf()))
				.andExpect(status().isOk()).andReturn().getResponse().getCookie(SESSION_COOKIE);

		mvc.perform(MockIdp.callback(mvc, idp, ip).cookie(switched))
				.andExpect(redirectedUrl("/account/operator-password?sso=link-failed"));
		assertEquals(0, count("SELECT count(*) FROM operator_sso_identity WHERE subject = '" + GOOGLE_SUBJECT + "'"));
	}

	@Test
	void aLinkCallbackOnAStaleSessionLinksNothing() throws Exception {
		Cookie session = SessionLoginSupport.operatorSession(mvc, username, PASSWORD);
		String ip = SessionLoginSupport.uniqueClientIp();
		URI idp = authorizeUrlOf(startLink(session, linkBody()).andExpect(status().isOk()).andReturn());
		jdbc.sql("UPDATE operator SET password_hash = :h WHERE id = :id").param("h", encoder.encode("rotated-pw-98765"))
				.param("id", operatorId.value()).update();

		mvc.perform(MockIdp.callback(mvc, idp, ip).cookie(session)).andExpect(status().isBadRequest());
		assertEquals(0, linkRows());
	}

	@Test
	void anIdentityLinkedToAnotherOperatorIsTheGenericLinkFailure() throws Exception {
		linkGoogle(SessionLoginSupport.operatorSession(mvc, username, PASSWORD));
		String other = "sso-other-" + UUID.randomUUID().toString().substring(0, 8);
		provisioning.provision(other, encoder.encode(PASSWORD));

		linkGoogle(SessionLoginSupport.operatorSession(mvc, other, PASSWORD))
				.andExpect(redirectedUrl("/account/operator-password?sso=link-failed"));
		assertEquals(operatorId.value(), jdbc.sql("SELECT operator_id FROM operator_sso_identity WHERE subject = :s")
				.param("s", GOOGLE_SUBJECT).query(Long.class).single());
	}

	@Test
	void aCustomerStateNeverYieldsAnOperatorSession() throws Exception {
		linkGoogle(SessionLoginSupport.operatorSession(mvc, username, PASSWORD));
		String ip = SessionLoginSupport.uniqueClientIp();
		MvcResult authorize = mvc.perform(get("/api/auth/sso/google/authorize").header("X-Forwarded-For", ip))
				.andExpect(status().isFound()).andReturn();
		Cookie pending = authorize.getResponse().getCookie(SESSION_COOKIE);

		MvcResult callback = mvc.perform(MockIdp.callback(mvc, authorize, ip).cookie(pending))
				.andExpect(redirectedUrl("/")).andReturn();

		mvc.perform(get(ME_PATH).cookie(sessionAfter(callback, pending)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"));
	}

	@Test
	void anOperatorStateNeverYieldsACustomerSession() throws Exception {
		int customerAccountsBefore = count("SELECT count(*) FROM customer_account");

		SsoResult result = operatorSignIn("google");

		assertEquals(customerAccountsBefore, count("SELECT count(*) FROM customer_account"));
		mvc.perform(get(ME_PATH).cookie(result.session())).andExpect(status().isUnauthorized());
	}

	@Test
	void anSsoSessionDiesOnSuspend() throws Exception {
		linkGoogle(SessionLoginSupport.operatorSession(mvc, username, PASSWORD));
		Cookie sso = operatorSignIn("google").session();

		mvc.perform(post("/api/admin/operators/{id}/suspend", operatorId.value()).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get(ME_PATH).cookie(sso)).andExpect(status().isUnauthorized());
		assertEquals(1, linkRows(), "a suspension keeps the link");
	}

	@Test
	void anSsoSessionDiesOnUnlink() throws Exception {
		Cookie password = SessionLoginSupport.operatorSession(mvc, username, PASSWORD);
		linkGoogle(password);
		Cookie sso = operatorSignIn("google").session();

		mvc.perform(delete(SSO_PATH + "/google").cookie(password).with(csrf())).andExpect(status().isNoContent());

		mvc.perform(get(ME_PATH).cookie(sso)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(password)).andExpect(status().isOk());
		assertEquals(0, linkRows());
		assertEquals("/account/sign-in?audience=operator&sso=failed", operatorSignIn("google").location());
	}

	@Test
	void anSsoSessionDiesOnReset() throws Exception {
		linkGoogle(SessionLoginSupport.operatorSession(mvc, username, PASSWORD));
		Cookie sso = operatorSignIn("google").session();
		String token = JsonPath.read(mvc.perform(post("/api/admin/operators/{id}/reset-link", operatorId.value())
				.cookie(adminSession()).with(csrf())).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString(), "$.token");

		mvc.perform(post("/api/auth/operator/reset-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"" + token + "\",\"newPassword\":\"after-reset-pw-24680\"}"))
				.andExpect(status().isNoContent());

		mvc.perform(get(ME_PATH).cookie(sso)).andExpect(status().isUnauthorized());
		assertEquals(0, linkRows(), "a reset drops every link");
	}

	/** Run the operator sign-in round trip on a fresh IP; the redirect and the session the browser now holds. */
	private SsoResult operatorSignIn(String provider) throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		MvcResult authorize = mvc.perform(get(SSO_PATH + "/{provider}/authorize", provider)
				.header("X-Forwarded-For", ip)).andExpect(status().isFound()).andReturn();
		Cookie pending = authorize.getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(pending, "authorize must start a session to hold the round trip");
		MvcResult callback = mvc.perform(MockIdp.callback(mvc, authorize, ip).cookie(pending))
				.andExpect(status().isFound()).andReturn();
		return new SsoResult(callback.getResponse().getRedirectedUrl(), sessionAfter(callback, pending));
	}

	private ResultActions linkGoogle(Cookie session) throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		URI idp = authorizeUrlOf(startLink(session, linkBody()).andExpect(status().isOk()).andReturn());
		return mvc.perform(MockIdp.callback(mvc, idp, ip).cookie(session)).andExpect(status().isFound());
	}

	private ResultActions startLink(Cookie session, String body) throws Exception {
		return mvc.perform(post(SSO_PATH + "/google/link").cookie(session).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private static String linkBody() {
		return "{\"currentPassword\":\"" + PASSWORD + "\"}";
	}

	private static URI authorizeUrlOf(MvcResult start) throws Exception {
		return URI.create(JsonPath.read(start.getResponse().getContentAsString(), "$.authorizeUrl"));
	}

	private static Cookie sessionAfter(MvcResult callback, Cookie pending) {
		Cookie rotated = callback.getResponse().getCookie(SESSION_COOKIE);
		return rotated != null ? rotated : pending;
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);
	}

	private int linkRows() {
		return count("SELECT count(*) FROM operator_sso_identity WHERE operator_id = " + operatorId.value());
	}

	private int count(String sql) {
		return jdbc.sql(sql).query(Integer.class).single();
	}

	private record SsoResult(String location, Cookie session) {
	}
}
