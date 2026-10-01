/**
 * The platform's <strong>Shared Kernel</strong>: the few edge types every module may depend on.
 * Closed and registered in {@code @Modulithic(sharedModules)}, so Modulith allows it to every module
 * and loads it in every module test; it depends on no module, so cycles through it fail
 * {@code verify()}. Flat: its base package is its API. Keep it tiny: admit by <strong>ownership,
 * never reuse</strong>, and never business logic or module-owned state. Grounds:
 * {@code RESPONSIBILITIES.md} §{@code shared}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Shared Kernel",
	allowedDependencies = {}
)
package ai.riviera.platform.shared;
