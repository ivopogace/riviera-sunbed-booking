package ai.riviera.platform;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Shared request-synthesis machinery for the endpoint-sweep guards — {@link
 * EndpointRoleGateCoverageTest} (is every mapped endpoint gated <em>at all</em>?) and {@link
 * AdminSurfaceRoleGateTest} (is every {@code /api/admin/**} endpoint gated to <em>ADMIN</em>?).
 *
 * <p>Both sweeps turn a {@code VERB pattern} string straight from {@code RequestMappingHandlerMapping}
 * into a request that actually resolves to a handler, and both depend on getting that synthesis exactly
 * right: a mis-synthesized path answers {@code 404} and a mis-synthesized verb {@code 405}, either of
 * which looks like "the filter chain blocked it" to a guard that only asks whether the request was
 * dispatched. Keeping one definition here means that logic is verified once and cannot drift between
 * the two guards — and a new path-variable name is taught to both by editing {@link
 * #PATH_VARIABLE_SAMPLES} once.
 *
 * <p>The published surface is deliberately <strong>one method</strong>, {@link #probe}: the verb/pattern
 * split and the path-variable substitution are steps <em>within</em> synthesizing a request, not
 * services a sweep needs. Exposing them would widen the interface without giving either caller
 * leverage, and would invite a third caller to assemble its own probe from the parts — which is the
 * drift this class exists to prevent.
 *
 * <p>Every probe carries {@code csrf()} (the writes are CSRF-protected, and a token rejection would
 * mask the authorization answer) and a <strong>unique</strong> {@code X-Forwarded-For} from {@link
 * SessionLoginSupport#uniqueClientIp()}. The latter is not optional: {@code RateLimitFilter} runs
 * <em>ahead of</em> authorization in a cached Spring context, so probes sharing the default loopback
 * peer would exhaust a budget mid-run and answer {@code 429} — #127's failure, in which green scoped
 * batches became a CI-only wall of rejections.
 */
final class EndpointProbes {

	/** An empty JSON object parses, so a probed write fails in validation rather than in Jackson. */
	private static final String EMPTY_JSON_BODY = "{}";
	/** Sample values by path-variable name; anything unlisted becomes {@link #DEFAULT_SAMPLE}. */
	private static final Map<String, String> PATH_VARIABLE_SAMPLES = Map.of(
			"provider", "google",
			"code", "PROBE999",
			"rowLabel", "A",
			"slot", "COVER",
			"hash", "0123456789abcdef");
	private static final String DEFAULT_SAMPLE = "1";
	private static final Pattern PATH_VARIABLE = Pattern.compile("\\{([^/{}]+)}");
	private static final char VERB_SEPARATOR = ' ';

	private EndpointProbes() {
	}

	/**
	 * Builds a ready-to-perform request for one {@code VERB pattern} endpoint under the given principal.
	 *
	 * @param endpoint  a {@code VERB pattern} pair exactly as Spring maps it, e.g.
	 *                  {@code "GET /api/admin/venues/{venueId}/photos"}
	 * @param principal the authentication the probe rides — the whole point of a sweep is that the same
	 *                  endpoint is driven under several, so it is the caller's choice, not this class's
	 */
	static MockHttpServletRequestBuilder probe(String endpoint, RequestPostProcessor principal) {
		HttpMethod method = HttpMethod.valueOf(verbOf(endpoint));
		MockHttpServletRequestBuilder builder = request(method, concretePath(patternOf(endpoint)))
				.with(csrf())
				.with(principal)
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
		return HttpMethod.GET.equals(method) || HttpMethod.DELETE.equals(method)
				? builder
				: builder.contentType(MediaType.APPLICATION_JSON).content(EMPTY_JSON_BODY);
	}

	/** The HTTP verb half of a {@code VERB pattern} endpoint key. */
	private static String verbOf(String endpoint) {
		return endpoint.substring(0, endpoint.indexOf(VERB_SEPARATOR));
	}

	/** The URI-pattern half of a {@code VERB pattern} endpoint key, path variables still in braces. */
	private static String patternOf(String endpoint) {
		return endpoint.substring(endpoint.indexOf(VERB_SEPARATOR) + 1);
	}

	/** Substitute each {@code {var}} with a sample value, so the probe resolves to a real handler. */
	private static String concretePath(String pattern) {
		Matcher variable = PATH_VARIABLE.matcher(pattern);
		StringBuilder path = new StringBuilder();
		while (variable.find()) {
			variable.appendReplacement(path, Matcher.quoteReplacement(
					PATH_VARIABLE_SAMPLES.getOrDefault(variable.group(1), DEFAULT_SAMPLE)));
		}
		variable.appendTail(path);
		return path.toString();
	}
}
