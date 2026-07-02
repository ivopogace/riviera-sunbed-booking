package ai.riviera.platform;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import jakarta.servlet.http.Cookie;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Session-login helper for MockMvc integration tests (issue #109): performs the real
 * {@code POST /api/auth/operator/login} against the DB-backed credentials and returns the
 * {@code SESSION} cookie subsequent requests ride — the session-auth replacement for the retired
 * {@code .with(httpBasic(…))} post-processor. Public so module-package ITs (venue, availability,
 * booking, payout) can share the one login flow instead of re-rolling it.
 *
 * <p>Every login presents a UNIQUE {@code X-Forwarded-For} client ({@link #uniqueClientIp()}):
 * the login endpoint is per-IP rate-limited (D-8), the limiter lives in the CACHED Spring
 * context, and a full-suite run performs far more than one budget's worth of logins from what
 * would otherwise be a single test IP — the 11th login would 429 (exactly what broke CI on the
 * first PR run). Tests that PIN the limiter control their own IPs ({@code RateLimitFilterTest}).
 */
public final class SessionLoginSupport {

	private static final String SESSION_COOKIE = "SESSION";
	private static final java.util.concurrent.atomic.AtomicInteger CLIENT_COUNTER =
			new java.util.concurrent.atomic.AtomicInteger();

	private SessionLoginSupport() {
	}

	/** A unique per-call test client IP, so suite-cumulative logins never share a rate bucket. */
	public static String uniqueClientIp() {
		int n = CLIENT_COUNTER.incrementAndGet();
		return "10.99.%d.%d".formatted((n >> 8) & 0xFF, n & 0xFF);
	}

	/** Log in as {@code username} and return the session cookie; fails the test on a rejected login. */
	public static Cookie operatorSession(MockMvc mvc, String username, String password) throws Exception {
		MvcResult result = mvc.perform(post("/api/auth/operator/login").with(csrf())
				.header("X-Forwarded-For", uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "%s", "password": "%s"}""".formatted(username, password)))
				.andExpect(status().isOk())
				.andReturn();
		Cookie session = result.getResponse().getCookie(SESSION_COOKIE);
		if (session == null) {
			throw new IllegalStateException("login succeeded but no SESSION cookie was set");
		}
		return session;
	}
}
