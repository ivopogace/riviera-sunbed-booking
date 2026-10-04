/**
 * Deliberately Spring Data-naming classes for {@code JdbcOnlyArchitectureTests}' negative cases — one fixture
 * "module" per vector (a repository interface, an aggregate mapped with {@code @Table}/{@code @Id}, an
 * {@code @EnableJdbcRepositories} configuration), each in {@code adapter/out} where plain JDBC is welcome,
 * plus a clean module whose adapter is hand-written {@code JdbcClient} SQL over {@code org.springframework.dao}
 * and must stay unflagged. Test-scope only; never imported by production classes.
 */
package ai.riviera.springdatafixture;
