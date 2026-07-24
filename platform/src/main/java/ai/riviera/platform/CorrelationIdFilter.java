package ai.riviera.platform;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Stamps every request with a correlation id (issue #100, D4 observability) so all log lines emitted
 * while handling one request share a traceable key. The id is placed in the SLF4J {@link MDC} under
 * {@link #MDC_KEY} — the structured (JSON) console appender includes MDC fields, so it surfaces on
 * every line — and echoed back in the {@link #HEADER} response header for the caller/next hop.
 *
 * <p>An inbound {@link #HEADER} is <strong>reused only if it is safe</strong>: it must match a bounded
 * allowlist ({@link #VALID_ID} — id characters, 1..64 long). Anything else — an absent header, an
 * over-long value, or a forged value carrying {@code CRLF} (log-injection / forged log lines,
 * {@code riviera-java-conventions} §10) — is discarded and a fresh {@link UUID} is generated, so a
 * client can never inject newlines into a log line or a response header through this path.
 *
 * <p>Registered as a top-level servlet filter at {@code HIGHEST_PRECEDENCE}
 * ({@link ObservabilityConfig}), ahead of Spring Security and {@link RateLimitFilter}, so the id is in
 * scope for the earliest log line of the request; the MDC key is always removed in a {@code finally}
 * so no id ever leaks from a pooled thread into the next request. App-level web concern in the root
 * package (like {@link RateLimitFilter}/{@link WebCorsConfig}), not a Modulith module.
 */
final class CorrelationIdFilter extends OncePerRequestFilter {

	/** Request/response header carrying the correlation id (a common de-facto name). */
	static final String HEADER = "X-Correlation-Id";

	/** MDC key the structured log appender renders on every line. */
	static final String MDC_KEY = "correlationId";

	/** Reuse an inbound id only if it is exactly this: id characters, 1..64 long (no CRLF, bounded). */
	private static final Pattern VALID_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String id = correlationId(request.getHeader(HEADER));
		MDC.put(MDC_KEY, id);
		response.setHeader(HEADER, id);
		try {
			chain.doFilter(request, response);
		}
		finally {
			MDC.remove(MDC_KEY);
		}
	}

	/** The inbound id if it passes the allowlist, else a fresh UUID (never trust a client-supplied value). */
	private static String correlationId(String inbound) {
		return inbound != null && VALID_ID.matcher(inbound).matches() ? inbound : UUID.randomUUID().toString();
	}
}
