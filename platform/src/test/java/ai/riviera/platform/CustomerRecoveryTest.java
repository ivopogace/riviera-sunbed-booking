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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The edge orchestration around a recovery send: {@code CustomerRecovery}
 * mints the raw token, stores only the digest — synchronously, on the caller's thread, because the
 * token store is NOT best-effort — and hands the fully-formed tokenized link to the
 * {@code notification} module's {@link MailSender}. Everything this class previously asserted about
 * <em>how</em> the send then runs (off-thread, failure swallowed — the timing-oracle closure)
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
	 * AC-3: the regression guard the review round added — sending consults the do-not-mail list
	 * <strong>not at all</strong>. {@code sendVerificationEmail}'s other caller is anonymous registration
	 * ({@code AuthController}, {@code permitAll}), so a suppression SELECT folded in here would put a
	 * discarded synchronous read on that request thread — widening the very D-8 latency gap already closed.
	 */
	@Test
	void sendingNeverConsultsTheDoNotMailList() {
		recovery.sendVerificationEmail(ACCOUNT, EMAIL);

		verify(accounts).issueEmailVerificationToken(eq(ACCOUNT), any(), any());
		verify(mails).sendEmailVerification(eq(EMAIL), any());
		verifyNoInteractions(deliverability);
	}

	@Test
	void answersTheWithheldQuestionOnlyWhenAsked() {
		when(deliverability.isWithheld(EMAIL)).thenReturn(true);

		assertThat(recovery.isVerificationMailWithheld(EMAIL)).isTrue();
	}

	@Test
	void reportsDeliverableForAnUnsuppressedAddress() {
		when(deliverability.isWithheld(EMAIL)).thenReturn(false);

		assertThat(recovery.isVerificationMailWithheld(EMAIL)).isFalse();
		// false is Mockito's default, so without this the case would pass against a hardcoded literal.
		verify(deliverability).isWithheld(EMAIL);
	}
}
