package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.ApiProblem;
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
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
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
 * <p><strong>Suspension and rejection revoke sessions here, at the edge (#128).</strong> Without it
 * the operator's existing cookie would keep authenticating every non-venue-scoped role-gated surface
 * until it expired — and, since a PENDING operator holds a working console session, a rejected
 * one's cookie would keep the whole console alive too.
 *
 * <p><strong>The revoke brackets the transition</strong> (#357): once <em>before</em> it, keyed by
 * {@link OperatorLifecycle#usernameInStatus}, and once <em>after</em> it, keyed by the username the
 * outcome carries. Before, because the two effects are not atomic and cannot be — the status write is
 * the module's transaction, the session deletes are Spring Session's, so a {@code @Transactional} here
 * would look atomic without being atomic (#344 D-1). Revoking only afterwards, as #128 shipped, meant a
 * transient revoke failure committed the suspension, raised {@code 500}, and left the suspended
 * operator working: the admin's retry is refused {@code 409 WRONG_STATUS} and revokes nothing, so
 * nothing ever closes those sessions. After, because revoking only first would leave a window in which
 * the account is still ACTIVE — a sign-in landing there would survive the suspension with no admin
 * recovery path.
 *
 * <p><strong>What the bracket costs.</strong> #128 could promise that a rolled-back transition never
 * signs out a still-ACTIVE operator, because nothing was revoked until the status had committed; the
 * pre-revoke gives that up — a {@code suspend} refused after it (raced by a second admin, or reinstated
 * in between) leaves that operator signed out while still ACTIVE. That is over-revocation, a
 * convenience cost the operator recovers from by signing in again, and it is the price of removing
 * the under-revocation this fixes: a failed revoke that left a SUSPENDED account's sessions alive with
 * no admin action able to close them. Under-revocation is not eliminated outright — a failed
 * <em>trailing</em> revoke still leaves whatever the window produced — but it is bounded to sessions
 * created inside a single request rather than every session the account had.
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
	private final OperatorApprovalMail approvalMail;

	AdminOperatorController(OperatorLifecycle lifecycle, CurrentOperator currentOperator,
			PrincipalSessionRevoker sessionRevoker, OperatorApprovalMail approvalMail) {
		this.lifecycle = lifecycle;
		this.currentOperator = currentOperator;
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
	 * Approve a registration and, if that is what actually happened, tell the operator by email.
	 * The mail is deliberately <em>after</em> the transition and gated on its outcome: the address
	 * arrives on {@link ApprovalOutcome.Approved} straight from the guarded {@code UPDATE}, so a second
	 * admin racing the same registration is handed none and cannot send a duplicate. Unlike the
	 * suspension bracket below, nothing here is ordered around a revoke — approval revokes nothing.
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
	 * Suspend an operator, revoking its live sessions on <strong>both sides</strong> of the transition
	 * (#357). The status-guarded pre-read is what makes the first revoke possible at all:
	 * {@code suspend} only names the principal in its outcome, i.e. after it has committed.
	 */
	@PostMapping("/{operatorId}/suspend")
	ResponseEntity<?> suspend(@PathVariable long operatorId, Authentication authentication) {
		OperatorId target = new OperatorId(operatorId);
		if (target.equals(currentOperator.require(authentication))) {
			return ApiProblem.response(HttpStatus.CONFLICT, "CANNOT_SUSPEND_SELF",
					"The target operator is the account this request is authenticated as.");
		}
		lifecycle.usernameInStatus(target, OperatorStatus.ACTIVE).ifPresent(sessionRevoker::revokeAll);
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
