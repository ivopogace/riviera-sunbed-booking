package ai.riviera.platform.auth.application;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * A verified external identity returned by {@link SsoGateway#exchangeCode}: the provider, the ID token's
 * {@code issuer} and its stable {@code subject} (unique only within that issuer), and the asserted {@code email}.
 * A customer is resolved by provider, subject and the verified email ({@code SsoAccountProvisioning}); an operator by
 * issuer and subject alone, never by email (#276). Real adapters assert {@code email_verified} and the issuer first.
 */
public record ExternalIdentity(SsoProvider provider, String issuer, String subject, String email) {

	public ExternalIdentity {
		if (provider == null) {
			throw new IllegalArgumentException("provider must not be null");
		}
		if (issuer == null || issuer.isBlank()) {
			throw new IllegalArgumentException("issuer must not be blank");
		}
		if (subject == null || subject.isBlank()) {
			throw new IllegalArgumentException("subject must not be blank");
		}
		if (email == null || email.isBlank()) {
			throw new IllegalArgumentException("email must not be blank");
		}
	}
}
