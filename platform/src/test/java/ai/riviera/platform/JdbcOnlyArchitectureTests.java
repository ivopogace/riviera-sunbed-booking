package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static ai.riviera.platform.ArchitectureTestSupport.surfaceOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Enforces invariant #1 (CLAUDE.md): <em>"No JPA/Hibernate — JDBC only."</em> The
 * {@code spring-boot-starter-data-jpa} dependency must never reach the classpath; every
 * driven adapter is hand-written {@code JdbcClient} SQL. The Spring Data JDBC starter itself
 * stays on the classpath, and what reaching for its aggregate mapping would mean is
 * invariant #1's text to state, not this test's.
 *
 * <p>This is a fast, context-free guard (a sibling to {@link ModularityTests} — no Spring
 * context, no database, runs anywhere) that fails the build the moment a JPA or Hibernate
 * type becomes resolvable. It probes the marker types each vector would drag in: the JPA API
 * ({@code jakarta.persistence.*} — {@code @Entity}, {@code EntityManager}), the Hibernate
 * provider ({@code org.hibernate.*}), and Spring Boot's JPA auto-configuration (pulled in
 * by the JPA starter). Classes are loaded with initialization disabled so the probe has no
 * side effects.
 *
 * <p>Its second rule places the JDBC that remains: no class in any module's {@code application}
 * package (use-case sub-packages included) names {@code org.springframework.jdbc}, {@code java.sql}
 * or {@code javax.sql}. SQL runs in {@code adapter/out} behind a port the application declares
 * (ADR-0007); {@code domain/} is already JDBC-free by {@link DomainPurityArchitectureTests}. Proven
 * against the {@code ai.riviera.applicationjdbcfixture} tree, never by breaking production code.
 */
class JdbcOnlyArchitectureTests {

	private static final ClassLoader LOADER = JdbcOnlyArchitectureTests.class.getClassLoader();

	private static final String APPLICATION_SURFACE = "application";

	private static final List<String> JDBC_ROOTS = List.of("org.springframework.jdbc", "java.sql", "javax.sql");

	private static final String FIXTURE_BASE = "ai.riviera.applicationjdbcfixture";

	@Test
	void noJpaOrHibernateTypeIsOnTheClasspath() {
		assertJpaTypeAbsent("jakarta.persistence.Entity");
		assertJpaTypeAbsent("jakarta.persistence.EntityManager");
		assertJpaTypeAbsent("org.hibernate.Session");
		assertJpaTypeAbsent("org.hibernate.SessionFactory");
		assertJpaTypeAbsent("org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration");
	}

	/**
	 * Sanity check: the JDBC classpath the tree runs on — {@code JdbcTemplate}, {@code JdbcClient}
	 * and the Spring Data JDBC starter beside them — is present, so the absence assertions above
	 * are not vacuous: the probe genuinely distinguishes a resolvable type from a missing one.
	 */
	@Test
	void theJdbcPersistencePathIsOnTheClasspath() throws ClassNotFoundException {
		Class.forName("org.springframework.jdbc.core.JdbcTemplate", false, LOADER);
		Class.forName("org.springframework.jdbc.core.simple.JdbcClient", false, LOADER);
		Class.forName("org.springframework.data.jdbc.repository.config.EnableJdbcRepositories", false, LOADER);
	}

	private static void assertJpaTypeAbsent(String fqcn) {
		assertThrows(ClassNotFoundException.class,
				() -> Class.forName(fqcn, false, LOADER),
				() -> "Invariant #1 violated: '" + fqcn + "' is on the classpath. "
						+ "spring-boot-starter-data-jpa / Hibernate must never be a dependency — use "
						+ "hand-written JdbcClient SQL (CLAUDE.md #1).");
	}

	@Test
	void noApplicationClassNamesAJdbcType() {
		assertNoViolations("JDBC in an application/ package — move the SQL behind an adapter/out port (ADR-0007)",
				applicationJdbcViolations(ArchitectureTestSupport.PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/** Guards against a vacuously-green rule: application packages exist in several modules. */
	@Test
	void theApplicationLayerWasActuallyInspected() {
		long modulesWithApplication = ArchitectureTestSupport.PRODUCTION_CLASSES.stream()
				.filter(type -> APPLICATION_SURFACE.equals(surfaceOf(type, PRODUCTION_BASE)))
				.map(type -> moduleOf(type, PRODUCTION_BASE))
				.distinct()
				.count();

		assertTrue(modulesWithApplication > 1,
				"expected application/ packages in several modules — the no-JDBC rule would be vacuously green");
	}

	/** The negative proof: each JDBC-holding fixture is rejected, and only those. */
	@Test
	void everyJdbcHoldingApplicationFixtureIsRejectedAndTheCleanOneIsNot() {
		List<String> violations = applicationJdbcViolations(
				ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE), FIXTURE_BASE);

		for (String holder : List.of("JdbcClientService", "SqlTimestampService", "DataSourceService")) {
			assertTrue(violations.stream().anyMatch(violation -> violation.startsWith(FIXTURE_BASE)
					&& violation.contains("." + holder + " ")),
					"Expected the rule to reject " + holder + ", but got: " + violations);
		}
		assertEquals(List.of(), violations.stream().filter(violation -> violation.contains(".clean.")).toList(),
				"The clean fixture's JDBC sits in adapter/out and must not be flagged");
	}

	private static List<String> applicationJdbcViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!APPLICATION_SURFACE.equals(surfaceOf(type, base))) {
				continue;
			}
			for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
				JavaClass target = dependency.getTargetClass();
				if (isJdbc(target.getPackageName())) {
					violations.add(type.getName() + " depends on " + target.getName());
				}
			}
		}
		return violations.stream().distinct().toList();
	}

	/** Package-boundary match, so {@code java.sqlfoo} is not {@code java.sql}. */
	private static boolean isJdbc(String pkg) {
		return JDBC_ROOTS.stream().anyMatch(root -> pkg.equals(root) || pkg.startsWith(root + "."));
	}
}
