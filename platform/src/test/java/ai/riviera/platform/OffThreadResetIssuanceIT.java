package ai.riviera.platform;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The reset token's guarantees hold when it is issued on the production recovery dispatcher's thread
 * (#1336): stored hashed, superseded by a later request, single-use. Asynchrony is the subject, so this
 * takes {@link PostgresContainerConfiguration} and the real dispatcher, not the synchronous override, and
 * waits for each mail rather than timing anything.
 */
@EnabledIfDockerAvailable
@Import(PostgresContainerConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class OffThreadResetIssuanceIT {

	private static final String EMAIL = "offthread-reset@example.com";
	private static final Duration MAIL_WAIT = Duration.ofSeconds(10);

	@Autowired
	MockMvc mvc;
	@Autowired
	MockMailer mailer;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clearOutbox() {
		mailer.clear();
	}

	@Test
	void aTokenIssuedOffThreadIsHashedSupersededAndSingleUse() throws Exception {
		register(EMAIL);

		forgot(EMAIL).andExpect(status().isNoContent());
		String first = tokenFrom(awaitResetMails(1).getLast());
		forgot(EMAIL).andExpect(status().isNoContent());
		String second = tokenFrom(awaitResetMails(2).getLast());

		assertThat(jdbc.sql("SELECT count(*) FROM customer_account_token WHERE token_hash IN (:raw)")
				.param("raw", List.of(first, second)).query(Long.class).single())
				.as("only the digest is stored").isZero();
		reset(first).andExpect(status().isBadRequest());
		reset(second).andExpect(status().isNoContent());
		reset(second).andExpect(status().isBadRequest());
	}

	private List<SentEmail> awaitResetMails(int count) throws InterruptedException {
		Instant deadline = Instant.now().plus(MAIL_WAIT);
		List<SentEmail> resets = resetMails();
		while (resets.size() < count && Instant.now().isBefore(deadline)) {
			Thread.sleep(20);
			resets = resetMails();
		}
		assertThat(resets).as("the dispatcher never delivered reset mail #" + count).hasSize(count);
		return resets;
	}

	private List<SentEmail> resetMails() {
		return mailer.sent().stream()
				.filter(mail -> mail.kind() == SentEmail.Kind.PASSWORD_RESET && mail.toEmail().equals(EMAIL))
				.toList();
	}

	private void register(String email) throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "passphrase-123"}""".formatted(email)))
				.andExpect(status().isCreated());
	}

	private ResultActions forgot(String email) throws Exception {
		return mvc.perform(post("/api/auth/customer/forgot-password").with(csrf())
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s"}""".formatted(email)));
	}

	private ResultActions reset(String token) throws Exception {
		return mvc.perform(post("/api/auth/customer/reset-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"token": "%s", "newPassword": "rotated-pass-456"}""".formatted(token)));
	}

	private static String tokenFrom(SentEmail mail) {
		URI link = mail.link();
		return UriComponentsBuilder.fromUri(link).build().getQueryParams().getFirst("token");
	}
}
