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
 * The proof-of-work fence on the public writes that cost the platform money or inventory
 * (ADR-0016): a fenced {@code POST} must carry a solved challenge in {@link #HEADER}, verified
 * and claimed once by {@link ProofOfWorkChallenges} before the controller runs. Registered after
 * {@code RateLimitFilter} and {@code CsrfFilter}: the cheap checks go first, a {@code 429} wins
 * when both would fail, a refused solution still spent its rate-limit token, and the registry claim
 * — the one write — is the last thing before the controller.
 *
 * <p>Every refusal is a {@code 400} with a stable code, hand-mirrored in
 * {@link SecurityProblemResponses} because this runs before MVC dispatch. Deliberately not a
 * {@code 403}: the rate limiter refunds a {@code 403} on the budgets that guard authenticated work.
 * The header value is never logged.
 */
final class ChallengeVerificationFilter extends OncePerRequestFilter {

	static final String HEADER = "X-Altcha-Payload";

	/** The fenced {@code POST} routes; the other public writes join here in their own slices. */
	private static final Set<String> FENCED_POSTS = Set.of("/api/auth/customer/register");

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
