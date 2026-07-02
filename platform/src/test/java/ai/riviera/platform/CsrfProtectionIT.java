package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The CSRF posture under session auth (issue #109 AC-5, design D-1 layer 2). With the cookie
 * gone from "stateless Basic" to a real session, the old blanket CSRF exemptions on the operator
 * write surface INVERT: a session-authenticated write now requires the cookie-to-header token
 * ({@code XSRF-TOKEN} cookie → {@code X-XSRF-TOKEN} header), and a missing/forged token is a
 * {@code 403 INVALID_CSRF_TOKEN} problem (hand-mirrored at the filter, {@code RateLimitFilter}
 * pattern). Only the genuinely token-less surfaces stay exempt — guest booking create/cancel
 * (the booking code is the bearer credential, invariant #7) and the Stripe webhook
 * (signature-authenticated, invariant #8) — their posture is pinned here so the inversion can
 * never silently widen. An ANONYMOUS write without a token stays {@code 401} (the
 * ExceptionTranslationFilter routes anonymous denials to the entry point), which existing
 * anonymous-401 tests already pin.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=csrf-test-pw")
@AutoConfigureMockMvc
class CsrfProtectionIT {

	private static final String VENUE_BODY = """
			{"name":"Csrf Venue","beach":"Ksamil","region":"Riviera","description":"x",
			 "bookingMode":"INSTANT","commissionBps":1500,"payoutCurrency":"EUR","bookingCutoff":"18:00"}
			""";

	@Autowired
	MockMvc mvc;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, "operator", "csrf-test-pw");
	}

	// ---- Session-authenticated writes REQUIRE the token ----

	@Test
	void operatorWriteWithoutCsrfTokenIs403InvalidCsrfToken() throws Exception {
		mvc.perform(post("/api/venues").cookie(operatorSession)
						.contentType(MediaType.APPLICATION_JSON).content(VENUE_BODY))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_CSRF_TOKEN"))
				.andExpect(jsonPath("$.instance").value("about:blank"));
	}

	@Test
	void operatorWriteWithForgedTokenIs403InvalidCsrfToken() throws Exception {
		mvc.perform(post("/api/venues").cookie(operatorSession)
						.header("X-XSRF-TOKEN", "forged-token-value")
						.contentType(MediaType.APPLICATION_JSON).content(VENUE_BODY))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("INVALID_CSRF_TOKEN"));
	}

	@Test
	void operatorWriteWithTokenSucceeds() throws Exception {
		mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(VENUE_BODY))
				.andExpect(status().isCreated());
	}

	@Test
	void loginItselfIsCsrfProtected() throws Exception {
		// Login CSRF: without the token a cross-site page could silently log the victim into an
		// attacker-chosen account. The FE always has the cookie first (any prior GET issues it).
		mvc.perform(post("/api/auth/operator/login")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username": "operator", "password": "csrf-test-pw"}"""))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("INVALID_CSRF_TOKEN"));
	}

	// (The XSRF-TOKEN bootstrap-cookie pin lives in CsrfCookieBootstrapIT: the csrf() test
	// post-processor used for logins here PERMANENTLY swaps the shared CsrfFilter's repository
	// for a session-backed test one — WebTestUtils.setCsrfTokenRepository — so real cookie
	// issuance can only be observed in a context where csrf() has never run.)

	// ---- The genuinely token-less surfaces stay exempt (posture unchanged) ----

	@Test
	void guestBookingCreateStaysTokenless() throws Exception {
		// Bogus set → rejected by the domain (404), NOT by CSRF (403 would mean the exemption broke).
		mvc.perform(post("/api/bookings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"setId": 999999, "date": "2036-08-01",
								 "customer": {"name": "Guest", "email": "g@example.com"}}"""))
				.andExpect(result -> assertNotEquals(403, result.getResponse().getStatus(),
						"guest create must not be CSRF-gated"));
	}

	@Test
	void guestCancelStaysTokenless() throws Exception {
		mvc.perform(post("/api/bookings/{code}/cancel", "NOSUCHCODE"))
				.andExpect(result -> assertNotEquals(403, result.getResponse().getStatus(),
						"guest cancel must not be CSRF-gated"));
	}

	@Test
	void stripeWebhookStaysTokenless() throws Exception {
		// A badly-signed webhook is rejected by the SIGNATURE check (400, invariant #8), never by
		// CSRF. (A request with NO Stripe-Signature header currently NPEs to a 500 — pre-existing,
		// tracked as a follow-up — so the pin here uses an invalid signature, not a missing one.)
		mvc.perform(post("/api/payments/stripe/webhook")
						.header("Stripe-Signature", "t=1,v1=not-a-real-signature")
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest());
	}
}
