package ai.riviera.platform.booking.api;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's published <strong>daily-takings</strong> query port (invariant
 * #11): a venue's gross online takings for one service date, behind {@code payout}'s console
 * "online takings today" figure. Raw gross only — {@code payout} applies the rate {@code venue}
 * stores (invariant #9), so never compute commission here.
 *
 * <p>Read-only: touches no availability state (invariant #2) and never the payout ledger.
 */
public interface DailyTakings {

	/**
	 * The gross of {@code venueId}'s {@code CONFIRMED}, {@code COMPLETED} and {@code NO_SHOW}
	 * bookings whose first service day is {@code date} (Tirane, invariant #6), in minor units + ISO
	 * currency (invariant #5); an empty day is {@code (0, "EUR")}, never {@code null}.
	 */
	OnlineTakings grossOnlineTakings(VenueId venueId, LocalDate date);
}
