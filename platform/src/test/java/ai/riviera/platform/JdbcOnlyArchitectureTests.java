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
 * Enforces invariant #1 (CLAUDE.md, ADR-0001) without a Spring context, like {@link ModularityTests}. Three
 * rules: no JPA or Hibernate type resolves on the classpath (the JPA API, the Hibernate provider, and Boot's
 * Hibernate auto-configuration, which the JPA starter brings via {@code spring-boot-hibernate} on Boot 4);
 * no class in a module's {@code application} package names {@code org.springframework.jdbc}, {@code java.sql}
 * or {@code javax.sql}, since SQL sits in {@code adapter/out} behind a port (ADR-0007); and no production class
 * names {@code org.springframework.data}. Each rule is proven against an {@code ai.riviera.*fixture} tree.
 */
class JdbcOnlyArchitectureTests {

	private static final ClassLoader LOADER = JdbcOnlyArchitectureTests.class.getClassLoader();

	/** Boot 4's location in {@code spring-boot-hibernate}, an artifact this build never resolves (#1391). */
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
	 * The auto-configuration's class name is per Boot major, and a stale name leaves the probe silently green: a
	 * major upgrade re-verifies {@link #HIBERNATE_AUTO_CONFIGURATION} against that major's
	 * {@code spring-boot-hibernate} jar, fetched for the purpose, and updates both constants.
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
		JavaClasses fixtures = fixtureClasses(APPLICATION_JDBC_FIXTURE_BASE);
		List<String> violations = applicationJdbcViolations(fixtures, APPLICATION_JDBC_FIXTURE_BASE);

		assertEachRejected(violations, APPLICATION_JDBC_FIXTURE_BASE,
				List.of("JdbcClientService", "SqlTimestampService", "DataSourceService"));
		assertCleanUnflagged(fixtures, APPLICATION_JDBC_FIXTURE_BASE + ".clean.adapter.out.JdbcCleanPort", violations,
				"The clean fixture's JDBC sits in adapter/out and must not be flagged");
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
		JavaClasses fixtures = fixtureClasses(SPRING_DATA_FIXTURE_BASE);
		List<String> violations = dependenciesOn(fixtures, type -> true, SPRING_DATA_ROOTS);

		assertEachRejected(violations, SPRING_DATA_FIXTURE_BASE,
				List.of("RowRepository", "MappedRow", "RepositoriesConfig"));
		assertCleanUnflagged(fixtures, SPRING_DATA_FIXTURE_BASE + ".clean.adapter.out.JdbcRowReader", violations,
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

	/** The control must be in the imported tree ({@code get} throws otherwise), else its clean report is vacuous. */
	private static void assertCleanUnflagged(JavaClasses fixtures, String control, List<String> violations, String why) {
		fixtures.get(control);
		assertEquals(List.of(), violations.stream().filter(violation -> violation.contains(".clean.")).toList(), why);
	}
}
