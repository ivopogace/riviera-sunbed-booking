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
 * The module's send chokepoint (#382): every transactional mail — both vehicles — leaves through
 * this service, so the cross-cutting send rules live in exactly one place instead of at each
 * call site (they previously lived in the edge's {@code CustomerRecovery.dispatchQuietly}).
 *
 * <p><strong>Recovery sends</strong> (the published {@link MailSender} port) are best-effort and
 * asynchronous: handed to the {@link MailDispatcher}, with the failure catch <em>inside</em> the
 * dispatched task so a transport failure dies wherever the task runs — the triggering request's
 * status code (D-8 non-enumeration) and latency (the #369 timing oracle) stay uninfluenced, and
 * a rejected dispatch is equally invisible to the caller. The token is already stored when the
 * edge calls this, so the user can simply re-request.
 *
 * <p><strong>The booking confirmation</strong> (module-internal, driven by the registry listener)
 * is deliberately the opposite: synchronous on the listener's thread, transport failures
 * propagating, so the Event Publication Registry keeps the publication outstanding and retries —
 * the at-least-once contract (#371). Public only for {@code adapter/in}; not on the published port.
 *
 * <p><strong>Suppression</strong> — the module's defining invariant, <em>no send to a suppressed
 * address</em> — is enforced here for both vehicles, per send attempt (so a registry retry honors
 * the newest suppression state, R-7), with <strong>one deliberate carve-out</strong>: on the recovery
 * vehicle a <em>transient</em> failure of the lookup itself sends the mail rather than dropping it
 * (#386 — {@link #isSuppressedOrFailOpen} argues the trade and bounds it to blips).
 * A suppressed skip completes normally on either vehicle: on
 * the registry vehicle a throw would park the publication in a permanent retry loop (R-6). The
 * recovery-side check runs <em>inside</em> the dispatched task, off the request thread — a
 * suppression SELECT on the caller's thread would widen the very timing oracle the dispatcher
 * closes (R-2).
 *
 * <p><strong>Everything the swallow loses is counted, and attributed</strong> (#423,
 * {@link ObservabilityMetrics#MAIL_RECOVERY_FAILED}). Swallowing is required here — the outcome may
 * influence neither the response's status nor its latency (D-8) — but a swallow with no accounting
 * is a silent loss, and this one is the vehicle's <em>likeliest</em>: {@code AsyncMailDispatcher}'s
 * drop counter needs 100 sends queued to move, while a down relay fails every send from the first.
 * The two failures the dispatched task can produce are counted apart, because they are the same
 * consequence from different systems: a transport failure means the relay, a non-transient
 * suppression-lookup failure means the database, and one counter for both would page whoever reads
 * it toward the wrong one. That is why the task's single catch is two — the split exists to name the
 * cause, not to change the handling; both still swallow, and neither line carries the address or the
 * link (invariant #7). <strong>Between them the two catches still cover the whole task</strong>, which
 * is why the suppressed-address branch sits inside the first rather than between them: the drainer is
 * a single thread ({@code AsyncMailDispatcher}), and an exception escaping this lambda would be a loss
 * less observable than the one this class exists to record.
 *
 * <p><strong>The registry vehicle deliberately gets no equivalent counter.</strong> Its transport
 * failure propagates (see {@link #sendBookingConfirmation}), so the publication stays outstanding and
 * {@code riviera.outbox.pending} — already watched by {@code MoneyPathAlertCheck} — rises on exactly
 * this event. Adding a second series would count one failure twice and invite summing two numbers
 * that mean different things. The asymmetry is a property of the vehicles, not an oversight:
 * accounting belongs wherever the loss becomes unrecoverable, which for the registry is nowhere.
 */
@Service
public class TransactionalMailService implements MailSender {

	private static final Logger log = LoggerFactory.getLogger(TransactionalMailService.class);

	/** The recovery flow a lost mail belonged to — one series, two audiences with different urgency. */
	static final String KIND_TAG = "kind";

	static final String KIND_VERIFICATION = "verification";

	static final String KIND_PASSWORD_RESET = "password-reset";

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
		dispatchQuietly(KIND_VERIFICATION, toEmail, () -> mailer.sendEmailVerification(toEmail, verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		dispatchQuietly(KIND_PASSWORD_RESET, toEmail, () -> mailer.sendPasswordReset(toEmail, resetLink));
	}

	/** Deliver the booking confirmation now, on the caller's thread; a transport failure propagates. */
	public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		if (suppressions.isSuppressed(toEmail)) {
			// No address in the line (PII posture of this log); the correlation id rides the MDC.
			log.info("Booking-confirmation mail skipped: the address is suppressed");
			return;
		}
		mailer.sendBookingConfirmation(toEmail, confirmation);
	}

	private void dispatchQuietly(String kind, String toEmail, Runnable send) {
		// Between them the two catches cover the whole task: nothing may escape onto the drainer.
		dispatcher.dispatch(() -> {
			try {
				if (isSuppressedOrFailOpen(kind, toEmail)) {
					log.info("Recovery {} mail skipped: the address is suppressed", kind);
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
	 * Account for a recovery mail that will never arrive. Runs on the dispatcher's pooled thread, and
	 * must not throw from there: the caller's response is long gone (D-8), so an exception here would
	 * only kill the drainer that carries every other send.
	 *
	 * <p>Counter and line both, one line per loss — the same call {@code AsyncMailDispatcher} argues for
	 * its drop, and for the same reason: this vehicle keeps no durable copy of the payload (ADR-0011
	 * decision 5), so the line is the only per-loss artefact there is and carries in its MDC the
	 * correlation id of the request whose user is still waiting. The level stays {@code WARN} where the
	 * dispatcher's saturation escalates to {@code ERROR}, and that difference is deliberate: saturation
	 * is rare and always actionable, while a relay outage fails <em>every</em> send for its duration, so
	 * escalating each one would flood {@code ERROR} exactly when someone is reading it. Alert on the
	 * counter; read the log for detail.
	 *
	 * <p>The line carries the mail kind, the cause and the exception's simple name — never the address
	 * and never the link, which is a single-use bearer credential (invariant #7).
	 */
	private void recordLoss(String kind, String reason, RuntimeException cause) {
		meters.counter(ObservabilityMetrics.MAIL_RECOVERY_FAILED, KIND_TAG, kind, REASON_TAG, reason).increment();
		log.warn("Recovery {} mail was not delivered — {} failure ({}); the token was issued, so the user can "
				+ "re-request", kind, reason, cause.getClass().getSimpleName());
	}

	/**
	 * The suppression state for a recovery send, <strong>failing open</strong> when the lookup itself
	 * cannot be completed (#386).
	 *
	 * <p>Until #386 this read shared the transport's catch, so a transient DB failure dropped the mail
	 * behind a log line that read like an SMTP failure (recorded as accepted drift Info-5). Sending
	 * anyway is the better trade on this vehicle: the suppression list is empty in production until
	 * #372's bounce feed lands, a user-requested reset to a suppressed address is the most harmless
	 * send available, and D-8 makes the HTTP response identical either way — so a dropped reset is a
	 * dead end the user gets no signal about and cannot distinguish from success. Bounding this read
	 * with a finite query timeout (same slice) makes the failure branch <em>more</em> reachable, since
	 * a wedged read now aborts instead of hanging.
	 *
	 * <p><strong>Transient failures only</strong>, deliberately narrower than {@code DataAccessException}.
	 * The trade above is argued for a blip — a wedged, timed-out or briefly unavailable read. A
	 * structurally broken lookup (a revoked grant, schema drift, a typo'd column after a refactor) is not
	 * a blip: failing open on it would mail <em>every</em> suppressed address indefinitely, behind one log
	 * line. Those propagate to the caller, which still drops the mail — but no longer behind one log line:
	 * since #423 that catch is the dedicated one, recording the loss under
	 * {@link #REASON_SUPPRESSION_LOOKUP} so a broken lookup is legible as the database fault it is rather
	 * than as the relay fault it is not.
	 *
	 * <p>Deliberately <strong>not</strong> shared with {@link #sendBookingConfirmation}: on the registry
	 * vehicle the throw is load-bearing, keeping the publication outstanding so the at-least-once
	 * contract (#371) retries against a healthy database instead of burning the delivery on a blip.
	 */
	private boolean isSuppressedOrFailOpen(String kind, String toEmail) {
		try {
			return suppressions.isSuppressed(toEmail);
		}
		catch (TransientDataAccessException e) {
			log.warn("Suppression lookup failed transiently for the {} mail ({}); sending anyway rather than "
					+ "dropping it", kind, e.getClass().getSimpleName());
			return false;
		}
	}
}
