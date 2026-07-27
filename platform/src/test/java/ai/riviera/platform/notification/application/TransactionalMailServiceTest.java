package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.TransientDataAccessResourceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
	private static final BookingConfirmationMail CONFIRMATION = new BookingConfirmationMail(
			"CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1), "A", 3, 4500, "EUR");

	private final Mailer mailer = mock(Mailer.class);
	private final EmailSuppressions suppressions = mock(EmailSuppressions.class);
	private final AtomicReference<Runnable> dispatched = new AtomicReference<>();

	private final TransactionalMailService service =
			new TransactionalMailService(mailer, dispatched::set, suppressions);

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
		service.sendBookingConfirmation(EMAIL, CONFIRMATION);
		verify(mailer).sendBookingConfirmation(EMAIL, CONFIRMATION);

		// The registry vehicle relies on the throw to keep the publication outstanding (#371).
		doThrow(new IllegalStateException("relay down")).when(mailer).sendBookingConfirmation(any(), any());
		assertThatThrownBy(() -> service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void suppressedAddressIsNeverDispatchedToTheTransport() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		service.sendPasswordReset(EMAIL, LINK);
		dispatched.get().run();
		service.sendEmailVerification(EMAIL, LINK);
		dispatched.get().run();

		verify(mailer, never()).sendPasswordReset(any(), any());
		verify(mailer, never()).sendEmailVerification(any(), any());
	}

	@Test
	void theSuppressionReadRunsOffTheCallersThread() {
		// R-2: a suppression SELECT on the request thread would widen the #369 timing oracle.
		service.sendPasswordReset(EMAIL, LINK);

		verify(suppressions, never()).isSuppressed(any());
		dispatched.get().run();
		verify(suppressions).isSuppressed(EMAIL);
	}

	/**
	 * #386: a failing suppression <em>read</em> fails <strong>open</strong> on the recovery vehicle —
	 * the mail goes. This deliberately reverses accepted drift Info-5, under which the read shared the
	 * transport's catch and a transient DB blip silently dropped a reset the user was waiting for,
	 * behind a log line that read like an SMTP failure. Three reasons: the list is empty in production
	 * until #370's bounce feed lands; a user-requested reset to a suppressed address is the most
	 * harmless send there is; and D-8 makes the response identical either way, so a dropped reset is a
	 * dead end with no signal to the user. Bounding the read with a query timeout (same slice) makes
	 * this path <em>more</em> reachable, since a slow read now throws instead of hanging.
	 */
	@Test
	void aSuppressionReadFailureStillSendsTheRecoveryMail() {
		when(suppressions.isSuppressed(EMAIL)).thenThrow(new TransientDataAccessResourceException("pool exhausted"));

		service.sendPasswordReset(EMAIL, LINK);
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		verify(mailer).sendPasswordReset(EMAIL, LINK);
	}

	/**
	 * Fail-open is scoped to <em>transient</em> failures, which is the only case the decision was argued
	 * for (a wedged or timed-out read, made reachable by this slice's query timeout). A structurally
	 * broken lookup — a bad grant, schema drift, a typo'd column after a refactor — is not transient, and
	 * failing open on it would mail every suppressed address indefinitely behind a single log line. Those
	 * fall through to the outer catch instead: the mail is dropped, as before (#386 review).
	 */
	@Test
	void aStructurallyBrokenSuppressionReadDoesNotFailOpen() {
		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new InvalidDataAccessResourceUsageException("relation does not exist"));

		service.sendPasswordReset(EMAIL, LINK);
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		verify(mailer, never()).sendPasswordReset(any(), any());
	}

	/**
	 * The other half of the same decision: fail-open is scoped to the recovery vehicle and must not
	 * leak to the registry one. There the throw is load-bearing — it keeps the publication outstanding
	 * so the at-least-once contract (#371) retries against a healthy DB, rather than burning the
	 * delivery on a blip.
	 */
	@Test
	void aSuppressionReadFailureStillPropagatesOnTheRegistryVehicle() {
		when(suppressions.isSuppressed(EMAIL)).thenThrow(new TransientDataAccessResourceException("pool exhausted"));

		assertThatThrownBy(() -> service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.isInstanceOf(TransientDataAccessResourceException.class);
		verify(mailer, never()).sendBookingConfirmation(any(), any());
	}

	@Test
	void suppressedAddressSkipsTheBookingConfirmationWithoutThrowing() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		// Must complete normally: a throw would park the publication in a permanent retry loop (R-6).
		assertThatCode(() -> service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.doesNotThrowAnyException();
		verify(mailer, never()).sendBookingConfirmation(any(), any());
	}
}
