package ai.riviera.platform;

import java.net.URI;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for {@link MockMailer} (S8 #113, AC-10 mock side): it records each recovery email instead of
 * sending, and {@link MockMailer#lastTo} returns the most recent one for an address — the hook a backend
 * IT uses to pull the tokenized link out of a verify/reset journey.
 */
class MockMailerTest {

	private final MockMailer mailer = new MockMailer();

	@Test
	void recordsEachEmailAndReturnsTheLatestPerAddress() {
		mailer.sendEmailVerification("a@example.com", URI.create("https://x/account/verify?token=v1"));
		mailer.sendPasswordReset("a@example.com", URI.create("https://x/account/reset?token=r1"));

		assertThat(mailer.sent()).hasSize(2);
		assertThat(mailer.lastTo("a@example.com")).get()
				.extracting(SentEmail::kind).isEqualTo(SentEmail.Kind.PASSWORD_RESET);
		assertThat(mailer.lastTo("a@example.com")).get()
				.extracting(e -> e.link().toString()).isEqualTo("https://x/account/reset?token=r1");
		assertThat(mailer.lastTo("nobody@example.com")).isEmpty();
	}
}
