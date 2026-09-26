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
 * the abandoned-payment and request-expiry sweeps use — a missed service day releases no {@code
 * (set, date)} claim and a resolved stay publishes no event, so there is no second write per row to
 * isolate. It deliberately writes no availability row at all: the set really was sold and held for
 * a date now past, and freeing that claim would rewrite history and make it re-claimable (invariant
 * #2). Rationale: {@code RESPONSIBILITIES.md} §{@code booking}.
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
	 * Drains past service days, then ended stays, in batches under one per-run cap; each batch commits
	 * alone, so a run cut short resumes next tick. A short batch means drained only because batches wait
	 * on locked rows: never add {@code SKIP LOCKED}. Rationale: {@code RESPONSIBILITIES.md} §booking.
	 */
	@Override
	public int sweep() {
		LocalDate today = LocalDate.ofInstant(clock.instant(), TIRANE);
		Backlog days = new Backlog(batch -> bookings.markPastServiceDaysMissed(today, batch));
		Backlog stays = new Backlog(batch -> bookings.markPastConfirmedAsNoShow(today, batch));
		int batchesLeft = MAX_BATCHES_PER_RUN;
		try {
			batchesLeft = days.drain(batchesLeft);
			stays.drain(batchesLeft);
		}
		finally {
			logOutcome(stays.swept, days.drained && stays.drained);
		}
		return stays.swept;
	}

	/** One batched statement's backlog: how much it swept this run and whether it reached the end. */
	private static final class Backlog {

		private final java.util.function.IntUnaryOperator batchStatement;
		private int swept;
		private boolean drained;

		Backlog(java.util.function.IntUnaryOperator batchStatement) {
			this.batchStatement = batchStatement;
		}

		/** Runs batches while the cap allows; returns the cap left for the next backlog. */
		int drain(int batchesLeft) {
			while (batchesLeft > 0) {
				batchesLeft--;
				int inBatch = batchStatement.applyAsInt(BATCH_SIZE);
				swept += inBatch;
				if (inBatch < BATCH_SIZE) {
					drained = true;
					break;
				}
			}
			return batchesLeft;
		}
	}

	/**
	 * Called from a {@code finally}: a run the bounded client's timeout cuts short is the one worth
	 * logging, with what it had already committed. Silent when nothing resolved.
	 */
	private static void logOutcome(int marked, boolean drained) {
		if (marked == 0) {
			return;
		}
		if (drained) {
			log.info("no-show sweep resolved {} stay(s) whose last service day had passed", marked);
		}
		else {
			log.info("no-show sweep resolved {} stay(s) whose last service day had passed without draining"
					+ " the backlog — the remainder is swept on the next run", marked);
		}
	}
}
