package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Enforces invariant #1 (CLAUDE.md): <em>"No JPA/Hibernate — JDBC only."</em> The
 * {@code spring-boot-starter-data-jpa} dependency must never reach the classpath;
 * persistence is Spring Data JDBC aggregates and/or {@code JdbcTemplate} /
 * {@code JdbcClient} with explicit SQL.
 *
 * <p>This is a fast, context-free guard (a sibling to {@link ModularityTests} — no Spring
 * context, no database, runs anywhere) that fails the build the moment a JPA or Hibernate
 * type becomes resolvable. It closes the gap left by issue #1's acceptance criterion
 * <em>"a dependency check confirms {@code spring-boot-starter-data-jpa} is not
 * resolved"</em>, which was never implemented as a test — until now the rule was guarded
 * only by convention and code review.
 *
 * <p>It probes the marker types each vector would drag in: the JPA API
 * ({@code jakarta.persistence.*} — {@code @Entity}, {@code EntityManager}), the Hibernate
 * provider ({@code org.hibernate.*}), and Spring Boot's JPA auto-configuration (pulled in
 * by the JPA starter). Classes are loaded with initialization disabled so the probe has no
 * side effects.
 */
class JdbcOnlyArchitectureTests {

	private static final ClassLoader LOADER = JdbcOnlyArchitectureTests.class.getClassLoader();

	@Test
	void noJpaOrHibernateTypeIsOnTheClasspath() {
		assertJpaTypeAbsent("jakarta.persistence.Entity");
		assertJpaTypeAbsent("jakarta.persistence.EntityManager");
		assertJpaTypeAbsent("org.hibernate.Session");
		assertJpaTypeAbsent("org.hibernate.SessionFactory");
		assertJpaTypeAbsent("org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration");
	}

	/**
	 * Sanity check: the JDBC persistence path the project DID choose is present. This proves
	 * the absence assertions above are not vacuous — the probe genuinely distinguishes a
	 * resolvable type from a missing one — and documents that "JDBC yes, JPA no" is the rule.
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
						+ "Spring Data JDBC and/or JdbcTemplate with explicit SQL (CLAUDE.md #1).");
	}
}
