/**
 * Deliberately boundary-violating classes for {@code ResponsibilitiesArchitectureTests}'
 * negative cases (issue #96) — each fixture "module" below breaks one machine-checkable
 * clause of {@code RESPONSIBILITIES.md} (an outside writer of the availability table, a
 * Stripe import outside {@code payment}, an event record carrying a domain aggregate) so
 * the rules' violation collectors can be proven to fire without ever breaking production
 * code. Test-scope only; never imported by production classes. Same mechanism as
 * {@code ai.riviera.placementfixture} (issue #95).
 */
package ai.riviera.responsibilityfixture;
