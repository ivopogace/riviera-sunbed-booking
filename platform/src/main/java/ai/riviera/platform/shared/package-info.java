/**
 * The platform's <strong>Shared Kernel</strong> (Evans, DDD ch. 14) — the small, stable set of
 * edge types that bounded contexts are allowed to depend on. Extracted from the root package in
 * #371 to break a dependency cycle, and the extraction is the point:
 *
 * <p>The root package {@code ai.riviera.platform} plays two roles with <em>opposite</em> dependency
 * directions. As the <strong>composition root</strong> ({@code PlatformApplication},
 * {@code SecurityConfig}) and the platform's adapter layer ({@code AuthController}, the mailers) it
 * depends on modules. As the home of {@code ApiProblem} and the principal accessors it was also
 * depended <em>upon</em> by five of seven modules. A package that is both closes cycles by
 * construction (the Acyclic Dependencies Principle), and it did: an edge listener on
 * {@code booking.events.BookingConfirmed} produced {@code booking → root → booking}. It had held
 * only by coincidence — every edge class up to then happened to touch just {@code customer} and
 * {@code operator}, the two modules that happened not to use these types.
 *
 * <p>Splitting the two roles fixes it permanently: modules depend on this kernel, the root depends
 * on modules, and <strong>nothing depends on the root</strong> — the composition root's proper
 * shape. It also stopped the cycle from dictating architecture: with this in place, mail listeners
 * could live at the edge or in a module, so that choice was made on merits — and #382 made it: the
 * mail machinery now lives in the {@code notification} module, born with the suppression list as
 * its first owned state, and the root imports no spine-module surface at all (pinned by
 * {@code CompositionRootDisciplineTests}). That removal makes dissolving this kernel
 * <em>technically</em> acyclic again — but only by coincidence, the same pre-#371 fragility;
 * keeping it is deliberate, so "nothing depends on the root" stays true by construction.
 *
 * <p><strong>{@code type = OPEN}</strong> deliberately: this is technical shared code, not a bounded
 * context, so it publishes no {@code api}/{@code vocabulary} surface and consumers reference its
 * types directly. It may depend only on {@code customer} and {@code operator} — the modules that do
 * not depend on it — which is what keeps it acyclic.
 *
 * <p><strong>Keep it small.</strong> A shared kernel earns its keep only while it stays tiny and
 * stable; Evans' warning is that changes here ripple through every context, so they need consensus.
 * Admission test: <em>no business logic, no module-owned state, and no dependency on a module that
 * depends on this one.</em> A type that fails any of those belongs in a bounded context or at the
 * composition root — not here. This package is not a home for "code used in more than one place".
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Shared Kernel",
	type = org.springframework.modulith.ApplicationModule.Type.OPEN,
	// The two modules that do not depend back — CurrentOperator/CurrentCustomer resolve an
	// authenticated principal to a typed id through these ports. Granting more would risk the cycle
	// this module exists to remove.
	allowedDependencies = { "customer::api", "customer::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.shared;
