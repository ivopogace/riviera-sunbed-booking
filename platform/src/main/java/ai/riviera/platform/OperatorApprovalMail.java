package ai.riviera.platform;

import java.net.URI;

import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;

/**
 * Tells a self-registered operator that an admin approved it: its venues are now tourist-visible
 * (console access never waited on approval). Edge machinery, like every mail decision (RV-BE-11):
 * {@code operator} owns the transition, {@code notification} the delivery; this class decides when to
 * send and builds the link. It sends only on {@link ApprovalOutcome.Approved} and only with an address
 * ({@code contact_email} is nullable). The link reuses {@code riviera.recovery.link-base-url}, the one
 * origin emailed links point at, rather than a second origin property to mis-set.
 */
@Component
class OperatorApprovalMail {

	/** The audience-aware sign-in page; post-sign-in landing is driven by {@code /api/venues/mine}. */
	private static final String SIGN_IN_PATH = "/account/sign-in";

	private final MailSender mails;
	private final URI signInLink;

	/**
	 * The link is built <strong>here, once</strong>, not per send: it carries no per-request data, so a
	 * malformed origin should fail the deploy — the posture {@link RecoveryProperties} already takes for
	 * its TTLs — rather than raise {@code 500} on an approval that has already committed.
	 */
	OperatorApprovalMail(MailSender mails, RecoveryProperties properties) {
		this.mails = mails;
		this.signInLink = UriComponentsBuilder.fromUriString(properties.linkBaseUrl())
				.path(SIGN_IN_PATH)
				.build()
				.toUri();
	}

	/**
	 * Mail the approved operator its sign-in link, or do nothing without an address. Runs after the
	 * approval committed, so it must not throw; it can't (link built at boot, {@link MailSender} never
	 * throws by contract), and it deliberately has no catch, which could only hide a breach of that.
	 */
	void notifyApproved(ApprovalOutcome.Approved approved) {
		String toEmail = approved.contactEmail();
		if (toEmail == null || toEmail.isBlank()) {
			return;
		}
		mails.sendOperatorApproved(toEmail, signInLink);
	}
}
