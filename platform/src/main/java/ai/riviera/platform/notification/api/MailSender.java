package ai.riviera.platform.notification.api;

import java.net.URI;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * The published fire-and-forget mail port for edge-orchestrated kinds; each message arrives fully formed (a
 * reset's link deferred to the send task), a link possibly carrying a bearer token (invariant #7). A send
 * never throws, runs off the caller's thread on the bounded in-memory dispatcher (never the registry, which
 * would persist the token), and is skipped for a suppressed address; its outcome must affect neither the
 * triggering response's status nor its latency. A lost send is not retried (ADR-0011 decision 5).
 */
public interface MailSender {

	/** Send the "verify your email" message with the tokenized verification link. */
	void sendEmailVerification(String toEmail, URI verificationLink);

	/**
	 * Send the "reset your password" message. {@code resetLink} runs in the off-thread task after the suppression
	 * check; it may write (issue the token, #1336) but must be bounded, as one drainer serves every recovery mail.
	 * Empty sends nothing; a throw is counted as a loss and logged without its message.
	 */
	void sendPasswordReset(String toEmail, Supplier<Optional<URI>> resetLink);

	/**
	 * Tell a self-registered operator its account was approved, linking the sign-in page. A lost notice is
	 * unrecoverable in-product and counted under {@code kind="operator-approved"} (ADR-0011 decision 5).
	 */
	void sendOperatorApproved(String toEmail, URI signInLink);
}
