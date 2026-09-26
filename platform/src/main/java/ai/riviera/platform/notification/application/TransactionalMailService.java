package ai.riviera.platform.notification.application;

import java.net.URI;

import io.micrometer.core.instrument.MeterRegistry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.stereotype.Service;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * The module's send chokepoint (ADR-0011): every mail leaves here, on one of two opposite vehicles.
 * {@link MailSender} sends run on the {@link MailDispatcher}, failures caught <em>inside</em> the task so
 * neither response status nor latency reveals the outcome (D-8); each loss is counted under
 * {@link ObservabilityMetrics#MAIL_RECOVERY_FAILED}. Booking mails run on the listener's thread and let a
 * transport failure propagate, keeping the publication outstanding for retry. No send to a suppressed
 * address, checked per attempt; a skip completes normally. Rationale: RESPONSIBILITIES.md §notification.
 */
@Service
public class TransactionalMailService implements MailSender {

	private static final Logger log = LoggerFactory.getLogger(TransactionalMailService.class);

	/** Which system failed — the whole reason the counter is tagged rather than plain. */
	static final String REASON_TAG = "reason";

	/**
	 * Any exception escaping the send — usually the relay, but a template or link defect shares the bucket.
	 * The exception class would be an unbounded tag; the {@code WARN} line beside each increment carries it.
	 */
	static final String REASON_TRANSPORT = "transport";

	/** The suppression read failed non-transiently: a database/grant fault, not a relay one. */
	static final String REASON_SUPPRESSION_LOOKUP = "suppression-lookup";

	private final Mailer mailer;
	private final MailDispatcher dispatcher;
	private final EmailSuppressions suppressions;
	private final MeterRegistry meters;

	TransactionalMailService(Mailer mailer, MailDispatcher dispatcher, EmailSuppressions suppressions,
			MeterRegistry meters) {
		this.mailer = mailer;
		this.dispatcher = dispatcher;
		this.suppressions = suppressions;
		this.meters = meters;
	}

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		dispatchQuietly(MailKind.VERIFICATION, toEmail, () -> mailer.sendEmailVerification(toEmail, verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		dispatchQuietly(MailKind.PASSWORD_RESET, toEmail, () -> mailer.sendPasswordReset(toEmail, resetLink));
	}

	@Override
	public void sendOperatorApproved(String toEmail, URI signInLink) {
		dispatchQuietly(MailKind.OPERATOR_APPROVED, toEmail,
				() -> mailer.sendOperatorApproved(toEmail, signInLink));
	}

	/**
	 * Deliver the booking confirmation now, on the caller's thread; a transport failure propagates. Send and
	 * suppressed skip both complete normally, so the outcome is the delivery log's only way to tell them apart.
	 */
	public ConfirmationSendOutcome sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		if (suppressions.isSuppressed(toEmail)) {
			// No address in the line (PII posture of this log); the correlation id rides the MDC.
			log.info("Booking-confirmation mail skipped: the address is suppressed");
			return ConfirmationSendOutcome.WITHHELD_SUPPRESSED;
		}
		mailer.sendBookingConfirmation(toEmail, confirmation);
		return ConfirmationSendOutcome.SENT;
	}

	/**
	 * Deliver the cancellation/refund record now, on the caller's thread; a transport failure propagates.
	 * The suppression check gets no {@link #isSuppressedOrFailOpen} carve-out on this vehicle, for the
	 * same reason the throw stays: a blip should cost a retry, not the delivery.
	 */
	public void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation) {
		if (suppressions.isSuppressed(toEmail)) {
			log.info("Booking-cancellation mail skipped: the address is suppressed");
			return;
		}
		mailer.sendBookingCancellation(toEmail, cancellation);
	}

	/**
	 * Deliver the accepted request's payment deadline now, on the caller's thread; a transport failure
	 * propagates — and this is where the retry that throw buys is most obviously worth having, the mail
	 * being the guest's only warning that an unnoticed acceptance will be swept away again.
	 */
	public void sendPaymentDue(String toEmail, PaymentDueMail paymentDue) {
		if (suppressions.isSuppressed(toEmail)) {
			log.info("Payment-due mail skipped: the address is suppressed");
			return;
		}
		mailer.sendPaymentDue(toEmail, paymentDue);
	}

	/** Deliver the changed-spot notice now, on the caller's thread; a transport failure propagates. */
	public void sendBookingMoved(String toEmail, BookingMovedMail moved) {
		if (suppressions.isSuppressed(toEmail)) {
			log.info("Booking-moved mail skipped: the address is suppressed");
			return;
		}
		mailer.sendBookingMoved(toEmail, moved);
	}

	/** Deliver the declined request's record now, on the caller's thread; a transport failure propagates. */
	public void sendRequestDeclined(String toEmail, RequestDeclinedMail declined) {
		if (suppressions.isSuppressed(toEmail)) {
			log.info("Request-declined mail skipped: the address is suppressed");
			return;
		}
		mailer.sendRequestDeclined(toEmail, declined);
	}

	/** Deliver the expired request's record now, on the caller's thread; {@link #sendRequestDeclined}'s mirror. */
	public void sendRequestExpired(String toEmail, RequestExpiredMail expired) {
		if (suppressions.isSuppressed(toEmail)) {
			log.info("Request-expired mail skipped: the address is suppressed");
			return;
		}
		mailer.sendRequestExpired(toEmail, expired);
	}

	private void dispatchQuietly(MailKind kind, String toEmail, Runnable send) {
		// Between them the two catches cover the whole task: nothing may escape onto the drainer.
		dispatcher.dispatch(kind, () -> {
			try {
				if (isSuppressedOrFailOpen(kind, toEmail)) {
					log.info("The {} mail was skipped: the address is suppressed", kind.tagValue());
					return;
				}
			}
			catch (RuntimeException e) {
				recordLoss(kind, REASON_SUPPRESSION_LOOKUP, e);
				return;
			}
			try {
				send.run();
			}
			catch (RuntimeException e) {
				recordLoss(kind, REASON_TRANSPORT, e);
			}
		});
	}

	/**
	 * Count and log a recovery mail that will never arrive; runs on the drainer, so it must not throw. One
	 * {@code WARN} per loss (not {@code ERROR}: an outage fails every send — alert on the counter), never the
	 * address or the link, a bearer credential (invariant #7).
	 */
	private void recordLoss(MailKind kind, String reason, RuntimeException cause) {
		meters.counter(ObservabilityMetrics.MAIL_RECOVERY_FAILED, MailKind.TAG, kind.tagValue(), REASON_TAG, reason)
				.increment();
		log.warn("The {} mail was not delivered — {} failure ({}); this vehicle keeps no durable copy, so "
				+ "the send is not retried", kind.tagValue(), reason, cause.getClass().getSimpleName());
	}

	/**
	 * Suppression state for a recovery send, <strong>failing open</strong> on a <em>transient</em> lookup
	 * failure only; structural faults propagate and drop as {@link #REASON_SUPPRESSION_LOOKUP}. Never use it
	 * on the registry vehicle, where the throw buys the retry. Rationale: ADR-0011 decision 7.
	 */
	private boolean isSuppressedOrFailOpen(MailKind kind, String toEmail) {
		try {
			return suppressions.isSuppressed(toEmail);
		}
		catch (TransientDataAccessException e) {
			log.warn("Suppression lookup failed transiently for the {} mail ({}); sending anyway rather than "
					+ "dropping it", kind.tagValue(), e.getClass().getSimpleName());
			return false;
		}
	}
}
