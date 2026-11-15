package ai.riviera.platform.web.adapter.in;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * The filter's own guard, which the route policy keeps unreachable in the chain ({@code RateLimitFilterTest} pins
 * the chain): an anonymous principal is never keyed, so a later {@code permitAll} on a guarded path could not turn
 * every anonymous caller into one shared bucket.
 */
class PrincipalRateLimitFilterTest {

	private static final RateLimitProperties.Limit ONE = new RateLimitProperties.Limit(1, Duration.ofHours(1));
	private static final RateLimitProperties PROPS =
			new RateLimitProperties(true, ONE, ONE, ONE, ONE, ONE, 100_000, List.of(), "");

	private final PrincipalRateLimitFilter filter =
			new PrincipalRateLimitFilter(PROPS, Clock.systemUTC(), new IdentityBuckets(PROPS));

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void anAnonymousPrincipalPassesUnbudgeted() throws Exception {
		SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken("key", "anonymousUser",
				AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
		for (int i = 0; i < 3; i++) {
			MockFilterChain chain = new MockFilterChain();
			MockHttpServletResponse response = new MockHttpServletResponse();
			MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/operator/password");

			filter.doFilter(request, response, chain);

			assertNotNull(chain.getRequest(), "the request reaches the chain");
			assertEquals(200, response.getStatus());
		}
	}

	@Test
	void noAuthenticationPassesUnbudgeted() throws Exception {
		for (int i = 0; i < 3; i++) {
			MockFilterChain chain = new MockFilterChain();
			filter.doFilter(new MockHttpServletRequest("POST", "/api/me/verify-email/request"),
					new MockHttpServletResponse(), chain);

			assertNotNull(chain.getRequest(), "the request reaches the chain");
		}
	}
}
