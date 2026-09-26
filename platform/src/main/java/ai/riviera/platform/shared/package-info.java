/**
 * The platform's <strong>Shared Kernel</strong>: the few edge types domain modules may depend on.
 * <strong>Modules depend on it, the root on modules, nothing on the root</strong>; folded back into
 * the root, which depends on modules, it would close cycles. {@code OPEN}: not a bounded context, so
 * no {@code api}/{@code vocabulary} surface; it reaches only {@code customer} and {@code operator},
 * which don't depend back. Keep it tiny: admit by <strong>ownership, never reuse</strong>, and never
 * business logic or module-owned state. Grounds: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Shared Kernel",
	type = org.springframework.modulith.ApplicationModule.Type.OPEN,
	// The two modules that do not depend back; granting more would risk the cycle this removes.
	allowedDependencies = { "customer::api", "customer::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.shared;
