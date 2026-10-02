/**
 * A deliberately mis-shaped <em>composition-root</em> tree, so {@code CompositionRootDisciplineTests}
 * can prove its negative case without breaking production code — the {@code ai.riviera.placementfixture}
 * mechanism, applied to the root-discipline rule.
 *
 * <p>The layout mirrors the real platform: types directly in this package stand in for the composition
 * root, and {@code <this>.<module>.<surface>} sub-packages stand in for module surfaces. Three root
 * stand-ins are deliberately different — one reaches a module's <strong>published</strong> surface
 * ({@code auth.api}) and one its <strong>internals</strong> ({@code notification.application}), and both
 * must be reported; one reaches <strong>no module</strong> and must stay clean. Without the last, a rule
 * that flagged everything would still look green.
 */
package ai.riviera.rootfixture;
