package ai.riviera.platform;

import java.net.URI;

import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;

/**
 * Tells a self-registered operator that a platform admin approved it (#375, Email S7). Until this
 * slice the only signal was retrying sign-in until it stopped failing.
 *
 * <p><strong>Edge machinery, like every other mail decision</strong> (RV-BE-11): the {@code operator}
 * module owns the {@code PENDING → ACTIVE} transition and knows nothing about mail; {@code notification}
 * owns delivery and knows nothing about approvals; deciding <em>when</em> to send and building the link
 * is this class's job, exactly as {@code CustomerRecovery} does for the recovery pair.
 *
 * <p><strong>Why a class and not two lines in the controller.</strong> Three rules travel together —
 * send only on {@link ApprovalOutcome.Approved}, only when there is an address, and always to the same
 * link — and the second is the one that bites: {@code contact_email} is nullable (V29), so the address
 * arrives as "probably present". Inlined, those rules would sit in a controller method whose subject is
 * HTTP status mapping.
 *
 * <p><strong>The link reuses {@code riviera.recovery.link-base-url}</strong> rather than introducing a
 * second origin property. Despite the name, that value is already documented as the absolute origin
 * emailed links point at (#368) and is already an env-injected deploy secret — a second knob would be a
 * second thing to mis-set, with a dead link as the symptom either way.
 */
@Component
class OperatorApprovalMail {

	/** The audience-aware sign-in page (S9); post-sign-in landing is driven by {@code /api/venues/mine}. */
	private static final String SIGN_IN_PATH = "/account/sign-in";

	private final MailSender mails;
	private final URI signInLink;

	OperatorApprovalMail(MailSender mails, RecoveryProperties properties) {
		this.mails = mails;
		// Built once: it carries no per-request data, so a malformed origin is a boot failure — the
		// posture RecoveryProperties already takes for its TTLs (#426) — not a 500 on a committed approval.
		this.signInLink = UriComponentsBuilder.fromUriString(properties.linkBaseUrl())
				.path(SIGN_IN_PATH)
				.build()
				.toUri();
	}

	/**
	 * Mail the approved operator its sign-in link, or do nothing if the account carries no address.
	 *
	 * <p>Nothing here is wrapped in a catch, and that is deliberate. The approval has already committed
	 * by the time this runs and cannot be re-run (a second approve is {@code 409 NOT_PENDING}), so an
	 * exception escaping would be the #357 failure shape again — a {@code 500} on work that succeeded.
	 * The defence is that there is nothing left to throw: the link was built at boot, and
	 * {@link MailSender} never throws by contract (it dispatches off-thread and swallows-and-counts
	 * inside the task). A catch here would add nothing but the ability to hide a genuine defect in that
	 * contract, which is the one thing worth hearing about.
	 */
	void notifyApproved(ApprovalOutcome.Approved approved) {
		String toEmail = approved.contactEmail();
		if (toEmail == null || toEmail.isBlank()) {
			return;
		}
		mails.sendOperatorApproved(toEmail, signInLink);
	}
}
