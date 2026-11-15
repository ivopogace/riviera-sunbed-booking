package ai.riviera.platform.web.adapter.in;

import java.io.IOException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.web.filter.OncePerRequestFilter;

import ai.riviera.platform.auth.api.ScrapeCredentials;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The actuator chain's bearer check (ADR-0032): no {@code Authorization} header goes on anonymous; a token
 * {@link ScrapeCredentials} accepts authenticates this request alone; any other header is {@code 401}, logged
 * without its value. Nothing is stored: the chain keeps no security context between requests.
 */
final class ScrapeTokenFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(ScrapeTokenFilter.class);
	private static final String BEARER = "Bearer ";

	private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();
	private final ScrapeCredentials credentials;

	ScrapeTokenFilter(ScrapeCredentials credentials) {
		this.credentials = credentials;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header == null) {
			chain.doFilter(request, response);
			return;
		}
		Optional<Authentication> scraper = header.regionMatches(true, 0, BEARER, 0, BEARER.length())
				? credentials.authenticate(header.substring(BEARER.length()).strip())
				: Optional.empty();
		if (scraper.isEmpty()) {
			log.warn("Refused an actuator credential on {} {}", request.getMethod(),
					RequestPaths.withinApplication(request).replaceAll("[\r\n]", "_"));
			challenge(response);
			return;
		}
		SecurityContext context = contextHolder.createEmptyContext();
		context.setAuthentication(scraper.get());
		contextHolder.setContext(context);
		chain.doFilter(request, response);
	}

	/** The {@code 401} the actuator chain answers, naming the scheme it accepts (RFC 6750 §3). */
	static void challenge(HttpServletResponse response) throws IOException {
		response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
		SecurityProblemResponses.writeUnauthenticated(response);
	}
}
