package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static ai.riviera.platform.WebSliceStubs.fromIp;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The kill switch: with {@code riviera.altcha.enabled=false} every fenced route admits a request
 * without a solution and the challenge endpoint answers {@code 204}, which is what tells the SPA
 * to hide the widget.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = "riviera.altcha.enabled=false")
class AltchaDisabledTest {

	@Autowired
	MockMvc mvc;

	@Test
	void registerAdmitsWithoutAHeader() throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"off@example.com\",\"password\":\"passphrase-123\"}"))
				.andExpect(status().isCreated());
	}

	@Test
	void operatorRegisterAdmitsWithoutAHeader() throws Exception {
		mvc.perform(post("/api/auth/operator/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username":"off-operator","password":"passphrase-123","contactEmail":"off@venue.example"}"""))
				.andExpect(status().isAccepted());
	}

	@Test
	void bookingCreateAdmitsWithoutAHeader() throws Exception {
		// The slice's CreateBooking stub rejects every set, so the 404 IS "the controller ran".
		mvc.perform(post("/api/bookings").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"setId":1,"bookingDate":"2026-12-01",
						 "contact":{"email":"off@example.com","fullName":"Off Guest","phone":"+355699"}}"""))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	@Test
	void forgotPasswordAdmitsWithoutAHeader() throws Exception {
		mvc.perform(post("/api/auth/customer/forgot-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email":"off@example.com"}"""))
				.andExpect(status().isNoContent());
	}

	@Test
	void challengeEndpointAnswersNoContent() throws Exception {
		mvc.perform(get("/api/auth/challenge").with(fromIp("203.0.113.99")))
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));
	}
}
