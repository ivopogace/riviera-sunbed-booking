/**
 * A published surface whose {@code package-info} forgot {@code @NamedInterface}: javac emits no
 * {@code package-info.class} for an unannotated package, so the rule sees no declaration at all.
 */
package ai.riviera.packageshapefixture.unnamed.api;
