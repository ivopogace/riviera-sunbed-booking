package ai.riviera.platform.auth.application;

import java.net.URI;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.notification.vocabulary.EmailedLink;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.shared.SiteLocale;

/**
 * Tells a self-registered operator that an admin approved it: its venues are now tourist-visible
 * (console access never waited on approval). Edge machinery, like every mail decision (RV-BE-11):
 * {@code operator} owns the transition, {@code notification} the delivery; this class decides when to
 * send and builds the link. It sends only on {@link ApprovalOutcome.Approved} and only with an address
 * ({@code contact_email} is nullable), in the operator's stored language, the link under its subpath. The link
 * reuses {@code riviera.recovery.link-base-url}, the one origin emailed links point at.
 */
@Component
public class OperatorApprovalMail {

	/** The audience-aware sign-in page, {@code /account/sign-in}; landing is driven by {@code /api/venues/mine}. */
	private static final String ACCOUNT_SEGMENT = "account";
	private static final String SIGN_IN_SEGMENT = "sign-in";

	private final MailSender mails;
	private final Map<SiteLocale, URI> signInLinks;

	/**
	 * The links, one per locale, are built <strong>here, once</strong>, not per send: they carry no per-request
	 * data, so a malformed origin should fail the deploy — the posture {@link RecoveryProperties} already takes
	 * for its TTLs — rather than raise {@code 500} on an approval that has already committed.
	 */
	public OperatorApprovalMail(MailSender mails, RecoveryProperties properties) {
		this.mails = mails;
		EmailedLink origin = EmailedLink.on(properties.linkBaseUrl());
		Map<SiteLocale, URI> links = new EnumMap<>(SiteLocale.class);
		for (SiteLocale locale : SiteLocale.values()) {
			links.put(locale, origin.under(locale).path(ACCOUNT_SEGMENT, SIGN_IN_SEGMENT).toUri());
		}
		this.signInLinks = Collections.unmodifiableMap(links);
	}

	/**
	 * Mail the approved operator its sign-in link, or do nothing without an address. Runs after the
	 * approval committed, so it must not throw; it can't (link built at boot, {@link MailSender} never
	 * throws by contract), and it deliberately has no catch, which could only hide a breach of that.
	 */
	public void notifyApproved(ApprovalOutcome.Approved approved) {
		String toEmail = approved.contactEmail();
		if (toEmail == null || toEmail.isBlank()) {
			return;
		}
		mails.sendOperatorApproved(toEmail, approved.locale(), signInLinks.get(approved.locale()));
	}
}
