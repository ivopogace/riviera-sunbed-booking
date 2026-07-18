/**
 * Customer bounded context — tourist identity: the guest-checkout contact AND (S2, epic #108) the
 * customer <em>account</em> (email + opaque credential hash) that backs register / sign-in.
 * Aggregate roots: {@code Customer} (guest contact) and {@code CustomerAccount} (account identity),
 * kept deliberately separate — an account carries no foreign key to the guest row, so registration
 * never auto-claims a guest email's past bookings (design D-6).
 *
 * <p>Full-module layout (ADR-0007): S2 added the {@code CustomerAccountService} application service,
 * so the module <strong>graduated</strong> from the thin template to the full one —
 * {@code api} + {@code vocabulary} + {@code application} + {@code adapter.out} (still no
 * {@code domain}, no cross-module {@code allowedDependencies}). The stored credential hash is opaque:
 * the module never encodes or verifies it; that login machinery stays at the platform edge
 * (RV-BE-11, pinned by {@code CustomerAuthPlacementTests}).
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Customer",
    allowedDependencies = {}
)
package ai.riviera.platform.customer;
