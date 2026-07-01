/**
 * Booking bounded context — bookings, booking codes, lifecycle
 * (confirmed / cancelled / completed / no-show) and cancellation-policy enforcement.
 * Aggregate root: {@code Booking}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template, sliced by use-case):
 * {@code events} + {@code vocabulary} (the published surface — no ports, issue #95), {@code application} (shared {@code Bookings}/{@code BookingCodeGenerator} at root
 * + {@code reserve/}, {@code cancel/}, {@code refund/}, {@code view/} slices), flat {@code domain},
 * {@code adapter.in/out}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    // operator::api: the staff daily view + weather refund assert per-venue ownership (invariant #13).
    allowedDependencies = { "venue::api", "venue::vocabulary", "availability::api", "availability::vocabulary", "payment::api", "payment::vocabulary", "payment::events", "customer::api", "customer::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.booking;
