/**
 * A deliberately mis-shaped <em>module</em> tree, so {@code CompositionRootDisciplineTests} can prove
 * the module&rarr;root rule's negative case without breaking production code — the
 * {@code ai.riviera.rootfixture} mechanism, pointed the other way down the dependency edge.
 *
 * <p>The layout mirrors the real platform: {@link ai.riviera.modulefixture.RootShapedType} sits
 * directly in this package and stands in for a composition-root type, while
 * {@code <this>.<module>.<surface>} sub-packages stand in for module internals. Two module
 * stand-ins are deliberately different — one depends on the root stand-in and must be reported, one
 * depends on nothing outside its own module and must stay clean. Without the second, a rule that
 * flagged every module class would still look green.
 */
package ai.riviera.modulefixture;
