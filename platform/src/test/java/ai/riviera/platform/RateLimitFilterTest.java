package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentCustomer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.net.URI;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import static ai.riviera.platform.WebSliceStubs.fromIp;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the booking-endpoint rate limiter. Tiny limits (capacity 2, refill an
 * hour out so nothing replenishes mid-test) make the over-limit boundary cheap to hit; the fixed clock
 * keeps every bucket frozen. Each test uses unique IPs/codes so buckets don't collide across methods
 * sharing the slice's context. An allowed request is a {@code 404} (stubbed unknown code/set); a
 * {@code 429} is unambiguously the limiter.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = {
		// The deployed default is now empty (same-origin); this preflight test needs
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

	/**
	 * Overrides the {@link WebSliceStubs} bean, which resolves every principal to {@link Optional#empty()}.
	 * That default makes {@code CurrentCustomer#require} throw {@code AccessDeniedException}, so an
	 * authenticated {@code /api/me/password} call would answer {@code 403} — a status the refund treats
	 * as "never reached the credential check". The customer-side budget could then never be exercised
	 * authenticated at all, so the resolution is stubbed to succeed here.
	 */
	@MockitoBean
	CustomerAccountDirectory customerAccountDirectory;

	/**
	 * Overrides the {@link WebSliceStubs} bean for the same reason: its default resolves every email to
	 * {@link Optional#empty()}, which sends {@code MyAccountController#setPassword} down the SSO-onboarding
	 * "no password yet" branch — so the customer tests would assert throttling on a path that never reaches
	 * the credential check, while their operator twins do. Stubbed per-email rather than for {@code any()}
	 * so the customer <em>login</em> tests below keep their empty-store {@code 401}.
	 */
	@MockitoBean
	CustomerAccounts customerAccounts;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void resolveTheSignedInCustomer() {
		when(customerAccountDirectory.accountFor(any())).thenReturn(Optional.of(new CustomerAccountId(1)));
		when(customerAccounts.findByEmail(any())).thenReturn(Optional.empty());
		when(customerAccounts.findByEmail(TEST_CUSTOMER)).thenReturn(Optional.of(
				new CustomerAccountCredential(TEST_CUSTOMER, passwordEncoder.encode("not-the-submitted-one"))));
	}

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

	/**
	 * The withdraw POST is a code-keyed booking endpoint like view and cancel, so it must draw the
	 * per-code budget. An unmatched path would spend no token and still reach the controller — an
	 * unthrottled oracle against the very bearer credential the budget exists to protect.
	 */
	@Test
	void withdrawSpendsThePerCodeBudget() throws Exception {
		// Same code from three distinct IPs, so only the per-code bucket can trip.
		withdrawFromIp("10.20.0.1", "wdcode-Q").andExpect(status().isNotFound());
		withdrawFromIp("10.20.0.2", "wdcode-Q").andExpect(status().isNotFound());
		withdrawFromIp("10.20.0.3", "wdcode-Q")
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	/** The withdraw budget is the SAME per-code bucket as the view's — one secret, one budget. */
	@Test
	void withdrawAndViewShareOneCodeBudget() throws Exception {
		viewFromIp("10.21.0.1", "wdshare-R").andExpect(status().isNotFound());
		withdrawFromIp("10.21.0.2", "wdshare-R").andExpect(status().isNotFound());
		withdrawFromIp("10.21.0.3", "wdshare-R")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private ResultActions withdrawFromIp(String ip, String code) throws Exception {
		// No csrf() on purpose (the path is exempt): an allowed attempt is a 404, a 429 is the limiter.
		return mvc.perform(post("/api/bookings/{code}/withdraw", code).with(fromIp(ip)));
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

	// ---- The session login is per-IP limited on its own budget (D-8) ----

	// A unique identity per call, so a test exercising ONLY the per-IP login dimension never
	// accumulates on the per-username bucket — the username analogue of uniqueClientIp().
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

	// ---- Customer login + registration ride the same login budget (D-8) ----

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
		// Exhaust the CUSTOMER-auth budget from an IP (a burst of tourist registers)…
		String ip = "10.12.0.1";
		registerFromIp(ip).andExpect(status().isCreated());
		registerFromIp(ip).andExpect(status().isCreated());
		registerFromIp(ip).andExpect(status().isTooManyRequests());

		// …and the SAME IP's operator-login budget is untouched — tourist traffic must never lock an
		// operator out of the console from a shared WiFi / CGNAT IP.
		loginFromIp(ip).andExpect(status().isUnauthorized());
	}

	// ---- Operator self-service password change rides its OWN per-IP budget (D-8) ----

	/**
	 * An <strong>anonymous</strong> attempt at the operator change endpoint. The filter runs ahead of
	 * authorization, so such a request reaches the budget — but its token is refunded, which is why this
	 * helper drives the "must not drain" cases while {@link #authenticatedChangePasswordFromIp} drives
	 * the budget itself.
	 */
	private ResultActions changePasswordFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/auth/operator/password").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""));
	}

	/**
	 * A shared bucket once caused a real operator lockout, so both halves are asserted: the change
	 * endpoint <em>does</em> throttle, and operator login from the SAME IP still works afterwards. Only a
	 * signed-in caller net-spends the budget, which is the stronger test — it is the signed-in caller
	 * that reaches the credential oracle the budget exists to throttle.
	 */
	@Test
	void authenticatedOperatorPasswordChangesAreStillThrottled() throws Exception {
		String ip = "10.30.0.1";
		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());
		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());
		authenticatedChangePasswordFromIp(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// The whole point of a separate map: the same IP's operator-login budget is untouched.
		loginFromIp(ip).andExpect(status().isUnauthorized());
	}

	/**
	 * A CSRF-less change is rejected by {@code CsrfFilter} with a {@code 403}, before the controller and
	 * therefore before the credential check — so it must cost nothing. This is the deliberate give-up
	 * documented on {@code AuthBudget}: a token-less flood is free, because the chain throws it away
	 * without a database read, a bcrypt or a mail send.
	 */
	@Test
	void aCsrfRejectedPasswordChangeDoesNotSpendTheBudget() throws Exception {
		String ip = "10.30.0.4";
		for (int i = 0; i < 10; i++) {
			mvc.perform(post("/api/auth/operator/password").with(fromIp(ip))
							.with(user(TEST_OPERATOR).roles("OPERATOR"))
							.contentType(MediaType.APPLICATION_JSON)
							.content("""
									{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""))
					.andExpect(status().isForbidden());
		}

		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());
	}

	/**
	 * The budget must key on the path Spring <em>routes</em> on, not the bytes the client sent. The filter
	 * compared the raw {@code getRequestURI()} — which the servlet spec leaves percent-encoded — against
	 * plain string constants, while {@code PathPatternRequestMatcher} and {@code @PostMapping} both match
	 * the DECODED path. So {@code …/passwor%64} spent no token yet still reached the controller: an
	 * unlimited brute-force oracle against the very credential this endpoint exists to protect, on every
	 * budget in this filter, login included.
	 */
	@Test
	void aPercentEncodedSpellingOfThePathDrawsOnTheSameBudget() throws Exception {
		String ip = "10.30.0.9";
		// Authenticated: an anonymous drain is refunded, so it could no longer set up this probe.
		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());
		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());

		// URI.create, NOT post(String): the string overload re-encodes, turning %64 into %2564 — which the
		// firewall then rejects as an encoded percent, so the test would pass on the wrong mechanism.
		mvc.perform(post(URI.create("/api/auth/operator/passwor%64")).with(fromIp(ip)).with(csrf())
				.with(user(TEST_OPERATOR).roles("OPERATOR"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""))
				.andExpect(status().isTooManyRequests());
	}

	/** The same bypass on the pre-existing operator-login budget — the one an earlier lockout was about. */
	@Test
	void aPercentEncodedLoginPathDrawsOnTheLoginBudget() throws Exception {
		String ip = "10.30.0.10";
		for (int i = 0; i < 10; i++) {
			loginFromIp(ip);
		}
		mvc.perform(post(URI.create("/api/auth/operator/logi%6E")).with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "someone", "password": "irrelevant"}"""))
				.andExpect(status().isTooManyRequests());
	}

	/**
	 * Matrix parameters are the same class of bypass, but the rate limiter is not what stops them:
	 * {@code StrictHttpFirewall} rejects a {@code ;} outright, before any filter of ours runs — which is
	 * why {@code pathWithinApplication} deliberately does not strip them. Pinned as a tripwire: relax the
	 * firewall and this test fails, rather than the hole opening silently.
	 */
	@Test
	void aMatrixParameterSuffixIsRejectedByTheFirewallBeforeItReachesTheLimiter() throws Exception {
		mvc.perform(post(URI.create("/api/auth/operator/password;a=b")).with(fromIp("10.30.0.11")).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""))
				.andExpect(status().isBadRequest());
	}

	/**
	 * A malformed escape must not blow up the filter: a {@code %} that is not a valid escape reaches
	 * {@code UriUtils.decode} and throws, and the budget lookup has to survive that. The raw form is kept —
	 * it matches no budget, and the request still meets the rest of the chain (which rejects it).
	 */
	@Test
	void aMalformedEscapeKeepsTheRawPathInsteadOfThrowing() {
		assertEquals("/api/auth/operator/password", RateLimitFilter.decodePath("/api/auth/operator/passwor%64"));
		assertEquals("/api/auth/operator/passwor%zz", RateLimitFilter.decodePath("/api/auth/operator/passwor%zz"));
	}

	@Test
	void credentialChangeBudgetIsKeyedByClientIp() throws Exception {
		authenticatedChangePasswordFromIp("10.30.0.2").andExpect(status().isBadRequest());
		authenticatedChangePasswordFromIp("10.30.0.2").andExpect(status().isBadRequest());
		authenticatedChangePasswordFromIp("10.30.0.2").andExpect(status().isTooManyRequests());

		// A different IP keeps its own budget.
		authenticatedChangePasswordFromIp("10.30.0.3").andExpect(status().isBadRequest());
	}

	/** An <strong>anonymous</strong> attempt at the customer endpoint — refunded, like its twin. */
	private ResultActions customerPasswordChangeFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/me/password").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""));
	}

	/**
	 * {@code POST /api/me/password} once had no budget at all, so a hijacked customer session could
	 * brute-force the real password unthrottled and then lock the owner out. Same oracle as the operator
	 * endpoint, so it gets the same treatment.
	 */
	@Test
	void authenticatedCustomerPasswordChangesAreStillThrottled() throws Exception {
		String ip = "10.31.0.1";
		authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isBadRequest());
		authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isBadRequest());
		authenticatedCustomerPasswordChangeFromIp(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		// Separate from the customer LOGIN budget, so a change flood cannot lock a tourist out of signing in.
		customerLoginFromIp(ip).andExpect(status().isUnauthorized());
	}

	/**
	 * The two password-change endpoints must not share one per-IP map. Venue WiFi / CGNAT puts tourists
	 * and operators behind one address, and a tourist flood that blocked an operator from rotating a
	 * possibly compromised credential is the operator-lockout defect wearing a different hat.
	 */
	@Test
	void customerPasswordChangeDoesNotStarveTheOperatorOne() throws Exception {
		String ip = "10.31.0.2";
		authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isBadRequest());
		authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isBadRequest());
		authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isTooManyRequests());

		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());
	}

	// ---- An anonymous flood must not drain an AUTHENTICATED endpoint's budget ----

	/** Deliberately not {@code operator}: the env-managed bootstrap admin is refused with a 409. */
	private static final String TEST_OPERATOR = "venue-op";
	private static final String TEST_CUSTOMER = "tourist@example.com";

	/** The signed-in operator's own change — the only caller that reaches the credential oracle. */
	private ResultActions authenticatedChangePasswordFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/auth/operator/password").with(fromIp(ip)).with(csrf())
				.with(user(TEST_OPERATOR).roles("OPERATOR"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""));
	}

	private ResultActions authenticatedCustomerPasswordChangeFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/me/password").with(fromIp(ip)).with(csrf())
				.with(user(TEST_CUSTOMER).roles("CUSTOMER"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "irrelevant1", "newPassword": "irrelevant2"}"""));
	}

	/**
	 * {@code POST /api/auth/operator/password} is {@code hasRole(OPERATOR)}, but this filter runs before
	 * {@code AuthorizationFilter}, so a caller with no session, no account and no CSRF token reaches the
	 * budget anyway. Ten requests is five times it: without the refund every operator behind that address
	 * — venue WiFi / CGNAT is exactly the topology the budget was split for — would meet a {@code 429} on
	 * the page whose whole purpose is rotating a credential they believe is compromised.
	 */
	@Test
	void anUnauthenticatedFloodDoesNotDrainTheOperatorPasswordBudget() throws Exception {
		String ip = "10.32.0.1";
		for (int i = 0; i < 10; i++) {
			changePasswordFromIp(ip).andExpect(status().isUnauthorized());
		}

		authenticatedChangePasswordFromIp(ip).andExpect(status().isBadRequest());
	}

	/** AC-2. The customer twin of AC-1 — same filter position, same defect, same fix. */
	@Test
	void anUnauthenticatedFloodDoesNotDrainTheCustomerPasswordBudget() throws Exception {
		String ip = "10.32.0.2";
		for (int i = 0; i < 10; i++) {
			customerPasswordChangeFromIp(ip).andExpect(status().isUnauthorized());
		}

		authenticatedCustomerPasswordChangeFromIp(ip).andExpect(status().isBadRequest());
	}

	/** Public + non-enumerating: always {@code 204}, so a {@code 429} is unambiguously the limiter. */
	private ResultActions forgotPasswordFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/auth/customer/forgot-password").with(fromIp(ip)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "someone@example.com"}"""));
	}

	private ResultActions authenticatedResendFromIp(String ip) throws Exception {
		return mvc.perform(post("/api/me/verify-email/request").with(fromIp(ip)).with(csrf())
				.with(user(TEST_CUSTOMER).roles("CUSTOMER")));
	}

	/**
	 * {@code /api/me/verify-email/request} is {@code hasRole(CUSTOMER)} but shares
	 * {@code recoveryBuckets} with three public paths, so without the refund an anonymous flood on it
	 * drains the budget legitimate {@code forgot-password} depends on — the password-endpoint defect one
	 * map over.
	 */
	@Test
	void anUnauthenticatedFloodOnTheVerificationResendDoesNotStarveRecovery() throws Exception {
		String ip = "10.33.0.1";
		for (int i = 0; i < 10; i++) {
			mvc.perform(post("/api/me/verify-email/request").with(fromIp(ip)).with(csrf()))
					.andExpect(status().isUnauthorized());
		}

		forgotPasswordFromIp(ip).andExpect(status().isNoContent());
	}

	/**
	 * The other half: the budget must still bite. Without this, flagging the map could silently disable
	 * recovery throttling and the test above would happily pass.
	 */
	@Test
	void authenticatedVerificationResendsAreStillThrottled() throws Exception {
		String ip = "10.33.0.2";
		authenticatedResendFromIp(ip).andExpect(status().isOk());
		authenticatedResendFromIp(ip).andExpect(status().isOk());
		authenticatedResendFromIp(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	/** And the public half stays throttled too — a mail-sending oracle open to anyone with a CSRF token. */
	@Test
	void forgotPasswordIsStillThrottled() throws Exception {
		String ip = "10.33.0.3";
		forgotPasswordFromIp(ip).andExpect(status().isNoContent());
		forgotPasswordFromIp(ip).andExpect(status().isNoContent());
		forgotPasswordFromIp(ip)
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	// ---- Per-submitted-identity login budget, keyed on username/email not IP ----

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
				.andExpect(jsonPath("$.detail").value("Too many requests."));
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

	// ---- Trusted-proxy client-IP resolution closes the XFF-rotation bypass ----

	private ResultActions loginFromProxiedClient(String peer, String forwardedFor) throws Exception {
		// Unique username per call so this per-IP-dimension test never trips the per-username bucket.
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

	// ---- One client, many edge nodes: still ONE bucket ----

	private ResultActions loginViaEdge(String client, String edge) throws Exception {
		// Unique username per call so this per-IP-dimension test never trips the per-username bucket.
		return mvc.perform(post("/api/auth/operator/login").with(fromIp("10.14.0.1")).with(csrf())
				.header("X-Forwarded-For", client + ", " + edge)
				.header("CF-Connecting-IP", client)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\": \"%s\", \"password\": \"nope\"}".formatted(uniqueUsername())));
	}

	/**
	 * The production defect: one client is load-balanced across Cloudflare edge nodes, so the right-most
	 * forwarded hop — the one Render appended — varies per request. Keyed on that hop it is
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
