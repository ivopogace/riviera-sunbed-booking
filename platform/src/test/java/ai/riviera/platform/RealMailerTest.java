package ai.riviera.platform;

import java.net.URI;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit spec for the {@code mailer}-profile real adapter (S8 #113, AC-10): {@link SmtpMailer} throws
 * {@link UnsupportedOperationException} on every send until a real implementation + credentials ship —
 * so activating the real profile without them fails loudly, with no silent fallback to the mock.
 */
class RealMailerTest {

	private static final URI LINK = URI.create("https://app.example/account/verify?token=abc");

	@Test
	void smtpMailerThrowsUnsupportedUntilCredentialsShip() {
		SmtpMailer mailer = new SmtpMailer();

		assertThatThrownBy(() -> mailer.sendEmailVerification("tourist@example.com", LINK))
				.isInstanceOf(UnsupportedOperationException.class);
		assertThatThrownBy(() -> mailer.sendPasswordReset("tourist@example.com", LINK))
				.isInstanceOf(UnsupportedOperationException.class);
	}
}
