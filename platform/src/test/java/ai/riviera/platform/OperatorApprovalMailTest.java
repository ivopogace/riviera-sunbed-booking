package ai.riviera.platform;

import java.net.URI;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The edge collaborator's own contract (#375) — the two things {@code OperatorApprovalMailIT} cannot
 * reach through a real approval: an address the schema still permits to be absent, and the exact link
 * built from the configured origin.
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

	@Test
	void sendsTheSignInLinkBuiltOnTheConfiguredOrigin() {
		approvalMail.notifyApproved(new ApprovalOutcome.Approved(EMAIL));

		ArgumentCaptor<URI> link = ArgumentCaptor.forClass(URI.class);
		verify(mails).sendOperatorApproved(eq(EMAIL), link.capture());
		assertThat(link.getValue()).isEqualTo(URI.create(BASE_URL + "/account/sign-in"));
	}

	@Test
	void sendsNothingWhenTheApprovedOperatorHasNoAddress() {
		approvalMail.notifyApproved(new ApprovalOutcome.Approved(null));
		approvalMail.notifyApproved(new ApprovalOutcome.Approved("   "));

		verify(mails, never()).sendOperatorApproved(any(), any());
	}
}
