/**
 * A deliberately mis-placed tree, so {@code CustomerAuthPlacementTests} and {@code OperatorAuthPlacementTests}
 * prove their negative case without breaking production code — the {@code ai.riviera.placementfixture}
 * mechanism. {@code <this>.<module>} stands in for a domain module: in each, one class reaches every banned
 * family and must be reported once per family; one reaches none and must stay clean.
 */
package ai.riviera.authplacementfixture;
