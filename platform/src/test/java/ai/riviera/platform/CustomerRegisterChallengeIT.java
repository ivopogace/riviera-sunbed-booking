package ai.riviera.platform;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

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
 * The proof-of-work fence on customer register, end to end against real Postgres: a challenge
 * minted by the endpoint and solved with the library registers; a missing, forged, expired or
 * replayed solution is refused with its code and writes nothing; two concurrent submissions of one
 * solution admit exactly one (the registry row is the claim); and a refused submission still
 * spends the register budget, with the rate limiter winning once that runs out. Its own context:
 * a tiny cost keeps the Java solves instant and a known secret lets the test mint an expired one.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
		"riviera.altcha.cost=10",
		"riviera.altcha.hmac-secret=" + CustomerRegisterChallengeIT.SECRET,
})
class CustomerRegisterChallengeIT {

	static final String SECRET = "register-it-only-not-a-secret";
	private static final String SESSION_COOKIE = "SESSION";
	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String CHALLENGE_PATH = "/api/auth/challenge";
	private static final String HEADER = "X-Altcha-Payload";
	private static final int COST = 10;
	/** The shipped {@code riviera.ratelimit.login.capacity}, which the register route rides. */
	private static final int REGISTER_BUDGET = 10;

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM customer_account WHERE email LIKE 'chal-it-%'").update();
	}

	@Test
	void registersWithASolvedChallenge() throws Exception {
		register("chal-it-alice@example.com", solvedFromTheEndpoint())
				.andExpect(status().isCreated())
				.andExpect(cookie().exists(SESSION_COOKIE));

		assertEquals(1, accounts("chal-it-alice@example.com"));
	}

	@Test
	void rejectsAMissingHeader() throws Exception {
		register("chal-it-bob@example.com", null)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		assertEquals(0, accounts("chal-it-bob@example.com"));
	}

	@Test
	void rejectsATamperedSignature() throws Exception {
		register("chal-it-carol@example.com", ChallengeSolving.tamperSignature(solvedFromTheEndpoint()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		assertEquals(0, accounts("chal-it-carol@example.com"));
	}

	@Test
	void rejectsAnExpiredChallenge() throws Exception {
		long aMinuteAgo = Instant.now().minusSeconds(60).getEpochSecond();
		String payload = ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, aMinuteAgo));

		register("chal-it-dana@example.com", payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		assertEquals(0, accounts("chal-it-dana@example.com"));
	}

	@Test
	void rejectsAReplayedSolution() throws Exception {
		String payload = solvedFromTheEndpoint();
		register("chal-it-erin@example.com", payload).andExpect(status().isCreated());

		register("chal-it-erin-two@example.com", payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		assertEquals(0, accounts("chal-it-erin-two@example.com"));
	}

	@Test
	void concurrentReplayAdmitsExactlyOne() throws Exception {
		String payload = solvedFromTheEndpoint();
		CountDownLatch start = new CountDownLatch(1);
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			List<Future<Integer>> outcomes = List.of(
					pool.submit(() -> submit(start, "chal-it-finn-a@example.com", payload)),
					pool.submit(() -> submit(start, "chal-it-finn-b@example.com", payload)));
			start.countDown();
			List<Integer> statuses = outcomes.stream().map(this::statusOf).sorted().toList();

			assertEquals(List.of(201, 400), statuses, "one claim wins the registry row, the other loses it");
		}
		assertEquals(1, accounts("chal-it-finn-a@example.com") + accounts("chal-it-finn-b@example.com"));
	}

	@Test
	void aChallengeFailureStillSpendsTheRegisterBudget() throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		for (int i = 0; i < REGISTER_BUDGET; i++) {
			registerFrom(ip, "chal-it-flood@example.com", null)
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
		}

		registerFrom(ip, "chal-it-flood@example.com", null)
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private int submit(CountDownLatch start, String email, String payload) throws Exception {
		start.await();
		return register(email, payload).andReturn().getResponse().getStatus();
	}

	private int statusOf(Future<Integer> outcome) {
		try {
			return outcome.get();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		}
		catch (java.util.concurrent.ExecutionException e) {
			throw new IllegalStateException(e.getCause());
		}
	}

	private String solvedFromTheEndpoint() throws Exception {
		MvcResult result = mvc.perform(get(CHALLENGE_PATH)
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isOk())
				.andReturn();
		return ChallengeSolving.solve(result.getResponse().getContentAsString());
	}

	private int accounts(String email) {
		return jdbc.sql("SELECT count(*) FROM customer_account WHERE email = :e")
				.param("e", email).query(Integer.class).single();
	}

	private ResultActions register(String email, String payload) throws Exception {
		return registerFrom(SessionLoginSupport.uniqueClientIp(), email, payload);
	}

	private ResultActions registerFrom(String ip, String email, String payload) throws Exception {
		MockHttpServletRequestBuilder request = post(REGISTER_PATH).with(csrf())
				.header("X-Forwarded-For", ip)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "passphrase-123"}""".formatted(email));
		if (payload != null) {
			request.header(HEADER, payload);
		}
		return mvc.perform(request);
	}
}
