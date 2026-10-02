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
 * Fails on a declared {@code allowedDependencies} grant that no class of the module uses (invariant
 * #11, ADR-0007). {@link ModularityTests}' {@code verify()} rejects a dependency missing its grant, never a
 * grant missing its dependency, so an unused grant silently widens what a module may reach.
 *
 * <p><strong>Used means used in bytecode.</strong> An import scan is not enough: {@code remodel} reaches
 * {@code venue::spi} through a lambda passed as {@code RemodelGate}, and {@code web} reaches
 * {@code challenge::vocabulary} through a {@code switch} over a {@code ChallengeVerdict} that arrives as a
 * return type, neither ever imported. The used set is Spring Modulith's own dependency model (ArchUnit over
 * class files, the one {@code verify()} judges), which sees the {@code switch}, joined with the parameter and
 * return types of every member a module's classes call, which sees the lambda: ArchUnit does not model an
 * {@code invokedynamic} call site, but the called member's descriptor names its functional interface.
 *
 * <p>A {@code module::interface} grant is used when some dependency targets a type in that named
 * interface; a bare {@code module} grant (such as {@code "shared"}) or {@code module::*} when some dependency
 * targets the module at all. A module declaring no {@code allowedDependencies} grants nothing to check.
 * The negative case runs against the deliberately over-granted fixture tree under
 * {@code ai.riviera.grantfixture}, never by breaking production code; its import admits every location,
 * since Modulith's default import skips test classes and the fixtures are test classes.
 */
class UnusedAllowedDependencyTests {

	private static final String FIXTURE_BASE = "ai.riviera.grantfixture";

	@Test
	void everyDeclaredGrantIsUsed() {
		GrantAudit audit = audit(ModularityTests.modules, ArchitectureTestSupport.PRODUCTION_CLASSES);

		assertThat(audit.grantsChecked())
				.as("the bytecode-only grants are among those checked; an empty list means a vacuous rule")
				.contains("remodel → venue::spi", "web → challenge::vocabulary");
		assertNoViolations("Declared allowedDependencies grants no class of the module uses; drop them from "
				+ "the module's package-info", audit.unused());
	}

	@Test
	void reportsTheUnusedGrantAndOnlyIt() {
		GrantAudit audit = audit(ApplicationModules.of(FIXTURE_BASE, location -> true),
				ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE));

		assertThat(audit.grantsChecked()).containsExactlyInAnyOrder("alpha → beta::api",
				"alpha → beta::vocabulary", "alpha → beta::spi", "alpha → beta::events");
		assertThat(audit.unused()).containsExactly("alpha → beta::events");
	}

	private static GrantAudit audit(ApplicationModules modules, JavaClasses classes) {
		Map<String, Set<String>> calledSignatureTypes = calledSignatureTypes(classes, modules);
		List<String> checked = new ArrayList<>();
		List<String> unused = new ArrayList<>();
		modules.forEach(module -> {
			String id = module.getIdentifier().toString();
			Set<String> targetTypes = new TreeSet<>(calledSignatureTypes.getOrDefault(id, Set.of()));
			module.getDirectDependencies(modules).stream()
					.forEach(dependency -> targetTypes.add(dependency.getTargetType().getName()));
			Set<String> used = grantSpellings(id, targetTypes, modules);
			for (String grant : declaredGrants(module)) {
				String entry = id + " → " + grant;
				checked.add(entry);
				if (!used.contains(grant)) {
					unused.add(entry);
				}
			}
		});
		return new GrantAudit(checked, unused);
	}

	/**
	 * Per source module, the parameter and return types of every member its
	 * classes call: the call's descriptor names them in the class file whether or not the source does.
	 * This is what Modulith's model misses for a lambda passed as a functional-interface argument, whose
	 * type appears only in the called member's descriptor and the {@code invokedynamic} call site.
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
				call.getTarget().getRawParameterTypes().forEach(parameter -> targets.add(parameter.getName()));
				targets.add(call.getTarget().getRawReturnType().getName());
			}
		}
		return byModule;
	}

	/**
	 * Every grant spelling the target types satisfy, from {@code source}: the target module's bare name and
	 * {@code module::*} for any type in another module, plus {@code module::interface} for each named
	 * interface holding the type.
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
	 * The grants as written in the module's {@code @ApplicationModule}, read off its package-info: the
	 * declared strings, not Modulith's resolved view, so a grant naming nothing resolvable is still
	 * judged. The annotation's default, the open token, declares no grant.
	 */
	private static List<String> declaredGrants(ApplicationModule module) {
		String packageInfo = module.getBasePackage().getName() + ".package-info";
		try {
			var annotation = Class.forName(packageInfo)
					.getAnnotation(org.springframework.modulith.ApplicationModule.class);
			return annotation == null ? List.of()
					: Stream.of(annotation.allowedDependencies())
							.filter(grant -> !org.springframework.modulith.ApplicationModule.OPEN_TOKEN.equals(grant))
							.toList();
		}
		catch (ClassNotFoundException e) {
			return List.of();
		}
	}

	private record GrantAudit(List<String> grantsChecked, List<String> unused) {
	}
}
