package ai.riviera.platform;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.shared.ApiProblem;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

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
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * Platform-admin operator lifecycle through the {@link OperatorLifecycle} port only (invariant #11); {@code ADMIN}-gated
 * in {@link SecurityConfig}, exempt from #13; errors are {@link ApiProblem} bodies, success {@code 204}. Suspend and
 * reject revoke sessions before the transition ({@link OperatorLifecycle#usernameInStatus}), so a failed revoke cannot
 * commit a suspension with live sessions, and after it, for sign-ins in the window. A suspend the active-admin rule
 * refuses is answered before any revoke; one refused only under its lock (a race) signed its target out, the accepted
 * cost. Rationale: RESPONSIBILITIES.md §Platform edge (settled).
 */
@RestController
@RequestMapping("/api/admin/operators")
class AdminOperatorController {

	private final OperatorLifecycle lifecycle;
	private final OperatorDirectory operatorDirectory;
	private final PrincipalSessionRevoker sessionRevoker;
	private final OperatorApprovalMail approvalMail;

	AdminOperatorController(OperatorLifecycle lifecycle, OperatorDirectory operatorDirectory,
			PrincipalSessionRevoker sessionRevoker, OperatorApprovalMail approvalMail) {
		this.lifecycle = lifecycle;
		this.operatorDirectory = operatorDirectory;
		this.sessionRevoker = sessionRevoker;
		this.approvalMail = approvalMail;
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

	/**
	 * Approve, then mail the operator only on {@link ApprovalOutcome.Approved}: its address comes from the guarded
	 * {@code UPDATE}, so an admin losing the race receives none and cannot send a duplicate.
	 */
	@PostMapping("/{operatorId}/approve")
	ResponseEntity<?> approve(@PathVariable long operatorId) {
		ApprovalOutcome outcome = lifecycle.approve(new OperatorId(operatorId));
		if (outcome instanceof ApprovalOutcome.Approved approved) {
			approvalMail.notifyApproved(approved);
		}
		return toResponse(outcome);
	}

	/**
	 * Reject a registration, revoking any live sessions on <strong>both sides</strong> of the
	 * transition — a PENDING operator signs in and uses the console, so rejection removes the right
	 * to a session exactly as suspension does, and it gets the same bracket for the same reasons.
	 */
	@PostMapping("/{operatorId}/reject")
	ResponseEntity<?> reject(@PathVariable long operatorId) {
		OperatorId target = new OperatorId(operatorId);
		lifecycle.usernameInStatus(target, OperatorStatus.PENDING).ifPresent(sessionRevoker::revokeAll);
		ApprovalOutcome outcome = lifecycle.reject(target);
		if (outcome instanceof ApprovalOutcome.Rejected(String username)) {
			sessionRevoker.revokeAll(username);
		}
		return toResponse(outcome);
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

	/**
	 * Suspend an operator, revoking its live sessions on <strong>both sides</strong> of the transition.
	 * The status-guarded pre-read is what makes the first revoke possible at all:
	 * {@code suspend} only names the principal in its outcome, i.e. after it has committed.
	 */
	@PostMapping("/{operatorId}/suspend")
	ResponseEntity<?> suspend(@PathVariable long operatorId, Authentication authentication) {
		OperatorId target = new OperatorId(operatorId);
		OperatorId actor = operatorDirectory.requireOperator(authentication.getName());
		if (target.equals(actor)) {
			return ApiProblem.response(HttpStatus.CONFLICT, "CANNOT_SUSPEND_SELF",
					"The target operator is the account this request is authenticated as.");
		}
		Optional<OperatorLifecycleOutcome> refused = lifecycle.suspendRefusal(actor, target);
		if (refused.isPresent()) {
			return toResponse(refused.get(), false);
		}
		lifecycle.usernameInStatus(target, OperatorStatus.ACTIVE).ifPresent(sessionRevoker::revokeAll);
		return toResponse(lifecycle.suspend(actor, target), true);
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
			case OperatorLifecycleOutcome.LastActiveAdmin ignored -> ApiProblem.response(HttpStatus.CONFLICT,
					"LAST_ACTIVE_ADMIN", "This suspension would leave the platform without an active admin.");
			case OperatorLifecycleOutcome.ActorNotActiveAdmin ignored -> ApiProblem.response(HttpStatus.FORBIDDEN,
					"NOT_AN_ACTIVE_ADMIN", "The account this request is authenticated as is no longer an active admin.");
		};
	}

	/**
	 * The three wire answers, unchanged — the sealed rewrite of {@link ApprovalOutcome}
	 * changed what the outcome <em>carries</em>, never what it maps to. No {@code default}, so a
	 * future case is a compile error here rather than a silent {@code 204}.
	 */
	private static ResponseEntity<?> toResponse(ApprovalOutcome outcome) {
		return switch (outcome) {
			case ApprovalOutcome.Approved ignored -> ResponseEntity.noContent().build();
			case ApprovalOutcome.Rejected ignored -> ResponseEntity.noContent().build();
			case ApprovalOutcome.NotPending ignored -> ApiProblem.response(HttpStatus.CONFLICT, "NOT_PENDING",
					"This operator is not awaiting approval.");
			case ApprovalOutcome.NoSuchOperator ignored -> ApiProblem.response(HttpStatus.NOT_FOUND,
					"NO_SUCH_OPERATOR", "No such operator.");
		};
	}
}
