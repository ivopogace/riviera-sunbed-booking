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
 *
 * <p>Why each grant beyond the obvious call edges: {@code operator::api} — the staff daily view and
 * the weather refund assert per-venue ownership (invariant #13); {@code venue::spi} — booking
 * implements {@code venue.spi.BookingPresence} and {@code venue.spi.SalesWindow}, inverted, acyclic
 * edges of the same shape as availability implementing {@code venue.spi.SetAvailabilityLookup};
 * {@code customer::spi} — booking implements {@code customer.spi.GuestBookingHistory} (the
 * retention-basis fact behind the retention sweep) and {@code customer.spi.ReviewErasure} (resolving
 * an erased subject to its bookings, then reaching {@code review::api}), the same inversion, since
 * customer must not depend on booking; {@code review::spi} — the {@code CompletedStays} inversion
 * (review is a leaf), while {@code review::api} answers the view's review panel and takes the
 * erasure reach.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "availability::api", "availability::vocabulary", "payment::api", "payment::vocabulary", "payment::events", "customer::api", "customer::spi", "customer::vocabulary", "operator::api", "operator::vocabulary", "review::api", "review::spi", "review::vocabulary", "shared" }
)
package ai.riviera.platform.booking;
