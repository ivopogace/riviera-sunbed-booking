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
	 * Two backlogs, each swept in batches until it is drained or the shared per-run cap is hit,
	 * whichever comes first: the past service days of live stays still unmarked, then the stays
	 * whose last service day has passed. Each batch is its own statement and commits on its own, so
	 * a run cut short by the bounded client's timeout — or by the cap — keeps every batch before it
	 * and the next tick resumes from there. That is the whole reason this is not one unbounded
	 * {@code UPDATE}: an all-or-nothing statement over a backlog bigger than the timeout would roll
	 * back every run and never make progress.
	 *
	 * <p>"Fewer than a batch means drained" is only sound because each batch statement
	 * <em>waits</em> for a contended row rather than skipping it: a skipped row would shorten the
	 * batch and end the loop early, leaving it unswept until some later run happened to find it
	 * uncontended. Each backlog reads its own statement's count, so a service day backlog larger
	 * than a batch never ends the run on the stays' short batch, nor the other way round.
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
	 * In a {@code finally} because the interesting run is the one that throws: a batch cancelled by
	 * the bounded client's timeout is the case batching exists for, and the batches already
	 * committed before it are exactly the number an operator needs. Logged only when there is
	 * something to say.
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
