/**
 * Published <strong>ports</strong> surface of the {@code operator} module (invariant #11) —
 * "call-me" interfaces only: the ownership query ports ({@link VenueOwnership},
 * {@link OperatorDirectory}) and the credential read + provisioning ports that back
 * per-operator login (#74: {@link OperatorAccounts}, {@link OperatorProvisioning}). The typed
 * ids and value types these ports speak in ({@code OperatorId}, {@code VenueRef},
 * {@code OperatorCredential}, {@code NotVenueOwnerException}) live in the sibling
 * {@code vocabulary} named interface (issue #95). Exposed as a Spring Modulith named
 * interface so venue-scoped modules — and the platform edge's Spring Security config — can ask
 * these questions without reaching into this module's {@code application}/{@code adapter}
 * internals. Login itself (encoding/verifying) stays at the edge; this module only stores the
 * opaque credential hash.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.operator.api;
