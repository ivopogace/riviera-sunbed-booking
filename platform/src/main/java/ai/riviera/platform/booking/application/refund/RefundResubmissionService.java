package ai.riviera.platform.booking.application.refund;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.shared.ResubmissionOutcome;
import ai.riviera.platform.shared.ResubmissionThrottle;

/**
 * The ADMIN refund-resubmit lever (#454): this module's scope ({@link RefundOutbox}, exactly the
 * refund listener) behind the kernel's {@link ResubmissionThrottle}, which owns what a press means —
 * single-flight, cooldown seeded at construction so a press cannot race the restart republication,
 * and a typed refusal instead of a success that moved nothing. What stays this module's: the scope,
 * the window value ({@link RefundResubmissionWindow}), and the log line's noun.
 *
 * <p>A duplicate <em>refund</em> is prevented two layers below the throttle — the gateway call is
 * idempotency-keyed on the booking ({@code booking-<id>-refund}), and the v2 registry's
 * {@code markResubmitted} claim skips a publication whose previous resubmission is still in flight.
 *
 * <p>Nothing here logs a booking id or code (invariant #7) — and structurally cannot: this service
 * sees publication <em>counts</em>, never payloads.
 */
@Service
class RefundResubmissionService implements RefundResubmission {

	private static final Logger log = LoggerFactory.getLogger(RefundResubmissionService.class);

	private final RefundOutbox outbox;

	private final ResubmissionThrottle throttle;

	RefundResubmissionService(RefundOutbox outbox, RefundResubmissionWindow window, Clock clock) {
		this.outbox = outbox;
		this.throttle = new ResubmissionThrottle(window.cooldown(), clock);
	}

	@Override
	public RefundOutboxStatus status() {
		return new RefundOutboxStatus(outbox.countOutstanding(), throttle.cooldownRemaining());
	}

	@Override
	public ResubmissionOutcome resubmit() {
		ResubmissionOutcome outcome = throttle.attempt(outbox::resubmitOutstanding);
		if (outcome instanceof ResubmissionOutcome.Resubmitted done) {
			log.info("Admin resubmitted {} outstanding refund publication(s)", done.count());
		}
		return outcome;
	}
}
