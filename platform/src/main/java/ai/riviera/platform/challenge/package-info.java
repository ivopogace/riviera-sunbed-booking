/**
 * The <strong>proof-of-work challenge</strong> mechanism (ADR-0016, ADR-0017), a Cohesive Mechanism
 * rather than a bounded context: issues signed ALTCHA v2 challenges, verifies a solution, accepts
 * each once via the {@code challenge_registry} claim, sweeps expired rows, serves the endpoint.
 * Closed, {@code allowedDependencies = {}} (not even {@code shared}); callers see only
 * {@code api.ProofOfWorkChallenges} and {@code vocabulary.ChallengeVerdict}. The fence (routes,
 * filter, ordering, problem bodies) is the edge's. Rationale: RESPONSIBILITIES.md §challenge.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Proof-of-work challenge",
	allowedDependencies = {}
)
package ai.riviera.platform.challenge;
