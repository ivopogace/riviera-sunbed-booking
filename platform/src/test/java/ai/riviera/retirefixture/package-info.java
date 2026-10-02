/**
 * Fixtures for {@code RetiredSetExclusionArchitectureTests}' negative and positive cases. Rejected:
 * a bare read of the set table, a read that mentions {@code retired_at} without testing it for null,
 * a bare read under the exempt constant's name outside the facts port, and a facts-port implementor
 * whose spot read dropped the view. Passing: a read through the active view, a write saying
 * {@code retired_at IS NULL}, an insert, and the facts-port implementor whose bare reads sit only in
 * the constants exempt by name. Test-scope only; never imported by production classes. Same
 * mechanism as {@code ai.riviera.responsibilityfixture}.
 */
package ai.riviera.retirefixture;
