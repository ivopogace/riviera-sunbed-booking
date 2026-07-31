package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.refund.RefundOutboxStatus;
import ai.riviera.platform.booking.application.refund.RefundResubmission;
import ai.riviera.platform.booking.application.refund.RefundResubmissionOutcome;

/**
 * The platform-admin surface for the refund outbox (#454): what the Event Publication Registry still
 * owes the cancellation-refund listener, and the lever that re-drives it without waiting for the next
 * deploy. Driving adapter depending only on the module's {@link RefundResubmission} driving port —
 * mirrors {@code AdminMailOutboxController} (#405), whose javadoc carries the shared reasoning:
 * role-gated not venue-scoped (the {@code /api/admin/**} invariant-#13 exemption), hosted in the
 * module not at the composition root (#391), every outcome {@code 200} with a typed token
 * ({@code riviera-java-conventions} §6), and no per-controller {@code @ExceptionHandler}.
 *
 * <p><strong>What the responses deliberately do not carry</strong> (invariant #7): no booking id, no
 * booking code, no registry payload — counts and an outcome token only. The outstanding publications'
 * serialized events are exactly where booking ids live, which is why a per-publication listing is a
 * non-goal of #454 as it was of #405.
 */
@RestController
@RequestMapping("/api/admin/refund-outbox")
class AdminRefundOutboxController {

	/** The ceiling's carry — see {@link #seconds(Duration)}. */
	private static final long NANOS_PER_SECOND = 1_000_000_000L;

	private final RefundResubmission resubmission;

	AdminRefundOutboxController(RefundResubmission resubmission) {
		this.resubmission = resubmission;
	}

	/**
	 * What an admin sees before pressing anything.
	 *
	 * @param outstanding refund publications the registry still owes
	 * @param cooldownRemainingSeconds how long until a resubmission would be accepted; {@code 0} now
	 */
	record RefundOutboxStatusResponse(int outstanding, long cooldownRemainingSeconds) {
	}

	/**
	 * The result of a press.
	 *
	 * @param outcome {@code RESUBMITTED} | {@code ALREADY_RUNNING} | {@code COOLING_DOWN}
	 * @param resubmitted how many publications were handed back; {@code 0} for both refusals
	 * @param cooldownRemainingSeconds how long until the next press is accepted
	 */
	record RefundResubmissionResponse(String outcome, int resubmitted, long cooldownRemainingSeconds) {
	}

	@GetMapping
	RefundOutboxStatusResponse status() {
		RefundOutboxStatus status = resubmission.status();
		return new RefundOutboxStatusResponse(status.outstanding(), seconds(status.cooldownRemaining()));
	}

	@PostMapping("/resubmit")
	RefundResubmissionResponse resubmit() {
		RefundResubmissionOutcome outcome = resubmission.resubmit();
		return new RefundResubmissionResponse(outcome.code(), outcome.resubmitted(), seconds(outcome.retryAfter()));
	}

	/**
	 * Seconds, rounded <em>up</em>, carrying a nanosecond tail — the remainder comes from
	 * {@code Duration.between} on a nanosecond clock, so {@code plusMillis(999)} would truncate a
	 * sub-millisecond tail back down and report one second less than a polling caller is promised
	 * (#405's F-4).
	 */
	private static long seconds(Duration remaining) {
		return remaining.plusNanos(NANOS_PER_SECOND - 1).toSeconds();
	}
}
