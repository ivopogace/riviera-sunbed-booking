package ai.riviera.platform.customer.vocabulary;

/**
 * The result of redeeming a password-reset token (S8, epic #108) — a closed, caller-mappable set
 * (typed outcomes for expected flows, not exceptions; riviera-java-conventions). A sealed interface so
 * the edge {@code switch}es exhaustively. Invalid, expired, and already-used tokens all collapse to the
 * single {@link InvalidOrExpired} case — indistinguishable to the caller (non-enumeration, invariant #7
 * / design D-8).
 */
public sealed interface ResetPasswordOutcome
		permits ResetPasswordOutcome.Reset, ResetPasswordOutcome.InvalidOrExpired {

	/**
	 * The token was valid and single-use; the account's password has been set to the new hash. Carries
	 * the account's {@code email} (its session principal name) so the edge can invalidate that account's
	 * existing sessions after a reset (S8 AC-3) without a second lookup.
	 */
	record Reset(CustomerAccountId accountId, String email) implements ResetPasswordOutcome {
	}

	/** No usable token matched — unknown, expired, or already consumed (indistinguishable, D-8). */
	record InvalidOrExpired() implements ResetPasswordOutcome {
	}
}
