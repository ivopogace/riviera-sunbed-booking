/**
 * The platform's <strong>Shared Kernel</strong> (Evans, DDD ch. 14) — the small, stable set of edge
 * types that bounded contexts are allowed to depend on.
 *
 * <p>It exists because the root package plays two roles with <em>opposite</em> dependency directions:
 * as composition root and adapter layer it depends on modules, while as the home of
 * {@code ApiProblem} and the principal accessors it was depended <em>upon</em> by five of seven. A
 * package that is both closes cycles by construction, and it did. Splitting the roles fixes it
 * permanently — <strong>modules depend on this kernel, the root depends on modules, and nothing
 * depends on the root.</strong> That invariant is the point: dissolving this package would be
 * technically acyclic today only by the same coincidence that held before it existed, so keeping it
 * is deliberate.
 *
 * <p><strong>{@code type = OPEN}</strong> deliberately: technical shared code, not a bounded context,
 * so it publishes no {@code api}/{@code vocabulary} surface and consumers reference its types
 * directly. It may depend only on {@code customer} and {@code operator} — the modules that do not
 * depend on it — which is what keeps it acyclic.
 *
 * <p><strong>Keep it small.</strong> A shared kernel earns its keep only while it stays tiny and
 * stable; Evans' warning is that changes here ripple through every context. Admission test: <em>no
 * business logic, no module-owned state, and no dependency on a module that depends back.</em> A type
 * failing any of those belongs in a bounded context or at the composition root. <strong>This is not a
 * home for "code used in more than one place"</strong> — every admission rests on <em>ownership</em>,
 * never reuse, and "three modules need it" is the trigger for asking the question, not an answer to
 * it. The per-type grounds are recorded in {@code RESPONSIBILITIES.md} §{@code shared}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Shared Kernel",
	type = org.springframework.modulith.ApplicationModule.Type.OPEN,
	// The two modules that do not depend back; granting more would risk the cycle this one removes.
	allowedDependencies = { "customer::api", "customer::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.shared;
