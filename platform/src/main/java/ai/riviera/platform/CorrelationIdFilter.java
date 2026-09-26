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
 * Stamps every request with a correlation id, put in the SLF4J {@link MDC} under {@link #MDC_KEY}
 * (the JSON appender renders it on every line) and echoed in the {@link #HEADER} response header.
 * An inbound id is reused only if it matches {@link #VALID_ID}; anything else (absent, over-long,
 * CRLF-forged) gets a fresh {@link UUID}, so no client injects newlines into a log line or header
 * ({@code riviera-java-conventions} §10). Runs first ({@link ObservabilityConfig}) and removes the
 * MDC key in a {@code finally} so no id leaks from a pooled thread into the next request.
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
