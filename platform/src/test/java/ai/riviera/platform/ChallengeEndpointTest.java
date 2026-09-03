package ai.riviera.platform;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static ai.riviera.platform.WebSliceStubs.fromIp;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The public challenge endpoint's contract: an anonymous GET is answered with a signed v2
 * challenge whose expiry is the injected (fixed) clock plus the configured ten minutes, marked
 * uncacheable and setting no cookie; and it rides its own per-IP rate-limit budget, so exhausting
 * it never blocks a login from the same address.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = {
		"riviera.ratelimit.challenge.capacity=2",
		"riviera.ratelimit.challenge.refill-period=PT1H",
		"riviera.ratelimit.login.capacity=2",
		"riviera.ratelimit.login.refill-period=PT1H",
})
class ChallengeEndpointTest {

	private static final String CHALLENGE_PATH = "/api/auth/challenge";
	/** {@code WebSliceStubs}' fixed clock, plus the shipped {@code riviera.altcha.expiry} of ten minutes. */
	private static final long EXPECTED_EXPIRES_AT = Instant.parse("2026-06-30T12:10:00Z").getEpochSecond();

	@Autowired
	MockMvc mvc;

	@Test
	void issuesASignedTenMinuteChallenge() throws Exception {
		challenge("203.0.113.10")
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(jsonPath("$.parameters.algorithm").value("PBKDF2/SHA-256"))
				.andExpect(jsonPath("$.parameters.cost").value(5000))
				.andExpect(jsonPath("$.parameters.expiresAt").value(EXPECTED_EXPIRES_AT))
				.andExpect(jsonPath("$.parameters.nonce").value(not(emptyOrNullString())))
				.andExpect(jsonPath("$.signature").value(not(emptyOrNullString())))
				.andExpect(header().string("Cache-Control", containsString("no-store")))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void everyChallengeIsFresh() throws Exception {
		String first = challenge("203.0.113.11").andReturn().getResponse().getContentAsString();
		String second = challenge("203.0.113.11").andReturn().getResponse().getContentAsString();

		org.junit.jupiter.api.Assertions.assertNotEquals(first, second, "a nonce is minted per challenge");
	}

	@Test
	void challengeBudgetIsItsOwnDimension() throws Exception {
		String ip = "203.0.113.12";
		challenge(ip).andExpect(status().isOk());
		challenge(ip).andExpect(status().isOk());
		challenge(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// The login budget from the same address is untouched: the stubs answer 401, never 429.
		mvc.perform(post("/api/auth/customer/login").with(csrf()).with(fromIp(ip))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@b.c\",\"password\":\"whatever-it-is\"}"))
				.andExpect(status().isUnauthorized());
	}

	private ResultActions challenge(String ip) throws Exception {
		return mvc.perform(get(CHALLENGE_PATH).with(fromIp(ip)));
	}
}
