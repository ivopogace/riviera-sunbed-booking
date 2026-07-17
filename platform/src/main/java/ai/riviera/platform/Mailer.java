package ai.riviera.platform;

import java.net.URI;

/**
 * Edge port for sending customer account-recovery emails (S8, epic #108, design D-6). The verification
 * and reset links each carry a raw single-use token — a bearer credential (invariant #7); the edge
 * builds the link and hands it here fully formed, so the mailer never touches the token store or the
 * account. Exactly one implementation is active per profile (mirroring {@code StubPaymentGateway} vs
 * {@code StripePaymentGateway}, and {@code MockSsoGateway} vs {@code RealSsoGateway}): the recording
 * {@link MockMailer} under the default profile, {@link SmtpMailer} under {@code mailer}. A real
 * SMTP/provider adapter is deferred like the S5 SSO credentials; {@link MockMailerProdGuard} forbids the
 * mock from running in production. Package-private — edge-internal machinery (RV-BE-11).
 */
interface Mailer {

	/** Send the "verify your email" message with the tokenized verification link. */
	void sendEmailVerification(String toEmail, URI verificationLink);

	/** Send the "reset your password" message with the tokenized reset link. */
	void sendPasswordReset(String toEmail, URI resetLink);
}
