package ai.riviera.platform.auth.application;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.util.UriComponentsBuilder;

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
 * The edge orchestration around a recovery send: {@code CustomerRecovery} mints the raw token, stores only
 * the digest and hands the tokenized link to {@code notification}'s {@link MailSender}. A verification token
 * is stored on the caller's thread; a reset token is minted and stored only when the dispatched task
 * resolves the deferred link, so forgot-password writes nothing on the request thread (#1336). How the
 * send then runs is pinned behind the port by {@code TransactionalMailServiceTest}.
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

	@BeforeEach
	void issuesForALiveAccount() {
		when(accounts.issuePasswordResetToken(any(), any(), any())).thenReturn(true);
		when(accounts.issueEmailVerificationToken(any(), any(), any())).thenReturn(true);
	}

	@Test
	void mailsNoVerificationLinkWhenTheAccountWasErased() {
		when(accounts.issueEmailVerificationToken(any(), any(), any())).thenReturn(false);

		recovery.sendVerificationEmail(ACCOUNT, EMAIL);

		verifyNoInteractions(mails);
	}

	@Test
	void resolvesNoResetLinkWhenTheAccountWasErased() {
		when(accounts.issuePasswordResetToken(any(), any(), any())).thenReturn(false);

		assertThat(deferredResetLink().get()).isEmpty();
	}

	@Test
	void issuesNoResetTokenOnTheCallersThread() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		verify(mails).sendPasswordReset(eq(EMAIL), any());
		verifyNoInteractions(accounts);
	}

	@Test
	void theDeferredResetLinkStoresOnlyTheDigestWithTheResetExpiry() {
		URI link = deferredResetLink().get().orElseThrow();

		String rawToken = UriComponentsBuilder.fromUri(link).build().getQueryParams().getFirst("token");
		ArgumentCaptor<String> storedHash = ArgumentCaptor.forClass(String.class);
		verify(accounts).issuePasswordResetToken(eq(ACCOUNT), storedHash.capture(),
				eq(Instant.parse("2026-07-27T11:00:00Z")));
		assertThat(storedHash.getValue()).isEqualTo(new RecoveryTokens().hash(rawToken)).isNotEqualTo(rawToken);
		assertThat(link).asString().startsWith(BASE_URL + CustomerRecovery.RESET_PATH + "?token=");
	}

	@Test
	void eachResolutionMintsAFreshToken() {
		Supplier<Optional<URI>> deferred = deferredResetLink();

		assertThat(deferred.get()).isNotEqualTo(deferred.get());
	}

	@SuppressWarnings("unchecked")
	private Supplier<Optional<URI>> deferredResetLink() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);
		ArgumentCaptor<Supplier<Optional<URI>>> deferred = ArgumentCaptor.forClass(Supplier.class);
		verify(mails).sendPasswordReset(eq(EMAIL), deferred.capture());
		return deferred.getValue();
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
