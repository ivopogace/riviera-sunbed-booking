package ai.riviera.platform.notification.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.shared.ResubmissionOutcome;
import ai.riviera.platform.shared.ResubmissionThrottle;

/**
 * The ADMIN mail-resubmit lever: this module's scope ({@link MailOutbox}, its own listeners by id
 * prefix) behind the kernel's {@link ResubmissionThrottle}, which owns what a press means. This
 * module keeps the scope, the window ({@link MailResubmissionWindow}) and the log line's noun.
 * Duplicate mail is prevented below the throttle, durably, by the v2 registry's
 * {@code markResubmitted} claim. Sees counts only, never an address or code (invariant #7).
 * Rationale: RESPONSIBILITIES.md §notification.
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
