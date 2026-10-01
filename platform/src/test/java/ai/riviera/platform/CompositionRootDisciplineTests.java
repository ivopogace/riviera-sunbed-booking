package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.isPackageInfo;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Locks the root-package discipline (ADR-0028 Decision 1): the root holds the application class and
 * app-wide configuration that reaches no module ({@code PlatformApplication}, {@code TimeConfig},
 * {@code SpaWebConfig}, {@code MapResourcesConfig}). A root class that needs any module surface, even a
 * published {@code api}, belongs in a module: the security chain is {@code web}'s, login {@code auth}'s, the
 * remodel composition {@code remodel}'s, observability {@code monitoring}'s.
 *
 * <p><strong>Stated as a blanket rule, not a grant map.</strong> No module surface is granted, so a new
 * module is out of bounds for the root by construction, and the vacuity guard counts the root classes
 * inspected rather than the surfaces reached.
 *
 * <p><strong>The edge runs both ways.</strong> The first rule bounds what the root may reach; the
 * second bounds what may reach the root — no class inside a module may depend on a type sitting
 * directly in the base package. Modules depend on {@code shared}, and nothing depends on the root; a
 * package that is both closes cycles by construction, and once did.
 * Spring Modulith cannot supply this half: since 1.1 it verifies the base package as a hidden
 * {@code root:ai.riviera.platform} module — a root class reaching a module's internals, or a
 * root&harr;module cycle, fails {@code verify()} — but a root type is never a dependency
 * <em>target</em> to it, so {@code allowedDependencies = {}} still lets a module reach the root
 * (ADR-0028's research note, &sect;1). A module needing a root type is the signal to move that type to
 * {@code shared} (or into the module), never to grant an exception here.
 *
 * <p>Sibling to {@link PackageShapeArchitectureTests}: fast, context-free ArchUnit, production
 * classes only. Like {@link PublishedSurfacePlacementArchitectureTests}, the collector is
 * parameterized by base package so the negative case is proven against the deliberately mis-shaped
 * fixture tree under {@code ai.riviera.rootfixture} — never by breaking production code.
 */
class CompositionRootDisciplineTests {

	private static final String FIXTURE_BASE = "ai.riviera.rootfixture";

	/** The mirror-image fixture tree: module stand-ins, one of which depends on a root stand-in. */
	private static final String MODULE_FIXTURE_BASE = "ai.riviera.modulefixture";

	@Test
	void rootReachesNoModule() {
		RootReach reach = inspect(ArchitectureTestSupport.PRODUCTION_CLASSES, PRODUCTION_BASE);

		assertTrue(reach.classesInspected() > 0,
				"No composition-root class was inspected in " + PRODUCTION_BASE + " — the rule would be "
						+ "vacuously green; check the ClassFileImporter package/import options.");
		assertNoViolations("Composition-root discipline violations (the root reaches a module)",
				reach.violations());
	}

	@Test
	void rootReachingModuleInternalsIsRejected() {
		List<String> violations =
				inspect(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE), FIXTURE_BASE).violations();

		assertTrue(violations.stream().anyMatch(v -> v.contains("RootReachingModuleInternals")
						&& v.contains("notification.application")),
				"Expected the root-discipline rule to reject a root class reaching a module's internal "
						+ "application package, but got: " + violations);
	}

	@Test
	void rootReachingPublishedSurfaceIsRejected() {
		List<String> violations =
				inspect(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE), FIXTURE_BASE).violations();

		assertTrue(violations.stream().anyMatch(v -> v.contains("RootReachingPublishedSurface")
						&& v.contains("auth.api")),
				"Expected the root-discipline rule to reject a root class reaching even a module's "
						+ "published api, but got: " + violations);
	}

	@Test
	void rootReachingNoModuleIsAccepted() {
		JavaClasses fixture = ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);
		assertTrue(fixture.contain(FIXTURE_BASE + ".RootReachingNoModule"),
				"The control fixture was not imported, so its acceptance would prove nothing.");
		List<String> violations = inspect(fixture, FIXTURE_BASE).violations();

		assertTrue(violations.stream().noneMatch(v -> v.contains("RootReachingNoModule")),
				"The rule rejected a root class that reaches no module — it is over-strict, and its "
						+ "negative proofs would pass for the wrong reason: " + violations);
	}

	@Test
	void noModuleReachesTheRoot() {
		RootReach reach = inspectRootReach(ArchitectureTestSupport.PRODUCTION_CLASSES, PRODUCTION_BASE);

		assertTrue(reach.classesInspected() > 0,
				"No class inside a module was inspected — the rule would be vacuously green; check "
						+ "the ClassFileImporter package/import options.");
		assertNoViolations("Composition-root discipline violations (a module depends on a root type)",
				reach.violations());
	}

	@Test
	void moduleReachingTheRootIsRejected() {
		List<String> violations = inspectRootReach(
				ArchitectureTestSupport.fixtureClasses(MODULE_FIXTURE_BASE), MODULE_FIXTURE_BASE).violations();

		assertTrue(violations.stream().anyMatch(v -> v.contains("ModuleReachingRoot")
						&& v.contains("RootShapedType")),
				"Expected the module-to-root rule to reject a module class depending on a type in the "
						+ "base package, but got: " + violations);
	}

	@Test
	void moduleAvoidingTheRootIsAccepted() {
		List<String> violations = inspectRootReach(
				ArchitectureTestSupport.fixtureClasses(MODULE_FIXTURE_BASE), MODULE_FIXTURE_BASE).violations();

		assertTrue(violations.stream().noneMatch(v -> v.contains("ModuleAvoidingRoot")),
				"The rule flagged a module class that names no root type — it is over-strict, and its "
						+ "negative proof would pass for the wrong reason: " + violations);
	}

	/** What one pass of either rule found: the violations, and how many classes it looked at. */
	private record RootReach(List<String> violations, int classesInspected) {
	}

	private static RootReach inspect(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		int inspected = 0;

		for (JavaClass type : classes) {
			if (moduleOf(type, base) != null || isPackageInfo(type)) {
				continue; // not a composition-root class
			}
			inspected++;
			for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
				JavaClass target = dependency.getTargetClass();
				String module = moduleOf(target, base);
				if (module != null) {
					violations.add(type.getName() + " reaches " + target.getName() + " in module '" + module
							+ "' — the composition root holds only the application class and configuration "
							+ "that reaches no module (ADR-0028 Decision 1). A class that needs a module "
							+ "surface belongs in a module.");
				}
			}
		}
		return new RootReach(violations, inspected);
	}

	private static RootReach inspectRootReach(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		int inspected = 0;

		for (JavaClass type : classes) {
			if (moduleOf(type, base) == null || isPackageInfo(type)) {
				continue; // a composition-root class, or outside the tree
			}
			inspected++;
			for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
				JavaClass target = dependency.getTargetClass();
				if (base.equals(target.getPackageName()) && !isPackageInfo(target)) {
					violations.add(type.getName() + " depends on " + target.getName()
							+ " — a class inside a module may not reach a type sitting directly in "
							+ base + ". Modules depend on shared, the root on no module, and "
							+ "nothing depends on the root; move the type to shared or into the module, "
							+ "never grant an exception here.");
				}
			}
		}
		return new RootReach(violations, inspected);
	}
}
