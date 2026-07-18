package ai.riviera.platform;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.api.OperatorApprovals;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * The platform-admin surface for approving operator self-registrations (#115, S6, design D-5). Driving
 * adapter depending only on the {@code operator} module's {@link OperatorApprovals} port (invariant #11);
 * the approve/reject state transitions live in the operator application service, so no adapter can bypass
 * them.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> These endpoints live under {@code /api/admin/**} and
 * are gated to the {@code ADMIN} role in {@link SecurityConfig} — a platform-wide admin action, exempt
 * from the per-venue authorization of invariant #13 (an operator does not <em>own</em> a registration).
 * A plain {@code OPERATOR} reaching them is {@code 403}. Errors are the one RFC-7807 contract built by
 * {@link ApiProblem} (issue #97): a not-pending id → {@code 409 NOT_PENDING}, an unknown id →
 * {@code 404 NO_SUCH_OPERATOR}; a successful approve/reject is {@code 204}.
 */
@RestController
@RequestMapping("/api/admin/operators")
class AdminOperatorController {

	private final OperatorApprovals approvals;

	AdminOperatorController(OperatorApprovals approvals) {
		this.approvals = approvals;
	}

	/** The admin's view of a pending operator: the technical id (to act on), username, contact email, and when. */
	record PendingOperatorResponse(long id, String username, String contactEmail, Instant registeredAt) {
		static PendingOperatorResponse from(PendingOperator pending) {
			return new PendingOperatorResponse(pending.id().value(), pending.username(),
					pending.contactEmail(), pending.registeredAt());
		}
	}

	@GetMapping
	List<PendingOperatorResponse> pending() {
		return approvals.pending().stream().map(PendingOperatorResponse::from).toList();
	}

	@PostMapping("/{operatorId}/approve")
	ResponseEntity<?> approve(@PathVariable long operatorId) {
		return toResponse(approvals.approve(new OperatorId(operatorId)));
	}

	@PostMapping("/{operatorId}/reject")
	ResponseEntity<?> reject(@PathVariable long operatorId) {
		return toResponse(approvals.reject(new OperatorId(operatorId)));
	}

	private static ResponseEntity<?> toResponse(ApprovalOutcome outcome) {
		return switch (outcome) {
			case APPROVED, REJECTED -> ResponseEntity.noContent().build();
			case NOT_PENDING -> ApiProblem.response(HttpStatus.CONFLICT, "NOT_PENDING",
					"This operator is not awaiting approval.");
			case NO_SUCH_OPERATOR -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_OPERATOR",
					"No such operator.");
		};
	}
}
