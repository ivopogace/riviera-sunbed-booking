package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.concurrent.atomic.AtomicInteger;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import static ai.riviera.platform.WebSliceStubs.fromIp;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the booking-endpoint rate limiter (issue #56). Tiny limits (capacity 2, refill an
 * hour out so nothing replenishes mid-test) make the over-limit boundary cheap to hit; the fixed clock
 * keeps every bucket frozen. Each test uses unique IPs/codes so buckets don't collide across methods
 * sharing the slice's context. An allowed request is a {@code 404} (stubbed unknown code/set); a
 * {@code 429} is unambiguously the limiter.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = {
		// The deployed default is now empty (same-origin since #110); this preflight test needs
		// an explicit allowed origin — declare it rather than lean on the default.
		"app.web.cors.allowed-origins=https://ivopogace.github.io",
		"riviera.ratelimit.enabled=true",
		"riviera.ratelimit.per-ip.capacity=2",
		"riviera.ratelimit.per-ip.refill-period=PT1H",
		"riviera.ratelimit.per-code.capacity=2",
		"riviera.ratelimit.per-code.refill-period=PT1H",
		"riviera.ratelimit.login.capacity=2",
		"riviera.ratelimit.login.refill-period=PT1H",
		"riviera.ratelimit.username.capacity=2",
		"riviera.ratelimit.username.refill-period=PT1H",
		"riviera.ratelimit.max-tracked-keys=100000",
})
class RateLimitFilterTest {

	private static final String ALLOWED_ORIGIN = "https://ivopogace.github.io";
	private static final String CREATE_BODY = """
			{"setId": 1, "bookingDate": "2030-01-01",
			 "contact": {"email": "h@e.com", "fullName": "Guest", "phone": "+355699"}}
			""";

	@Autowired
	MockMvc mvc;

	private ResultActions viewFromIp(String ip, String code) throws Exception {
		return mvc.perform(get("/api/bookings/{code}", code).with(fromIp(ip)));
	}

	@Test
	void perIpOverLimitIs429() throws Exception {
		String ip = "10.1.0.1";
		viewFromIp(ip, "perip-A").andExpect(status().isNotFound());
		viewFromIp(ip, "perip-B").andExpect(status().isNotFound());
		viewFromIp(ip, "perip-C")
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"))
				.andExpect(jsonPath("$.status").value(429));
	}

	@Test
	void perIpIsKeyedByClientIp() throws Exception {
		viewFromIp("10.2.0.1", "kip-A").andExpect(status().isNotFound());
		viewFromIp("10.2.0.1", "kip-B").andExpect(status().isNotFound());
		viewFromIp("10.2.0.1", "kip-C").andExpect(status().isTooManyRequests()); // IP exhausted

		// A different IP keeps its own budget.
		viewFromIp("10.2.0.2", "kip-D").andExpect(status().isNotFound());
	}

	@Test
	void perCodeOverLimitIs429() throws Exception {
		// Same code from three distinct IPs: each IP bucket is untouched, so only the per-code
		// bucket can trip — isolating the code dimension.
		viewFromIp("10.3.0.1", "percode-Z").andExpect(status().isNotFound());
		viewFromIp("10.3.0.2", "percode-Z").andExpect(status().isNotFound());
		viewFromIp("10.3.0.3", "percode-Z")
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	@Test
	void perCodeIsKeyedByCode() throws Exception {
		viewFromIp("10.4.0.1", "kcode-Y").andExpect(status().isNotFound());
		viewFromIp("10.4.0.2", "kcode-Y").andExpect(status().isNotFound());
		viewFromIp("10.4.0.3", "kcode-Y").andExpect(status().isTooManyRequests()); // code exhausted

		// A different code from a fresh IP is unaffected.
		viewFromIp("10.4.0.4", "kcode-W").andExpect(status().isNotFound());
	}

	@Test
	void createIsPerIpLimited() throws Exception {
		String ip = "10.5.0.1";
		for (int i = 0; i < 2; i++) {
			mvc.perform(post("/api/bookings").with(fromIp(ip))
							.contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
					.andExpect(status().isNotFound()); // stub: NO_SUCH_SET
		}
		mvc.perform(post("/api/bookings").with(fromIp(ip))
						.contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	// ---- The session login is per-IP limited on its own budget (issue #109, D-8) ----

	// A unique identity per call, so a test exercising ONLY the per-IP login dimension never
	// accumulates on the per-username bucket (issue #292) — the username analogue of uniqueClientIp().
	private static final AtomicInteger IDENTITY_SEQ = new AtomicInteger();

	private static String uniqueUsername() {
		return "user-" + IDENTITY_SEQ.incrementAndGet();
	}

	private static String uniqueEmail() {
		return "user-" + IDENTITY_SEQ.incrementAndGet() + "@example.com";
	}

	/** An operator login for an EXPLICIT username (fixed, so the per-username bucket can be exercised). */
	private ResultActions operatorLogin(String ip, String username) throws Exception {
		// csrf() satisfies the CSRF gate (the limiter runs BEFORE CsrfFilter); the stubbed empty
		// credential store means an allowed attempt lands as the generic 401 — a 429 is the limiter.
		return mvc.perform(post("/api/auth/operator/login").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\": \"%s\", \"password\": \"nope\"}".formatted(username)));
	}

	/** A customer login for an EXPLICIT email (fixed, so the per-email bucket can be exercised). */
	private ResultActions customerLogin(String ip, String email) throws Exception {
		return mvc.perform(post("/api/auth/customer/login").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\": \"%s\", \"password\": \"nope-nope\"}".formatted(email)));
	}

	private ResultActions loginFromIp(String ip) throws Exception {
		return operatorLogin(ip, uniqueUsername());
	}

	@Test
	void loginIsPerIpLimited() throws Exception {
		loginFromIp("10.9.0.1").andExpect(status().isUnauthorized());
		loginFromIp("10.9.0.1").andExpect(status().isUnauthorized());
		loginFromIp("10.9.0.1")
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// A different IP keeps its own login budget.
		loginFromIp("10.9.0.2").andExpect(status().isUnauthorized());
	}

	@Test
	void loginBudgetIsSeparateFromTheBookingBudget() throws Exception {
		String ip = "10.10.0.1";
		// Exhaust the BOOKING per-IP budget…
		viewFromIp(ip, "sep-A").andExpect(status().isNotFound());
		viewFromIp(ip, "sep-B").andExpect(status().isNotFound());
		viewFromIp(ip, "sep-C").andExpect(status().isTooManyRequests());

		// …and the same IP's LOGIN budget is untouched (separate dimension, stricter default).
		loginFromIp(ip).andExpect(status().isUnauthorized());
	}

	// ---- Customer login + registration ride the same login budget (S2 #111, D-8) ----

	private ResultActions customerLoginFromIp(String ip) throws Exception {
		return customerLogin(ip, uniqueEmail());
	}

	private ResultActions registerFromIp(String ip) throws Exception {
		// The stub provisioning returns AlreadyRegistered → an allowed attempt is the generic 201
		// (non-enumeration); a 429 is the limiter.
		return mvc.perform(post("/api/auth/customer/register").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "new@example.com", "password": "password123"}"""));
	}

	@Test
	void customerLoginAndRegisterConsumeTheLoginBudget() throws Exception {
		// Customer login (its own IP): allowed attempts are 401, the over-budget one is 429.
		customerLoginFromIp("10.11.0.1").andExpect(status().isUnauthorized());
		customerLoginFromIp("10.11.0.1").andExpect(status().isUnauthorized());
		customerLoginFromIp("10.11.0.1")
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// Registration (fresh IP) rides the customer-auth budget: allowed attempts are 201, the 3rd is 429.
		registerFromIp("10.11.0.2").andExpect(status().isCreated());
		registerFromIp("10.11.0.2").andExpect(status().isCreated());
		registerFromIp("10.11.0.2")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	@Test
	void customerAuthBudgetIsSeparateFromOperatorLogin() throws Exception {
		// F1 fix (S2 #111): exhaust the CUSTOMER-auth budget from an IP (a burst of tourist registers)…
		String ip = "10.12.0.1";
		registerFromIp(ip).andExpect(status().isCreated());
		registerFromIp(ip).andExpect(status().isCreated());
		registerFromIp(ip).andExpect(status().isTooManyRequests());

		// …and the SAME IP's operator-login budget is untouched — tourist traffic must never lock an
		// operator out of the console from a shared WiFi / CGNAT IP.
		loginFromIp(ip).andExpect(status().isUnauthorized());
	}

	// ---- Operator self-service password change rides its OWN per-IP budget (#326, D-8) ----

	/**
	 * An anonymous attempt is enough to exercise the budget: {@code RateLimitFilter} runs <em>ahead of</em>
	 * authorization, so the request spends a token and then lands as the endpoint's {@code 401} — which
	 * makes a {@code 429} unambiguously the limiter, the same oracle every other test here uses.
	 */
	private ResultActions changePasswordFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/auth/operator/password").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""));
	}

	/**
	 * AC-8 / R-5. The #111 review found a real operator lockout caused by a shared bucket, so both halves
	 * are asserted: the change endpoint <em>does</em> throttle, and operator login from the SAME IP still
	 * works afterwards. A change flood must never cost an operator the ability to sign in.
	 */
	@Test
	void credentialChangeFloodDoesNotStarveOperatorLogin() throws Exception {
		String ip = "10.30.0.1";
		changePasswordFromIp(ip).andExpect(status().isUnauthorized());
		changePasswordFromIp(ip).andExpect(status().isUnauthorized());
		changePasswordFromIp(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// The whole point of a separate map: the same IP's operator-login budget is untouched.
		loginFromIp(ip).andExpect(status().isUnauthorized());
	}

	@Test
	void credentialChangeBudgetIsKeyedByClientIp() throws Exception {
		changePasswordFromIp("10.30.0.2").andExpect(status().isUnauthorized());
		changePasswordFromIp("10.30.0.2").andExpect(status().isUnauthorized());
		changePasswordFromIp("10.30.0.2").andExpect(status().isTooManyRequests());

		// A different IP keeps its own budget.
		changePasswordFromIp("10.30.0.3").andExpect(status().isUnauthorized());
	}

	/** The customer's authenticated set/change-password endpoint — the same oracle, throttled the same way. */
	private ResultActions customerPasswordChangeFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/me/password").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""));
	}

	/**
	 * Found by the #326 Phase-1 generalization audit: {@code POST /api/me/password} had no budget at all,
	 * so a hijacked customer session could brute-force the real password unthrottled and then lock the
	 * owner out. Same oracle as the operator endpoint, so it gets the same treatment.
	 */
	@Test
	void customerPasswordChangeIsThrottled() throws Exception {
		String ip = "10.31.0.1";
		customerPasswordChangeFromIp(ip).andExpect(status().isUnauthorized());
		customerPasswordChangeFromIp(ip).andExpect(status().isUnauthorized());
		customerPasswordChangeFromIp(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// Separate from the customer LOGIN budget, so a change flood cannot lock a tourist out of signing in.
		customerLoginFromIp(ip).andExpect(status().isUnauthorized());
	}

	/**
	 * The two password-change endpoints must not share one per-IP map. Venue WiFi / CGNAT puts tourists and
	 * operators behind one address, and a tourist flood that blocked an operator from rotating a possibly
	 * compromised credential is the #111 operator-lockout defect wearing a different hat.
	 */
	@Test
	void customerPasswordChangeDoesNotStarveTheOperatorOne() throws Exception {
		String ip = "10.31.0.2";
		customerPasswordChangeFromIp(ip).andExpect(status().isUnauthorized());
		customerPasswordChangeFromIp(ip).andExpect(status().isUnauthorized());
		customerPasswordChangeFromIp(ip).andExpect(status().isTooManyRequests());

		changePasswordFromIp(ip).andExpect(status().isUnauthorized());
	}

	// ---- Per-submitted-identity login budget, keyed on username/email not IP (issue #292) ----

	@Test
	void perUsernameOverLimitIs429AcrossIps() throws Exception {
		// AC-1: the SAME username from THREE DIFFERENT client IPs. Each per-IP login bucket (cap 2) is
		// hit once, so it cannot trip — a 429 is unambiguously the per-username budget (cap 2). Only
		// failed logins (401, empty stub store) consume it, so the 3rd attempt finds it empty.
		operatorLogin("10.20.0.1", "victim").andExpect(status().isUnauthorized());
		operatorLogin("10.20.0.2", "victim").andExpect(status().isUnauthorized());
		operatorLogin("10.20.0.3", "victim")
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"))
				// AC-6: the body is the fixed neutral ProblemDetail — it carries no identity field.
				.andExpect(jsonPath("$.detail").value("Too many requests. Retry later."));
	}

	@Test
	void perUsernameBucketsAreKeyedByIdentity() throws Exception {
		// AC-2: exhaust one username's budget across IPs…
		operatorLogin("10.21.0.1", "alice").andExpect(status().isUnauthorized());
		operatorLogin("10.21.0.2", "alice").andExpect(status().isUnauthorized());
		operatorLogin("10.21.0.3", "alice").andExpect(status().isTooManyRequests());

		// …a DIFFERENT username from fresh IPs is unaffected — separate bucket.
		operatorLogin("10.21.0.4", "bob").andExpect(status().isUnauthorized());
		operatorLogin("10.21.0.5", "bob").andExpect(status().isUnauthorized());
	}

	@Test
	void customerLoginPerEmailBucketIsCaseAndWhitespaceInsensitive() throws Exception {
		// AC-3: three case/whitespace variants of ONE email from three IPs share ONE normalised bucket
		// (cap 2), so the 3rd trips — proving the key is the trim+lowercase email, not the raw string.
		customerLogin("10.22.0.1", "Victim@Example.com").andExpect(status().isUnauthorized());
		customerLogin("10.22.0.2", " victim@example.com ").andExpect(status().isUnauthorized());
		customerLogin("10.22.0.3", "VICTIM@EXAMPLE.COM")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	@Test
	void identityIsNeverLogged() throws Exception {
		// AC-5: capture everything the filter logs at DEBUG while a per-username 429 fires, and assert the
		// submitted username (PII + a credential half) never appears — only the sanitised IP + dimension do.
		Logger filterLogger = (Logger) LoggerFactory.getLogger(RateLimitFilter.class);
		Level original = filterLogger.getLevel();
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		filterLogger.setLevel(Level.DEBUG);
		filterLogger.addAppender(appender);
		try {
			String username = "SecretUser42";
			operatorLogin("10.23.0.1", username).andExpect(status().isUnauthorized());
			operatorLogin("10.23.0.2", username).andExpect(status().isUnauthorized());
			operatorLogin("10.23.0.3", username).andExpect(status().isTooManyRequests());

			boolean leaked = appender.list.stream()
					.map(ILoggingEvent::getFormattedMessage)
					.anyMatch(message -> message.contains(username));
			assertFalse(leaked, "the submitted identity must never appear in logs (AC-5)");
		}
		finally {
			filterLogger.detachAppender(appender);
			filterLogger.setLevel(original);
		}
	}

	@Test
	void numericUsernameIsPerUsernameThrottledLikeTheControllerBindsIt() throws Exception {
		// A JSON number for username: the login DTO coerces it to its String field, so the filter must key
		// on the same value (not skip it as "not a string"), else an all-digits username bypasses the
		// per-identity dimension. Three attempts (cap 2) from distinct IPs → the 3rd is the per-username 429.
		numericUsernameLogin("10.27.0.1").andExpect(status().isUnauthorized());
		numericUsernameLogin("10.27.0.2").andExpect(status().isUnauthorized());
		numericUsernameLogin("10.27.0.3")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private ResultActions numericUsernameLogin(String ip) throws Exception {
		return mvc.perform(post("/api/auth/operator/login").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\": 1234567, \"password\": \"nope\"}"));
	}

	@Test
	void malformedLoginBodyIsNotPerUsernameThrottledAndStillReachesTheController() throws Exception {
		// A malformed body: the filter cannot extract an identity, so it applies NO per-username bucket,
		// and the wrapped body still reaches the controller (which 400s the unreadable JSON). Repeating
		// from distinct IPs never yields a per-username 429 — there is no identity to key on.
		for (int i = 1; i <= 3; i++) {
			mvc.perform(post("/api/auth/operator/login").with(fromIp("10.24.0." + i)).with(csrf())
							.contentType(MediaType.APPLICATION_JSON).content("not-json"))
					.andExpect(status().isBadRequest());
		}
	}

	@Test
	void loginBodyWithoutAnIdentityFieldIsNotPerUsernameThrottled() throws Exception {
		// Valid JSON but no username field: no identity to key on → no per-username bucket. The controller
		// rejects the missing credential (400); three from distinct IPs never 429 on the username dimension.
		for (int i = 1; i <= 3; i++) {
			mvc.perform(post("/api/auth/operator/login").with(fromIp("10.25.0." + i)).with(csrf())
							.contentType(MediaType.APPLICATION_JSON).content("{\"password\": \"nope\"}"))
					.andExpect(status().isBadRequest());
		}
	}

	@Test
	void oversizedLoginBodySkipsIdentityBufferingButStillAuthenticates() throws Exception {
		// A login body beyond the 8 KiB buffer cap is not read for an identity (per-IP still applies); the
		// original, unwrapped stream reaches the controller, which authenticates it (401, empty stub store).
		String hugePassword = "x".repeat(9000);
		mvc.perform(post("/api/auth/operator/login").with(fromIp("10.26.0.1")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\": \"whoever\", \"password\": \"%s\"}".formatted(hugePassword)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void usesForwardedForClientIp() throws Exception {
		// The XFF client is constant while the socket address varies → the limiter must key on XFF.
		mvc.perform(get("/api/bookings/{code}", "xff-A")
				.header("X-Forwarded-For", "203.0.113.50").with(fromIp("10.6.0.1")))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/bookings/{code}", "xff-B")
				.header("X-Forwarded-For", "203.0.113.50").with(fromIp("10.6.0.2")))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/bookings/{code}", "xff-C")
				.header("X-Forwarded-For", "203.0.113.50").with(fromIp("10.6.0.3")))
				.andExpect(status().isTooManyRequests());

		// A different forwarded client is unaffected.
		mvc.perform(get("/api/bookings/{code}", "xff-D")
				.header("X-Forwarded-For", "203.0.113.99").with(fromIp("10.6.0.4")))
				.andExpect(status().isNotFound());
	}

	// ---- Trusted-proxy client-IP resolution closes the XFF-rotation bypass (#129) ----

	private ResultActions loginFromProxiedClient(String peer, String forwardedFor) throws Exception {
		// Unique username per call so this per-IP-dimension test never trips the per-username bucket (#292).
		return mvc.perform(post("/api/auth/operator/login").with(fromIp(peer)).with(csrf())
				.header("X-Forwarded-For", forwardedFor)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\": \"%s\", \"password\": \"nope\"}".formatted(uniqueUsername())));
	}

	/**
	 * One client behind the trusted proxy rotates a forged prefix per attempt while the proxy-appended
	 * tail (its true address) stays constant — all three attempts must share ONE bucket.
	 */
	@Test
	void spoofedForwardedPrefixCannotEscapeLoginBucket() throws Exception {
		loginFromProxiedClient("10.13.0.1", "6.6.6.1, 203.0.113.66").andExpect(status().isUnauthorized());
		loginFromProxiedClient("10.13.0.1", "6.6.6.2, 203.0.113.66").andExpect(status().isUnauthorized());
		loginFromProxiedClient("10.13.0.1", "6.6.6.3, 203.0.113.66")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	// ---- One client, many edge nodes: still ONE bucket (#286) ----

	private ResultActions loginViaEdge(String client, String edge) throws Exception {
		// Unique username per call so this per-IP-dimension test never trips the per-username bucket (#292).
		return mvc.perform(post("/api/auth/operator/login").with(fromIp("10.14.0.1")).with(csrf())
				.header("X-Forwarded-For", client + ", " + edge)
				.header("CF-Connecting-IP", client)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\": \"%s\", \"password\": \"nope\"}".formatted(uniqueUsername())));
	}

	/**
	 * The production defect (#286): one client is load-balanced across Cloudflare edge nodes, so the
	 * right-most forwarded hop — the one Render appended — varies per request. Keyed on that hop it is
	 * ~14 buckets; keyed on the edge-supplied client header it is one. The trust list here is the
	 * SHIPPED default (private ranges only, no Cloudflare CIDRs), so this fails without the header path.
	 */
	@Test
	void oneClientBehindRotatingEdgeNodesSharesOneLoginBucket() throws Exception {
		loginViaEdge("203.0.113.90", "162.158.1.1").andExpect(status().isUnauthorized());
		loginViaEdge("203.0.113.90", "104.16.2.2").andExpect(status().isUnauthorized());
		loginViaEdge("203.0.113.90", "172.64.3.3")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	@Test
	void forwardedForFromUntrustedPeerIsIgnored() throws Exception {
		// A directly-connecting public client rotating XFF stays keyed on its socket address.
		String peer = "203.0.113.80";
		mvc.perform(get("/api/bookings/{code}", "untrusted-A").with(fromIp(peer))
				.header("X-Forwarded-For", "1.1.1.1")).andExpect(status().isNotFound());
		mvc.perform(get("/api/bookings/{code}", "untrusted-B").with(fromIp(peer))
				.header("X-Forwarded-For", "2.2.2.2")).andExpect(status().isNotFound());
		mvc.perform(get("/api/bookings/{code}", "untrusted-C").with(fromIp(peer))
				.header("X-Forwarded-For", "3.3.3.3")).andExpect(status().isTooManyRequests());
	}

	@Test
	void bookingCodeIsNeverLogged() throws Exception {
		// Capture everything the filter logs at DEBUG while a per-code 429 fires, and assert the code
		// (the bearer credential, invariant #7) never appears — it is only ever a map key (AC-10).
		Logger filterLogger = (Logger) LoggerFactory.getLogger(RateLimitFilter.class);
		Level original = filterLogger.getLevel();
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		filterLogger.setLevel(Level.DEBUG);
		filterLogger.addAppender(appender);
		try {
			String code = "SECRETCODE9";
			// Exhaust the per-code bucket (cap 2) from distinct IPs so the 429 is the code dimension.
			viewFromIp("10.8.0.1", code).andExpect(status().isNotFound());
			viewFromIp("10.8.0.2", code).andExpect(status().isNotFound());
			viewFromIp("10.8.0.3", code).andExpect(status().isTooManyRequests());

			boolean codeLeaked = appender.list.stream()
					.map(ILoggingEvent::getFormattedMessage)
					.anyMatch(message -> message.contains(code));
			assertFalse(codeLeaked, "the booking code must never appear in logs (invariant #7)");
		}
		finally {
			filterLogger.detachAppender(appender);
			filterLogger.setLevel(original);
		}
	}

	@Test
	void preflightIsNotCounted() throws Exception {
		String ip = "10.7.0.1";
		// Five preflights (> capacity 2) must never be rate-limited.
		for (int i = 0; i < 5; i++) {
			mvc.perform(options("/api/bookings/{code}", "preflight")
							.header("Origin", ALLOWED_ORIGIN)
							.header("Access-Control-Request-Method", "GET")
							.with(fromIp(ip)))
					.andExpect(status().isOk());
		}
		// And the IP's real budget is intact afterwards.
		viewFromIp(ip, "pf-real-A").andExpect(status().isNotFound());
		viewFromIp(ip, "pf-real-B").andExpect(status().isNotFound());
	}
}
