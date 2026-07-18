package ai.riviera.platform;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Real SMTP/provider {@link Mailer} — exists but is <strong>not implemented</strong> until mail
 * credentials ship (deferred exactly like the S5 SSO adapters). Under {@code @Profile("mailer")} it
 * throws {@link UnsupportedOperationException} on any send, so activating the real profile without an
 * implementation fails loudly rather than silently dropping mail or falling back to the mock (design
 * D-6). Package-private (invariant #11); pinned by {@code RealMailerTest}.
 */
@Component
@Profile("mailer")
class SmtpMailer implements Mailer {

	private static final String NOT_IMPLEMENTED =
			"Real mailer not implemented — awaiting SMTP/provider credentials (S8 follow-up, #113)";

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		throw new UnsupportedOperationException(NOT_IMPLEMENTED);
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		throw new UnsupportedOperationException(NOT_IMPLEMENTED);
	}
}
