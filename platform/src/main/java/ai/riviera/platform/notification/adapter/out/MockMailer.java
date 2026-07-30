package ai.riviera.platform.notification.adapter.out;

import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.Mailer;

/**
 * Default-profile ({@code @Profile("!mailer & !smtp4dev")}) recording {@link Mailer} that plays a cooperative mail
 * transport (S8, epic #108, design D-6; booking confirmations added in #371) — the same stub pattern as
 * {@code MockSsoGateway}. Instead of sending, it keeps each {@link SentEmail} in memory, so every message
 * kind is demoable end-to-end with zero external credentials and backend ITs can assert on what was sent
 * via {@link #lastTo}. Recovery messages additionally log their tokenized link (dev-only, see below);
 * a booking confirmation deliberately logs no arrival code — the tourist already has it in the app, so
 * the affordance would buy nothing and invariant #7 costs nothing to honour there. The
 * operator-approval notice (#375) logs its link too, but needs none of that argument: its link is the
 * public sign-in URL, so it is the one logged link here that is not a bearer credential.
 *
 * <p>{@code @Profile("!mailer & !smtp4dev")} so exactly one {@link Mailer} bean exists: the mock unless a
 * real-transport profile ({@code mailer}, or the local-dev {@code smtp4dev}) swaps in
 * {@link SmtpMailer}. {@link MockMailerProdGuard} additionally
 * forbids this mock from ever running under {@code prod}. The link carries a single-use bearer token
 * (invariant #7); logging it is a deliberate <em>dev-only</em> affordance — mock-only and prod-guarded, it
 * never runs in production.
 *
 * <p><strong>Public, unlike the other adapters (#382):</strong> the recording surface
 * ({@link #sent()} / {@link #lastTo} / {@link #clear()}) is the platform test suite's established
 * observation seam — ITs outside this package (the recovery flows, the confirmation IT) pull the
 * tokenized link or the recorded fields out of the "sent" outbox. No production caller exists:
 * Modulith walls the class off from every module, and the composition root talks only to
 * {@code notification.api}.
 */
@Component
@Profile("!mailer & !smtp4dev")
public class MockMailer implements Mailer {

	private static final Logger log = LoggerFactory.getLogger(MockMailer.class);

	private final List<SentEmail> sent = new CopyOnWriteArrayList<>();

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		SentEmail email = SentEmail.recovery(toEmail, SentEmail.Kind.EMAIL_VERIFICATION, verificationLink);
		sent.add(email);
		logRecovery(email);
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		SentEmail email = SentEmail.recovery(toEmail, SentEmail.Kind.PASSWORD_RESET, resetLink);
		sent.add(email);
		logRecovery(email);
	}

	@Override
	public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		sent.add(SentEmail.bookingConfirmation(toEmail, confirmation));
		// No code in the line: unlike a recovery link, the arrival code needs no dev affordance — the
		// tourist already has it in the app — so invariant #7 costs nothing here.
		log.info("[mock-mailer] {} (to {}) for {} on {}", SentEmail.Kind.BOOKING_CONFIRMATION,
				sanitize(toEmail), sanitize(confirmation.venueName()), confirmation.bookingDate());
	}

	@Override
	public void sendOperatorApproved(String toEmail, URI signInLink) {
		SentEmail email = SentEmail.operatorApproved(toEmail, signInLink);
		sent.add(email);
		// Logged like a recovery link but for the opposite reason: this URL is public, not a credential.
		log.info("[mock-mailer] {} link (to {}): {}", email.kind(), sanitize(toEmail), signInLink);
	}

	private void logRecovery(SentEmail email) {
		// Dev-only convenience (design D-6): follow the tokenized link without a real inbox. The email is
		// user-supplied, so neutralize newlines before logging (log-forging, riviera-java-conventions §10).
		log.info("[mock-mailer] {} link (to {}): {}", email.kind(), sanitize(email.toEmail()), email.link());
	}

	/** Every email recorded so far, oldest first (test/demo inspection). */
	public List<SentEmail> sent() {
		return List.copyOf(sent);
	}

	/** The most recent email recorded for this address, or empty if none (IT helper). */
	public Optional<SentEmail> lastTo(String toEmail) {
		return sent.stream().filter(e -> e.toEmail().equals(toEmail)).reduce((first, second) -> second);
	}

	/** Reset the recorded outbox — lets an IT isolate the email its own step produced. */
	public void clear() {
		sent.clear();
	}

	private static String sanitize(String value) {
		return value.replaceAll("[\\r\\n]", "_");
	}
}
