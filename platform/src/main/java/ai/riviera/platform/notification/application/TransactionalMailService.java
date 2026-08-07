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
 * The module's send chokepoint: every transactional mail — both vehicles — leaves through this
 * service, so the cross-cutting send rules live in exactly one place instead of at each call site.
 *
 * <p><strong>The two vehicles have opposite postures, and each is load-bearing.</strong> Sends on the
 * published {@link MailSender} port (the recovery pair plus the operator-approval notice) are
 * best-effort and asynchronous: handed to the {@link MailDispatcher} with the failure catch
 * <em>inside</em> the dispatched task, so neither the triggering response's status (D-8
 * non-enumeration) nor its latency (the timing oracle) can reflect the outcome, and a rejected
 * dispatch is equally invisible. The booking mails, all module-internal and driven by registry
 * listeners, are the reverse: synchronous on the listener's thread with transport failures
 * <em>propagating</em>, because the throw is what keeps the publication outstanding for the
 * at-least-once retry. Public only for {@code adapter/in}; none is on the published port.
 *
 * <p><strong>Suppression</strong> — the module's defining invariant, <em>no send to a suppressed
 * address</em> — is enforced here for both vehicles, per send attempt, so a registry retry honours the
 * newest state. A suppressed skip completes normally on either: a throw would park the publication in
 * a permanent retry loop. The recovery-side check runs <em>inside</em> the dispatched task — a
 * suppression SELECT on the caller's thread would widen the very timing oracle the dispatcher closes —
 * and carries the one deliberate carve-out, {@link #isSuppressedOrFailOpen}.
 *
 * <p>Swallowing on the recovery vehicle is required (D-8) but never silent: every loss is counted under
 * {@link ObservabilityMetrics#MAIL_RECOVERY_FAILED}, split by {@code reason} because a transport failure
 * means the relay and a suppression-lookup failure means the database, and one counter for both would
 * point whoever reads it at the wrong system. The registry vehicle deliberately gets no equivalent —
 * its failure propagates, so {@code riviera.outbox.pending} already accounts for it and a second series
 * would count one failure twice. Full accounting rationale: {@code RESPONSIBILITIES.md}
 * §{@code notification} and {@code docs/runbooks/observability.md}.
 */
@Service
public class TransactionalMailService implements MailSender {

	private static final Logger log = LoggerFactory.getLogger(TransactionalMailService.class);

	/** Which system failed — the whole reason the counter is tagged rather than plain. */
	static final String REASON_TAG = "reason";

	/**
	 * The send attempt itself failed. Usually the relay — refused, unreachable, an SMTP 5xx — but the
	 * tag is applied to <em>any</em> exception escaping the send, so a defect in the mail path (a
	 * template-rendering fault, a malformed link) shares the bucket. Deliberately so: the only tag that
	 * would separate them is the exception class, whose cardinality is unbounded by construction. The
	 * discrimination lives in the {@code WARN} line beside each increment, which carries the class name.
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
	 * Deliver the booking confirmation now, on the caller's thread; a transport failure propagates.
	 *
	 * <p><strong>Reports which of the two things it did.</strong> The skip and the send both complete
	 * normally — they must — so without this value neither the caller nor the Event Publication Registry
	 * could tell a delivery from a deliberate withholding. That is what makes a registry-derived delivery
	 * history impossible to record honestly, and this return value is the alternative's foundation.
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
	 * Account for a recovery mail that will never arrive. Runs on the dispatcher's pooled thread and must
	 * not throw from there: the caller's response is long gone (D-8), so an exception here would only kill
	 * the drainer that carries every other send.
	 *
	 * <p>One line per loss, because this vehicle keeps no durable copy of the payload — the line is the
	 * only per-loss artefact there is. It stays {@code WARN} where the dispatcher's saturation escalates
	 * to {@code ERROR}: a relay outage fails <em>every</em> send for its duration, so escalating each
	 * would flood {@code ERROR} exactly when someone is reading it. Alert on the counter; read the log for
	 * detail. The line carries the kind, the cause and the exception's simple name — never the address and
	 * never the link, a single-use bearer credential (invariant #7).
	 */
	private void recordLoss(MailKind kind, String reason, RuntimeException cause) {
		meters.counter(ObservabilityMetrics.MAIL_RECOVERY_FAILED, MailKind.TAG, kind.tagValue(), REASON_TAG, reason)
				.increment();
		log.warn("The {} mail was not delivered — {} failure ({}); this vehicle keeps no durable copy, so "
				+ "the send is not retried", kind.tagValue(), reason, cause.getClass().getSimpleName());
	}

	/**
	 * The suppression state for a recovery send, <strong>failing open</strong> when the lookup itself
	 * cannot be completed (the one carve-out in ADR-0011 decision 7).
	 *
	 * <p>Sending anyway is the better trade on this vehicle: the suppression list stays empty until the
	 * provider bounce feed lands, a user-requested reset to a suppressed address is the most harmless send
	 * available, and D-8 makes the HTTP response identical either way — so a dropped reset is a dead end
	 * the user gets no signal about and cannot distinguish from success.
	 *
	 * <p><strong>Transient failures only</strong>, deliberately narrower than {@code DataAccessException}.
	 * That trade is argued for a blip — a wedged, timed-out or briefly unavailable read. A structurally
	 * broken lookup (a revoked grant, schema drift, a typo'd column after a refactor) is not one: failing
	 * open on it would mail <em>every</em> suppressed address indefinitely. Those propagate to the caller,
	 * which drops the mail and records it under {@link #REASON_SUPPRESSION_LOOKUP}, so a database fault
	 * stays legible as one rather than as the relay fault it is not.
	 *
	 * <p>Deliberately <strong>not</strong> shared with any registry-vehicle send: there the throw is
	 * load-bearing, keeping the publication outstanding so the at-least-once contract retries against a
	 * healthy database instead of burning the delivery on a blip.
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
