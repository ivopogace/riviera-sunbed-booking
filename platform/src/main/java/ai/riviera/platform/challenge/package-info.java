/**
 * The <strong>proof-of-work challenge</strong> mechanism (ADR-0016, ADR-0017) — not a bounded
 * context but a Cohesive Mechanism (Evans, DDD ch. 15): a separate lightweight framework, ALTCHA v2
 * plus a single-use registry, behind an intention-revealing interface. It issues signed challenges,
 * verifies a widget's solution, accepts each solution exactly once via the {@code challenge_registry}
 * claim, sweeps expired rows, and serves the challenge endpoint.
 *
 * <p><strong>Closed and dependency-free:</strong> {@code allowedDependencies = {}} — not even the
 * {@code shared} kernel. A mechanism that knew a domain type would be a bounded context wearing this
 * module's clothes. The whole surface a caller sees is {@link ai.riviera.platform.challenge.api.ProofOfWorkChallenges}
 * and {@link ai.riviera.platform.challenge.vocabulary.ChallengeVerdict}; no bounded-context module
 * knows the challenge exists, and the composition root reaches only those two named interfaces.
 *
 * <p><strong>The fence is not here.</strong> Which routes require a solution, the filter and its
 * ordering, and the problem bodies it writes are the platform edge's — see
 * {@code RESPONSIBILITIES.md} § <em>Platform edge</em> and § {@code challenge}. Rate limiting is the
 * edge's too. Full ADR-0007 template minus {@code domain/}: the module owns table-backed state, not
 * an aggregate.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Proof-of-work challenge",
	allowedDependencies = {}
)
package ai.riviera.platform.challenge;
