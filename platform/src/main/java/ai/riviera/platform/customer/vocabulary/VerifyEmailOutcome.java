package ai.riviera.platform.customer.vocabulary;

/**
 * The result of redeeming an email-verification token (S8, epic #108) — a closed, caller-mappable set
 * (typed outcomes for expected flows, not exceptions; riviera-java-conventions). A sealed interface so
 * the edge {@code switch}es exhaustively. Invalid, expired, and already-used tokens all collapse to the
 * single {@link InvalidOrExpired} case — indistinguishable to the caller (non-enumeration, invariant #7
 * / design D-8).
 */
public sealed interface VerifyEmailOutcome
		permits VerifyEmailOutcome.Verified, VerifyEmailOutcome.InvalidOrExpired {

	/** The token was valid and single-use; the account's email is now verified. */
	record Verified(CustomerAccountId accountId) implements VerifyEmailOutcome {
	}

	/** No usable token matched — unknown, expired, or already consumed (indistinguishable, D-8). */
	record InvalidOrExpired() implements VerifyEmailOutcome {
	}
}
