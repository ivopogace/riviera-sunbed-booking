package ai.riviera.platform.notification.application;

import java.net.URI;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.stereotype.Service;

import ai.riviera.platform.notification.api.MailSender;

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
 */
@Service
public class TransactionalMailService implements MailSender {

	private static final Logger log = LoggerFactory.getLogger(TransactionalMailService.class);

	private final Mailer mailer;
	private final MailDispatcher dispatcher;
	private final EmailSuppressions suppressions;

	TransactionalMailService(Mailer mailer, MailDispatcher dispatcher, EmailSuppressions suppressions) {
		this.mailer = mailer;
		this.dispatcher = dispatcher;
		this.suppressions = suppressions;
	}

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		dispatchQuietly("verification", toEmail, () -> mailer.sendEmailVerification(toEmail, verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		dispatchQuietly("password-reset", toEmail, () -> mailer.sendPasswordReset(toEmail, resetLink));
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
		dispatcher.dispatch(() -> {
			try {
				if (isSuppressedOrFailOpen(kind, toEmail)) {
					log.info("Recovery {} mail skipped: the address is suppressed", kind);
					return;
				}
				send.run();
			}
			catch (RuntimeException e) {
				// Never log the raw link/token (invariant #7); the outer net also covers a read bug
				// that is not a DataAccessException, which must not escape onto the pooled thread.
				log.warn("Recovery {} mail was not delivered ({}); the token was issued, the user can re-request",
						kind, e.getClass().getSimpleName());
			}
		});
	}

	/**
	 * The suppression state for a recovery send, <strong>failing open</strong> when the lookup itself
	 * cannot be completed (#386).
	 *
	 * <p>Until #386 this read shared the transport's catch, so a transient DB failure dropped the mail
	 * behind a log line that read like an SMTP failure (recorded as accepted drift Info-5). Sending
	 * anyway is the better trade on this vehicle: the suppression list is empty in production until
	 * #370's bounce feed lands, a user-requested reset to a suppressed address is the most harmless
	 * send available, and D-8 makes the HTTP response identical either way — so a dropped reset is a
	 * dead end the user gets no signal about and cannot distinguish from success. Bounding this read
	 * with a finite query timeout (same slice) makes the failure branch <em>more</em> reachable, since
	 * a wedged read now aborts instead of hanging.
	 *
	 * <p><strong>Transient failures only</strong>, deliberately narrower than {@code DataAccessException}.
	 * The trade above is argued for a blip — a wedged, timed-out or briefly unavailable read. A
	 * structurally broken lookup (a revoked grant, schema drift, a typo'd column after a refactor) is not
	 * a blip: failing open on it would mail <em>every</em> suppressed address indefinitely, behind one log
	 * line. Those fall through to the caller's outer catch, where the mail is dropped as it always was.
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
