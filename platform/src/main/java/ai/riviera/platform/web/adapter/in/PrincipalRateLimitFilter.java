package ai.riviera.platform.web.adapter.in;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The per-principal budget on the authenticated credential endpoints (#364), keyed on the session's principal, so
 * one account attacked from many addresses gets one budget. After {@code AuthorizationFilter}: a request denied
 * before it (CSRF, anonymous, wrong role) never arrives, so spends nothing. A password change spends
 * {@link IdentityBuckets}' account token, refunded on a 2xx; a verification resend spends one on its own map, always.
 * {@link RateLimitFilter}'s per-IP budgets stay as volume control. The name is a hashed key only, never logged (D-8).
 */
final class PrincipalRateLimitFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(PrincipalRateLimitFilter.class);

	// Mirror SecurityConfig's route policy: the operator path is OPERATOR-only, the /api/me ones CUSTOMER-only.
	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	private static final String CUSTOMER_PASSWORD_PATH = "/api/me/password";
	private static final String VERIFICATION_RESEND_PATH = "/api/me/verify-email/request";

	private final RateLimitProperties props;
	private final Clock clock;
	private final IdentityBuckets identities;
	private final BucketMap resendBuckets;

	PrincipalRateLimitFilter(RateLimitProperties props, Clock clock, IdentityBuckets identities) {
		this.props = props;
		this.clock = clock;
		this.identities = identities;
		this.resendBuckets = new BucketMap(props.maxTrackedKeys());
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		if (!props.enabled() || !HttpMethod.POST.matches(request.getMethod())) {
			return true;
		}
		String path = RequestPaths.withinApplication(request);
		return !(OPERATOR_PASSWORD_PATH.equals(path) || CUSTOMER_PASSWORD_PATH.equals(path)
				|| VERIFICATION_RESEND_PATH.equals(path));
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication == null || authentication instanceof AnonymousAuthenticationToken) {
			chain.doFilter(request, response); // unreachable under the route policy; never one shared anonymous key
			return;
		}
		Instant now = clock.instant();
		String name = authentication.getName();
		String path = RequestPaths.withinApplication(request);
		if (VERIFICATION_RESEND_PATH.equals(path)) {
			TokenBucket bucket = resendBuckets.bucketFor(identities.customerKey(name), props.username(), now);
			if (bucket.tryAcquire(now)) {
				chain.doFilter(request, response);
			}
			else {
				reject(response, bucket, now, path);
			}
			return;
		}
		String key = OPERATOR_PASSWORD_PATH.equals(path) ? identities.operatorKey(name) : identities.customerKey(name);
		TokenBucket bucket = identities.bucketFor(key, now);
		if (!bucket.tryAcquire(now)) {
			reject(response, bucket, now, path);
			return;
		}
		chain.doFilter(request, response);
		if (HttpStatusCode.valueOf(response.getStatus()).is2xxSuccessful()) {
			bucket.release(now);
		}
	}

	private static void reject(HttpServletResponse response, TokenBucket bucket, Instant now, String path)
			throws IOException {
		SecurityProblemResponses.writeRateLimited(response, bucket.retryAfterSeconds(now));
		log.debug("Rate-limited a request to {} on the principal dimension", path);
	}
}
