package ai.riviera.platform.customer.vocabulary;

/**
 * The external identity providers a customer can sign in with (S4, epic #108). Part of the
 * {@code customer} module's published vocabulary so an external SSO identity is expressed in the
 * module's own terms (subject/email keyed by provider) rather than as a stringly-typed value — the
 * account module owns the identity, the OIDC redirect/token-exchange machinery stays at the platform
 * edge (RV-BE-11).
 *
 * <p>The constant names are the tokens persisted in {@code customer_sso_identity.provider} and listed
 * by that column's {@code CHECK} constraint (V27) — keep the enum and the SQL {@code CHECK} in lockstep
 * (invariant #6a). Real Google/Apple adapters are S5 (#116); until then the edge's mock adapter plays
 * both providers.
 */
public enum SsoProvider {
	GOOGLE,
	APPLE
}
