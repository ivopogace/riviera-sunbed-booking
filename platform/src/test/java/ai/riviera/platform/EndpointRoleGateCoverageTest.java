package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * The recurrence guard for the defect class behind #316, #317 and #328: <strong>a mapped endpoint
 * with no explicit {@code SecurityConfig} rule</strong>, which falls through to
 * {@code anyRequest().authenticated()} where every authenticated principal — of either principal
 * type — passes the filter.
 *
 * <p>Three times the gap was found by a human audit after the fact. This test performs that audit on
 * every build: it enumerates <em>every</em> endpoint Spring MVC maps, drives each one with an
 * authenticated principal holding a role the application grants to nobody, and requires the security
 * filter chain to reject it before {@code DispatcherServlet} dispatches. The only endpoints allowed
 * through are the ones {@link #DECLARED_REACHABLE} names.
 *
 * <p><strong>Adding an endpoint?</strong> If this test fails naming yours, that is the point — pick one:
 * <ol>
 * <li>gate it in {@code SecurityConfig} with an explicit {@code requestMatchers(...)} rule (the usual
 * answer for anything operator-, admin-, or customer-scoped); or</li>
 * <li>if it is genuinely reachable by any caller — a public endpoint, or a surface deliberately left
 * to {@code anyRequest().authenticated()} — add it to {@link #DECLARED_REACHABLE} <em>with the reason
 * on its line</em>.</li>
 * </ol>
 * Editing the list is a deliberate, reviewable act; silently falling through is not.
 *
 * <p><strong>Why the probe cannot pass by accident.</strong> A request that was never dispatched
 * must also carry {@code 401} or {@code 403}. Without that second half, a mis-synthesized path
 * ({@code 404}), an unmapped verb ({@code 405}) or an exhausted rate-limit bucket ({@code 429} —
 * {@code RateLimitFilter} runs <em>ahead of</em> authorization) would all look exactly like "the
 * filter blocked it" and the guard would pass while verifying nothing. Every probe therefore also
 * carries a unique {@code X-Forwarded-For} (#127: shared buckets across a cached-context full-suite
 * run are how green scoped batches become a CI-only wall of {@code 429}s).
 *
 * <p><strong>Known limitation — this is an escalation guard, not a public-access guard.</strong> The
 * probe principal is <em>authenticated</em>, so a {@code permitAll} endpoint and one falling through to
 * {@code anyRequest().authenticated()} look identical to it: both dispatch. A {@code permitAll} rule
 * silently downgraded to authenticated-only would therefore not fail here — it would break anonymous
 * guest checkout, which the booking ITs and {@code CsrfProtectionIT} already cover from the other side.
 * What this guard owns is the opposite direction: a gated endpoint becoming reachable by a principal
 * that should not reach it.
 *
 * <p>Scope: {@code RequestMappingHandlerMapping} — the annotated controllers. Actuator endpoints are
 * {@code WebMvcEndpointHandlerMapping} entries, are not loaded by {@code @WebMvcTest}, and keep their
 * own exposure lockdown (#75). Lives in the root test package because the web slice imports the
 * package-private {@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class EndpointRoleGateCoverageTest {

	/**
	 * Endpoints an arbitrary authenticated principal may reach, each with the reason it is on the list.
	 * Everything else must be rejected by the filter chain. Keys are {@code VERB pattern}, exactly as
	 * Spring maps them.
	 */
	private static final Set<String> DECLARED_REACHABLE = Set.of(
			// permitAll — anonymous by definition: authentication happens inside the endpoint.
			"POST /api/auth/operator/login",
			"POST /api/auth/operator/register",
			"POST /api/auth/customer/login",
			"POST /api/auth/customer/register",
			// permitAll — the emailed token is the bearer credential (invariant #7), S8 #113.
			"POST /api/auth/customer/forgot-password",
			"POST /api/auth/customer/reset-password",
			"POST /api/auth/customer/verify-email",
			// permitAll — the OIDC redirect flow completes the exchange internally (S4 #112, D-3).
			"GET /api/auth/sso/{provider}/authorize",
			"GET /api/auth/sso/{provider}/callback",
			"GET /api/auth/sso/mock/{provider}/authorize",
			// permitAll — the public tourist catalogue + beach map (U1) and the photo serve (#142).
			"GET /api/venues",
			"GET /api/venues/{venueId}",
			"GET /api/venues/{venueId}/photos/{hash}",
			// permitAll — guest checkout is deliberately session-free; the booking code authorizes
			// the read and the cancel (invariant #7).
			"POST /api/bookings",
			"GET /api/bookings/{code}",
			"POST /api/bookings/{code}/cancel",
			// permitAll — server-to-server, authenticated by its Stripe signature header (invariant #8).
			"POST /api/payments/stripe/webhook",
			// The ONE deliberate fall-through to anyRequest().authenticated(): the reload-restore read
			// serves BOTH principal types by design, so no single role gate fits (SecurityConfig ~L217).
			"GET /api/auth/me");

	/**
	 * Only this application's controllers are probed. Boot contributes {@code BasicErrorController}
	 * ({@code /error}, no explicit verb), which is the servlet ERROR-dispatch target rather than an
	 * endpoint a client calls, and is outside the {@code /api/**} security chain entirely.
	 */
	private static final String APPLICATION_PACKAGE = "ai.riviera.platform";
	/** A principal that authenticates but holds no authority the application grants anywhere. */
	private static final String PROBE_ROLE = "NOBODY";
	private static final String PROBE_USER = "probe";
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

	@Autowired
	MockMvc mvc;

	@Autowired
	RequestMappingHandlerMapping handlerMapping;

	@Test
	void everyMappedEndpointIsGatedOrDeclaredReachable() throws Exception {
		List<String> violations = new ArrayList<>();
		Set<String> endpoints = mappedEndpoints();

		// The declared entries are the anchors: without them a shrunk enumeration would pass vacuously.
		assertThat(endpoints)
				.as("every declared-reachable endpoint must still be mapped — a missing one means the "
						+ "endpoint was removed (drop the declaration) or the enumeration broke")
				.containsAll(DECLARED_REACHABLE);

		for (String endpoint : endpoints) {
			String verb = endpoint.substring(0, endpoint.indexOf(' '));
			String pattern = endpoint.substring(endpoint.indexOf(' ') + 1);
			MvcResult result = mvc.perform(probe(verb, pattern)).andReturn();
			boolean dispatched = result.getHandler() != null;
			int status = result.getResponse().getStatus();

			if (DECLARED_REACHABLE.contains(endpoint)) {
				if (!dispatched) {
					violations.add(endpoint + " is declared reachable but the filter chain blocked it ("
							+ status + ") — the declaration is stale, or a new rule now gates it");
				}
			}
			else if (dispatched) {
				violations.add(endpoint + " reached " + result.getHandler() + " — no SecurityConfig rule "
						+ "gates it, so any authenticated principal passes the filter");
			}
			else if (status != HttpStatus.UNAUTHORIZED.value() && status != HttpStatus.FORBIDDEN.value()) {
				violations.add(endpoint + " was not dispatched but answered " + status + " — the probe "
						+ "never reached authorization, so this endpoint is UNVERIFIED (bad sample path?)");
			}
		}

		assertThat(violations)
				.as("every mapped endpoint must be gated by an explicit SecurityConfig rule or declared "
						+ "reachable — see this class's javadoc for the two legal resolutions")
				.isEmpty();
	}

	/** Every mapped {@code VERB pattern}, sorted so a failure list reads the same on every run. */
	private Set<String> mappedEndpoints() {
		Set<String> endpoints = new TreeSet<>();
		handlerMapping.getHandlerMethods().forEach((info, handler) -> {
			if (!handler.getBeanType().getPackageName().startsWith(APPLICATION_PACKAGE)) {
				return; // framework-supplied, e.g. Boot's BasicErrorController on /error
			}
			Set<String> patterns = info.getPatternValues();
			Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
			assertThat(methods)
					.as("%s maps no HTTP method, so this guard cannot probe it — give it an explicit verb",
							handler)
					.isNotEmpty();
			methods.forEach(method -> patterns.forEach(pattern -> endpoints.add(method + " " + pattern)));
		});
		assertThat(endpoints)
				.as("the handler mapping is empty — the web slice did not register the controllers, so a "
						+ "green run here would prove nothing")
				.isNotEmpty();
		return endpoints;
	}

	private static MockHttpServletRequestBuilder probe(String verb, String pattern) {
		HttpMethod method = HttpMethod.valueOf(verb);
		MockHttpServletRequestBuilder builder = request(method, concretePath(pattern))
				.with(csrf())
				.with(user(PROBE_USER).roles(PROBE_ROLE))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
		return HttpMethod.GET.equals(method) || HttpMethod.DELETE.equals(method)
				? builder
				: builder.contentType(MediaType.APPLICATION_JSON).content(EMPTY_JSON_BODY);
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
