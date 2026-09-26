/**
 * <strong>Driven (SPI) surface</strong> of {@code booking} (invariant #11): ports another module
 * implements because it already depends on booking, so a direct call would cycle (as
 * {@code customer.spi.GuestBookingHistory}). {@link ConfirmationMailDelivery}, by notification,
 * says whether a confirmation mail was withheld; {@link VenueChangeFeeRate}, by payout, quotes a
 * remodel refund's cost to the venue without booking reading the ledger. Grant
 * {@code booking::spi} only to the implementing module; plain callers use {@code booking::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.booking.spi;
