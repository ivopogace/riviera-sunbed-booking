package ai.riviera.platform.notification.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.shared.ResubmissionOutcome;
import ai.riviera.platform.shared.ResubmissionThrottle;

/**
 * The ADMIN mail-resubmit lever (#405): this module's scope ({@link MailOutbox}, the module's own
 * listeners by id prefix) behind the kernel's {@link ResubmissionThrottle}, which owns what a press
 * means — single-flight, cooldown seeded at construction so a press cannot race the restart
 * republication, and a typed refusal instead of a success that moved nothing. What stays this
 * module's: the scope, the window value ({@link MailResubmissionWindow}), and the log line's noun.
 * (#454 moved the guard itself to {@code shared} when the refund lever became its second consumer —
 * the policy prose that lived here is now on the throttle.)
 *
 * <p>Duplicate mail is prevented one layer below the throttle: the v2 registry's
 * {@code markResubmitted} claim ({@code UPDATE … WHERE ID = ? AND STATUS != 'RESUBMITTED'}) skips a
 * publication whose previous resubmission is still draining on {@code registryMailExecutor} (#383) —
 * durably, in the database, across instances.
 *
 * <p>Nothing here logs an address or an arrival code (invariant #7) — and structurally cannot: this
 * service sees publication <em>counts</em>, never payloads.
 */
@Service
class MailResubmissionService implements MailResubmission {

	private static final Logger log = LoggerFactory.getLogger(MailResubmissionService.class);

	private final MailOutbox outbox;

	private final ResubmissionThrottle throttle;

	MailResubmissionService(MailOutbox outbox, MailResubmissionWindow window, Clock clock) {
		this.outbox = outbox;
		this.throttle = new ResubmissionThrottle(window.cooldown(), clock);
	}

	@Override
	public MailOutboxStatus status() {
		return new MailOutboxStatus(outbox.countOutstanding(), throttle.cooldownRemaining());
	}

	@Override
	public ResubmissionOutcome resubmit() {
		ResubmissionOutcome outcome = throttle.attempt(outbox::resubmitOutstanding);
		if (outcome instanceof ResubmissionOutcome.Resubmitted done) {
			log.info("Admin resubmitted {} outstanding notification publication(s)", done.count());
		}
		return outcome;
	}
}
