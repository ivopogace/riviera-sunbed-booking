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
 */
public final class SessionLoginSupport {

	private static final String SESSION_COOKIE = "SESSION";

	private SessionLoginSupport() {
	}

	/** Log in as {@code username} and return the session cookie; fails the test on a rejected login. */
	public static Cookie operatorSession(MockMvc mvc, String username, String password) throws Exception {
		MvcResult result = mvc.perform(post("/api/auth/operator/login").with(csrf())
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
