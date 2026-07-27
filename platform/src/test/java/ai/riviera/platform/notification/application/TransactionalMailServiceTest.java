package ai.riviera.platform.notification.application;

import java.net.URI;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The chokepoint's contract (#382, absorbing what {@code CustomerRecoveryDispatchTest} pinned at the
 * edge before the move): a recovery send does <em>no mail work on the caller's thread</em> — the
 * structural closure of the #369 timing account-enumeration oracle, recorded through a
 * {@link MailDispatcher} that captures the task instead of running it — and a transport failure
 * dies inside the dispatched task (D-8: the response may not reveal whether the address is
 * registered). The booking confirmation is the deliberate opposite: synchronous, failures
 * propagating, so the Event Publication Registry retries it.
 */
class TransactionalMailServiceTest {

	private static final String EMAIL = "tourist@example.com";
	private static final URI LINK = URI.create("https://riviera.example/account/reset?token=t");

	private final Mailer mailer = mock(Mailer.class);
	private final AtomicReference<Runnable> dispatched = new AtomicReference<>();

	private final TransactionalMailService service =
			new TransactionalMailService(mailer, dispatched::set);

	@Test
	void doesNoMailWorkOnTheCallersThread() {
		service.sendPasswordReset(EMAIL, LINK);

		verify(mailer, never()).sendPasswordReset(any(), any());
		assertThat(dispatched.get()).as("the send must have been handed to the dispatcher").isNotNull();
	}

	@Test
	void sendsThroughTheTransportWhenTheDispatchedTaskRuns() {
		service.sendPasswordReset(EMAIL, LINK);
		dispatched.get().run();

		verify(mailer).sendPasswordReset(EMAIL, LINK);
	}

	@Test
	void dispatchesTheVerificationSendToo() {
		service.sendEmailVerification(EMAIL, LINK);

		verify(mailer, never()).sendEmailVerification(any(), any());
		dispatched.get().run();
		verify(mailer).sendEmailVerification(EMAIL, LINK);
	}

	@Test
	void aSendFailureIsSwallowedInsideTheDispatchedTask() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendEmailVerification(any(), any());
		service.sendEmailVerification(EMAIL, LINK);

		// Wherever the task runs, the failure must die there — it may not change the response (D-8).
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();
	}

	@Test
	void theBookingConfirmationIsSynchronousAndPropagatesTransportFailures() {
		BookingConfirmationMail confirmation = new BookingConfirmationMail(
				"CODE1234", "Vala Beach", java.time.LocalDate.of(2026, 8, 1), "A", 3, 4500, "EUR");
		service.sendBookingConfirmation(EMAIL, confirmation);
		verify(mailer).sendBookingConfirmation(EMAIL, confirmation);

		// The registry vehicle relies on the throw to keep the publication outstanding (#371).
		doThrow(new IllegalStateException("relay down")).when(mailer).sendBookingConfirmation(any(), any());
		assertThatThrownBy(() -> service.sendBookingConfirmation(EMAIL, confirmation))
				.isInstanceOf(IllegalStateException.class);
	}
}
