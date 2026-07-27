package ai.riviera.platform.notification.api;

import java.net.URI;

/**
 * The published fire-and-forget transactional-mail port (#382) — what the platform-edge recovery
 * flows call instead of touching mail machinery themselves. The edge keeps orchestrating
 * <em>when</em> to send and hands each message here fully formed (RV-BE-11): the link already
 * carries the raw single-use token — a bearer credential (invariant #7) — so the module never
 * touches the token store or the account.
 *
 * <p><strong>Contract — every send is best-effort and asynchronous:</strong>
 * <ul>
 *   <li><strong>Never throws.</strong> The send's outcome may influence neither the triggering
 *       response's status code (the D-8 non-enumeration contract) nor its latency (the #369 timing
 *       oracle): a transport failure dies inside the dispatched task, a saturated dispatcher drops
 *       the send. The flows are user-retryable by design.</li>
 *   <li><strong>Runs off the caller's thread</strong>, on the module's bounded in-memory dispatcher
 *       — never the Event Publication Registry, which would persist the credential-carrying payload
 *       in cleartext (ADR-0011 decision 5: ids-only → registry, bearer-credential → in-memory).</li>
 *   <li><strong>Suppression-enforced:</strong> a send to a suppressed address is silently skipped —
 *       the module's defining invariant, checked at its single chokepoint.</li>
 * </ul>
 *
 * <p>Grows a method per edge-called message kind; module-internal kinds (the booking confirmation,
 * driven by {@code BookingConfirmed}) deliberately do not appear here.
 */
public interface MailSender {

	/** Send the "verify your email" message with the tokenized verification link. */
	void sendEmailVerification(String toEmail, URI verificationLink);

	/** Send the "reset your password" message with the tokenized reset link. */
	void sendPasswordReset(String toEmail, URI resetLink);
}
