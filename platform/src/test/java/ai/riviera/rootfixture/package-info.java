/**
 * A deliberately mis-shaped <em>composition-root</em> tree, so {@code CompositionRootDisciplineTests}
 * can prove its negative case without breaking production code — the {@code ai.riviera.placementfixture}
 * mechanism, applied to the root-discipline rule.
 *
 * <p>The layout mirrors the real platform: types directly in this package stand in for the composition
 * root, and {@code <this>.<module>.<surface>} sub-packages stand in for module surfaces. Two root
 * stand-ins are deliberately different — one reaches a <strong>granted</strong> surface
 * ({@code notification.api}) and must stay clean, one reaches an <strong>ungranted</strong> internal
 * ({@code notification.application}) and must be reported. Without the first, a rule that flagged
 * everything would still look green.
 */
package ai.riviera.rootfixture;
