package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static ai.riviera.platform.WebSliceStubs.StubProofOfWorkChallenges.EXPIRED;
import static ai.riviera.platform.WebSliceStubs.StubProofOfWorkChallenges.SOLVED;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The fence's HTTP contract on the fenced customer-register route: what the filter does with each
 * answer the {@code challenge} module's port can give it, and what it does when the header is not
 * there at all. Every refusal is a {@code 400} with a stable code, hand-mirrored in
 * {@link SecurityProblemResponses} because the filter runs before MVC dispatch.
 *
 * <p>The slice runs against the stub port, so the verdicts are chosen rather than computed — whether
 * a given ALTCHA payload really is invalid, expired or a replay is the module's own contract
 * ({@code AltchaProofOfWorkChallengesTest}), and the whole path over real Postgres is
 * {@code CustomerRegisterChallengeIT}'s.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class ChallengeVerificationFilterTest {

	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String HEADER = "X-Altcha-Payload";

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
	void anInvalidVerdictIsChallengeInvalid() throws Exception {
		register("whatever-the-widget-sent")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"))
				.andExpect(cookie().doesNotExist("SESSION"));
	}

	@Test
	void anExpiredVerdictIsChallengeExpired() throws Exception {
		register(EXPIRED)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));
	}

	@Test
	void aSolvedChallengeReachesTheControllerOnceOnly() throws Exception {
		// The stubs' provisioning answers "already registered", which the controller renders as the neutral 201.
		register(SOLVED).andExpect(status().isCreated());
		register(SOLVED)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));
	}

	@Test
	void anUnfencedRouteIgnoresTheHeader() throws Exception {
		mvc.perform(post("/api/auth/customer/login").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.header(HEADER, "whatever-the-widget-sent")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"nobody@example.com\",\"password\":\"whatever-it-is\"}"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
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
