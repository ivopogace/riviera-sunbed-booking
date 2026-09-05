package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Enforces invariant #1 (CLAUDE.md): <em>"No JPA/Hibernate — JDBC only."</em> The
 * {@code spring-boot-starter-data-jpa} dependency must never reach the classpath; every
 * driven adapter is hand-written {@code JdbcClient} SQL. The Spring Data JDBC starter itself
 * stays on the classpath, and what reaching for its aggregate mapping would mean is
 * invariant #1's text to state, not this test's.
 *
 * <p>A fast, context-free guard (a sibling to {@link ModularityTests} — no Spring context,
 * no database, runs anywhere) that fails the build the moment a JPA or Hibernate type
 * becomes resolvable. It probes the marker types each vector would drag in: the JPA API
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
						+ "spring-boot-starter-data-jpa / Hibernate must never be a dependency — write "
						+ "hand-written JdbcClient SQL (CLAUDE.md #1).");
	}
}
