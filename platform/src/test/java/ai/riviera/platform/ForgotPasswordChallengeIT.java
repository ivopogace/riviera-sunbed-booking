package ai.riviera.platform;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.challenge.ChallengeSolving;
import ai.riviera.platform.notification.adapter.out.MockMailer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The proof-of-work fence on forgot-password, end to end against real Postgres: a solved challenge
 * lets the reset link be mailed; a missing, forged, expired or replayed solution is refused with its
 * code and sends nothing; and a refused submission still spends the recovery budget, with the rate
 * limiter winning once that runs out. Byte-identity across account states under a failed challenge
 * — the non-enumeration property this fence must not break (D-8) — is
 * {@code PasswordResetIT}'s, alongside the uniform {@code 204} it already pins.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
		"riviera.altcha.cost=10",
		"riviera.altcha.hmac-secret=" + ForgotPasswordChallengeIT.SECRET,
})
class ForgotPasswordChallengeIT {

	static final String SECRET = "forgot-password-it-only-not-a-secret";
	private static final String FORGOT_PATH = "/api/auth/customer/forgot-password";
	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String CHALLENGE_PATH = "/api/auth/challenge";
	private static final String HEADER = "X-Altcha-Payload";
	private static final String PASSWORD = "passphrase-123";
	private static final int COST = 10;
	/** The shipped {@code riviera.ratelimit.login.capacity}, which the recovery routes ride. */
	private static final int RECOVERY_BUDGET = 10;

	@Autowired
	MockMvc mvc;
	@Autowired
	MockMailer mailer;

	@BeforeEach
	void clearOutbox() {
		mailer.clear();
	}

	@Test
	void sendsTheLinkWithASolvedChallenge() throws Exception {
		String email = "chal-forgot-alice@example.com";
		register(email);

		forgot(email, solvedFromTheEndpoint()).andExpect(status().isNoContent());

		assertTrue(mailer.lastTo(email).isPresent(), "a solved challenge lets the reset link through");
	}

	@Test
	void rejectsAMissingHeader() throws Exception {
		String email = "chal-forgot-bob@example.com";
		register(email);

		forgot(email, null)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));

		assertNoMailTo(email);
	}

	@Test
	void rejectsATamperedSignature() throws Exception {
		String email = "chal-forgot-carol@example.com";
		register(email);

		forgot(email, ChallengeSolving.tamperSignature(solvedFromTheEndpoint()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));

		assertNoMailTo(email);
	}

	@Test
	void rejectsAnExpiredChallenge() throws Exception {
		String email = "chal-forgot-dana@example.com";
		register(email);
		long aMinuteAgo = Instant.now().minusSeconds(60).getEpochSecond();

		forgot(email, ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, aMinuteAgo)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

		assertNoMailTo(email);
	}

	@Test
	void rejectsAReplayedSolution() throws Exception {
		String email = "chal-forgot-erin@example.com";
		register(email);
		String payload = solvedFromTheEndpoint();
		forgot(email, payload).andExpect(status().isNoContent());
		mailer.clear();

		forgot(email, payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

		assertNoMailTo(email);
	}

	@Test
	void aChallengeFailureStillSpendsTheRecoveryBudget() throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		String email = "chal-forgot-flood@example.com";
		for (int i = 0; i < RECOVERY_BUDGET; i++) {
			forgotFrom(ip, email, null)
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
		}

		forgotFrom(ip, email, null)
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private void assertNoMailTo(String email) {
		assertEquals(0, mailer.sent().size(), "a refused challenge sends nothing at all");
		assertTrue(mailer.lastTo(email).isEmpty(), "and nothing to the address that asked");
	}

	private void register(String email) throws Exception {
		mvc.perform(post(REGISTER_PATH).with(csrf())
				.header(HEADER, solvedFromTheEndpoint())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, PASSWORD)))
				.andExpect(status().isCreated());
		mailer.clear();
	}

	private String solvedFromTheEndpoint() throws Exception {
		MvcResult result = mvc.perform(get(CHALLENGE_PATH)
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isOk())
				.andReturn();
		return ChallengeSolving.solve(result.getResponse().getContentAsString());
	}

	private ResultActions forgot(String email, String payload) throws Exception {
		return forgotFrom(SessionLoginSupport.uniqueClientIp(), email, payload);
	}

	private ResultActions forgotFrom(String ip, String email, String payload) throws Exception {
		MockHttpServletRequestBuilder request = post(FORGOT_PATH).with(csrf())
				.header("X-Forwarded-For", ip)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s"}""".formatted(email));
		if (payload != null) {
			request.header(HEADER, payload);
		}
		return mvc.perform(request);
	}
}
