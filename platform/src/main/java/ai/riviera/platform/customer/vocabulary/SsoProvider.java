package ai.riviera.platform.customer.vocabulary;

/**
 * The external identity providers a customer can sign in with, in the {@code customer} module's
 * published vocabulary so an SSO identity is keyed by a typed provider, not a string. The module
 * owns the identity; the OIDC redirect/token-exchange machinery stays at the platform edge.
 *
 * <p>The constant names are the tokens persisted in {@code customer_sso_identity.provider}; keep
 * them in lockstep with that column's SQL {@code CHECK} (V27; riviera-java-conventions §6a).
 */
public enum SsoProvider {
	GOOGLE,
	APPLE
}
