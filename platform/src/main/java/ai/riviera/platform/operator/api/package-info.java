/**
 * Published <strong>ports</strong> surface of the {@code operator} module (invariant #11):
 * "call-me" interfaces only. Ownership and tourist-visibility queries ({@link VenueOwnership},
 * {@link VenueVisibility}, {@link OperatorDirectory}) and the credential read + provisioning ports
 * behind per-operator login ({@link OperatorAccounts}, {@link OperatorProvisioning}); their typed
 * ids and value types live in the sibling {@code vocabulary} named interface. Login itself
 * (encoding/verifying) stays at the edge; this module only stores the opaque credential hash.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.operator.api;
