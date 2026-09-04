/**
 * Deliberately impure {@code domain/} classes for {@code DomainPurityArchitectureTests}' negative
 * cases — one fixture "module" per clause of the rule (Spring, the JDBC API, the Stripe SDK, an
 * adapter, a port), plus a pure one that must stay unflagged, so the rule's violation collector is
 * proven to fire without ever breaking production code. Test-scope only; never imported by
 * production classes.
 */
package ai.riviera.domainpurityfixture;
