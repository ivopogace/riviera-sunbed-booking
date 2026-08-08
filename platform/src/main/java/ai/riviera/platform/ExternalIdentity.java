package ai.riviera.platform;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * A verified external identity returned by {@link SsoGateway#exchangeCode}: the
 * provider, the issuer's stable {@code subject} id, and the asserted {@code email}. The edge maps this
 * to a {@code customer} account via {@code SsoAccountProvisioning.resolveOrCreate}.
 *
 * <p>Auto-link-by-email trusts {@code email} to be provider-verified. The mock adapter only ever returns
 * verified canned identities; the real adapters must assert {@code email_verified} before
 * constructing this (see {@code SsoAccountProvisioning}).
 */
public record ExternalIdentity(SsoProvider provider, String subject, String email) {

	public ExternalIdentity {
		if (provider == null) {
			throw new IllegalArgumentException("provider must not be null");
		}
		if (subject == null || subject.isBlank()) {
			throw new IllegalArgumentException("subject must not be blank");
		}
		if (email == null || email.isBlank()) {
			throw new IllegalArgumentException("email must not be blank");
		}
	}
}
