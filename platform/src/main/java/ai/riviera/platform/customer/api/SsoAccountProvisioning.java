package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Resolves-or-creates the customer account behind an SSO identity the edge has verified (the OIDC
 * exchange stays there, RV-BE-11). Idempotent on {@code (provider, subject)} and race-safe: a returning
 * subject resolves to its linked account; a new subject whose email has an account is
 * <strong>linked</strong> to it, never duplicated; otherwise a new password-less account is created and
 * linked. Never linked to the guest contact row (D-6). <strong>Trust boundary:</strong> auto-link trusts
 * the caller to have asserted {@code email_verified}; skipping it is an account-takeover vector.
 */
public interface SsoAccountProvisioning {

	/**
	 * Resolve the account for this external identity, creating and/or linking on first sight; see the
	 * type javadoc for the three cases. {@code email} is normalized internally (trimmed + lower-cased),
	 * matching {@link CustomerAccountProvisioning}.
	 */
	CustomerAccountId resolveOrCreate(SsoProvider provider, String subject, String email);
}
