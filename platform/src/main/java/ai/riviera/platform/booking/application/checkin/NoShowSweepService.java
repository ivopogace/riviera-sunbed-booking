package ai.riviera.platform.booking.application.checkin;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;

/**
 * The no-show sweep: one bulk guarded {@code UPDATE}, not the per-row loop the abandoned-payment
 * and request-expiry sweeps use — a no-show releases no {@code (set, date)} claim and publishes no
 * event, so there is no second write per row to isolate. It deliberately writes no availability
 * row at all: the set really was sold and held for a date now past, and freeing that claim would
 * rewrite history and make it re-claimable (invariant #2).
 * Rationale: {@code RESPONSIBILITIES.md} §{@code booking}.
 */
@Service
class NoShowSweepService implements MarkNoShows {

	private static final Logger log = LoggerFactory.getLogger(NoShowSweepService.class);
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Bookings bookings;
	private final Clock clock;

	NoShowSweepService(Bookings bookings, Clock clock) {
		this.bookings = bookings;
		this.clock = clock;
	}

	@Override
	public int sweep() {
		int marked = bookings.markPastConfirmedAsNoShow(LocalDate.ofInstant(clock.instant(), TIRANE));
		if (marked > 0) {
			log.info("no-show sweep marked {} past-day booking(s) as NO_SHOW", marked);
		}
		return marked;
	}
}
