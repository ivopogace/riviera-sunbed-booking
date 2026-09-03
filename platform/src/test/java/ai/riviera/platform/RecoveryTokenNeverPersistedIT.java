package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Why recovery mail rides an in-memory dispatcher and NOT the Spring Modulith Event Publication Registry
 * (#369, ADR-0011 decision 5). The registry serializes every event payload into {@code event_publication}
 * as text — so routing a recovery send through it would write the raw single-use token, a bearer credential
 * (invariant #7), to the database in cleartext, and under this application's {@code archive} completion
 * mode keep it there after the send. That would quietly undo the S8 design in which only the SHA-256 digest
 * is ever stored.
 *
 * <p>This test states that as an executable fact: after a real {@code forgot-password}, the raw token taken
 * out of the emailed link exists in no publication row and is not what the token table holds — while the
 * digest of it is, which keeps the assertion from passing vacuously.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class RecoveryTokenNeverPersistedIT {

	private static final String EMAIL = "no-persist@example.com";
	private static final String TOKEN_PARAM = "token";

	@Autowired
	MockMvc mvc;

	@Autowired
	MockMailer mailer;

	@Autowired
	JdbcClient jdbc;

	@Test
	void theRawTokenIsInNoPersistentStore() throws Exception {
		register();
		mailer.clear();
		forgotPassword();
		String rawToken = tokenFromTheDeliveredLink();

		assertThat(publicationRowsMentioning("event_publication", rawToken))
				.as("the raw token must never be serialized into a publication payload")
				.isZero();
		assertThat(publicationRowsMentioning("event_publication_archive", rawToken))
				.as("archived publications retain their payload — the token must not be in one either")
				.isZero();
		assertThat(tokenRowsHolding(rawToken)).as("the token table stores a digest, never the raw token").isZero();
		assertThat(tokenRowsHolding(new RecoveryTokens().hash(rawToken)))
				.as("positive control: the digest of that very token IS stored, so the assertions above are not vacuous")
				.isOne();
	}

	private String tokenFromTheDeliveredLink() {
		SentEmail delivered = mailer.lastTo(EMAIL).orElseThrow();
		String token = UriComponentsBuilder.fromUri(delivered.link()).build().getQueryParams().getFirst(TOKEN_PARAM);
		assertThat(token).as("the reset link must carry a token").isNotBlank();
		return token;
	}

	private long publicationRowsMentioning(String table, String rawToken) {
		return jdbc.sql("select count(*) from " + table + " where position(:token in serialized_event) > 0")
				.param(TOKEN_PARAM, rawToken)
				.query(Long.class)
				.single();
	}

	private long tokenRowsHolding(String value) {
		return jdbc.sql("select count(*) from customer_account_token where token_hash = :value")
				.param("value", value)
				.query(Long.class)
				.single();
	}

	private void register() throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "passphrase-123"}""".formatted(EMAIL)))
				.andExpect(status().isCreated());
	}

	private void forgotPassword() throws Exception {
		mvc.perform(post("/api/auth/customer/forgot-password").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s"}""".formatted(EMAIL)))
				.andExpect(status().isNoContent());
	}
}
