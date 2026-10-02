/**
 * A deliberately over-granted module tree, so {@code UnusedAllowedDependencyTests} can prove its
 * negative case without breaking production code — the {@code ai.riviera.placementfixture}
 * mechanism, read through Spring Modulith's own model rather than a raw ArchUnit import.
 *
 * <p>{@code beta} publishes four named interfaces; {@code alpha} grants itself all four and uses
 * three, two of them only in ways an import scan cannot see: a lambda passed where {@code beta::spi}'s
 * gate is expected, and a {@code switch} over a {@code beta::vocabulary} enum that arrives as a return
 * type and is never imported. The one grant left unused is {@code beta::events}; without the two
 * bytecode-only uses, a rule reading imports would flag three grants instead of one.
 */
package ai.riviera.grantfixture;
