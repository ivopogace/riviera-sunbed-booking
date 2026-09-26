/**
 * The customer module: tourist identity, i.e. the guest-checkout contact ({@code customer}) and the
 * customer account ({@code customer_account}). The two are never linked (no FK), so registration never
 * claims a guest email's past bookings (design D-6). {@code allowedDependencies} stays empty: what the
 * retention sweep and erasure need from bookings comes through {@code spi} ports that {@code booking}
 * implements, since a {@code customer → booking} call would cycle. The credential hash is opaque;
 * login machinery stays at the platform edge (RV-BE-11, {@code CustomerAuthPlacementTests}).
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Customer",
    allowedDependencies = {}
)
package ai.riviera.platform.customer;
