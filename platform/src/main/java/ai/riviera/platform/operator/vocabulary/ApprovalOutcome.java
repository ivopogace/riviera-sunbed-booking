package ai.riviera.platform.operator.vocabulary;

/**
 * The result of an admin approve/reject decision on a self-registered operator: a closed,
 * caller-mappable set, so the edge admin controller maps each case to an HTTP status exhaustively.
 * {@link Approved} carries the {@code contactEmail} so the edge can mail the "account is active"
 * notice without a second read. It comes from the {@code RETURNING} of the PENDING-guarded
 * {@code UPDATE}, so only the call that flipped the row gets one and the mail is exactly-once.
 * Rationale: RESPONSIBILITIES.md §operator.
 */
public sealed interface ApprovalOutcome
		permits ApprovalOutcome.Approved, ApprovalOutcome.Rejected, ApprovalOutcome.NotPending,
		ApprovalOutcome.NoSuchOperator {

	/**
	 * The PENDING operator was transitioned to ACTIVE (approve): its venues are now tourist-visible.
	 *
	 * @param contactEmail the address it registered with, or {@code null} when the row carries none.
	 *     Nullable because the column is (V29 — the env-managed bootstrap admin has no contact email);
	 *     self-registration always supplies one, so in practice only a seeded row arrives without it.
	 *     A caller that mails it must treat null <strong>and</strong> blank as "no address".
	 */
	record Approved(String contactEmail) implements ApprovalOutcome {
	}

	/**
	 * The PENDING operator was transitioned to REJECTED (reject) — it can no longer sign in. Carries
	 * the {@code username} from the same guarded {@code UPDATE}'s {@code RETURNING}, so the edge can
	 * revoke any live session the operator established while PENDING — the exactly-once shape
	 * {@link Approved} has for the address. Deliberately no contact email: a rejection sends nothing.
	 */
	record Rejected(String username) implements ApprovalOutcome {
	}

	/** The operator exists but is not PENDING (already ACTIVE/REJECTED/SUSPENDED) → the edge maps to 409. */
	record NotPending() implements ApprovalOutcome {
	}

	/** No operator has this id → the edge maps to 404. */
	record NoSuchOperator() implements ApprovalOutcome {
	}
}
