package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The structural closure of the timing account-enumeration oracle (#369): the assertion is that
 * <em>no mail work happens on the caller's thread</em> — recorded through a {@link MailDispatcher} that
 * captures the task instead of running it — rather than a wall-clock measurement, which would be both
 * flaky and weaker. Running the captured task afterwards proves the send itself is unchanged: the same
 * tokenized link reaches the same {@code Mailer}, and a transport failure is still swallowed (D-8, the
 * response may not reveal whether the address is registered).
 */
class CustomerRecoveryDispatchTest {

	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7L);
	private static final String EMAIL = "tourist@example.com";
	private static final String BASE_URL = "https://riviera.example";

	private final CustomerAccountRecovery accounts = mock(CustomerAccountRecovery.class);
	private final Mailer mailer = mock(Mailer.class);
	private final AtomicReference<Runnable> dispatched = new AtomicReference<>();

	private final CustomerRecovery recovery = new CustomerRecovery(accounts, mailer, new RecoveryTokens(),
			new RecoveryProperties(Duration.ofHours(24), Duration.ofHours(1), BASE_URL),
			Clock.fixed(Instant.parse("2026-07-27T10:00:00Z"), ZoneOffset.UTC), dispatched::set);

	@Test
	void doesNoMailWorkOnTheCallersThread() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		verify(mailer, never()).sendPasswordReset(any(), any());
		assertThat(dispatched.get()).as("the send must have been handed to the dispatcher").isNotNull();
	}

	@Test
	void stillIssuesTheTokenOnTheCallersThread() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		// The token store is NOT best-effort: only the send moved off-thread (issue scope, plan R-3).
		verify(accounts).issuePasswordResetToken(eq(ACCOUNT), any(), any());
	}

	@Test
	void sendsTheTokenizedLinkWhenTheDispatchedTaskRuns() {
		recovery.sendPasswordResetEmail(ACCOUNT, EMAIL);

		dispatched.get().run();

		ArgumentCaptor<URI> link = ArgumentCaptor.forClass(URI.class);
		verify(mailer).sendPasswordReset(eq(EMAIL), link.capture());
		assertThat(link.getValue()).asString().startsWith(BASE_URL + CustomerRecovery.RESET_PATH + "?token=");
	}

	@Test
	void dispatchesTheVerificationSendToo() {
		recovery.sendVerificationEmail(ACCOUNT, EMAIL);

		verify(mailer, never()).sendEmailVerification(any(), any());
		dispatched.get().run();

		ArgumentCaptor<URI> link = ArgumentCaptor.forClass(URI.class);
		verify(mailer).sendEmailVerification(eq(EMAIL), link.capture());
		assertThat(link.getValue()).asString().startsWith(BASE_URL + CustomerRecovery.VERIFY_PATH + "?token=");
	}

	@Test
	void aSendFailureIsSwallowedInsideTheDispatchedTask() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendEmailVerification(any(), any());
		recovery.sendVerificationEmail(ACCOUNT, EMAIL);

		// Wherever the task runs, the failure must die there — it may not change the response (D-8).
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();
	}
}
