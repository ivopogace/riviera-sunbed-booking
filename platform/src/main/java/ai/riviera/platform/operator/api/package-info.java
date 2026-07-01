/**
 * Published surface of the {@code operator} module (invariant #11) — the ownership query ports
 * ({@link ai.riviera.platform.operator.api.VenueOwnership}, {@link
 * ai.riviera.platform.operator.api.OperatorDirectory}) plus the typed ids they speak in
 * ({@link ai.riviera.platform.operator.api.OperatorId}, {@link
 * ai.riviera.platform.operator.api.VenueRef}) and {@link
 * ai.riviera.platform.operator.api.NotVenueOwnerException}. Exposed as a Spring Modulith named
 * interface so venue-scoped modules can ask the ownership question without reaching into this
 * module's {@code application}/{@code adapter} internals.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.operator.api;
