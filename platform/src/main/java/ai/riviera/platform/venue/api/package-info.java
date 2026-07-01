/**
 * Published query surface of the {@code venue} module (invariant #11) — the technical ids
 * ({@link VenueId}, {@link SetId}) and read ports ({@link VenueCatalog}) other modules and
 * the module's own adapters depend on. Exposed as a Spring Modulith named interface so
 * sibling modules (e.g. {@code availability}, which looks up a set's pool via
 * {@link SetBookingFacts#poolOf}) may depend on it without reaching into venue's
 * {@code application.*}/{@code adapter.*} packages.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.venue.api;
