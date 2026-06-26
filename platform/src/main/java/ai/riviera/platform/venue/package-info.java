/**
 * Venue bounded context — venue profiles, the beach map / layout, set positions,
 * online-vs-walk-in pool assignment, pricing, and booking mode (Instant / Request).
 * Aggregate roots: {@code Venue}, {@code BeachMap}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}. Sub-packages are added as feature
 * slices land. Cross-module access is via this module's {@code api/} port or a
 * domain event only.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Venue")
package ai.riviera.platform.venue;
