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
    // operator::api: the staff daily view + weather refund assert per-venue ownership (invariant #13).
    allowedDependencies = { "venue::api", "availability::api", "payment::api", "customer::api", "operator::api" }
)
package ai.riviera.platform.booking;
