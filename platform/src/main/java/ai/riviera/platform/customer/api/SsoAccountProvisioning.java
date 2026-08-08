package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Published write port that resolves-or-creates the customer account behind an external SSO identity.
 * The platform edge completes the OIDC Authorization Code + PKCE exchange, then calls
 * this with the verified {@code (provider, subject, email)} — no Spring Security or OIDC type crosses
 * into the {@code customer} module (RV-BE-11), exactly as {@link CustomerAccountProvisioning} keeps
 * password machinery at the edge.
 *
 * <p>Resolution is <strong>idempotent on {@code (provider, subject)}</strong> and race-safe:
 * <ol>
 *   <li>a returning {@code (provider, subject)} resolves to its already-linked account;</li>
 *   <li>a first-seen subject whose (verified) email already has an account <strong>links</strong> the
 *       new identity to that existing account (auto-link by verified email, maintainer decision
 *       2026-07-17) — never a duplicate account;</li>
 *   <li>a first-seen subject with a free email creates a new, password-less account and links it.</li>
 * </ol>
 * The account identity stays separate from the guest contact row (design D-6); the returned
 * {@link CustomerAccountId} is the same id the edge then establishes the session under.
 *
 * <p><strong>Trust boundary (carried to S5 #116):</strong> auto-linking trusts the caller to have
 * verified the email. The S4 mock adapter returns only verified canned identities; the real Google/Apple
 * adapters (S5) must assert {@code email_verified} before invoking this, or auto-link becomes an
 * account-takeover vector.
 */
public interface SsoAccountProvisioning {

	/**
	 * Resolve the account for this external identity, creating and/or linking on first sight; see the
	 * type javadoc for the three cases. {@code email} is normalized internally (trimmed + lower-cased),
	 * matching {@link CustomerAccountProvisioning}.
	 */
	CustomerAccountId resolveOrCreate(SsoProvider provider, String subject, String email);
}
