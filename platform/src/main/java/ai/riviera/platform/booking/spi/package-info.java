/**
 * <strong>Driven (service-provider) surface</strong> of the {@code booking} module (invariant #11) —
 * interfaces booking <em>needs another module to implement</em>, as opposed to {@code booking.api},
 * which holds the inbound ports other modules <em>call</em>.
 *
 * <p>Holds {@link ConfirmationMailDelivery}, implemented by the {@code notification} module so a
 * confirmed booking's read model can say whether its confirmation mail was withheld (#390) without
 * booking depending on notification — which would cycle, since {@code notification} already depends
 * on {@code booking::api} and {@code booking::events} for the {@code BookingConfirmed} mail. Same
 * shape as {@code customer.spi.GuestBookingHistory}, implemented by {@code booking}. Grant
 * {@code booking::spi} only to the implementing module; callers that merely use booking use
 * {@code booking::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.booking.spi;
