package ai.riviera.platform.notification.application;

import java.net.URI;

/**
 * The transport seam: it grows message kinds and keeps two implementations, one per profile —
 * the recording {@code MockMailer} (default; {@code MockMailerProdGuard} keeps it out of prod)
 * and {@code SmtpMailer} under {@code mailer}. Only {@link TransactionalMailService} calls it, so
 * the suppression chokepoint cannot be bypassed. Codes, tokens and links built from them are bearer
 * credentials (invariant #7): no prod-reachable implementation may log them; the mock's dev-only
 * recovery-link echo never extends to a code. Rationale: {@code RESPONSIBILITIES.md} §notification.
 */
public interface Mailer {

	/** Send the "verify your email" message with the tokenized verification link. */
	void sendEmailVerification(String toEmail, URI verificationLink);

	/** Send the "reset your password" message with the tokenized reset link. */
	void sendPasswordReset(String toEmail, URI resetLink);

	/**
	 * Send the booking confirmation carrying the tourist's arrival code and booking details. Takes the
	 * details structured rather than pre-rendered, so presentation stays the implementation's business.
	 */
	void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation);

	/**
	 * Send the cancellation/refund record: what was cancelled, why, and the server-computed refund,
	 * or that none applies. The implementation decides how a zero refund and each
	 * {@code RefundReason} read.
	 */
	void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation);

	/**
	 * Send the "your request was accepted, payment is due by …" message: the deadline, the amount,
	 * and the code-gated pay link. The implementation renders the UTC deadline in
	 * {@code Europe/Tirane} (invariant #6).
	 */
	void sendPaymentDue(String toEmail, PaymentDueMail paymentDue);

	/**
	 * Send the "your operator account is approved" message with the sign-in link. The only kind
	 * on this port carrying no bearer credential at all, so the mock's dev-only link echo needs no
	 * invariant-#7 argument here.
	 */
	void sendOperatorApproved(String toEmail, URI signInLink);

	/**
	 * Send the "the venue declined your request" record: the outcome, that nothing is held and
	 * nothing was charged, and the code-gated status link. A plain record with no call-to-action, by
	 * product decision; structured like the other booking kinds, and for the same reason.
	 */
	void sendRequestDeclined(String toEmail, RequestDeclinedMail declined);

	/**
	 * Send the "your request expired unanswered" record — {@link #sendRequestDeclined}'s mirror
	 * for the sweep's outcome, under the same plain-record rule.
	 */
	void sendRequestExpired(String toEmail, RequestExpiredMail expired);

	/** Send the "your spot changed" notice: both spots, the distance, and the free-exit deadline. */
	void sendBookingMoved(String toEmail, BookingMovedMail moved);
}
