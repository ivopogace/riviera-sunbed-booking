package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The once-only policy behind the ADMIN refund-resubmit lever (#454) — the
 * {@code MailResubmissionService} shape on the money path.
 *
 * <p><strong>A duplicate refund is prevented two layers down, and this is not either layer.</strong>
 * The gateway call is idempotency-keyed on the booking ({@code booking-<id>-refund}), so a re-driven
 * refund that already succeeded is returned, not repeated; and the v2 registry's
 * {@code markResubmitted} claim skips a publication whose previous resubmission is still in flight —
 * durably, across instances.
 *
 * <p><strong>What this class adds is a bound on redundant sweeps, and an answer.</strong> During a
 * gateway outage every re-driven refund fails fast and is immediately outstanding again, so an admin
 * clicking through an incident would drive a retry storm at the struggling gateway — each press
 * reporting success while settling nothing. The {@link ReentrantLock#tryLock()} answers the
 * simultaneous case and {@link RefundResubmissionWindow} the rapid-sequential one, so a press either
 * does real work or says plainly why it did not.
 *
 * <p><strong>The window starts at construction, not at the first press.</strong> A deploy has just
 * republished everything outstanding ({@code republish-outstanding-events-on-restart=true}), so a
 * press seconds later is the same redundant sweep as any other rapid second one. Treating the boot
 * republish as resubmission zero costs at most one refused press per deploy (#405's R-3).
 *
 * <p>Nothing here logs a booking id or code (invariant #7) — and structurally cannot: this service
 * sees publication <em>counts</em>, never payloads.
 */
@Service
class RefundResubmissionService implements RefundResubmission {

	private static final Logger log = LoggerFactory.getLogger(RefundResubmissionService.class);

	private final RefundOutbox outbox;

	private final RefundResubmissionWindow window;

	private final Clock clock;

	private final ReentrantLock inFlight = new ReentrantLock();

	private volatile Instant lastAcceptedAt;

	RefundResubmissionService(RefundOutbox outbox, RefundResubmissionWindow window, Clock clock) {
		this.outbox = outbox;
		this.window = window;
		this.clock = clock;
		this.lastAcceptedAt = clock.instant();
	}

	@Override
	public RefundOutboxStatus status() {
		return new RefundOutboxStatus(outbox.countOutstanding(), cooldownRemaining());
	}

	@Override
	public RefundResubmissionOutcome resubmit() {
		if (!inFlight.tryLock()) {
			return new RefundResubmissionOutcome.AlreadyRunning(window.cooldown());
		}
		try {
			Duration remaining = cooldownRemaining();
			if (!remaining.isZero()) {
				return new RefundResubmissionOutcome.CoolingDown(remaining);
			}
			return new RefundResubmissionOutcome.Resubmitted(accept(), window.cooldown());
		}
		finally {
			inFlight.unlock();
		}
	}

	/**
	 * Starts the cooldown, then re-drives — the conservative order: a resubmission that throws
	 * part-way has still re-driven some refunds, so the window must already be running when the
	 * failure is observed, or a partially-completed sweep is immediately repeatable.
	 */
	private int accept() {
		lastAcceptedAt = clock.instant();
		int resubmitted = outbox.resubmitOutstanding();
		log.info("Admin resubmitted {} outstanding refund publication(s)", resubmitted);
		return resubmitted;
	}

	private Duration cooldownRemaining() {
		Duration remaining = window.cooldown().minus(Duration.between(lastAcceptedAt, clock.instant()));
		return remaining.isNegative() ? Duration.ZERO : remaining;
	}
}
