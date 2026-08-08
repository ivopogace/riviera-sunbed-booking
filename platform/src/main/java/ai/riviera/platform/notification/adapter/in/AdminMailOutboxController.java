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
 * The platform-admin surface for the mail outbox: what the Event Publication Registry still
 * owes this module, and the lever that re-drives it without waiting for the next deploy. Driving
 * adapter depending only on the module's {@link MailResubmission} driving port.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> Under {@code /api/admin/**}, gated to
 * {@code ADMIN} in {@code SecurityConfig} — platform-wide delivery state that belongs to no venue, so
 * it carries the same invariant-#13 exemption as erasure, operator approval and suppression
 * reinstatement. A plain {@code OPERATOR} or {@code CUSTOMER} is {@code 403}; anonymous is
 * {@code 401}.
 *
 * <p><strong>Lives in the module, not at the composition root</strong> — the
 * {@code AdminEmailSuppressionController} precedent, for the same reason: hosting it at the
 * root would force a new published {@code notification::api} port for a single same-module consumer.
 *
 * <p><strong>Why every outcome is {@code 200}.</strong> All three are expected flows an admin acts on
 * rather than errors ({@code riviera-java-conventions} §6), and the two refusals carry the fact the
 * admin actually needs — how long until the lever accepts — which a bare {@code 409} could not. There
 * is no request body to reject, so this controller validates nothing; anything genuinely thrown
 * becomes RFC-7807 through the single {@code ApiErrorHandler}, never a per-controller
 * {@code @ExceptionHandler}.
 *
 * <p><strong>What the responses deliberately do not carry</strong> (invariant #7): no address, no
 * arrival code, no registry payload — counts and an outcome token only. That is not merely a
 * precaution: the outstanding publications' serialized events are exactly where booking ids live, and
 * a per-publication listing is a non-goal of this slice for that reason.
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
	 * Seconds, rounded <em>up</em>. A caller that polls at the reported instant must find the lever
	 * accepting, and truncation would put it one poll short of that every time the window does not
	 * divide evenly.
	 *
	 * <p>The carry is a nanosecond short of a second, not a millisecond short: the remainder comes from
	 * {@code Duration.between} on a nanosecond-resolution clock, so a sub-millisecond tail is ordinary,
	 * and {@code plusMillis(999)} would fail to carry it and truncate back down — reporting a second
	 * less than the contract above promises.
	 */
	private static long seconds(Duration remaining) {
		return remaining.plusNanos(NANOS_PER_SECOND - 1).toSeconds();
	}
}
