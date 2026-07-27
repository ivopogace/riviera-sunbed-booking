package ai.riviera.platform.notification.application;

import java.net.URI;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 */
@Service
public class TransactionalMailService implements MailSender {

	private static final Logger log = LoggerFactory.getLogger(TransactionalMailService.class);

	private final Mailer mailer;
	private final MailDispatcher dispatcher;

	TransactionalMailService(Mailer mailer, MailDispatcher dispatcher) {
		this.mailer = mailer;
		this.dispatcher = dispatcher;
	}

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		dispatchQuietly(() -> mailer.sendEmailVerification(toEmail, verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		dispatchQuietly(() -> mailer.sendPasswordReset(toEmail, resetLink));
	}

	/** Deliver the booking confirmation now, on the caller's thread; a transport failure propagates. */
	public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		mailer.sendBookingConfirmation(toEmail, confirmation);
	}

	private void dispatchQuietly(Runnable send) {
		dispatcher.dispatch(() -> {
			try {
				send.run();
			}
			catch (RuntimeException e) {
				// The mailer is a best-effort side channel; never log the raw link/token (invariant #7).
				log.warn("Recovery email send failed ({}); the token was issued, delivery can be retried",
						e.getClass().getSimpleName());
			}
		});
	}
}
