package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

/**
 * Published port for the customer right-to-erasure (GDPR Art 17), driven by the edge from two
 * surfaces: self-service (own data) and admin (a data-subject request by email).
 * <strong>Scrub-in-place</strong>: guest-contact + account PII tombstoned ({@code erased_at} set),
 * SSO/token children deleted, the subject's reviews tombstoned in the same transaction (via
 * {@code customer.spi.ReviewErasure}); booking/payment/payout rows never touched (statutory
 * retention, invariant #9 intact). Idempotent. Rationale: RESPONSIBILITIES.md §customer.
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
