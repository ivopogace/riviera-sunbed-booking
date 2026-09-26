package ai.riviera.platform.notification.adapter.in;

import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.notification.application.ReinstateOutcome;
import ai.riviera.platform.notification.application.ReinstateSuppression;
import ai.riviera.platform.shared.ApiProblem;

/**
 * ADMIN reinstatement of a suppressed address: sets a flag, never a deletion (ADR-0012). Under
 * {@code /api/admin/**} — ADMIN-gated in {@code SecurityConfig}, exempt from invariant #13, and every
 * mutating call audited by the edge. Every outcome is {@code 200} carrying the suppression facts; a
 * malformed body is an RFC-7807 {@link ProblemDetail} via {@link ApiProblem}, never a per-controller
 * {@code @ExceptionHandler}. Address shape is {@link AddressShape}'s, shared with the mail-delivery
 * lookup; non-enumeration is not a concern behind the admin gate.
 */
@RestController
@RequestMapping("/api/admin/email-suppressions")
class AdminEmailSuppressionController {

	private final ReinstateSuppression reinstatement;

	AdminEmailSuppressionController(ReinstateSuppression reinstatement) {
		this.reinstatement = reinstatement;
	}

	/** Wire DTO: the raw address, normalized and hashed downstream like every other caller. */
	record ReinstateRequest(String email) {
	}

	/**
	 * The reinstatement result. {@code reason}/{@code firstSuppressedAt}/{@code lastEventAt} are absent
	 * for an address that was never listed; {@code reinstatedAt} is present only on a repeat call, and
	 * then carries the <em>original</em> lift.
	 */
	record ReinstateResponse(String outcome, String reason, Instant firstSuppressedAt, Instant lastEventAt,
			Instant reinstatedAt) {
	}

	@PostMapping("/reinstate")
	ResponseEntity<?> reinstate(@RequestBody ReinstateRequest request) {
		if (!AddressShape.isAddressShaped(request.email())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "An email address is required.");
		}
		return ResponseEntity.ok(view(reinstatement.reinstate(request.email())));
	}

	private static ReinstateResponse view(ReinstateOutcome outcome) {
		return switch (outcome) {
			case ReinstateOutcome.Reinstated lifted -> new ReinstateResponse(outcome.code(),
					lifted.reason().name(), lifted.firstSuppressedAt(), lifted.lastEventAt(), null);
			case ReinstateOutcome.AlreadyReinstated repeat -> new ReinstateResponse(outcome.code(),
					repeat.reason().name(), repeat.firstSuppressedAt(), repeat.lastEventAt(),
					repeat.reinstatedAt());
			case ReinstateOutcome.NotSuppressed ignored ->
					new ReinstateResponse(outcome.code(), null, null, null, null);
		};
	}
}
