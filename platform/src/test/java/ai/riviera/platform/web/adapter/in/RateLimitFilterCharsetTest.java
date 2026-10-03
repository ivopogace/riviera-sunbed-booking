package ai.riviera.platform.web.adapter.in;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import tools.jackson.databind.json.JsonMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * A login whose Content-Type names no charset while the servlet encoding is not a usable charset: the filter
 * finds no identity and passes it on unbudgeted. Unreachable behind {@code CharacterEncodingFilter}, so the
 * filter is driven directly.
 */
class RateLimitFilterCharsetTest {

	private static final RateLimitProperties.Limit LIMIT = new RateLimitProperties.Limit(60, Duration.ofMinutes(1));

	private final RateLimitFilter filter = new RateLimitFilter(
			new RateLimitProperties(true, LIMIT, LIMIT, LIMIT, LIMIT, LIMIT, 100_000, List.of(), ""),
			Clock.systemUTC(), JsonMapper.builder().build());

	@ParameterizedTest
	@ValueSource(strings = { "no-such-charset", "not a charset name" })
	void anUnusableServletEncodingYieldsNoIdentityAndReachesTheChain(String encoding) throws Exception {
		MockHttpServletRequest login = new MockHttpServletRequest("POST", "/api/auth/operator/login");
		login.setContentType(MediaType.APPLICATION_JSON_VALUE);
		login.setContent("{\"username\": \"charset-probe\", \"password\": \"nope\"}".getBytes());
		HttpServletRequest withEncoding = new HttpServletRequestWrapper(login) {
			@Override
			public String getCharacterEncoding() {
				return encoding;
			}
		};
		MockFilterChain chain = new MockFilterChain();
		MockHttpServletResponse response = new MockHttpServletResponse();

		filter.doFilter(withEncoding, response, chain);

		assertNotNull(chain.getRequest(), "the login must reach the chain, unbudgeted");
		assertEquals(200, response.getStatus());
	}
}
