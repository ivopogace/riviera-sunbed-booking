package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootVersion;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
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
 * provider ({@code org.hibernate.*}), and Boot's Hibernate auto-configuration, which the JPA
 * starter brings in {@code spring-boot-hibernate} on Boot 4 (the Boot 3 name under
 * {@code autoconfigure.orm.jpa} is absent from Boot 4's jars, so a probe of it can never fire).
 * Classes are loaded with initialization disabled so the probe has no side effects.
 *
 * <p>Its second rule places the JDBC that remains: no class in any module's {@code application}
 * package (use-case sub-packages included) names {@code org.springframework.jdbc}, {@code java.sql}
 * or {@code javax.sql}. SQL runs in {@code adapter/out} behind a port the application declares
 * (ADR-0007); {@code domain/} is already JDBC-free by {@link DomainPurityArchitectureTests}. Proven
 * against the {@code ai.riviera.applicationjdbcfixture} tree, never by breaking production code.
 *
 * <p>Its third rule keeps Spring Data out of production code (ADR-0001): no class, in any package,
 * names {@code org.springframework.data} — no repository interface, no {@code @Table}/{@code @Id}
 * aggregate mapping, no {@code @EnableJdbcRepositories}. Proven against the
 * {@code ai.riviera.springdatafixture} tree.
 */
class JdbcOnlyArchitectureTests {

	private static final ClassLoader LOADER = JdbcOnlyArchitectureTests.class.getClassLoader();

	/** Boot 4's location, in {@code spring-boot-hibernate}; verified against the 4.1.1 jar (#1391). */
	private static final String HIBERNATE_AUTO_CONFIGURATION =
			"org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration";

	private static final String HIBERNATE_PROBE_BOOT_MAJOR = "4";

	private static final String APPLICATION_SURFACE = "application";

	private static final List<String> JDBC_ROOTS = List.of("org.springframework.jdbc", "java.sql", "javax.sql");

	private static final List<String> SPRING_DATA_ROOTS = List.of("org.springframework.data");

	private static final String APPLICATION_JDBC_FIXTURE_BASE = "ai.riviera.applicationjdbcfixture";

	private static final String SPRING_DATA_FIXTURE_BASE = "ai.riviera.springdatafixture";

	@Test
	void noJpaOrHibernateTypeIsOnTheClasspath() {
		assertJpaTypeAbsent("jakarta.persistence.Entity");
		assertJpaTypeAbsent("jakarta.persistence.EntityManager");
		assertJpaTypeAbsent("org.hibernate.Session");
		assertJpaTypeAbsent("org.hibernate.SessionFactory");
		assertJpaTypeAbsent(HIBERNATE_AUTO_CONFIGURATION);
	}

	/**
	 * The auto-configuration's class name moves between Boot majors (Boot 3 kept it in
	 * {@code spring-boot-autoconfigure}), and a stale name leaves the probe silently dead: a major
	 * upgrade re-verifies it against the resolved {@code spring-boot-hibernate} jar and updates both constants.
	 */
	@Test
	void theHibernateProbeNamesTheRunningBootMajor() {
		String runningMajor = SpringBootVersion.getVersion().split("\\.")[0];

		assertEquals(HIBERNATE_PROBE_BOOT_MAJOR, runningMajor,
				"Spring Boot " + SpringBootVersion.getVersion() + " is running, but the Hibernate auto-configuration "
						+ "probe names Boot " + HIBERNATE_PROBE_BOOT_MAJOR + "'s class — re-verify "
						+ HIBERNATE_AUTO_CONFIGURATION + " against this major's spring-boot-hibernate jar");
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
				applicationJdbcViolations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	/** Guards against a vacuously-green rule: application packages exist in several modules. */
	@Test
	void theApplicationLayerWasActuallyInspected() {
		long modulesWithApplication = PRODUCTION_CLASSES.stream()
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
				fixtureClasses(APPLICATION_JDBC_FIXTURE_BASE), APPLICATION_JDBC_FIXTURE_BASE);

		assertEachRejected(violations, APPLICATION_JDBC_FIXTURE_BASE,
				List.of("JdbcClientService", "SqlTimestampService", "DataSourceService"));
		assertCleanUnflagged(violations, "The clean fixture's JDBC sits in adapter/out and must not be flagged");
	}

	@Test
	void noProductionClassNamesASpringDataType() {
		assertNoViolations("org.springframework.data in production code — adapters are hand-written JdbcClient "
				+ "SQL, never a Spring Data repository or aggregate mapping (ADR-0001)",
				dependenciesOn(PRODUCTION_CLASSES, type -> true, SPRING_DATA_ROOTS));
	}

	/** The negative proof: each Spring Data vector is rejected, and the plain-JDBC control is not. */
	@Test
	void everySpringDataFixtureIsRejectedAndTheCleanOneIsNot() {
		List<String> violations = dependenciesOn(fixtureClasses(SPRING_DATA_FIXTURE_BASE), type -> true,
				SPRING_DATA_ROOTS);

		assertEachRejected(violations, SPRING_DATA_FIXTURE_BASE,
				List.of("RowRepository", "MappedRow", "RepositoriesConfig"));
		assertCleanUnflagged(violations,
				"The clean fixture's JdbcClient and org.springframework.dao types are not Spring Data and must not be flagged");
	}

	private static List<String> applicationJdbcViolations(JavaClasses classes, String base) {
		return dependenciesOn(classes, type -> APPLICATION_SURFACE.equals(surfaceOf(type, base)), JDBC_ROOTS);
	}

	/** Each {@code subject} class's direct dependencies into a package under {@code roots}, one line per pair. */
	private static List<String> dependenciesOn(JavaClasses classes, Predicate<JavaClass> subject, List<String> roots) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!subject.test(type)) {
				continue;
			}
			for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
				JavaClass target = dependency.getTargetClass();
				if (isUnder(target.getPackageName(), roots)) {
					violations.add(type.getName() + " depends on " + target.getName());
				}
			}
		}
		return violations.stream().distinct().toList();
	}

	/** Package-boundary match, so {@code java.sqlfoo} is not {@code java.sql}. */
	private static boolean isUnder(String pkg, List<String> roots) {
		return roots.stream().anyMatch(root -> pkg.equals(root) || pkg.startsWith(root + "."));
	}

	private static void assertEachRejected(List<String> violations, String fixtureBase, List<String> holders) {
		for (String holder : holders) {
			assertTrue(violations.stream().anyMatch(violation -> violation.startsWith(fixtureBase)
					&& violation.contains("." + holder + " ")),
					"Expected the rule to reject " + holder + ", but got: " + violations);
		}
	}

	private static void assertCleanUnflagged(List<String> violations, String why) {
		assertEquals(List.of(), violations.stream().filter(violation -> violation.contains(".clean.")).toList(), why);
	}
}
