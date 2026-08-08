package ai.riviera.platform.operator.vocabulary;

/**
 * The result of an admin approve/reject decision on a self-registered operator (S6) — a closed,
 * caller-mappable set (typed outcome over exceptions; riviera-java-conventions), so the edge admin
 * controller maps each case to an HTTP status exhaustively.
 *
 * <p>A sealed interface rather than the enum it shipped as (#375), for one reason: {@link Approved}
 * carries the operator's {@code contactEmail}, so the edge can mail the "your account is active"
 * notice without asking the module a second time. That is the argument
 * {@link OperatorLifecycleOutcome.Changed} already makes for carrying the username, and the shape
 * {@code ResetPasswordOutcome.Reset(accountId, email)} already has on the customer side.
 *
 * <p><strong>The address rides the transition, and that is what makes the mail exactly-once.</strong>
 * It comes from the {@code RETURNING} clause of the {@code WHERE status = PENDING}-guarded
 * {@code UPDATE}, so only the call that actually flipped the row ever receives one: two admins racing
 * the same registration produce one {@link Approved} and one {@link NotPending}, and the loser has
 * nothing to send. Reading the address <em>before</em> the call — as {@code activeUsername} does for
 * suspension — was rejected: that precedent exists because a revoke must <em>precede</em> its write,
 * whereas this mail must follow one.
 */
public sealed interface ApprovalOutcome
		permits ApprovalOutcome.Approved, ApprovalOutcome.Rejected, ApprovalOutcome.NotPending,
		ApprovalOutcome.NoSuchOperator {

	/**
	 * The PENDING operator was transitioned to ACTIVE (approve) — it can now sign in.
	 *
	 * @param contactEmail the address it registered with, or {@code null} when the row carries none.
	 *     Nullable because the column is (V29 — the env-managed bootstrap admin has no contact email);
	 *     self-registration always supplies one, so in practice only a seeded row arrives without it.
	 *     A caller that mails it must treat null <strong>and</strong> blank as "no address".
	 */
	record Approved(String contactEmail) implements ApprovalOutcome {
	}

	/** The PENDING operator was transitioned to REJECTED (reject) — it still cannot sign in. */
	record Rejected() implements ApprovalOutcome {
	}

	/** The operator exists but is not PENDING (already ACTIVE/REJECTED/SUSPENDED) → the edge maps to 409. */
	record NotPending() implements ApprovalOutcome {
	}

	/** No operator has this id → the edge maps to 404. */
	record NoSuchOperator() implements ApprovalOutcome {
	}
}
