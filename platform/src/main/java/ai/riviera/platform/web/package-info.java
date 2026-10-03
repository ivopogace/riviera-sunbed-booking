/**
 * <strong>The HTTP boundary</strong> (ADR-0028 Decision 3): a closed non-context module, the adapter layer
 * every request crosses before a controller. Holds the security chains and their route policy, CSRF and the
 * session cookie, the chain's filters (rate limit, body cap, proof-of-work fence, admin-audit fence,
 * session-credential check), CORS, and {@code ApiErrorHandler}, the one {@code @RestControllerAdvice}. It publishes nothing: no
 * module calls it, so it is not a shared module. Spring Security beans arrive by framework type, which is no
 * module dependency. Rationale: {@code RESPONSIBILITIES.md} §{@code web}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Web",
	allowedDependencies = { "auth::api", "auth::vocabulary", "challenge::api", "challenge::vocabulary",
			"audit::api", "customer::vocabulary", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.web;
