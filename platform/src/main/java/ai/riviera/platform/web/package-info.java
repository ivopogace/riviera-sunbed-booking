/**
 * <strong>The HTTP boundary</strong> (ADR-0028 Decision 3): a closed non-context module, the adapter layer
 * every request crosses before a controller. Holds the security chains and their route policy, CSRF and the
 * session cookie, the chain's filters, CORS, {@code ApiErrorHandler} (the one {@code @RestControllerAdvice}),
 * {@code /error}'s problem body, and the SPA shell with its link-preview head (reads {@code venue::api}). It
 * publishes nothing: no module calls it. Rationale: {@code RESPONSIBILITIES.md} §{@code web}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Web",
	allowedDependencies = { "auth::api", "auth::vocabulary", "challenge::api", "challenge::vocabulary",
			"audit::api", "customer::vocabulary", "operator::vocabulary", "venue::api", "venue::vocabulary",
			"shared" }
)
package ai.riviera.platform.web;
