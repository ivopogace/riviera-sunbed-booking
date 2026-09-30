package ai.riviera.platform;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpRequestResponseHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A login that verified the old credential but saves its session after the revokes meant to end it (#1306):
 * the session is refused on its next request. The login is paused where it saves its security context, after
 * {@code authenticate()}, while the reset or the suspension commits and revokes; then it completes.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, SessionCredentialRaceIT.PausingSave.class})
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class SessionCredentialRaceIT {

	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "bootstrap-pw";
	private static final String TARGET = "stamp-race-admin";
	private static final String TARGET_PASSWORD = "stamp-race-pw-1";
	private static final String ME_PATH = "/api/auth/me";

	@Autowired
	MockMvc mvc;
	@Autowired
	MockMailer mailer;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void clearOutbox() {
		mailer.clear();
	}

	@Test
	void aLoginSavedAfterAResetsRevokesIsRejected() throws Exception {
		String email = "stamp-race-" + System.nanoTime() + "@example.com";
		register(email, "passphrase-123");
		mvc.perform(post("/api/auth/customer/forgot-password").with(csrf())
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s"}""".formatted(email)))
				.andExpect(status().isNoContent());
		String token = UriComponentsBuilder.fromUri(mailer.lastTo(email).orElseThrow().link())
				.build().getQueryParams().getFirst("token");

		Cookie attacker = pausedAt(email, () -> mvc.perform(SessionLoginSupport.loginRequest(
						"/api/auth/customer/login", """
								{"email": "%s", "password": "passphrase-123"}""".formatted(email)).with(csrf()))
						.andExpect(status().isOk()).andReturn(),
				() -> mvc.perform(post("/api/auth/customer/reset-password").with(csrf())
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"token": "%s", "newPassword": "newpassword456"}""".formatted(token)))
						.andExpect(status().isNoContent()));

		mvc.perform(get(ME_PATH).cookie(attacker)).andExpect(status().isUnauthorized());
	}

	@Test
	void anAdminLoginSavedAfterItsSuspensionIsRejected() throws Exception {
		OperatorId target = provisionAdmin();

		Cookie suspended = pausedAt(TARGET, () -> mvc.perform(SessionLoginSupport.loginRequest(
						"/api/auth/operator/login", """
								{"username": "%s", "password": "%s"}""".formatted(TARGET, TARGET_PASSWORD))
						.with(csrf())).andExpect(status().isOk()).andReturn(),
				() -> mvc.perform(post("/api/admin/operators/{id}/suspend", target.value())
						.cookie(SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD))
						.with(csrf()))
						.andExpect(status().isNoContent()));

		assertEquals("SUSPENDED", jdbc.sql("SELECT status FROM operator WHERE id = :id")
				.param("id", target.value()).query(String.class).single());
		mvc.perform(get("/api/admin/operators").cookie(suspended)).andExpect(status().isUnauthorized());
	}

	/**
	 * Runs {@code login} until it is about to save {@code principal}'s security context, runs {@code change} to
	 * completion, then lets the login finish and returns the session cookie it set.
	 */
	private Cookie pausedAt(String principal, ThrowingSupplier<MvcResult> login, ThrowingRunnable change)
			throws Exception {
		PausingSave.Pause pause = PausingSave.arm(principal);
		try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
			try {
				Future<MvcResult> loggingIn = pool.submit(login::get);
				if (!pause.reached.await(10, TimeUnit.SECONDS)) {
					throw new IllegalStateException("the login never reached its session save");
				}
				change.run();
				pause.release.countDown();
				Cookie session = loggingIn.get(10, TimeUnit.SECONDS).getResponse().getCookie("SESSION");
				if (session == null) {
					throw new IllegalStateException("the paused login set no SESSION cookie");
				}
				return session;
			}
			finally {
				pause.release.countDown();
				PausingSave.disarm();
			}
		}
	}

	private void register(String email, String password) throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)))
				.andExpect(status().isCreated());
	}

	private OperatorId provisionAdmin() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN (SELECT id FROM operator WHERE username = :u)")
				.param("u", TARGET).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", TARGET).update();
		OperatorId id = provisioning.provision(TARGET, encoder.encode(TARGET_PASSWORD));
		jdbc.sql("UPDATE operator SET is_admin = true WHERE id = :id").param("id", id.value()).update();
		return id;
	}

	@FunctionalInterface
	private interface ThrowingSupplier<T> {
		T get() throws Exception;
	}

	@FunctionalInterface
	private interface ThrowingRunnable {
		void run() throws Exception;
	}

	/** The session-context repository the login controllers use, able to hold one principal's save. */
	@TestConfiguration(proxyBeanMethods = false)
	static class PausingSave {

		private static final AtomicReference<Pause> ARMED = new AtomicReference<>();

		record Pause(String principal, CountDownLatch reached, CountDownLatch release) {
		}

		static Pause arm(String principal) {
			Pause pause = new Pause(principal, new CountDownLatch(1), new CountDownLatch(1));
			ARMED.set(pause);
			return pause;
		}

		static void disarm() {
			ARMED.set(null);
		}

		@Bean
		@Primary
		SecurityContextRepository pausingSecurityContextRepository() {
			HttpSessionSecurityContextRepository delegate = new HttpSessionSecurityContextRepository();
			return new SecurityContextRepository() {

				@Override
				@SuppressWarnings("deprecation")
				public SecurityContext loadContext(HttpRequestResponseHolder holder) {
					return delegate.loadContext(holder);
				}

				@Override
				public void saveContext(SecurityContext context, HttpServletRequest request,
						HttpServletResponse response) {
					Pause pause = ARMED.get();
					if (pause != null && context.getAuthentication() != null
							&& pause.principal().equals(context.getAuthentication().getName())) {
						pause.reached().countDown();
						awaitRelease(pause);
					}
					delegate.saveContext(context, request, response);
				}

				@Override
				public boolean containsContext(HttpServletRequest request) {
					return delegate.containsContext(request);
				}
			};
		}

		private static void awaitRelease(Pause pause) {
			try {
				if (!pause.release().await(30, TimeUnit.SECONDS)) {
					throw new IllegalStateException("the paused save was never released");
				}
			}
			catch (InterruptedException interrupted) {
				Thread.currentThread().interrupt();
			}
		}
	}
}
