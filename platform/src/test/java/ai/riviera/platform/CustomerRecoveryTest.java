package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.notification.api.MailDeliverability;
import ai.riviera.platform.notification.api.MailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The edge orchestration around a recovery send (#369, reshaped by #382): {@code CustomerRecovery}
 * mints the raw token, stores only the digest — synchronously, on the caller's thread, because the
 * token store is NOT best-effort — and hands the fully-formed tokenized link to the
 * {@code notification} module's {@link MailSender}. Everything this class previously asserted about
 * <em>how</em> the send then runs (off-thread, failure swallowed — the #369 timing-oracle closure)
 * moved behind that port and is pinned by {@code TransactionalMailServiceTest}; what remains here is
 * the edge's half of the D-8 contract: issue first, then fire-and-forget with the right link.
 */
class CustomerRecoveryTest {

	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7L);
	private static final String EMAIL = "tourist@example.com";
	private static final String BASE_URL = "https://riviera.example";

	private final CustomerAccountRecovery accounts = mock(CustomerAccountRecovery.class);
	private final MailSender mails = mock(MailSender.class);
	private final MailDeliverability deliverability = mock(MailDeliverability.class);

	private final CustomerRecovery recovery = new CustomerRecovery(accounts, mails, deliverability,
			new RecoveryTokens(),
			new RecoveryProperties(Duration.ofHours(24), Duration.ofHours(1), BASE_URL),
			Clock.fixed(Instant.parse("2026-07-27T10:00:00Z"), ZoneOffset.UTC));

	@Test
	void issuesTheTokenOnTheCallersThread() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		// The token store is NOT best-effort: only the send is fire-and-forget (issue scope, plan R-3).
		verify(accounts).issuePasswordResetToken(eq(ACCOUNT), any(), any());
	}

	@Test
	void handsTheTokenizedResetLinkToTheSendPort() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		ArgumentCaptor<URI> link = ArgumentCaptor.forClass(URI.class);
		verify(mails).sendPasswordReset(eq(EMAIL), link.capture());
		assertThat(link.getValue()).asString().startsWith(BASE_URL + CustomerRecovery.RESET_PATH + "?token=");
	}

	@Test
	void handsTheTokenizedVerificationLinkToTheSendPort() {
		recovery.sendVerificationEmail(ACCOUNT, EMAIL);

		verify(accounts).issueEmailVerificationToken(eq(ACCOUNT), any(), any());
		ArgumentCaptor<URI> link = ArgumentCaptor.forClass(URI.class);
		verify(mails).sendEmailVerification(eq(EMAIL), link.capture());
		assertThat(link.getValue()).asString().startsWith(BASE_URL + CustomerRecovery.VERIFY_PATH + "?token=");
	}

	/**
	 * AC-3 (#400): the disclosure is a <em>read</em> bolted onto the answer, not a gate on the send. A
	 * suppressed address still gets its token issued and its send dispatched exactly as before — whether
	 * that send is then withheld stays {@code notification}'s decision at its own chokepoint, taken off
	 * this thread.
	 */
	@Test
	void issuesAndDispatchesRegardlessOfSuppression() {
		when(deliverability.isWithheld(EMAIL)).thenReturn(true);

		assertThat(recovery.sendVerificationEmail(ACCOUNT, EMAIL)).isEqualTo(VerificationMailOutcome.WITHHELD);

		verify(accounts).issueEmailVerificationToken(eq(ACCOUNT), any(), any());
		verify(mails).sendEmailVerification(eq(EMAIL), any());
	}

	@Test
	void reportsSentForADeliverableAddress() {
		when(deliverability.isWithheld(EMAIL)).thenReturn(false);

		assertThat(recovery.sendVerificationEmail(ACCOUNT, EMAIL)).isEqualTo(VerificationMailOutcome.SENT);
	}
}
