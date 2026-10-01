/**
 * <strong>Sign-in and sessions</strong> (ADR-0028 Decision 2): a closed non-context module, the adapter layer
 * that turns a credential into a server-side session. Holds the session machinery, both
 * {@code UserDetailsService}s and the authentication beans, SSO, the password policy, account recovery, the
 * login and self-service controllers, and the admin and erasure controllers that revoke sessions in the same
 * request. {@code customer} and {@code operator} supply identity through their {@code api}. Callers see only
 * {@code api} and {@code vocabulary}. Rationale: {@code RESPONSIBILITIES.md} §{@code auth}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Auth",
	allowedDependencies = { "customer::api", "customer::vocabulary", "operator::api", "operator::vocabulary",
			"notification::api", "shared" }
)
package ai.riviera.platform.auth;
