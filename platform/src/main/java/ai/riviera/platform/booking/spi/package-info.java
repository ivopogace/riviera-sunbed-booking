/**
 * <strong>Driven (service-provider) surface</strong> of the {@code booking} module (invariant #11) —
 * interfaces booking <em>needs another module to implement</em>, as opposed to {@code booking.api},
 * which holds the inbound ports other modules <em>call</em>.
 *
 * <p>Holds two, each the same inversion for the same reason — the implementing module already
 * depends on booking, so the direct call would cycle. Same shape as
 * {@code customer.spi.GuestBookingHistory}, implemented by {@code booking}.
 *
 * <ul>
 *   <li>{@link ConfirmationMailDelivery}, implemented by {@code notification}, so a confirmed
 *       booking's read model can say whether its confirmation mail was withheld.</li>
 *   <li>{@link VenueChangeFeeRate}, implemented by {@code payout}, so the remodel preview can quote
 *       what a refund would cost the venue without booking reaching into the ledger.</li>
 * </ul>
 *
 * <p>Grant {@code booking::spi} only to the implementing module; callers that merely use booking use
 * {@code booking::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.booking.spi;
