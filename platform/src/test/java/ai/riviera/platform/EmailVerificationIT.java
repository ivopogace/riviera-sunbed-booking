package ai.riviera.platform;

import java.net.URI;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

import jakarta.servlet.http.Cookie;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S8 (#113) email-verification journey end-to-end against real Postgres + the mock mailer (AC-7, AC-9):
 * registering signs the customer in AND issues a verification link via the {@code Mailer} port; visiting
 * the link (the SPA-issued {@code POST /api/auth/customer/verify-email}) marks the email verified and
 * {@code /api/auth/me} flips {@code emailVerified} true; a second use of the token, and a bogus token,
 * both fail with the neutral {@code 400 INVALID_OR_EXPIRED_TOKEN}. The account stays usable throughout
 * (soft verification). Each request carries a unique {@code X-Forwarded-For} (#127 rate-bucket isolation).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class EmailVerificationIT {

	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String VERIFY_PATH = "/api/auth/customer/verify-email";
	private static final String SESSION_COOKIE = "SESSION";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	MockMailer mailer;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM customer_account WHERE email LIKE 'verify-it-%'").update(); // CASCADE drops tokens
		mailer.clear();
	}

	@Test
	void registerSignsInSendsVerification_thenVerifyingFlipsMeVerified() throws Exception {
		String email = "verify-it-alice@example.com";

		// Register: signed in (session cookie) + still unverified (soft) + a verification email was sent.
		Cookie session = register(email).getResponse().getCookie(SESSION_COOKIE);
		assertEquals(email, mailer.lastTo(email).orElseThrow().toEmail());
		assertEquals(SentEmail.Kind.EMAIL_VERIFICATION, mailer.lastTo(email).orElseThrow().kind());
		mvc.perform(get("/api/auth/me").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emailVerified").value(false));

		// Visit the emailed link → verify → me now reports verified.
		String token = tokenFrom(mailer.lastTo(email).orElseThrow().link());
		verify(token).andExpect(status().isNoContent());
		mvc.perform(get("/api/auth/me").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emailVerified").value(true));
	}

	@Test
	void secondUseAndBogusTokenAreRejectedNeutrally() throws Exception {
		String email = "verify-it-bob@example.com";
		register(email);
		String token = tokenFrom(mailer.lastTo(email).orElseThrow().link());

		verify(token).andExpect(status().isNoContent());

		verify(token) // single-use
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));
		verify("not-a-real-token")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));
	}

	private org.springframework.test.web.servlet.MvcResult register(String email) throws Exception {
		return mvc.perform(post(REGISTER_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "password123"}""".formatted(email)))
				.andExpect(status().isCreated())
				.andReturn();
	}

	private org.springframework.test.web.servlet.ResultActions verify(String token) throws Exception {
		return mvc.perform(post(VERIFY_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"token": "%s"}""".formatted(token)));
	}

	private static String tokenFrom(URI link) {
		return UriComponentsBuilder.fromUri(link).build().getQueryParams().getFirst("token");
	}
}
