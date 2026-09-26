/**
 * The booking module: bookings, codes, cancellation policy and the lifecycle — the {@code booking}
 * table's guarded {@code UPDATE}s, stated once in {@code domain.BookingTransition}. Layout: ADR-0007
 * full template. {@code operator::api} asserts venue ownership (invariant #13). Each {@code spi} edge
 * is an inversion keeping the dependency one-way: booking implements {@code venue::spi} (ADR-0020),
 * {@code customer::spi} ({@code RESPONSIBILITIES.md} §customer) and {@code review::spi} (ADR-0015);
 * {@code payout} and {@code notification} implement {@code booking.spi} (ADR-0021).
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    allowedDependencies = { "venue::api", "venue::vocabulary", "venue::spi", "availability::api", "availability::vocabulary", "payment::api", "payment::vocabulary", "payment::events", "customer::api", "customer::spi", "customer::vocabulary", "operator::api", "operator::vocabulary", "review::api", "review::spi", "review::vocabulary", "shared" }
)
package ai.riviera.platform.booking;
