package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.shared.ObservabilityMetrics;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
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
 * The chokepoint's contract (absorbing what {@code CustomerRecoveryDispatchTest} pinned at the
 * edge before the move): a recovery send does <em>no mail work on the caller's thread</em> — the
 * structural closure of the timing account-enumeration oracle, recorded through a
 * {@link MailDispatcher} that captures the task instead of running it — and a transport failure
 * dies inside the dispatched task (D-8: the response may not reveal whether the address is
 * registered). The booking confirmation is the deliberate opposite: synchronous, failures
 * propagating, so the Event Publication Registry retries it.
 *
 * <p><strong>This slice added the accounting for the loss that swallow creates.</strong> The specs below
 * assert not only <em>that</em> a lost recovery mail is counted but <em>how it is attributed</em>:
 * the same catch site can lose a mail to a dead relay or to a structurally broken suppression
 * lookup, and a counter that cannot tell those apart cannot be the signal the runbook says it is.
 * Just as load-bearing are the specs that assert the counter stays at <em>zero</em> — a suppressed
 * skip and a transient fail-open are not losses, and counting them would make a healthy
 * relay read as a broken one.
 */
class TransactionalMailServiceTest {

	private static final String EMAIL = "tourist@example.com";
	private static final String OPERATOR_EMAIL = "owner@vala-beach.example";
	private static final URI LINK = URI.create("https://riviera.example/account/reset?token=t");
	private static final URI SIGN_IN_LINK = URI.create("https://riviera.example/account/sign-in");
	private static final BookingConfirmationMail CONFIRMATION = new BookingConfirmationMail(
			"CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1), "A", 3, 4500, "EUR");
	private static final BookingCancellationMail CANCELLATION = new BookingCancellationMail(
			"CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1), 4500, "EUR", RefundReason.POLICY);
	private static final PaymentDueMail PAYMENT_DUE = new PaymentDueMail(
			"CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1),
			Instant.parse("2026-07-31T18:00:00Z"), 4500, "EUR",
			URI.create("https://riviera.example/booking/CODE1234"));
	private static final RequestDeclinedMail DECLINED = new RequestDeclinedMail(
			"CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1),
			URI.create("https://riviera.example/booking/CODE1234"));
	private static final RequestExpiredMail EXPIRED = new RequestExpiredMail(
			"CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1),
			URI.create("https://riviera.example/booking/CODE1234"));

	private final Mailer mailer = mock(Mailer.class);
	private final EmailSuppressions suppressions = mock(EmailSuppressions.class);
	private final AtomicReference<Runnable> dispatched = new AtomicReference<>();
	private final AtomicReference<MailKind> dispatchedKind = new AtomicReference<>();
	private final MeterRegistry meters = new SimpleMeterRegistry();
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private ch.qos.logback.classic.Logger serviceLogger;

	private final TransactionalMailService service =
			new TransactionalMailService(mailer, (kind, send) -> {
				dispatchedKind.set(kind);
				dispatched.set(send);
			}, suppressions, meters);

	@BeforeEach
	void captureLogs() {
		logs.start();
		serviceLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(TransactionalMailService.class);
		serviceLogger.addAppender(logs);
	}

	@AfterEach
	void releaseLogs() {
		serviceLogger.detachAppender(logs);
		logs.stop();
	}

	private double failedFor(String kind, String reason) {
		Counter counter = meters.find(ObservabilityMetrics.MAIL_RECOVERY_FAILED)
				.tag(MailKind.TAG, kind)
				.tag(TransactionalMailService.REASON_TAG, reason)
				.counter();
		return counter == null ? 0 : counter.count();
	}

	private double failedTotal() {
		return meters.find(ObservabilityMetrics.MAIL_RECOVERY_FAILED)
				.counters()
				.stream()
				.mapToDouble(Counter::count)
				.sum();
	}

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

	/**
	 * The dispatcher accounts for the sends it never runs, so it has to be told what it is carrying —
	 * before this slice its whole interface was {@code dispatch(Runnable)}, and a mail it dropped could not
	 * be attributed to any flow. This service is the one production caller, and the kind is already in its
	 * hand at every call site; passing it is what makes the drop counter's {@code kind} tag possible at all.
	 */
	@Test
	void everyDispatchedSendCarriesItsKind() {
		service.sendEmailVerification(EMAIL, LINK);
		assertThat(dispatchedKind.get()).isEqualTo(MailKind.VERIFICATION);

		service.sendPasswordReset(EMAIL, LINK);
		assertThat(dispatchedKind.get()).isEqualTo(MailKind.PASSWORD_RESET);

		service.sendOperatorApproved(OPERATOR_EMAIL, SIGN_IN_LINK);
		assertThat(dispatchedKind.get())
				.as("the kind whose loss nobody re-sends is the one that most needs naming")
				.isEqualTo(MailKind.OPERATOR_APPROVED);
	}

	/**
	 * The failure this slice exists for: the dispatcher <em>accepted</em> the send and the relay
	 * then refused it. Before this counter the entire record was one log line, so a relay outage — the
	 * likelier of the vehicle's two losses by far, since saturating the pool takes 100 queued sends —
	 * was un-alertable. The swallow itself is unchanged and still asserted here: wherever the task runs,
	 * the failure dies there, because the response may not reveal whether the address is registered (D-8).
	 */
	@Test
	void aTransportFailureIsCountedAndStillSwallowed() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendPasswordReset(any(), any());
		service.sendPasswordReset(EMAIL, LINK);

		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		assertThat(failedFor(MailKind.PASSWORD_RESET.tagValue(),
				TransactionalMailService.REASON_TRANSPORT)).isEqualTo(1);
		assertThat(failedTotal()).as("exactly one loss, counted once").isEqualTo(1);
	}

	@Test
	void theFailureCounterCarriesTheMailKind() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendEmailVerification(any(), any());
		service.sendEmailVerification(EMAIL, LINK);
		dispatched.get().run();

		assertThat(failedFor(MailKind.VERIFICATION.tagValue(),
				TransactionalMailService.REASON_TRANSPORT)).isEqualTo(1);
		assertThat(failedFor(MailKind.PASSWORD_RESET.tagValue(),
				TransactionalMailService.REASON_TRANSPORT)).isZero();
	}

	/**
	 * The second cause the one catch swallows, and the reason this counter is tagged rather than plain.
	 * A structurally broken suppression lookup (a revoked grant, schema drift) loses the mail just as
	 * finally as a dead relay — so leaving it uncounted would open a fourth silent loss site in the very
	 * slice that closes the third — but it is a <em>database</em> fault, and an operator paged to
	 * "the relay is down" would be looking at the wrong system.
	 */
	@Test
	void aBrokenSuppressionLookupIsCountedAsItsOwnCause() {
		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new InvalidDataAccessResourceUsageException("relation does not exist"));

		service.sendPasswordReset(EMAIL, LINK);
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		assertThat(failedFor(MailKind.PASSWORD_RESET.tagValue(),
				TransactionalMailService.REASON_SUPPRESSION_LOOKUP)).isEqualTo(1);
		assertThat(failedFor(MailKind.PASSWORD_RESET.tagValue(),
				TransactionalMailService.REASON_TRANSPORT))
				.as("the relay was never reached, so it must not be blamed").isZero();
	}

	/**
	 * Invariant #7 on the accounting path: the two failure lines are the only per-loss artefact that
	 * exists on this vehicle, and neither may carry the address or the tokenized link — the link is a
	 * single-use bearer credential, which is the whole reason this payload stays out of the registry
	 * (ADR-0011 decision 5). The exception's simple name and the mail kind are all they carry.
	 */
	@Test
	void neitherFailureLineCarriesTheAddressOrTheLink() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendPasswordReset(any(), any());
		service.sendPasswordReset(EMAIL, LINK);
		dispatched.get().run();

		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new InvalidDataAccessResourceUsageException("relation does not exist"));
		service.sendEmailVerification(EMAIL, LINK);
		dispatched.get().run();

		assertThat(logs.list).isNotEmpty().allSatisfy(event -> assertThat(event.getFormattedMessage())
				.doesNotContain(EMAIL)
				.doesNotContain(LINK.toString()));
	}

	/**
	 * The vehicle's first <strong>non-recovery</strong> kind. It carries no bearer credential —
	 * a plain sign-in link — and yet it rides this dispatcher rather than the registry, because the
	 * payload is not the only thing ADR-0011 decision 5 reads: it is edge-orchestrated from an admin
	 * request, not driven by a domain fact, so a registry publication would be ceremony carrying a
	 * message back to the very edge that issued it. What matters is that it inherits the
	 * vehicle's whole contract unchanged, starting here — off the caller's thread, so the mail can
	 * neither slow nor fail the approval request that triggered it.
	 */
	@Test
	void dispatchesTheOperatorApprovedSendToo() {
		service.sendOperatorApproved(OPERATOR_EMAIL, SIGN_IN_LINK);

		verify(mailer, never()).sendOperatorApproved(any(), any());
		dispatched.get().run();
		verify(mailer).sendOperatorApproved(OPERATOR_EMAIL, SIGN_IN_LINK);
	}

	/**
	 * The counter's {@code kind} tag is what keeps this addition honest: the series is named
	 * {@code riviera.mail.recovery.failed} after the <em>vehicle</em>, not the flow, so an
	 * operator-approval loss must be legible as its own kind rather than inflating a tourist
	 * recovery flow's numbers.
	 */
	@Test
	void anOperatorApprovedTransportFailureIsSwallowedAndCounted() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendOperatorApproved(any(), any());
		service.sendOperatorApproved(OPERATOR_EMAIL, SIGN_IN_LINK);

		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		assertThat(failedFor(MailKind.OPERATOR_APPROVED.tagValue(),
				TransactionalMailService.REASON_TRANSPORT)).isEqualTo(1);
		assertThat(failedFor(MailKind.PASSWORD_RESET.tagValue(),
				TransactionalMailService.REASON_TRANSPORT))
				.as("a non-recovery loss must not read as a recovery one").isZero();
		assertThat(failedTotal()).as("exactly one loss, counted once").isEqualTo(1);
	}

	/** The module's defining invariant reaches the new kind for free — it goes through the chokepoint. */
	@Test
	void anOperatorApprovedMailToASuppressedAddressIsSkipped() {
		when(suppressions.isSuppressed(OPERATOR_EMAIL)).thenReturn(true);

		service.sendOperatorApproved(OPERATOR_EMAIL, SIGN_IN_LINK);
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		verify(mailer, never()).sendOperatorApproved(any(), any());
		assertThat(failedTotal()).as("a withheld mail is the policy working, not a loss").isZero();
	}

	@Test
	void theBookingConfirmationIsSynchronousAndPropagatesTransportFailures() {
		service.sendBookingConfirmation(EMAIL, CONFIRMATION);
		verify(mailer).sendBookingConfirmation(EMAIL, CONFIRMATION);

		// The registry vehicle relies on the throw to keep the publication outstanding.
		doThrow(new IllegalStateException("relay down")).when(mailer).sendBookingConfirmation(any(), any());
		assertThatThrownBy(() -> service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.isInstanceOf(IllegalStateException.class);
	}

	/**
	 * AC-6: the cancellation joins the confirmation on the registry vehicle, so it must behave like it
	 * and not like the recovery pair beside it — synchronous on the listener's thread, and the throw
	 * left intact, because that is the whole mechanism keeping the publication outstanding for the
	 * restart republish. A dispatched-and-swallowed cancellation would look identical in every other
	 * test and quietly turn at-least-once into fire-and-forget.
	 */
	@Test
	void theBookingCancellationIsSynchronousAndPropagatesTransportFailures() {
		service.sendBookingCancellation(EMAIL, CANCELLATION);

		verify(mailer).sendBookingCancellation(EMAIL, CANCELLATION);
		assertThat(dispatched.get()).as("the registry vehicle does not use the in-memory dispatcher").isNull();

		doThrow(new IllegalStateException("relay down")).when(mailer).sendBookingCancellation(any(), any());
		assertThatThrownBy(() -> service.sendBookingCancellation(EMAIL, CANCELLATION))
				.isInstanceOf(IllegalStateException.class);
	}

	/**
	 * AC-7. The skip must <em>return</em>, not throw: on this vehicle a throw parks the publication in
	 * a permanent retry loop against an address the policy will keep refusing (R-6). Counting it would
	 * also be wrong — a withheld mail is the suppression list working.
	 */
	@Test
	void aSuppressedAddressSkipsTheCancellation() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		assertThatCode(() -> service.sendBookingCancellation(EMAIL, CANCELLATION)).doesNotThrowAnyException();

		verify(mailer, never()).sendBookingCancellation(any(), any());
		assertThat(failedTotal()).as("a withheld mail is the policy working, not a loss").isZero();
	}

	/**
	 * The fail-open carve-out is the <em>recovery</em> vehicle's alone. Here the throw is
	 * load-bearing: it keeps the publication outstanding so at-least-once retries against a healthy
	 * database, rather than burning the delivery on a blip.
	 */
	@Test
	void aFailingSuppressionReadDoesNotFailOpenOnTheCancellation() {
		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new TransientDataAccessResourceException("read timed out"));

		assertThatThrownBy(() -> service.sendBookingCancellation(EMAIL, CANCELLATION))
				.isInstanceOf(TransientDataAccessResourceException.class);

		verify(mailer, never()).sendBookingCancellation(any(), any());
	}

	/**
	 * This kind joins the registry vehicle, so it must behave like its two siblings and not like the
	 * recovery pair beside them. The throw is the mechanism, not an accident: it is what keeps the
	 * publication outstanding for the restart republish and the re-drive. A
	 * dispatched-and-swallowed payment-due mail would look identical in every other test in this
	 * slice — the listener IT included, since the mock transport never fails there — and would turn
	 * at-least-once into fire-and-forget for the one mail whose loss costs the guest their booking.
	 */
	@Test
	void thePaymentDueIsSynchronousAndPropagatesTransportFailures() {
		service.sendPaymentDue(EMAIL, PAYMENT_DUE);

		verify(mailer).sendPaymentDue(EMAIL, PAYMENT_DUE);
		assertThat(dispatched.get()).as("the registry vehicle does not use the in-memory dispatcher").isNull();

		doThrow(new IllegalStateException("relay down")).when(mailer).sendPaymentDue(any(), any());
		assertThatThrownBy(() -> service.sendPaymentDue(EMAIL, PAYMENT_DUE))
				.isInstanceOf(IllegalStateException.class);
	}

	/**
	 * The skip must <em>return</em>, not throw: a throw parks the publication in a permanent retry
	 * loop against an address the policy will keep refusing (R-6). Counting it would be wrong too — a
	 * withheld mail is the suppression list working.
	 */
	@Test
	void aSuppressedAddressSkipsThePaymentDue() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		assertThatCode(() -> service.sendPaymentDue(EMAIL, PAYMENT_DUE)).doesNotThrowAnyException();

		verify(mailer, never()).sendPaymentDue(any(), any());
		assertThat(failedTotal()).as("a withheld mail is the policy working, not a loss").isZero();
	}

	/**
	 * The fail-open carve-out is the <em>recovery</em> vehicle's alone, here as on the cancellation:
	 * a blip should cost a retry against a healthy database, not the delivery.
	 */
	@Test
	void aFailingSuppressionReadDoesNotFailOpenOnThePaymentDue() {
		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new TransientDataAccessResourceException("read timed out"));

		assertThatThrownBy(() -> service.sendPaymentDue(EMAIL, PAYMENT_DUE))
				.isInstanceOf(TransientDataAccessResourceException.class);

		verify(mailer, never()).sendPaymentDue(any(), any());
	}

	/**
	 * These two request-outcome mails join the registry vehicle, so each must behave like its three
	 * siblings and not like the recovery pair: synchronous, the throw left intact (it is what keeps
	 * the publication outstanding for the restart republish and the re-drive), the suppression
	 * skip a normal return, and no fail-open carve-out. One test per property per kind — the
	 * arguments are the payment-due trio's, unchanged.
	 */
	@Test
	void theRequestDeclinedIsSynchronousAndPropagatesTransportFailures() {
		service.sendRequestDeclined(EMAIL, DECLINED);

		verify(mailer).sendRequestDeclined(EMAIL, DECLINED);
		assertThat(dispatched.get()).as("the registry vehicle does not use the in-memory dispatcher").isNull();

		doThrow(new IllegalStateException("relay down")).when(mailer).sendRequestDeclined(any(), any());
		assertThatThrownBy(() -> service.sendRequestDeclined(EMAIL, DECLINED))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void aSuppressedAddressSkipsTheRequestDeclined() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		assertThatCode(() -> service.sendRequestDeclined(EMAIL, DECLINED)).doesNotThrowAnyException();

		verify(mailer, never()).sendRequestDeclined(any(), any());
		assertThat(failedTotal()).as("a withheld mail is the policy working, not a loss").isZero();
	}

	@Test
	void aFailingSuppressionReadDoesNotFailOpenOnTheRequestDeclined() {
		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new TransientDataAccessResourceException("read timed out"));

		assertThatThrownBy(() -> service.sendRequestDeclined(EMAIL, DECLINED))
				.isInstanceOf(TransientDataAccessResourceException.class);

		verify(mailer, never()).sendRequestDeclined(any(), any());
	}

	@Test
	void theRequestExpiredIsSynchronousAndPropagatesTransportFailures() {
		service.sendRequestExpired(EMAIL, EXPIRED);

		verify(mailer).sendRequestExpired(EMAIL, EXPIRED);
		assertThat(dispatched.get()).as("the registry vehicle does not use the in-memory dispatcher").isNull();

		doThrow(new IllegalStateException("relay down")).when(mailer).sendRequestExpired(any(), any());
		assertThatThrownBy(() -> service.sendRequestExpired(EMAIL, EXPIRED))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void aSuppressedAddressSkipsTheRequestExpired() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		assertThatCode(() -> service.sendRequestExpired(EMAIL, EXPIRED)).doesNotThrowAnyException();

		verify(mailer, never()).sendRequestExpired(any(), any());
		assertThat(failedTotal()).as("a withheld mail is the policy working, not a loss").isZero();
	}

	@Test
	void aFailingSuppressionReadDoesNotFailOpenOnTheRequestExpired() {
		when(suppressions.isSuppressed(EMAIL))
				.thenThrow(new TransientDataAccessResourceException("read timed out"));

		assertThatThrownBy(() -> service.sendRequestExpired(EMAIL, EXPIRED))
				.isInstanceOf(TransientDataAccessResourceException.class);

		verify(mailer, never()).sendRequestExpired(any(), any());
	}

	@Test
	void suppressedAddressIsNeverDispatchedToTheTransport() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		service.sendPasswordReset(EMAIL, LINK);
		// The skip branch lives inside a catch too — nothing may escape onto the single drainer thread.
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();
		service.sendEmailVerification(EMAIL, LINK);
		assertThatCode(() -> dispatched.get().run()).doesNotThrowAnyException();

		verify(mailer, never()).sendPasswordReset(any(), any());
		verify(mailer, never()).sendEmailVerification(any(), any());
		// A withheld mail is the policy working, not a loss — counting it would fake a broken relay.
		assertThat(failedTotal()).isZero();
	}

	@Test
	void theSuppressionReadRunsOffTheCallersThread() {
		// R-2: a suppression SELECT on the request thread would widen the timing oracle.
		service.sendPasswordReset(EMAIL, LINK);

		verify(suppressions, never()).isSuppressed(any());
		dispatched.get().run();
		verify(suppressions).isSuppressed(EMAIL);
	}

	/**
	 * A failing suppression <em>read</em> fails <strong>open</strong> on the recovery vehicle —
	 * the mail goes. This deliberately reverses accepted drift Info-5, under which the read shared the
	 * transport's catch and a transient DB blip silently dropped a reset the user was waiting for,
	 * behind a log line that read like an SMTP failure. Three reasons: the list is empty in production
	 * until the bounce feed lands; a user-requested reset to a suppressed address is the most
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
		// The mail went, so nothing was lost — the carve-out must not raise the failure series.
		assertThat(failedTotal()).isZero();
	}

	/**
	 * Fail-open is scoped to <em>transient</em> failures, which is the only case the decision was argued
	 * for (a wedged or timed-out read, made reachable by this slice's query timeout). A structurally
	 * broken lookup — a bad grant, schema drift, a typo'd column after a refactor — is not transient, and
	 * failing open on it would mail every suppressed address indefinitely behind a single log line. Those
	 * fall through to the outer catch instead: the mail is dropped, as before.
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
	 * so the at-least-once contract retries against a healthy DB, rather than burning the
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

	/**
	 * The outcome the skip above used to discard. Completing normally is right; leaving the
	 * caller unable to tell a delivery from a deliberate withholding is what made the delivery history
	 * impossible to record honestly — the registry marks both identically, so this return value is the
	 * only place the difference exists.
	 */
	@Test
	void reportsTheConfirmationWithheldWhenTheAddressIsSuppressed() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		assertThat(service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.isEqualTo(ConfirmationSendOutcome.WITHHELD_SUPPRESSED);
	}

	@Test
	void reportsTheConfirmationSentWhenTheAddressIsDeliverable() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(false);

		assertThat(service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.isEqualTo(ConfirmationSendOutcome.SENT);
	}

	/**
	 * The asymmetry this slice had to settle rather than leave implied: the registry vehicle gets no counter
	 * of its own, and that is a decision, not an omission. Its transport failure <em>propagates</em>, so
	 * the event publication stays outstanding and {@code riviera.outbox.pending} — already read by
	 * {@code MoneyPathAlertCheck} — rises. Adding a second series for the same event would double-count
	 * it and invite summing two numbers that mean different things. This test is what makes the decision
	 * enforceable: a future "for symmetry" increment here turns it red.
	 */
	@Test
	void theRegistryVehicleIsAccountedForByTheOutboxNotThisCounter() {
		doThrow(new IllegalStateException("relay down")).when(mailer).sendBookingConfirmation(any(), any());

		assertThatThrownBy(() -> service.sendBookingConfirmation(EMAIL, CONFIRMATION))
				.isInstanceOf(IllegalStateException.class);

		assertThat(meters.find(ObservabilityMetrics.MAIL_RECOVERY_FAILED).counters())
				.as("the outstanding publication is the registry vehicle's record, not this series")
				.isEmpty();
	}
}
