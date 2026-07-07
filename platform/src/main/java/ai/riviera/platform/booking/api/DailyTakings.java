package ai.riviera.platform.booking.api;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's published <strong>daily-takings</strong> query port (invariant
 * #11) — the gross of a venue's {@code CONFIRMED} online bookings for one service date. Consumed
 * by {@code payout} to build the operator console's "online takings today" figure: {@code payout}
 * applies the venue commission ({@code venue} stores the rate; {@code payout} does the arithmetic,
 * invariant #9), so this port returns raw gross only and never computes commission.
 *
 * <p>Synchronous query (the caller needs the answer now to render the tile), so an {@code api/}
 * port rather than an event. Read-only: it sums {@code booking} amounts and touches no
 * availability state (invariant #2) and never the payout ledger.
 */
public interface DailyTakings {

	/**
	 * The gross of venue {@code venueId}'s {@code CONFIRMED} online bookings whose
	 * {@code booking_date} is {@code date} (a {@code LocalDate} in {@code Europe/Tirane},
	 * invariant #6), as integer minor units + ISO currency (invariant #5). A day with no such
	 * bookings returns {@code (0, "EUR")}, never {@code null}.
	 */
	OnlineTakings grossOnlineTakings(VenueId venueId, LocalDate date);
}
