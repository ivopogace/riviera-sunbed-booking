package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;

import jakarta.servlet.http.Cookie;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A session authenticates only while the credential it was opened against is current (#1306): a password,
 * operator status, admin flag or erasure changed with no revoke at all still ends it on the next request,
 * and a stored session is admitted only while its principal's stamp matches the stored hash.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SessionCredentialStampIT {

	private static final String TARGET = "stamp-it-operator";
	private static final String TARGET_PASSWORD = "stamp-it-pw-123";
	private static final String ME_PATH = "/api/auth/me";
	private static final String ADMIN_LIST_PATH = "/api/admin/operators";

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

	private OperatorId target;

	@BeforeEach
	void provisionTarget() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN (SELECT id FROM operator WHERE username = :u)")
				.param("u", TARGET).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", TARGET).update();
		target = provisioning.provision(TARGET, encoder.encode(TARGET_PASSWORD));
	}

	@Test
	void aPasswordChangedWithoutARevokeEndsTheCustomersSession() throws Exception {
		String email = uniqueEmail();
		Cookie session = register(email);
		mvc.perform(get(ME_PATH).cookie(session)).andExpect(status().isOk());

		jdbc.sql("UPDATE customer_account SET password_hash = :h WHERE email = :e")
				.param("h", encoder.encode("another-pass-1")).param("e", email).update();

		mvc.perform(get(ME_PATH).cookie(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void anErasureWithoutARevokeEndsTheCustomersSession() throws Exception {
		String email = uniqueEmail();
		Cookie session = register(email);
		mvc.perform(get(ME_PATH).cookie(session)).andExpect(status().isOk());

		jdbc.sql("""
				UPDATE customer_account SET email = 'erased+' || id || '@erased.invalid', password_hash = NULL,
				       erased_at = NOW()
				WHERE email = :e
				""").param("e", email).update();

		mvc.perform(get(ME_PATH).cookie(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void aSuspensionWithoutARevokeEndsTheOperatorsSession() throws Exception {
		Cookie session = SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD);
		mvc.perform(get(ME_PATH).cookie(session)).andExpect(status().isOk());

		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE id = :id").param("id", target.value()).update();

		mvc.perform(get(ME_PATH).cookie(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void aDemotionWithoutARevokeEndsTheAdminSession() throws Exception {
		jdbc.sql("UPDATE operator SET is_admin = true WHERE id = :id").param("id", target.value()).update();
		Cookie session = SessionLoginSupport.operatorSession(mvc, TARGET, TARGET_PASSWORD);
		mvc.perform(get(ADMIN_LIST_PATH).cookie(session)).andExpect(status().isOk());

		jdbc.sql("UPDATE operator SET is_admin = false WHERE id = :id").param("id", target.value()).update();

		mvc.perform(get(ADMIN_LIST_PATH).cookie(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void aStoredSessionIsAdmittedOnlyWhileItsStampMatchesTheStoredHash() throws Exception {
		String storedHash = jdbc.sql("SELECT password_hash FROM operator WHERE id = :id")
				.param("id", target.value()).query(String.class).single();
		var authorities = AuthorityUtils.createAuthorityList("ROLE_OPERATOR");

		mvc.perform(get(ME_PATH).cookie(storedSession(sessions, UsernamePasswordAuthenticationToken.authenticated(
				SessionPrincipal.erased(TARGET, storedHash, authorities), null, authorities))))
				.andExpect(status().isOk());
		mvc.perform(get(ME_PATH).cookie(storedSession(sessions, UsernamePasswordAuthenticationToken.authenticated(
				SessionPrincipal.erased(TARGET, encoder.encode(TARGET_PASSWORD), authorities), null, authorities))))
				.andExpect(status().isUnauthorized());
	}

	/** A session written straight to the store, holding {@code authentication} as its security context. */
	static <S extends Session> Cookie storedSession(FindByIndexNameSessionRepository<S> repository,
			Authentication authentication) {
		S session = repository.createSession();
		session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
				new SecurityContextImpl(authentication));
		repository.save(session);
		return new Cookie("SESSION",
				Base64.getEncoder().encodeToString(session.getId().getBytes(StandardCharsets.UTF_8)));
	}

	private Cookie register(String email) throws Exception {
		return Objects.requireNonNull(mvc.perform(post("/api/auth/customer/register").with(csrf())
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email": "%s", "password": "passphrase-123"}""".formatted(email)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getCookie("SESSION"), "register set no SESSION cookie");
	}

	private static String uniqueEmail() {
		return "stamp-it-" + System.nanoTime() + "@example.com";
	}
}
