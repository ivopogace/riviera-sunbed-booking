/**
 * Published surface of the {@code operator} module (invariant #11) — the ownership query ports
 * ({@link ai.riviera.platform.operator.api.VenueOwnership}, {@link
 * ai.riviera.platform.operator.api.OperatorDirectory}), the credential read + provisioning ports
 * that back per-operator login (#74: {@link ai.riviera.platform.operator.api.OperatorAccounts},
 * {@link ai.riviera.platform.operator.api.OperatorProvisioning}, with the {@link
 * ai.riviera.platform.operator.api.OperatorCredential} value), plus the typed ids they speak in
 * ({@link ai.riviera.platform.operator.api.OperatorId}, {@link
 * ai.riviera.platform.operator.api.VenueRef}) and {@link
 * ai.riviera.platform.operator.api.NotVenueOwnerException}. Exposed as a Spring Modulith named
 * interface so venue-scoped modules — and the platform edge's Spring Security config — can ask these
 * questions without reaching into this module's {@code application}/{@code adapter} internals. Login
 * itself (encoding/verifying) stays at the edge; this module only stores the opaque credential hash.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.operator.api;
