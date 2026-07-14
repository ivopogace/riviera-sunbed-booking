package ai.riviera.platform;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regression for #247: signed in &rarr; {@code POST /api/auth/logout} &rarr; immediate re-login must be
 * accepted on the <strong>FIRST</strong> attempt, not {@code 403 INVALID_CSRF_TOKEN}.
 *
 * <p>The framework's {@code CsrfLogoutHandler} clears the {@code XSRF-TOKEN} cookie on logout, and
 * {@code LogoutFilter} then writes the {@code 204} and short-circuits the chain — so {@code .spa()}'s
 * deferred-token machinery never re-materializes the cookie on the logout response. Before the fix the
 * SPA was left with no CSRF cookie, so its next protected POST (the re-login) sent no
 * {@code X-XSRF-TOKEN} and 403'd, succeeding only on the retry that the 403's re-seeded cookie enabled.
 * {@code SecurityConfig}'s logout success handler now re-issues a fresh token on the {@code 204}.
 *
 * <p>This drives the <strong>real</strong> cookie-to-header CSRF flow through a browser-faithful cookie
 * jar and NEVER uses {@code .with(csrf())} — that post-processor permanently swaps the shared
 * {@code CsrfFilter}'s repository for a session-backed test one, which would hide the very cookie
 * rotation this bug is about (the same reason {@code CsrfCookieBootstrapIT} is isolated). The distinct
 * {@code @SpringBootTest} property keeps this context un-cached from the {@code csrf()}-using ITs. The
 * fix lives in the one shared logout filter, so a single sequence is proven for BOTH principal types
 * (operator + customer). Each login presents a unique {@code X-Forwarded-For} so suite-cumulative
 * logins never share the per-IP login rate bucket (#127).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"riviera.operator.password=logout-login-pw",
		"riviera.logout-login-csrf-it.marker=isolated-context"})
@AutoConfigureMockMvc
class LogoutThenLoginCsrfIT {

	private static final String OPERATOR_LOGIN = "/api/auth/operator/login";
	private static final String CUSTOMER_LOGIN = "/api/auth/customer/login";
	private static final String LOGOUT = "/api/auth/logout";
	private static final String XSRF_COOKIE = "XSRF-TOKEN";
	private static final String CUSTOMER_EMAIL = "logout-login-it@example.com";
	private static final String CUSTOMER_PASSWORD = "password123";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void seedCustomer() {
		jdbc.sql("DELETE FROM customer_account WHERE email = :e").param("e", CUSTOMER_EMAIL).update();
		customerProvisioning.register(CUSTOMER_EMAIL, encoder.encode(CUSTOMER_PASSWORD));
	}

	@Test
	void operatorLogoutThenImmediateLoginIsAccepted() throws Exception {
		BrowserJar jar = new BrowserJar();
		bootstrapCsrfCookie(jar);

		operatorLogin(jar).andExpect(status().isOk());
		logout(jar);
		// #247: this first re-login must be accepted (was 403 INVALID_CSRF_TOKEN before the fix).
		operatorLogin(jar)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.principalType").value("OPERATOR"));
		// The re-established session is real, not just a 200 body.
		mvc.perform(get("/api/auth/me").with(jar.attach())).andExpect(status().isOk());
	}

	@Test
	void customerLogoutThenImmediateLoginIsAccepted() throws Exception {
		BrowserJar jar = new BrowserJar();
		bootstrapCsrfCookie(jar);

		customerLogin(jar).andExpect(status().isOk());
		logout(jar);
		// #247: this first re-login must be accepted (was 403 INVALID_CSRF_TOKEN before the fix).
		customerLogin(jar)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"));
		mvc.perform(get("/api/auth/me").with(jar.attach())).andExpect(status().isOk());
	}

	@Test
	void logoutReissuesAFreshHardenedCsrfCookie() throws Exception {
		BrowserJar jar = new BrowserJar();
		bootstrapCsrfCookie(jar);
		operatorLogin(jar).andExpect(status().isOk());

		MvcResult result = mvc.perform(post(LOGOUT).with(jar.attach()))
				.andExpect(status().isNoContent()).andReturn();

		// The 204 must leave the SPA with a usable token, not the deletion the framework issues. A
		// fix regression (removing the re-issue) would leave only the Max-Age=0 clear here.
		Cookie fresh = effectiveXsrfCookie(result);
		assertNotNull(fresh, "logout must re-issue a fresh XSRF-TOKEN cookie (#247)");
		// Same D-1 hardened posture as the bootstrap cookie (CsrfCookieBootstrapIT): JS-readable,
		// Secure, SameSite=Lax — so the SPA can echo it and the browser scopes it like the session.
		assertFalse(fresh.isHttpOnly(), "the SPA must READ the token (cookie-to-header)");
		assertTrue(fresh.getSecure(), "XSRF-TOKEN must be Secure");
		assertEquals("Lax", fresh.getAttribute("SameSite"), "XSRF-TOKEN must be SameSite=Lax");
	}

	/** A fresh browser's first GET materializes the JS-readable XSRF-TOKEN cookie (no session yet). */
	private void bootstrapCsrfCookie(BrowserJar jar) throws Exception {
		jar.apply(mvc.perform(get("/api/venues").with(jar.attach())).andExpect(status().isOk()).andReturn());
	}

	private ResultActions operatorLogin(BrowserJar jar) throws Exception {
		return login(jar, OPERATOR_LOGIN,
				"""
						{"username": "operator", "password": "logout-login-pw"}""");
	}

	private ResultActions customerLogin(BrowserJar jar) throws Exception {
		return login(jar, CUSTOMER_LOGIN,
				"""
						{"email": "%s", "password": "%s"}""".formatted(CUSTOMER_EMAIL, CUSTOMER_PASSWORD));
	}

	private ResultActions login(BrowserJar jar, String path, String body) throws Exception {
		ResultActions actions = mvc.perform(post(path).with(jar.attach())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON).content(body));
		jar.apply(actions.andReturn());
		return actions;
	}

	private void logout(BrowserJar jar) throws Exception {
		jar.apply(mvc.perform(post(LOGOUT).with(jar.attach()))
				.andExpect(status().isNoContent()).andReturn());
	}

	/** The XSRF-TOKEN cookie a browser is left holding: the LAST non-deletion Set-Cookie wins. */
	private static Cookie effectiveXsrfCookie(MvcResult result) {
		Cookie effective = null;
		for (Cookie c : result.getResponse().getCookies()) {
			if (XSRF_COOKIE.equals(c.getName()) && c.getMaxAge() != 0
					&& c.getValue() != null && !c.getValue().isEmpty()) {
				effective = c;
			}
		}
		return effective;
	}

	/**
	 * A minimal browser cookie jar for a MockMvc sequence: stores Set-Cookie values (honoring
	 * deletions via {@code Max-Age=0}/empty, last-write-wins) and re-sends them on the next request,
	 * and — mirroring {@code api-session.interceptor.ts} — echoes the XSRF-TOKEN cookie as
	 * {@code X-XSRF-TOKEN} on mutating requests, and ONLY when the cookie is present.
	 */
	private static final class BrowserJar {
		private static final Set<String> MUTATING = Set.of("POST", "PUT", "PATCH", "DELETE");
		private static final String XSRF_HEADER = "X-XSRF-TOKEN";

		private final Map<String, String> cookies = new HashMap<>();

		RequestPostProcessor attach() {
			return request -> {
				if (!cookies.isEmpty()) {
					request.setCookies(cookies.entrySet().stream()
							.map(e -> new Cookie(e.getKey(), e.getValue())).toArray(Cookie[]::new));
				}
				if (MUTATING.contains(request.getMethod())) {
					String token = cookies.get(XSRF_COOKIE);
					if (token != null) {
						request.addHeader(XSRF_HEADER, token);
					}
				}
				return request;
			};
		}

		void apply(MvcResult result) {
			for (Cookie c : result.getResponse().getCookies()) {
				if (c.getMaxAge() == 0 || c.getValue() == null || c.getValue().isEmpty()) {
					cookies.remove(c.getName());
				} else {
					cookies.put(c.getName(), c.getValue());
				}
			}
		}
	}
}
