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

import org.springframework.security.core.Authentication;

import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * The platform-admin surface for the operator account lifecycle: approving self-registrations (#115, S6,
 * design D-5) and suspending / reinstating existing accounts (#128). Driving adapter depending only on
 * the {@code operator} module's {@link OperatorLifecycle} port (invariant #11); every state transition
 * lives in the operator application service, so no adapter can bypass one.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> These endpoints live under {@code /api/admin/**} and
 * are gated to the {@code ADMIN} role in {@link SecurityConfig} — a platform-wide admin action, exempt
 * from the per-venue authorization of invariant #13 (an operator does not <em>own</em> a registration).
 * A plain {@code OPERATOR} reaching them is {@code 403}. Errors are the one RFC-7807 contract built by
 * {@link ApiProblem} (issue #97): a not-pending id → {@code 409 NOT_PENDING}, a wrong-status transition →
 * {@code 409 WRONG_STATUS}, an unknown id → {@code 404 NO_SUCH_OPERATOR}; success is {@code 204}.
 *
 * <p><strong>Suspension revokes sessions here, at the edge (#128).</strong> The module flips the status
 * and hands back the username; this controller then deletes that principal's live sessions through
 * {@link PrincipalSessionRevoker}. Without it a suspended operator's existing cookie would keep
 * authenticating every non-venue-scoped role-gated surface until it expired — venue-scoped ones were
 * already safe, since ownership resolves ACTIVE-only. Revocation runs <em>after</em> the transactional
 * transition has returned its outcome, so a rolled-back status change can never leave sessions deleted
 * for a still-ACTIVE account; the residual failure direction is over-revocation, never under.
 *
 * <p><strong>An admin may not suspend itself.</strong> That guard needs to know who is calling —
 * authentication context, i.e. edge knowledge the module deliberately does not have — so it lives here,
 * ahead of the port call, and answers {@code 409 CANNOT_SUSPEND_SELF}. It stops the platform locking
 * itself out of its own admin surface with one click.
 */
@RestController
@RequestMapping("/api/admin/operators")
class AdminOperatorController {

	private final OperatorLifecycle lifecycle;
	private final CurrentOperator currentOperator;
	private final PrincipalSessionRevoker sessionRevoker;

	AdminOperatorController(OperatorLifecycle lifecycle, CurrentOperator currentOperator,
			PrincipalSessionRevoker sessionRevoker) {
		this.lifecycle = lifecycle;
		this.currentOperator = currentOperator;
		this.sessionRevoker = sessionRevoker;
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
		return lifecycle.pending().stream().map(PendingOperatorResponse::from).toList();
	}

	@PostMapping("/{operatorId}/approve")
	ResponseEntity<?> approve(@PathVariable long operatorId) {
		return toResponse(lifecycle.approve(new OperatorId(operatorId)));
	}

	@PostMapping("/{operatorId}/reject")
	ResponseEntity<?> reject(@PathVariable long operatorId) {
		return toResponse(lifecycle.reject(new OperatorId(operatorId)));
	}

	/** The admin's view of a decided operator account; {@code contactEmail} may be null. */
	record OperatorAccountResponse(long id, String username, String contactEmail, boolean admin,
			boolean suspended) {
		static OperatorAccountResponse from(OperatorAccount account) {
			return new OperatorAccountResponse(account.id().value(), account.username(),
					account.contactEmail(), account.admin(), account.suspended());
		}
	}

	@GetMapping("/accounts")
	List<OperatorAccountResponse> accounts() {
		return lifecycle.accounts().stream().map(OperatorAccountResponse::from).toList();
	}

	@PostMapping("/{operatorId}/suspend")
	ResponseEntity<?> suspend(@PathVariable long operatorId, Authentication authentication) {
		OperatorId target = new OperatorId(operatorId);
		if (target.equals(currentOperator.require(authentication))) {
			return ApiProblem.response(HttpStatus.CONFLICT, "CANNOT_SUSPEND_SELF",
					"You cannot suspend the account you are signed in with.");
		}
		return toResponse(lifecycle.suspend(target), true);
	}

	@PostMapping("/{operatorId}/reinstate")
	ResponseEntity<?> reinstate(@PathVariable long operatorId) {
		return toResponse(lifecycle.reinstate(new OperatorId(operatorId)), false);
	}

	/**
	 * Map a lifecycle outcome to the wire, revoking the principal's live sessions when {@code revoke} —
	 * i.e. on suspension, where the account has just lost the right to the sessions it already holds.
	 * Reinstatement deliberately does not resurrect them: it restores the account, not the old cookies.
	 */
	private ResponseEntity<?> toResponse(OperatorLifecycleOutcome outcome, boolean revoke) {
		return switch (outcome) {
			case OperatorLifecycleOutcome.Changed(var ignoredId, var username) -> {
				if (revoke) {
					sessionRevoker.revokeAll(username);
				}
				yield ResponseEntity.noContent().build();
			}
			case OperatorLifecycleOutcome.WrongStatus ignored -> ApiProblem.response(HttpStatus.CONFLICT,
					"WRONG_STATUS", "This operator is not in a status that allows this change.");
			case OperatorLifecycleOutcome.NoSuchOperator ignored -> ApiProblem.response(HttpStatus.NOT_FOUND,
					"NO_SUCH_OPERATOR", "No such operator.");
		};
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
