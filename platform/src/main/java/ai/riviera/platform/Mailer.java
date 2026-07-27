package ai.riviera.platform;

import java.net.URI;

/**
 * Edge port for sending transactional email (S8, epic #108, design D-6; grown with the
 * booking-confirmation kind in #371). Epic #367's locked seam decision: <strong>this port is THE
 * seam</strong> — it grows message kinds and keeps exactly two implementations, and no module ever
 * touches mail (RV-BE-11). Exactly one implementation is active per profile (mirroring
 * {@code StubPaymentGateway} vs {@code StripePaymentGateway}, and {@code MockSsoGateway} vs
 * {@code RealSsoGateway}): the recording {@link MockMailer} under the default profile, the real SMTP
 * {@link SmtpMailer} under {@code mailer} (#368, ADR-0011); {@link MockMailerProdGuard} forbids the
 * mock from running in production.
 *
 * <p>Recovery messages carry a raw single-use token inside the emailed link and booking confirmations
 * carry the arrival code — both bearer credentials (invariant #7). The edge hands each here fully
 * formed, so the mailer never touches the token store, the account, or the booking; implementations
 * must never log them. Package-private — edge-internal machinery (RV-BE-11).
 */
interface Mailer {

	/** Send the "verify your email" message with the tokenized verification link. */
	void sendEmailVerification(String toEmail, URI verificationLink);

	/** Send the "reset your password" message with the tokenized reset link. */
	void sendPasswordReset(String toEmail, URI resetLink);

	/**
	 * Send the booking confirmation carrying the tourist's arrival code and booking details. Takes the
	 * details structured rather than pre-rendered, so presentation stays the implementation's business.
	 */
	void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation);
}
