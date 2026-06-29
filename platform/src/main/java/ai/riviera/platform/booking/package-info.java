/**
 * Booking bounded context — bookings, booking codes, lifecycle
 * (confirmed / cancelled / completed / no-show) and cancellation-policy enforcement.
 * Aggregate root: {@code Booking}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    allowedDependencies = { "venue::api", "availability::api", "payment::api", "customer::api" }
)
package ai.riviera.platform.booking;
