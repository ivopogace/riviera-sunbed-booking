package ai.riviera.platform;

import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Default-profile ({@code @Profile("!mailer")}) recording {@link Mailer} that plays a cooperative mail
 * transport (S8, epic #108, design D-6) — the same stub pattern as {@code MockSsoGateway}. Instead of
 * sending, it keeps each {@link SentEmail} in memory and logs the tokenized link, so "verify your email"
 * and "reset your password" are demoable end-to-end with zero external credentials, and backend ITs can
 * follow the link out of {@link #lastTo}.
 *
 * <p>{@code @Profile("!mailer")} so exactly one {@link Mailer} bean exists: the mock when {@code mailer}
 * is absent, {@link SmtpMailer} when it is present. {@link MockMailerProdGuard} additionally forbids this
 * mock from ever running under {@code prod}. The link carries a single-use bearer token (invariant #7);
 * logging it is a deliberate <em>dev-only</em> affordance — mock-only and prod-guarded, it never runs in
 * production. Package-private (invariant #11).
 */
@Component
@Profile("!mailer")
class MockMailer implements Mailer {

	private static final Logger log = LoggerFactory.getLogger(MockMailer.class);

	private final List<SentEmail> sent = new CopyOnWriteArrayList<>();

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		record(new SentEmail(toEmail, SentEmail.Kind.EMAIL_VERIFICATION, verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		record(new SentEmail(toEmail, SentEmail.Kind.PASSWORD_RESET, resetLink));
	}

	private void record(SentEmail email) {
		sent.add(email);
		// Dev-only convenience (design D-6): follow the tokenized link without a real inbox. The email is
		// user-supplied, so neutralize newlines before logging (log-forging, riviera-java-conventions §10).
		log.info("[mock-mailer] {} link (to {}): {}", email.kind(), sanitize(email.toEmail()), email.link());
	}

	/** Every email recorded so far, oldest first (test/demo inspection). */
	List<SentEmail> sent() {
		return List.copyOf(sent);
	}

	/** The most recent email recorded for this address, or empty if none (IT helper). */
	Optional<SentEmail> lastTo(String toEmail) {
		return sent.stream().filter(e -> e.toEmail().equals(toEmail)).reduce((first, second) -> second);
	}

	/** Reset the recorded outbox — lets an IT isolate the email its own step produced. */
	void clear() {
		sent.clear();
	}

	private static String sanitize(String value) {
		return value.replaceAll("[\\r\\n]", "_");
	}
}
