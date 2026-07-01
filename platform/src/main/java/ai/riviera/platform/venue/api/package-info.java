/**
 * Published <strong>ports</strong> surface of the {@code venue} module (invariant #11) —
 * "call-me" interfaces only ({@link VenueCatalog}, {@link SetBookingFacts},
 * {@link VenueRates}); the published typed ids and value records live in the sibling
 * {@code vocabulary} named interface (issue #95). Exposed as a Spring Modulith named
 * interface so sibling modules (e.g. {@code availability}, which looks up a set's pool via
 * {@link SetBookingFacts#poolOf}) may depend on it without reaching into venue's
 * {@code application.*}/{@code adapter.*} packages.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.venue.api;
