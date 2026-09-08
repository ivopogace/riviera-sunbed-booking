/**
 * Fixtures for {@code RetiredSetExclusionArchitectureTests}' negative and positive cases: one
 * class reads the set table bare and must be rejected, three read or write it the sanctioned ways
 * (through the active view, naming the retired marker, or inserting a fresh row) and must pass,
 * and one implements the exempt {@code SetBookingFacts} port and must pass while reading the table
 * bare. Test-scope only; never imported by production classes. Same mechanism as
 * {@code ai.riviera.responsibilityfixture}.
 */
package ai.riviera.retirefixture;
