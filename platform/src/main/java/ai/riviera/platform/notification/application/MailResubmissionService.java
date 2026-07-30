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
 * <p><strong>The framework supplies no guard, despite documenting one.</strong>
 * {@code EventPublicationRepository.markResubmitted} is described as returning {@code false} when
 * another instance has already claimed a publication, and
 * {@code DefaultEventPublicationRegistry#processPublications} does honour that answer — but the method
 * is a {@code default} whose body is {@code return true} and {@code JdbcEventPublicationRepository}
 * does not override it. Every claim succeeds. Two clicks therefore both proceed, and both send.
 *
 * <p><strong>So the guard is two parts, because there are two races.</strong> A
 * {@link ReentrantLock#tryLock()} answers the simultaneous one — two admins, or a double-click landing
 * on two request threads. It cannot answer the <em>sequential</em> one: the registry completes a
 * publication only once the listener returns, and that listener is {@code @Async} on
 * {@code registryMailExecutor} (#383), so a press moments after an accepted one finds the identical
 * rows still outstanding. That is what {@link MailResubmissionWindow} covers.
 *
 * <p><strong>The window starts at construction, not at the first press</strong>, which closes the
 * third race #405 names: an admin clicking seconds after a deploy, concurrent with the restart
 * republication ({@code republish-outstanding-events-on-restart=true}, fired from
 * {@code afterSingletonsInstantiated}). Treating the boot republish as resubmission zero costs at most
 * one refused press per deploy and removes a duplicate nobody would have been able to explain.
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
