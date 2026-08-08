/**
 * Booking bounded context — bookings, booking codes, lifecycle
 * (confirmed / cancelled / completed / no-show) and cancellation-policy enforcement.
 * Aggregate root: {@code Booking}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template, sliced by use-case):
 * {@code api} (the {@code DailyTakings} query port) + {@code events} + {@code vocabulary}
 * + {@code spi} (the {@code ConfirmationMailDelivery} driven port {@code notification} implements)
 * — the published surface —, {@code application} (shared {@code Bookings}/{@code BookingCodeGenerator} at root
 * + {@code reserve/}, {@code cancel/}, {@code refund/}, {@code view/} slices), flat {@code domain},
 * {@code adapter.in/out}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    // operator::api: the staff daily view + weather refund assert per-venue ownership (invariant #13).
    // venue::spi: booking implements venue.spi.BookingPresence (the layout-replace guard) —
    // the inverted, acyclic edge, same shape as availability implementing venue.spi.SetAvailabilityLookup.
    // customer::spi: booking implements customer.spi.GuestBookingHistory (the retention-basis fact behind
    // the retention-policy sweep) — the same inversion, since customer must not depend on booking.
    allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "availability::api", "availability::vocabulary", "payment::api", "payment::vocabulary", "payment::events", "customer::api", "customer::spi", "customer::vocabulary", "operator::api", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.booking;
