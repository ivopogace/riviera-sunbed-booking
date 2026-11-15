package ai.riviera.platform.auth.application;

import java.net.URI;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.shared.SiteLocale;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The edge collaborator's own contract — what {@code OperatorApprovalMailIT} cannot reach through a real
 * approval: an address the schema still permits to be absent, and the exact link built from the configured
 * origin under the operator's locale.
 *
 * <p>{@code contact_email} is nullable (V29 — the env-managed bootstrap admin has none). Self-registration
 * always supplies one, so a null here means a row that was seeded rather than registered; the guard
 * exists because the column's shape, not the flow, is what the code has to survive.
 */
class OperatorApprovalMailTest {

	private static final String BASE_URL = "https://riviera.example";
	private static final String EMAIL = "owner@vala-beach.example";

	private final MailSender mails = mock(MailSender.class);
	// The TTLs are irrelevant here but must be in range — RecoveryProperties validates at construction.
	private final OperatorApprovalMail approvalMail = new OperatorApprovalMail(mails,
			new RecoveryProperties(Duration.ofHours(24), Duration.ofHours(1), BASE_URL));

	@ParameterizedTest
	@CsvSource({ "EN, /account/sign-in", "SQ, /sq/account/sign-in", "IT, /it/account/sign-in" })
	void sendsTheNoticeInTheOperatorsLocaleLinkingTheSignInPageUnderIt(SiteLocale locale, String path) {
		approvalMail.notifyApproved(new ApprovalOutcome.Approved(EMAIL, locale));

		verify(mails).sendOperatorApproved(EMAIL, locale, URI.create(BASE_URL + path));
	}

	@Test
	void buildsTheSignInLinkOnATrailingSlashedUnderscoredOrigin() {
		new OperatorApprovalMail(mails, new RecoveryProperties(Duration.ofHours(24), Duration.ofHours(1),
				"http://riviera_backend:8080/")).notifyApproved(new ApprovalOutcome.Approved(EMAIL, SiteLocale.SQ));

		verify(mails).sendOperatorApproved(EMAIL, SiteLocale.SQ, URI.create("http://riviera_backend:8080/sq/account/sign-in"));
	}

	@Test
	void sendsNothingWhenTheApprovedOperatorHasNoAddress() {
		approvalMail.notifyApproved(new ApprovalOutcome.Approved(null, SiteLocale.EN));
		approvalMail.notifyApproved(new ApprovalOutcome.Approved("   ", SiteLocale.EN));

		verify(mails, never()).sendOperatorApproved(any(), any(), any());
	}
}
