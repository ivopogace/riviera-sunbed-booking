package ai.riviera.platform.notification.api;

import java.net.URI;

/**
 * The published fire-and-forget transactional-mail port — what the platform-edge recovery
 * flows call instead of touching mail machinery themselves. The edge keeps orchestrating
 * <em>when</em> to send and hands each message here fully formed (RV-BE-11): the link already
 * carries the raw single-use token — a bearer credential (invariant #7) — so the module never
 * touches the token store or the account.
 *
 * <p><strong>Contract — every send is best-effort and asynchronous:</strong>
 * <ul>
 *   <li><strong>Never throws.</strong> The send's outcome may influence neither the triggering
 *       response's status code (the D-8 non-enumeration contract) nor its latency (the timing
 *       oracle): a transport failure dies inside the dispatched task, a saturated dispatcher drops
 *       the send. <strong>What a lost send costs differs by kind</strong> — the recovery pair is
 *       user-retryable by design, the operator-approval notice is not (ADR-0011 decision 5; see
 *       {@link #sendOperatorApproved}).</li>
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

	/**
	 * Tell a self-registered operator that a platform admin approved its account, pointing at the
	 * sign-in page.
	 *
	 * <p>The first kind here whose link is <strong>not</strong> a bearer credential — it is the
	 * ordinary sign-in URL, which anyone may hold. It still travels this port rather than the Event
	 * Publication Registry, because ADR-0011 decision 5 reads more than the payload: approval is
	 * edge-orchestrated from an admin request, not a domain fact another module acts on, so minting an
	 * event to carry the news back to the edge that issued the request would be ceremony. It inherits
	 * the contract above unchanged — in particular, a mail failure may not fail or slow the approval.
	 *
	 * <p>What it does <strong>not</strong> inherit is the reason best-effort delivery is acceptable
	 * (ADR-0011 decision 5). There is no token already stored and no page offering a
	 * retry, so a lost notice is unrecoverable in the product: the operator learns its account is live
	 * by trying to sign in, the very experience this exists to remove. That is accepted as the
	 * knowingly weaker case and mitigated only operationally — but is now mitigated in full
	 * rather than in part: a send the transport <em>ran and lost</em> raises
	 * {@code MAIL_RECOVERY_FAILED} under {@code kind="operator-approved"}, and one the pool
	 * <em>never ran</em> raises {@code MAIL_RECOVERY_DROPPED} under the same tag. Either way the remedy
	 * is to tell the operator, which is a real remedy because a human is already in the loop: the admin
	 * who approved — and who the approval log names, since invariant #7 keeps the address off the tag.
	 */
	void sendOperatorApproved(String toEmail, URI signInLink);
}
