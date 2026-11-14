/**
 * <strong>The HTTP boundary</strong> (ADR-0028 Decision 3): a closed non-context module, the adapter layer every
 * request crosses before a controller: the security chains and route policy, CSRF and the session cookie, the
 * chain's filters (rate limit, body cap, proof-of-work, admin audit, session credential), CORS, the one
 * {@code @RestControllerAdvice}, {@code /error}'s problem body and the crawl policy. It publishes nothing: no module
 * calls it. Spring Security beans arrive by framework type. Rationale: {@code RESPONSIBILITIES.md} §{@code web}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Web",
	allowedDependencies = { "auth::api", "auth::vocabulary", "challenge::api", "challenge::vocabulary",
			"audit::api", "customer::vocabulary", "operator::vocabulary", "venue::api", "venue::vocabulary",
			"shared" }
)
package ai.riviera.platform.web;
