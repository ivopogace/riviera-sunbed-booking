/**
 * <strong>Driven (service-provider) surface</strong> of the {@code review} module (invariant #11) —
 * interfaces review <em>needs another module to implement</em>, as opposed to {@code review.api},
 * which holds the inbound ports other modules <em>call</em>.
 *
 * <p>Holds {@link CompletedStays}, implemented by the {@code booking} module so review can ask
 * "was this stay checked in, and when?" without depending on booking — which would cycle, since
 * {@code booking} depends on {@code venue} and {@code venue} depends on this module's {@code api}.
 * The same shape as {@code customer.spi.GuestBookingHistory} and {@code venue.spi.BookingPresence}.
 * Grant {@code review::spi} only to the implementing module; callers that merely use review take
 * {@code review::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.review.spi;
