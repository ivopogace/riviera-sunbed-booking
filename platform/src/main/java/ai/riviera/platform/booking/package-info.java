/**
 * The booking module — bookings, booking codes, lifecycle
 * (confirmed / cancelled / completed / no-show) and cancellation-policy enforcement.
 * The state is the {@code booking} table; the lifecycle is its guarded {@code UPDATE}s, stated
 * once as a table in {@code domain.BookingTransition}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template, sliced by use-case):
 * {@code api} (the four query ports, by consumer role) + {@code events} + {@code vocabulary}
 * + {@code spi} (two driven ports: {@code ConfirmationMailDelivery}, implemented by
 * {@code notification}, and {@code VenueChangeFeeRate}, implemented by {@code payout})
 * — the published surface —, {@code application} (shared {@code Bookings}/{@code BookingCodeGenerator} at root
 * + {@code reserve/}, {@code request/}, {@code cancel/}, {@code checkin/}, {@code refund/}, {@code view/},
 * {@code remodel/} slices), flat {@code domain},
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
 * erasure reach. Booking declares {@code booking.spi.VenueChangeFeeRate} for the same reason in
 * reverse: {@code payout} already depends on booking, so it implements the fee rate rather than
 * booking calling for it.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "availability::api", "availability::vocabulary", "payment::api", "payment::vocabulary", "payment::events", "customer::api", "customer::spi", "customer::vocabulary", "operator::api", "operator::vocabulary", "review::api", "review::spi", "review::vocabulary", "shared" }
)
package ai.riviera.platform.booking;
