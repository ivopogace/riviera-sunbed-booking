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
 * The platform-admin surface for lifting a suppression — the mirror of the {@code MANUAL}
 * suppression reason, and the one sanctioned exception to the never-deleted deliverability record
 * (still not a deletion; ADR-0012 as amended). Driving adapter depending only on the module's
 * {@link ReinstateSuppression} driving port.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> Under {@code /api/admin/**}, gated to
 * {@code ADMIN} in {@code SecurityConfig} — a platform-wide action, exempt from the per-venue
 * authorization of invariant #13, exactly like data-subject erasure and operator approval. A plain
 * {@code OPERATOR} or {@code CUSTOMER} reaching it is {@code 403}; anonymous is {@code 401}.
 *
 * <p><strong>Lives in the module, not at the composition root</strong> (the
 * {@code AdminPayoutBatchController} precedent). Hosting it at the root would have forced a new
 * published {@code notification::api} port for a single same-module consumer — a hypothetical seam,
 * and a second published surface where the module deliberately publishes exactly one
 * ({@code MailSender}).
 *
 * <p><strong>Why every outcome is {@code 200} and not a status code.</strong> All three are expected
 * flows an admin acts on, not errors ({@code riviera-java-conventions} §6), and the admin needs the
 * <em>facts</em> — what this was suppressed for, and since when — which a bare {@code 404} cannot
 * carry. That response is what lets the slice ship without a standing suppression-lookup endpoint:
 * the investigative half of the ops workflow is answered by the action itself. Errors are RFC-7807
 * {@link ProblemDetail} from the one {@link ApiProblem} factory; no per-controller
 * {@code @ExceptionHandler}.
 *
 * <p>Request validation is the shape check in {@link AddressShape} — extracted there when the
 * mail-delivery lookup needed the identical guard, so the two admin surfaces that take an address
 * cannot drift apart on what they accept.
 *
 * <p>Non-enumeration is deliberately <em>not</em> a concern here, unlike the anonymous auth surfaces
 * (D-8) or {@code AdminErasureController}'s always-{@code 204}: the caller is already an
 * authenticated platform admin, so telling them what they just acted on leaks nothing they could not
 * learn from the database itself.
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
