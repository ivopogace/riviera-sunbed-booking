package ai.riviera.platform;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.challenge.ChallengeSolving;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The proof-of-work fence on operator self-registration, end to end against real Postgres: a
 * challenge minted by the endpoint and solved with the library registers the PENDING operator; a
 * missing, forged, expired or replayed solution is refused with its code and writes no row; and a
 * refused submission still spends the operator-register budget, with the rate limiter winning once
 * that runs out. Its own context: a tiny cost keeps the Java solves instant and a known secret lets
 * the test mint an expired one.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
		"riviera.altcha.cost=10",
		"riviera.altcha.hmac-secret=" + OperatorRegisterChallengeIT.SECRET,
})
class OperatorRegisterChallengeIT {

	static final String SECRET = "operator-register-it-only-not-a-secret";
	private static final String REGISTER_PATH = "/api/auth/operator/register";
	private static final String CHALLENGE_PATH = "/api/auth/challenge";
	private static final String HEADER = "X-Altcha-Payload";
	private static final String PASSWORD = "operator-pw-123";
	private static final int COST = 10;
	/** The shipped {@code riviera.ratelimit.login.capacity}, which the operator-register route rides. */
	private static final int REGISTER_BUDGET = 10;

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'chal-op-%'").update();
	}

	@Test
	void registersWithASolvedChallenge() throws Exception {
		register("chal-op-alice", solvedFromTheEndpoint())
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING"))
				.andExpect(cookie().doesNotExist("SESSION"));

		assertEquals(1, operators("chal-op-alice"));
	}

	@Test
	void rejectsAMissingHeader() throws Exception {
		register("chal-op-bob", null)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));

		assertEquals(0, operators("chal-op-bob"));
	}

	@Test
	void rejectsATamperedSignature() throws Exception {
		register("chal-op-carol", ChallengeSolving.tamperSignature(solvedFromTheEndpoint()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));

		assertEquals(0, operators("chal-op-carol"));
	}

	@Test
	void rejectsAnExpiredChallenge() throws Exception {
		long aMinuteAgo = Instant.now().minusSeconds(60).getEpochSecond();
		String payload = ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, aMinuteAgo));

		register("chal-op-dana", payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

		assertEquals(0, operators("chal-op-dana"));
	}

	@Test
	void rejectsAReplayedSolution() throws Exception {
		String payload = solvedFromTheEndpoint();
		register("chal-op-erin", payload).andExpect(status().isAccepted());

		register("chal-op-erin-two", payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

		assertEquals(0, operators("chal-op-erin-two"));
	}

	@Test
	void aChallengeFailureStillSpendsTheOperatorRegisterBudget() throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		for (int i = 0; i < REGISTER_BUDGET; i++) {
			registerFrom(ip, "chal-op-flood", null)
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
		}

		registerFrom(ip, "chal-op-flood", null)
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private String solvedFromTheEndpoint() throws Exception {
		MvcResult result = mvc.perform(get(CHALLENGE_PATH)
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isOk())
				.andReturn();
		return ChallengeSolving.solve(result.getResponse().getContentAsString());
	}

	private int operators(String username) {
		return jdbc.sql("SELECT count(*) FROM operator WHERE username = :u")
				.param("u", username).query(Integer.class).single();
	}

	private ResultActions register(String username, String payload) throws Exception {
		return registerFrom(SessionLoginSupport.uniqueClientIp(), username, payload);
	}

	private ResultActions registerFrom(String ip, String username, String payload) throws Exception {
		MockHttpServletRequestBuilder request = post(REGISTER_PATH).with(csrf())
				.header("X-Forwarded-For", ip)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "%s", "password": "%s", "contactEmail": "%s@venue.example"}"""
						.formatted(username, PASSWORD, username));
		if (payload != null) {
			request.header(HEADER, payload);
		}
		return mvc.perform(request);
	}
}
