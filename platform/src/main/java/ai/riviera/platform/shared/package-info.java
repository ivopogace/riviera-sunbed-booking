/**
 * The platform's <strong>Shared Kernel</strong>: the few edge types domain modules may depend on.
 * <strong>Modules depend on it, the root on modules, nothing on the root</strong>; folded back into
 * the root, which depends on modules, it would close cycles. {@code OPEN}: not a bounded context, so
 * no {@code api}/{@code vocabulary} surface; it depends on no module, so none can cycle through it.
 * Keep it tiny: admit by <strong>ownership, never reuse</strong>, and never business logic or
 * module-owned state. Grounds: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Shared Kernel",
	type = org.springframework.modulith.ApplicationModule.Type.OPEN,
	allowedDependencies = {}
)
package ai.riviera.platform.shared;
