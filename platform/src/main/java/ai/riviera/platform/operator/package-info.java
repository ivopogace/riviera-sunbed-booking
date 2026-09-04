/**
 * The operator module (invariant #13) — operator accounts and the operator↔venue
 * ownership mapping. Its two questions for the rest of the system: <em>"does this operator
 * own this venue?"</em>, so every venue-scoped application service can enforce object-level
 * authorization (BOLA, OWASP API #1) and reject a mismatch with {@code 403}; and
 * <em>"does this venue have an {@code ACTIVE} owner?"</em>, the tourist-visibility rule
 * {@code venue} and {@code booking} fence discovery and new bookings with
 * ({@link ai.riviera.platform.operator.api.VenueVisibility}).
 *
 * <p><strong>Built directly in the ADR-0007 target shape</strong> (this module is the
 * reference build): top-level {@code api} named interface + a flat hexagon beneath
 * ({@code application} = service + its driven port together; {@code domain}; {@code adapter/out}).
 * No {@code application.in/out} split, no {@code adapter/in} (it has no inbound HTTP surface —
 * callers reach it programmatically through {@code api}).
 *
 * <p><strong>Deny-by-default and acyclic:</strong> {@code allowedDependencies = {}}. It does
 * <em>not</em> depend on {@code venue::api}; it publishes its own {@link
 * ai.riviera.platform.operator.vocabulary.VenueRef} typed id (invariant #11) so that {@code venue}'s own
 * {@code VenueAdminService} can call the ownership port without creating a {@code venue ↔ operator}
 * cycle. Authentication/login stays a platform/edge (Spring Security) concern; this module
 * owns the ownership <em>mapping</em>, not the login.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Operator",
    allowedDependencies = {}
)
package ai.riviera.platform.operator;
