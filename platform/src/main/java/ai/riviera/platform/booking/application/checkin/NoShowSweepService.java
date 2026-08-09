package ai.riviera.platform.booking.application.checkin;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;

/**
 * The no-show sweep: guarded bulk {@code UPDATE}s in batches, not the read-ids-then-per-row loop
 * the abandoned-payment and request-expiry sweeps use — a no-show releases no {@code (set, date)}
 * claim and publishes no event, so there is no second write per row to isolate. It deliberately
 * writes no availability row at all: the set really was sold and held for a date now past, and
 * freeing that claim would rewrite history and make it re-claimable (invariant #2).
 * Rationale: {@code RESPONSIBILITIES.md} §{@code booking}.
 */
@Service
class NoShowSweepService implements MarkNoShows {

	private static final Logger log = LoggerFactory.getLogger(NoShowSweepService.class);
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	/** Sized so one batch stays far inside the bounded client's timeout even on a cold buffer cache. */
	private static final int BATCH_SIZE = 500;

	/** Caps one run's work so a pathological backlog cannot hold the scheduler thread all tick. */
	private static final int MAX_BATCHES_PER_RUN = 20;

	private final Bookings bookings;
	private final Clock clock;

	NoShowSweepService(Bookings bookings, Clock clock) {
		this.bookings = bookings;
		this.clock = clock;
	}

	/**
	 * Sweeps in batches until the backlog is drained or the per-run cap is hit, whichever comes
	 * first. Each batch is its own statement and commits on its own, so a run cut short by the
	 * bounded client's timeout — or by the cap — keeps every batch before it and the next tick
	 * resumes from there. That is the whole reason this is not one unbounded {@code UPDATE}: an
	 * all-or-nothing statement over a backlog bigger than the timeout would roll back every run and
	 * never make progress.
	 *
	 * <p>"Fewer than a batch means drained" is only sound because the batch statement <em>waits</em>
	 * for a contended row rather than skipping it: a skipped row would shorten the batch and end the
	 * loop early, leaving it unswept until some later run happened to find it uncontended.
	 */
	@Override
	public int sweep() {
		LocalDate today = LocalDate.ofInstant(clock.instant(), TIRANE);
		int marked = 0;
		for (int batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
			int inBatch = bookings.markPastConfirmedAsNoShow(today, BATCH_SIZE);
			marked += inBatch;
			if (inBatch < BATCH_SIZE) {
				logIfAny(marked);
				return marked;
			}
		}
		log.info("no-show sweep marked {} past-day booking(s) as NO_SHOW and stopped at its"
				+ " {}-batch cap — the remainder is swept on the next run", marked, MAX_BATCHES_PER_RUN);
		return marked;
	}

	private static void logIfAny(int marked) {
		if (marked > 0) {
			log.info("no-show sweep marked {} past-day booking(s) as NO_SHOW", marked);
		}
	}
}
