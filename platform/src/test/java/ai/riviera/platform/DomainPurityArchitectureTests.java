package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
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
 * ADR-0018's principle as a fitness function: a class in a module's {@code domain/} package holds a
 * statement that survives throwing away the database, the HTTP API, Stripe and Spring. So it may
 * name the JDK and other modules' {@code vocabulary/} and {@code domain/} types — the ids, value
 * objects and pure rules its own statement is written in — and nothing else. Spring, the JDBC API,
 * the Stripe SDK, any {@code adapter/}, and any port or repository interface (every one of which
 * lives in an {@code api/}, {@code spi/} or {@code application/} package under ADR-0007) are out.
 *
 * <p>A fast, context-free ArchUnit test, sibling to {@link PackageShapeArchitectureTests} and
 * {@link ResponsibilitiesArchitectureTests}, and proven against a deliberately impure fixture tree
 * ({@code ai.riviera.domainpurityfixture}) rather than by breaking production code.
 *
 * <p>The cross-module allowance is the part worth stating out loud: {@code payout.domain} names
 * {@code venue.vocabulary.VenueId} and {@code booking.vocabulary.RefundReason} today, and that is
 * correct — invariant #11 wants typed ids at the seam. Purity here means <em>no framework and no
 * outside layer</em>, never module isolation, which is {@link ModularityTests}' subject.
 *
 * <p>The hexagon direction ({@code domain} must not reach {@code adapter}) is also
 * {@link PackageShapeArchitectureTests}' assertion 4, for {@code application} and {@code domain}
 * together. It is restated here so this rule reads as one whole statement about {@code domain/}.
 */
class DomainPurityArchitectureTests {

	private static final String DOMAIN_SURFACE = "domain";

	/** The surfaces a domain type may name: published ids and values, and other pure rules. */
	private static final Set<String> ALLOWED_TARGET_SURFACES = Set.of(DOMAIN_SURFACE, "vocabulary");

	/**
	 * The JDK allowance, which passes {@code java.time}. Review item RV-BE-19
	 * ({@code riviera-review-overlay/references/backend-conventions.md}) relies on exactly that, so
	 * a tightening here or in {@link #FORBIDDEN} must update the item too.
	 */
	private static final String JDK_ROOT = "java";

	/**
	 * Checked before the {@link #JDK_ROOT JDK allowance}, so {@code java.sql} is rejected rather
	 * than let through.
	 */
	private static final List<Forbidden> FORBIDDEN = List.of(
			new Forbidden("org.springframework", "Spring (org.springframework.jdbc included)"),
			new Forbidden("java.sql", "the JDBC API"),
			new Forbidden("javax.sql", "the JDBC API"),
			new Forbidden("com.stripe", "the Stripe SDK"));

	private static final String FIXTURE_BASE = "ai.riviera.domainpurityfixture";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	private static final JavaClasses FIXTURE_CLASSES =
			ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	/** A forbidden root package and the phrase naming it in the violation report. */
	private record Forbidden(String root, String what) {
	}

	@Test
	void domainDependsOnlyOnTheJdkAndPublishedIdsValuesAndRules() {
		assertNoViolations("ADR-0018 domain-purity violations",
				purityViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/** Guards against a vacuously-green rule: there are domain classes, in more than one module. */
	@Test
	void theDomainLayerWasActuallyInspected() {
		Set<String> modulesWithDomain = new TreeSet<>();
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (DOMAIN_SURFACE.equals(surfaceOf(type, PRODUCTION_BASE)) && !isPackageInfo(type)) {
				modulesWithDomain.add(moduleOf(type, PRODUCTION_BASE));
			}
		}

		assertTrue(modulesWithDomain.size() > 1,
				"expected domain/ packages in several modules, found " + modulesWithDomain
						+ " — the purity rule would be vacuously green");
	}

	/**
	 * Guards the other way: the cross-module allowance is exercised, so a future tightening that
	 * forbade it would redden here instead of passing unnoticed.
	 */
	@Test
	void aDomainRuleDoesNameAnotherModulesVocabulary() {
		boolean found = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (DOMAIN_SURFACE.equals(surfaceOf(type, PRODUCTION_BASE))
					&& namesAnotherModulesPublishedType(type)) {
				found = true;
				break;
			}
		}

		assertTrue(found, "expected at least one domain class to name another module's vocabulary "
				+ "(payout.domain names venue's VenueId) — otherwise the allowance proves nothing");
	}

	/** The negative proof (red run): one impure fixture per clause of the rule is rejected. */
	@Test
	void everyImpureFixtureIsRejected() {
		List<String> violations = purityViolations(FIXTURE_CLASSES, FIXTURE_BASE);

		for (String impure : List.of("SpringAnnotatedRule", "TimestampRule", "StripeAwareRule",
				"AdapterReachingRule", "PortReachingRule")) {
			assertTrue(violations.stream().anyMatch(violation -> violation.contains(impure)),
					"Expected the purity rule to reject " + impure + ", but got: " + violations);
		}
	}

	/** And the pure fixture — the JDK plus another module's vocabulary/domain — is not. */
	@Test
	void thePureFixtureIsNotRejected() {
		List<String> violations = purityViolations(FIXTURE_CLASSES, FIXTURE_BASE);

		assertFalse(violations.stream().anyMatch(violation -> violation.contains("PureFixtureRule")),
				"The pure fixture must pass — a domain rule may name the JDK and published "
						+ "ids/values/rules; got: " + violations);
	}

	private static List<String> purityViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!DOMAIN_SURFACE.equals(surfaceOf(type, base)) || isPackageInfo(type)) {
				continue;
			}
			for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
				JavaClass target = dependency.getTargetClass();
				String rejection = rejectionOf(target, base);
				if (rejection != null) {
					violations.add(type.getName() + " depends on " + target.getName() + " — " + rejection);
				}
			}
		}
		return violations;
	}

	/** Why {@code target} may not be named from a domain class, or {@code null} when it may. */
	private static String rejectionOf(JavaClass target, String base) {
		String pkg = target.getPackageName();
		if (pkg.isEmpty()) {
			return null;
		}
		for (Forbidden forbidden : FORBIDDEN) {
			if (isUnder(pkg, forbidden.root())) {
				return forbidden.what() + " does not belong in a rule that must hold with the "
						+ "database, the HTTP API, Stripe and Spring thrown away (ADR-0018)";
			}
		}
		if (isUnder(pkg, JDK_ROOT) || target.isEquivalentTo(Object.class)) {
			return null;
		}
		if (!isUnder(pkg, base)) {
			return "domain/ names the JDK and published ids, values and rules only (ADR-0018)";
		}
		String surface = surfaceOf(target, base);
		if (ALLOWED_TARGET_SURFACES.contains(surface)) {
			return null;
		}
		return "that is " + (surface.isEmpty() ? "a module-root type" : surface + "/")
				+ " — a port, an adapter or an application service; a domain rule takes its inputs "
				+ "as values and names only vocabulary/ and domain/ (ADR-0018)";
	}

	/** Package-boundary match, so {@code com.stripefoo} is not {@code com.stripe}. */
	private static boolean isUnder(String pkg, String root) {
		return pkg.equals(root) || pkg.startsWith(root + ".");
	}

	private static boolean namesAnotherModulesPublishedType(JavaClass type) {
		String module = moduleOf(type, PRODUCTION_BASE);
		for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
			JavaClass target = dependency.getTargetClass();
			if (isUnder(target.getPackageName(), PRODUCTION_BASE)
					&& !module.equals(moduleOf(target, PRODUCTION_BASE))
					&& ALLOWED_TARGET_SURFACES.contains(surfaceOf(target, PRODUCTION_BASE))) {
				return true;
			}
		}
		return false;
	}
}
