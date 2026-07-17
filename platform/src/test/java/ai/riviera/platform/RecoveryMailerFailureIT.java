package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S8 (#113) review fix: the recovery-email send is <strong>best-effort</strong>. A mail-transport failure
 * must never fail the triggering request (registration would 500 <em>after</em> the account+session
 * already exist) nor turn forgot-password's uniform 204 into a 500-vs-204 account-enumeration oracle (D-8).
 * Here the {@link Mailer} is replaced with one that throws on every send (the posture of the deferred real
 * {@code SmtpMailer}): registration still returns 201 and forgot-password still returns 204. Unique emails
 * against a fresh Testcontainers DB (no cleanup).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class RecoveryMailerFailureIT {

	@MockitoBean
	Mailer mailer;

	@Autowired
	MockMvc mvc;

	@BeforeEach
	void mailerIsDown() {
		doThrow(new UnsupportedOperationException("mail transport down")).when(mailer)
				.sendEmailVerification(any(), any());
		doThrow(new UnsupportedOperationException("mail transport down")).when(mailer)
				.sendPasswordReset(any(), any());
	}

	@Test
	void registrationStillSucceedsWhenTheMailerIsDown() throws Exception {
		register("mailfail-reg@example.com").andExpect(status().isCreated());
	}

	@Test
	void forgotPasswordStillReturns204WhenTheMailerIsDown() throws Exception {
		String email = "mailfail-forgot@example.com";
		register(email).andExpect(status().isCreated()); // account exists → the send branch runs

		mvc.perform(post("/api/auth/customer/forgot-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s"}""".formatted(email)))
				.andExpect(status().isNoContent()); // uniform 204 despite the mailer throwing (no oracle)
	}

	private ResultActions register(String email) throws Exception {
		return mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "password123"}""".formatted(email)));
	}
}
