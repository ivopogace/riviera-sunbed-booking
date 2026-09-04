package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
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
 * The fence's HTTP contract on every fenced route: what the filter does with each answer the
 * {@code challenge} module's port can give it, and what it does when the header is not there at
 * all. Every refusal is a {@code 400} with a stable code, hand-mirrored in
 * {@link SecurityProblemResponses} because the filter runs before MVC dispatch. The three refusals
 * run per route, so a route added to the fenced set without its contract fails here.
 *
 * <p>The slice runs against the stub port, so the verdicts are chosen rather than computed — whether
 * a given ALTCHA payload really is invalid, expired or a replay is the module's own contract
 * ({@code AltchaProofOfWorkChallengesTest}), and the whole path over real Postgres is each route's
 * own {@code *ChallengeIT}'s.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class ChallengeVerificationFilterTest {

	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String OPERATOR_REGISTER_PATH = "/api/auth/operator/register";
	private static final String FORGOT_PASSWORD_PATH = "/api/auth/customer/forgot-password";
	private static final String BOOKING_CREATE_PATH = "/api/bookings";
	private static final String HEADER = "X-Altcha-Payload";

	/** A well-formed body per fenced route, so only the challenge decides the answer. */
	static List<String> fencedRoutes() {
		return List.of(REGISTER_PATH, OPERATOR_REGISTER_PATH, FORGOT_PASSWORD_PATH, BOOKING_CREATE_PATH);
	}

	@Autowired
	MockMvc mvc;

	@ParameterizedTest
	@MethodSource("fencedRoutes")
	void aMissingHeaderIsChallengeRequired(String path) throws Exception {
		fencedPost(path, null)
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"))
				.andExpect(jsonPath("$.instance").value("about:blank"))
				.andExpect(cookie().doesNotExist("SESSION"));
	}

	@ParameterizedTest
	@MethodSource("fencedRoutes")
	void aBlankHeaderIsChallengeRequired(String path) throws Exception {
		fencedPost(path, "   ")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
	}

	@ParameterizedTest
	@MethodSource("fencedRoutes")
	void anInvalidVerdictIsChallengeInvalid(String path) throws Exception {
		fencedPost(path, "whatever-the-widget-sent")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"))
				.andExpect(cookie().doesNotExist("SESSION"));
	}

	@ParameterizedTest
	@MethodSource("fencedRoutes")
	void anExpiredVerdictIsChallengeExpired(String path) throws Exception {
		fencedPost(path, EXPIRED)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));
	}

	@Test
	void aSolvedChallengeReachesTheControllerOnceOnly() throws Exception {
		// The stubs' provisioning answers "already registered", which the controller renders as the neutral 201.
		fencedPost(REGISTER_PATH, SOLVED).andExpect(status().isCreated());
		fencedPost(REGISTER_PATH, SOLVED)
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

	@Test
	void anUnfencedRecoveryRouteIgnoresTheHeader() throws Exception {
		mvc.perform(post("/api/auth/customer/reset-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.header(HEADER, "whatever-the-widget-sent")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"not-a-real-token\",\"newPassword\":\"passphrase-123\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));
	}

	private ResultActions fencedPost(String path, String payload) throws Exception {
		MockHttpServletRequestBuilder request = post(path).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content(bodyFor(path));
		if (payload != null) {
			request.header(HEADER, payload);
		}
		return mvc.perform(request);
	}

	private static String bodyFor(String path) {
		return switch (path) {
			case OPERATOR_REGISTER_PATH -> """
					{"username":"slice-operator","password":"passphrase-123","contactEmail":"slice@example.com"}""";
			case FORGOT_PASSWORD_PATH -> """
					{"email":"slice@example.com"}""";
			case BOOKING_CREATE_PATH -> """
					{"setId":1,"bookingDate":"2026-12-01",
					 "contact":{"email":"slice@example.com","fullName":"Slice Guest","phone":"+355699"}}""";
			default -> """
					{"email":"slice@example.com","password":"passphrase-123"}""";
		};
	}
}
