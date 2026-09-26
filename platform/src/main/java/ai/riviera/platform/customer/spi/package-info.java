/**
 * <strong>Driven (service-provider) surface</strong> of the {@code customer} module
 * (invariant #11): interfaces it <em>needs another module to implement</em> (inbound ports are in
 * {@code customer.api}). {@link GuestBookingHistory} (the retention sweep's booking-recency fact)
 * and {@link ReviewErasure} (tombstoning a subject's reviews) are implemented by {@code booking}; a
 * direct call would cycle, as {@code booking} depends on {@code customer::api}. Grant
 * {@code customer::spi} only to the implementing module. Rationale: RESPONSIBILITIES.md §customer.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.customer.spi;
