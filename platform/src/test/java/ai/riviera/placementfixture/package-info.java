/**
 * Deliberately mis-shaped classes for {@code PublishedSurfacePlacementArchitectureTests}'
 * negative cases (issue #95 AC-4/AC-5) — each fixture "module" below places a type in the
 * wrong published surface so the rule's violation collectors can be proven to fire without
 * ever breaking production code. Test-scope only; never imported by production classes.
 */
package ai.riviera.placementfixture;
