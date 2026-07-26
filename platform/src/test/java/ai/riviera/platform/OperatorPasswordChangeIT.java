package ai.riviera.platform;

import java.time.Instant;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AC-7 for #326: the operator's self-service password change, proved against Testcontainers Postgres
 * and the <strong>real</strong> {@code AuthenticationManager} — the new credential authenticates and
 * the old one stops doing so.
 *
 * <p><strong>Why the slice's {@code @WebMvcTest} is not enough.</strong> That test mocks
 * {@code OperatorProvisioning}, so it can only assert that a hash was <em>handed over</em>; whether the
 * hash it handed over is one the login path will later accept is exactly the question a mock cannot
 * answer. That gap is where R-1 lives: bcrypt re-salts, so an {@code encode(input).equals(stored)}
 * comparison is always false — a defect that shipped twice already (#128 rotate-detection, S8
 * set-password). Here the whole loop is real: real encoder, real {@code operator} row, real login.
 *
 * <p>Every call to the change endpoint presents a UNIQUE {@code X-Forwarded-For}: #326 put the path on
 * its own per-IP budget, and the limiter lives in the CACHED Spring context, so a shared loopback key
 * would recreate the #127 full-suite 429 wall that scoped runs cannot see.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class OperatorPasswordChangeIT {

	private static final String CHANGE_PASSWORD_PATH = "/api/auth/operator/password";
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	private static final String ME_PATH = "/api/auth/me";
	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "bootstrap-pw";
	private static final String TARGET = "pwchange-target";
	private static final String OLD_PASSWORD = "old-operator-pw";
	private static final String NEW_PASSWORD = "new-operator-pw";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;
	@Autowired
	FindByIndexNameSessionRepository<? extends Session> sessions;

	@BeforeEach
	void provisionTarget() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", TARGET).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", TARGET).update();
		// Sessions outlive the operator row, and the tests below expect only their own in the index.
		jdbc.sql("DELETE FROM spring_session WHERE principal_name = :u").param("u", TARGET).update();
		provisioning.provision(TARGET, encoder.encode(OLD_PASSWORD));
	}

	@Test
	void newCredentialAuthenticatesAndOldDoesNot() throws Exception {
		Cookie session = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);

		mvc.perform(changePassword(session, OLD_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isNoContent());

		login(TARGET, OLD_PASSWORD).andExpect(status().isUnauthorized());
		login(TARGET, NEW_PASSWORD).andExpect(status().isOk());
	}

	/**
	 * The AC-1 half a controller test can only assert through a mock: the operator's OTHER sessions are
	 * really gone from {@code SPRING_SESSION}, and the session that did the change really survives —
	 * signing you out of the device you are actively using is bad UX and is not what the guidance asks.
	 *
	 * <p>"Survives" is asserted through the <strong>re-issued</strong> cookie since #344, because the
	 * calling session is now rotated: the session lives on, but under a new id. A browser applies the
	 * replacement {@code Set-Cookie} automatically and notices nothing; MockMvc does not, so the test has
	 * to carry it forward by hand. That the pre-change value is dead is
	 * {@link #theSurvivingSessionIsRotatedSoTheOldCookieValueDies}'s assertion, not this one's.
	 */
	@Test
	void theChangeRevokesEveryOtherSessionButKeepsTheCallingOne() throws Exception {
		Cookie otherDevice = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		Cookie thisDevice = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		mvc.perform(get(ME_PATH).cookie(otherDevice)).andExpect(status().isOk());

		Cookie thisDeviceReissued = mvc.perform(changePassword(thisDevice, OLD_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		mvc.perform(get(ME_PATH).cookie(otherDevice)).andExpect(status().isUnauthorized());
		assertNotNull(thisDeviceReissued, "the calling session must be re-issued, not dropped");
		mvc.perform(get(ME_PATH).cookie(thisDeviceReissued)).andExpect(status().isOk());
	}

	/**
	 * AC-1 for #344, and the half no mock can reach: the calling session survives the change but does so
	 * under a <strong>new id</strong>, so the cookie value that made the change stops authenticating.
	 * That is what closes the gap the #342 runbook had to document — an exfiltrated cookie names the very
	 * session {@code revokeAllExcept} deliberately spares, and before this it kept full operator authority.
	 *
	 * <p>Driven end-to-end because the guarantee lives in machinery a web slice stubs out: the real
	 * {@code SessionRepositoryFilter} must persist the new id to {@code SPRING_SESSION} and hand back a
	 * replacement {@code SESSION} cookie on the same response. Both halves are asserted — the old cookie is
	 * dead, the new one works — since a rotation that dropped the caller would pass a one-sided check.
	 */
	@Test
	void theSurvivingSessionIsRotatedSoTheOldCookieValueDies() throws Exception {
		Cookie beforeTheChange = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);

		Cookie afterTheChange = mvc.perform(changePassword(beforeTheChange, OLD_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		assertNotNull(afterTheChange, "the change must hand back the rotated SESSION cookie");
		assertNotEquals(beforeTheChange.getValue(), afterTheChange.getValue());
		mvc.perform(get(ME_PATH).cookie(beforeTheChange)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(afterTheChange)).andExpect(status().isOk());
	}

	/**
	 * AC-1 for #359: the rotation must survive a request that overlaps it. A second request on the same
	 * session — the operator console's pending-request poll is the realistic one — loads the session before
	 * the change commits and saves it after, and Spring Session's save writes <em>that</em> request's
	 * in-memory id ({@code UPDATE … SET SESSION_ID = ? WHERE PRIMARY_ID = ?}). Before this slice that wrote
	 * the OLD id back: the exfiltrated cookie the rotation exists to kill started working again, and the
	 * caller's freshly issued cookie was orphaned, so a legitimate operator was silently 401'd after a 204.
	 *
	 * <p>Driven through the repository rather than two threads deliberately. The defect needs one specific
	 * interleaving — B loads, A commits, B saves — and load / touch / save is exactly and only what
	 * {@code SessionRepositoryRequestWrapper.getSession} and {@code commitSession} do to a session they did
	 * not create. Two real threads would model those same three calls with a race added on top, and could
	 * not pin the ordering without a latch inside library code.
	 */
	@Test
	void aConcurrentSaveOnTheOldSessionCannotResurrectItsId() throws Exception {
		assertConcurrentSaveCannotResurrect(sessions);
	}

	/**
	 * The half of the rotation that fails <strong>silently</strong> if it regresses: the replacement session
	 * must still be reachable by principal name, or every later {@link PrincipalSessionRevoker} call
	 * quietly no-ops. The index is derived from the {@code SPRING_SECURITY_CONTEXT} attribute
	 * ({@code PrincipalNameIndexResolver}), so this is really an assertion that the rotation carried the
	 * session's attributes over rather than starting empty.
	 */
	@Test
	void theRotatedSessionStaysReachableByPrincipalName() throws Exception {
		Cookie thisDevice = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);

		mvc.perform(changePassword(thisDevice, OLD_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isNoContent());

		assertEquals(1, sessions.findByPrincipalName(TARGET).size(),
				"the rotated session must stay indexed by principal, or revocation stops finding it");
	}

	/**
	 * Generic so the package-private {@code JdbcSession} type is only ever inferred, never named: the
	 * repository's element type is not visible outside {@code org.springframework.session.jdbc}, but a
	 * capture flows through {@code findById} → {@code save} without it being spelled out.
	 */
	private <S extends Session> void assertConcurrentSaveCannotResurrect(
			FindByIndexNameSessionRepository<S> repository) throws Exception {
		Cookie beforeTheChange = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		S concurrentRequest = repository.findById(onlySessionIdOf(repository, TARGET));
		assertNotNull(concurrentRequest, "the concurrent request must have loaded the pre-change session");

		Cookie afterTheChange = mvc.perform(changePassword(beforeTheChange, OLD_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		// The overlapping request now completes, and its deferred save lands with the id it loaded.
		concurrentRequest.setLastAccessedTime(Instant.now());
		repository.save(concurrentRequest);

		assertNotNull(afterTheChange, "the change must hand back the rotated SESSION cookie");
		mvc.perform(get(ME_PATH).cookie(beforeTheChange)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(afterTheChange)).andExpect(status().isOk());
	}

	/** Read from the principal index, not the cookie — {@code DefaultCookieSerializer} base64-encodes it. */
	private static <S extends Session> String onlySessionIdOf(
			FindByIndexNameSessionRepository<S> repository, String principal) {
		Set<String> ids = repository.findByPrincipalName(principal).keySet();
		assertEquals(1, ids.size(), "the test expects exactly one live session for " + principal);
		return ids.iterator().next();
	}

	/** A rejected attempt must be inert: nothing rotated, nothing revoked (AC-2, against real storage). */
	@Test
	void aWrongCurrentPasswordRotatesNothingAndRevokesNothing() throws Exception {
		Cookie otherDevice = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);
		Cookie thisDevice = SessionLoginSupport.operatorSession(mvc, TARGET, OLD_PASSWORD);

		mvc.perform(changePassword(thisDevice, "not-the-current-one", NEW_PASSWORD))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));

		login(TARGET, OLD_PASSWORD).andExpect(status().isOk());
		mvc.perform(get(ME_PATH).cookie(otherDevice)).andExpect(status().isOk());
	}

	/**
	 * R-3 end-to-end: the guard reads the REAL {@code riviera.operator.username} binding, so the
	 * env-managed bootstrap admin is refused before anything is written — which is what stops its new
	 * password from being silently reverted by {@link OperatorCredentialInitializer} at the next deploy.
	 */
	@Test
	void theEnvManagedBootstrapAdminIsRefusedWithItsCredentialUntouched() throws Exception {
		Cookie admin = SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);

		mvc.perform(changePassword(admin, BOOTSTRAP_PASSWORD, NEW_PASSWORD))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOTSTRAP_CREDENTIAL_MANAGED"));

		// Asserted on the stored hash rather than by logging in again: the bootstrap username's per-identity
		// login budget (#292) is shared with every other IT in this cached context.
		assertTrue(encoder.matches(BOOTSTRAP_PASSWORD, passwordHashOf(BOOTSTRAP_ADMIN)));
		mvc.perform(get(ME_PATH).cookie(admin)).andExpect(status().isOk());
	}

	private MockHttpServletRequestBuilder changePassword(Cookie session, String current, String next) {
		return post(CHANGE_PASSWORD_PATH).cookie(session).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "%s", "newPassword": "%s"}""".formatted(current, next));
	}

	private ResultActions login(String username, String password) throws Exception {
		return mvc.perform(SessionLoginSupport.loginRequest(LOGIN_PATH,
				"""
						{"username": "%s", "password": "%s"}""".formatted(username, password)).with(csrf()));
	}

	private String passwordHashOf(String username) {
		return jdbc.sql("SELECT password_hash FROM operator WHERE username = :u")
				.param("u", username)
				.query(String.class)
				.single();
	}
}
