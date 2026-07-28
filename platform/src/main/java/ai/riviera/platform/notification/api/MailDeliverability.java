package ai.riviera.platform.notification.api;

/**
 * Whether a transactional mail to an address would be <strong>withheld</strong> as suppressed (#400) —
 * the published read counterpart to {@link MailSender}, so a surface that just triggered a send can
 * stop claiming one went out when this module's defining invariant (<em>no send to a suppressed
 * address</em>) silently withheld it.
 *
 * <p><strong>Why a second port rather than a return value on {@link MailSender}.</strong> That port's
 * whole contract is that a send influences neither the triggering response's status code (the D-8
 * non-enumeration contract) nor its latency (the #369 timing oracle) — guarantees the anonymous
 * {@code forgot-password} flow depends on. Answering "would it arrive" is the opposite conversation:
 * synchronous, and deliberately reflected in the response. Splitting by role (#95) keeps the
 * fire-and-forget contract intact for the callers that need it.
 *
 * <p><strong>Only safe where the caller already owns the address.</strong> The one consumer is the
 * authenticated verification-resend at the platform edge, which asks about its own session
 * principal's address — one bit about an address the caller already holds, so there is no account to
 * enumerate and no latency fact it does not already have. Consulting this from an anonymous surface
 * would rebuild exactly the oracle #369 closed; {@code forgot-password}'s hedged copy is deliberately
 * left alone (#400).
 *
 * <p><strong>A present-tense question, not a record.</strong> It answers whether a mail sent
 * <em>now</em> would be withheld; it is not the recorded outcome of a past send. A bounce landing
 * afterwards, or a #391 reinstatement, moves the answer — the window is milliseconds and the
 * consequence is one advisory sentence.
 *
 * <p><strong>Never throws for an operational failure</strong> — an unanswerable lookup reports
 * {@code false}, so the surface degrades to its pre-#400 copy instead of failing the request.
 */
public interface MailDeliverability {

	/** Whether a mail to this address would be withheld right now because the address is suppressed. */
	boolean isWithheld(String toEmail);
}
