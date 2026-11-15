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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

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

	/** The SSO link start verifies the operator's password, so a failed one spends the account's token (#276). */
	@Test
	void anOperatorSsoLinkStartSharesTheAccountBudgetWithThePasswordChange() throws Exception {
		SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
				"sso-budget-op", null, AuthorityUtils.createAuthorityList("ROLE_OPERATOR")));
		MockFilterChain refused = new MockFilterChain(new HttpServlet() {
			@Override
			protected void service(HttpServletRequest req, HttpServletResponse res) {
				res.setStatus(400);
			}
		});
		filter.doFilter(new MockHttpServletRequest("POST", "/api/auth/operator/sso/google/link"),
				new MockHttpServletResponse(), refused);

		MockHttpServletResponse change = new MockHttpServletResponse();
		filter.doFilter(new MockHttpServletRequest("POST", "/api/auth/operator/password"), change,
				new MockFilterChain());

		assertEquals(429, change.getStatus(), "the failed link start spent the account's one token");
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
