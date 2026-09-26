package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.notification.application.MailOutboxStatus;
import ai.riviera.platform.notification.application.MailResubmission;
import ai.riviera.platform.shared.ResubmissionOutcome;

/**
 * ADMIN surface over the mail outbox: what the Event Publication Registry still owes this module,
 * and the lever that re-drives it now, via {@link MailResubmission}. Role-gated in
 * {@code SecurityConfig} (invariant #13's {@code /api/admin/**} exemption): {@code OPERATOR} or
 * {@code CUSTOMER} is {@code 403}, anonymous {@code 401}. Every outcome is {@code 200}: a refusal
 * carries how long until the lever accepts, which a bare {@code 409} could not. Counts and an outcome
 * token only (invariant #7). Placement and shape: {@code RESPONSIBILITIES.md} §notification.
 */
@RestController
@RequestMapping("/api/admin/mail-outbox")
class AdminMailOutboxController {

	/** The ceiling's carry — see {@link #seconds(Duration)}. */
	private static final long NANOS_PER_SECOND = 1_000_000_000L;

	private final MailResubmission resubmission;

	AdminMailOutboxController(MailResubmission resubmission) {
		this.resubmission = resubmission;
	}

	/**
	 * What the console shows before anyone presses anything.
	 *
	 * @param outstanding publications this module's listeners still owe
	 * @param cooldownRemainingSeconds how long until a resubmission would be accepted; {@code 0} now
	 */
	record MailOutboxStatusResponse(int outstanding, long cooldownRemainingSeconds) {
	}

	/**
	 * The result of a press.
	 *
	 * @param outcome {@code RESUBMITTED} | {@code ALREADY_RUNNING} | {@code COOLING_DOWN}
	 * @param resubmitted how many publications were handed back; {@code 0} for both refusals
	 * @param cooldownRemainingSeconds how long until the next press is accepted
	 */
	record MailResubmissionResponse(String outcome, int resubmitted, long cooldownRemainingSeconds) {
	}

	@GetMapping
	MailOutboxStatusResponse status() {
		MailOutboxStatus status = resubmission.status();
		return new MailOutboxStatusResponse(status.outstanding(), seconds(status.cooldownRemaining()));
	}

	@PostMapping("/resubmit")
	MailResubmissionResponse resubmit() {
		ResubmissionOutcome outcome = resubmission.resubmit();
		return new MailResubmissionResponse(outcome.code(), outcome.resubmitted(), seconds(outcome.retryAfter()));
	}

	/**
	 * Seconds, rounded <em>up</em>, so a caller polling at the reported instant finds the lever
	 * accepting. The carry is a nanosecond short of a second: the remainder has nanosecond resolution,
	 * and {@code plusMillis(999)} would miss a sub-millisecond tail and report a second too few.
	 */
	private static long seconds(Duration remaining) {
		return remaining.plusNanos(NANOS_PER_SECOND - 1).toSeconds();
	}
}
