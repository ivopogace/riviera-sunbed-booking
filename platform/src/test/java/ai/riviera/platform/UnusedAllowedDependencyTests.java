package ai.riviera.platform;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModule;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.core.NamedInterface;

import com.tngtech.archunit.core.domain.JavaCall;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Fails on a declared {@code allowedDependencies} grant no class of the module uses in bytecode (invariant
 * #11): {@code verify()} rejects a missing grant, never an unused one. Used = Modulith's dependency model
 * plus the parameter types of every called member, which a lambda argument leaves behind. A bare
 * {@code module} or {@code module::*} grant is used by any dependency on that module. Negative case:
 * {@code ai.riviera.grantfixture}, imported at every location (test classes). Rationale: RESPONSIBILITIES.md.
 */
class UnusedAllowedDependencyTests {

	private static final String FIXTURE_BASE = "ai.riviera.grantfixture";

	@Test
	void everyDeclaredGrantIsUsed() {
		GrantAudit audit = audit(ModularityTests.modules, ArchitectureTestSupport.PRODUCTION_CLASSES);

		assertEveryGrantingModuleAudited(audit, ArchitectureTestSupport.PRODUCTION_CLASSES);
		assertNoViolations("Declared allowedDependencies grants no class of the module uses; drop them from "
				+ "the module's package-info", audit.unused());
	}

	@Test
	void reportsTheUnusedGrantAndOnlyIt() {
		JavaClasses fixture = ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);
		GrantAudit audit = audit(ApplicationModules.of(FIXTURE_BASE, location -> true), fixture);

		assertEveryGrantingModuleAudited(audit, fixture);
		assertThat(audit.grantsChecked()).containsExactlyInAnyOrder("alpha → beta::api",
				"alpha → beta::vocabulary", "alpha → beta::spi", "alpha → beta::events");
		assertThat(audit.unused()).containsExactly("alpha → beta::events");
	}

	/**
	 * The vacuity guard: every package whose package-info declares a grant, found by scanning the imported
	 * classes rather than through {@link ApplicationModules}, had a grant checked by the audit.
	 */
	private static void assertEveryGrantingModuleAudited(GrantAudit audit, JavaClasses classes) {
		Set<String> granting = new TreeSet<>();
		for (JavaClass type : classes) {
			if (ArchitectureTestSupport.isPackageInfo(type)
					&& type.isAnnotatedWith(org.springframework.modulith.ApplicationModule.class)
					&& !grants(type.getAnnotationOfType(org.springframework.modulith.ApplicationModule.class))
							.isEmpty()) {
				granting.add(type.getPackageName());
			}
		}
		assertThat(granting).as("package-infos declaring allowedDependencies; none means a vacuous scan")
				.isNotEmpty();
		assertThat(audit.packagesChecked()).as("module packages the audit checked a grant for")
				.containsAll(granting);
	}

	private static GrantAudit audit(ApplicationModules modules, JavaClasses classes) {
		Map<String, Set<String>> calledSignatureTypes = calledSignatureTypes(classes, modules);
		List<String> checked = new ArrayList<>();
		List<String> unused = new ArrayList<>();
		Set<String> packagesChecked = new TreeSet<>();
		modules.forEach(module -> {
			String id = module.getIdentifier().toString();
			Set<String> targetTypes = new TreeSet<>(calledSignatureTypes.getOrDefault(id, Set.of()));
			module.getDirectDependencies(modules).stream()
					.forEach(dependency -> targetTypes.add(dependency.getTargetType().getName()));
			Set<String> used = grantSpellings(id, targetTypes, modules);
			for (String grant : declaredGrants(module)) {
				String entry = id + " → " + grant;
				checked.add(entry);
				packagesChecked.add(module.getBasePackage().getName());
				if (!used.contains(grant)) {
					unused.add(entry);
				}
			}
		});
		return new GrantAudit(checked, unused, packagesChecked);
	}

	/**
	 * Per source module, the parameter types (arrays unwrapped) of every member its classes call: how a
	 * lambda passed as a functional-interface argument shows up, since ArchUnit skips {@code invokedynamic}.
	 */
	private static Map<String, Set<String>> calledSignatureTypes(JavaClasses classes, ApplicationModules modules) {
		Map<String, Set<String>> byModule = new HashMap<>();
		for (JavaClass type : classes) {
			Optional<ApplicationModule> module = modules.getModuleByType(type.getName());
			if (module.isEmpty()) {
				continue;
			}
			Set<String> targets = byModule.computeIfAbsent(module.get().getIdentifier().toString(),
					key -> new TreeSet<>());
			for (JavaCall<?> call : type.getCodeUnitCallsFromSelf()) {
				call.getTarget().getRawParameterTypes()
						.forEach(parameter -> targets.add(parameter.getBaseComponentType().getName()));
			}
		}
		return byModule;
	}

	/**
	 * The grant spellings the target types satisfy from {@code source}: {@code module} and {@code module::*}
	 * for any type in another module, {@code module::interface} for each named interface holding it.
	 */
	private static Set<String> grantSpellings(String source, Set<String> targetTypes, ApplicationModules modules) {
		Set<String> used = new TreeSet<>();
		for (String typeName : targetTypes) {
			modules.getModuleByType(typeName)
					.filter(target -> !target.getIdentifier().toString().equals(source))
					.ifPresent(target -> {
						String name = target.getIdentifier().toString();
						used.add(name);
						used.add(name + "::*");
						target.getNamedInterfaces().stream()
								.filter(NamedInterface::isNamed)
								.filter(named -> named.asJavaClasses().anyMatch(c -> c.getName().equals(typeName)))
								.forEach(named -> used.add(name + "::" + named.getName()));
					});
		}
		return used;
	}

	/**
	 * The grants as written on the module's package-info, not Modulith's resolved view, so a grant naming
	 * nothing resolvable is still judged; the default open token is no grant.
	 */
	private static List<String> declaredGrants(ApplicationModule module) {
		String packageInfo = module.getBasePackage().getName() + ".package-info";
		try {
			return grants(Class.forName(packageInfo)
					.getAnnotation(org.springframework.modulith.ApplicationModule.class));
		}
		catch (ClassNotFoundException e) {
			throw new IllegalStateException("module " + module.getIdentifier() + " has no package-info", e);
		}
	}

	/** The annotation's grants minus the default open token; none for an absent annotation. */
	private static List<String> grants(org.springframework.modulith.ApplicationModule annotation) {
		return annotation == null ? List.of()
				: Stream.of(annotation.allowedDependencies())
						.filter(grant -> !org.springframework.modulith.ApplicationModule.OPEN_TOKEN.equals(grant))
						.toList();
	}

	private record GrantAudit(List<String> grantsChecked, List<String> unused, Set<String> packagesChecked) {
	}
}
