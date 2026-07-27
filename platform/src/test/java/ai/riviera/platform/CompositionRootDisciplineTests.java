package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.isPackageInfo;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static ai.riviera.platform.ArchitectureTestSupport.surfaceOf;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Locks the root-package discipline #382 restores: the composition root orchestrates the platform
 * edge (auth, sessions, SSO, recovery flows — RV-BE-11) and composes modules, but it is not a home
 * for cross-module <em>domain</em> orchestration. After the mail machinery moved into the
 * {@code notification} module, the only module surfaces the root still touches are
 * {@code customer}/{@code operator} (the two principal types), {@code notification::api} (the send
 * port) and {@code shared} — never the booking spine. A root class importing
 * {@code booking}/{@code venue}/{@code payment}/{@code payout}/{@code availability} is the #371
 * cycle pattern reappearing (an edge listener assembling module facts); such a listener belongs in
 * a module — see {@code notification.adapter.in.BookingConfirmationMailListener}, which is exactly
 * that listener, moved.
 *
 * <p><strong>Stated as an allowlist, deliberately (#386).</strong> This rule used to deny the five
 * 2026 spine modules by name, which was strictly weaker than the paragraph above in two ways a
 * review fan-out found: a root class reaching {@code notification.application.Mailer} (the raw
 * transport, bypassing both suppression enforcement and the off-thread dispatch that closes the
 * D-8/#369 timing oracle) passed, and a ninth module would never have entered the deny set at all.
 * An allowlist is self-maintaining — a new module is out of bounds until someone deliberately
 * grants it — and it makes {@code MockMailer}'s Javadoc claim, that root access here is pinned to
 * {@code notification::api}, actually true.
 *
 * <p>The grant is by <em>surface</em>, not merely by module: the root may reach the published
 * {@code api}/{@code vocabulary} of the two principal-type modules, {@code notification}'s
 * {@code api} alone, and the flat {@code shared} kernel — never any module's {@code application},
 * {@code domain} or {@code adapter} internals, and never {@code spi} (an "implement-me" port; the
 * root implements nothing for a module).
 *
 * <p>Sibling to {@link PackageShapeArchitectureTests}: fast, context-free ArchUnit, production
 * classes only. Like {@link PublishedSurfacePlacementArchitectureTests}, the collector is
 * parameterized by base package so the negative case is proven against the deliberately mis-shaped
 * fixture tree under {@code ai.riviera.rootfixture} — never by breaking production code.
 */
class CompositionRootDisciplineTests {

	private static final String FIXTURE_BASE = "ai.riviera.rootfixture";

	/** The surface directly under a module; {@code ""} is a type at the module root (the OPEN kernel's shape). */
	private static final String MODULE_ROOT_SURFACE = "";

	/**
	 * What the composition root may touch, module → allowed surfaces. Keep this in lockstep with the
	 * class Javadoc above: the prose and this map are the same rule stated twice, and the deny-list
	 * era proved that a rule stated only in prose drifts from the one the build enforces.
	 */
	private static final Map<String, Set<String>> GRANTED_SURFACES = Map.of(
			"customer", Set.of("api", "vocabulary"),
			"operator", Set.of("api", "vocabulary"),
			"notification", Set.of("api"),
			"shared", Set.of(MODULE_ROOT_SURFACE));

	@Test
	void rootTouchesOnlyGrantedModuleSurfaces() {
		Inspection inspection = inspect(ArchitectureTestSupport.PRODUCTION_CLASSES, PRODUCTION_BASE);

		assertFalse(inspection.surfacesTouched().isEmpty(),
				"No module surface reached from " + PRODUCTION_BASE + " — the rule would be vacuously "
						+ "green; check the ClassFileImporter package/import options.");
		assertNoViolations("Composition-root discipline violations (root reaches an ungranted module surface)",
				inspection.violations());
	}

	@Test
	void ungrantedModuleSurfaceIsRejected() {
		List<String> violations =
				inspect(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE), FIXTURE_BASE).violations();

		assertTrue(violations.stream().anyMatch(v -> v.contains("RootImportingUngrantedSurface")
						&& v.contains("notification.application")),
				"Expected the root-discipline rule to reject a root class reaching a module's internal "
						+ "application package, but got: " + violations);
	}

	@Test
	void grantedModuleSurfaceIsAccepted() {
		List<String> violations =
				inspect(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE), FIXTURE_BASE).violations();

		assertTrue(violations.stream().noneMatch(v -> v.contains("RootUsingGrantedSurface")),
				"The rule rejected a root class reaching a GRANTED published surface — it is over-strict, "
						+ "and its negative proof would pass for the wrong reason: " + violations);
	}

	/** What one pass over an imported tree found: the violations, and the surfaces actually reached. */
	private record Inspection(List<String> violations, Set<String> surfacesTouched) {
	}

	private static Inspection inspect(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		Set<String> surfacesTouched = new TreeSet<>();

		for (JavaClass type : classes) {
			if (moduleOf(type, base) != null || isPackageInfo(type)) {
				continue; // not a composition-root class
			}
			for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
				JavaClass target = dependency.getTargetClass();
				String module = moduleOf(target, base);
				if (module == null) {
					continue; // another root type, or outside the platform entirely
				}
				String surface = surfaceOf(target, base);
				surfacesTouched.add(module + "::" + surface);
				if (!GRANTED_SURFACES.getOrDefault(module, Set.of()).contains(surface)) {
					violations.add(type.getName() + " reaches " + target.getName()
							+ " — the composition root may touch only " + granted() + ". Cross-module domain "
							+ "orchestration, and any reach past a module's published surface, belongs IN a "
							+ "module (#382/#386); granting a new one is a deliberate edit to this rule.");
				}
			}
		}
		return new Inspection(violations, surfacesTouched);
	}

	/** The grant, rendered for the failure message — so the fix is readable without opening this file. */
	private static String granted() {
		return new TreeSet<>(GRANTED_SURFACES.entrySet().stream()
				.flatMap(entry -> entry.getValue().stream()
						.map(surface -> surface.isEmpty() ? entry.getKey() : entry.getKey() + "::" + surface))
				.toList())
				.toString();
	}
}
