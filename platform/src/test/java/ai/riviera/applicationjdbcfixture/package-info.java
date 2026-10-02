/**
 * Deliberately JDBC-holding {@code application/} classes for {@code JdbcOnlyArchitectureTests}' negative
 * cases — one fixture "module" per forbidden root (Spring JDBC, {@code java.sql}, {@code javax.sql}, the
 * last in a nested use-case package), plus a clean module whose JDBC sits in {@code adapter/out} and must
 * stay unflagged. Test-scope only; never imported by production classes.
 */
package ai.riviera.applicationjdbcfixture;
