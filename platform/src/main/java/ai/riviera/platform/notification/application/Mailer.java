package ai.riviera.platform.notification.application;

import java.net.URI;

/**
 * Internal transport port for sending transactional email (S8, epic #108, design D-6; grown with the
 * booking-confirmation kind in #371; moved into the {@code notification} module in #382). Epic
 * #367's locked seam decision: <strong>this port is THE transport seam</strong> — it grows message
 * kinds and keeps exactly two implementations, and no bounded context outside {@code notification}
 * ever touches mail (RV-BE-11). Exactly one implementation is active per profile (mirroring
 * {@code StubPaymentGateway} vs {@code StripePaymentGateway}, and {@code MockSsoGateway} vs
 * {@code RealSsoGateway}): the recording {@code MockMailer} under the default profile, the real SMTP
 * {@code SmtpMailer} under {@code mailer} (#368, ADR-0011); {@code MockMailerProdGuard} forbids the
 * mock from running in production.
 *
 * <p>Recovery messages carry a raw single-use token inside the emailed link and the three booking
 * kinds carry the arrival code — the payment-due kind additionally inside its pay link, which is
 * therefore a bearer URL too — all bearer credentials (invariant #7). The caller hands each here
 * fully formed, so the mailer never touches the token store, the account, or the booking. <strong>No
 * implementation reachable in production may log them</strong>: {@code SmtpMailer} logs neither, and
 * {@code MockMailer}'s deliberate dev-only echo of the recovery <em>link</em> is the documented
 * exception — mock-only, prod-guarded, and never extended to the arrival code. Unpublished
 * application-internal port, implemented by {@code adapter/out}; callers outside the module use
 * {@code notification.api.MailSender} — only {@link TransactionalMailService} talks to the
 * transport directly, so the chokepoint rules cannot be bypassed.
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
	 * Send the cancellation/refund record (#374): what was cancelled, why, and the server-computed
	 * refund — or, when the cutoff has passed and nothing is returned, that none applies. Structured
	 * like the confirmation, and for the same reason; the implementation decides how a zero refund and
	 * each {@code RefundReason} read.
	 */
	void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation);

	/**
	 * Send the "your request was accepted, payment is due by …" message (#373): the deadline, the
	 * amount, and the link to the code-gated view where the guest pays. Structured like the two
	 * booking kinds above, and for the same reason — the implementation decides how a UTC instant
	 * reads to a tourist (invariant #6: in {@code Europe/Tirane}).
	 */
	void sendPaymentDue(String toEmail, PaymentDueMail paymentDue);

	/**
	 * Send the "your operator account is approved" message with the sign-in link (#375). The only kind
	 * on this port carrying no bearer credential at all, so the mock's dev-only link echo needs no
	 * invariant-#7 argument here.
	 */
	void sendOperatorApproved(String toEmail, URI signInLink);
}
