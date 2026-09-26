package ai.riviera.platform;

import java.io.IOException;
import java.util.Set;

import org.springframework.http.HttpMethod;
import org.springframework.web.filter.OncePerRequestFilter;

import ai.riviera.platform.challenge.api.ProofOfWorkChallenges;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The proof-of-work fence (ADR-0016): a fenced {@code POST} must carry a solved challenge in
 * {@link #HEADER}, verified and claimed once by {@link ProofOfWorkChallenges}. Registered after
 * {@code RateLimitFilter} and {@code CsrfFilter} so the registry claim is the last step before the
 * controller. Refusals are {@code 400}, never {@code 403} (the rate limiter refunds a {@code 403}),
 * hand-mirrored in {@link SecurityProblemResponses} as this runs before MVC dispatch. The header
 * value is never logged. Rationale: RESPONSIBILITIES.md §Platform edge (settled).
 */
final class ChallengeVerificationFilter extends OncePerRequestFilter {

	static final String HEADER = "X-Altcha-Payload";

	/** The fenced {@code POST} routes — the three auth writes and booking create, for every caller. */
	private static final Set<String> FENCED_POSTS = Set.of(
			"/api/auth/customer/register",
			"/api/auth/operator/register",
			"/api/auth/customer/forgot-password",
			"/api/bookings");

	private final ProofOfWorkChallenges challenges;

	ChallengeVerificationFilter(ProofOfWorkChallenges challenges) {
		this.challenges = challenges;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (!challenges.enabled() || !fenced(request)) {
			chain.doFilter(request, response);
			return;
		}
		String payload = request.getHeader(HEADER);
		if (payload == null || payload.isBlank()) {
			SecurityProblemResponses.writeChallengeRequired(response);
			return;
		}
		switch (challenges.verify(payload)) {
			case VERIFIED -> chain.doFilter(request, response);
			case INVALID -> SecurityProblemResponses.writeChallengeInvalid(response);
			case EXPIRED, REPLAYED -> SecurityProblemResponses.writeChallengeExpired(response);
		}
	}

	private static boolean fenced(HttpServletRequest request) {
		return HttpMethod.POST.matches(request.getMethod())
				&& FENCED_POSTS.contains(RequestPaths.withinApplication(request));
	}
}
