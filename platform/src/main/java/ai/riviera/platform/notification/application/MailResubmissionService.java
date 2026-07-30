package ai.riviera.platform.notification.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The once-only policy behind the ADMIN resubmit lever (#405) — the whole reason this slice is a
 * service and not a two-line controller.
 *
 * <p><strong>Duplicate mail is prevented one layer down, and this is not that layer.</strong> #405
 * reports that {@code markResubmitted} provides no guard — a {@code default} returning {@code true}.
 * That is the <em>v1</em> repository. This deployment runs v2 (V8 ships the v2 schema), where the
 * method is a real claim: {@code UPDATE … SET STATUS = 'RESUBMITTED' … WHERE ID = ? AND STATUS !=
 * 'RESUBMITTED'}, whose row count the registry honours. A publication whose previous resubmission is
 * still draining on {@code registryMailExecutor} (#383) is therefore skipped — durably, in the
 * database, across instances and across restarts, which no in-process lock could match.
 *
 * <p><strong>What this class adds is a bound on redundant work, and an answer.</strong> The registry's
 * claim is per publication; nothing bounds how often the whole scope is swept. During a relay outage
 * every send fails fast and is marked {@code FAILED} again immediately, so an admin clicking through
 * an incident would drive a full re-send storm at the relay each time — and each press would report
 * success while achieving nothing. The {@link ReentrantLock#tryLock()} answers the simultaneous case
 * (two admins, or one double-click on two request threads) and {@link MailResubmissionWindow} the
 * rapid-sequential one, so a press either does real work or says plainly why it did not.
 *
 * <p><strong>The window starts at construction, not at the first press.</strong> A deploy has just
 * republished everything outstanding ({@code republish-outstanding-events-on-restart=true}, fired from
 * {@code afterSingletonsInstantiated}), so a press seconds later is the same redundant sweep as any
 * other rapid second one. Treating the boot republish as resubmission zero costs at most one refused
 * press per deploy.
 *
 * <p>Nothing here logs an address or an arrival code (invariant #7) — and structurally cannot: this
 * service sees publication <em>counts</em>, never payloads.
 */
@Service
class MailResubmissionService implements MailResubmission {

	private static final Logger log = LoggerFactory.getLogger(MailResubmissionService.class);

	private final MailOutbox outbox;

	private final MailResubmissionWindow window;

	private final Clock clock;

	private final ReentrantLock inFlight = new ReentrantLock();

	private volatile Instant lastAcceptedAt;

	MailResubmissionService(MailOutbox outbox, MailResubmissionWindow window, Clock clock) {
		this.outbox = outbox;
		this.window = window;
		this.clock = clock;
		this.lastAcceptedAt = clock.instant();
	}

	@Override
	public MailOutboxStatus status() {
		return new MailOutboxStatus(outbox.countOutstanding(), cooldownRemaining());
	}

	@Override
	public MailResubmissionOutcome resubmit() {
		if (!inFlight.tryLock()) {
			return new MailResubmissionOutcome.AlreadyRunning(window.cooldown());
		}
		try {
			Duration remaining = cooldownRemaining();
			if (!remaining.isZero()) {
				return new MailResubmissionOutcome.CoolingDown(remaining);
			}
			return new MailResubmissionOutcome.Resubmitted(accept(), window.cooldown());
		}
		finally {
			inFlight.unlock();
		}
	}

	/**
	 * Starts the cooldown, then re-drives.
	 *
	 * <p>The order matters and is the conservative one: a resubmission that throws part-way has still
	 * invoked some listeners, so the window has to be running before the failure can be observed.
	 * Stamping it afterwards would leave a partially-completed re-drive immediately repeatable, which
	 * is precisely the duplicate this class exists to prevent.
	 */
	private int accept() {
		lastAcceptedAt = clock.instant();
		int resubmitted = outbox.resubmitOutstanding();
		log.info("Admin resubmitted {} outstanding notification publication(s)", resubmitted);
		return resubmitted;
	}

	private Duration cooldownRemaining() {
		Duration remaining = window.cooldown().minus(Duration.between(lastAcceptedAt, clock.instant()));
		return remaining.isNegative() ? Duration.ZERO : remaining;
	}
}
