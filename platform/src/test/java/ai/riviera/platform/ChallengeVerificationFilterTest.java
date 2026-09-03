package ai.riviera.platform;

import java.time.Instant;

import org.altcha.altcha.v2.Altcha;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The verifier's HTTP contract on the fenced customer-register route, in the web slice with the
 * in-memory registry: every way a solution can be wrong has its stable code, a right one reaches the
 * controller, a second submission of the same right one does not, and a route the fence does not
 * cover never sees the header. Challenges are minted <em>here</em>, in real time with the slice's
 * test secret, because the library checks expiry against the wall clock while the slice's
 * {@code Clock} is fixed in the past.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = {
		"riviera.altcha.cost=10",
		"riviera.altcha.hmac-secret=" + ChallengeVerificationFilterTest.SECRET,
})
class ChallengeVerificationFilterTest {

	static final String SECRET = "web-slice-only-not-a-secret";
	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String HEADER = "X-Altcha-Payload";
	private static final int COST = 10;

	@Autowired
	MockMvc mvc;

	@Test
	void aMissingHeaderIsChallengeRequired() throws Exception {
		register(null)
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"))
				.andExpect(jsonPath("$.instance").value("about:blank"))
				.andExpect(cookie().doesNotExist("SESSION"));
	}

	@Test
	void aBlankHeaderIsChallengeRequired() throws Exception {
		register("   ")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
	}

	@Test
	void garbageIsChallengeInvalid() throws Exception {
		register("not-even-base64!")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
		register(java.util.Base64.getEncoder().encodeToString("{\"challenge\":{}}".getBytes()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
	}

	@Test
	void aForgedSignatureIsChallengeInvalid() throws Exception {
		String payload = ChallengeSolving.solve(ChallengeSolving.mint("somebody-elses-secret", COST, inTenMinutes()));

		register(payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
	}

	@Test
	void aTamperedSignatureIsChallengeInvalid() throws Exception {
		String payload = ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, inTenMinutes()));

		register(ChallengeSolving.tamperSignature(payload))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
	}

	@Test
	void aWrongAnswerIsChallengeInvalid() throws Exception {
		String payload = ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, inTenMinutes()));

		register(ChallengeSolving.wrongAnswer(payload))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
	}

	@Test
	void anExpiredChallengeIsChallengeExpired() throws Exception {
		long aMinuteAgo = Instant.now().minusSeconds(60).getEpochSecond();
		String payload = ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, aMinuteAgo));

		register(payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));
	}

	@Test
	void aSolvedChallengeReachesTheControllerOnceOnly() throws Exception {
		Altcha.Challenge challenge = ChallengeSolving.mint(SECRET, COST, inTenMinutes());
		String payload = ChallengeSolving.solve(challenge);

		// The stubs' provisioning answers "already registered", which the controller renders as the neutral 201.
		register(payload).andExpect(status().isCreated());
		register(payload)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));
	}

	@Test
	void anUnfencedRouteIgnoresTheHeader() throws Exception {
		mvc.perform(post("/api/auth/customer/login").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"nobody@example.com\",\"password\":\"whatever-it-is\"}"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
	}

	private static long inTenMinutes() {
		return Instant.now().plusSeconds(600).getEpochSecond();
	}

	private ResultActions register(String payload) throws Exception {
		MockHttpServletRequestBuilder request = post(REGISTER_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"slice@example.com\",\"password\":\"passphrase-123\"}");
		if (payload != null) {
			request.header(HEADER, payload);
		}
		return mvc.perform(request);
	}
}
