package ai.riviera.platform;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Real SMTP {@link Mailer} (#368, ADR-0011): delivers the verification and reset emails over the
 * configured relay via {@link JavaMailSender} — Scaleway TEM in deployment, any RFC-compliant relay by
 * config ({@code application-mailer.properties}; STARTTLS on 587, finite timeouts). Active under
 * {@code @Profile("mailer")} — where missing SMTP config fails at boot (unresolved placeholder), never on
 * first send — and under the local-dev {@code smtp4dev} profile, whose defaults target the local sink
 * ({@code application-smtp4dev.properties}). Messages are plain text with no tracking markup
 * (ADR-0011 §25-TDDDG posture), and the tokenized
 * link — a bearer credential (invariant #7) — is never logged here. Package-private (RV-BE-11); pinned
 * by {@code SmtpMailerIT} + {@code MailerProfileWiringTest}.
 */
@Component
@Profile("mailer | smtp4dev")
class SmtpMailer implements Mailer {

	private static final String VERIFICATION_SUBJECT = "Verify your email";
	private static final String RESET_SUBJECT = "Reset your password";

	private final JavaMailSender sender;
	private final String from;

	SmtpMailer(JavaMailSender sender, @Value("${riviera.mail.from}") String from) {
		if (from.isBlank()) {
			throw new IllegalStateException(
					"riviera.mail.from must be set (RIVIERA_MAIL_FROM) when the 'mailer' profile is active");
		}
		this.sender = sender;
		this.from = from;
	}

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		send(toEmail, VERIFICATION_SUBJECT, """
				Confirm your email address by opening this link:

				%s

				If you didn't create an account, you can ignore this message.""".formatted(verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		send(toEmail, RESET_SUBJECT, """
				Reset your password by opening this link:

				%s

				The link is valid once, for a limited time. If you didn't request a reset, you can ignore
				this message — your password is unchanged.""".formatted(resetLink));
	}

	private void send(String toEmail, String subject, String body) {
		SimpleMailMessage message = new SimpleMailMessage();
		message.setFrom(from);
		message.setTo(toEmail);
		message.setSubject(subject);
		message.setText(body);
		sender.send(message);
	}
}
