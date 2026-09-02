package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

/**
 * Published port for the customer right-to-erasure (GDPR Art 17), Slice 1 of #101 [D5] — one purposeful
 * conversation the platform edge drives from two authenticated surfaces: self-service (a signed-in
 * customer erasing their own data) and admin (a platform admin actioning a data-subject request by email).
 *
 * <p>Erasure is <strong>scrub-in-place</strong>: the {@code customer} guest-contact row and the
 * {@code customer_account} row are tombstoned (PII columns replaced with non-PII placeholders,
 * {@code erased_at} set) and the transient {@code customer_sso_identity} + {@code customer_account_token}
 * child rows are deleted, and every review of the subject's bookings is tombstoned in the same transaction
 * (display name blanked, comment deleted, star kept — through {@code customer.spi.ReviewErasure}). The
 * retained booking / payment / payout financial rows are <strong>never</strong> touched — they are kept
 * under the statutory-retention exception, which is exactly why the payout ledger's auditability
 * (invariant #9) is preserved (it holds no PII). Both operations are idempotent (guarded on
 * {@code erased_at IS NULL}; a review already stripped is not counted again); the edge authenticates the
 * caller and revokes the erased subject's sessions.
 */
public interface AccountErasure {

	/**
	 * Self-service: erase the signed-in account (by id) and any guest-contact row sharing its email. The
	 * edge resolves {@code accountId} from the session principal (never a request parameter — BOLA-safe).
	 */
	EraseOutcome eraseAccount(CustomerAccountId accountId);

	/**
	 * Admin / data-subject request: erase any account <em>and</em> guest-contact row sharing this email
	 * (email is normalized here). Guest rows whose email diverges from the account email are not reached by
	 * a single call — the admin submits each affected email.
	 */
	EraseOutcome eraseByEmail(String email);
}
